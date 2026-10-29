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

- faster-whisper, MIT: https://github.com/SYSTRAN/faster-whisper
- OpenAI Whisper model/code, MIT: https://github.com/openai/whisper
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
