# 我的站点管理 · Android

原生 Flutter 管理 App，连接自己的网站；不是网页后台套壳。当前 **1.4.0+12 / Android 7.0+**，应用 ID `org.memoryarchive.admin.secure`。

## ⬇ 直接下载安装

### [点击下载安卓 APK · 通用管理版](https://github.com/jack-114514/into-youth-archive/releases/latest/download/memory-archive-admin.apk)

[发行版与 SHA256SUMS](https://github.com/jack-114514/into-youth-archive/releases/tag/v3.2.1) · **[隐私政策](PRIVACY.md)** · [网站一键安装](../README.md)

安装 → 填 `https://自己的域名` → 验证连接 → 输入本站管理员邮箱/密码 → 在密码框下完成 Cloudflare 验证 → 点击安全登录。更新清单可先留空。登录页和后台工具栏都可打开“站点设置”，更换连接后重新登录。

只维护这一个通用客户端，不再发布固定站点专用包。发行包使用稳定签名，可覆盖之前的本地安全通用版 1.3.2/1.3.3；旧 GitHub 预览版 org.memoryarchive.admin 和旧专用版包名/签名不同，需安装新的通用版并重新连接自己的站点。无需删除服务器内容或用户资料。历史发行保留供回滚。私钥不进入源码或 GitHub。

## 功能覆盖

| 功能 | App 当前界面 |
| --- | --- |
| 连接自己的站点 | 校验 HTTPS origin 和 /api/health，保存连接；随时更换 |
| 登录 / 退出 | 本站管理员账号；自动刷新会话；退出清除本地令牌 |
| 仪表盘 | 媒体/留言/待处理投稿/访问数，以及数据库和存储状态 |
| 图片 / 视频 | 相册选择、手机端压缩、上传进度；编辑标题、附加文字、正文、日期、排序 |
| 媒体展示位置 | 首页、3D 粒子树、故事集显示开关；编辑或删除条目 |
| 留言管理 | 查看、显示/隐藏、删除 |
| 投稿审核 | 查看内容与联系信息；标记接受/拒绝、删除；接受不自动发布成故事 |
| 基础网站设置 | 网站名称、主标题、个人介绍、时间线 JSON |
| 账号安全 | 打开自己站点的网页流程，通过 Turnstile 与邮件验证码修改/恢复密码 |
| 更新与版本 | 查看版本和构建信息；手动检查自有更新清单，校验 APK 后交给系统安装 |
| 开发诊断 | 连点版本 7 次，查看 API 状态、延迟、会话、存储与操作摘要 |
| AI 助手与墨灵 | 原生编辑角色、人设、输出上限、模型、Key、帧率及互动开关 |
| 精细后台设置 | 首页裁剪/排版、开场、3D 参数、音乐、助手台词/预设/布局等使用网页 /admin |

图片采用 JPEG 压缩（quality 86、1920 尺寸参数），**保留 EXIF**；视频压缩为 720P并保留音轨，超过 18 MiB 会提示裁剪。不会修改或删除相册原文件。不要把压缩当作删除定位/拍摄信息的功能。

## 连接与会话

- 站点地址必须是完整 HTTPS origin，不含路径、账号、查询参数；应用不内置站长域名、账号或密码。
- 管理 API 为自己的 `/api/v1/admin-app`，管理请求不跟随重定向。
- 域名、可选更新清单和令牌使用系统安全存储；令牌按 origin 分组，登录密码不持久保存。
- 切换站点取消旧管理请求、清除旧站点本地令牌；远程会话仍按服务端有效期处理。
- 访问令牌 30 分钟、刷新令牌 30 天；收到过期响应时尝试轮换刷新，失效后重新登录。
- App 没有默认的原作者更新服务器。用户配置的媒体 URL 或更新下载 URL 可以指向其他 HTTPS 服务，详见[隐私政策](PRIVACY.md)。

## 技术与依赖

版本范围来自 [pubspec.yaml](pubspec.yaml)，锁定版本见 [pubspec.lock](pubspec.lock)。

| 技术 | 声明版本 | 用途 |
| --- | --- | --- |
| Flutter / Dart | 3.47.0 / SDK ^3.13.0 | 原生界面、Material 3 |
| flutter_riverpod | ^2.6.1 | 页面状态、异步资源、站点切换后的依赖重建 |
| Dio | ^5.11.0 | HTTPS / JSON、超时、上传进度、认证与令牌刷新 |
| flutter_secure_storage | 10.3.1 | Android 安全存储，保存连接和会话令牌 |
| image_picker | ^1.2.3 | 用户主动选择相册图片/视频 |
| flutter_image_compress | ^2.5.1 | 本机图片压缩 |
| video_compress | ^3.1.4 | 本机视频压缩 |
| path_provider | ^2.1.6 | 压缩/下载临时目录 |
| package_info_plus | ^10.2.1 | 应用版本与包信息 |
| crypto | ^3.0.7 | APK SHA-256 完整性校验 |
| url_launcher | ^6.3.2 | 外部浏览器打开账号安全或发布页 |
| open_filex | ^4.7.0 | 将已校验 APK 交给系统安装界面 |

构建使用 JDK 17、Android SDK 36；minSdk 24、targetSdk 36。源码包括 `lib/core/config`（连接）、`network`（API）、`security`（令牌）、`update`（更新），以及 `lib/features` 各管理页面。[网站后端技术](../docs/TECHNICAL.md)。

## 权限与数据

合并 APK 包含互联网、照片/视频/音频读取及旧版存储权限；部分由媒体依赖声明。当前界面主动选择图片/视频，没有音频库浏览或录音功能。是否弹出权限请求取决于 Android 版本及媒体处理路径。

当前包未声明定位、联系人、麦克风或摄像头权限；相册选择不需要直接拍摄。关闭 Android 自动备份和明文网络。没有广告、统计上报或崩溃收集 SDK。[隐私政策](PRIVACY.md)列明本机存储、上传、第三方请求、删除和备份行为。

## 自有更新（可选）

“站点设置”的更新清单须与站点同一 HTTPS origin，如 `https://photos.example.com/app/update.json`。留空不发起更新清单请求；当前 UI 点击“检查更新”才执行检查。

默认安装不会替你生成更新清单或 APK 静态目录。自行托管并配置 Caddy 静态路径，或修改构建时的 public 目录后部署。清单示例：

```json
{
  "version": "1.4.0",
  "versionCode": 12,
  "packageName": "org.memoryarchive.admin.secure",
  "apkUrl": "https://photos.example.com/app/admin-1.4.0.apk",
  "sha256": "填写该APK实际计算出的64位小写SHA256",
  "gitCommit": "自己的构建提交",
  "notes": "此次更新内容"
}
```

清单字段见 [update_service.dart](lib/core/update/update_service.dart)。APK 下载地址必须 HTTPS，可与清单不同域；SHA-256 不匹配会拒绝安装。摘要验证文件完整性，安装包来源仍由你的清单与签名决定。每次更新提高 versionCode，并保持同一正式签名；不会静默安装。

## 开发与测试

在本目录执行：

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

输出 `build/app/outputs/flutter-apk/app-debug.apk`。CI 工件为 `memory-archive-admin-preview`。不需要 `API_BASE_URL` 或域名 dart-define；域名首次启动输入。可选 `GIT_COMMIT`、`BUILD_TIME`、`BUILD_TYPE` 只描述构建。

## 正式签名与发布

先生成并妥善保存自己的 keystore，在忽略的 `android/key.properties` 写入：

```properties
storeFile=/absolute/path/to/your-own-keystore.jks
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=YOUR_OWN_ALIAS
keyPassword=YOUR_PRIVATE_PASSWORD
```

```bash
flutter build apk --release
```

构建会要求自己的签名配置，不自动借用原作者私钥。可通过 Gradle `applicationId` 属性更改应用 ID；修改 namespace 时要同步 Kotlin 包与 MainActivity。

不要提交 keystore、key.properties、local.properties 或真实站点配置。正式签名丢失将无法覆盖更新已安装的同一应用。[Flutter 官方 Android 发布说明](https://docs.flutter.dev/deployment/android)。对外分发改版时，同步更新品牌、版本、运营者联系方式与隐私政策。

## 1.3.1+6

系统设置 → AI 助手与墨灵，原生编辑角色、人设、说话风格、500–10000输出上限、模型、新 API Key、动画帧率及互动开关。需要服务端 v3.2.1；旧站点先按更新流程更新。Key 仅发送到你选定的 HTTPS 站点，服务端只回传掩码；成功保存后新Key输入立即清空，不写本机存储。页面不向 AI 服务发测试聊天。其余台词、预设与布局参数保留。角色动画显示在电脑网页，不在管理App内运行。

本版默认内置墨灵。全新安装默认名称、形象、人设、中文语态均为墨灵；后台仍可编辑墨灵名称、人设与语态。旧角色默认模板自动迁移，自写人设与 API Key 保留。需配置自己的 AI Key 并开启 AI 对话后才能调用服务。

管理员仍可选择自定义图片（PNG/JPEG/WebP/GIF/AVIF/SVG）或有授权的 Cubism 3/4 Live2D。网页后台与通用App填写本站资源路径或HTTPS地址；Live2D使用.model3.json入口且保持贴图、动作等相对路径完整。默认安装不加载Live2D运行库。自定义角色可以分别设置语态、人设与名称。

## 登录人机验证（1.4.0）

验证框直接嵌在登录表单里，不跳转独立页面或外部浏览器。只有本站服务端 Siteverify 确认通过，App 才启用安全登录；键盘提交也遵守同一限制。许可绑定站点和本次 App 会话，仅允许一次密码尝试。输错密码、许可过期、切换站点后重新验证。WebView 保留默认 User Agent、DOM storage 和 Cookie，允许 Cloudflare 的 about:blank/about:srcdoc 内部框架；不加载任意外部顶层页面，不关闭 TLS 校验。失败显示错误码并可原地重试。

自己的服务器须同步升级到 v3.3.0 并配置自己的 TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY、TURNSTILE_ALLOWED_HOSTNAMES。缺少配置会拒绝原生密码登录，不降级跳过验证。Cloudflare 或 Android System WebView 的可用性仍取决于设备和网络。
