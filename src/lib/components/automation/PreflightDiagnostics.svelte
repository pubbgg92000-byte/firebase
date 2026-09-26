<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';

  let {
    onrunpreflight
  } = $props();
</script>

<!-- ═══ ROW 3: Collapsible Pre-Flight Diagnostics ═══ -->
<details class="preflight-collapsible full-width">
  <summary class="preflight-summary">
    <span class="preflight-summary-icon">{autoEngine.preflightPassed ? '✅' : autoEngine.preflightRunning ? '⏳' : '🔍'}</span>
    <span class="preflight-summary-text">Pre-Flight System Diagnostics</span>
    <span class="preflight-summary-status">
      {autoEngine.preflightPassed ? 'Passed' : autoEngine.preflightResults.length > 0 ? 'Check Results' : 'Not Run'}
    </span>
    <button
      class="btn-link btn-xs"
      onclick={(e) => { e.stopPropagation(); onrunpreflight && onrunpreflight(); }}
      disabled={autoEngine.preflightRunning}
    >
      {autoEngine.preflightRunning ? 'Running...' : 'Re-run'}
    </button>
  </summary>
  <div class="preflight-body card">
    {#if autoEngine.preflightResults.length === 0}
      <div class="empty-state-sm">
        <p>No diagnostics run yet in this session. Click <strong>"Run Pre-Flight Test"</strong> to verify readiness.</p>
      </div>
    {:else}
      <div class="preflight-list">
        {#each autoEngine.preflightResults as item}
          <div class="preflight-item status-{item.status}">
            <span class="item-badge">
              {item.status === 'pass' ? '✓' : item.status === 'warn' ? '⚠' : '✗'}
            </span>
            <div class="item-content">
              <div class="item-title">{item.name}</div>
              <div class="item-msg">{item.message}</div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</details>
