import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('worker', Path(__file__).parents[1] / 'server/transcribe.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class AudioFailureTests(unittest.TestCase):
    def test_network_block_is_not_reported_as_a_missing_video(self):
        result = worker.access_error('Tunnel connection failed: 403 Forbidden')
        self.assertEqual(result['error'], 'NETWORK_BLOCKED')
        self.assertNotIn('try another video', result['message'].lower())

    def test_youtube_denial_is_not_misdiagnosed_as_network_policy(self):
        self.assertEqual(worker.access_error('HTTP Error 403 Forbidden')['error'], 'SOURCE_ACCESS_DENIED')
        self.assertEqual(worker.access_error('Sign in to confirm your age')['error'], 'SOURCE_RESTRICTED')

if __name__ == '__main__':
    unittest.main()

class ReazonCueTests(unittest.TestCase):
    def test_reazon_subwords_keep_text_and_split_by_pause_and_readable_length(self):
        from pathlib import Path
        import importlib.util
        spec = importlib.util.spec_from_file_location('reazon', Path(__file__).parents[1] / 'server/asr_reazon.py')
        reazon = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reazon)
        tokens = [{'seconds': i * .1, 'token': char} for i, char in enumerate('これは日本語字幕です。')]
        tokens += [{'seconds': 4 + i * .1, 'token': char} for i, char in enumerate('若者の会話')]
        cues = reazon.group_subwords(tokens, 7)
        self.assertEqual(''.join(c['text'] for c in cues), 'これは日本語字幕です。若者の会話')
        self.assertEqual(len(cues), 2)
        self.assertLessEqual(max(c['end'] - c['start'] for c in cues), 3.4)
        self.assertTrue(all(c['end'] > c['start'] for c in cues))

    def test_reazon_source_output_preserves_real_language_and_punctuation(self):
        from pathlib import Path
        import importlib.util
        spec = importlib.util.spec_from_file_location('reazon', Path(__file__).parents[1] / 'server/asr_reazon.py')
        reazon = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reazon)
        cues = reazon.group_subwords([
            {'seconds': .3, 'token': 'や'}, {'seconds': .4, 'token': 'っ'}, {'seconds': .5, 'token': 'ぱ'},
            {'seconds': .6, 'token': 'り'}, {'seconds': .7, 'token': '！'}], 2)
        self.assertEqual(cues[0]['text'], 'やっぱり！')
        self.assertAlmostEqual(cues[0]['start'], .3)
        self.assertAlmostEqual(cues[0]['end'], 1.05)
