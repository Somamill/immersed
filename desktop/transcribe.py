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
from functools import lru_cache
from contextlib import redirect_stdout
from pathlib import Path


PIPELINE = 'mac-whisper-context-v3'
CORE_SECONDS = 26
CONTEXT_SECONDS = 2
_loaded_quality = None


def decode_temperatures():
    # Retry only when Whisper's log-probability/compression checks fail. Keep
    # retries bounded; do not turn every audiobook minute into an ensemble pass.
    return (0.0, 0.2, 0.4) if os.environ.get('IMMERSED_SPEECH_QUALITY') == 'accurate' else (0.0, 0.2)


@lru_cache(maxsize=1)
def cpu_model():
    from faster_whisper import WhisperModel
    return WhisperModel('large-v3', device='cpu', compute_type='int8',
                        cpu_threads=max(1, min(8, os.cpu_count() or 2)))


def recognizer():
    if platform.machine() == 'arm64':
        import mlx_whisper
        def run(path):
            global _loaded_quality
            result = mlx_whisper.transcribe(
                path, path_or_hf_repo=('mlx-community/whisper-large-v3-mlx' if os.environ.get('IMMERSED_SPEECH_QUALITY') == 'accurate' else 'mlx-community/whisper-large-v3-turbo'),
                language='ja', task='transcribe', word_timestamps=True,
                condition_on_previous_text=False, temperature=decode_temperatures(),
                no_speech_threshold=0.6, logprob_threshold=-1.0,
                compression_ratio_threshold=2.4, hallucination_silence_threshold=2.0,
            )['segments']
            _loaded_quality = os.environ.get('IMMERSED_SPEECH_QUALITY', 'balanced')
            return result
    else:
        model = cpu_model()
        def run(path):
            return model.transcribe(path, language='ja', beam_size=5,
                                    vad_filter=True, word_timestamps=True, task='transcribe',
                                    temperature=decode_temperatures(),
                                    no_speech_threshold=.6, log_prob_threshold=-1.0,
                                    compression_ratio_threshold=2.4,
                                    hallucination_silence_threshold=2.0,
                                    condition_on_previous_text=False)[0]
    return run


def value(segment, key, default=None):
    return segment.get(key, default) if isinstance(segment, dict) else getattr(segment, key, default)


def finite(value, default=0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def segment_cues(segment, offset, duration):
    text = str(value(segment, 'text', '')).strip()
    raw_start = finite(value(segment, 'start'), float('nan'))
    raw_end = finite(value(segment, 'end'), float('nan'))
    if not math.isfinite(raw_start) or not math.isfinite(raw_end):
        return []
    start = max(offset, raw_start + offset)
    end = min(duration, raw_end + offset)
    if not text or not math.isfinite(start) or not math.isfinite(end) or end <= start:
        return []
    no_speech = finite(value(segment, 'no_speech_prob', 0))
    logprob = finite(value(segment, 'avg_logprob', 0))
    ratio = finite(value(segment, 'compression_ratio', 0))
    if no_speech > .6 and logprob < -1.0:
        return []
    uncertain = logprob < -1.0 or ratio > 2.4 or finite(value(segment, 'temperature', 0)) > 0
    words = value(segment, 'words', []) or []
    # Keep exact recognized text when word-level output cannot reproduce it.
    if words and ''.join(str(value(w, 'word', '')) for w in words).strip() == text:
        result, pieces = [], []
        first, last = start, start
        for word in words:
            word_start = max(start, last, finite(value(word, 'start', 0)) + offset)
            word_end = min(end, finite(value(word, 'end', 0)) + offset)
            if word_end <= word_start:
                # Fall back to the original segment instead of dropping glyphs.
                return [{'start': start, 'end': end, 'text': text, 'uncertain': True}]
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


def chunk_ranges(duration, start=0, span=None):
    start = float(start)
    if not math.isfinite(start) or start < 0 or start >= duration:
        raise ValueError('The requested listening position is invalid.')
    if span is not None and (not math.isfinite(float(span)) or float(span) <= 0):
        raise ValueError('The requested subtitle duration is invalid.')
    stop = min(duration, start + float(span)) if span is not None else duration
    core = start
    while core < stop - .000001:
        end = min(stop, core + CORE_SECONDS)
        # Two seconds on both sides, including across saved minute boundaries.
        yield core, end, max(0, core - CONTEXT_SECONDS), min(duration, end + CONTEXT_SECONDS)
        core = end


def owned_cues(segment, left, core, end, duration):
    words = value(segment, 'words', []) or []
    text = str(value(segment, 'text', '')).strip()
    if words and ''.join(str(value(w, 'word', '')) for w in words).strip() == text:
        # Assign words by their acoustic midpoint, so overlap adds context
        # without displaying the same boundary word in two minutes.
        selected = [w for w in words if core <= left + (finite(value(w, 'start')) + finite(value(w, 'end'))) / 2 < end]
        if not selected:
            return []
        segment = {key: value(segment, key) for key in ['avg_logprob', 'no_speech_prob', 'compression_ratio', 'temperature']}
        segment.update(text=''.join(str(value(w, 'word', '')) for w in selected), words=selected,
                       start=finite(value(selected[0], 'start')), end=finite(value(selected[-1], 'end')))
    else:
        midpoint = left + (finite(value(segment, 'start')) + finite(value(segment, 'end'))) / 2
        if not core <= midpoint < end:
            return []
    cues = segment_cues(segment, left, min(duration, end))
    for cue in cues:
        cue['start'] = max(core, cue['start'])
        cue['end'] = min(end, cue['end'])
    return [cue for cue in cues if cue['end'] > cue['start']]


def transcribe(path, start=0, span=None, emit=None):
    if emit is None:
        output = sys.stdout
        emit = lambda message: print(json.dumps(message, ensure_ascii=False), file=output, flush=True)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], text=True))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('The audio duration is invalid.')
    ranges = list(chunk_ranges(duration, start, span))
    stop = ranges[-1][1]
    run, cues = None, []
    with tempfile.TemporaryDirectory(prefix='immersed-mac-asr-') as folder:
        for core, end, left, right in ranges:
            chunk = str(Path(folder) / 'speech.wav')
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(left), '-t', str(right-left),
                            '-i', path, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', chunk], check=True)
            new_cues = []
            if not is_silent(chunk):
                with redirect_stdout(sys.stderr):
                    if run is None:
                        warm = _loaded_quality == os.environ.get('IMMERSED_SPEECH_QUALITY', 'balanced')
                        emit({'status':'processing','phase':'recognizing' if warm else 'loading','stage':'Transcribing' if warm else 'Loading the local speech model','cues':[],'append':True,'processedSeconds':core-start,'duration':stop-start})
                        run = recognizer()
                    for segment in run(chunk):
                        new_cues.extend(owned_cues(segment, left, core, end, duration))
            # Within one core, overlapping acoustic segments are combined rather
            # than leaving unreachable words behind an earlier subtitle.
            ordered = []
            for cue in sorted(new_cues, key=lambda c: c['start']):
                if ordered and cue['start'] < ordered[-1]['end']:
                    previous = ordered[-1]
                    previous.update(text=previous['text'] + cue['text'], end=max(previous['end'],cue['end']), uncertain=True)
                else:
                    ordered.append(cue)
            cues.extend(ordered)
            emit({'status':'processing','phase':'recognizing','cues':ordered,'append':True,
                  'processedSeconds':end-start,'duration':stop-start,'pipeline':PIPELINE})
    return cues


if __name__ == '__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--worker':
        for line in sys.stdin:
            try:
                request=json.loads(line)
                job_id=request['id']
                os.environ['IMMERSED_SPEECH_QUALITY']=request.get('quality','balanced')
                def emit(message):
                    print(json.dumps({**message,'id':job_id},ensure_ascii=False),file=sys.__stdout__,flush=True)
                cues=transcribe(request['audio'],request.get('start',0),request.get('duration'),emit)
                emit({'status':'ready','cues':cues,'pipeline':PIPELINE})
            except Exception as error:
                print(json.dumps({'id':request.get('id') if 'request' in locals() else None,'status':'unavailable','error':type(error).__name__+': '+str(error)[:160]}),flush=True)
    else:
        try:
            cues=transcribe(sys.argv[1],float(sys.argv[2]) if len(sys.argv)>2 else 0,float(sys.argv[3]) if len(sys.argv)>3 else None)
            print(json.dumps({'status':'ready','cues':cues},ensure_ascii=False),flush=True)
        except Exception as error:
            print(json.dumps({'status':'unavailable','error':type(error).__name__+': '+str(error)[:160]}),flush=True)
