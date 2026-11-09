# Mac requirements and current gaps

The Mac app is named immersed. and must keep playback inside its own window. GitHub/Homebrew distribution is authorized; Apple Developer signing and iCloud connection are deferred until a Team ID is supplied.

Implemented in this update: compiled arm64 AppKit host, persistent embedded WKWebView, native edit/quit/search menus, no browser launch, shared iOS morphology and JLPT vocabulary data for highlighting, hover dictionary lookup with pause and controlled resume, persisted level and known words, Space and sentence arrow shortcuts, honest generated-transcript status.

Still required before claiming iOS feature parity:

- Share the complete preference schema, pitch accent, furigana, saved-word context, dictionary search, themes, Shorts and duration filters with iOS.
- YouTube account browsing and in-app search. Google may reject embedded authentication; do not claim a successful connection without testing it.
- Default ad filtering with an explicit control; do not claim complete ad removal without playback verification.
- Target-language original-content filtering with a toggle and explicit handling of missing language metadata.
- Offline library, downloads, local media playback and saved transcript/dictionary availability. Downloads can fail for restricted or unavailable source videos.
- Signed iCloud synchronization on both apps; requires Apple signing configuration and cannot be enabled merely by adding a toggle.
- ASR evaluation against real audio, word alignment, silence/hallucination handling, bounded worker concurrency, cancellation, cache invalidation, and speed/memory measurements on M1.
- Speech fallback can work without supplied subtitles when video audio is accessible. Universal support for every YouTube video cannot be promised: private, DRM, geo/access restrictions, disabled embeds, download restrictions and absent Japanese speech remain concrete failure cases.

The phrase “どんどんなさっているんですよね” cannot be corrected from text alone. Compare it with the original video audio and timestamps before substituting a transcription. A count such as 836 segments measures output volume, not transcript accuracy.
