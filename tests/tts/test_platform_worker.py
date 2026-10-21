import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

script = pathlib.Path(__file__).resolve().parents[2] / 'scripts/tts/platform-worker.py'
spec = importlib.util.spec_from_file_location('platform_worker', script)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class QueueTests(unittest.TestCase):
    def test_empty_queue_exits_without_a_model(self):
        with tempfile.TemporaryDirectory() as folder:
            output = str(pathlib.Path(folder) / 'output')
            with patch.dict(os.environ, RUNNER_TEMP=folder, GITHUB_OUTPUT=output), \
                    patch.object(sys, 'argv', ['worker', 'claim']), \
                    patch.object(worker, 'api', return_value=None):
                worker.main()
            self.assertEqual(pathlib.Path(output).read_text(), 'pending=false\n')
            self.assertFalse((pathlib.Path(folder) / 'gitblog-speech-job.json').exists())

    def test_batch_does_not_lease_a_job_it_will_never_process(self):
        job = dict(post_id='p', locale='en', voice='F1', text='Hello', lease_token='lease')
        calls = []
        def api(action, *_args):
            calls.append(action)
            return job if action == 'claim' else None
        engine = types.ModuleType('engine')
        engine.synthesize = lambda *_args, **_kwargs: b'ID3'
        with tempfile.TemporaryDirectory() as folder:
            (pathlib.Path(folder) / 'gitblog-speech-job.json').write_text(json.dumps(job))
            with patch.dict(os.environ, RUNNER_TEMP=folder), \
                    patch.dict(sys.modules, engine=engine), \
                    patch.object(sys, 'argv', ['worker', 'run']), \
                    patch.object(worker, 'api', side_effect=api):
                worker.main()
        self.assertEqual(calls.count('result'), 20)
        # One job was claimed before model setup, so only nineteen more are needed.
        self.assertEqual(calls.count('claim'), 19)
        self.assertEqual(calls[-1], 'result')


if __name__ == '__main__':
    unittest.main()
