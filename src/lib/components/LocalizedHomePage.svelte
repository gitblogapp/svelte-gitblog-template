<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import type { TaxonReference } from '../../../scripts/lib/taxonomy-core.ts';
	import { normalizeTerm } from '../../../scripts/lib/taxonomy-core.ts';
	import HomeView from '$lib/theme/HomeView.svelte';
	import SeoLinks from '$lib/components/SeoLinks.svelte';
	import { type Locale, type UiCopy } from '$lib/i18n';
	import { getConfiguredLocales } from '$lib/locales';
	import { toHomePath, toPostPath } from '$lib/routes';
	import { toAbsoluteUrl, toAlternateLinks, toJsonLdScript, toXDefaultUrl } from '$lib/seo';
	import type { SiteConfig } from '$lib/site';
	import type { PostSummary } from '$lib/server/content';

	interface Props {
		locale: Locale;
		site: SiteConfig;
		ui: UiCopy;
		posts: PostSummary[];
	}

	let { locale, site, ui, posts }: Props = $props();

	const reference = (label: string): TaxonReference => ({
		id: label,
		label,
		aliases: [normalizeTerm(label)]
	});
	const categoryRef = (post: PostSummary) => post.taxonomy?.category ?? reference(post.category);
	const tagRefs = (post: PostSummary) => post.taxonomy?.tags ?? post.tags.map(reference);
	const choices = (refs: TaxonReference[]) => {
		const unique = [...new Map(refs.map((ref) => [ref.id, ref])).values()];
		return unique.map((ref) => ({
			...ref,
			choice: unique.some((other) => other.id !== ref.id && other.label === ref.label)
				? `${ref.label} · ${ref.aliases[0] ?? ref.id}`
				: ref.label
		}));
	};
	const categoryOptions = $derived(choices(posts.map(categoryRef)));
	const tagOptions = $derived(choices(posts.flatMap(tagRefs)));
	const match = (ref: TaxonReference, value: string | null) =>
		value != null && (ref.id === value || ref.aliases.includes(normalizeTerm(value)));
	const activeCategoryId = $derived(browser ? page.url.searchParams.get('category') : null);
	const activeTagId = $derived(browser ? page.url.searchParams.get('tag') : null);
	const selectedCategory = $derived(
		categoryOptions.find((ref) => match(ref, activeCategoryId))?.choice ?? ui.home.allCategory
	);
	const activeTag = $derived(tagOptions.find((ref) => match(ref, activeTagId))?.choice ?? null);
	const setFilter = (kind: 'tag' | 'category', id: string | null) => {
		const url = new URL(page.url);
		if (id) url.searchParams.set(kind, id);
		else url.searchParams.delete(kind);
		// The current pathname already contains the configured Pages base.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	};
	const canonicalPath = $derived(toHomePath(locale));
	const canonicalUrl = $derived(toAbsoluteUrl(site, canonicalPath));
	const alternateLinks = $derived(
		toAlternateLinks(site, getConfiguredLocales(), (alternateLocale) => toHomePath(alternateLocale))
	);
	const xDefaultUrl = $derived(toXDefaultUrl(site, toHomePath));

	const categories = $derived([
		ui.home.allCategory,
		...categoryOptions.map((ref) => ref.choice).sort()
	]);
	const tags = $derived(tagOptions.map((ref) => ref.choice).sort());
	const filteredPosts = $derived(
		posts.filter(
			(post) =>
				(!activeCategoryId || match(categoryRef(post), activeCategoryId)) &&
				(!activeTagId || tagRefs(post).some((ref) => match(ref, activeTagId)))
		)
	);

	const jsonLd = $derived(
		toJsonLdScript({
			'@context': 'https://schema.org',
			'@type': 'Blog',
			name: site.title,
			description: site.description,
			url: canonicalUrl,
			inLanguage: site.language,
			publisher: {
				'@type': 'Person',
				name: site.author
			},
			blogPost: posts.slice(0, 10).map((post) => ({
				'@type': 'BlogPosting',
				headline: post.title,
				description: post.description,
				datePublished: post.date,
				url: toAbsoluteUrl(site, toPostPath(locale, post.slug))
			}))
		})
	);
</script>

<svelte:head>
	<title>{site.title}</title>
	<meta name="description" content={site.description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={site.title} />
	<meta property="og:title" content={site.title} />
	<meta property="og:description" content={site.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={site.title} />
	<meta name="twitter:description" content={site.description} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLd}
</svelte:head>

<SeoLinks {canonicalUrl} {alternateLinks} {xDefaultUrl} />

<HomeView
	{locale}
	{ui}
	{categories}
	{tags}
	{selectedCategory}
	{activeTag}
	{filteredPosts}
	onCategorySelect={(category) => {
		setFilter('category', categoryOptions.find((ref) => ref.choice === category)?.id ?? null);
	}}
	onTagToggle={(tag) => {
		setFilter(
			'tag',
			activeTag === tag ? null : (tagOptions.find((ref) => ref.choice === tag)?.id ?? null)
		);
	}}
	onReset={() => {
		const url = new URL(page.url);
		url.searchParams.delete('tag');
		url.searchParams.delete('category');
		// The current pathname already contains the configured Pages base.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}}
/>
