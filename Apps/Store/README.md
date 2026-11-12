# Immersed Store edition

A separate Store project for authorized, imported media. The existing root app, desktop wrappers, language service and community distribution remain separate.

The primary flow is watching a local video and tapping Japanese SRT/WebVTT captions. Dictionary lookups, saved vocabulary, subtitle parsing and playback position stay on the device. No hosted API origin is required. Unsupported features include YouTube/Netflix extraction, downloader integrations, DRM bypass, screen recording and automatic system-audio captions. Exact-form dictionary matching can miss inflections; the search field accepts a corrected dictionary form.

## Build

Use Node 24+, Python 3, `npm ci`, then `npm run dictionary:build`. The script downloads a pinned, checksum-verified data archive and generates the ignored offline SQLite asset. It also runs automatically after EAS installs dependencies. Do not add the 56 MiB generated database or signing files to Git.

Run `npm run typecheck`, `npm run lint`, `npm test` and `npx expo-doctor`. Use `npx eas-cli@latest build --platform ios --profile production`; local signing files stay outside the repo with only an ignored credentials.json reference. Expo project: somamill/immersed. Apple team: YJH8WWUVF3. Universal bundle: com.somamill.immersed. App Store Connect: 6834110293. Free.

`DOT_PLATFORM=macos npx expo prebuild --platform ios --clean` enables the CNG Catalyst plugin. Build the generated Immersed workspace/scheme for `generic/platform=macOS,variant=Mac Catalyst`, passing `IPHONEOS_DEPLOYMENT_TARGET=16.4 MACOSX_DEPLOYMENT_TARGET=13.4 SUPPORTS_MACCATALYST=YES`. The plugin enables sandboxing and user-selected file access only for Mac builds; generated native files remain untracked. Mac compilation, signing and native acceptance must pass before submission.

## Release gates

Check real file import, playback, subtitle seeking, tapping words, offline definitions, pronunciation, saved context, persistence, removal, failed/oversized files, denied picker access, sandbox behavior, keyboard/VoiceOver and large text. Capture authentic Store-build screenshots. Use the Store-specific PRIVACY.md and THIRD_PARTY.md for listing disclosures and attribution. Validate the signed archive and confirm Apple processing before choosing it for review. Do not submit a build with unresolved release gates.

The root project's version:update script owns the repository version; keep this project's app/package/lock versions aligned. Preserve the shared branding/dot tokens. Impeccable source detection is partial for React Native; HTML checks do not validate native behavior. Native rendering review is still required.
