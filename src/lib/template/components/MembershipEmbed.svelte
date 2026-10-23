<script lang="ts">
	// gitblog-membership-v1: the repository contains only a public stub.
	import { onMount } from 'svelte';
	let { id }: { id: string } = $props();
	let frame = $state<HTMLIFrameElement>();
	let src = $state(''),
		height = $state(310);
	onMount(() => {
		src = `https://gitblog.app/membership/embed/${encodeURIComponent(id)}?${new URLSearchParams({ origin: location.origin })}`;
		const listener = (event: MessageEvent) => {
			if (
				event.origin !== 'https://gitblog.app' ||
				event.source !== frame?.contentWindow ||
				event.data?.type !== 'gitblog-membership-resize' ||
				event.data.id !== id
			)
				return;
			const value = Number(event.data.height);
			if (Number.isFinite(value)) height = Math.max(200, Math.min(100000, value));
		};
		window.addEventListener('message', listener);
		return () => window.removeEventListener('message', listener);
	});
</script>

<section class="membership-embed" data-pagefind-ignore>
	{#if src}<iframe
			bind:this={frame}
			{src}
			title="GitBlog membership article"
			style:height={`${height}px`}
			referrerpolicy="no-referrer"
			allow="clipboard-write"
		></iframe>{/if}
	<noscript>JavaScript is required to read this membership article.</noscript>
</section>

<style>
	.membership-embed {
		margin: 24px 0;
	}
	iframe {
		display: block;
		width: 100%;
		border: 0;
		border-radius: 12px;
		color-scheme: light dark;
	}
</style>
