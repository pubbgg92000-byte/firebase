<script>
  import { onMount, tick } from 'svelte';
  import {
    worker,
    connectTelegram,
    loginWithPhone,
    submitLoginCode,
    submit2FAPassword,
    logoutTelegram,
    startWorker,
    pauseWorker,
    stopWorker,
    resetProcessedNumbers,
    formatElapsed,
    skipCurrentDevice,
    sendDirectBotCommand,
    sendBotStart,
    sendBotCancel,
    clearWorkerLogs,
    initWorker
  } from '$lib/browser-worker.svelte.js';
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';
  import {
    engine as discoveryEngine,
    onlineDevices as _onlineDevices,
    withNumber as _withNumber
  } from '$lib/discovery-engine.svelte.js';
  import { extractNumber } from '$lib/device-helpers.js';

  let phoneInput = $state('');
  let codeInput = $state('');
  let passwordInput = $state('');
  let botCmdInput = $state('');
  let showApiConfig = $state(false);
  let autoScrollLogs = $state(true);
  let logsContainer = $state(null);
  let activeTab = $state('console'); // 'console' | 'history'

  let onlineList = $derived(_onlineDevices());
  let withNumberList = $derived(_withNumber());

  onMount(async () => {
    initWorker();
    // Auto-reconnect if session exists
    try {
      await connectTelegram();
    } catch {}
  });

  async function handleSendCode() {
    const p = phoneInput.trim();
    if (!p) return;
    await loginWithPhone(p);
  }

  async function handleVerifyCode() {
    const c = codeInput.trim();
    if (!c) return;
    await submitLoginCode(c);
    codeInput = '';
  }

  async function handleVerify2FA() {
    const pw = passwordInput.trim();
    if (!pw) return;
    await submit2FAPassword(pw);
    passwordInput = '';
  }

  async function handleSendDirectCmd() {
    const cmd = botCmdInput.trim();
    if (!cmd) return;
    botCmdInput = '';
    await sendDirectBotCommand(cmd);
  }

  function scrollToBottom() {
    if (autoScrollLogs && logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  $effect(() => {
    // Whenever new logs arrive
    if (worker.logs.length && autoScrollLogs) {
      tick().then(scrollToBottom);
    }
  });

  let processedArray = $derived(
    Object.values(worker.processedNumbers || {}).sort((a, b) =>
      new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    )
  );
</script>

<div class="browser-worker-tab">
  <!-- Top Banner / Feature Callout -->
  <div class="feature-banner">
    <div class="feature-banner-content">
      <div class="feature-badge">
        <span class="feature-badge-dot"></span>
        ZERO INSTALLATION • BROWSER CLIENT
      </div>
      <h2 class="feature-title">🌐 Run Telegram Automation Directly In Your Browser</h2>
      <p class="feature-desc">
        No Python, no terminal, no VPS required. Runs Telegram MTProto over secure WebSockets right inside this browser tab.
        Works seamlessly on mobile phones, tablets, Mac, Windows, Linux, and any device with a web browser.
      </p>
    </div>
    <div class="mode-status-pill status-{worker.status.toLowerCase()}">
      <span class="status-dot {worker.status === 'RUNNING' ? 'pulse' : ''}"></span>
      Worker: {worker.status}
    </div>
  </div>

  <!-- SECTION 1: Telegram Account Connection -->
  <div class="card worker-card">
    <div class="card-header">
      <div>
        <div class="flex items-center gap-2">
          <span class="card-icon">📱</span>
          <h2 class="card-title">Browser Telegram Account</h2>
          {#if worker.telegramConnected}
            <span class="badge-success">● Connected (@{worker.telegramUser?.username || 'User'})</span>
          {:else if worker.connecting}
            <span class="badge-warning">⏳ Connecting…</span>
          {:else}
            <span class="badge-muted">○ Not Connected</span>
          {/if}
        </div>
        <p class="card-desc">
          MTProto session is stored securely in your browser's <code>localStorage</code>. You only login once.
        </p>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          onclick={() => showApiConfig = !showApiConfig}
        >
          ⚙ {showApiConfig ? 'Hide API Keys' : 'API Credentials'}
        </button>
        {#if worker.telegramConnected}
          <button
            type="button"
            class="btn btn-danger-ghost btn-xs"
            onclick={logoutTelegram}
          >
            Disconnect Account
          </button>
        {/if}
      </div>
    </div>

    <!-- Optional API Config Collapse -->
    {#if showApiConfig}
      <div class="api-config-box">
        <div class="config-grid-row">
          <div class="form-group">
            <label class="form-label" for="bw-api-id">Telegram API ID</label>
            <input
              id="bw-api-id"
              type="text"
              class="form-input"
              bind:value={worker.config.apiId}
              placeholder="e.g. 12345678"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="bw-api-hash">Telegram API Hash</label>
            <input
              id="bw-api-hash"
              type="text"
              class="form-input"
              bind:value={worker.config.apiHash}
              placeholder="e.g. 0123456789abcdef0123456789abcdef"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="bw-target-bot">Target Bot Username</label>
            <input
              id="bw-target-bot"
              type="text"
              class="form-input"
              bind:value={worker.config.botUsername}
              placeholder="@Swiggy_fuckbot"
            />
          </div>
        </div>
      </div>
    {/if}

    <!-- Connected State View -->
    {#if worker.telegramConnected}
      <div class="tg-connected-profile">
        <div class="tg-avatar-circle">
          {worker.telegramUser?.firstName ? worker.telegramUser.firstName[0].toUpperCase() : 'TG'}
        </div>
        <div class="tg-profile-meta">
          <div class="tg-profile-name">
            {worker.telegramUser?.firstName || 'Telegram User'}
            {#if worker.telegramUser?.username}
              <span class="tg-username">@{worker.telegramUser.username}</span>
            {/if}
          </div>
          <div class="tg-profile-sub">
            <span class="meta-tag">Phone: {worker.telegramUser?.phone || 'Hidden'}</span>
            <span class="meta-tag text-emerald">● MTProto WebSocket Active</span>
            <span class="meta-tag">Target: {worker.config.botUsername}</span>
          </div>
        </div>
      </div>

    <!-- Login Flow Steps -->
    {:else}
      <div class="login-flow-container">
        <!-- STEP 1: Phone Input -->
        {#if worker.loginPhase === 'IDLE' || worker.loginPhase === 'CONNECTING' || worker.loginPhase === 'ERROR'}
          <div class="auth-step-card">
            <div class="step-num-badge">1</div>
            <div class="step-body">
              <div class="step-title">Enter Your Telegram Phone Number</div>
              <div class="step-desc">Telegram will send a verification code directly to your Telegram app or SMS.</div>
              <div class="step-input-row">
                <input
                  type="tel"
                  class="form-input step-input"
                  placeholder="+919876543210 (with country code)"
                  bind:value={phoneInput}
                  disabled={worker.connecting}
                  onkeydown={(e) => e.key === 'Enter' && handleSendCode()}
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  onclick={handleSendCode}
                  disabled={worker.connecting || !phoneInput.trim()}
                >
                  {worker.connecting ? '⏳ Sending...' : 'Send Login Code ➔'}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- STEP 2: Code Input -->
        {#if worker.loginPhase === 'WAITING_CODE'}
          <div class="auth-step-card active-step">
            <div class="step-num-badge">2</div>
            <div class="step-body">
              <div class="step-title">Enter Verification Code</div>
              <div class="step-desc">Code sent to <strong>{phoneInput}</strong>. Enter it below to authorize.</div>
              <div class="step-input-row">
                <input
                  type="text"
                  class="form-input step-input code-input"
                  placeholder="e.g. 12345"
                  maxlength="8"
                  bind:value={codeInput}
                  disabled={worker.connecting}
                  onkeydown={(e) => e.key === 'Enter' && handleVerifyCode()}
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  onclick={handleVerifyCode}
                  disabled={worker.connecting || !codeInput.trim()}
                >
                  {worker.connecting ? '⏳ Verifying...' : 'Verify Code & Login ✓'}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- STEP 3: 2FA Password Input -->
        {#if worker.loginPhase === 'WAITING_2FA'}
          <div class="auth-step-card active-step">
            <div class="step-num-badge">3</div>
            <div class="step-body">
              <div class="step-title">Two-Factor Authentication (2FA)</div>
              <div class="step-desc">Your Telegram account has cloud password protection enabled.</div>
              <div class="step-input-row">
                <input
                  type="password"
                  class="form-input step-input"
                  placeholder="Your cloud password"
                  bind:value={passwordInput}
                  disabled={worker.connecting}
                  onkeydown={(e) => e.key === 'Enter' && handleVerify2FA()}
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  onclick={handleVerify2FA}
                  disabled={worker.connecting || !passwordInput.trim()}
                >
                  {worker.connecting ? '⏳ Unlocking...' : 'Unlock Account 🔓'}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- SECTION 2: Worker Operation & Active Job -->
  <div class="card worker-card">
    <div class="card-header">
      <div>
        <div class="flex items-center gap-2">
          <span class="card-icon">⚡</span>
          <h2 class="card-title">Browser Worker Orchestration</h2>
          <span class="job-state-tag state-{worker.jobState.toLowerCase()}">
            {worker.jobState}
          </span>
        </div>
        <p class="card-desc">
          Automates login for all online devices with numbers using your browser Telegram session.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="header-actions">
        {#if worker.status === 'RUNNING'}
          <button type="button" class="btn btn-warning btn-sm" onclick={pauseWorker}>
            ⏸ Pause
          </button>
          <button type="button" class="btn btn-danger-ghost btn-sm" onclick={stopWorker}>
            ⏹ Stop
          </button>
        {:else if worker.status === 'PAUSED'}
          <button type="button" class="btn btn-success btn-sm" onclick={startWorker}>
            ▶ Resume
          </button>
          <button type="button" class="btn btn-danger-ghost btn-sm" onclick={stopWorker}>
            ⏹ Stop
          </button>
        {:else}
          <button
            type="button"
            class="btn btn-success btn-sm"
            onclick={startWorker}
            disabled={!worker.telegramConnected}
            title={!worker.telegramConnected ? 'Connect Telegram account first' : 'Start browser automation'}
          >
            ▶ Start Browser Worker
          </button>
        {/if}
      </div>
    </div>

    <!-- Active Job & Flow Stepper Split -->
    <div class="worker-job-split">
      <!-- LEFT: Active Target Banner -->
      <div class="worker-half">
        <div class="running-device-banner {worker.currentJob ? 'active-test' : ''}">
          <div class="running-indicator">
            <span class="live-dot {worker.currentJob ? 'pulse' : ''}"></span>
            <span class="running-title">Active Device Target</span>
          </div>

          <div class="running-meta-row">
            <div class="running-meta-chip number-chip">
              <span class="chip-label">📱 Target Phone:</span>
              {#if worker.currentJob?.phone}
                <ClickablePhone
                  phone={worker.currentJob.phone}
                  raw={true}
                  className="chip-val phone-highlight"
                  title="Click to copy without country code"
                />
              {:else}
                <span class="chip-val">None (Idle)</span>
              {/if}
            </div>

            <div class="running-meta-chip device-chip">
              <span class="chip-label">💻 Device ID:</span>
              <span class="chip-val mono">{worker.currentJob?.deviceId || '—'}</span>
            </div>

            <div class="running-meta-chip db-chip">
              <span class="chip-label">🗄️ Database:</span>
              <span class="chip-val mono">
                {worker.currentJob?.connName || (worker.currentJob?.database ? worker.currentJob.database.replace('https://', '').split('.')[0] : '—')}
              </span>
            </div>
          </div>

          {#if worker.currentMessage}
            <div class="current-status-banner">
              <span class="status-msg-icon">💬</span>
              <span class="status-msg-text">{worker.currentMessage}</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- RIGHT: State Machine Stepper -->
      <div class="job-half">
        <div class="job-half-header">
          <h3 class="job-half-title">Automation State Machine</h3>
        </div>

        <div class="flow-stepper {worker.currentJob ? '' : 'flow-stepper-idle'}">
          <div class="flow-step {['STARTING', 'MENU_RECEIVED', 'WAITING_NUMBER', 'NUMBER_SUBMITTED', 'WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'done' : ''}">
            <span class="step-num">1</span>
            <span class="step-text">Dispatch</span>
          </div>
          <div class="flow-line {['MENU_RECEIVED', 'WAITING_NUMBER', 'NUMBER_SUBMITTED', 'WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'active' : ''}"></div>
          <div class="flow-step {['MENU_RECEIVED', 'WAITING_NUMBER', 'NUMBER_SUBMITTED', 'WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'done' : ''}">
            <span class="step-num">2</span>
            <span class="step-text">OTP Menu</span>
          </div>
          <div class="flow-line {['NUMBER_SUBMITTED', 'WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'active' : ''}"></div>
          <div class="flow-step {['NUMBER_SUBMITTED', 'WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'done' : ''}">
            <span class="step-num">3</span>
            <span class="step-text">Submit No.</span>
          </div>
          <div class="flow-line {['WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? 'active' : ''}"></div>
          <div class="flow-step {['WAITING_OTP', 'VERIFYING'].includes(worker.jobState) ? (worker.jobState === 'WAITING_OTP' ? 'active-pulse' : 'done') : ''}">
            <span class="step-num">4</span>
            <span class="step-text">Wait OTP</span>
          </div>
          <div class="flow-line {worker.jobState === 'VERIFYING' ? 'active' : ''}"></div>
          <div class="flow-step {worker.jobState === 'VERIFYING' ? 'active-pulse' : ''}">
            <span class="step-num">5</span>
            <span class="step-text">Verify</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Bot Action Controls -->
    <div class="worker-controls-bar">
      <div class="worker-btn-group">
        <button
          type="button"
          class="btn btn-warning-ghost btn-xs"
          onclick={sendBotStart}
          disabled={!worker.telegramConnected}
          title="Send /start to Telegram bot"
        >
          ⚡ Send /start
        </button>
        <button
          type="button"
          class="btn btn-danger-ghost btn-xs"
          onclick={sendBotCancel}
          disabled={!worker.telegramConnected}
          title="Send /cancel to reset bot conversation"
        >
          🛑 Send /cancel
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-xs"
          onclick={skipCurrentDevice}
          disabled={!worker.currentJob}
          title="Skip current number and advance to next candidate"
        >
          ⏭ Skip Number
        </button>
      </div>

      <!-- Direct Telegram Bot Command Bar -->
      <div class="direct-command-row">
        <input
          type="text"
          class="direct-cmd-input"
          placeholder="Send custom message/command to @{worker.config.botUsername.replace(/^@/, '')}..."
          bind:value={botCmdInput}
          disabled={!worker.telegramConnected}
          onkeydown={(e) => e.key === 'Enter' && handleSendDirectCmd()}
        />
        <button
          type="button"
          class="btn btn-primary btn-xs direct-cmd-btn"
          onclick={handleSendDirectCmd}
          disabled={!worker.telegramConnected || !botCmdInput.trim()}
        >
          Send to Bot ➔
        </button>
      </div>
    </div>
  </div>

  <!-- SECTION 3: Stats Counters Row -->
  <div class="stats-row">
    <div class="stat-card">
      <span class="stat-num text-cyan">{worker.stats.processed}</span>
      <span class="stat-title">Processed</span>
    </div>
    <div class="stat-card">
      <span class="stat-num text-emerald">{worker.stats.success}</span>
      <span class="stat-title">Verified (Success)</span>
    </div>
    <div class="stat-card">
      <span class="stat-num text-rose">{worker.stats.failed}</span>
      <span class="stat-title">Failed / Rejected</span>
    </div>
    <div class="stat-card">
      <span class="stat-num text-amber">{worker.stats.timeout}</span>
      <span class="stat-title">OTP Timeout</span>
    </div>
    <div class="stat-card">
      <span class="stat-num text-purple">{formatElapsed(worker.elapsed)}</span>
      <span class="stat-title">Elapsed Time</span>
    </div>
  </div>

  <!-- SECTION 4: Tabs for Live Logs and Processed History -->
  <div class="card worker-card">
    <div class="logs-header-tabs">
      <div class="sub-tabs">
        <button
          type="button"
          class="sub-tab-btn {activeTab === 'console' ? 'active' : ''}"
          onclick={() => activeTab = 'console'}
        >
          Live Console Stream ({worker.logs.length})
        </button>
        <button
          type="button"
          class="sub-tab-btn {activeTab === 'history' ? 'active' : ''}"
          onclick={() => activeTab = 'history'}
        >
          Session Processed Numbers ({processedArray.length})
        </button>
      </div>

      <div class="sub-tab-actions">
        {#if activeTab === 'console'}
          <label class="auto-scroll-label">
            <input type="checkbox" bind:checked={autoScrollLogs} />
            <span>Auto-scroll</span>
          </label>
          <button type="button" class="btn btn-ghost btn-xs" onclick={clearWorkerLogs}>
            Clear Logs
          </button>
        {:else}
          <button type="button" class="btn btn-ghost btn-xs" onclick={resetProcessedNumbers}>
            Clear History
          </button>
        {/if}
      </div>
    </div>

    <!-- SUB-TAB 1: Live Console Stream -->
    {#if activeTab === 'console'}
      <div class="terminal-log-viewer" bind:this={logsContainer}>
        {#if worker.logs.length === 0}
          <div class="log-empty-state">
            <span class="log-empty-icon">📟</span>
            <span>Console ready. Start the worker or connect Telegram to view real-time events.</span>
          </div>
        {:else}
          {#each worker.logs as log (log.id)}
            <div class="log-row log-{log.type || 'info'}">
              <span class="log-ts">{log.ts}</span>
              <span class="log-badge-type">[{log.type.toUpperCase()}]</span>
              <span class="log-msg">{log.msg}</span>
            </div>
          {/each}
        {/if}
      </div>

    <!-- SUB-TAB 2: Session Processed Numbers -->
    {:else}
      <div class="processed-table-wrapper">
        {#if processedArray.length === 0}
          <div class="log-empty-state">
            <span class="log-empty-icon">📋</span>
            <span>No numbers processed in this browser session yet.</span>
          </div>
        {:else}
          <table class="data-table">
            <thead>
              <tr>
                <th>Phone Number</th>
                <th>Status</th>
                <th>Device ID</th>
                <th>Details / Reason</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {#each processedArray as item}
                <tr>
                  <td>
                    <ClickablePhone phone={item.phone} raw={true} className="font-bold text-cyan" />
                  </td>
                  <td>
                    <span class="status-badge status-{item.status}">
                      {item.status}
                    </span>
                  </td>
                  <td class="mono text-xs">{item.deviceId || '—'}</td>
                  <td class="text-sm">{item.reason || item.status}</td>
                  <td class="mono text-xs text-muted">
                    {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-worker-tab {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
  }

  .feature-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%);
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    flex-wrap: wrap;
    gap: 16px;
  }

  .feature-banner-content {
    max-width: 800px;
  }

  .feature-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .feature-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }

  .feature-title {
    margin: 0 0 6px 0;
    font-size: 18px;
    font-weight: 700;
    color: #f8fafc;
  }

  .feature-desc {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .mode-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }

  .mode-status-pill.status-idle {
    background: rgba(148, 163, 184, 0.12);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #cbd5e1;
  }

  .mode-status-pill.status-running {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #4ade80;
  }

  .mode-status-pill.status-paused {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.4);
    color: #facc15;
  }

  .mode-status-pill.status-stopped {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  .status-dot.pulse {
    animation: dot-pulse 1.5s infinite;
  }

  @keyframes dot-pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
    70% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  }

  .card-icon {
    font-size: 18px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    color: #4ade80;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .badge-warning {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.35);
    color: #facc15;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .badge-muted {
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .api-config-box {
    background: rgba(15, 23, 42, 0.6);
    border: 1px dashed rgba(56, 189, 248, 0.3);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .config-grid-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .tg-connected-profile {
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 10px;
    padding: 16px;
  }

  .tg-avatar-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
  }

  .tg-profile-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tg-profile-name {
    font-size: 15px;
    font-weight: 600;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tg-username {
    color: #38bdf8;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
  }

  .tg-profile-sub {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .meta-tag {
    font-size: 12px;
    color: #94a3b8;
  }

  /* Login Flow */
  .login-flow-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .auth-step-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 16px 20px;
  }

  .auth-step-card.active-step {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.04);
  }

  .step-num-badge {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #0284c7;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-body {
    flex: 1;
  }

  .step-title {
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
    margin-bottom: 4px;
  }

  .step-desc {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 12px;
  }

  .step-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 480px;
  }

  .step-input {
    flex: 1;
  }

  .code-input {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    letter-spacing: 4px;
    text-align: center;
    max-width: 160px;
  }

  /* Current status banner */
  .current-status-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 6px;
    font-size: 12px;
    color: #bae6fd;
  }

  .status-msg-icon {
    font-size: 14px;
  }

  .status-msg-text {
    font-family: 'JetBrains Mono', monospace;
  }

  /* Stats Row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }

  .stat-card {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .stat-num {
    font-size: 24px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }

  .stat-title {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 4px;
  }

  /* Sub Tabs in Card */
  .logs-header-tabs {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .sub-tabs {
    display: flex;
    gap: 8px;
  }

  .sub-tab-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sub-tab-btn.active {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .sub-tab-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .auto-scroll-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #94a3b8;
    cursor: pointer;
  }

  .terminal-log-viewer {
    background: #060910;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 12px;
    max-height: 380px;
    min-height: 220px;
    overflow-y: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .log-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #64748b;
    gap: 8px;
  }

  .log-empty-icon {
    font-size: 24px;
  }

  .log-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    line-height: 1.5;
  }

  .log-ts {
    color: #64748b;
    flex-shrink: 0;
  }

  .log-badge-type {
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .log-info { color: #94a3b8; }
  .log-info .log-badge-type { color: #38bdf8; }

  .log-step { color: #bae6fd; }
  .log-step .log-badge-type { color: #0284c7; }

  .log-success { color: #4ade80; }
  .log-success .log-badge-type { color: #22c55e; }

  .log-warn { color: #facc15; }
  .log-warn .log-badge-type { color: #eab308; }

  .log-error { color: #f87171; }
  .log-error .log-badge-type { color: #ef4444; }

  .processed-table-wrapper {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .data-table th {
    text-align: left;
    padding: 10px 12px;
    background: rgba(15, 23, 42, 0.6);
    color: #94a3b8;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .data-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .status-badge.status-successful,
  .status-badge.status-success {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.35);
  }

  .status-badge.status-expired,
  .status-badge.status-timeout {
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.35);
  }

  .status-badge.status-failed,
  .status-badge.status-suspended {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }

  .status-badge.status-skipped {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }
</style>
