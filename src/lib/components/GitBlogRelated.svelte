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
		lang,
		root,
		placement = 'inline'
	}: {
		config?: RelatedPanelConfig | null;
		postId: string;
		lang: string;
		root?: HTMLElement;
		placement?: 'inline' | 'article';
	} = $props();
	let container = $state<HTMLDivElement>();
	const configured = $derived(
		config && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(postId)
	);

	$effect(() => {
		const settings = config;
		const id = postId;
		const language = lang;
		if (!settings || !configured) return;
		let target = container;
		const managed = placement === 'article';
		if (managed) {
			if (!root || root.querySelector('.gitblog-related-panel')) return;
			// The theme is preserved during updates. Insert only our own SDK host into its outlet.
			target = document.createElement('div');
			target.className = 'gitblog-related-panel';
			target.setAttribute('data-pagefind-ignore', '');
			const boundary = root.querySelector('.related-boundary');
			if (boundary) boundary.after(target);
			else (root.querySelector('.article-center, article') ?? root).append(target);
		}
		if (!target) return;
		const host = target;
		let disposed = false;
		let panel: Panel | undefined;
		let observer: MutationObserver | undefined;
		host.style.marginTop = '0';
		const getTheme = (): Theme =>
			document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		const moduleUrl = `${settings.baseUrl}index.js`;
		// Load the independently deployed SDK only in the browser.
		void (import(/* @vite-ignore */ moduleUrl) as Promise<EmbedModule>)
			.then((sdk) => {
				if (disposed) return;
				let theme = getTheme();
				panel = sdk.mount(host, {
					...settings,
					postId: id,
					lang: language,
					theme,
					loading: 'lazy',
					onState: (state) => {
						if (!disposed) host.style.marginTop = state === 'ready' ? '3rem' : '0';
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
				if (!disposed) host.style.marginTop = '0';
			});
		return () => {
			disposed = true;
			observer?.disconnect();
			panel?.destroy();
			if (managed) host.remove();
		};
	});
</script>

{#if configured && placement === 'inline'}
	<div class="gitblog-related-panel" data-pagefind-ignore bind:this={container}></div>
{/if}
