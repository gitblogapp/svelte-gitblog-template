<script lang="ts">
	// gitblog-membership-v1: the repository contains only a public stub.
	import { onMount } from 'svelte';
	let { id, locale }: { id: string; locale?: string } = $props();
	const readerOrigin = 'https://gitblog.app';
	let frame = $state<HTMLIFrameElement>();
	let src = $state(''),
		height = $state(310);
	function currentTheme() {
		const root = document.documentElement;
		if (root.dataset.theme === 'dark' || root.classList.contains('dark')) return 'dark';
		if (root.dataset.theme === 'light' || root.classList.contains('light')) return 'light';
		return 'light';
	}
	function sendTheme() {
		frame?.contentWindow?.postMessage(
			{ type: 'gitblog-membership-theme', id, theme: currentTheme() },
			readerOrigin
		);
	}
	onMount(() => {
		src = `${readerOrigin}/membership/embed/${encodeURIComponent(id)}?${new URLSearchParams({ origin: location.origin, lang: locale || document.documentElement.lang || 'en', theme: currentTheme() })}`;
		const listener = (event: MessageEvent) => {
			if (
				event.origin !== readerOrigin ||
				event.source !== frame?.contentWindow ||
				event.data?.type !== 'gitblog-membership-resize' ||
				event.data.id !== id
			)
				return;
			const value = Number(event.data.height);
			if (Number.isFinite(value)) height = Math.max(200, Math.min(100000, value));
		};
		window.addEventListener('message', listener);
		const observer = new MutationObserver(sendTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});
		return () => {
			window.removeEventListener('message', listener);
			observer.disconnect();
		};
	});
</script>

<section class="membership-embed" data-pagefind-ignore>
	{#if src}<iframe
			bind:this={frame}
			{src}
			title="GitBlog membership article"
			style:height={`${height}px`}
			referrerpolicy="no-referrer"
			onload={sendTheme}
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
