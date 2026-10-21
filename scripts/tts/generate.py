"""Generate only changed published audio; failures leave text publication usable."""
import hashlib, json, pathlib, sys
from languages import speech_locale
root=pathlib.Path('content/audio');root.mkdir(parents=True,exist_ok=True)
manifest=root/'manifest.json'
inputs=json.loads(pathlib.Path('build/.well-known/tts-input.json').read_text())
result=[]; failures=0
for post in inputs['posts']:
    if not post['enabled'] or speech_locale(post['locale']) is None: continue
    # Unsupported-only builds do not initialize inference dependencies or the model.
    from engine import synthesize, MODEL_VERSION
    entry={k:post[k] for k in ['postId','locale','textHash','fullHash','voice']};entry['version']=MODEL_VERSION
    try:
        for kind,text in [('preview',post['text']),('full',post['fullText'])]:
            key=hashlib.sha256(f"{MODEL_VERSION}:{post['locale']}:{post['voice']}:{kind}:{text}".encode()).hexdigest()
            target=root/f'{key}.mp3'
            if not target.exists():
                audio=synthesize(text,post['locale'],post['voice'],kind=='preview')
                temporary=target.with_suffix('.tmp');temporary.write_bytes(audio);temporary.replace(target)
            entry[f'{kind}Path']=str(target)
        result.append(entry)
    except Exception as error:
        failures+=1;print(f"::warning::TTS unavailable for {post['postId']} ({post['locale']}): {type(error).__name__}",file=sys.stderr)
# Never advertise stale audio, even after generation failures. Files stay out of Pages.
manifest.write_text(json.dumps({'version':1,'posts':result},ensure_ascii=False,indent=2)+'\n')
print(f'TTS ready: {len(result)}, pending/failed: {failures}')
