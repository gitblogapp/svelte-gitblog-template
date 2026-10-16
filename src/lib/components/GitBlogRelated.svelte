<script lang="ts">
	import type { RelatedPanelConfig } from '$lib/template/related-panel';

	type Theme = 'light' | 'dark';
	type Panel = { update(options: { theme: Theme }): void; destroy(): void };
	type EmbedModule = {
		mount(
			target: HTMLElement,
			options: RelatedPanelConfig & {
				postId: string;
				lang: string;
				theme: Theme;
				loading: 'lazy';
				onState(state: string): void;
			}
		): Panel;
	};
	let {
		config,
		postId,
		lang
	}: {
		config?: RelatedPanelConfig | null;
		postId: string;
		lang: string;
	} = $props();
	let container = $state<HTMLDivElement>();
	let ready = $state(false);
	const configured = $derived(
		config && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(postId)
	);

	$effect(() => {
		const target = container;
		const settings = config;
		const id = postId;
		const language = lang;
		if (!target || !settings || !configured) return;
		let disposed = false;
		let panel: Panel | undefined;
		let observer: MutationObserver | undefined;
		ready = false;
		const getTheme = (): Theme =>
			document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		const moduleUrl = `${settings.baseUrl}index.js`;
		// Load the independently deployed SDK only in the browser.
		void (import(/* @vite-ignore */ moduleUrl) as Promise<EmbedModule>)
			.then((sdk) => {
				if (disposed) return;
				let theme = getTheme();
				panel = sdk.mount(target, {
					...settings,
					postId: id,
					lang: language,
					theme,
					loading: 'lazy',
					onState: (state) => {
						if (!disposed) ready = state === 'ready';
					}
				});
				observer = new MutationObserver(() => {
					const next = getTheme();
					if (theme === next) return;
					theme = next;
					panel?.update({ theme });
				});
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ['class']
				});
			})
			.catch(() => {
				// A blocked or unavailable recommendation service must not interrupt the article.
				if (!disposed) ready = false;
			});
		return () => {
			disposed = true;
			observer?.disconnect();
			panel?.destroy();
		};
	});
</script>

{#if configured}
	<div class="gitblog-related-panel" class:ready data-pagefind-ignore bind:this={container}></div>
{/if}

<style>
	.gitblog-related-panel.ready {
		margin-top: 3rem;
	}
</style>
