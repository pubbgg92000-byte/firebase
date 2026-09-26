/**
 * Clipboard utilities with modern API + execCommand fallback.
 */
import { stripCountryCode } from './phone.js';

/**
 * Copy arbitrary text to clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  const s = String(text ?? '');
  if (!s) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch {
      return fallbackCopy(s);
    }
  } else {
    return fallbackCopy(s);
  }
}

/**
 * Fallback copy using hidden textarea for non-secure / older browser contexts.
 * @param {string} s
 * @returns {boolean}
 */
export function fallbackCopy(s) {
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0.01';
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(0, s.length);
    const success = document.execCommand('copy');
    ta.blur();
    document.body.removeChild(ta);
    return success;
  } catch {
    return false;
  }
}

/**
 * Copy phone number stripped of country code, with optional toast callback.
 * @param {string|number} phone
 * @param {((msg: string, type?: string) => void)|null} [toast]
 * @returns {Promise<string>}
 */
export async function copyPhoneLocal(phone, toast = null) {
  const local = stripCountryCode(phone);
  if (!local) return '';
  const ok = await copyText(local);
  if (toast) {
    if (ok) {
      toast(`Copied: ${local}`, 'success');
    } else {
      toast('Could not copy to clipboard', 'warn');
    }
  }
  return local;
}
