#!/bin/bash

# Ultimate DJ - One-Click Setup Script for Mac
# Just double-click this file or run: ./setup.sh

set -e

echo "=========================================="
echo "   Ultimate DJ - Setup"
echo "=========================================="
echo ""

# Check if running on Mac
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "This script is for Mac only."
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Homebrew if not present
if ! command_exists brew; then
    echo "Installing Homebrew (Mac package manager)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    fi
else
    echo "Homebrew already installed"
fi

# Install Node.js if not present
if ! command_exists node; then
    echo "Installing Node.js..."
    brew install node
else
    echo "Node.js already installed ($(node --version))"
fi

# Install yt-dlp if not present
if ! command_exists yt-dlp; then
    echo "Installing yt-dlp (YouTube downloader)..."
    brew install yt-dlp
else
    echo "yt-dlp already installed"
fi

# Install ffmpeg if not present
if ! command_exists ffmpeg; then
    echo "Installing ffmpeg (audio/video processor)..."
    brew install ffmpeg
else
    echo "ffmpeg already installed"
fi

echo ""
echo "Installing project dependencies..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Install npm dependencies
npm install
cd client && npm install && cd ..

# Create data directory if it doesn't exist
mkdir -p data
mkdir -p media/videos

echo ""
echo "=========================================="
echo "   Setup Complete!"
echo "=========================================="
echo ""
echo "To start Ultimate DJ, run:"
echo ""
echo "   npm run dev"
echo ""
echo "Then open your browser to:"
echo "   http://localhost:5173"
echo ""
echo "=========================================="
