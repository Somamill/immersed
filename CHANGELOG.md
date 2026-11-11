# Version history

Dates use Asia/Tokyo. Each released update has a matching Git tag and GitHub Release.

## 0.16.4 — 2026-11-11

Resume hover-paused playback through YouTube buffering

- Track playback intent through YouTube buffering so hover lookup does not mistake a buffer for a manual pause. Close temporary lookup when keyboard focus leaves it, and clear lookup when opening a panel.

## 0.16.3 — 2026-11-11

Dismiss hover lookup reliably and keep split words readable

- Subtitle clicks no longer pin hover lookup. Leaving the word and card closes it and resumes only playback paused by lookup; preserve the hovered target during subtitle refreshes and respect manual pauses.
- Handle pointer exit into embedded video, explicit playback, and accidental reopening after Close. Clear stale text during subtitle gaps.
- Join dictionary-confirmed split words such as 読 / 者 in the Mac reading view, preserving transcript characters and audio bounds. Recognition errors can still remain; no guessed wording is substituted.

## 0.16.2 — 2026-11-11

Show saved subtitle sections immediately on reopening

- Restore prepared subtitle cues while source audio is still downloading so returning to a long video does not hide already-completed output.

## 0.16.1 — 2026-11-11

Stabilize native fullscreen idle controls and warm-model progress

- Hide native fullscreen chrome with explicit element state as well as fullscreen styling, keeping subtitle lookup available.
- Keep measured transcription progress visible when the same MLX speech model is reused instead of reporting another model load for each section.

## 0.16.0 — 2026-11-11

Quiet fullscreen and current-video subtitle priority

- Fade fullscreen controls after inactivity while subtitles and dictionary lookup stay interactive. Reveal controls from the bottom edge or keyboard focus, with reduced-motion support.
- Default Discover to native Japanese audiences and domestic discussions, with a persistent toggle to include learner content while preserving language and length filters.
- Prioritize speech at the current video playhead, checkpoint completed sections and continue remaining work in bounded background sections. Replace the three-video rejection with priority scheduling and resumable background pauses; downloads and model loading can still take time.
- Reduce redundant subtitle scans and play-button updates, and suspend hidden study rendering while Discover is open.

## 0.15.1 — 2026-11-11

Keep speech preparation display uncluttered

- Use concise speech stages in the progress bar and hide duplicate footer status while preparation is active.

## 0.15.0 — 2026-11-11

Floating glass navigation and vocabulary progress

- Use a floating glass icon toolbar and transparent Mac title area, with accessible labels, tooltips, keyboard focus and active navigation states.
- Keep the latest 100 dictionary lookups locally, reopen them and save words directly from history. Deduplicate rapid hover lookups and preserve original video context.
- Track Saved, Learning and explicitly Known words with persistent progress and include lookup history in exported backups. Automatic iCloud sync still requires signing.

## 0.14.0 — 2026-11-11

More discovery, trackpad study and clearer speech progress

- Find additional discovery pages with the same language and length filters, up to 72 candidates per search.
- Add native trackpad subtitle navigation, stable fullscreen lookup anchoring and a measured speech progress bar with honest loading states.
- Start audiobook look-ahead eight seconds earlier and poll missing subtitles faster. Keep GPU-accelerated Turbo recommended; reject a shorter-chunk experiment that increased total time. WhisperKit and Kotoba need further validation before replacing the engine.

## 0.13.0 — 2026-11-11

Discover Japanese podcasts and conversations on Mac

- Add a dedicated Mac Discover page with podcast, interview, culture, everyday-life and ideas topics, plus search in the embedded app.
- Share original-Japanese, minimum-length and Shorts settings with discovery. Conversation first favors spoken content and filters obvious music/gameplay; metadata cannot guarantee every result is entirely speech.
- Preserve the current player when switching between Discover and Watch. Cache results and show confirmed originals progressively.

## 0.12.5 — 2026-11-11

Bundle the iPhone fallback player

- Load the fallback YouTube player from the app bundle instead of the unavailable GitHub Pages URL or temporary Expo tunnel. Preserve Japanese caption and playback bridges.
- This removes the gateway page inside an already-open app; Expo Go launch still requires a live development server. YouTube can still deny embedded playback, and captionless videos still need an accessible audio source.

## 0.12.4 — 2026-11-11

Use stable GitHub Pages player fallback

- Host the HTTPS YouTube fallback player on GitHub Pages and load it from a fixed address instead of the expiring Expo preview tunnel. Keep the player bridge and Japanese caption relay unchanged.
- The Expo Go app itself still needs a running development server, and YouTube may still block playback in any embedded player. Signed iPhone distribution remains blocked on Apple signing credentials and permanent language-service hosting.

## 0.12.3 — 2026-11-11

Keep the iPhone preview retrying

- Run the Expo preview under a detached supervisor and keep retrying tunnel failures with bounded backoff instead of stopping after eight failures.
- The preview remains tied to this temporary cloud workspace; a workspace shutdown or a newly assigned Expo URL can still interrupt the link. Permanent availability requires hosting outside the preview session.

## 0.12.2 — 2026-11-11

Preserve Japanese captions when playback is blocked

- Keep a retrieved Japanese transcript readable when YouTube blocks embedded playback, and distinguish that playback restriction from failed subtitle generation. Wait for a sustained watch-page failure before switching players.
- This cannot override videos unavailable in both YouTube players. Fresh captions for videos without a usable Japanese track still require an audio source, unavailable in the Expo Go preview.

## 0.12.1 — 2026-11-10

Ground context lookup in dictionary meanings

- The local model now selects an existing dictionary definition and quotes the actual subtitle phrase. Free-form definitions are no longer displayed. A wider caption context supports the ranking, and uncertain results are cached. The model can still choose an incorrect sense.

## 0.12.0 — 2026-11-10

Smoother subtitle navigation and fullscreen study

- Previous/next and arrow or J/L keys move between adjacent subtitle blocks. Floating hover lookup preserves layout, resumes only playback it paused, and keeps actions visible. Dictionary lookup uses the selected reading and shows attested expressions immediately.
- Fullscreen includes interactive subtitles, lookup and a compact playback-speed menu. Opening a video clears its URL from search, completed transcripts have no status notice, and Save offline keeps the current player in place.
- On Mac, Apple Vision can match two small video-frame samples to a speech block and use confirmed on-screen Japanese captions. The reported paper-church homophone error was corrected in native verification. Frame access, OCR and speech recognition can still fail; videos without usable visible captions continue to use Whisper.

## 0.11.1 — 2026-11-10

Keep phrase context for inflected verbs

- Recognize dictionary phrases around a selected verb even when its inflected form is longer than the phrase's dictionary form.

## 0.11.0 — 2026-11-10

Video fullscreen and contextual dictionary

- Expand only the embedded video with F or the player fullscreen button. Add local sentence-aware dictionary explanations with surrounding captions and dictionary-attested phrases; preserve instant definitions.
- Apple Silicon prepares a 2.2 GB Qwen3 MLX model in the background. Context explanations are generated suggestions and can be mistaken; normal lookup remains available during setup or failure.

## 0.10.1 — 2026-11-10

Refine progressive search layout

- Keep the language toggle compact and align video thumbnails, titles and metadata in a responsive three-column search layout.

## 0.10.0 — 2026-11-10

Faster search, instant lookup and fullscreen study

- YouTube search fetches lightweight listings first and verifies original-language metadata progressively, with an in-place language toggle and redesigned video cards. Subtitle recognition prepares a short playhead-first preview before filling the rest of a minute, persists coverage across interruptions and preloads the next section earlier. Captions supplied by YouTube are fetched before downloading audio. Word definitions are prefetched with sentence analysis and cached by reading; dictionary search updates while typing and resolves additional potential and negative adjective forms. Add a fullscreen button, F key, Control-Command-F and embedded-video fullscreen. Search depends on YouTube access and language metadata; speech remains generated and unverified.

## 0.9.6 — 2026-11-10

Restore kanji subtitle default

- Revert the 0.9.5 forced large-v3 default, which produced kana-only text in the reported audiobook section. Restore turbo and its existing kanji transcript on upgrade; preserve listening position, learned words and reading settings. Later explicit model choices remain available. The alternate model is no longer labelled as a guaranteed accuracy upgrade. Subtitle wording is preserved rather than guessing kanji from kana.

## 0.9.5 — 2026-11-10

Cleaner subtitles and Japanese dictionary lookup

- Remove Listening filler and regeneration controls from the study view. Temporary subtitle failures recover automatically with bounded retries, and large-v3 becomes the default once while later model choices remain available. Dictionary lookup resolves inflected and continuative forms such as 吸い取り, keeps attested compound verbs together, respects readings and labels reading-only matches. Lookup now shows headwords, parts of speech, dictionary sources and expandable meanings. Speech recognition can still make mistakes; dictionary readings never silently replace subtitle wording.

## 0.9.4 — 2026-11-10

Subtitle loading status and release verification

- Keep model loading distinct from recognition progress, so a newly requested section does not report a misleading zero-percent download. Automated checks now install FFmpeg, exercise desktop subtitle logic and run mobile and desktop browser suites against their own services.

## 0.9.3 — 2026-11-10

Cross-checked subtitle timing and Whisper decoding

- Mac and iPhone now share the rolling YouTube caption parser. Whisper uses bounded surrounding audio context, word ownership at chunk boundaries and limited confidence-based decode retries. Fixes cached retries, immediate model switching, stale captions and misleading cross-model comparison caused by different segmentation. Earlier cached sections remain available; regenerate a section to use the updated decoder. Model agreement and confidence are not a guarantee of transcription accuracy.

## 0.9.2 — 2026-11-10

Faster audiobooks and reliable listening progress

- Long audiobooks prepare one-minute subtitle sections at the current listening position, cache partial work and reuse the Apple Silicon speech model. Position, chapter and speed are saved locally. Embedded covers form the audio background, and playback continues when the Mac window is closed, with native media controls. Newly selected sections still need local recognition; speech accuracy depends on the recording. iCloud sync still requires Apple signing.

## 0.9.1 — 2026-11-10

Quiet advanced-level subtitle highlighting

- Use a shared token-aware highlighting policy to skip automatic particle, auxiliary, name and grammatical-fragment highlights caused by homophone level collisions. Keep explicit known/unknown choices authoritative.
- Replace solid Mac word blocks with subtle underlines and use furigana only for highlighted vocabulary. Validate a near-N1 profile against the reported sentence in Chromium and WebKit; personal N2-completed/known-word choices stay on the user's device.

## 0.9.0 — 2026-11-09

Add local video, Japanese audiobooks and offline Mac study

- Add native file opening and a persistent library for MP4/MOV video, M4B/M4A audiobooks and other supported audio, including chapters, seeking, offline subtitles and saved context. Add accessible YouTube downloads and filtered in-app search.
- Share iOS preference, familiarity and coverage rules; add furigana, pitch, saved words, settings backups, context suggestions, version history, hover pause/resume and Mac shortcuts. Add default WebKit ad-request filtering and original-Japanese metadata checks.
- Improve MLX speech with bounded chunks, one worker, silence/confidence handling, separate fast/accuracy caches and model comparison/replay. Validate native M4B import and both WebKit/Chromium playback flows; benchmark a 35-second natural-speech excerpt on M1 Pro.
- Google embedded account login remains unavailable. Automatic cross-device iCloud sync is deferred until signing is configured; JSON backups can be saved to iCloud Drive. Complete ad removal, every restricted video, and perfect transcription cannot be guaranteed.

## 0.8.3 — 2026-11-09

Open immersed in a native Apple Silicon window

- Compile an arm64 AppKit application with persistent embedded WebKit playback, native menus and no browser launch. Fix JLPT word highlighting using shared iOS vocabulary data and morphology; add hover lookup, pause and Space/arrow shortcuts.
- The Mac interface is not yet at iOS feature parity. iCloud signing is deferred; YouTube login, ad filtering, language filtering and offline playback remain unfinished. Generated transcripts require audio verification, and restricted videos can remain unavailable.

## 0.8.2 — 2026-11-09

Add a searchable Mac app launcher

- Create Immersed Mac.app in ~/Applications on first launch so the Homebrew install is visible in Finder, Spotlight, and Launchpad. The app launcher reuses the local service when it is already running.
- Keep the app as an unsigned launcher for the browser-based Mac prototype; this does not add a signed native app or DMG.

## 0.8.1 — 2026-11-09

Show Mac subtitle chunks and iPhone–Mac artwork

- Add original concept artwork to the repository and describe Immersed as an iPhone and Mac project. The Mac companion now publishes each 60-second Japanese recognition chunk and waits for the first subtitle before playback.
- The Mac worker still needs a real macOS installation and accuracy test; its initial audio download/model startup can be slow and some YouTube videos may block playback or audio access. iPhone captionless generation remains unavailable in Expo Go.

## 0.8.0 — 2026-11-09

Add local Mac transcription draft

- Add a macOS study window in the same repository with YouTube playback, generated Japanese subtitles, clickable dictionary lookup, known words and sentence navigation. Local MLX Whisper large-v3-turbo on Apple Silicon and faster-whisper large-v3 on Intel transcribe downloaded audio.
- Add a Homebrew tap formula and launch command. First launch downloads dependencies, dictionary and model; Mac hardware, YouTube audio access, speed and accuracy are not yet validated. This is a browser-window prototype, not a signed native app, and subtitles appear after full transcription rather than in real time.

## 0.7.4 — 2026-11-09

Load mobile YouTube Japanese caption URLs

- Resolve path-relative mobile YouTube timedtext URLs against the selected watch page before validating and fetching them. This addresses the iPhone track rejection observed on eslI8_s5blg and stops repeated diagnostic spam.
- Automatic speech captions for videos with no usable Japanese track still require verified audio capture. The cloud preview cannot fetch YouTube audio; the native iPhone prototype requires an Apple-signed build and device test.

## 0.7.3 — 2026-11-09

Restore early Japanese caption capture

- Capture Japanese caption responses that arrive before the watch-page bridge starts, preserving tappable subtitles when YouTube exposes a track. Add track-source diagnostics for the iPhone.
- Captionless videos still require audio speech recognition. This Expo preview cannot obtain YouTube audio on its cloud network; on-device recognition requires a signed iPhone build and device validation.

## 0.7.2 — 2026-11-09

Restore large portrait player and retry Japanese caption formats

- Restore the earlier tall video area and default zoomed portrait playback; pinch inward fits the complete frame and outward fills the viewing area.
- Try both JSON3 and the original Japanese track format when YouTube returns an empty caption response, and log track languages and fetch outcomes for iPhone diagnosis.
- Videos without an accessible Japanese track still need speech recognition. This preview cloud receives proxy 403 for YouTube audio; the on-device prototype requires an Apple-signed build and is not available in Expo Go.

## 0.7.1 — 2026-11-09

Recover verified Japanese caption text without DOM language tags

- When YouTube confirms its selected track is Japanese, use rendered caption fragments even if YouTube omits lang attributes; retain guards against English or translated track fallback.
- Add source diagnostics to distinguish missing YouTube caption tracks from a blocked transcription worker on real iPhones. The earlier audio-transcription pipeline was not removed; this preview server still receives proxy 403 when it requests YouTube audio.
- Captionless videos in Expo Go still need a reachable audio source; the native local-caption prototype requires a signed iPhone build.

## 0.7.0 — 2026-11-09

Prototype on-device Japanese captions from iPhone app audio

- Add a native iOS proof of concept that requests ReplayKit and Speech permission, captures app-audio samples transiently, and sends them to Apple's on-device Japanese recognizer for tappable timed lines when source captions are absent.
- This feature requires a custom signed iPhone build and cannot run in Expo Go. An unsigned simulator build compiled successfully; live YouTube audio capture, accuracy, timing and protected-content behavior still require iPhone testing.
- YouTube access and policy review remain necessary before an App Store release; the cloud transcription worker still cannot access YouTube audio on this preview network.

## 0.6.8 — 2026-11-09

Restore hosted-player captions and compact video layout

- Relay Japanese caption, clock and playback messages from the HTTPS YouTube iframe to the iPhone app; relay sentence controls back to the frame and place the reading panel directly below the video.
- The captionless-video transcription worker remains blocked from YouTube audio on this preview network. A source video with no accessible Japanese track cannot be generated here; the app now reports this without calling it a YouTube subtitle requirement.
- Live iPhone verification of the new relay remains necessary; no claim is made that every YouTube video can be transcribed or embedded.

## 0.6.7 — 2026-11-09

Try HTTPS YouTube player when iPhone watch playback fails

- When YouTube marks a public watch video unplayable in the iPhone WebView, try its official iframe player from the Expo preview's HTTPS origin, with a referrer and Japanese caption preferences.
- Playback and clickable subtitles in the fallback still require verification on an iPhone. YouTube can restrict embedding, and videos without Japanese tracks still need a supported transcription source; this preview cannot guarantee every video.
- The HTTPS fallback currently uses the live Expo preview origin and requires permanent hosting before production release.

## 0.6.6 — 2026-11-09

Keep YouTube player in focus

- Hide watch-page title, actions and comments by following the visible player through YouTube's changing mobile layout.
- Retry the caption and playback-diagnostic bridge after the watch page finishes loading so About can report an actual player state.
- Log the same playback state to the active Expo preview for device-side diagnosis.
- The iPhone's Video unavailable error is not yet diagnosed from a device report; signing credentials are also still required for a TestFlight build.

## 0.6.5 — 2026-11-09

Focus YouTube watch pages and diagnose playback

- Hide watch-page metadata and comments without repositioning YouTube's player, and defer caption hooks until the page loads.
- Let YouTube enter native fullscreen when inline playback is unavailable.
- Show YouTube playability and media diagnostics under Settings → About when a video fails.
- The public Kiyo video still needs an on-device playback check; this cloud cannot access YouTube media, and videos without source captions still need accessible audio for transcription.

## 0.6.4 — 2026-11-09

Use YouTube watch pages for playback

- Open videos directly on YouTube's normal mobile watch page so creator-disabled embeds do not bounce learners back to discovery.
- Keep the site's player layout intact, while retaining Japanese subtitle capture and study controls.
- YouTube can still restrict private, region-limited or account-required videos; captionless transcription remains limited by source-audio access.

## 0.6.3 — 2026-11-09

Restore playback for videos that block embedding

- When YouTube rejects the embedded player, automatically retry the same video on its normal watch page inside Immersed while keeping the learning view.
- If YouTube also blocks the normal watch page, return to discovery with a clear message; source-audio restrictions still limit captionless transcription.

## 0.6.2 — 2026-11-09

Recover from blocked YouTube embeds

- Return to YouTube discovery when a video owner blocks embedded playback, instead of leaving a dead player and empty subtitle area.
- Owner-restricted videos still cannot play inside Immersed, and captionless YouTube transcription remains blocked by source-audio access.

## 0.6.1 — 2026-11-05

Prepare iOS App Store project

- Link Immersed to the owner's Expo project and add in-app privacy and support links with draft App Store listing and review steps.
- Apple Developer membership is confirmed, but signed iPhone testing, App Store Connect setup, persistent language hosting, and captionless-video acceptance remain outstanding.

## 0.6.0 — 2026-11-01

Acoustic timing and persistent-host deployment

- Added a standalone HTTPS host and production native bundles, with Docker deployment instructions. A permanent host has not yet been connected or deployed.
- Added optional audio-conditioned word alignment, explicit estimated-timing fallback, and reusable recognizer processes across chunks.
- Larger recognizers tied or lost to the baseline in local read-speech tests; no recognition accuracy gain is claimed. Current cloud YouTube audio access remains blocked and preview URLs remain temporary.

## 0.5.18 — 2026-10-31

Recover the preview and repair subtitle timing and cache priority

- Supervise the Expo preview with bounded automatic restarts. Expo addresses can change; the workspace still needs to stay running.
- Respect source word timestamps and clears, retain sentence skipping across rolling updates, reject invalid timelines, and continue fresh live captions beyond exhausted coverage.
- Preserve cached caption provenance and verified silence coverage; retry temporary word-analysis failures automatically. Source audio access is still blocked and ASR/slang accuracy and generated alignment remain imperfect.

## 0.5.17 — 2026-10-30

Add corpus cross-checks and steady player navigation

- Rank dictionary homophones with general word-pair/triple counts, pronunciation and grammar guards; sparse cases require agreement with a local model. ASR contextual overrides also need sequence evidence. No paid model API is required.
- Keep the discovery icon and video boundary consistent across study, dictionary and settings. Improve GitHub discovery, previews and contribution guidance.
- Frequency is not proof: source captions stay unchanged, rare words can lack corpus evidence, and this preview still cannot acquire audio for captionless YouTube videos.

## 0.5.16 — 2026-10-30

Improve grammar lookups and caption homophone suggestions

- Group conjectural grammar such as だろうなって; distinguish auxiliary う from dictionary animal nouns with POS-specific caches.
- Add context-ranked same-reading spelling suggestions for supplied captions, including 自称/事象 and 累計/類型. Explicit selection preserves the original caption spelling.
- Stabilize the video split and word popup height, collapse extra dictionary entries and request minimal YouTube controls. Source captions can still be wrong; no OCR or verified audio correction is added.

## 0.5.15 — 2026-10-30

Keep subtitle words visible and improve reading timing

- Preserve overlapping captions, exact-boundary appends, unparsed words and source sentences crossing partial ASR coverage.
- Add bounded reading grace, retain word end times, merge equal-timestamp cues, and avoid ending captions at arbitrary chunk boundaries.
- Reserve three furigana rows, grow the reading area with content, and reset caption scroll on sentence changes. Real iPhone timing/layout still need device testing; source-audio access remains blocked.

## 0.5.14 — 2026-10-30

Use Japanese context to check confusing caption alternatives

- Add a pinned Japanese language model to rank existing close-sounding ASR alternatives using surrounding captions; never synthesize replacement words.
- Protect proper/unknown words, numbers and negation; require stronger evidence to override a model majority and retain the original if checks fail.
- A constructed homophone example improved; six recorded diagnostic clips stayed at 22.3% CER. General speech accuracy gains and real YouTube validation remain unproven.

## 0.5.13 — 2026-10-30

Compare three Japanese speech recognizers progressively

- Add ReazonSpeech K2, Kotoba Whisper and Whisper Small with per-chunk text agreement, alternatives and measured timings.
- Stream partial caption updates through polling; preserve creator tracks while cross-checking automatic sources; invalidate stale recognition caches.
- Model disagreement remains unverified. CPU comparison is incremental, not guaranteed real-time. Kotoba timing is approximate; YouTube source audio remains blocked here.

## 0.5.12 — 2026-10-30

Improve Japanese subtitle recognition

- Replace Whisper base with open Japanese ReazonSpeech K2 int8; diagnostic sample CER improved from 48.7% to 29.1%, pending real YouTube validation.
- Use timestamped characters to build short Japanese caption cues, with overlapping bounded audio chunks and a model-versioned cache.
- Native and creator subtitle tracks may still contain errors; preview network restrictions prevent full YouTube transcription testing and this model does not diarize speakers.

## 0.5.11 — 2026-10-30

Separate word lookup, better expressions and optional pitch accents

- Restored subtitle word popup with pause/resume; Dictionary search and Settings keep playing in a larger lower panel.
- Dictionary-backed expressions including 気を抜く retain whole meanings across supported inflections. Vocabulary indicator now shows one conservative familiar-word percentage.
- Optional recorded Tokyo pitch accents from pinned Kanjium data in word lookups and dictionary search; absent patterns are hidden.
- Fresh captionless YouTube transcription, embedded Google sign-in and locked-screen playback remain unsupported in this preview; native playback and keyboard behavior still need iPhone testing.

## 0.5.10 — 2026-10-30

Keep watching with inline panels and vocabulary estimates

- Keep the selected video visible and playing above Dictionary, word lookup and Settings. These panels replace the lower reading area, and remain full screen without a selected video.
- Remove automatic pause/resume on navigation or word taps. Keep explicit play/pause controls available and preserve a deliberate pause.
- Add caption-sample vocabulary coverage estimates using JLPT level and personal knowledge; show a range for unrated words and avoid claiming measured comprehension.
- Adapt dictionary search to the lower panel and add iOS keyboard avoidance so the video can remain visible while typing.
- Native continuous playback and keyboard behavior need physical-iPhone validation. Estimates require enough Japanese captions; fresh captionless YouTube transcription and in-app YouTube account sign-in remain unsupported.

## 0.5.9 — 2026-10-30

Compact captions, simpler lookup and joined word fragments

- Bring wrapped subtitle rows closer while retaining the base text size. Add central play/pause between previous and next controls in study and lookup.
- Simplify the dictionary sheet: scrollable meanings, one Save action and a reachable known/unknown switch at bottom right. Keep tap-to-dismiss and playback intent.
- Fix compound-prefix lookup forms such as お名前 and 再利用, including suru inflections.
- Automatically join short adjacent cues when Japanese morphology and a dictionary confirm a word or inflection across the boundary; preserve source glyphs and outer timestamps, process progressively and validate every result.
- Boundary joining is conservative and cannot repair all ASR mistakes or DOM-only caption splits. Real iPhone layout and audio accuracy remain unverified; fresh captionless YouTube transcription and in-app account sign-in remain unsupported here.

## 0.5.8 — 2026-10-29

Pinch to fit, quicker skipping and quieter subtitles

- Default to the full video frame with black bars. Pinch outward to fill and inward to restore fit without reloading or hiding subtitles.
- Make sentence controls larger, rounder and more spaced. Activate on touch-down, deduplicate release, and prevent stale clocks from briefly restoring the old caption during seeks.
- Add persistent Any, 15+, 30+ and 60+ minute preferences; filter recognizable loaded YouTube cards by visible duration, hiding live or unreadable-duration cards when enabled.
- Use neutral subtitle text with a soft highlight only for unfamiliar words, retaining word/grammar lookup and JLPT/personal knowledge overrides.
- Pinch behavior and buffering speed need physical-iPhone verification; duration filtering depends on YouTube markup. In-app account sign-in and fresh captionless YouTube transcription remain unsupported in this preview.

## 0.5.7 — 2026-10-29

Quicker lookup, sentence controls and Japanese names

- Tap dictionary text, empty space or the backdrop to dismiss immediately and restore the prior playback intent; action buttons retain their functions.
- Add previous/next caption controls in the reading area and lookup, absolute seeking, and a dedicated left-edge back gesture with panel history.
- Prefetch nearby word analysis, stabilize the furigana lane, render at cue boundaries and forward native cue changes promptly. Use player APIs without synthetic CC taps.
- Add 743,685 JMnedict name entries beside JMdict, with proper-name priority, reading alternatives, name categories and Japanese/romanized-name search.
- Remove the ineffective Safari sign-in redirect. In-app YouTube account sign-in remains unsupported; provider toolbar behavior and edge gestures need physical-iPhone testing. Fresh YouTube transcription remains blocked by audio access.

## 0.5.6 — 2026-10-29

Natural Japanese subtitles and a clearer project showcase

- Remove the permanent subtitle label, separate About from settings, tighten Japanese text spacing, attach punctuation and place furigana above the base text.
- Prefer creator Japanese captions over automatic tracks, preserve rolling-caption timing, and invalidate old parsed caption caches without touching saved words.
- Add dock and browse swipes, fix Metro fallback forwarding, and publish a screenshot gallery, project illustration and subtitle-quality findings.
- YouTube audio access remains blocked here; fresh captionless-video transcription, stronger recognition and physical-iPhone behavior are not validated. A clean-audio diagnostic reproduced a wrong-kanji error in the existing recognizer.

## 0.5.5 — 2026-10-29

Compact navigation, centered subtitles and level-aware furigana

- Fit the navigation pill closely around three icons instead of spanning the screen; preserve comfortable touch targets.
- Center subtitle lines, improve word/line spacing, keep closing punctuation attached, and use amber difficulty and mint grammar colors.
- Restore a furigana on/off switch with level-aware readings: N2 shows N1 readings, while N2–N5 remain plain. Personal knowledge overrides apply; unlisted words remain unclassified.
- Handle JavaScript-only YouTube watch navigation, open each selected video in a fresh embed, and hide the previous page until the embed loads so watch-page comments/channel sections do not remain in the viewing area.
- Word and grammar lookup remain always on. Physical-iPhone routing/glass behavior remains unverified; fresh captionless-video speech transcription retains the existing audio-access limitation.

## 0.5.4 — 2026-10-29

Always-on learning, two-way dictionary and tighter subtitle timing

- Keep word/grammar lookup, grouping and readings always enabled; ignore older off settings and remove learning off switches.
- Add automatic English–Japanese dictionary search to Words, alongside saved vocabulary. Hide provider details and history in Settings → About.
- Use presented video-frame timestamps and immediate seek/playback events; expire timed cues correctly instead of displaying stale lines.
- Clip one rounded glass dock with matching radii and plain icon controls; simplify appearance to a single Dark mode switch.
- Remove the separate Google sign-in button. YouTube sign-in links open the system browser under Google policy; browser login is not shared with the embedded player.
- Physical-iPhone timing/glass remain unverified, and fresh captionless YouTube transcription remains blocked by source-audio access.

## 0.5.3 — 2026-10-29

Focused video player, friendly icons and device caption caching

- Replace text navigation with large accessible vector icons, add a generated mint play/book app mark, and configure native/project/web icon assets.
- Keep selected videos in the embedded player with a fixed reading area; remove the full watch-page fallback so comments cannot appear in the viewing screen. Embedding-disabled videos now report a playback error.
- Automatically reuse validated Japanese timed captions from a bounded, expiring device cache; preserve live playback if cache storage fails.
- Document persistent-service, supported-audio and physical-iPhone release requirements in RELIABILITY.md. Captionless YouTube speech recognition remains blocked by cloud audio access; the core acceptance test is unfinished.

## 0.5.2 — 2026-10-29

Japanese-only captions, fixed reading area and automatic recovery

- Enforce Japanese source/selected tracks, reject English translations and unknown CC fallback, and prevent old English lines leaking during a track switch.
- Place subtitles in a fixed full-width section beneath the portrait video; only bottom navigation floats.
- Remove subtitle retry/details, restore-player, video-fit and duplicate playback controls. Recover temporary subtitle failures automatically with bounded backoff and timeouts.
- Remove YouTube browse bottom navigation and its reserved padding so discovery continues behind the glass dock; refresh the page adapter with each release.
- New subtitles for captionless YouTube videos remain blocked by this cloud network’s proxy 403. Live iPhone playback and YouTube caption compatibility remain unverified.

## 0.5.1 — 2026-10-29

Combined portrait watching and reading with persistent subtitles

- Replace watch/reading modes with one portrait player; fill the video itself vertically with side cropping, with Fit entire video available in Settings.
- Keep the subtitle panel visible, retain the last real line through gaps, and provide playback, dictionary and retry controls together.
- Read Japanese caption tracks in the YouTube page session and observe actual Japanese timedtext responses; support JSON3/XML and explicitly select Japanese tracks.
- Disable WebView automatic content insets so browsing extends behind the floating glass dock; request and reinforce YouTube dark appearance before loading.
- Speech transcription still cannot acquire YouTube audio from this cloud network (proxy 403). Live iPhone playback and caption access remain unverified.

## 0.5.0 — 2026-10-29

Full-viewport portrait, native floating glass and app-wide swipes

- Full-screen portrait now fills the app viewport and defaults on; source video aspect ratio is preserved.
- Content extends under an absolute floating navigation dock, with native Apple Liquid Glass where supported and blur elsewhere.
- Add route-backed edge swipes between Content, Words and Settings, panel-wide horizontal gestures, and dictionary-header swipe dismissal.
- Fix an incompatible audio decoder by pinning PyAV 16.1.0; credential-free Whisper successfully transcribed a public test recording.
- YouTube source audio is still blocked by this environment’s proxy (403); automatic captionless YouTube generation remains unresolved, despite a working local recognizer.

## 0.4.0 — 2026-10-29

Dedicated YouTube player and mandatory subtitle fallback

- Replace watch-page CSS isolation with the dedicated YouTube embedded player and a Referer identifying the actual installed app; keep the original player as a fallback.
- Remove layout manipulation from the caption bridge and allow the subframes needed by the YouTube player.
- Add explicit Portrait / Compact controls and a separate swipe handle: left/right seek 10 seconds, up/down change layout.
- Remove the automatic-subtitles option and ignore older disabled preferences: captionless videos always trigger the speech-recognition attempt.
- A live worker reproduction still returns NETWORK_BLOCKED: generation for captionless YouTube videos remains unavailable on this server. Live iPhone playback is not verified by the automated fixtures.

## 0.3.0 — 2026-10-29

Portrait viewing, AMOLED theme and learner controls

- Add a tall-player layout and a rounded blurred navigation dock at the bottom.
- Add persisted N5–N1 level estimates with advanced-word highlighting and personal Known/Unknown overrides; familiar and unlisted words display normally.
- Add pure-black AMOLED mode, a Shorts toggle, and ordinary native-content topic searches.
- Remove subtitle-loading messages from the player and keep diagnostic status in Settings.
- Improve video selection/focus styles, expose original-layout recovery, and reload terminated WebViews; live iPhone black-frame recovery remains unverified.
- Hand Google account links to the system browser; an external login does not sign the embedded player in. Locked-screen audio and strict original-audio language filtering remain unsupported.

## 0.2.0 — 2026-10-29

Faster subtitles and smoother word lookup

- Closing a dictionary lookup resumes playback automatically if the video was playing before lookup.
- Smart word groups are enabled by default, with a one-time migration from earlier experimental settings.
- Subtitle capture responds sooner, retains useful partial analysis, prefetches dictionary entries, and can load Japanese timed caption tracks directly on the phone.
- Subtitle tools appear only after a video is selected; the browse-page instruction box is removed.
- Failed audio jobs can be retried, access failures are classified, and cache-write failures no longer discard successful captions. Cloud audio restrictions remain unresolved.
- Add in-app version history, a changelog, consistent version checks, Git tags, and automatic GitHub Releases.

## 0.1.0 — 2026-10-29

Japanese video immersion foundation

- Free iPhone preview through Expo Go.
- YouTube browsing, focused player, Japanese caption capture and saved vocabulary.
- Kuromoji word/grammar grouping and a full server-local JMdict dictionary.
- Self-hosted transcription pipeline prepared; source-audio access remains restricted in this cloud preview.
