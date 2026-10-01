/* 背单词记录：存在本机，并和其他设备通过 /japanese/api/words 合并 */
const WordsStore = (() => {
  "use strict";

  const KEY = "kotoba-words-v2";
  const LEGACY_FLASHCARDS = "kotoba-flashcards-progress-v1";
  const LEGACY_TESTS = "kotoba-test-progress-v1";
  const ENDPOINT = "/japanese/api/words";
  const changeListeners = new Set();
  const statusListeners = new Set();
  let state = null;
  let syncTimer = 0;
  let inFlight = null;
  let version = 0;
  let status = { kind: "syncing", label: "同步中", title: "正在读取网站上的背单词记录…" };

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (_) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {
      // 存不下时这次学习仍可继续，同步会把记录带到服务器
    }
    KotobaUI.updateBadges();
  }

  function load() {
    state = Daily.normalizeState(readJson(KEY));
    if (!state.legacyMigrated) {
      Daily.migrateLegacy(state, readJson(LEGACY_FLASHCARDS) || {}, readJson(LEGACY_TESTS) || {});
    }
    save();
    return state;
  }

  function emit() {
    changeListeners.forEach((listener) => listener(state));
  }

  function setStatus(kind, label, title) {
    status = { kind, label, title };
    const trigger = document.getElementById("sync-trigger");
    const dot = document.getElementById("sync-dot");
    const text = document.getElementById("sync-label");
    if (trigger) {
      trigger.dataset.state = kind;
      trigger.title = title;
      trigger.setAttribute("aria-label", `${label}。${title}`);
    }
    if (dot) dot.dataset.state = kind;
    if (text) text.textContent = label;
    statusListeners.forEach((listener) => listener(status));
  }

  /** 每次改动记录后调用：存到本机，稍后同步 */
  function commit() {
    version += 1;
    save();
    queueSync();
  }

  /** 过了凌晨 4 点就换到新的学习日 */
  function refreshDay() {
    if (!Daily.setDay(state, Daily.studyDay())) return false;
    save();
    emit();
    return true;
  }

  function queueSync(delay = 1500) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, delay);
  }

  function syncNow() {
    if (inFlight) return inFlight;
    clearTimeout(syncTimer);
    const startVersion = version;
    const sentActivity = state.pending.activity;
    const body = JSON.stringify(Daily.syncBody(state));
    setStatus("syncing", "同步中", "正在合并这台设备和网站上的背单词记录…");
    inFlight = (async () => {
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          setStatus("locked", "未登录", "输入访问密钥后，Mac 和 iPhone 才能同步背单词进度");
          return null;
        }
        if (!response.ok) throw new Error(payload.error || `服务器返回 ${response.status}`);
        const changed = Daily.mergeRemote(state, payload, sentActivity);
        save();
        if (changed) emit();
        const time = new Date(payload.syncedAt || Date.now()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        setStatus("synced", "已同步", `${time} 已和其他设备合并`);
        return payload;
      } catch (error) {
        setStatus(
          "error",
          "待同步",
          navigator.onLine ? `同步没完成：${error.message || "请稍后再试"}。点击重试` : "现在离线，记录先存在这台设备上，联网后自动同步",
        );
        return null;
      } finally {
        inFlight = null;
        if (version !== startVersion) queueSync(300);
      }
    })();
    return inFlight;
  }

  // 关掉页面前把还没送出的记录带走
  function flush() {
    if (!state || !Daily.hasPending(state) || status.kind === "locked") return;
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(Daily.syncBody(state)),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {
      // 下次打开时会再同步
    }
  }

  function unlock() {
    KotobaUI.requestAccess({ onSuccess: () => syncNow() });
  }

  function init() {
    load();
    document.getElementById("sync-trigger")?.addEventListener("click", () => {
      if (status.kind === "locked") unlock();
      else syncNow();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshDay();
        syncNow();
      } else {
        flush();
      }
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", () => syncNow());
    setTimeout(syncNow, 200);
    return state;
  }

  return {
    init,
    get: () => state,
    commit,
    refreshDay,
    syncNow,
    unlock,
    status: () => status,
    onChange: (listener) => changeListeners.add(listener),
    onStatus: (listener) => statusListeners.add(listener),
  };
})();
