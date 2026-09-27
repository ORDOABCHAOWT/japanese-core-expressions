(() => {
  "use strict";

  const STORAGE_KEY = "kotoba-test-progress-v1";
  const ALL = "全部词卡";
  const modes = [
    { id: "audio-ja", title: "听音写日语", short: "听音" },
    { id: "zh-ja", title: "中文写日语", short: "中→日" },
    { id: "jp-zh", title: "日语写中文", short: "日→中" },
  ];
  const { ICON, esc, speak, prefs, savePrefs, openDialog, closeDialog, isTyping, updateBadges } = KotobaUI;
  const app = document.getElementById("app");
  const sidebar = document.getElementById("sidebar");
  const picker = document.getElementById("picker");
  const storageAvailable = (() => {
    try {
      localStorage.setItem("__kotoba_test_storage__", "1");
      localStorage.removeItem("__kotoba_test_storage__");
      return true;
    } catch (_) {
      return false;
    }
  })();

  let progress = {};
  if (storageAvailable) {
    try { progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (_) { progress = {}; }
  }
  const categoryNames = [ALL, ...new Set(testCards.map((card) => card.category))];
  const saved = prefs("test");
  const state = {
    category: categoryNames.includes(saved.category) ? saved.category : ALL,
    mode: modes.some((mode) => mode.id === saved.mode) ? saved.mode : modes[0].id,
    order: testCards.map((card) => card.id),
    index: 0,
    result: null,
    sessionAnswered: 0,
    sessionCorrect: 0,
    audioEnabled: false,
  };
  let ui = null;

  function save() {
    if (storageAvailable) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
    }
    updateBadges();
  }

  function cardProgress(cardId) {
    return progress[cardId] || { modes: {} };
  }

  function modeProgress(cardId, modeId) {
    return cardProgress(cardId).modes?.[modeId] || TestScheduler.emptyModeProgress();
  }

  function isCardGraduated(cardId) {
    return TestScheduler.cardGraduated(cardProgress(cardId));
  }

  function categoryCards(category = state.category) {
    return category === ALL ? testCards : testCards.filter((card) => card.category === category);
  }

  function dueDeck(modeId = state.mode) {
    const rank = new Map(state.order.map((id, index) => [id, index]));
    return categoryCards()
      .filter((card) => !isCardGraduated(card.id))
      .filter((card) => TestScheduler.isDue(modeProgress(card.id, modeId)))
      .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
  }

  function currentQuestion() {
    const deck = dueDeck();
    if (state.index >= deck.length) state.index = 0;
    return { deck, card: deck[state.index] || null };
  }

  const graduatedCount = (category = ALL) => categoryCards(category).filter((card) => isCardGraduated(card.id)).length;

  /* ---------- markup ---------- */
  function categoryItems() {
    return categoryNames.map((name) => {
      const mark = name === ALL ? "全" : categoryMarks[name] || name.slice(0, 1);
      return `<button class="side-item" type="button" data-category="${esc(name)}" aria-current="${state.category === name}">
        <span class="side-mark" lang="ja">${esc(mark)}</span><span class="side-title">${esc(name)}</span><span class="side-meta">${graduatedCount(name)}/${categoryCards(name).length}</span>
      </button>`;
    }).join("");
  }

  function standardAnswer(card) {
    if (state.mode === "jp-zh") return esc(card.meaning);
    return card.writing === card.kana
      ? `<span lang="ja">${esc(card.writing)}</span>`
      : `<span lang="ja">${esc(card.writing)}</span><small lang="ja">${esc(card.kana)}</small>`;
  }

  function promptMarkup(card) {
    if (state.mode === "audio-ja") {
      return `<p class="q-label">听读音，写出日语</p><button class="audio-orb" type="button" data-action="play-audio" aria-label="播放读音" title="播放读音">${ICON.speaker}</button>`;
    }
    if (state.mode === "zh-ja") {
      return `<p class="q-label">写出对应的日语</p><p class="q-main zh">${esc(card.meaning)}</p>`;
    }
    return `<p class="q-label">写出中文意思</p><p class="q-main" lang="ja">${esc(card.writing)}</p>${card.writing !== card.kana ? `<p class="q-sub" lang="ja">${esc(card.kana)}</p>` : ""}`;
  }

  function feedbackMarkup(card, result) {
    return `<div class="feedback ${result.passed ? "ok" : "bad"}" role="status">
        <div class="feedback-head">${result.passed ? ICON.check : ICON.wrong}${result.passed ? "回答正确" : "这次没答对，本题型回到第一关"}<span class="when">${result.passed ? `下次：${esc(TestScheduler.nextIntervalLabel(result.updated))}` : "10 分钟后再测"}</span></div>
        <div class="feedback-answer"><span class="std">${standardAnswer(card)}</span><button class="icon-btn" type="button" data-action="speak-answer" aria-label="朗读" title="朗读">${ICON.speaker}</button></div>
        ${result.passed ? "" : `<p class="feedback-mine">你的答案：${esc(result.answer || "（未填写）")} · 另外两种题型的进度不受影响</p>`}
        <p class="feedback-ex"><span lang="ja">${esc(card.example)}</span>${esc(card.exampleZh)}</p>
      </div>`;
  }

  function questionMarkup() {
    const current = currentQuestion();
    const deck = current.deck;
    const card = state.result?.card || current.card;
    if (!card) {
      const remaining = categoryCards().filter((item) => !isCardGraduated(item.id)).length;
      return `<div class="panel empty"><div class="empty-seal" lang="ja">済</div>
        <h3>${remaining ? "这个题型今天完成了" : "这一组已经全部毕业"}</h3>
        <p>${remaining ? "按遗忘曲线还没到下一次测试时间。可以换另外两种题型，或换一个词汇组。" : "三种测试都已通过，这组词不会再进入普通学习队列。"}</p></div>`;
    }
    const result = state.result;
    return `<div class="q-card">
        <div class="q-meta"><span>${esc(card.category)}</span><span>第 ${result?.position || state.index + 1} / ${result?.total || deck.length} 题</span></div>
        ${promptMarkup(card)}
      </div>
      <form class="answer-row" id="answer-form">
        <input class="answer-input${result ? (result.passed ? " is-correct" : " is-wrong") : ""}" id="answer-input" name="answer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" lang="${state.mode === "jp-zh" ? "zh-CN" : "ja"}" placeholder="${state.mode === "jp-zh" ? "输入中文意思" : "输入日语（汉字或假名）"}" aria-label="你的答案"${result ? ` readonly value="${esc(result.answer)}"` : ""}>
        ${result ? `<button class="btn btn-primary btn-lg" type="button" id="next-question" data-action="next-question">下一题${ICON.enter}</button>` : '<button class="btn btn-primary btn-lg" type="submit">确认</button>'}
      </form>
      ${result ? feedbackMarkup(card, result) : `<p class="answer-help"><span>${state.mode === "jp-zh" ? "多义词写出任意一个义项即可" : "汉字写法、正确假名或礼貌体都算对"}</span><span class="kbd-hint"><span class="kbd">Enter</span> 提交</span></p>`}`;
  }

  function progressMarkup() {
    const card = state.result?.card || currentQuestion().card;
    if (!card) {
      return '<section class="panel"><h3>记忆进度</h3><p class="panel-note">每个词的三种题型分别计时。到期后再答对，才会进入下一段更长的间隔。</p></section>';
    }
    const rows = modes.map((mode) => {
      const item = modeProgress(card.id, mode.id);
      return `<div class="mode-row"><div class="mode-row-head"><span>${mode.title}</span><b class="num">${item.graduated ? "毕业" : `${item.stage}/${TestScheduler.TOTAL_CHECKPOINTS}`}</b></div>
        <div class="dots">${Array.from({ length: TestScheduler.TOTAL_CHECKPOINTS }, (_, index) => `<i class="${item.stage > index ? "on" : ""}"></i>`).join("")}</div>
        <small>${esc(TestScheduler.nextIntervalLabel(item))}</small></div>`;
    }).join("");
    return `<section class="panel"><h3>这个词的三路进度</h3><div class="mode-rows">${rows}</div>
      <p class="panel-note">三种题型都通过 7 个检查点后，这个词才算毕业，并退出普通复习。</p></section>`;
  }

  function modeButtons() {
    return modes.map((mode) => `<button type="button" data-mode="${mode.id}" aria-pressed="${state.mode === mode.id}"><span class="long">${mode.title}</span><span class="short">${mode.short}</span><span class="pill neutral">${dueDeck(mode.id).length}</span></button>`).join("");
  }

  /* ---------- rendering ---------- */
  function renderSidebar() {
    sidebar.innerHTML = `<p class="side-label"><span>词汇组</span><span>毕业 / 总数</span></p>
      <nav class="side-list" aria-label="测试分类">${categoryItems()}</nav>
      <div class="side-foot"><span>${storageAvailable ? "测试进度保存在当前浏览器" : "当前浏览器不能保存进度"}</span><button type="button" data-action="reset">清除测试记录…</button></div>`;
  }

  function renderHeader() {
    ui.eyebrow.textContent = `词汇测试 · 已毕业 ${graduatedCount()} 个`;
    ui.title.textContent = state.category;
    ui.titleShort.textContent = state.category;
    ui.score.hidden = !state.sessionAnswered;
    ui.score.textContent = `本轮 ${state.sessionCorrect} / ${state.sessionAnswered} 正确`;
  }

  function renderStage({ focus = true } = {}) {
    ui.stage.innerHTML = questionMarkup();
    ui.progress.innerHTML = progressMarkup();
    ui.modeTabs.innerHTML = modeButtons();
    renderHeader();
    if (focus) {
      setTimeout(() => (state.result ? document.getElementById("next-question") : document.getElementById("answer-input"))?.focus({ preventScroll: true }), 0);
    }
  }

  function renderShell() {
    app.innerHTML = `
      <header class="page-head">
        <div class="page-title">
          <p class="eyebrow" id="test-eyebrow"></p>
          <h1><span class="title-text" id="test-title"></span><button class="title-btn" type="button" data-action="picker"><span id="test-title-short"></span>${ICON.down}</button></h1>
        </div>
        <div class="page-actions"><span class="tag num" id="session-score" hidden></span></div>
      </header>
      <div class="seg mode-seg" id="mode-tabs" role="group" aria-label="测试方式"></div>
      <div class="study-layout">
        <section class="stage" id="test-stage" aria-label="测试题"></section>
        <aside class="side-panel" id="progress-panel" aria-label="记忆进度"></aside>
      </div>`;
    ui = {
      eyebrow: document.getElementById("test-eyebrow"),
      title: document.getElementById("test-title"),
      titleShort: document.getElementById("test-title-short"),
      score: document.getElementById("session-score"),
      modeTabs: document.getElementById("mode-tabs"),
      stage: document.getElementById("test-stage"),
      progress: document.getElementById("progress-panel"),
    };
    renderSidebar();
    // 手机上不在打开页面时就弹出键盘
    renderStage({ focus: window.matchMedia("(hover: hover)").matches });
  }

  /* ---------- actions ---------- */
  function playAudio(card) {
    const orb = app.querySelector(".audio-orb");
    orb?.classList.add("is-playing");
    speak(card.kana, () => orb?.classList.remove("is-playing"));
  }

  function submitAnswer(answer) {
    const { deck, card } = currentQuestion();
    if (!card) return;
    const passed = TestScheduler.checkAnswer(card, state.mode, answer);
    const current = modeProgress(card.id, state.mode);
    const updated = TestScheduler.advance(current, passed);
    const existing = cardProgress(card.id);
    progress[card.id] = { ...existing, modes: { ...(existing.modes || {}), [state.mode]: updated } };
    save();
    state.result = { passed, answer, updated, card, position: state.index + 1, total: deck.length };
    state.sessionAnswered += 1;
    if (passed) state.sessionCorrect += 1;
    renderStage();
    renderSidebar();
  }

  function nextQuestion() {
    state.result = null;
    const deck = dueDeck();
    if (deck.length) state.index %= deck.length;
    else state.index = 0;
    renderStage();
    const { card } = currentQuestion();
    if (state.mode === "audio-ja" && state.audioEnabled && card) setTimeout(() => playAudio(card), 120);
  }

  function selectCategory(name) {
    state.category = name;
    state.index = 0;
    state.result = null;
    state.audioEnabled = true;
    savePrefs("test", { category: name });
    renderSidebar();
    renderStage();
    const { card } = currentQuestion();
    if (state.mode === "audio-ja" && card) setTimeout(() => playAudio(card), 120);
  }

  function selectMode(mode) {
    state.mode = mode;
    state.index = 0;
    state.result = null;
    state.audioEnabled = true;
    savePrefs("test", { mode });
    renderStage();
    const { card } = currentQuestion();
    if (mode === "audio-ja" && card) setTimeout(() => playAudio(card), 120);
  }

  function openPicker() {
    document.getElementById("picker-title").textContent = "选择词汇组";
    document.getElementById("picker-list").innerHTML = categoryItems();
    openDialog(picker);
  }

  /* ---------- events ---------- */
  app.addEventListener("submit", (event) => {
    if (event.target.id !== "answer-form") return;
    event.preventDefault();
    if (state.result) {
      nextQuestion();
      return;
    }
    const input = event.target.elements.answer;
    const answer = input.value || "";
    if (!answer.trim()) {
      input.focus();
      return;
    }
    submitAnswer(answer);
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-category], [data-mode], [data-action]");
    if (!target) return;
    const { category, mode, action } = target.dataset;
    if (category) {
      if (target.closest("#picker")) closeDialog(picker);
      selectCategory(category);
      return;
    }
    if (mode) {
      selectMode(mode);
      return;
    }
    if (action === "play-audio") {
      state.audioEnabled = true;
      const { card } = currentQuestion();
      if (card) playAudio(card);
      document.getElementById("answer-input")?.focus({ preventScroll: true });
    } else if (action === "next-question") {
      nextQuestion();
    } else if (action === "speak-answer") {
      const card = state.result?.card;
      if (card) speak(card.kana);
    } else if (action === "picker") {
      openPicker();
    } else if (action === "reset" && confirm("确定清除全部词汇测试记录吗？这会让所有词重新开始三种测试。")) {
      progress = {};
      save();
      state.index = 0;
      state.result = null;
      state.sessionAnswered = 0;
      state.sessionCorrect = 0;
      renderSidebar();
      renderStage();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "Enter" && state.result && !event.target.matches("input, textarea, button")) {
      event.preventDefault();
      nextQuestion();
    }
  });

  renderShell();
  KotobaUI.init();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/japanese/sw.js", { scope: "/japanese" }).catch(() => {});
    });
  }
})();
