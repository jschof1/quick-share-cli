#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-8788}"
LIBRARY_DIR="$(cd "$(dirname "$0")/../assets/library" && pwd)"

echo "Serving Quick Share Library"
echo "  Directory: $LIBRARY_DIR"
echo "  URL:       http://localhost:$PORT"
echo ""
echo "Use query params to wire a live worker:"
echo "  http://localhost:$PORT/?worker=https://YOUR-WORKER.workers.dev/files&public=https://YOUR-PUBLIC-BUCKET.r2.dev"
echo ""

cd "$LIBRARY_DIR"
python3 -m http.server "$PORT"
