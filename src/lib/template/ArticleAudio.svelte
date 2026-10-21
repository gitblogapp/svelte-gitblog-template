<script lang="ts">
	import { onMount } from 'svelte';
	import { audioCopy, audioTime } from './audio-copy';
	let { src, locale = 'en' }: { src: string; locale?: string } = $props();
	const copy = $derived(audioCopy(locale));
	let media: HTMLAudioElement;
	let enhanced = $state(false);
	let playing = $state(false);
	let loading = $state(false);
	let failed = $state(false);
	let position = $state(0);
	let duration = $state(Number.NaN);
	let speed = $state(1);
	let attempt = 0;
	const percent = $derived(
		Number.isFinite(duration) && duration > 0 ? Math.min(100, (position / duration) * 100) : 0
	);
	onMount(() => {
		enhanced = true;
		return () => {
			attempt++;
			media.pause();
			media.removeAttribute('src');
			media.load();
		};
	});
	async function toggle() {
		if (playing || loading) {
			attempt++;
			media.pause();
			playing = false;
			loading = false;
			return;
		}
		const currentAttempt = ++attempt;
		failed = false;
		loading = true;
		if (media.error) media.load();
		media.playbackRate = speed;
		try {
			await media.play();
		} catch {
			if (currentAttempt === attempt) {
				failed = true;
				playing = false;
				loading = false;
			}
		}
	}
	function seek(event: Event) {
		if (Number.isFinite(duration) && duration > 0) {
			position = Number((event.currentTarget as HTMLInputElement).value);
			media.currentTime = position;
		}
	}
	function changeSpeed(event: Event) {
		speed = Number((event.currentTarget as HTMLSelectElement).value);
		media.playbackRate = speed;
	}
</script>

<section class="article-audio" data-pagefind-ignore aria-label={copy.title}>
	<div class="heading">
		<div class="titles">
			<span class="eyebrow">{copy.eyebrow}</span>
			<p>{copy.title}</p>
		</div>
		<svg
			class="sound-mark"
			viewBox="0 0 36 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"><path d="M4 10v4m7-10v16m7-13v10m7-16v22m7-13v4" /></svg
		>
	</div>
	<audio
		bind:this={media}
		{src}
		preload="none"
		controls={!enhanced}
		hidden={enhanced}
		aria-label={copy.title}
		onplaying={() => {
			playing = true;
			loading = false;
			failed = false;
		}}
		onpause={() => {
			playing = false;
			loading = false;
		}}
		onwaiting={() => {
			if (!media.paused) loading = true;
		}}
		onended={() => {
			playing = false;
			loading = false;
		}}
		onerror={() => {
			if (media.error) {
				failed = true;
				playing = false;
				loading = false;
			}
		}}
		ontimeupdate={() => {
			position = media.currentTime;
		}}
		ondurationchange={() => {
			duration = media.duration;
		}}
	></audio>
	{#if enhanced}
		<div class="controls">
			<button
				class="play"
				type="button"
				onclick={toggle}
				aria-label={playing || loading ? copy.pause : copy.play}
				aria-busy={loading}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					>{#if playing || loading}<path d="M8 5v14M16 5v14" class="pause" />{:else}<path
							d="m9 5 11 7-11 7Z"
						/>{/if}</svg
				>
			</button>
			<div class="timeline">
				<input
					type="range"
					min="0"
					max={Number.isFinite(duration) && duration > 0 ? duration : 1}
					step="0.1"
					value={position}
					oninput={seek}
					disabled={!Number.isFinite(duration) || duration <= 0}
					aria-label={copy.position}
					aria-valuetext={`${audioTime(position)} / ${audioTime(duration)}`}
					style={`--progress:${percent}%`}
				/>
				<div class="time" aria-hidden="true">
					<span>{audioTime(position)}</span><span>{audioTime(duration)}</span>
				</div>
			</div>
			<select aria-label={copy.speed} value={speed} onchange={changeSpeed}>
				{#each [0.75, 1, 1.25, 1.5, 2] as rate (rate)}<option value={rate}>{rate}×</option>{/each}
			</select>
		</div>
		<span class:feedback={failed} class:sr-only={!failed} role="status"
			>{failed ? copy.error : loading ? copy.loading : ''}</span
		>
	{/if}
</section>

<style>
	.article-audio {
		margin: 0 0 2rem;
		padding: 1.25rem 1.4rem;
		border: 1px solid var(--border-light);
		border-radius: 12px;
		background: var(--bg-component);
		color: var(--text);
		font-family: 'Inter', sans-serif;
	}
	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.1rem;
	}
	.eyebrow {
		display: block;
		color: var(--text-dim);
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.titles p {
		margin: 0.3rem 0 0;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.5;
	}
	.sound-mark {
		width: 36px;
		height: 24px;
		flex-shrink: 0;
		color: var(--text-light);
	}
	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
	.play {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		padding: 0;
		border: none;
		border-radius: 50%;
		color: var(--bg);
		background: var(--text);
		cursor: pointer;
		transition: opacity 150ms;
	}
	.play:hover {
		opacity: 0.8;
	}
	.play svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}
	.pause {
		fill: none;
		stroke: currentColor;
		stroke-width: 4;
	}
	.timeline {
		flex: 1;
		min-width: 0;
	}
	input {
		display: block;
		width: 100%;
		height: 24px;
		padding: 0;
		margin: 0;
		appearance: none;
		cursor: pointer;
		background: transparent;
	}
	input::-webkit-slider-runnable-track {
		height: 3px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--text) var(--progress),
			var(--border-dim) var(--progress)
		);
	}
	input::-moz-range-track {
		height: 3px;
		border-radius: 3px;
		background: var(--border-dim);
	}
	input::-moz-range-progress {
		height: 3px;
		background: var(--text);
	}
	input::-webkit-slider-thumb {
		appearance: none;
		height: 10px;
		width: 10px;
		margin-top: -3.5px;
		border: none;
		border-radius: 50%;
		background: var(--text);
	}
	input::-moz-range-thumb {
		height: 10px;
		width: 10px;
		border: none;
		border-radius: 50%;
		background: var(--text);
	}
	input:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.time {
		display: flex;
		justify-content: space-between;
		font-size: 0.625rem;
		line-height: 1;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	select {
		width: 66px;
		min-height: 36px;
		flex-shrink: 0;
		margin: 0;
		padding: 0 4px;
		border: 1px solid var(--border-dim);
		border-radius: 6px;
		color: var(--text);
		background: var(--bg-component);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 4px;
	}
	audio:not([hidden]) {
		width: 100%;
	}
	.feedback {
		display: block;
		margin-top: 1rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text-dim);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 480px) {
		.article-audio {
			padding: 1rem;
		}
		.controls {
			gap: 0.75rem;
		}
	}
</style>
