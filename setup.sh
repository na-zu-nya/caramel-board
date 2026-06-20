#!/usr/bin/env bash
set -euo pipefail

CHECKPOINT_REF="${CARAMEL_BOARD_LEGACY_DOCKER_REF:-release/v1.0.8}"

cat <<EOF
Caramel Board CLI / Docker 版は ${CHECKPOINT_REF} をチェックポイントとして凍結しました。
このブランチでは Docker セットアップを提供していません。

旧 Docker 版を利用する場合:
  git fetch origin ${CHECKPOINT_REF}
  git checkout ${CHECKPOINT_REF}
  ./setup.sh

通常利用は Desktop 版を推奨します:
  https://github.com/na-zu-nya/caramel-board/releases

The CLI / Docker setup is frozen at ${CHECKPOINT_REF}.
This branch no longer provides Docker setup.
EOF

exit 1
