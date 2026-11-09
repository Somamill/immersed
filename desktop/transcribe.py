"""Local Mac ASR worker. Writes only timed Japanese segments as JSON to stdout."""
import json
import platform
import sys
from contextlib import redirect_stdout


def transcribe(path):
    if platform.machine() == 'arm64':
        import mlx_whisper
        result = mlx_whisper.transcribe(
            path, path_or_hf_repo='mlx-community/whisper-large-v3-turbo',
            language='ja', task='transcribe', word_timestamps=True,
            condition_on_previous_text=False, temperature=0,
        )
        segments = result['segments']
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel('large-v3', device='cpu', compute_type='int8')
        segments, _ = model.transcribe(path, language='ja', beam_size=5,
                                       vad_filter=True, word_timestamps=True,
                                       condition_on_previous_text=False)
    cues = []
    for segment in segments:
        start, end = float(segment['start'] if isinstance(segment, dict) else segment.start), float(segment['end'] if isinstance(segment, dict) else segment.end)
        text = (segment['text'] if isinstance(segment, dict) else segment.text).strip()
        if text and end > start:
            cues.append({'start': start, 'end': end, 'text': text})
    return cues


if __name__ == '__main__':
    try:
        with redirect_stdout(sys.stderr):
            cues = transcribe(sys.argv[1])
        print(json.dumps({'cues': cues}, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': type(error).__name__ + ': ' + str(error)[:160]}))
