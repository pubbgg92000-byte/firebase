<script>
  import '../../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    universalExtract,
    validateFirebaseUrl,
    nameFromFbUrl,
    tryBase64Decode,
    looksLikeBase64,
    FB_URL_RE
  } from '$lib/firebase-extractor.js';
  import { tgForwardBulkUrls } from '$lib/tg-forwarder.js';
  import {
    initEngine,
    engine as discoveryEngine,
    allDevices as _allDevices,
    onlineDevices as _onlineDevices,
    withNumber as _withNumber,
    fetchAllDevices,
    getDisplayPhone
  } from '$lib/discovery-engine.svelte.js';
  import { isOnline } from '$lib/device-helpers.js';
  import JSZip from 'jszip';

  // ── Palette accents matching dashboard ──────────────────────────────────────
  const ACCENTS = [
    '#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6',
    '#a78bfa', '#2dd4bf', '#fb923c', '#60a5fa', '#a3e635'
  ];

  // ── Reactive State ─────────────────────────────────────────────────────────
  let rawInput = $state('');
  let inputMode = $state('paste'); // 'paste' | 'file' | 'url'
  let remoteUrl = $state('');
  let isFetchingUrl = $state(false);
  let activeTab = $state('live_firebase'); // 'live_firebase' | 'firebase' | 'phones' | 'tokens' | 'tree' | 'flatten'
  let autoExtract = $state(true);
  let isProcessing = $state(false);

  // Extracted Collections
  let fbResults = $state([]);       // { id, url, name, path, infoPath, token, source, selected }
  let phoneResults = $state([]);    // { id, phone, clean, key, source, selected }
  let tokenResults = $state([]);    // { id, type, token, key, path, masked }
  let flattenedPaths = $state([]);  // { path, value, type }
  let parsedJsonObj = $state(null); // Valid JSON object if parsable
  let parseError = $state(null);

  // Filtering & Tree controls
  let treeFilter = $state('');
  let flattenFilter = $state('');
  let treeExpandedAll = $state(false);
  let treeCollapsedDepth = $state(2);

  // Live Firebase Explorer State
  let liveFilterStatus = $state('with_numbers'); // 'all' | 'online' | 'with_numbers' | 'online_with_numbers' | 'discovered'
  let liveSelectedConnId = $state('all');
  let liveSearchQuery = $state('');
  let isFetchingLive = $state(false);

  // Feedback Toast
  let toastMsg = $state('');
  let toastType = $state('info');
  let toastTimer = null;

  function toast(msg, type = 'info') {
    toastMsg = msg;
    toastType = type;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastMsg = ''; }, 3500);
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────
  function navTo(url, e) {
    if (e) e.preventDefault();
    goto(url).catch(() => { window.location.href = url; });
  }

  // ── Extraction Pipeline ───────────────────────────────────────────────────
  let debounceTimer = null;
  function handleInputChange() {
    if (!autoExtract) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runExtraction();
    }, 280);
  }

  function runExtraction() {
    const text = (rawInput || '').trim();
    if (!text) {
      fbResults = [];
      phoneResults = [];
      tokenResults = [];
      flattenedPaths = [];
      parsedJsonObj = null;
      parseError = null;
      return;
    }

    isProcessing = true;
    parseError = null;

    try {
      // 1. Try JSON parsing
      let jsonObj = null;
      try {
        jsonObj = JSON.parse(text);
        parsedJsonObj = jsonObj;
      } catch (err) {
        // Attempt mild repair if it starts with { or [
        if (text.startsWith('{') || text.startsWith('[')) {
          try {
            const repaired = autoRepairJsonString(text);
            jsonObj = JSON.parse(repaired);
            parsedJsonObj = jsonObj;
          } catch (rErr) {
            parsedJsonObj = null;
            parseError = err.message;
          }
        } else {
          parsedJsonObj = null;
        }
      }

      // 2. Extract Firebase RTDB URLs (Universal Multi-Strategy)
      const fbMap = new Map();

      // Strategy A: Universal Deep Extractor (Regex, Base64, Query parameters, HTML)
      const uRes = universalExtract(text, 'input');
      for (const item of (uRes.results || [])) {
        if (item.url && !fbMap.has(item.url)) {
          fbMap.set(item.url, {
            id: 'fb_' + Math.random().toString(36).slice(2, 9),
            url: item.url,
            name: item.name || nameFromFbUrl(item.url),
            path: 'messages',
            infoPath: '',
            token: '',
            source: item.source || 'universal',
            selected: true
          });
        }
      }

      // Strategy B: Deep JSON inspection (if JSON was parsed)
      if (jsonObj) {
        inspectJsonObjectForFb(jsonObj, '', fbMap);
      }

      fbResults = Array.from(fbMap.values());

      // 3. Extract Phone Numbers (10-digit Indian numbers, +91, 0 prefix, keys)
      const phoneMap = new Map();
      extractPhoneNumbers(text, jsonObj, phoneMap);
      phoneResults = Array.from(phoneMap.values());

      // 4. Extract API Keys & Tokens
      const tokenMap = new Map();
      extractTokensAndKeys(text, jsonObj, tokenMap);
      tokenResults = Array.from(tokenMap.values());

      // 5. Flatten JSON paths for dot-notation inspection
      if (jsonObj) {
        const flat = [];
        flattenObject(jsonObj, '', flat, 0);
        flattenedPaths = flat;
      } else {
        flattenedPaths = [];
      }

      // Automatically switch to the tab that has results if current tab is empty
      if (fbResults.length === 0 && phoneResults.length > 0 && activeTab === 'firebase') {
        activeTab = 'phones';
      } else if (fbResults.length === 0 && phoneResults.length === 0 && tokenResults.length > 0 && activeTab === 'firebase') {
        activeTab = 'tokens';
      } else if (fbResults.length === 0 && phoneResults.length === 0 && tokenResults.length === 0 && parsedJsonObj && activeTab === 'firebase') {
        activeTab = 'tree';
      }

    } catch (e) {
      toast('Extraction error: ' + e.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  // ── Recursive JSON Inspector for Firebase properties ────────────────────────
  function inspectJsonObjectForFb(obj, currentPath, fbMap) {
    if (!obj || typeof obj !== 'object') return;

    // Check Google Services JSON structure (project_info.firebase_url)
    if (obj.project_info && obj.project_info.firebase_url) {
      const v = validateFirebaseUrl(obj.project_info.firebase_url);
      if (v && !fbMap.has(v)) {
        fbMap.set(v, {
          id: 'fb_' + Math.random().toString(36).slice(2, 9),
          url: v,
          name: obj.project_info.project_id || nameFromFbUrl(v),
          path: 'messages',
          infoPath: '',
          token: obj.client?.[0]?.api_key?.[0]?.current_key || '',
          source: 'google-services.json',
          selected: true
        });
      }
    }

    // Traverse keys and values
    for (const [key, val] of Object.entries(obj)) {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      if (typeof val === 'string') {
        // Match Firebase RTDB URL in value
        const matches = val.match(FB_URL_RE) || [];
        for (const m of matches) {
          const v = validateFirebaseUrl(m);
          if (v && !fbMap.has(v)) {
            // Check sibling properties for token or paths
            let token = '';
            let path = 'messages';
            let infoPath = '';
            let name = '';

            if (typeof obj === 'object') {
              token = obj.token || obj.auth || obj.secret || obj.key || '';
              path = obj.path || obj.messagesPath || 'messages';
              infoPath = obj.infoPath || obj.devicesPath || '';
              name = obj.name || obj.project || nameFromFbUrl(v);
            }

            fbMap.set(v, {
              id: 'fb_' + Math.random().toString(36).slice(2, 9),
              url: v,
              name: name || nameFromFbUrl(v),
              path: path || 'messages',
              infoPath: infoPath || '',
              token: token || '',
              source: `JSON property: ${childPath}`,
              selected: true
            });
          }
        }

        // Check if string contains encoded JSON or Base64
        if (looksLikeBase64(val)) {
          const dec = tryBase64Decode(val);
          if (dec) {
            try {
              const innerJson = JSON.parse(dec);
              inspectJsonObjectForFb(innerJson, `${childPath}[base64]`, fbMap);
            } catch {}
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        inspectJsonObjectForFb(val, childPath, fbMap);
      }
    }
  }

  // ── Phone Number Extractor (10-Digit Indian Numbers) ────────────────────────
  function extractPhoneNumbers(text, jsonObj, phoneMap) {
    // 1. Direct Regex scanning on raw text
    // Matches Indian 10-digit mobile numbers (+91, 91, 0, or plain 10 digits starting with 6-9)
    const phoneRe = /(?:(?:\+|0{0,2})91[\s.-]?)?([6-9]\d{9})\b/g;
    let match;
    while ((match = phoneRe.exec(text)) !== null) {
      const clean = match[1];
      if (!phoneMap.has(clean)) {
        phoneMap.set(clean, {
          id: 'ph_' + Math.random().toString(36).slice(2, 9),
          phone: `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`,
          clean,
          key: '',
          source: 'Text scan',
          selected: true
        });
      }
    }

    // 2. Structural extraction if JSON is available
    if (jsonObj && typeof jsonObj === 'object') {
      inspectJsonForPhones(jsonObj, '', phoneMap);
    }
  }

  function inspectJsonForPhones(obj, path, phoneMap) {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, val] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Case A: key is a phone number
      const cleanKey = String(key).replace(/\D/g, '').slice(-10);
      if (/^[6-9]\d{9}$/.test(cleanKey)) {
        const existing = phoneMap.get(cleanKey);
        if (existing) {
          existing.key = path || existing.key;
          existing.source = `JSON key (${currentPath})`;
        } else {
          phoneMap.set(cleanKey, {
            id: 'ph_' + Math.random().toString(36).slice(2, 9),
            phone: `+91 ${cleanKey.slice(0, 5)} ${cleanKey.slice(5)}`,
            clean: cleanKey,
            key: path || key,
            source: `JSON key (${currentPath})`,
            selected: true
          });
        }
      }

      // Case B: value is a string or number that is a phone
      if (typeof val === 'string' || typeof val === 'number') {
        const sVal = String(val).trim();
        const cleanVal = sVal.replace(/\D/g, '').slice(-10);
        if (/^[6-9]\d{9}$/.test(cleanVal)) {
          // Associated device key from parent or sibling
          let deviceKey = '';
          if (typeof obj === 'object') {
            deviceKey = obj.id || obj.deviceId || obj.client_id || obj.deviceKey || key;
          }

          const existing = phoneMap.get(cleanVal);
          if (existing) {
            if (!existing.key) existing.key = String(deviceKey);
            existing.source = `JSON field: ${currentPath}`;
          } else {
            phoneMap.set(cleanVal, {
              id: 'ph_' + Math.random().toString(36).slice(2, 9),
              phone: `+91 ${cleanVal.slice(0, 5)} ${cleanVal.slice(5)}`,
              clean: cleanVal,
              key: String(deviceKey),
              source: `JSON field: ${currentPath}`,
              selected: true
            });
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        inspectJsonForPhones(val, currentPath, phoneMap);
      }
    }
  }

  // ── Tokens & Keys Extractor ────────────────────────────────────────────────
  function extractTokensAndKeys(text, jsonObj, tokenMap) {
    // Firebase Web API Key: AIzaSy... (39 chars)
    const fbApiKeyRe = /\b(AIzaSy[A-Za-z0-9_-]{33})\b/g;
    let m;
    while ((m = fbApiKeyRe.exec(text)) !== null) {
      const tok = m[1];
      if (!tokenMap.has(tok)) {
        tokenMap.set(tok, {
          id: 'tok_' + Math.random().toString(36).slice(2, 9),
          type: 'Firebase Web API Key',
          token: tok,
          key: 'api_key',
          path: 'Direct regex match',
          masked: true
        });
      }
    }

    // Telegram Bot Token: 123456789:ABCdef... (bot token format)
    const tgBotTokenRe = /\b([0-9]{8,11}:[a-zA-Z0-9_-]{35})\b/g;
    while ((m = tgBotTokenRe.exec(text)) !== null) {
      const tok = m[1];
      if (!tokenMap.has(tok)) {
        tokenMap.set(tok, {
          id: 'tok_' + Math.random().toString(36).slice(2, 9),
          type: 'Telegram Bot Token',
          token: tok,
          key: 'bot_token',
          path: 'Direct regex match',
          masked: true
        });
      }
    }

    // JWT token (Bearer eyJ...)
    const jwtRe = /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;
    while ((m = jwtRe.exec(text)) !== null) {
      const tok = m[1];
      if (!tokenMap.has(tok)) {
        tokenMap.set(tok, {
          id: 'tok_' + Math.random().toString(36).slice(2, 9),
          type: 'JWT Bearer Token',
          token: tok,
          key: 'jwt',
          path: 'Direct regex match',
          masked: true
        });
      }
    }

    // Deep JSON inspection for auth tokens / passwords / secrets
    if (jsonObj && typeof jsonObj === 'object') {
      inspectJsonForTokens(jsonObj, '', tokenMap);
    }
  }

  function inspectJsonForTokens(obj, path, tokenMap) {
    if (!obj || typeof obj !== 'object') return;
    const sensitiveKeyRe = /^(auth|token|secret|api_key|apikey|password|access_token|private_key)$/i;

    for (const [key, val] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof val === 'string' && val.length >= 8 && val.length <= 512) {
        if (sensitiveKeyRe.test(key)) {
          if (!tokenMap.has(val)) {
            tokenMap.set(val, {
              id: 'tok_' + Math.random().toString(36).slice(2, 9),
              type: 'Credentials / Secret',
              token: val,
              key,
              path: currentPath,
              masked: true
            });
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        inspectJsonForTokens(val, currentPath, tokenMap);
      }
    }
  }

  // ── Flattening nested JSON into Dot-Notation Paths ──────────────────────────
  function flattenObject(obj, prefix, list, depth) {
    if (depth > 12) return;
    if (obj === null || obj === undefined) {
      list.push({ path: prefix, value: 'null', type: 'null' });
      return;
    }
    if (typeof obj !== 'object') {
      list.push({ path: prefix, value: String(obj), type: typeof obj });
      return;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        list.push({ path: prefix, value: '[]', type: 'array' });
      } else {
        obj.forEach((item, idx) => {
          flattenObject(item, `${prefix}[${idx}]`, list, depth + 1);
        });
      }
    } else {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        list.push({ path: prefix, value: '{}', type: 'object' });
      } else {
        for (const k of keys) {
          const nextKey = prefix ? `${prefix}.${k}` : k;
          flattenObject(obj[k], nextKey, list, depth + 1);
        }
      }
    }
  }

  // ── JSON Format, Minify, & Auto-Repair ──────────────────────────────────────
  function formatJson(spaces = 2) {
    if (!rawInput.trim()) return;
    try {
      let obj;
      try {
        obj = JSON.parse(rawInput);
      } catch {
        obj = JSON.parse(autoRepairJsonString(rawInput));
      }
      rawInput = JSON.stringify(obj, null, spaces);
      parsedJsonObj = obj;
      parseError = null;
      runExtraction();
      toast(`Formatted with ${spaces} spaces indentation`, 'success');
    } catch (err) {
      toast('Format failed: ' + err.message, 'error');
    }
  }

  function minifyJson() {
    if (!rawInput.trim()) return;
    try {
      let obj;
      try {
        obj = JSON.parse(rawInput);
      } catch {
        obj = JSON.parse(autoRepairJsonString(rawInput));
      }
      rawInput = JSON.stringify(obj);
      parsedJsonObj = obj;
      parseError = null;
      runExtraction();
      toast('JSON Minified to single line', 'success');
    } catch (err) {
      toast('Minify failed: ' + err.message, 'error');
    }
  }

  function repairJson() {
    if (!rawInput.trim()) return;
    try {
      const repaired = autoRepairJsonString(rawInput);
      const parsed = JSON.parse(repaired);
      rawInput = JSON.stringify(parsed, null, 2);
      parsedJsonObj = parsed;
      parseError = null;
      runExtraction();
      toast('JSON successfully repaired & formatted!', 'success');
    } catch (err) {
      toast('Repair failed: ' + err.message, 'error');
    }
  }

  function autoRepairJsonString(str) {
    let s = str.trim();
    // 1. Strip javascript single line comments (// ...)
    s = s.replace(/\/\/.*$/gm, '');
    // 2. Strip multiline comments (/* ... */)
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    // 3. Fix unquoted keys: { key: "val" } -> { "key": "val" }
    s = s.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":');
    // 4. Fix single quoted strings: 'value' -> "value"
    s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    // 5. Remove trailing commas before } or ]
    s = s.replace(/,(\s*[}\]])/g, '$1');
    return s;
  }

  // ── Actions & Integrations with Dashboard & Discovery ───────────────────────
  function addSelectedToDashboard() {
    const selected = fbResults.filter(r => r.selected);
    if (selected.length === 0) {
      toast('No connections selected', 'warn');
      return;
    }

    try {
      const existing = JSON.parse(localStorage.getItem('pd_connections') || '[]');
      const existingUrls = new Set(existing.map(c => (c.url || '').replace(/\/+$/, '')));

      let addedCount = 0;
      let skippedCount = 0;
      const newConns = [...existing];

      for (const item of selected) {
        const cleanUrl = item.url.replace(/\/+$/, '');
        if (existingUrls.has(cleanUrl)) {
          skippedCount++;
          continue;
        }

        const id = `c${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const color = ACCENTS[newConns.length % ACCENTS.length];
        const newConn = {
          id,
          name: item.name || nameFromFbUrl(cleanUrl),
          url: cleanUrl,
          path: item.path || 'messages',
          infoPath: item.infoPath || '',
          token: item.token || '',
          color,
          enabled: true
        };

        newConns.push(newConn);
        existingUrls.add(cleanUrl);
        addedCount++;
      }

      if (addedCount > 0) {
        localStorage.setItem('pd_connections', JSON.stringify(newConns));
        // Sync to backend worker config
        const activeUrls = newConns.map(c => c.url.replace(/\/+$/, ''));
        fetch('/api/worker-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firebase_databases: activeUrls })
        }).catch(() => {});

        toast(`Added ${addedCount} connection${addedCount > 1 ? 's' : ''} to Dashboard! (${skippedCount} existing skipped)`, 'success');
      } else {
        toast(`All ${skippedCount} selected connections are already in Dashboard`, 'info');
      }
    } catch (e) {
      toast('Failed to save to dashboard: ' + e.message, 'error');
    }
  }

  function pushPhonesToDiscovery() {
    const selected = phoneResults.filter(r => r.selected);
    if (selected.length === 0) {
      toast('No phone numbers selected', 'warn');
      return;
    }

    try {
      const existing = JSON.parse(localStorage.getItem('pd_phones') || '{}');
      let added = 0;
      for (const item of selected) {
        if (!existing[item.clean]) {
          existing[item.clean] = {
            phone: item.clean,
            deviceId: item.key || 'manual_json_extract',
            timestamp: new Date().toISOString()
          };
          added++;
        }
      }

      localStorage.setItem('pd_phones', JSON.stringify(existing));
      toast(`Pushed ${added} numbers to Discovery registry (${selected.length - added} already known)`, 'success');
    } catch (e) {
      toast('Failed pushing to discovery: ' + e.message, 'error');
    }
  }

  function forwardSelectedToBot() {
    const selected = fbResults.filter(r => r.selected).map(r => r.url);
    if (selected.length === 0) {
      toast('No Firebase databases selected', 'warn');
      return;
    }
    try {
      tgForwardBulkUrls(selected);
      toast(`Forwarding ${selected.length} Firebase URL${selected.length > 1 ? 's' : ''} to @alpha_firebase_bot in background`, 'success');
    } catch (e) {
      toast('Forwarding failed: ' + e.message, 'error');
    }
  }

  // Clipboard Helpers
  function copyText(text, label = 'Copied to clipboard') {
    navigator.clipboard.writeText(text).then(() => {
      toast(label, 'success');
    }).catch(() => {
      toast('Clipboard copy failed', 'error');
    });
  }

  function copyAllFbUrls() {
    const selected = fbResults.filter(r => r.selected);
    if (selected.length === 0) return toast('No URLs selected', 'warn');
    const text = selected.map(r => r.url).join('\n');
    copyText(text, `Copied ${selected.length} Firebase URLs`);
  }

  function syncDashboardConnections() {
    try {
      const saved = JSON.parse(localStorage.getItem('pd_connections') || 'null');
      if (Array.isArray(saved) && saved.length) {
        discoveryEngine.connections = saved.filter(c => !c.url?.includes('newpanel-4412c'));
      }
    } catch {}
    try {
      discoveryEngine.localPhones = JSON.parse(localStorage.getItem('pd_phones') || '{}');
    } catch {}
  }

  async function fetchLiveFirebaseDevices() {
    isFetchingLive = true;
    syncDashboardConnections();
    toast('Fetching numbers & online devices across all Firebases…', 'info');
    try {
      await fetchAllDevices();
      const numCount = allLiveDevices.filter(d => d.hasPhone).length;
      const onCount = allLiveDevices.filter(d => d.online).length;
      toast(`Fetched ${allLiveDevices.length} devices (${onCount} online, ${numCount} with numbers) from ${(discoveryEngine.connections || []).filter(c => c.enabled).length} Firebases!`, 'success');
    } catch (err) {
      toast('Failed refreshing devices: ' + err.message, 'error');
    } finally {
      isFetchingLive = false;
    }
  }

  let allLiveDevices = $derived.by(() => {
    const list = _allDevices();
    const records = discoveryEngine.records || [];
    const discoveredMap = new Map();
    for (const r of records) {
      if (r.status === 'discovered') {
        const ph = String(r.phoneNumber || r.phone || '').trim();
        const clean = ph.replace(/\D/g, '').slice(-10);
        if (clean) discoveredMap.set(r.deviceId, clean);
      }
    }

    return list.map(d => {
      const online = d.info && isOnline(d.info) === true;
      let phone = getDisplayPhone(d.connId, d.key, d.info) || '';
      let isDiscovered = false;
      if (!phone && discoveredMap.has(d.key)) {
        phone = discoveredMap.get(d.key);
        isDiscovered = true;
      }
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const hasValidPhone = /^[6-9]\d{9}$/.test(cleanPhone);

      return {
        id: `dev_${d.connId}_${d.key}`,
        connId: d.connId,
        connName: d.conn?.name || 'Firebase',
        connUrl: d.conn?.url || '',
        key: d.key,
        phone: hasValidPhone ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}` : (phone || '—'),
        cleanPhone: hasValidPhone ? cleanPhone : '',
        hasPhone: hasValidPhone,
        online,
        isDiscovered,
        model: d.info?.model || d.info?.device || d.info?.brand || '—',
        lastSeen: d.info?.timestamp || d.info?.lastSeen || '',
        selected: true
      };
    });
  });

  let filteredLiveDevices = $derived.by(() => {
    let list = allLiveDevices;

    if (liveSelectedConnId !== 'all') {
      list = list.filter(d => d.connId === liveSelectedConnId);
    }

    if (liveFilterStatus === 'online') {
      list = list.filter(d => d.online);
    } else if (liveFilterStatus === 'with_numbers') {
      list = list.filter(d => d.hasPhone);
    } else if (liveFilterStatus === 'online_with_numbers') {
      list = list.filter(d => d.online && d.hasPhone);
    } else if (liveFilterStatus === 'offline') {
      list = list.filter(d => !d.online);
    } else if (liveFilterStatus === 'offline_with_numbers') {
      list = list.filter(d => !d.online && d.hasPhone);
    } else if (liveFilterStatus === 'discovered') {
      list = list.filter(d => d.isDiscovered);
    }

    if (liveSearchQuery.trim()) {
      const q = liveSearchQuery.trim().toLowerCase();
      list = list.filter(d =>
        d.key.toLowerCase().includes(q) ||
        d.cleanPhone.includes(q) ||
        d.phone.toLowerCase().includes(q) ||
        d.connName.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q)
      );
    }

    return list;
  });

  function loadFilteredIntoJsonEditor() {
    if (filteredLiveDevices.length === 0) {
      toast('No devices match current filter', 'warn');
      return;
    }

    const exportItems = filteredLiveDevices.map(d => ({
      phone: d.cleanPhone || undefined,
      displayPhone: d.phone !== '—' ? d.phone : undefined,
      deviceId: d.key,
      database: d.connName,
      databaseUrl: d.connUrl,
      status: d.online ? 'online' : 'offline',
      isDiscovered: d.isDiscovered,
      model: d.model !== '—' ? d.model : undefined,
      lastSeen: d.lastSeen || undefined
    }));

    const payload = {
      meta: {
        filter: liveFilterStatus,
        database: liveSelectedConnId,
        totalExported: exportItems.length,
        exportedAt: new Date().toISOString()
      },
      accounts: exportItems
    };

    rawInput = JSON.stringify(payload, null, 2);
    runExtraction();
    activeTab = 'phones';
    toast(`Loaded ${exportItems.length} accounts into JSON Extractor!`, 'success');
  }

  function copyFilteredPhones() {
    const phones = filteredLiveDevices.filter(d => d.hasPhone).map(d => d.cleanPhone);
    if (phones.length === 0) return toast('No phone numbers in filtered list', 'warn');
    copyText(phones.join('\n'), `Copied ${phones.length} Phone Numbers`);
  }

  function copyFilteredJsonArray() {
    if (filteredLiveDevices.length === 0) return toast('No devices in filtered list', 'warn');
    const arr = filteredLiveDevices.map(d => ({
      phone: d.cleanPhone || null,
      deviceId: d.key,
      database: d.connName,
      status: d.online ? 'online' : 'offline'
    }));
    copyText(JSON.stringify(arr, null, 2), `Copied ${arr.length} devices as JSON array`);
  }

  async function downloadFilteredZip() {
    if (filteredLiveDevices.length === 0) return toast('No devices to export', 'warn');
    try {
      const zip = new JSZip();
      const accounts = filteredLiveDevices.map(d => ({
        phone: d.cleanPhone || null,
        displayPhone: d.phone !== '—' ? d.phone : null,
        deviceId: d.key,
        database: d.connName,
        status: d.online ? 'online' : 'offline',
        model: d.model !== '—' ? d.model : null
      }));

      zip.file('accounts_array.json', JSON.stringify(accounts, null, 2));

      const phones = filteredLiveDevices.filter(d => d.hasPhone).map(d => d.cleanPhone);
      if (phones.length > 0) {
        zip.file('phone_numbers.txt', phones.join('\n'));
      }

      const activeConns = (discoveryEngine.connections || []).filter(c => c.enabled);
      zip.file('firebase_connections.json', JSON.stringify(activeConns, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firebase_numbers_${liveFilterStatus}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Downloaded ZIP with ${accounts.length} accounts!`, 'success');
    } catch (err) {
      toast('Export ZIP failed: ' + err.message, 'error');
    }
  }

  function copyAllPhones() {
    const selected = phoneResults.filter(r => r.selected);
    if (selected.length === 0) return toast('No phones selected', 'warn');
    const text = selected.map(r => r.clean).join('\n');
    copyText(text, `Copied ${selected.length} Phone Numbers`);
  }

  function copyAccountsJsonArray() {
    if (phoneResults.length === 0) return toast('No accounts to copy', 'warn');
    const arr = phoneResults.map(p => ({
      phone: p.clean,
      displayPhone: p.phone,
      deviceId: p.key || 'device_id',
      source: p.source
    }));
    copyText(JSON.stringify(arr, null, 2), `Copied ${arr.length} Accounts as JSON Array`);
  }

  async function downloadAsZip() {
    if (!rawInput.trim()) return toast('No data to export as ZIP', 'warn');
    try {
      const zip = new JSZip();
      zip.file('extracted_data.json', rawInput);

      if (parsedJsonObj?.accounts) {
        zip.file('accounts_array.json', JSON.stringify(parsedJsonObj.accounts, null, 2));
      } else if (phoneResults.length > 0) {
        const arr = phoneResults.map(p => ({
          phone: p.clean,
          displayPhone: p.phone,
          deviceId: p.key || 'device_id',
          source: p.source
        }));
        zip.file('accounts_array.json', JSON.stringify(arr, null, 2));
      }

      if (phoneResults.length > 0) {
        const phonesTxt = phoneResults.map(p => p.clean).join('\n');
        zip.file('phone_numbers.txt', phonesTxt);
      }

      if (fbResults.length > 0) {
        zip.file('firebase_connections.json', JSON.stringify(fbResults, null, 2));
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted_accounts_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Downloaded ZIP archive with JSON array & TXT files!', 'success');
    } catch (err) {
      toast('ZIP creation failed: ' + err.message, 'error');
    }
  }

  async function loadLiveOnlineAndDiscovered() {
    isProcessing = true;
    toast('Gathering live online devices & discovered numbers…', 'info');
    try {
      await fetchAllDevices();

      const onlineDevs = _onlineDevices();
      const withNumDevs = _withNumber();

      let storedPhones = {};
      try {
        storedPhones = JSON.parse(localStorage.getItem('pd_phones') || '{}');
      } catch {}

      const records = discoveryEngine.records || [];
      const discoveredOnly = records.filter(r => r.status === 'discovered');

      const accounts = [];
      const seenPhones = new Set();

      // 1. Discovered records from Discovery Engine
      for (const rec of discoveredOnly) {
        const ph = String(rec.phoneNumber || rec.phone || '').trim();
        const clean = ph.replace(/\D/g, '').slice(-10);
        if (clean && !seenPhones.has(clean)) {
          seenPhones.add(clean);
          accounts.push({
            phone: clean,
            displayPhone: `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`,
            deviceId: rec.deviceId || rec.id || 'discovered',
            database: rec.connName || rec.database || 'Firebase',
            status: 'discovered',
            discoveredAt: rec.discoveredAt || rec.timestamp || new Date().toISOString(),
            metadata: {
              source: 'Discovery Engine',
              carrier: rec.carrier || '',
              connId: rec.connId || ''
            }
          });
        }
      }

      // 2. Online devices with numbers
      for (const d of withNumDevs) {
        const ph = getDisplayPhone(d.connId, d.key, d.info) || '';
        const clean = ph.replace(/\D/g, '').slice(-10);
        if (clean && !seenPhones.has(clean)) {
          seenPhones.add(clean);
          accounts.push({
            phone: clean,
            displayPhone: `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`,
            deviceId: d.key,
            database: d.conn?.name || 'Firebase',
            databaseUrl: d.conn?.url || '',
            status: 'online',
            lastSeen: d.info?.timestamp || d.info?.lastSeen || new Date().toISOString(),
            metadata: {
              source: 'Live Online Device',
              model: d.info?.model || d.info?.device || d.info?.brand || '',
              connId: d.connId || ''
            }
          });
        }
      }

      // 3. Stored phones from registry
      for (const [cleanPh, item] of Object.entries(storedPhones)) {
        const clean = String(cleanPh).replace(/\D/g, '').slice(-10);
        if (clean && !seenPhones.has(clean)) {
          seenPhones.add(clean);
          accounts.push({
            phone: clean,
            displayPhone: `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`,
            deviceId: item.deviceId || 'local_registry',
            database: item.database || 'Firebase',
            status: 'saved',
            discoveredAt: item.timestamp || new Date().toISOString(),
            metadata: {
              source: 'Stored Phone Registry'
            }
          });
        }
      }

      const activeConns = (discoveryEngine.connections || []).filter(c => c.enabled);

      const payload = {
        meta: {
          exportedAt: new Date().toISOString(),
          totalOnlineDevices: onlineDevs.length,
          totalWithNumber: withNumDevs.length,
          totalDiscoveredAccounts: accounts.length,
          connectedDatabases: activeConns.length
        },
        connections: activeConns.map(c => ({
          name: c.name,
          url: c.url,
          messagesPath: c.path || 'messages',
          devicesPath: c.infoPath || ''
        })),
        accounts
      };

      rawInput = JSON.stringify(payload, null, 2);
      runExtraction();
      activeTab = 'phones';
      toast(`Loaded ${accounts.length} live accounts across ${activeConns.length} database(s)!`, 'success');
    } catch (err) {
      toast('Failed loading live data: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  function exportFbJson() {
    const selected = fbResults.filter(r => r.selected);
    const data = JSON.stringify(selected, null, 2);
    downloadFile(data, 'firebase_extracted_connections.json', 'application/json');
  }

  function exportPhonesTxt() {
    const selected = phoneResults.filter(r => r.selected);
    const data = selected.map(r => r.clean).join('\n');
    downloadFile(data, 'extracted_phones.txt', 'text/plain');
  }

  function exportFlattenedCsv() {
    const rows = ['Path,Value,Type'];
    for (const item of filteredFlattened) {
      const cleanVal = String(item.value).replace(/"/g, '""');
      rows.push(`"${item.path}","${cleanVal}","${item.type}"`);
    }
    downloadFile(rows.join('\n'), 'flattened_json_paths.csv', 'text/csv');
  }

  function downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${fileName}`, 'success');
  }

  // ── Sample Data Loaders ───────────────────────────────────────────────────
  function loadSample(type) {
    if (type === 'firebase') {
      rawInput = JSON.stringify({
        "project_name": "Delivery Panel RTDB",
        "firebase_url": "https://quick-express-delivery-default-rtdb.firebaseio.com",
        "database_secret": "AIzaSyB8u91xZ893mQpL902148102391024",
        "messages_path": "messages",
        "devices_path": "clients",
        "backup_endpoint": "https://quick-express-backup.firebasedatabase.app/logs"
      }, null, 2);
    } else if (type === 'google_services') {
      rawInput = JSON.stringify({
        "project_info": {
          "project_number": "104928192841",
          "firebase_url": "https://alpha-panel-telemetry-default-rtdb.firebaseio.com",
          "project_id": "alpha-panel-telemetry",
          "storage_bucket": "alpha-panel-telemetry.appspot.com"
        },
        "client": [
          {
            "client_info": { "mobilesdk_app_id": "1:104928192841:android:abc98124012" },
            "api_key": [{ "current_key": "AIzaSyD-9812410924718029384019238" }]
          }
        ]
      }, null, 2);
    } else if (type === 'rtdb_dump') {
      rawInput = JSON.stringify({
        "clients": {
          "dev_9a8f102c": {
            "phone": "+91 98765 43210",
            "model": "Samsung Galaxy S21",
            "lastSeen": 1727850000000,
            "status": "online"
          },
          "dev_4b12e89d": {
            "phone": "9812345678",
            "model": "Redmi Note 12",
            "lastSeen": 1727850120000,
            "status": "online"
          },
          "dev_c194aa33": {
            "phone": "09823456789",
            "model": "OnePlus 11R",
            "lastSeen": 1727849900000,
            "status": "offline"
          }
        },
        "server_url": "https://order-stream-prod-default-rtdb.firebaseio.com",
        "bot_token": "7192840182:AAEk_941029481902840192841920"
      }, null, 2);
    } else if (type === 'base64') {
      const payload = JSON.stringify({
        endpoint: "https://secure-vault-441-default-rtdb.firebaseio.com",
        token: "AIzaSyC091248192041928049182",
        phones: ["9876501234", "9988776655"]
      });
      const b64 = btoa(payload);
      rawInput = `// Encoded API configuration dump\nconst CONFIG_PAYLOAD = "${b64}";\n// Direct fallback\nconst FALLBACK_URL = "https://fallback-gateway.firebasedatabase.app";`;
    }
    runExtraction();
    toast(`Loaded ${type} sample`, 'info');
  }

  // ── Remote URL Fetch ──────────────────────────────────────────────────────
  async function fetchRemoteUrl() {
    const url = remoteUrl.trim();
    if (!url) return toast('Please enter a URL to fetch', 'warn');
    isFetchingUrl = true;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      rawInput = text;
      runExtraction();
      toast(`Fetched ${text.length} bytes from remote URL`, 'success');
      inputMode = 'paste';
    } catch (err) {
      toast('Failed to fetch URL: ' + err.message, 'error');
    } finally {
      isFetchingUrl = false;
    }
  }

  // ── File Upload Handler ───────────────────────────────────────────────────
  function handleFileUpload(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    readFile(file);
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) readFile(file);
  }

  function readFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      return toast('File too large (max 10MB)', 'error');
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      rawInput = event.target?.result || '';
      runExtraction();
      toast(`Loaded "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`, 'success');
      inputMode = 'paste';
    };
    reader.onerror = () => toast('Error reading file', 'error');
    reader.readAsText(file);
  }

  // ── Derived View Filters ───────────────────────────────────────────────────
  let filteredFlattened = $derived.by(() => {
    if (!flattenFilter.trim()) return flattenedPaths;
    const q = flattenFilter.toLowerCase();
    return flattenedPaths.filter(p => p.path.toLowerCase().includes(q) || String(p.value).toLowerCase().includes(q));
  });

  onMount(() => {
    // 1. Initialize discovery engine and sync stored connections & phones
    initEngine();
    syncDashboardConnections();

    // 2. Read query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const queryTab = urlParams.get('tab');
    const querySample = urlParams.get('sample');

    if (queryTab) {
      activeTab = queryTab;
    } else {
      activeTab = 'live_firebase';
    }

    if (querySample) {
      loadSample(querySample);
    }

    // 3. Immediately fetch all devices & numbers from all Firebases
    fetchLiveFirebaseDevices();
  });
</script>

<svelte:head>
  <title>JSON Extractor — Firebase RTDB, Numbers & Credentials Intelligence</title>
  <meta name="description" content="Extract Firebase Realtime Database URLs, 10-digit phone numbers, API keys, tokens, and structure from raw JSON, text, logs, and Base64 payloads." />
</svelte:head>

<div class="je-shell">
  <!-- Toast alert -->
  {#if toastMsg}
    <div class="je-toast je-toast-{toastType}" role="alert">
      <span>{toastMsg}</span>
    </div>
  {/if}

  <!-- ── Top Header Navigation ─────────────────────────────────────────── -->
  <header class="je-header">
    <div class="je-hdr-left">
      <a href="/" class="je-nav-btn" onclick={(e) => navTo('/', e)} title="Back to Dashboard">
        ← Dashboard
      </a>
      <span class="je-sep">/</span>
      <a href="/discovery" class="je-nav-btn" onclick={(e) => navTo('/discovery', e)} title="Device Discovery">
        📡 Discovery
      </a>
      <span class="je-sep">/</span>
      <a href="/automation" class="je-nav-btn" onclick={(e) => navTo('/automation', e)} title="Automation Orchestrator">
        🤖 Automation
      </a>
      <span class="je-sep">/</span>
      <div class="je-title-badge">
        <span class="je-icon">🔍</span>
        <h1>JSON Extractor</h1>
      </div>
    </div>

    <!-- Live extraction stat badges -->
    <div class="je-hdr-right">
      <div class="je-stat-chip" title="Live Online Devices across all connected Firebases">
        <span class="je-dot je-dot-online"></span>
        <span class="je-stat-num">{allLiveDevices.filter(d => d.online).length}</span>
        <span class="je-stat-lbl">Online</span>
      </div>
      <div class="je-stat-chip" title="Live Phone Numbers across all connected Firebases">
        <span class="je-dot je-dot-live-num"></span>
        <span class="je-stat-num">{allLiveDevices.filter(d => d.hasPhone).length}</span>
        <span class="je-stat-lbl">Live Nums</span>
      </div>
      <div class="je-stat-chip" title="Discovered Firebase RTDB Endpoints in Editor">
        <span class="je-dot je-dot-fb"></span>
        <span class="je-stat-num">{fbResults.length}</span>
        <span class="je-stat-lbl">RTDB URLs</span>
      </div>
      <div class="je-stat-chip" title="Extracted Phone Numbers in Editor">
        <span class="je-dot je-dot-phone"></span>
        <span class="je-stat-num">{phoneResults.length}</span>
        <span class="je-stat-lbl">Extracted</span>
      </div>
    </div>
  </header>

  <!-- ── Main Workspace Grid ───────────────────────────────────────────── -->
  <main class="je-workspace">
    <!-- Left Panel: Input & Tools -->
    <section class="je-panel je-input-panel">
      <div class="je-panel-hdr">
        <div class="je-input-modes">
          <button
            class="je-mode-tab {inputMode === 'paste' ? 'active' : ''}"
            onclick={() => inputMode = 'paste'}
          >
            📝 Paste Text / JSON
          </button>
          <button
            class="je-mode-tab {inputMode === 'file' ? 'active' : ''}"
            onclick={() => inputMode = 'file'}
          >
            📁 File Upload
          </button>
          <button
            class="je-mode-tab {inputMode === 'url' ? 'active' : ''}"
            onclick={() => inputMode = 'url'}
          >
            🌐 Fetch URL
          </button>
        </div>

        <div class="je-hdr-tools">
          <button class="je-btn-subtle je-btn-live" onclick={loadLiveOnlineAndDiscovered} title="Fetch all active online devices and discovered numbers from your Firebase connections">
            📥 Load Live Accounts
          </button>
          <button class="je-btn-subtle" onclick={() => loadSample('firebase')} title="Load Firebase Config Sample">
            🔥 Firebase Sample
          </button>
          <button class="je-btn-subtle" onclick={() => loadSample('google_services')} title="Load google-services.json">
            📦 google-services
          </button>
          <button class="je-btn-subtle" onclick={() => loadSample('rtdb_dump')} title="Load RTDB Device Dump">
            📱 Devices Dump
          </button>
          <button class="je-btn-subtle" onclick={() => loadSample('base64')} title="Load Base64 Payload">
            🔐 Base64
          </button>
          <button
            class="je-btn-subtle je-btn-danger"
            onclick={() => { rawInput = ''; runExtraction(); }}
            title="Clear all input"
          >
            ✕ Clear
          </button>
        </div>
      </div>

      <!-- Input Body -->
      <div class="je-input-body">
        {#if inputMode === 'paste'}
          <div class="je-editor-wrap">
            <textarea
              class="je-textarea"
              bind:value={rawInput}
              oninput={handleInputChange}
              placeholder="Paste raw JSON, Google Services file, RTDB dump, APK strings, Base64 blob, logs, or URLs here..."
              spellcheck="false"
              aria-label="JSON or Raw Text Input"
            ></textarea>
          </div>
        {:else if inputMode === 'file'}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="je-dropzone"
            ondrop={handleFileDrop}
            ondragover={(e) => e.preventDefault()}
          >
            <div class="je-drop-icon">📂</div>
            <h3>Drag & Drop file here</h3>
            <p>Supports .json, .txt, .csv, .log, .xml, .js (up to 10MB)</p>
            <label class="je-file-btn">
              Browse Files
              <input type="file" accept=".json,.txt,.csv,.log,.xml,.js" onchange={handleFileUpload} />
            </label>
          </div>
        {:else if inputMode === 'url'}
          <div class="je-url-box">
            <div class="je-url-row">
              <input
                type="url"
                class="je-url-input"
                bind:value={remoteUrl}
                placeholder="https://example.com/data.json or https://xxx-default-rtdb.firebaseio.com/.json"
                onkeydown={(e) => e.key === 'Enter' && fetchRemoteUrl()}
              />
              <button class="je-btn je-btn-primary" onclick={fetchRemoteUrl} disabled={isFetchingUrl}>
                {#if isFetchingUrl}
                  <span class="je-spinner"></span> Fetching...
                {:else}
                  Fetch & Parse
                {/if}
              </button>
            </div>
            <p class="je-hint">Directly downloads and parses remote JSON payloads from public or authorized HTTP endpoints.</p>
          </div>
        {/if}
      </div>

      <!-- Action Toolbar -->
      <div class="je-toolbar">
        <div class="je-tool-group">
          <button class="je-tool-btn" onclick={() => formatJson(2)} title="Format JSON with 2-space indentation">
            🧹 Format
          </button>
          <button class="je-tool-btn" onclick={minifyJson} title="Minify JSON into a single line">
            🗜️ Minify
          </button>
          <button class="je-tool-btn" onclick={repairJson} title="Auto-repair unquoted keys, single quotes, and trailing commas">
            🩹 Auto-Repair
          </button>
          <button class="je-tool-btn" onclick={downloadAsZip} title="Export everything as a structured .ZIP archive">
            📦 Export ZIP
          </button>
        </div>

        <div class="je-tool-status">
          {#if parseError}
            <span class="je-status-warn" title={parseError}>⚠️ Non-strict JSON ({parseError.slice(0, 32)}…)</span>
          {:else if parsedJsonObj}
            <span class="je-status-ok">✓ Valid JSON Object</span>
          {/if}
          <span class="je-char-cnt">{rawInput.length.toLocaleString()} chars</span>
        </div>

        <div class="je-tool-group">
          <label class="je-auto-check" title="Extract automatically as you type">
            <input type="checkbox" bind:checked={autoExtract} onchange={handleInputChange} />
            <span>Live Scan</span>
          </label>
          <button class="je-btn je-btn-primary je-extract-btn" onclick={runExtraction} disabled={isProcessing}>
            {#if isProcessing}
              <span class="je-spinner"></span> Scanning...
            {:else}
              ⚡ Extract All
            {/if}
          </button>
        </div>
      </div>
    </section>

    <!-- Right Panel: Extracted Intelligence -->
    <section class="je-panel je-results-panel">
      <!-- Tabs Bar -->
      <nav class="je-tabs-bar">
        <button
          class="je-tab {activeTab === 'live_firebase' ? 'active' : ''}"
          onclick={() => activeTab = 'live_firebase'}
        >
          ⚡ Live DB Numbers
          <span class="je-tab-badge badge-green">{filteredLiveDevices.filter(d => d.hasPhone).length}</span>
        </button>
        <button
          class="je-tab {activeTab === 'firebase' ? 'active' : ''}"
          onclick={() => activeTab = 'firebase'}
        >
          🔥 Firebase RTDB
          <span class="je-tab-badge {fbResults.length > 0 ? 'badge-green' : ''}">{fbResults.length}</span>
        </button>
        <button
          class="je-tab {activeTab === 'phones' ? 'active' : ''}"
          onclick={() => activeTab = 'phones'}
        >
          📱 Phone Numbers
          <span class="je-tab-badge {phoneResults.length > 0 ? 'badge-cyan' : ''}">{phoneResults.length}</span>
        </button>
        <button
          class="je-tab {activeTab === 'tokens' ? 'active' : ''}"
          onclick={() => activeTab = 'tokens'}
        >
          🔑 Tokens & Keys
          <span class="je-tab-badge {tokenResults.length > 0 ? 'badge-amber' : ''}">{tokenResults.length}</span>
        </button>
        <button
          class="je-tab {activeTab === 'tree' ? 'active' : ''}"
          onclick={() => activeTab = 'tree'}
        >
          🌳 JSON Tree
          {#if parsedJsonObj}
            <span class="je-tab-badge badge-purple">Ready</span>
          {/if}
        </button>
        <button
          class="je-tab {activeTab === 'flatten' ? 'active' : ''}"
          onclick={() => activeTab = 'flatten'}
        >
          📋 Paths ({flattenedPaths.length})
        </button>
      </nav>

      <!-- Tab Content Area -->
      <div class="je-results-body">
        <!-- ── TAB 0: LIVE FIREBASE NUMBERS & DEVICES ─────────────────────── -->
        {#if activeTab === 'live_firebase'}
          <div class="je-tab-pane">
            <!-- Metrics Ribbon -->
            <div class="je-metrics-ribbon">
              <div class="je-metric-item">
                <span class="je-metric-icon">🗄️</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{(discoveryEngine.connections || []).filter(c => c.enabled).length}</span>
                  <span class="je-metric-lbl">Databases</span>
                </div>
              </div>
              <div class="je-metric-item">
                <span class="je-metric-icon">👥</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{allLiveDevices.length}</span>
                  <span class="je-metric-lbl">Total Devs</span>
                </div>
              </div>
              <div class="je-metric-item">
                <span class="je-metric-icon">🟢</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{allLiveDevices.filter(d => d.online).length}</span>
                  <span class="je-metric-lbl">Online</span>
                </div>
              </div>
              <div class="je-metric-item highlight-cyan">
                <span class="je-metric-icon">📱</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{allLiveDevices.filter(d => d.hasPhone).length}</span>
                  <span class="je-metric-lbl">With Numbers</span>
                </div>
              </div>
              <div class="je-metric-item highlight-green">
                <span class="je-metric-icon">⚡</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{allLiveDevices.filter(d => d.online && d.hasPhone).length}</span>
                  <span class="je-metric-lbl">Online + Nums</span>
                </div>
              </div>
              <div class="je-metric-item">
                <span class="je-metric-icon">🎯</span>
                <div class="je-metric-col">
                  <span class="je-metric-val">{allLiveDevices.filter(d => d.isDiscovered).length}</span>
                  <span class="je-metric-lbl">Discovered</span>
                </div>
              </div>
            </div>

            <!-- Filter Bar -->
            <div class="je-live-filter-bar">
              <div class="je-live-pills">
                <button
                  class="je-pill {liveFilterStatus === 'with_numbers' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'with_numbers'}
                >
                  📱 With Numbers ({allLiveDevices.filter(d => d.hasPhone).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'online' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'online'}
                >
                  🟢 Online ({allLiveDevices.filter(d => d.online).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'online_with_numbers' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'online_with_numbers'}
                >
                  🟢📱 Online + Numbers ({allLiveDevices.filter(d => d.online && d.hasPhone).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'offline' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'offline'}
                >
                  ⚪ Offline ({allLiveDevices.filter(d => !d.online).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'offline_with_numbers' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'offline_with_numbers'}
                >
                  ⚪📱 Offline + Numbers ({allLiveDevices.filter(d => !d.online && d.hasPhone).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'discovered' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'discovered'}
                >
                  🎯 Discovered ({allLiveDevices.filter(d => d.isDiscovered).length})
                </button>
                <button
                  class="je-pill {liveFilterStatus === 'all' ? 'active-pill' : ''}"
                  onclick={() => liveFilterStatus = 'all'}
                >
                  All ({allLiveDevices.length})
                </button>
              </div>

              <!-- Database dropdown selector -->
              <select class="je-db-select" bind:value={liveSelectedConnId}>
                <option value="all">All Connected Databases ({(discoveryEngine.connections || []).filter(c => c.enabled).length})</option>
                {#each (discoveryEngine.connections || []).filter(c => c.enabled) as conn (conn.id)}
                  {@const devCount = allLiveDevices.filter(d => d.connId === conn.id).length}
                  {@const numCount = allLiveDevices.filter(d => d.connId === conn.id && d.hasPhone).length}
                  <option value={conn.id}>{conn.name} ({devCount} devs, {numCount} nums)</option>
                {/each}
              </select>

              <!-- Live Fetch button -->
              <button class="je-btn je-btn-primary" onclick={fetchLiveFirebaseDevices} disabled={isFetchingLive}>
                {#if isFetchingLive}
                  <span class="je-spinner"></span> Fetching…
                {:else}
                  🔄 Refresh DBs
                {/if}
              </button>
            </div>

            <!-- Search and Action Bar -->
            <div class="je-pane-actions">
              <div class="je-search-box">
                <input
                  type="text"
                  class="je-search-input"
                  bind:value={liveSearchQuery}
                  placeholder="Search by phone, device ID, database, or model…"
                />
                {#if liveSearchQuery}
                  <button class="je-search-clear" onclick={() => liveSearchQuery = ''}>✕</button>
                {/if}
              </div>

              <div class="je-action-btns">
                <button class="je-btn je-btn-success" onclick={loadFilteredIntoJsonEditor} title="Send filtered devices into JSON editor">
                  📥 Load into Editor
                </button>
                <button class="je-btn je-btn-secondary" onclick={copyFilteredPhones} title="Copy all filtered phone numbers">
                  📋 Copy Numbers ({filteredLiveDevices.filter(d => d.hasPhone).length})
                </button>
                <button class="je-btn je-btn-secondary" onclick={copyFilteredJsonArray} title="Copy filtered items as JSON array">
                  📋 Copy JSON Array
                </button>
                <button class="je-btn je-btn-secondary" onclick={downloadFilteredZip} title="Download ZIP with JSON array & TXT">
                  📦 Export ZIP
                </button>
              </div>
            </div>

            <!-- Table of Filtered Devices -->
            {#if isFetchingLive && allLiveDevices.length === 0}
              <div class="je-empty-state">
                <div class="je-spinner" style="width:36px;height:36px;border-width:3px;border-color:rgba(56,189,248,0.2);border-top-color:#38bdf8;margin-bottom:14px"></div>
                <h4>Fetching Firebase Numbers & Devices…</h4>
                <p>Connecting to {(discoveryEngine.connections || []).filter(c => c.enabled).length} Firebase database(s) and querying live online status & phone numbers.</p>
              </div>
            {:else if filteredLiveDevices.length === 0}
              <div class="je-empty-state">
                <div class="je-empty-icon">🔍</div>
                <h4>No Devices Matched Filter</h4>
                <p>Try switching the status filter above or click <strong>🔄 Refresh DBs</strong> to pull the latest devices from your Firebase connections.</p>
              </div>
            {:else}
              <div class="je-table-wrap">
                <table class="je-table">
                  <thead>
                    <tr>
                      <th style="width:30px">#</th>
                      <th style="width:90px">Status</th>
                      <th>Phone Number</th>
                      <th>Device ID / Key</th>
                      <th>Database</th>
                      <th>Model / Info</th>
                      <th style="width:80px">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each filteredLiveDevices.slice(0, 300) as item, i (item.id)}
                      <tr>
                        <td style="color:#64748b;font-size:11px">{i + 1}</td>
                        <td>
                          {#if item.online}
                            <span class="je-online-pill">🟢 Online</span>
                          {:else}
                            <span class="je-offline-pill">⚪ Offline</span>
                          {/if}
                        </td>
                        <td>
                          {#if item.hasPhone}
                            <span class="je-phone-pill">{item.phone}</span>
                            {#if item.isDiscovered}
                              <span class="je-disc-badge" title="Discovered via discovery engine">🎯</span>
                            {/if}
                          {:else}
                            <span style="color:#64748b">—</span>
                          {/if}
                        </td>
                        <td>
                          <code class="je-dev-key">{item.key}</code>
                        </td>
                        <td>
                          <span class="je-db-tag">{item.connName}</span>
                        </td>
                        <td>
                          <span class="je-dim-src">{item.model}</span>
                        </td>
                        <td>
                          <div style="display:flex;gap:4px">
                            {#if item.hasPhone}
                              <button
                                class="je-btn-ico"
                                onclick={() => copyText(item.cleanPhone, `Copied phone: ${item.cleanPhone}`)}
                                title="Copy Phone Number"
                              >
                                📱
                              </button>
                            {/if}
                            <button
                              class="je-btn-ico"
                              onclick={() => copyText(item.key, `Copied device ID: ${item.key}`)}
                              title="Copy Device ID"
                            >
                              📋
                            </button>
                          </div>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
                {#if filteredLiveDevices.length > 300}
                  <div class="je-table-more">
                    Showing first 300 of {filteredLiveDevices.length} matching devices. Use search to narrow down.
                  </div>
                {/if}
              </div>
            {/if}
          </div>

        <!-- ── TAB 1: FIREBASE RTDB ──────────────────────────────────────── -->
        {:else if activeTab === 'firebase'}
          <div class="je-tab-pane">
            <div class="je-pane-actions">
              <div class="je-bulk-select">
                <button
                  class="je-btn-sm"
                  onclick={() => { for (const r of fbResults) r.selected = true; }}
                >
                  Select All
                </button>
                <button
                  class="je-btn-sm"
                  onclick={() => { for (const r of fbResults) r.selected = false; }}
                >
                  Deselect
                </button>
                <span class="je-selected-count">
                  {fbResults.filter(r => r.selected).length} of {fbResults.length} selected
                </span>
              </div>

              <div class="je-action-btns">
                <button
                  class="je-btn je-btn-success"
                  onclick={addSelectedToDashboard}
                  disabled={fbResults.filter(r => r.selected).length === 0}
                  title="Add selected Firebase connections directly to the Dashboard"
                >
                  + Add to Dashboard
                </button>
                <button class="je-btn je-btn-secondary" onclick={copyAllFbUrls} title="Copy selected URLs to clipboard">
                  📋 Copy URLs
                </button>
                <button class="je-btn je-btn-secondary" onclick={forwardSelectedToBot} title="Forward selected URLs to @alpha_firebase_bot">
                  ✈️ Forward Bot
                </button>
                <button class="je-btn je-btn-subtle" onclick={exportFbJson} title="Export selected as JSON file">
                  💾 Export JSON
                </button>
              </div>
            </div>

            {#if fbResults.length === 0}
              <div class="je-empty-state">
                <div class="je-empty-icon">🔥</div>
                <h4>No Firebase RTDB Endpoints Detected</h4>
                <p>Paste text containing <code>*.firebaseio.com</code> or <code>*.firebasedatabase.app</code> URLs or click <strong>🔥 Firebase Sample</strong> above to test.</p>
              </div>
            {:else}
              <div class="je-cards-list">
                {#each fbResults as item (item.id)}
                  <div class="je-fb-card {item.selected ? 'card-selected' : ''}">
                    <div class="je-card-hdr">
                      <label class="je-checkbox-label">
                        <input type="checkbox" bind:checked={item.selected} />
                        <span class="je-card-title">{item.name}</span>
                      </label>
                      <span class="je-tag je-tag-fb">Realtime DB</span>
                    </div>

                    <div class="je-card-url-row">
                      <code class="je-code-url">{item.url}</code>
                      <button class="je-btn-ico" onclick={() => copyText(item.url, 'URL copied')} title="Copy URL">
                        📋
                      </button>
                    </div>

                    <div class="je-card-meta-grid">
                      <div class="je-meta-item">
                        <span class="je-meta-k">Messages:</span>
                        <input class="je-meta-in" bind:value={item.path} placeholder="messages" />
                      </div>
                      <div class="je-meta-item">
                        <span class="je-meta-k">Devices:</span>
                        <input class="je-meta-in" bind:value={item.infoPath} placeholder="clients / devices" />
                      </div>
                      <div class="je-meta-item je-meta-full">
                        <span class="je-meta-k">Auth Secret:</span>
                        <input class="je-meta-in" bind:value={item.token} placeholder="optional secret / token" />
                      </div>
                    </div>

                    <div class="je-card-foot">
                      <span class="je-src-hint">Found via: {item.source}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

        <!-- ── TAB 2: PHONE NUMBERS ──────────────────────────────────────── -->
        {:else if activeTab === 'phones'}
          <div class="je-tab-pane">
            <div class="je-pane-actions">
              <div class="je-bulk-select">
                <button
                  class="je-btn-sm"
                  onclick={() => { for (const r of phoneResults) r.selected = true; }}
                >
                  Select All
                </button>
                <button
                  class="je-btn-sm"
                  onclick={() => { for (const r of phoneResults) r.selected = false; }}
                >
                  Deselect
                </button>
                <span class="je-selected-count">
                  {phoneResults.filter(r => r.selected).length} of {phoneResults.length} selected
                </span>
              </div>

              <div class="je-action-btns">
                <button
                  class="je-btn je-btn-primary"
                  onclick={pushPhonesToDiscovery}
                  disabled={phoneResults.filter(r => r.selected).length === 0}
                  title="Push selected numbers directly to the Discovery Engine"
                >
                  📡 Push to Discovery
                </button>
                <button class="je-btn je-btn-secondary" onclick={copyAllPhones}>
                  📋 Copy Numbers
                </button>
                <button class="je-btn je-btn-secondary" onclick={copyAccountsJsonArray} title="Copy all accounts as a clean JSON array">
                  📋 Copy JSON Array
                </button>
                <button class="je-btn je-btn-secondary" onclick={downloadAsZip} title="Download full ZIP archive">
                  📦 Export ZIP
                </button>
                <button class="je-btn je-btn-subtle" onclick={exportPhonesTxt}>
                  💾 Export TXT
                </button>
              </div>
            </div>

            {#if phoneResults.length === 0}
              <div class="je-empty-state">
                <div class="je-empty-icon">📱</div>
                <h4>No 10-Digit Phone Numbers Found</h4>
                <p>The extractor scans for Indian mobile numbers starting with 6, 7, 8, 9 with +91 or raw formats.</p>
              </div>
            {:else}
              <div class="je-table-wrap">
                <table class="je-table">
                  <thead>
                    <tr>
                      <th style="width:40px"></th>
                      <th>Phone Number</th>
                      <th>Clean 10-Digits</th>
                      <th>Associated Device ID / Key</th>
                      <th>Source Location</th>
                      <th style="width:60px">Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each phoneResults as item (item.id)}
                      <tr class="{item.selected ? 'tr-selected' : ''}">
                        <td>
                          <input type="checkbox" bind:checked={item.selected} />
                        </td>
                        <td>
                          <span class="je-phone-pill">{item.phone}</span>
                        </td>
                        <td>
                          <code>{item.clean}</code>
                        </td>
                        <td>
                          <code class="je-dev-key">{item.key || '—'}</code>
                        </td>
                        <td>
                          <span class="je-dim-src">{item.source}</span>
                        </td>
                        <td>
                          <button class="je-btn-ico" onclick={() => copyText(item.clean, 'Phone copied')}>
                            📋
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

        <!-- ── TAB 3: TOKENS & KEYS ──────────────────────────────────────── -->
        {:else if activeTab === 'tokens'}
          <div class="je-tab-pane">
            <div class="je-pane-actions">
              <span class="je-pane-info">
                Detected {tokenResults.length} sensitive credential{tokenResults.length === 1 ? '' : 's'} & API keys.
              </span>
              <button
                class="je-btn je-btn-secondary"
                onclick={() => {
                  const txt = tokenResults.map(t => `${t.type} [${t.key}]: ${t.token}`).join('\n');
                  copyText(txt, `Copied ${tokenResults.length} tokens`);
                }}
              >
                📋 Copy All Tokens
              </button>
            </div>

            {#if tokenResults.length === 0}
              <div class="je-empty-state">
                <div class="je-empty-icon">🔑</div>
                <h4>No Credentials or API Keys Found</h4>
                <p>Scans for Firebase Web API keys (<code>AIzaSy...</code>), Telegram Bot Tokens, JWTs, and RTDB secret strings.</p>
              </div>
            {:else}
              <div class="je-cards-list">
                {#each tokenResults as item (item.id)}
                  <div class="je-token-card">
                    <div class="je-card-hdr">
                      <div class="je-token-type-wrap">
                        <span class="je-token-badge">{item.type}</span>
                        <code class="je-token-key-lbl">{item.key}</code>
                      </div>
                      <button
                        class="je-btn-sm"
                        onclick={() => item.masked = !item.masked}
                      >
                        {item.masked ? '👁 Reveal' : '🔒 Mask'}
                      </button>
                    </div>

                    <div class="je-token-val-row">
                      <code class="je-code-val">
                        {item.masked ? (item.token.slice(0, 6) + '••••••••••••••••' + item.token.slice(-4)) : item.token}
                      </code>
                      <button class="je-btn-ico" onclick={() => copyText(item.token, 'Token copied')}>
                        📋
                      </button>
                    </div>

                    <div class="je-card-foot">
                      <span class="je-src-hint">Found at: {item.path}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

        <!-- ── TAB 4: INTERACTIVE JSON TREE ──────────────────────────────── -->
        {:else if activeTab === 'tree'}
          <div class="je-tab-pane">
            <div class="je-pane-actions">
              <div class="je-search-box">
                <input
                  type="text"
                  class="je-search-input"
                  bind:value={treeFilter}
                  placeholder="Filter keys or values in tree…"
                />
                {#if treeFilter}
                  <button class="je-search-clear" onclick={() => treeFilter = ''}>✕</button>
                {/if}
              </div>

              <div class="je-tree-btns">
                <button class="je-btn-sm" onclick={() => treeExpandedAll = true}>Expand All</button>
                <button class="je-btn-sm" onclick={() => treeExpandedAll = false}>Collapse All</button>
              </div>
            </div>

            {#if !parsedJsonObj}
              <div class="je-empty-state">
                <div class="je-empty-icon">🌳</div>
                <h4>Tree View Requires Valid JSON</h4>
                <p>{parseError ? `Parse error: ${parseError}` : 'Paste valid JSON in the left panel to inspect the hierarchical tree.'}</p>
                <button class="je-btn je-btn-primary" onclick={repairJson} style="margin-top:10px">
                  🩹 Try Auto-Repair
                </button>
              </div>
            {:else}
              <div class="je-tree-container">
                <pre class="je-tree-code">{JSON.stringify(parsedJsonObj, null, 2)}</pre>
              </div>
            {/if}
          </div>

        <!-- ── TAB 5: FLATTENED PATHS ────────────────────────────────────── -->
        {:else if activeTab === 'flatten'}
          <div class="je-tab-pane">
            <div class="je-pane-actions">
              <div class="je-search-box">
                <input
                  type="text"
                  class="je-search-input"
                  bind:value={flattenFilter}
                  placeholder="Search paths (e.g. phone, url, messages)…"
                />
                {#if flattenFilter}
                  <button class="je-search-clear" onclick={() => flattenFilter = ''}>✕</button>
                {/if}
              </div>

              <div class="je-action-btns">
                <button class="je-btn je-btn-secondary" onclick={exportFlattenedCsv}>
                  💾 Export CSV
                </button>
                <button
                  class="je-btn je-btn-subtle"
                  onclick={() => {
                    const txt = filteredFlattened.map(i => `${i.path} = ${i.value}`).join('\n');
                    copyText(txt, `Copied ${filteredFlattened.length} paths`);
                  }}
                >
                  📋 Copy All
                </button>
              </div>
            </div>

            {#if filteredFlattened.length === 0}
              <div class="je-empty-state">
                <div class="je-empty-icon">📋</div>
                <h4>No Paths Matched</h4>
                <p>Try clearing your search filter or paste structured JSON in the left panel.</p>
              </div>
            {:else}
              <div class="je-table-wrap">
                <table class="je-table">
                  <thead>
                    <tr>
                      <th>Dot Path</th>
                      <th>Extracted Value</th>
                      <th style="width:70px">Type</th>
                      <th style="width:50px">Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each filteredFlattened.slice(0, 300) as item, i (i)}
                      <tr>
                        <td><code class="je-path-tag">{item.path}</code></td>
                        <td><span class="je-val-tag">{item.value}</span></td>
                        <td><span class="je-type-tag type-{item.type}">{item.type}</span></td>
                        <td>
                          <button class="je-btn-ico" onclick={() => copyText(item.value, 'Value copied')}>📋</button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
                {#if filteredFlattened.length > 300}
                  <div class="je-table-more">Showing first 300 of {filteredFlattened.length} items. Use search to filter.</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </main>
</div>

<style>
  /* ── Shell & Base Layout ─────────────────────────────────────────────── */
  .je-shell {
    min-height: 100vh;
    background: #060b18;
    color: #e2e8f0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    padding-bottom: 30px;
  }

  /* ── Floating Toast ──────────────────────────────────────────────────── */
  .je-toast {
    position: fixed;
    top: 20px;
    right: 24px;
    z-index: 9999;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.2);
    animation: toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .je-toast-info { background: #0f172a; border: 1px solid #38bdf8; color: #7dd3fc; }
  .je-toast-success { background: #062b1a; border: 1px solid #22c55e; color: #86efac; }
  .je-toast-warn { background: #3b2302; border: 1px solid #f59e0b; color: #fde68a; }
  .je-toast-error { background: #3b0d0c; border: 1px solid #ef4444; color: #fca5a5; }

  @keyframes toastSlideIn {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Header Bar ──────────────────────────────────────────────────────── */
  .je-header {
    height: 56px;
    background: rgba(13, 21, 38, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(56, 189, 248, 0.12);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .je-hdr-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .je-nav-btn {
    color: #94a3b8;
    text-decoration: none;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }
  .je-nav-btn:hover {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .je-sep {
    color: #334155;
    font-size: 12px;
  }

  .je-title-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(6, 182, 212, 0.12);
    border: 1px solid rgba(6, 182, 212, 0.3);
    padding: 4px 12px;
    border-radius: 20px;
  }
  .je-title-badge h1 {
    font-size: 14px;
    font-weight: 600;
    color: #38bdf8;
    margin: 0;
  }
  .je-icon {
    font-size: 14px;
  }

  .je-hdr-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .je-stat-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11.5px;
  }
  .je-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .je-dot-fb { background: #f97316; box-shadow: 0 0 6px #f97316; }
  .je-dot-phone { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
  .je-dot-token { background: #fbbf24; box-shadow: 0 0 6px #fbbf24; }
  .je-dot-online { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
  .je-dot-live-num { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
  .je-stat-num { font-weight: 700; color: #f8fafc; }
  .je-stat-lbl { color: #94a3b8; }

  /* ── Workspace 2-Column Grid ─────────────────────────────────────────── */
  .je-workspace {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 18px;
    padding: 18px 20px;
    flex: 1;
    max-width: 1720px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 1024px) {
    .je-workspace {
      grid-template-columns: 1fr;
    }
  }

  /* ── Panels ──────────────────────────────────────────────────────────── */
  .je-panel {
    background: #0d1526;
    border: 1px solid rgba(99, 179, 237, 0.1);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.3);
  }

  .je-panel-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
    gap: 8px;
  }

  .je-input-modes {
    display: flex;
    gap: 4px;
  }
  .je-mode-tab {
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11.5px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .je-mode-tab:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.04);
  }
  .je-mode-tab.active {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.3);
    color: #38bdf8;
  }

  .je-hdr-tools {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .je-btn-subtle {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .je-btn-subtle:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #e2e8f0;
  }
  .je-btn-danger:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }
  .je-btn-live {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.35);
    color: #4ade80;
    font-weight: 600;
  }
  .je-btn-live:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.55);
    color: #86efac;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.28);
  }

  /* ── Input Body ──────────────────────────────────────────────────────── */
  .je-input-body {
    flex: 1;
    min-height: 480px;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .je-editor-wrap {
    flex: 1;
    display: flex;
  }

  .je-textarea {
    width: 100%;
    height: 100%;
    min-height: 480px;
    background: #080e1d;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 12.5px;
    line-height: 1.6;
    padding: 14px;
    border: none;
    outline: none;
    resize: vertical;
    box-sizing: border-box;
  }
  .je-textarea:focus {
    background: #060b17;
  }

  /* Dropzone */
  .je-dropzone {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    border: 2px dashed rgba(56, 189, 248, 0.25);
    margin: 16px;
    border-radius: 12px;
    background: rgba(6, 11, 24, 0.4);
    text-align: center;
  }
  .je-drop-icon { font-size: 40px; margin-bottom: 12px; }
  .je-dropzone h3 { font-size: 16px; color: #f8fafc; margin-bottom: 6px; }
  .je-dropzone p { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
  .je-file-btn {
    background: #0284c7;
    color: white;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .je-file-btn:hover { background: #0369a1; }
  .je-file-btn input { display: none; }

  /* URL box */
  .je-url-box {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .je-url-row {
    display: flex;
    gap: 8px;
  }
  .je-url-input {
    flex: 1;
    background: #080e1d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 9px 12px;
    color: #e2e8f0;
    font-size: 13px;
    font-family: inherit;
  }
  .je-url-input:focus {
    border-color: #38bdf8;
    outline: none;
  }
  .je-hint { font-size: 12px; color: #64748b; margin: 0; }

  /* ── Action Toolbar ──────────────────────────────────────────────────── */
  .je-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(15, 23, 42, 0.7);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
    gap: 10px;
  }

  .je-tool-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .je-tool-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    color: #cbd5e1;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11.5px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .je-tool-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .je-tool-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
  }
  .je-status-ok { color: #34d399; font-weight: 500; }
  .je-status-warn { color: #fbbf24; font-weight: 500; }
  .je-char-cnt { color: #64748b; font-family: monospace; }

  .je-auto-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #94a3b8;
    cursor: pointer;
    user-select: none;
  }

  /* ── Right Panel: Results & Tabs ─────────────────────────────────────── */
  .je-tabs-bar {
    display: flex;
    background: rgba(15, 23, 42, 0.8);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    overflow-x: auto;
  }

  .je-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #94a3b8;
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .je-tab:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.02);
  }
  .je-tab.active {
    color: #38bdf8;
    border-bottom-color: #38bdf8;
    background: rgba(56, 189, 248, 0.06);
  }

  .je-tab-badge {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 700;
  }
  .badge-green { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
  .badge-cyan { background: rgba(6, 182, 212, 0.2); color: #38bdf8; }
  .badge-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
  .badge-purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

  .je-results-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 14px;
    overflow-y: auto;
    max-height: 640px;
  }

  .je-tab-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .je-pane-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .je-bulk-select {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .je-selected-count {
    font-size: 11.5px;
    color: #64748b;
  }

  .je-action-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */
  .je-btn {
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .je-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .je-btn-primary { background: #0284c7; color: white; }
  .je-btn-primary:hover:not(:disabled) { background: #0369a1; }

  .je-btn-success { background: #16a34a; color: white; }
  .je-btn-success:hover:not(:disabled) { background: #15803d; }

  .je-btn-secondary {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }
  .je-btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }

  .je-btn-sm {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }
  .je-btn-sm:hover { color: #e2e8f0; background: rgba(255, 255, 255, 0.09); }

  .je-btn-ico {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    opacity: 0.65;
    padding: 2px 5px;
    border-radius: 4px;
    transition: opacity 0.15s;
  }
  .je-btn-ico:hover { opacity: 1; background: rgba(255, 255, 255, 0.08); }

  /* ── Cards List (Firebase & Tokens) ──────────────────────────────────── */
  .je-cards-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .je-fb-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: all 0.15s ease;
  }
  .je-fb-card.card-selected {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(15, 23, 42, 0.85);
  }

  .je-card-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .je-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .je-card-title {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
  }
  .je-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .je-tag-fb {
    background: rgba(249, 115, 22, 0.18);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .je-card-url-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #080e1d;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  .je-code-url {
    color: #38bdf8;
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
  }

  .je-card-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 4px;
  }
  .je-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 4px 8px;
    border-radius: 6px;
  }
  .je-meta-full {
    grid-column: span 2;
  }
  .je-meta-k {
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
  }
  .je-meta-in {
    flex: 1;
    background: transparent;
    border: none;
    color: #f1f5f9;
    font-family: monospace;
    font-size: 11.5px;
    outline: none;
  }

  .je-card-foot {
    font-size: 11px;
    color: #475569;
  }
  .je-src-hint { font-style: italic; }

  /* ── Tokens Cards ────────────────────────────────────────────────────── */
  .je-token-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .je-token-type-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .je-token-badge {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fbbf24;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }
  .je-token-key-lbl {
    color: #94a3b8;
    font-size: 11px;
  }
  .je-token-val-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #080e1d;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
  .je-code-val {
    color: #a78bfa;
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
  }

  /* ── Tables (Phone Numbers & Flattened) ───────────────────────────────── */
  .je-table-wrap {
    overflow-x: auto;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.4);
  }

  .je-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    text-align: left;
  }
  .je-table th {
    background: rgba(15, 23, 42, 0.8);
    color: #94a3b8;
    padding: 9px 12px;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .je-table td {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  .je-table tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }
  .tr-selected td {
    background: rgba(56, 189, 248, 0.05);
  }

  .je-phone-pill {
    background: rgba(6, 182, 212, 0.15);
    border: 1px solid rgba(6, 182, 212, 0.3);
    color: #38bdf8;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    font-family: monospace;
  }
  .je-dev-key {
    color: #c084fc;
    font-size: 11px;
  }
  .je-dim-src { color: #64748b; font-size: 11px; }

  .je-path-tag { color: #c084fc; font-family: monospace; }
  .je-val-tag { color: #f1f5f9; word-break: break-all; }
  .je-type-tag {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .type-string { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
  .type-number { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
  .type-boolean { background: rgba(6, 182, 212, 0.15); color: #38bdf8; }
  .type-null { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
  .type-object { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .type-array { background: rgba(236, 72, 153, 0.15); color: #f472b6; }

  .je-table-more {
    text-align: center;
    padding: 10px;
    font-size: 11.5px;
    color: #64748b;
  }

  /* ── Tree Viewer ─────────────────────────────────────────────────────── */
  .je-tree-container {
    background: #080e1d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 14px;
    overflow: auto;
    max-height: 520px;
  }
  .je-tree-code {
    margin: 0;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .je-search-box {
    position: relative;
    flex: 1;
    max-width: 320px;
  }
  .je-search-input {
    width: 100%;
    background: #080e1d;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 6px 28px 6px 10px;
    color: #e2e8f0;
    font-size: 12px;
  }
  .je-search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  /* ── Empty State ─────────────────────────────────────────────────────── */
  .je-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }
  .je-empty-icon { font-size: 42px; margin-bottom: 12px; }
  .je-empty-state h4 { font-size: 15px; color: #f1f5f9; margin-bottom: 6px; }
  .je-empty-state p { font-size: 12px; color: #64748b; max-width: 420px; line-height: 1.5; margin: 0; }
  .je-empty-state code { background: rgba(255, 255, 255, 0.06); padding: 2px 6px; border-radius: 4px; color: #38bdf8; }

  /* ── Loading Spinner ─────────────────────────────────────────────────── */
  .je-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    display: inline-block;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Metrics Ribbon ─────────────────────────────────────────────────── */
  .je-metrics-ribbon {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    padding: 10px 12px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
  }
  .je-metric-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 6px 10px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }
  .je-metric-item:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
  }
  .je-metric-item.highlight-cyan {
    border-color: rgba(56, 189, 248, 0.25);
    background: rgba(56, 189, 248, 0.06);
  }
  .je-metric-item.highlight-green {
    border-color: rgba(34, 197, 94, 0.25);
    background: rgba(34, 197, 94, 0.06);
  }
  .je-metric-icon {
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .je-metric-col {
    display: flex;
    flex-direction: column;
  }
  .je-metric-val {
    font-size: 14px;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.1;
  }
  .highlight-cyan .je-metric-val {
    color: #38bdf8;
  }
  .highlight-green .je-metric-val {
    color: #4ade80;
  }
  .je-metric-lbl {
    font-size: 10px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 500;
  }

  /* ── Live Filter Bar & Pills ─────────────────────────────────────────── */
  .je-live-filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    background: rgba(15, 23, 42, 0.6);
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .je-live-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .je-pill {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .je-pill:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }
  .je-pill.active-pill {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
    font-weight: 600;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
  }

  .je-db-select {
    background: #080e1d;
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 11.5px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    max-width: 280px;
  }
  .je-db-select:focus {
    border-color: #38bdf8;
  }

  /* ── Status Pills & Badges ───────────────────────────────────────────── */
  .je-online-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 12px;
  }
  .je-offline-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 12px;
  }
  .je-disc-badge {
    font-size: 11px;
    margin-left: 4px;
    cursor: help;
  }
  .je-db-tag {
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 4px;
    white-space: nowrap;
  }
</style>
