#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ -z ${INSTALL_LANG:-} ]]; then
  printf '\n请选择安装语言 / Choose installation language\n1. 简体中文（默认，直接回车）\n2. English\n'
  while true; do
    read -r -p '选择 / Choose [1]: ' language || language=1
    case "$language" in ''|1|zh) INSTALL_LANG=zh; break;; 2|en) INSTALL_LANG=en; break;; *) echo '请输入 1 或 2 / Enter 1 or 2';; esac
  done
fi
case "$INSTALL_LANG" in zh|en) ;; *) INSTALL_LANG=zh;; esac
export INSTALL_LANG
say() { if [[ $INSTALL_LANG == en ]]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
if [[ ${EUID} -ne 0 ]]; then
  say '请使用 sudo bash install.sh 安装到自己的 VPS。' 'Run sudo bash install.sh on your VPS.' >&2; exit 1
fi
if [[ ! -r /etc/os-release ]]; then say '需要 Debian/Ubuntu Linux。' 'Debian/Ubuntu Linux is required.' >&2; exit 1; fi
source /etc/os-release
case "$ID" in debian|ubuntu) ;; *) say '自动安装支持 Debian / Ubuntu；其他系统请按 README 使用 Docker Compose。' 'Automatic installation supports Debian/Ubuntu. For other systems see README.' >&2; exit 1;; esac
INSTALL_LOG_DIR=${INSTALL_LOG_DIR:-$(mktemp -d /tmp/memory-archive-install.XXXXXX)}
mkdir -p -- "$INSTALL_LOG_DIR"
export INSTALL_LOG_DIR
# Source download happens before the Python UI helper is available.
bootstrap() {
  local title=$1; shift
  local log started=$SECONDS pid status percent filled empty progress
  log=$(mktemp "$INSTALL_LOG_DIR/bootstrap.XXXXXX.log")
  printf '%s\n' "$title"
  "$@" >"$log" 2>&1 & pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    percent=$(tail -c 12000 "$log" | tr '\r' '\n' | sed -n 's/.*Receiving objects: *\([0-9]*\)%.*/\1/p' | tail -1)
    if [[ -n $percent ]]; then
      printf -v filled '%*s' "$((percent/5))" ''; filled=${filled// /#}
      printf -v empty '%*s' "$((20-percent/5))" ''; empty=${empty// /-}
      progress="[$filled$empty] ${percent}%"
      say "  接收源码 $progress | 已用 $((SECONDS-started)) 秒" "  Receiving source $progress | Elapsed $((SECONDS-started))s"
    else
      say "  正在处理 | 已用 $((SECONDS-started)) 秒（暂时无法计算百分比）" "  Working | Elapsed $((SECONDS-started))s (percentage unavailable)"
    fi
    sleep 2
  done
  if wait "$pid"; then status=0; else status=$?; fi
  if ((status)); then
    say "此步骤失败，详细日志：$log" "Step failed. Detailed log: $log" >&2
    return "$status"
  fi
  say "  完成，用时 $((SECONDS-started)) 秒" "  Done in $((SECONDS-started))s"
}
repo=${REPOSITORY_URL:-https://github.com/jack-114514/into-youth-archive.git}
destination=${INSTALL_DIR:-/opt/memory-archive}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
say '安装包含8个阶段；阶段编号不是下载百分比。网络速度取决于服务器线路，完整工具日志将保存在本机。' 'Installation has 8 stages; stage numbers are not download percentages. Speed depends on your network. Tool logs stay on this server.'
say "日志目录：$INSTALL_LOG_DIR" "Log directory: $INSTALL_LOG_DIR"
if ! command -v git >/dev/null || ! command -v curl >/dev/null || ! command -v python3 >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  bootstrap "$(say '[1/8] 准备系统工具' '[1/8] Preparing system tools')" apt-get update
  bootstrap "$(say '[1/8] 安装系统工具' '[1/8] Installing system tools')" apt-get install -y git curl python3 ca-certificates
else
  say '[1/8] 系统工具已就绪' '[1/8] System tools ready'
fi
if [[ ! -f "$script_dir/compose.yaml" ]]; then
  if [[ -e "$destination" ]]; then
    say "目标目录已存在，已停止以保护已有文件。如果上次安装中断，请进入 $destination 运行 bash install.sh --resume；已有站点使用 scripts/update.sh。" "Destination exists; stopped to preserve files. For an interrupted install, enter $destination and run bash install.sh --resume. Use scripts/update.sh for an existing site." >&2; exit 1
  fi
  [[ "$repo" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || { say '仓库地址须为 GitHub HTTPS 地址。' 'Repository must use a GitHub HTTPS URL.' >&2; exit 1; }
  bootstrap "$(say '[2/8] 下载网站源码（只下载当前版本，显示真实接收进度）' '[2/8] Downloading source (current version only, real receive progress)')" git clone --depth 1 --single-branch --progress -- "$repo" "$destination"
  exec bash "$destination/install.sh" "$@"
fi
cd -- "$script_dir"
trap 'say "安装已停止，已有文件和配置均保留。排查后进入 $script_dir 运行 bash install.sh --resume 继续。" "Installation stopped; files and configuration retained. After resolving the error, enter $script_dir and run bash install.sh --resume." >&2' ERR
say '[2/8] 网站源码已就绪' '[2/8] Source ready'
if [[ -f .env && ( ${1:-} != --resume || -f .install-complete ) ]]; then
  say '已有配置。中断安装可运行 bash install.sh --resume 继续；已完成的网站用 bash scripts/update.sh 更新，用 bash scripts/reconfigure.sh 改配置。' 'Configuration exists. Resume an interrupted install with bash install.sh --resume. For an installed site use scripts/update.sh or scripts/reconfigure.sh.' >&2; exit 1
fi
stage() { local zh=$1 en=$2; shift 2; python3 scripts/install_ui.py --title "$(say "$zh" "$en")" -- "$@"; }
say '[3/8] 填写必要信息（其他选项可直接回车）' '[3/8] Required details (Enter accepts other defaults)'
if [[ -f .env ]]; then
  say '继续上次安装，保留已有配置和数据。' 'Resuming with existing configuration and data.'
else
  python3 scripts/configure.py
fi
say '[4/8] 检查编译所需内存' '[4/8] Checking build memory'
python3 scripts/install_memory.py
if ! command -v docker >/dev/null; then
  docker_setup=$(mktemp)
  stage '[5/8] 下载容器工具安装程序（Docker 官方）' '[5/8] Downloading official Docker installer' curl --fail --show-error --location --retry 3 --connect-timeout 20 https://get.docker.com -o "$docker_setup"
  stage '[5/8] 安装容器工具（Docker）' '[5/8] Installing Docker' sh "$docker_setup"
else
  say '[5/8] 容器工具已安装' '[5/8] Docker is installed'
fi
docker compose version >/dev/null 2>&1 || { say '请安装 Docker Compose v2 插件。' 'Install the Docker Compose v2 plugin.' >&2; exit 1; }
stage '[5/8] 校验网站配置' '[5/8] Validating configuration' docker compose config --quiet
# Serialize service builds to reduce peak memory; keep Docker/npm caches for retries.
stage '[6/8] 下载依赖并编译后端（首次较慢，再次运行会使用缓存）' '[6/8] Building backend (first run downloads dependencies; retries use cache)' docker compose --progress plain build backend
stage '[6/8] 下载依赖并编译网页（可能需要数分钟，状态会持续刷新）' '[6/8] Building website (may take minutes; status continues refreshing)' docker compose --progress plain build web
stage '[7/8] 启动网站并等待服务就绪' '[7/8] Starting website and waiting for readiness' docker compose up -d --no-build --wait --wait-timeout 180
stage '[8/8] 检查网站和接口' '[8/8] Checking website and API' python3 scripts/health.py
touch .install-complete
say '安装完成。初始账号信息保存在本地 .env，请妥善保管。' 'Installation complete. Initial account details are saved in local .env; keep them private.'
python3 scripts/show_login.py
