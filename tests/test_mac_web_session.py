import platform
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

@unittest.skipUnless(platform.system() == "Darwin", "Requires native macOS WebKit")
class BrowserSessionTest(unittest.TestCase):
    def test_encrypted_web_keys_survive_reload_without_keychain_and_reader_is_transparent(self):
        source = (ROOT / "desktop/NativeApp.swift").read_text()
        session = source[source.index("@MainActor\nfinal class BrowserSession"):source.index("@MainActor\nfinal class NetflixFocusView")]
        with tempfile.TemporaryDirectory(prefix="immersed-session-check-") as folder:
            file = Path(folder) / "Check.swift"
            file.write_text("import Cocoa\nimport WebKit\nimport Security\n" + session + (ROOT / "tests/mac-web-session-probe.swift").read_text())
            executable = Path(folder) / "check"
            build = subprocess.run(["xcrun", "swiftc", "-parse-as-library", str(file), "-framework", "Cocoa", "-framework", "WebKit", "-o", str(executable)], capture_output=True, text=True, timeout=60)
            self.assertEqual(build.returncode, 0, build.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS WebCrypto IndexedDB reload roundtrip", result.stdout)
