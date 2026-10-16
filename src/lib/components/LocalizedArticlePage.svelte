<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import ArticleView from '$lib/theme/ArticleView.svelte';
	import GitBlogRelated from '$lib/components/GitBlogRelated.svelte';
	import ArticleSeo from '$lib/template/ArticleSeo.svelte';
	import { createArticleController } from '$lib/template/article-controller.svelte';
	import { withBasePath } from '$lib/template/article-html';
	import type { ArticlePageProps } from '$lib/template/contracts';
	let props: ArticlePageProps = $props();
	let articleRoot = $state<HTMLDivElement>();
	const html = $derived(withBasePath(props.post.html, base));
	const article = createArticleController(() => html);
	const context = $derived({
		site: props.site,
		locale: props.locale,
		pathname: page.url.pathname,
		post: props.post
	});
</script>

<ArticleSeo {...props} />
<div style="display: contents" bind:this={articleRoot}>
	<ArticleView {...props} {article} {html} {context} />
	<GitBlogRelated
		config={props.relatedPanel}
		postId={props.post.id}
		lang={props.post.locale}
		placement="article"
		root={articleRoot}
	/>
</div>
