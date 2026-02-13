#!/bin/bash
set -e

# Ultimate DJ Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/webgineergit/ultimate-dj/main/install.sh | bash

REPO_URL="https://github.com/webgineergit/ultimate-dj"
INSTALL_DIR="$HOME/.ultimate-dj"
DATA_DIR="$INSTALL_DIR/data"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin*) OS="macos" ;;
    Linux*)  OS="linux" ;;
    *)       error "Unsupported OS: $(uname -s)" ;;
  esac
  info "Detected OS: $OS"
}

# Check if command exists
has() { command -v "$1" &>/dev/null; }

# Install Homebrew on macOS if missing
install_homebrew() {
  if [[ "$OS" != "macos" ]]; then return; fi

  if has brew; then
    info "Homebrew already installed"
    return
  fi

  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Add Homebrew to PATH for Apple Silicon
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
}

# Install Node.js if missing or too old
install_node() {
  if has node; then
    NODE_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [[ "$NODE_VERSION" -ge 18 ]]; then
      info "Node.js $(node -v) already installed"
      return
    fi
    warn "Node.js version too old, upgrading..."
  fi

  info "Installing Node.js..."
  if [[ "$OS" == "macos" ]]; then
    brew install node
  else
    # Linux - use NodeSource
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
}

# Install ffmpeg if missing
install_ffmpeg() {
  if has ffmpeg; then
    info "ffmpeg already installed"
    return
  fi

  info "Installing ffmpeg..."
  if [[ "$OS" == "macos" ]]; then
    brew install ffmpeg
  else
    sudo apt-get update && sudo apt-get install -y ffmpeg
  fi
}

# Install yt-dlp if missing
install_ytdlp() {
  if has yt-dlp; then
    info "yt-dlp already installed"
    return
  fi

  info "Installing yt-dlp..."
  if [[ "$OS" == "macos" ]]; then
    brew install yt-dlp
  elif has pip3; then
    pip3 install --user yt-dlp
  else
    sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
  fi
}

# Install Python 3 if missing
install_python() {
  if has python3; then
    info "Python 3 already installed"
    return
  fi

  info "Installing Python 3..."
  if [[ "$OS" == "macos" ]]; then
    brew install python3
  else
    sudo apt-get install -y python3 python3-venv python3-pip
  fi
}

# Install git if missing
install_git() {
  if has git; then
    info "git already installed"
    return
  fi

  info "Installing git..."
  if [[ "$OS" == "macos" ]]; then
    brew install git
  else
    sudo apt-get install -y git
  fi
}

# Download or update the app
download_app() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull
  else
    info "Downloading Ultimate DJ..."
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
}

# Install npm dependencies
install_deps() {
  info "Installing dependencies..."
  cd "$INSTALL_DIR"
  npm install
  cd client && npm install && cd ..
}

# Setup Python venv for lyrics fetching
setup_python_venv() {
  info "Setting up Python environment for lyrics..."
  cd "$INSTALL_DIR/server/scripts"

  if [[ ! -d "venv" ]]; then
    python3 -m venv venv
  fi

  source venv/bin/activate
  pip install --upgrade pip
  pip install ytmusicapi
  deactivate
}

# Create data directories
setup_data() {
  info "Setting up data directories..."
  mkdir -p "$DATA_DIR/videos/thumbnails"
  mkdir -p "$DATA_DIR/audio"
  mkdir -p "$DATA_DIR/photos"
  mkdir -p "$DATA_DIR/sounds"
  mkdir -p "$DATA_DIR/lyrics"
  info "Data directory: $DATA_DIR"
}

# Create launcher script and shell alias
create_launcher() {
  # Create start script
  cat > "$INSTALL_DIR/start.sh" << 'LAUNCHER'
#!/bin/bash
cd "$(dirname "$0")"

# Check if already running
if lsof -i :3001 &>/dev/null; then
  echo "Ultimate DJ is already running!"
  if command -v open &>/dev/null; then
    open http://localhost:5173
  elif command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:5173
  fi
  exit 0
fi

npm run dev
LAUNCHER
  chmod +x "$INSTALL_DIR/start.sh"

  # Determine shell config file
  SHELL_RC="$HOME/.bashrc"
  if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
  fi

  # Add alias if not already present
  if ! grep -q "alias dj=" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# Ultimate DJ" >> "$SHELL_RC"
    echo "alias dj='$INSTALL_DIR/start.sh'" >> "$SHELL_RC"
    info "Added 'dj' command to $SHELL_RC"
  else
    info "'dj' alias already configured"
  fi
}

# Open browser
open_browser() {
  local url="$1"
  if has open; then
    open "$url"
  elif has xdg-open; then
    xdg-open "$url"
  fi
}

# Main installation
main() {
  echo ""
  echo "  ╔═══════════════════════════════════╗"
  echo "  ║       Ultimate DJ Installer       ║"
  echo "  ╚═══════════════════════════════════╝"
  echo ""

  detect_os
  install_homebrew
  install_git
  install_node
  install_ffmpeg
  install_ytdlp
  install_python
  download_app
  install_deps
  setup_python_venv
  setup_data
  create_launcher

  echo ""
  echo "  ╔═══════════════════════════════════╗"
  echo "  ║      Installation Complete!       ║"
  echo "  ╚═══════════════════════════════════╝"
  echo ""
  info "To start Ultimate DJ, run:"
  echo ""
  echo "    cd $INSTALL_DIR && npm run dev"
  echo ""
  info "Or restart your terminal and simply run:"
  echo ""
  echo "    dj"
  echo ""

  # Ask to start now
  read -p "Start Ultimate DJ now? [Y/n] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    cd "$INSTALL_DIR"
    npm run dev &
    sleep 4
    open_browser "http://localhost:5173"
    info "Ultimate DJ is running at http://localhost:5173"
    info "Press Ctrl+C to stop"
    wait
  fi
}

main "$@"
