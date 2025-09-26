#!/usr/bin/env bash
set -euo pipefail

# Clean setup (Docker-first). No Node.js required on host.
# - Asks language (en/ja) and persists to .env (CB_LANG)
# - Optional JoyTag enable (persists CB_ENABLE_JOYTAG, shows caution + URL)
# - Offers to generate docker-compose.local.yml using default repo paths
# - Initializes containers: build → migrate (deploy) → up

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CHANNEL_MODE=false
if [ "${1:-}" = "channel" ]; then
  CHANNEL_MODE=true
fi

ESC="\033"; RESET="${ESC}[0m"; BOLD="${ESC}[1m"; DIM="${ESC}[2m"; CYAN="${ESC}[36m"; MAGENTA="${ESC}[35m"

say() { printf "%b\n" "$1"; }
menu_print() { >&2 printf "%s\n" "$1"; }
hr() { >&2 printf "%b\n" "${DIM}────────────────────────────────────────────────────────${RESET}"; }
begin_question() { # title
  >&2 echo ""
  hr; menu_print "$1"; hr
}
normalize_path() { # normalize Windows-style paths to WSL when possible
  local p="$1"
  # strip surrounding quotes
  p="${p%\"}"; p="${p#\"}"; p="${p%\'}"; p="${p#\'}"
  if command -v wslpath >/dev/null 2>&1; then
    if echo "$p" | grep -E '^[A-Za-z]:\\\\' >/dev/null 2>&1; then
      local conv
      conv=$(wslpath -u "$p" 2>/dev/null || true)
      if [ -n "$conv" ]; then p="$conv"; fi
    fi
  fi
  # fallback: convert backslashes to slashes (best-effort)
  if echo "$p" | grep -q '\\\\'; then
    p="${p//\\\\//}"
  fi
  echo "$p"
}
menu_ask() { # title(default label, no hr) defaultIndex options...
  local title="$1"; shift; local def="$1"; shift; local options=("$@"); local count=${#options[@]}
  while true; do
    if [ -n "$title" ]; then menu_print "$title"; fi
    local i=1; for opt in "${options[@]}"; do menu_print "$i) $opt"; i=$((i+1)); done
    >&2 printf "[default:%s]: " "$def"
    local ans; read -r ans || ans="$def"; ans=${ans:-$def}
    if [[ "$ans" =~ ^[0-9]+$ ]] && [ "$ans" -ge 1 ] 2>/dev/null && [ "$ans" -le "$count" ] 2>/dev/null; then
      echo "$ans"; return 0
    fi
    if [ "$CB_LANG" = "ja" ]; then
      echo "[setup] 半角数字で入力してください（1-${count}）。もう一度入力してください。" >&2
    else
      echo "[setup] Please enter a number between 1 and ${count}. Try again." >&2
    fi
    >&2 echo ""
  done
}
prompt() { # title defaultValue
  local title="$1"; local def="$2"; hr; menu_print "$title"; hr; >&2 printf "[default:%s]: " "$def"; local ans; read -r ans || ans="$def"; echo "${ans:-$def}"; }

write_env() { # key val
  local key="$1" val="$2"; touch .env
  if grep -qE "^${key}=" .env 2>/dev/null; then
    awk -v k="$key" -v v="$val" -F= 'BEGIN{OFS="="} $1==k{$0=k"="v} $1!=k{print $0}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "${key}=${val}" >> .env
  fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# Read prior prefs
CB_LANG=${CB_LANG:-}
[ -f .env ] && CB_LANG=$(awk -F= '$1=="CB_LANG"{print substr($0,index($0,$2))}' .env | tail -n1 | tr -d '"' || true)
CB_LANG=${CB_LANG:-en}
CB_ENABLE_JOYTAG=${CB_ENABLE_JOYTAG:-}
[ -f .env ] && CB_ENABLE_JOYTAG=$(awk -F= '$1=="CB_ENABLE_JOYTAG"{print substr($0,index($0,$2))}' .env | tail -n1 | tr -d '"' || true)
CB_ENABLE_JOYTAG=${CB_ENABLE_JOYTAG:-false}
JOYTAG_INFO_URL=${JOYTAG_INFO_URL:-}
[ -f .env ] && JOYTAG_INFO_URL=$(awk -F= '$1=="JOYTAG_INFO_URL"{print substr($0,index($0,$2))}' .env | tail -n1 | tr -d '"' || true)
JOYTAG_INFO_URL=${JOYTAG_INFO_URL:-https://github.com/fpgaminer/joytag}

if ! $CHANNEL_MODE; then
  # Banner
  say "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  say "${BOLD}CaramelBoard Setup${RESET} ${MAGENTA}🍬🤎${RESET}"
  say "${DIM}Docker-only setup. Node.js is not required on host.${RESET}"
  say "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
fi

INTERACTIVE=false
if ! $CHANNEL_MODE && [ -t 0 ] && [ -t 1 ]; then
  INTERACTIVE=true
fi

# 1) Language
if ! $CHANNEL_MODE && $INTERACTIVE; then
  sel=$(menu_ask "Select language:" 1 "English" "日本語")
  if [ "$sel" = "2" ]; then CB_LANG=ja; else CB_LANG=en; fi
  if [ "$CB_LANG" = "ja" ]; then say "言語: 日本語"; else say "Language: English"; fi
  echo ""
fi
if ! $CHANNEL_MODE; then
  write_env CB_LANG "$CB_LANG"
fi

# t() helper
t(){ local k="$1"; case "$CB_LANG" in ja)
  case "$k" in \
    storage_title) echo "ストレージの設定:";; \
    storage_l1) echo "- アセットやデータベースのデータ保存先を指定します";; \
    storage_l2) echo "- 外部ストレージなど、このフォルダ以外の場所に保存する場合は指定をしてください";; \
    storage_use_defaults) echo "既定 (./data)";; \
    storage_custom) echo "データ保存先を指定";; \
    storage_skip) echo "スキップ";; \
    dir_missing_title) echo "指定したパスにフォルダが存在しません";; \
    dir_create) echo "そのパスにフォルダを作成する";; \
    dir_reenter) echo "パスを再入力する";; \
    jt_title) echo "自動タグ付け (JoyTag) を有効化しますか？";; \
    jt_l1) echo "- 有効化するとJoyTagをダウンロードします。これはローカルで動作する、画像のタグの確率を計算するAIモデルです";; \
    jt_l2) echo "- この機能は、登録された画像をローカルで解析してタグを推定する用途のみに使用します。画像生成・学習・外部送信は行いません";; \
    jt_l3) echo "- JoyTagが出力するタグにはNSFWワードが含まれるのでご注意ください";; \
    jt_l4) echo "- 規約は次のURLをご自身で確認の上、自己責任でご利用ください: ${JOYTAG_INFO_URL}";; \
    jt_select) echo "選択:";; \
    jt_skip) echo "スキップ(設定を変更しない)";; \
    jt_no) echo "無効(デフォルト)";; \
    jt_yes) echo "有効化";; \
    jt_skip_msg) echo "JoyTag の設定を変更しませんでした";; \
    ask_data_root) echo "データ保存先のルートパス（例: /path/to/data or D:\Path\to\data /mnt/d/path/to/data など ）";; \
    init_start) echo "初期化: build → スキーマ適用（migrate または push）…";; \
    stop_services) echo "セットアップ終了のため、コンテナを停止します（起動は ./serve.sh を使用）";; \
    done) echo "セットアップ完了。 次は ./serve.sh で起動/運用できます。";; \
    py_hint) echo "※自動タグ付けを有効化するには Python3 が必要です。";; \
    py_required) echo "自動タグ付けを有効化するには Python3 が必要です。インストール後にもう一度実行してください。";; \
    channel_usage) echo "./setup.sh channel <dev|stable|main> を実行してください";; \
    channel_invalid) echo "指定されたチャンネル '%s' はサポートされていません";; \
    channel_git_missing) echo "git コマンドが見つかりません。インストールしてから再実行してください。";; \
    channel_not_repo) echo "このディレクトリは git リポジトリではありません (.git が見つかりません)。";; \
    channel_fetch) echo "origin から最新の情報を取得します…";; \
    channel_remote_missing) echo "origin/%s ブランチが見つかりませんでした。リモートに存在するか確認してください。";; \
    channel_checkout_existing) echo "既存のブランチ %s に切り替えます。";; \
    channel_checkout_new) echo "ローカルブランチ %s を origin/%s から作成します。";; \
    channel_pull) echo "origin/%s から最新の変更を取り込みます…";; \
    channel_pull_failed) echo "最新の変更を取り込めませんでした。手動で解決してから再実行してください。";; \
    channel_submodule) echo "サブモジュールを同期しています…";; \
    channel_done) echo "チャンネル切り替えが完了しました。";; \
  esac \
  ;; * ) 
  case "$k" in \
    storage_title) echo "Storage configuration:";; \
    storage_l1) echo "- Specify the storage location for assets and database data";; \
    storage_l2) echo "- Please specify if you want to save to a location outside this folder, such as external storage";; \
    storage_use_defaults) echo "Recommended defaults: use ./data as base (will create assets/ and postgres/)";; \
    storage_custom) echo "Enter a single data root (assets/ and postgres/ will be created/used)";; \
    storage_skip) echo "Skip (do not create local override)";; \
    dir_missing_title) echo "Path does not exist. What would you like to do?";; \
    dir_create) echo "Create it (assets/ and postgres/)";; \
    dir_reenter) echo "Re-enter path";; \
    jt_title) echo "Enable auto-tagging?";; \
    jt_l1) echo "- Enabling will download JoyTag. This is a machine learning library that runs locally and calculates image tag probabilities";; \
    jt_l2) echo "- This feature only analyzes registered images locally to estimate tags. It does not generate new content, train models, or transmit data externally";; \
    jt_l3) echo "- Please note that tags output by JoyTag may contain NSFW words";; \
    jt_l4) echo "- Please check the terms at the following URL and use at your own risk: ${JOYTAG_INFO_URL}";; \
    jt_select) echo "Select:";; \
    jt_skip) echo "Skip (no changes)";; \
    jt_no) echo "Disable (default)";; \
    jt_yes) echo "Enable";; \
    jt_skip_msg) echo "Left JoyTag settings unchanged";; \
    ask_data_root) echo "Host data root path (e.g., /path/to/data)";; \
    init_start) echo "Initializing: build → apply schema (migrate or push)…";; \
    stop_services) echo "Stopping containers so you can use ./serve.sh to run.";; \
    done) echo "Setup complete. You can now start/operate with ./serve.sh";; \
    py_hint) echo "※Python3 is required to enable auto-tagging.";; \
    py_required) echo "Python3 is required to enable auto-tagging. Please install it and run again.";; \
    channel_usage) echo "Usage: ./setup.sh channel <dev|stable|main>";; \
    channel_invalid) echo "Channel '%s' is not supported.";; \
    channel_git_missing) echo "git command not found. Please install git and retry.";; \
    channel_not_repo) echo "This directory is not a git repository (.git folder not found).";; \
    channel_fetch) echo "Fetching latest changes from origin…";; \
    channel_remote_missing) echo "origin/%s does not exist. Please check the remote branch.";; \
    channel_checkout_existing) echo "Switching to existing branch %s.";; \
    channel_checkout_new) echo "Creating local branch %s from origin/%s.";; \
    channel_pull) echo "Pulling latest changes from origin/%s…";; \
    channel_pull_failed) echo "Failed to pull latest changes. Resolve conflicts and retry.";; \
    channel_submodule) echo "Synchronizing submodules…";; \
    channel_done) echo "Channel switch completed.";; \
  esac \
  ;; esac; }

run_channel_command() {
  local channel="${1:-}"
  if [ -z "$channel" ]; then
    say "[setup] $(t channel_usage)"
    return 1
  fi

  case "$channel" in
    dev|stable|main) ;;
    *)
      say "[setup] $(printf "$(t channel_invalid)" "$channel")"
      say "[setup] $(t channel_usage)"
      return 1
      ;;
  esac

  if ! have git; then
    say "[setup] $(t channel_git_missing)"
    return 1
  fi
  if [ ! -d .git ]; then
    say "[setup] $(t channel_not_repo)"
    return 1
  fi

  local branch="$channel"
  local remote="origin"

  say "[setup] $(t channel_fetch)"
  git fetch --prune "$remote"

  if ! git show-ref --verify --quiet "refs/remotes/${remote}/${branch}"; then
    say "[setup] $(printf "$(t channel_remote_missing)" "$branch")"
    return 1
  fi

  if git rev-parse --verify --quiet "$branch" >/dev/null 2>&1; then
    say "[setup] $(printf "$(t channel_checkout_existing)" "$branch")"
    git checkout "$branch"
  else
    say "[setup] $(printf "$(t channel_checkout_new)" "$branch" "$branch")"
    git checkout -b "$branch" "${remote}/${branch}"
  fi

  say "[setup] $(printf "$(t channel_pull)" "$branch")"
  if ! git pull --ff-only "$remote" "$branch"; then
    say "[setup] $(t channel_pull_failed)"
    return 1
  fi

  if [ -f .gitmodules ]; then
    say "[setup] $(t channel_submodule)"
    git submodule update --init --recursive
  fi

  say "[setup] $(t channel_done)"
  return 0
}

if [ "${1:-}" = "channel" ]; then
  shift || true
  run_channel_command "${1:-}"
  exit $?
fi

# 1.5) Dependency notes (Python hint for JoyTag)
python_ok=false; if have python3; then python_ok=true; fi
if ! $python_ok; then
  say "[setup] $(t py_hint)"
  echo ""
fi

# 2) Ensure default directories
ASSETS_DEFAULT="$ROOT_DIR/data/assets"
PG_DEFAULT="$ROOT_DIR/data/postgres"
mkdir -p "$ASSETS_DEFAULT" "$PG_DEFAULT" "$ROOT_DIR/data" || true
[ -f "$ROOT_DIR/data/.gitkeep" ] || : > "$ROOT_DIR/data/.gitkeep"
[ -f "$ASSETS_DEFAULT/.gitkeep" ] || : > "$ASSETS_DEFAULT/.gitkeep"
# NOTE: Do NOT create any files under the Postgres data directory before init.
# Creating .gitkeep here breaks initdb (directory must be empty)

# 4) Storage setup → generate docker-compose.local.yml as needed
assets_path="$ASSETS_DEFAULT"; pg_path="$PG_DEFAULT"
if $INTERACTIVE; then
  begin_question "$(t storage_title)"
  say "$(t storage_l1)"; say "$(t storage_l2)"; hr
  storage_sel=$(menu_ask "" 1 "$(t storage_use_defaults)" "$(t storage_custom)" "$(t storage_skip)")
else
  storage_sel=1
fi
if [ "$storage_sel" != "3" ]; then
  if [ "$storage_sel" = "2" ]; then
    while true; do
      data_root=$(prompt "[setup] $(t ask_data_root)" "$ROOT_DIR/data")
      data_root=$(normalize_path "$data_root")
      [ -n "$data_root" ] || data_root="$ROOT_DIR/data"
      if [ -d "$data_root" ]; then
        break
      fi
      begin_question "$(t dir_missing_title)"
      choice=$(menu_ask "" 1 "$(t dir_create)" "$(t dir_reenter)")
      if [ "$choice" = "1" ]; then
        mkdir -p "$data_root/assets" "$data_root/postgres" || true
        break
      fi
      # Otherwise loop to re-enter
    done
    assets_path="$data_root/assets"
    pg_path="$data_root/postgres"
  fi
  mkdir -p "$assets_path" "$pg_path" || true

  # Detect Docker server platform (os/arch) and normalize to compose 'platform'
  DETECTED_PLATFORM=""
  if command -v docker >/dev/null 2>&1; then
    set +e
    DETECTED_PLATFORM=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}' 2>/dev/null | tr -d '"' | tr -d '\r' | head -n1)
    set -e
  fi
  DOCKER_PLATFORM=""
  if [ -n "$DETECTED_PLATFORM" ]; then
    plat_os=$(printf "%s" "$DETECTED_PLATFORM" | awk -F/ '{print $1}')
    plat_arch=$(printf "%s" "$DETECTED_PLATFORM" | awk -F/ '{print $2}')
    case "$plat_arch" in
      aarch64|arm64|arm64v8) norm_arch="arm64" ;;
      x86_64|amd64) norm_arch="amd64" ;;
      armv7l|armv7) norm_arch="arm/v7" ;;
      armv6l|armv6) norm_arch="arm/v6" ;;
      *) norm_arch="$plat_arch" ;;
    esac
    if [ "$plat_os" = "linux" ] && [ -n "$norm_arch" ]; then
      DOCKER_PLATFORM="${plat_os}/${norm_arch}"
    fi
  fi
  PLATFORM_LINE=""; if [ -n "$DOCKER_PLATFORM" ]; then PLATFORM_LINE="platform: $DOCKER_PLATFORM"; fi

  cat > docker-compose.local.yml <<YAML
services:
  app:
    ${PLATFORM_LINE}
    environment:
      - FILES_STORAGE=/app/data
    volumes:
      - ${assets_path}:/app/data
  postgres:
    ${PLATFORM_LINE}
    volumes:
      - ${pg_path}:/var/lib/postgresql/data
YAML
fi
# Re-evaluate compose set if local override created
COMPOSE_FILES=(-f docker-compose.yml)
[ -f docker-compose.local.yml ] && COMPOSE_FILES+=(-f docker-compose.local.yml)

# Docker dependency check and compose helpers
if ! have docker; then
  if [ "$CB_LANG" = "ja" ]; then
    echo "[setup] Docker が見つかりませんでした。Docker Desktop（Windows/macOS）または Docker Engine + compose（Linux）をインストールしてください。" >&2
  else
    echo "[setup] Docker not found. Please install Docker Desktop (Windows/macOS) or Docker Engine + compose (Linux)." >&2
  fi
  exit 1
fi
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif have docker-compose; then
  DC=(docker-compose)
else
  if [ "$CB_LANG" = "ja" ]; then
    echo "[setup] compose コマンドが見つかりませんでした。Docker Desktop（または docker-compose）をインストールしてください。" >&2
  else
    echo "[setup] compose command not found. Please install Docker Desktop (or docker-compose)." >&2
  fi
  exit 1
fi
dc() { "${DC[@]}" "${COMPOSE_FILES[@]}" "$@"; }

# 5) JoyTag opt-in (flag only)
if $INTERACTIVE; then
  begin_question "$(t jt_title)"
  say "$(t jt_l1)"; say "$(t jt_l2)"; say "$(t jt_l3)"; say "$(t jt_l4)"
  menu_print "$(t jt_select)"; hr
  sel=$(menu_ask "" 1 "$(t jt_skip)" "$(t jt_no)" "$(t jt_yes)")
  JOYTAG_CHANGED=false
  if [ "$sel" = "3" ]; then
    if ! $python_ok; then
      echo "[setup] $(t py_required)" >&2
      exit 1
    fi
    CB_ENABLE_JOYTAG=true
    JOYTAG_CHANGED=true
    # Run JoyTag setup tasks
    JOYTAG_EXT_DIR="$ROOT_DIR/externals/joytag"
    mkdir -p "$ROOT_DIR/externals"
    if [ ! -d "$JOYTAG_EXT_DIR" ]; then
      hr; menu_print "Fetching JoyTag repository…"
      if command -v git >/dev/null 2>&1; then
        set +e; git clone --depth=1 https://github.com/fpgaminer/joytag "$JOYTAG_EXT_DIR"; GIT_STATUS=$?; set -e
      else
        GIT_STATUS=1
      fi
      if [ ${GIT_STATUS:-1} -ne 0 ]; then
        if command -v curl >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
          TMP_ZIP="$(mktemp -t joytag.XXXXXX).zip"
          curl -L -o "$TMP_ZIP" https://github.com/fpgaminer/joytag/archive/refs/heads/main.zip
          unzip -q "$TMP_ZIP" -d "$ROOT_DIR/externals" && rm -f "$TMP_ZIP"
          mv "$ROOT_DIR/externals/joytag-main" "$JOYTAG_EXT_DIR" || true
        else
          menu_print "[setup] Could not fetch JoyTag automatically (missing git or curl/unzip). Please place it at externals/joytag manually."
        fi
      fi
    else
      hr; menu_print "Using existing externals/joytag"
    fi

    # Copy integration adapter files
    INTEG_DIR="$ROOT_DIR/integrations/joytag"
    if [ -f "$INTEG_DIR/joytag_server.py" ]; then
      cp -f "$INTEG_DIR/joytag_server.py" "$JOYTAG_EXT_DIR/joytag_server.py"
    fi
    if [ -f "$INTEG_DIR/requirements-server.txt" ]; then
      cp -f "$INTEG_DIR/requirements-server.txt" "$JOYTAG_EXT_DIR/requirements-server.txt"
    fi

    # Python venv and requirements
    if [ -d "$JOYTAG_EXT_DIR" ]; then
      hr; menu_print "Preparing Python venv and installing requirements…"
      python3 -m venv "$JOYTAG_EXT_DIR/venv" 2>/dev/null || true
      if [ -f "$JOYTAG_EXT_DIR/requirements-server.txt" ]; then
        set +e
        # shellcheck disable=SC1091
        source "$JOYTAG_EXT_DIR/venv/bin/activate" 2>/dev/null
        python -m pip install --upgrade pip >/dev/null 2>&1
        pip install -r "$JOYTAG_EXT_DIR/requirements-server.txt"
        deactivate 2>/dev/null || true
        set -e
      fi
    fi

    # Models: prompt if missing
    if [ ! -d "$JOYTAG_EXT_DIR/models" ] || [ -z "$(ls -A "$JOYTAG_EXT_DIR/models" 2>/dev/null)" ]; then
      sel_models=$(menu_ask "Select a method to prepare models" 4 \
        "huggingface-cli download (fancyfeast/joytag)" \
        "git lfs clone (huggingface.co/fancyfeast/joytag)" \
        "use existing local path" \
        "skip")
      case "$sel_models" in
        1)
          # Try ensure huggingface-cli
          set +e
          if ! command -v huggingface-cli >/dev/null 2>&1; then
            # shellcheck disable=SC1091
            source "$JOYTAG_EXT_DIR/venv/bin/activate" 2>/dev/null || true
            python -m pip install -U huggingface_hub >/dev/null 2>&1
            deactivate 2>/dev/null || true
          fi
          if command -v huggingface-cli >/dev/null 2>&1; then
            huggingface-cli download fancyfeast/joytag --local-dir "$JOYTAG_EXT_DIR/models" --local-dir-use-symlinks False || menu_print "[setup] huggingface-cli download failed."
          else
            menu_print "[setup] huggingface-cli not found. Install with: pip install -U huggingface_hub"
          fi
          set -e
          ;;
        2)
          if command -v git >/dev/null 2>&1 && command -v git-lfs >/dev/null 2>&1; then
            (cd "$JOYTAG_EXT_DIR" && git lfs install && git clone https://huggingface.co/fancyfeast/joytag models)
          else
            menu_print "[setup] git / git-lfs not found; cannot clone models."
          fi
          ;;
        3)
          model_src=$(prompt "[setup] Enter existing models directory path" "")
          if [ -n "$model_src" ] && [ -d "$model_src" ]; then
            mkdir -p "$JOYTAG_EXT_DIR/models" && cp -R "$model_src"/* "$JOYTAG_EXT_DIR/models/" 2>/dev/null || true
          else
            menu_print "[setup] Invalid path. Skipping."
          fi
          ;;
        *) : ;;
      esac
    fi
  elif [ "$sel" = "2" ]; then
    CB_ENABLE_JOYTAG=false
    JOYTAG_CHANGED=true
  else
    # Skip: do not change CB_ENABLE_JOYTAG
    say "[setup] $(t jt_skip_msg)"
  fi
fi
if [ "${JOYTAG_CHANGED:-false}" = true ]; then
  write_env CB_ENABLE_JOYTAG "$CB_ENABLE_JOYTAG"
fi
write_env JOYTAG_INFO_URL "$JOYTAG_INFO_URL"

# 6) Initialize via Docker
say "[setup] $(t init_start)"
dc build app
dc up -d postgres

# Apply database schema (simple UX):
# - If migrations exist → migrate deploy; otherwise → db push
MIGR_DIR="apps/server/prisma/migrations"
echo "[setup] Applying database schema…"
if [ -d "$MIGR_DIR" ] && [ "$(ls -A "$MIGR_DIR" 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
  if ! dc run --rm app npm run db:migrate:prod; then
    # Silent fallback for user simplicity
    dc run --rm app npx prisma db push
  fi
else
  dc run --rm app npx prisma db push
fi
echo "[setup] Database ready."

# Stop containers after setup; users should use ./serve.sh to run
say "[setup] $(t stop_services)"
dc down

say "[setup] $(t done)"
echo "- Language: $CB_LANG"
echo "- JoyTag enabled: $CB_ENABLE_JOYTAG (info: $JOYTAG_INFO_URL)"
echo "- Assets: ${assets_path:-$ASSETS_DEFAULT}  Postgres: ${pg_path:-$PG_DEFAULT}"
echo "- Next: ./serve.sh   or   ./serve.sh update"
