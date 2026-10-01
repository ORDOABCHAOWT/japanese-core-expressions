const KotobaUI = (() => {
  "use strict";

  const PREFS_KEY = "kotoba-ui-v1";
  const WORDS_KEY = "kotoba-words-v2";

  const ICON = {
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4"/><path d="M18.4 6a8.5 8.5 0 0 1 0 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    wrong: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M17 7 7 17M7 7l10 10"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h4v4"/><path d="M4 20 20 4"/><path d="M20 16v4h-4"/><path d="m14.5 14.5 5.5 5.5"/><path d="M4 4l5 5"/></svg>',
    enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
  };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  /* ---------- 中日混排：日文片段标 lang="ja"，中文保持界面字体 ---------- */
  const KANA = /[぀-ヿ]/g;
  const CJK = /[぀-ヿ㐀-鿿豈-﫿]/g;
  // 只在简体中文里出现的常用字；出现这些字的片段不会被当成日文
  const ZH_ONLY = /[这说话语读书们时对过还没为么样种钱买卖车东门问间见观听记忆让给边远离进发现头实该关应认识讲请谢员贵饭饮鱼鸡马鸟长张开电视脑网页图馆药气汉动业经场乐欢难简单复杂较级词义项连续结构译释虽从众后]/;
  const jaSpan = (text) => `<span lang="ja">${esc(text)}</span>`;

  function looksJapanese(text) {
    const kana = (text.match(KANA) || []).length;
    const cjk = (text.match(CJK) || []).length;
    if (!kana) return false;
    if (ZH_ONLY.test(text)) return kana / Math.max(cjk, 1) >= 0.5;
    return kana / Math.max(cjk, 1) >= 0.3 || /[：:]\s*$/.test(text);
  }
  function clausePart(clause) {
    if (!clause) return "";
    if (looksJapanese(clause)) return jaSpan(clause);
    return esc(clause).replace(/[぀-ヿ]+/g, (run) => `<span lang="ja">${run}</span>`);
  }
  const clauses = (text) => text.split(/(?<=[。！？!?：:；;＝→，,、＋])/).map(clausePart).join("");
  function plainPart(text) {
    return text.split(/(（[^）]*）)/)
      .map((part) => (/^（[^）]*）$/.test(part) ? `（${clauses(part.slice(1, -1))}）` : clauses(part)))
      .join("");
  }
  /** 把中文说明里夹带的日文（含「」引用）标成日文，返回安全的 HTML。 */
  function mixed(text) {
    const source = String(text || "");
    const quote = /「[^」]*」/g;
    let html = "";
    let last = 0;
    let match;
    while ((match = quote.exec(source))) {
      html += plainPart(source.slice(last, match.index));
      const inner = match[0].slice(1, -1);
      html += `「${ZH_ONLY.test(inner) ? clauses(inner) : jaSpan(inner)}」`;
      last = match.index + match[0].length;
    }
    return html + plainPart(source.slice(last));
  }

  /* ---------- 朗读 ---------- */
  let jaVoice = null;
  function pickVoice() {
    if (typeof speechSynthesis === "undefined") return;
    const voices = speechSynthesis.getVoices().filter((voice) => /^ja/i.test(voice.lang));
    jaVoice = voices.find((voice) => /kyoko|o-ren|google/i.test(voice.name)) || voices[0] || null;
  }
  function speak(text, onEnd) {
    if (typeof speechSynthesis === "undefined") {
      toast("当前浏览器不支持日语朗读");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.85;
    if (jaVoice) utterance.voice = jaVoice;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    speechSynthesis.speak(utterance);
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(message) {
    const element = document.querySelector("#toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-on"), 2200);
  }

  /* ---------- 本机偏好（上次的章节、分类、题型等） ---------- */
  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function prefs(module) {
    return readJson(PREFS_KEY, {})[module] || {};
  }
  function savePrefs(module, patch) {
    try {
      const all = readJson(PREFS_KEY, {});
      all[module] = { ...(all[module] || {}), ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(all));
    } catch (_) {
      // 偏好只是便利，存不下时忽略
    }
  }

  /* ---------- 顶栏角标：背单词今天到期的词（三个页面一致） ---------- */
  function dueCounts() {
    if (typeof Daily === "undefined") return { words: 0 };
    return { words: Daily.dueCount(readJson(WORDS_KEY, {})) };
  }
  function updateBadges() {
    const counts = dueCounts();
    document.querySelectorAll("[data-badge]").forEach((badge) => {
      const value = counts[badge.dataset.badge] || 0;
      badge.hidden = value === 0;
      badge.textContent = value > 99 ? "99+" : String(value);
    });
  }

  /* ---------- 对话框与快捷键说明 ---------- */
  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }
  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  const isTyping = (target) => Boolean(target?.closest?.("input, textarea, [contenteditable='true']"));

  /* ---------- 访问密钥：和 Word Notebook 共用，一台设备输入一次 ---------- */
  function requestAccess({ onSuccess } = {}) {
    let dialog = document.getElementById("access-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "modal";
      dialog.id = "access-dialog";
      dialog.setAttribute("aria-labelledby", "access-title");
      dialog.innerHTML = `<div class="modal-head"><h2 id="access-title">输入访问密钥</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="关闭">${ICON.x}</button></div>
        <form class="modal-body access-form" id="access-form">
          <p class="access-note">和 Word Notebook 用同一个访问密钥。这台设备输入一次，一年内都能和其他设备同步学习记录。</p>
          <input class="answer-input access-input" id="access-key" name="accessKey" type="password" autocomplete="current-password" placeholder="访问密钥" aria-label="访问密钥" required>
          <p class="access-error" id="access-error" role="alert" hidden></p>
          <div class="modal-foot"><button class="btn btn-quiet" type="button" data-action="close-dialog">取消</button><button class="btn btn-primary" type="submit" id="access-submit">登录并同步</button></div>
        </form>`;
      document.body.append(dialog);
      dialog.querySelector("form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = dialog.querySelector("#access-key");
        const error = dialog.querySelector("#access-error");
        const submit = dialog.querySelector("#access-submit");
        error.hidden = true;
        submit.disabled = true;
        try {
          const response = await fetch("/japanese/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ accessKey: input.value }),
          });
          if (!response.ok) throw new Error(response.status === 401 ? "访问密钥不对，再检查一下。" : `登录没成功（服务器返回 ${response.status}）。`);
          input.value = "";
          closeDialog(dialog);
          toast("已登录，正在同步");
          dialog.onAccess?.();
        } catch (failure) {
          error.textContent = navigator.onLine ? failure.message : "现在离线，联网后再试。";
          error.hidden = false;
        } finally {
          submit.disabled = false;
        }
      });
    }
    dialog.onAccess = onSuccess;
    dialog.querySelector("#access-error").hidden = true;
    openDialog(dialog);
    setTimeout(() => dialog.querySelector("#access-key")?.focus(), 0);
  }

  /* ---------- iOS 主屏应用底部黑边 ----------
     有的 iPhone 主屏模式下网页铺满全屏（顶部安全区 > 0），但 innerHeight 少了一个状态栏高度，
     屏幕底部那条连 fixed 元素也画不到。检测到这种情况时，把差值交给 CSS 加高外壳，并把页面滚动固定在顶部。 */
  function updateIosShim() {
    const root = document.documentElement;
    const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    let shim = 0;
    if (standalone && document.body) {
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top)";
      document.body.append(probe);
      const topInset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      const gap = Math.round(window.screen.height - window.innerHeight);
      if (topInset > 0 && gap > 0 && gap <= 120) shim = gap;
    }
    root.style.setProperty("--ios-bottom-shim", `${shim}px`);
    root.classList.toggle("ios-shim", shim > 0);
  }

  function scrollToTop() {
    document.querySelector(".main")?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }

  function init() {
    updateIosShim();
    window.addEventListener("resize", updateIosShim);
    window.addEventListener("orientationchange", updateIosShim);
    window.addEventListener("scroll", () => {
      if (document.documentElement.classList.contains("ios-shim") && window.scrollY !== 0) window.scrollTo(0, 0);
    }, { passive: true });
    pickVoice();
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.addEventListener) {
      speechSynthesis.addEventListener("voiceschanged", pickVoice);
    }
    updateBadges();
    window.addEventListener("storage", updateBadges);
    window.addEventListener("pageshow", updateBadges);
    document.addEventListener("click", (event) => {
      if (event.target.matches?.("dialog")) {
        closeDialog(event.target);
        return;
      }
      const control = event.target.closest?.("[data-action='close-dialog'], [data-action='shortcuts']");
      if (!control) return;
      if (control.dataset.action === "close-dialog") closeDialog(control.closest("dialog"));
      else openDialog(document.querySelector("#shortcuts"));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "?" && !isTyping(event.target) && !document.querySelector("dialog[open]")) {
        openDialog(document.querySelector("#shortcuts"));
      }
    });
  }

  return { ICON, esc, mixed, looksJapanese, speak, toast, prefs, savePrefs, dueCounts, updateBadges, requestAccess, openDialog, closeDialog, isTyping, scrollToTop, init };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = KotobaUI;
}
