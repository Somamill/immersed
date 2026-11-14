class ImmersedMac < Formula
  desc "Japanese video immersion, Netflix subtitles and local audiobooks for macOS"
  homepage "https://github.com/Somamill/immersed"
  url "https://github.com/Somamill/immersed/releases/download/v0.22.0/immersed-mac-0.22.0.tar.gz"
  sha256 "cac8418dfdeea741eec83671aa46df1ff62abe03364cf26d7fe026e2be0081bc"
  head "https://github.com/Somamill/immersed.git", branch: "main"
  depends_on :macos
  depends_on "node"
  depends_on "python@3.13"
  depends_on "ffmpeg"
  depends_on "yt-dlp"

  def install
    libexec.install Dir["*"]
    (bin/"immersed-mac").write <<~EOS
      #!/bin/sh
      export PATH="#{Formula["python@3.13"].opt_bin}:#{HOMEBREW_PREFIX}/bin:$PATH"
      exec /bin/sh "#{libexec}/desktop/launch.sh" "#{libexec}" "$@"
    EOS
  end

  def caveats
    <<~EOS
      Start Immersed with: immersed-mac
      The first launch also installs immersed.app in ~/Applications so it
      can be opened from Finder, Spotlight, or Launchpad.
      First launch installs the local dictionary and speech model. A video must
      allow playback and local audio access for transcription to work.
    EOS
  end
end
