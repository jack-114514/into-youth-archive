# Memory Archive / 我的记忆档案

可独立部署的记忆网站与原生安卓管理 App。保留首页、欢迎页、3D 粒子树、漂浮相框、雪花、图片/视频放大、音乐、桌宠、故事集、时间线、评论、投稿和管理后台。新装站点使用生成的演示插画和独立数据库，所有文案、图片、颜色、动画参数、Logo、联系方式均可在后台修改。

**运行中的网站与原作者没有账号、数据、域名或云服务绑定。** 源码没有原作者的数据库、真实照片、上传内容、管理员密码、服务器地址、Cloudflare 凭据、邮件凭据或安卓签名私钥。安装和更新只访问你选择的 GitHub 源码仓库及依赖/镜像的官方下载服务；运行时不会访问原作者的网站。源码许可和第三方素材署名仍须保留。

## 在自己的 VPS 安装

自动安装支持 Ubuntu 22.04/24.04、Debian 12/13。建议 2 核 / 2 GB 内存，首次从源码构建资源较多。需要你自己的域名、邮箱，以及能访问 GitHub、Docker Hub、npm 的网络。VPS 的 80、443 端口应空闲并在防火墙中开放。

1. 把自己的域名 A 记录指向自己的 VPS IPv4；没有可用 IPv6 时不要添加 AAAA。首次申请证书时使用 DNS only，HTTPS 可访问后再启用 Cloudflare 代理。
2. 登录自己的 VPS，复制下面命令。脚本下载到临时目录后执行，会安装缺失的 Git、Python、Docker/Compose，克隆源码并交互配置你自己的站点：

```bash
curl -fsSL https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh -o /tmp/memory-archive-install.sh
sudo bash /tmp/memory-archive-install.sh
```

也可先查看源码，再安装：

```bash
git clone https://github.com/jack-114514/into-youth-archive.git
cd into-youth-archive
sudo bash install.sh
```

安装时填写自己的域名、证书邮箱、管理员邮箱、密码。密码可留空生成随机值，它只写入本机权限为 0600 的 .env，不输出到安装日志；生成后请在服务器本地查看该文件。管理员邮箱也是密码恢复收件人。Turnstile 和 SMTP 可以先留空，稍后配置。未配置邮箱恢复时仍可正常登录和管理内容。

默认下载式安装目录为 /opt/memory-archive。其他系统可自行安装 Docker Engine 与 Compose v2 后，运行 python3 scripts/configure.py，再执行 docker compose up -d --build --wait。Docker Compose 只发布网页的 80/443，API 和数据库留在容器网络内。

安装完成访问 **https://你的域名**，后台为 **/admin**。初次打开先看到示例图，进入后台上传自己的图片/视频、编辑首页、时间线和简介，删除不需要的示例。数据保存在 Docker 独立卷 site_data/site_uploads，不在 Git 里。首次创建数据库才填充示例，重启、更新和修改配置不会重新填充或重置密码。

## 自己的 Cloudflare、域名和邮箱

Cloudflare 账号完全由站长自己管理，本项目不需要原作者或站长的 Cloudflare API Token。

- DNS：在自己的 Cloudflare 区域创建上述 A 记录。启用橙云后，SSL/TLS 选 **Full (strict)**；Caddy 为自己的域名申请并续期公开证书。不要使用 Flexible。
- Turnstile：在自己的账号创建 widget，允许的 hostname 填自己的域名。配置 TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY、TURNSTILE_ALLOWED_HOSTNAMES。Site Key 由本站 API 动态提供，Secret 只在自己的后端。无需修改或重新编译前端。
- SMTP：配置 SMTP_HOST、SMTP_PORT、SMTP_SECURITY、SMTP_USERNAME、SMTP_PASSWORD、SMTP_FROM。默认端口 465 对应 ssl；587 对应 starttls。验证码发给自己的 ADMIN_USERNAME 邮箱。若有独立邮件应用密码，请使用它。
- 桌宠 AI：模型与动画可直接使用，AI 默认关闭；需要聊天时在后台桌宠设置填写自己的 DeepSeek Key。私密 Key 不在公开内容 API 返回。

修改域名、Turnstile 或 SMTP：

```bash
cd /opt/memory-archive
sudo bash scripts/reconfigure.sh
```

该命令先独立备份，再交互修改配置，重建容器并检查健康；失败恢复原配置。新域名须先设置自己的 DNS，并在自己的 Turnstile 控制台添加允许的域名。配置文件也可用编辑器修改，但应自行备份并执行 docker compose up -d --force-recreate；不要把真实 .env 发到 GitHub。

## 安卓管理应用

源代码在 [mobile-admin-app](mobile-admin-app/README.md)。首次打开填写自己的 HTTPS 域名，应用验证本站 API 后保存连接。站点设置随时可从登录页或后台工具栏打开。切换站点会清除当前会话，重新使用新站点的账号登录；令牌按域名隔离，域名不需要编进 APK。

[查看最新版自建版与通用测试 APK](https://github.com/jack-114514/into-youth-archive/releases/tag/v3.0.0)。若尚未生成发布包，可在 Actions 的 Self-hosted verification 下载 memory-archive-admin-preview 工件。v3 自建版 APK 与旧版固定站点 APK 是不同应用 ID，可以共存。

**预览 APK 使用测试签名，供体验和验收；长期分发请用自己的私钥构建 release。** CI 的测试签名可能随构建变化，升级测试包可能需要卸载旧测试包；卸载会清除本机站点设置，不影响 VPS 的数据。旧 v1.0.0 发布包不是通用自建版，请下载 v3 自建版。

## 备份、更新和恢复

```bash
cd /opt/memory-archive
sudo bash scripts/backup.sh
sudo bash scripts/update.sh
```

backup.sh 通过 SQLite 在线备份保存一致数据库快照，同时保存上传文件、配置和 Git 版本到 backups/时间戳。目录权限 0700，内含私人内容及密码，必须另存站外，不能上传 GitHub。

update.sh 要求源码工作树干净，先备份，再拉取当前 origin/main 的快进更新并构建；失败恢复先前代码和镜像，保留数据库及上传文件。更新不会清空卷，也不会重设后台密码。若数据库迁移不兼容旧镜像，按 [恢复说明](docs/SELF_HOSTING.md) 手动恢复独立快照；恢复操作会替换你选定的数据，须先备份当前状态。不要执行 docker compose down -v。

Fork 后可用自己的仓库安装：克隆自己的仓库再运行 install.sh，更新会跟随该仓库的 origin/main。下载式安装可设置 REPOSITORY_URL=https://github.com/自己的账号/自己的仓库.git 与 INSTALL_DIR=/opt/自己的目录。页面里的 GitHub 联系链接默认留空，需要展示时在后台填自己的链接。

## 开发与验证

Node.js >=22.13、Python >=3.10。前端开发运行 npm ci && npm run dev，API 使用自己的临时数据目录和账号启动 server/app.py；配置 Vite 代理（参见 docs/SELF_HOSTING.md）。npm run build 生成 vps-dist。发布检查：

```bash
npm run check:public
npm test
npm run test:server
npm run build
```

GitHub Actions 会再验证全新 Docker Compose 部署、API 路由、备份和 Flutter analyze/test/APK 构建。主要程序 MIT；登录组件、DiceBear 头像、Live2D/Cubism demo 模型等单独许可详见 LICENSE、components/opensource-login/LICENSE、public/THIRD_PARTY_NOTICES.txt。第三方角色和 Cubism Core 不由项目的 MIT 许可覆盖，商用请替换或获得对应许可。
