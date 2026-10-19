import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	normalizeTerm,
	resolvePostTaxonomy,
	validateTaxonomy,
	type Taxonomy
} from '../scripts/lib/taxonomy-core.ts';
import {
	translateTaxonomy,
	collectTaxonomy,
	saveTaxonomy,
	missingTaxonomy
} from '../scripts/lib/taxonomy.ts';
const dictionary = (): Taxonomy => ({
	schemaVersion: 1,
	sourceLocale: 'ko',
	categories: [
		{
			id: 'market',
			source: '시장 분석',
			labels: { ko: '시장 분석', en: 'Market Analysis' },
			aliases: []
		},
		{
			id: 'different',
			source: '시장분석',
			labels: { ko: '시장분석', en: 'Market Analysis' },
			aliases: []
		}
	],
	tags: [
		{
			id: 'btc-ko',
			source: '비트코인',
			labels: { ko: '비트코인', en: 'Bitcoin', ja: 'ビットコイン' },
			aliases: ['BTC']
		},
		{ id: 'btc-en', source: 'bitcoin', labels: { ko: 'bitcoin', en: ' bitcoin ' }, aliases: [] },
		{
			id: 'cash',
			source: '비트코인 캐시',
			labels: { ko: '비트코인 캐시', en: 'Bitcoin Cash' },
			aliases: []
		}
	]
});
test('merges only equivalent English tags and publishes all group aliases across locales', () => {
	const data = dictionary();
	validateTaxonomy(data);
	const first = resolvePostTaxonomy(
		data,
		'시장 분석',
		['비트코인', 'Bitcoin', '비트코인 캐시'],
		'en'
	);
	assert.equal(first.tags.length, 2);
	assert.equal(first.tags[0].id, 'btc-ko');
	assert.equal(first.tags[0].label, 'Bitcoin');
	for (const query of ['bitcoin', '비트코인', 'ビットコイン', 'btc'])
		assert.ok(first.tags[0].aliases.includes(query));
	assert.equal(resolvePostTaxonomy(data, '시장분석', ['bitcoin'], 'ko').category.id, 'different');
	assert.equal(resolvePostTaxonomy(data, '시장 분석', ['bitcoin'], 'ko').tags[0].label, '비트코인');
	assert.equal(normalizeTerm(' C++ '), 'c++');
	assert.notEqual(normalizeTerm('C#'), normalizeTerm('C++'));
});
test('honors separation overrides and keeps categories distinct despite identical translations', () => {
	const data = dictionary();
	data.tags[1].separate = true;
	data.tags[1].labels.en = 'Bitcoin';
	const separated = resolvePostTaxonomy(data, '시장 분석', ['비트코인', 'bitcoin'], 'en');
	assert.notEqual(separated.tags[0].label, separated.tags[1].label);
	assert.equal(
		resolvePostTaxonomy(data, '시장 분석', ['비트코인', 'bitcoin'], 'en').tags.length,
		2
	);
	assert.notEqual(
		resolvePostTaxonomy(data, '시장 분석', [], 'en').category.id,
		resolvePostTaxonomy(data, '시장분석', [], 'en').category.id
	);
});
test('incrementally translates new terms, preserves corrected labels and IDs, and never edits posts', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'taxonomy-'));
	try {
		await mkdir(path.join(root, 'content/posts'), { recursive: true });
		const post = '---\ncategory: 시장 분석\ntags: [비트코인, bitcoin]\n---\n원문\n';
		await writeFile(path.join(root, 'content/posts/a.md'), post);
		const calls: unknown[] = [];
		const translate = async (texts: string[], locale: string) => {
			calls.push([texts, locale]);
			return texts.map((text) =>
				locale === 'ko' ? text : text === '시장 분석' ? 'Market Analysis' : 'Bitcoin'
			);
		};
		const first = await translateTaxonomy(root, 'ko', ['en'], translate);
		assert.equal(calls.length, 2);
		assert.equal(missingTaxonomy(first, ['en']).length, 0);
		first.tags[0].labels.en = 'Bitcoin';
		first.tags[0].labels.ko = '비트코인 (BTC)';
		await saveTaxonomy(root, first);
		await translateTaxonomy(root, 'ko', ['en'], translate);
		assert.equal(calls.length, 2);
		assert.equal((await collectTaxonomy(root, 'ko')).tags[0].labels.ko, '비트코인 (BTC)');
		first.categories[0].aliases.push(first.categories[0].source);
		first.categories[0].source = '시장 동향';
		await saveTaxonomy(root, first);
		assert.equal((await collectTaxonomy(root, 'ko')).categories.length, 1);
		assert.equal(await readFile(path.join(root, 'content/posts/a.md'), 'utf8'), post);
		await writeFile(path.join(root, 'content/posts/b.md'), '---\ntags: [새 태그]\n---\n');
		const next = await translateTaxonomy(root, 'ko', ['en'], translate);
		assert.equal(next.tags[0].id, first.tags[0].id);
		assert.deepEqual((calls[2] as unknown[])[0], ['Notes', '새 태그']);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
test('rejects malformed dictionaries and incomplete translation batches', async () => {
	const data = dictionary();
	data.tags[1].id = data.tags[0].id;
	assert.throws(() => validateTaxonomy(data));
	const root = await mkdtemp(path.join(os.tmpdir(), 'taxonomy-'));
	try {
		await mkdir(path.join(root, 'content/posts'), { recursive: true });
		await writeFile(path.join(root, 'content/posts/a.md'), '---\ntags: [비트코인]\n---\n');
		await assert.rejects(translateTaxonomy(root, 'ko', ['en'], async () => []));
		await assert.rejects(readFile(path.join(root, 'content/taxonomy.json')), { code: 'ENOENT' });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('does not assume English-site inputs are already English', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'taxonomy-mixed-'));
	try {
		await mkdir(path.join(root, 'content/posts'), { recursive: true });
		await writeFile(
			path.join(root, 'content/posts/a.md'),
			'---\ncategory: Markets\ntags: [bitcoin, 비트코인]\n---\n'
		);
		const calls: string[] = [];
		const data = await translateTaxonomy(
			root,
			'en',
			[],
			async (texts: string[], locale: string) => {
				calls.push(locale);
				return texts.map((text) => (text === '비트코인' ? 'Bitcoin' : text));
			}
		);
		assert.deepEqual(calls, ['en']);
		assert.equal(
			resolvePostTaxonomy(data, 'Markets', ['bitcoin', '비트코인'], 'en').tags.length,
			1
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
