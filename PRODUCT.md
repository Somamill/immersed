# Immersed — YouTube immersion

## Goal

Browse natural Japanese videos by interest, watch them in the app, and tap synchronized Japanese subtitles for readings and dictionary definitions. Save a word with its real video context and continue watching. No scripted lessons, synthetic speech, or requirement for users to supply a test video.

## Discovery

Daily life, food, travel, and conversation are initial topic entry points. The current buttons launch Japanese searches inside YouTube. A proper discovery feed must classify language and topic using metadata and available speech/captions; search language and Japanese titles alone do not guarantee Japanese speech. Natural content is the default, rather than graded language lessons. We select representative real videos for testing; users should not be responsible for finding test material.

## Caption strategy

The current free Expo Go prototype uses a top-level YouTube WebView and an experimental adapter to visible Japanese captions. YouTube may already have generated those captions. This avoids pretending a public captions-download API can retrieve arbitrary videos: the official captions-download endpoint requires permission to edit the video.

The adapter is not a finished, reliable subtitle system. YouTube layout changes, iframe isolation, unavailable tracks, fullscreen, age/login restrictions, and videos without captions can prevent capture. Its script observes actual captions and never substitutes sample sentences. Playback is controlled through the page's HTML video element. Japanese word boundaries use the device WebView's Intl.Segmenter; robust inflection handling needs a dictionary-aware analyzer.

To meet the complete goal, add speech-to-text for media that can be processed, align finalized cues with the video clock, distinguish source and generated captions, and cache transcripts. Establish supported access to the audio before promising arbitrary-video transcription. A server can protect provider secrets and enforce quotas; local/self-hosted recognition can avoid per-minute provider fees but still has compute costs. No speech-recognition backend is connected or billed in this draft.

## Next acceptance gates

1. Verify natural Japanese video playback and visible-caption capture on an actual iPhone. The current cloud network denies YouTube, so a local DOM fixture cannot establish live compatibility.
2. Independently select a representative set across topics, caption types, and video lengths. Confirm Japanese speech and measure actual capture coverage; do not advertise universal support.
3. Implement/validate stable cue timing and Japanese lemma lookup (including inflections), with fast cached/local dictionary results.
4. Add the captionless-video speech-recognition path and explicit preparation/error states.
5. Replace search-based discovery with a Japanese speech-filtered feed; later extend the same media/cue/language model to podcasts and other languages.

Keep the core flow fast and simple. Do not introduce subscriptions or paid Apple distribution merely to test the prototype. Expo Go is the current phone-preview route.
