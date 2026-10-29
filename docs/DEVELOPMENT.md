# Immersed — development guide

Run all commands from the repository root. For the project introduction and current UI, see [README](../README.md).

iPhone-first Japanese immersion: choose a natural Japanese video, watch in a focused player, and tap words/grammar in Japanese subtitles for dictionary lookup.

See [Japanese subtitle quality](SUBTITLE_QUALITY.md) for the current typography, source-priority and recognition findings.

## Current implementation

- Browse Japanese topics in YouTube; selecting a video opens one portrait watch-and-read view. The video fills the upper viewing area, with a permanent full-width reading area beneath it. Only the bottom navigation floats. Wide videos fit completely with black bars by default; pinch outward to fill/crop and inward to restore the full frame. Discovery is still search-based, not a strictly language-filtered feed.
- Closing any dictionary lookup resumes playback if it was playing before the lookup; a manually paused video remains paused. Word/grammar grouping and lookup are always on. Optional furigana follows the selected JLPT level and personal knowledge.
- The subtitle pane is hidden during browsing and always present for a selected video. It displays active timed lines with tappable words and dictionary lookup; the section stays visible through speech gaps. There are no separate watch/reading modes, floating subtitle cards, duplicate playback buttons, or manual subtitle recovery/setup controls. Failures have a passive status; no loading spinner is shown.
- Explicitly select an available Japanese player caption track, including YouTube auto-generated tracks. Native English/unknown caption overlays are suppressed; only confirmed Japanese tracks can enter the reading area. During a language switch, the old DOM line is withheld until replaced. Native Japanese text tracks run in hidden mode for cue timing, with all other text tracks disabled.
- Fetch exposed Japanese timed caption tracks in the YouTube page session first. Observe only completed Japanese timedtext fetch/XHR responses, including player requests with session-specific parameters; parse JSON3 or XML. Separate native fetching and visible caption capture remain fallbacks. This is source-caption access, not new speech recognition.
- Capture batching is reduced from 100 ms to 16 ms. Completed partial analyses are retained, cached results display immediately, and word definitions are prefetched with analysis. On-phone latency is not yet benchmarked.
- Real Kuromoji/IPADIC morphological analysis runs on the preview server. Smart grouping joins inflection chains, suru verbs, dictionary-recognized noun compounds, and a small set of common grammar constructions. Readings, dictionary forms, parts of speech, and heuristic grammar labels accompany each group.
- The full pinned JMdict English dataset (218,963 entries) is installed and indexed on the preview server. Lookups use dictionary forms rather than the displayed conjugated word. No Jisho request or dictionary subscription is needed. This is server-local, not an offline-on-phone dictionary.
- Settings persist: light/dark theme, JLPT level and Shorts controls; grouping is mandatory and furigana is optional for harder words. Video layout and subtitle acquisition are automatic. Save a dictionary entry with the caption and video context.
- If no Japanese source caption has appeared after two seconds on a selected video, start a self-hosted ASR job and poll its status. Temporary failures recover automatically with bounded backoff; explicit network/source denials are not repeatedly requested. The worker attempts audio acquisition using yt-dlp, then Whisper base via faster-whisper on CPU; completed cues are cached and synchronized against the observed video clock.

## Important current limitation

**This cloud network denies YouTube access.** That blocks the server's source-audio acquisition, so subtitle generation for captionless YouTube videos is wired but cannot currently succeed here. This is not a working universal automatic-caption service. The UI reports failure instead of showing invented text, and distinguishes source restrictions from network-policy failures. Temporary failures recover automatically without a Retry button. Failed jobs expire instead of remaining stuck forever. Source captions can still work on the phone's own network. Live iPhone compatibility with the current YouTube DOM and automatic caption controls remains to be confirmed.

The credential-free Whisper base model successfully transcribed the public OpenAI Whisper JFK test recording in this environment. This verifies decoding and CPU recognition on an English test file, not YouTube access or Japanese caption accuracy. An incompatible PyAV 19 decoder was found and fixed by pinning PyAV 16.1.0. Model download begins only after source audio is acquired. CPU preparation may be slow and recognition can be wrong. Preview limits are 30 minutes/150 MB per source, one recognition job at a time, and a 15-minute worker timeout. Some login/region-restricted videos will remain unsupported even with suitable networking.

Player focus, caption capture, and controls rely on YouTube's DOM and can break when its layout changes. The local browser fixture is not a live YouTube playback test. Grammar labels are limited rules, not full contextual explanations. The player stays inline so its fullscreen interface does not cover the reading area. Saved timestamps for observed captions are approximate; generated cues use the recognizer's timestamps.

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

See [THIRD_PARTY.md](../THIRD_PARTY.md) for JMdict's CC BY-SA 4.0 attribution, parser/IPADIC notices, and Migaku research. No proprietary Migaku code or paid dictionary content is included. [TESTFLIGHT.md](../TESTFLIGHT.md) is an optional paused distribution route; its workflow is manual-only. No paid API or subscription is configured.

## Versions and GitHub

Repository: https://github.com/Somamill/immersed. [CHANGELOG.md](../CHANGELOG.md) and Settings → About → Version history record released updates. See the changelog for the current release.

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

## Full-viewport layout and app gestures (0.5.0)

Full-screen portrait is now the default and fills the application viewport; it is not the earlier 56%-height player. Source video aspect ratio is preserved. Captions appear in a floating panel, and navigation is an absolute floating dock while content continues to the bottom. On supported iOS 26 builds the dock uses native Apple Liquid Glass (`expo-glass-effect`); older platforms use blur. Full-screen controls are app-owned so the embedded player's landscape fullscreen button is disabled.

Navigation uses Expo Router. Swipe horizontally from either content edge to move among Content → Words → Settings; in Words and Settings, horizontal swipes work across the panel. Vertical scrolling and video controls remain separate. Swipe down from the dictionary header to dismiss and resume according to the prior playback state. The subtitle handle retains seek/layout gestures.

Transcription needs no API credentials. A compatible recognizer was tested successfully on a public test recording, but YouTube fetching still returns `Tunnel connection failed: 403 Forbidden` from this environment's proxy. The recognizer cannot generate subtitles without the audio. Repeated extraction attempts are now limited; no successful captionless YouTube transcription is claimed. No hosting account or API key is required for the installed recognizer.

## Unified portrait viewing and caption capture (0.5.1)

This supersedes 0.5.0's layout-only full-screen control: the video element now fills the portrait viewport with `object-fit: cover` and viewport dimensions, including when YouTube's video container has no intrinsic height. Wide videos crop at the sides; Fit entire video in Settings restores YouTube's original fitting. The app has one combined watch/read mode and no Reading/Full screen toggle. The subtitle panel stays mounted, retains the latest real caption, and has Play/Pause and replay controls. Horizontal handle swipes seek; vertical handle swipes expand/collapse the subtitle panel without switching playback layouts. On a subtitle failure the panel offers Retry/Details instead of disappearing.

Browsing reaches the bottom behind the floating glass dock. WebView automatic content insets are disabled. YouTube dark appearance is requested before content loads through its theme preference and reinforced with dark color variables/backgrounds; the unofficial YouTube preference format may change. Thumbnails and media colors are untouched.

Japanese tracks are selected explicitly through available player APIs and read before a video element is created. Caption requests use the page session first, and a narrow observer reads the player's own Japanese timedtext responses when a copied signed URL is empty. JSON3 and XML formats are supported. Local tests exercise session responses, Japanese track selection, caption gaps, dictionary lookup, portrait video geometry and dark browsing. They do not establish live YouTube/iPhone compatibility. The cloud audio download was retested and still receives a proxy 403; generating new subtitles for videos without accessible source captions remains unresolved.

## Japanese-only captions and fixed reading area (0.5.2)

This replaces the floating subtitle card with a full-width, opaque reading section in the screen's vertical layout. The video ends where that section begins; there is no overlap, rounded card, or separate watch/reading mode. Only the bottom navigation floats. Subtitle retry, restore-player, video-fit and duplicate playback controls are removed. Word lookup still pauses and resumes playback automatically. Horizontal reading-area swipes seek; app-edge and panel swipes still navigate sections.

Caption language is verified from the selected player/text track and Japanese-only timedtext URLs, including the native fetch fallback. DOM text also requires an explicitly Japanese caption-window language; unlabelled text relies on the verified timed/native track paths instead. Japanese source tracks translated to English are rejected. The native on-video caption overlay is hidden, and an unverified CC button is never enabled. A track-switch guard prevents an old English line from leaking after the player has already reported Japanese selection. Latin words in a genuine Japanese track remain valid. Existing YouTube captions, including its own Japanese ASR, are distinct from generating new speech-recognition captions here.

The browse-page adapter removes YouTube's duplicate bottom pivot bar and its reserved body/app padding, in addition to disabling native WebView insets. This is scoped to discovery pages and does not reposition player ancestors. The native WebView reloads its adapter when the app release version changes. Explicit embed errors automatically use the original player rather than requiring a restore button.

Temporary service/recognition failures retry automatically at most three times with backoff and request timeouts. Network-policy denials, source-access denials and missing-worker configuration stop with a passive status; automation cannot repair those conditions. A direct audio-access retest still returned the proxy's 403. No captionless YouTube ASR success or live iPhone validation is claimed.

## Focused player, icons and device caption cache (0.5.3)

Navigation now uses large vector icons with accessible labels, active states and 52-point touch targets. The generated mint play/book mark appears in the browse header and is configured as the project/app icon and web favicon. Expo Go itself retains its own installed Home Screen icon.

The player no longer falls back to a full YouTube watch page after errors, and top-level non-embed navigation is blocked while watching. This keeps comments and the full watch-page interface out of the viewing screen; embedding-disabled videos now report an error rather than opening a page with comments. The full-width Japanese reading/dictionary area remains beneath the video.

Verified Japanese timed tracks and successfully generated captions are cached on the device for repeat visits: up to eight tracks, 30-day expiry, 5,000 cues/128,000 serialized characters per track. Larger tracks remain live-only. Captions load automatically from cache before requesting recognition; cache writes are serialized and failures do not interrupt live playback. This does not provide offline video or an offline dictionary.

[RELIABILITY.md](../RELIABILITY.md) records the production architecture and physical-iPhone release gates. Automatic creation of subtitles for captionless YouTube videos remains blocked by source-audio access. The core end-to-end acceptance test is explicitly unfinished.

## One learning mode, dictionary search and timing (0.5.4)

Word/grammar grouping, lookup and furigana are always on, including after restoring older disabled preferences. Settings has one Dark mode switch (off = light), learner level and Shorts filtering. Provider, attribution, limitations and version details live under the closed About disclosure. The separate Google button is removed; YouTube sign-in now reports that account access is unavailable in this preview. Google prohibits embedded-browser authentication, and external browser sessions cannot be imported into the player.

Words combines saved vocabulary with automatic English ↔ Japanese dictionary search. The server searches Japanese spellings, readings, inflected dictionary forms and prefixes, or English gloss terms/phrases, ranking exact/common matches first. This is a word dictionary, not sentence translation or arbitrary-language translation. No dictionary import or paid API is required.

The media clock uses presented video-frame timestamps, immediate seek/pause/rate-change events and a fallback for older/non-rendering players. Timed cues expire correctly at their end rather than retaining stale text; the subtitle area stays visible during silence. The dock uses one clipped, rounded glass background with plain icon controls and a small active indicator. Research, source links and limitations are in [RESEARCH.md](../RESEARCH.md). Source caption quality, fresh captionless-video ASR and native iPhone behavior retain the previously documented limitations.

## Compact dock, level-aware furigana and isolated playback (0.5.5)

The dock fits its three icons in a centered 182-point pill with 56-point-wide touch areas and small outer insets. It no longer spans most of the screen. Subtitles wrap into centered lines with more vertical spacing, amber for harder words and mint for particles/auxiliaries. Closing punctuation stays with the preceding word instead of wrapping alone.

Furigana now has an on/off switch. With N2 selected, estimated N1 words receive readings while N2–N5 words do not. Personal known/unknown choices override the estimate; words without a listed level do not get an invented classification. Grouping, word lookup and grammar remain always enabled. The setting applies to subtitle furigana; pronunciation remains available in dictionary entries.

The page bridge now reports JavaScript/history-only navigation even before a video element exists. Both those events and native navigation select the dedicated embed, remount the player WebView for each video, and keep the old watch page invisible until the embed has loaded. This covers a route that could previously leave the full watch page, channel information and comments inside the viewing area. This behavior is fixture-tested; physical-iPhone compatibility still needs confirmation. YouTube's own controls/title overlays within an embed are distinct from a full watch-page comments/channel section.

## Lookup, names and navigation (0.5.7)

Use Node.js 24. `npm run language:setup` installs JMdict and verifies the pinned JMnedict archive before building `.data/names.sqlite`. The 743,685 name entries are queried through a read-only disk index rather than parsed into the Metro JavaScript heap. It is server-side data, not an offline iPhone dictionary. The database is generated locally and not committed.

Proper-noun tokens prioritize matching JMnedict names, with general JMdict senses still available. Ordinary words retain JMdict priority; names supplement misses and exact-name searches in Japanese or romanized English (for example, Suzuki). Names can have multiple readings and identities; morphology and dictionary matches do not prove which person is speaking. Name data does not repair incorrect source subtitles. No paid dictionaries are installed.

Tap the backdrop, text or empty sheet space to close lookup. Save/known/unknown and sentence controls retain their actions. Dismissal has no slide animation, and playback resumes only if it was playing when lookup opened. Previous/next controls use actual cue boundaries, which may divide a grammatical sentence; next is disabled at the final known cue and both are disabled without a timed track. Seeking from the lookup closes it and restores the prior play/pause intent.

The left edge is reserved for an app back gesture so the embedded page cannot consume it. It returns through visited panels, leaves a selected video for its prior browse URL, or uses available WebView history while browsing. This is not an interactive native UINavigationController transition; hardware feel and provider controls need a physical-iPhone check.

Nearby captions are analyzed in advance, in-flight requests are shared, ruby has a stable lane, and React redraws on cue/playback changes instead of every clock message. Native text-track cue clears are forwarded on cuechange. Playback uses available YouTube player methods without simulating CC taps; YouTube still controls its own toolbar, and this does not promise its controls never appear.

The Safari sign-in redirect has been removed. The preview reports that YouTube account sign-in is unavailable. Registered native OAuth may enable account API features but cannot be advertised as importing a Safari account into the embedded player.

## Viewing and session length (0.5.8)

New videos default to fit/contain inside the existing portrait player. A two-finger spread selects fill/cover; pinching inward restores fit. The gesture changes the video sizing without reloading the player or moving the reading panel. View mode is per-video, and new videos reset to fit. Two-finger gestures do not request section navigation. Touch events are tested in a phone-size Chromium fixture; physical iPhone/WebKit gesture behavior remains unverified.

Settings persists a minimum length of Any (default), 15, 30 or 60 minutes. The injected browser adapter reads recognizable mobile/desktop video-card duration badges, including H:MM:SS and Japanese duration labels, and applies the threshold to loaded cards. Missing durations, upcoming/live badges and unreadable values are hidden with a threshold set. The filter updates for newly rendered/recycled cards and can be cleared with Any. It does not provide a server-filtered YouTube catalog, cannot guarantee compatibility with future markup, and does not prevent opening a pasted video link.

Skip controls have larger rounded targets with more separation. Pointer activation occurs on press-in, with release deduplicated and a fallback for accessibility activation. Targets use the latest media time or pending target so repeated taps can advance separately. During a seek, the requested caption is shown immediately and stale media clocks are ignored until the target cue is observed, for at most 1.2 seconds. The actual player remains authoritative afterward. This improves interface response, not network buffering speed or source timestamps.

Subtitle text and readings are neutral: white in dark mode, dark in light mode. Only unfamiliar words get a soft background, based on the existing JLPT estimates and explicit known/unknown overrides. Grammar remains tappable and grouped without its own color. Unlisted words stay neutral unless marked unknown.
