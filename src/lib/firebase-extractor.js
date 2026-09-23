/**
 * Reusable Universal Firebase RTDB URL Extractor
 * 
 * Safely extracts Firebase Realtime Database URLs (*.firebaseio.com, *.firebasedatabase.app)
 * from arbitrary text, URLs from any domain, query parameters (s, m, zeniths, data, etc.),
 * Base64 (standard and URL-safe), JSON objects/arrays, CSV, and nested encoded structures.
 * 
 * Safe by design: does not execute code, does not evaluate HTML, does not make network calls.
 */

// Safety limits
export const UX_MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB
export const UX_MAX_DEPTH = 5;                      // max recursion depth
export const UX_MAX_URLS = 1000;                    // max extracted URLs
export const UX_TIMEOUT_MS = 4000;                  // execution timeout per batch

/**
 * Regex matching Firebase Realtime Database URLs:
 * - *.firebaseio.com
 * - *.firebasedatabase.app (including regional endpoints like *.europe-west1.firebasedatabase.app)
 */
export const FB_URL_RE = /https?:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9_-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9-]+)*\.(?:firebaseio\.com|firebasedatabase\.app)(?::\d+)?(?:\/[^\s"'<>\\]*)?/gi;

/**
 * Clean and validate a single Firebase RTDB URL.
 * Returns the base root URL (scheme + host) if valid, or null if invalid.
 */
export function validateFirebaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    
    // Check if hostname is a valid Firebase RTDB domain
    const isFirebaseIo = host.endsWith('.firebaseio.com') && host !== 'firebaseio.com';
    const isFirebaseDbApp = host.endsWith('.firebasedatabase.app') && host !== 'firebasedatabase.app';
    if (!isFirebaseIo && !isFirebaseDbApp) return null;

    // Validate hostname characters
    if (!/^[a-z0-9_.-]+$/.test(host)) return null;

    // Normalize: origin without trailing slash
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Scan raw text for Firebase RTDB URLs and return cleaned, validated, deduplicated URLs in order.
 */
export function scanFirebaseUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(FB_URL_RE) || [];
  const unique = [];
  const seen = new Set();
  for (const m of matches) {
    const valid = validateFirebaseUrl(m);
    if (valid && !seen.has(valid)) {
      seen.add(valid);
      unique.push(valid);
    }
  }
  return unique;
}

/**
 * Derive a user-friendly project name from a Firebase URL.
 */
export function nameFromFbUrl(url) {
  try {
    const host = new URL(url).hostname;
    // Strip -default-rtdb and region suffixes
    const prefix = host.split('.')[0];
    return prefix.replace(/-default-rtdb$/i, '') || 'firebase';
  } catch {
    return 'firebase';
  }
}

/**
 * Check if a string looks like Base64 (standard or URL-safe, with or without padding).
 */
export function looksLikeBase64(s) {
  if (!s || typeof s !== 'string') return false;
  const clean = s.trim().replace(/\s/g, '');
  if (clean.length < 16) return false;
  // Allow A-Za-z0-9+/= and URL-safe -_
  return /^[A-Za-z0-9+/=_-]{16,}$/.test(clean);
}

/**
 * Decode Base64 string (handles standard and URL-safe, missing padding, browser + Node.js).
 */
export function tryBase64Decode(s) {
  if (!looksLikeBase64(s)) return null;
  try {
    let b = s.trim().replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (b.length % 4)) % 4;
    b += '='.repeat(pad);
    b = b.replace(/[^A-Za-z0-9+/=]/g, '');

    let decoded = null;
    if (typeof atob === 'function') {
      decoded = atob(b);
    } else if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(b, 'base64').toString('utf-8');
    }
    if (!decoded || decoded.length < 5) return null;

    // Sanity check: must contain mostly printable characters
    let printable = 0;
    const checkLen = Math.min(decoded.length, 300);
    for (let i = 0; i < checkLen; i++) {
      const code = decoded.charCodeAt(i);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
        printable++;
      }
    }
    if (printable / checkLen < 0.7) return null;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Recursively extract Firebase connections from arbitrary input text.
 * @param {string} input - raw text/URL/JSON/Base64
 * @param {string} source - label indicating origin
 * @param {number} depth - recursion depth
 * @param {number} startTime - timestamp for timeout detection
 * @returns {{url: string, name: string, source: string}[]}
 */
export function deepExtract(input, source = 'text', depth = 0, startTime = Date.now()) {
  if (depth > UX_MAX_DEPTH || Date.now() - startTime > UX_TIMEOUT_MS) return [];
  if (!input || typeof input !== 'string' || input.length > UX_MAX_INPUT_BYTES) return [];

  const results = [];
  const seenUrls = new Set();

  function addResult(url, name, src) {
    const valid = validateFirebaseUrl(url);
    if (!valid || seenUrls.has(valid) || results.length >= UX_MAX_URLS) return;
    seenUrls.add(valid);
    results.push({
      url: valid,
      name: name || nameFromFbUrl(valid),
      source: src || source,
    });
  }

  function addAll(urls, src) {
    for (const u of urls) addResult(u, '', src);
  }

  const trimmed = input.trim();

  // 1. Direct Firebase URL scan on raw text
  const directUrls = scanFirebaseUrls(trimmed);
  addAll(directUrls, source || 'plain text');

  // 2. Try as URL — inspect any domain, all query parameters (s, m, zeniths, data, etc.), and hash
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      
      // Inspect all search/query parameters
      for (const [key, val] of parsed.searchParams) {
        if (!val) continue;

        // Direct scan of parameter value
        addAll(scanFirebaseUrls(val), `param "${key}"`);

        // Check if value is URL-encoded
        let decodedParamVal = val;
        try {
          if (val.includes('%')) {
            decodedParamVal = decodeURIComponent(val);
            if (decodedParamVal !== val) {
              addAll(scanFirebaseUrls(decodedParamVal), `param "${key}" (URL-decoded)`);
            }
          }
        } catch {}

        // Try Base64 on both raw and URL-decoded param value
        const b64Candidates = [val];
        if (decodedParamVal !== val) b64Candidates.push(decodedParamVal);

        for (const candidate of b64Candidates) {
          const decoded = tryBase64Decode(candidate);
          if (decoded) {
            const sub = deepExtract(decoded, `param "${key}" (Base64)`, depth + 1, startTime);
            for (const r of sub) addResult(r.url, r.name, r.source);
          }
        }

        // Try JSON parsing parameter value
        try {
          const jsonVal = JSON.parse(decodedParamVal);
          const sub = extractFromJson(jsonVal, `param "${key}" (JSON)`, depth + 1, startTime);
          for (const r of sub) addResult(r.url, r.name, r.source);
        } catch {}

        // If parameter value itself is a full URL, recurse on it
        if (/^https?:\/\//i.test(decodedParamVal.trim())) {
          const sub = deepExtract(decodedParamVal.trim(), `param "${key}" (URL)`, depth + 1, startTime);
          for (const r of sub) addResult(r.url, r.name, r.source);
        }
      }

      // Inspect URL hash / fragment
      if (parsed.hash && parsed.hash.length > 1) {
        const frag = parsed.hash.slice(1);
        addAll(scanFirebaseUrls(frag), 'URL fragment');

        // Check if hash has query params like #s=... or #data=...
        if (frag.includes('=')) {
          try {
            const fragParams = new URLSearchParams(frag);
            for (const [fKey, fVal] of fragParams) {
              addAll(scanFirebaseUrls(fVal), `hash "${fKey}"`);
              const b64 = tryBase64Decode(fVal);
              if (b64) {
                const sub = deepExtract(b64, `hash "${fKey}" (Base64)`, depth + 1, startTime);
                for (const r of sub) addResult(r.url, r.name, r.source);
              }
            }
          } catch {}
        }

        // Try Base64 on entire fragment
        const fragB64 = tryBase64Decode(frag);
        if (fragB64) {
          const sub = deepExtract(fragB64, 'fragment (Base64)', depth + 1, startTime);
          for (const r of sub) addResult(r.url, r.name, r.source);
        }
      }
    } catch {
      // Invalid URL syntax, proceed with other extractors
    }
  }

  // 3. Try as JSON (objects or arrays)
  if ((trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) && trimmed.length < UX_MAX_INPUT_BYTES) {
    try {
      const parsed = JSON.parse(trimmed);
      const sub = extractFromJson(parsed, source || 'JSON', depth + 1, startTime);
      for (const r of sub) addResult(r.url, r.name, r.source);
    } catch {}
  }

  // 4. Try as standalone Base64
  if (looksLikeBase64(trimmed)) {
    const decoded = tryBase64Decode(trimmed);
    if (decoded) {
      const sub = deepExtract(decoded, source ? `${source} → Base64` : 'Base64 decode', depth + 1, startTime);
      for (const r of sub) addResult(r.url, r.name, r.source);
    }
  }

  // 5. Try standalone URL-decode
  if (trimmed.includes('%')) {
    try {
      const urlDecoded = decodeURIComponent(trimmed);
      if (urlDecoded !== trimmed) {
        addAll(scanFirebaseUrls(urlDecoded), source ? `${source} (URL-decoded)` : 'URL-decoded');
        if (looksLikeBase64(urlDecoded)) {
          const decoded = tryBase64Decode(urlDecoded);
          if (decoded) {
            const sub = deepExtract(decoded, `${source} (URL-decoded → Base64)`, depth + 1, startTime);
            for (const r of sub) addResult(r.url, r.name, r.source);
          }
        }
      }
    } catch {}
  }

  return results;
}

/**
 * Recursively extract Firebase URLs from parsed JSON structures.
 */
export function extractFromJson(val, source, depth = 0, startTime = Date.now()) {
  if (depth > UX_MAX_DEPTH || Date.now() - startTime > UX_TIMEOUT_MS || val === null || val === undefined) return [];
  const results = [];

  if (typeof val === 'string') {
    // Direct scan
    const urls = scanFirebaseUrls(val);
    for (const u of urls) {
      results.push({ url: u, name: nameFromFbUrl(u), source });
    }
    // Try Base64 on string value
    if (looksLikeBase64(val)) {
      const decoded = tryBase64Decode(val);
      if (decoded) {
        const sub = deepExtract(decoded, `${source} → Base64 string`, depth + 1, startTime);
        results.push(...sub);
      }
    }
    // Try nested JSON string
    const t = val.trim();
    if ((t.startsWith('{') || t.startsWith('[')) && t.length > 2) {
      try {
        const nested = JSON.parse(t);
        const sub = extractFromJson(nested, `${source} → nested JSON`, depth + 1, startTime);
        results.push(...sub);
      } catch {}
    }
  } else if (Array.isArray(val)) {
    for (let i = 0; i < val.length && results.length < UX_MAX_URLS; i++) {
      const sub = extractFromJson(val[i], `${source}[${i}]`, depth + 1, startTime);
      results.push(...sub);
    }
  } else if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      if (results.length >= UX_MAX_URLS) break;
      const sub = extractFromJson(v, `${source}.${k}`, depth + 1, startTime);
      for (const r of sub) {
        // If no explicit project name and key is alphanumeric label, use key
        if ((!r.name || r.name === 'firebase') && k && k.length < 40 && !/^https?:\/\//i.test(k)) {
          r.name = k;
        }
        results.push(r);
      }
    }
  }

  return results;
}

/**
 * Extract from CSV content (delimited by comma, semicolon, or tab).
 */
export function extractFromCsv(text, source = 'csv') {
  const results = [];
  const startTime = Date.now();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && results.length < UX_MAX_URLS; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/);
    for (const cell of cells) {
      const cleanCell = cell.trim().replace(/^["']|["']$/g, '');
      if (!cleanCell) continue;
      const sub = deepExtract(cleanCell, `${source} row ${i + 1}`, 1, startTime);
      results.push(...sub);
    }
  }
  return results;
}

/**
 * Extract from HTML or XML content safely without evaluating scripts.
 */
export function extractFromHtml(text, source = 'html') {
  const results = [];
  const startTime = Date.now();
  // Extract attributes containing URLs/Base64 (href, src, data-*, value, content)
  const attrRe = /(?:href|src|data-[a-z-]+|value|content)\s*=\s*["']([^"']{10,})["']/gi;
  let m;
  while ((m = attrRe.exec(text)) !== null && results.length < UX_MAX_URLS) {
    const sub = deepExtract(m[1], `${source} attribute`, 1, startTime);
    results.push(...sub);
  }
  // Full text scan
  const textUrls = scanFirebaseUrls(text);
  for (const u of textUrls) {
    if (!results.find(r => r.url === u)) {
      results.push({ url: u, name: nameFromFbUrl(u), source: `${source} text` });
    }
  }
  return results;
}

/**
 * Main Universal Extractor function.
 * Processes single inputs, multi-line entries, or file contents.
 * 
 * Returns:
 * {
 *   results: { url: string, name: string, source: string }[],
 *   malformed: { line: string, reason: string }[],
 *   errors: string[],
 *   stats: {
 *     totalInput: number,
 *     successCount: number,
 *     uniqueCount: number,
 *     duplicateCount: number,
 *     malformedCount: number
 *   }
 * }
 */
export function universalExtract(input, filename = '') {
  const startTime = Date.now();
  const errors = [];

  if (!input || typeof input !== 'string') {
    return {
      results: [],
      malformed: [],
      errors: ['Input is empty.'],
      stats: { totalInput: 0, successCount: 0, uniqueCount: 0, duplicateCount: 0, malformedCount: 0 }
    };
  }

  if (input.length > UX_MAX_INPUT_BYTES) {
    return {
      results: [],
      malformed: [],
      errors: [`Input too large (${(input.length / (1024 * 1024)).toFixed(1)} MB). Maximum supported size is 5 MB.`],
      stats: { totalInput: 0, successCount: 0, uniqueCount: 0, duplicateCount: 0, malformedCount: 0 }
    };
  }

  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  const src = filename || 'input';

  let rawList = [];
  const malformed = [];
  let totalInputLines = 1;
  let successLines = 0;

  if (ext === 'html' || ext === 'htm' || ext === 'xml') {
    rawList = extractFromHtml(input, src);
    if (rawList.length > 0) successLines = 1;
  } else if (ext === 'csv' || ext === 'tsv') {
    rawList = extractFromCsv(input, src);
    if (rawList.length > 0) successLines = 1;
  } else {
    // Process line-by-line for text/json or pasted text
    const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    totalInputLines = lines.length || 1;

    if (lines.length <= 1) {
      const single = input.trim();
      if (single) {
        rawList = deepExtract(single, src, 0, startTime);
        if (rawList.length > 0) {
          successLines = 1;
        } else {
          const preview = single.length > 120 ? single.slice(0, 120) + '…' : single;
          malformed.push({ line: preview, reason: 'No Firebase RTDB URLs detected in this input' });
        }
      }
    } else {
      // Multiple lines
      for (let i = 0; i < lines.length; i++) {
        if (rawList.length >= UX_MAX_URLS) break;
        if (Date.now() - startTime > UX_TIMEOUT_MS) {
          errors.push('Processing timeout reached. Some entries were skipped.');
          break;
        }

        const line = lines[i];
        try {
          const sub = deepExtract(line, `${src} (line ${i + 1})`, 0, startTime);
          if (sub.length > 0) {
            successLines++;
            rawList.push(...sub);
          } else {
            // Failed entry
            const preview = line.length > 120 ? line.slice(0, 120) + '…' : line;
            if (/^https?:\/\//i.test(line)) {
              malformed.push({ line: preview, reason: 'No Firebase RTDB URL found in query parameters or content' });
            } else if (looksLikeBase64(line)) {
              malformed.push({ line: preview, reason: 'Base64 string did not contain valid Firebase URLs' });
            } else {
              malformed.push({ line: preview, reason: 'Invalid or unsupported format' });
            }
          }
        } catch (err) {
          const preview = line.length > 120 ? line.slice(0, 120) + '…' : line;
          malformed.push({ line: preview, reason: err?.message || 'Processing error' });
        }
      }

      // If multi-line text didn't match line-by-line, test as a single whole JSON block
      if (rawList.length === 0 && (input.trim().startsWith('{') || input.trim().startsWith('['))) {
        try {
          const sub = deepExtract(input.trim(), src, 0, startTime);
          if (sub.length > 0) {
            rawList.push(...sub);
            successLines = 1;
            malformed.length = 0; // Clear malformed lines since the whole block succeeded as JSON
          }
        } catch {}
      }
    }
  }

  // Deduplicate while preserving original encounter order
  const seen = new Set();
  const uniqueResults = [];
  let dupes = 0;

  for (const item of rawList) {
    const valid = validateFirebaseUrl(item.url);
    if (!valid) continue;
    if (seen.has(valid)) {
      dupes++;
      continue;
    }
    seen.add(valid);
    uniqueResults.push({
      url: valid,
      name: item.name || nameFromFbUrl(valid),
      source: item.source || src
    });
  }

  if (uniqueResults.length === 0 && !errors.length) {
    errors.push('No Firebase Realtime Database URLs found.');
  }

  return {
    results: uniqueResults.slice(0, UX_MAX_URLS),
    malformed,
    errors,
    stats: {
      totalInput: totalInputLines,
      successCount: successLines,
      uniqueCount: uniqueResults.length,
      duplicateCount: dupes,
      malformedCount: malformed.length
    }
  };
}
