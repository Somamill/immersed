# Open-source components and research

## JMdict

The app uses a real JMdict Japanese–English dataset, installed on the development server and indexed by headword/reading. It does not require a Jisho account or send lookups to Jisho anymore. The currently pinned snapshot contains 218,963 entries. This is dictionary data, not a tokenizer or speech recognizer.

- Copyright: Electronic Dictionary Research and Development Group (EDRDG).
- License: Creative Commons Attribution-ShareAlike 4.0 for the Japanese/English data.
- Original licensing/attribution: https://www.edrdg.org/edrdg/licence.html
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- Source format and conversion project: https://github.com/scriptin/jmdict-simplified
- Pinned release: `3.6.2+20261026175559`, English full dataset.
- Source asset SHA-256: `809d104fe3c1e0ab328ff265bdc52b5eed1f9b669088fd199ef4e713812958a3`.
- `npm run language:setup` fetches the archive, verifies its checksum, and extracts the unmodified JSON. Files live in ignored `.data/`. The service transforms entries to a display/API shape; returned data remains CC BY-SA 4.0, with attribution in Settings and the API. Code licensing is separate from dictionary data licensing.

## Japanese analysis

Kuromoji (Atilika, Apache-2.0): https://github.com/takuyaa/kuromoji.js

Kuromoji uses MeCab-IPADIC data. Preserve the full NAIST/ICOT notices in [licenses/IPADIC-NOTICE.txt](licenses/IPADIC-NOTICE.txt) and Apache license in [licenses/kuromoji-Apache-2.0.txt](licenses/kuromoji-Apache-2.0.txt). Our grouping rules combine selected inflection chains and grammar patterns; they are not a complete grammatical analysis or contextual AI explanation.

## Speech recognition

- yt-dlp, Unlicense (see upstream dependencies): https://github.com/yt-dlp/yt-dlp

These run on the cloud server, not in Expo Go. Model weights download on the first successful audio-processing job. Self-hosting avoids per-minute API fees but consumes compute. Source-audio access, recognition quality, and throughput must be verified separately.

## What was learned from Migaku

Reviewed:

- https://migaku.com/blog/youtube/the-settings-migaku-browser-extension — dictionary installation/enabling and frequency-list settings.
- https://migaku.com/faq/getting-started — native-media immersion and generated subtitles when source subtitles are unavailable.
- https://migaku.com/faq/features — word lookup and separate sentence explanations.
- https://github.com/migaku-official/Migaku-Japanese-Addon — public older Anki add-on, GPL-3.0. Public add-on code does not establish that the current mobile app, parser service, or subtitle-generation service is open source.

No Migaku implementation code or paid dictionary content has been copied. The current app assembles independently licensed dictionary, analysis, and ASR components. JMdict is a general open dictionary; it should not be described as Migaku's source code or as proof of Migaku's current proprietary internals.

## JLPT estimates (v0.3.0)

The bundled word/reading-to-level map is derived from OpenJLPT by evanclan and its credited sources, including Jonathan Waller and EDRDG. Pinned commit and form count: `src/data/jlpt-source.json`. It contains 13,513 word/reading forms. Only level metadata is extracted; no example sentences are copied. This derived data remains CC BY-SA 4.0. Full upstream attribution and license are in `licenses/OpenJLPT-NOTICE.md` and `licenses/OpenJLPT-LICENSE`. The app credits the source in Settings. JLPT levels are community estimates, not official post-2010 examination vocabulary lists. Unlisted words stay neutral; per-word user knowledge overrides the estimate.

## JMnedict / ENAMDICT names (0.5.7)

- EDRDG Japanese Multilingual Named Entity Dictionary: https://www.edrdg.org/enamdict/enamdict_doc.html
- Copyright EDRDG. CC BY-SA 4.0; license and attribution: https://www.edrdg.org/edrdg/licence.html
- Same scriptin/jmdict-simplified release `3.6.2+20261026175559`, `jmnedict-all` dataset; 743,685 entries.
- Source asset SHA-256: `552f279d250b162aa0311259130ee82ad1db0879ed32e8d9318b56a9400b1165`.
- Setup creates a derived SQLite index with Japanese/reading and romanized-name forms, preserving original name translations and type labels. The API display records and index data remain CC BY-SA 4.0. The app credits both dictionaries in Settings → About. The generated database lives in ignored `.data/`; run `npm run language:setup` to reproduce it.
- Names can have several readings. These data supplement common-word definitions, not identify speakers or correct transcription errors.

## Kanjium pitch accent data (0.5.11)

- Pitch accent notation and additions © Uros O., Kanjium: https://github.com/mifunetoshiro/kanjium
- CC BY-SA 4.0, preserved in [licenses/Kanjium-CC-BY-SA-4.0.txt](licenses/Kanjium-CC-BY-SA-4.0.txt). Upstream also credits EDRDG; see its README.
- Pinned commit `9ebca4589565c696e7c39e089e2e928ad65f678c`, unmodified `data/source_files/raw/accents.txt`. SHA-256: `8bd0dd127dab32ceec94cb03ab1ba6b68858ea73421dfa1731af2f373deb4f20`.
- `npm run language:setup` downloads and verifies the source into ignored `.data/`. `server/pitch.cjs` parses headword/reading/mora downstep records; derived API pattern data remains CC BY-SA 4.0. The client renders a stepped line and downstep number. Alternative recorded readings/patterns are preserved; absent records are hidden.
- These are lexical Tokyo accent patterns, not audio measurements or predictions for inflected words, full expressions, dialects, or connected speech. The setting is off by default.

## ReazonSpeech K2 v2 (0.5.12)

- ReazonSpeech K2 Japanese Zipformer model, Reazon Holdings / Reazon Human Interaction Lab, Apache-2.0: https://huggingface.co/reazon-research/reazonspeech-k2-v2
- Pinned model revision `291488c8151be24d7da4bf7af26e533fad96e407`. The worker fetches only the Japanese int8 encoder and int8 joiner plus fp32 decoder/token file using that revision; model weights stay in the ignored Hugging Face cache.
- The inference package `reazonspeech-k2-asr` and Sherpa-ONNX are Apache-2.0. Source is pinned to ReazonSpeech commit `2d4d4762e7ee294ac8e47a177ac2e9b0e8d0d43f` in `server/requirements.txt`. The source notice is preserved at [licenses/ReazonSpeech-Apache-2.0.txt](licenses/ReazonSpeech-Apache-2.0.txt).
- Audio chunking, cue building and integration are Immersed code. The model license does not convey rights to video/audio processed by the worker.

## Multi-model cross-check (0.5.13)

The second and third recognizers use faster-whisper 1.2.1 (SYSTRAN, MIT), CTranslate2 (MIT), and pinned public model conversions. Native inference is server-side; no new Expo native module is added.

- Kotoba Whisper v2.0 CTranslate2 conversion: https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster · revision f44edd35eaeb2274e85ac7b31fb2c6f59ff1c4bc. Conversion card says MIT; original Kotoba model is Apache-2.0: https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0.
- Whisper Small CTranslate2 conversion: https://huggingface.co/Systran/faster-whisper-small · revision 536b0662742c02347bc0e980a01041f333bce120. OpenAI Whisper weights/code are MIT: https://github.com/openai/whisper/blob/main/LICENSE.
- Audio comparison diagnostics use temporary public dataset samples for analysis only. No recordings are redistributed by this release.

## Japanese context scoring (0.5.14)

- rinna Co., Ltd., japanese-gpt2-xsmall (43.7M parameters): https://huggingface.co/rinna/japanese-gpt2-xsmall, model revision 8e91527b3276e0565154935e84a08bf0137ed99f. Model card declares MIT; trained on Japanese CC-100 and Wikipedia. Public weights download only when a safe comparison requires language scoring.
- The worker uses the model's likelihood objective for ranking existing ASR candidates, never text generation. Likelihood is not a semantic truth detector or calibrated recognition confidence.
- Transformers 4.55.4 (Apache-2.0), SentencePiece 0.2.1 (Apache-2.0), and CPU-only PyTorch 2.6.0 (BSD-style) are server dependencies. Model/software notices remain available at their original project links. Tokenization guards use the existing licensed Kuromoji/IPADIC data.
