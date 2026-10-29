# Japanese subtitle quality

## What improves now

Creator-provided Japanese tracks take priority over YouTube ASR, which takes priority over an unidentified Japanese track. A lower-priority response cannot replace a better one merely because its request finished later. Cached captions remain a fallback while fresh source tracks load. Older parsed caches are invalidated without deleting vocabulary.

Rolling JSON3 append events retain already-spoken text and update it only at the next event's timestamp. Explicit clears end the line. Japanese-only whitespace boundaries are normalized while Latin word spaces are preserved. Display no longer inserts a gap/padding around every learning token. Furigana occupies a separate annotation lane rather than widening the base word. Opening/closing punctuation stays attached to its neighboring word. These are targeted improvements, not a complete native ruby/kinsoku implementation.

The formatter preserves kanji, kana and lexical choices from the source. It does not guess a homophone's kanji from dictionary readings. Words that sound the same can mean different things; a plausible-looking rewrite could teach an incorrect sentence.

## The recommended recognition pipeline — not yet deployed

A diagnostic on one clean Japanese recording from [JSUT basic5000, test row 0](https://huggingface.co/datasets/japanese-asr/ja_asr.jsut_basic5000) reproduced a kanji error: `買わ` became `変わ`. The installed Whisper base worker's settings (Japanese, CPU int8, beam 3, VAD, no word timestamps) produced one orthographic edit in 22 normalized characters, or 4.55% CER. Beam 5 with word timestamps made the same error. This single recording is a diagnostic, not an accuracy benchmark or evidence about YouTube performance. Corpus audio is not redistributed. It confirms that better typography and timing cannot repair every recognition mistake.

1. Prefer creator-provided Japanese captions when available, while recognizing that these can be edited, paraphrased or inaccurate.
2. Otherwise evaluate a stronger Japanese ASR model against real recordings before replacing the preview's small CPU-oriented Whisper base recognizer. [Kotoba Whisper v2's model card](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0) reports Japanese evaluations and training provenance; it is a candidate, not proof of best accuracy on these videos. Compare it with a larger multilingual Whisper model on the same permitted audio, measuring Japanese character error rate, proper names, kanji/homophone errors, silence hallucinations, latency and hardware cost.
3. Align the selected transcription to the original audio. [WhisperX](https://github.com/m-bain/whisperX) provides forced-alignment machinery with a Japanese alignment model. Alignment improves timing; it does not correct wrong words. Do not claim a global offset or VAD alone fixes lexical mistakes.
4. Evaluate native Japanese examples with manually verified references, including conversations, slang, music/background noise, names, code-switching, pauses and long videos. Assess orthographic accuracy separately from pronunciation similarity. Preserve source provenance and model revision with generated caches.

The cloud still cannot obtain YouTube audio, so end-to-end Japanese ASR quality and a stronger model cannot be honestly validated here. No new model, forced aligner, or perfect automatic kanji correction is claimed in this release. [Reliability requirements](../RELIABILITY.md) describe the remaining service/audio work.

## Typography sources

[W3C Japanese Layout Requirements](https://www.w3.org/TR/jlreq/) and [W3C ruby styling](https://w3c.github.io/i18n-drafts/articles/ruby/styling.en) explain why Japanese spacing, punctuation placement and ruby need different treatment from spaced Latin text. The current React Native renderer approximates these rules while keeping words tappable. A production renderer should be compared on physical iPhones at multiple font sizes, including long readings and narrow screens.

## Word boundaries and lexical fixes (0.5.9)

A concrete analysis defect was reproducible: grouped prefix nouns such as `お名前`, `お勧め`, `再利用` and `超高速` displayed together but used only the prefix as their lookup lemma. They now retain the dictionary-backed compound. Suru inflections of compounds retain that noun lemma too (for example `再利用していました` → `再利用`). This corrects dictionary routing without editing the subtitle spelling.

Timed tracks now receive background boundary analysis in batches of up to 48 cues. An adjacent pair can be joined only when Japanese morphology finds a dictionary-backed token or inflection crossing the old boundary. The gap must be at most 120 ms, the combined interval at most six seconds, and combined text at most 48 UTF-16 units. Sentence-ending punctuation, long pauses, overlapping voices and larger spans prevent joining. The joined cue keeps the original first start, last end and exact concatenation of source characters. A batch carries its final cue forward so the processing boundary does not create another split. This is a conservative heuristic, not a guarantee of correct segmentation or recognition.

The client validates that every returned cue is an ordered, unchanged partition of the input before displaying it. A failed or invalid batch leaves source captions usable. Processing updates progressively and stops when the video/source changes; source caches retain original cues. Joined intervals show the whole phrase across the source interval; they do not add word-level audio alignment. Live DOM-only captions cannot look ahead and do not get this cross-cue repair. Existing speech-recognition/homophone limitations remain.

The UI uses shorter ruby lanes and tighter row spacing while retaining the 26-point base text and tappable words. Browser tests measure row separation on a wrapped Japanese example. Physical iPhone typography and real-video recognition quality still need evaluation.
