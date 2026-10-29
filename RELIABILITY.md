# Immersed: tap a video and learn

The product's primary acceptance test is a real Japanese video with **no Japanese source captions**: tap it on an iPhone, automatically obtain timed Japanese speech-recognition captions, tap a word, then resume playback. This test is currently **blocked**, not passed. UI polish and mocked API tests do not complete the product.

## What this draft now does

- Uses an embedded video with a fixed reading area and automatic word lookup pause/resume. It never switches to a full watch page with comments after a player error.
- Accepts verified Japanese captions and rejects English/unknown-language fallbacks. It attempts speech recognition automatically when captions are absent.
- Stores up to eight Japanese caption tracks on the device for 30 days, each capped at 128,000 serialized characters/5,000 cues. Larger tracks remain live-only. Invalid/expired cache entries are ignored. Cache failures cannot interrupt playback. Cached captions do not make YouTube playback or the server dictionary available offline.
- Recovers temporary service errors with bounded backoff/timeouts. Explicit source/network denials stop rather than repeatedly requesting forbidden audio.
- Uses large icon-only navigation with screen-reader labels and selected states. Only navigation floats; subtitles occupy their own full-width section.

## Infrastructure required to complete the core feature

1. A persistent API and durable job queue independent of Expo/Metro and this workspace's lifecycle. A worker restart must resume or safely restart jobs; concurrent viewers must share a job for the same video/language/model revision.
2. A supported, permitted way to obtain the selected video's audio. This workspace's proxy denies YouTube acquisition, so the installed credential-free Whisper recognizer cannot transcribe captionless YouTube videos here. Expo Go cannot capture another player's internal audio. Moving buttons or adding retries does not remove either constraint.
3. Workers that transcribe in small timestamped segments, expose real progress and return early segments before completing long recordings. Persistent caption caching, bounded worker concurrency and cancellation are required. These production capabilities are not implemented by the current one-worker preview.
4. A stable, configured service origin for the client, health monitoring, request limits and recovery alerts. Expo development tunnels are temporary; restarting one creates a new link. The current preview does not provide always-on hosting.

Videos that are removed, private, region restricted, unavailable for embedding or inaccessible to the audio provider cannot be guaranteed. The interface should provide a truthful, quiet explanation and preserve the learner's context; it must never invent captions or silently substitute English.

## Release gate for a reliable iPhone version

Test on a physical iPhone with native Japanese captions, YouTube Japanese ASR, no source captions, long recordings, fast seeks and speech gaps. Verify Japanese-only output, synchronization, word/grammar grouping, dictionary lookup and automatic playback resume. Repeat with network loss/reconnection, app background/foreground, worker restart and two simultaneous requests. Confirm that comments never appear and the reading area remains visible.

Measure tap-to-play, first-caption latency, caption timing error and lookup latency against explicit targets on device. A reasonable initial target is cached captions under 1 second and cached lookup under 200 ms; these are **targets**, not measured results. Speech recognition cannot promise perfect accuracy. Public-release readiness requires end-to-end captionless-video success and stable hosting, in addition to the automated fixture tests.

## App icon and preview

The generated mint play/book mark is configured as the app/project icon and web favicon. The opaque square source is processed by Expo for platform icon sizes. Expo Go retains its own installed Home Screen icon; a standalone installed build is needed for Immersed's own native Home Screen identity. The preview should not be described as a shipped standalone app.
