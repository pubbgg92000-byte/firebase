/**
 * Date and time formatting utilities.
 */

/**
 * Format timestamp into IST (Asia/Kolkata) 12-hour format string: "10:45:12 PM".
 * @param {Date|number|string} val
 * @returns {string}
 */
export function toIST(val) {
  try {
    const d =
      val instanceof Date
        ? val
        : new Date(typeof val === 'number' ? val : String(val));
    if (isNaN(d.getTime())) return String(val ?? '');
    return d.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return String(val ?? '');
  }
}

/**
 * Format seconds elapsed into "Xm Ys" or "Xs".
 * @param {number} sec
 * @returns {string}
 */
export function formatElapsed(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}

/**
 * Return relative time string (e.g. "just now", "2m ago", "1h ago").
 * @param {Date|number|string} timestamp
 * @returns {string}
 */
export function timeAgo(timestamp) {
  if (!timestamp) return '';
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts)) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
