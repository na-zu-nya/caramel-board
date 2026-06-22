#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
export PORT="${2:-${PORT:-6777}}"
export STANDALONE_SQLITE_PATH="${1:-${STANDALONE_SQLITE_PATH:-exports/imported-reference-check.sqlite}}"

cd "$ROOT_DIR"

exec node apps/server/dist/entry.node.mjs
