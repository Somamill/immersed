import pathlib, platform, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
@unittest.skipUnless(platform.system()=='Darwin','Requires native AppKit/WebKit')
class MacFocusTest(unittest.TestCase):
 def test_startup_and_fullscreen_transport(self):
  source=(ROOT/'desktop/NativeApp.swift').read_text().split('@main\nstruct ImmersedMain')[0]
  with tempfile.TemporaryDirectory(prefix='immersed-focus-') as folder:
   file=pathlib.Path(folder)/'Check.swift';file.write_text(source+(ROOT/'tests/mac-focus-probe.swift').read_text())
   executable=pathlib.Path(folder)/'check'
   build=subprocess.run(['xcrun','swiftc','-parse-as-library',str(file),'-framework','Cocoa','-framework','WebKit','-framework','MediaPlayer','-framework','Vision','-o',str(executable)],capture_output=True,text=True,timeout=90)
   self.assertEqual(build.returncode,0,build.stderr)
   result=subprocess.run([str(executable)],capture_output=True,text=True,timeout=25)
   self.assertEqual(result.returncode,0,result.stdout+result.stderr)
   self.assertIn('PASS native startup overlay and Netflix subtitle transport',result.stdout)
