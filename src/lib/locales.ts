import { env as publicEnv } from '$env/dynamic/public';

export type Locale = string;

type LocaleMetadata = {
	label: string;
};

const localeMetadata: Record<string, LocaleMetadata> = {
	ar: {
		label: 'AR'
	},
	de: {
		label: 'DE'
	},
	en: {
		label: 'EN'
	},
	es: {
		label: 'ES'
	},
	fr: {
		label: 'FR'
	},
	it: {
		label: 'IT'
	},
	ja: {
		label: 'JA'
	},
	ko: {
		label: 'KO'
	},
	pt: {
		label: 'PT'
	},
	'pt-br': {
		label: 'PT-BR'
	},
	zh: {
		label: 'ZH'
	},
	'zh-hans': {
		label: 'ZH'
	},
	'zh-hant': {
		label: 'ZH-TW'
	}
};

export const normalizeLocale = (value: string | undefined, fallback = 'ko'): Locale => {
	const normalized = value?.trim().replaceAll('_', '-').toLowerCase() ?? '';

	return normalized === '' ? fallback : normalized;
};

const parseLocaleList = (value: string | undefined): Locale[] => {
	const seen = new Set<Locale>();

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

export const sourceLocale = normalizeLocale(publicEnv.PUBLIC_SOURCE_LOCALE, 'en');

const translationLocales = parseLocaleList(
	publicEnv.PUBLIC_TRANSLATION_LOCALES ?? publicEnv.PUBLIC_TRANSLATION_LOCALE ?? ''
).filter((locale) => locale !== sourceLocale);

const configuredLocales = [sourceLocale, ...translationLocales];

export const getConfiguredLocales = (): Locale[] => configuredLocales;

export const getTranslationLocales = (): Locale[] => translationLocales;

export const isTranslationLocale = (locale: string | undefined): locale is Locale =>
	locale !== undefined && translationLocales.includes(normalizeLocale(locale));

const getLocaleMetadata = (locale: Locale): LocaleMetadata => {
	const normalized = normalizeLocale(locale);
	const base = normalized.split('-')[0] ?? normalized;

	return (
		localeMetadata[normalized] ??
		localeMetadata[base] ?? {
			label: normalized.toUpperCase()
		}
	);
};

// Preserve configured language, region, and script instead of inventing a country target.
export const getLanguageTag = (locale: Locale): string =>
	Intl.getCanonicalLocales(normalizeLocale(locale))[0];

export const getLocaleLabel = (locale: Locale): string => getLocaleMetadata(locale).label;

export const getHreflang = getLanguageTag;
