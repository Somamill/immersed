# Migaku investigation with REA

Date: 2026-11-12. Tool: [REA 6.9.0](https://github.com/morluto/rea), installed from the official `rea-agents` npm package. Codex registration was installed with a configuration backup. No native decompiler or paid analysis service was needed.

## Scope and evidence

The inspected artifact is the locally available **Migaku Chrome extension 1.29.1**, not the current iPhone app. Artifact SHA-256: `ce171df3a61aa20ff7c2abd29009d83cfd618ee256ada8052f1818610a0eda86`. REA parsed shipped JavaScript as inert text; it did not execute the extension or access the user's Migaku account.

Two bounded analyses were saved locally in `work/rea/` (excluded from Git):

- Player overview: `ev_d33699a27f00eb1a145563f0ef663f7a7204d92213a5d91dbc709c47eceb34c3`. The small player module parsed; the 5 MB shared player-store module exhausted the 1024 MiB analyzer heap. Its behavior remains unverified.
- Focused study controls: `ev_114b2c1b049826d2ea33725953a9821e7ca703e9cbb98e176b48f64044058f55`. Selected `main-6d30d12b.js`, `file.methods-b106a0ed.js`, and `UiKnownWords-45298dbf.js`; all three parsed. Ninety inventoried files remain outside this selection. Dynamic property/call resolution and semantic retention are partial. This is evidence of shipped declarations and static relationships, not runtime validation or a complete feature audit.

## Findings and decisions

| Question | Evidence | Result for immersed |
| --- | --- | --- |
| Does the player expose replay? | Study evidence, main module line 744: replay hotkey declaration; semantic node `jsrg_node_67608db59fb769de9bd7e255f490efd1d25a0294ece569fd2de4a4ea75430062`. | Added an SVG replay control and R shortcut for the current subtitle, including Netflix video focus. This is an independent implementation using immersed's existing player adapters. |
| Are reading pauses configurable? | Main module contains automatic-pause target settings (including learning and unknown-word targets), play-mode presets, and pause/resume settings. Example node `jsrg_node_59b2fae53acc5cbed83a4ac26a154e2c7399500fd15066ca8e35f13e5dcb517e`, line 754. | Added optional pause after each timed subtitle, off by default. The finished line stays readable; seeking, replay, hover and resume have explicit regression coverage. Word-selective pause modes are deferred. |
| Is hover resume an explicit setting? | Main module line 754, `jsrg_node_3f8d10d4ea127706b5e0fc474566dddf3177a461c0514e359e300eee84daa516`. | Retained immersed's source-owned Netflix hover pause/resume. Regression checks cover manual pauses and cancelled lookups. |
| Is word progress a distinct view? | Selected KnownWords module plus main-module `knownWordsString` function node `jsrg_node_fbeddb1110f771e90be5dff1b3ea6d9c2a418490dcd02593e2094d1eca462b7c`, line 799. | Auditing immersed's existing view uncovered inconsistent spelling keys. Saved records now retain their selected lemma; progress and status updates use that same key. |
| Can saved vocabulary preserve its media context? | Ordinary source review of immersed found Netflix URLs routed through the YouTube loader and timestamps recorded mid-line. This is an immersed defect finding, not a claim about Migaku's runtime. | Saved and recent words route to the right provider and subtitle start. A different Netflix title waits for matching player readiness before seeking once. |

The original package, recovered code and private account data are not included in the repository. Immersed retains its existing glass design and dictionaries.

## Verification and limits

Browser tests exercise replay, typing guards, hover ownership, automatic pause, adjacent-cue navigation, original Netflix timings, saved context, and word-state consistency in Chromium and WebKit. Native compilation checks the R-shortcut bridge. The timing state machine has Node tests for seeks, stalls, pause/resume and double-speed crossings.

Netflix's visible-line-only fallback does not supply reliable future end times, so it deliberately cannot enable automatic boundary pauses. Full timed tracks, YouTube transcripts and local-media transcripts can use the option. Original Netflix playback and DRM availability remain controlled by Netflix.

Impeccable and Hallmark were run against the changed HTML/CSS and local rendered app. The changed controls preserve the shared glass styling and have accessible names, keyboard actions and narrow-pane sizing. Hallmark's broad scan flags existing project-wide styling debt (including untokenized colors, legacy glyph controls and missing design stamps); those checks are not a clean pass. The new off-scale spacing finding was corrected. These web checks do not validate the native protected-video surface or the iPhone app.
