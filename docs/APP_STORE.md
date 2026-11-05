# App Store preparation

Owner confirmed Apple Developer Program membership on 2026-11-05. The Expo project is linked to [@somamill/immersed](https://expo.dev/accounts/somamill/projects/immersed); its ID is in `app.json`. The iOS bundle ID is `com.somamill.immersed`. The Expo config declares only standard exempt encryption; confirm this against the final binary when answering Apple export-compliance questions. Membership alone does not create Apple signing certificates, an App Store Connect record, or a working speech server.

## Draft listing (English)

- Name: Immersed — Learn Japanese
- Subtitle: Watch Japanese. Tap any word.
- Category: Education
- Keywords: Japanese,language learning,immersion,subtitles,dictionary,JLPT,video,vocabulary
- Description: “Learn from the Japanese videos you already enjoy. Watch in a focused view, follow available Japanese subtitles, tap words for dictionary meanings and grammar, and save useful vocabulary with its video context. Choose a JLPT level and optional furigana to focus on unfamiliar words. Search the Japanese–English dictionary whenever you need it. Immersed is independent and open source. Video and subtitle availability depend on YouTube and the connected language service.”
- Privacy policy URL: https://github.com/Somamill/immersed/blob/main/PRIVACY.md
- Support URL: https://github.com/Somamill/immersed/blob/main/SUPPORT.md
- Public support email: k4jenx@gmail.com (approved by the owner on 2026-11-05).
- Marketing URL: https://github.com/Somamill/immersed
- Price: Free (draft; confirm in App Store Connect).

Do not advertise universal automatic subtitles, Google sign-in, background audio, podcasts, or guaranteed recognition accuracy until those capabilities pass real device tests. Do not submit illustrative browser screenshots as evidence of live iPhone playback. Capture final screenshots from a signed iPhone build with genuinely available content, and complete App Store Connect age rating, privacy answers and rights declarations based on that build. The current app uses a YouTube web view; confirm player and caption behavior against YouTube terms and Apple's review rules.

## Build and review gates

1. Link the correct Apple team and create the App Store Connect app record with `com.somamill.immersed`. Record its numeric Apple app ID as `ASC_APP_ID` in GitHub Actions variables and an Expo access token as `EXPO_TOKEN` secret only if using the manual TestFlight workflow. No credential belongs in this repository.
2. Finish a permanent HTTPS language service and verify its YouTube audio access. Set the public `EXPO_PUBLIC_IMMERSED_API_ORIGIN` variable to that HTTPS origin in the Expo **production** environment before building. `eas.json` selects that environment. The value is embedded in the app bundle and must not be a secret. Validate a signed build can search the dictionary and obtain captions. An Expo tunnel or a server running only in this workspace will not be reachable reliably by App Review or users.
3. Build a signed iOS binary with `npx eas-cli@latest build --platform ios --profile production`. Upload it to TestFlight, then verify playback, Japanese captions, word lookup, network loss/recovery, accessibility and local storage on a physical iPhone. Test the captionless-video case described in [RELIABILITY.md](../RELIABILITY.md).
4. Finalize the App Store privacy questionnaire, listing screenshots, review notes and any required demo information in App Store Connect. Uploading a binary does not publish it; select the processed build and submit the version for Apple review only after the acceptance test passes.

Current state: Expo project linked; release build configuration exists. No signed build, App Store Connect app record, stable API host or physical-device acceptance result has been verified here. Public App Store submission is blocked by those gaps.
