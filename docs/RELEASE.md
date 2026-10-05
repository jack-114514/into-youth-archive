# v3.5.1 · 安卓通用管理 App 1.7.1+19

点击检查更新后可选择“从GitHub获取更新”或“从服务器获取更新”，最下面可前往GitHub开源仓库。服务器地址自动从已连接站点生成，旧空配置自动可用；普通用户无需手填APK更新清单。GitHub读取指定仓库正式发行与匹配的安卓附件。两种选择仅访问所选来源，失败不误报最新、不切换到另一来源。自定义同源更新地址在高级设置中保留。

检查包名、有效版本、HTTPS下载地址及SHA256；GitHub还核对发行APK资产摘要，拒绝错误应用、预发布和不安全跳转。更新请求不发送本站账号、密码或会话令牌，选择框打开或取消不查询版本。下载校验后需Android系统确认安装。保留1.7.0图片配对、排版、原有菜单与管理功能。

正式APK为memory-archive-admin-v1.7.1.apk，versionCode19，包名org.memoryarchive.admin.secure，保留稳定签名。旧1.6.1/1.7.0需要先覆盖安装本版一次，之后无需配置更新地址。中文/English说明与隐私政策同步。

English: Check for updates now offers GitHub or the current server, with an open-source repository link below. The server URL is derived automatically; existing blank settings work without manual configuration. GitHub reads the stable release and validates the matching Android asset. Only the selected source is queried, without site credentials. Package, HTTPS URL and SHA256 checks remain. Older clients need one initial upgrade to 1.7.1+19 to gain this flow. Includes previous layout fixes.

验证：68项完整Flutter回归和静态分析通过；实际更新代码匿名读取公网服务器与GitHub正式Release附件通过，无账号令牌。正式签名、发布CI与整包下载结果见公开提交及本地发布记录。未连接安卓真机。
