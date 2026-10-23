<script lang="ts">
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { publicFlag } from './ai-policy';
	import MembershipEmbed from './components/MembershipEmbed.svelte';
	const memberId = $derived(
		(page.data as { post?: { membershipId?: string | null } }).post?.membershipId
	);
	import ArticleAudio from './ArticleAudio.svelte';
	const audioUrl = $derived((page.data as { post?: { audioUrl?: string | null } }).post?.audioUrl);
	let { html, element = $bindable() }: { html: string; element?: HTMLElement } = $props();
</script>

{#if audioUrl}
	{#key audioUrl}<ArticleAudio src={audioUrl} locale={page.data.locale} />{/key}
{/if}

<div bind:this={element} class="article-content" data-pagefind-body>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
	{#if memberId && !html.trim()}<p data-pagefind-ignore>
			{page.data.locale === 'ko'
				? '멤버십 회원을 위한 글입니다. 아래에서 로그인하거나 가입하면 이 블로그에서 전문을 읽을 수 있습니다.'
				: 'This article is for members. Sign in or join below to read the full article here.'}
		</p>{/if}
</div>
{#if memberId}{#key `${memberId}:${page.data.locale}`}<MembershipEmbed
			id={memberId}
			locale={page.data.locale}
		/>{/key}{/if}
{#if !memberId && publicFlag(env.PUBLIC_AI_MARKDOWN_ENABLED)}
	<p data-pagefind-ignore>
		<!-- page.url.pathname already includes the deployment base; this is a static export. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={`${page.url.pathname.replace(/\/+$/, '')}/index.md`} data-sveltekit-reload
			>Markdown ↗</a
		>
	</p>
{/if}
