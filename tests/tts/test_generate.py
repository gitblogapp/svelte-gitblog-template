import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts/tts'
sys.path.insert(0, str(SCRIPTS))
from languages import LANGUAGES, speech_locale


class GenerateTests(unittest.TestCase):
    def post(self, locale, enabled=True):
        return dict(postId='same-post', locale=locale, enabled=enabled, voice='M3',
                    text=f'{locale} translated excerpt', fullText=f'{locale} translated full text',
                    textHash='preview-hash', fullHash='full-hash')

    def generate(self, posts, engine):
        Path('build/.well-known').mkdir(parents=True, exist_ok=True)
        Path('build/.well-known/tts-input.json').write_text(json.dumps(dict(posts=posts)))
        with patch.dict(sys.modules, engine=engine):
            runpy.run_path(str(SCRIPTS / 'generate.py'), run_name='__main__')
        return json.loads(Path('content/audio/manifest.json').read_text())['posts']

    def test_translated_audio_is_distinct_and_unchanged_audio_is_reused(self):
        engine = types.ModuleType('engine')
        engine.MODEL_VERSION = 'supertonic3-v1'
        engine.synthesize = Mock(return_value=b'ID3fixture')
        posts = [self.post(locale) for locale in LANGUAGES + ['PT_BR', 'en-US', 'zh-hant', 'th', 'xx']]
        posts.append(self.post('ko', False))
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as folder:
            try:
                os.chdir(folder)
                entries = self.generate(posts, engine)
                self.assertEqual(len(entries), len(LANGUAGES) + 2)
                paths = [entry[kind + 'Path'] for entry in entries for kind in ['preview', 'full']]
                self.assertEqual(len(set(paths)), len(paths))
                self.assertTrue(all(Path(p).read_bytes() == b'ID3fixture' for p in paths))
                for post in posts[:-4]:
                    engine.synthesize.assert_any_call(post['text'], post['locale'], 'M3', True)
                    engine.synthesize.assert_any_call(post['fullText'], post['locale'], 'M3', False)
                self.assertEqual(engine.synthesize.call_count, len(paths))
                engine.synthesize.reset_mock()
                self.assertEqual(self.generate(posts, engine), entries)
                engine.synthesize.assert_not_called()
                # Removed, disabled or unsupported entries no longer advertise old audio.
                self.assertEqual(self.generate([self.post('zh'), self.post('en', False)], None), [])
            finally:
                os.chdir(previous)

    def test_language_aliases_and_unsupported_languages(self):
        self.assertEqual(speech_locale(' PT_br '), 'pt')
        self.assertEqual(speech_locale('en-US'), 'en')
        for locale in ['zh', 'zh-Hans', 'th', 'xx']:
            self.assertIsNone(speech_locale(locale))


if __name__ == '__main__':
    unittest.main()
