# Immersed privacy policy

Last updated: 2026-11-05. Immersed is an independent Japanese learning app developed by Somamill. This policy describes the current app and its optional language service. Contact [k4jenx@gmail.com](mailto:k4jenx@gmail.com) for privacy requests, or see [Immersed support](SUPPORT.md).

## Information processed

Saved words, sentences, viewing preferences, knowledge choices and a limited caption cache are stored on your device. They are not tied to an Immersed account. Removing the app removes its local data; iOS device backups may retain a copy under your Apple backup settings.

The app sends a word, sentence or search query to the Immersed language service when you request analysis or dictionary results. To request generated subtitles, it sends the selected public YouTube video ID. The service may process video audio obtained from that source, the resulting transcript and word timing. It caches generated captions by video ID for reuse; the current server has no automatic expiry for this shared cache. The service does not ask for your name, email or Immersed login. It may receive ordinary connection information such as IP address through its host or proxy. Hosting and retention settings must be reviewed again before public deployment.

In an iPhone build with local captions enabled, Immersed requests iOS screen/audio capture and speech-recognition permission when a selected video lacks Japanese captions. ReplayKit audio samples are passed directly to Apple's on-device Japanese speech recognizer. Immersed does not save the captured audio or video or send those samples to its server. Generated caption text may be cached on the iPhone as described above. Local capture is not present in Expo Go and may be unavailable for protected media or unsupported devices.

## Third parties

YouTube video playback and browsing occur inside a YouTube web view. Google/YouTube may receive your IP address, device/browser information, interactions and any cookies they set. Their [privacy policy](https://policies.google.com/privacy) applies to those services. Immersed does not transfer a Safari or Google sign-in session into its player. Expo services may be involved in app distribution and updates. This app does not include its own advertising or analytics SDK.

## Control and requests

You can remove saved words in the app and clear local app data by deleting the app. To report a privacy problem or request removal of a video transcript from a service operated by Immersed, email [k4jenx@gmail.com](mailto:k4jenx@gmail.com). Do not post private information in a public GitHub issue. Because server captions are keyed by public video ID rather than an Immersed user account, the service cannot identify a personal viewing history to export.

This policy will be updated when the public hosting arrangement and its retention terms are finalized.
