# Version history

Dates use Asia/Tokyo. Each released update has a matching Git tag and GitHub Release.

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
