"""Trusted GitBlog queue consumer. Never logs tokens or article text."""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://gitblog.app/api/internal/media/'
AUDIENCE = 'https://gitblog.app/media-worker'


def identity():
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    url += ('&' if '?' in url else '?') + urllib.parse.urlencode({'audience': AUDIENCE})
    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)['value']


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api(action, job=None, audio=None):
    query = '' if job is None else '?' + urllib.parse.urlencode({
        'post': job['post_id'], 'locale': job['locale'], 'lease': job['lease_token']})
    req = urllib.request.Request(BASE + action + query, data=audio or b'',
                                 method='PUT' if audio is not None else 'POST', headers={
        'Authorization': 'Bearer ' + identity(),
        'User-Agent': 'gitblog-speech',
        'Content-Type': 'audio/mpeg' if audio is not None else 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            return json.load(response) if action == 'claim' and response.status == 200 else None
    except urllib.error.HTTPError as error:
        # A newer feed or another lease superseded this result. Never overwrite it.
        if error.code == 409 and action != 'claim':
            return None
        raise RuntimeError(f'Media API {action} failed ({error.code})') from None


def main():
    pending = pathlib.Path(os.environ['RUNNER_TEMP']) / 'gitblog-speech-job.json'
    if sys.argv[1] == 'claim':
        job = api('claim')
        if job:
            pending.write_text(json.dumps(job))
            pending.chmod(0o600)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(f'pending={str(bool(job)).lower()}\n')
        return
    from engine import synthesize
    job = json.loads(pending.read_text())
    pending.unlink()
    start = time.monotonic()
    for index in range(20):
        try:
            audio = synthesize(job['text'], job['locale'], job['voice'], preview=True)
            api('result', job, audio)
        except Exception as error:
            print(f'::warning::Speech job failed ({type(error).__name__})', file=sys.stderr)
            api('failed', job)
        if index == 19 or time.monotonic() - start > 600:
            break
        job = api('claim')
        if not job:
            break


if __name__ == '__main__':
    main()
