# Immersed for Mac — first local test

This companion lives in the same repository as the iPhone app. It opens a local study window with YouTube playback, Japanese subtitle lines, word lookup, known-word marking and sentence skipping. A Mac-local worker downloads the selected video's audio with yt-dlp and runs an open Whisper model; the audio is deleted when transcription finishes. Japanese transcription is generated independently of YouTube caption availability.

Install with Homebrew on macOS:

```sh
brew tap Somamill/immersed https://github.com/Somamill/immersed.git
brew install --HEAD Somamill/immersed/immersed-mac
immersed-mac
```

The first launch installs npm packages, the pinned JMdict/JMnedict dictionary, and a Python model runner in `~/Library/Application Support/Immersed Mac`. On Apple Silicon it uses MLX Whisper large-v3-turbo; on Intel it uses faster-whisper large-v3 on CPU. The model downloads on first transcription and can require several GB. Subsequent starts reuse the installed files and generated transcript cache. Press Ctrl-C in Terminal to stop the local service. For updates, run `brew upgrade --fetch-HEAD Somamill/immersed/immersed-mac`.

Paste a YouTube URL in Immersed and click Watch. A plain search phrase opens YouTube search in a browser tab; paste a result's video URL to study it. All processing runs locally after yt-dlp downloads the audio. The local server listens only on `127.0.0.1:4765`. The launcher opens a Chrome app window when Chrome is installed, otherwise the default browser. The video itself stays in YouTube's embedded player; owner-disabled embeds or audio-download restrictions can still prevent a video from working. The first draft prepares a full transcript before showing lines, so long videos take time and subtitles are not yet real-time. Apple Silicon and Intel timing and model installation have **not** been physically tested in this Linux workspace.

The initial Homebrew formula installs from the repository's main branch with `--HEAD`. This is a source install, not a signed `.app` or notarized DMG. The first run needs an internet connection for dependencies and the model. The Mac companion is a local browser-window prototype, with a separate desktop layout and the same study goal; it does not yet share the phone's saved-word library or every phone setting.

The model choice follows [MLX Whisper's word-timestamp API](https://github.com/ml-explore/mlx-examples/blob/main/whisper/README.md), the [MLX large-v3-turbo checkpoint](https://huggingface.co/mlx-community/whisper-large-v3-turbo), and [faster-whisper's CPU backend](https://github.com/SYSTRAN/faster-whisper). The Homebrew tap structure follows [Homebrew's tap guide](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap).
