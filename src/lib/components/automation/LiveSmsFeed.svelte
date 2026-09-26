<script>
  import { autoEngine } from '$lib/automation-engine.svelte.js';
  import { copyText } from '$lib/utils/clipboard.js';
  import ClickablePhone from '$lib/components/common/ClickablePhone.svelte';

  let {
    filteredSmsNotifications = [],
    dashboardNotifs = [],
    smsSearchKeyword = $bindable(''),
    smsFilterMode = $bindable('all'),
    onsync,
    onclear,
    onpastetosend,
    ondirectsendtobot,
    isTargetMatch,
    formatNotifTime
  } = $props();
</script>

<!-- ═══ ROW 4: Live SMS & OTP Feed (Full Width) ═══ -->
<div class="card full-width sms-intercept-card">
  <div class="card-header">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="card-title">Live SMS & OTP Feed (Dashboard Sync)</h2>
        <span class="feed-count-badge" title="Active incoming messages from Firebase">
          {filteredSmsNotifications.length} SMS
        </span>
        {#if autoEngine.currentJob?.phone || autoEngine.workerStatus.phone}
          <span class="feed-target-badge" title="Currently targeting this phone number">
            🎯 Target: {autoEngine.currentJob?.phone || autoEngine.workerStatus.phone}
          </span>
        {/if}
      </div>
      <p class="card-desc">
        Live stream of incoming Firebase messages. Search/filter by keyword, copy OTP, or click <strong>Paste to Send</strong> to inject into bot command box.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <button class="btn btn-secondary btn-xs" onclick={onsync} title="Refresh incoming SMS now">
        Sync SMS ↺
      </button>
      <button class="btn btn-ghost btn-xs" onclick={onclear} title="Clear displayed notifications list">
        Clear Feed
      </button>
    </div>
  </div>

  <!-- Instant Keyword Filter & Quick Pills Bar -->
  <div class="sms-filter-toolbar">
    <div class="sms-search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        class="sms-keyword-input"
        placeholder="Filter SMS by keyword (swiggy, otp, phone, code, sender)..."
        bind:value={smsSearchKeyword}
      />
      {#if smsSearchKeyword}
        <button class="clear-search-btn" onclick={() => smsSearchKeyword = ''} title="Clear filter">✕</button>
      {/if}
    </div>

    <div class="sms-filter-pills">
      <button
        class="pill-btn {smsFilterMode === 'all' ? 'active' : ''}"
        onclick={() => smsFilterMode = 'all'}
      >
        All Messages ({dashboardNotifs.length})
      </button>
      <button
        class="pill-btn {smsFilterMode === 'swiggy' ? 'active' : ''}"
        onclick={() => { smsFilterMode = 'swiggy'; if (!smsSearchKeyword) smsSearchKeyword = 'swiggy'; }}
      >
        🔥 Swiggy Only
      </button>
      <button
        class="pill-btn {smsFilterMode === 'otp' ? 'active' : ''}"
        onclick={() => smsFilterMode = 'otp'}
      >
        🔑 Has OTP Code
      </button>
      {#if autoEngine.currentJob?.phone || autoEngine.workerStatus.phone}
        <button
          class="pill-btn {smsFilterMode === 'target' ? 'active' : ''}"
          onclick={() => {
            smsFilterMode = 'target';
            smsSearchKeyword = autoEngine.currentJob?.phone || autoEngine.workerStatus.phone;
          }}
        >
          📱 Active Target ({autoEngine.currentJob?.phone || autoEngine.workerStatus.phone})
        </button>
      {/if}
    </div>
  </div>

  <!-- SMS Notification Items Scrollable Container -->
  <div class="sms-feed-list">
    {#if filteredSmsNotifications.length === 0}
      <div class="sms-feed-empty">
        <span class="empty-icon">📨</span>
        <p>No incoming SMS matched the filter {smsSearchKeyword ? `"${smsSearchKeyword}"` : ''}.</p>
        <span class="text-xs text-muted">
          New verification messages arriving across any connected Firebase database will stream here automatically.
        </span>
      </div>
    {:else}
      {#each filteredSmsNotifications as notif (notif.id || notif.msgId || (notif.sender + notif.message + (notif.createdAt || notif.ts)))}
        <div class="sms-item-card {isTargetMatch(notif) ? 'highlight-target' : ''}">
          <div class="sms-item-header">
            <div class="sms-sender-info">
              <span class="sms-sender-badge">{notif.sender || 'UNKNOWN SENDER'}</span>
              {#if notif.about}
                <span class="sms-about-tag">{notif.about}</span>
              {/if}
              {#if notif.phone || notif.targetPhone}
                <ClickablePhone
                  phone={notif.phone || notif.targetPhone}
                  className="sms-phone-tag"
                  title="Click to copy without country code"
                />
              {/if}
              {#if notif.devKey || notif.deviceId}
                <span class="sms-dev-tag mono" title={notif.devKey || notif.deviceId}>
                  💻 {(notif.devKey || notif.deviceId || '').slice(0, 14)}…
                </span>
              {/if}
              {#if isTargetMatch(notif)}
                <span class="target-match-tag">🎯 Active Test Match</span>
              {/if}
            </div>

            <div class="sms-time-info">
              <span class="sms-time">{formatNotifTime(notif.ts || notif.createdAt)}</span>
            </div>
          </div>

          <div class="sms-item-body">
            <div class="sms-text-content">
              {notif.message}
            </div>

            {#if notif.otp}
              <div class="sms-otp-badge-block">
                <span class="otp-label">DETECTED OTP CODE:</span>
                <span class="otp-number">{notif.otp}</span>
              </div>
            {/if}
          </div>

          <!-- Quick Action Buttons -->
          <div class="sms-item-actions">
            {#if notif.otp}
              <button
                class="btn btn-primary btn-xs action-btn-paste"
                onclick={() => onpastetosend(notif.otp)}
                title="Paste OTP directly into the 'Send to Bot' input field and focus"
              >
                ⚡ Paste OTP to Send Box
              </button>

              <button
                class="btn btn-warning-ghost btn-xs"
                onclick={() => ondirectsendtobot(notif.otp)}
                title="Directly dispatch OTP to Telegram bot immediately"
              >
                🚀 Send OTP to Bot Now
              </button>

              <button
                class="btn btn-secondary btn-xs"
                onclick={() => copyText(notif.otp)}
                title="Copy OTP digits to clipboard"
              >
                📋 Copy OTP ({notif.otp})
              </button>
            {/if}

            <button
              class="btn btn-secondary btn-xs"
              onclick={() => copyText(notif.message)}
              title="Copy full SMS text"
            >
              📄 Copy Full SMS
            </button>

            {#if !notif.otp}
              <button
                class="btn btn-secondary btn-xs"
                onclick={() => onpastetosend(notif.message)}
                title="Paste message into Send to Bot input"
              >
                ⚡ Paste Text to Send Box
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
