#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Lnbo 博客一键部署脚本(Debian / Ubuntu)
# 用法:
#   git clone https://github.com/monikalnbo/lnbo-blog.git
#   cd lnbo-blog && sudo bash deploy/setup.sh --domain blog.example.com
# 可选参数:
#   --domain  域名(默认 _ 表示任意,纯 IP/测试可用)
#   --webroot 站点根目录(默认 /www/wwwroot/site,博客在 $webroot/blog)
#   --admin   管理员用户名(默认 lnbokaf)
#   --ai-key  智谱 GLM 的 API key(不配则 AI 问答自动降级)
# 做了什么:
#   1. 安装 python3 + nginx(缺啥装啥)
#   2. 拷贝 site/ → $webroot/blog,api/ → /opt/lnbo-blog/api
#   3. 安装 systemd 服务:blog-cache(自写缓存)+ blog-api(交互 API)
#   4. 生成 nginx 配置(visitors 埋点格式 + 反代 + 静态托管)
#   5. 自检并把结果打印出来
# ══════════════════════════════════════════════════════════════
set -e

DOMAIN='_'; WEBROOT=/www/wwwroot/site; ADMIN=lnbokaf; AI_KEY=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)  DOMAIN="$2";  shift 2 ;;
    --webroot) WEBROOT="$2"; shift 2 ;;
    --admin)   ADMIN="$2";   shift 2 ;;
    --ai-key)  AI_KEY="$2";  shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done
SRC="$(cd "$(dirname "$0")/.." && pwd)"    # 仓库根目录

echo "── 1/5 依赖检查"
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }
command -v nginx   >/dev/null || { apt-get update -qq && apt-get install -y -qq nginx; }
nginx -t 2>/dev/null || true

echo "── 2/5 拷贝文件"
mkdir -p "$WEBROOT" /opt/lnbo-blog /www/wwwlogs
rm -rf "$WEBROOT/blog"; cp -r "$SRC/site" "$WEBROOT/blog"
# 保留已有数据库(重复部署不丢用户/评论数据)
BK=""
[ -f /opt/lnbo-blog/api/blog.db ] && { BK=/opt/lnbo-blog/api/blog.db.bak.$(date +%s); mv /opt/lnbo-blog/api/blog.db "$BK"; }
rm -rf /opt/lnbo-blog/api;  cp -r "$SRC/api" /opt/lnbo-blog/api
[ -n "$BK" ] && { mv "$BK" /opt/lnbo-blog/api/blog.db; echo "(已保留原有数据库)"; } || echo "(新库,首次启动自动建表)"

echo "── 3/5 systemd 服务(blog-cache + blog-api)"
sed "s|^Environment=BLOG_ADMIN=.*|Environment=BLOG_ADMIN=$ADMIN|;
     s|^#Environment=ZAI_API_KEY=.*|Environment=ZAI_API_KEY=$AI_KEY|;
     s|^Environment=BLOG_POSTS_DIR=.*|Environment=BLOG_POSTS_DIR=$WEBROOT/blog/posts|" \
    "$SRC/deploy/blog-api.service" > /etc/systemd/system/blog-api.service
cp "$SRC/deploy/blog-cache.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now blog-cache
systemctl restart blog-cache
systemctl enable --now blog-api
systemctl restart blog-api

echo "── 4/5 nginx 配置"
cat > /etc/nginx/conf.d/blog-visitors.conf <<'EOF'
log_format visitors '$time_iso8601|$arg_id|$arg_path|$arg_ref|$remote_addr|$http_user_agent';
EOF
sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{WEBROOT}}|$WEBROOT|g" "$SRC/deploy/nginx-blog.conf" \
  | awk '/^# ============ 1\./{skip=1} /^# ============ 2\./{skip=0} skip==0' \
  > /etc/nginx/conf.d/blog.conf
nginx -t && systemctl reload nginx

echo "── 5/5 自检"
sleep 1
FAIL=0
systemctl is-active --quiet blog-cache && echo "✅ blog-cache(自写缓存)" || { echo "❌ blog-cache"; FAIL=1; }
systemctl is-active --quiet blog-api    && echo "✅ blog-api(交互API)"  || { echo "❌ blog-api";  FAIL=1; }
curl -sf http://127.0.0.1:9540/api/me   >/dev/null && echo "✅ API 直连" || { echo "❌ API 直连"; FAIL=1; }
curl -sf "http://127.0.0.1/api/state?slug=codex-tutorial" >/dev/null \
  && echo "✅ nginx→API 反代" || echo "⚠️  nginx 反代未通(检查域名/端口 80 是否被占)"
[ -f "$WEBROOT/blog/index.html" ] && echo "✅ 静态页 $WEBROOT/blog" || { echo "❌ 静态页缺失"; FAIL=1; }

echo
echo "════ 部署完成 ════"
echo " 博客首页 : http://$( [ "$DOMAIN" = _ ] && echo 服务器IP || echo $DOMAIN )/blog/"
echo " 注册账号 : 打开 /blog/login.html 注册,首个用户即管理员"
[ -n "$AI_KEY" ] && echo " AI 问答  : 已配置" || echo " AI 问答  : 未配置(--ai-key 可开启,不影响其他功能)"
echo " HTTPS    : certbot --nginx -d $DOMAIN 自助签发"
echo " 统计报告 : python3 /opt/lnbo-blog/api/report.py [天数]"
[ $FAIL -eq 0 ] || { echo " ⚠️ 存在失败项,看上文排查"; exit 1; }
