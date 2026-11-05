# Local processing and the YouTube audio boundary

Product decision on 2026-11-05: the owner requires automatic Japanese subtitles for every YouTube video, including videos without captions. Local transcription of imported files is **not an accepted substitute** for that goal. The absolute “every video” guarantee is not achievable for private, region-blocked, embedding-disabled, removed or otherwise inaccessible videos; the product scope needs a technically and legally accessible media source before this can be promised.

Current state: the app already parses available Japanese YouTube captions inside its on-device WebView and keeps saved words/preferences and a limited caption cache on the device. Word segmentation, dictionary search, spelling/context checks and fresh speech recognition still use the language service. The current signed build would lose those functions if the service were removed. This is a product gap, not a missing toggle.

## Why captionless YouTube is different

The embedded YouTube player exposes playback controls and caption information, but no supported stream of its audio samples to the host app. Apple's local speech recognition accepts audio supplied by the app, such as a user-selected audio/video file or microphone recording. It cannot infer words from audio that the app never receives. Screen recording or capturing another player's output would need user consent and may still be unavailable for protected media; it does not meet the automatic tap-a-video workflow. The current server also receives HTTP 403 while attempting to acquire YouTube audio, so moving the same recognition model to the phone alone does not solve captionless YouTube.

References: [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [Apple Speech recognition](https://developer.apple.com/documentation/speech/recognizing-speech-in-live-audio), and [the current acceptance gate](../RELIABILITY.md).

## Local components that remain useful

1. Put the Japanese tokenizer and compact dictionary indexes in the app bundle, with native local storage and no runtime API requirement. Verify grammar groups, names, Japanese/English search and startup memory on a physical iPhone. Existing server behavior should remain a reference during migration.
2. Use an on-device speech recognizer on media that the user imports or that the app is allowed to play from its own file/source. Select a model whose Japanese conversational accuracy, memory use, download size and word timings are measured on actual iPhones. Apple Speech on-device availability varies by locale/device; check support at runtime and do not promise offline recognition until tested.
3. Keep the YouTube path for videos with accessible Japanese captions. For a video without usable captions, explain the boundary in the UI instead of inventing a transcript. A future rights-compliant audio source could expand this path.
4. Replace the current service calls one by one, retaining local saved words and repeatable migration tests. Only remove the server and its production URL after all required dictionary and subtitle actions pass without it.

A TestFlight beta can test the current player and source-caption path, but it does not meet the owner’s required YouTube behavior. No public App Store claim should describe universal automatic subtitles until the full path is proven on a real iPhone. See [TestFlight setup](../TESTFLIGHT.md).
