# v3.6.0 · 安卓通用管理 App 1.8.0+20

照片上传或更换后保存时，网页与安卓接口自动生成最长边720px、保持比例的WebP预览；无须再手动设置缩略图。列表使用预览，原上传图片保留用于查看；已有自定义取景继续优先使用。启动时补齐本站历史照片缺失的预览；MPO手机JPEG取首帧，动画GIF与不支持的格式保持原样。Docker后端包含Pillow依赖，非Docker用户需安装python3-pil或requirements.txt。

随手记现在是可用的文字记录栏目：网页和安卓可以新增草稿、发布、编辑、归档及恢复，访客只阅读已发布内容，按日期倒序并保留换行。栏目标题/介绍仍独立编辑；不是访客留言板。两端共享数据及验证，使用各自管理员会话，归档保留内容。

校园页面只挂载当前栏目，避免隐藏栏目同时加载图片和动画。安卓列表使用缩略图，更换原图自动刷新配对。保留既有登录、双来源更新、栏目菜单与安全令牌流程。

正式APK：memory-archive-admin-v1.8.0.apk，versionCode20，org.memoryarchive.admin.secure，沿用稳定签名。网页与安卓功能测试、源码审计、构建及发布CI结果见本次提交；未连接安卓真机，不宣称真机帧率或兼容性验收。

English: Website v3.6.0 and Android 1.8.0+20 add automatic 720px WebP photo previews and a shared journal workflow. Existing custom crops and uploaded originals are preserved, missing historical previews are backfilled, and changed photos receive a new matching preview. Both admin interfaces support drafts, publishing, editing, archiving and restoring entries; visitors see published entries only. Campus routes no longer mount other hidden sections. Existing login and GitHub/server update flows remain. Install Pillow for non-Docker deployments; the Docker image includes it. No physical Android device was connected for verification.
