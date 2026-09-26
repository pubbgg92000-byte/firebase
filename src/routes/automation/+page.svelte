<script>
  import '../../app.css';
  import '$lib/styles/automation.css';
  import {
    autoEngine,
    addLog,
    clearLogs,
    updateConfig,
    loadConfig,
    saveConfig,
    runPreflight,
    selectNextDevice,
    getAllEligibleDevices,
    startAutomation,
    pauseAutomation,
    resumeAutomation,
    stopAutomation,
    stepAutomation,
    manualReusePhone,
    clearUsedSessionDevices,
    resetStats,
    formatElapsed,
    syncWorkerStatus,
    connectTelegram,
    submitAuthCode,
    submitTwoFA,
    disconnectTelegram,
    forceBotStart,
    forceBotCancel,
    skipCurrentJob,
    sendBotCommand
  } from '$lib/automation-engine.svelte.js';
  import {
    engine as discoveryEngine,
    withNumber as _withNumber,
    onlineDevices as _onlineDevices,
    allDevices as _allDevices,
    getDisplayPhone,
    getDiscoveredPhone,
    fetchAllDevices
  } from '$lib/discovery-engine.svelte.js';
  import { extractNumber } from '$lib/device-helpers.js';
  import { registry } from '$lib/automation-registry.js';
  import { onMount, onDestroy } from 'svelte';
  import OrchestrationControls from '$lib/components/automation/OrchestrationControls.svelte';
  import WorkerBridgeCard from '$lib/components/automation/WorkerBridgeCard.svelte';
  import PreflightDiagnostics from '$lib/components/automation/PreflightDiagnostics.svelte';
  import LiveSmsFeed from '$lib/components/automation/LiveSmsFeed.svelte';
  import DedicatedSmsTab from '$lib/components/automation/DedicatedSmsTab.svelte';
  import QueueManagerTab from '$lib/components/automation/QueueManagerTab.svelte';
  import RegistryManagerTab from '$lib/components/automation/RegistryManagerTab.svelte';
  import ConfigPanelTab from '$lib/components/automation/ConfigPanelTab.svelte';
  import LogsViewerTab from '$lib/components/automation/LogsViewerTab.svelte';

  // Derived state from discovery engine
  let allDevicesList = $derived(_allDevices());
  let onlineDevicesList = $derived(_onlineDevices());
  let withNumberList = $derived(_withNumber());
  let allCandidatesList = $derived(getAllEligibleDevices());

  // Local UI state
  let searchQuery = $state('');
  let registrySearch = $state('');
  let registryStatusFilter = $state('all'); // 'all' | 'successful' | 'expired' | 'suspended' | 'rate_limited' | 'failed'
  let isSyncingRegistry = $state(false);
  let importModalOpen = $state(false);
  let importJsonText = $state('');
  let importError = $state('');
  let activeTab = $state('overview'); // 'overview' | 'sms_feed' | 'queue' | 'registry' | 'config' | 'logs'
  let toasts = $state([]);
  let registryRecords = $state([]);
  let registryStats = $derived(registry.getStats());
  let savingConfig = $state(false);

  // Live Dashboard SMS / OTP Feed State
  let dashboardNotifs = $state([]);
  let smsSearchKeyword = $state('');
  let smsFilterMode = $state('all'); // 'all' | 'swiggy' | 'otp' | 'target'

  // Telegram auth UI fields
  let tgPhone = $state('');
  let tgCode = $state('');
  let tgPassword = $state('');
  let tgSubmitting = $state(false);

  function refreshRegistryView() {
    registryRecords = registry.getAllArray();
  }

  function toast(msg, type = 'info') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.map(t => t.id === id ? { ...t, out: true } : t);
      setTimeout(() => toasts = toasts.filter(t => t.id !== id), 350);
    }, 3200);
  }

  function copyText(txt) {
    const s = String(txt ?? '');
    if (!s) return;
    navigator.clipboard?.writeText(s).then(() => {
      toast('Copied to clipboard', 'success');
    }).catch(() => {
      toast('Could not copy', 'warn');
    });
  }

  /** Strip country code from phone number: +91XXXXXXXXXX → XXXXXXXXXX */
  function stripCountryCode(phone) {
    if (!phone) return '';
    let p = String(phone).trim();
    // Remove leading + and common country codes (1-3 digit)
    // Common codes: +91 (India), +1 (US), +44 (UK), +971 (UAE), etc.
    p = p.replace(/^\+?\d{1,3}(?=\d{10}$)/, '');  // strip if remaining is 10 digits
    if (!p) p = String(phone).replace(/^\+/, '');   // fallback: just remove +
    return p;
  }

  /** Copy phone number without country code */
  function copyPhoneLocal(phone) {
    const local = stripCountryCode(phone);
    if (!local) return;
    navigator.clipboard?.writeText(local).then(() => {
      toast(`Copied: ${local}`, 'success');
    }).catch(() => {
      toast('Could not copy', 'warn');
    });
  }

  // Filtered candidate pool (discovered numbers + online devices)
  let filteredDevices = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    return allCandidatesList.filter(cand => {
      const phone = cand.rawPhone || cand.normalizedPhone || '';
      const name = cand.conn?.name || cand.connId || '';
      const key = cand.deviceId || '';
      const src = cand.source || '';
      const matchesQ = !q || key.toLowerCase().includes(q) || phone.includes(q) || name.toLowerCase().includes(q) || src.includes(q);

      if (autoEngine.config.selectedConnId !== 'all' && cand.connId !== autoEngine.config.selectedConnId) {
        return false;
      }
      return matchesQ;
    });
  });

  // Filtered registry list
  let filteredRegistry = $derived.by(() => {
    const q = registrySearch.toLowerCase().trim();
    return registryRecords.filter(r => {
      const matchesQ = !q ||
        r.phone?.includes(q) ||
        r.deviceId?.toLowerCase().includes(q) ||
        r.database?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q);

      if (!matchesQ) return false;

      if (registryStatusFilter !== 'all') {
        const st = String(r.status || '').toLowerCase();
        if (registryStatusFilter === 'successful') {
          if (st !== 'successful' && st !== 'success') return false;
        } else if (registryStatusFilter === 'expired') {
          if (st !== 'expired') return false;
        } else if (registryStatusFilter === 'suspended') {
          if (st !== 'suspended') return false;
        } else if (registryStatusFilter === 'rate_limited') {
          if (st !== 'rate_limited') return false;
        } else if (registryStatusFilter === 'failed') {
          if (['successful', 'success', 'expired', 'suspended', 'rate_limited'].includes(st)) return false;
        }
      }

      return true;
    });
  });

  // ── Live SMS & Dashboard Notifications Helper Functions ───────────────────
  function extractOTPFromText(text) {
    if (!text) return null;
    const str = String(text);
    const nums = str.match(/\b(\d{4,8})\b/g);
    if (!nums) return null;
    return (
      nums.find(m => m.length === 6) ||
      nums.find(m => m.length === 4) ||
      nums.find(m => m.length === 8) ||
      nums[0]
    );
  }

  function formatNotifTime(val) {
    if (!val) return '—';
    try {
      const d = val instanceof Date ? val : new Date(typeof val === 'number' ? val : String(val));
      if (isNaN(d)) return String(val);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
    } catch {
      return String(val);
    }
  }

  function getStoredDashboardNotifs() {
    if (typeof localStorage === 'undefined') return [];
    try {
      // 1. Check active notifications from main dashboard
      const raw = localStorage.getItem('pd_active_notifs');
      const activeList = raw ? JSON.parse(raw) : [];

      // 2. Check persistent automation SMS feed buffer
      const rawBuf = localStorage.getItem('pd_automation_sms_feed');
      const bufList = rawBuf ? JSON.parse(rawBuf) : [];

      const map = new Map();
      const combined = [...(Array.isArray(bufList) ? bufList : []), ...(Array.isArray(activeList) ? activeList : [])];
      for (const item of combined) {
        if (!item) continue;
        const k = item.id || item.msgId || `${item.connId || ''}::${item.devKey || ''}::${item.message || ''}`;
        if (!item.otp && item.message) {
          item.otp = extractOTPFromText(item.message);
        }
        map.set(k, item);
      }

      return Array.from(map.values()).sort((a, b) => {
        const ta = Number(a.createdAt) || (a.ts ? new Date(a.ts).getTime() : 0);
        const tb = Number(b.createdAt) || (b.ts ? new Date(b.ts).getTime() : 0);
        return tb - ta;
      }).slice(0, 100);
    } catch {
      return [];
    }
  }

  function syncDashboardNotifs() {
    const list = getStoredDashboardNotifs();
    dashboardNotifs = list;
    try {
      if (typeof localStorage !== 'undefined' && list.length > 0) {
        localStorage.setItem('pd_automation_sms_feed', JSON.stringify(list.slice(0, 80)));
      }
    } catch {}
  }

  function clearSmsFeed() {
    dashboardNotifs = [];
    try {
      localStorage.removeItem('pd_automation_sms_feed');
    } catch {}
    toast('Live SMS feed cleared', 'info');
  }

  function handlePasteToSend(text) {
    if (!text) return;
    const str = String(text).trim();
    customBotCommand = str;
    toast(`Pasted '${str}' into Send Text box!`, 'info');

    // Scroll to and focus the direct command input
    setTimeout(() => {
      const el = document.getElementById('direct-bot-cmd-input');
      if (el) {
        el.focus();
        el.classList.add('pulse-focus');
        setTimeout(() => el.classList.remove('pulse-focus'), 1000);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }

  async function handleDirectSendToBot(text) {
    const code = String(text ?? '').trim();
    if (!code) return;
    toast(`Directly dispatching '${code}' to @${autoEngine.config.botUsername.replace(/^@/, '')}...`, 'info');
    const ok = await sendBotCommand(code);
    if (ok) {
      toast(`Dispatched '${code}' to bot!`, 'success');
      setTimeout(checkWorkerStatus, 500);
      setTimeout(syncWorkerStatus, 800);
    } else {
      toast('Failed to dispatch command to bot', 'error');
    }
  }

  function isTargetMatch(notif) {
    const cur = autoEngine.currentJob?.phone || autoEngine.workerStatus.phone;
    if (!cur) return false;
    const clean = cur.replace(/\D/g, '').slice(-10);
    if (!clean) return false;
    const msg = String(notif.message || '');
    const ph = String(notif.phone || notif.targetPhone || '');
    const dev = String(notif.devKey || notif.deviceId || '');
    return ph.includes(clean) || msg.includes(clean) || dev.includes(clean);
  }

  // Filtered live SMS notifications stream
  let filteredSmsNotifications = $derived.by(() => {
    const q = smsSearchKeyword.toLowerCase().trim();
    const curPhone = (autoEngine.currentJob?.phone || autoEngine.workerStatus.phone || '').replace(/\D/g, '').slice(-10);

    return dashboardNotifs.filter(notif => {
      const msg = String(notif.message || '').toLowerCase();
      const sender = String(notif.sender || '').toLowerCase();
      const otp = String(notif.otp || '');
      const ph = String(notif.phone || notif.targetPhone || '').toLowerCase();
      const dev = String(notif.devKey || notif.deviceId || '').toLowerCase();
      const about = String(notif.about || '').toLowerCase();

      // Mode filter
      if (smsFilterMode === 'swiggy' && !msg.includes('swiggy') && !sender.includes('swiggy') && !about.includes('swiggy')) {
        return false;
      }
      if (smsFilterMode === 'otp' && !notif.otp) {
        return false;
      }
      if (smsFilterMode === 'target') {
        if (!curPhone) return false;
        if (!ph.includes(curPhone) && !msg.includes(curPhone) && !dev.includes(curPhone)) {
          return false;
        }
      }

      // Keyword query
      if (q) {
        const matchesQ =
          msg.includes(q) ||
          sender.includes(q) ||
          otp.includes(q) ||
          ph.includes(q) ||
          dev.includes(q) ||
          about.includes(q);
        if (!matchesQ) return false;
      }

      return true;
    });
  });

  // Actions
  async function handleRunPreflight() {
    toast('Running pre-flight diagnostics...', 'info');
    const ok = await runPreflight();
    refreshRegistryView();
    if (ok) {
      toast('Pre-flight checks passed! Start is unlocked.', 'success');
    } else {
      toast('Pre-flight checks failed. Review diagnostics.', 'error');
    }
  }

  async function handleStart() {
    if (!autoEngine.preflightPassed) {
      toast('Pre-flight test must pass before starting.', 'warn');
      return;
    }
    const ok = await startAutomation();
    if (ok) toast('Automation orchestrator started', 'success');
  }

  function handlePause() {
    pauseAutomation();
    toast('Automation paused', 'info');
  }

  function handleResume() {
    resumeAutomation();
    toast('Automation resumed', 'success');
  }

  function handleStop() {
    stopAutomation();
    toast('Automation stopped', 'warn');
  }

  async function handleStep(dev = null) {
    toast('Stepping single device test...', 'info');
    let target = null;
    if (dev) {
      const rawPhone = getDisplayPhone(dev.connId, dev.key, dev.info);
      const normalized = extractNumber(rawPhone);
      target = {
        dev,
        rawPhone,
        normalizedPhone: normalized,
        compKey: `${dev.conn.url || dev.connId}|${dev.key}`,
        deviceId: dev.key,
        conn: dev.conn,
        connId: dev.connId,
        info: dev.info
      };
    }
    await stepAutomation(target);
    refreshRegistryView();
  }

  function handleManualReuse(phone) {
    if (confirm(`Allow manual reuse of phone number ${phone}?\n\nThis will remove it from the persistent protection registry so it can be tested again.`)) {
      manualReusePhone(phone);
      refreshRegistryView();
      toast(`Number ${phone} unlocked for reuse`, 'success');
    }
  }

  // ── Telegram Auth Handlers ─────────────────────────────────────────────────
  async function handleConnectTelegram() {
    const phone = tgPhone.trim();
    if (!phone) { toast('Enter your Telegram phone number first', 'warn'); return; }
    tgSubmitting = true;
    tgCode = '';
    tgPassword = '';
    try {
      const ok = await connectTelegram(phone);
      if (ok) toast('Auth request sent to worker. Waiting for code...', 'info');
      else toast('Failed to send auth request — check Firebase connectivity', 'error');
    } finally {
      tgSubmitting = false;
    }
  }

  async function handleSubmitCode() {
    const code = tgCode.trim();
    if (!code) { toast('Enter the verification code first', 'warn'); return; }
    tgSubmitting = true;
    try {
      const ok = await submitAuthCode(code);
      if (ok) toast('Code submitted to worker. Verifying...', 'info');
      else toast('Code submission failed', 'error');
    } finally {
      tgSubmitting = false;
    }
  }

  async function handleSubmitTwoFA() {
    const pwd = tgPassword.trim();
    if (!pwd) { toast('Enter your 2FA password', 'warn'); return; }
    tgSubmitting = true;
    try {
      const ok = await submitTwoFA(pwd);
      if (ok) toast('2FA password submitted. Verifying...', 'info');
      else toast('2FA submission failed', 'error');
    } finally {
      tgSubmitting = false;
    }
  }

  async function handleDisconnectTelegram() {
    tgSubmitting = true;
    tgCode = '';
    tgPassword = '';
    try {
      await disconnectTelegram();
      toast('Telegram session cleared', 'info');
    } finally {
      tgSubmitting = false;
    }
  }

  async function handleSyncRegistry(silent = false) {
    isSyncingRegistry = true;
    try {
      const res = await registry.syncFromFirebase(discoveryEngine.connections);
      refreshRegistryView();
      if (!silent) {
        toast(`Synced ${res.synced} numbers from Firebase (${res.total} total recorded)`, 'success');
      }
    } catch (e) {
      if (!silent) toast(`Sync failed: ${e.message}`, 'error');
    } finally {
      isSyncingRegistry = false;
    }
  }

  function handleDownloadCsv() {
    const csvStr = registry.exportCsv();
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `numbers_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported numbers log CSV', 'success');
  }

  function handleDownloadRegistry() {
    const jsonStr = registry.exportJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation_numbers_registry_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported numbers registry JSON', 'success');
  }

  function handleImportSubmit() {
    importError = '';
    const res = registry.importJson(importJsonText, true);
    if (res.success) {
      toast(`Imported ${res.count} registry entries`, 'success');
      importModalOpen = false;
      importJsonText = '';
      refreshRegistryView();
    } else {
      importError = res.error || 'Failed to parse JSON';
    }
  }

  function handleClearRegistry() {
    if (confirm('CAUTION: Are you sure you want to clear the persistent success registry?\n\nPreviously verified numbers will lose their protection against re-testing.')) {
      registry.clear();
      refreshRegistryView();
      toast('Success registry cleared', 'warn');
    }
  }

  async function handleSaveConfig() {
    savingConfig = true;
    try {
      await saveConfig();
      toast('Configuration & credentials saved and synced to worker', 'success');
      runPreflight();
    } catch (e) {
      toast(`Save error: ${e.message}`, 'error');
    } finally {
      savingConfig = false;
    }
  }

  async function handleForceStart() {
    toast('Sending /start to Telegram bot...', 'info');
    const ok = await forceBotStart();
    if (ok) toast('/start command signaled to bot', 'success');
    setTimeout(checkWorkerStatus, 500);
    setTimeout(syncWorkerStatus, 700);
  }

  async function handleForceCancel() {
    toast('Sending /cancel to Telegram bot & resetting job...', 'warn');
    const ok = await forceBotCancel();
    if (ok) toast('/cancel signaled: worker & active job reset', 'info');
    setTimeout(checkWorkerStatus, 500);
    setTimeout(syncWorkerStatus, 700);
  }

  async function handleSkipCurrent() {
    toast('Skipping current job...', 'info');
    const ok = await skipCurrentJob();
    if (ok) toast('Skip signal sent to worker', 'info');
    setTimeout(checkWorkerStatus, 500);
    setTimeout(syncWorkerStatus, 700);
  }

  // Worker process management & live logs via local server API
  let workerRunning = $state(false);
  let workerPid = $state(null);
  let workerToggling = $state(false);
  let workerLogs = $state([]);
  let customBotCommand = $state('');
  let activeLogSubTab = $state('worker'); // 'worker' | 'orchestrator'

  async function checkWorkerStatus() {
    try {
      const res = await fetch('/api/worker-process');
      if (res.ok) {
        const d = await res.json();
        workerRunning = !!d.running;
        workerPid = d.pid;
        if (Array.isArray(d.logs)) {
          workerLogs = d.logs;
        }
      }
    } catch {}
  }

  async function toggleWorker() {
    if (workerToggling) return;
    workerToggling = true;
    const action = workerRunning ? 'stop' : 'start';
    try {
      const res = await fetch('/api/worker-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const d = await res.json();
      if (d.ok) {
        workerRunning = !!d.running;
        workerPid = d.pid;
        toast(d.running ? `Python Telegram worker launched (PID: ${d.pid})` : 'Python worker stopped', 'success');
        checkWorkerStatus();
      } else {
        toast(`Worker error: ${d.error || 'failed to execute'}`, 'error');
      }
    } catch (e) {
      toast(`Worker request error: ${e.message}`, 'error');
    } finally {
      workerToggling = false;
    }
  }

  async function handleRestartWorker() {
    if (workerToggling) return;
    workerToggling = true;
    toast('Restarting Python Telegram worker...', 'info');
    try {
      const res = await fetch('/api/worker-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' })
      });
      const d = await res.json();
      if (d.ok) {
        workerRunning = !!d.running;
        workerPid = d.pid;
        toast(d.running ? `Worker restarted successfully (PID: ${d.pid})` : 'Worker restarted', 'success');
        checkWorkerStatus();
      } else {
        toast(`Worker restart failed: ${d.error || 'failed'}`, 'error');
      }
    } catch (e) {
      toast(`Restart error: ${e.message}`, 'error');
    } finally {
      workerToggling = false;
    }
  }

  async function handleClearWorkerLogs() {
    try {
      await fetch('/api/worker-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-logs' })
      });
      workerLogs = [];
      toast('Worker terminal console cleared', 'info');
    } catch {}
  }

  async function handleSendBotCommand() {
    const cmd = customBotCommand.trim();
    if (!cmd) return;
    customBotCommand = '';
    toast(`Sending '${cmd}' to bot...`, 'info');
    const ok = await sendBotCommand(cmd);
    if (ok) {
      toast(`Command '${cmd}' dispatched to Telegram bot`, 'success');
      setTimeout(checkWorkerStatus, 600);
      setTimeout(syncWorkerStatus, 900);
    } else {
      toast('Failed to dispatch command to worker', 'error');
    }
  }

  // Periodic polling for registry, worker status, and dashboard notifications (2s cadence)
  let pollInterval = null;

  function handleStorageEvent(e) {
    if (e.key === 'pd_active_notifs' || e.key === 'pd_automation_sms_feed') {
      syncDashboardNotifs();
    }
  }

  onMount(async () => {
    await loadConfig();
    refreshRegistryView();
    syncWorkerStatus();
    checkWorkerStatus();
    handleSyncRegistry(true);
    syncDashboardNotifs();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageEvent);
    }

    pollInterval = setInterval(() => {
      refreshRegistryView();
      syncWorkerStatus();
      checkWorkerStatus();
      syncDashboardNotifs();
    }, 2000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  });
</script>

<svelte:head>
  <title>Automation Orchestrator | Firebase RTDB</title>
</svelte:head>

<div class="auto-page">
  <!-- Top Navigation & Header -->
  <header class="auto-header">
    <div class="header-left">
      <a href="/" class="nav-back-link" title="Back to Main Panel">← Dashboard</a>
      <span class="nav-sep">/</span>
      <a href="/discovery" class="nav-sub-link">Discovery 📡</a>
      <span class="nav-sep">/</span>
      <h1 class="page-title">
        <span class="title-icon">🤖</span>
        Automation Orchestrator
      </h1>
      <span class="live-mode-badge" title="Live automation mode: automatic continuous execution across all discovered & online numbers">
        ● LIVE RUN
      </span>
    </div>

    <div class="header-right">
      <button
        class="worker-pill {workerRunning ? 'running' : 'stopped'}"
        onclick={toggleWorker}
        disabled={workerToggling}
        title={workerRunning ? `Python Worker is running (PID: ${workerPid}). Click to stop.` : "Python Worker is stopped. Click to start."}
      >
        <span class="pulse-dot {workerRunning ? 'dot-online' : 'dot-offline'}"></span>
        {workerToggling ? 'Switching...' : (workerRunning ? `Worker: Active (${workerPid})` : 'Worker: Offline (Click to Run)')}
      </button>

      <div class="status-indicator-pill status-{autoEngine.status.toLowerCase()}">
        <span class="pulse-dot"></span>
        {autoEngine.status}
      </div>

      {#if autoEngine.preflightPassed}
        <span class="preflight-pill passed" title="Pre-flight passed. Start is unlocked.">
          ✓ Pre-Flight Ready
        </span>
      {:else}
        <span class="preflight-pill required" title="Run pre-flight test to unlock Start">
          ⚡ Pre-Flight Required
        </span>
      {/if}

      <button class="btn-ghost" onclick={() => activeTab = 'config'} title="Settings">
        ⚙ Settings
      </button>
    </div>
  </header>

  <!-- Navigation Tabs -->
  <nav class="auto-tabs">
    <button class="tab-btn {activeTab === 'overview' ? 'active' : ''}" onclick={() => activeTab = 'overview'}>
      Overview & Controls
    </button>
    <button class="tab-btn {activeTab === 'sms_feed' ? 'active' : ''}" onclick={() => activeTab = 'sms_feed'}>
      Live SMS & OTP Feed ({dashboardNotifs.length})
    </button>
    <button class="tab-btn {activeTab === 'queue' ? 'active' : ''}" onclick={() => activeTab = 'queue'}>
      Candidate Pool & Queue ({allCandidatesList.length})
    </button>
    <button class="tab-btn {activeTab === 'registry' ? 'active' : ''}" onclick={() => activeTab = 'registry'}>
      Numbers Log & Registry ({registryRecords.length})
    </button>
    <button class="tab-btn {activeTab === 'config' ? 'active' : ''}" onclick={() => activeTab = 'config'}>
      Configuration & TG Setup
    </button>
    <button class="tab-btn {activeTab === 'logs' ? 'active' : ''}" onclick={() => activeTab = 'logs'}>
      Live Logs & Worker Console ({workerLogs.length + autoEngine.logs.length})
    </button>
  </nav>

  <!-- Main Content Body -->
  <main class="auto-main">
    {#if activeTab === 'overview'}
      <!-- Overview & Controls View — Single Column Stack Layout -->
      <section class="overview-grid overview-grid-stacked">
        <OrchestrationControls
          candidatesCount={allCandidatesList.length}
          registryCount={registryRecords.length}
          onstart={handleStart}
          onpause={handlePause}
          onresume={handleResume}
          onstop={handleStop}
          onpreflight={handleRunPreflight}
          onstep={() => handleStep()}
          onreset={resetStats}
        />

        <WorkerBridgeCard
          {workerRunning}
          {workerPid}
          {workerToggling}
          bind:customBotCommand
          onsync={() => { syncWorkerStatus(); checkWorkerStatus(); }}
          onforcestart={handleForceStart}
          onforcecancel={handleForceCancel}
          onskipcurrent={handleSkipCurrent}
          onrestartworker={handleRestartWorker}
          ontoggleworker={toggleWorker}
          onsendbotcommand={handleSendBotCommand}
        />

        <PreflightDiagnostics
          onrunpreflight={handleRunPreflight}
        />

        <LiveSmsFeed
          {filteredSmsNotifications}
          {dashboardNotifs}
          bind:smsSearchKeyword
          bind:smsFilterMode
          onsync={syncDashboardNotifs}
          onclear={clearSmsFeed}
          onpastetosend={handlePasteToSend}
          ondirectsendtobot={handleDirectSendToBot}
          {isTargetMatch}
          {formatNotifTime}
        />
      </section>

    {:else if activeTab === 'sms_feed'}
      <DedicatedSmsTab
        {filteredSmsNotifications}
        {dashboardNotifs}
        bind:smsSearchKeyword
        bind:smsFilterMode
        onsync={syncDashboardNotifs}
        onclear={clearSmsFeed}
        onpastetosend={(otp) => { handlePasteToSend(otp); activeTab = 'overview'; }}
        ondirectsendtobot={handleDirectSendToBot}
        {isTargetMatch}
        {formatNotifTime}
      />

    {:else if activeTab === 'queue'}
      <QueueManagerTab
        {filteredDevices}
        bind:searchQuery
        onrefresh={() => fetchAllDevices()}
        onclearused={clearUsedSessionDevices}
        onstepcand={(cand) => handleStep(cand)}
      />

    {:else if activeTab === 'registry'}
      <RegistryManagerTab
        {registryRecords}
        bind:registrySearch
        bind:registryStatusFilter
        {registryStats}
        {filteredRegistry}
        {isSyncingRegistry}
        onsyncregistry={() => handleSyncRegistry(false)}
        ondownloadcsv={handleDownloadCsv}
        ondownloadregistry={handleDownloadRegistry}
        onopenimport={() => (importModalOpen = true)}
        onclearregistry={handleClearRegistry}
        onmanualreuse={handleManualReuse}
      />

    {:else if activeTab === 'config'}
      <ConfigPanelTab
        {savingConfig}
        onsaveconfig={handleSaveConfig}
        bind:tgPhone
        bind:tgCode
        bind:tgPassword
        {tgSubmitting}
        onconnecttelegram={handleConnectTelegram}
        ondisconnecttelegram={handleDisconnectTelegram}
        onsubmitcode={handleSubmitCode}
        onsubmittwofa={handleSubmitTwoFA}
      />

    {:else if activeTab === 'logs'}
      <LogsViewerTab
        bind:activeLogSubTab
        {workerLogs}
        {workerRunning}
        {workerToggling}
        onrefreshworkerlogs={checkWorkerStatus}
        onrestartworker={handleRestartWorker}
        onclearworkerlogs={handleClearWorkerLogs}
        ontoggleworker={toggleWorker}
      />
    {/if}
  </main>

  <!-- Import Modal -->
  {#if importModalOpen}
    <div
      class="modal-backdrop"
      role="presentation"
      tabindex="-1"
      onclick={() => (importModalOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (importModalOpen = false)}
    >
      <div
        class="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="modal-header">
          <h3 id="import-modal-title">Import Success Registry JSON</h3>
          <button class="close-btn" onclick={() => (importModalOpen = false)}>✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">
            Paste exported registry JSON below to restore or merge previously verified numbers.
          </p>
          <textarea
            class="import-textarea"
            rows="8"
            placeholder={`{\n  "9876543210": {\n    "status": "success",\n    "deviceId": "...",\n    "database": "..."\n  }\n}`}
            bind:value={importJsonText}
          ></textarea>
          {#if importError}
            <div class="modal-error">{importError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick={() => importModalOpen = false}>Cancel</button>
          <button class="btn btn-primary" onclick={handleImportSubmit}>Merge & Import</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Toast Notification Container -->
  <div class="toast-container">
    {#each toasts as t (t.id)}
      <div class="toast toast-{t.type} {t.out ? 'toast-out' : ''}">
        {t.msg}
      </div>
    {/each}
  </div>
</div>
