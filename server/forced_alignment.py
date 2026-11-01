"""Audio-conditioned Japanese word times; reject unmappable text instead of interpolating."""
import math
import unicodedata

MODEL = 'Qwen/Qwen3-ForcedAligner-0.6B'
REVISION = 'c7cbfc2048c462b0d63a45797104fc9db3ad62b7'


def canonical(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if not c.isspace() and not unicodedata.category(c).startswith(('P', 'S')))


def map_alignment(text, items, duration):
    """Keep original glyphs/spacing and attach only model-provided word spans."""
    positions, letters = [], []
    for index, char in enumerate(text):
        for normalized in canonical(char):
            letters.append(normalized)
            positions.append(index)
    target = ''.join(letters)
    if target != canonical(text) or not target:
        raise ValueError('Unsupported transcript normalization')
    words = []
    cursor, original_cursor, previous_start = 0, 0, -1.0
    for item in items:
        word = canonical(item['text'])
        if not word:
            continue
        start, end = float(item['start']), float(item['end'])
        if not all(math.isfinite(t) for t in [start, end]) or start < 0 or start >= duration or end < start or end > duration + .05 or start < previous_start:
            raise ValueError('Invalid acoustic alignment times')
        if target[cursor:cursor + len(word)] != word:
            raise ValueError('Alignment does not cover the recognized transcript')
        cursor += len(word)
        if cursor > len(positions):
            raise ValueError('Alignment extends beyond transcript')
        original_end = positions[cursor - 1] + 1
        words.append({'seconds': start, 'end': min(duration, end), 'token': text[original_cursor:original_end]})
        original_cursor, previous_start = original_end, start
    if cursor != len(target) or not words:
        raise ValueError('Alignment omitted recognized words')
    words[-1]['token'] += text[original_cursor:]
    # The aligner's 80-ms timestamp bins can give a short particle zero length.
    # Attach that glyph to an adjacent acoustic span; never invent a char grid.
    grouped, prefix, prefix_start = [], '', None
    for word in words:
        if word['end'] == word['seconds']:
            if grouped:
                grouped[-1]['token'] += word['token']
                grouped[-1]['end'] = max(grouped[-1]['end'], word['end'])
            else:
                prefix += word['token']
                prefix_start = word['seconds'] if prefix_start is None else min(prefix_start, word['seconds'])
        else:
            if prefix:
                word = {**word, 'token': prefix + word['token'], 'seconds': min(prefix_start, word['seconds'])}
                prefix, prefix_start = '', None
            grouped.append(word)
    if not grouped:
        raise ValueError('Alignment has no measurable acoustic spans')
    return grouped


class AcousticAligner:
    def __init__(self):
        self.model = None

    def load(self):
        if self.model is not None:
            return
        import torch
        from huggingface_hub import snapshot_download
        from qwen_asr import Qwen3ForcedAligner
        torch.set_num_threads(2)
        directory = snapshot_download(MODEL, revision=REVISION, allow_patterns=['*.json', '*.safetensors', '*.txt'])
        self.model = Qwen3ForcedAligner.from_pretrained(directory, dtype=torch.float32, device_map='cpu', attn_implementation='sdpa')

    def align(self, audio, text, duration):
        import soundfile as sf
        import numpy as np
        samples, _ = sf.read(str(audio), dtype='float32')
        if not samples.size or float(np.max(np.abs(samples))) < 1e-6:
            raise ValueError('No acoustic signal to align')
        self.load()
        result = self.model.align(audio=str(audio), text=text, language='Japanese')[0]
        return map_alignment(text, [{'text': item.text, 'start': item.start_time, 'end': item.end_time} for item in result], duration)
