# Immersed

An iPhone app for watching natural Japanese YouTube content with tappable captions and dictionary lookups. It is not a course or a synthesized-speech lesson app.

## Current draft

- Native in-app YouTube browser, with Japanese topic searches for daily life, food, travel, and conversation. Searches are not a language-filtered or curated catalog.
- Experimental adapter reads visible player captions (including YouTube auto captions) and native Japanese text tracks, where accessible. Turn on Japanese captions using YouTube's own controls.
- Tapping a segmented word pauses the video and queries Jisho for real readings/definitions. Results are cached for the session. General conjugation/lemma normalization remains to be implemented.
- Save a dictionary entry with the current caption, source URL/title, and approximate observed cue start time. Resume playback, replay the captured line, or return to saved context.
- Persistent local vocabulary; earlier demo vocabulary is preserved in its original storage key.

**Not yet implemented:** new speech recognition for uncaptioned media, reliable support for every YouTube layout/video, strict Japanese-only feed filtering, podcasts, offline dictionary, or app-store distribution. The adapter reads rendered captions rather than a complete timestamped transcript. Replay uses when the caption was first observed, which may be late when entering a video or enabling captions mid-sentence. Fullscreen YouTube may cover the app's study pane; stay inline for lookup.

## Try on iPhone for free

Install Expo Go, sign the cloud workspace in to Expo, and run `npx expo start --tunnel --go`. Open the printed preview URL. Keep the development server running. `react-native-webview` is included in this SDK's Expo Go app; no signed build is required for this prototype.

In this cloud workspace, the Expo tunnel WebSocket needed the configured HTTPS proxy. A development-only preload is at `/workspace/scratch/expo-proxy.cjs`; the working command is `NODE_OPTIONS='--require=/workspace/scratch/expo-proxy.cjs' npx expo start --tunnel --go --port 8081`. This environment-specific file is outside the repository and contains no credentials.

## Validation and limits

The cloud network explicitly blocks YouTube, so live video playback and caption capture could not be verified here. A local simulated player fixture tests the caption bridge, segmentation, pause command, and navigation reset. Jisho's actual API returned entries for 今日. These checks do not prove that YouTube's current iPhone page layout exposes captions to the adapter. The browser preview explicitly displays a limitation message because a website cannot inspect YouTube's cross-origin iframe.

```sh
npm ci
npm run lint
npm run typecheck
npm run export:web
npx expo export --platform ios
npx playwright install chromium
npm run test:e2e
```

See [PRODUCT.md](PRODUCT.md) for the product direction. [TESTFLIGHT.md](TESTFLIGHT.md) describes optional future paid-membership distribution; it is paused and manual-only.

Dictionary queries send the selected word to Jisho.org. Dictionary data includes JMdict/EDRDG (CC BY-SA 4.0); attribution and license URL appear in the saved-word library. Do not place provider secrets in the client. No transcription service, subscription, or paid build is enabled.
