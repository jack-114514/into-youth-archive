# v3.5.0 · 安卓通用管理 App 1.7.0+18

修复栏目图片与取景/比例/显示/排序控件分散的问题：每张图片与对应操作同一卡片；首页背景与主视觉、开场桌面与手机图的参数在各自图片下方。重复栏目顺序规范化，保留已有有效顺序。

检查并改进应用排版：设置按用途分组；桌宠保存与结果提示固定底部；媒体窄屏改用上下布局、编辑先呈现标题/资源；卡片间距、浮动标签、错误/帮助文本、宽屏限宽和诊断长文本统一处理。菜单、同源数据、安全登录和1.6.1更新检查修复保持。

正式稳定签名APK：memory-archive-admin-v1.7.0.apk，versionCode18，包名org.memoryarchive.admin.secure。可覆盖相同包名/签名的通用管理版。中文/English README和下载入口同步本版。

验证：58项Flutter功能与布局回归、静态分析；12类原生页面演示数据截图检查。安卓真机未连接，不能替代各机型的系统相册/安装与Cloudflare验收。公开CI结果见提交。

English: Each image now shares a card with its own framing, aspect ratio, visibility and ordering controls. Opening-image settings stay beside their respective desktop/mobile images. Forms, media layouts, save/status feedback, spacing and diagnostic text have been reviewed. Includes all existing menu, feature and update improvements. Stable Android APK 1.7.0+18; 58 Flutter tests passed. UI captures use demo data, with no Android device connected.
