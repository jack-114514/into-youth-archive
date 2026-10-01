# 自建运维说明

Docker Compose 是默认部署方式。数据库、上传文件和 Caddy 证书分别使用独立卷；本程序只监听容器内的 API 端口。其他系统只需安装 Docker 与 Compose v2、Git、Python 3，克隆后执行 python3 scripts/configure.py 和 docker compose up -d --build --wait。

## 本地开发

前端 npm ci && npm run dev。API 使用单独的临时目录，设置 SITE_DATA_DIR、SITE_UPLOAD_DIR、ADMIN_USERNAME、ADMIN_PASSWORD 后运行 python3 server/app.py。Vite 开发代理默认把 /api 与 /uploads 转发到 http://127.0.0.1:8765。HTTP 只用于本地开发，安卓端连接始终要求可信的 HTTPS。

## 更换域名与 Cloudflare

先修改自己的 DNS 和 Turnstile 控制台允许的域名，然后执行 bash scripts/reconfigure.sh。DOMAIN 与 TURNSTILE_ALLOWED_HOSTNAMES 只影响本站的 Caddy/验证服务。Cloudflare 密钥属于自己的 widget，Site Key 可公开，Secret Key/SMTP_PASSWORD/PASSWORD_CODE_PEPPER 只保存到自己的 .env。完整配置后才能使用网页邮箱恢复；未配置时仍可使用初始账号登录。

Caddy 自动申请证书需要可用的 80/443 和正确的 DNS。若安装后浏览器暂未显示页面，先看 docker compose logs web，确认 DNS、证书和防火墙。健康检查通过只证明容器内的页面/API 路由正确，不代表公共 DNS 已生效。Cloudflare 建议源站证书就绪后开启代理，并选择 Full (strict)。

## 从备份恢复

以下会替换你自己选定的数据库和上传内容。先对当前状态运行 backup.sh，确认备份目录与对应 Git 版本，再停止后端和网页。恢复时不要清空或删除原来的卷，也不要运行 down -v。通过 docker compose cp 或 docker compose run --no-deps 的临时后端容器，把所选备份的 site.db 写回 /data/site.db，把 uploads.tar.gz 解压到 /uploads，并确保 owner 是 10001:10001；恢复 config.env 为 .env（权限0600）。切换到备份记录的 Git 版本，构建或重新标记保留的 rollback 镜像，再 docker compose up -d --no-build --wait，运行 python3 scripts/health.py 并访问自己的域名。恢复是人工确认的操作，更新脚本只回退源码与镜像，不主动覆盖用户数据。

例如，可先停止服务，再使用临时容器准备数据库文件；路径需对应自己确认的备份：

```bash
docker compose stop web backend
# 把 SELECTED_BACKUP 替换为已核对的 backups/时间戳 路径
# 保留当前数据恢复点后再执行
cp SELECTED_BACKUP/config.env .env
chmod 600 .env
docker compose run --rm --no-deps --user root -v "$PWD/SELECTED_BACKUP:/restore:ro" backend python -c "import shutil,os; shutil.copy2('/restore/site.db','/data/site.db'); os.chown('/data/site.db',10001,10001)"
```

上传恢复包是补充/覆盖同名文件，不自动删除后来上传的文件。若需要精确时间点恢复，请将当前卷完整归档并自行确认目录后操作，避免误删。

## 自己的品牌与内容

后台管理首页文字、Logo、颜色、照片、视频、故事、时间线、留言和桌宠。网站默认 GitHub/邮箱联系为空。账号用户名取 ADMIN_USERNAME；修改此配置会更新登录邮箱，首次安装密码只在数据库没有管理员时使用，之后不会重设密码。示例图由 SVG 几何图形生成，无真人和原站图片；删除后重启不会恢复。

头像/桌宠示例素材需遵守第三方许可，详情在 public/THIRD_PARTY_NOTICES.txt 与 public/assets/desktop-pet/NOTICE.txt。花火测试模型没有随开源版分发。可选择自定义有许可的 Live2D 模型，自有 DeepSeek Key 仅用于自己的后端。

## 非 Docker 部署

deploy/nginx-example.conf 和 deploy/memory-archive.service 是手动部署模板，需要自行填写域名、HTTPS、路径、环境文件。不要同时让 Nginx 与默认 Docker Caddy 占用 80/443。模板没有任何真实服务器账号或证书。

官方文档：[Docker Compose 安装](https://docs.docker.com/compose/install/linux/)、[环境文件与插值](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)、[Cloudflare Full strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)、[Turnstile 后端验证](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)。
