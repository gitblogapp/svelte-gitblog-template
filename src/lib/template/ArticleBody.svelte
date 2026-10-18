<script lang="ts">
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { publicFlag } from './ai-policy';
	let { html, element = $bindable() }: { html: string; element?: HTMLElement } = $props();
</script>

<div bind:this={element} class="article-content" data-pagefind-body>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>
{#if publicFlag(env.PUBLIC_AI_MARKDOWN_ENABLED)}
	<p data-pagefind-ignore>
		<!-- page.url.pathname already includes the deployment base; this is a static export. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={`${page.url.pathname.replace(/\/+$/, '')}/index.md`} data-sveltekit-reload
			>Markdown ↗</a
		>
	</p>
{/if}
