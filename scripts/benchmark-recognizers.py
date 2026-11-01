"""Evaluate pinned open recognizers on a local audio/reference manifest.
No audio upload and no default recognizer change. Use independently checked refs.
"""
import argparse
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from asr_compare import normalize, edits

MODELS = {
    'qwen-small': ('Qwen/Qwen3-ASR-0.6B', '5eb144179a02acc5e5ba31e748d22b0cf3e303b0'),
    'qwen-large': ('Qwen/Qwen3-ASR-1.7B', '7278e1e70fe206f11671096ffdd38061171dd6e5'),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest')
    parser.add_argument('--model', choices=['reazon', *MODELS], required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    import torch
    torch.set_num_threads(2)
    if args.model == 'reazon':
        from asr_reazon import load_model
        from reazonspeech.k2.asr import transcribe, audio_from_path
        model = load_model()
        def recognize(audio): return ''.join(t.token for t in transcribe(model, audio_from_path(audio)).subwords)
    else:
        from huggingface_hub import snapshot_download
        from qwen_asr import Qwen3ASRModel
        repo, revision = MODELS[args.model]
        folder = snapshot_download(repo, revision=revision, allow_patterns=['*.json', '*.safetensors', '*.txt'])
        model = Qwen3ASRModel.from_pretrained(folder, dtype=torch.bfloat16, device_map='cpu', attn_implementation='sdpa', max_inference_batch_size=1, max_new_tokens=512)
        def recognize(audio): return model.transcribe(audio=audio, language='Japanese')[0].text
    report = {'model': args.model, 'edits': 0, 'characters': 0, 'clips': []}
    for row in json.loads(Path(args.manifest).read_text()):
        started = time.monotonic()
        text = recognize(row['audio'])
        reference = normalize(row['reference'])
        count = edits(reference, normalize(text))
        report['edits'] += count
        report['characters'] += len(reference)
        report['clips'].append({'text': text, 'reference': row['reference'], 'edits': count, 'characters': len(reference), 'seconds': time.monotonic() - started})
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report['clips'][-1], ensure_ascii=False), flush=True)
if __name__ == '__main__': main()
