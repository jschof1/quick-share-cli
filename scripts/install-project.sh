#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/project [api-url] [prefix]" >&2
  echo "Or set QUICK_SHARE_API_URL first." >&2
  exit 2
fi

PROJECT_DIR="$1"
API_URL="${2:-${QUICK_SHARE_API_URL:-}}"
PREFIX="${3:-}"

if [[ -z "$API_URL" ]]; then
  echo "Usage: $0 /path/to/project https://quick-share-api.example.workers.dev [prefix]" >&2
  echo "Or set QUICK_SHARE_API_URL first." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$SCRIPT_DIR/bin/quick-share.js" init "$API_URL" "$PREFIX" --project "$PROJECT_DIR"
