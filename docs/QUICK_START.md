# 新手安装与配置

[返回项目首页](../README.md) · [直接下载安卓 APK](https://github.com/jack-114514/into-youth-archive/releases/download/v3.6.0/memory-archive-admin-v1.8.0.apk)

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
curl -fL --progress-bar --retry 3 --connect-timeout 20 https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh -o /tmp/memory-archive-install.sh && bash /tmp/memory-archive-install.sh
```

上面的命令供 root 登录后执行。普通账号需把最后的 `bash` 改为 `sudo bash`，并具备 sudo 权限。

脚本下载源码、补齐 Git/Python 等工具，在缺少 Docker 时安装官方 Docker Engine，交互生成配置，再构建并启动网站。已有 Docker 必须支持 Compose v2。默认目录 `/opt/memory-archive`，首次构建需等待依赖和镜像下载。

想先检查可[点击查看安装脚本](https://raw.githubusercontent.com/jack-114514/into-youth-archive/main/install.sh)，或执行前运行 `less /tmp/memory-archive-install.sh`。

## 4. 只填写域名和邮箱，其余可直接回车

语言选项直接回车为**简体中文**，输入 `2` 为 English。默认使用基础设置，验证码与邮件服务参数不会展开。提示均标明默认值；填错域名、邮箱或密码长度会就地重填。

| 提示 | 填写方法 |
| --- | --- |
| 自己的域名 | `photos.example.com`；不加 `https://`、端口或路径 |
| 你的邮箱 | 必填；同时用于网页/安卓后台登录和证书通知 |
| 后台密码 | 回车自动生成；自己填写时需至少 12 位，输入不显示 |
| 配置方式 | 回车为基础设置；输入 `2` 才进入高级设置 |
| 是否增加辅助内存 | 仅内存不足时询问；回车同意使用所示磁盘空间，输入 `n` 停止安装 |

安装成功后会在**当前终端**显示网站、后台地址和初始账号密码。密码写入本地 `.env`，直接写入终端而不进入重定向日志；终端历史/录屏仍可能记录，请妥善保存。需要再次查看时在服务器终端运行：

```bash
cd /opt/memory-archive
sudo python3 scripts/show_login.py
```

`ADMIN_PASSWORD` 只用于首次建立管理员；之后改此值不会重设已有账号密码。邮箱恢复需要完整配置自己的 Turnstile 和 SMTP。

安装分为8个阶段，显示当前任务与已用时间；源码接收、具有总量的镜像层下载显示真实进度条。编译、依赖安装等没有可靠总量时持续刷新状态，不显示虚假的整体百分比。底层工具的原始日志保存在提示的本机日志目录。

新装服务器可能同时在自动更新系统软件。安装器遇到软件安装锁时会显示中文等待提示，最多等待5分钟，并在锁释放后继续；不会删除锁文件或中断其他系统任务。等待超时可稍后用 `bash install.sh --resume` 继续。

查看最近一步的详细日志无需抄写长文件名，在安装目录运行：

```bash
python3 scripts/install_log.py
```

约1GB内存的服务器可能在网页编译时被系统终止。安装器会检查可用内存和交换空间，必要时询问是否准备辅助内存；回车同意后创建专用交换文件，并在磁盘不足或服务器不支持时给出提示。交换文件保留供下次复用，不修改开机配置，重启后不自动启用。仍建议至少2GB物理内存；交换空间不能保证编译速度。

安装中断时，修复提示的问题后继续，不要删除站点目录或数据卷：

```bash
cd /opt/memory-archive
sudo bash install.sh --resume
```

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

[**点这里直接下载安卓 APK**](https://github.com/jack-114514/into-youth-archive/releases/download/v3.6.0/memory-archive-admin-v1.8.0.apk)。

安装正式通用版 → 填 `https://自己的域名` → 验证连接 → 用本站管理员邮箱/密码登录。“站点设置”可更换域名，保存后重新登录。

支持 Android 7.0+。正式下载为稳定签名通用版 1.8.0+20；下载文件名包含版本号，之前相同包名/签名的安全通用版可覆盖升级。[安卓功能与构建](../mobile-admin-app/README.md) · [隐私政策](../mobile-admin-app/PRIVACY.md)。

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

选择 `2 高级设置`，再对需要配置的项目输入 `y`。真人验证的公开/私密密钥分别对应 Cloudflare 的 Site Key / Secret Key；邮件服务器地址类似 `smtp.example.com`，不能填自己的邮箱。授权码通常需要在邮箱服务商处单独获取。

高级设置还提供独立后台邮箱、示例内容/空白站点、网站访问端口；初始内容只在首次建库时生效，不会删除已有内容。邮件加密通过数字选择，465默认选择直接加密连接，587默认选择连接后加密，以邮件服务商要求为准。自定义端口需要配置相应反向代理，保证公网80/443能到达本站以完成证书验证。

脚本先备份，再保存配置、重建容器、检查健康；失败恢复原配置。换域名前先改 DNS 与 Turnstile 允许域名。基础模式、跳过可选项目和回车均保留已有高级配置；需清空时，先备份后手工编辑 `.env` 并按运维说明重建。英文重配可用 `sudo env INSTALL_LANG=en bash scripts/reconfigure.sh`。

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
| 编译时 `Killed` / `exit code: 137` | 表示进程被强制终止，常见原因是内存不足；核查系统日志确认，准备辅助内存或升级内存后用 `install.sh --resume` 继续 |
| `Could not get lock` / `Unable to acquire the dpkg frontend lock` | 系统有其他软件安装/更新任务；安装器会等待，超时后稍后继续。不要删除锁文件；用 `python3 scripts/install_log.py` 查看详情 |
| 后端提示 `app.py: Permission denied` | 更新源码中的Dockerfile后运行 `bash install.sh --resume`；镜像构建会设置程序源码读取权限，不需要放宽真实.env的权限 |
| 一段时间没有百分比变化 | 查看中文状态与已用时间；编译没有可靠百分比，日志路径在安装提示中。网络慢需检查服务器到 GitHub/依赖源/镜像源的连接 |
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

### 连续错误后的验证策略（1.4.1）

服务端持久保存本站原生管理员登录计数；前两次密码尝试无需验证，连续两次错误后第三次及后续尝试须通过 Cloudflare。修改用户名、切换网络、重开或重装 App 不能重置服务端计数。正确登录清除计数；连续30分钟无新的密码尝试后计数到期。并发请求原子预留前两次机会，避免并行绕过。网站后台计数独立，原有限流保持有效。验证仍在密码框下完成，每个许可只允许一次密码尝试。自己的后端需升级到 v3.3.1；连接旧后端仍按旧规则要求每次验证。
