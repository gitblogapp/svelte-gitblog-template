import { env } from '$env/dynamic/public';
import { createHash } from 'node:crypto';
import { speechLocale } from '$lib/tts-locale';
const files = import.meta.glob('/content/audio/manifest.json', { eager: true, import: 'default' });
type AudioEntry = {
	postId: string;
	locale: string;
	textHash: string;
	fullHash: string;
	voice: string;
	previewPath: string;
	fullPath: string;
	version: string;
};
const manifest = Object.values(files)[0] as { posts?: AudioEntry[] } | undefined;
export const ttsVoice = (value: unknown) =>
	typeof value === 'string' && /^[FM][1-5]$/.test(value)
		? value
		: /^[FM][1-5]$/.test(env.PUBLIC_TTS_VOICE || '')
			? env.PUBLIC_TTS_VOICE || 'F1'
			: 'F1';
export const ttsEnabled = (value: unknown) =>
	typeof value === 'boolean' ? value : env.PUBLIC_TTS_ENABLED === 'true';
export const ttsHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function audioEntry(id: string, locale: string, voice: string, fullText: string) {
	if (!speechLocale(locale)) return undefined;
	return manifest?.posts?.find(
		(x) =>
			x.postId === id &&
			x.locale === locale &&
			x.voice === voice &&
			x.fullHash === ttsHash(fullText) &&
			x.version === 'supertonic3-v1'
	);
}
export function rawAudio(path: string) {
	const repo = process.env.GITHUB_REPOSITORY || env.PUBLIC_SITE_REPOSITORY;
	if (
		!repo ||
		!/^[-\w.]+\/[-\w.]+$/.test(repo) ||
		!/^content\/audio\/[a-f0-9]{64}\.mp3$/.test(path)
	)
		return null;
	// Templates deploy from main. Hash-addressed files never change in place.
	return `https://raw.githubusercontent.com/${repo}/main/${path}`;
}
