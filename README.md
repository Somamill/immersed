# Immersed

An iPhone-first language immersion app. Japanese first; a language-neutral content model leaves room for other languages.

**Draft 0.1:** an Expo / React Native interaction prototype, not a finished media or transcription service.

## Try it on your iPhone

**Current choice: free previews using Expo Go.** No paid Apple Developer membership or TestFlight build is needed. While the cloud development server is running, open its preview link in Expo Go on the iPhone; compatible code changes refresh in the app. The preview link stops working when the server/session stops. Expo Go supports this draft's bundled native modules, but future native features may require a different distribution approach.

TestFlight remains an optional future route for a standalone install: see the [setup guide](TESTFLIGHT.md). Its workflow is manual-only, so pushing code does not trigger builds. No signed build has been uploaded.

1. Install **Expo Go** from the App Store.
2. In this cloud workspace, run `npm ci`, then `npx expo start --tunnel --go`.
3. Open the generated Expo link on your iPhone, or scan its QR code using Camera. When reading this on the same phone, open the link directly.
4. Turn Silent Mode off and tap a lesson, then **Listen**. Japanese speech uses your device's installed voices; availability and pronunciation depend on the device.

The development server must remain running, and Expo Go must support the project's Expo SDK. A tunnel URL is temporary. ChatGPT helps develop the app; it does not install an unsigned iOS binary. A permanent app install needs a signed build and Apple distribution, such as TestFlight.

Cloud-session verification: TypeScript, web export, iOS JavaScript/Hermes export, and both browser interaction tests passed. These are not on-device iOS tests. The default Expo tunnel required Expo authentication in this session; `npx expo start --tunnel ngrok --go` was also attempted but timed out. There is no working hosted phone preview yet. Authenticate Expo in an appropriate trusted environment, or run the project locally and open the LAN QR code from an iPhone on the same network.

GitHub publishing: authenticated as `Somamill`, but `gh repo create` was rejected with `Resource not accessible by integration (createRepository)`. No remote repository was created. Create an empty private repository, then add it as `origin` and push `main`. The source is committed locally and can be pushed without rebuilding.

## What works

- Two original Japanese sample lessons presented as video/podcast concepts.
- Device-generated Japanese speech with sentence-level highlighting, speed controls, previous/next, and sentence repeat.
- Tappable, manually segmented Japanese words with curated meanings and readings.
- Word lookup pauses speech. Returning to the story restarts the selected sentence.
- Vocabulary saved with sentence, English translation, language, and source title. Persistent local storage; no account needed.
- Furigana and translation toggles (session only).
- YouTube URL validation and opening in YouTube/Safari, clearly labeled as external.

## What is not implemented

No embedded YouTube player, RSS discovery, real podcast audio, automatic word segmentation, general dictionary, word-level timing, live captions, transcription backend, cloud sync, flashcard review, or offline media. The lesson art is a placeholder, not a video. All text and translations are original sample content. There is no claim of measured latency or production reliability yet.

## Development

```sh
npm ci
npm run start       # Expo Go
npm run web         # browser prototype
npm run typecheck
npm run export:web
npx playwright install chromium
npm run test:e2e
```

See [PRODUCT.md](PRODUCT.md) for scope and integration decisions. `src/content.ts` defines language-tagged lessons, sentence cues, tokens, and saved vocabulary. `App.tsx` contains the prototype UI, speech lifecycle, and local persistence.

No credentials are needed for this draft. Never put transcription-provider secrets into an Expo client bundle. `.expo`, `node_modules`, and export output stay out of version control.
