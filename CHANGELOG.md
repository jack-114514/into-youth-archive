# 更新记录 / Changelog

## v3.7.0 · 安装体验、实时资源状态与 AI 恢复

发布日期：2026-10-23。网站默认正式版：v3.7.0；默认分支：main。安卓通用客户端：1.8.0+20，稳定签名与现有下载继续使用。

本版汇总 v3.6.0 后续已经完成的安装与运行更新：新装业务内容全部从零开始，中英文基础/高级安装引导，真实进度与阶段日志，低内存辅助内存提示，APT 锁等待，失败后继续安装。保留自动 WebP 缩略图、随手记草稿/发布/归档、3D 粒子树及墨灵助手。

网页后台状态页新增 CPU 使用率、逻辑核心、1/5/15 分钟负载，以及网络下行/上行速率和累计流量。目标每 0.5 秒采样，当前请求未结束时跳过重复请求，隐藏窗口暂停，返回状态页时立即检查。实际刷新受网络影响。Linux 容器只显示可见环境的系统/网卡数据；首次采样或不支持的平台允许显示采样中/不可用，累计流量会随网卡重置。不提供未经配置的套餐带宽占用百分比。

AI 连接失败、超时、临时 500/502/503/504 最多追加一次请求，仍遵守 55 秒预算及访客限制。网络重试保留 JSON 契约；只有格式异常才切换普通正文。认证、余额与服务商限频错误不自动重试。诊断日志仅记录安全分类与耗时。

新安装使用自己的管理员账号、域名和凭据，业务数据初始为空。更新已有站点不会自动删除媒体或其他已有内容。更新前运行备份并使用 scripts/update.sh，保留真实 .env、数据库和上传卷；失败时按更新脚本回退代码与镜像，数据恢复是单独操作。

安卓本次没有升级或重新签名，继续使用 1.8.0+20；新增实时资源卡片位于网页后台。正式 APK 的 SHA256 为 91a68ce0bd2f0cc52fa4f7603335e5f73ac03249bce2630cfc74d4f35ecd3c34。源码、依赖许可证及原创素材署名保留。本版不宣称完成所有已知安全加固或安卓真机验收。

English: v3.7.0 is the current stable website release on main. It consolidates the bilingual installer, APT-lock recovery, resume/log access and empty fresh installations, and adds web CPU/load/network monitoring with non-overlapping 0.5-second target polling. Containers report their visible environment, not a provider bandwidth plan. AI transport and temporary upstream failures get at most one retry within the existing 55-second budget, while authentication, balance and upstream quota errors are not retried. Back up before updating; existing content, environment and uploads remain. Android stays at stable signed 1.8.0+20; the new monitoring cards are web features. Existing photo previews, journal workflows and Moling remain available.

## v3.6.0 · 2026-10-06

自动 WebP 缩略图、随手记管理与 Android 1.8.0+20。后续安装修复归入 v3.7.0。历史发行与下载保留在 GitHub Releases。
