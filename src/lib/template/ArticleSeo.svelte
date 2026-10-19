<script lang="ts">
	import SeoLinks from '$lib/components/SeoLinks.svelte';
	import { toAbsoluteUrl, toJsonLdScript, toPostSeoLinks } from '$lib/seo';
	import type { ArticlePageProps } from './contracts';
	import { env } from '$env/dynamic/public';
	import { publicFlag } from './ai-policy';
	let { locale, site, post, availableLocales }: ArticlePageProps = $props();
	const seo = $derived(toPostSeoLinks(site, locale, post.slug, availableLocales));
	const canonicalUrl = $derived(seo.canonicalUrl);
	const modifiedDate = $derived(post.updated ?? post.date);
	const coverUrl = $derived(post.cover ? toAbsoluteUrl(site, post.cover) : null);
	const jsonLd = $derived(
		toJsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'BlogPosting',
			headline: post.title,
			description: post.description,
			image: coverUrl ? [coverUrl] : undefined,
			datePublished: post.date,
			dateModified: modifiedDate,
			articleSection: post.category,
			keywords: post.tags,
			inLanguage: site.language,
			url: canonicalUrl,
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': canonicalUrl
			},
			author: {
				'@type': 'Person',
				name: site.author
			},
			publisher: {
				'@type': 'Person',
				name: site.author
			}
		})
	);
</script>

<svelte:head>
	{#if publicFlag(env.PUBLIC_AI_MARKDOWN_ENABLED)}
		<link rel="alternate" type="text/markdown" href={`${canonicalUrl}index.md`} />
	{/if}
	<title>{post.title} | {site.title}</title>
	<meta name="description" content={post.description} />
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content={site.title} />
	<meta property="og:title" content={post.title} />
	<meta property="og:description" content={post.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="article:published_time" content={post.date} />
	<meta property="article:modified_time" content={modifiedDate} />
	<meta property="article:author" content={site.author} />
	<meta property="article:section" content={post.category} />
	{#each post.tags as tag (tag)}
		<meta property="article:tag" content={tag} />
	{/each}
	{#if coverUrl}
		<meta property="og:image" content={coverUrl} />
	{/if}
	<meta name="twitter:card" content={coverUrl ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={post.title} />
	<meta name="twitter:description" content={post.description} />
	{#if coverUrl}
		<meta name="twitter:image" content={coverUrl} />
	{/if}
	<meta data-pagefind-filter={`Category:${post.category}`} />
	<meta data-pagefind-filter={`Locale:${locale}`} />
	{#each post.tags as tag (tag)}
		<meta data-pagefind-filter={`Tag:${tag}`} />
	{/each}
	<meta data-pagefind-meta={`Category:${post.category}`} />
	<meta data-pagefind-meta={`Locale:${locale}`} />
	{#if post.tags.length > 0}
		<meta data-pagefind-meta={`Tags:${post.tags.join(', ')}`} />
	{/if}
	<meta data-pagefind-meta={`Published:${post.formattedDate}`} />
	<meta data-pagefind-sort={`date:${post.date}`} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLd}
</svelte:head>

<SeoLinks {...seo} />

{#if post.taxonomy}
	<span hidden data-pagefind-body data-pagefind-weight="0.2"
		>{[
			...new Set([post.taxonomy.category, ...post.taxonomy.tags].flatMap((row) => row.aliases))
		].join(' ')}</span
	>
{/if}
