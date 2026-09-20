/**
 * Shared Firebase RTDB REST API utilities.
 * Read-only extraction from the existing +page.svelte — no side effects.
 */

/**
 * Build a Firebase REST API URL.
 * @param {{ url: string, token?: string }} conn - Firebase connection config
 * @param {string} path - Resource path
 * @param {Record<string, string>} [params] - Query parameters
 * @returns {string}
 */
export function buildUrl(conn, path, params = {}) {
  const base = conn.url.replace(/\/+$/, '');
  const p = String(path ?? '').replace(/^\/+|\/+$/g, '');
  let u = `${base}/${p}.json`;
  const q = [];
  if (conn.token?.trim())
    q.push(`auth=${encodeURIComponent(conn.token.trim())}`);
  Object.entries(params).forEach(([k, v]) =>
    q.push(`${k}=${encodeURIComponent(v)}`)
  );
  if (q.length) u += '?' + q.join('&');
  return u;
}

/**
 * Generic Firebase REST API fetch.
 * @param {{ url: string, token?: string }} conn
 * @param {string} path
 * @param {'GET'|'PUT'|'POST'|'PATCH'|'DELETE'} [method]
 * @param {*} [body]
 * @param {Record<string, string>} [params]
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function apiFetch(conn, path, method = 'GET', body, params = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(buildUrl(conn, path, params), opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `${res.status}`);
  return { status: res.status, data: json };
}
