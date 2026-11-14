#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 DOT_EDITION=store
target="${1:-ios}"
case "$target" in ios|macos|simulator) ;; *) echo 'Target must be ios, macos, or simulator.' >&2; exit 2;; esac
read_config() { node -p 'require("./store-release.json")[process.argv[1]]' "$1"; }
scheme="$(read_config scheme)"
workspace="$(read_config workspace)"
export DOT_BUILD_NUMBER="${DOT_BUILD_NUMBER:-$(node -p 'require("./app.json").expo.ios?.buildNumber || "1"')}"
[[ "$DOT_BUILD_NUMBER" =~ ^[0-9]+$ ]] || { echo 'Build number must be numeric.' >&2; exit 2; }
export DOT_PLATFORM="$target"
build_dir="${DOT_BUILD_DIR:-${TMPDIR:-/tmp}/dot-$scheme-$target-build}"
output_dir="${DOT_OUTPUT_DIR:-$build_dir/export}"
mkdir -p "$output_dir"
npm run --if-present dictionary:build
if [[ "$target" == macos ]]; then
  export DOT_MAC_BUILD_DIR="$build_dir" DOT_MAC_PACKAGE="$output_dir/$scheme.pkg"
  bash scripts/package-store-mac.sh
  artifact="$DOT_MAC_PACKAGE"
else
  npx --no-install expo prebuild --platform ios
  if [[ "$target" == simulator ]]; then
    xcodebuild -jobs "${DOT_BUILD_JOBS:-4}" -workspace "$workspace" -scheme "$scheme" \
      -configuration Release -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$build_dir" CODE_SIGNING_ALLOWED=NO build
    echo "Simulator build completed: $build_dir/Build/Products/Release-iphonesimulator"
    exit 0
  fi
  signing_flags=()
  if [[ -n "${DOT_SIGNING_KEYCHAIN:-}" ]]; then signing_flags+=("OTHER_CODE_SIGN_FLAGS=--keychain $DOT_SIGNING_KEYCHAIN"); fi
  xcodebuild -jobs "${DOT_BUILD_JOBS:-4}" -workspace "$workspace" -scheme "$scheme" \
    -configuration Release -destination 'generic/platform=iOS' \
    -derivedDataPath "$build_dir" -archivePath "$build_dir/$scheme.xcarchive" \
    "${signing_flags[@]}" archive
  export DOT_EXPORT_OPTIONS="$build_dir/ExportOptions.plist"
  python3 - <<'PY'
import json, os, plistlib
from pathlib import Path
config = json.loads(Path('store-release.json').read_text())
options = {
    'method': 'app-store-connect', 'signingStyle': 'manual',
    'teamID': config['teamId'], 'signingCertificate': 'Apple Distribution',
    'provisioningProfiles': {config['bundleIdentifier']: config['iosProfile']},
    'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True,
}
Path(os.environ['DOT_EXPORT_OPTIONS']).write_bytes(plistlib.dumps(options))
PY
  xcodebuild -exportArchive -archivePath "$build_dir/$scheme.xcarchive" \
    -exportOptionsPlist "$DOT_EXPORT_OPTIONS" -exportPath "$output_dir"
  artifact="$output_dir/$scheme.ipa"
  [[ -f "$artifact" ]] || { echo 'The expected IPA was not exported.' >&2; exit 1; }
fi
if [[ "${2:-}" == --upload ]]; then
  : "${ASC_KEY_ID:?Set ASC_KEY_ID for the approved Apple API key}"
  : "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID for the approved Apple API key}"
  xcrun altool --validate-app "$artifact" --api-key "$ASC_KEY_ID" --api-issuer "$ASC_ISSUER_ID"
  xcrun altool --upload-app -f "$artifact" --api-key "$ASC_KEY_ID" --api-issuer "$ASC_ISSUER_ID"
  echo 'Uploaded to Apple. App Store Connect processing and TestFlight availability still need verification.'
else
  echo "Signed archive ready: $artifact"
fi
