# Mac requirement coverage

| Requested behavior | Current implementation / limit |
| --- | --- |
| Full Apple Silicon Mac app, named immersed. | Compiled arm64 AppKit executable, native windows/menus/file dialogs, embedded WebKit. Homebrew runtime dependencies remain required. |
| iOS study features and settings | Shared preference, familiarity and vocabulary-coverage logic; same dictionary/morphology/JLPT data. Mac controls provide furigana, pitch, saved context, lookup, level overrides, themes, filters, history and transcript checks. This is a desktop interface rather than the iOS gesture layout. |
| M1 speed and reliability | MLX on Apple Silicon, bounded chunks, one speech worker, cached analysis/model files/transcripts, dependency fingerprinting, playback-position restoration and request limits. Short natural-speech benchmarks and integration checks are recorded in MACOS-VALIDATION.md. |
| YouTube login and search | In-app public search and native browsing are implemented. Google rejects embedded sign-in; account authentication remains unresolved pending a supported Google integration. |
| Default ad blocking | Compiled WebKit rules, enabled by default and configurable. Complete removal of same-stream YouTube advertising is not promised. |
| Original target-language videos | Original-Japanese metadata filter and toggle for search and direct playback; unknown originals are excluded while enabled. The optional general YouTube browsing window is labelled unfiltered. |
| Natural Mac keyboard support | Native menus, standard editing, Command-O/L/comma/1/2/3, Space/K, J/L, sentence arrows, Escape, media controls and speed. |
| iCloud settings connection | Local persistence and JSON import/export, including saving a backup to iCloud Drive. Automatic iPhone/Mac iCloud synchronization remains deferred per the no-Developer-ID decision. |
| Hover lookup and pause | Delayed hover lookup, pause, controlled resume, click-to-pin, native speech pronunciation. |
| Download and offline study | Local media library, accessible YouTube downloads, transcript reuse, dictionary availability, chapters, seeking and saved-word context. Models must be downloaded before offline recognition. |
| Highlighting every word | Shared iOS familiarity policy fixes the level bug, including explicit unknown overrides and unlisted words. UI tests exercise N5/N1 and persistence. |
| Captions without supplied Japanese subtitles | Local speech fallback for accessible audio, including imported video/audio. Access restrictions and recognition errors prevent universal support. |
| Quoted transcription example | Checked against the provided video context with two local models. Main wording agreed closely; generated text stays labelled and differing passages can be replayed. |
| Local MP4 and Japanese M4B audiobooks | Native import, playback/seek, chapter metadata, transcription, lookup and offline study. Tested H.264/AAC MP4 and AAC M4B. |

Unresolved external work: provider-supported Google account integration and signed cross-device iCloud synchronization. Claims of universal source access, complete ad removal, or perfect transcription are intentionally excluded.
