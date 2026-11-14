# Native Apple Store delivery

Releases use **GitHub → Xcode → TestFlight → App Review → App Store**. Expo/EAS account links, hosted JavaScript updates and Expo Go distribution are retired. The existing React Native apps retain native SDK modules and local native-project generation. End users install a bundled app and do not need Expo or a running development Mac.

## Local release

From `Apps/Store`, run `npm ci`, `npm run typecheck`, `npm run lint` and `npm test`. Use `DOT_BUILD_NUMBER=<unused Apple build number> bash scripts/build-store.sh ios` or `macos`. Use `simulator` for an unsigned bundled test app. The scripts generate native projects locally, then use Xcode. Do not hand-edit generated `ios/` files.

To validate and upload an archive with Apple tools, append `--upload` and provide `ASC_KEY_ID` and `ASC_ISSUER_ID`. Keep the approved private API key in Apple's normal secure key location; do not put it or signing certificates in the repository. Apple processing must complete before a build is available for testing.

## Background delivery from GitHub

The manual **Native Store delivery** workflow builds either platform or both on a GitHub macOS runner. Source changes can be requested and reviewed from Codex on mobile; the runner performs the native build with your Mac asleep.

One-time setup requires an approved `store-release` GitHub environment containing `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8_BASE64`, `APPLE_DISTRIBUTION_P12_BASE64`, `APPLE_DISTRIBUTION_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `MAC_PROVISIONING_PROFILE_BASE64`, `MAC_INSTALLER_P12_BASE64` and `MAC_INSTALLER_PASSWORD`. These are encrypted GitHub environment secrets, not files committed to Git. Provisioning profiles must match `store-release.json` and the bundle identifier. No Expo token is used.

Set repository variable `STORE_RELEASE_ENABLED=true` only after that setup is verified to enable automatic delivery for app changes merged into main. Until enabled, push-triggered release jobs skip and manual delivery reports any missing setup. The workflow allocates a build number from App Store Connect, signs, uploads, and waits for Apple to report a valid processed build. A successful build is not a published App Store release. TestFlight tester access, screenshots/privacy metadata, App Review submission and Apple's approval remain distinct stages; use the tested build for review.

The initial public release is still being prepared. This guide does not claim that a build has passed App Review or that an external TestFlight link is public.
