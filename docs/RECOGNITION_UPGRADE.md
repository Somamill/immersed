# Recognition and hosting evaluation — 0.6.0

## What changed

The recognizers remain ReazonSpeech K2, Whisper Small and Kotoba Whisper. Engine processes can now stay loaded across chunks rather than reloading their weights for each chunk. Chunk decoding is lazy so initial results need not wait for the entire recording to be decoded. These are latency/efficiency changes, not evidence of greater recognition accuracy.

An optional pinned Qwen3 ForcedAligner 0.6B pass aligns the selected Japanese transcript against its actual audio. It does not generate or correct words. Complete normalized text coverage and ordered in-range spans are required before accepting its timestamps. Original glyphs and punctuation are preserved. Zero-duration particles are grouped with an adjacent acoustic span rather than assigned invented uniform character times. Failed alignment retains the old estimates and reports that explicitly in About diagnostics.

Install with `npm run alignment:setup`; model weights download on first use. `IMMERSED_FORCE_ALIGNMENT=1` enables the pass when its runtime is available. The Docker deployment enables it and persistent model workers. The normal preview selects the optional runtime only after its setup-ready marker exists.

## Larger recognition models did not win

A local comparison used the first 12 Japanese test recordings in the official Google FLEURS test parquet: 558 reference characters after NFKC normalization and removal of punctuation, whitespace and symbols. Each model received the same audio; character error rate is total character edit distance divided by total reference characters.

| Recognizer | Character edits / reference chars | CER |
| --- | --- | --- |
| Existing ReazonSpeech K2 | 22 / 558 | 3.94% |
| Qwen3 ASR 1.7B | 22 / 558 | 3.94% |
| Qwen3 ASR 0.6B | 42 / 558 | 7.53% |

**No improvement was demonstrated.** The larger recognizer tied the baseline and was slower on this CPU; the small one was worse. Neither replaces the production recognizers. Six older short clips with provisional references also showed worse Qwen results; those references were not reliable enough for a strong accuracy claim. No new model was trained.

FLEURS is read speech. Twelve clips are a small diagnostic sample, not a representative test of slang, overlap, poor microphones or proper names; training overlap was not checked. This result does not establish the ensemble's accuracy. Reproduce with a local audio/reference manifest using `scripts/benchmark-recognizers.py`; no audio or model weights are redistributed here.

Sources: [official FLEURS dataset](https://huggingface.co/datasets/google/fleurs), [Japanese test parquet API](https://huggingface.co/api/datasets/google/fleurs/parquet/ja_jp/test/0.parquet), [Qwen3 ASR 0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) and [1.7B](https://huggingface.co/Qwen/Qwen3-ASR-1.7B).

Pinned revisions: small `5eb144179a02acc5e5ba31e748d22b0cf3e303b0`; large `7278e1e70fe206f11671096ffdd38061171dd6e5`.

## Audio timing check

One short Japanese recording was aligned, then aligned again with one second of leading and trailing digital silence. Comparable text anchors shifted by 1.04, 1.28 and 0.96 seconds, against an expected one-second shift (maximum deviation 0.28 seconds). This confirms timing responds to the audio rather than simply spreading characters across the recording. It also exposes remaining jitter. It is **not** a human-labelled timing-accuracy benchmark or a promise of exact boundaries. The model uses 80 ms bins; zero-length particles and boundary uncertainty remain possible.

A real full pipeline smoke test completed all three recognition passes and the alignment pass in about 35.5 seconds on one FLEURS clip. That is a single warm-cache diagnostic, not a throughput or real-time claim.

## Still unresolved

- Natural conversational recognition, names and ambiguous kanji can still be wrong. Statistical plausibility and model agreement cannot recover speech that every recognizer missed.
- Audio-conditioned alignment improves the method, but remains fallible and cannot fix incorrect recognized text. Fallback timing remains approximate.
- The current workspace still receives HTTP 403 acquiring YouTube audio. Captionless YouTube generation remains blocked here.
- The permanent server package is ready for deployment testing, but no persistent host is connected/deployed. The current preview URL remains temporary.

See [persistent hosting](DEPLOYMENT.md) for concrete setup and acceptance checks.
