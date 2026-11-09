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
    def test_requested_slice_keeps_book_timestamps(self):
        original = transcribe.recognizer
        transcribe.recognizer = lambda: lambda _path: [{'start': 2.1, 'end': 2.4, 'text': '日本語です。'}]
        try:
            with tempfile.TemporaryDirectory() as folder:
                audio = Path(folder) / 'sample.wav'
                with wave.open(str(audio), 'wb') as out:
                    out.setnchannels(1)
                    out.setsampwidth(2)
                    out.setframerate(16000)
                    out.writeframes(b'\0\x10' * 16000 * 3)
                updates = []
                cues = transcribe.transcribe(str(audio), 2, .5, updates.append)
                self.assertAlmostEqual(cues[0]['start'], 2.1)
                self.assertAlmostEqual(cues[0]['end'], 2.4)
                self.assertEqual(updates[-1]['duration'], .5)
                self.assertEqual(updates[-1]['processedSeconds'], .5)
        finally:
            transcribe.recognizer = original

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
                updates = [json.loads(line) for line in progress.getvalue().splitlines()]
                self.assertEqual(updates[0]["phase"], "loading")
                update = updates[-1]
                self.assertEqual(update['status'], 'processing')
                self.assertEqual(update['cues'], cues)
                self.assertEqual(update['processedSeconds'], 1)
        finally:
            transcribe.recognizer = original


if __name__ == '__main__':
    unittest.main()
