<script>
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';

	let { children } = $props();

	// Smooth page transitions are handled via pure CSS (.page-transition-wrap)
	// Never block SvelteKit router navigation with promises so navigation is always instant!

	// Discovery engine: loads as module singleton, persists across route navigation.
	// On page refresh, initEngine() restores state from localStorage and auto-resumes.
	let eng = $state(null);
	let autoEng = $state(null);
	let browserWorker = $state(null);

	onMount(async () => {
		const mod = await import('$lib/discovery-engine.svelte.js');
		mod.initEngine();
		eng = mod.engine;

		const autoMod = await import('$lib/automation-engine.svelte.js');
		autoEng = autoMod.autoEngine;

		const bwMod = await import('$lib/browser-worker.svelte.js');
		bwMod.initWorker();
		browserWorker = bwMod.worker;

		const pollerMod = await import('$lib/background-poller.svelte.js');
		pollerMod.initBackgroundPoller();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page-transition-wrap">
	{@render children()}
</div>

<!-- Background discovery indicator — visible on other pages when engine is running -->
{#if eng?.status === 'RUNNING' && page.url.pathname !== '/discovery'}
	<a href="/discovery" class="disco-bg-pill" title="Discovery running in background — click to view">
		<span class="disco-bg-dot"></span>
		📡 Discovery Running
	</a>
{/if}

<!-- Background automation indicator — visible on other pages when automation is running -->
{#if autoEng?.status === 'RUNNING' && page.url.pathname !== '/automation'}
	<a href="/automation" class="auto-bg-pill" title="Automation running in background — click to view">
		<span class="auto-bg-dot"></span>
		🤖 Automation Running
	</a>
{/if}

<!-- Background browser worker indicator — visible on other pages when browser worker is running -->
{#if browserWorker?.status === 'RUNNING' && page.url.pathname !== '/automation'}
	<a href="/automation?tab=browser_worker" class="browser-worker-bg-pill" title="Browser Worker running in tab — click to view">
		<span class="browser-worker-bg-dot"></span>
		🌐 Browser Worker ({browserWorker.stats.success} verified)
	</a>
{/if}

<style>
	.page-transition-wrap {
		min-height: 100vh;
		animation: page-fade-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes page-fade-in {
		from {
			opacity: 0.85;
			transform: translateY(2px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(::view-transition-old(root)) {
		animation: 90ms cubic-bezier(0.4, 0, 1, 1) both vt-fade-out;
	}
	:global(::view-transition-new(root)) {
		animation: 160ms cubic-bezier(0, 0, 0.2, 1) 30ms both vt-fade-in;
	}

	@keyframes vt-fade-out {
		from { opacity: 1; }
		to { opacity: 0; }
	}
	@keyframes vt-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

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

	.browser-worker-bg-pill {
		position: fixed;
		bottom: 80px;
		left: 16px;
		z-index: 9999;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: rgba(14, 20, 32, 0.95);
		border: 1px solid rgba(56, 189, 248, 0.45);
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
	.browser-worker-bg-pill:hover {
		border-color: rgba(56, 189, 248, 0.7);
		box-shadow: 0 4px 24px rgba(56, 189, 248, 0.25);
		transform: translateY(-1px);
	}
	.browser-worker-bg-dot {
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
