<script lang="ts">
	// gitblog-membership-v1: the repository contains only a public stub.
	import { onMount } from 'svelte';
	let { id, locale }: { id: string; locale?: string } = $props();
	const readerOrigin = 'https://gitblog.app';
	let frame = $state<HTMLIFrameElement>();
	let host = $state<HTMLElement>();
	let readingWidth = $state('100%');
	let src = $state(''),
		height = $state(310);
	function currentTheme() {
		const root = document.documentElement;
		if (root.dataset.theme === 'dark' || root.classList.contains('dark')) return 'dark';
		if (root.dataset.theme === 'light' || root.classList.contains('light')) return 'light';
		return 'light';
	}
	function sendTheme() {
		if (!host) return;
		const body = host.previousElementSibling?.matches('.article-content')
			? host.previousElementSibling
			: host;
		const text = getComputedStyle(body.querySelector('p') ?? body);
		const root = getComputedStyle(document.documentElement);
		const heading = getComputedStyle(host.closest('article')?.querySelector('h1, h2') ?? host);
		const size = Number.parseFloat(text.fontSize);
		const token = (name: string) => root.getPropertyValue(name).trim();
		const width = body.getBoundingClientRect().width;
		if (body !== host && width > 0) readingWidth = `${width}px`;
		frame?.contentWindow?.postMessage(
			{
				type: 'gitblog-membership-theme',
				id,
				theme: currentTheme(),
				appearance: {
					text: token('--text') || heading.color,
					bodyText: text.color,
					muted: token('--text-dim'),
					border: token('--border-dim'),
					surface: token('--bg-component'),
					background: token('--bg'),
					accent: token('--primary'),
					bodyFont: text.fontFamily,
					headingFont: heading.fontFamily,
					fontSize: size,
					lineHeight: Number.parseFloat(text.lineHeight) / size
				}
			},
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
		let updateFrame = 0;
		let disposed = false;
		const update = () => {
			cancelAnimationFrame(updateFrame);
			updateFrame = requestAnimationFrame(sendTheme);
		};
		window.addEventListener('resize', update);
		void document.fonts.ready.then(() => {
			if (!disposed) update();
		});
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme', 'style']
		});
		return () => {
			disposed = true;
			cancelAnimationFrame(updateFrame);
			window.removeEventListener('resize', update);
			window.removeEventListener('message', listener);
			observer.disconnect();
		};
	});
</script>

<section
	class="membership-embed"
	data-pagefind-ignore
	bind:this={host}
	style:max-width={readingWidth}
>
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
		color-scheme: normal;
	}
</style>
