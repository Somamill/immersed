"""Local Mac ASR worker. Writes only timed Japanese segments as JSON to stdout."""
import json
import platform
import subprocess
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path


def recognizer():
    if platform.machine() == 'arm64':
        import mlx_whisper
        def run(path):
            return mlx_whisper.transcribe(
                path, path_or_hf_repo='mlx-community/whisper-large-v3-turbo',
                language='ja', task='transcribe', word_timestamps=True,
                condition_on_previous_text=False, temperature=0,
            )['segments']
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel('large-v3', device='cpu', compute_type='int8')
        def run(path):
            return model.transcribe(path, language='ja', beam_size=5,
                                    vad_filter=True, word_timestamps=True,
                                    condition_on_previous_text=False)[0]
    return run


def transcribe(path):
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], text=True))
    run = recognizer()
    cues = []
    with tempfile.TemporaryDirectory(prefix='immersed-mac-asr-') as folder:
        for offset in range(0, int(duration + .999), 60):
            chunk = str(Path(folder) / 'speech.wav')
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(offset), '-t', str(min(60, duration-offset)),
                            '-i', path, '-ac', '1', '-ar', '16000', '-y', chunk], check=True)
            with redirect_stdout(sys.stderr):
                segments = run(chunk)
                for segment in segments:
                    start = float(segment['start'] if isinstance(segment, dict) else segment.start) + offset
                    end = float(segment['end'] if isinstance(segment, dict) else segment.end) + offset
                    text = (segment['text'] if isinstance(segment, dict) else segment.text).strip()
                    if text and end > start:
                        cues.append({'start': start, 'end': end, 'text': text})
            print(json.dumps({'status': 'processing', 'cues': cues, 'processedSeconds': min(duration, offset+60)}, ensure_ascii=False), flush=True)
    return cues


if __name__ == '__main__':
    try:
        cues = transcribe(sys.argv[1])
        print(json.dumps({'status': 'ready', 'cues': cues}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'status': 'unavailable', 'error': type(error).__name__ + ': ' + str(error)[:160]}), flush=True)
