#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Localization & preferences
# ------------------------------------------------------------
CB_LANG="en"
CB_ENABLE_JOYTAG="false"
if [ -f .env ]; then
  # shellcheck disable=SC2046
  CB_LANG=$(grep -E '^[[:space:]]*CB_LANG=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  CB_ENABLE_JOYTAG=$(grep -E '^[[:space:]]*CB_ENABLE_JOYTAG=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  CB_LANG=${CB_LANG:-en}
  CB_ENABLE_JOYTAG=${CB_ENABLE_JOYTAG:-false}
fi

t() {
  local key=$1
  case "$CB_LANG" in
    ja)
      case "$key" in
        starting_dev) echo "[start] CaramelBoard（開発）を起動します…" ;;
        starting_prod) echo "[start] CaramelBoard（本番）を起動します…" ;;
        tail_logs) echo "[start] アプリのログを表示します（Ctrl+Cで終了）…" ;;
        stopping) echo "[start] サービスを停止します…" ;;
        building) echo "[update] イメージをビルドして再起動します…" ;;
        updating) echo "[update] 更新しています（git pull → build → migrate → restart）…" ;;
        migrate) echo "[update] Prisma マイグレーションを適用しています…" ;;
        joytag_skip_disabled) echo "[start] JoyTag は無効化されています（CB_ENABLE_JOYTAG=false）。起動をスキップします。" ;;
        joytag_not_found) echo "[start] JoyTag は見つかりませんでした（externals/joytag）。スキップします。" ;;
        joytag_models_missing) echo "[start] JoyTag のモデルが見つかりません。スキップします。" ;;
        joytag_started) echo "[start] JoyTag を起動しました。" ;;
        git_check_start) echo "[git] リモートの更新を確認しています…" ;;
        git_check_missing) echo "[git] git コマンドが見つからないため、更新チェックをスキップします。" ;;
        git_check_not_repo) echo "[git] .git ディレクトリがないため、更新チェックをスキップします。" ;;
        git_check_no_upstream) echo "[git] 追跡ブランチが設定されていないため、更新チェックをスキップします。" ;;
        git_check_updates) printf "[git] %s に %s 件の新しいコミットがあります。./serve.sh update を実行してください。\n" "$2" "$3" ;;
        git_check_ahead) printf "[git] ローカルブランチは %s に対して %s コミット進んでいます。push の際はご注意ください。\n" "$2" "$3" ;;
        git_check_current) echo "[git] リモートと同期済みです。" ;;
        git_check_failed) echo "[git] git fetch に失敗したため、更新チェックをスキップしました。" ;;
        update_git_missing) echo "git が利用できないため更新処理をスキップします。" ;;
        update_git_not_repo) echo ".git ディレクトリがないため更新処理をスキップします。" ;;
        *) echo "$key" ;;
      esac
      ;;
    *)
      case "$key" in
        starting_dev) echo "[start] Starting CaramelBoard (dev)…" ;;
        starting_prod) echo "[start] Starting CaramelBoard (prod)…" ;;
        tail_logs) echo "[start] Tailing app logs (Ctrl+C to quit)…" ;;
        stopping) echo "[start] Stopping services…" ;;
        building) echo "[update] Building image and restarting…" ;;
        updating) echo "[update] Updating (git pull → build → migrate → restart)…" ;;
        migrate) echo "[update] Applying Prisma migrations…" ;;
        joytag_skip_disabled) echo "[start] JoyTag is disabled (CB_ENABLE_JOYTAG=false). Skipping." ;;
        joytag_not_found) echo "[start] JoyTag not found at externals/joytag. Skipping." ;;
        joytag_models_missing) echo "[start] JoyTag models not found. Skipping." ;;
        joytag_started) echo "[start] JoyTag started." ;;
        git_check_start) echo "[git] Checking for remote updates…" ;;
        git_check_missing) echo "[git] git command not found; skipping update check." ;;
        git_check_not_repo) echo "[git] .git directory not found; skipping update check." ;;
        git_check_no_upstream) echo "[git] No upstream tracking branch; skipping update check." ;;
        git_check_updates) printf "[git] Remote %s has %s new commits. Run ./serve.sh update to apply.\n" "$2" "$3" ;;
        git_check_ahead) printf "[git] Local branch is %s commits ahead of %s. Consider pushing or resetting carefully.\n" "$3" "$2" ;;
        git_check_current) echo "[git] Local and remote are in sync." ;;
        git_check_failed) echo "[git] Failed to check for updates (git fetch error)." ;;
        update_git_missing) echo "Skipping update because git is not available." ;;
        update_git_not_repo) echo "Skipping update because this directory is not a git repository." ;;
        *) echo "$key" ;;
      esac
      ;;
  esac
}

MODE="${1:-prod}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

have() { command -v "$1" >/dev/null 2>&1; }

# Resolve docker compose command
if command -v docker compose >/dev/null 2>&1; then
  DC=(docker compose)
else
  DC=(docker-compose)
fi

# Helper for dev-only compose file
dcdev() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose -f docker-compose.dev.yml "$@"
  else
    docker-compose -f docker-compose.dev.yml "$@"
  fi
}

# Compose file set (prod)
COMPOSE_FILES=(-f docker-compose.yml)
if [ -f docker-compose.local.yml ]; then
  COMPOSE_FILES+=(-f docker-compose.local.yml)
fi

dc() {
  "${DC[@]}" "${COMPOSE_FILES[@]}" "$@"
}

start_joytag() {
  if [ "${CB_ENABLE_JOYTAG:-false}" != "true" ]; then
    echo "$(t joytag_skip_disabled)"
    return 0
  fi
  local JOYTAG_DIR="$ROOT_DIR/externals/joytag"
  local LOG_DIR="$ROOT_DIR/logs"
  local LOG_FILE="$LOG_DIR/joytag-dev.log"
  local PID_FILE="$LOG_DIR/joytag.pid"

  mkdir -p "$LOG_DIR"

  if [ ! -f "$JOYTAG_DIR/joytag_server.py" ]; then
    echo "$(t joytag_not_found)"
    return 0
  fi

  if [ ! -d "$JOYTAG_DIR/models" ]; then
    echo "$(t joytag_models_missing)"
    return 0
  fi

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "[start] JoyTag already running (PID $(cat "$PID_FILE"))."
    return 0
  fi

  # Derive host files root from compose.local if present
  local FILES_ROOT="$ROOT_DIR/data"
  if [ -f docker-compose.local.yml ]; then
    local host_map
    host_map=$(grep -E '^[[:space:]]*-[[:space:]]*.+:/app/data' docker-compose.local.yml | head -n1 | sed -E 's/^[[:space:]]*-[[:space:]]*([^:]+):\/app\/data.*/\1/')
    if [ -n "$host_map" ]; then FILES_ROOT="$host_map"; fi
  fi

  echo "[start] Launching JoyTag server (AutoTag) on :5001 ..."
  (
    cd "$JOYTAG_DIR" && \
    { source venv/bin/activate 2>/dev/null || true; } && \
    JOYTAG_FILES_ROOT="$FILES_ROOT" PORT=5001 DEBUG=false python joytag_server.py >> "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE"
  )
  sleep 1
  if kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "$(t joytag_started) PID $(cat "$PID_FILE") (logs: $LOG_FILE)"
  else
    echo "[start] WARN: Failed to confirm JoyTag start; check $LOG_FILE"
  fi
}

git_check_updates() {
  if ! have git; then
    echo "$(t git_check_missing)"
    return 0
  fi
  if [ ! -d .git ]; then
    echo "$(t git_check_not_repo)"
    return 0
  fi

  local upstream
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
  if [ -z "$upstream" ]; then
    echo "$(t git_check_no_upstream)"
    return 0
  fi

  echo "$(t git_check_start)"
  if ! git fetch --quiet --prune >/dev/null 2>&1; then
    echo "$(t git_check_failed)"
    return 0
  fi

  local behind ahead
  behind=$(git rev-list --count HEAD.."$upstream" 2>/dev/null || echo "0")
  ahead=$(git rev-list --count "$upstream"..HEAD 2>/dev/null || echo "0")

  if [ "${behind:-0}" -gt 0 ]; then
    t git_check_updates "$upstream" "$behind"
  elif [ "${ahead:-0}" -gt 0 ]; then
    t git_check_ahead "$upstream" "$ahead"
  else
    echo "$(t git_check_current)"
  fi
}

case "$MODE" in
  dev)
    echo "$(t starting_dev)"
    # Start the same Postgres as production compose (with local override if present)
    dc up -d postgres
    # Determine mapped host port for Postgres 5432
    PG_PORT=""
    set +e
    PORT_LINE=$(dc port postgres 5432 2>/dev/null | head -n1)
    set -e
    if [ -n "$PORT_LINE" ]; then
      PG_PORT=${PORT_LINE##*:}
    else
      PG_PORT=5432
    fi
    # Fixed credentials aligned with production compose
    DB_NAME=caramel_board_db
    DB_USER=caramel_user
    DB_PASS=caramel_pass
    echo "[dev] Postgres is reachable from host at: 127.0.0.1:${PG_PORT}"
    echo "[dev] Using DB: $DB_NAME, USER: $DB_USER"
    echo "[dev] Example: psql \"postgresql://$DB_USER:$DB_PASS@127.0.0.1:${PG_PORT}/$DB_NAME\""
    # Export dev DATABASE_URL for host-run server (turbo dev)
    export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:${PG_PORT}/$DB_NAME"
    # FILES_STORAGE: derive from local override if present (host path mounted to /app/data)
    FILES_ROOT="$ROOT_DIR/data"
    if [ -f docker-compose.local.yml ]; then
      host_map=$(grep -E '^[[:space:]]*-[[:space:]]*.+:/app/data' docker-compose.local.yml | head -n1 | sed -E 's/^[[:space:]]*-[[:space:]]*([^:]+):\/app\/data.*/\1/')
      if [ -n "$host_map" ]; then FILES_ROOT="$host_map"; fi
    fi
    export FILES_STORAGE="$FILES_ROOT"
    start_joytag
    NODE_ENV=development npm run dev
    ;;
  prod)
    echo "$(t starting_prod)"
    git_check_updates
    dc up -d
    echo "$(t tail_logs)"
    dc logs -f app
    ;;
  stop)
    echo "$(t stopping)"
    dc down
    ;;
  migrate)
    echo "$(t migrate)"
    # Ensure DB is up (and healthy) before migrations
    dc up -d postgres
    # Run migrations in a one-off container using the current image
    dc run --rm app npm run db:migrate:prod
    echo "[update] Migrations completed."
    ;;
  build)
    echo "$(t building)"
    dc build --pull app
    dc up -d app
    echo "$(t tail_logs)"
    dc logs -f app
    ;;
  update)
    echo "$(t updating)"
    if ! have git; then
      echo "[update] $(t update_git_missing)"
      exit 0
    fi
    if [ ! -d .git ]; then
      echo "[update] $(t update_git_not_repo)"
      exit 0
    fi
    git fetch --all --prune || true
    git pull --rebase || true
    # Build new image and apply
    dc up -d postgres
    dc build --pull app
    # Run migrations using the freshly built image
    dc run --rm app npm run db:migrate:prod
    # Restart app
    dc up -d app
    echo "[update] Update completed. Tailing logs (Ctrl+C to quit)..."
    dc logs -f app
    ;;
  *)
    echo "Usage: $0 [dev|prod|migrate|build|update]"
    exit 1
    ;;
esac
