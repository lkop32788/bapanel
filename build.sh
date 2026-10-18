#!/usr/bin/env bash
#
# WABA Panel 前端一键构建上线
#
#   ./build.sh                 构建 → 替换 → 重启 → 健康检查（失败自动回滚）
#   ./build.sh --no-restart    只构建，不动线上（想自己挑时间重启时用）
#   ./build.sh --install       构建前先 npm install（改过依赖时用）
#   ./build.sh --rollback      退回上一个构建
#   ./build.sh --status        看当前状态
#
# 为什么不直接 npm run build：
#   默认的 build 会往 .next 里写，而 pm2 正拿着这个目录在对外服务，
#   构建过程中用户会撞上 chunk 404。所以先构建到 .next-build，
#   成功之后再整目录替换，线上只在 pm2 重启的那一秒不可用。

set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/wabapanel-frontend"
PM2_APP="${PM2_APP:-wabapanel-app}"
PORT="${PORT:-3002}"
STAGING=".next-build"      # 已在 tsconfig include 里，构建时不会去改 tsconfig
CURRENT=".next"
PREVIOUS=".next-old"
HEALTH_PATH="${HEALTH_PATH:-/auth/login}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
CURRENT_TYPES_BACKUP=""

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLU=$'\e[36m'; DIM=$'\e[2m'; RST=$'\e[0m'
info() { echo "${BLU}▸${RST} $*"; }
ok()   { echo "${GRN}✓${RST} $*"; }
warn() { echo "${YLW}!${RST} $*"; }
die()  { echo "${RED}✗${RST} $*" >&2; exit 1; }

# pm2 是按用户隔离的：进程注册在谁的守护进程里，就只能由谁重启。
# 用 root 跑本脚本会有两个后果 —— pm2 找的是 root 那个（通常是空的），
# 构建产物也会变成 root 属主，而应用以 APP_USER 身份运行，读不了。
# 所以一律切换到应用目录属主的身份再干活。
APP_USER="${APP_USER:-$(stat -c %U "$APP_DIR" 2>/dev/null || echo ubuntu)}"
ensure_app_user() {
  local me; me="$(id -un)"
  [ "$me" = "$APP_USER" ] && return 0
  command -v sudo >/dev/null 2>&1 || die "当前用户是 $me，应为 $APP_USER，但系统里没有 sudo"
  info "当前用户 $me，切换到 ${APP_USER} 执行 ${DIM}（pm2 进程和构建产物都归它所有）${RST}"
  exec sudo -u "$APP_USER" -H env \
    PM2_APP="$PM2_APP" PORT="$PORT" HEALTH_PATH="$HEALTH_PATH" HEALTH_TIMEOUT="$HEALTH_TIMEOUT" \
    "$SELF" "$@"
}

# 动手之前先确认 pm2 里真有这个应用，别等替换完目录才发现重启不了
require_pm2_app() {
  pm2 describe "$PM2_APP" >/dev/null 2>&1 \
    || die "pm2 中找不到应用 ${PM2_APP}（当前用户 $(id -un)）。先跑 pm2 list 核对名称，或用 PM2_APP=<名字> 指定。"
}

# 等服务真正能响应，而不是等 pm2 说 online
wait_healthy() {
  local i
  for ((i = 1; i <= HEALTH_TIMEOUT; i++)); do
    if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}${HEALTH_PATH}"; then
      echo "$i"; return 0
    fi
    sleep 1
  done
  return 1
}

restart_app() {
  pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 \
    || die "pm2 重启失败，请检查：pm2 list"
}

cmd_status() {
  cd "$APP_DIR"
  echo "${DIM}目录${RST}      $APP_DIR"
  echo "${DIM}pm2 应用${RST}  $PM2_APP    ${DIM}端口${RST} $PORT"
  local d
  for d in "$CURRENT" "$PREVIOUS" "$STAGING"; do
    if [[ -d $d ]]; then
      printf "%-14s %-7s %s\n" "$d" "$(du -sh "$d" 2>/dev/null | cut -f1)" \
        "$(date -r "$d" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || true)"
    fi
  done
  echo
  pm2 list 2>/dev/null | grep -iE "│ id|$PM2_APP" || true
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${PORT}${HEALTH_PATH}"; then
    ok "服务响应正常 (127.0.0.1:${PORT})"
  else
    warn "服务无响应 (127.0.0.1:${PORT})"
  fi
}

cmd_rollback() {
  cd "$APP_DIR"
  [[ -d $PREVIOUS ]] || die "没有 $PREVIOUS，无法回滚"
  require_pm2_app
  info "回滚到上一个构建…"
  rm -rf "$CURRENT.discard"
  [[ -d $CURRENT ]] && mv "$CURRENT" "$CURRENT.discard"
  mv "$PREVIOUS" "$CURRENT"
  restart_app
  local t
  if t=$(wait_healthy); then
    rm -rf "$CURRENT.discard"
    ok "已回滚并恢复服务（${t}s）"
  else
    die "回滚后服务仍无响应，请手动排查：pm2 logs $PM2_APP"
  fi
}

cmd_build() {
  local do_install=$1 do_restart=$2
  cd "$APP_DIR"

  [[ -f package.json ]] || die "找不到 package.json：$APP_DIR"
  require_pm2_app

  # 构建约 450M，加上要保留的旧构建，留 2G 余量
  local avail_mb
  avail_mb=$(df -Pm . | awk 'NR==2 {print $4}')
  (( avail_mb > 2048 )) || die "磁盘剩余 ${avail_mb}MB，不足以安全构建（需 >2GB）"

  if [[ $do_install == yes ]]; then
    info "安装依赖…"
    npm install --no-audit --no-fund || die "npm install 失败"
    ok "依赖就绪"
  elif [[ ! -d node_modules ]]; then
    die "node_modules 不存在，请先跑：./build.sh --install"
  fi

  info "构建到 ${STAGING}/ ${DIM}（线上不受影响）${RST}"
  rm -rf "$STAGING"

  # Next.js writes route type-check files below the configured distDir.  The
  # staging build uses .next-build, but tsconfig.json also includes .next/types
  # for normal builds.  Keep the currently served build's generated types out
  # of this check: they can describe routes that were removed from the source
  # since the last deployment (for example, automations/flows).
  if [[ -d "$CURRENT/types" ]]; then
    CURRENT_TYPES_BACKUP="${CURRENT}.types-backup.$$"
    mv "$CURRENT/types" "$CURRENT_TYPES_BACKUP"
  fi
  restore_current_types() {
    if [[ -n "$CURRENT_TYPES_BACKUP" && -d "$CURRENT_TYPES_BACKUP" ]]; then
      mv "$CURRENT_TYPES_BACKUP" "$CURRENT/types"
      CURRENT_TYPES_BACKUP=""
    fi
  }
  trap restore_current_types EXIT INT TERM

  local log; log=$(mktemp)
  if NEXT_DIST_DIR="$STAGING" npx next build > "$log" 2>&1; then
    restore_current_types
    ok "构建成功  $(du -sh "$STAGING" | cut -f1)"
    rm -f "$log"
  else
    restore_current_types
    echo
    echo "${RED}构建失败，线上仍是旧版本，未做任何改动。${RST}"
    echo "${DIM}——— 错误信息 ———${RST}"
    # 只挑真正的错误行，别被几百条 warning 淹没
    grep -nE "Error:|Failed to compile|Type error|Module not found" "$log" | head -20 \
      || tail -30 "$log"
    echo "${DIM}完整日志：$log${RST}"
    rm -rf "$STAGING"
    exit 1
  fi

  if [[ $do_restart == no ]]; then
    warn "已跳过替换与重启，新构建留在 ${STAGING}/"
    echo "${DIM}想上线时再跑一次不带 --no-restart 即可。${RST}"
    return 0
  fi

  info "替换构建产物…"
  rm -rf "$PREVIOUS"
  [[ -d $CURRENT ]] && mv "$CURRENT" "$PREVIOUS"
  mv "$STAGING" "$CURRENT"

  info "重启 $PM2_APP …"
  restart_app

  local t
  if t=$(wait_healthy); then
    ok "上线完成，服务已恢复（${t}s）"
    echo
    echo "  回滚：${DIM}./build.sh --rollback${RST}"
    echo "  确认无误后回收空间：${DIM}rm -rf ${APP_DIR}/${PREVIOUS}${RST}"
  else
    echo
    warn "服务 ${HEALTH_TIMEOUT}s 内没有响应，自动回滚…"
    if [[ -d $PREVIOUS ]]; then
      rm -rf "$CURRENT"
      mv "$PREVIOUS" "$CURRENT"
      restart_app
      wait_healthy >/dev/null && ok "已回滚到上一个构建，服务恢复" \
        || warn "回滚后仍无响应，请查看：pm2 logs $PM2_APP"
    fi
    die "上线失败。排查：pm2 logs $PM2_APP --lines 50"
  fi
}

main() {
  case "${1:-}" in -h|--help) sed -n '2,15p' "$SELF" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
  ensure_app_user "$@"

  local do_install=no do_restart=yes
  while [[ $# -gt 0 ]]; do
    case $1 in
      --install)    do_install=yes ;;
      --no-restart) do_restart=no ;;
      --rollback)   cmd_rollback; exit 0 ;;
      --status)     cmd_status;   exit 0 ;;
      -h|--help)    sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
      *)            die "未知参数：$1（--help 看用法）" ;;
    esac
    shift
  done
  cmd_build "$do_install" "$do_restart"
}

main "$@"