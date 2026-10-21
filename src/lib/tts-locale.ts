import languages from '../../scripts/tts/languages.json';

/** Use the translated page's language, never fall back to the source language. */
export function speechLocale(locale: string) {
	const language = locale.trim().replaceAll('_', '-').toLowerCase().split('-')[0];
	return languages.includes(language) ? language : null;
}
