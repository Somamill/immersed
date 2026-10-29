# Timing and sign-in research — 2026-10-29

## Subtitle synchronization

[MDN: requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) explains that `metadata.mediaTime` is the presentation timestamp of the displayed frame on the video's media timeline. It is preferable to a wall-clock estimate for synchronizing external UI with the video. [MDN: timeupdate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event) notes that event frequency varies with system load (roughly 4–66 Hz).

The adapter now uses presented-frame timestamps when supported, with a bounded message rate, immediate seeking/seeked/play/pause/rate-change updates, and a timeupdate/poll fallback if no frame callbacks arrive. Handlers and callbacks are removed when the video changes or the page closes. Active timed cues are selected by both start and end; expired phrases no longer masquerade as the current subtitle through speech gaps. The reading panel itself remains visible. Complete timed tracks take priority over slower DOM observations.

Local tests verify frame timestamp forwarding, immediate seek/pause updates, cue boundaries and backwards seeks. This is not a measured physical-iPhone latency result. Incorrect source/recognizer timestamps can still be wrong; fixing that requires evaluating and aligning the actual speech, not adding an arbitrary global offset.

## YouTube / Google sign-in

[Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) state: “Developers must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control.” [Google's native-app guide](https://developers.google.com/identity/protocols/oauth2/native-app) documents browser-based authorization for native applications.

The app's separate Google sign-in button is removed. The earlier preview opened YouTube's own sign-in links in the system browser. Version 0.5.7 removes that redirect and explains that account sign-in is unavailable. The app does not spoof a browser user-agent, capture credentials or import browser cookies into the embedded player. Therefore signing into the browser does **not** establish authenticated embedded YouTube playback. A supported native OAuth integration would require a registered client; that is not configured in this credential-free preview.

## Navigation edges

[Expo SDK 58 GlassView documentation](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/) provides the supported native glass component and availability checks. The dock now clips a non-interactive glass background inside a rounded outer view, with matching radii. Icon controls sit above that background without separate filled pill backgrounds or an interactive whole-dock glass deformation. This avoids overlapping shapes protruding at either end; the native result still needs physical-device inspection.

## JavaScript-only watch navigation (0.5.5)

A YouTube client-side history change can select a watch URL without an ordinary page request. Relying only on request interception leaves a route where the WebView can retain a full watch page. The bridge now reports page URLs on startup and history changes, independent of video availability. The native adapter selects/remounts the embed from either native navigation or bridge page events, ignores stale discovery URLs once watching, and displays the new WebView only after its embed load completes. Local fixtures verify history-only page reporting; they do not establish physical-iPhone behavior or prove every YouTube client follows the same navigation sequence.

## Japanese text and recognition quality

The [subtitle quality findings](docs/SUBTITLE_QUALITY.md) cover source-track priority, rolling caption parsing, W3C Japanese typography references, a real-audio wrong-kanji diagnostic, and the proposed model-evaluation/alignment pipeline. Japanese-only spaces are normalized without changing source kanji. Furigana no longer widens the underlying learning token. These improvements do not establish end-to-end recognition accuracy; access to YouTube audio remains blocked in this preview environment.

## Names dictionaries and sign-in update (0.5.7)

[Yomitan's dictionary guide](https://yomitan.wiki/dictionaries/) recommends complementary resources: Jitendex/JMdict for words, JMnedict for proper names, and KANJIDIC for character information. [EDRDG's JMnedict documentation](https://www.edrdg.org/enamdict/enamdict_doc.html) describes surnames, given names, places, organizations and other named entities. This release adds JMnedict to the existing JMdict pipeline. Jitendex is an improved JMdict-based resource, not evidence that a single commercial or universal dictionary fixes names. Arbitrary commercial dictionary archives are not automatically redistributable.

The old Safari redirect cannot establish a WebView sign-in session and is removed. [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) prohibit embedded user-agent authorization and require a registered OAuth client. A supported native account integration would be separate work; an API access token does not create YouTube browser cookies or guarantee authenticated iframe playback.

The app now uses available player pause/play/seek methods and does not synthesize caption-button taps. The provider owns its playback controls; their transient appearance has not been measured on a physical iPhone. See the development guide for cue-boundary navigation and gesture limits.
