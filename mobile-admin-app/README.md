# INTO Youth Admin

原生 Flutter 单管理员后台 App。它通过 HTTPS API 管理网站内容，不使用 WebView 承载后台页面。

## 当前范围

- 单管理员登录与安全令牌续期
- Dashboard、内容、媒体、评论、投稿和网站设置
- 从手机图库选择并上传图片或短视频
- App 版本检查、APK SHA-256 校验与 GitHub Release 备用下载
- 隐藏式开发者模式，仅展示脱敏后的运行信息

多管理员、角色和权限矩阵不在第一版范围内，后续以兼容补丁添加。

## 配置边界

仓库不得包含真实域名、管理员密码、SMTP 凭据、Turnstile Secret、数据库、上传内容、签名私钥或线上评论。运行地址使用 `--dart-define` 注入：

```powershell
flutter run `
  --dart-define=API_BASE_URL=https://example.com/api/v1/admin-app `
  --dart-define=UPDATE_MANIFEST_URL=https://example.com/app/version.json `
  --dart-define=GITHUB_RELEASES_URL=https://github.com/example/repository/releases
```

Release 签名文件只保存在构建机，通过 `android/key.properties` 引用；该文件和密钥文件均已忽略。

## 回滚边界

本目录是新增且独立的 App 工程。删除本目录即可撤销 App 本地源码；服务端 API 使用独立 `/api/v1/admin-app` 命名空间，不替换现有网站接口。

## 差分更新

从 `v1.0.3` 起，App 支持读取 `version.json` 中可选的 `patches` 数组。命中当前
Version Code 时优先下载差分包，在设备本地重建完整签名 APK。安装前依次校验旧
APK、差分包、目标 APK 的 SHA-256，以及目标包名、Version Code 和签名证书；任何
一步失败都会自动回退到完整 APK。

使用仓库内仅依赖 Python 标准库的工具生成差分包：

```powershell
python tool/generate_delta_patch.py old.apk new.apk update.iydpatch
```

差分更新只减少网络下载量。Android 最终仍通过系统安装器安装重建后的完整 APK，
不会绕过系统安全机制。
