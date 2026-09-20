<script>
  import '../../app.css';
  import {
    engine,
    allDevices as _allDevices, onlineDevices as _onlineDevices,
    withNumber as _withNumber, withoutNumber as _withoutNumber,
    discoveredCount as _discoveredCount, failedCount as _failedCount,
    tomorrowCount as _tomorrowCount, processingCount as _processingCount,
    progressPct as _progressPct, skippedCount as _skippedCount,
    getDisplayPhone, getDiscoveredPhone,
    initEngine, startDiscovery, pauseDiscovery, stopDiscovery,
    retryFailed, retryTomorrow, refreshDevices, setMaxWorkers,
    clearLog, clearRecords, downloadJson, fetchAllDevices, formatElapsed,
    skipTarget, unskipTarget, unskipAll, manualAssignNumber, sendManualSms,
  } from '$lib/discovery-engine.svelte.js';
  import { extractNumber } from '$lib/device-helpers.js';
  import { onMount } from 'svelte';

  // Local reactive bindings from engine getter functions
  let onlineDevices = $derived(_onlineDevices());
  let withNumber = $derived(_withNumber());
  let withoutNumber = $derived(_withoutNumber());
  let discoveredCount = $derived(_discoveredCount());
  let failedCount = $derived(_failedCount());
  let tomorrowCount = $derived(_tomorrowCount());
  let processingCount = $derived(_processingCount());
  let progressPct = $derived(_progressPct());
  let skippedCount = $derived(_skippedCount());

  // ── Manual action form state ────────────────────────────────────────────
  let manualDeviceKey = $state('');
  let manualPhone = $state('');
  let smsFromDevice = $state('');
  let smsFromConn = $state('');
  let smsToPhone = $state('');
  let smsMessage = $state('');
  let smsSending = $state(false);

  // ── Local UI state ──────────────────────────────────────────────────────
  let toasts = $state([]);
  function toast(msg, type = 'info') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.map(t => t.id === id ? { ...t, out: true } : t);
      setTimeout(() => toasts = toasts.filter(t => t.id !== id), 400);
    }, 3500);
  }

  function copyText(txt) {
    const s = String(txt ?? '');
    if (!s) return;
    try { navigator.clipboard.writeText(s); } catch {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.cssText = 'position:fixed;opacity:0;top:-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
  }

  function confirmClearRecords() {
    if (!confirm('Clear all local discovery records? This cannot be undone.')) return;
    clearRecords();
    toast('Records cleared', 'info');
  }

  function handleDownload() {
    downloadJson();
    toast('JSON exported', 'success');
  }

  onMount(() => {
    initEngine();
  });

  // ── Derived UI helpers ──────────────────────────────────────────────────
  const stateLabels = {
    IDLE: 'Idle', RUNNING: 'Running', PAUSED: 'Paused',
    STOPPED: 'Stopped', COMPLETED: 'Completed', NO_PROGRESS: 'No Progress',
  };
  const stateColors = {
    IDLE: '#64748b', RUNNING: '#22c55e', PAUSED: '#a78bfa',
    STOPPED: '#64748b', COMPLETED: '#22c55e', NO_PROGRESS: '#fb7185',
  };
  const workerStatusColors = {
    idle: '#64748b', starting: '#38bdf8', selecting: '#fbbf24',
    sending: '#f97316', waiting: '#a78bfa', stopped: '#475569',
  };

  function getDailyCount(key) {
    const entry = engine.dailyAttempts[key];
    if (!entry || entry.date !== new Date().toISOString().split('T')[0]) return 0;
    return entry.count;
  }

  function getTargetStatus(key) {
    if (engine.records.find(r => r.deviceId === key && r.status === 'discovered')) return 'discovered';
    if (engine.lockedTargets.includes(key)) return 'processing';
    if (engine.skippedTargets.includes(key)) return 'skipped';
    if (engine.tryTomorrow.includes(key)) return 'tomorrow';
    if (engine.failedTargets.includes(key)) return 'failed';
    return 'pending';
  }

  function getTriedCount(key) {
    return (engine.triedReceivers[key] ?? []).length;
  }
  async function handleManualSms() {
    if (!smsFromDevice || !smsToPhone) return;
    smsSending = true;
    try {
      await sendManualSms(smsFromDevice, smsFromConn, smsToPhone, smsMessage || smsFromDevice);
      toast('SMS sent!', 'success');
    } catch (e) {
      toast(`SMS failed: ${e.message}`, 'error');
    } finally {
      smsSending = false;
    }
  }

  function handleManualAssign() {
    if (!manualDeviceKey || !manualPhone) return;
    try {
      const dev = [...withoutNumber, ...onlineDevices].find(d => d.key === manualDeviceKey);
      manualAssignNumber(manualDeviceKey, manualPhone, dev?.connId ?? '', dev?.conn?.name ?? '');
      toast(`Number assigned to ${manualDeviceKey.slice(0, 12)}…`, 'success');
      manualDeviceKey = '';
      manualPhone = '';
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<svelte:head>
  <title>Device Number Discovery — PD Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
</svelte:head>

<div class="disco-shell">
  <!-- Header -->
  <header class="disco-header">
    <div class="dh-left">
      <a href="/" class="dh-back" title="Back to Dashboard">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </a>
      <div class="dh-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8">
          <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
          <line x1="2" y1="20" x2="2.01" y2="20"/>
        </svg>
        <span>Device Discovery</span>
      </div>
      {#if engine.status === 'RUNNING'}
        <span class="dh-running-pill">
          <span class="dh-pulse"></span>
          {formatElapsed(engine.elapsed)}
        </span>
      {/if}
    </div>
    <div class="dh-right">
      <span class="dh-state" style="color:{stateColors[engine.status]}">
        <span class="dh-dot" style="background:{stateColors[engine.status]}"></span>
        {stateLabels[engine.status]}
      </span>
    </div>
  </header>

  <!-- Summary Cards -->
  <div class="disco-cards">
    <div class="dc-card">
      <div class="dc-n">{onlineDevices.length}</div>
      <div class="dc-l">Online</div>
    </div>
    <div class="dc-card dc-c-blue">
      <div class="dc-n">{withNumber.length}</div>
      <div class="dc-l">With Numbers</div>
    </div>
    <div class="dc-card dc-c-amber">
      <div class="dc-n">{withoutNumber.length}</div>
      <div class="dc-l">Missing</div>
    </div>
    <div class="dc-card dc-c-green">
      <div class="dc-n">{discoveredCount}</div>
      <div class="dc-l">Discovered</div>
    </div>
    <div class="dc-card dc-c-red">
      <div class="dc-n">{failedCount}</div>
      <div class="dc-l">Failed</div>
    </div>
    <div class="dc-card dc-c-orange">
      <div class="dc-n">{tomorrowCount}</div>
      <div class="dc-l">Tomorrow</div>
    </div>
    <div class="dc-card dc-c-purple">
      <div class="dc-n">{processingCount}</div>
      <div class="dc-l">Processing</div>
    </div>
  </div>

  <!-- Quick Nav -->
  <div class="disco-quicknav">
    <button class="qn-btn" onclick={() => scrollTo('sec-manual')}>✏️ Manual</button>
    <button class="qn-btn" onclick={() => scrollTo('sec-sendsms')}>📤 Send SMS</button>
    <button class="qn-btn" onclick={() => scrollTo('sec-devices')}>📱 Devices</button>
    <button class="qn-btn" onclick={() => scrollTo('sec-records')}>✅ Records</button>
    <button class="qn-btn" onclick={() => scrollTo('sec-log')}>📊 Log</button>
    {#if engine.workers.length > 0}
      <button class="qn-btn" onclick={() => scrollTo('sec-workers')}>⚙ Workers</button>
    {/if}
  </div>

  <!-- Controls -->
  <div class="disco-controls">
    <div class="dc-btns">
      {#if ['IDLE', 'STOPPED', 'COMPLETED', 'NO_PROGRESS'].includes(engine.status)}
        <button class="dbtn dbtn-primary" onclick={startDiscovery} disabled={engine.devicesLoading}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Start Discovery
        </button>
      {/if}
      {#if engine.status === 'PAUSED'}
        <button class="dbtn dbtn-primary" onclick={startDiscovery}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume
        </button>
      {/if}
      {#if engine.status === 'RUNNING'}
        <button class="dbtn dbtn-warn" onclick={pauseDiscovery}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pause
        </button>
      {/if}
      {#if engine.status !== 'IDLE' && engine.status !== 'STOPPED'}
        <button class="dbtn dbtn-danger" onclick={stopDiscovery}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          Stop
        </button>
      {/if}
      <button class="dbtn dbtn-ghost" onclick={retryFailed} disabled={failedCount === 0}>↻ Retry Failed</button>
      {#if tomorrowCount > 0}
        <button class="dbtn dbtn-ghost" onclick={() => { retryTomorrow(); toast('Tomorrow queue cleared', 'info'); }}>📅 Retry Tomorrow ({tomorrowCount})</button>
      {/if}
      <button class="dbtn dbtn-ghost" onclick={() => refreshDevices().then(() => toast('Refreshed', 'info'))} disabled={engine.devicesLoading}>
        {#if engine.devicesLoading}<span class="dspin"></span>{:else}↻{/if} Refresh
      </button>
      <button class="dbtn dbtn-ghost" onclick={handleDownload} disabled={engine.records.length === 0}>📥 JSON</button>
      <button class="dbtn dbtn-ghost dbtn-sm-danger" onclick={confirmClearRecords} disabled={engine.records.length === 0}>🗑</button>
    </div>

    <!-- Workers + Progress Row -->
    <div class="dc-row2">
      <div class="dc-workers-ctl">
        <label class="dc-wlabel">Workers</label>
        <input type="range" min="1" max="10" step="1" value={engine.maxWorkers}
          oninput={(e) => setMaxWorkers(parseInt(e.target.value))}
          class="dc-wslider" />
        <span class="dc-wcount">{engine.maxWorkers}</span>
      </div>
      <div class="dc-dailylimit">
        <label class="dc-wlabel">Daily Limit</label>
        <input type="number" min="1" max="20" value={engine.config.maxDailyAttempts}
          onchange={(e) => { engine.config.maxDailyAttempts = Math.max(1, Math.min(20, parseInt(e.target.value) || 6)); }}
          class="dc-dlimit-input" />
      </div>
      {#if withoutNumber.length > 0 || discoveredCount > 0}
        <div class="dc-progress-wrap">
          <div class="dc-progress-bar">
            <div class="dc-progress-fill" style="width:{progressPct}%"></div>
          </div>
          <span class="dc-progress-lbl">{progressPct}%</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Worker Pool Visualization -->
  {#if engine.workers.length > 0}
    <div class="disco-workers" id="sec-workers">
      <div class="dw-hdr">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        Workers
        <span class="dl-cnt">{engine.workers.filter(w => !['idle','stopped'].includes(w.status)).length}/{engine.workers.length}</span>
      </div>
      <div class="dw-grid">
        {#each engine.workers as w (w.id)}
          <div class="dw-card {['idle','stopped'].includes(w.status) ? 'dw-idle' : 'dw-active'}">
            <div class="dw-top">
              <span class="dw-wid" style="color:{workerStatusColors[w.status] ?? '#64748b'}">W{w.id}</span>
              <span class="dw-status" style="color:{workerStatusColors[w.status] ?? '#64748b'}">{w.status}</span>
              {#if w.status === 'waiting' || w.status === 'sending'}
                <span class="dspin dspin-sm"></span>
              {/if}
            </div>
            {#if w.targetKey}
              <div class="dw-info">
                <span class="dw-label">Target</span>
                <code class="dw-val">{w.targetKey.slice(0, 12)}…</code>
                <span class="dw-conn">{w.targetConn}</span>
              </div>
            {/if}
            {#if w.receiverKey}
              <div class="dw-info">
                <span class="dw-label">Recv</span>
                <code class="dw-val">{w.receiverKey.slice(0, 12)}…</code>
                {#if w.receiverPhone}<span class="dw-phone">{w.receiverPhone}</span>{/if}
              </div>
            {/if}
            {#if w.message && !['idle','stopped'].includes(w.status)}
              <div class="dw-msg">{w.message}</div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Device Lists -->
  <div class="disco-lists" id="sec-devices">
    <!-- With Numbers (Receivers) -->
    <div class="dl-panel">
      <div class="dl-hdr dl-hdr-blue">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.88.36 1.72.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c1.09.34 1.93.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Receivers (With Numbers)
        <span class="dl-cnt">{withNumber.length}</span>
      </div>
      <div class="dl-body">
        {#if engine.devicesLoading && withNumber.length === 0}
          <div class="dl-empty"><span class="dspin"></span> Loading…</div>
        {:else if withNumber.length === 0}
          <div class="dl-empty">No online devices with known numbers</div>
        {:else}
          {#each withNumber as d (d.connId + '::' + d.key)}
            {@const phone = getDisplayPhone(d.connId, d.key, d.info) || getDiscoveredPhone(d.key)}
            {@const isLocked = engine.lockedReceivers.includes(d.key)}
            <div class="dl-row {isLocked ? 'dl-row-active' : ''}">
              <div class="dl-row-main">
                <button class="dl-id" onclick={() => { copyText(d.key); toast(`${d.key} copied`, 'success'); }}>{d.key.slice(0, 14)}</button>
                <button class="dl-phone" onclick={() => { copyText(extractNumber(phone)); toast('Copied', 'success'); }}>{extractNumber(phone) || phone}</button>
              </div>
              <div class="dl-row-meta">
                <span class="dl-dot dl-dot-on"></span>
                <span class="dl-conn" style="color:{d.conn.color}">{d.conn.name}</span>
                {#if isLocked}<span class="dl-badge dl-badge-active">In Use</span>{/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Without Numbers (Targets) -->
    <div class="dl-panel">
      <div class="dl-hdr dl-hdr-amber">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Targets (Missing Numbers)
        <span class="dl-cnt">{withoutNumber.length}</span>
      </div>
      <div class="dl-body">
        {#if engine.devicesLoading && withoutNumber.length === 0}
          <div class="dl-empty"><span class="dspin"></span> Loading…</div>
        {:else if withoutNumber.length === 0}
          <div class="dl-empty">All online devices have phone numbers 🎉</div>
        {:else}
          {#each withoutNumber as d (d.connId + '::' + d.key)}
            {@const st = getTargetStatus(d.key)}
            {@const tried = getTriedCount(d.key)}
            {@const daily = getDailyCount(d.key)}
            <div class="dl-row {st === 'processing' ? 'dl-row-active' : ''} {st === 'discovered' ? 'dl-row-ok' : ''} {st === 'failed' ? 'dl-row-err' : ''} {st === 'tomorrow' ? 'dl-row-tomorrow' : ''} {st === 'skipped' ? 'dl-row-skipped' : ''}">
              <div class="dl-row-main">
                <button class="dl-id" onclick={() => { copyText(d.key); toast(`${d.key} copied`, 'success'); }}>{d.key.slice(0, 14)}</button>
                {#if st === 'discovered'}
                  {@const phone = getDiscoveredPhone(d.key)}
                  <span class="dl-phone dl-phone-found">{phone}</span>
                {:else if st === 'tomorrow'}
                  <span class="dl-status dl-status-tomorrow">📅 tomorrow</span>
                {:else if st === 'skipped'}
                  <span class="dl-status dl-status-skipped">⏭ skipped</span>
                {:else}
                  <span class="dl-status dl-status-{st}">{st}</span>
                {/if}
                {#if st !== 'discovered' && st !== 'processing'}
                  {#if st === 'skipped'}
                    <button class="dl-skip-btn dl-unskip" onclick={() => unskipTarget(d.key)} title="Un-skip">↩</button>
                  {:else}
                    <button class="dl-skip-btn" onclick={() => skipTarget(d.key)} title="Skip this device">⏭</button>
                  {/if}
                {/if}
              </div>
              <div class="dl-row-meta">
                <span class="dl-dot dl-dot-on"></span>
                <span class="dl-conn" style="color:{d.conn.color}">{d.conn.name}</span>
                {#if tried > 0}<span class="dl-usage">{tried} tried</span>{/if}
                {#if daily > 0}<span class="dl-daily">{daily}/{engine.config.maxDailyAttempts}</span>{/if}
                {#if st === 'processing'}<span class="dl-badge dl-badge-processing"><span class="dspin dspin-sm"></span></span>{/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <!-- Try Tomorrow List -->
  {#if engine.tryTomorrow.length > 0}
    <div class="disco-tomorrow">
      <div class="dt-hdr">
        📅 Try Tomorrow
        <span class="dl-cnt">{engine.tryTomorrow.length}</span>
        <button class="dlog-clear" onclick={() => { retryTomorrow(); toast('Cleared', 'info'); }}>Reset All</button>
      </div>
      <div class="dt-body">
        {#each engine.tryTomorrow as key (key)}
          <div class="dt-row">
            <code class="dt-id">{key}</code>
            <span class="dt-info">{getDailyCount(key)}/{engine.config.maxDailyAttempts} attempts today</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Discovery Records -->
  {#if engine.records.length > 0}
    <div class="disco-records" id="sec-records">
      <div class="dr-hdr">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Discovery Records
        <span class="dl-cnt">{engine.records.length}</span>
      </div>
      <div class="dr-body">
        {#each engine.records as rec (rec.deviceId + rec.discoveredAt)}
          <div class="dr-row">
            <div class="dr-main">
              <code class="dr-devid">{rec.deviceId}</code>
              <span class="dr-arrow">→</span>
              <code class="dr-phone">{rec.phoneNumber}</code>
            </div>
            <div class="dr-meta">
              <span class="dr-conn">{rec.connectionName}</span>
              <span class="dr-via">via {rec.receiverDeviceId?.slice(0, 10)}…</span>
              <span class="dr-at">{new Date(rec.discoveredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              <span class="dr-attempts">{rec.attemptCount}×</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Activity Log -->
  <div class="disco-log" id="sec-log">
    <div class="dlog-hdr">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Activity Log
      {#if engine.log.length > 0}
        <button class="dlog-clear" onclick={clearLog}>Clear</button>
      {/if}
    </div>
    <div class="dlog-body">
      {#if engine.log.length === 0}
        <div class="dlog-empty">No activity yet. Start discovery to see live events.</div>
      {:else}
        {#each engine.log as entry (entry.id)}
          <div class="dlog-row dlog-{entry.type}">
            <span class="dlog-ts">{entry.ts}</span>
            <span class="dlog-msg">{entry.msg}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Manual Actions -->
  <div class="disco-manual" id="sec-manual">
    <div class="dm-hdr">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Manual Actions
    </div>
    <div class="dm-body">
      <!-- Assign Number -->
      <div class="dm-section">
        <div class="dm-title">✏️ Assign Number Manually</div>
        <div class="dm-form">
          <select class="dm-select" bind:value={manualDeviceKey}>
            <option value="">Select device…</option>
            {#each withoutNumber as d (d.key)}
              <option value={d.key}>{d.key.slice(0, 16)} ({d.conn.name})</option>
            {/each}
          </select>
          <input type="tel" class="dm-input" bind:value={manualPhone} placeholder="Phone number" />
          <button class="dbtn dbtn-primary dbtn-sm" onclick={handleManualAssign} disabled={!manualDeviceKey || !manualPhone}>Save</button>
        </div>
      </div>

      <!-- Send SMS -->
      <div class="dm-section" id="sec-sendsms">
        <div class="dm-title">📤 Send SMS from Device</div>
        <div class="dm-form">
          <select class="dm-select" bind:value={smsFromDevice} onchange={(e) => {
            const dev = [...onlineDevices].find(d => d.key === e.target.value);
            if (dev) smsFromConn = dev.connId;
          }}>
            <option value="">From device…</option>
            {#each onlineDevices as d (d.key)}
              <option value={d.key}>{d.key.slice(0, 16)} ({d.conn.name})</option>
            {/each}
          </select>
          <input type="tel" class="dm-input" bind:value={smsToPhone} placeholder="To phone number" />
          <input type="text" class="dm-input dm-input-wide" bind:value={smsMessage} placeholder="Message (default: device ID)" />
          <button class="dbtn dbtn-primary dbtn-sm" onclick={handleManualSms} disabled={!smsFromDevice || !smsToPhone || smsSending}>
            {#if smsSending}<span class="dspin dspin-sm"></span>{:else}Send{/if}
          </button>
        </div>
      </div>

      <!-- Skipped Devices -->
      {#if skippedCount > 0}
        <div class="dm-section">
          <div class="dm-title">⏭ Skipped Devices <span class="dl-cnt">{skippedCount}</span>
            <button class="dlog-clear" onclick={() => { unskipAll(); toast('All un-skipped', 'info'); }}>Un-skip All</button>
          </div>
          <div class="dm-skipped">
            {#each engine.skippedTargets as key (key)}
              <div class="dm-skip-row">
                <code class="dm-skip-id">{key}</code>
                <button class="dm-skip-undo" onclick={() => unskipTarget(key)}>↩ Un-skip</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Toasts -->
<div class="disco-toasts">
  {#each toasts as t (t.id)}
    <div class="dtoast {t.type} {t.out ? 'dtoast-out' : ''}">{t.msg}</div>
  {/each}
</div>

<style>
  .disco-shell {
    min-height: 100vh;
    background: #0b0e17;
    color: #e2e8f0;
    font-family: 'Inter', system-ui, sans-serif;
    padding: 0 0 40px;
  }

  /* Header */
  .disco-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; background: #0e1420;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px);
  }
  .dh-left { display: flex; align-items: center; gap: 10px; }
  .dh-back {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 8px;
    background: rgba(255,255,255,0.05); color: #94a3b8;
    text-decoration: none; transition: all 0.18s;
  }
  .dh-back:hover { background: rgba(56,189,248,0.15); color: #38bdf8; }
  .dh-title { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; }
  .dh-title svg { color: #38bdf8; }
  .dh-running-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; color: #22c55e;
    background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2);
    padding: 2px 10px; border-radius: 12px;
    font-family: 'JetBrains Mono', monospace;
  }
  .dh-pulse {
    width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
    animation: pulse-dot 1.5s ease infinite;
  }
  @keyframes pulse-dot { 0%,100% { opacity:1; box-shadow: 0 0 6px rgba(34,197,94,0.6); } 50% { opacity:0.4; box-shadow: none; } }
  .dh-right { display: flex; align-items: center; }
  .dh-state { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .dh-dot { width: 6px; height: 6px; border-radius: 50%; }

  /* Cards */
  .disco-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; padding: 14px 20px; }
  .dc-card { background: #111a2e; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; text-align: center; transition: border-color 0.18s; }
  .dc-card:hover { border-color: rgba(56,189,248,0.2); }
  .dc-n { font-size: 22px; font-weight: 800; line-height: 1.1; }
  .dc-l { font-size: 9.5px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-top: 3px; }
  .dc-c-blue .dc-n { color: #38bdf8; }  .dc-c-blue { border-color: rgba(56,189,248,0.12); }
  .dc-c-amber .dc-n { color: #fbbf24; }  .dc-c-amber { border-color: rgba(251,191,36,0.12); }
  .dc-c-green .dc-n { color: #22c55e; }  .dc-c-green { border-color: rgba(34,197,94,0.12); }
  .dc-c-red .dc-n { color: #ef4444; }  .dc-c-red { border-color: rgba(239,68,68,0.12); }
  .dc-c-orange .dc-n { color: #f97316; }  .dc-c-orange { border-color: rgba(249,115,22,0.12); }
  .dc-c-purple .dc-n { color: #a78bfa; }  .dc-c-purple { border-color: rgba(167,139,250,0.12); }

  /* Controls */
  .disco-controls { padding: 0 20px 10px; display: flex; flex-direction: column; gap: 8px; }
  .dc-btns { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .dbtn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border: none; border-radius: 7px; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.18s; white-space: nowrap; }
  .dbtn:disabled { opacity: 0.35; cursor: not-allowed; }
  .dbtn-primary { background: linear-gradient(135deg, #0ea5e9, #0369a1); color: #fff; box-shadow: 0 0 14px rgba(14,165,233,0.2); }
  .dbtn-primary:hover:not(:disabled) { box-shadow: 0 0 20px rgba(14,165,233,0.4); transform: translateY(-1px); }
  .dbtn-warn { background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); }
  .dbtn-warn:hover:not(:disabled) { background: rgba(251,191,36,0.2); }
  .dbtn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
  .dbtn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
  .dbtn-ghost { background: #111d35; color: #94a3b8; border: 1px solid rgba(255,255,255,0.07); }
  .dbtn-ghost:hover:not(:disabled) { background: #162040; color: #e2e8f0; border-color: rgba(56,189,248,0.2); }
  .dbtn-sm-danger { color: #fb7185; }

  /* Workers/Progress Row */
  .dc-row2 { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .dc-workers-ctl { display: flex; align-items: center; gap: 6px; }
  .dc-wlabel { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .dc-wslider { width: 80px; accent-color: #38bdf8; cursor: pointer; }
  .dc-wcount { font-size: 13px; font-weight: 700; color: #38bdf8; min-width: 18px; text-align: center; font-family: 'JetBrains Mono', monospace; }
  .dc-dailylimit { display: flex; align-items: center; gap: 6px; }
  .dc-dlimit-input { width: 48px; padding: 3px 6px; font-size: 12px; background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; text-align: center; font-family: 'JetBrains Mono', monospace; }
  .dc-progress-wrap { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 100px; }
  .dc-progress-bar { flex: 1; height: 5px; background: #1e293b; border-radius: 3px; overflow: hidden; }
  .dc-progress-fill { height: 100%; background: linear-gradient(90deg, #0ea5e9, #22c55e); border-radius: 3px; transition: width 0.5s; }
  .dc-progress-lbl { font-size: 10px; color: #64748b; font-weight: 600; font-family: 'JetBrains Mono', monospace; }

  /* Worker Pool */
  .disco-workers { margin: 0 20px 10px; background: #0e1420; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
  .dw-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; padding: 8px; }
  .dw-card { background: #0b0e17; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 8px 10px; font-size: 11px; }
  .dw-active { border-color: rgba(56,189,248,0.15); background: rgba(56,189,248,0.03); }
  .dw-idle { opacity: 0.5; }
  .dw-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .dw-wid { font-weight: 800; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
  .dw-status { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .dw-info { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
  .dw-label { font-size: 9px; color: #475569; font-weight: 600; text-transform: uppercase; min-width: 32px; }
  .dw-val { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; }
  .dw-conn { font-size: 9px; color: #64748b; }
  .dw-phone { font-size: 10px; color: #94a3b8; font-family: 'JetBrains Mono', monospace; }
  .dw-msg { font-size: 9px; color: #475569; margin-top: 3px; font-style: italic; }

  /* Device Lists */
  .disco-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 20px 10px; }
  .dl-panel { background: #0e1420; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .dl-hdr { display: flex; align-items: center; gap: 7px; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dl-hdr-blue { color: #38bdf8; }
  .dl-hdr-amber { color: #fbbf24; }
  .dl-cnt { margin-left: auto; font-size: 10px; background: rgba(255,255,255,0.06); padding: 1px 7px; border-radius: 10px; }
  .dl-body { flex: 1; max-height: 300px; overflow-y: auto; padding: 2px 0; }
  .dl-empty { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 24px 12px; color: #475569; font-size: 11px; }
  .dl-row { padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.02); transition: background 0.15s; }
  .dl-row:hover { background: rgba(255,255,255,0.02); }
  .dl-row-active { background: rgba(56,189,248,0.05) !important; border-left: 3px solid #38bdf8; }
  .dl-row-ok { border-left: 3px solid #22c55e; }
  .dl-row-err { border-left: 3px solid #ef4444; opacity: 0.6; }
  .dl-row-tomorrow { border-left: 3px solid #f97316; opacity: 0.7; }
  .dl-row-main { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
  .dl-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; background: none; border: none; cursor: pointer; padding: 0; text-align: left; }
  .dl-id:hover { color: #38bdf8; text-decoration: underline; }
  .dl-phone { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #94a3b8; margin-left: auto; background: none; border: none; cursor: pointer; padding: 0; }
  .dl-phone:hover { color: #e2e8f0; }
  .dl-phone-found { color: #22c55e !important; font-weight: 600; }
  .dl-status { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-left: auto; }
  .dl-status-pending { color: #64748b; }
  .dl-status-processing { color: #f97316; }
  .dl-status-failed { color: #ef4444; }
  .dl-status-discovered { color: #22c55e; }
  .dl-status-tomorrow { color: #f97316; }
  .dl-row-meta { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #475569; }
  .dl-dot { width: 4px; height: 4px; border-radius: 50%; }
  .dl-dot-on { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,0.4); }
  .dl-conn { font-weight: 500; }
  .dl-usage { color: #64748b; }
  .dl-daily { color: #f97316; font-family: 'JetBrains Mono', monospace; font-size: 9px; }
  .dl-badge { font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; display: inline-flex; align-items: center; gap: 3px; }
  .dl-badge-active { background: rgba(56,189,248,0.12); color: #38bdf8; }
  .dl-badge-processing { background: rgba(249,115,22,0.12); color: #f97316; }

  /* Try Tomorrow */
  .disco-tomorrow { margin: 0 20px 10px; background: #0e1420; border: 1px solid rgba(249,115,22,0.12); border-radius: 10px; overflow: hidden; }
  .dt-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; color: #f97316; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dt-body { max-height: 140px; overflow-y: auto; padding: 4px 0; }
  .dt-row { display: flex; align-items: center; gap: 10px; padding: 4px 14px; font-size: 11px; }
  .dt-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; }
  .dt-info { font-size: 10px; color: #64748b; margin-left: auto; }

  /* Records */
  .disco-records { margin: 0 20px 10px; background: #0e1420; border: 1px solid rgba(34,197,94,0.1); border-radius: 10px; overflow: hidden; }
  .dr-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #22c55e; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dr-body { max-height: 180px; overflow-y: auto; }
  .dr-row { padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.02); }
  .dr-main { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
  .dr-devid { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; }
  .dr-arrow { color: #475569; font-size: 11px; }
  .dr-phone { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #22c55e; font-weight: 600; }
  .dr-meta { display: flex; align-items: center; gap: 8px; font-size: 9px; color: #475569; }

  /* Log */
  .disco-log { margin: 0 20px; background: #0e1420; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
  .dlog-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dlog-clear { margin-left: auto; font-size: 9px; color: #64748b; background: none; border: none; cursor: pointer; padding: 2px 5px; border-radius: 3px; }
  .dlog-clear:hover { color: #fb7185; }
  .dlog-body { max-height: 220px; overflow-y: auto; padding: 2px 0; font-family: 'JetBrains Mono', monospace; font-size: 10px; }
  .dlog-empty { padding: 20px 14px; color: #475569; font-size: 10px; text-align: center; font-family: 'Inter', system-ui, sans-serif; }
  .dlog-row { padding: 2px 14px; display: flex; gap: 8px; line-height: 1.5; }
  .dlog-ts { color: #475569; flex-shrink: 0; font-size: 9px; }
  .dlog-msg { color: #94a3b8; word-break: break-word; }
  .dlog-success .dlog-msg { color: #34d399; }
  .dlog-error .dlog-msg { color: #fb7185; }
  .dlog-warn .dlog-msg { color: #fbbf24; }

  /* Spinner */
  @keyframes dspin-anim { to { transform: rotate(360deg); } }
  .dspin { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(56,189,248,0.2); border-top-color: #38bdf8; border-radius: 50%; animation: dspin-anim 0.7s linear infinite; }
  .dspin-sm { width: 8px; height: 8px; border-width: 1.5px; }

  /* Skip Button */
  .dl-skip-btn { background: none; border: none; cursor: pointer; font-size: 11px; padding: 1px 4px; border-radius: 3px; color: #64748b; transition: all 0.15s; margin-left: 2px; line-height: 1; }
  .dl-skip-btn:hover { color: #fb7185; background: rgba(251,113,133,0.1); }
  .dl-unskip:hover { color: #34d399; background: rgba(52,211,153,0.1); }
  .dl-row-skipped { border-left: 3px solid #475569; opacity: 0.45; }
  .dl-status-skipped { color: #475569; }

  /* Manual Actions */
  .disco-manual { margin: 0 20px 10px; background: #0e1420; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
  .dm-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .dm-body { padding: 8px 14px; display: flex; flex-direction: column; gap: 10px; }
  .dm-section { }
  .dm-title { font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .dm-form { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dm-select { background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 5px 8px; font-size: 11px; font-family: 'JetBrains Mono', monospace; min-width: 140px; max-width: 220px; cursor: pointer; }
  .dm-select:focus { border-color: rgba(56,189,248,0.3); outline: none; }
  .dm-input { background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 5px 8px; font-size: 11px; font-family: 'JetBrains Mono', monospace; width: 130px; }
  .dm-input:focus { border-color: rgba(56,189,248,0.3); outline: none; }
  .dm-input-wide { width: 180px; }
  .dbtn-sm { padding: 5px 10px; font-size: 10px; }
  .dm-skipped { max-height: 120px; overflow-y: auto; }
  .dm-skip-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }
  .dm-skip-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; word-break: break-all; }
  .dm-skip-undo { background: none; border: none; cursor: pointer; font-size: 10px; color: #64748b; padding: 2px 6px; border-radius: 3px; margin-left: auto; white-space: nowrap; }
  .dm-skip-undo:hover { color: #34d399; background: rgba(52,211,153,0.1); }

  /* Quick Nav */
  .disco-quicknav {
    display: flex; align-items: center; gap: 6px; padding: 6px 20px;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .disco-quicknav::-webkit-scrollbar { display: none; }
  .qn-btn {
    flex-shrink: 0;
    background: #111d35; color: #94a3b8;
    border: 1px solid rgba(255,255,255,0.07); border-radius: 16px;
    padding: 5px 12px; font-size: 11px; font-weight: 600;
    cursor: pointer; transition: all 0.18s; white-space: nowrap;
    font-family: inherit;
  }
  .qn-btn:hover { background: rgba(56,189,248,0.1); color: #38bdf8; border-color: rgba(56,189,248,0.2); }
  .qn-btn:active { transform: scale(0.95); }

  /* Smooth scroll offset for sticky header */
  [id^="sec-"] { scroll-margin-top: 56px; }

  /* Toasts */
  .disco-toasts { position: fixed; bottom: 24px; right: 24px; z-index: 999; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
  @keyframes dt-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  @keyframes dt-out { from { opacity:1; } to { opacity:0; } }
  .dtoast { background: #111d35; border: 1px solid rgba(56,189,248,0.3); border-radius: 7px; padding: 8px 14px; font-size: 11px; color: #e2e8f0; box-shadow: 0 8px 28px rgba(0,0,0,0.5); animation: dt-in 0.25s ease both; }
  .dtoast-out { animation: dt-out 0.3s ease forwards; }
  .dtoast.success { border-color: rgba(52,211,153,0.5); color: #34d399; }
  .dtoast.error { border-color: rgba(251,113,133,0.5); color: #fb7185; }

  /* ═══════════ RESPONSIVE / MOBILE ═══════════ */

  /* Tablet (≤ 768px) */
  @media (max-width: 768px) {
    .disco-shell { padding: 0 0 60px; /* extra bottom padding for thumb reach */ }
    .disco-header { padding: 10px 12px; }
    .dh-title span { font-size: 13px; }
    .dh-title svg { width: 14px; height: 14px; }

    .disco-quicknav { padding: 6px 12px; gap: 5px; }
    .qn-btn { padding: 7px 14px; font-size: 12px; min-height: 34px; }

    .disco-cards { grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 12px; }
    .dc-card { padding: 8px 6px; border-radius: 8px; }
    .dc-n { font-size: 18px; }
    .dc-l { font-size: 8px; }

    .disco-controls { padding: 0 12px 10px; }
    .dc-btns { gap: 5px; }
    .dbtn { padding: 8px 12px; font-size: 11px; min-height: 36px; border-radius: 8px; }

    .dc-row2 { flex-direction: column; align-items: stretch; gap: 10px; }
    .dc-workers-ctl { justify-content: space-between; }
    .dc-wslider { flex: 1; min-width: 0; }
    .dc-dailylimit { justify-content: space-between; }
    .dc-dlimit-input { width: 60px; padding: 6px; font-size: 14px; min-height: 36px; }

    .disco-lists { grid-template-columns: 1fr; padding: 0 12px 10px; }
    .disco-log, .disco-records, .disco-tomorrow, .disco-workers, .disco-manual { margin-left: 12px; margin-right: 12px; }

    .dw-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; }
    .dw-card { padding: 10px 12px; }

    .dl-row { padding: 8px 12px; }
    .dl-id { font-size: 11px; }
    .dl-phone { font-size: 11px; }
    .dl-skip-btn { font-size: 16px; padding: 4px 8px; min-width: 32px; min-height: 32px; display: flex; align-items: center; justify-content: center; }

    .dm-form { flex-direction: column; align-items: stretch; gap: 8px; }
    .dm-select { width: 100%; max-width: 100%; padding: 10px; font-size: 14px; min-height: 42px; border-radius: 8px; }
    .dm-input, .dm-input-wide { width: 100%; max-width: 100%; padding: 10px; font-size: 14px; min-height: 42px; border-radius: 8px; }
    .dbtn-sm { padding: 10px 14px; font-size: 13px; min-height: 42px; width: 100%; border-radius: 8px; }

    .dm-skip-row { padding: 6px 0; }
    .dm-skip-id { font-size: 11px; }
    .dm-skip-undo { padding: 6px 10px; font-size: 11px; min-height: 32px; }

    .dr-main { flex-wrap: wrap; }
    .dr-devid { font-size: 9px; word-break: break-all; }
    .dr-phone { font-size: 11px; }
    .dr-meta { flex-wrap: wrap; gap: 4px; }

    .disco-toasts { bottom: 12px; right: 12px; left: 12px; }
    .dtoast { font-size: 12px; padding: 10px 14px; }

    .dlog-body { max-height: 180px; }
    .dlog-row { padding: 3px 12px; }
    .dlog-ts { font-size: 8px; }
    .dlog-msg { font-size: 10px; }
  }

  /* Phone (≤ 480px) */
  @media (max-width: 480px) {
    .disco-header { padding: 8px 10px; gap: 6px; }
    .dh-back { width: 34px; height: 34px; }
    .dh-title { gap: 5px; }
    .dh-title span { font-size: 12px; }
    .dh-title svg { display: none; }
    .dh-running-pill { font-size: 10px; padding: 2px 8px; }
    .dh-state { font-size: 10px; }

    .disco-quicknav { padding: 5px 10px; }
    .qn-btn { padding: 6px 11px; font-size: 11px; min-height: 32px; }

    .disco-cards { grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 8px 10px; }
    .dc-card { padding: 6px 4px; border-radius: 6px; }
    .dc-n { font-size: 15px; }
    .dc-l { font-size: 7px; letter-spacing: 0.04em; }

    .disco-controls { padding: 0 10px 8px; }
    .dc-btns { gap: 4px; }
    .dbtn { padding: 7px 10px; font-size: 10px; min-height: 34px; }
    .dbtn svg { width: 10px; height: 10px; }

    .disco-log, .disco-records, .disco-tomorrow, .disco-workers, .disco-manual { margin-left: 10px; margin-right: 10px; }
    .disco-lists { padding: 0 10px 8px; }

    .dw-grid { grid-template-columns: 1fr; }
    .dw-card { padding: 8px 10px; }
    .dw-wid { font-size: 11px; }

    .dl-panel { border-radius: 8px; }
    .dl-hdr { padding: 8px 10px; font-size: 10px; }
    .dl-body { max-height: 200px; }
    .dl-row { padding: 8px 10px; }
    .dl-row-main { gap: 4px; }
    .dl-id { font-size: 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .dl-phone { font-size: 10px; }
    .dl-row-meta { gap: 4px; flex-wrap: wrap; }
    .dl-skip-btn { font-size: 14px; padding: 6px 10px; min-width: 36px; min-height: 36px; }

    .dt-hdr { padding: 8px 10px; font-size: 10px; }
    .dt-row { padding: 5px 10px; }
    .dt-id { font-size: 9px; word-break: break-all; }

    .dr-hdr { padding: 8px 10px; font-size: 10px; }
    .dr-row { padding: 6px 10px; }
    .dr-devid { font-size: 8px; }
    .dr-phone { font-size: 10px; }
    .dr-meta { font-size: 8px; }

    .dlog-hdr { padding: 8px 10px; font-size: 10px; }
    .dlog-body { max-height: 150px; }

    .dm-hdr { padding: 8px 10px; font-size: 10px; }
    .dm-body { padding: 8px 10px; }
    .dm-title { font-size: 11px; }
    .dm-select { font-size: 13px; padding: 10px; min-height: 40px; }
    .dm-input, .dm-input-wide { font-size: 13px; padding: 10px; min-height: 40px; }
    .dbtn-sm { font-size: 12px; padding: 10px; min-height: 40px; }

    .disco-toasts { bottom: 8px; right: 8px; left: 8px; }
    .dtoast { font-size: 11px; padding: 8px 12px; border-radius: 8px; }
  }

  /* Very small phones (≤ 360px) */
  @media (max-width: 360px) {
    .disco-cards { grid-template-columns: repeat(3, 1fr); }
    .dc-n { font-size: 14px; }
    .dc-l { font-size: 6.5px; }
    .dh-title span { font-size: 11px; }
    .dl-id { max-width: 90px; font-size: 9px; }
  }
</style>
