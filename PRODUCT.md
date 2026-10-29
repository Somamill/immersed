# Immersed — first product draft

## The promise

Watch or listen to something you care about, understand a little more, and keep going. Optimize the loop **play → tap → understand → resume**. Aim for the useful parts of immersion tools such as Migaku while creating an original interface and implementation.

The first user is a Japanese learner on iPhone who finds desktop extensions slow, complicated, and expensive. The first useful release must make one supported media path excellent before adding every source and language.

## Experience

- Immerse: recent and imported content, visibly marked with caption availability and preparation state.
- Player: native/official media playback, stable sentence transcript, optional furigana and translation; tap a word without leaving the story.
- Lookup: lemma, reading, concise senses; save vocabulary with its exact sentence and source timestamp.
- Words: personal contextual vocabulary, with review/Anki export after the core flow is reliable.
- Settings: learning language, subtitle behavior, playback behavior, storage and deletion.

## Staged scope

### 0.1 — interaction prototype (this repository)

Validate phone ergonomics and the learning loop with original sample lessons and speech synthesis. Local saved words work. No external account, transcription, or media bill.

### 0.2 — first real media path

Start with a user-provided audio file or a creator-authorized podcast episode with an audio URL and timestamped transcript. Add real playback, seekable cues, resume position, interruption handling, background audio, and a proper Japanese dictionary/tokenizer. Prefer existing transcripts: no speech-recognition wait or per-minute cost when they're available.

Use Expo development builds when native audio/background capabilities exceed Expo Go. Evaluate native audio playback on real iPhones before committing to plugins.

### 0.3 — YouTube feasibility gate

Prototype official embedded playback and player-time synchronization. YouTube playback access does **not** imply access to downloadable captions or raw audio: captions API permissions and individual videos differ. Do not make scraping a core dependency. Establish a supported transcript path (creator authorization, user-imported VTT/SRT, or licensed captions) before promising arbitrary-video tappable subtitles. Keep missing captions explicit. Use official player controls and do not extract YouTube audio for background listening.

### 0.4 — captions when none exist

For media we are permitted to process, evaluate streaming speech recognition against pre-transcription. Pre-transcription gives stable, seekable subtitles; streaming may provide partial text sooner but introduces revisions, alignment errors, network dependence, battery cost, and recurring fees. Keep a stable final-cue layer so tapped words don't shift while the user is reading. Distinguish source captions, generated captions, and translations.

### 1.0 — iPhone beta

Private TestFlight beta, playback recovery, offline dictionary, accessible controls, actual performance/cost measurements, and supported-source documentation. Apple signing/distribution is a separate setup step. Do not assume App Store approval or that Expo Go is production distribution.

## Technical shape

- Expo / React Native + TypeScript for cloud development and iPhone preview.
- Lesson and word records carry BCP-47-compatible language identifiers. Later: a language adapter provides segmentation, normalization, dictionary lookup, and optional readings.
- Japanese: evaluate a morphological tokenizer that returns lemmas and offsets; longest substring matching alone is not sufficient for conjugated text. Evaluate JMdict-based dictionaries, respecting redistribution and attribution requirements before bundling.
- Timestamped cues refer to the media clock. Word tokens refer to source text offsets; word-level timings are optional. Original text stays intact.
- Local-first dictionary and word storage; SQLite for a full dictionary/library. AsyncStorage is sufficient for this tiny draft library.
- A backend handles paid transcription, quotas, content preparation, and provider credentials. Add it only after the media path and cost model are proven.
- Saved context should include source ID, cue timestamps, language, lemma, and sense. Draft 0.1 has sample source titles and sentences only; upgrade the schema when real media is introduced.

## Speed, reliability, and price

These are targets to measure, not current results:

- Cached word lookup: p95 below 100 ms on a representative supported iPhone; immediate visible tap feedback.
- Caption synchronization: aim for within 250 ms of the media clock with an aligned transcript; evaluate accuracy separately from offset.
- Never block playback on translation or a dictionary network call. Cache prepared text and use a local dictionary.
- Recover from interruptions, sleep/lock, seeking, network changes, unavailable media, and storage failures.
- Keep the core player, imported captions, and local dictionary inexpensive. Price any paid transcription using measured cost per audio hour, explicit limits, and a visible estimate before starting a paid job. No subscription decision yet.

## Decisions to make together

1. Which source matters most for the first real integration: YouTube or podcasts?
2. Would you prefer on-demand translation or bilingual subtitles by default?
3. Which one video/channel or podcast episode should define the first successful real-media test?

The draft assumes optional furigana and English translations, with Japanese as the first learning language. It adds no social feed, streak pressure, or paywall.
