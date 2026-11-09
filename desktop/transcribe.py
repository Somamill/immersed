"""Bounded Japanese ASR on Apple Silicon. Progress is newline-delimited JSON."""
import array
import json
import math
import os
import platform
import subprocess
import sys
import tempfile
import wave
from contextlib import redirect_stdout
from pathlib import Path


def recognizer():
    if platform.machine() == 'arm64':
        import mlx_whisper
        def run(path):
            return mlx_whisper.transcribe(
                path, path_or_hf_repo=('mlx-community/whisper-large-v3-mlx' if os.environ.get('IMMERSED_SPEECH_QUALITY') == 'accurate' else 'mlx-community/whisper-large-v3-turbo'),
                language='ja', task='transcribe', word_timestamps=True,
                condition_on_previous_text=False, temperature=0,
                no_speech_threshold=0.6, logprob_threshold=-1.0,
                compression_ratio_threshold=2.4, hallucination_silence_threshold=2.0,
            )['segments']
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel('large-v3', device='cpu', compute_type='int8')
        def run(path):
            return model.transcribe(path, language='ja', beam_size=5,
                                    vad_filter=True, word_timestamps=True,
                                    condition_on_previous_text=False)[0]
    return run


def value(segment, key, default=None):
    return segment.get(key, default) if isinstance(segment, dict) else getattr(segment, key, default)


def segment_cues(segment, offset, duration):
    text = str(value(segment, 'text', '')).strip()
    start = max(offset, float(value(segment, 'start', 0)) + offset)
    end = min(duration, float(value(segment, 'end', 0)) + offset)
    if not text or not math.isfinite(start) or not math.isfinite(end) or end <= start:
        return []
    no_speech = float(value(segment, 'no_speech_prob', 0) or 0)
    logprob = float(value(segment, 'avg_logprob', 0) or 0)
    ratio = float(value(segment, 'compression_ratio', 0) or 0)
    if no_speech > .6 and logprob < -1.0:
        return []
    uncertain = logprob < -1.0 or ratio > 2.4
    words = value(segment, 'words', []) or []
    # Keep exact recognized text when word-level output cannot reproduce it.
    if words and ''.join(str(value(w, 'word', '')) for w in words).strip() == text:
        result, pieces = [], []
        first, last = start, start
        for word in words:
            word_start = max(start, float(value(word, 'start', 0)) + offset)
            word_end = min(end, float(value(word, 'end', 0)) + offset)
            if not pieces:
                first = word_start
            pieces.append(str(value(word, 'word', '')))
            last = max(word_start, word_end)
            line = ''.join(pieces).strip()
            if len(line) >= 45 or last - first >= 7 or (len(line) >= 12 and line[-1:] in '。！？!?'):
                if last > first:
                    result.append({'start': first, 'end': last, 'text': line, **({'uncertain': True} if uncertain else {})})
                pieces = []
        if pieces and last > first:
            result.append({'start': first, 'end': last, 'text': ''.join(pieces).strip(), **({'uncertain': True} if uncertain else {})})
        if result:
            return result
    return [{'start': start, 'end': end, 'text': text, **({'uncertain': True} if uncertain else {})}]


def is_silent(path):
    with wave.open(str(path), 'rb') as audio:
        samples = array.array('h', audio.readframes(audio.getnframes()))
    # Only skip digital near-silence. Quiet speech still goes to the recognizer.
    return not samples or max(abs(x) for x in samples) <= 1


def transcribe(path):
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], text=True))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('The audio duration is invalid.')
    run, cues = None, []
    with tempfile.TemporaryDirectory(prefix='immersed-mac-asr-') as folder:
        for offset in range(0, math.ceil(duration), 30):
            chunk = str(Path(folder) / 'speech.wav')
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(offset), '-t', str(min(30, duration-offset)),
                            '-i', path, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', chunk], check=True)
            new_cues = []
            if not is_silent(chunk):
                with redirect_stdout(sys.stderr):
                    if run is None:
                        run = recognizer()
                    for segment in run(chunk):
                        new_cues.extend(segment_cues(segment, offset, duration))
            cues.extend(new_cues)
            print(json.dumps({'status': 'processing', 'cues': new_cues, 'append': True,
                              'processedSeconds': min(duration, offset+30), 'duration': duration}, ensure_ascii=False), flush=True)
    return cues


if __name__ == '__main__':
    try:
        cues = transcribe(sys.argv[1])
        print(json.dumps({'status': 'ready', 'cues': cues}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'status': 'unavailable', 'error': type(error).__name__ + ': ' + str(error)[:160]}), flush=True)
