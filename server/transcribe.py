"""Self-hosted ASR worker; stdout is JSON, diagnostics go to stderr."""
import json
import pathlib
import sys
import tempfile
import subprocess
import re

def access_error(stderr):
    message = stderr.lower()
    if ('tunnel' in message or 'proxy' in message) and ('403' in message or 'forbidden' in message):
        return {'error': 'NETWORK_BLOCKED', 'message': 'Automatic subtitles are unavailable on this preview’s network. Existing Japanese captions can still be used.'}
    if 'sign in' in message or 'private video' in message or 'login' in message:
        return {'error': 'SOURCE_RESTRICTED', 'message': 'This video requires YouTube access that the subtitle service does not have.'}
    if '403' in message or 'forbidden' in message or 'not a bot' in message:
        return {'error': 'SOURCE_ACCESS_DENIED', 'message': 'YouTube refused access to the audio needed to generate subtitles. Existing captions can still be used.'}
    return {'error': 'AUDIO_UNAVAILABLE', 'message': 'Audio preparation failed. You can retry subtitle generation; existing captions can still be used.'}


def main():
    video_id = sys.argv[1]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Invalid video id')
    with tempfile.TemporaryDirectory(prefix='immersed-asr-') as directory:
        result = subprocess.run([
            sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-progress',
            '--socket-timeout', '15', '--retries', '1', '--extractor-retries', '0', '--max-filesize', '150M',
            '--match-filter', 'duration <= 1800', '-f', 'bestaudio/best',
            '-o', str(pathlib.Path(directory) / 'audio.%(ext)s'),
            'https://www.youtube.com/watch?v=' + video_id,
        ], capture_output=True, text=True, timeout=180)
        if result.returncode:
            print(json.dumps(access_error(result.stderr)))
            return
        files = list(pathlib.Path(directory).glob('audio.*'))
        if not files:
            print(json.dumps({'error': 'MEDIA_LIMIT', 'message': 'Audio was unavailable or outside this preview’s 30-minute / 150 MB processing limit.'}))
            return
        from asr_ensemble import recognize
        def publish(data):
            if len(sys.argv) < 3:
                return
            target = pathlib.Path(sys.argv[2])
            temporary = target.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, ensure_ascii=False))
            temporary.replace(target)
        data = recognize(files[0], publish)
        print(json.dumps(data, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        print(json.dumps({'error': 'TRANSCRIPTION_FAILED', 'message': 'Japanese speech recognition is unavailable for this video.'}))
