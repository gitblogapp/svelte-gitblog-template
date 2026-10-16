import type { SiteConfig } from '$lib/site';
import { toPostPath } from '$lib/routes';
import { getHreflang, sourceLocale, type Locale } from '$lib/locales';

type SiteUrlConfig = Pick<SiteConfig, 'url'>;

export type AlternateLink = {
	hreflang: string;
	href: string;
};

const normalizeSiteUrl = (value: string) => value.replace(/\/+$/, '');

const toRelativePath = (pathname: string) => {
	if (pathname === '/' || pathname.trim() === '') {
		return '';
	}

	return pathname.replace(/^\/+/, '');
};

export const toAbsoluteUrl = (site: SiteUrlConfig, pathname: string) =>
	new URL(toRelativePath(pathname), `${normalizeSiteUrl(site.url)}/`).toString();

export const toAlternateLinks = (
	site: SiteUrlConfig,
	locales: Locale[],
	toPath: (locale: Locale) => string
): AlternateLink[] =>
	locales.map((locale) => ({
		hreflang: getHreflang(locale),
		href: toAbsoluteUrl(site, toPath(locale))
	}));

export const toXDefaultUrl = (site: SiteUrlConfig, toPath: (locale: Locale) => string) =>
	toAbsoluteUrl(site, toPath(sourceLocale));

const stringifyJsonLd = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');

export const toJsonLdScript = (value: unknown) =>
	`<script type="application/ld+json">${stringifyJsonLd(value)}</script>`;

// HTML and XML must advertise exactly the same published translation cluster.
export const toPostSeoLinks = (
	site: SiteUrlConfig,
	locale: Locale,
	slug: string,
	availableLocales: Locale[]
) => ({
	canonicalUrl: toAbsoluteUrl(site, toPostPath(locale, slug)),
	alternateLinks: toAlternateLinks(site, availableLocales, (alternateLocale) =>
		toPostPath(alternateLocale, slug)
	),
	xDefaultUrl: availableLocales.includes(sourceLocale)
		? toXDefaultUrl(site, (postLocale) => toPostPath(postLocale, slug))
		: null
});
