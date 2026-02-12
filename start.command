#!/bin/bash

# Ultimate DJ - Double-click to start!

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Ensure pip-installed binaries and Homebrew are in PATH
export PATH="$HOME/Library/Python/3.9/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "Starting Ultimate DJ..."
echo ""
echo "Opening browser in 5 seconds..."
echo "Control window: http://localhost:5173"
echo ""

# Open browser after a delay (give server time to start)
(sleep 5 && open "http://localhost:5173") &

# Start the app
npm run dev
