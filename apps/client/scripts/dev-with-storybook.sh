#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[client] Starting Storybook (:6006) and Vite (:3000)"

cleanup() {
  echo "[client] Shutting down Storybook/Vite"
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start Storybook
npm run dev:storybook &

# Start Vite
npm run dev:vite &

wait

