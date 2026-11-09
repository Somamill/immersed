#!/bin/sh
set -eu
source_dir="${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
app_home="$HOME/Library/Application Support/Immersed Mac"
mkdir -p "$app_home"
rsync -a --exclude node_modules --exclude .git --exclude .data --exclude .venv --exclude dist --exclude test-results "$source_dir/" "$app_home/"
cd "$app_home"
if [ "${2:-}" != "--service" ] && [ -f desktop/install-app.sh ]; then
  /bin/sh desktop/install-app.sh "$app_home"
fi
if [ "${2:-}" != "--service" ]; then
  open "$HOME/Applications/immersed.app"
  exit 0
fi
version="$(node -p "require('./package.json').version")"
if [ ! -d node_modules ] || [ ! -f .installed-version ] || [ "$(cat .installed-version)" != "$version" ]; then
  npm ci --omit=dev
  printf '%s' "$version" > .installed-version
fi
if [ ! -f .data/jmdict.json ]; then npm run language:setup; fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  if [ "$(uname -m)" = arm64 ]; then .venv/bin/python -m pip install 'mlx-whisper>=0.4,<1';
  else .venv/bin/python -m pip install 'faster-whisper>=1.2,<2'; fi
fi
export IMMERSED_PYTHON="$app_home/.venv/bin/python"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec node desktop/server.cjs
