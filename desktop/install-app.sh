#!/bin/sh
set -eu

source_dir="${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
applications_dir="${IMMERSED_APPLICATIONS_DIR:-$HOME/Applications}"
app_bundle="$applications_dir/immersed.app"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/immersed-mac-app.XXXXXX")"
staged_bundle="$staging_dir/immersed.app"
bundle_id="com.somamill.immersedmac"

cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$applications_dir" "$staged_bundle/Contents/MacOS" "$staged_bundle/Contents/Resources"
cp "$source_dir/desktop/macos-app/Info.plist" "$staged_bundle/Contents/Info.plist"
cp "$source_dir/desktop/NativeApp.swift" "$staging_dir/NativeApp.swift"
xcrun swiftc -parse-as-library -O -target arm64-apple-macos13.0 -framework Cocoa -framework WebKit -framework MediaPlayer -framework Vision "$staging_dir/NativeApp.swift" -o "$staged_bundle/Contents/MacOS/ImmersedMac"
cp "$source_dir/desktop/macos-app/ImmersedMac.icns" "$staged_bundle/Contents/Resources/ImmersedMac.icns"
cp "$source_dir/desktop/netflix.js" "$source_dir/desktop/netflix-bridge.js" "$staged_bundle/Contents/Resources/"
cp "$source_dir/desktop/player-bridge.js" "$staged_bundle/Contents/Resources/"
if [ "${IMMERSED_BUNDLE_RUNTIME:-0}" = 1 ]; then
  runtime="$staged_bundle/Contents/Resources/runtime"
  mkdir -p "$runtime"
  for directory in desktop server src assets scripts; do
    rsync -a --exclude node_modules --exclude __pycache__ --exclude .hallmark --exclude '* 2.*' --exclude .DS_Store "$source_dir/$directory" "$runtime/"
  done
  cp "$source_dir/package.json" "$source_dir/package-lock.json" "$runtime/"
  for file in README.md LICENSE THIRD_PARTY.md; do
    if [ -f "$source_dir/$file" ]; then cp "$source_dir/$file" "$runtime/"; fi
  done
fi
chmod 755 "$staged_bundle/Contents/MacOS/ImmersedMac"

version="$(node -p "require('$source_dir/package.json').version")"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$staged_bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $version" "$staged_bundle/Contents/Info.plist"
if [ -n "${IMMERSED_SIGN_IDENTITY:-}" ]; then
  case "$IMMERSED_SIGN_IDENTITY" in
    "Developer ID Application:"*) ;;
    *) printf 'Direct distribution requires a Developer ID Application identity.\n' >&2; exit 1 ;;
  esac
  codesign --force --options runtime --timestamp --sign "$IMMERSED_SIGN_IDENTITY" "$staged_bundle"
  codesign --verify --strict --verbose=2 "$staged_bundle"
fi

if [ -e "$app_bundle" ]; then
  existing_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_bundle/Contents/Info.plist" 2>/dev/null || true)"
  if [ "$existing_id" != "$bundle_id" ]; then
    printf 'Cannot replace %s because it is not the Immersed Mac app.\n' "$app_bundle" >&2
    exit 1
  fi
  ditto "$staged_bundle/Contents" "$app_bundle/Contents"
else
  ditto "$staged_bundle" "$app_bundle"
fi

lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$lsregister" ]; then
  "$lsregister" -f "$app_bundle" >/dev/null 2>&1 || true
fi

printf 'Installed %s\n' "$app_bundle"
