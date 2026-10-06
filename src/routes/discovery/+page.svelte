<script>
  import '../../app.css';
  import {
    engine,
    allDevices as _allDevices, onlineDevices as _onlineDevices,
    withNumber as _withNumber, withoutNumber as _withoutNumber,
    discoveredCount as _discoveredCount, failedCount as _failedCount,
    tomorrowCount as _tomorrowCount, processingCount as _processingCount,
    progressPct as _progressPct, skippedCount as _skippedCount,
    todayDiscoveredCount as _todayDiscoveredCount, todayDiscoveredRecords as _todayDiscoveredRecords,
    getDisplayPhone, getDiscoveredPhone,
    initEngine, startDiscovery, pauseDiscovery, stopDiscovery,
    retryFailed, retryTomorrow, refreshDevices, setMaxWorkers,
    clearLog, clearRecords, downloadJson, downloadZip,
    importNumbersFromFile, importNumbersRaw,
    postRecordToFirebase, postAllRecordsToFirebase, matchAllRecordsWithFirebase,
    fetchAllDevices, formatElapsed,
    skipTarget, unskipTarget, unskipAll, manualAssignNumber, sendManualSms,
    passiveScanAllDevices,
    getShareableText,
    probeDeviceMessagePaths,
    markNotificationsRead,
    clearNotifications,
    stopMessageMonitor,
    startMessageMonitor,
  } from '$lib/discovery-engine.svelte.js';
  import { extractNumber } from '$lib/device-helpers.js';
  import { onMount, onDestroy } from 'svelte';
  import { setPageFocus, clearPageFocus } from '$lib/page-focus.js';
  import { goto } from '$app/navigation';

  function goToDashboard(e) {
    if (e) e.preventDefault();
    let navigated = false;
    goto('/').then(() => { navigated = true; }).catch(() => {
      window.location.href = '/';
    });
    // Ultimate safety watchdog: if SPA router doesn't complete within 250ms, hard navigate to /
    setTimeout(() => {
      if (!navigated && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }, 250);
  }

  function goToAutomation(e) {
    if (e) e.preventDefault();
    let navigated = false;
    goto('/automation').then(() => { navigated = true; }).catch(() => {
      window.location.href = '/automation';
    });
    setTimeout(() => {
      if (!navigated && window.location.pathname !== '/automation') {
        window.location.href = '/automation';
      }
    }, 250);
  }

  // Local reactive bindings from engine getter functions
  let onlineDevices = $derived(_onlineDevices());
  let withNumber = $derived(_withNumber());
  let withoutNumber = $derived(_withoutNumber());
  let discoveredCount = $derived(_discoveredCount());
  let todayDiscoveredCount = $derived(_todayDiscoveredCount());
  let todayDiscoveredRecords = $derived(_todayDiscoveredRecords());
  let failedCount = $derived(_failedCount());
  let tomorrowCount = $derived(_tomorrowCount());
  let processingCount = $derived(_processingCount());
  let progressPct = $derived(_progressPct());
  let skippedCount = $derived(_skippedCount());
  let recordsDateFilter = $state('all'); // 'all' | 'today'

  // ── Import modal & Firebase sync state ───────────────────────────────────
  let showImportModal = $state(false);
  let importTab = $state('file'); // 'file' | 'paste'
  let importFile = $state(null);
  let importPasteText = $state('');
  let importAutoPost = $state(false);
  let importLoading = $state(false);
  let importSummary = $state(null);

  let postingDeviceId = $state('');
  let isBatchPosting = $state(false);
  let batchPostingProgress = $state({ current: 0, total: 0 });

  // ── Passive / Deep Scan state ───────────────────────────────────────────
  let deepScanRunning = $state(false);
  let deepScanResult = $state(null);
  let deepScanProgress = $state({ scanned: 0, total: 0, found: 0, workers: 10 });
  let deepScanWorkers = $state(10);
  let deepScanScope = $state('online'); // 'online' | 'all'

  async function handleDeepScan() {
    if (deepScanRunning) return;
    deepScanRunning = true;
    deepScanResult = null;
    deepScanProgress = { scanned: 0, total: 0, found: 0, workers: deepScanWorkers };
    try {
      const res = await passiveScanAllDevices((p) => {
        deepScanProgress = { scanned: p.scanned, total: p.total, found: p.found, workers: p.workers ?? deepScanWorkers };
      }, { workers: deepScanWorkers, onlineOnly: deepScanScope === 'online', onlineFirst: true });
      deepScanResult = res;
      toast(
        res.found > 0
          ? `💡 Deep scan found ${res.found} number(s)! Total ever: ${engine.deepScanStats.totalFound}`
          : `Deep scan done — ${res.scanned} devices probed, 0 new numbers in Firebase data`,
        res.found > 0 ? 'success' : 'info'
      );
    } catch (e) {
      toast(`Deep scan error: ${e.message}`, 'error');
    } finally {
      deepScanRunning = false;
    }
  }

  // ── Share / Copy state ──────────────────────────────────────────────
  let shareFormat = $state('plain');
  let shareCopied = $state(false);

  function handleCopyNumbers() {
    const text = getShareableText(shareFormat);
    if (!text) { toast('No numbers to copy', 'warn'); return; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        shareCopied = true;
        toast(`✅ ${text.split('\n').filter(Boolean).length} number(s) copied!`, 'success');
        setTimeout(() => shareCopied = false, 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
      shareCopied = true;
      setTimeout(() => shareCopied = false, 2000);
    }
  }

  let recordSearch = $state('');
  let filteredRecords = $derived.by(() => {
    let list = engine.records.filter(r => r.status === 'discovered');
    if (recordsDateFilter === 'today') {
      const now = new Date();
      list = list.filter(r => {
        const val = r.discoveredAt || r.timestamp || r.date;
        if (!val) return false;
        try {
          const d = new Date(val);
          return d.getFullYear() === now.getFullYear() &&
                 d.getMonth() === now.getMonth() &&
                 d.getDate() === now.getDate();
        } catch { return false; }
      });
    }
    if (!recordSearch.trim()) return list;
    const q = recordSearch.trim().toLowerCase();
    return list.filter(r =>
      r.deviceId?.toLowerCase().includes(q) ||
      r.phoneNumber?.toLowerCase().includes(q) ||
      r.connectionName?.toLowerCase().includes(q) ||
      r.discoveryMethod?.toLowerCase().includes(q)
    );
  });

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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(s).catch(() => fallbackCopy(s));
    } else {
      fallbackCopy(s);
    }
  }

  function fallbackCopy(s) {
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.padding = '0';
      ta.style.border = 'none';
      ta.style.outline = 'none';
      ta.style.boxShadow = 'none';
      ta.style.background = 'transparent';
      ta.style.opacity = '0.01';
      ta.style.fontSize = '16px';
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(0, s.length);
      document.execCommand('copy');
      ta.blur();
      document.body.removeChild(ta);
    } catch {}
  }

  // ── Expand/Collapse sections for uninterrupted page flow ─────────────────
  let expandedSections = $state({
    receivers: false,
    targets: false,
    tomorrow: false,
    records: false,
    log: false,
    skipped: false,
  });

  function toggleExpand(sec) {
    expandedSections[sec] = !expandedSections[sec];
  }

  // ── Forward wheel scrolling to parent window at boundaries ─────────────
  function chainScroll(node) {
    function onWheel(e) {
      if (!node) return;
      const { scrollTop, scrollHeight, clientHeight } = node;
      const isScrollable = scrollHeight > clientHeight;
      if (!isScrollable) return;

      const atTop = scrollTop <= 1 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;

      if (atTop || atBottom) {
        window.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    }

    node.addEventListener('wheel', onWheel, { passive: true });
    return {
      destroy() {
        node.removeEventListener('wheel', onWheel);
      }
    };
  }

  function confirmClearRecords() {
    if (!confirm('Clear all local discovery records? This cannot be undone.')) return;
    clearRecords();
    toast('Records cleared', 'info');
  }

  function handleDownloadJson() {
    downloadJson();
    toast('JSON exported', 'success');
  }

  async function handleDownloadZip() {
    try {
      await downloadZip();
      toast('ZIP archive exported', 'success');
    } catch (e) {
      toast(`ZIP export failed: ${e.message}`, 'error');
    }
  }

  async function handlePostSingle(rec) {
    if (postingDeviceId) return;
    postingDeviceId = rec.deviceId;
    try {
      const res = await postRecordToFirebase(rec.deviceId, rec.phoneNumber, rec.connectionId);
      toast(`Updated in ${res.connName}!`, 'success');
    } catch (e) {
      toast(`Failed: ${e.message}`, 'error');
    } finally {
      postingDeviceId = '';
    }
  }

  async function handlePostAll() {
    if (isBatchPosting) return;
    const discovered = engine.records.filter(r => r.status === 'discovered' && r.phoneNumber);
    if (!discovered.length) {
      toast('No discovered numbers to post', 'warn');
      return;
    }
    if (!confirm(`Post ${discovered.length} discovered numbers across Firebase databases?`)) return;

    isBatchPosting = true;
    batchPostingProgress = { current: 0, total: discovered.length };
    try {
      const res = await postAllRecordsToFirebase((p) => {
        batchPostingProgress = { current: p.current, total: p.total };
      });
      toast(`Finished: ${res.successCount} posted, ${res.failedCount} failed`, res.successCount > 0 ? 'success' : 'error');
    } catch (e) {
      toast(`Batch post failed: ${e.message}`, 'error');
    } finally {
      isBatchPosting = false;
    }
  }

  function handleMatchConnections() {
    const n = matchAllRecordsWithFirebase();
    toast(n > 0 ? `Matched ${n} devices with Firebase!` : 'No new matches found', 'info');
  }

  async function handleExecuteImport() {
    importLoading = true;
    importSummary = null;
    try {
      let res;
      if (importTab === 'file') {
        if (!importFile) {
          toast('Please select a JSON or ZIP file', 'error');
          importLoading = false;
          return;
        }
        res = await importNumbersFromFile(importFile, { autoPostToFirebase: importAutoPost });
      } else {
        if (!importPasteText.trim()) {
          toast('Please paste JSON or device list text', 'error');
          importLoading = false;
          return;
        }
        res = await importNumbersRaw(importPasteText, { autoPostToFirebase: importAutoPost });
      }

      importSummary = res;
      toast(`Imported ${res.validCount} numbers (${res.matchedCount} matched in Firebase)`, 'success');
      if (res.postedCount > 0) {
        toast(`Automatically posted ${res.postedCount} numbers to Firebase!`, 'success');
      }
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error');
    } finally {
      importLoading = false;
    }
  }


  // ── Probe state ──────────────────────────────────────────────────────────
  let notifOpen = $state(false);
  let probeOpen = $state(false);
  let probeDevice = $state(null);
  let probeLoading = $state(false);
  let probeResults = $state([]);

  async function handleProbe(dev) {
    probeDevice = dev;
    probeResults = [];
    probeLoading = true;
    probeOpen = true;
    try {
      const res = await probeDeviceMessagePaths(dev.conn, dev.key);
      probeResults = res;
      addLog(`🔍 Probe for ${dev.key.slice(0,12)}…: ${res.filter(r => r.hasData).length} path(s) with data`, 'info');
    } catch (e) {
      toast(`Probe error: ${e.message}`, 'error');
    } finally {
      probeLoading = false;
    }
  }

  onMount(() => {
    setPageFocus('discovery');
    initEngine();
    if (engine.connections.length > 0 && Object.keys(engine.db).length === 0) {
      fetchAllDevices();
    }
  });

  // ── Derived UI helpers ──────────────────────────────────────────────────
  const stateLabels = {
    IDLE: 'Idle', RUNNING: 'Running', WATCHING: 'Watching', PAUSED: 'Paused',
    STOPPED: 'Stopped', COMPLETED: 'Completed', NO_PROGRESS: 'No Progress',
  };
  const stateColors = {
    IDLE: '#64748b', RUNNING: '#22c55e', WATCHING: '#2dd4bf', PAUSED: '#a78bfa',
    STOPPED: '#64748b', COMPLETED: '#22c55e', NO_PROGRESS: '#fb7185',
  };
  const workerStatusColors = {
    idle: '#64748b', watching: '#2dd4bf', starting: '#38bdf8', selecting: '#fbbf24',
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
    const el = document.getElementById(id);
    if (!el) return;
    const header = document.querySelector('.disco-header');
    const headerHeight = (header ? header.offsetHeight : 54) + 10;
    const rect = el.getBoundingClientRect();
    const targetY = window.pageYOffset + rect.top - headerHeight;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }
  onDestroy(() => clearPageFocus('discovery'));
</script>

<svelte:head>
  <title>Device Number Discovery — PD Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="disco-shell">
  <!-- Header -->
  <header class="disco-header">
    <div class="dh-left">
      <a href="/" class="dh-nav-btn" onclick={goToDashboard} title="Back to Main Dashboard">
        ← Dashboard
      </a>
      <span class="dh-sep">/</span>
      <div class="dh-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8">
          <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
          <line x1="2" y1="20" x2="2.01" y2="20"/>
        </svg>
        <span>Device Discovery</span>
      </div>
      {#if todayDiscoveredCount > 0}
        <span class="dh-today-pill" title="{todayDiscoveredCount} devices discovered today">
          +{todayDiscoveredCount} today
        </span>
      {/if}
      <span class="dh-sep">/</span>
      <a href="/automation" class="dh-nav-btn" onclick={goToAutomation} title="Open Automation Orchestrator">
        🤖 Automation
      </a>
      <span class="dh-sep">/</span>
      <a href="/json-extractor" class="dh-nav-btn" title="Open JSON & RTDB Extractor">
        🔍 Extractor
      </a>
      {#if engine.status === 'RUNNING' || engine.status === 'WATCHING'}
        <span class="dh-running-pill" class:dh-watching-pill={engine.status === 'WATCHING'}>
          <span class="dh-pulse"></span>
          {formatElapsed(engine.elapsed)}
        </span>
      {/if}
    </div>
    <div class="dh-right">
      <!-- Notification Bell -->
      <div class="notif-bell-wrap">
        <button class="notif-bell-btn" onclick={() => { notifOpen = !notifOpen; if (notifOpen) markNotificationsRead(); }} title="Incoming messages from all devices">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {#if engine.unreadCount > 0}
            <span class="notif-badge">{engine.unreadCount > 99 ? '99+' : engine.unreadCount}</span>
          {/if}
          <span class="notif-monitor-dot" class:active={engine.monitorActive} title={engine.monitorActive ? 'Monitor active' : 'Monitor stopped'}></span>
        </button>

        {#if notifOpen}
          <div class="notif-panel" role="dialog" aria-modal="true" tabindex="-1">
            <div class="notif-panel-hdr">
              <span class="notif-panel-title">📨 Incoming Messages</span>
              <div class="notif-panel-actions">
                <button class="notif-act-btn" onclick={() => { engine.monitorActive ? stopMessageMonitor() : startMessageMonitor(); }}>
                  {engine.monitorActive ? '⏸ Pause' : '▶ Resume'}
                </button>
                <button class="notif-act-btn" onclick={() => clearNotifications()}>🗑 Clear</button>
                <button class="notif-close-btn" onclick={() => notifOpen = false}>×</button>
              </div>
            </div>
            {#if engine.notifications.length === 0}
              <div class="notif-empty">No messages yet — monitor is {engine.monitorActive ? 'watching' : 'stopped'}</div>
            {:else}
              <div class="notif-list">
                {#each engine.notifications.slice(0, 50) as n (n.id)}
                  <div class="notif-item {n.read ? '' : 'notif-unread'}">
                    <div class="notif-item-top">
                      <span class="notif-dev">{n.deviceId.slice(0,12)}…</span>
                      {#if n.phone}<span class="notif-phone">{n.phone}</span>{/if}
                      <span class="notif-conn" style="color:{engine.connections.find(c=>c.id===n.connId)?.color ?? '#818cf8'}">{n.connName}</span>
                      <span class="notif-time">{n.ts ? new Date(n.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                    </div>
                    <div class="notif-item-from">From: {n.sender || '—'}</div>
                    <div class="notif-item-body">{n.body}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

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
      <div class="dc-l">Total Discovered</div>
    </div>
    <div class="dc-card dc-c-emerald">
      <div class="dc-n" style="color: #34d399;">+{todayDiscoveredCount}</div>
      <div class="dc-l">Today's Discovered</div>
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
    {#if tomorrowCount > 0}
      <button class="qn-btn" onclick={() => scrollTo('sec-tomorrow')}>📅 Tomorrow ({tomorrowCount})</button>
    {/if}
    <button class="qn-btn" onclick={() => scrollTo('sec-records')}>✅ Records</button>
    <button class="qn-btn" onclick={() => scrollTo('sec-log')}>📊 Log</button>
    {#if engine.workers.length > 0}
      <button class="qn-btn" onclick={() => scrollTo('sec-workers')}>⚙ Workers</button>
    {/if}
  </div>

  <!-- All Discovered Banner (WATCHING mode) -->
  {#if engine.status === 'WATCHING'}
    <div class="all-discovered-banner">
      <span class="adb-icon">✅</span>
      <div class="adb-text">
        <strong>All {onlineDevices.length} online device{onlineDevices.length !== 1 ? 's' : ''} discovered!</strong>
        <span>{discoveredCount} numbers found · Monitoring for new devices every 60s</span>
      </div>
      <a href="/automation" class="dbtn dbtn-deepscan" style="text-decoration:none">🤖 Go to Automation</a>
    </div>
  {/if}

  <!-- Controls -->
  <div class="disco-controls">
    <div class="dc-btns">
      {#if ['IDLE', 'STOPPED', 'COMPLETED', 'NO_PROGRESS', 'WATCHING'].includes(engine.status)}
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
      <span class="deepscan-wrap" title="Deep scan Firebase data layers for phone numbers — no SMS needed">
        <select class="deepscan-workers-sel" bind:value={deepScanScope} disabled={deepScanRunning} title="Scope">
          <option value="online">⚡ Online</option>
          <option value="all">All</option>
        </select>
        <select class="deepscan-workers-sel" bind:value={deepScanWorkers} disabled={deepScanRunning} title="Workers">
          {#each [2,4,6,8,10,15,20] as w}<option value={w}>{w}w</option>{/each}
        </select>
        <button class="dbtn dbtn-deepscan" onclick={handleDeepScan} disabled={deepScanRunning}>
          {#if deepScanRunning}
            <span class="dspin dspin-sm"></span>
            {deepScanProgress.scanned}/{deepScanProgress.total} · {deepScanProgress.found} found
          {:else}
            🔬 Deep Scan
          {/if}
        </button>
      </span>
      <button class="dbtn dbtn-ghost" onclick={handleDownloadJson} disabled={engine.records.length === 0} title="Download discovered numbers as JSON">
        📥 JSON
      </button>
      <button class="dbtn dbtn-ghost" onclick={handleDownloadZip} disabled={engine.records.length === 0} title="Download discovered numbers as ZIP archive">
        📦 ZIP
      </button>
      {#if engine.records.filter(r => r.status === 'discovered').length > 0}
        <span class="share-wrap" title="Copy numbers to clipboard">
          <select class="share-fmt-sel" bind:value={shareFormat}>
            <option value="plain">Numbers only</option>
            <option value="csv">CSV</option>
            <option value="json-compact">JSON</option>
          </select>
          <button class="dbtn dbtn-share {shareCopied ? 'dbtn-share-done' : ''}" onclick={handleCopyNumbers}>
            {shareCopied ? '✅ Copied!' : '📋 Copy'}
          </button>
        </span>
      {/if}
      <button class="dbtn dbtn-import" onclick={() => { showImportModal = true; importSummary = null; }} title="Import numbers from JSON or ZIP">
        ➕ Import
      </button>
      <a href="/automation" class="dbtn dbtn-ghost" title="Open Automation Orchestrator" style="text-decoration:none">
        🤖 Automation
      </a>
      {#if engine.records.filter(r => r.status === 'discovered').length > 0}
        <button class="dbtn dbtn-cloud" onclick={handlePostAll} disabled={isBatchPosting} title="Post all discovered numbers to their matching Firebase RTDB">
          {#if isBatchPosting}
            <span class="dspin dspin-sm"></span> {batchPostingProgress.current}/{batchPostingProgress.total}
          {:else}
            ☁️ Post All to Firebase
          {/if}
        </button>
        <button class="dbtn dbtn-ghost" onclick={handleMatchConnections} title="Scan and match any unlinked devices across all Firebase connections">
          🔗 Match Firebase
        </button>
      {/if}
      <button class="dbtn dbtn-ghost dbtn-sm-danger" onclick={confirmClearRecords} disabled={engine.records.length === 0} title="Clear discovery records">🗑</button>
    </div>

    <!-- Deep Scan Result Banner -->
    {#if deepScanResult !== null}
      <div class="deepscan-result {deepScanResult.found > 0 ? 'deepscan-hit' : 'deepscan-miss'}">
        {#if deepScanResult.found > 0}
          <span class="ds-icon">💡</span>
          <span><strong>{deepScanResult.found} number{deepScanResult.found !== 1 ? 's' : ''}</strong> found in Firebase data — no SMS needed!</span>
          <span class="ds-sub">{deepScanResult.scanned} probed · Σ All-time: <strong>{engine.deepScanStats.totalFound}</strong></span>
        {:else}
          <span class="ds-icon">🔬</span>
          <span>Deep scan done — <strong>{deepScanResult.scanned}</strong> device{deepScanResult.scanned !== 1 ? 's' : ''} probed. No numbers in Firebase data.</span>
          <span class="ds-sub">Numbers not stored yet — SMS discovery will handle them.</span>
        {/if}
        <button class="ds-close" onclick={() => deepScanResult = null}>×</button>
      </div>
    {/if}

    <!-- Persistent Deep Scan Stats -->
    {#if engine.deepScanStats.totalFound > 0 && deepScanResult === null}
      <div class="deepscan-persist-bar">
        <span>📊 Deep scan history:</span>
        <strong>{engine.deepScanStats.totalFound} number{engine.deepScanStats.totalFound !== 1 ? 's' : ''} found</strong>
        <span class="ds-sub">across {engine.deepScanStats.totalScanned} devices</span>
        {#if engine.deepScanStats.lastRanAt}
          <span class="ds-sub">· last ran {new Date(engine.deepScanStats.lastRanAt).toLocaleTimeString()}</span>
        {/if}
      </div>
    {/if}

    <!-- Workers + Progress Row -->
    <div class="dc-row2">
      <div class="dc-workers-ctl">
        <label class="dc-wlabel" for="workers-slider">Workers</label>
        <input id="workers-slider" type="range" min="1" max="10" step="1" value={engine.maxWorkers}
          oninput={(e) => setMaxWorkers(parseInt(e.target.value))}
          class="dc-wslider" />
        <span class="dc-wcount">{engine.maxWorkers}</span>
      </div>
      <div class="dc-dailylimit">
        <label class="dc-wlabel" for="daily-limit-input">Daily Limit</label>
        <input id="daily-limit-input" type="number" min="1" max="20" value={engine.config.maxDailyAttempts}
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
        {#if withNumber.length > 5}
          <button class="dl-expand-btn" onclick={() => toggleExpand('receivers')} title={expandedSections.receivers ? 'Collapse list' : 'Expand full list'}>
            {expandedSections.receivers ? '↕ Collapse' : '↕ Expand'}
          </button>
        {/if}
      </div>
      <div class="dl-body {expandedSections.receivers ? 'is-expanded' : ''}" use:chainScroll>
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
        {#if withoutNumber.length > 5}
          <button class="dl-expand-btn" onclick={() => toggleExpand('targets')} title={expandedSections.targets ? 'Collapse list' : 'Expand full list'}>
            {expandedSections.targets ? '↕ Collapse' : '↕ Expand'}
          </button>
        {/if}
      </div>
      <div class="dl-body {expandedSections.targets ? 'is-expanded' : ''}" use:chainScroll>
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
                <button class="dl-probe-btn" onclick={() => handleProbe(d)} title="Probe Firebase paths — find where this device's messages are stored">🔍</button>
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
    <div class="disco-tomorrow" id="sec-tomorrow">
      <div class="dt-hdr">
        📅 Try Tomorrow
        <span class="dl-cnt">{engine.tryTomorrow.length}</span>
        {#if engine.tryTomorrow.length > 4}
          <button class="dl-expand-btn" onclick={() => toggleExpand('tomorrow')}>
            {expandedSections.tomorrow ? '↕ Collapse' : '↕ Expand'}
          </button>
        {/if}
        <button class="dlog-clear" onclick={() => { retryTomorrow(); toast('Cleared', 'info'); }}>Reset All</button>
      </div>
      <div class="dt-body {expandedSections.tomorrow ? 'is-expanded' : ''}" use:chainScroll>
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
        <div class="dr-hdr-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>Discovery Records</span>
          <div class="dr-filter-tabs">
            <button
              type="button"
              class="dr-tab-btn {recordsDateFilter === 'all' ? 'active' : ''}"
              onclick={() => recordsDateFilter = 'all'}
            >
              All ({engine.records.filter(r => r.status === 'discovered').length})
            </button>
            <button
              type="button"
              class="dr-tab-btn {recordsDateFilter === 'today' ? 'active' : ''}"
              onclick={() => recordsDateFilter = 'today'}
            >
              📅 Today ({todayDiscoveredCount})
            </button>
          </div>
          <span class="dl-cnt">{filteredRecords.length} shown</span>
        </div>

        <div class="dr-hdr-right">
          <input
            type="search"
            class="dr-search-input"
            placeholder="Search records…"
            bind:value={recordSearch}
          />
          <button class="dbtn dbtn-ghost dbtn-xs" onclick={handleDownloadJson} title="Download JSON">📥 JSON</button>
          <button class="dbtn dbtn-ghost dbtn-xs" onclick={handleDownloadZip} title="Download ZIP">📦 ZIP</button>
          <button class="dbtn dbtn-cloud dbtn-xs" onclick={handlePostAll} disabled={isBatchPosting} title="Post all to Firebase RTDB">
            {#if isBatchPosting}
              <span class="dspin dspin-sm"></span> {batchPostingProgress.current}/{batchPostingProgress.total}
            {:else}
              ☁️ Post All
            {/if}
          </button>
          {#if filteredRecords.length > 4}
            <button class="dl-expand-btn" onclick={() => toggleExpand('records')} title={expandedSections.records ? 'Collapse to scrollable' : 'Expand full list'}>
              {expandedSections.records ? '↕ Collapse' : '↕ Expand'}
            </button>
          {/if}
        </div>
      </div>
      <div class="dr-body {expandedSections.records ? 'is-expanded' : ''}" use:chainScroll>
        {#if filteredRecords.length === 0}
          <div class="dl-empty">No records match "{recordSearch}"</div>
        {:else}
          {#each filteredRecords as rec (rec.deviceId + (rec.discoveredAt || ''))}
            <div class="dr-row">
              <div class="dr-main">
                <button class="dr-devid" onclick={() => { copyText(rec.deviceId); toast(`${rec.deviceId} copied`, 'success'); }} title="Click to copy Device ID">
                  {rec.deviceId}
                </button>
                <span class="dr-arrow">→</span>
                <button class="dr-phone" onclick={() => { copyText(rec.phoneNumber); toast(`${rec.phoneNumber} copied`, 'success'); }} title="Click to copy Phone">
                  {rec.phoneNumber}
                </button>

                {#if rec.syncedToFirebase}
                  <span class="dr-synced-badge" title="Synced to Firebase RTDB{rec.syncedConn ? ` (${rec.syncedConn})` : ''}{rec.syncedAt ? ` on ${new Date(rec.syncedAt).toLocaleTimeString()}` : ''}">
                    ✓ In Firebase
                  </span>
                {/if}

                <div class="dr-row-actions">
                  <button
                    class="dr-post-btn {rec.syncedToFirebase ? 'dr-post-btn-synced' : ''}"
                    onclick={() => handlePostSingle(rec)}
                    disabled={postingDeviceId === rec.deviceId}
                    title="Write this phone number into Firebase RTDB under clients/{rec.deviceId}"
                  >
                    {#if postingDeviceId === rec.deviceId}
                      <span class="dspin dspin-sm"></span> Posting…
                    {:else if rec.syncedToFirebase}
                      ↻ Re-Post
                    {:else}
                      ☁️ Post to Firebase
                    {/if}
                  </button>
                </div>
              </div>
              <div class="dr-meta">
                {#if rec.connectionName}
                  <span class="dr-conn">{rec.connectionName}</span>
                {:else}
                  <span class="dr-conn dr-unmatched">Unlinked DB</span>
                {/if}
                <span class="dr-method {rec.discoveryMethod === 'import' ? 'dr-method-import' : ''}">
                  {rec.discoveryMethod === 'import' ? '📥 import' : (rec.discoveryMethod === 'manual' ? '✏️ manual' : '📡 sms')}
                </span>
                {#if rec.receiverDeviceId && rec.receiverDeviceId !== 'imported' && rec.receiverDeviceId !== 'manual-entry'}
                  <span class="dr-via">via {rec.receiverDeviceId.slice(0, 10)}…</span>
                {/if}
                {#if rec.discoveredAt}
                  <span class="dr-at">{new Date(rec.discoveredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                {/if}
                {#if rec.attemptCount > 0}
                  <span class="dr-attempts">{rec.attemptCount}×</span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Activity Log -->
  <div class="disco-log" id="sec-log">
    <div class="dlog-hdr">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Activity Log
      {#if engine.log.length > 6}
        <button class="dl-expand-btn" onclick={() => toggleExpand('log')} title={expandedSections.log ? 'Collapse to scrollable' : 'Expand full list'}>
          {expandedSections.log ? '↕ Collapse' : '↕ Expand'}
        </button>
      {/if}
      {#if engine.log.length > 0}
        <button class="dlog-clear" onclick={clearLog}>Clear</button>
      {/if}
    </div>
    <div class="dlog-body {expandedSections.log ? 'is-expanded' : ''}" use:chainScroll>
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
            {#if skippedCount > 4}
              <button class="dl-expand-btn" onclick={() => toggleExpand('skipped')}>
                {expandedSections.skipped ? '↕ Collapse' : '↕ Expand'}
              </button>
            {/if}
            <button class="dlog-clear" onclick={() => { unskipAll(); toast('All un-skipped', 'info'); }}>Un-skip All</button>
          </div>
          <div class="dm-skipped {expandedSections.skipped ? 'is-expanded' : ''}" use:chainScroll>
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

<!-- Import Modal (JSON or ZIP) -->
{#if showImportModal}
  <div class="im-backdrop" onclick={(e) => { if (e.target === e.currentTarget && !importLoading) showImportModal = false; }} role="presentation">
    <div class="im-dialog" role="dialog" aria-modal="true">
      <div class="im-head">
        <div class="im-title-group">
          <span class="im-icon">📥</span>
          <div>
            <h3 class="im-title">Import Discovered Numbers</h3>
            <p class="im-sub">Upload a JSON or ZIP file, or paste device data. If an ID matches any Firebase, it's auto-linked!</p>
          </div>
        </div>
        <button class="im-close" onclick={() => showImportModal = false} disabled={importLoading} aria-label="Close dialog">✕</button>
      </div>

      <!-- Tabs -->
      <div class="im-tabs">
        <button class="im-tab {importTab === 'file' ? 'active' : ''}" onclick={() => { importTab = 'file'; importSummary = null; }}>
          📁 Upload File (.json / .zip)
        </button>
        <button class="im-tab {importTab === 'paste' ? 'active' : ''}" onclick={() => { importTab = 'paste'; importSummary = null; }}>
          📝 Paste JSON / Text
        </button>
      </div>

      <div class="im-body">
        {#if importTab === 'file'}
          <div class="im-dropzone">
            <input
              type="file"
              id="im-file-input"
              class="im-file-input"
              accept=".json,.zip,.csv,.txt"
              onchange={(e) => {
                importFile = e.target.files?.[0] || null;
                importSummary = null;
              }}
            />
            <label for="im-file-input" class="im-drop-label">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="im-drop-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {#if importFile}
                <span class="im-file-name">{importFile.name}</span>
                <span class="im-file-size">({(importFile.size / 1024).toFixed(1)} KB)</span>
              {:else}
                <span class="im-drop-text">Click to choose or drag & drop <strong>.json</strong> or <strong>.zip</strong> archive</span>
                <span class="im-drop-hint">Supports full exports, Python worker processed_numbers.json, and key-value maps</span>
              {/if}
            </label>
          </div>
        {:else}
          <div class="im-paste-group">
            <textarea
              class="im-textarea"
              placeholder={'{\n  "records": [\n    { "deviceId": "7550c5973bb02b7e", "phoneNumber": "917610254258" }\n  ]\n}\n-- OR --\n{\n  "7550c5973bb02b7e": "917610254258"\n}\n-- OR lines of --\n7550c5973bb02b7e, 917610254258'}
              bind:value={importPasteText}
              rows="8"
            ></textarea>
          </div>
        {/if}

        <!-- Auto-Post Checkbox -->
        <label class="im-checkbox-row">
          <input type="checkbox" bind:checked={importAutoPost} class="im-checkbox" />
          <span class="im-check-text">
            <strong>☁️ Auto-Post matched numbers to Firebase RTDB</strong>
            <small>If device ID is found in Firebase, immediately writes/patches the phone number to RTDB clients path</small>
          </span>
        </label>

        <!-- Summary card when import completes -->
        {#if importSummary}
          <div class="im-summary-box">
            <div class="im-sum-row">
              <span class="im-sum-badge im-sb-blue">Total: {importSummary.validCount}</span>
              <span class="im-sum-badge im-sb-green">New: {importSummary.newCount}</span>
              <span class="im-sum-badge im-sb-amber">Updated: {importSummary.updatedCount}</span>
              <span class="im-sum-badge im-sb-purple">Matched in Firebase: {importSummary.matchedCount}</span>
              {#if importSummary.postedCount > 0}
                <span class="im-sum-badge im-sb-cloud">Posted to RTDB: {importSummary.postedCount}</span>
              {/if}
            </div>
            {#if importSummary.matchedList && importSummary.matchedList.length > 0}
              <div class="im-matches-list">
                <span class="im-matches-title">Firebase Database Matches:</span>
                <div class="im-match-tags">
                  {#each importSummary.matchedList.slice(0, 10) as m}
                    <span class="im-match-tag">
                      <code>{m.deviceId.slice(0, 10)}…</code> ➔ <strong>{m.phoneNumber}</strong> ({m.connName})
                    </span>
                  {/each}
                  {#if importSummary.matchedList.length > 10}
                    <span class="im-match-tag im-more">+{importSummary.matchedList.length - 10} more</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="im-foot">
        <button class="dbtn dbtn-ghost" onclick={() => showImportModal = false} disabled={importLoading}>
          {importSummary ? 'Done' : 'Cancel'}
        </button>
        <button class="dbtn dbtn-primary" onclick={handleExecuteImport} disabled={importLoading || (importTab === 'file' && !importFile) || (importTab === 'paste' && !importPasteText.trim())}>
          {#if importLoading}
            <span class="dspin dspin-sm"></span> Processing…
          {:else}
            🚀 Import & Match Firebase
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toasts -->
<div class="disco-toasts">
  {#each toasts as t (t.id)}
    <div class="dtoast {t.type} {t.out ? 'dtoast-out' : ''}">{t.msg}</div>
  {/each}
  <!-- Probe Results Modal -->
  {#if probeOpen}
    <div class="probe-overlay" onclick={() => probeOpen = false} role="presentation" onkeydown={(e) => e.key === 'Escape' && (probeOpen = false)}>
      <div class="probe-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
        <div class="probe-hdr">
          <span class="probe-title">🔍 Firebase Path Probe</span>
          {#if probeDevice}
            <span class="probe-dev-id">{probeDevice.key.slice(0,16)}…</span>
            <span class="probe-conn" style="color:{probeDevice.conn.color}">{probeDevice.conn.name}</span>
          {/if}
          <button class="probe-close" onclick={() => probeOpen = false}>×</button>
        </div>

        {#if probeLoading}
          <div class="probe-loading">
            <span class="dspin"></span>
            Scanning {probeDevice?.conn?.url?.split('/')[2] ?? 'Firebase'} for device message paths…
          </div>
        {:else if probeResults.length === 0}
          <div class="probe-empty">No paths found with data for this device.</div>
        {:else}
          {@const withData = probeResults.filter(r => r.hasData)}
          {@const empty = probeResults.filter(r => !r.hasData)}
          {#if withData.length > 0}
            <div class="probe-section-hdr probe-hdr-hit">✅ Paths with data ({withData.length})</div>
            {#each withData as r}
              <div class="probe-row probe-row-hit">
                <code class="probe-path">{r.path}</code>
                <span class="probe-meta">{r.keyCount} key{r.keyCount !== 1 ? 's' : ''}</span>
                {#if r.sample}
                  <pre class="probe-sample">{r.sample}</pre>
                {/if}
              </div>
            {/each}
          {:else}
            <div class="probe-section-hdr probe-hdr-miss">❌ No message data found for this device in any known path</div>
            <p class="probe-hint">This device is online but hasn't written any messages to Firebase yet. It may use a custom root path — check the connection settings and update <strong>Database Path</strong> to match.</p>
          {/if}
          {#if empty.length > 0 && withData.length > 0}
            <details class="probe-empty-details">
              <summary>🔸 {empty.length} paths checked — no data</summary>
              {#each empty as r}
                <div class="probe-row probe-row-miss"><code class="probe-path">{r.path}</code></div>
              {/each}
            </details>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

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
  .dh-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .dh-nav-btn {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 600; color: #94a3b8;
    background: rgba(255,255,255,0.05); padding: 5px 10px;
    border-radius: 8px; text-decoration: none; transition: all 0.18s;
  }
  .dh-nav-btn:hover { background: rgba(56,189,248,0.15); color: #38bdf8; }
  .dh-sep { color: #475569; font-size: 13px; }
  .dh-today-pill {
    display: inline-flex; align-items: center;
    background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.35);
    color: #4ade80; font-size: 11px; font-weight: 700;
    padding: 2px 8px; border-radius: 12px;
  }
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
  .dc-c-emerald .dc-n { color: #34d399; } .dc-c-emerald { border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.06); }
  .dc-c-red .dc-n { color: #ef4444; }  .dc-c-red { border-color: rgba(239,68,68,0.12); }
  .dc-c-orange .dc-n { color: #f97316; }  .dc-c-orange { border-color: rgba(249,115,22,0.12); }
  .dc-c-purple .dc-n { color: #a78bfa; }  .dc-c-purple { border-color: rgba(167,139,250,0.12); }

  .dr-filter-tabs { display: flex; align-items: center; gap: 4px; margin-left: 10px; }
  .dr-tab-btn {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    color: #94a3b8; font-size: 11px; font-weight: 600;
    padding: 3px 8px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
  }
  .dr-tab-btn:hover { background: rgba(56,189,248,0.15); color: #e2e8f0; }
  .dr-tab-btn.active {
    background: rgba(56,189,248,0.2); border-color: rgba(56,189,248,0.4);
    color: #38bdf8; font-weight: 700;
  }

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
  .dl-hdr { display: flex; align-items: center; gap: 7px; padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
  .dl-hdr-blue { color: #38bdf8; }
  .dl-hdr-amber { color: #fbbf24; }
  .dl-cnt { margin-left: auto; font-size: 10px; background: rgba(255,255,255,0.06); padding: 1px 7px; border-radius: 10px; }
  .dl-expand-btn {
    font-size: 9.5px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 2px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: none;
    letter-spacing: normal;
    white-space: nowrap;
    touch-action: manipulation;
  }
  .dl-expand-btn:hover {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.3);
  }
  .is-expanded {
    max-height: none !important;
    overflow-y: visible !important;
  }
  .dl-body {
    flex: 1;
    max-height: 380px;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding: 2px 0;
  }
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
  .dt-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; color: #f97316; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
  .dt-body {
    max-height: 200px;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding: 4px 0;
  }
  .dt-row { display: flex; align-items: center; gap: 10px; padding: 4px 14px; font-size: 11px; }
  .dt-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; }
  .dt-info { font-size: 10px; color: #64748b; margin-left: auto; }

  /* Records */
  .disco-records { margin: 0 20px 10px; background: #0e1420; border: 1px solid rgba(34,197,94,0.1); border-radius: 10px; overflow: hidden; }
  .dr-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #22c55e; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
  .dr-body {
    max-height: 280px;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
  .dr-row { padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.02); }
  .dr-main { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
  .dr-devid { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; }
  .dr-arrow { color: #475569; font-size: 11px; }
  .dr-phone { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #22c55e; font-weight: 600; }
  .dr-meta { display: flex; align-items: center; gap: 8px; font-size: 9px; color: #475569; }

  /* Log */
  .disco-log { margin: 0 20px; background: #0e1420; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; }
  .dlog-hdr { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap; }
  .dlog-clear { margin-left: auto; font-size: 9px; color: #64748b; background: none; border: none; cursor: pointer; padding: 2px 5px; border-radius: 3px; }
  .dlog-clear:hover { color: #fb7185; }
  .dlog-body {
    max-height: 280px;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding: 2px 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
  }
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
  .dm-title { font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dm-form { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dm-select { background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 5px 8px; font-size: 11px; font-family: 'JetBrains Mono', monospace; min-width: 140px; max-width: 220px; cursor: pointer; }
  .dm-select:focus { border-color: rgba(56,189,248,0.3); outline: none; }
  .dm-input { background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 5px 8px; font-size: 11px; font-family: 'JetBrains Mono', monospace; width: 130px; }
  .dm-input:focus { border-color: rgba(56,189,248,0.3); outline: none; }
  .dm-input-wide { width: 180px; }
  .dbtn-sm { padding: 5px 10px; font-size: 10px; }
  .dm-skipped {
    max-height: 160px;
    overflow-y: auto;
    overscroll-behavior-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
  .dm-skip-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }
  .dm-skip-id { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #7dd3fc; word-break: break-all; }
  .dm-skip-undo { background: none; border: none; cursor: pointer; font-size: 10px; color: #64748b; padding: 2px 6px; border-radius: 3px; margin-left: auto; white-space: nowrap; }
  .dm-skip-undo:hover { color: #34d399; background: rgba(52,211,153,0.1); }

  /* Quick Nav */
  .disco-quicknav {
    display: flex; align-items: center; gap: 6px; padding: 6px 20px;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y;
    overscroll-behavior-x: contain;
    overscroll-behavior-y: auto;
    scrollbar-width: none;
  }
  .disco-quicknav::-webkit-scrollbar { display: none; }
  .qn-btn {
    flex-shrink: 0;
    touch-action: manipulation;
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

    .dlog-body { max-height: 260px; }
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
    .dl-expand-btn { font-size: 9px; padding: 2px 6px; }
    .dl-body { max-height: 320px; }
    .dl-row { padding: 8px 10px; }
    .dl-row-main { gap: 4px; }
    .dl-id { font-size: 10px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .dl-phone { font-size: 10px; }
    .dl-row-meta { gap: 4px; flex-wrap: wrap; }
    .dl-skip-btn { font-size: 14px; padding: 6px 10px; min-width: 36px; min-height: 36px; }

    .dt-hdr { padding: 8px 10px; font-size: 10px; }
    .dt-body { max-height: 180px; }
    .dt-row { padding: 5px 10px; }
    .dt-id { font-size: 9px; word-break: break-all; }

    .dr-hdr { padding: 8px 10px; font-size: 10px; }
    .dr-body { max-height: 240px; }
    .dr-row { padding: 6px 10px; }
    .dr-devid { font-size: 8px; }
    .dr-phone { font-size: 10px; }
    .dr-meta { font-size: 8px; }

    .dlog-hdr { padding: 8px 10px; font-size: 10px; }
    .dlog-body { max-height: 220px; }

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

  /* ── Extra buttons & Records styling ── */
  .dbtn-import { background: rgba(168, 85, 247, 0.14); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.28); }
  .dbtn-import:hover:not(:disabled) { background: rgba(168, 85, 247, 0.22); color: #d8b4fe; border-color: rgba(168, 85, 247, 0.4); }
  .dbtn-cloud { background: linear-gradient(135deg, #0284c7, #0369a1); color: #ffffff; border: 1px solid rgba(56, 189, 248, 0.35); box-shadow: 0 0 10px rgba(14, 165, 233, 0.2); }
  .dbtn-cloud:hover:not(:disabled) { box-shadow: 0 0 16px rgba(14, 165, 233, 0.4); transform: translateY(-1px); }
  .dbtn-xs { padding: 2px 7px; font-size: 10px; border-radius: 5px; }

  .dr-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 10px 14px; }
  .dr-hdr-left { display: flex; align-items: center; gap: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #22c55e; }
  .dr-hdr-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dr-search-input { background: #111d35; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 3px 8px; font-size: 10.5px; width: 130px; font-family: inherit; }
  .dr-search-input:focus { border-color: rgba(56,189,248,0.3); outline: none; }

  .dr-row-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .dr-post-btn { background: rgba(14, 165, 233, 0.12); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 4px; padding: 2px 8px; font-size: 9.5px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; font-family: inherit; }
  .dr-post-btn:hover:not(:disabled) { background: rgba(14, 165, 233, 0.25); color: #7dd3fc; }
  .dr-post-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .dr-post-btn-synced { background: rgba(34, 197, 94, 0.08); color: #86efac; border-color: rgba(34, 197, 94, 0.2); }
  .dr-synced-badge { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 4px; padding: 1px 6px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
  .dr-unmatched { color: #fb7185 !important; }
  .dr-method-import { color: #c084fc !important; }

  /* ── Import Modal ── */
  .im-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 16px; animation: dt-in 0.2s ease; }
  .im-dialog { background: #0e1420; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); }
  .im-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .im-title-group { display: flex; gap: 12px; align-items: flex-start; }
  .im-icon { font-size: 22px; line-height: 1; }
  .im-title { margin: 0; font-size: 15px; font-weight: 700; color: #f1f5f9; }
  .im-sub { margin: 3px 0 0; font-size: 11px; color: #94a3b8; line-height: 1.4; }
  .im-close { background: none; border: none; font-size: 16px; color: #64748b; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.15s; }
  .im-close:hover { color: #f1f5f9; background: rgba(255, 255, 255, 0.06); }
  .im-tabs { display: flex; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background: rgba(0, 0, 0, 0.2); padding: 0 16px; }
  .im-tab { background: none; border: none; border-bottom: 2px solid transparent; color: #94a3b8; font-size: 12px; font-weight: 600; padding: 10px 14px; cursor: pointer; transition: all 0.15s; font-family: inherit; }
  .im-tab.active { color: #38bdf8; border-bottom-color: #38bdf8; }
  .im-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }

  /* Dropzone */
  .im-dropzone { border: 2px dashed rgba(56, 189, 248, 0.25); border-radius: 10px; background: rgba(56, 189, 248, 0.02); transition: all 0.2s; position: relative; }
  .im-dropzone:hover { border-color: rgba(56, 189, 248, 0.45); background: rgba(56, 189, 248, 0.05); }
  .im-file-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .im-drop-label { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 16px; text-align: center; cursor: pointer; pointer-events: none; }
  .im-drop-icon { color: #38bdf8; margin-bottom: 8px; opacity: 0.8; }
  .im-file-name { font-size: 13px; font-weight: 700; color: #38bdf8; word-break: break-all; font-family: 'JetBrains Mono', monospace; }
  .im-file-size { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .im-drop-text { font-size: 12px; color: #e2e8f0; line-height: 1.4; }
  .im-drop-hint { font-size: 10.5px; color: #64748b; margin-top: 5px; }

  .im-paste-group { display: flex; flex-direction: column; }
  .im-textarea { width: 100%; background: #090d16; color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; font-size: 11px; font-family: 'JetBrains Mono', monospace; line-height: 1.5; resize: vertical; box-sizing: border-box; }
  .im-textarea:focus { border-color: rgba(56, 189, 248, 0.4); outline: none; }

  .im-checkbox-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.2); border-radius: 8px; cursor: pointer; }
  .im-checkbox { margin-top: 2px; accent-color: #0284c7; width: 15px; height: 15px; cursor: pointer; }
  .im-check-text { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: #e2e8f0; }
  .im-check-text strong { color: #7dd3fc; }
  .im-check-text small { color: #94a3b8; font-size: 10px; line-height: 1.3; }

  .im-summary-box { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .im-sum-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .im-sum-badge { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 5px; }
  .im-sb-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
  .im-sb-green { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
  .im-sb-amber { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
  .im-sb-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .im-sb-cloud { background: rgba(14, 165, 233, 0.25); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.3); }

  .im-matches-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .im-matches-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
  .im-match-tags { display: flex; flex-wrap: wrap; gap: 5px; max-height: 110px; overflow-y: auto; }
  .im-match-tag { font-size: 10px; background: rgba(255, 255, 255, 0.05); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05); color: #cbd5e1; }
  .im-match-tag code { color: #7dd3fc; }
  .im-match-tag strong { color: #22c55e; }
  .im-more { color: #94a3b8; font-style: italic; }

  .im-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); }

  /* Deep Scan button and wrapper */
  .deepscan-wrap { display: inline-flex; align-items: center; gap: 0; border: 1px solid rgba(20,184,166,0.3); border-radius: 6px; overflow: hidden; }
  .deepscan-workers-sel { background: rgba(20,184,166,0.1); color: #2dd4bf; border: none; border-right: 1px solid rgba(20,184,166,0.2); padding: 0 6px; font-size: 10px; font-family: inherit; cursor: pointer; height: 26px; outline: none; min-width: 40px; }
  .deepscan-workers-sel:disabled { opacity: 0.5; cursor: not-allowed; }
  .dbtn-deepscan { background: rgba(20, 184, 166, 0.14); color: #2dd4bf; border: none; }
  .dbtn-deepscan:hover:not(:disabled) { background: rgba(20, 184, 166, 0.24); color: #5eead4; box-shadow: 0 0 10px rgba(20, 184, 166, 0.2); }
  .dbtn-deepscan:disabled { opacity: 0.7; cursor: not-allowed; }

  /* Deep Scan result banner */
  .deepscan-result { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; animation: dt-in 0.25s ease; flex-wrap: wrap; }
  .deepscan-hit { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.28); color: #86efac; }
  .deepscan-miss { background: rgba(148, 163, 184, 0.07); border: 1px solid rgba(148, 163, 184, 0.15); color: #94a3b8; }
  .ds-icon { font-size: 16px; flex-shrink: 0; }
  .ds-sub { opacity: 0.65; font-size: 10.5px; }
  .ds-close { margin-left: auto; background: transparent; border: none; color: inherit; opacity: 0.5; cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1; flex-shrink: 0; }
  .ds-close:hover { opacity: 1; }
  .deepscan-persist-bar { display: flex; align-items: center; gap: 8px; padding: 7px 14px; background: rgba(20,184,166,0.06); border: 1px solid rgba(20,184,166,0.15); border-radius: 8px; font-size: 11px; color: #5eead4; flex-wrap: wrap; }
  .deepscan-persist-bar strong { color: #2dd4bf; }

  /* Share/Copy controls */
  .share-wrap { display: inline-flex; align-items: center; gap: 0; border: 1px solid rgba(251,191,36,0.25); border-radius: 6px; overflow: hidden; }
  .share-fmt-sel { background: rgba(251,191,36,0.08); color: #fbbf24; border: none; border-right: 1px solid rgba(251,191,36,0.2); padding: 0 6px; font-size: 10px; font-family: inherit; cursor: pointer; height: 26px; outline: none; }
  .dbtn-share { background: rgba(251,191,36,0.1); color: #fbbf24; border: none; border-radius: 0; padding: 0 10px; height: 26px; font-size: 10.5px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
  .dbtn-share:hover { background: rgba(251,191,36,0.2); color: #fde68a; }
  .dbtn-share-done { background: rgba(34,197,94,0.15); color: #4ade80; }

  /* All-Discovered / WATCHING mode */
  .all-discovered-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: linear-gradient(135deg, rgba(34,197,94,0.12), rgba(20,184,166,0.08)); border: 1px solid rgba(34,197,94,0.3); border-radius: 10px; animation: dt-in 0.3s ease; flex-wrap: wrap; }
  .adb-icon { font-size: 22px; flex-shrink: 0; }
  .adb-text { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 180px; }
  .adb-text strong { color: #4ade80; font-size: 13px; }
  .adb-text span { color: #86efac; font-size: 11px; opacity: 0.85; }
  .dh-watching-pill { background: rgba(20,184,166,0.15) !important; color: #2dd4bf !important; border-color: rgba(20,184,166,0.3) !important; }

  /* Probe button */
  .dl-probe-btn { background: transparent; border: 1px solid rgba(99,102,241,0.25); border-radius: 4px; color: #818cf8; cursor: pointer; font-size: 10px; padding: 1px 5px; transition: all 0.15s; flex-shrink: 0; margin-left: 2px; }
  .dl-probe-btn:hover { background: rgba(99,102,241,0.12); color: #a5b4fc; border-color: rgba(99,102,241,0.5); }

  /* Probe overlay & modal */
  .probe-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px); animation: dt-in 0.2s ease; }
  .probe-modal { background: #0f1623; border: 1px solid rgba(99,102,241,0.3); border-radius: 14px; width: 100%; max-width: 680px; max-height: 80vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 0; }
  .probe-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-wrap: wrap; }
  .probe-title { font-weight: 700; font-size: 14px; color: #a5b4fc; flex-shrink: 0; }
  .probe-dev-id { font-family: monospace; font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; }
  .probe-conn { font-size: 11px; font-weight: 600; }
  .probe-close { margin-left: auto; background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 20px; line-height: 1; padding: 0 2px; flex-shrink: 0; }
  .probe-close:hover { color: #f87171; }
  .probe-loading { display: flex; align-items: center; gap: 10px; padding: 24px 20px; color: #94a3b8; font-size: 13px; }
  .probe-empty { padding: 20px; color: #64748b; font-size: 13px; text-align: center; }
  .probe-section-hdr { padding: 8px 18px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .probe-hdr-hit { background: rgba(34,197,94,0.08); color: #4ade80; border-bottom: 1px solid rgba(34,197,94,0.12); }
  .probe-hdr-miss { background: rgba(248,113,113,0.07); color: #f87171; border-bottom: 1px solid rgba(248,113,113,0.1); }
  .probe-row { padding: 8px 18px; border-bottom: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 4px; }
  .probe-row-hit { background: rgba(34,197,94,0.03); }
  .probe-row-miss { background: transparent; opacity: 0.5; }
  .probe-path { font-family: monospace; font-size: 11.5px; color: #38bdf8; background: rgba(56,189,248,0.07); padding: 2px 6px; border-radius: 3px; word-break: break-all; }
  .probe-meta { font-size: 10px; color: #64748b; }
  .probe-sample { font-family: monospace; font-size: 10px; color: #94a3b8; background: rgba(255,255,255,0.04); padding: 6px 8px; border-radius: 4px; word-break: break-all; white-space: pre-wrap; margin: 0; border: 1px solid rgba(255,255,255,0.06); max-height: 100px; overflow-y: auto; }
  .probe-hint { padding: 12px 18px; color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.6; }
  .probe-hint strong { color: #fbbf24; }
  .probe-empty-details { padding: 8px 18px; }
  .probe-empty-details summary { font-size: 11px; color: #64748b; cursor: pointer; padding: 4px 0; }

  /* ── Notification Bell ──────────────────────────────────────────────────── */
  .notif-bell-wrap { position: relative; }
  .notif-bell-btn { position: relative; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #94a3b8; cursor: pointer; padding: 6px 8px; display: flex; align-items: center; gap: 4px; transition: all 0.15s; }
  .notif-bell-btn:hover { background: rgba(99,102,241,0.12); color: #a5b4fc; border-color: rgba(99,102,241,0.3); }
  .notif-badge { position: absolute; top: -5px; right: -5px; background: #ef4444; color: #fff; font-size: 9px; font-weight: 700; border-radius: 999px; padding: 1px 4px; min-width: 16px; text-align: center; line-height: 1.4; }
  .notif-monitor-dot { width: 6px; height: 6px; border-radius: 50%; background: #374151; display: block; flex-shrink: 0; transition: background 0.3s; }
  .notif-monitor-dot.active { background: #22c55e; box-shadow: 0 0 6px #22c55e; animation: pulse-green 2s infinite; }
  @keyframes pulse-green { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

  /* Panel */
  .notif-panel { position: absolute; top: calc(100% + 8px); right: 0; width: 380px; max-height: 480px; background: #0d1424; border: 1px solid rgba(99,102,241,0.25); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); z-index: 9000; display: flex; flex-direction: column; overflow: hidden; animation: notif-in 0.15s ease; }
  @keyframes notif-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  .notif-panel-hdr { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; gap: 8px; }
  .notif-panel-title { font-size: 13px; font-weight: 700; color: #e2e8f0; flex: 1; }
  .notif-panel-actions { display: flex; gap: 4px; align-items: center; }
  .notif-act-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; color: #94a3b8; cursor: pointer; font-size: 10px; padding: 3px 7px; transition: all 0.15s; white-space: nowrap; }
  .notif-act-btn:hover { background: rgba(99,102,241,0.15); color: #a5b4fc; }
  .notif-close-btn { background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 18px; padding: 0 2px; line-height: 1; flex-shrink: 0; }
  .notif-close-btn:hover { color: #f87171; }
  .notif-empty { padding: 20px 16px; color: #64748b; font-size: 12px; text-align: center; }
  .notif-list { overflow-y: auto; flex: 1; }
  .notif-item { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.1s; }
  .notif-item:hover { background: rgba(255,255,255,0.02); }
  .notif-unread { border-left: 2px solid #6366f1; background: rgba(99,102,241,0.04); }
  .notif-item-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
  .notif-dev { font-family: monospace; font-size: 10px; color: #64748b; background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 3px; }
  .notif-phone { font-family: monospace; font-size: 11px; color: #4ade80; font-weight: 600; }
  .notif-conn { font-size: 10px; font-weight: 600; }
  .notif-time { font-size: 10px; color: #475569; margin-left: auto; flex-shrink: 0; }
  .notif-item-from { font-size: 10px; color: #64748b; margin-bottom: 2px; }
  .notif-item-body { font-size: 12px; color: #cbd5e1; line-height: 1.5; word-break: break-word; }
</style>

