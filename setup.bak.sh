#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Pretty UI helpers (colors/emojis)
# ------------------------------------------------------------
ESC="\033"
RESET="${ESC}[0m"; BOLD="${ESC}[1m"; DIM="${ESC}[2m"
FG_CYAN="${ESC}[36m"; FG_MAGENTA="${ESC}[35m"; FG_GREEN="${ESC}[32m"; FG_YELLOW="${ESC}[33m"; FG_BLUE="${ESC}[34m"

say() { printf "%b\n" "$1"; }
hr() { printf "%b\n" "${DIM}────────────────────────────────────────────────────────${RESET}"; }

# Minimal, clear prompts (numeric inputs)
choose_menu() {
  # choose_menu "Prompt title" defaultIndex options...
  local title="$1"; shift
  local defIndex="$1"; shift
  local options=("$@")
  >&2 echo "$title"
  local i=1
  for opt in "${options[@]}"; do >&2 echo "${i}) ${opt}"; i=$((i+1)); done
  >&2 printf "[default:%s]: " "$defIndex"
  local choice; read -r choice || choice="$defIndex"
  choice=${choice:-$defIndex}
  if [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le ${#options[@]} ] 2>/dev/null; then
    echo "$choice"
  else
    echo "$defIndex"
  fi
}

prompt_input() {
  # prompt_input "Prompt title" "default"
  local title="$1"; local def="$2"
  >&2 printf "%s\n[default:%s]: " "$title" "$def"
  local ans; read -r ans || ans="$def"
  echo "${ans:-$def}"
}

# ------------------------------------------------------------
# Load preferences from .env (language, toggles)
# ------------------------------------------------------------
CB_LANG="en"   # default: English
CB_ENABLE_JOYTAG="false"
JOYTAG_INFO_URL="https://github.com/fpgaminer/joytag"
if [ -f .env ]; then
  CB_LANG=$(grep -E '^[[:space:]]*CB_LANG=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  CB_ENABLE_JOYTAG=$(grep -E '^[[:space:]]*CB_ENABLE_JOYTAG=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  JOYTAG_INFO_URL=$(grep -E '^[[:space:]]*JOYTAG_INFO_URL=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  CB_LANG=${CB_LANG:-en}
  CB_ENABLE_JOYTAG=${CB_ENABLE_JOYTAG:-false}
  JOYTAG_INFO_URL=${JOYTAG_INFO_URL:-https://github.com/fpgaminer/joytag}
fi

# Persist helpers
update_env() {
  local key="$1"; local val="$2"
  touch .env
  if grep -qE "^${key}=" .env; then
    awk -v k="$key" -v v="$val" -F= 'BEGIN{OFS="="} $1==k{$0=k"="v} $1!=k{print $0}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "${key}=${val}" >> .env
  fi
}

# i18n
t() {
  local key=$1
  case "$CB_LANG" in
    ja)
      case "$key" in
        hello) echo "${BOLD}CaramelBoard セットアップ${RESET} ${FG_MAGENTA}🍬🤎${RESET}" ;;
        intro) echo "ようこそ！いくつかの質問に答えるだけで準備が整います。" ;;
        lang_title) echo "言語を選択してください:" ;;
        chosen_en) echo "言語: 英語 (English)" ;;
        chosen_ja) echo "言語: 日本語" ;;
        check_tools) echo "ツールを確認しています…" ;;
        install_deps_ci) echo "npm 依存をインストール中 (npm ci)…" ;;
        install_deps_i) echo "npm 依存をインストール中 (npm install)…" ;;
        up_dev) echo "開発用サービスを起動しています (docker-compose.dev.yml)…" ;;
        prisma_gen) echo "Prisma クライアントを生成しています…" ;;
        joytag_title) echo "オプション: 自動タグ付け (JoyTag) を有効化しますか？" ;;
        joytag_desc1) echo "- JoyTagはローカルで動作する、画像のタグの確率を計算する推論ライブラリです" ;;
        joytag_desc2) echo "- この機能は、登録された画像をローカルで解析して、**タグを推定する用途のみ**に使用します。 **新規生成・学習・外部送信は行いません。**" ;;
        joytag_desc3) echo "- JoyTagの規約については各自URLから確認し、利用者の責任において活用ください: ${JOYTAG_INFO_URL}" ;;
        joytag_enable_title) echo "選択してください:" ;;
        joytag_enable_yes) echo "有効化する（いまセットアップ）" ;;
        joytag_enable_no) echo "無効のままにする（あとで有効化可）" ;;
        joytag_skipping) echo "JoyTag セットアップをスキップします（後から ./setup.sh で有効化できます）。" ;;
        joytag_fetch) echo "JoyTag を externals/joytag に取得/更新します…" ;;
        joytag_copy_bridge) echo "連携ブリッジを配置しています…" ;;
        joytag_venv) echo "Python 仮想環境と依存をセットアップしています…" ;;
        joytag_models) echo "モデルの準備を案内します（大容量・任意）。" ;;
        done) echo "セットアップ完了。今後は ${BOLD}./serve.sh${RESET} を実行してください。" ;;
        gen_local) echo "ローカル用 docker-compose.local.yml を作成しますか？" ;;
        ask_files) echo "ホスト上の files ディレクトリのパス: " ;;
        ask_pg) echo "ホスト上の Postgres データパス: " ;;
        created_local) echo "生成しました: docker-compose.local.yml" ;;
        *) echo "$key" ;;
      esac
      ;;
    *)
      case "$key" in
        hello) echo "${BOLD}CaramelBoard Setup${RESET} ${FG_MAGENTA}🍬🤎${RESET}" ;;
        intro) echo "Welcome! Answer a few questions to get ready." ;;
        lang_title) echo "Select language:" ;;
        chosen_en) echo "Language: English" ;;
        chosen_ja) echo "Language: Japanese" ;;
        check_tools) echo "Checking required tools…" ;;
        install_deps_ci) echo "Installing npm dependencies (npm ci)…" ;;
        install_deps_i) echo "Installing npm dependencies (npm install)…" ;;
        up_dev) echo "Bringing up dev services (docker-compose.dev.yml)…" ;;
        prisma_gen) echo "Generating Prisma client…" ;;
        joytag_title) echo "Optional: Auto‑Tagging (JoyTag) — Enable now?" ;;
        joytag_desc1) echo "- JoyTag is a local inference library that estimates tag probabilities for your images" ;;
        joytag_desc2) echo "- Used only to estimate tags locally; **no generation, no training, no network uploads**" ;;
        joytag_desc3) echo "- Please review JoyTag terms at: ${JOYTAG_INFO_URL}" ;;
        joytag_enable_title) echo "Select:" ;;
        joytag_enable_yes) echo "Enable (set up now)" ;;
        joytag_enable_no) echo "Keep disabled (you can enable later)" ;;
        joytag_skipping) echo "Skipping JoyTag setup (you can enable later via ./setup.sh)." ;;
        joytag_fetch) echo "Fetching/updating JoyTag into externals/joytag…" ;;
        joytag_copy_bridge) echo "Placing integration bridge files…" ;;
        joytag_venv) echo "Preparing Python venv and dependencies…" ;;
        joytag_models) echo "We will guide you to prepare models (optional, large)." ;;
        done) echo "Done. You can now run ${BOLD}./serve.sh${RESET}." ;;
        gen_local) echo "Generate docker-compose.local.yml?" ;;
        ask_files) echo "Host path for files directory: " ;;
        ask_pg) echo "Host path for Postgres data: " ;;
        created_local) echo "Created: docker-compose.local.yml" ;;
        *) echo "$key" ;;
      esac
      ;;
  esac
}

say "${FG_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
say "$(t hello)"
say "${DIM}$(t intro)${RESET}"
say "${FG_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 0) Ask language on first run (store in .env)
if [ -t 0 ]; then
  if [ -z "${CB_LANG:-}" ]; then CB_LANG="en"; fi
  sel=$(choose_menu "$(t lang_title)" 1 "English" "日本語")
  if [ "$sel" = "2" ]; then CB_LANG="ja"; say "$(t chosen_ja)"; else CB_LANG="en"; say "$(t chosen_en)"; fi
  update_env CB_LANG "$CB_LANG"
fi

# 1) Check tooling
say "$(t check_tools)"
have() { command -v "$1" >/dev/null 2>&1; }

if ! have node; then echo "[setup] ERROR: 'node' not found" >&2; exit 1; fi
if ! have npm;  then echo "[setup] ERROR: 'npm' not found"  >&2; exit 1; fi
if ! have docker; then echo "[setup] ERROR: 'docker' not found" >&2; exit 1; fi

# docker compose plugin or legacy docker-compose binary
if docker compose version >/dev/null 2>&1; then :
elif have docker-compose; then :
else
  echo "[setup] ERROR: 'docker compose' (or legacy 'docker-compose') not found" >&2
  exit 1
fi

echo "[setup] Node: $(node -v)"
echo "[setup] NPM:  $(npm -v)"

# 2) Install JS deps
if [ -f package-lock.json ]; then
  echo "[setup] $(t install_deps_ci)"
  npm ci
else
  echo "[setup] $(t install_deps_i)"
  npm install
fi

# 3) Prepare dev services (DB)
if [ -f docker-compose.dev.yml ]; then
  echo "[setup] $(t up_dev)"
  docker-compose -f docker-compose.dev.yml up -d || docker compose -f docker-compose.dev.yml up -d
fi

# 4) Generate Prisma client
if [ -f apps/server/prisma/schema.prisma ]; then
  echo "[setup] $(t prisma_gen)"
  (cd apps/server && npx prisma generate)
fi

# 5) (Optional, opt-in) Prepare JoyTag server (external)
if [ -t 0 ]; then
  echo ""
  echo "${FG_YELLOW}$(t joytag_title)${RESET}"
  say "$(t joytag_desc1)"
  say "$(t joytag_desc2)"
  say "$(t joytag_desc3)"
  sel=$(choose_menu "$(t joytag_enable_title)" 2 "$(t joytag_enable_yes)" "$(t joytag_enable_no)")
  if [ "$sel" = "1" ]; then
      
      update_env CB_ENABLE_JOYTAG true
      CB_ENABLE_JOYTAG=true
      echo "[setup] $(t joytag_fetch)"
      JOYTAG_EXT_DIR="$ROOT_DIR/externals/joytag"
      mkdir -p "$ROOT_DIR/externals"

      if [ ! -d "$JOYTAG_EXT_DIR" ]; then
        echo "[setup] Cloning https://github.com/fpgaminer/joytag …"
        if command -v git >/dev/null 2>&1; then
          set +e
          git clone --depth=1 https://github.com/fpgaminer/joytag "$JOYTAG_EXT_DIR"
          GIT_STATUS=$?
          set -e
          if [ $GIT_STATUS -ne 0 ]; then
            echo "[setup] git clone failed; trying ZIP download."
          fi
        else
          GIT_STATUS=1
        fi

        if [ ${GIT_STATUS:-1} -ne 0 ]; then
          if command -v curl >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
            TMP_ZIP="$(mktemp -t joytag.XXXXXX).zip"
            curl -L -o "$TMP_ZIP" https://github.com/fpgaminer/joytag/archive/refs/heads/main.zip
            unzip -q "$TMP_ZIP" -d "$ROOT_DIR/externals"
            rm -f "$TMP_ZIP"
            mv "$ROOT_DIR/externals/joytag-main" "$JOYTAG_EXT_DIR"
          else
            echo "[setup] WARNING: curl/unzip not found. Please place https://github.com/fpgaminer/joytag at externals/joytag manually."
          fi
        fi
      else
        echo "[setup] Using existing externals/joytag"
      fi

      # Provide CaramelBoard server bridge + requirements
      INTEG_DIR="$ROOT_DIR/integrations/joytag"
      if [ -f "$INTEG_DIR/joytag_server.py" ]; then
        cp -f "$INTEG_DIR/joytag_server.py" "$JOYTAG_EXT_DIR/joytag_server.py"
        echo "[setup] $(t joytag_copy_bridge)"
      fi
      if [ -f "$INTEG_DIR/requirements-server.txt" ]; then
        cp -f "$INTEG_DIR/requirements-server.txt" "$JOYTAG_EXT_DIR/requirements-server.txt"
        echo "[setup] Copied requirements-server.txt into externals/joytag/"
      fi

      # Python venv and deps
      if command -v python3 >/dev/null 2>&1; then
        if [ ! -d "$JOYTAG_EXT_DIR/venv" ]; then
          echo "[setup] $(t joytag_venv)"
          python3 -m venv "$JOYTAG_EXT_DIR/venv" || true
        fi
        if [ -f "$JOYTAG_EXT_DIR/requirements-server.txt" ]; then
          echo "[setup] Installing JoyTag server requirements..."
          set +e
          source "$JOYTAG_EXT_DIR/venv/bin/activate" 2>/dev/null && pip install --upgrade pip && pip install -r "$JOYTAG_EXT_DIR/requirements-server.txt"
          set -e
        else
          echo "[setup] NOTE: requirements-server.txt not found under externals/joytag. Install dependencies manually if needed."
        fi
      else
        echo "[setup] WARNING: python3 not found; JoyTag server setup skipped."
      fi

      # Models acquisition (interactive)
      if [ ! -d "$JOYTAG_EXT_DIR/models" ] || [ -z "$(ls -A "$JOYTAG_EXT_DIR/models" 2>/dev/null)" ]; then
        echo "[setup] $(t joytag_models)"
        sel=$(choose_menu "Select a method" 4 \
          "huggingface-cli download (fancyfeast/joytag)" \
          "git lfs clone (huggingface.co/fancyfeast/joytag)" \
          "use existing local path" \
          "skip")
        choice="$sel"
        case "$choice" in
          1)
            if command -v huggingface-cli >/dev/null 2>&1; then
              echo "[setup] Starting download (large; will take time)…"
              set +e
              huggingface-cli download fancyfeast/joytag --local-dir "$JOYTAG_EXT_DIR/models" --local-dir-use-symlinks False
              HF_STATUS=$?
              set -e
              if [ $HF_STATUS -ne 0 ]; then
                echo "[setup] huggingface-cli download failed."
              fi
            else
              echo "[setup] huggingface-cli not found. Install via 'pip install -U huggingface_hub'."
            fi
            ;;
          2)
            if command -v git >/dev/null 2>&1 && command -v git-lfs >/dev/null 2>&1; then
              echo "[setup] Fetching models via git lfs (large)…"
              mkdir -p "$JOYTAG_EXT_DIR"
              (cd "$JOYTAG_EXT_DIR" && git lfs install && git clone https://huggingface.co/fancyfeast/joytag models)
            else
              echo "[setup] git / git-lfs not found; option 2 unavailable."
            fi
            ;;
          3)
            model_src=$(prompt_input "[setup] Enter existing models directory path" "")
            if [ -n "$model_src" ] && [ -d "$model_src" ]; then
              mkdir -p "$JOYTAG_EXT_DIR/models"
              echo "[setup] モデルをコピー中..."
              cp -R "$model_src"/* "$JOYTAG_EXT_DIR/models/" || true
            else
              echo "[setup] Invalid path. Skipping."
            fi
            ;;
          *)
            echo "[setup] Skipped model download. You can place models manually as per README."
            ;;
        esac
      fi
      ;;
    else
      update_env CB_ENABLE_JOYTAG false
      CB_ENABLE_JOYTAG=false
      echo "[setup] $(t joytag_skipping)"
  fi
fi

echo "[setup] $(t done)"

# 6) Optional: generate docker-compose.local.yml
#    - Skips in non-interactive shells.
if [ -t 0 ]; then
  if [ ! -f docker-compose.local.yml ]; then
    echo ""
    echo "[setup] docker-compose.local.yml (local overrides)"
    echo "[setup] (.gitignored; not tracked by Git)"
    sel=$(choose_menu "$(t gen_local)" 1 "Yes" "No")
    if [ "$sel" = "1" ]; then
        default_files_host="$ROOT_DIR/data/assets"
        default_pg_host="$ROOT_DIR/data/postgres"
        echo ""
        files_host=$(prompt_input "[setup] $(t ask_files)" "$default_files_host")
        pg_host=$(prompt_input "[setup] $(t ask_pg)" "$default_pg_host")

        # 存在チェックと作成提案
        if [ ! -d "$files_host" ]; then
          sel=$(choose_menu "[setup] '$files_host' がありません。作成しますか？" 1 "Yes" "No")
          if [ "$sel" = "1" ]; then mkdir -p "$files_host" || true; fi
        fi
        if [ ! -d "$pg_host" ]; then
          sel=$(choose_menu "[setup] '$pg_host' がありません。作成しますか？" 1 "Yes" "No")
          if [ "$sel" = "1" ]; then mkdir -p "$pg_host" || true; fi
        fi

        cat > docker-compose.local.yml <<YAML
# CaramelBoard: local overrides (generated by setup.sh)
# このファイルは Git 管理外です（.gitignore 済み）

services:
  app:
    environment:
      - FILES_STORAGE=/app/data  # 重要: /app/data を指定（/app/data/files ではない）
    volumes:
      - ${files_host}:/app/data

  postgres:
    volumes:
      - ${pg_host}:/var/lib/postgresql/data
YAML
        echo "[setup] $(t created_local)"
    fi
  fi
fi
