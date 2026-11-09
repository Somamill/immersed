#!/bin/sh
set -eu

source_dir="${1:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
applications_dir="$HOME/Applications"
app_bundle="$applications_dir/Immersed Mac.app"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/immersed-mac-app.XXXXXX")"
staged_bundle="$staging_dir/Immersed Mac.app"
bundle_id="com.somamill.immersedmac"

cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$applications_dir" "$staged_bundle/Contents/MacOS" "$staged_bundle/Contents/Resources"
cp "$source_dir/desktop/macos-app/Info.plist" "$staged_bundle/Contents/Info.plist"
cp "$source_dir/desktop/macos-app/ImmersedMac" "$staged_bundle/Contents/MacOS/ImmersedMac"
cp "$source_dir/desktop/macos-app/ImmersedMac.icns" "$staged_bundle/Contents/Resources/ImmersedMac.icns"
chmod 755 "$staged_bundle/Contents/MacOS/ImmersedMac"

version="$(node -p "require('$source_dir/package.json').version")"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$staged_bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $version" "$staged_bundle/Contents/Info.plist"

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
