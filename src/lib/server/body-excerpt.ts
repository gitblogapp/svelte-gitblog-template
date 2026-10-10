import { marked, type Token, type Tokens } from 'marked';

const MAX_CHARACTERS = 1200;
const TARGET_CHARACTERS = 800;
type ExcerptBlock = { text: string; heading: boolean };

function decodeEntities(text: string): string {
	const named: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: ' '
	};
	return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name: string) => {
		if (!name.startsWith('#')) return named[name.toLowerCase()] ?? entity;
		const code =
			name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
		return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
			? String.fromCodePoint(code)
			: '';
	});
}

function inline(tokens: Token[]): string {
	return tokens
		.map((token) => {
			if (token.type === 'html' || token.type === 'image') return '';
			if (token.type === 'br') return ' ';
			if ('tokens' in token && token.tokens) return inline(token.tokens as Token[]);
			// Code spans contain literal text, including entity-like examples.
			if (token.type === 'codespan') return token.text;
			return 'text' in token ? decodeEntities(String(token.text)) : '';
		})
		.join('');
}

function paragraphs(tokens: Token[]): ExcerptBlock[] {
	return tokens.flatMap((token) => {
		if (token.type === 'paragraph' || token.type === 'text' || token.type === 'heading') {
			// The card already displays the article title; retain section headings only.
			if (token.type === 'heading' && (token as Tokens.Heading).depth === 1) return [];
			const text = inline('tokens' in token && token.tokens ? (token.tokens as Token[]) : [token]);
			return text.trim()
				? [{ text: text.replace(/\s+/g, ' ').trim(), heading: token.type === 'heading' }]
				: [];
		}
		if (token.type === 'blockquote') return paragraphs((token as Tokens.Blockquote).tokens);
		if (token.type === 'list')
			return (token as Tokens.List).items.flatMap((item) => paragraphs(item.tokens));
		// Fenced code, tables, images and raw HTML are not prose excerpts.
		return [];
	});
}

export function createBodyExcerpt(markdown: string): string {
	const blocks = paragraphs(marked.lexer(markdown));
	let text = '';
	let headings: string[] = [];
	for (const block of blocks) {
		if (block.heading) {
			headings.push(block.text);
			continue;
		}
		const separator = text ? '\n\n' : '';
		let context = headings.length ? headings.join('\n\n') + '\n\n' : '';
		headings = [];
		// Do not let an unusually long heading displace all of the following prose.
		if (Array.from(text + separator + context).length > MAX_CHARACTERS - 80) context = '';
		const prefix = text + separator + context;
		const candidate = prefix + block.text;
		if (Array.from(candidate).length > MAX_CHARACTERS) {
			const available = MAX_CHARACTERS - Array.from(prefix).length - 1;
			const cut = Array.from(block.text).slice(0, available).join('');
			const boundary = [...cut.matchAll(/[.!?。！？](?=\s|$)/g)].at(-1)?.index;
			const sentence = boundary === undefined ? '' : cut.slice(0, boundary + 1);
			return (
				prefix +
				(sentence && Array.from(prefix + sentence).length >= TARGET_CHARACTERS
					? sentence
					: cut.trimEnd()) +
				'…'
			);
		}
		text = candidate;
		if (Array.from(text).length >= TARGET_CHARACTERS) break;
	}
	// Pending headings have no prose and are intentionally not emitted.
	return text;
}

const escapeXml = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

// Each item receives a byte budget from the whole feed. Never drop old posts to
// make space: absent items are treated as removed by the hub.
export function bodyExcerptXml(text: string, budget: number): string {
	if (!text) return '';
	const field = (value: string) => `\n\t\t<hub:bodyExcerpt>${escapeXml(value)}</hub:bodyExcerpt>`;
	const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
	if (bytes(field(text)) <= budget) return field(text);
	const chars = Array.from(text);
	let low = 0,
		high = chars.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (bytes(field(chars.slice(0, mid).join('').trimEnd() + '…')) <= budget) low = mid;
		else high = mid - 1;
	}
	return low >= 40 ? field(chars.slice(0, low).join('').trimEnd() + '…') : '';
}
