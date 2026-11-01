#!/bin/sh
set -eu
if [ ! -s .data/jmdict.json ] || [ ! -s .data/names.sqlite ]; then
  node scripts/setup-dictionary.cjs
fi
if [ ! -s .data/context-ngrams.sqlite ]; then
  node scripts/setup-context.cjs
fi
exec node server/hosted.cjs
