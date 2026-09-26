/**
 * Phone number normalization, extraction, and formatting utilities.
 */

/**
 * Strip country code from phone number: +91XXXXXXXXXX → XXXXXXXXXX
 * @param {string|number|null} phone
 * @returns {string}
 */
export function stripCountryCode(phone) {
  if (!phone) return '';
  let p = String(phone).trim();
  // Remove leading + and common country codes (1-3 digit)
  // Common codes: +91 (India), +1 (US), +44 (UK), +971 (UAE), etc.
  p = p.replace(/^\+?\d{1,3}(?=\d{10}$)/, '');
  if (!p) p = String(phone).replace(/^\+/, '');
  return p;
}

/**
 * Extract bare 10-digit number from carrier-formatted string.
 * @param {string|number|null} phoneStr
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
 * Extract phone number string from device info object.
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
 * Validate whether string contains at least a plausible phone number (min 7 digits).
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
