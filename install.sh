#!/bin/bash

# Quick Share CLI - Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/jack/quick-share-cli/main/install.sh | bash

set -e

REPO="jack/quick-share-cli"
INSTALL_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}⚡ Installing Quick Share CLI...${NC}\n"

# Detect OS
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Linux*)     PLATFORM='linux';;
  Darwin*)    PLATFORM='macos';;
  CYGWIN*|MINGW*|MSYS*) PLATFORM='windows';;
  *)          echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1;;
esac

echo "Detected: $PLATFORM ($ARCH)"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}Node.js not found. Installing...${NC}"
  
  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew &> /dev/null; then
      brew install node
    else
      echo -e "${RED}Homebrew not found. Please install Node.js manually:${NC}"
      echo "  https://nodejs.org/"
      exit 1
    fi
  elif [ "$PLATFORM" = "linux" ]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi

# Check for rclone
if ! command -v rclone &> /dev/null; then
  echo -e "${YELLOW}rclone not found. Installing...${NC}"
  
  if [ "$PLATFORM" = "macos" ]; then
    brew install rclone
  elif [ "$PLATFORM" = "linux" ]; then
    curl https://rclone.org/install.sh | sudo bash
  fi
fi

# Install via npm
echo -e "\n${BLUE}Installing Quick Share CLI via npm...${NC}"
npm install -g quick-share-cli

# Verify installation
if command -v quick-share &> /dev/null; then
  echo -e "\n${GREEN}✓ Quick Share CLI installed successfully!${NC}"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Run: quick-share setup"
  echo "  2. Upload: quick-share <file>"
  echo ""
  echo -e "${BLUE}Commands:${NC}"
  echo "  quick-share <file>     - Upload a file"
  echo "  quick-share setup      - Configure credentials"
  echo "  quick-share --help     - Show help"
else
  echo -e "${RED}✗ Installation failed${NC}"
  exit 1
fi
