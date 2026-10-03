# 新手安装与配置

[返回项目首页](../README.md) · [直接下载安卓 APK](https://github.com/jack-114514/into-youth-archive/releases/latest/download/memory-archive-admin.apk)

目标：在自己的 VPS 安装同一套页面、动画和管理功能，再换成自己的内容。新站使用演示插画，不带原作者的私人照片和数据库。

## 1. 准备

| 要准备的 | 怎么选 / 怎么填 |
| --- | --- |
| VPS（你的云服务器） | Debian / Ubuntu；建议 2 核、2 GB；能访问 GitHub、npm、Docker 镜像源 |
| 自己的域名 | 如 `photos.example.com`；由你控制 DNS |
| 自己的邮箱 | 证书联系邮箱、后台登录邮箱；可用同一邮箱 |

自动安装适用于 Ubuntu 22.04/24.04、Debian 12/13。安全组/防火墙放行 80、443，确保未被其他服务占用。已有网站占用端口时，先安排反向代理或使用另一台 VPS。

## 2. 域名指向自己的 VPS

在自己的域名服务商或 Cloudflare 控制台添加：

| DNS 字段 | 内容 |
| --- | --- |
| 类型 | A |
| 名称 | 子域名填 `photos`；根域名填 `@` |
| 目标地址 | 自己的 VPS IPv4 |
| Cloudflare 代理 | 初次安装选择 **DNS only / 仅 DNS** |

没有可用 IPv6 时不要添加 AAAA。等 DNS 生效；Caddy 会自动申请和续期 HTTPS 证书。

## 3. 登录 VPS，复制安装命令

Windows 可打开终端或 PowerShell，先用 SSH 登录自己的服务器。把占位文字换成自己的地址；密码在登录提示处输入：

```bash
ssh root@你的VPS地址
```

**看到 VPS 的 Linux 命令提示符后**，复制整行执行：

```bash
curl -fsSL https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh -o /tmp/memory-archive-install.sh && bash /tmp/memory-archive-install.sh
```

上面的命令供 root 登录后执行。普通账号需把最后的 `bash` 改为 `sudo bash`，并具备 sudo 权限。

脚本下载源码、补齐 Git/Python 等工具，在缺少 Docker 时安装官方 Docker Engine，交互生成配置，再构建并启动网站。已有 Docker 必须支持 Compose v2。默认目录 `/opt/memory-archive`，首次构建需等待依赖和镜像下载。

想先检查可[点击查看安装脚本](https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh)，或执行前运行 `less /tmp/memory-archive-install.sh`。

## 4. 按提示填写自己的配置

| 提示 | 填写方法 |
| --- | --- |
| 自己的域名 | `photos.example.com`；不加 `https://`、端口或路径 |
| 证书联系邮箱 | 自己的有效邮箱 |
| 管理员登录及恢复邮箱 | 自己的邮箱，之后用于网页后台和安卓登录 |
| 管理员密码 | 至少 12 位；建议自己填写并保存到密码管理器 |
| Turnstile Site Key / Secret Key | 可先都留空；邮箱恢复需要自己的一对密钥 |
| SMTP 服务器 | 可先留空；填写后会继续询问端口、加密方式、账号、授权码、发件邮箱 |

密码留空会生成随机值，只写入服务器本地 `.env`，不会显示在安装日志。可在服务器本地用编辑器查看，勿截图或上传：

```bash
sudo nano /opt/memory-archive/.env
```

`ADMIN_PASSWORD` 只用于首次建立管理员；之后改此值不会重设已有账号密码。邮箱恢复需要完整配置自己的 Turnstile 和 SMTP。

## 5. 打开网站，换成自己的内容

- 访客网站：`https://你的域名`
- 网页管理：`https://你的域名/admin`
- 3D 粒子树：`https://你的域名/memory`

登录后台，依次修改：

1. 网站名称、Logo、主标题、简介、联系方式。
2. 删除不需要的示例，上传自己的图片/视频，选择首页 / 3D / 故事集显示开关。
3. 编辑时间线、关于页、随手记和栏目文案。
4. 调整开场、3D、音乐和桌宠。

[完整功能纯文本清单](网站功能详情.txt)列出可编辑项。示例只在全新数据库初始化时生成，删除示例后重启/更新不会重新填充。数据保存在自己的独立数据库和上传卷。

## 6. 手机管理（可选）

[**点这里直接下载安卓 APK**](https://github.com/jack-114514/into-youth-archive/releases/latest/download/memory-archive-admin.apk)。

安装预览包 → 填 `https://自己的域名` → 验证连接 → 用本站管理员邮箱/密码登录。“站点设置”可更换域名，保存后重新登录。

支持 Android 7.0+。预览包使用测试签名；长期分发请自行签名构建。[安卓功能与构建](../mobile-admin-app/README.md) · [隐私政策](../mobile-admin-app/PRIVACY.md)。

## 7. 自己的 Cloudflare / 邮箱恢复（可选）

DNS 把域名指向服务器；Turnstile 为密码恢复做真人验证。项目不需要 Cloudflare API Token。

1. 源站 HTTPS 正常后，可开启 Cloudflare 代理，SSL/TLS 选 **Full (strict)**。
2. 自己创建 Turnstile widget，允许 hostname 填自己的域名，取得 Site Key / Secret Key。
3. 在自己的邮件服务获取 SMTP 服务器、端口、账号、授权码。465 通常用 `ssl`，587 通常用 `starttls`，以服务商设置为准。
4. VPS 执行：

```bash
cd /opt/memory-archive
sudo bash scripts/reconfigure.sh
```

填自己的密钥/SMTP。脚本先备份，再保存配置、重建容器、检查健康；失败恢复原配置。换域名前先改 DNS 与 Turnstile 允许域名。回车保留已有值；需清空可选配置时，先备份后手工编辑 `.env` 并按运维说明重建。

桌宠 AI 在网页后台填写自己的 DeepSeek Key，默认关闭；模型与动画无需 AI。

## 8. 备份和更新

```bash
cd /opt/memory-archive
sudo bash scripts/backup.sh
```

备份写入 `backups/时间戳`：数据库一致快照、上传文件、配置与代码版本。另存站外；包含密码和私人内容，不能传到公开 GitHub。

```bash
cd /opt/memory-archive
sudo bash scripts/update.sh
```

更新自己的 `origin/main`，保留数据库、上传及已有密码；失败回退代码和镜像。数据库时间点恢复另按[运维说明](SELF_HOSTING.md)操作。**不要执行 `docker compose down -v`，它会删除数据卷。**

## 用自己的 GitHub 仓库

在 GitHub 点 Fork 创建副本，VPS 克隆自己的仓库再安装：

```bash
git clone https://github.com/你的账号/你的仓库.git
cd 你的仓库
sudo bash install.sh
```

此时安装和维护目录为自己克隆的目录，更新跟随自己的 `origin/main`。源码出处与许可保留，运行的账号、内容、云服务和数据均属于自己的安装。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `curl: command not found` | root 先执行 `apt-get update && apt-get install -y curl`，再复制安装命令；普通用户加 sudo |
| `sudo: command not found` | root 下用 `bash /tmp/memory-archive-install.sh`；普通用户需管理员配置 sudo |
| 提示目录存在 / 已配置 | 安装器停止以避免覆盖；已有站点用 update.sh 或 reconfigure.sh |
| 没有 Compose v2 | 按 [Docker 官方说明](https://docs.docker.com/compose/install/linux/)补装插件，确认 `docker compose version` 可用 |
| 安装通过但域名打不开 | 核对 DNS、80/443、安全组；容器健康不等于公共 DNS 生效 |
| 证书错误 / 代理跳转循环 | 初次用 DNS only；源站 HTTPS 正常后开代理并用 Full (strict) |
| 无法恢复密码 | 核对 Turnstile 两个密钥/允许域名、SMTP、管理员收件邮箱 |
| 上传太大 | 后端请求上限 18 MiB；安卓压缩图片/视频，大视频需先裁剪 |
| APK 无法覆盖安装 | 测试签名可能变更；卸载旧测试包再装，正式包保持自己的签名 |
| 想改已有密码 | 使用网页账号管理/邮件验证流程，改 `.env` 不是密码重置 |

在安装目录排查：

```bash
cd /opt/memory-archive
sudo docker compose ps
sudo docker compose logs --tail=80 backend web
sudo python3 scripts/health.py
```

分享日志前隐藏私人信息，勿分享 `.env` 或数据库。
