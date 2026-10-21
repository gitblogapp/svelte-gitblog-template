import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { hash, sourceHash, translationHash, translationErrors } from '../scripts/lib/authoring.mjs';
import { changedPaths, snapshotPaths } from '../scripts/lib/preservation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-translated-tts-'));
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'build', 'content', '.cache']);
const bodies = {
	zh: '這是原始文章。',
	ko: '한국어로 번역된 본문입니다.',
	en: 'This is the translated article.',
	ja: '翻訳された記事の本文です。',
	'pt-br': 'Este é o artigo traduzido.',
	th: 'นี่คือบทความที่แปลแล้ว'
};
const supported = new Set(['ko', 'en', 'ja', 'pt-br']);
const posts = [
	{ slug: 'enabled', id: '5ad7c795-6e52-4c46-9514-d48bfd59621d', tts: true, ttsVoice: 'M3' },
	{ slug: 'disabled', id: '2e18fe77-4cf8-4fc9-9e24-d34d6b7c08f9', tts: false, ttsVoice: 'F2' },
	{ slug: 'inherited', id: '3f62ed08-ad19-4572-bb0f-4a603cc09b6a' }
];
const env = {
	...Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) => !/^(PUBLIC_|DEEPL_|GITHUB_|SITE_BASE_PATH)/.test(key)
		)
	),
	PUBLIC_SOURCE_LOCALE: 'zh',
	PUBLIC_TRANSLATION_LOCALES: 'ko,en,ja,pt-BR,th',
	PUBLIC_SITE_URL: 'https://fixture.github.io/blog',
	PUBLIC_SITE_REPOSITORY: 'fixture/blog',
	GITHUB_REPOSITORY: 'fixture/blog',
	PUBLIC_TTS_VOICE: 'F4',
	PUBLIC_GISCUS_ENABLED: 'false'
};
async function write(relative, text) {
	await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true });
	await writeFile(path.join(fixture, relative), text);
}
try {
	await cp(root, fixture, {
		recursive: true,
		filter: (file) =>
			!path
				.relative(root, file)
				.split(path.sep)
				.some((part) => excluded.has(part))
	});
	await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
	for (const mode of ['deepl', 'manual']) {
		await write(
			'.gitblog/authoring.json',
			JSON.stringify({ schemaVersion: 1, translationMode: mode })
		);
		const audio = [];
		for (const post of posts) {
			const { slug, ...settings } = post;
			const data = {
				...settings,
				title: slug,
				description: 'Translated TTS fixture',
				date: '2026-01-01',
				published: true
			};
			const raw = matter.stringify(bodies.zh, data);
			const source = { ...matter(raw), raw, path: `content/posts/${slug}.md` };
			await write(source.path, raw);
			for (const [locale, body] of Object.entries(bodies)) {
				if (locale !== 'zh') {
					// Legacy translations omit TTS; stale copies must not override current source settings.
					const translatedData = { ...data };
					delete translatedData.tts;
					delete translatedData.ttsVoice;
					if (slug === 'disabled') Object.assign(translatedData, { tts: true, ttsVoice: 'M5' });
					Object.assign(translatedData, {
						locale,
						sourceLocale: 'zh',
						sourcePath: source.path,
						sourceHash: sourceHash(raw),
						translationSource: mode,
						translatedAt: '2026-01-02T00:00:00Z'
					});
					const translated = matter(matter.stringify(body, translatedData));
					translated.data.translationContentHash = translationHash(translated);
					assert.deepEqual(translationErrors(source, translated, locale, 'zh'), []);
					assert.ok(
						translationErrors(
							source,
							{ ...translated, content: translated.content + 'Unaccepted change' },
							locale,
							'zh'
						).includes('translation is unsealed or changed after acceptance')
					);
					await write(
						`content/translations/${locale}/posts/${slug}.md`,
						matter.stringify(translated.content, translated.data)
					);
				}
				const audioPath = `content/audio/${hash(`${slug}:${locale}`)}.mp3`;
				await write(audioPath, 'ID3fixture');
				audio.push({
					postId: post.id,
					locale,
					textHash: hash(body),
					fullHash: hash(body),
					voice: post.ttsVoice || 'F4',
					version: 'supertonic3-v1',
					previewPath: audioPath,
					fullPath: audioPath
				});
			}
		}
		await write('content/audio/manifest.json', JSON.stringify({ version: 1, posts: audio }));
		const before = await snapshotPaths(fixture, ['content']);
		for (const directory of ['.svelte-kit', 'build'])
			await rm(path.join(fixture, directory), { recursive: true, force: true });
		const result = spawnSync('npm', ['run', 'build'], {
			cwd: fixture,
			env: { ...env, PUBLIC_TTS_ENABLED: String(mode === 'manual') },
			encoding: 'utf8',
			maxBuffer: 15 * 1024 * 1024
		});
		assert.equal(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
		assert.deepEqual(changedPaths(before, await snapshotPaths(fixture, ['content'])), []);
		const input = JSON.parse(
			await readFile(path.join(fixture, 'build/.well-known/tts-input.json'), 'utf8')
		);
		assert.equal(input.posts.length, posts.length * Object.keys(bodies).length);
		for (const post of posts)
			for (const [locale, body] of Object.entries(bodies)) {
				const entry = input.posts.find(
					(entry) => entry.postId === post.id && entry.locale === locale
				);
				const enabled = supported.has(locale) && (post.tts ?? mode === 'manual');
				assert.equal(entry.enabled, enabled, `${mode}/${post.slug}/${locale}`);
				assert.equal(entry.text, body);
				assert.equal(entry.fullText, body);
				assert.equal(entry.voice, post.ttsVoice || 'F4');
				assert.equal(Boolean(entry.fullUrl), enabled);
				assert.equal(Boolean(entry.previewUrl), enabled);
				const page = await readFile(
					path.join(
						fixture,
						`build/${locale === 'zh' ? '' : `${locale}/`}blog/${post.slug}/index.html`
					),
					'utf8'
				);
				assert.equal(page.includes('<audio'), enabled);
			}
		console.log(
			`${mode}: translated text, source settings, language filtering, players and content preservation passed`
		);
	}
} finally {
	await rm(fixture, { recursive: true, force: true });
}
