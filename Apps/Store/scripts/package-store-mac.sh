#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DOT_EDITION=store
export DOT_PLATFORM=macos
npx expo prebuild --platform ios
DOT_MAC_BUILD_DIR="${DOT_MAC_BUILD_DIR:-${TMPDIR:-/tmp}/dot-immersed-mac-build}"
signing_flags=()
if [[ -n "${DOT_SIGNING_KEYCHAIN:-}" ]]; then signing_flags+=("OTHER_CODE_SIGN_FLAGS=--keychain $DOT_SIGNING_KEYCHAIN"); fi
xcodebuild -jobs "${DOT_BUILD_JOBS:-4}" \
  -workspace ios/Immersed.xcworkspace -scheme Immersed -configuration Release \
  -destination 'generic/platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$DOT_MAC_BUILD_DIR" \
  MACOSX_DEPLOYMENT_TARGET=13.4 IPHONEOS_DEPLOYMENT_TARGET=16.4 \
  SUPPORTS_MACCATALYST=YES "${signing_flags[@]}" build
DOT_MAC_APP="$DOT_MAC_BUILD_DIR/Build/Products/Release-maccatalyst/Immersed.app"
# File-provider metadata must not enter the distribution bundle.
DOT_MAC_STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dot-immersed-stage.XXXXXX")"
trap 'rm -rf "$DOT_MAC_STAGE_DIR"' EXIT
ditto --noextattr --norsrc "$DOT_MAC_APP" "$DOT_MAC_STAGE_DIR/Immersed.app"
DOT_MAC_APP="$DOT_MAC_STAGE_DIR/Immersed.app"
codesign --verify --deep --strict "$DOT_MAC_APP"
installer_flags=()
if [[ -n "${DOT_SIGNING_KEYCHAIN:-}" ]]; then installer_flags+=(--keychain "$DOT_SIGNING_KEYCHAIN"); fi
productbuild "${installer_flags[@]}" --component "$DOT_MAC_APP" /Applications \
  --sign '3rd Party Mac Developer Installer: Max Miller (YJH8WWUVF3)' \
  "${DOT_MAC_PACKAGE:-${TMPDIR:-/tmp}/dot-immersed-store.pkg}"
