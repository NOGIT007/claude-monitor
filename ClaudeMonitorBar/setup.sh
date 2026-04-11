#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== ClaudeMonitorBar Setup ==="

# Build the app
./build.sh

# Install to /Applications
echo "Installing to /Applications..."
rm -rf "/Applications/Claude Monitor.app"
cp -r "build/ClaudeMonitorBar.app" "/Applications/Claude Monitor.app"

echo ""
echo "Done! You can now:"
echo "  - Find 'Claude Monitor' in Spotlight (Cmd+Space)"
echo "  - Or run: open '/Applications/Claude Monitor.app'"
echo ""
echo "Opening now..."
open "/Applications/Claude Monitor.app"
