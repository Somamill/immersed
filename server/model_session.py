"""One isolated engine process per pass; reuse its model across audio chunks."""
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path

class ModelSession:
    def __init__(self, engine, command=None, timeout=240):
        self.command = command or [sys.executable, str(Path(__file__).with_name('asr_model.py')), engine, '--worker']
        self.timeout = timeout
        self.process = None
        self.sequence = 0
        self.failed = False
        self.buffer = b''

    def recognize(self, audio):
        if self.failed:
            raise RuntimeError('Recognizer unavailable for this pass')
        if self.process is None:
            self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
        if self.process.poll() is not None:
            self.failed = True
            raise RuntimeError('Recognizer process exited')
        self.sequence += 1
        self.process.stdin.write((json.dumps({'id': self.sequence, 'audio': str(audio)}) + '\n').encode())
        self.process.stdin.flush()
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                try:
                    data = json.loads(line)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    continue
                if not isinstance(data, dict) or data.get('id') != self.sequence:
                    continue
                if data.get('error'):
                    self.failed = True
                    raise RuntimeError(data['error'])
                return data['data']
            remaining = deadline - time.monotonic()
            if not select.select([self.process.stdout], [], [], max(0, remaining))[0]:
                break
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                self.failed = True
                raise RuntimeError('Recognizer closed its output')
            self.buffer += chunk
            if len(self.buffer) > 2 * 1024 * 1024:
                self.failed = True
                raise RuntimeError('Recognizer response exceeds limit')
        self.failed = True
        self.close()
        raise TimeoutError('Recognizer exceeded its chunk deadline')

    def close(self):
        if self.process is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
            self.process.stdin.close()
            self.process.stdout.close()
            self.process = None
