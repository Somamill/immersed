#!/bin/sh
set -eu
source_dir="${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
app_home="$HOME/Library/Application Support/Immersed Mac"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ "${2:-}" = "--install-app" ]; then
  exec /bin/sh "$source_dir/desktop/install-app.sh" "$source_dir"
fi
if [ "${2:-}" != "--service" ]; then
  installed="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$HOME/Applications/immersed.app/Contents/Info.plist" 2>/dev/null || true)"
  version="$(node -p "require('$source_dir/package.json').version")"
  if [ "$installed" != "$version" ] || [ "$source_dir/desktop/NativeApp.swift" -nt "$HOME/Applications/immersed.app/Contents/MacOS/ImmersedMac" ]; then
    /bin/sh "$source_dir/desktop/install-app.sh" "$source_dir"
  fi
  open "$HOME/Applications/immersed.app"
  exit 0
fi
mkdir -p "$app_home"
rsync -a --exclude node_modules --exclude .git --exclude .data --exclude .venv --exclude .venv-context --exclude work --exclude dist --exclude test-results "$source_dir/" "$app_home/"
cd "$app_home"
if ! command -v node >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1 || ! command -v yt-dlp >/dev/null 2>&1; then
  printf 'Install the Mac runtime with: brew install node python@3.13 ffmpeg yt-dlp\n' >&2
  exit 1
fi
dependency_hash="$(shasum -a 256 desktop/package-lock.json | cut -d ' ' -f 1)"
if [ ! -d desktop/node_modules ] || [ ! -f .mac-dependencies-sha ] || [ "$(cat .mac-dependencies-sha)" != "$dependency_hash" ]; then
  npm ci --omit=dev --prefix desktop
  printf '%s' "$dependency_hash" > .mac-dependencies-sha
fi
export NODE_PATH="$app_home/desktop/node_modules${NODE_PATH:+:$NODE_PATH}"
if [ ! -f .data/jmdict.json ]; then npm run language:setup; fi
if [ ! -f .data/context-ngrams.sqlite ]; then npm run context:setup; fi
if [ ! -x .venv/bin/python ]; then
  python_bin="$(command -v python3.13 || command -v python3)"
  "$python_bin" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  if [ "$(uname -m)" = arm64 ]; then .venv/bin/python -m pip install 'mlx-whisper>=0.4,<1';
  else .venv/bin/python -m pip install 'faster-whisper>=1.2,<2'; fi
fi
export IMMERSED_PYTHON="$app_home/.venv/bin/python"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ "$(uname -m)" = arm64 ]; then
 export IMMERSED_CONTEXT_PYTHON="$app_home/.venv-context/bin/python"
 /bin/sh scripts/setup-context-meaning.sh > "$app_home/.context-setup.log" 2>&1 &
fi
exec node desktop/server.cjs
