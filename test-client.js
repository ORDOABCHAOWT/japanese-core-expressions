(() => {
  "use strict";

  const STORAGE_KEY = "kotoba-test-progress-v1";
  const modes = [
    { id: "audio-ja", title: "听音写日语", description: "播放读音，填写日语词", short: "听音" },
    { id: "zh-ja", title: "中文写日语", description: "看到中文，填写日语词", short: "中→日" },
    { id: "jp-zh", title: "日语写中文", description: "看到假名和日语，填写中文", short: "日→中" },
  ];
  const app = document.getElementById("app");
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
    try { progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) { progress = {}; }
  }
  const state = {
    category: "全部词卡",
    mode: modes[0].id,
    order: testCards.map((card) => card.id),
    index: 0,
    result: null,
    sessionAnswered: 0,
    sessionCorrect: 0,
    audioEnabled: false,
  };
  let ui = null;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  function save() {
    if (!storageAvailable) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
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

  function categoryCards() {
    return state.category === "全部词卡"
      ? testCards
      : testCards.filter((card) => card.category === state.category);
  }

  function dueDeck() {
    const rank = new Map(state.order.map((id, index) => [id, index]));
    return categoryCards()
      .filter((card) => !isCardGraduated(card.id))
      .filter((card) => TestScheduler.isDue(modeProgress(card.id, state.mode)))
      .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
  }

  function allStats() {
    const now = Date.now();
    const graduated = testCards.filter((card) => isCardGraduated(card.id)).length;
    const due = testCards.filter((card) => {
      if (isCardGraduated(card.id)) return false;
      return TestScheduler.isDue(modeProgress(card.id, state.mode), now);
    }).length;
    return { graduated, remaining: testCards.length - graduated, due };
  }

  function currentQuestion() {
    const deck = dueDeck();
    if (state.index >= deck.length) state.index = 0;
    return { deck, card: deck[state.index] || null };
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      alert("当前浏览器没有可用的日语朗读功能。");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.78;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
  }

  function promptMarkup(card) {
    if (state.mode === "audio-ja") {
      return `<div>
        <p class="question-kicker">不要看答案，先听读音</p>
        <div class="audio-orb" aria-hidden="true">♪</div>
        <button class="audio-play" type="button" data-action="play-audio">播放读音</button>
      </div>`;
    }
    if (state.mode === "zh-ja") {
      return `<div><p class="question-kicker">请写出对应的日语词</p><p class="prompt-main">${escapeHtml(card.meaning)}</p></div>`;
    }
    return `<div>
      <p class="question-kicker">请写出这个词的中文意思</p>
      <p class="prompt-main" lang="ja">${escapeHtml(card.writing)}</p>
      <div class="prompt-kana" lang="ja">${escapeHtml(card.kana)}</div>
    </div>`;
  }

  function standardAnswer(card) {
    return state.mode === "jp-zh"
      ? card.meaning
      : card.writing === card.kana
        ? card.writing
        : `${card.writing}（${card.kana}）`;
  }

  function questionMarkup() {
    const { deck, card } = currentQuestion();
    if (!card) {
      const remainingInCategory = categoryCards().filter((item) => !isCardGraduated(item.id)).length;
      return `<div class="empty-state">
        <div class="empty-seal">済</div>
        <h3>${remainingInCategory ? "当前题型今天已完成" : "这一组已经全部毕业"}</h3>
        <p>${remainingInCategory ? "按遗忘曲线还没到下一次测试时间。可以切换另外两种题型或其他词汇组。" : "三种测试都已通过，这组词不会再进入普通学习队列。"}</p>
      </div>`;
    }

    const mode = modes.find((item) => item.id === state.mode);
    const feedback = state.result ? `
      <div class="feedback ${state.result.passed ? "correct" : "incorrect"}" aria-live="polite">
        <strong>${state.result.passed ? "回答正确" : "回答不正确，本题型从第一关重新巩固"}</strong>
        <p>你的答案：${escapeHtml(state.result.answer || "（未填写）")}</p>
        <p class="answer">标准答案：${escapeHtml(standardAnswer(card))}</p>
        ${state.result.passed ? `<p>下一次：${escapeHtml(TestScheduler.nextIntervalLabel(state.result.updated))}</p>` : "<p>10 分钟后再测，其他题型的进度不受影响。</p>"}
      </div>
      <div class="next-row"><button class="primary-button" type="button" data-action="next-question">下一题</button></div>` : `
      <form class="answer-form" id="answer-form">
        <input class="answer-input" id="answer-input" name="answer" type="text" autocomplete="off" autocorrect="off" spellcheck="false" lang="${state.mode === "jp-zh" ? "zh-CN" : "ja"}" placeholder="${state.mode === "jp-zh" ? "请输入中文释义" : "请输入日语词"}" aria-label="测试答案" required>
        <button class="primary-button" type="submit">确认答案</button>
      </form>
      <p class="answer-help">${state.mode === "jp-zh" ? "多义词填写任意一个标准义项即可。" : "汉字写法、正确假名或词条中的礼貌体均可判定正确。"}</p>`;

    return `
      <div class="question-meta"><strong>${escapeHtml(mode.title)}</strong><span>${escapeHtml(card.category)} · ${state.index + 1} / ${deck.length}</span></div>
      <div class="question-body">${promptMarkup(card)}</div>
      ${feedback}`;
  }

  function progressMarkup() {
    const { card } = currentQuestion();
    if (!card) {
      return `<div class="panel-title"><span>记忆进度</span><strong>今日完成</strong></div>
        <div class="graduation-note">每个词的三种题型分别计时。到期后再答对，才会进入下一段更长的记忆间隔。</div>`;
    }
    const rows = modes.map((mode) => {
      const item = modeProgress(card.id, mode.id);
      return `<div class="mode-progress-row">
        <div class="mode-progress-head"><strong>${escapeHtml(mode.short)}</strong><span>${item.graduated ? "毕业" : `${item.stage}/${TestScheduler.TOTAL_CHECKPOINTS} 关`}</span></div>
        <div class="checkpoint-track">${Array.from({ length: TestScheduler.TOTAL_CHECKPOINTS }, (_, index) => `<i class="${item.stage > index ? "filled" : ""}"></i>`).join("")}</div>
        <small>${escapeHtml(TestScheduler.nextIntervalLabel(item))}</small>
      </div>`;
    }).join("");
    return `<div class="panel-title"><span>当前词记忆进度</span><strong>${isCardGraduated(card.id) ? "已毕业" : "三路测试"}</strong></div>
      <div class="mode-progress">${rows}</div>
      <div class="graduation-note">三种题型都通过 7 个记忆检查点后，这个词才会毕业并退出普通学习队列。</div>`;
  }

  function categoryNavigation() {
    const categories = ["全部词卡", ...new Set(testCards.map((card) => card.category))];
    return categories.map((category) => {
      const items = category === "全部词卡" ? testCards : testCards.filter((card) => card.category === category);
      const graduated = items.filter((card) => isCardGraduated(card.id)).length;
      const mark = category === "全部词卡" ? "全" : category.slice(0, 1);
      return `<button class="category-button ${state.category === category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
        <span class="category-mark">${escapeHtml(mark)}</span>
        <span class="category-copy"><strong>${escapeHtml(category)}</strong><small>${graduated}/${items.length} 毕业</small></span>
      </button>`;
    }).join("");
  }

  function renderStage() {
    ui.stage.innerHTML = questionMarkup();
    ui.progress.innerHTML = progressMarkup();
    const stats = allStats();
    ui.graduatedCount.textContent = String(stats.graduated);
    ui.dueCount.textContent = String(stats.due);
    ui.sessionScore.textContent = state.sessionAnswered ? `${state.sessionCorrect}/${state.sessionAnswered}` : "0";
    ui.categoryNav.innerHTML = categoryNavigation();
    window.requestAnimationFrame(() => ui.stage.querySelector("#answer-input")?.focus({ preventScroll: true }));
  }

  function renderShell() {
    const stats = allStats();
    app.innerHTML = `<main class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-seal">試</div><div><p>KOTOBA TEST</p><h1>日语词汇测试</h1></div></div>
        <nav class="module-switcher" aria-label="日语学习板块">
          <a href="/japanese">核心表达</a>
          <a href="/japanese/words">单词闪卡</a>
          <a href="/japanese/test" aria-current="page">词汇测试</a>
        </nav>
        <div class="sidebar-label">按词汇组测试</div>
        <nav class="category-nav" id="category-nav" aria-label="测试分类">${categoryNavigation()}</nav>
        <div class="sidebar-foot">
          <div class="save-status">${storageAvailable ? "测试进度保存在当前浏览器" : "当前浏览器不支持保存进度"}</div>
          <button class="danger-button" type="button" data-action="reset">清除测试记录</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div><p class="eyebrow">Ebbinghaus · Three-way Recall</p><h2>三种回忆，都通过才算真正掌握。</h2></div>
          <div class="top-summary">
            <div class="summary-chip"><strong id="graduated-count">${stats.graduated}</strong><span>已经毕业</span></div>
            <div class="summary-chip"><strong id="due-count">${stats.due}</strong><span>本题型待测</span></div>
            <div class="summary-chip"><strong id="session-score">0</strong><span>本轮答对</span></div>
          </div>
        </header>
        <div class="mode-tabs" id="mode-tabs">${modes.map((mode) => `<button class="mode-tab ${state.mode === mode.id ? "active" : ""}" type="button" data-mode="${mode.id}"><strong>${mode.title}</strong><small>${mode.description}</small></button>`).join("")}</div>
        <div class="test-layout">
          <section class="test-stage" id="test-stage" aria-live="polite"></section>
          <aside class="progress-panel" id="progress-panel"></aside>
        </div>
        <footer class="source-note">共 ${testCards.length} 张词卡 · 10 分钟、1 天、3 天、7 天、14 天、30 天间隔复习</footer>
      </section>
    </main>`;
    ui = {
      categoryNav: document.querySelector("#category-nav"),
      modeTabs: document.querySelector("#mode-tabs"),
      stage: document.querySelector("#test-stage"),
      progress: document.querySelector("#progress-panel"),
      graduatedCount: document.querySelector("#graduated-count"),
      dueCount: document.querySelector("#due-count"),
      sessionScore: document.querySelector("#session-score"),
    };
    renderStage();
  }

  function submitAnswer(answer) {
    const { card } = currentQuestion();
    if (!card) return;
    const passed = TestScheduler.checkAnswer(card, state.mode, answer);
    const current = modeProgress(card.id, state.mode);
    const updated = TestScheduler.advance(current, passed);
    const existing = cardProgress(card.id);
    progress[card.id] = { ...existing, modes: { ...(existing.modes || {}), [state.mode]: updated } };
    save();
    state.result = { passed, answer, updated };
    state.sessionAnswered += 1;
    if (passed) state.sessionCorrect += 1;
    renderStage();
  }

  function nextQuestion() {
    state.result = null;
    const deck = dueDeck();
    if (deck.length) state.index %= deck.length;
    else state.index = 0;
    renderStage();
    const { card } = currentQuestion();
    if (state.mode === "audio-ja" && state.audioEnabled && card) setTimeout(() => speak(card.kana), 80);
  }

  app.addEventListener("submit", (event) => {
    if (event.target.id !== "answer-form") return;
    event.preventDefault();
    const answer = new FormData(event.target).get("answer")?.toString() || "";
    submitAnswer(answer);
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-category], [data-mode], [data-action]");
    if (!target) return;
    const category = target.dataset.category;
    const mode = target.dataset.mode;
    const action = target.dataset.action;
    if (category) {
      state.category = category;
      state.index = 0;
      state.result = null;
      state.audioEnabled = true;
      renderStage();
      const { card } = currentQuestion();
      if (state.mode === "audio-ja" && card) setTimeout(() => speak(card.kana), 80);
    } else if (mode) {
      state.mode = mode;
      state.index = 0;
      state.result = null;
      state.audioEnabled = true;
      ui.modeTabs.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
      renderStage();
      const { card } = currentQuestion();
      if (mode === "audio-ja" && card) setTimeout(() => speak(card.kana), 80);
    } else if (action === "play-audio") {
      state.audioEnabled = true;
      const { card } = currentQuestion();
      if (card) speak(card.kana);
    } else if (action === "next-question") {
      nextQuestion();
    } else if (action === "reset" && confirm("确定清除全部词汇测试记录吗？这会让所有词重新开始三种测试。")) {
      progress = {};
      save();
      state.index = 0;
      state.result = null;
      state.sessionAnswered = 0;
      state.sessionCorrect = 0;
      renderStage();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state.result && !event.target.matches("input, textarea")) nextQuestion();
  });

  renderShell();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/japanese/sw.js", { scope: "/japanese" }).catch(() => {});
    });
  }
})();
