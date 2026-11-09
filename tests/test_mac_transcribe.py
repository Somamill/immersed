"""Check progressive caption timing without downloading a speech model."""
import contextlib
import io
import json
import tempfile
import unittest
import wave
from pathlib import Path
from desktop import transcribe


class MacTranscriptionTest(unittest.TestCase):
    def test_chunk_offsets_and_progress(self):
        original = transcribe.recognizer
        transcribe.recognizer = lambda: lambda _path: [{'start': .2, 'end': .8, 'text': '日本語です。'}]
        try:
            with tempfile.TemporaryDirectory() as folder:
                audio = Path(folder) / 'sample.wav'
                with wave.open(str(audio), 'wb') as out:
                    out.setnchannels(1)
                    out.setsampwidth(2)
                    out.setframerate(16000)
                    out.writeframes(b'\0\x10' * 16000)
                progress = io.StringIO()
                with contextlib.redirect_stdout(progress):
                    cues = transcribe.transcribe(str(audio))
                self.assertEqual(cues, [{'start': .2, 'end': .8, 'text': '日本語です。'}])
                update = json.loads(progress.getvalue().strip())
                self.assertEqual(update['status'], 'processing')
                self.assertEqual(update['cues'], cues)
                self.assertEqual(update['processedSeconds'], 1)
        finally:
            transcribe.recognizer = original


if __name__ == '__main__':
    unittest.main()
