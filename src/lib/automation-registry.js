/**
 * Automation Numbers & Success Registry
 *
 * Persists all tested phone numbers with their detailed statuses:
 * - successful (verified login)
 * - expired (OTP timeout or expired after 1 retry)
 * - suspended (account suspended/blocked by bot)
 * - rate_limited (too many attempts / retry after X hours)
 * - invalid_number (rejected phone format)
 * - failed (other failures)
 *
 * Stored in localStorage and synchronized with Firebase Realtime Database
 * under automation/numbers.json so that data persists across browser refreshes
 * and numbers are never retried in an endless loop.
 */

import { extractNumber } from './device-helpers.js';
import { apiFetch } from './firebase.js';

const STORAGE_KEY = 'automation_numbers_registry:v1';
const LEGACY_STORAGE_KEY = 'automation_processed_success:v1';

let inMemoryStore = {};

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function normalizeKey(phone) {
  if (!phone) return null;
  const normalized = extractNumber(phone);
  if (normalized && normalized.length === 10) return normalized;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits || null;
}

export function loadRegistry() {
  const storage = getStorage();
  if (!storage) return inMemoryStore;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      inMemoryStore = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } else {
      inMemoryStore = {};
    }

    // Merge legacy success records if available
    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        if (legacyParsed && typeof legacyParsed === 'object') {
          for (const [phone, item] of Object.entries(legacyParsed)) {
            const key = normalizeKey(phone);
            if (key && !inMemoryStore[key]) {
              inMemoryStore[key] = {
                phone: key,
                status: 'successful',
                reason: item.notes || 'Verified success',
                deviceId: item.deviceId || item.device_id || '',
                database: item.database || '',
                completedAt: item.completedAt || new Date().toISOString(),
                attempts: 1
              };
            }
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[AutomationRegistry] Failed to parse localStorage registry:', err);
    inMemoryStore = {};
  }
  return inMemoryStore;
}

export function saveRegistry() {
  const storage = getStorage();
  if (!storage) return true;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(inMemoryStore));

    // Also keep legacy store in sync for any code expecting it
    const legacyStore = {};
    for (const [key, item] of Object.entries(inMemoryStore)) {
      if (item.status === 'successful' || item.status === 'success') {
        legacyStore[key] = {
          status: 'success',
          phone: key,
          deviceId: item.deviceId || '',
          database: item.database || '',
          completedAt: item.completedAt || item.updatedAt || new Date().toISOString()
        };
      }
    }
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyStore));
    return true;
  } catch (err) {
    console.error('[AutomationRegistry] Failed to save registry to localStorage:', err);
    return false;
  }
}

export function isSuccessful(phone) {
  const key = normalizeKey(phone);
  if (!key) return false;
  loadRegistry();
  const rec = inMemoryStore[key];
  return Boolean(rec && (rec.status === 'successful' || rec.status === 'success'));
}

export function isAlreadyProcessed(phone) {
  const key = normalizeKey(phone);
  if (!key) return false;
  loadRegistry();
  const rec = inMemoryStore[key];
  if (!rec) return false;
  const st = String(rec.status || '').toLowerCase();
  return ['successful', 'success', 'expired', 'suspended', 'rate_limited', 'invalid_number', 'invalid_otp', 'already_registered', 'failed'].includes(st);
}

export function getRecord(phone) {
  const key = normalizeKey(phone);
  if (!key) return null;
  loadRegistry();
  return inMemoryStore[key] || null;
}

export function markNumber(phone, status, deviceMetadata = {}) {
  const key = normalizeKey(phone);
  if (!key) return false;

  loadRegistry();
  const nowStr = new Date().toISOString();
  const normStatus = String(status || 'failed').toLowerCase();

  let finalStatus = normStatus;
  if (normStatus === 'success' || normStatus === 'successful' || normStatus === 'completed') finalStatus = 'success';
  else if (normStatus.includes('suspend')) finalStatus = 'suspended';
  else if (normStatus.includes('expire') || normStatus.includes('timeout')) finalStatus = 'expired';
  else if (normStatus.includes('rate') || normStatus.includes('attempt')) finalStatus = 'rate_limited';
  else if (normStatus.includes('already_registered') || normStatus.includes('already registered')) finalStatus = 'already_registered';
  else if (normStatus.includes('invalid_num')) finalStatus = 'invalid_number';
  else if (normStatus.includes('invalid')) finalStatus = 'invalid_otp';

  inMemoryStore[key] = {
    phone: key,
    status: finalStatus,
    reason: deviceMetadata.reason || deviceMetadata.notes || deviceMetadata.error || finalStatus,
    deviceId: String(deviceMetadata.deviceId || deviceMetadata.device_id || deviceMetadata.key || ''),
    database: String(deviceMetadata.database || deviceMetadata.connUrl || deviceMetadata.connId || ''),
    completedAt: nowStr,
    updatedAt: nowStr,
    attempts: Number(deviceMetadata.attempts || 1),
    meta: {
      clientName: deviceMetadata.name || deviceMetadata.clientName || '',
      jobId: deviceMetadata.jobId || deviceMetadata.job_id || null
    }
  };

  saveRegistry();
  return true;
}

export function markSuccess(phone, deviceMetadata = {}) {
  return markNumber(phone, 'successful', deviceMetadata);
}

export function removeSuccess(phone) {
  const key = normalizeKey(phone);
  if (!key) return false;

  loadRegistry();
  if (key in inMemoryStore) {
    delete inMemoryStore[key];
    saveRegistry();
    return true;
  }
  return false;
}

export function getAllRecords() {
  loadRegistry();
  return { ...inMemoryStore };
}

export function getAllArray() {
  loadRegistry();
  return Object.entries(inMemoryStore)
    .map(([phone, data]) => ({
      phone,
      ...data
    }))
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0));
}

export function getStats() {
  loadRegistry();
  const items = Object.values(inMemoryStore);
  return {
    total: items.length,
    successful: items.filter(i => i.status === 'successful' || i.status === 'success').length,
    expired: items.filter(i => i.status === 'expired').length,
    suspended: items.filter(i => i.status === 'suspended').length,
    rateLimited: items.filter(i => i.status === 'rate_limited').length,
    alreadyRegistered: items.filter(i => i.status === 'already_registered').length,
    failed: items.filter(i => !['successful', 'success', 'expired', 'suspended', 'rate_limited', 'already_registered'].includes(i.status)).length
  };
}

export function getSuccessCount() {
  loadRegistry();
  return Object.values(inMemoryStore).filter(i => i.status === 'successful' || i.status === 'success').length;
}

export function clearRegistry() {
  inMemoryStore = {};
  saveRegistry();
}

export async function syncFromFirebase(connections) {
  if (!Array.isArray(connections) || connections.length === 0) {
    return { synced: 0, total: Object.keys(inMemoryStore).length };
  }

  loadRegistry();
  let synced = 0;

  for (const conn of connections) {
    if (!conn || !conn.url || conn.enabled === false || conn.deactivated) continue;
    try {
      const res = await apiFetch(conn, 'automation/numbers', 'GET');
      const raw = res?.data;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [phone, data] of Object.entries(raw)) {
          if (!data || typeof data !== 'object') continue;
          const key = normalizeKey(phone || data.phone);
          if (!key) continue;
          if (!inMemoryStore[key] || new Date(data.updatedAt || 0) > new Date(inMemoryStore[key].updatedAt || 0)) {
            inMemoryStore[key] = {
              phone: key,
              status: data.status || 'successful',
              reason: data.reason || '',
              deviceId: data.deviceId || '',
              database: data.database || conn.url,
              completedAt: data.updatedAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
              attempts: data.attempts || 1
            };
            synced += 1;
          }
        }
      }
    } catch (e) {
      if (String(e.message).includes('deactivated') || String(e.message).includes('423')) {
        conn.deactivated = true;
      }
      console.warn(`[AutomationRegistry] Could not sync from ${conn.name || conn.url}:`, e.message);
    }
  }

  // Also check local worker disk registry if running locally
  try {
    const pRes = await fetch('/api/worker-process?numbers=1');
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData?.processedNumbers && typeof pData.processedNumbers === 'object') {
        for (const [phone, data] of Object.entries(pData.processedNumbers)) {
          if (!data || typeof data !== 'object') continue;
          const key = normalizeKey(phone || data.phone);
          if (!key) continue;
          if (!inMemoryStore[key] || new Date(data.timestamp || 0) > new Date(inMemoryStore[key].updatedAt || 0)) {
            inMemoryStore[key] = {
              phone: key,
              status: data.status || 'successful',
              reason: data.reason || '',
              deviceId: data.device_id || data.deviceId || '',
              database: data.database || '',
              completedAt: data.timestamp || new Date().toISOString(),
              updatedAt: data.timestamp || new Date().toISOString(),
              attempts: data.attempts || 1
            };
            synced += 1;
          }
        }
      }
    }
  } catch {}

  if (synced > 0) {
    saveRegistry();
  }

  return { synced, total: Object.keys(inMemoryStore).length };
}

export function exportCsv() {
  loadRegistry();
  const rows = getAllArray();
  const headers = ['Phone', 'Status', 'Reason', 'Attempts', 'Device ID', 'Database', 'Timestamp'];
  const csvContent = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.phone}"`,
      `"${r.status}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      r.attempts || 1,
      `"${r.deviceId || ''}"`,
      `"${r.database || ''}"`,
      `"${r.completedAt || r.updatedAt || ''}"`
    ].join(','))
  ].join('\n');
  return csvContent;
}

export function exportJson() {
  loadRegistry();
  return JSON.stringify(inMemoryStore, null, 2);
}

export function importJson(jsonStr, merge = true) {
  try {
    const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid format: expected object mapping phone numbers to records');
    }

    loadRegistry();
    if (merge) {
      inMemoryStore = { ...inMemoryStore, ...parsed };
    } else {
      inMemoryStore = { ...parsed };
    }
    saveRegistry();
    return { success: true, count: Object.keys(inMemoryStore).length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Default export object
export const registry = {
  load: loadRegistry,
  save: saveRegistry,
  isSuccessful,
  isAlreadyProcessed,
  getRecord,
  markNumber,
  markSuccess,
  remove: removeSuccess,
  getAll: getAllRecords,
  getAllArray,
  getStats,
  count: getSuccessCount,
  clear: clearRegistry,
  syncFromFirebase,
  exportCsv,
  exportJson,
  importJson
};
