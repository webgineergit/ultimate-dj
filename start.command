#!/bin/bash

# Ultimate DJ - Double-click to start!

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Starting Ultimate DJ..."
echo ""
echo "Opening browser in 5 seconds..."
echo "Control window: http://localhost:5173"
echo ""

# Open browser after a delay (give server time to start)
(sleep 5 && open "http://localhost:5173") &

# Start the app
npm run dev
