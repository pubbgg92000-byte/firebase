/**
 * SMS & OTP extraction and inspection utilities.
 */

/**
 * Extract OTP / 4-8 digit verification code from SMS text.
 * Prioritizes standard 6-digit codes, then 4, 8, 5, 7.
 * @param {string} text
 * @returns {string|null}
 */
export function extractOTP(text) {
  if (!text) return null;
  const nums = String(text).match(/\b(\d{4,8})\b/g);
  if (!nums) return null;
  return (
    nums.find((m) => m.length === 6) ||
    nums.find((m) => m.length === 4) ||
    nums.find((m) => m.length === 8) ||
    nums.find((m) => m.length === 5) ||
    nums.find((m) => m.length === 7) ||
    null
  );
}

/**
 * Detect if message text is an OTP or verification notification.
 * @param {string} text
 * @returns {boolean}
 */
export function isVerificationMsg(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return /\botp\b|verif|one.?time|\bcode\b|\btoken\b|\bpin\b|passcode|authoriz|\bconfirm\b|\bsecret\b/.test(
    t
  );
}

/**
 * Extract service name or brand from sender ID (e.g. "TX-SWIGGY-S" → "Swiggy") or message body.
 * @param {string} sender
 * @param {string} [text]
 * @returns {string|null}
 */
export function extractAbout(sender, text = '') {
  const sm = String(sender || '').match(
    /^(?:[A-Z]{1,3}-)?([A-Z][A-Z0-9]{2,14})(?:-[A-Z])?$/
  );
  if (sm) {
    const s = sm[1];
    return s.charAt(0) + s.slice(1).toLowerCase();
  }
  const tm = String(text || '').match(
    /(?:log(?:ging)?\s+(?:in)?to|for|verify|from)\s+(?:your\s+)?([A-Za-z][A-Za-z0-9]{2,14})/i
  );
  if (tm) return tm[1];
  return null;
}
