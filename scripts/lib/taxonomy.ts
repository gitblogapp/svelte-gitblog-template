import { readFile, readdir, mkdir, rename, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { normalizeTerm, termList, validateTaxonomy, type Taxonomy } from './taxonomy-core.ts';
export const taxonomyFile = 'content/taxonomy.json';

async function safe(root: string, relative: string) {
	let current = root;
	for (const part of relative.split('/')) {
		current = path.join(current, part);
		try {
			if ((await lstat(current)).isSymbolicLink())
				throw new Error(`Symlinked taxonomy path: ${relative}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
	return current;
}
export async function readTaxonomy(root: string, sourceLocale: string): Promise<Taxonomy> {
	try {
		const data = JSON.parse(await readFile(await safe(root, taxonomyFile), 'utf8'));
		validateTaxonomy(data);
		if (data.sourceLocale !== sourceLocale)
			throw new Error(
				'Taxonomy sourceLocale differs from site configuration; migrate labels explicitly'
			);
		return data;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return { schemaVersion: 1, sourceLocale, categories: [], tags: [] };
	}
}
export async function collectTaxonomy(root: string, sourceLocale: string): Promise<Taxonomy> {
	const data = await readTaxonomy(root, sourceLocale);
	const add = (kind: 'tags' | 'categories', input: unknown) => {
		if (typeof input !== 'string' || !input.trim()) return;
		const source = input.trim();
		if (
			data[kind].some(
				(row) => row.id === source || normalizeTerm(row.source) === normalizeTerm(source)
			)
		)
			return;
		// Explicit aliases preserve renamed references; translated labels alone do not merge categories.
		if (
			data[kind].filter((row) =>
				row.aliases.some((alias) => normalizeTerm(alias) === normalizeTerm(source))
			).length === 1
		)
			return;
		// Content-derived IDs are stable even before the initial dictionary is committed.
		const id = `${kind === 'tags' ? 'tag' : 'category'}-${createHash('sha256').update(normalizeTerm(source)).digest('hex').slice(0, 24)}`;
		data[kind].push({ id, source, labels: {}, aliases: [] });
	};
	for (const kind of ['posts', 'categories', 'tags'] as const) {
		const dir = await safe(root, `content/${kind}`);
		const files = await readdir(dir).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		});
		for (const name of files.filter((f) => f.endsWith('.md')).sort()) {
			const { data: post } = matter(
				await readFile(await safe(root, `content/${kind}/${name}`), 'utf8')
			);
			if (kind === 'posts') {
				add('categories', post.category || 'Notes');
				termList(post.tags).forEach((tag) => add('tags', tag));
			} else add(kind, post.title);
		}
	}
	validateTaxonomy(data);
	return data;
}
export function missingTaxonomy(data: Taxonomy, locales: string[]) {
	const needed = [...new Set(['en', data.sourceLocale, ...locales])];
	return (['categories', 'tags'] as const).flatMap((kind) =>
		data[kind].flatMap((row) =>
			needed
				.filter((locale) => !row.labels[locale])
				.map((locale) => ({ kind, id: row.id, source: row.source, locale }))
		)
	);
}
export async function saveTaxonomy(root: string, data: Taxonomy) {
	validateTaxonomy(data);
	const file = await safe(root, taxonomyFile);
	const text = JSON.stringify(data, null, 2) + '\n';
	if (
		(await readFile(file, 'utf8').catch((error) => {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
			throw error;
		})) === text
	)
		return;
	await mkdir(path.dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	await writeFile(temporary, text, { flag: 'wx' });
	await rename(temporary, file);
}
export async function translateTaxonomy(
	root: string,
	sourceLocale: string,
	targets: string[],
	translate: (texts: string[], locale: string) => Promise<string[]>
) {
	const data = await collectTaxonomy(root, sourceLocale);
	const missing = missingTaxonomy(data, targets);
	for (const locale of [...new Set(missing.map((row) => row.locale))]) {
		const rows = missing.filter((row) => row.locale === locale);
		for (let start = 0; start < rows.length; start += 40) {
			const batch = rows.slice(start, start + 40);
			const result = await translate(
				batch.map((row) => row.source),
				locale
			);
			if (
				!Array.isArray(result) ||
				result.length !== batch.length ||
				result.some((value) => typeof value !== 'string' || !value.trim() || value.length > 100)
			)
				throw new Error('Incomplete/invalid taxonomy translation');
			batch.forEach((row, i) => {
				data[row.kind].find((entry) => entry.id === row.id)!.labels[locale] = result[i].trim();
			});
		}
	}
	await saveTaxonomy(root, data);
	return data;
}
