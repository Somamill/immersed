import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from asr_compare import compare, edits, normalize

class ComparisonTests(unittest.TestCase):
    def test_original_phrase_wins_by_agreement_without_synthesizing_text(self):
        candidates = [{'model':'reazon','text':'橋を渡る'}, {'model':'kotoba','text':'箸を渡す'}, {'model':'whisper-small','text':'箸を渡す。'}]
        result = compare(candidates)
        self.assertEqual(result['selected'], 'kotoba')
        self.assertEqual(result['reason'], 'majority-agreement')
        self.assertEqual(result['candidates'], candidates)
    def test_disagreement_is_unverified_and_empty_engines_are_not_votes(self):
        result = compare([{'model':'reazon','text':'橋'}, {'model':'kotoba','text':'箸'}, {'model':'whisper-small','text':''}])
        self.assertEqual(result['reason'], 'preferred-unverified')
        self.assertEqual(result['selected'], 'reazon')
        self.assertEqual(compare([])['selected'], None)
    def test_normalization_preserves_japanese_homophones_and_edit_counts(self):
        self.assertEqual(normalize('日本語　です。'), '日本語です')
        self.assertEqual(edits('橋', '箸'), 1)
