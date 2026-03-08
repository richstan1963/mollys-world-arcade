#!/bin/bash
# build.sh — Build & register ArcadeLauncher.app
# Usage: cd desktop-launcher && bash build.sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="ArcadeLauncher"
APP_BUNDLE="${DIR}/${APP_NAME}.app"
BINARY="${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"
CONFIG_DIR="$HOME/.ywa"
CONFIG_FILE="${CONFIG_DIR}/emulator-paths.json"

echo "╔════════════════════════════════════════╗"
echo "║    Your World Arcade — Desktop Mode    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ── 1. Compile ──────────────────────────────
echo "🔨  Compiling ${APP_NAME}.swift..."
swiftc \
    -framework Cocoa \
    -target arm64-apple-macos12.0 \
    -O \
    -o "${DIR}/${APP_NAME}" \
    "${DIR}/${APP_NAME}.swift"

echo "    ✓ Binary compiled"

# ── 2. Build .app bundle ─────────────────────
echo "📦  Building .app bundle..."
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

cp "${DIR}/${APP_NAME}"   "${BINARY}"
cp "${DIR}/Info.plist"    "${APP_BUNDLE}/Contents/"

chmod +x "${BINARY}"
echo "    ✓ Bundle created at ${APP_BUNDLE}"

# ── 3. Register URL scheme ───────────────────
echo "📋  Registering arcade:// URL scheme..."
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -f "$LSREGISTER" ]; then
    "$LSREGISTER" -f "${APP_BUNDLE}"
    echo "    ✓ arcade:// registered"
else
    echo "    ⚠️  lsregister not found — open the .app manually to register"
fi

# ── 4. Setup config ──────────────────────────
mkdir -p "${CONFIG_DIR}"
if [ ! -f "${CONFIG_FILE}" ]; then
    cp "${DIR}/emulator-paths.json" "${CONFIG_FILE}"
    echo "📝  Created config at ${CONFIG_FILE}"
    echo "    Edit it to point to your actual emulator paths."
else
    echo "    Config already exists at ${CONFIG_FILE}"
fi

# ── 5. Launch it ─────────────────────────────
echo ""
echo "🚀  Launching ArcadeLauncher..."
open "${APP_BUNDLE}"
sleep 1

# ── 6. Test ──────────────────────────────────
echo ""
echo "✅  Done! Test the URL scheme with:"
echo ""
echo "    open 'arcade://launch?system=ps3&romId=1&server=http://localhost:3000&title=Test'"
echo ""
echo "You should see the 🕹 icon in your menubar."
echo "Edit ${CONFIG_FILE} to set your real emulator paths."
