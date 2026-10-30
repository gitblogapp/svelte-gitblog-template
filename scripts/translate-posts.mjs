import { loadEnvFile } from './lib/env.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import { readPolicy } from './lib/authoring.mjs';
import { translateTaxonomy, collectTaxonomy, saveTaxonomy } from './lib/taxonomy.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
if ((await readPolicy(projectRoot)).translationMode === 'manual') {
	throw new Error(
		'Manual translation mode: use npm run translate:content to validate without calling DeepL'
	);
}
const sourceDir = path.join(projectRoot, 'content/posts');

loadEnvFile(path.join(projectRoot, '.env.production'));

const sourceSiteCopy = {
	tagline: process.env.PUBLIC_SITE_TAGLINE?.trim() ?? '',
	description: process.env.PUBLIC_SITE_DESCRIPTION?.trim() ?? '',
	footer: process.env.PUBLIC_SITE_FOOTER?.trim() ?? ''
};

const normalizeLocale = (value, fallback = 'en') => {
	const normalized = value?.trim().replaceAll('_', '-').toLowerCase() ?? '';

	return normalized === '' ? fallback : normalized;
};

const parseLocaleList = (value) => {
	const seen = new Set();

	return (value ?? '')
		.split(',')
		.map((locale) => normalizeLocale(locale, ''))
		.filter((locale) => {
			if (locale === '' || seen.has(locale)) {
				return false;
			}

			seen.add(locale);
			return true;
		});
};

const sourceLocale = normalizeLocale(process.env.PUBLIC_SOURCE_LOCALE, 'en');
const targetLocales = parseLocaleList(
	process.env.PUBLIC_TRANSLATION_LOCALES ?? process.env.PUBLIC_TRANSLATION_LOCALE ?? ''
).filter((locale) => locale !== sourceLocale);

const deeplLanguageCodes = {
	ar: 'AR',
	de: 'DE',
	en: 'EN-US',
	'en-us': 'EN-US',
	'en-gb': 'EN-GB',
	es: 'ES',
	fr: 'FR',
	it: 'IT',
	ja: 'JA',
	ko: 'KO',
	pt: 'PT-PT',
	'pt-br': 'PT-BR',
	zh: 'ZH-HANS',
	'zh-hans': 'ZH-HANS',
	'zh-hant': 'ZH-HANT'
};

const customInstructionTargetLanguageBases = new Set([
	'de',
	'en',
	'es',
	'fr',
	'it',
	'ja',
	'ko',
	'zh'
]);
const customInstructionSkipWarnings = new Set();

const supportsCustomInstructions = (targetLang) => {
	const base = normalizeLocale(targetLang, '').split('-')[0] ?? '';

	return customInstructionTargetLanguageBases.has(base);
};

const getEnvLanguageCode = (prefix, locale) => {
	const key = `${prefix}_${locale.replaceAll('-', '_').toUpperCase()}`;

	return process.env[key]?.trim() ?? '';
};

const getDeepLLanguageCode = (locale, prefix) => {
	const override = getEnvLanguageCode(prefix, locale);
	if (override !== '') {
		return override;
	}

	const normalized = normalizeLocale(locale, '');
	const base = normalized.split('-')[0] ?? normalized;

	if (prefix === 'DEEPL_SOURCE_LANG') {
		if (base === 'en') {
			return 'EN';
		}

		if (base === 'pt') {
			return 'PT';
		}

		if (base === 'zh') {
			return 'ZH';
		}
	}

	return deeplLanguageCodes[normalized] ?? deeplLanguageCodes[base] ?? normalized.toUpperCase();
};

const apiKey = process.env.DEEPL_API_KEY?.trim() ?? '';

const defaultApiUrl = (() => {
	if (process.env.DEEPL_API_URL?.trim()) {
		return process.env.DEEPL_API_URL.trim().replace(/\/+$/, '');
	}

	if (apiKey.endsWith(':fx')) {
		return 'https://api-free.deepl.com';
	}

	return 'https://api.deepl.com';
})();

const translateEndpoint = `${defaultApiUrl}/v2/translate`;
const translationChunkLimit = 20_000;
const translationSchemaVersion = 'markdown-xml-v3';
const siteTranslationSchemaVersion = 'site-copy-v1';
const plainTextCustomInstructions = [
	'Use natural grammar, punctuation, and capitalization for the target language.',
	'Preserve the authorial tone while making titles, descriptions, and paragraph openings read naturally.'
];
const structuredMarkdownInstructions = [
	...plainTextCustomInstructions,
	'Preserve the XML tag structure exactly and translate only the text content inside each tag.',
	'Keep Markdown semantics intact for headings, lists, paragraphs, and block quotes.',
	'Never translate or rewrite code blocks, inline code, commands, file paths, URLs, or placeholder tokens.'
];

const hashContent = (value) => createHash('sha256').update(value).digest('hex');

// Identity metadata must not trigger paid retranslation of otherwise unchanged copy.
const withoutPostId = (source) => source.replace(/^((?:\uFEFF)?---\r?\n)id:\s*[^\r\n]+\r?\n/, '$1');

const formatFrontmatterDate = (value) => {
	if (typeof value === 'string') {
		return value.trim();
	}

	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}

	return '';
};

const extractRawFrontmatterField = (source, fieldName) => {
	const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) {
		return null;
	}

	const pattern = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
	const fieldMatch = frontmatterMatch[1].match(pattern);
	if (!fieldMatch) {
		return null;
	}

	return fieldMatch[1].trim().replace(/^['"]|['"]$/g, '');
};

const toPosixPath = (value) => value.split(path.sep).join('/');

const parseTagString = (value) => {
	const trimmed = value.trim();

	if (trimmed === '') {
		return [];
	}

	if (trimmed.includes('#')) {
		return trimmed.split(/[\s,]+/).filter(Boolean);
	}

	return trimmed.split(',');
};

const normalizeTag = (value) => {
	if (typeof value !== 'string') {
		return null;
	}

	const tag = value.trim().replace(/^#+/, '').trim();

	return tag === '' ? null : tag;
};

const normalizeTags = (tags) => {
	const values = Array.isArray(tags)
		? tags.flatMap((tag) => (typeof tag === 'string' ? parseTagString(tag) : [tag]))
		: typeof tags === 'string'
			? parseTagString(tags)
			: [];
	const seen = new Set();

	return values.map(normalizeTag).filter((tag) => {
		if (!tag || seen.has(tag.toLowerCase())) {
			return false;
		}

		seen.add(tag.toLowerCase());
		return true;
	});
};

const escapeXml = (value) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

const unescapeXml = (value) =>
	value.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => {
		switch (entity) {
			case '&amp;':
				return '&';
			case '&lt;':
				return '<';
			case '&gt;':
				return '>';
			case '&quot;':
				return '"';
			case '&apos;':
				return "'";
			default:
				return entity;
		}
	});

const listMarkdownFiles = async (dir) => {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
			.map((entry) => path.join(dir, entry.name))
			.sort((left, right) => left.localeCompare(right));
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}
};

const inferTranslationState = async (targetFile) => {
	try {
		const raw = await readFile(targetFile, 'utf8');
		const { data } = matter(raw);
		return {
			exists: true,
			sourceHash: typeof data.sourceHash === 'string' ? data.sourceHash : null,
			locale: typeof data.locale === 'string' ? normalizeLocale(data.locale) : null,
			schemaVersion:
				typeof data.translationSchemaVersion === 'string' ? data.translationSchemaVersion : null
		};
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return {
				exists: false,
				sourceHash: null,
				locale: null,
				schemaVersion: null
			};
		}

		throw error;
	}
};

const inferSiteTranslationState = async (targetFile) => {
	try {
		const raw = await readFile(targetFile, 'utf8');
		const data = JSON.parse(raw);

		return {
			exists: true,
			sourceHash: typeof data.sourceHash === 'string' ? data.sourceHash : null,
			locale: typeof data.locale === 'string' ? normalizeLocale(data.locale) : null,
			schemaVersion:
				typeof data.translationSchemaVersion === 'string' ? data.translationSchemaVersion : null
		};
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return {
				exists: false,
				sourceHash: null,
				locale: null,
				schemaVersion: null
			};
		}

		throw error;
	}
};

const protectMarkdownInline = (content) => {
	let tokenIndex = 0;
	const replacements = [];

	const createToken = (value) => {
		const token = `ZXQPL_KEEP_${String(tokenIndex).padStart(4, '0')}_ZXQPL`;
		tokenIndex += 1;
		replacements.push([token, value]);
		return token;
	};

	let nextContent = content;

	nextContent = nextContent.replace(/`[^`\n]+`/g, (match) => createToken(match));
	nextContent = nextContent.replace(/<!--[\s\S]*?-->/g, (match) => createToken(match));
	nextContent = nextContent.replace(
		/(!?\[[^\]]*]\()([^)]+)(\))/g,
		(_, prefix, destination, suffix) => `${prefix}${createToken(destination)}${suffix}`
	);
	nextContent = nextContent.replace(/^\[[^\]]+]:\s+\S+.*$/gm, (match) => createToken(match));
	nextContent = nextContent.replace(/https?:\/\/[^\s)]+/g, (match) => createToken(match));

	return {
		text: nextContent,
		restore: (translated) =>
			replacements.reduce((current, [token, original]) => {
				if (!current.includes(token)) throw new Error('DeepL changed a protected Markdown token');
				return current.replaceAll(token, original);
			}, translated)
	};
};

const matchHeadingLine = (line) => line.match(/^(#{1,6})[ \t]+(.*)$/);
const matchUnorderedListLine = (line) => line.match(/^(\s*[-*+]\s+)(.*)$/);
const matchOrderedListLine = (line) => line.match(/^(\s*\d+[.)]\s+)(.*)$/);
const matchQuoteLine = (line) => line.match(/^(\s*>+\s?)(.*)$/);
const isHorizontalRule = (line) => /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);

const isStructuralMarkdownLine = (line) =>
	matchHeadingLine(line) ||
	matchUnorderedListLine(line) ||
	matchOrderedListLine(line) ||
	matchQuoteLine(line) ||
	isHorizontalRule(line) ||
	line.trimStart().startsWith('```') ||
	line.trimStart().startsWith('~~~');

// Unescaped pipes delimit cells; escaped pipes remain part of the cell text.
const splitTableRow = (line) => {
	const cells = [];
	let start = 0;
	let backslashes = 0;
	for (let index = 0; index < line.length; index += 1) {
		if (line[index] === '|' && backslashes % 2 === 0) {
			cells.push(protectMarkdownInline(line.slice(start, index)));
			start = index + 1;
		}
		backslashes = line[index] === '\\' ? backslashes + 1 : 0;
	}
	cells.push(protectMarkdownInline(line.slice(start)));
	return cells;
};

const parseMarkdownChunk = (content) => {
	const lines = content.split('\n');
	const blocks = [];
	let index = 0;

	const collectListBlock = (matcher, type) => {
		const items = [];

		while (index < lines.length) {
			const match = matcher(lines[index]);
			if (!match) {
				break;
			}

			const itemLines = [match[2]];
			index += 1;

			while (index < lines.length) {
				if (lines[index].trim() === '') {
					break;
				}

				if (
					isStructuralMarkdownLine(lines[index]) ||
					(lines[index].includes('|') && /^\s*\|?[\s:|-]+$/.test(lines[index + 1] ?? ''))
				) {
					break;
				}

				itemLines.push(lines[index].trimStart());
				index += 1;
			}

			const protectedItem = protectMarkdownInline(itemLines.join('\n'));
			items.push({
				prefix: match[1],
				text: protectedItem.text,
				restore: protectedItem.restore
			});

			if (lines[index]?.trim() === '') {
				break;
			}
		}

		blocks.push({ type, items });
	};

	while (index < lines.length) {
		const line = lines[index];

		if (line.trim() === '') {
			index += 1;
			continue;
		}

		// Parse table boundaries with the same GFM parser used by the renderer.
		if (line.includes('|') && /^\s*\|?[\s:|-]+$/.test(lines[index + 1] ?? '')) {
			const table = marked.lexer(lines.slice(index).join('\n'))[0];
			if (table?.type === 'table') {
				const rows = table.raw.trimEnd().split('\n');
				blocks.push({
					type: 'table',
					separator: rows[1],
					rows: [rows[0], ...rows.slice(2)].map(splitTableRow)
				});
				index += rows.length;
				continue;
			}
		}

		const headingMatch = matchHeadingLine(line);
		if (headingMatch) {
			const protectedHeading = protectMarkdownInline(headingMatch[2]);
			blocks.push({
				type: 'heading',
				prefix: `${headingMatch[1]} `,
				text: protectedHeading.text,
				restore: protectedHeading.restore
			});
			index += 1;
			continue;
		}

		if (matchUnorderedListLine(line)) {
			collectListBlock(matchUnorderedListLine, 'unordered-list');
			continue;
		}

		if (matchOrderedListLine(line)) {
			collectListBlock(matchOrderedListLine, 'ordered-list');
			continue;
		}

		const quoteMatch = matchQuoteLine(line);
		if (quoteMatch) {
			const quoteLines = [];

			while (index < lines.length) {
				const nextQuoteMatch = matchQuoteLine(lines[index]);
				if (!nextQuoteMatch) {
					break;
				}

				const protectedQuote = protectMarkdownInline(nextQuoteMatch[2]);
				quoteLines.push({
					prefix: nextQuoteMatch[1],
					text: protectedQuote.text,
					restore: protectedQuote.restore
				});
				index += 1;
			}

			blocks.push({ type: 'blockquote', lines: quoteLines });
			continue;
		}

		if (isHorizontalRule(line)) {
			blocks.push({ type: 'raw', raw: line });
			index += 1;
			continue;
		}

		const trimmed = line.trimStart();
		if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
			const codeLines = [line];
			const marker = trimmed[0];
			let fenceLength = 0;
			while (trimmed[fenceLength] === marker) {
				fenceLength += 1;
			}
			index += 1;

			while (index < lines.length) {
				codeLines.push(lines[index]);
				const nextTrimmed = lines[index].trimStart();
				let nextLength = 0;
				while (nextTrimmed[nextLength] === marker) {
					nextLength += 1;
				}

				index += 1;
				if (nextLength >= fenceLength) {
					break;
				}
			}

			blocks.push({
				type: 'code',
				raw: codeLines.join('\n')
			});
			continue;
		}

		const paragraphLines = [line];
		index += 1;

		while (index < lines.length) {
			if (lines[index].trim() === '') {
				break;
			}

			if (
				isStructuralMarkdownLine(lines[index]) ||
				(lines[index].includes('|') && /^\s*\|?[\s:|-]+$/.test(lines[index + 1] ?? ''))
			) {
				break;
			}

			paragraphLines.push(lines[index]);
			index += 1;
		}

		const protectedParagraph = protectMarkdownInline(paragraphLines.join('\n'));
		blocks.push({
			type: 'paragraph',
			text: protectedParagraph.text,
			restore: protectedParagraph.restore
		});
	}

	return blocks;
};

const consumeXmlTag = (source, tagName, startIndex = 0) => {
	const openPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'g');
	openPattern.lastIndex = startIndex;
	const openMatch = openPattern.exec(source);

	if (!openMatch) {
		throw new Error(`Expected <${tagName}> in translated XML payload`);
	}

	const contentStart = openMatch.index + openMatch[0].length;
	const closeTag = `</${tagName}>`;
	const closeIndex = source.indexOf(closeTag, contentStart);

	if (closeIndex === -1) {
		throw new Error(`Expected closing </${tagName}> in translated XML payload`);
	}

	return {
		inner: source.slice(contentStart, closeIndex),
		nextIndex: closeIndex + closeTag.length
	};
};

// Split only translatable text, never Markdown structures or protected inline tokens.
const splitTranslationText = (text) => {
	const parts = [];
	while (text.length > translationChunkLimit) {
		let end = translationChunkLimit;
		const whitespace = text.slice(0, end).search(/\s+\S*$/);
		if (whitespace > end / 2) end = whitespace;
		const tokenStart = text.lastIndexOf('ZXQPL_KEEP_', end - 1);
		const token =
			tokenStart < 0 ? null : text.slice(tokenStart).match(/^ZXQPL_KEEP_\d{4,10}_ZXQPL/);
		if (token && tokenStart + token[0].length > end) end = tokenStart;
		// Never cut a UTF-16 surrogate pair in half.
		if (/[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
		parts.push(text.slice(0, end));
		text = text.slice(end);
	}
	parts.push(text);
	return parts;
};

const createMarkdownTranslation = (content) => {
	const fragments = [];
	const renderField = (field) => {
		const parts = splitTranslationText(field.text).map((text) => {
			const leading = text.match(/^\s*/)[0];
			const trailing = text.trim() === '' ? '' : text.match(/\s*$/)[0];
			const fragment = { text: text.trim(), translated: '' };
			if (fragment.text !== '') fragments.push(fragment);
			return () => leading + fragment.translated + trailing;
		});
		return () => field.restore(parts.map((render) => render()).join(''));
	};
	const blocks = parseMarkdownChunk(content).map((block) => {
		if (block.type === 'code' || block.type === 'raw') return () => block.raw;
		if (block.type === 'heading' || block.type === 'paragraph') {
			const render = renderField(block);
			return () => (block.prefix ?? '') + render();
		}
		if (block.type === 'table') {
			const rows = block.rows.map((row) => row.map(renderField));
			return () => {
				const lines = rows.map((row) =>
					row.map((render) => render().replace(/\r?\n/g, ' ')).join('|')
				);
				lines.splice(1, 0, block.separator);
				return lines.join('\n');
			};
		}
		const items = (block.items ?? block.lines).map((item) => ({
			prefix: item.prefix,
			render: renderField(item)
		}));
		return () => items.map((item) => item.prefix + item.render()).join('\n');
	});
	// Keep related fragments together for context, with bounded XML document sizes.
	const chunks = [];
	let current = [];
	let bytes = 0;
	for (const fragment of fragments) {
		fragment.xml = `<p>${escapeXml(fragment.text)}</p>`;
		const nextBytes = Buffer.byteLength(fragment.xml, 'utf8');
		if (current.length > 0 && bytes + nextBytes > 64 * 1024) {
			chunks.push(current);
			current = [];
			bytes = 0;
		}
		current.push(fragment);
		bytes += nextBytes;
	}
	if (current.length > 0) chunks.push(current);
	return {
		texts: chunks.map((chunk) => `<doc>${chunk.map((fragment) => fragment.xml).join('')}</doc>`),
		restore: (translations) => {
			for (const [index, chunk] of chunks.entries()) {
				const doc = consumeXmlTag(translations[index], 'doc');
				let cursor = 0;
				for (const fragment of chunk) {
					const node = consumeXmlTag(doc.inner, 'p', cursor);
					const translated = unescapeXml(node.inner);
					if (translated.trim() === '')
						throw new Error('DeepL returned an empty Markdown fragment');
					fragment.translated = translated;
					cursor = node.nextIndex;
				}
			}
			return blocks.map((render) => render()).join('\n\n');
		}
	};
};

const translateTexts = async (texts, options = {}) => {
	if (texts.length === 0) {
		return [];
	}

	const {
		customInstructions = plainTextCustomInstructions,
		sourceLang,
		targetLang,
		...requestOptions
	} = options;
	const hasCustomInstructions = Array.isArray(customInstructions) && customInstructions.length > 0;
	const requestBody = {
		source_lang: sourceLang,
		target_lang: targetLang,
		preserve_formatting: true,
		model_type: 'quality_optimized',
		text: texts,
		...requestOptions
	};

	if (hasCustomInstructions && supportsCustomInstructions(targetLang)) {
		requestBody.custom_instructions = customInstructions;
	} else if (hasCustomInstructions && !customInstructionSkipWarnings.has(targetLang)) {
		customInstructionSkipWarnings.add(targetLang);
		console.log(
			`Skipping DeepL custom_instructions for ${targetLang}; this target language does not support them.`
		);
	}

	const maxRequestBytes = 128 * 1024;
	const batches = [];
	let batch = [];
	const bodyFor = (text) => JSON.stringify({ ...requestBody, text });
	for (const text of texts) {
		if (
			batch.length > 0 &&
			(batch.length === 50 || Buffer.byteLength(bodyFor([...batch, text])) > maxRequestBytes)
		) {
			batches.push(batch);
			batch = [];
		}
		if (Buffer.byteLength(bodyFor([text])) > maxRequestBytes) {
			throw new Error('A DeepL text exceeds the 128 KiB request limit');
		}
		batch.push(text);
	}
	if (batch.length > 0) batches.push(batch);

	const translated = [];
	for (const batch of batches) {
		const response = await fetch(translateEndpoint, {
			method: 'POST',
			headers: {
				Authorization: `DeepL-Auth-Key ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: bodyFor(batch)
		});
		if (!response.ok) {
			throw new Error(`DeepL request failed (${response.status}): ${await response.text()}`);
		}
		const payload = await response.json();
		if (
			!Array.isArray(payload.translations) ||
			payload.translations.length !== batch.length ||
			payload.translations.some(
				(entry) => typeof entry?.text !== 'string' || entry.text.trim() === ''
			)
		) {
			throw new Error('DeepL returned incomplete or invalid translations');
		}
		translated.push(...payload.translations.map((entry) => entry.text));
	}
	return translated;
};

const translatePost = async (sourceFile, sourceRaw, sourceHash, targetLocale, languageCodes) => {
	const { data, content } = matter(sourceRaw);
	const id = typeof data.id === 'string' ? data.id.trim() : '';
	const title = typeof data.title === 'string' ? data.title.trim() : '';
	const description = typeof data.description === 'string' ? data.description.trim() : '';
	const date = extractRawFrontmatterField(sourceRaw, 'date') ?? formatFrontmatterDate(data.date);

	if (id === '' || title === '' || description === '' || date === '') {
		throw new Error(
			`Missing required frontmatter in ${toPosixPath(path.relative(projectRoot, sourceFile))}`
		);
	}

	const markdown = createMarkdownTranslation(content);
	const [translatedMeta, translatedBodyChunks] = await Promise.all([
		translateTexts([title, description], languageCodes),
		translateTexts(markdown.texts, {
			...languageCodes,
			customInstructions: structuredMarkdownInstructions,
			tag_handling: 'xml',
			tag_handling_version: 'v2',
			outline_detection: false,
			splitting_tags: ['h', 'p', 'li', 'line'],
			ignore_tags: ['codeblock', 'rawblock']
		})
	]);

	const translatedBody = markdown.restore(translatedBodyChunks);

	const nextData = {
		...(data.access === 'membership'
			? {
					access: 'membership',
					membershipId: data.membershipId,
					previewAllowed: data.previewAllowed
				}
			: {}),
		id,
		title: translatedMeta[0],
		description: translatedMeta[1],
		date,
		published: data.published !== false,
		...(typeof data.tts === 'boolean' ? { tts: data.tts } : {}),
		...(typeof data.ttsVoice === 'string' ? { ttsVoice: data.ttsVoice } : {}),
		category:
			typeof data.category === 'string' && data.category.trim() !== '' ? data.category : 'Notes',
		tags: normalizeTags(data.tags),
		locale: targetLocale,
		sourcePath: toPosixPath(path.relative(projectRoot, sourceFile)),
		sourceHash,
		sourceLocale,
		translationSchemaVersion,
		translationSource: 'deepl',
		translatedAt: new Date().toISOString()
	};

	if (typeof data.cover === 'string' && data.cover.trim() !== '') {
		nextData.cover = data.cover;
	}

	const updated =
		extractRawFrontmatterField(sourceRaw, 'updated') ?? formatFrontmatterDate(data.updated);
	if (updated !== '') {
		nextData.updated = updated;
	}

	return matter.stringify(translatedBody, nextData);
};

const translateSiteCopy = async (targetLocale, targetLang, sourceHash) => {
	const fields = ['tagline', 'description', 'footer'].filter(
		(field) => sourceSiteCopy[field] !== ''
	);
	const translatedValues = await translateTexts(
		fields.map((field) => sourceSiteCopy[field]),
		{ targetLang }
	);

	if (translatedValues.length !== fields.length) {
		throw new Error(`DeepL returned incomplete site copy for ${targetLocale}`);
	}

	const translatedCopy = {
		tagline: '',
		description: '',
		footer: '',
		...Object.fromEntries(fields.map((field, index) => [field, translatedValues[index]]))
	};

	return `${JSON.stringify(
		{
			...translatedCopy,
			locale: targetLocale,
			sourceHash,
			sourceLocale,
			translationSchemaVersion: siteTranslationSchemaVersion,
			translationSource: 'deepl',
			translatedAt: new Date().toISOString()
		},
		null,
		2
	)}\n`;
};

const sourceFiles = await listMarkdownFiles(sourceDir);
const sourceByName = new Map(sourceFiles.map((file) => [path.basename(file), file]));

if (targetLocales.length > 0 || apiKey) {
	await translateTaxonomy(projectRoot, sourceLocale, targetLocales, (texts, locale) => {
		if (!apiKey)
			throw new Error(
				'DEEPL_API_KEY is required for missing taxonomy labels. Run taxonomy:sync and fill labels manually, or configure the key.'
			);
		return translateTexts(texts, {
			targetLang: getDeepLLanguageCode(locale, 'DEEPL_TARGET_LANG'),
			context: `Blog taxonomy. ${sourceSiteCopy.description} Preserve proper names and distinguish related but different concepts.`
		});
	});
} else {
	await saveTaxonomy(projectRoot, await collectTaxonomy(projectRoot, sourceLocale));
}

if (targetLocales.length === 0) {
	console.log('No translation locales configured. Skipping DeepL sync.');
	process.exit(0);
}

const sourceLang = getDeepLLanguageCode(sourceLocale, 'DEEPL_SOURCE_LANG');
const sourceSiteHash = hashContent(JSON.stringify(sourceSiteCopy));
const pendingPosts = [];
const pendingSiteCopies = [];
let removedCount = 0;
let skippedCount = 0;
let skippedSiteCount = 0;

for (const targetLocale of targetLocales) {
	const targetDir = path.join(projectRoot, 'content/translations', targetLocale, 'posts');
	await mkdir(targetDir, { recursive: true });
	const siteTargetFile = path.join(projectRoot, 'content/translations', targetLocale, 'site.json');
	const siteTargetState = await inferSiteTranslationState(siteTargetFile);
	const isSiteTranslationCurrent =
		siteTargetState.sourceHash === sourceSiteHash &&
		siteTargetState.locale === targetLocale &&
		(apiKey === '' || siteTargetState.schemaVersion === siteTranslationSchemaVersion);

	if (isSiteTranslationCurrent) {
		skippedSiteCount += 1;
	} else {
		pendingSiteCopies.push({
			targetFile: siteTargetFile,
			targetLocale,
			targetLang: getDeepLLanguageCode(targetLocale, 'DEEPL_TARGET_LANG'),
			needsUpdate: siteTargetState.exists
		});
	}

	const targetFiles = await listMarkdownFiles(targetDir);
	for (const targetFile of targetFiles) {
		if (sourceByName.has(path.basename(targetFile))) {
			continue;
		}

		await rm(targetFile);
		removedCount += 1;
		console.log(
			`Removed orphan translation: ${toPosixPath(path.relative(projectRoot, targetFile))}`
		);
	}

	for (const sourceFile of sourceFiles) {
		const sourceRaw = await readFile(sourceFile, 'utf8');
		const sourceHash = hashContent(withoutPostId(sourceRaw));
		const targetFile = path.join(targetDir, path.basename(sourceFile));
		const targetState = await inferTranslationState(targetFile);
		const isTranslationCurrent =
			targetState.sourceHash === sourceHash &&
			targetState.locale === targetLocale &&
			(apiKey === '' || targetState.schemaVersion === translationSchemaVersion);

		if (isTranslationCurrent) {
			skippedCount += 1;
			continue;
		}

		pendingPosts.push({
			sourceFile,
			sourceRaw,
			sourceHash,
			targetFile,
			targetLocale,
			languageCodes: {
				sourceLang,
				targetLang: getDeepLLanguageCode(targetLocale, 'DEEPL_TARGET_LANG')
			},
			needsUpdate: targetState.exists
		});
	}
}

if (
	(pendingPosts.length > 0 ||
		(pendingSiteCopies.length > 0 && Object.values(sourceSiteCopy).some(Boolean))) &&
	apiKey === ''
) {
	throw new Error(
		`DEEPL_API_KEY is missing. Add the repository secret before deploying new or changed ${sourceLocale} content.`
	);
}

let translatedSiteCount = 0;
for (const job of pendingSiteCopies) {
	const translatedSiteCopy = await translateSiteCopy(
		job.targetLocale,
		job.targetLang,
		sourceSiteHash
	);
	await writeFile(job.targetFile, translatedSiteCopy, 'utf8');
	translatedSiteCount += 1;
	console.log(
		`${job.needsUpdate ? 'Updated' : 'Created'} ${job.targetLocale} site copy: ${toPosixPath(
			path.relative(projectRoot, job.targetFile)
		)}`
	);
}

let translatedCount = 0;
for (const job of pendingPosts) {
	const translatedPost = await translatePost(
		job.sourceFile,
		job.sourceRaw,
		job.sourceHash,
		job.targetLocale,
		job.languageCodes
	);
	await writeFile(job.targetFile, translatedPost, 'utf8');
	translatedCount += 1;
	console.log(
		`${job.needsUpdate ? 'Updated' : 'Created'} ${job.targetLocale} translation: ${toPosixPath(
			path.relative(projectRoot, job.targetFile)
		)}`
	);
}

console.log(
	`DeepL sync complete. locales=${targetLocales.join(',')} site_created_or_updated=${translatedSiteCount} site_skipped=${skippedSiteCount} posts_created_or_updated=${translatedCount} posts_skipped=${skippedCount} posts_removed=${removedCount}`
);
