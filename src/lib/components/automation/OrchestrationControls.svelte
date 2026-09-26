<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import { formatElapsed } from '$lib/utils/date.js';

  let {
    candidatesCount = 0,
    registryCount = 0,
    registryStats = { total: 0, successful: 0, expired: 0, suspended: 0, rateLimited: 0, alreadyRegistered: 0, failed: 0 },
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
        class="btn btn-primary btn-large"
        onclick={onstart}
        disabled={autoEngine.workerStarting || autoEngine.preflightRunning}
        title="Start Automation (Auto-runs preflight & connects Python worker)"
      >
        {#if autoEngine.workerStarting}
          ⏳ Starting Worker...
        {:else if autoEngine.preflightRunning}
          ⏳ Checking...
        {:else}
          ▶ Start Automation
        {/if}
      </button>
    {/if}

    <button
      class="btn btn-secondary"
      onclick={onpreflight}
      disabled={autoEngine.preflightRunning || autoEngine.status === 'RUNNING' || autoEngine.workerStarting}
    >
      {autoEngine.preflightRunning ? '⏳ Checking...' : '⚡ Run Pre-Flight Test'}
    </button>

    <button
      class="btn btn-secondary"
      onclick={onstep}
      disabled={autoEngine.status === 'RUNNING' || autoEngine.jobState !== 'IDLE' || autoEngine.workerStarting}
      title="Test a single device without continuous loop"
    >
      ⏭ Step Next Device
    </button>

    <button class="btn btn-ghost" onclick={onreset} title="Reset processed and stats counters">
      ↺ Reset Stats
    </button>
  </div>

  {#if !autoEngine.preflightPassed && autoEngine.status !== 'RUNNING' && !autoEngine.workerStarting}
    <div class="preflight-alert">
      <span class="alert-icon">ℹ</span>
      <div>
        <strong>Ready to start:</strong> Click "Start Automation" to auto-run preflight checks, connect the Python worker, and begin processing. Or click "Run Pre-Flight Test" to test manually first.
      </div>
    </div>
  {/if}

  <!-- Inline Metrics Strip (Complete Status Breakdown) -->
  <div class="metrics-grid metrics-inline metrics-strip-all">
    <div class="metric-item">
      <span class="metric-num">{registryStats.total || autoEngine.stats.totalProcessed}</span>
      <span class="metric-lbl">Total Processed</span>
    </div>
    <div class="metric-item text-success">
      <span class="metric-num">{registryStats.successful || autoEngine.stats.success}</span>
      <span class="metric-lbl">✓ Successful</span>
    </div>
    <div class="metric-item text-danger">
      <span class="metric-num">{registryStats.suspended}</span>
      <span class="metric-lbl">⛔ Suspended</span>
    </div>
    <div class="metric-item text-purple">
      <span class="metric-num">{registryStats.rateLimited}</span>
      <span class="metric-lbl">⏳ Rate Limited</span>
    </div>
    <div class="metric-item text-warning">
      <span class="metric-num">{registryStats.expired || autoEngine.stats.timeout}</span>
      <span class="metric-lbl">⏱ Expired</span>
    </div>
    <div class="metric-item text-rose">
      <span class="metric-num">{registryStats.failed}</span>
      <span class="metric-lbl">✗ Failed</span>
    </div>
    <div class="metric-item text-cyan">
      <span class="metric-num">{candidatesCount}</span>
      <span class="metric-lbl">📡 Pool</span>
    </div>
    <div class="metric-item text-purple">
      <span class="metric-num">{registryStats.alreadyRegistered ?? 0}</span>
      <span class="metric-lbl">🔄 Already Reg</span>
    </div>
    <div class="metric-item text-amber">
      <span class="metric-num mono text-sm" style="font-size: 15px; margin-top: 4px;">
        {#if autoEngine.status === 'RUNNING'}
          <span class="pulse-dot dot-online" style="display: inline-block; width: 8px; height: 8px; margin-right: 4px;"></span>
          {autoEngine.jobState}
        {:else}
          {autoEngine.status}
        {/if}
      </span>
      <span class="metric-lbl">Process State</span>
    </div>
  </div>
</div>
