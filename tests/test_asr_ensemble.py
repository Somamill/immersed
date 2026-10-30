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

    def test_complete_word_crossing_a_core_boundary_keeps_its_end_time(self):
        from asr_ensemble import recognize
        def run(command, **kwargs):
            if command[0] == 'ffmpeg':
                return SimpleNamespace(returncode=0)
            engine, chunk = command[2], command[3]
            if engine != 'whisper-small':
                raise RuntimeError('unavailable')
            # In first context this word's midpoint belongs to the next core.
            seconds, end = (11.8, 12.5) if chunk.endswith('/0.wav') else (.55, 1.25)
            return SimpleNamespace(stdout=json.dumps({'tokens':[{'seconds':seconds,'end':end,'token':'境界の単語'}], 'seconds': .1}))
        with patch.object(asr_ensemble.subprocess, 'check_output', return_value='24'), patch.object(asr_ensemble.subprocess, 'run', side_effect=run):
            result = recognize('fixture.wav')
        self.assertEqual(''.join(c['text'] for c in result['cues']), '境界の単語')
        self.assertAlmostEqual(result['cues'][0]['end'], 12.5)
