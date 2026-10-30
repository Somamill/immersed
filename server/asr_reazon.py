import re
import subprocess
import tempfile
from pathlib import Path

CHUNK_SECONDS = 27.0
OVERLAP_SECONDS = 1.0
MAX_CUE_SECONDS = 3.4
MAX_CUE_CHARS = 38
PAD_SECONDS = 0.9
MODEL_REVISION = '291488c8151be24d7da4bf7af26e533fad96e407'

def load_model():
    import os
    import sherpa_onnx
    from huggingface_hub import snapshot_download
    repository = 'reazon-research/reazonspeech-k2-v2'
    folder = snapshot_download(repository, revision=MODEL_REVISION, allow_patterns=['tokens.txt', 'encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx'])
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        tokens=os.path.join(folder, 'tokens.txt'),
        encoder=os.path.join(folder, 'encoder-epoch-99-avg-1.int8.onnx'),
        decoder=os.path.join(folder, 'decoder-epoch-99-avg-1.onnx'),
        joiner=os.path.join(folder, 'joiner-epoch-99-avg-1.int8.onnx'),
        num_threads=1, sample_rate=16000, feature_dim=80,
        decoding_method='greedy_search', provider='cpu')

def group_subwords(subwords, duration):
    # Preserve recognized glyphs; tokens at a shared timestamp must not become
    # mutually exclusive captions. End times are evidence, not display duration.
    cues, text, start, previous, spoken_end = [], '', None, None, 0.0
    for item in subwords:
        get = item.get if isinstance(item, dict) else lambda key, default=None: getattr(item, key, default)
        token = get('token', '')
        if not token or re.fullmatch(r'<\|.*?\|>|<blk>|<s>|</s>', token):
            continue
        if token.isspace() and not text:
            continue
        time = max(previous or 0.0, min(max(0.0, float(duration) - .01), float(get('seconds', 0))))
        gap = time - previous if previous is not None else 0
        if text and time > start + .02 and (gap > .55 or time - start >= MAX_CUE_SECONDS or len(text) + len(token) > MAX_CUE_CHARS):
            cues.append({'start': start, 'end': min(duration, max(start + .4, spoken_end)), 'text': text})
            text, start = '', None
        if start is None:
            start = time
        text += token
        previous = time
        spoken_end = min(duration, max(time + .15, float(get('end', time + .45))))
        if re.search(r'[。！？!?]$', text):
            cues.append({'start': start, 'end': min(duration, max(start + .4, spoken_end)), 'text': text})
            text, start = '', None
    if text and start is not None:
        cues.append({'start': start, 'end': min(duration, max(start + .4, spoken_end)), 'text': text})
    result = []
    for cue in cues:
        if result and cue['start'] <= result[-1]['start'] + .02:
            result[-1]['text'] += cue['text']
            result[-1]['end'] = max(result[-1]['end'], cue['end'])
        else:
            if result:
                result[-1]['end'] = min(result[-1]['end'], cue['start'])
            result.append(cue)
    return [cue for cue in result if cue['end'] > cue['start'] and cue['text']]


def recognize(media_path, model, transcribe, audio_from_path, ffmpeg='ffmpeg'):
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(media_path)], text=True).strip())
    subwords, offset = [], 0.0
    with tempfile.TemporaryDirectory(prefix='immersed-reazon-') as directory:
        while offset < duration:
            chunk_duration = min(CHUNK_SECONDS, duration - offset)
            chunk = Path(directory) / 'chunk.wav'
            subprocess.run([ffmpeg, '-v', 'error', '-ss', str(offset), '-t', str(chunk_duration), '-i', str(media_path), '-ac', '1', '-ar', '16000', '-f', 'wav', '-y', str(chunk)], check=True, capture_output=True)
            result = transcribe(model, audio_from_path(str(chunk)))
            cutoff = offset + chunk_duration - OVERLAP_SECONDS if offset + chunk_duration < duration else float('inf')
            for word in result.subwords:
                absolute = offset + float(word.seconds) - PAD_SECONDS
                if (absolute < offset and offset > 0) or absolute >= cutoff:
                    continue
                subwords.append({'seconds': max(0.0, absolute), 'token': word.token})
            if offset + chunk_duration >= duration:
                break
            offset += CHUNK_SECONDS - OVERLAP_SECONDS
    subwords.sort(key=lambda item: item['seconds'])
    return group_subwords(subwords, duration)
