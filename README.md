# Immersed

iPhone-first Japanese immersion: choose a natural Japanese video, watch in a focused player, and tap words/grammar in Japanese subtitles for dictionary lookup.

## Current implementation

- Browse Japanese topics in YouTube; selecting a watch/Shorts URL switches the app to focused viewing. An injected player adapter isolates the player from surrounding comments, likes, and recommendations while retaining the player and its controls. Discovery is still search-based, not a strictly language-filtered feed.
- Automatically enable Japanese native text tracks or YouTube's exposed captions button where available. Read actual player captions; text fragments are concatenated without adding spaces between characters.
- Real Kuromoji/IPADIC morphological analysis runs on the preview server. Smart grouping joins inflection chains, suru verbs, dictionary-recognized noun compounds, and a small set of common grammar constructions. Readings, dictionary forms, parts of speech, and heuristic grammar labels accompany each group.
- The full pinned JMdict English dataset (218,963 entries) is installed and indexed on the preview server. Lookups use dictionary forms rather than the displayed conjugated word. No Jisho request or dictionary subscription is needed. This is server-local, not an offline-on-phone dictionary.
- Settings persist: smart groups vs. morphemes, furigana, automatic transcription attempts. Save a dictionary entry with the caption and video context.
- If no source caption has appeared after eight seconds on a selected video, start a self-hosted ASR job and poll its status. The worker attempts audio acquisition using yt-dlp, then Whisper base via faster-whisper on CPU; completed cues are cached and synchronized against the observed video clock.

## Important current limitation

**This cloud network denies YouTube access.** That blocks the server's source-audio acquisition, so subtitle generation for captionless YouTube videos is wired but cannot currently succeed here. This is not a working universal automatic-caption service. The UI reports failure instead of showing invented text. Source captions can still work on the phone's own network. Live iPhone compatibility with the current YouTube DOM and automatic caption controls remains to be confirmed.

The ASR packages are installed; Python syntax/import checks pass, but the Whisper model and an end-to-end audio recognition job have not been validated in this environment. Model download begins only after source audio is acquired. CPU preparation may be slow and recognition can be wrong. Preview limits are 30 minutes/150 MB per source, one recognition job at a time, and a 15-minute worker timeout. Some login/region-restricted videos will remain unsupported even with suitable networking.

Player focus, caption capture, and controls rely on YouTube's DOM and can break when its layout changes. The local browser fixture is not a live YouTube playback test. Grammar labels are limited rules, not full contextual explanations. Fullscreen YouTube can cover the app's study pane. Replay timestamps for observed captions are approximate; generated cues use the recognizer's timestamps.

## Develop and preview on iPhone (free)

```sh
npm ci
npm run language:setup
python -m venv .venv
.venv/bin/pip install -r server/requirements.txt
npx expo start --tunnel --go
```

Install Expo Go on the iPhone and open the printed preview URL. The development server must remain running. This SDK's Expo Go includes `react-native-webview`; no Apple Developer fee or signed build is required for this draft. The cloud server needs curl/tar for the pinned dictionary setup and Internet/model access for ASR.

In this cloud workspace the tunnel needs the configured HTTPS proxy: `NODE_OPTIONS='--require=/workspace/scratch/expo-proxy.cjs' npx expo start --tunnel --go --port 8081`. The environment-specific preload is outside the repository and contains no credentials.

## Verify

```sh
npm run lint
npm run typecheck
npm run test:language
npm run test:e2e
npm run export:web
npx expo export --platform ios
```

The language tests use real Kuromoji and the installed full JMdict dataset. Browser tests use local simulated player markup for focus/caption controls; API tests exercise real analysis/lookup. They do not establish live YouTube or on-device behavior.

## Architecture and data

`src/youtube.ts` is the page adapter; `src/language.ts` calls a server service over the current Expo tunnel. `server/language.cjs` hosts the dictionary/analyzer. `server/transcription.cjs` manages local ASR jobs; `server/transcribe.py` acquires/decode/transcribes media. `metro.config.js` attaches development-only API handlers through Metro middleware. This is preview infrastructure: production needs a separately hosted authenticated service and a configured client service origin. A static web export or signed binary does not include a running backend.

Subtitle text, words, and selected video IDs are processed on this preview server. Saved vocabulary stays in device-local storage. Earlier sample vocabulary is preserved under its old key. Downloaded dictionaries, model/runtime files, and generated transcripts are ignored by Git.

See [THIRD_PARTY.md](THIRD_PARTY.md) for JMdict's CC BY-SA 4.0 attribution, parser/IPADIC notices, and Migaku research. No proprietary Migaku code or paid dictionary content is included. [TESTFLIGHT.md](TESTFLIGHT.md) is an optional paused distribution route; its workflow is manual-only. No paid API or subscription is configured.
