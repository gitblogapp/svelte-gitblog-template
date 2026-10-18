import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { getConfiguredLocales, sourceLocale, type Locale } from '$lib/locales';
import { getSiteConfig } from '$lib/site';
import { toPostPath } from '$lib/routes';
import { toAbsoluteUrl, toPostSeoLinks } from '$lib/seo';
import { aiPolicy } from '$lib/template/ai-policy';
import { getAllPosts, getPost, getPostLocales, getPublishedMarkdown } from './content';

export const discoveryPolicy = () => aiPolicy(env);
export const markdownPath = (locale: Locale, slug: string) => `${toPostPath(locale, slug)}index.md`;

export function markdownResponse(locale: Locale, slug: string) {
	const post = getPost(slug, locale);
	const body = getPublishedMarkdown(slug, locale);
	if (!discoveryPolicy().markdown || !post || body === undefined) error(404, 'Not found');
	const site = getSiteConfig(locale);
	const canonical = toAbsoluteUrl(site, toPostPath(locale, slug));
	// JSON-quoted values are valid YAML scalars. Only explicitly public fields are exported.
	const metadata = {
		title: post.title,
		description: post.description,
		author: site.author,
		date: post.date,
		updated: post.updated ?? post.date,
		language: site.language,
		site_url: site.url,
		url: canonical
	};
	return new Response(
		`---\n${Object.entries(metadata)
			.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
			.join('\n')}\n---\n\n${body.trim()}\n`,
		{
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				Link: `<${canonical}>; rel="canonical"`
			}
		}
	);
}

export function discoveryManifest() {
	const site = getSiteConfig(sourceLocale);
	const policy = discoveryPolicy();
	return {
		schemaVersion: 1,
		buildCommit: privateEnv.GITBLOG_BUILD_COMMIT || null,
		siteUrl: site.url.replace(/\/+$/, ''),
		policy,
		pages: getConfiguredLocales().flatMap((locale) =>
			getAllPosts(locale).map((post) => ({
				...toPostSeoLinks(site, locale, post.slug, getPostLocales(post.slug)),
				title: post.title,
				locale,
				markdownUrl: policy.markdown ? toAbsoluteUrl(site, markdownPath(locale, post.slug)) : null
			}))
		)
	};
}

const inline = (text: string) =>
	text.replace(/[\r\n]+/g, ' ').replace(/[\\[\]<>]/g, (char) => `\\${char}`);

export function llmsText() {
	const site = getSiteConfig(sourceLocale);
	const policy = discoveryPolicy();
	if (!policy.llms) return '# Discovery index disabled\n';
	const lines = [
		`# ${inline(site.title)}`,
		'',
		`> ${inline(site.description)}`,
		'',
		`Website: ${site.url}`,
		'',
		'This index lists published articles. HTML URLs identify the original articles; Markdown is an optional equivalent representation.',
		'Crawling preferences are expressed in the host-root robots.txt. This file is not a permission or ranking standard.',
		'',
		`- [Sitemap](<${toAbsoluteUrl(site, '/sitemap.xml')}>)`,
		''
	];
	for (const locale of getConfiguredLocales()) {
		const posts = getAllPosts(locale);
		if (!posts.length) continue;
		lines.push(`## ${locale}`, '');
		for (const post of posts) {
			lines.push(
				`- [${inline(post.title)}](<${toAbsoluteUrl(site, toPostPath(locale, post.slug))}>): ${inline(post.description)}`
			);
			if (policy.markdown)
				lines.push(`  - [Markdown](<${toAbsoluteUrl(site, markdownPath(locale, post.slug))}>)`);
		}
		lines.push('');
	}
	return lines.join('\n');
}
