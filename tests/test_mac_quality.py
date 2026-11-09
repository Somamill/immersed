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

class WhisperBoundaryTest(unittest.TestCase):
    def test_context_chunks_are_bounded_and_cover_only_requested_minute(self):
        from desktop.transcribe import chunk_ranges
        ranges = list(chunk_ranges(15 * 3600, 30000, 60))
        self.assertEqual(ranges[0][0],30000)
        self.assertEqual(ranges[-1][1],30060)
        self.assertTrue(all(right-left <= 30 for _,_,left,right in ranges))
        self.assertEqual(sum(end-core for core,end,_,_ in ranges),60)
        self.assertEqual(ranges[0][2],29998)
        self.assertEqual(ranges[-1][3],30062)

    def test_context_boundary_word_is_kept_once(self):
        from desktop.transcribe import owned_cues
        words=[{'start':1.6,'end':2.2,'word':'日本語'},{'start':2.2,'end':2.8,'word':'です。'}]
        segment={'start':1.6,'end':2.8,'text':'日本語です。','words':words}
        # Context begins at 24s; the first word's midpoint is 25.9s.
        before=owned_cues(segment,24,0,26,100)
        after=owned_cues(segment,24,26,52,100)
        self.assertEqual(''.join(c['text'] for c in before+after),'日本語です。')
        self.assertEqual(before[-1]['end'],26)
        self.assertGreaterEqual(after[0]['start'],26)

    def test_malformed_word_timing_does_not_drop_original_text(self):
        cue=segment_cues({'start':0,'end':2,'text':'日本語です。','words':[{'start':1,'end':1,'word':'日本語'},{'start':1,'end':2,'word':'です。'}]},0,2)[0]
        self.assertEqual(cue['text'],'日本語です。')
        self.assertTrue(cue['uncertain'])
        self.assertEqual(segment_cues({'start':float('nan'),'end':1,'text':'bad'},0,2),[])

    def test_invalid_ranges_rejected(self):
        from desktop.transcribe import chunk_ranges
        for start,span in [(float('inf'),1),(0,-1),(0,0),(-1,2)]:
            with self.assertRaises(ValueError):list(chunk_ranges(60,start,span))
