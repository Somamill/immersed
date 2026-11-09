# Immersed for Mac — first local test

This companion lives in the same repository as the iPhone app. It opens a local study window with YouTube playback, Japanese subtitle lines, word lookup, known-word marking and sentence skipping. A Mac-local worker downloads the selected video's audio with yt-dlp and runs an open Whisper model; the audio is deleted when transcription finishes. Japanese transcription is generated independently of YouTube caption availability.

Install with Homebrew on macOS:

```sh
brew tap Somamill/immersed https://github.com/Somamill/immersed.git
brew install --HEAD Somamill/immersed/immersed-mac
immersed-mac
```

The first launch creates `~/Applications/immersed.app`, then installs npm packages, the pinned JMdict/JMnedict dictionary, and a Python model runner in `~/Library/Application Support/Immersed Mac`. Find **immersed.** in Finder, Spotlight, or Launchpad after the first launch; future launches open the local study window. If the service is already running, opening the app reuses it. On Apple Silicon it uses MLX Whisper large-v3-turbo; on Intel it uses faster-whisper large-v3 on CPU. The model downloads on first transcription and can require several GB. Subsequent starts reuse the installed files and generated transcript cache. Press Ctrl-C in Terminal to stop the local service when started from Terminal. For updates, run `brew upgrade --fetch-HEAD Somamill/immersed/immersed-mac`.

Paste a YouTube URL in Immersed and click Watch. A plain search phrase opens YouTube search in a browser tab; paste a result's video URL to study it. All processing runs locally after yt-dlp downloads the audio. The local server listens only on `127.0.0.1:4765`. The compiled arm64 AppKit application embeds the study page and YouTube in WKWebView, with persistent WebKit website storage. It opens no external browser. Command-L focuses search, Space toggles playback, and the arrow keys move between sentences. Hovering a word opens lookup and pauses playback; closing lookup resumes playback only when hover had paused it. The video itself stays in YouTube's embedded player; owner-disabled embeds or audio-download restrictions can still prevent a video from working. Playback waits for the first generated line, then starts while the remaining audio is transcribed in 60-second chunks. The initial audio download and model startup can still take time; this is not low-latency live transcription. Apple Silicon and Intel timing and model installation have **not** been physically tested in this Linux workspace.

The Homebrew formula installs the repository's main branch with `--HEAD`. `immersed.app` contains a compiled arm64 AppKit executable with an embedded WebKit interface. The local Node language service and MLX speech runtime still require Homebrew and first-run dependencies. This is a hybrid Mac application, distributed without Developer ID signing or notarization. The first run needs internet access for dependencies and the model. The Mac companion uses a separate desktop layout and does not yet share the phone's saved-word library or every phone setting.

The model choice follows [MLX Whisper's word-timestamp API](https://github.com/ml-explore/mlx-examples/blob/main/whisper/README.md), the [MLX large-v3-turbo checkpoint](https://huggingface.co/mlx-community/whisper-large-v3-turbo), and [faster-whisper's CPU backend](https://github.com/SYSTRAN/faster-whisper). The Homebrew tap structure follows [Homebrew's tap guide](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap).
