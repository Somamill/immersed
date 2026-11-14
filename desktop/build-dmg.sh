#!/bin/sh
set -eu
source_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
output="${1:-$source_dir/work/releases}"
mkdir -p "$output"
output="$(CDPATH= cd -- "$output" && pwd)"
version="$(node -p "require('$source_dir/package.json').version")"
stage="$(mktemp -d "${TMPDIR:-/tmp}/immersed-dmg.XXXXXX")"
trap 'rm -rf "$stage"' EXIT HUP INT TERM
IMMERSED_APPLICATIONS_DIR="$stage" IMMERSED_BUNDLE_RUNTIME=1 /bin/sh "$source_dir/desktop/install-app.sh" "$source_dir"
COPYFILE_DISABLE=1 tar -czf "$output/immersed-mac-$version.tar.gz" -C "$stage/immersed.app/Contents/Resources/runtime" .
(cd "$output" && shasum -a 256 "immersed-mac-$version.tar.gz" > "immersed-mac-$version.tar.gz.sha256")
ln -s /Applications "$stage/Applications"
cat > "$stage/Read me.txt" <<'EOF'
Immersed, full-feature Apple Silicon edition

Install or update the Homebrew runtime first:
  brew tap Somamill/immersed https://github.com/Somamill/immersed.git
  brew install --HEAD Somamill/immersed/immersed-mac

For an existing Homebrew installation:
  brew upgrade --fetch-HEAD Somamill/immersed/immersed-mac

Drag immersed.app into Applications, or replace your existing copy in
~/Applications. Keep only the copy you use to avoid duplicate Spotlight entries.
This app includes the full study backend. Node, Python, FFmpeg and yt-dlp are
provided by Homebrew; dictionaries and speech models download on first use.

Source and release notes: https://github.com/Somamill/immersed
EOF
if [ -z "${IMMERSED_SIGN_IDENTITY:-}" ]; then
  printf '\nSigning status: unsigned preview, not notarized. Prefer the Homebrew source installation.\n' >> "$stage/Read me.txt"
fi
dmg="$output/immersed-$version-arm64.dmg"
hdiutil create -volname "Immersed $version" -srcfolder "$stage" -format UDZO -ov "$dmg"
if [ -n "${IMMERSED_SIGN_IDENTITY:-}" ]; then
  codesign --timestamp --sign "$IMMERSED_SIGN_IDENTITY" "$dmg"
fi
(cd "$output" && shasum -a 256 "immersed-$version-arm64.dmg" > "immersed-$version-arm64.dmg.sha256")
printf 'Built %s\n' "$dmg"
