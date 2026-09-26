<script>
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Discovery engine: loads as module singleton, persists across route navigation.
	// On page refresh, initEngine() restores state from localStorage and auto-resumes.
	let eng = $state(null);
	let autoEng = $state(null);

	onMount(async () => {
		const mod = await import('$lib/discovery-engine.svelte.js');
		mod.initEngine();
		eng = mod.engine;

		const autoMod = await import('$lib/automation-engine.svelte.js');
		autoEng = autoMod.autoEngine;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Background discovery indicator — visible on all pages when engine is running -->
{#if eng?.status === 'RUNNING'}
	<a href="/discovery" class="disco-bg-pill" title="Discovery running in background — click to view">
		<span class="disco-bg-dot"></span>
		📡 Discovery Running
	</a>
{/if}

<!-- Background automation indicator — visible on all pages when automation is running -->
{#if autoEng?.status === 'RUNNING'}
	<a href="/automation" class="auto-bg-pill" title="Automation running in background — click to view">
		<span class="auto-bg-dot"></span>
		🤖 Automation Running
	</a>
{/if}

<style>
	.disco-bg-pill {
		position: fixed;
		bottom: 16px;
		left: 16px;
		z-index: 9999;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: rgba(14, 20, 32, 0.95);
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: 20px;
		color: #34d399;
		font-size: 11px;
		font-weight: 600;
		font-family: 'Inter', system-ui, sans-serif;
		text-decoration: none;
		backdrop-filter: blur(12px);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
		transition: all 0.2s;
		animation: disco-bg-in 0.3s ease;
	}
	.disco-bg-pill:hover {
		border-color: rgba(34, 197, 94, 0.5);
		box-shadow: 0 4px 24px rgba(34, 197, 94, 0.15);
		transform: translateY(-1px);
	}
	.disco-bg-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #22c55e;
		animation: disco-bg-pulse 1.5s ease infinite;
	}

	.auto-bg-pill {
		position: fixed;
		bottom: 48px;
		left: 16px;
		z-index: 9999;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: rgba(14, 20, 32, 0.95);
		border: 1px solid rgba(56, 189, 248, 0.4);
		border-radius: 20px;
		color: #38bdf8;
		font-size: 11px;
		font-weight: 600;
		font-family: 'Inter', system-ui, sans-serif;
		text-decoration: none;
		backdrop-filter: blur(12px);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
		transition: all 0.2s;
		animation: disco-bg-in 0.3s ease;
	}
	.auto-bg-pill:hover {
		border-color: rgba(56, 189, 248, 0.6);
		box-shadow: 0 4px 24px rgba(56, 189, 248, 0.2);
		transform: translateY(-1px);
	}
	.auto-bg-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #38bdf8;
		animation: disco-bg-pulse 1.5s ease infinite;
	}

	@keyframes disco-bg-pulse {
		0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(34, 197, 94, 0.6); }
		50% { opacity: 0.3; box-shadow: none; }
	}
	@keyframes disco-bg-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: none; }
	}
</style>
