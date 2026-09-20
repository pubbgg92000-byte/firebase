/**
 * Shared device-info helper functions.
 * Read-only extraction from the existing +page.svelte — no side effects.
 */

/**
 * Determine if a device is online from its info object.
 * @param {object|null} info
 * @returns {boolean|null}
 */
export function isOnline(info) {
  if (!info || typeof info !== 'object') return null;
  const s =
    info.status ?? info.connectionStatus ?? info.isOnline ?? info.online;
  if (s === true || s === 'online' || s === 'connected') return true;
  if (s === false || s === 'offline' || s === 'disconnected') return false;
  // If lastSeen within 3 min, consider online
  const ls = Number(info.lastSeen ?? info.lastMessageTime ?? 0);
  if (ls > 0) return Date.now() - ls < 180_000;
  return null;
}

/**
 * Extract phone number string from device info.
 * @param {object|null} info
 * @returns {string}
 */
export function fmtPhone(info) {
  if (!info) return '';
  const p =
    info.mobNo ??
    info.phone ??
    info.phoneNumber ??
    info.mobile ??
    info.number ??
    '';
  return String(p).trim();
}

/**
 * Strip carrier name + country code → bare 10-digit number.
 * @param {string} phoneStr
 * @returns {string}
 */
export function extractNumber(phoneStr) {
  if (!phoneStr) return '';
  const s = String(phoneStr).trim();
  const indianMatch = s.match(/(?:(?:\+?91|0)[\s-]*)?([6-9]\d{4}[\s-]?\d{5})/);
  if (indianMatch) {
    return indianMatch[1].replace(/\D/g, '');
  }
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Get battery percentage from device info.
 * @param {object|null} info
 * @returns {number|null}
 */
export function getBattery(info) {
  if (!info) return null;
  const b = info.battery ?? info.batteryLevel ?? info.bat;
  const n = parseInt(b);
  return isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

/**
 * Get SIM count from device info.
 * @param {object|null} info
 * @returns {number|null}
 */
export function getSims(info) {
  if (!info) return null;
  const s = info.simCount ?? info.sims ?? info.numSims;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}
