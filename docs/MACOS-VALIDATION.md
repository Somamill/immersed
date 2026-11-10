# Mac validation

Validated on Apple M1 Pro, 16 GB unified memory, with a compiled arm64 AppKit executable.

## Automated checks

- Expo lint, TypeScript typecheck, version consistency and Expo web export.
- Existing language and server regression suites, with the pinned dictionary/context datasets installed.
- Node media/API integration checks: real AAC M4B import, chapter extraction, byte-range and suffix seeking, invalid ranges, invalid/cross-origin requests, persistence, serialized recognition, cache separation by quality, offline download storage/reuse, transcript seeding and removal.
- Python speech checks: timestamp offsets, bounded progress, silent audio, confidence flags, duration clamping and word-timed splitting without rewriting text. These unit checks do not download a speech model.
- Chromium and WebKit study flows: real morphology and dictionary lookup, level changes/known overrides, hover pause/resume, persisted settings, M4B and H.264/AAC MP4 playback with remote requests blocked, and original-language search filtering.

Run on macOS with Homebrew FFmpeg/yt-dlp and Node dependencies installed:

```sh
npm ci
npm run language:setup
npm run context:setup
npx playwright install chromium webkit
npm run test:mac
npm run lint
npm run typecheck
npm run version:check
npm run test:language
npm run test:server
npm run export:web
```

## Physical Mac app checks

The native picker imported an AAC M4B example from File > Open. The app played it, generated Japanese subtitles and vocabulary coverage, and opened the dictionary definition for 体験 while playback was paused. M4B extension filtering was corrected after this check exposed a picker restriction. The app used its own window, with no external browser launch.

Public search for “三宅香帆 PageTurners” returned six results with Japanese-original metadata. Source-language filtering was additionally exercised with unknown and non-Japanese fixtures.

## Speech smoke measurements

Source: https://www.youtube.com/watch?v=5C3hh2fO4mE. The reported wording is near 149 seconds in the original cached track. A downloaded surrounding excerpt used for measurements was 35 seconds long; stream extraction can include boundary pre-roll.

| Mode | Warm elapsed time for 35-second excerpt |
| --- | --- |
| MLX Whisper large-v3-turbo | 10.30 seconds |
| MLX Whisper large-v3 | 13.57 seconds |

These times include Python/worker startup and exclude downloads; model weights were already cached. A separate short Japanese speech-synthesis fixture reproduced both known sentences exactly, and a digital-silence fixture produced no text. Neither test establishes general transcription accuracy.

Both models reproduced the main reported phrase closely, with differences in contractions and surrounding segmentation. The app therefore offers comparison/replay rather than asserting that an unusual-looking phrase is wrong. The complete 38-minute video was not manually transcribed or scored against a human reference.

## Limits of this validation

No Apple Developer ID was supplied, so signed iPhone/Mac iCloud synchronization was not enabled. Google account authentication in an embedded player is blocked by provider policy. Ad rules were installed in the native WebKit host, but complete removal of every YouTube advertisement is not established. Tests do not establish universal codec, DRM, restricted-video, or source-language metadata availability.

## November 10: playback and caption cross-check

- Chromium and WebKit cover adjacent-block navigation, rapid repeated seeks, gaps, hover layout stability, delayed YouTube pause/resume, paused-before-hover behavior, fullscreen lookup, visible lookup actions, rate persistence, clearing opened URLs and saving offline without switching playback.
- The reported public video at 6:04 has an acoustic homophone error. A 38-second excerpt took 12.70 seconds with turbo and 22.66 seconds with large-v3. Both retained spelling errors. A Japanese-specialised Kotoba 2.0 MLX trial took 20.48 seconds and omitted speech, so it was not adopted. Supplying the visible phrase as a Whisper prompt also failed to fix the reported line reliably.
- Direct video-frame sampling produced two JPEGs of about 56 KB each in 4.01 seconds including source resolution/network access. Apple Vision read the author-provided caption with confidence 1.0. Pronunciation matching rejects unrelated video labels; two independent frame matches are required before displaying the author-provided line. This improves that caption source without claiming perfect acoustic transcription.
- These are bounded smoke measurements on the same M1 Pro/16 GB Mac, not whole-book or all-video accuracy guarantees. Original audio excerpts and captured frames stay in ignored local test files.

Native verification also confirmed automatic replacement of the reported 6:04 line with the author-provided “紙上の教会” caption, and fullscreen lookup of 教会 with all three actions visible.

A final contextual-dictionary check found unsupported free-form explanations for the rare paper-church term. Context output is now restricted to supplied dictionary definitions and an exact source phrase. Native-model checks selected congregation, reason, opening an account and opening a window in their respective contexts. Unclear rankings keep the ordinary dictionary available, and uncertain results are cached to avoid repeated work.
