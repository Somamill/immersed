import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from caption_context import rerank
from asr_compare import compare

class ContextTests(unittest.TestCase):
    def setUp(self):
        self.candidates = [{'model':'reazon', 'text':'今日は天気がいいので公演を散歩しました'},
                           {'model':'kotoba', 'text':'今日は天気がいいので公園を散歩しました'}]
        feature = {'reading':'キョウハテンキガイイノデコウエンヲサンポシマシタ', 'protected':[], 'numbers':[], 'negatives':0}
        self.features = [copy.deepcopy(feature), copy.deepcopy(feature)]
    def test_selects_only_an_existing_close_sounding_alternative(self):
        result = rerank(compare(self.candidates), self.features, [2.3, 1.4])
        self.assertEqual(result['selected'], 'kotoba')
        self.assertEqual(result['reason'], 'context-alternative')
        self.assertEqual(result['candidates'], self.candidates)
    def test_names_unknowns_numbers_and_negation_changes_are_protected(self):
        for key, value in [('protected',['鈴木']), ('protected',['未知のスラング']), ('numbers',['3']), ('negatives',1), ('grammar',['た'])]:
            features = copy.deepcopy(self.features)
            features[0][key] = value
            self.assertEqual(rerank(compare(self.candidates), features, [2.3, 1.4])['selected'], 'reazon')
    def test_weak_context_gain_or_different_sound_does_not_rewrite(self):
        self.assertEqual(rerank(compare(self.candidates), self.features, [2.3, 2.29])['selected'], 'reazon')
        self.features[1]['reading'] = 'ゼンゼンチガウハナシ'
        self.assertEqual(rerank(compare(self.candidates), self.features, [2.3, 1.4])['selected'], 'reazon')
    def test_overriding_majority_requires_stronger_context_evidence(self):
        candidates = self.candidates + [{'model':'whisper-small','text':self.candidates[0]['text']}]
        features = self.features + [copy.deepcopy(self.features[0])]
        self.assertEqual(rerank(compare(candidates), features, [2.3, 2.2, 2.3])['selected'], 'reazon')
        self.assertEqual(rerank(compare(candidates), features, [2.3, 1.4, 2.3])['selected'], 'kotoba')

    def test_protected_alternatives_do_not_load_the_language_model(self):
        from unittest.mock import patch
        from types import SimpleNamespace
        from caption_context import ContextScorer
        import json
        features = copy.deepcopy(self.features)
        features[0]['protected'] = ['鈴木']
        scorer = ContextScorer()
        with patch('caption_context.subprocess.run', return_value=SimpleNamespace(stdout=json.dumps(features))), patch.object(scorer, 'loss', side_effect=AssertionError('must not load')):
            result = scorer.apply(compare(self.candidates))
        self.assertEqual(result['selected'], 'reazon')
        self.assertEqual(result['context']['status'], 'guarded')
