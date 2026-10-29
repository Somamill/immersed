# Immersed — product direction

## One action to immersion

Browse natural Japanese content by interest, choose a video, and get a compact video player plus Japanese subtitles. No comments, likes, or social feed in the watching view. No scripted speech lessons and no requirement that users supply test videos.

Tap a meaningful word or grammar group to pause playback and see its reading, base form, definition, and grammatical form. Save the word with its real video context and resume. Word splitting must reflect Japanese morphology, not individual characters or a generic browser boundary heuristic.

## Current foundations

- Browser-style YouTube discovery, then player-focused layout via a DOM adapter.
- Automatic caption-control attempts, with existing source captions as a fast path.
- Kuromoji/IPADIC analysis; full English JMdict index; grouped inflections, compounds, and selected grammar expressions. Configurable groups/morphemes and furigana.
- Automatic background ASR job attempt when source captions are missing, using self-hosted faster-whisper. Generated cues can be timed against the player and cached.

**Unresolved core requirement:** this preview's server cannot access YouTube audio under its current network policy. The ASR path is implemented but has not produced real YouTube subtitles here. Package installation and a simulated player test are not an end-to-end success. Fix source-audio access/deployment and validate representative natural Japanese videos before promising universal generation. There is no workaround that a dictionary can provide for missing audio.

## Next acceptance gates

1. Validate the compact player and automatic Japanese caption controls on actual iPhones against current YouTube layouts.
2. Establish supported source-audio access from a permitted server environment, validate Whisper's Japanese output and timestamps, and measure processing time/cost. Upgrade the base model or execution hardware if quality/latency is inadequate.
3. Select natural content independently across daily life, food, travel, conversation, caption availability, and lengths. Measure coverage and show honest unsupported/preparing/failure states.
4. Refine dictionary disambiguation, compound segmentation, inflections, and grammar explanations. Current grammar tags are finite rules, not a full semantic parser.
5. Replace Japanese search queries with a language-verified discovery feed; add podcasts and other languages after the main video loop works reliably.

## Migaku reference

Migaku's documented dictionary settings include dictionary activation/installation and frequency-list selection. Older public Anki add-ons do not prove that its modern mobile/parser/transcription service is open source. We use separately reusable open components: JMdict for meanings, Kuromoji/IPADIC for morphology, and faster-whisper for ASR. These solve three different problems. See THIRD_PARTY.md for sources and licensing.

Keep the prototype free to try in Expo Go. Self-hosted ASR avoids a per-minute provider bill but is not zero-cost infrastructure, and native audio acquisition/capabilities may eventually require a development build. No paid service is enabled without a concrete need and account setup.
