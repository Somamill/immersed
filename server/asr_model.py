"""Isolated ASR process: one model at a time bounds CPU-preview memory."""
import json
import sys
import time
from pathlib import Path

MODELS = {
    'kotoba': ('kotoba-tech/kotoba-whisper-v2.0-faster', 'f44edd35eaeb2274e85ac7b31fb2c6f59ff1c4bc'),
    'whisper-small': ('Systran/faster-whisper-small', '536b0662742c02347bc0e980a01041f333bce120'),
}

def recognize(name, audio):
    started = time.monotonic()
    if name == 'reazon':
        from asr_reazon import load_model, PAD_SECONDS
        from reazonspeech.k2.asr import transcribe, audio_from_path
        import soundfile
        duration = soundfile.info(audio).duration
        result = transcribe(load_model(), audio_from_path(audio))
        tokens = [{'seconds': max(0, min(duration - .01, t.seconds - PAD_SECONDS)), 'token': t.token} for t in result.subwords]
    else:
        from huggingface_hub import snapshot_download
        from faster_whisper import WhisperModel
        repo, revision = MODELS[name]
        folder = snapshot_download(repo, revision=revision, allow_patterns=['*.json', '*.txt', 'model.bin'])
        model = WhisperModel(folder, device='cpu', compute_type='int8', cpu_threads=2)
        segments, _ = model.transcribe(audio, language='ja', vad_filter=True, beam_size=5, temperature=0,
                                      condition_on_previous_text=False, word_timestamps=name != 'kotoba')
        tokens = []
        for s in segments:
            if name == 'kotoba':
                # Upstream distilled checkpoint ships teacher alignment heads
                # outside its two decoder layers. Do not invoke its broken aligner.
                chars = list(s.text)
                tokens.extend({'seconds': s.start + i * (s.end - s.start) / max(1, len(chars)), 'token': c}
                              for i, c in enumerate(chars))
            else:
                tokens.extend({'seconds': w.start, 'token': w.word} for w in (s.words or []))
    return {'model': name, 'tokens': tokens, 'seconds': round(time.monotonic() - started, 3)}

if __name__ == '__main__':
    if sys.platform.startswith('linux'):
        # Stop model work if the request worker times out or is terminated.
        import ctypes
        import os
        ctypes.CDLL(None).prctl(1, 15)
        if os.getppid() == 1:
            sys.exit(1)
    try:
        print(json.dumps(recognize(sys.argv[1], sys.argv[2]), ensure_ascii=False), flush=True)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
