#!/bin/bash

set -e

echo "🚀 Installing Ellora..."

# Check if macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: This installer only works on macOS"
  exit 1
fi

# Check if Apple Silicon
if [[ $(uname -m) != "arm64" ]]; then
  echo "❌ Error: This installer is for Apple Silicon (M1/M2/M3) Macs only"
  exit 1
fi

REPO="langdb/ellora-ui"
VERSION="v0.1.0"
DMG_NAME="Ellora_0.1.0_aarch64.dmg"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${DMG_NAME}"

echo "📦 Downloading Ellora..."
curl -L -o "/tmp/${DMG_NAME}" "${DOWNLOAD_URL}"

echo "📂 Mounting DMG..."
VOLUME=$(hdiutil attach "/tmp/${DMG_NAME}" -nobrowse -noverify | grep "/Volumes" | awk '{print $3}')

echo "📋 Copying to Applications..."
cp -R "${VOLUME}/Ellora.app" /Applications/

echo "🔓 Removing quarantine attribute..."
sudo /usr/bin/xattr -rd com.apple.quarantine /Applications/Ellora.app

echo "🧹 Cleaning up..."
hdiutil detach "${VOLUME}" -quiet
rm "/tmp/${DMG_NAME}"

echo ""
echo "✨ Installation complete!"
echo "🚀 Launch Ellora from your Applications folder"
echo ""
