#!/bin/bash

# Setup script for Cloudflare R2 image hosting

set -e

echo "=== Cloudflare R2 Image Hosting Setup ==="
echo ""
echo "This will configure your R2 bucket for image uploads."
echo ""

# Get R2 credentials
echo "Step 1: R2 Configuration"
echo "Go to: https://dash.cloudflare.com/ > R2 > Manage R2 API Tokens"
echo ""
read -p "Enter your R2 Account ID: " R2_ACCOUNT_ID
read -p "Enter your R2 Access Key ID: " R2_ACCESS_KEY_ID
read -s -p "Enter your R2 Secret Access Key: " R2_SECRET_ACCESS_KEY
echo ""
read -p "Enter your R2 Bucket Name: " BUCKET_NAME

# Construct endpoint
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Get public URL
echo ""
echo "Step 2: Public Access (Optional but recommended)"
echo "If you have a custom domain or public bucket, enter the public URL"
echo "Example: https://images.yourdomain.com or https://pub-${R2_ACCOUNT_ID}.r2.dev"
read -p "Enter your public URL base (e.g., https://images.yourdomain.com): " R2_PUBLIC_URL

# Remove trailing slash if present
R2_PUBLIC_URL="${R2_PUBLIC_URL%/}"

# Save config
CONFIG_FILE="$HOME/.r2-config"

cat > "$CONFIG_FILE" << EOF
# Cloudflare R2 Configuration
R2_ACCOUNT_ID="$R2_ACCOUNT_ID"
R2_ENDPOINT="$R2_ENDPOINT"
R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
BUCKET_NAME="$BUCKET_NAME"
R2_PUBLIC_URL="$R2_PUBLIC_URL"
EOF

chmod 600 "$CONFIG_FILE"

echo ""
echo "✓ Configuration saved to $CONFIG_FILE"
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "rclone is not installed. Installing..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install rclone
        else
            echo "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl https://rclone.org/install.sh | sudo bash
    else
        echo "Please install rclone manually: https://rclone.org/install/"
        exit 1
    fi
fi

# Configure rclone
RCLONE_CONFIG="$HOME/.config/rclone/rclone.conf"
mkdir -p "$(dirname "$RCLONE_CONFIG")"

# Remove existing config if present
if [ -f "$RCLONE_CONFIG" ]; then
    sed -i.bak '/^\[r2\]/,/^\[/d' "$RCLONE_CONFIG"
fi

cat >> "$RCLONE_CONFIG" << EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $R2_ACCESS_KEY_ID
secret_access_key = $R2_SECRET_ACCESS_KEY
endpoint = $R2_ENDPOINT
acl = public-read
EOF

echo "✓ rclone configured"
echo ""
echo "Setup complete! You can now use:"
echo "  upload-image.sh <image-file>"
echo ""
echo "Example:"
echo "  ./upload-image.sh screenshot.png"
