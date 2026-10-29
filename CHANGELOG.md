# Version history

Dates use Asia/Tokyo. Each released update has a matching Git tag and GitHub Release.

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
