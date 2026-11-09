import contextlib
import io
import tempfile
import unittest
import wave
from pathlib import Path
from desktop.transcribe import segment_cues, transcribe


class MacQualityTest(unittest.TestCase):
    def test_silence_does_not_load_or_hallucinate_a_model(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'silence.wav'
            with wave.open(str(file), 'wb') as audio:
                audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(16000)
                audio.writeframes(b'\0\0' * 16000)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(transcribe(str(file)), [])

    def test_low_confidence_is_marked_and_silence_rejected(self):
        self.assertEqual(segment_cues({'start': 0, 'end': 1, 'text': '幻覚', 'no_speech_prob': .95, 'avg_logprob': -1.5}, 0, 10), [])
        cue = segment_cues({'start': 0, 'end': 2, 'text': '日本語', 'avg_logprob': -1.1}, 30, 31)[0]
        self.assertEqual(cue['start'], 30); self.assertEqual(cue['end'], 31); self.assertTrue(cue['uncertain'])

    def test_long_word_timing_is_split_without_rewriting_text(self):
        words = [{'start': i, 'end': i + 1, 'word': '日本語'} for i in range(20)]
        text = ''.join(w['word'] for w in words)
        cues = segment_cues({'start': 0, 'end': 20, 'text': text, 'words': words}, 60, 100)
        self.assertGreater(len(cues), 1)
        self.assertEqual(''.join(c['text'] for c in cues), text)
        self.assertEqual(cues[0]['start'], 60)
        self.assertEqual(cues[-1]['end'], 80)

if __name__ == '__main__':
    unittest.main()
