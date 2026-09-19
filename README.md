# Lnbo 日记本 · 博客源码

> 字是别人的,本子是我的。—— 个人博客:AI 工具与智能体研究、网络长文的收藏与整理。

纯静态前端 + 单文件 Python 后端 + **自写缓存层**(不用装 Redis),整站零第三方依赖,克隆下来就能跑。

## 架构

```
浏览器
  │  HTML/CSS/JS(无构建、无框架)
  ▼
nginx ──┬── /  /me.html  个人页 + 导航页 + 404(wwwroot/ 静态文件)
        ├── /blog/      博客静态页(wwwroot/blog/)
        ├── /api/       ──► blog-api.service   (api.py,127.0.0.1:9540)
        │                     │  SQLite 持久化(用户/红心/收藏/评论)
        │                     │  热点读走缓存 ↓
        │                     ▼
        │                 blog-cache.service (cache-server.py,127.0.0.1:6379)
        │                     自写 RESP2 缓存服务端,纯标准库
        └── /collect    访客埋点:nginx 直接写 visitors.log(零后端开销)
                              └─► api.py 读取做统计页(stats.html)
```

| 组件 | 技术 | 说明 |
|---|---|---|
| 前端 `site/` | 原生 HTML/CSS/JS | 无构建步骤,改完刷新即生效 |
| 后端 `api/api.py` | Python 3 标准库单文件 | 用户注册登录、红心/收藏/评论、阅读偏好、访客统计、文章 AI 问答(智谱 GLM) |
| 缓存 `api/cache-server.py` | Python 3 标准库单文件 | **自写缓存服务端**,RESP2 协议(与 Redis 客户端兼容),TTL + 近似 LRU;挂了自动降级直查 SQLite |

## 仓库结构

```
wwwroot/                 # ← 整个拷到服务器站点根(nginx root,默认 /www/wwwroot/site)
  index.html            # 服务器导航页(卡片指向本机各服务,新服务器需按需增删)
  me.html               # 个人主页
  404.html  robots.txt  sitemap.xml
  css/  vendor/         # 个人页样式与前端库(离线自带,无 CDN 依赖)
  blog/                 # 博客(部署后访问 /blog/)
    index.html  about.html  login.html  stats.html  feed.xml
    posts/*.html        # 文章(带模板写法,见「写文章」)
    assets/             # style.css / enhance.js / interact.js / analytics.js / ai-ask.js
api/
  api.py                 # 交互 API(默认 127.0.0.1:9540)
  cache-server.py        # 自写缓存服务端(默认 127.0.0.1:6379)
  report.py              # 终端访客报告:python3 report.py [天数]
  ip2region.xdb          # 离线 IP 归属地库(统计页用,11MB)
  test-cache.sh          # 缓存层全链路自检(命中/失效/降级/恢复)
deploy/
  setup.sh               # ★ 一键部署脚本
  blog-api.service       # systemd 单元:交互 API
  blog-cache.service     # systemd 单元:缓存服务
  nginx-blog.conf        # nginx 配置模板(setup.sh 会自动生成)
```

> 大文件资源不在仓库:原站的 `mods/`(Minecraft 模组)、`video/`(视频)目录与页面无代码依赖,迁移时用 scp/rsync 单独拷到 `$WEBROOT` 下即可;导航页 `index.html` 上的卡片链接(下载站/棋牌/noVNC 等)指向原服务器配套服务,新环境自行修改。

---

# 部署指南(给部署用的 AI / 人类)

目标环境:任意一台 **Debian / Ubuntu** 服务器(root 权限),放行 80/443 端口。三种方式按需选一。

## 方式 A:一键脚本(推荐)

```bash
git clone https://github.com/monikalnbo/lnbo-blog.git /tmp/lnbo-blog
cd /tmp/lnbo-blog
sudo bash deploy/setup.sh --domain blog.example.com
# 可选: --admin 管理员名   --ai-key 智谱key   --webroot /www/wwwroot/site
```

脚本做的事:装 python3+nginx → 拷贝文件 → 装两个 systemd 服务 → 生成 nginx 配置 → 自检并打印结果。
完成后访问 `http://blog.example.com/blog/`,打开 `/blog/login.html` 注册,**首个注册用户即管理员**。
HTTPS:`certbot --nginx -d blog.example.com`(或参考 `deploy/nginx-blog.conf` 里的 443 模板)。

## 方式 B:手动分步(等价于脚本,便于排查)

```bash
# 1. 文件就位
mkdir -p /www/wwwroot/site /opt/lnbo-blog /www/wwwlogs
cp -r wwwroot/. /www/wwwroot/site/         # 个人页 + 导航页 + blog/
cp -r api  /opt/lnbo-blog/api              # 后端 + 缓存

# 2. systemd 服务
cp deploy/blog-cache.service deploy/blog-api.service /etc/systemd/system/
# 按需编辑 /etc/systemd/system/blog-api.service 里的环境变量(见下表)
systemctl daemon-reload
systemctl enable --now blog-cache blog-api

# 3. nginx(两份配置)
#    conf.d/blog-visitors.conf:
cat > /etc/nginx/conf.d/blog-visitors.conf <<'EOF'
log_format visitors '$time_iso8601|$arg_id|$arg_path|$arg_ref|$remote_addr|$http_user_agent';
EOF
#    conf.d/blog.conf:把 deploy/nginx-blog.conf 中 {{DOMAIN}} {{WEBROOT}} 替换后拷入
cp deploy/nginx-blog.conf /etc/nginx/conf.d/blog.conf   # 记得先 sed 替换占位符
nginx -t && systemctl reload nginx

# 4. 验证
systemctl status blog-cache blog-api        # 两个都 active
curl http://127.0.0.1:9540/api/me           # {"logged_in": false, ...}
curl -I http://127.0.0.1/blog/              # 200
```

## 方式 C:纯静态托管(无后端)

只把 `wwwroot/` 目录扔到任意静态托管(nginx / GitHub Pages / OSS / CDN)即可:个人主页 `/me.html`、导航页、博客正文完全可读。
**会失效的功能**:红心、收藏、评论、登录、统计页数据、AI 问答(前端会自动隐藏这些模块,不会报错)。另外 `index.html` 导航卡片指向原服务器的配套服务(下载站/棋牌/noVNC 等),新环境请自行增删卡片。

## 环境变量(blog-api.service)

| 变量 | 默认 | 说明 |
|---|---|---|
| `BLOG_ADMIN` | `lnbokaf` | 管理员用户名(逗号分隔);未配置时首个注册用户自动成为管理员 |
| `BLOG_REDIS_URL` | `redis://127.0.0.1:6379/0` | 缓存地址。**留空 = 禁用缓存**,全部直查 SQLite;也可以指向真 Redis(协议兼容) |
| `BLOG_PORT` | `9540` | API 监听端口(仅本机,nginx 反代) |
| `BLOG_DB` | `api/blog.db` | SQLite 路径,首次启动自动建表 |
| `BLOG_VISITORS_LOG` | `/www/wwwlogs/visitors.log` | 访客埋点日志(nginx 写入) |
| `BLOG_POSTS_DIR` | `/www/wwwroot/site/blog/posts` | 文章目录(AI 问答全站模式扫描) |
| `ZAI_API_KEY` | 空 | 智谱 GLM key(<https://open.bigmodel.cn>),不配则 AI 问答返回开通提示,其余功能不受影响 |
| `BLOG_AI_MODEL` | `glm-4-flash` | AI 模型名 |

---

# 自写缓存层说明

**为什么自写**:博客缓存只需要 GET/SET/DEL + TTL,自写一个约 300 行的标准库服务端,部署机器连 Redis 都不用装;说 RESP2 协议,所以 `redis-cli`、任何语言的标准 Redis 客户端都能直连,将来想换真 Redis 改一行 `BLOG_REDIS_URL` 即可。

**缓存内容**(`/api/state` 的公共部分——红心数/收藏数/评论列表,TTL 300s;`/api/stats` 统计结果,TTL 120s)。个人化部分(是否点过赞、用户名)永远直查 SQLite,不缓存。写操作(红心/收藏/评论)**即时删除对应缓存键**,下次读自动重建。

**可靠性**:api.py 内置缓存客户端带 0.3s 超时 + 30s 熔断——缓存服务挂了、重启中、没启动,全部自动降级直查 SQLite,接口行为不变,只慢一点点。自检:`bash api/test-cache.sh`(五连:回源写缓存 → 命中 → 写后失效 → 降级 → 熔断恢复)。

**容量保护**:默认 5 万键、单值 1MB 上限,超限近似 LRU 逐出,后台每 60s 清扫过期键。改参数:`cache-server.py --max-keys 100000`。

---

# API 端点(均挂 nginx `/api/` 下)

| 方法 | 路径 | 说明 | 缓存 |
|---|---|---|---|
| GET | `/api/state?slug=` | 文章互动状态(红心数/评论列表/当前用户状态) | ✅ 公共部分 |
| GET | `/api/me` | 当前登录态 | ❌ |
| GET/POST | `/api/pref` | 登录用户的阅读偏好(背景/字号/字体) | ❌ |
| GET | `/api/stats` | 访问统计(仅管理员) | ✅ 120s |
| POST | `/api/register` `/api/login` `/api/logout` | 用户(密码 PBKDF2 加盐) | — |
| POST | `/api/heart` `/api/fav` | 红心/收藏(再点取消) | 写后失效 |
| POST | `/api/comment` | 评论(≤500 字) | 写后失效 |
| POST | `/api/ai/ask` | 文章页 AI 问答(联网检索 + 文章内容,带限流) | ❌ |

---

# 日常运维

```bash
# 发新文章:写一个 site/posts/<slug>.html(参考现有文章结构),
# 在 index.html 加一张卡片、feed.xml 加一条 —— 然后 cp 到线上即可,无需重启
# 备份:整个状态就是两个文件
tar czf blog-backup.tgz /opt/lnbo-blog/api/blog.db /www/wwwlogs/visitors.log
# 终端访客报告
python3 /opt/lnbo-blog/api/report.py 7
# 重启服务
systemctl restart blog-cache blog-api
```

**迁移到新服务器**:方式 A/B 重跑一遍部署,再把 `blog.db` 和 `visitors.log` 拷回去覆盖、重启即可,历史用户/评论/统计全在。

# FAQ

- **80/443 被占**:nginx 模板里的 `listen` 改端口,或用已有的 nginx 只拷 `location` 块。
- **忘了管理员是谁**:直接改库 `sqlite3 blog.db "UPDATE users SET username='新名' WHERE id=(SELECT MIN(id) FROM users)"`(管理员=首个注册用户)。
- **AI 问答 401/超时**:没配 `ZAI_API_KEY` 或 key 无效,其余功能不受影响。
- **缓存服务要不要装**:`blog-cache` 不是必需项,关掉它博客照常跑(慢一丁点);想省一个进程就 `systemctl disable --now blog-cache` 并把 `BLOG_REDIS_URL` 留空。

---

## 许可

文章内容版权归原作者所有(转载类均在页首标注作者与出处);代码部分 MIT。
