# Japanese subtitle quality

## What improves now

Creator-provided Japanese tracks take priority over YouTube ASR, which takes priority over an unidentified Japanese track. A lower-priority response cannot replace a better one merely because its request finished later. Cached captions remain a fallback while fresh source tracks load. Older parsed caches are invalidated without deleting vocabulary.

Rolling JSON3 append events retain already-spoken text and update it only at the next event's timestamp. Explicit clears end the line. Japanese-only whitespace boundaries are normalized while Latin word spaces are preserved. Display no longer inserts a gap/padding around every learning token. Furigana occupies a separate annotation lane rather than widening the base word. Opening/closing punctuation stays attached to its neighboring word. These are targeted improvements, not a complete native ruby/kinsoku implementation.

The formatter preserves kanji, kana and lexical choices from the source. It does not guess a homophone's kanji from dictionary readings. Words that sound the same can mean different things; a plausible-looking rewrite could teach an incorrect sentence.

## Japanese ASR worker update (0.5.12)

The generated-caption worker now uses ReazonSpeech K2 v2 (`reazonspeech-k2-v2`, int8), a 159M-parameter Japanese Zipformer/RNN-T model with Apache-2.0 weights and software. It is trained on ReazonSpeech broadcast audio. Its official release provides quantized benchmark results on JSUT, Common Voice and TEDxJP, and notes CPU-capable inference without a GPU. [ReazonSpeech K2 model card](https://huggingface.co/reazon-research/reazonspeech-k2-v2) · [official ReazonSpeech v2.1 results and license](https://research.reazon.jp/blog/2024-08-01-ReazonSpeech.html).

A local diagnostic compared Whisper base with K2 int8 on six short clips served by the public `japanese-asr/ja_asr.reazonspeech_test` set. On the provided text, corpus-level CER was 48.7% (57 edits / 117 reference characters) for base and 29.1% (34 / 117) for K2. Several casual speech particles and the name `大橋` improved; the sample is far too small to estimate video accuracy, the supplied reference is not manually verified here, and neither model was tested against the user’s video. K2 decoded the clips in 0.12–0.50 seconds each after a one-time 17.8-second model load in this 2-CPU preview. No audio or transcript from this comparison is shipped in the app.

K2 exposes character timestamps. The worker now decodes the audio in overlapping 27-second chunks, removes the model's 0.9-second silence pad from timestamps, drops duplicated overlap, and groups characters into captions at speech gaps, punctuation, or a short display limit. This improves word-level subtitle timing versus one long cue; these are token-time estimates, not a separate forced-alignment model. Japanese-model output can still mishear names, overlap, slang or code-switching. ReazonSpeech has no speaker diarization in this setup.

YouTube audio access remains blocked from this development preview. Therefore I cannot validate the complete download → K2 → on-device playback path on an actual YouTube conversation here. Native YouTube captions and creator captions also bypass this generated-caption model, and can still contain errors. The next real-world check should compare both native and generated captions against several videos with casual multi-speaker conversation. Fresh subtitle generation remains dependent on the preview's restricted network/source access.

## Typography sources

[W3C Japanese Layout Requirements](https://www.w3.org/TR/jlreq/) and [W3C ruby styling](https://w3c.github.io/i18n-drafts/articles/ruby/styling.en) explain why Japanese spacing, punctuation placement and ruby need different treatment from spaced Latin text. The current React Native renderer approximates these rules while keeping words tappable. A production renderer should be compared on physical iPhones at multiple font sizes, including long readings and narrow screens.

## Word boundaries and lexical fixes (0.5.9)

A concrete analysis defect was reproducible: grouped prefix nouns such as `お名前`, `お勧め`, `再利用` and `超高速` displayed together but used only the prefix as their lookup lemma. They now retain the dictionary-backed compound. Suru inflections of compounds retain that noun lemma too (for example `再利用していました` → `再利用`). This corrects dictionary routing without editing the subtitle spelling.

Timed tracks now receive background boundary analysis in batches of up to 48 cues. An adjacent pair can be joined only when Japanese morphology finds a dictionary-backed token or inflection crossing the old boundary. The gap must be at most 120 ms, the combined interval at most six seconds, and combined text at most 48 UTF-16 units. Sentence-ending punctuation, long pauses, overlapping voices and larger spans prevent joining. The joined cue keeps the original first start, last end and exact concatenation of source characters. A batch carries its final cue forward so the processing boundary does not create another split. This is a conservative heuristic, not a guarantee of correct segmentation or recognition.

The client validates that every returned cue is an ordered, unchanged partition of the input before displaying it. A failed or invalid batch leaves source captions usable. Processing updates progressively and stops when the video/source changes; source caches retain original cues. Joined intervals show the whole phrase across the source interval; they do not add word-level audio alignment. Live DOM-only captions cannot look ahead and do not get this cross-cue repair. Existing speech-recognition/homophone limitations remain.

The UI uses shorter ruby lanes and tighter row spacing while retaining the 26-point base text and tappable words. Browser tests measure row separation on a wrapped Japanese example. Physical iPhone typography and real-video recognition quality still need evaluation.

## Three-model comparison (0.5.13)

The worker now compares ReazonSpeech K2, Whisper Small and Kotoba Whisper on the same audio chunks and delivers progress after each engine. Whole-phrase majority agreement is preferred when present; disagreements keep the default Reazon candidate and remain explicitly unverified. No novel combined sentence is synthesized. Creator tracks stay in priority; automatic tracks can be progressively replaced by generated results when source audio is accessible.

A new six-clip diagnostic used public test rows 6–11, totaling 43.46 seconds and 139 normalized reference characters. Reazon had **22.3% CER**, Kotoba **31.7%**, Whisper Small **47.5%**. The selection policy retained Reazon on all six and also had **22.3% CER**: adding models did **not** demonstrate an accuracy gain over Reazon. Total engine work was 14.15 / 109.01 / 40.47 seconds respectively, including repeated model loading under concurrent browser-test load. All three combined consumed 163.63 seconds for 43.46 seconds of recordings, so this host is **not real-time**. Source metrics and caveats: [asr-comparison.json](asr-comparison.json).

The references were supplied by the dataset and not manually verified. These are short broadcast snippets, not a representative benchmark of the user's natural conversations. Normalization removes punctuation/whitespace/symbols and preserves kanji distinctions; these rates cannot be directly compared with the earlier punctuation-preserving diagnostic.

A separate real worker smoke check on a short recording produced three progressive updates. All three models returned the same complete phrase, with a final matching timed cue. This establishes that the multi-model plumbing runs on audio; it is not evidence of broad accuracy.

The current best measured default remains Reazon. Further accuracy claims need human-checked recordings with slang, overlapping speakers, music and proper names. GPU execution can reduce comparison latency; it does not itself resolve disagreements. Network permission/source-audio access is still required before real YouTube comparison can be tested here.
