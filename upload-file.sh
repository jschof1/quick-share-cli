#!/bin/bash

# Quick File Upload to Cloudflare R2
# Usage: ./upload-image.sh <file>

set -e

CONFIG_FILE="$HOME/.r2-config"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check args
if [ $# -eq 0 ]; then
    echo "Usage: upload-file <file>"
    echo "Supports: images, PDFs, videos, documents, archives, etc."
    exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found"
    exit 1
fi

# Load config
source "$CONFIG_FILE"

# Get file info
BASENAME=$(basename "$FILE")
FILE_SIZE=$(ls -lh "$FILE" | awk '{print $5}')

# Detect MIME type
if command -v file &> /dev/null; then
    MIME_TYPE=$(file --mime-type -b "$FILE")
else
    # Fallback based on extension
    case "${BASENAME##*.}" in
        jpg|jpeg) MIME_TYPE="image/jpeg" ;;
        png) MIME_TYPE="image/png" ;;
        gif) MIME_TYPE="image/gif" ;;
        webp) MIME_TYPE="image/webp" ;;
        svg) MIME_TYPE="image/svg+xml" ;;
        pdf) MIME_TYPE="application/pdf" ;;
        mp4) MIME_TYPE="video/mp4" ;;
        mov) MIME_TYPE="video/quicktime" ;;
        mp3) MIME_TYPE="audio/mpeg" ;;
        zip) MIME_TYPE="application/zip" ;;
        tar|gz) MIME_TYPE="application/gzip" ;;
        txt) MIME_TYPE="text/plain" ;;
        json) MIME_TYPE="application/json" ;;
        *) MIME_TYPE="application/octet-stream" ;;
    esac
fi

# Upload using rclone
echo "Uploading $BASENAME ($FILE_SIZE, $MIME_TYPE)..."

rclone copy "$FILE" ":s3:$BUCKET_NAME" \
    --s3-provider=Cloudflare \
    --s3-endpoint="$R2_ENDPOINT" \
    --s3-access-key-id="$R2_ACCESS_KEY_ID" \
    --s3-secret-access-key="$R2_SECRET_ACCESS_KEY" \
    --s3-acl=public-read \
    --s3-region=auto \
    --s3-no-check-bucket \
    --quiet

# Build URL
PUBLIC_URL="$R2_PUBLIC_URL/$BASENAME"

# Output
echo -e "\n${GREEN}✓ Uploaded!${NC}\n"
echo -e "${BLUE}URL:${NC} $PUBLIC_URL"
echo -e "${BLUE}Size:${NC} $FILE_SIZE"
echo -e "${BLUE}Type:${NC} $MIME_TYPE"

# File-type specific output
if [[ "$MIME_TYPE" == image/* ]]; then
    echo ""
    echo -e "${YELLOW}Markdown:${NC} ![file]($PUBLIC_URL)"
    echo -e "${YELLOW}HTML:${NC} <img src=\"$PUBLIC_URL\" alt=\"file\">"
elif [[ "$MIME_TYPE" == video/* ]]; then
    echo ""
    echo -e "${YELLOW}HTML Video:${NC}"
    echo "<video controls><source src=\"$PUBLIC_URL\" type=\"$MIME_TYPE\"></video>"
elif [[ "$MIME_TYPE" == audio/* ]]; then
    echo ""
    echo -e "${YELLOW}HTML Audio:${NC}"
    echo "<audio controls><source src=\"$PUBLIC_URL\" type=\"$MIME_TYPE\"></audio>"
fi

# Copy to clipboard
echo "$PUBLIC_URL" | pbcopy 2>/dev/null && echo -e "\n${GREEN}✓ URL copied to clipboard${NC}"
