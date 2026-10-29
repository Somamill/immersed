# Immersed

iPhone-first Japanese immersion: choose a natural Japanese video, watch in a focused player, and tap words/grammar in Japanese subtitles for dictionary lookup.

## Current implementation

- Browse Japanese topics in YouTube; selecting a video opens the dedicated embedded player. No watch-page CSS is used to hide or reposition the player. Discovery is still search-based, not a strictly language-filtered feed.
- Closing any dictionary lookup resumes playback if it was playing before the lookup; a manually paused video remains paused. Smart groups are on by default, including a one-time migration from the earlier experimental preset.
- The subtitle pane is hidden during browsing and appears only for a selected video.
- Automatically enable Japanese native text tracks or YouTube's exposed captions button where available. Read actual player captions; text fragments are concatenated without adding spaces between characters.
- When exposed by the page, load a signed Japanese timed caption track directly on the phone; existing caption capture remains the fallback. This is not new speech recognition.
- Capture batching is reduced from 100 ms to 16 ms. Completed partial analyses are retained, cached results display immediately, and word definitions are prefetched with analysis. On-phone latency is not yet benchmarked.
- Real Kuromoji/IPADIC morphological analysis runs on the preview server. Smart grouping joins inflection chains, suru verbs, dictionary-recognized noun compounds, and a small set of common grammar constructions. Readings, dictionary forms, parts of speech, and heuristic grammar labels accompany each group.
- The full pinned JMdict English dataset (218,963 entries) is installed and indexed on the preview server. Lookups use dictionary forms rather than the displayed conjugated word. No Jisho request or dictionary subscription is needed. This is server-local, not an offline-on-phone dictionary.
- Settings persist: grouping, furigana, portrait layout, theme, JLPT level and Shorts controls. Automatic transcription attempts are mandatory. Save a dictionary entry with the caption and video context.
- If no source caption has appeared after four seconds on a selected video, start a self-hosted ASR job and poll its status. The worker attempts audio acquisition using yt-dlp, then Whisper base via faster-whisper on CPU; completed cues are cached and synchronized against the observed video clock.

## Important current limitation

**This cloud network denies YouTube access.** That blocks the server's source-audio acquisition, so subtitle generation for captionless YouTube videos is wired but cannot currently succeed here. This is not a working universal automatic-caption service. The UI reports failure instead of showing invented text, distinguishes source restrictions from network-policy failures, and allows retry. Failed jobs expire instead of remaining stuck forever. Source captions can still work on the phone's own network. Live iPhone compatibility with the current YouTube DOM and automatic caption controls remains to be confirmed.

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

## Versions and GitHub

Repository: https://github.com/Somamill/immersed. [CHANGELOG.md](CHANGELOG.md) and Settings → Version history record released updates. Current release: 0.2.0.

For each user-facing update:

```sh
npm run version:update -- patch --title "Update title" --note "What changed"
npm run version:check
# Run checks, commit, tag v<version>, then push main plus the tag.
```

The version script synchronizes app/package/lockfile versions, in-app release notes, and the changelog. The GitHub release workflow publishes the corresponding notes whenever a version tag is pushed. Existing remote commits are preserved; no force-push is used.

## Viewing and learner preferences (0.3.0)

- Tall portrait player option keeps a subtitle/word-lookup area below the video. Navigation moves to a rounded, blurred bottom dock. This is a frosted navigation design, not Apple's native Liquid Glass API.
- AMOLED mode defaults on and uses `#000000` app backgrounds; light mode remains available. YouTube theme overrides are best-effort because its page is externally controlled.
- Select a completed JLPT level, N5 through N1. Listed words at or below that difficulty remain normal; more advanced listed words receive an amber highlight. Unlisted words remain neutral. Per-word Known/Unknown overrides persist locally. JLPT assignments are community estimates; see THIRD_PARTY.md.
- Shorts can be hidden (default): supported shelves/cards are hidden, Shorts navigation and pasted Shorts-format URLs are blocked. This is not a duration filter; a short video opened using a normal watch URL is not necessarily identifiable as a Short.
- No subtitle-loading message is shown in the player. Preparation/error status is available in Settings.
- Discovery searches target ordinary daily life, cooking, travel, conversation, science and gaming instead of beginner lessons. This remains language-biased discovery, **not verified filtering of original Japanese audio**. Strict audio-language filtering needs dependable video metadata and is not implemented.
- Focused viewing selects a visible/playing video, avoids forcibly changing ancestor positioning, and retains video/controls visibility. Settings includes Restore original player layout; a terminated WebView process reloads. Local markup tests do not prove the intermittent black-frame issue is fully fixed on actual iPhones.
- Google account links are handed to the system browser. Google sign-in inside an injected WebView is unsupported, and a browser login is not imported into the in-app YouTube player. Full account integration needs a proper Google OAuth client and API/session design.
- Locked-screen YouTube audio **is not implemented** in this Expo Go WebView. Picture-in-picture is permitted where YouTube/iOS supports it; it is not a guarantee of background audio. Reliable native background playback needs a supported media source and an appropriately configured native build. No fake working background-audio switch is provided.

## Player correction and gestures (0.4.0)

This release supersedes the earlier CSS-focused watch-page approach. Selecting a video now opens `youtube.com/embed/VIDEO_ID` directly in WKWebView. It requests inline playback and Japanese captions and supplies the HTTP Referer using the **actual installed host application's ID** from expo-application (Expo Go's ID while previewing). Subframes required by YouTube remain allowed. The caption bridge no longer hides, resizes, repositions, or changes visibility of player/ancestor elements. Existing native/timed caption adapters remain experimental.

YouTube can refuse embedding for particular videos. Settings → Open original YouTube player is the fallback; it opens the full watch page without the old layout-hiding code. This architecture removes a known fragile rendering layer; actual iPhone playback remains unverified in this cloud environment.

The bottom Portrait / Compact control and Settings → Portrait player choose the player height. In the swipe handle **below** the video, swipe left/right to seek forward/backward 10 seconds, up for Portrait, down for Compact. The handle does not cover YouTube controls and the subtitle list can still scroll independently.

Automatic subtitle generation is now mandatory whenever no Japanese source captions are detected. There is no toggle, and older `automatic: false` preferences are ignored. This does **not** solve the audio-access failure: a direct worker reproduction returned `NETWORK_BLOCKED` in this environment. The current server cannot generate captions for a captionless YouTube video until its audio is accessible from an authorized transcription environment. No end-to-end YouTube ASR success is claimed.
