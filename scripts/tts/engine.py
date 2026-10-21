"""CPU-only synthesis for blog deployment and the GitBlog platform Actions worker."""
import os, sys, subprocess, tempfile, pathlib, time
sys.path.insert(0, str(pathlib.Path(__file__).parent / 'vendor'))
import numpy as np
import soundfile as sf
from helper import load_text_to_speech, load_voice_style
from languages import LANGUAGES, speech_locale
MODEL_VERSION = 'supertonic3-v1'
VOICES = [f'{gender}{n}' for gender in ['F','M'] for n in range(1,6)]
_model = None
_styles = {}
def synthesize(text, locale='en', voice='F1', preview=True):
    global _model
    lang = speech_locale(locale)
    if lang is None or voice not in VOICES: raise ValueError('Unsupported speech language or voice')
    if not text.strip() or len(text) > (1200 if preview else 60000): raise ValueError('Speech text size is outside the limit')
    root = pathlib.Path(os.environ.get('TTS_MODEL_DIR', '.cache/supertonic3'))
    if _model is None: _model = load_text_to_speech(str(root / 'onnx'), False)
    if voice not in _styles: _styles[voice] = load_voice_style([str(root / 'voice_styles' / f'{voice}.json')])
    start = time.monotonic()
    # Bound peak memory; combine compressed chunks rather than a full-length WAV.
    with tempfile.TemporaryDirectory() as folder:
        files = []
        for i in range(0, len(text), 1000):
            wav, duration = _model(text[i:i+1000], lang, _styles[voice], 5, 1.05)
            frames = min(wav.shape[-1], int(_model.sample_rate * float(np.asarray(duration).flat[0])))
            if frames <= 0 or frames / _model.sample_rate > 600: raise ValueError('Invalid generated duration')
            source = pathlib.Path(folder) / 'chunk.wav'
            sf.write(source, wav[0, :frames], _model.sample_rate)
            target = pathlib.Path(folder) / f'{i}.mp3'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-map_metadata','-1','-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','48k' if preview else '64k',str(target)], check=True, timeout=60)
            files.append(target)
        listing = pathlib.Path(folder) / 'list.txt'
        listing.write_text(''.join(f"file '{p}'\n" for p in files))
        result = pathlib.Path(folder) / 'result.mp3'
        subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(result)],check=True,timeout=60)
        data = result.read_bytes()
        if len(data) > (3*1024*1024 if preview else 48*1024*1024): raise ValueError('Encoded speech exceeds size limit')
        print(f'TTS generated {len(text)} chars, {len(data)} bytes in {time.monotonic()-start:.2f}s',file=sys.stderr)
        return data
