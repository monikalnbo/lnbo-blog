#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""自研轻量缓存服务端（RESP2 协议兼容，纯 Python 标准库，零依赖）

为什么不直接用 Redis：
  - 博客缓存场景只需要 GET/SET/DEL 带 TTL，几兆内存量级；
  - 单文件自研服务端 = 部署机器连 Redis 都不用装，systemd 拉起即用；
  - 说 RESP2 协议，所以标准 redis-cli / 各语言 Redis 客户端 / api.py 内置客户端
    都能直连；将来要换真 Redis，改个地址无缝迁移。

支持的命令：
  PING GET SET(SETEX/EX/PX) DEL TTL PTTL EXPIRE EXISTS INCR DBSIZE
  KEYS FLUSHALL SELECT AUTH INFO QUIT COMMAND
存储策略：
  OrderedDict 近似 LRU（写/命中都移到队尾）+ 惰性过期 + 每 60s 后台清扫；
  超过 --max-keys 时先清过期键，仍超则逐出最旧键，防止内存无限增长。

用法：
  python3 cache-server.py                    # 监听 127.0.0.1:6379
  python3 cache-server.py --port 6380 --auth 秘钥
systemd 部署见 deploy/blog-cache.service
"""
import argparse
import socket
import socketserver
import threading
import time
import os
from collections import OrderedDict

__version__ = '1.0.0'

# ── RESP2 编解码 ──────────────────────────────────────────────

def encode(value):
    """把 Python 值编码为 RESP2 响应字节"""
    if value is None:
        return b'$-1\r\n'
    if isinstance(value, SimpleError):
        return b'-%s\r\n' % value.msg.encode()
    if isinstance(value, SimpleStr):
        return b'+%s\r\n' % value.encode()
    if isinstance(value, bool) or isinstance(value, int):
        return b':%d\r\n' % value
    if isinstance(value, (list, tuple)):
        out = [b'*%d\r\n' % len(value)]
        out.extend(encode(v) for v in value)
        return b''.join(out)
    if isinstance(value, bytes):
        return b'$%d\r\n%s\r\n' % (len(value), value)
    b = str(value).encode()
    return b'$%d\r\n%s\r\n' % (len(b), b)


class SimpleStr(str):
    """RESP 简单字符串（+OK 之类）"""
    pass


class SimpleError(Exception):
    def __init__(self, msg):
        self.msg = msg


def read_command(buf):
    """从缓冲区解析一条完整 RESP 命令；不够一条返回 (None, buf)"""
    if not buf:
        return None, buf
    if buf[:1] != b'*':
        # 行内命令（telnet 风格）：PING\r\n
        if b'\r\n' not in buf:
            return None, buf
        line, buf = buf.split(b'\r\n', 1)
        return line.decode().split(), buf
    end = buf.find(b'\r\n')
    if end < 0:
        return None, buf
    try:
        argc = int(buf[1:end])
    except ValueError:
        raise SimpleError('Protocol error: invalid multibulk length')
    pos = end + 2
    args = []
    for _ in range(argc):
        e = buf.find(b'\r\n', pos)
        if e < 0:
            return None, buf          # 数据不完整，等下一次
        if buf[pos:pos + 1] != b'$':
            raise SimpleError('Protocol error: expected $')
        n = int(buf[pos + 1:e])
        pos = e + 2
        if len(buf) < pos + n + 2:
            return None, buf
        args.append(buf[pos:pos + n])
        pos += n + 2
    return [a.decode('utf-8', 'replace') for a in args], buf[pos:]


# ── 缓存引擎：近似 LRU + TTL ──────────────────────────────────

class Cache:
    def __init__(self, max_keys=50000, max_bytes=1024 * 1024):
        self.data = OrderedDict()       # key -> [expires_at, value]
        self.lock = threading.Lock()
        self.max_keys = max_keys
        self.max_bytes = max_bytes      # 单值上限
        self.hits = self.misses = self.evictions = 0

    def _purge(self, key):
        """惰性过期（须持锁调用）"""
        item = self.data.get(key)
        if item and item[0] and item[0] <= time.time():
            del self.data[key]
            return True
        return False

    def sweep(self):
        """定期清扫全部过期键"""
        now = time.time()
        n = 0
        with self.lock:
            for key in [k for k, v in self.data.items() if v[0] and v[0] <= now]:
                del self.data[key]
                n += 1
        return n

    def _evict_if_full(self):
        """超限逐出（须持锁调用）：先扔最旧的，近似 LRU"""
        while len(self.data) > self.max_keys:
            self.data.popitem(last=False)
            self.evictions += 1

    # ---- 命令实现 ----
    def get(self, key):
        with self.lock:
            if self._purge(key) or key not in self.data:
                self.misses += 1
                return None
            self.hits += 1
            self.data.move_to_end(key)
            return self.data[key][1]

    def set(self, key, value, px=None):
        if len(value) > self.max_bytes:
            raise SimpleError('value too large (max %d bytes)' % self.max_bytes)
        exp = (time.time() + px / 1000) if px else None
        with self.lock:
            self.data[key] = [exp, value]
            self.data.move_to_end(key)
            self._evict_if_full()
        return SimpleStr('OK')

    def delete(self, *keys):
        n = 0
        with self.lock:
            for k in keys:
                if k in self.data:
                    del self.data[k]
                    n += 1
        return n

    def ttl(self, key):
        with self.lock:
            if self._purge(key) or key not in self.data:
                return -2
            exp = self.data[key][0]
            return -1 if exp is None else int(exp - time.time())

    def expire(self, key, seconds):
        with self.lock:
            if self._purge(key) or key not in self.data:
                return 0
            self.data[key][0] = time.time() + seconds
            return 1

    def incr(self, key, delta=1):
        with self.lock:
            self._purge(key)
            cur = self.data.get(key)
            try:
                n = int(cur[1]) if cur else 0
            except ValueError:
                raise SimpleError('value is not an integer')
            n += delta
            self.data[key] = [cur[0] if cur else None, str(n).encode()]
            self.data.move_to_end(key)
            return n

    def keys(self, pattern):
        import fnmatch
        with self.lock:
            now = time.time()
            ks = [k for k, v in self.data.items() if not (v[0] and v[0] <= now)]
        return [k.encode() for k in ks if fnmatch.fnmatch(k, pattern)]

    def info(self):
        with self.lock:
            alive = sum(1 for v in self.data.values() if not (v[0] and v[0] <= time.time()))
            mem = sum(len(k) + len(v[1]) for k, v in self.data.items())
        return SimpleStr(
            '# Server\r\nredis_version:selfcache-%s\r\n'
            '# Memory\r\nused_memory_human:%d bytes\r\n'
            '# Keyspace\r\ndb0:keys=%d,expires=%d\r\n'
            '# Stats\r\nhits:%d\r\nmisses:%d\r\nevictions:%d\r\n'
            % (__version__, mem, alive,
               sum(1 for v in self.data.values() if v[0]),
               self.hits, self.misses, self.evictions))


# ── 连接处理 ──────────────────────────────────────────────────

class Handler(socketserver.StreamRequestHandler):
    cache = None          # 类属性注入
    auth = None
    verbose = False

    def _log(self, *a):
        if self.verbose:
            print(time.strftime('%H:%M:%S'), *a)

    def handle(self):
        buf = b''
        authed = not self.auth
        while True:
            try:
                chunk = self.request.recv(65536)
            except OSError:
                return
            if not chunk:
                return
            buf += chunk
            try:
                cmd, buf = read_command(buf)
                if cmd is None:
                    continue
                if not cmd:
                    continue
            except SimpleError as e:
                self.request.sendall(encode(e))
                continue
            name = cmd[0].upper()
            args = cmd[1:]
            self._log('CMD', name, args[:2])
            if name == 'QUIT':
                return
            if not authed:
                if name == 'AUTH' and len(args) >= 1 and args[0] == self.auth:
                    authed = True
                    self.request.sendall(encode(SimpleStr('OK')))
                else:
                    self.request.sendall(encode(SimpleError('NOAUTH Authentication required')))
                continue
            try:
                self.request.sendall(encode(self.dispatch(name, args)))
            except SimpleError as e:
                self.request.sendall(encode(e))
            except (BrokenPipeError, ConnectionResetError):
                return
            except Exception as e:               # 引擎意外错误也不能断连
                self.request.sendall(encode(SimpleError('ERR internal: %s' % e)))

    def dispatch(self, name, a):
        c = self.cache
        if name == 'PING':
            return SimpleStr('PONG')
        if name == 'COMMAND':
            return []
        if name == 'AUTH':
            return SimpleStr('OK')
        if name == 'SELECT':
            return SimpleStr('OK')               # 单库实现，SELECT 恒成功
        if name in ('GET',):
            return c.get(a[0])
        if name in ('SET', 'SETEX', 'PSETEX'):
            if name in ('SETEX', 'PSETEX'):
                key, sec, val = a[0], int(a[1]), a[2]
                px = sec * (1000 if name == 'SETEX' else 1)
            else:
                key, val, px = a[0], a[1], None
                rest = a[2:]
                i = 0
                while i < len(rest):
                    opt = rest[i].upper()
                    if opt in ('EX', 'PX') and i + 1 < len(rest):
                        px = int(rest[i + 1]) * (1000 if opt == 'EX' else 1)
                        i += 2
                    elif opt == 'KEEPTTL':
                        i += 1
                    else:
                        raise SimpleError('syntax error')
            return c.set(key, val.encode(), px)
        if name == 'DEL':
            return c.delete(*a)
        if name == 'TTL':
            return c.ttl(a[0])
        if name == 'PTTL':
            t = c.ttl(a[0])
            return t if t < 0 else t * 1000
        if name == 'EXPIRE':
            return c.expire(a[0], int(a[1]))
        if name == 'EXISTS':
            with c.lock:
                return sum(1 for k in a if not c._purge(k) and k in c.data)
        if name == 'INCR':
            return c.incr(a[0])
        if name == 'INCRBY':
            return c.incr(a[0], int(a[1]))
        if name == 'DBSIZE':
            return len(c.keys('*'))
        if name == 'KEYS':
            return c.keys(a[0] if a else '*')
        if name == 'FLUSHALL':
            with c.lock:
                c.data.clear()
            return SimpleStr('OK')
        if name == 'INFO':
            return c.info()
        raise SimpleError("unknown command '%s'" % name)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser(description='自研轻量缓存服务端（RESP2 兼容）')
    ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=int(os.environ.get('BLOG_CACHE_PORT', 6379)))
    ap.add_argument('--max-keys', type=int, default=50000, help='最大键数（近似 LRU 逐出）')
    ap.add_argument('--max-bytes', type=int, default=1024 * 1024, help='单值最大字节数')
    ap.add_argument('--auth', default=os.environ.get('BLOG_CACHE_AUTH', ''), help='可选密码')
    ap.add_argument('-v', '--verbose', action='store_true')
    args = ap.parse_args()

    Handler.cache = Cache(args.max_keys, args.max_bytes)
    Handler.auth = args.auth or None
    Handler.verbose = args.verbose

    def sweeper():
        while True:
            time.sleep(60)
            n = Handler.cache.sweep()
            if n and args.verbose:
                print('sweeper 清理过期键:', n)

    threading.Thread(target=sweeper, daemon=True).start()
    srv = Server((args.bind, args.port), Handler)
    print('cache-server %s listening on %s:%d (max-keys=%d)' %
          (__version__, args.bind, args.port, args.max_keys), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
