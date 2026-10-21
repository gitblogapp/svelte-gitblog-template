import { getConfiguredLocales } from '$lib/locales';
import { speechLocale } from '$lib/tts-locale';
import { getFeedPosts, getPublishedMarkdown } from './content';
import { createRssResponse } from './rss';
import { createSpokenText } from './body-excerpt';
import { audioEntry, rawAudio, ttsHash } from './tts';
const decode = (s: string) =>
	s.replace(
		/&(amp|lt|gt|quot|apos);/g,
		(_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]!
	);
export async function speechManifest(includeInput = false) {
	const entries = [];
	for (const locale of getConfiguredLocales()) {
		const xml = await createRssResponse(locale).text();
		const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((x) => x[1]);
		for (const post of getFeedPosts(locale)) {
			const item =
				items.find(
					(x) => decode(x.match(/<hub:postId>([\s\S]*?)<\/hub:postId>/)?.[1] || '') === post.id
				) || '';
			const preview =
				decode(item.match(/<hub:bodyExcerpt>([\s\S]*?)<\/hub:bodyExcerpt>/)?.[1] || '')
					.replace(/\r\n?/g, '\n')
					.replace(/[\t ]+/g, ' ')
					.replace(/\n{3,}/g, '\n\n')
					.trim() || post.excerpt.replace(/\s+/g, ' ').trim();
			const text = Array.from(preview).slice(0, 1200).join('');
			const fullText = createSpokenText(getPublishedMarkdown(post.slug, locale) || '');
			const enabled = post.ttsEnabled && speechLocale(locale) !== null;
			const audio = enabled ? audioEntry(post.id, locale, post.ttsVoice, fullText) : undefined;
			const hash = ttsHash(text);
			entries.push({
				postId: post.id,
				locale,
				enabled,
				voice: post.ttsVoice,
				textHash: hash,
				previewUrl: audio?.textHash === hash ? rawAudio(audio.previewPath) : null,
				fullUrl: audio ? rawAudio(audio.fullPath) : null,
				...(includeInput ? { text, fullText, fullHash: ttsHash(fullText) } : {})
			});
		}
	}
	return { version: 1, posts: entries };
}
