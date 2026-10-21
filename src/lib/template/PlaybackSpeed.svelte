<script lang="ts">
	import { tick } from 'svelte';
	let {
		value,
		label,
		onChange
	}: { value: number; label: string; onChange: (value: number) => void } = $props();
	const rates = [0.75, 1, 1.25, 1.5, 2];
	const id = $props.id();
	let open = $state(false);
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let menu = $state<HTMLDivElement>();
	async function show() {
		open = true;
		await tick();
		if (open) menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
	}
	function close(restore = false) {
		open = false;
		if (restore) trigger.focus();
	}
	function outside(event: Event) {
		if (open && event.target instanceof Node && !root.contains(event.target)) close();
	}
	function choose(rate: number) {
		onChange(rate);
		close(true);
	}
	function keys(event: KeyboardEvent) {
		if (!menu) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close(true);
		} else if (event.key === 'Tab') close();
		else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button')];
			const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? buttons.length - 1
						: (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
			buttons[next]?.focus();
		}
	}
</script>

<svelte:window onpointerdown={outside} onfocusin={outside} />
<div class="speed" bind:this={root}>
	<button
		class="trigger"
		bind:this={trigger}
		type="button"
		aria-label={`${label}: ${value}×`}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls={open ? id : undefined}
		onclick={() => (open ? close() : show())}
		onkeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				void show();
			}
		}}
	>
		<span>{value}×</span>
		<svg class:open viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
	</button>
	{#if open}
		<div
			class="menu"
			{id}
			bind:this={menu}
			role="menu"
			tabindex="-1"
			aria-label={label}
			onkeydown={keys}
		>
			{#each rates as rate (rate)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={value === rate}
					tabindex={value === rate ? 0 : -1}
					onclick={() => choose(rate)}
				>
					<span>{rate}×</span>
					<svg class:selected={value === rate} viewBox="0 0 16 16" aria-hidden="true"
						><path d="m3 8 3 3 7-7" /></svg
					>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.speed {
		position: relative;
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
	button {
		font: inherit;
		font-size: 0.75rem;
		color: var(--text);
		cursor: pointer;
	}
	.trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-width: 78px;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--border-dim);
		border-radius: 6px;
		background: var(--bg-component);
	}
	.trigger:hover,
	.trigger[aria-expanded='true'] {
		background: var(--bg-highlight);
		border-color: var(--text-light);
	}
	svg {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.trigger svg {
		color: var(--text-dim);
	}
	.trigger svg.open {
		transform: rotate(180deg);
	}
	.menu {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		inset-inline-end: 0;
		min-width: 112px;
		padding: 4px;
		border: 1px solid var(--border-dim);
		border-radius: 8px;
		background: var(--bg);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
	}
	.menu button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		width: 100%;
		min-height: 36px;
		padding: 0 10px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		text-align: start;
	}
	.menu button:hover,
	.menu button:focus-visible {
		background: var(--bg-highlight);
	}
	.menu button[aria-checked='true'] {
		font-weight: 600;
	}
	.menu svg {
		visibility: hidden;
	}
	.menu svg.selected {
		visibility: visible;
	}
	button:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.menu button:focus-visible {
		outline-offset: -2px;
	}
</style>
