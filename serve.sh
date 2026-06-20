#!/usr/bin/env bash
set -euo pipefail

CHECKPOINT_REF="${CARAMEL_BOARD_LEGACY_DOCKER_REF:-release/v1.0.8}"
MODE="${1:-prod}"

cat <<EOF
Caramel Board CLI / Docker 版は ${CHECKPOINT_REF} をチェックポイントとして凍結しました。
このブランチは Desktop / SQLite 版の開発ラインです。

旧 Docker 版を継続起動する場合:
  git fetch origin ${CHECKPOINT_REF}
  git checkout ${CHECKPOINT_REF}
  ./serve.sh prod

Desktop 版へ移行する場合:
  1. 旧 Docker 版を ${CHECKPOINT_REF} で起動
  2. Desktop 版を GitHub Releases からインストール
  3. 初回セットアップ、または Settings の「Docker版からの移行」を実行

The CLI / Docker edition is frozen at ${CHECKPOINT_REF}.
This branch is now for the Desktop / SQLite edition.
EOF

if [ "$MODE" = "update" ]; then
  cat <<EOF

注意: ./serve.sh update は廃止しました。
mainline へ更新せず、上記のチェックポイントへ切り替えて利用してください。
EOF
fi

exit 1
