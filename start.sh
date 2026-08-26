#!/bin/bash
set -e

# Re-exec through a login shell so PATH includes nvm/homebrew/etc.
if [ -z "$VIDE_LOGIN_SHELL" ]; then
  export VIDE_LOGIN_SHELL=1
  exec "${SHELL:-/bin/zsh}" -l "$0" "$@"
fi

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
  echo "Building native modules..."
  npm run rebuild
fi

# Ensure the Electron binary is present (install scripts may be blocked by allowScripts)
ELECTRON_BINARY="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -f "$ELECTRON_BINARY" ]; then
  echo "Electron binary missing, downloading..."
  npm approve-scripts electron 2>/dev/null || true
  node node_modules/electron/install.js 2>/dev/null || true
  # Fall back to manual extraction if install.js still didn't produce the binary
  if [ ! -f "$ELECTRON_BINARY" ]; then
    ELECTRON_VERSION=$(node -e "process.stdout.write(require('./node_modules/electron/package.json').version)")
    CACHE_DIR="$HOME/Library/Caches/electron"
    ZIP=$(find "$CACHE_DIR" -name "electron-v${ELECTRON_VERSION}-darwin-*.zip" 2>/dev/null | head -1)
    if [ -n "$ZIP" ]; then
      echo "Extracting Electron from cache..."
      unzip -oq "$ZIP" -d node_modules/electron/dist/
      printf "Electron.app/Contents/MacOS/Electron" > node_modules/electron/path.txt
    else
      echo "Downloading Electron..."
      node -e "
        const { downloadArtifact } = require('@electron/get');
        const { version } = require('./node_modules/electron/package');
        const { execSync } = require('child_process');
        const path = require('path');
        downloadArtifact({ version, artifactName: 'electron', platform: 'darwin' })
          .then(zip => {
            execSync('unzip -oq ' + JSON.stringify(zip) + ' -d node_modules/electron/dist/');
            require('fs').writeFileSync('node_modules/electron/path.txt', 'Electron.app/Contents/MacOS/Electron');
            console.log('Electron installed.');
          })
          .catch(err => { console.error('Failed:', err.message); process.exit(1); });
      "
    fi
  fi
fi

# Remove stale tsc artifacts that shadow .tsx source files and confuse Vite
find src -name "*.js" -not -path "*/node_modules/*" -delete 2>/dev/null || true
find src -name "*.d.ts" -not -path "*/node_modules/*" -not -path "src/types/api.d.ts" -delete 2>/dev/null || true

npm run dev
