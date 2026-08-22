#!/usr/bin/env bash
# scripts/register-tceo-linux.sh
#
# Manually registers the .tceo file association on Linux for the current user.
# No sudo/root required — all changes go into ~/.local/share.
#
# Usage:
#   chmod +x scripts/register-tceo-linux.sh
#   ./scripts/register-tceo-linux.sh
#
# To unregister, delete the following files:
#   ~/.local/share/mime/packages/application-x-tceo.xml
#   ~/.local/share/applications/toolceo.desktop
# Then run: update-mime-database ~/.local/share/mime

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Resolve the electron executable for the current environment
EXEC_PATH="${PROJECT_DIR}/node_modules/.bin/electron"
if [ ! -f "$EXEC_PATH" ]; then
  EXEC_PATH=$(which electron 2>/dev/null || echo "")
fi
if [ -z "$EXEC_PATH" ]; then
  echo "❌  Could not find electron binary. Run 'npm install' first."
  exit 1
fi
# Wrap path in quotes for the Exec= line
EXEC_CMD="\"${EXEC_PATH}\" \"${PROJECT_DIR}\" %f"

ICON_PATH="${PROJECT_DIR}/resources/tceo-file-icon.png"
if [ ! -f "$ICON_PATH" ]; then
  ICON_PATH="${PROJECT_DIR}/assets/icons/fileicon.png"
fi
if [ ! -f "$ICON_PATH" ]; then
  ICON_PATH="${PROJECT_DIR}/assets/fileimage.png"
fi
if [ ! -f "$ICON_PATH" ]; then
  ICON_PATH="${PROJECT_DIR}/assets/icon.png"
fi

XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
MIME_DIR="$XDG_DATA/mime/packages"
APPS_DIR="$XDG_DATA/applications"
ICON_DIR="$XDG_DATA/icons/hicolor/256x256/apps"
MIME_ICON_DIR="$XDG_DATA/icons/hicolor/256x256/mimetypes"

echo "→ Registering ToolCEO .tceo file association..."

# ── 1. MIME type XML ──────────────────────────────────────────────────────────
mkdir -p "$MIME_DIR"
cat > "$MIME_DIR/application-x-tceo.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-tceo">
    <comment>ToolCEO Vault File</comment>
    <icon name="application-x-tceo"/>
    <glob pattern="*.tceo"/>
    <magic priority="80">
      <match type="string" offset="0" value="TCEO"/>
    </magic>
  </mime-type>
</mime-info>
EOF
echo "  ✓ MIME type XML written"

# ── 2. Update MIME database ───────────────────────────────────────────────────
if command -v update-mime-database &>/dev/null; then
  update-mime-database "$XDG_DATA/mime"
  echo "  ✓ MIME database updated"
else
  echo "  ⚠  update-mime-database not found — skipping (install shared-mime-info)"
fi

# ── 3. Install icon ───────────────────────────────────────────────────────────
mkdir -p "$ICON_DIR"
mkdir -p "$MIME_ICON_DIR"
cp "$ICON_PATH" "$ICON_DIR/toolceo.png"
cp "$ICON_PATH" "$MIME_ICON_DIR/application-x-tceo.png"
echo "  ✓ Icon installed → $ICON_DIR/toolceo.png"

# ── 4. .desktop file ─────────────────────────────────────────────────────────
mkdir -p "$APPS_DIR"
cat > "$APPS_DIR/toolceo.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=ToolCEO
Comment=ToolCEO Vault File — open with ToolCEO
Exec=${EXEC_CMD}
Icon=toolceo
MimeType=application/x-tceo;
Categories=Office;Utility;
NoDisplay=false
StartupNotify=true
EOF
echo "  ✓ .desktop file written → $APPS_DIR/toolceo.desktop"

# ── 5. Set as default handler ─────────────────────────────────────────────────
if command -v xdg-mime &>/dev/null; then
  xdg-mime default toolceo.desktop application/x-tceo
  echo "  ✓ xdg-mime default set"
else
  echo "  ⚠  xdg-mime not found — skipping default handler (install xdg-utils)"
fi

# ── 6. Refresh applications database ─────────────────────────────────────────
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APPS_DIR"
  echo "  ✓ Applications database updated"
fi

echo ""
echo "✅  Done! Double-click any .tceo file to open it in ToolCEO."
echo "   (You may need to log out and back in for file manager to pick up the change)"
