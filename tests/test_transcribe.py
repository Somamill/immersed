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
