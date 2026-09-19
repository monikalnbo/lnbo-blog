#!/bin/bash
# 自写缓存层全链路验证:命中 / 失效 / 降级 三连
set -e
cd /root/lnbo-blog/api
rm -f /tmp/v.db*

cache_cmd() {  # 向自研 cache-server 发命令
python3 - "$@" <<'PYEOF'
import socket, sys
args = sys.argv[1:]
buf = f'*{len(args)}\r\n'.encode()
for a in args:
    a = a.encode()
    buf += f'${len(a)}\r\n'.encode() + a + b'\r\n'
s = socket.create_connection(('127.0.0.1', 6399), timeout=2)
s.sendall(buf); print(s.recv(65536)[:120]); s.close()
PYEOF
}

# ── 起自研缓存服务端(6399) + 测试 API(19540,缓存指向 6399) ──
pkill -f "cache-server.py --port 6399" 2>/dev/null || true
pkill -f "BLOG_PORT=19540" 2>/dev/null || true
sleep 0.3
setsid nohup python3 cache-server.py --port 6399 >/tmp/v-cache.log 2>&1 < /dev/null &
CACHE_PID=$!
sleep 0.8

BLOG_REDIS_URL=redis://127.0.0.1:6399/0 BLOG_PORT=19540 BLOG_DB=/tmp/v.db \
BLOG_POSTS_DIR=/root/lnbo-blog/site/posts BLOG_VISITORS_LOG=/tmp/v-visitors.log \
setsid nohup python3 api.py >/tmp/v-api.log 2>&1 < /dev/null &
API_PID=$!
sleep 1

echo "════ 前置:注册+登录+打红心 ════"
curl -s -X POST localhost:19540/api/register -d '{"username":"vt","password":"123456"}'
SID=$(curl -s -i -X POST localhost:19540/api/login -d '{"username":"vt","password":"123456"}' | grep -oP 'sid=\K[a-f0-9]+')
curl -s -H "Cookie: sid=$SID" -X POST localhost:19540/api/heart -d '{"slug":"codex-tutorial"}'
echo; echo

echo "════ ① 首次 state(回源 SQLite,写入缓存) ════"
curl -s "localhost:19540/api/state?slug=codex-tutorial"; echo
echo "-- 缓存键:"; cache_cmd KEYS 'blog:*'
echo "-- TTL:";     cache_cmd TTL blog:state:codex-tutorial
echo

echo "════ ② 命中验证:篡改缓存为 999,再查应返回 999 ════"
cache_cmd SET blog:state:codex-tutorial '{"hearts":999,"favs":888,"comments":[{"content":"来自自写缓存","created_at":1,"username":"cache"}]}'
curl -s "localhost:19540/api/state?slug=codex-tutorial" | python3 -c "import json,sys; d=json.load(sys.stdin); print('hearts =', d['hearts'], '| 首条评论 =', d['comments'][0]['content']); print('✅ 走了缓存' if d['hearts']==999 else '❌ 未命中缓存')"
echo

echo "════ ③ 失效验证:取消红心 → 缓存删除 → 回源新数据 ════"
curl -s -H "Cookie: sid=$SID" -X POST localhost:19540/api/heart -d '{"slug":"codex-tutorial"}'; echo
curl -s "localhost:19540/api/state?slug=codex-tutorial" | python3 -c "import json,sys; d=json.load(sys.stdin); print('hearts =', d['hearts']); print('✅ 写后失效,回源' if d['hearts']==0 else '❌ 还是脏缓存')"
echo

echo "════ ④ 降级验证:杀掉缓存服务端,API 必须照常工作 ════"
pkill -f "cache-server.py --port 6399"; sleep 0.5
curl -s -H "Cookie: sid=$SID" -X POST localhost:19540/api/heart -d '{"slug":"codex-tutorial"}'; echo
curl -s "localhost:19540/api/state?slug=codex-tutorial" | python3 -c "import json,sys; d=json.load(sys.stdin); print('hearts =', d['hearts']); print('✅ 降级直查 SQLite 正常' if d['hearts']==1 else '❌ 降级失败')"
echo

echo "════ ⑤ 恢复验证:缓存服务重启后自动恢复使用(30s熔断到期) ════"
setsid nohup python3 cache-server.py --port 6399 >/tmp/v-cache.log 2>&1 < /dev/null &
sleep 31
curl -s "localhost:19540/api/state?slug=codex-tutorial" >/dev/null  # 先重建缓存
cache_cmd SET blog:state:codex-tutorial '{"hearts":777,"favs":0,"comments":[]}' >/dev/null
curl -s "localhost:19540/api/state?slug=codex-tutorial" | python3 -c "import json,sys; d=json.load(sys.stdin); print('hearts =', d['hearts']); print('✅ 熔断恢复,重新走缓存' if d['hearts']==777 else '❌ 未恢复')"

# ── 清理 ──
pkill -f "cache-server.py --port 6399" 2>/dev/null || true
kill $API_PID 2>/dev/null || true
sleep 0.3
for pid in $(pgrep -f "python3 api.py"); do
  [ "$(readlink /proc/$pid/cwd 2>/dev/null)" == "/root/lnbo-blog/api" ] && kill -9 $pid
done
rm -f /tmp/v.db* /tmp/v-*.log
echo; echo "════ 全部完成,测试进程已清理 ════"
