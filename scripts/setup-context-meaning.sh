#!/bin/sh
# Separate from speech dependencies; setup never blocks playback or word lookup.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
[ "$(uname -m)" = arm64 ] || exit 0
[ -f .venv-context/.ready ] && [ -f .data/context-model/model.safetensors ] && exit 0
if ! mkdir .context-setup-lock 2>/dev/null; then
  if [ -f .context-setup-lock/pid ] && kill -0 "$(cat .context-setup-lock/pid)" 2>/dev/null; then exit 0; fi
  rm -f .context-setup-lock/pid
  rmdir .context-setup-lock 2>/dev/null || exit 0
  mkdir .context-setup-lock 2>/dev/null || exit 0
fi
printf '%s' "$$" > .context-setup-lock/pid
trap 'rm -f .context-setup-lock/pid; rmdir .context-setup-lock' EXIT
if [ ! -x .venv-context/bin/python ]; then
  python3.13 -m venv .venv-context
fi
.venv-context/bin/python -m pip install 'mlx-lm==0.32.2'
HF_HUB_DISABLE_XET=1 .venv-context/bin/python server/context_meaning.py --prepare
touch .venv-context/.ready
