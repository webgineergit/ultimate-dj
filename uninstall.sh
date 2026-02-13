#!/bin/bash

# Ultimate DJ Uninstaller

INSTALL_DIR="$HOME/.ultimate-dj"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║      Ultimate DJ Uninstaller      ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

if [[ ! -d "$INSTALL_DIR" ]]; then
  warn "Ultimate DJ is not installed at $INSTALL_DIR"
  exit 0
fi

# Check if data directory has content
DATA_DIR="$INSTALL_DIR/data"
if [[ -d "$DATA_DIR" ]]; then
  VIDEO_COUNT=$(find "$DATA_DIR/videos" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$VIDEO_COUNT" -gt 0 ]]; then
    warn "You have $VIDEO_COUNT video files in your library."
    read -p "Delete all data including your video library? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      info "Keeping data directory at $DATA_DIR"
      info "Removing application files only..."

      # Remove everything except data
      cd "$INSTALL_DIR"
      find . -maxdepth 1 ! -name 'data' ! -name '.' -exec rm -rf {} \;

      info "Application removed. Your data is preserved at $DATA_DIR"
      exit 0
    fi
  fi
fi

# Full removal
info "Removing Ultimate DJ..."
rm -rf "$INSTALL_DIR"

# Remove alias from shell configs
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [[ -f "$rc" ]]; then
    # Remove the alias and comment
    if grep -q "alias dj=" "$rc" 2>/dev/null; then
      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' '/# Ultimate DJ/d' "$rc" 2>/dev/null
        sed -i '' '/alias dj=/d' "$rc" 2>/dev/null
      else
        sed -i '/# Ultimate DJ/d' "$rc" 2>/dev/null
        sed -i '/alias dj=/d' "$rc" 2>/dev/null
      fi
      info "Removed 'dj' alias from $rc"
    fi
  fi
done

echo ""
info "Ultimate DJ has been uninstalled."
echo ""
