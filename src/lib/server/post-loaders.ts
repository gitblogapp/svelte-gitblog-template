import { error } from '@sveltejs/kit';
import type { Locale } from '$lib/i18n';
import { getAllPosts, getPost, getPostLocales } from '$lib/server/content';
import { env } from '$env/dynamic/public';
import { getHubManifest } from '$lib/server/hub-manifest';
import { createRelatedPanelConfig } from '$lib/template/related-panel';

export const loadPostListPage = (locale: Locale) => ({
	locale,
	posts: getAllPosts(locale)
});

export const loadPostPage = (locale: Locale, slug: string) => {
	const post = getPost(slug, locale);

	if (!post) {
		throw error(404, 'Post not found');
	}

	const hub = getHubManifest();
	return {
		locale,
		post,
		relatedPanel: createRelatedPanelConfig({
			repository: hub.repository,
			hubEnabled: hub.enabled,
			enabled: env.PUBLIC_RELATED_ENABLED,
			showThumbnail: env.PUBLIC_RELATED_SHOW_THUMBNAIL,
			limit: env.PUBLIC_RELATED_LIMIT,
			hubUrl: env.PUBLIC_HUB_URL
		}),
		availableLocales: getPostLocales(slug),
		relatedPosts: getAllPosts(locale)
			.filter((entry) => entry.slug !== slug)
			.slice(0, 3)
	};
};
