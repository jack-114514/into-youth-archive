# INTO Youth Archive / 青春纪事

<div align="center">

## 📱 Android 管理 App

### [⬇️ 点击这里直接下载最新版 APK（v1.0.4）](https://github.com/jack-114514/into-youth-archive/releases/latest/download/into-youth-admin-v1.0.4.apk)

**不熟悉 GitHub 也没关系：点击上面的下载链接，下载完成后打开 APK 即可安装。**

[查看版本说明、历史版本与 SHA256 校验文件](https://github.com/jack-114514/into-youth-archive/releases)

</div>

> 安装提示：如果 Android 提示“禁止安装未知应用”，请按系统提示允许当前浏览器安装应用，然后再次打开下载好的 APK。安装 v1.0.3 或更高版本后，后续更新可在 App 内优先下载差分包；出现异常时会自动回退完整 APK。

---

一个面向校园青春记录的全栈开源网站。它包含玻璃拟态首页、3D 粒子记忆树、图片与短视频展厅、游客身份、评论与投稿，以及单管理员后台。

此仓库是从正在运行的网站整理出的“公开源码版”。真实数据库、评论、投稿、头像、管理员账号、上传的照片/视频、备份和生产密钥均未包含；仓库中的图片是抽象占位图。

## 主要功能

- 欢迎页、游客头像与昵称、本地浏览器身份记忆
- 响应式首页、相片展厅、时间线、个人简介与留言区
- Three.js / React Three Fiber 3D 粒子树，可拖动、滚轮或双指缩放
- 3D 场景中的漂浮相框、雪花、沉浸模式和过渡动画
- 图片与 720P 短视频组合展示，视频未就绪时优先显示封面图
- 评论、回复、点赞、图片评论和投稿
- 管理后台：内容、排序、拍摄时间、首页/3D 可见性、评论和投稿管理
- 管理员密码找回：Cloudflare Turnstile、邮件验证码、PBKDF2 密码哈希
- Flutter 原生 Android 管理 App：Token 轮换、Secure Storage、媒体压缩上传、更新校验
- Python 标准库 API、SQLite、Nginx 和 systemd 的轻量 VPS 部署方案

## 技术栈

- React 19、TypeScript、Vite / vinext
- Three.js、React Three Fiber、Drei、Framer Motion
- Python 3 标准库 HTTP 服务、SQLite
- Flutter 3.47、Dart 3.13、Gradle 9.3.1、Android Gradle Plugin 9.1
- Nginx、systemd、Cloudflare Turnstile

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

构建 VPS 静态站点：

```bash
npm run build:vps
```

`npm run build` 会构建 vinext 版本；公开副本不包含任何绑定到原部署项目的托管平台 ID。

启动 API 前，复制并填写环境变量。生产环境建议将它保存为 `/etc/into-youth.env`，权限设为仅 root 可读：

```bash
cp .env.example /etc/into-youth.env
python3 server/app.py
```

后台初始管理员来自 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。首次启动并创建管理员后，应从环境文件移除明文初始密码。SMTP 应使用应用专用密码，禁止提交真实密码。

## Cloudflare Turnstile

公开版前端使用 Cloudflare 官方测试站点密钥，不对应任何真实站点。正式部署时：

1. 在 `components/AdminDashboard.tsx` 中替换公开的站点密钥。
2. 把私密的 `TURNSTILE_SECRET_KEY` 仅写入服务器环境文件。
3. 永远不要把 Turnstile 密钥、SMTP 应用密码或验证码 pepper 提交到 Git。
4. 将允许的公开域名写入 `TURNSTILE_ALLOWED_HOSTNAMES`，多个域名用逗号分隔。

## Android 管理 App

原生管理端源码位于 `mobile-admin-app/`。它只通过版本化的
`/api/v1/admin-app` HTTPS API 工作，不是 WebView。构建环境和完整命令见：

- `mobile-admin-app/build_environment.md`
- `mobile-admin-app/README.md`
- `mobile-admin-app/docs/api-v1.md`

生产 URL 必须使用 `--dart-define` 注入。签名文件、`key.properties`、真实域名、
Token 和任何服务器 Secret 都不得提交。Release 构建默认启用 R8 与资源压缩。

## Release 与回滚

每个 Android Release 的 APK、Git Tag、Git Commit 与 SHA-256 必须一一对应。
`mapping.txt` 只私密归档，不上传公开 Release。部署或升级前先备份数据库、上传目录、
服务端源码和环境文件；回滚说明见 `docs/release-and-rollback.md`。

## VPS 部署

`deploy/` 提供 systemd 与 Nginx 示例。部署前请按自己的域名、目录和证书配置调整。推荐：

- API 仅监听 `127.0.0.1`
- 只开放 22、80、443 端口
- HTTPS、HSTS 与安全响应头
- `/etc/into-youth.env` 使用 `chmod 600`
- 数据库、上传目录和备份始终放在 Git 仓库之外

## 不在仓库中的内容

- SQLite 数据库及其中的评论、投稿、验证码和登录会话
- 用户上传的图片、视频和自定义头像
- 生产环境 `.env`、SMTP 密码、Turnstile 密钥、管理员账号和密码
- VPS 地址、SSH 凭据、部署脚本、服务器备份和运行日志
- 正在运营的网站截图和 Open Graph 图片
- Android Release keystore、签名密码、`key.properties` 与 R8 mapping 文件

## 第三方代码与许可

登录界面的部分组件基于 Bob Zhang 的 MIT 许可作品修改；原版权声明保留在 `components/opensource-login/LICENSE`。预设头像 SVG 中保留了 DiceBear Adventurer 素材的作者、来源与 CC BY 4.0 元数据。其余依赖分别遵循各自的软件许可证。

本项目自身以 MIT License 发布，详见 `LICENSE`。
