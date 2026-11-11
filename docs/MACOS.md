# immersed. for Apple Silicon Mac

immersed. is a compiled arm64 AppKit application with an embedded WebKit study interface and YouTube player. It opens its own Mac window. Homebrew manages its local Node, Python, FFmpeg and yt-dlp dependencies; MLX runs speech recognition on Apple Silicon. Distribution currently uses GitHub/Homebrew without Developer ID signing or notarization.

## Discover Japanese conversations

Use **Discover** in the Mac toolbar to browse Conversations, Podcasts, Interviews, Books & culture, Everyday life and Ideas. The top search field searches Discover or opens a pasted YouTube link in the embedded player. **Watch** returns to the current player without replacing its media.

Discover shares **Original Japanese only**, **Hide Shorts** and **Minimum video length** (Any, 15+, 30+, 60+ minutes) with Settings. Unknown or non-Japanese source-language metadata is excluded while the original-language filter is on. The app currently studies Japanese; discovery follows that language.

**Conversation first** is enabled by default. It biases searches toward spoken discussion, ranks podcast/interview titles higher, and filters recognizable background music and gameplay. Turn it off for broader searches. This uses titles and channel metadata, so it cannot guarantee that every result is entirely speech. Results appear progressively as original-language checks finish, and matching searches are cached for five minutes.

## Install and launch

```sh
brew tap Somamill/immersed https://github.com/Somamill/immersed.git
brew install --HEAD Somamill/immersed/immersed-mac
immersed-mac
```

The first command launch creates `~/Applications/immersed.app`. Open **immersed.** from Finder, Spotlight or Launchpad afterward. Initial setup installs the local dictionaries, context database and speech runtime. Speech models download on first use; prepare them before going offline. Subsequent starts reuse dependencies, dictionaries, models and transcripts. Quit immersed. before updating with `brew upgrade --fetch-HEAD Somamill/immersed/immersed-mac`.

## Local video and Japanese audiobooks

Use **Open file**, Command-O, drag and drop, or Finder’s Open With menu. Supported import extensions are MP4, M4V, MOV, M4B, M4A, MP3, WAV, AAC, FLAC, OGG and WebM. Actual playback depends on the codecs WebKit supports; H.264/AAC MP4 and AAC M4B/M4A are the tested paths. Imports copy media into the local library so moving the original does not break study sessions.

M4B/M4A audio has native media controls and chapter selection when chapter metadata is present. Local video and audio share timed Japanese subtitles, word lookup, furigana, pitch accent, saved-word context, known/unknown overrides, sentence navigation, playback speed and position restoration. The local dictionary and completed transcripts work offline.

For accessible YouTube videos, **Save offline** saves media to the same library. A completed online transcript is reused when available; otherwise local recognition generates one. Downloads are limited to 2 GB, local imports to 8 GB. A video’s access restrictions can prevent downloading. Cached transcripts are stored separately for fast and accuracy modes. Remove a library item with its two-step Remove control; an actively transcribing item must finish first.

## Study settings and Mac controls

The Mac and iOS app share preference restoration, vocabulary familiarity and coverage estimation code, as well as the same Japanese morphology/dictionary service and JLPT data. Settings include completed JLPT level, dark mode, furigana, pitch accent, known/unknown overrides, Shorts filtering and minimum duration. Unlisted words have no assumed JLPT level. Explicit unknown overrides remain highlighted at every level.

Hover briefly to look up a word and pause playback; leaving the lookup resumes only if hover originally paused it. Click to pin lookup. Saved words retain their meaning, reading, source sentence and playback context. Dictionary search accepts Japanese and English. Contextual spelling suggestions are suggestions, not verified corrections.

- Space / K: play or pause.
- Left / Right: previous or next sentence.
- J / L: previous or next subtitle block.
- Command-L: focus search.
- Command-O: native file picker.
- Command-comma: settings.
- Command-1 / 2 / 3: study window / library / saved words.
- F or the Video fullscreen button: video with interactive subtitles and lookup; Escape closes lookup, then exits fullscreen.
- Control-Command-F: standard Mac app-window fullscreen.
- Escape: close lookup or a panel.

Settings and saved words persist locally. Export/import provides a JSON backup through a native Mac save dialog; a backup can be saved to iCloud Drive. Automatic iPhone/Mac iCloud synchronization remains deferred until Apple signing configuration is available. Exporting a file is not automatic cross-device synchronization.

## YouTube search and filtering

Search runs inside the app. **Original Japanese only** is enabled by default and checks original-language metadata, not just titles or the selected dub. Unknown-language results are excluded. The toggle also guards directly opened video links. Shorts and duration filters apply to search results and playback selection. The native YouTube browsing window is explicitly labelled unfiltered; choosing a video sends it to the filtered study player.

Known advertising domains and ad request paths are blocked by default using compiled WebKit content rules, with a toggle in Settings. This does not guarantee removal of every YouTube ad, particularly advertising delivered with the content stream.

Google blocks account authentication in embedded web views. The app does not spoof a trusted browser or import personal browser cookies. Public YouTube browsing/search/playback work; authenticated account features still need a provider-supported sign-in integration. Google’s policy is documented at https://developers.google.com/identity/protocols/oauth2/policies#use-secure-browsers.

## Speech recognition and transcript checks

Video-supplied Japanese captions are preferred when available. Otherwise the app recognizes accessible audio locally. Fast mode uses MLX Whisper large-v3-turbo; accuracy mode uses the larger MLX Whisper large-v3 checkpoint. Both retain word timing and reuse the loaded model across bounded 30-second audio chunks. Only one speech worker runs at a time. Digital near-silence is skipped; low-confidence segments are marked, and the text is never automatically replaced with a context-model guess.

The study screen automatically prepares subtitles around the playhead. Speech output remains an estimate, and agreement between models does not prove accuracy. The supplied example “どんどんなさっているんですよね” was reproduced closely by both models with surrounding audio; it should not be replaced simply because it looks unusual out of context.

A 35-second natural-speech excerpt from the reported video took 10.30 seconds in fast mode and 13.57 seconds in accuracy mode on an M1 Pro with 16 GB memory, after model downloads. These measurements include worker startup and exclude network/download time. They are a short smoke benchmark, not a guarantee for every file or every M1 configuration.

Private, restricted, region-blocked, DRM-protected, unavailable or embedding-disabled videos can remain inaccessible. No implementation can promise support or perfect transcription for every YouTube video. See [validation details](MACOS-VALIDATION.md).

## Data and attribution

Media, transcripts, startup logs and dependencies live under `~/Library/Application Support/Immersed Mac`; the local HTTP service binds only to `127.0.0.1:4765`. Imported media and speech audio are not uploaded to a remote transcription service. First-time model and dictionary downloads need internet access.

JMdict/JMnedict: EDRDG, CC BY-SA 4.0. Pitch accents: Kanjium / Uros O., CC BY-SA 4.0. Context counts: Tatoeba contributors, CC BY 2.0 FR. Kuromoji/IPADIC provides morphology. See THIRD_PARTY.md and the source metadata under src/data for credits and pinned sources.

## Contextual dictionary on Apple Silicon

Definitions are prefetched with sentence analysis and appear immediately. A separate **Meaning in context** suggestion uses the selected word, its dictionary senses, dictionary-attested surrounding phrases, and the preceding/following captions. It selects an existing dictionary meaning and quotes the source phrase, without creating new definitions. Other dictionary senses remain available below it.

Qwen3-4B-Instruct-2507, quantized to 4 bits for MLX, runs locally. The first launch prepares a separate Python runtime and downloads approximately 2.2 GB of public model weights in the background. Playback and dictionary lookup continue during setup. Passages are never sent to a remote AI service. A context ranking can still select an incorrect dictionary sense; it is not a verified translation or transcription correction.

The model is loaded on demand, cached exact-context rankings are reused, and the worker exits after two idle minutes to release memory. On unsupported hosts or if setup fails, the normal dictionary remains available. Setup diagnostics are local at `~/Library/Application Support/Immersed Mac/.context-setup.log`; restarting the app retries setup.

Model: [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), Apache 2.0. [MLX checkpoint](https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit), pinned revision `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b`.

## Subtitle navigation and on-screen captions

Previous/next controls and arrow keys move to adjacent complete subtitle blocks. The current block is not restarted on Back. A floating lookup card keeps the subtitle layout stable, keeps its actions in view and resumes only playback paused by that lookup. Fullscreen includes the same subtitle words, lookup card and speed control.

On the Mac, **Read captions from video** can compare generated YouTube subtitles with Japanese text burned into the source video. Apple Vision reads two small source-frame samples; matching requires sufficient Japanese text, similar pronunciation and agreement between both frames. Unrelated titles and unmatched/unclear text are ignored. Acoustic text and timing are retained, and accepted caption text is cached locally for replay. The normal dictionary and playback do not wait for this background check. Frame access can fail on restricted videos, and creator captions/OCR can also be imperfect. Videos without usable on-screen text continue to use speech recognition.

Frame sampling uses short range reads, not a complete video download. The local cache is limited to 120 frame pairs. Settings can disable sampling. The separate **Save offline** button saves the complete video to Library without switching the current player.

## Trackpad and preparation progress

Two-finger horizontal trackpad gestures move to the previous or next subtitle block, including in video fullscreen. Vertical scrolling, text controls, modal panels and open word lookups are protected from subtitle navigation. A gesture triggers once; momentum does not skip multiple blocks. Physical trackpad feel may vary with system settings.

Discover's **Find more videos** fetches additional pages (up to 72 candidates per search), deduplicating results and keeping the same language, duration and conversation filters. Each page is verified progressively.

Speech preparation has a compact progress bar, also visible in video fullscreen. Loading/queued/download stages are indeterminate; recognition percentages reflect completed audio in the current task, not the entire length of a windowed audiobook. A cached ready transcript hides the bar. Audiobook look-ahead now starts after two seconds of playback, eight seconds earlier than before. Empty-subtitle polling is 350 ms instead of 650 ms.

### Speech engine comparison (2026-11-11)

The production engine remains Apple's GPU-accelerated MLX Whisper with word timestamps and overlap ownership. Turbo is recommended; Large v3 is an optional slower alternate, not a promise of better results. A persistent single speech worker reuses the loaded model and avoids concurrent large-model memory pressure on M1.

Primary references reviewed: [Apple MLX Whisper](https://github.com/ml-explore/mlx-examples/blob/main/whisper/README.md), [WhisperKit / Argmax OSS](https://github.com/argmaxinc/argmax-oss-swift), and [Kotoba Whisper v2](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0). WhisperKit provides a native Core ML alternative; Kotoba publishes Japanese accuracy/speed results. Neither is shipped as a replacement without representative local timing and subtitle-alignment evaluation. Earlier tests on the reported source rejected Kotoba because it omitted speech.

A fresh local experiment compared an 8-second first block with the existing 26-second core on the supplied public YouTube excerpt. After warming both paths, first cues took 2.92 vs 2.99 seconds, but total processing increased to 9.56 vs 5.26 seconds and wording changed. The shorter-block experiment was rejected. These are single-clip observations, not general model rankings. No speech-model weights have been retrained, and homophone errors still require source captions or checking the audio.

## Glass toolbar and vocabulary progress

The Mac study window uses a transparent title area and a floating glass toolbar. Navigation uses icons with hover tooltips, accessible names, keyboard focus and selected states: Discover, Watch, video fullscreen, Open file, Library, Words and Settings. Glass menus and lookup surfaces respect reduced transparency where supported.

**Words** now includes the latest 100 successful dictionary lookups. Repeated hover within 30 seconds does not inflate the lookup count. Open a recent entry again or save it with the bookmark button. Saved words show Learning or Known, with explicit controls to change that state. The dashboard counts saved words and those explicitly marked known; looking up a word does not establish mastery. Removing a saved word leaves its recent lookup intact.

History is local to this Mac and included in exported settings backups. Context is retained when reopening a word without a new video sentence. Automatic iCloud sync still requires signing configuration.

## Focus-first video preparation and quiet fullscreen

YouTube preparation now gives the selected video's speech tasks priority over queued background work. Unfinished downloads for a video you leave are cancelled, while recognized sections are checkpointed on disk. Opening more videos no longer returns the old three-video rejection. At most two older recognition jobs continue behind the current one; older queued jobs pause and can resume from their checkpoints when selected again.

For generated YouTube transcripts, the first section surrounds the current playhead (up to 12 seconds); remaining work is processed in bounded sections of up to 26 seconds, choosing gaps nearest the latest playhead. Partial cues are sorted by video time, and preparation percentage measures completed audio rather than assuming that a seeked-to position means earlier audio was processed. Each completed section is saved. Creator captions and complete cached transcripts still take precedence. Audio access/download and first model loading remain necessary; selecting a new video yields after the active speech section, rather than forcibly interrupting GPU inference.

Fullscreen controls fade after 1.6 seconds. Subtitles and word lookup stay interactive. Move to the bottom of the video or focus a control with the keyboard to reveal transport controls; Escape still closes lookup and exits fullscreen. Motion is reduced when the system requests it. Cue rendering reuses the active subtitle index when safe and avoids unnecessary play-button DOM writes, and the hidden study page stops its visual work while Discover is open.

Discover defaults to **Native audience**, with domestic conversation, interview and discussion queries rather than Japanese-learning seeds. The filter excludes recognizable learner-oriented titles/channels; turn it off to include them. Language and length filters still apply. Title-based audience classification is a heuristic.
