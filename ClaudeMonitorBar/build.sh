#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="ClaudeMonitorBar"
BUILD_DIR="build"
APP_BUNDLE="${BUILD_DIR}/${APP_NAME}.app"

echo "=== Building ${APP_NAME} ==="

# Clean
rm -rf "$BUILD_DIR"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

# Compile
echo "Compiling Swift..."
swiftc Sources/main.swift \
    -o "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}" \
    -framework SwiftUI \
    -framework WebKit \
    -framework AppKit \
    -suppress-warnings \
    2>&1

# Copy app icon
if [ -f "AppIcon.icns" ]; then
    cp AppIcon.icns "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"
fi

# Copy menu bar icons
cp -f menubar_icon.png "${APP_BUNDLE}/Contents/Resources/" 2>/dev/null || true
cp -f "menubar_icon@2x.png" "${APP_BUNDLE}/Contents/Resources/" 2>/dev/null || true

# Create Info.plist
cat > "${APP_BUNDLE}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Claude Monitor</string>
    <key>CFBundleDisplayName</key>
    <string>Claude Monitor</string>
    <key>CFBundleIdentifier</key>
    <string>com.kennetkusk.ClaudeMonitorBar</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>ClaudeMonitorBar</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

echo "Build complete: ${APP_BUNDLE}"
echo ""
echo "To install to /Applications:"
echo "  cp -r ${APP_BUNDLE} /Applications/"
echo ""
echo "To run now:"
echo "  open ${APP_BUNDLE}"
