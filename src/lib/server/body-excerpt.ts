import { marked, type Token, type Tokens } from 'marked';

const MAX_CHARACTERS = 1200;

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

function paragraphs(tokens: Token[]): string[] {
	return tokens.flatMap((token) => {
		if (token.type === 'paragraph' || token.type === 'text') {
			const text = inline('tokens' in token && token.tokens ? (token.tokens as Token[]) : [token]);
			return text.trim() ? [text.replace(/\s+/g, ' ').trim()] : [];
		}
		if (token.type === 'blockquote') return paragraphs((token as Tokens.Blockquote).tokens);
		if (token.type === 'list')
			return (token as Tokens.List).items.flatMap((item) => paragraphs(item.tokens));
		// Headings, fenced code, tables, images and raw HTML are not prose excerpts.
		return [];
	});
}

export function createBodyExcerpt(markdown: string): string {
	const blocks = paragraphs(marked.lexer(markdown));
	const text = blocks.slice(0, 3).join('\n\n');
	const chars = Array.from(text);
	if (chars.length <= MAX_CHARACTERS) return text;
	const cut = chars.slice(0, MAX_CHARACTERS - 1).join('');
	const sentences = [...cut.matchAll(/[.!?。！？](?=\s|$)/g)];
	const boundary = sentences.at(-1)?.index;
	return (
		(boundary !== undefined && boundary > cut.length * 0.6
			? cut.slice(0, boundary + 1)
			: cut.trimEnd()) + '…'
	);
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
