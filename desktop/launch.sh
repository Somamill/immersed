#!/bin/sh
set -eu
source_dir="${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
app_home="$HOME/Library/Application Support/Immersed Mac"
if [ "${2:-}" != "--service" ]; then
  /bin/sh "$source_dir/desktop/install-app.sh" "$source_dir"
  open "$HOME/Applications/immersed.app"
  exit 0
fi
mkdir -p "$app_home"
rsync -a --exclude node_modules --exclude .git --exclude .data --exclude .venv --exclude .venv-context --exclude work --exclude dist --exclude test-results "$source_dir/" "$app_home/"
cd "$app_home"
dependency_hash="$(node -e "const fs=require('fs'),c=require('crypto'),p=JSON.parse(fs.readFileSync('package-lock.json')); delete p.version;delete p.packages[''].version;console.log(c.createHash('sha256').update(JSON.stringify(p)).digest('hex'))")"
if [ ! -d node_modules ] || [ ! -f .dependencies-sha ] || [ "$(cat .dependencies-sha)" != "$dependency_hash" ]; then
  npm ci --omit=dev
  printf '%s' "$dependency_hash" > .dependencies-sha
fi
if [ ! -f .data/jmdict.json ]; then npm run language:setup; fi
if [ ! -f .data/context-ngrams.sqlite ]; then npm run context:setup; fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
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
