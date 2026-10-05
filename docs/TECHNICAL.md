# 技术说明

对应网站 v3.5.0、安卓 1.7.0+18。版本来源：[package.json](../package.json)、[安卓依赖](../mobile-admin-app/pubspec.yaml)、[Compose](../compose.yaml)。[新手安装](QUICK_START.md) · [完整功能纯文本](网站功能详情.txt)。

## 运行结构

```text
访客浏览器 / 网页后台 / 安卓管理 App
                 │ HTTPS
                 ▼
       Caddy（VPS 公开 80 / 443）
         ├─ 静态 SPA：vps-dist → /srv
         ├─ /uploads/*：只读提供上传文件
         └─ /api/*：反向代理 → Python backend:8765
                                     ├─ /data/site.db（SQLite）
                                     └─ /uploads（上传文件）
```

前端通过本站 JSON API 读取内容与设置。网页后台按需加载，安卓共用数据但使用独立的版本化管理 API。默认没有独立数据库服务器；不需要把 API 8765 端口暴露到公网。Caddy 8080 仅作容器内部健康检查。

## 技术与依赖

下表是源码声明版本；实际安装以 package-lock.json / pubspec.lock 为准。

| 技术 | 版本 / 范围 | 实际用途 |
| --- | --- | --- |
| React / React DOM | 19.2.6 | 前台、网页管理界面与组件状态 |
| TypeScript | 5.9.3 | 前端类型与组件开发 |
| Vite | 8.0.13 | 本地开发、前端分包与静态生产构建 |
| Three.js | ^0.185.1 | WebGL 粒子、树形场景和图像对象 |
| @react-three/fiber / drei | ^9.7.0 / ^10.7.8 | React 3D 渲染与场景辅助 |
| Framer Motion | ^13.0.0 | 页面、卡片和弹层过渡 |
| Tailwind CSS / 自定义 CSS | 4.2.1 | 排版、配色、响应式与动画样式 |
| react-advanced-cropper | ^0.20.1 | 网页后台图片取景与裁剪参数 |
| Lucide React | ^1.30.0 | 界面图标 |
| 原创墨灵 | 六部件透明图集 + SVG | 默认 AI 助手，支持自定义图片/Live2D |
| Python | 本地 >=3.10；容器 3.12 | 标准库 HTTP 服务、认证、文件上传、SQLite、SMTP、第三方请求 |
| SQLite | Python sqlite3 | 内容、设置、管理员、会话、留言/投稿、操作日志 |
| Docker / Compose | Engine + Compose v2 | 分阶段构建、服务编排、独立卷、健康检查 |
| Caddy | 2 系列 | HTTPS 证书、静态文件、压缩、反向代理 |
| Flutter / Dart | 3.47.0 / 3.13 | 原生 Android 管理端；详见[安卓技术](../mobile-admin-app/README.md#技术与依赖) |

Node.js 要求 >=22.13，Docker 构建阶段使用 Node 22。当前 VPS 入口是 Vite SPA；仓库中保留的 vinext、Wrangler、Cloudflare Vite 插件、Drizzle 等历史工具，不代表默认部署在使用 Next SSR、Workers、D1 或 ORM。

## 前端组织与性能

| 路径 | 职责 |
| --- | --- |
| [vps-app/src/main.tsx](../vps-app/src/main.tsx) | React 入口；前台与懒加载管理后台 |
| [vps-app/vite.config.mjs](../vps-app/vite.config.mjs) | 开发代理、生产构建配置 |
| [components/ImmersiveHome.tsx](../components/ImmersiveHome.tsx) | 栏目路由、首页、内容与音乐交互 |
| [components/AdminDashboard.tsx](../components/AdminDashboard.tsx) | 网页编辑与管理 |
| [components](../components) | 3D 场景、图片详情、开场、桌宠和可复用界面 |
| [app/globals.css](../app/globals.css) | 响应式、主题与动画样式 |
| [public](../public) | 演示插画、图标、第三方模型与许可 |
| [server/app.py](../server/app.py) | 网页/公共 API、初始化与认证 |
| [server/admin_app_api.py](../server/admin_app_api.py) | 原生管理 API、刷新会话与操作日志 |
| [server/desktop_pet.py](../server/desktop_pet.py) | 桌宠配置、预设与可选 DeepSeek 请求 |

栏目路径为 `/`、`/stories`、`/memory`、`/timeline`、`/campus`、`/notes`、`/about`、`/messages`；后台为 `/admin`。Caddy 对 SPA 页面路径返回入口 HTML。

3D 图片详情使用提前解码、最多 3 张的解码缓存及按交互时机预热，降低点击时的解码阻塞；图片按原比例显示。粒子、相框、雪花和旋转动画继续运行。帧率仍受设备 GPU、屏幕分辨率、粒子参数与图片体积影响。服务端没有自动把所有上传图片生成多尺寸缩略图的管线。

## API 概览

表内路径可在上述 Python 文件定位；写入管理接口需要本站管理员会话。此处是职责说明，不是匿名调用授权。

| 路径 | 用途 |
| --- | --- |
| GET /api/health | 站点 API 可用性检查 |
| GET /api/public-config | 公开 Turnstile Site Key、密码恢复是否配置 |
| GET /api/content | 可公开的设置、媒体、开场节点 |
| GET /api/stats；POST /api/stats/view | 读取统计、累计访问次数 |
| GET/POST /api/comments；POST /api/comments/{id}/like | 读取/发表留言与点赞 |
| POST /api/submissions | 提交投稿，进入管理审核 |
| POST /api/admin/login | 网页管理员登录 |
| /api/admin/media、/settings、/homepage-intro、/comments、/submissions | 网页后台内容与设置管理 |
| /api/admin/password-recovery/code、/complete | Turnstile + 邮件验证码的密码恢复/修改流程 |
| /api/v1/admin-app/auth/login、/refresh、/logout | 原生 App 登录、轮换刷新、退出 |
| /api/v1/admin-app/dashboard、/session | 管理统计、会话与诊断状态 |
| /api/v1/admin-app/media、/comments、/submissions、/settings | App 使用的管理资源 |
| /api/v1/admin-app/operation-logs | 已认证管理员查看操作摘要 |

安卓 1.7.0 的原生界面已覆盖栏目图片与取景、文案与排版、时间线、首页开场路线、3D 参数、音乐上传/排序、联系链接、桌宠全部配置与预设、邮箱验证码改密，以及媒体、留言、投稿和服务器状态。App 与网站使用同一份数据；菜单名称、顺序和两级分组与网站保持一致。投稿“接受”记录审核状态，不会自动替站长编辑成公开故事。

后端请求体上限 18 MiB。安卓端图片压缩为 JPEG（quality 86、1920 参数，保留 EXIF）；视频压缩为 720P并保留音轨，大文件仍可能超限。压缩在手机上完成，不是服务器转码服务。

## 数据与认证

| 数据 | 存储 / 行为 |
| --- | --- |
| 管理员 | 单管理员；邮箱与随机盐、PBKDF2-HMAC-SHA256 密码摘要 |
| 密码派生 | 600,000 次迭代；支持旧 240,000 次摘要在登录时迁移 |
| 网页会话 | 随机 Bearer 令牌，服务端存摘要；有效期 24 小时 |
| App 会话 | 访问令牌 30 分钟、刷新令牌 30 天；服务端存摘要，刷新时轮换 |
| App 本机连接 | 自选 HTTPS origin、可选更新清单、安全存储中的会话令牌；不保存登录密码 |
| 内容 | media、settings、homepage_intro_nodes；图片/视频文件在上传卷 |
| 留言 / 投稿 | comments、submissions；投稿包含联系邮箱，供站长处理 |
| 统计 / 日志 | site_stats 访问计数；App 管理动作、资源 ID、请求 ID、时间摘要 |
| 桌宠私密配置 | 后端私密表中的自有 API Key；不返回到公开内容 API |

App 管理 API 使用进程内限流，登录上限为每来源分组 300 秒内 10 次；这是应用防护，不是分布式网关。API 响应禁用缓存；Caddy 对入口 HTML 设置重新验证缓存，静态文件单独提供。

数据库与密钥依赖自己的 VPS、目录权限和备份管理，项目没有为整个数据库/上传卷提供加密存储。上传目录通过公开 URL 提供文件；“隐藏条目”不是私密文件访问控制。删除数据库条目不会自动删除上传实体、已有备份或外部缓存。详细数据流见[隐私政策](../mobile-admin-app/PRIVACY.md)。

## 自己的环境配置

| 配置组 | 关键字段 |
| --- | --- |
| 域名与证书 | DOMAIN、ACME_EMAIL；裸域名，证书由 Caddy 管理 |
| 端口 | HTTP_PORT=80、HTTPS_PORT=443 |
| 初始管理员 | ADMIN_USERNAME、ADMIN_PASSWORD；密码仅用于首次创建 |
| 演示数据 | SEED_DEMO_CONTENT；全新数据库可选演示数据 |
| Turnstile | TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY、TURNSTILE_ALLOWED_HOSTNAMES |
| 邮件恢复 | PASSWORD_CODE_PEPPER、SMTP_HOST/PORT/SECURITY/USERNAME/PASSWORD/FROM |
| 服务端目录 | SITE_DATA_DIR、SITE_UPLOAD_DIR；容器中 /data 与 /uploads |

[.env.example](../.env.example)只有示例；真实 `.env` 权限 0600、禁止提交。DeepSeek Key 在网页后台独立设置，仅允许源码列出的 DeepSeek 官方 API 地址。Cloudflare Site Key 是公开值；Secret Key 和 SMTP 授权码仅由后端使用。

运行时可能的外部服务：Caddy 证书机构；自己启用的 Cloudflare 代理/Turnstile、SMTP、DeepSeek；内容指定的外链媒体。默认不绑定原作者的站点或更新地址。

## 开发与检查

先安装 Node.js >=22.13、Python >=3.10。在仓库根目录：

```bash
npm ci
npm run dev
```

另一个本地终端，用独立临时数据启动 API。以下为 Linux/macOS 开发示例；邮箱为演示占位，密码由自己交互输入，不使用生产数据：

```bash
export SITE_DATA_DIR="$(mktemp -d)"
export SITE_UPLOAD_DIR="$(mktemp -d)"
export ADMIN_USERNAME="admin@example.com"
read -rs -p "Local test password: " ADMIN_PASSWORD
export ADMIN_PASSWORD
python3 server/app.py
```

Vite 将 `/api` 与 `/uploads` 代理到 `http://127.0.0.1:8765`。本地 HTTP 仅用于开发，App 连接要求可信 HTTPS。

```bash
npm run check:public
npm test
npm run test:server
npm run build
```

构建输出 `vps-dist`。CI 还执行全新 Docker 构建/启动、API 路由/演示数据/备份检查，以及 Flutter analyze、test 和预览 APK 构建。源码公共检查排除凭据、数据库、私人媒体与运行目录；它不能替代对新增内容的人工审阅。

备份脚本使用 SQLite 在线一致备份，同时保存上传与配置；更新脚本拒绝脏工作树、先备份、再快进更新，失败回退代码和镜像。数据时间点恢复是独立操作，见[运维说明](SELF_HOSTING.md)。

本版默认内置墨灵。全新安装默认名称、形象、人设、中文语态均为墨灵；后台仍可编辑墨灵名称、人设与语态。旧角色默认模板自动迁移，自写人设与 API Key 保留。需配置自己的 AI Key 并开启 AI 对话后才能调用服务。

管理员仍可选择自定义图片（PNG/JPEG/WebP/GIF/AVIF/SVG）或有授权的 Cubism 3/4 Live2D。网页后台与通用App填写本站资源路径或HTTPS地址；Live2D使用.model3.json入口且保持贴图、动作等相对路径完整。默认安装不加载Live2D运行库。自定义角色可以分别设置语态、人设与名称。
