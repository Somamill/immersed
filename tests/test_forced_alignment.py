import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from forced_alignment import map_alignment

class ForcedAlignmentTests(unittest.TestCase):
    def test_preserves_source_spelling_punctuation_and_spaces(self):
        text = '「食材を、ふっくら美味しく。」'
        times = [{'text': '食材', 'start': .64, 'end': 1.12}, {'text': 'を', 'start': 1.12, 'end': 1.2},
                 {'text': 'ふっくら', 'start': 1.2, 'end': 1.76}, {'text': '美味しく', 'start': 1.76, 'end': 2.16}]
        words = map_alignment(text, times, 3)
        self.assertEqual(''.join(w['token'] for w in words), text)
        self.assertEqual(words[0]['seconds'], .64)
        self.assertEqual(words[-1]['end'], 2.16)
        self.assertEqual(words[-1]['token'], '美味しく。」')
    def test_zero_duration_particles_join_the_adjacent_audio_span(self):
        words = map_alignment('食材を', [{'text':'食材','start':.6,'end':1.1},{'text':'を','start':1.2,'end':1.2}], 2)
        self.assertEqual(words, [{'seconds':.6,'end':1.2,'token':'食材を'}])
        with self.assertRaises(ValueError):
            map_alignment('を', [{'text':'を','start':1.2,'end':1.2}], 2)

    def test_digital_silence_is_rejected_before_loading_a_model(self):
        import tempfile
        import wave
        from forced_alignment import AcousticAligner
        with tempfile.NamedTemporaryFile(suffix='.wav') as f:
            with wave.open(f.name, 'wb') as wav:
                wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000)
                wav.writeframes(b'\0\0' * 16000)
            with self.assertRaises(ValueError):
                AcousticAligner().align(f.name, '幻の言葉', 1)

    def test_unaligned_words_and_invalid_times_fail_closed(self):
        for items in [[{'text': '食材', 'start': .1, 'end': .5}],
                      [{'text': '食材を', 'start': float('nan'), 'end': 1}],
                      [{'text': '食材を', 'start': 2, 'end': 1}],
                      [{'text': '食材を', 'start': 0, 'end': 5}],
                      [{'text': '食材を', 'start': 3.01, 'end': 3.02}],
                      [{'text': '別の言葉', 'start': .1, 'end': .5}]]:
            with self.subTest(items=items), self.assertRaises(ValueError):
                map_alignment('食材を', items, 3)
