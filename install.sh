#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/share/agy-brave-cowork"
EXT_ID="facjbganmdadoochhdcioegcmmnceofp"

if [[ "$(uname -s)" == "Darwin" ]]; then
  NMH_DIR="${HOME}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
else
  NMH_DIR="${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
fi

echo "==> Installing to ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/extension" "${NMH_DIR}"
cp -r "${SCRIPT_DIR}/extension/." "${INSTALL_DIR}/extension/"
cp "${SCRIPT_DIR}/native-host.mjs" "${INSTALL_DIR}/native-host.mjs"
cp "${SCRIPT_DIR}/mcp-server.mjs" "${INSTALL_DIR}/mcp-server.mjs"
chmod +x "${INSTALL_DIR}/native-host.mjs" "${INSTALL_DIR}/mcp-server.mjs"

cat > "${NMH_DIR}/com.agy.brave_cowork.json" <<EOF
{
  "name": "com.agy.brave_cowork",
  "description": "Native messaging bridge for Antigravity Cowork Brave extension",
  "path": "${INSTALL_DIR}/native-host.mjs",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
EOF
echo "==> Wrote Native Messaging manifest: ${NMH_DIR}/com.agy.brave_cowork.json"

if command -v agy >/dev/null 2>&1; then
  agy mcp add brave-cowork node "${INSTALL_DIR}/mcp-server.mjs"
  echo "==> Registered MCP server 'brave-cowork' in agy"
else
  echo "WARN: 'agy' not found in PATH. Register MCP manually:"
  echo "  agy mcp add brave-cowork node ${INSTALL_DIR}/mcp-server.mjs"
fi

echo ""
echo "Done! Next steps:"
echo "  1. Open brave://extensions in Brave"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked' and select: ${INSTALL_DIR}/extension"
echo "  4. Restart agy"
