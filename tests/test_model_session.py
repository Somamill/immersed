import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from model_session import ModelSession

class ModelSessionTests(unittest.TestCase):
    def test_multiple_chunks_share_one_process_and_close_reaps_it(self):
        worker = "import json,sys,os\nprint('model warming',flush=True)\nfor line in sys.stdin:\n r=json.loads(line);print(json.dumps({'id':r['id'],'data':{'pid':os.getpid(),'audio':r['audio']}}),flush=True)"
        session = ModelSession('test', command=[sys.executable, '-u', '-c', worker], timeout=2)
        try:
            first, second = session.recognize('one.wav'), session.recognize('two.wav')
            self.assertEqual(first['pid'], second['pid'])
            self.assertEqual(second['audio'], 'two.wav')
            process = session.process
        finally:
            session.close()
        self.assertIsNotNone(process.poll())
    def test_dead_worker_does_not_hang_or_restart_for_each_chunk(self):
        session = ModelSession('test', command=[sys.executable, '-c', 'raise SystemExit(1)'], timeout=2)
        try:
            with self.assertRaises(RuntimeError): session.recognize('one.wav')
            with self.assertRaises(RuntimeError): session.recognize('two.wav')
        finally:
            session.close()
