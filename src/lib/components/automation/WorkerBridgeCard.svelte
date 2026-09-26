<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';

  let {
    workerRunning = false,
    workerPid = null,
    workerToggling = false,
    customBotCommand = $bindable(''),
    onsync,
    onforcestart,
    onforcecancel,
    onskipcurrent,
    onrestartworker,
    ontoggleworker,
    onsendbotcommand
  } = $props();

  let isWorkerActive = $derived(
    workerRunning ||
    (!!autoEngine.workerStatus.status &&
      autoEngine.workerStatus.status !== 'unknown' &&
      autoEngine.workerStatus.status !== 'stopped' &&
      !!autoEngine.workerStatus.lastUpdate &&
      Date.now() - new Date(autoEngine.workerStatus.lastUpdate).getTime() < 120_000)
  );
</script>

<!-- ═══ ROW 2: Telegram Worker Bridge + Active Job (Full Width) ═══ -->
<div class="card worker-card full-width">
  <div class="card-header">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="card-title">Telegram Worker Bridge</h2>
        {#if workerRunning}
          <span class="worker-inline-badge running" title="Python worker process is running locally (PID: {workerPid})">
            ● PID: {workerPid}
          </span>
        {:else if isWorkerActive}
          <span class="worker-inline-badge running" title="Python worker is active via Firebase bridge ({autoEngine.workerStatus.status})">
            ● Online ({autoEngine.workerStatus.status})
          </span>
        {:else}
          <span class="worker-inline-badge stopped" title="Python worker process is offline">
            ○ Offline
          </span>
        {/if}
        <!-- Active Job State Tag inline -->
        <span class="job-state-tag state-{autoEngine.jobState.toLowerCase()}">
          {autoEngine.jobState}
        </span>
      </div>
      <p class="card-desc">Status synced from Firebase RTDB (<code>automation/worker</code>) & local process.</p>
    </div>
    <div class="flex items-center gap-2">
      <button class="btn-link" onclick={onsync} title="Sync worker status">
        Sync ↺
      </button>
    </div>
  </div>

  <!-- Top Columns: Worker Details (left) + Active Job & State Machine (right) -->
  <div class="worker-job-split">
    <!-- LEFT: Worker Status Grid -->
    <div class="worker-half">
      <!-- Live Running Device & Phone Verification Banner -->
      <div class="running-device-banner {autoEngine.workerStatus.status && autoEngine.workerStatus.status !== 'idle' && autoEngine.workerStatus.status !== 'unknown' ? 'active-test' : ''}">
        <div class="running-indicator">
          <span class="live-dot {autoEngine.workerStatus.status && autoEngine.workerStatus.status !== 'idle' && autoEngine.workerStatus.status !== 'unknown' ? 'pulse' : ''}"></span>
          <span class="running-title">Active Telegram Worker Target</span>
        </div>
        <div class="running-meta-row">
          <div class="running-meta-chip number-chip">
            <span class="chip-label">📱 Running Phone:</span>
            {#if autoEngine.workerStatus.phone || autoEngine.currentJob?.phone}
              <ClickablePhone
                phone={autoEngine.workerStatus.phone || autoEngine.currentJob?.phone}
                raw={true}
                className="chip-val phone-highlight"
                title="Click to copy number without country code"
              />
            {:else}
              <span class="chip-val">None (Idle)</span>
            {/if}
          </div>
          <div class="running-meta-chip device-chip">
            <span class="chip-label">💻 Device:</span>
            <span class="chip-val mono">{autoEngine.workerStatus.deviceId || autoEngine.currentJob?.deviceId || '—'}</span>
          </div>
          <div class="running-meta-chip db-chip">
            <span class="chip-label">🗄️ DB:</span>
            <span class="chip-val mono">{autoEngine.workerStatus.database ? autoEngine.workerStatus.database.replace('https://', '').split('.')[0] : (autoEngine.currentJob?.database ? autoEngine.currentJob.database.replace('https://', '').split('.')[0] : '—')}</span>
          </div>
        </div>
      </div>

      <div class="worker-details-grid">
        <div class="stat-box">
          <span class="stat-label">Worker Status</span>
          <span class="stat-value status-text-{autoEngine.workerStatus.status || 'unknown'}">
            {autoEngine.workerStatus.status || (isWorkerActive ? 'idle' : 'Offline / Stopped')}
          </span>
        </div>
        <div class="stat-box highlight-stat">
          <span class="stat-label">Active Phone</span>
          {#if autoEngine.workerStatus.phone || autoEngine.currentJob?.phone}
            <ClickablePhone
              phone={autoEngine.workerStatus.phone || autoEngine.currentJob?.phone}
              raw={true}
              className="stat-value text-emerald font-bold"
              title="Click to copy without country code"
            />
          {:else}
            <span class="stat-value mono">—</span>
          {/if}
        </div>
        <div class="stat-box highlight-stat">
          <span class="stat-label">Running Device</span>
          <span class="stat-value mono text-cyan">
            {autoEngine.workerStatus.deviceId || autoEngine.currentJob?.deviceId || '—'}
          </span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Current Job</span>
          <span class="stat-value mono text-xs" title={autoEngine.workerStatus.currentJob || autoEngine.currentJob?.id || '—'}>
            {autoEngine.workerStatus.currentJob ? autoEngine.workerStatus.currentJob.slice(0, 18) + '…' : (autoEngine.currentJob?.id ? autoEngine.currentJob.id.slice(0, 18) + '…' : '—')}
          </span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Last Ping</span>
          <span class="stat-value mono text-xs">
            {autoEngine.workerStatus.lastPing ? new Date(autoEngine.workerStatus.lastPing).toLocaleTimeString() : 'Never'}
          </span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Target Bot</span>
          <span class="stat-value mono text-sm">
            @{autoEngine.config.botUsername.replace(/^@/, '')}
          </span>
        </div>
      </div>
    </div>

    <!-- RIGHT: Active Job & State Machine -->
    <div class="job-half">
      <div class="job-half-header">
        <h3 class="job-half-title">Active Job & State Machine</h3>
      </div>

      {#if autoEngine.currentJob}
        <div class="job-active-details">
          <div class="job-grid">
            <div class="job-prop">
              <span class="label">Job ID:</span>
              <span class="value mono">{autoEngine.currentJob.id}</span>
            </div>
            <div class="job-prop">
              <span class="label">Device:</span>
              <span class="value mono">{autoEngine.currentJob.deviceId}</span>
            </div>
            <div class="job-prop">
              <span class="label">Number:</span>
              <ClickablePhone
                phone={autoEngine.currentJob.phone}
                raw={true}
                className="value highlight"
                title="Click to copy without country code"
              />
            </div>
            <div class="job-prop">
              <span class="label">Database:</span>
              <span class="value mono truncate" title={autoEngine.currentJob.database}>{autoEngine.currentJob.database}</span>
            </div>
          </div>

          <!-- State Machine Flow Indicator -->
          <div class="flow-stepper">
            <div class="flow-step {['DISPATCHING', 'WAITING_FOR_NUMBER', 'WAITING_FOR_OTP', 'VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'done' : ''}">
              <span class="step-num">1</span>
              <span class="step-text">Dispatch</span>
            </div>
            <div class="flow-line {['WAITING_FOR_NUMBER', 'WAITING_FOR_OTP', 'VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'active' : ''}"></div>
            <div class="flow-step {['WAITING_FOR_NUMBER', 'WAITING_FOR_OTP', 'VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'done' : ''}">
              <span class="step-num">2</span>
              <span class="step-text">Submit No.</span>
            </div>
            <div class="flow-line {['WAITING_FOR_OTP', 'VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'active' : ''}"></div>
            <div class="flow-step {['WAITING_FOR_OTP', 'VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? (autoEngine.jobState === 'WAITING_FOR_OTP' ? 'active-pulse' : 'done') : ''}">
              <span class="step-num">3</span>
              <span class="step-text">Wait OTP</span>
            </div>
            <div class="flow-line {['VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'active' : ''}"></div>
            <div class="flow-step {['VERIFYING', 'COMPLETED'].includes(autoEngine.jobState) ? 'done' : ''}">
              <span class="step-num">4</span>
              <span class="step-text">Verify</span>
            </div>
          </div>
        </div>
      {:else}
        <div class="job-idle-state">
          <span class="idle-icon">💤</span>
          <p class="idle-text">No active job. Orchestrator is idle.</p>

          <!-- State Machine Flow Indicator (Idle Reference) -->
          <div class="flow-stepper flow-stepper-idle">
            <div class="flow-step">
              <span class="step-num">1</span>
              <span class="step-text">Dispatch</span>
            </div>
            <div class="flow-line"></div>
            <div class="flow-step">
              <span class="step-num">2</span>
              <span class="step-text">Submit No.</span>
            </div>
            <div class="flow-line"></div>
            <div class="flow-step">
              <span class="step-num">3</span>
              <span class="step-text">Wait OTP</span>
            </div>
            <div class="flow-line"></div>
            <div class="flow-step">
              <span class="step-num">4</span>
              <span class="step-text">Verify</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Telegram Bot Response Preview Bubble (Reserved Stable Slot) -->
  <div class="tg-live-bubble-container">
    {#if autoEngine.workerStatus.latestBotMessage}
      <div class="tg-live-bubble active" title="Latest message received from Telegram bot">
        <div class="tg-bubble-header">
          <span class="tg-bubble-icon">🤖</span>
          <span class="tg-bubble-sender">Latest from {autoEngine.config.botUsername}:</span>
        </div>
        <div class="tg-bubble-body">{autoEngine.workerStatus.latestBotMessage}</div>
      </div>
    {:else}
      <div class="tg-live-bubble idle">
        <div class="tg-bubble-header">
          <span class="tg-bubble-icon">🤖</span>
          <span class="tg-bubble-sender">Telegram Bot Status (@{autoEngine.config.botUsername.replace(/^@/, '')}):</span>
        </div>
        <div class="tg-bubble-body tg-bubble-idle">Ready for commands. Real-time responses from Telegram bot appear here.</div>
      </div>
    {/if}
  </div>

  <!-- Direct Worker & Bot Controls Bar -->
  <div class="worker-controls-bar">
    <div class="worker-btn-group">
      <button class="btn btn-warning-ghost btn-xs" onclick={onforcestart} title="Send /start to wake or restart bot conversation">
        ⚡ Send /start
      </button>
      <button class="btn btn-danger-ghost btn-xs" onclick={onforcecancel} title="Send /cancel to reset current conversation & job">
        🛑 Send /cancel
      </button>
      <button class="btn btn-secondary btn-xs" onclick={onskipcurrent} title="Skip current number and advance to next">
        ⏭ Skip Number
      </button>
      <button class="btn btn-secondary btn-xs" onclick={onrestartworker} disabled={workerToggling} title="Restart Python worker process cleanly">
        🔄 Restart Worker
      </button>
      {#if workerRunning}
        <button class="btn btn-danger-ghost btn-xs" onclick={ontoggleworker} disabled={workerToggling} title="Stop local worker process">
          ■ Stop Process
        </button>
      {:else}
        <button class="btn btn-success-ghost btn-xs" onclick={ontoggleworker} disabled={workerToggling} title="Launch local worker process">
          ▶ Start Process
        </button>
      {/if}
    </div>

    <!-- Direct Telegram Command Input -->
    <div class="direct-command-row">
      <input
        id="direct-bot-cmd-input"
        type="text"
        class="direct-cmd-input"
        placeholder="Send direct text to @{autoEngine.config.botUsername.replace(/^@/, '')} (/start, /cancel, OTP, phone)..."
        bind:value={customBotCommand}
        onkeydown={(e) => e.key === 'Enter' && onsendbotcommand && onsendbotcommand()}
      />
      <button class="btn btn-primary btn-xs direct-cmd-btn" onclick={onsendbotcommand} disabled={!customBotCommand.trim()}>
        Send to Bot ➔
      </button>
    </div>
  </div>

  {#if autoEngine.workerStatus.lastError}
    <div class="worker-error-banner">
      <strong>Worker Error:</strong> {autoEngine.workerStatus.lastError}
    </div>
  {/if}
</div>
