import { collectTaxonomy, missingTaxonomy } from './taxonomy.ts';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
// Match the existing DeepL source revision, including metadata and Markdown bytes.
export const sourceHash = (raw) =>
	hash(raw.replace(/^((?:\uFEFF)?---\r?\n)id:\s*[^\r\n]+\r?\n/, '$1'));
export const isPostId = (value) =>
	typeof value === 'string' &&
	(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
		/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value));

export async function readPolicy(root) {
	let policy;
	try {
		policy = JSON.parse(await readFile(path.join(root, '.gitblog/authoring.json'), 'utf8'));
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		policy = { schemaVersion: 1, translationMode: 'deepl' };
	}
	if (policy.schemaVersion !== 1 || !['deepl', 'manual'].includes(policy.translationMode)) {
		throw new Error(
			'Invalid .gitblog/authoring.json: expected schemaVersion 1 and deepl/manual mode'
		);
	}
	return policy;
}

export function locales(env) {
	const normalize = (value) => value.trim().replaceAll('_', '-').toLowerCase();
	const source = normalize(env.PUBLIC_SOURCE_LOCALE || 'en');
	const targets = [
		...new Set(
			(env.PUBLIC_TRANSLATION_LOCALES ?? env.PUBLIC_TRANSLATION_LOCALE ?? '')
				.split(',')
				.map(normalize)
				.filter((locale) => locale && locale !== source)
		)
	];
	for (const locale of [source, ...targets]) {
		if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(locale))
			throw new Error(`Invalid locale: ${locale}`);
	}
	if (targets.length > 7) throw new Error('GitBlog supports at most 8 feeds including the source');
	return { source, targets };
}

export function validSlug(slug, creating = false) {
	if (
		typeof slug !== 'string' ||
		!slug ||
		slug === '.' ||
		slug === '..' ||
		/[/\\]/.test(slug) ||
		Array.from(slug).some((character) => character.charCodeAt(0) < 32)
	) {
		throw new Error('Use an existing filename slug without directories or control characters');
	}
	if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		throw new Error('Use a lowercase kebab-case slug without a path or .md extension');
	}
	return slug;
}

// Reject symlinked content paths; neither reading nor writing may escape the checkout.
export async function safePath(root, relative) {
	const absolute = path.resolve(root, relative);
	const inside = path.relative(root, absolute);
	if (!inside || inside.startsWith('..') || path.isAbsolute(inside))
		throw new Error(`Unsafe path: ${relative}`);
	let current = root;
	for (const segment of inside.split(path.sep)) {
		current = path.join(current, segment);
		try {
			if ((await lstat(current)).isSymbolicLink())
				throw new Error(`Symlinks are not supported: ${relative}`);
		} catch (error) {
			if (error.code === 'ENOENT') break;
			throw error;
		}
	}
	return absolute;
}

export async function writeContent(root, relative, raw, exclusive = false) {
	const file = await safePath(root, relative);
	await mkdir(path.dirname(file), { recursive: true });
	if (exclusive) return writeFile(file, raw, { flag: 'wx' });
	const temporary = `${file}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, raw, { flag: 'wx' });
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}
}

export async function markdownFiles(root, relative) {
	try {
		const dir = await safePath(root, relative);
		return (await readdir(dir))
			.filter((name) => name.endsWith('.md'))
			.sort()
			.map((name) => `${relative}/${name}`);
	} catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}
}

export async function readPost(root, relative) {
	const raw = await readFile(await safePath(root, relative), 'utf8');
	if (!/^(?:\uFEFF)?---\r?\n/.test(raw))
		throw new Error(`${relative}: YAML frontmatter is required`);
	return { ...matter(raw), raw, path: relative };
}

const stampFields = new Set(['sourceHash', 'translationContentHash', 'translatedAt']);
export function translationHash(post) {
	const data = Object.fromEntries(
		Object.entries(post.data)
			.filter(([key]) => !stampFields.has(key))
			.sort(([a], [b]) => a.localeCompare(b))
	);
	return hash(JSON.stringify({ data, content: post.content }));
}
const dateValue = (value) => (value instanceof Date ? value.toISOString() : String(value ?? ''));
const validDate = (value) =>
	value != null && value !== '' && Number.isFinite(Date.parse(dateValue(value)));

function protectedMarkdown(content) {
	const code = [],
		links = [];
	marked.walkTokens(marked.lexer(content), (token) => {
		if (token.type === 'code' || token.type === 'codespan')
			code.push([token.type, token.lang ?? '', token.text]);
		if (token.type === 'link' || token.type === 'image') links.push([token.type, token.href]);
	});
	return { code, links: links.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}

export function translationErrors(source, translated, locale, sourceLocale, stamped = true) {
	const errors = [];
	// TTS settings are inherited from the source at build time, not translated metadata.
	for (const key of ['id', 'date', 'updated', 'published', 'category', 'tags', 'cover']) {
		if (JSON.stringify(source.data[key] ?? null) !== JSON.stringify(translated.data[key] ?? null))
			errors.push(`must preserve source ${key}`);
	}
	if (translated.data.locale !== locale || translated.data.sourceLocale !== sourceLocale)
		errors.push('locale metadata does not match configuration');
	if (translated.data.sourcePath !== source.path) errors.push('sourcePath does not match source');
	if (
		JSON.stringify(protectedMarkdown(source.content)) !==
		JSON.stringify(protectedMarkdown(translated.content))
	)
		errors.push('translation changed code or link/image destinations');
	if (stamped) {
		if (translated.data.sourceHash !== sourceHash(source.raw))
			errors.push('source changed: translate the current revision');
		if (translated.data.translationContentHash !== translationHash(translated))
			errors.push('translation is unsealed or changed after acceptance');
		if (!validDate(translated.data.translatedAt)) errors.push('translatedAt is missing or invalid');
	}
	return errors;
}

export async function postErrors(root, post) {
	const errors = [];
	const { data, content } = post;
	if (!isPostId(data.id)) errors.push('id must be a UUID or ULID');
	for (const key of ['title', 'description'])
		if (typeof data[key] !== 'string' || !data[key].trim())
			errors.push(`${key} must be nonempty text`);
	if (!validDate(data.date)) errors.push('date is missing or invalid');
	if (data.updated != null && !validDate(data.updated)) errors.push('updated is invalid');
	if (data.tts != null && typeof data.tts !== 'boolean') errors.push('tts must be a boolean');
	if (data.ttsVoice && (typeof data.ttsVoice !== 'string' || !/^[FM][1-5]$/.test(data.ttsVoice)))
		errors.push('ttsVoice must be F1–F5 or M1–M5');
	if (data.published != null && typeof data.published !== 'boolean')
		errors.push('published must be a boolean');
	if (data.category != null && typeof data.category !== 'string')
		errors.push('category must be text');
	if (
		data.tags != null &&
		!(
			typeof data.tags === 'string' ||
			(Array.isArray(data.tags) && data.tags.every((tag) => typeof tag === 'string'))
		)
	)
		errors.push('tags must be text or a string array');
	if (!content.trim()) errors.push('body is empty');
	const assets = [];
	if (data.cover != null && data.cover !== '') {
		if (
			typeof data.cover !== 'string' ||
			!data.cover.startsWith('/') ||
			data.cover.startsWith('//')
		)
			errors.push('cover must be a local /uploads/... path');
		else assets.push(data.cover);
	}
	marked.walkTokens(marked.lexer(content), (token) => {
		if (token.type === 'image') {
			if (token.href.startsWith('/') && !token.href.startsWith('//')) assets.push(token.href);
			else if (!/^https:\/\//i.test(token.href))
				errors.push(`image must use /uploads/... or https: ${token.href}`);
		}
	});
	for (const asset of assets) {
		try {
			const decoded = decodeURIComponent(asset.split(/[?#]/)[0]);
			if (decoded.split('/').includes('..')) throw new Error('parent path');
			if (!(await lstat(await safePath(root, `static${decoded}`))).isFile())
				throw new Error('not a file');
		} catch {
			errors.push(`missing or unsafe asset: ${asset}`);
		}
	}
	return errors;
}

export async function inspect(root, env) {
	const policy = await readPolicy(root);
	const languages = locales(env);
	const errors = [],
		posts = [],
		sources = new Map(),
		ids = new Set();
	try {
		await lstat(path.join(root, 'content/taxonomy.json'));
		const taxonomy = await collectTaxonomy(root, languages.source);
		if (policy.translationMode === 'manual')
			errors.push(
				...missingTaxonomy(taxonomy, languages.targets).map(
					(row) => `content/taxonomy.json: missing ${row.kind}/${row.id} label ${row.locale}`
				)
			);
	} catch (error) {
		if (error.code !== 'ENOENT') errors.push(error.message);
	}
	for (const file of await markdownFiles(root, 'content/posts')) {
		const post = await readPost(root, file);
		const problems = await postErrors(root, post);
		for (const key of [
			'locale',
			'sourceLocale',
			'sourcePath',
			'sourceHash',
			'translationSchemaVersion',
			'translationSource',
			'translatedAt',
			'translationContentHash'
		]) {
			if (post.data[key] != null) problems.push(`source must not contain translation field ${key}`);
		}
		if (ids.has(post.data.id)) problems.push('duplicate source id');
		ids.add(post.data.id);
		sources.set(path.basename(file), post);
		errors.push(...problems.map((problem) => `${file}: ${problem}`));
		const translations = [];
		for (const locale of languages.targets) {
			const target = `content/translations/${locale}/posts/${path.basename(file)}`;
			let state = 'missing',
				issues = [];
			try {
				const translated = await readPost(root, target);
				issues = await postErrors(root, translated);
				if (translated.data.id !== post.data.id) issues.push('id differs from source');
				if (policy.translationMode === 'manual' && post.data.published !== false)
					issues.push(...translationErrors(post, translated, locale, languages.source));
				state = issues.length ? 'needs-revision' : 'ready';
			} catch (error) {
				if (error.code !== 'ENOENT') {
					issues.push(error.message);
					state = 'needs-revision';
				}
			}
			if (issues.length && (policy.translationMode !== 'manual' || post.data.published === false)) {
				errors.push(`${target}: ${issues.join('; ')}`);
			}
			if (
				policy.translationMode === 'manual' &&
				post.data.published !== false &&
				state !== 'ready'
			) {
				errors.push(`${target}: ${issues.join('; ') || 'translation is missing'}`);
			}
			translations.push({ locale, path: target, state, errors: issues });
		}
		posts.push({
			slug: path.basename(file, '.md'),
			path: file,
			id: post.data.id,
			sourceHash: sourceHash(post.raw),
			stage: problems.length
				? 'invalid'
				: post.data.published === false
					? 'draft'
					: translations.some((t) => t.state !== 'ready')
						? 'needs-translation'
						: 'ready',
			translations
		});
	}
	// Include unconfigured locales as well: the ID checker also rejects orphan variants.
	let folders = [];
	try {
		folders = await readdir(await safePath(root, 'content/translations'), { withFileTypes: true });
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	for (const folder of folders) {
		if (folder.isSymbolicLink()) throw new Error('Symlinked translation directory');
		if (!folder.isDirectory()) continue;
		for (const file of await markdownFiles(root, `content/translations/${folder.name}/posts`)) {
			const post = await readPost(root, file),
				source = sources.get(path.basename(file));
			if (!source)
				errors.push(`${file}: orphan translation; resolve explicitly, no automatic deletion`);
			else if (post.data.id !== source.data.id) errors.push(`${file}: id differs from source`);
		}
	}
	return {
		schemaVersion: 1,
		translationMode: policy.translationMode,
		...languages,
		ok: errors.length === 0,
		errors,
		posts
	};
}
