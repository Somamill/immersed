import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from asr_ensemble import recognize

class AcousticPipelineTests(unittest.TestCase):
    def test_warm_passes_close_models_and_refine_times_without_losing_words(self):
        instances = []
        class Session:
            def __init__(self, engine):
                self.engine, self.calls, self.closed = engine, 0, False
                instances.append(self)
            def recognize(self, audio):
                self.calls += 1
                return {'tokens':[{'seconds':1,'end':1.3,'token':'日本語'}],'seconds':.1}
            def close(self): self.closed = True
        class Aligner:
            def align(self, audio, text, duration):
                return [{'seconds':.4,'end':1.2,'token':text}]
        with patch.dict(os.environ, {'IMMERSED_PERSISTENT_MODELS':'1','IMMERSED_FORCE_ALIGNMENT':'1'}), \
             patch('model_session.ModelSession', Session), patch('forced_alignment.AcousticAligner', Aligner), \
             patch('asr_ensemble.subprocess.check_output', return_value='25'), \
             patch('asr_ensemble.subprocess.run', return_value=SimpleNamespace(returncode=0)):
            result = recognize('fixture.wav')
        self.assertEqual(len(instances), 3)
        self.assertTrue(all(s.closed and s.calls == 3 for s in instances))
        self.assertEqual(''.join(c['text'] for c in result['cues']), '日本語' * 3)
        self.assertTrue(all(c['alignment']['status'] == 'aligned' for c in result['comparisons']))
        self.assertEqual(result['pipeline'], 'ensemble-acoustic-v4')

    def test_failed_audio_alignment_keeps_all_selected_words_and_marks_estimates(self):
        class Session:
            def __init__(self, engine): pass
            def recognize(self, audio):
                return {'tokens':[{'seconds':1,'end':1.3,'token':'日本語'}],'seconds':.1}
            def close(self): pass
        class BrokenAligner:
            def align(self, audio, text, duration):
                raise ValueError('Unmappable acoustic output')
        with patch.dict(os.environ, {'IMMERSED_PERSISTENT_MODELS':'1','IMMERSED_FORCE_ALIGNMENT':'1'}), \
             patch('model_session.ModelSession', Session), patch('forced_alignment.AcousticAligner', BrokenAligner), \
             patch('asr_ensemble.subprocess.check_output', return_value='5'), \
             patch('asr_ensemble.subprocess.run', return_value=SimpleNamespace(returncode=0)):
            result = recognize('fixture.wav')
        self.assertEqual(''.join(c['text'] for c in result['cues']), '日本語')
        self.assertEqual(result['comparisons'][0]['alignment']['status'], 'estimated')
        self.assertEqual(result['cues'][0]['start'], 1)
