"""Self-hosted ASR worker; stdout is JSON, diagnostics go to stderr."""
import json
import pathlib
import sys
import tempfile
import subprocess
import re

def main():
    video_id = sys.argv[1]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Invalid video id')
    with tempfile.TemporaryDirectory(prefix='immersed-asr-') as directory:
        result = subprocess.run([
            sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-progress',
            '--socket-timeout', '15', '--retries', '1', '--max-filesize', '150M',
            '--match-filter', 'duration <= 1800', '-f', 'bestaudio/best',
            '-o', str(pathlib.Path(directory) / 'audio.%(ext)s'),
            'https://www.youtube.com/watch?v=' + video_id,
        ], capture_output=True, text=True, timeout=180)
        if result.returncode:
            print(result.stderr[-1200:], file=sys.stderr)
            print(json.dumps({'error': 'AUDIO_UNAVAILABLE', 'message': 'This server could not access the video audio. No subtitles were generated.'}))
            return
        files = list(pathlib.Path(directory).glob('audio.*'))
        if not files:
            print(json.dumps({'error': 'MEDIA_LIMIT', 'message': 'Audio was unavailable or outside this preview’s 30-minute / 150 MB processing limit.'}))
            return
        from faster_whisper import WhisperModel
        model = WhisperModel('base', device='cpu', compute_type='int8', cpu_threads=2)
        segments, _ = model.transcribe(str(files[0]), language='ja', vad_filter=True, beam_size=3)
        cues = [{'start': segment.start, 'end': segment.end, 'text': segment.text.strip()} for segment in segments if segment.text.strip()]
        print(json.dumps({'cues': cues}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        print(json.dumps({'error': 'TRANSCRIPTION_FAILED', 'message': 'Automatic subtitle generation failed. Please try another video.'}))
