# Immersed Store design

The visual authority is ../../branding/dot/ (resolved from the repository root: branding/dot/), kit 1.1.1. The Store screen imports those tokens directly. System typography follows native platform guidance; Japanese subtitle text receives the largest interactive reading size. Light and dark modes use the shared accessible palettes. Playback and the current Japanese caption are the primary surface; dictionary results remain below rather than covering the movie.

Use 48pt minimum standalone controls, readable Dynamic Type, a bounded wide layout, flexible wrapping action rows, and underline cues for tappable words. Pressed controls retain their colors and use displacement/outline feedback. Errors preserve imported data and name a recovery action. Honor Reduce Motion through no authored animation. No simulated testimonials, generated screenshots, or claims of guaranteed automatic transcription.

Native rendering, VoiceOver, keyboard access, file imports, seeking, dictionary matching, saved words and deletion require verification on device/simulator. HTML lint cannot certify those checks.

Native review: Hallmark finish review verdict `fix`; five source/visible findings addressed (wrapping navigation, seek label, import selection lock, short placeholder, backup-aware copy). An additional maximum-size simulator capture revealed excessive wordmark/navigation growth; cap only branding and navigation scaling, keeping reading text at system size. First-run light and maximum-size dark simulator captures inspected. Playback, loaded-caption VoiceOver actions, keyboard and physical-device import acceptance remain open. No HTML rendering pass claimed.
