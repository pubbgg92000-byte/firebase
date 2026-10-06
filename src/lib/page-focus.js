/**
 * Page Focus Manager
 *
 * Tracks which page is currently active so engines can self-throttle
 * when they are not the primary focus, reducing CPU and Firebase load.
 *
 * Usage (in each +page.svelte):
 *   import { setPageFocus, clearPageFocus } from '$lib/page-focus.js';
 *   onMount(() => setPageFocus('discovery'));
 *   onDestroy(() => clearPageFocus('discovery'));
 */

/** @type {'discovery' | 'automation' | 'dashboard' | null} */
let _currentFocus = null;

const _listeners = new Set();

/**
 * Set the active page. Call from onMount in each +page.svelte.
 * @param {'discovery' | 'automation' | 'dashboard'} page
 */
export function setPageFocus(page) {
  if (_currentFocus === page) return;
  _currentFocus = page;
  _notify();
}

/**
 * Clear focus when leaving a page. Call from onDestroy.
 * @param {'discovery' | 'automation' | 'dashboard'} page
 */
export function clearPageFocus(page) {
  if (_currentFocus !== page) return;
  _currentFocus = null;
  _notify();
}

/** Get currently focused page. */
export function getPageFocus() {
  return _currentFocus;
}

/**
 * Returns true if the given page currently has focus.
 * @param {'discovery' | 'automation' | 'dashboard'} page
 */
export function hasFocus(page) {
  return _currentFocus === page;
}

/**
 * Register a listener that fires whenever focus changes.
 * @param {(page: string|null) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onFocusChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify() {
  for (const fn of _listeners) {
    try { fn(_currentFocus); } catch {}
  }
}
