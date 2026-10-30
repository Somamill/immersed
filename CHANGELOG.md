# Version history

Dates use Asia/Tokyo. Each released update has a matching Git tag and GitHub Release.

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
