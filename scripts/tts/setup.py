"""Download a fixed public checkpoint. No API key or hosted Supertone service."""
import os
from huggingface_hub import snapshot_download
snapshot_download(repo_id='supertone-oss-archive/supertonic-3', revision='aafc6e32416a594460b32413efc49d7fe4ce6d46', local_dir=os.environ.get('TTS_MODEL_DIR', '.cache/supertonic3'), allow_patterns=['onnx/*', 'voice_styles/*', 'LICENSE*'])
