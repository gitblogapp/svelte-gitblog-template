"""Language support for the pinned Supertonic 3 model, without loading the model."""
import json
from pathlib import Path

LANGUAGES = json.loads(Path(__file__).with_suffix('.json').read_text())

def speech_locale(locale):
    language = locale.strip().replace('_', '-').lower().split('-')[0]
    return language if language in LANGUAGES else None
