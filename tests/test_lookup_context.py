import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from lookup_context import rank


class LookupContextTests(unittest.TestCase):
    def test_screenshot_homophone_is_ranked_without_rewriting_the_source(self):
        data = {'sentence': '個別具体的な自称に興味がある人と', 'start': 6, 'end': 8,
                'before': '話をしています。', 'after': '', 'alternatives': [{'form': '事象'}, {'form': '辞書'}]}
        with patch('lookup_context.ContextScorer') as scorer:
            scorer.return_value.loss.side_effect = [3.0, 2.6, 3.1]
            results = rank(data)
        self.assertEqual(results[0]['form'], '事象')
        self.assertTrue(results[0]['likely'])
        self.assertFalse(results[1]['likely'])
        self.assertEqual(data['sentence'], '個別具体的な自称に興味がある人と')
        self.assertEqual(scorer.return_value.loss.call_args_list[1].args,
                         ('個別具体的な事象に興味がある人と', '話をしています。', ''))

    def test_weak_or_worse_context_does_not_claim_a_likely_correction(self):
        data = {'sentence': '累計がしたいワケではない', 'start': 0, 'end': 2,
                'alternatives': [{'form': '類型'}]}
        for alternative_loss in [2.98, 3.1]:
            with self.subTest(loss=alternative_loss), patch('lookup_context.ContextScorer') as scorer:
                scorer.return_value.loss.side_effect = [3.0, alternative_loss]
                self.assertFalse(rank(data)[0]['likely'])
