#!/bin/bash

# Quick File Upload to Cloudflare R2
# Usage: ./upload-file.sh [file]

set -e

CONFIG_FILE="$HOME/.r2-config"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# On macOS, launching without a path opens the familiar file chooser.
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: upload-file [file]"
    echo "Without a file on macOS, opens a file chooser."
    exit 0
fi
if [ $# -gt 1 ]; then
    echo "Error: Select one file at a time."
    exit 1
fi
if [ $# -eq 0 ]; then
    if [ "$(uname -s)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
        if ! FILE=$(osascript -e 'POSIX path of (choose file with prompt "Choose a file to upload and share publicly")'); then
            echo "Upload cancelled."
            exit 0
        fi
    else
        echo "Usage: upload-file <file>"
        echo "Supports: images, PDFs, videos, documents, archives, etc."
        exit 1
    fi
else
    FILE="$1"
fi

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found"
    exit 1
fi

# Validate prerequisites before attempting an upload.
if ! command -v rclone >/dev/null 2>&1; then
    echo "Error: rclone is required. Install it with: brew install rclone"
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required to build safe share links."
    exit 1
fi
if [ ! -r "$CONFIG_FILE" ]; then
    echo "Error: Missing configuration at $CONFIG_FILE. Run setup-r2.sh first."
    exit 1
fi
source "$CONFIG_FILE"
for KEY in BUCKET_NAME R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_URL; do
    if [ -z "${!KEY}" ]; then
        echo "Error: $KEY is missing from $CONFIG_FILE."
        exit 1
    fi
done
# Pass credentials through the environment, rather than process arguments.
export RCLONE_S3_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_S3_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

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
    --s3-region=auto \
    --s3-no-check-bucket \
    --quiet

# Build URL
ENCODED_NAME=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$BASENAME")
PUBLIC_URL="${R2_PUBLIC_URL%/}/$ENCODED_NAME"

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
if command -v pbcopy >/dev/null 2>&1 && printf "%s" "$PUBLIC_URL" | pbcopy 2>/dev/null; then
    echo -e "\n${GREEN}✓ URL copied to clipboard${NC}"
fi
