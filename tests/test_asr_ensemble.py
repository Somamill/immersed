import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import asr_ensemble

class IncrementalTests(unittest.TestCase):
    def test_progress_revises_the_same_chunk_without_duplicating_completed_text(self):
        def run(command, **kwargs):
            if command[0] == 'ffmpeg':
                return SimpleNamespace(returncode=0)
            engine = command[2]
            text = '箸' if engine == 'reazon' else '橋'
            return SimpleNamespace(stdout=json.dumps({'tokens': [{'seconds': 1, 'token': text}], 'seconds': .5}))
        progress = []
        with patch.object(asr_ensemble.subprocess, 'check_output', return_value='25'), patch.object(asr_ensemble.subprocess, 'run', side_effect=run):
            result = asr_ensemble.recognize('fixture.wav', progress.append)
        self.assertEqual(len(progress), 9)
        self.assertEqual(len(progress[2]['comparisons']), 3)
        self.assertTrue(all(len(c['candidates']) == 1 for c in progress[2]['comparisons']))
        self.assertEqual(progress[0]['cues'][0]['text'], '箸')
        self.assertEqual(result['cues'][0]['text'], '橋')
        self.assertEqual(len(result['comparisons']), 3)
        self.assertTrue(all(0 <= cue['start'] < cue['end'] <= 25 for cue in result['cues']))
        self.assertEqual(result['comparisons'][0]['reason'], 'majority-agreement')
    def test_failed_secondary_engines_leave_the_first_result_explicitly_unverified(self):
        def run(command, **kwargs):
            if command[0] == 'ffmpeg':
                return SimpleNamespace(returncode=0)
            if command[2] != 'reazon':
                raise RuntimeError('engine failed')
            return SimpleNamespace(stdout=json.dumps({'tokens':[{'seconds': .1, 'token':'日本語'}], 'seconds': .2}))
        with patch.object(asr_ensemble.subprocess, 'check_output', return_value='2'), patch.object(asr_ensemble.subprocess, 'run', side_effect=run):
            result = asr_ensemble.recognize('fixture.wav')
        self.assertEqual(result['cues'][0]['text'], '日本語')
        self.assertEqual(result['comparisons'][0]['reason'], 'preferred-unverified')
