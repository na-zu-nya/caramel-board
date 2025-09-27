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

ensure_huggingface_cli() {
  local target_dir="$1"
  local hf_bin=""
  if command -v huggingface-cli >/dev/null 2>&1; then
    hf_bin="$(command -v huggingface-cli)"
  elif [ -x "$target_dir/venv/bin/huggingface-cli" ]; then
    hf_bin="$target_dir/venv/bin/huggingface-cli"
  fi
  if [ -z "$hf_bin" ]; then
    say "[setup] $(t hf_install_start)"
    set +e
    INSTALL_HF=1
    if [ -x "$target_dir/venv/bin/python" ]; then
      # shellcheck disable=SC1091
      source "$target_dir/venv/bin/activate" 2>/dev/null
      python -m ensurepip --upgrade >/dev/null 2>&1
      python -m pip install --upgrade pip >/dev/null 2>&1
      python -m pip install --upgrade huggingface_hub
      INSTALL_HF=$?
      deactivate 2>/dev/null || true
    elif have python3; then
      python3 -m ensurepip --default-pip >/dev/null 2>&1
      python3 -m pip install --user --upgrade pip >/dev/null 2>&1
      python3 -m pip install --user --upgrade huggingface_hub
      INSTALL_HF=$?
    fi
    set -e
    if [ ${INSTALL_HF:-1} -eq 0 ]; then
      if [ -x "$target_dir/venv/bin/huggingface-cli" ]; then
        hf_bin="$target_dir/venv/bin/huggingface-cli"
      elif command -v huggingface-cli >/dev/null 2>&1; then
        hf_bin="$(command -v huggingface-cli)"
      fi
      if [ -n "$hf_bin" ]; then
        say "[setup] $(t hf_install_success)"
      else
        say "[setup] $(t hf_install_failed)" >&2
      fi
    else
      say "[setup] $(t hf_install_failed)" >&2
    fi
  fi
  HUGGINGFACE_BIN="$hf_bin"
}

HUGGINGFACE_BIN=""

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
CB_CHANNEL_SELECTED=${CB_CHANNEL_SELECTED:-}
[ -f .env ] && CB_CHANNEL_SELECTED=$(awk -F= '$1=="CB_CHANNEL_SELECTED"{print substr($0,index($0,$2))}' .env | tail -n1 | tr -d '"' || true)
CB_CHANNEL_SELECTED=${CB_CHANNEL_SELECTED:-}

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
    storage_l1) echo "- アセットの保存先を指定します (Postgres データは Docker のボリュームに保存されます)";; \
    storage_l2) echo "- 外部ストレージなど、このフォルダ以外の場所に保存する場合は指定してください";; \
    storage_use_defaults) echo "既定 (./data/assets)";; \
    storage_custom) echo "アセットの保存先を指定";; \
    storage_skip) echo "スキップ";; \
    dir_missing_title) echo "指定したパスにフォルダが存在しません";; \
    dir_create) echo "そのパスに assets フォルダを作成する";; \
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
    py_install_start) echo "Python3 が見つからないため、apt-get でインストールします（pyenv 推奨ですが自動インストールを試みます）。";; \
    py_install_success) echo "Python3 のインストールが完了しました。";; \
    py_install_failed) echo "Python3 のインストールに失敗しました。手動で pyenv などを使用してセットアップしてください。";; \
    py_ensurepip_start) echo "venv/pip を有効化するために python3-venv 等をインストールします。";; \
    py_ensurepip_success) echo "venv/pip の有効化が完了しました。";; \
    py_ensurepip_failed) printf "venv/pip を自動設定できませんでした。'sudo apt install %s' を実行してから再試行してください。" "$2";; \
    py_required) echo "自動タグ付けを有効化するには Python3 が必要です。インストール後にもう一度実行してください。";; \
    hf_install_start) echo "huggingface-cli が見つからないため、pip でインストールします。";; \
    hf_install_success) echo "huggingface-cli をインストールしました。";; \
    hf_install_failed) echo "huggingface-cli のインストールに失敗しました。pip で手動インストールしてください。";; \
    hf_download_prompt) echo "JoyTag モデルをダウンロードしますか?";; \
    hf_download_now) echo "今すぐダウンロード";; \
    hf_download_skip) echo "スキップ (あとで手動ダウンロード)";; \
    hf_download_skip_msg) echo "モデルの自動ダウンロードをスキップしました。後で externals/joytag/models に配置してください。";; \
    hf_download_failed) echo "モデルのダウンロードに失敗しました。huggingface-cli で手動ダウンロードしてください。";; \
    prisma_p3005_notice) echo "既存のデータベーススキーマが見つかったため、migrate をスキップして schema push に切り替えました (データは維持されます)。";; \
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
    channel_select_title) echo "使用したいチャンネルを選択してください";; \
    channel_select_info) echo "推奨: 安定版(stable)。開発版(dev)は新機能が早く試せますが不安定な場合があります。";; \
    channel_select_stable) echo "安定版 (stable)";; \
    channel_select_dev) echo "開発版 (dev)";; \
    channel_select_skip) echo "スキップ（後で設定）";; \
    channel_select_done) echo "チャンネルを設定しました。";; \
    channel_select_skip_msg) echo "チャンネル設定をスキップしました。";; \
  esac \
  ;; * ) 
  case "$k" in \
    storage_title) echo "Storage configuration:";; \
    storage_l1) echo "- Specify where to store assets (Postgres data stays inside Docker)";; \
    storage_l2) echo "- Point to external storage if you want assets outside this folder";; \
    storage_use_defaults) echo "Recommended defaults: use ./data/assets";; \
    storage_custom) echo "Enter an assets directory (mapped to /app/data)";; \
    storage_skip) echo "Skip (do not create local override)";; \
    dir_missing_title) echo "Path does not exist. What would you like to do?";; \
    dir_create) echo "Create it (assets/)";; \
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
    py_install_start) echo "Python3 not found. Attempting apt-get install (pyenv recommended for advanced usage).";; \
    py_install_success) echo "Python3 installation completed.";; \
    py_install_failed) echo "Failed to install Python3. Please install it manually (pyenv recommended).";; \
    py_ensurepip_start) echo "Installing python3-venv/pip packages to enable venv and pip.";; \
    py_ensurepip_success) echo "venv/pip enablement completed.";; \
    py_ensurepip_failed) printf "Could not enable venv/pip automatically. Please run 'sudo apt install %s' manually and retry." "$2";; \
    py_required) echo "Python3 is required to enable auto-tagging. Please install it and run again.";; \
    hf_install_start) echo "huggingface-cli not found. Installing via pip.";; \
    hf_install_success) echo "huggingface-cli installed.";; \
    hf_install_failed) echo "Failed to install huggingface-cli. Install via pip manually.";; \
    hf_download_prompt) echo "Download JoyTag models now?";; \
    hf_download_now) echo "Download now";; \
    hf_download_skip) echo "Skip (download later)";; \
    hf_download_skip_msg) echo "Skipped automatic model download. Place files under externals/joytag/models later.";; \
    hf_download_failed) echo "Model download failed. Please run huggingface-cli manually.";; \
    prisma_p3005_notice) echo "Existing database schema detected. Falling back to schema push (data preserved).";; \
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
    channel_select_title) echo "Select the release channel you want to use";; \
    channel_select_info) echo "Recommended: stable. dev gives faster features but may be unstable.";; \
    channel_select_stable) echo "Stable (stable)";; \
    channel_select_dev) echo "Development (dev)";; \
    channel_select_skip) echo "Skip (configure later)";; \
    channel_select_done) echo "Channel has been set.";; \
    channel_select_skip_msg) echo "Skipped channel selection.";; \
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
    return 0
  fi
  if [ ! -d .git ]; then
    say "[setup] $(t channel_not_repo)"
    return 0
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

if ! $CHANNEL_MODE && $INTERACTIVE && [ -z "$CB_CHANNEL_SELECTED" ]; then
  begin_question "$(t channel_select_title)"
  say "$(t channel_select_info)"; hr
  channel_sel=$(menu_ask "" 1 "$(t channel_select_stable)" "$(t channel_select_dev)" "$(t channel_select_skip)")
  case "$channel_sel" in
    1)
      if run_channel_command stable; then
        write_env CB_CHANNEL_SELECTED stable
        CB_CHANNEL_SELECTED=stable
        say "[setup] $(t channel_select_done)"
      fi
      ;;
    2)
      if run_channel_command dev; then
        write_env CB_CHANNEL_SELECTED dev
        CB_CHANNEL_SELECTED=dev
        say "[setup] $(t channel_select_done)"
      fi
      ;;
    3)
      write_env CB_CHANNEL_SELECTED skip
      CB_CHANNEL_SELECTED=skip
      say "[setup] $(t channel_select_skip_msg)"
      ;;
  esac
  echo ""
fi

# 1.5) Dependency notes (Python hint for JoyTag)
python_ok=false; if have python3; then python_ok=true; fi
if ! $python_ok; then
  say "[setup] $(t py_install_start)"
  INSTALL_STATUS=1
  if have apt-get; then
    set +e
    if have sudo; then
      sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
      INSTALL_STATUS=$?
    else
      apt-get update && apt-get install -y python3 python3-venv python3-pip
      INSTALL_STATUS=$?
    fi
    set -e
    if [ ${INSTALL_STATUS:-1} -eq 0 ] && have python3; then
      python_ok=true
      say "[setup] $(t py_install_success)"
    else
      say "[setup] $(t py_install_failed)" >&2
    fi
  else
    say "[setup] $(t py_install_failed)" >&2
  fi
fi
if ! $python_ok; then
  say "[setup] $(t py_hint)"
  echo ""
fi
if $python_ok; then
  PY_MM=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")
  PY_VENV_HINT="python3-venv"
  if [ -n "$PY_MM" ]; then
    PY_VENV_HINT="$PY_VENV_HINT python${PY_MM}-venv"
  fi
  if ! python3 -m ensurepip --version >/dev/null 2>&1; then
    if have apt-get; then
      say "[setup] $(t py_ensurepip_start)"
      set +e
      if have sudo; then
        sudo apt-get update >/dev/null 2>&1
      else
        apt-get update >/dev/null 2>&1
      fi
      PKG_CANDIDATES=(python3-venv python3-pip python3-distutils python3-ensurepip)
      if [ -n "$PY_MM" ]; then
        PKG_CANDIDATES+=("python${PY_MM}-venv" "python${PY_MM}-distutils" "python${PY_MM}-pip" "python${PY_MM}-ensurepip")
      fi
      for pkg in "${PKG_CANDIDATES[@]}"; do
        if [ -n "$pkg" ]; then
          if have sudo; then
            sudo apt-get install -y "$pkg" >/dev/null 2>&1
          else
            apt-get install -y "$pkg" >/dev/null 2>&1
          fi
        fi
      done
      set -e
    fi
    if python3 -m ensurepip --version >/dev/null 2>&1; then
      say "[setup] $(t py_ensurepip_success)"
    else
      say "[setup] $(t py_ensurepip_failed "$PY_VENV_HINT")" >&2
    fi
  fi
  if python3 -m ensurepip --version >/dev/null 2>&1; then
    set +e
    python3 -m ensurepip --default-pip >/dev/null 2>&1
    python3 -m pip install --upgrade pip >/dev/null 2>&1
    set -e
  fi
fi

# 2) Ensure default directories
ASSETS_DEFAULT="$ROOT_DIR/data/assets"
mkdir -p "$ASSETS_DEFAULT" "$ROOT_DIR/data" || true
[ -f "$ROOT_DIR/data/.gitkeep" ] || : > "$ROOT_DIR/data/.gitkeep"
[ -f "$ASSETS_DEFAULT/.gitkeep" ] || : > "$ASSETS_DEFAULT/.gitkeep"

# 4) Storage setup → generate docker-compose.local.yml as needed
assets_path="$ASSETS_DEFAULT"
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
        mkdir -p "$data_root/assets" || true
        break
      fi
      # Otherwise loop to re-enter
    done
    assets_path="$data_root/assets"
  fi
  mkdir -p "$assets_path" || true

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

  if [ -n "$PLATFORM_LINE" ]; then
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
YAML
  else
    cat > docker-compose.local.yml <<YAML
services:
  app:
    environment:
      - FILES_STORAGE=/app/data
    volumes:
      - ${assets_path}:/app/data
YAML
  fi
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
      set +e
      if [ -x "$JOYTAG_EXT_DIR/venv/bin/python" ]; then
        # shellcheck disable=SC1091
        source "$JOYTAG_EXT_DIR/venv/bin/activate" 2>/dev/null
        python -m pip install --upgrade pip >/dev/null 2>&1
        if [ -f "$JOYTAG_EXT_DIR/requirements-server.txt" ]; then
          pip install -r "$JOYTAG_EXT_DIR/requirements-server.txt"
        fi
        deactivate 2>/dev/null || true
      fi
      set -e
    fi

    ensure_huggingface_cli "$JOYTAG_EXT_DIR"

    # Models: prompt if missing
    if [ ! -d "$JOYTAG_EXT_DIR/models" ] || [ -z "$(ls -A "$JOYTAG_EXT_DIR/models" 2>/dev/null)" ]; then
      sel_models=$(menu_ask "$(t hf_download_prompt)" 1 "$(t hf_download_now)" "$(t hf_download_skip)")
      if [ "$sel_models" = "1" ]; then
        if [ -z "$HUGGINGFACE_BIN" ]; then
          menu_print "[setup] $(t hf_install_failed)"
        else
          mkdir -p "$JOYTAG_EXT_DIR/models"
          set +e
          "$HUGGINGFACE_BIN" download fancyfeast/joytag --local-dir "$JOYTAG_EXT_DIR/models" --local-dir-use-symlinks False
          DL_STATUS=$?
          set -e
          if [ ${DL_STATUS:-1} -ne 0 ]; then
            menu_print "[setup] $(t hf_download_failed)"
          fi
        fi
      else
        say "[setup] $(t hf_download_skip_msg)"
      fi
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
  TMP_MIGR_LOG=$(mktemp -t cb-migrate.XXXXXX)
  set +e
  dc run --rm app npm run db:migrate:prod 2>&1 | tee "$TMP_MIGR_LOG"
  MIGR_EXIT=${PIPESTATUS[0]}
  set -e
  if [ ${MIGR_EXIT:-1} -ne 0 ]; then
    if grep -q "P3005" "$TMP_MIGR_LOG"; then
      say "[setup] $(t prisma_p3005_notice)"
    fi
    dc run --rm app npm run db:push
  fi
  rm -f "$TMP_MIGR_LOG"
else
  dc run --rm app npm run db:push
fi
echo "[setup] Database ready."

# Stop containers after setup; users should use ./serve.sh to run
say "[setup] $(t stop_services)"
dc down

say "[setup] $(t done)"
echo "- Language: $CB_LANG"
echo "- JoyTag enabled: $CB_ENABLE_JOYTAG (info: $JOYTAG_INFO_URL)"
echo "- Assets: ${assets_path:-$ASSETS_DEFAULT}"
echo "- Postgres: Docker volume (/var/lib/postgresql/data)"
echo "- Next: ./serve.sh   or   ./serve.sh update"
