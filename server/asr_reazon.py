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
    folder = snapshot_download(repository, revision=MODEL_REVISION)
    return sherpa_onnx.OfflineRecognizer.from_transducer(
        tokens=os.path.join(folder, 'tokens.txt'),
        encoder=os.path.join(folder, 'encoder-epoch-99-avg-1.int8.onnx'),
        decoder=os.path.join(folder, 'decoder-epoch-99-avg-1.onnx'),
        joiner=os.path.join(folder, 'joiner-epoch-99-avg-1.int8.onnx'),
        num_threads=1, sample_rate=16000, feature_dim=80,
        decoding_method='greedy_search', provider='cpu')

def group_subwords(subwords, duration):
    cues, text, start, previous = [], '', None, None
    for item in subwords:
        token = item.get('token', '') if isinstance(item, dict) else getattr(item, 'token', '')
        time = item.get('seconds', 0) if isinstance(item, dict) else getattr(item, 'seconds', 0)
        token = token.replace(' ', '')
        if not token or not re.search(r'[ぁ-ヿ㐀-鿿A-Za-z0-9、。，．！？!?….,]', token):
            continue
        time = max(0.0, min(max(0.0, float(duration) - .15), float(time)))
        gap = time - previous if previous is not None else 0
        if text and (gap > 0.55 or time - start >= MAX_CUE_SECONDS or len(text) + len(token) > MAX_CUE_CHARS):
            cues.append({'start': start, 'end': max(start + .15, time), 'text': text})
            text, start = '', None
        text += token
        if start is None:
            start = time
        previous = time
        if re.search(r'[。！？!?、，,\n]$', text):
            cues.append({'start': start, 'end': min(float(duration), max(start + .15, time + .35)), 'text': text})
            text, start = '', None
    if text and start is not None:
        cues.append({'start': start, 'end': min(float(duration), max(start + .15, float(duration))), 'text': text})
    return [cue for cue in cues if cue['end'] > cue['start'] and cue['text']]

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
