<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import { formatElapsed } from '$lib/utils/date.js';

  let {
    candidatesCount = 0,
    registryCount = 0,
    onstart,
    onpause,
    onresume,
    onstop,
    onpreflight,
    onstep,
    onreset
  } = $props();
</script>

<!-- ═══ ROW 1: Orchestration Controls (Full Width) ═══ -->
<div class="card control-card full-width">
  <div class="card-header">
    <div>
      <h2 class="card-title">Orchestration Controls</h2>
      <p class="card-desc">Execute controlled testing across online devices with known numbers.</p>
    </div>
    <div class="timer-display">
      <span class="timer-label">Elapsed:</span>
      <span class="timer-val">{formatElapsed(autoEngine.elapsedSeconds)}</span>
    </div>
  </div>

  <div class="controls-row">
    {#if autoEngine.status === 'RUNNING'}
      <button class="btn btn-warning" onclick={onpause}>
        ⏸ Pause
      </button>
      <button class="btn btn-danger" onclick={onstop}>
        ⏹ Stop
      </button>
    {:else if autoEngine.status === 'PAUSED'}
      <button class="btn btn-success" onclick={onresume}>
        ▶ Resume
      </button>
      <button class="btn btn-danger" onclick={onstop}>
        ⏹ Stop
      </button>
    {:else}
      <button
        class="btn btn-primary btn-large {!autoEngine.preflightPassed ? 'btn-disabled' : ''}"
        onclick={onstart}
        disabled={!autoEngine.preflightPassed}
        title={!autoEngine.preflightPassed ? 'Run Pre-Flight Check first to unlock Start' : 'Start Automation'}
      >
        ▶ Start Automation
      </button>
    {/if}

    <button
      class="btn btn-secondary"
      onclick={onpreflight}
      disabled={autoEngine.preflightRunning || autoEngine.status === 'RUNNING'}
    >
      {autoEngine.preflightRunning ? '⏳ Checking...' : '⚡ Run Pre-Flight Test'}
    </button>

    <button
      class="btn btn-secondary"
      onclick={onstep}
      disabled={autoEngine.status === 'RUNNING' || autoEngine.jobState !== 'IDLE'}
      title="Test a single device without continuous loop"
    >
      ⏭ Step Next Device
    </button>

    <button class="btn btn-ghost" onclick={onreset} title="Reset processed and stats counters">
      ↺ Reset Stats
    </button>
  </div>

  {#if !autoEngine.preflightPassed && autoEngine.status !== 'RUNNING'}
    <div class="preflight-alert">
      <span class="alert-icon">ℹ</span>
      <div>
        <strong>Pre-flight test required:</strong> Click "Run Pre-Flight Test" above to verify database connectivity, online device availability, and configuration before starting.
      </div>
    </div>
  {/if}

  <!-- Inline Metrics Strip -->
  <div class="metrics-grid metrics-inline">
    <div class="metric-item">
      <span class="metric-num">{autoEngine.stats.totalProcessed}</span>
      <span class="metric-lbl">Processed</span>
    </div>
    <div class="metric-item text-success">
      <span class="metric-num">{autoEngine.stats.success}</span>
      <span class="metric-lbl">Success</span>
    </div>
    <div class="metric-item text-danger">
      <span class="metric-num">{autoEngine.stats.timeout}</span>
      <span class="metric-lbl">Timeout</span>
    </div>
    <div class="metric-item text-cyan">
      <span class="metric-num">{candidatesCount}</span>
      <span class="metric-lbl">Pool</span>
    </div>
    <div class="metric-item text-purple">
      <span class="metric-num">{registryCount}</span>
      <span class="metric-lbl">Registry</span>
    </div>
  </div>
</div>
