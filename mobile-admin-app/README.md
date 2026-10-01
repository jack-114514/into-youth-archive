# 我的站点管理 · Android

Flutter 原生单管理员后台。连接自己的 VPS，管理媒体、首页、网站设置、评论和投稿。应用 ID 默认 org.memoryarchive.admin，不与原来的固定站点 App 共用账号、站点配置或安装包身份。

## 使用

首次启动输入 https://自己的域名，程序验证 /api/health 后保存到系统安全存储。自己的后台邮箱/密码用于登录。登录页面和后台工具栏都有“站点设置”；保存连接会退出当前账号。访问令牌按站点 origin 隔离，切换时清除旧令牌并取消旧站点的请求，不接受 HTTP 或跨域重定向。

更新清单地址可选，必须在所选站点的同一 HTTPS origin 下；留空不会检查任何原作者的更新服务器。要启用自己的更新，可将清单和 APK 放在自己的静态目录 /app，字段见 lib/core/update/update_service.dart：version、versionCode、apkUrl、sha256、gitCommit、notes；APK 的 SHA-256 必须匹配，长期升级使用自己的稳定签名。

## 构建

使用 Flutter 3.47.0 / Dart 3.13、JDK17、Android SDK36。运行：

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

不需要任何 API_BASE_URL 或域名 dart-define。域名在 App 首次使用时输入。可选元数据 GIT_COMMIT、BUILD_TIME、BUILD_TYPE 只描述构建。测试包输出 build/app/outputs/flutter-apk/app-debug.apk，CI 工件名称 memory-archive-admin-preview。

生产 release 需要自己的签名私钥；生成并保存你自己的 keystore，把下面属性写到忽略的 android/key.properties：

```properties
storeFile=/absolute/path/to/your-own-keystore.jks
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=YOUR_OWN_ALIAS
keyPassword=YOUR_PRIVATE_PASSWORD
```

然后 flutter build apk --release。可以用 Gradle 的 applicationId 属性修改应用 ID；namespace/Kotlin 包名与 MainActivity 须保持匹配。不要上传 keystore、key.properties、local.properties、构建缓存或真实域名配置。签名丢失将无法更新已安装的正式 App。

GitHub 发布的 preview APK 是测试签名，不使用原作者的 release 私钥；不同构建的测试密钥可能不同。所有管理接口通过自己的 /api/v1/admin-app 工作。应用不内置任何站长的地址、邮箱或密码。构建/签名参考 [Flutter 官方 Android 发布说明](https://docs.flutter.dev/deployment/android)。
