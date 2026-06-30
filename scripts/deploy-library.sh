#!/usr/bin/env bash

# Quick Share Library - Deploy to Cloudflare Pages
# This deploys a public file library that lists all your R2 files

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

LIBRARY_DIR="$(cd "$(dirname "$0")/../assets/library" && pwd)"
PROJECT_NAME="${1:-quick-share-library}"
WORKER_URL="${QUICK_SHARE_WORKER_URL:-}"
PUBLIC_URL="${QUICK_SHARE_PUBLIC_URL:-}"

echo -e "${BLUE}⚡ Deploying Quick Share Library to Cloudflare Pages...${NC}\n"

# Check for wrangler
if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}wrangler CLI is not installed.${NC}"
  echo "Install it with: npm install -g wrangler"
  exit 1
fi

# Check if logged in
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
  echo "Please run: wrangler login"
  exit 1
fi

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
cp -r "$LIBRARY_DIR"/* "$TEMP_DIR/"

if [[ -n "$WORKER_URL" || -n "$PUBLIC_URL" ]]; then
  node - "$TEMP_DIR/index.html" "$WORKER_URL" "$PUBLIC_URL" <<'NODE'
const fs = require("node:fs");
const [file, workerUrl, publicUrl] = process.argv.slice(2);
let html = fs.readFileSync(file, "utf8");
if (workerUrl) {
  html = html.replace('const DEFAULT_WORKER_URL = "";', `const DEFAULT_WORKER_URL = ${JSON.stringify(workerUrl)};`);
}
if (publicUrl) {
  html = html.replace('const DEFAULT_PUBLIC_URL = "";', `const DEFAULT_PUBLIC_URL = ${JSON.stringify(publicUrl)};`);
}
fs.writeFileSync(file, html);
NODE
fi

echo -e "\n${GREEN}✓ Files prepared${NC}"

# Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
cd "$TEMP_DIR"

# Use wrangler pages to deploy
wrangler pages project list 2>/dev/null | grep -q "$PROJECT_NAME" || wrangler pages project create "$PROJECT_NAME"

wrangler pages deploy "$TEMP_DIR" --project-name="$PROJECT_NAME"

echo -e "\n${GREEN}✓ Library deployed!${NC}"
echo ""
echo "Your library is live at:"
echo "  https://$PROJECT_NAME.pages.dev"
echo ""
if [[ -z "$WORKER_URL" ]]; then
  echo -e "${YELLOW}No default worker URL was baked into this deploy.${NC}"
  echo "Open with:"
  echo "  https://$PROJECT_NAME.pages.dev?worker=https://YOUR-WORKER.workers.dev/files&public=https://YOUR-PUBLIC-BUCKET.r2.dev"
  echo ""
fi
echo "To use a custom domain:"
echo "  wrangler pages domain add $PROJECT_NAME yourdomain.com"
