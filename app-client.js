(() => {
  "use strict";

  const LEGACY_STORAGE_KEY = "nihongo-core-86-learned";
  const STATE_STORAGE_KEY = "nihongo-core-86-state-v2";
  const SYNC_ENDPOINT = "/japanese/api/progress";
  const LESSON_DATA = Array.isArray(window.__LESSON_DATA__) ? window.__LESSON_DATA__ : [];
  const CHAPTERS = Array.isArray(window.__CHAPTERS__) ? window.__CHAPTERS__ : [];
  const { ICON, esc, speak, toast, prefs, savePrefs, openDialog, closeDialog, isTyping } = KotobaUI;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const pad2 = (value) => String(value).padStart(2, "0");

  const lessonByNumber = new Map(LESSON_DATA.map((lesson) => [String(lesson.number), lesson]));
  const rows = $$(".phrase-row");
  const rowByNumber = new Map(rows.map((row) => [Number(row.dataset.lesson), row]));
  const lists = $$("[data-chapter-list]");
  const groupLabelById = new Map($$("[data-group-label]").map((label) => [label.dataset.groupLabel, label]));
  const sideItems = $$("#chapter-nav .side-item");
  const searchInput = $("#lesson-search");
  const searchClear = $("#search-clear");
  const searchKbd = $("#search-kbd");
  const listScroll = $("#list-scroll");
  const emptyState = $("#empty-state");
  const pager = $("#chapter-pager");
  const detailPane = $("#phrase-detail");
  const sheet = $("#detail-sheet");
  const syncTrigger = $("#sync-trigger");
  let needsAccess = false;
  const syncLabel = $("#sync-label");
  const syncDot = $("#sync-dot");
  const quizDialog = $("#quiz-dialog");
  const quizSetup = $("#quiz-setup");
  const quizQuestion = $("#quiz-question");
  const quizSummary = $("#quiz-summary");
  const quizTotalStats = $("#quiz-total-stats");
  const picker = $("#picker");

  const view = { chapter: CHAPTERS[0]?.id, selected: null, query: "", sheetOpen: false };
  const quiz = { scope: "chapter", mode: "mixed", items: [], index: 0, correct: 0, feedback: null, choices: null };
  let learned = new Set();
  let syncInFlight = null;
  let syncTimer = null;
  let localChangeVersion = 0;

  /* ============================================================
     学习记录：格式与旧版一致（掌握标记、答题统计、待同步事件）
     ============================================================ */
  function emptyStateObject() {
    return { mastery: {}, stats: {}, pendingEvents: [] };
  }

  function loadState() {
    let loaded = emptyStateObject();
    try {
      const candidate = JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || "null");
      if (candidate && typeof candidate === "object") {
        loaded.mastery = candidate.mastery && typeof candidate.mastery === "object" ? candidate.mastery : {};
        loaded.stats = candidate.stats && typeof candidate.stats === "object" ? candidate.stats : {};
        loaded.pendingEvents = Array.isArray(candidate.pendingEvents) ? candidate.pendingEvents.slice(-200) : [];
      }
    } catch {
      loaded = emptyStateObject();
    }

    if (!Object.keys(loaded.mastery).length) {
      try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
        if (Array.isArray(legacy)) {
          const migratedAt = new Date().toISOString();
          legacy.forEach((number) => {
            const key = String(Number(number));
            if (lessonByNumber.has(key)) loaded.mastery[key] = { mastered: true, updatedAt: migratedAt };
          });
        }
      } catch {
        // Ignore invalid legacy data.
      }
    }
    return loaded;
  }

  let state = loadState();

  // 旧版把第 1–9 句记成 "01"–"09"，同步回来的是 "1"–"9"；统一成数字写法，保留较新的那条。
  function normalizeMasteryKeys() {
    const normalized = {};
    Object.entries(state.mastery).forEach(([key, value]) => {
      const canonical = String(Number(key));
      if (!value || !lessonByNumber.has(canonical)) return;
      const entry = { mastered: Boolean(value.mastered), updatedAt: value.updatedAt || "1970-01-01T00:00:00.000Z" };
      const existing = normalized[canonical];
      if (!existing || entry.updatedAt > existing.updatedAt) normalized[canonical] = entry;
    });
    state.mastery = normalized;
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([...learned]));
    } catch {
      // The textbook remains usable when local storage is unavailable.
    }
  }

  function rebuildLearnedSet() {
    learned = new Set(
      Object.entries(state.mastery)
        .filter((entry) => entry[1] && entry[1].mastered)
        .map((entry) => entry[0]),
    );
  }

  const isMastered = (number) => learned.has(String(Number(number)));

  function aggregateStats() {
    return Object.values(state.stats).reduce(
      (total, item) => {
        total.attempts += Number(item.attempts) || 0;
        total.correct += Number(item.correctCount) || 0;
        return total;
      },
      { attempts: 0, correct: 0 },
    );
  }

  /* ============================================================
     章节、列表与详情
     ============================================================ */
  const chapterById = (id) => CHAPTERS.find((chapter) => chapter.id === id) || CHAPTERS[0];
  const chapterOf = (number) => CHAPTERS.find((chapter) => number >= chapter.start && number <= chapter.end) || CHAPTERS[0];
  function chapterNumbers(chapter) {
    const numbers = [];
    for (let number = chapter.start; number <= chapter.end; number += 1) numbers.push(number);
    return numbers;
  }
  const searchQuery = () => view.query.trim().toLowerCase();
  function visibleNumbers() {
    const query = searchQuery();
    if (!query) return chapterNumbers(chapterById(view.chapter));
    return rows.filter((row) => row.dataset.search.includes(query)).map((row) => Number(row.dataset.lesson));
  }
  const isNarrow = () => window.matchMedia("(max-width: 899px)").matches;

  function renderChapterProgress() {
    const numbers = chapterNumbers(chapterById(view.chapter));
    const done = numbers.filter(isMastered).length;
    $("#chapter-done").textContent = String(done);
    $("#chapter-total").textContent = String(numbers.length);
    $("#chapter-bar").style.width = `${(done / numbers.length) * 100}%`;
  }

  function renderHeader() {
    const query = view.query.trim();
    const chapter = chapterById(view.chapter);
    if (query) {
      const count = visibleNumbers().length;
      $("#core-eyebrow").textContent = `搜索全部 ${LESSON_DATA.length} 句`;
      $("#core-title").textContent = `找到 ${count} 条`;
      $("#core-title-short").textContent = `找到 ${count} 条`;
      $("#core-desc").innerHTML = count
        ? `与「${esc(query)}」相关的表达，点任意一条查看拆解。`
        : "换一个更短的日语、假名或中文关键词试试。";
      $("#chapter-progress").hidden = true;
    } else {
      const index = CHAPTERS.indexOf(chapter);
      $("#core-eyebrow").textContent = `第 ${index + 1} 章 · ${pad2(chapter.start)}–${pad2(chapter.end)}`;
      $("#core-title").innerHTML = `${esc(chapter.title)}<span class="ja-sub" lang="ja">${esc(chapter.kana)}</span>`;
      $("#core-title-short").textContent = chapter.title;
      $("#core-desc").innerHTML = chapter.descriptionHtml;
      $("#chapter-progress").hidden = false;
      renderChapterProgress();
    }
  }

  function renderPager() {
    if (searchQuery()) {
      pager.hidden = true;
      return;
    }
    const index = CHAPTERS.findIndex((chapter) => chapter.id === view.chapter);
    const previous = CHAPTERS[index - 1];
    const next = CHAPTERS[index + 1];
    pager.hidden = false;
    pager.innerHTML = `${previous ? `<button class="btn btn-quiet" type="button" data-chapter="${previous.id}">${ICON.left}<span>${esc(previous.title)}</span></button>` : "<span></span>"}${next ? `<button class="btn" type="button" data-chapter="${next.id}"><span>下一章：${esc(next.title)}</span>${ICON.right}</button>` : ""}`;
  }

  function renderList() {
    const query = searchQuery();
    let visibleCount = 0;
    lists.forEach((list) => {
      const id = list.dataset.chapterList;
      let matches = 0;
      list.querySelectorAll(".phrase-row").forEach((row) => {
        const match = !query || row.dataset.search.includes(query);
        row.parentElement.hidden = !match;
        if (match) matches += 1;
      });
      const show = query ? matches > 0 : id === view.chapter;
      list.hidden = !show;
      groupLabelById.get(id).hidden = !(query && matches > 0);
      if (show) visibleCount += matches;
    });
    emptyState.hidden = visibleCount > 0;
    searchClear.hidden = !query;
    searchKbd.hidden = Boolean(query);
    renderPager();
  }

  function renderRowStates() {
    rows.forEach((row) => {
      const mastered = isMastered(row.dataset.lesson);
      row.classList.toggle("is-mastered", mastered);
      row.querySelector(".row-status").textContent = mastered ? "已掌握" : "未掌握";
    });
  }

  function renderSidebar() {
    let total = 0;
    CHAPTERS.forEach((chapter) => {
      const numbers = chapterNumbers(chapter);
      const done = numbers.filter(isMastered).length;
      total += done;
      $$(`[data-chapter-meta="${chapter.id}"]`).forEach((meta) => {
        meta.textContent = done === numbers.length ? "✓ 完成" : `${done}/${numbers.length}`;
        meta.classList.toggle("done", done === numbers.length);
      });
    });
    $("#side-summary").textContent = `已掌握 ${total}/${LESSON_DATA.length}`;
    $$(".side-item[data-chapter]").forEach((item) => {
      item.setAttribute("aria-current", String(!searchQuery() && item.dataset.chapter === view.chapter));
    });
  }

  function lessonTemplateHtml(number) {
    return document.getElementById(`lesson-tpl-${pad2(number)}`)?.innerHTML || "";
  }

  function detailTools(number) {
    const mastered = isMastered(number);
    return `<div class="detail-tools">
      <button class="icon-btn" type="button" data-action="speak-lesson" aria-label="朗读" title="朗读（空格）">${ICON.speaker}</button>
      <button class="master-btn" type="button" data-action="toggle-master" aria-pressed="${mastered}" title="快捷键 M">${ICON.check}<span>${mastered ? "已掌握" : "标为已掌握"}</span></button>
    </div>`;
  }

  function detailNav(number) {
    const list = visibleNumbers();
    const index = list.indexOf(number);
    return `<footer class="detail-nav">
      <button class="btn btn-quiet" type="button" data-action="prev-lesson"${index <= 0 ? " disabled" : ""}>${ICON.left}上一句</button>
      <span class="hint"><span class="kbd">↑</span><span class="kbd">↓</span> 切换 · <span class="kbd">空格</span> 朗读 · <span class="kbd">M</span> 掌握</span>
      <button class="btn btn-quiet" type="button" data-action="next-lesson"${index < 0 || index >= list.length - 1 ? " disabled" : ""}>下一句${ICON.right}</button>
    </footer>`;
  }

  function renderSheet() {
    const number = view.selected;
    sheet.innerHTML = `<div class="sheet-head">
        <button class="icon-btn" type="button" data-action="close-sheet" aria-label="返回列表">${ICON.down}</button>
        <span class="detail-no">第 ${pad2(number)} 句</span>
        ${detailTools(number)}
      </div>
      <div class="detail-scroll">${lessonTemplateHtml(number)}</div>
      ${detailNav(number)}`;
  }

  function renderDetail() {
    const number = view.selected;
    if (!lessonByNumber.has(String(number))) {
      detailPane.innerHTML = "";
      return;
    }
    detailPane.innerHTML = `<div class="detail-scroll fade-in">
        <div class="detail-top"><span class="detail-no">第 ${pad2(number)} 句 · ${esc(chapterOf(number).title)}</span>${detailTools(number)}</div>
        ${lessonTemplateHtml(number)}
      </div>
      ${detailNav(number)}`;
    if (view.sheetOpen) renderSheet();
  }

  function updateMasterButtons() {
    const mastered = isMastered(view.selected);
    $$('[data-action="toggle-master"]').forEach((button) => {
      button.setAttribute("aria-pressed", String(mastered));
      button.querySelector("span").textContent = mastered ? "已掌握" : "标为已掌握";
    });
  }

  function renderProgress() {
    rebuildLearnedSet();
    renderRowStates();
    renderSidebar();
    if (!searchQuery()) renderChapterProgress();
    updateMasterButtons();
    renderQuizStats();
  }

  // 手机详情页进历史记录，系统返回手势会先关掉详情，而不是离开页面
  function openSheet() {
    view.sheetOpen = true;
    renderSheet();
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (!history.state?.lessonSheet) history.pushState({ lessonSheet: true }, "");
  }

  function closeSheet({ fromHistory = false } = {}) {
    if (!view.sheetOpen) return;
    view.sheetOpen = false;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (!fromHistory && history.state?.lessonSheet) history.back();
  }

  function selectLesson(number, { reveal = "nearest", fromUser = false } = {}) {
    if (!lessonByNumber.has(String(number))) return;
    view.selected = number;
    rows.forEach((row) => row.setAttribute("aria-current", String(Number(row.dataset.lesson) === number)));
    renderDetail();
    savePrefs("core", { selected: number });
    if (reveal && !isNarrow()) rowByNumber.get(number)?.scrollIntoView({ block: reveal });
    if (fromUser && isNarrow()) openSheet();
  }

  function stepLesson(delta) {
    const list = visibleNumbers();
    if (!list.length) return;
    const index = list.indexOf(view.selected);
    const next = list[Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index + delta)))];
    if (next === undefined || next === view.selected) return;
    const focusRow = document.activeElement?.classList?.contains("phrase-row");
    selectLesson(next);
    if (focusRow) rowByNumber.get(next)?.focus({ preventScroll: true });
  }

  function setChapter(id) {
    view.chapter = chapterById(id).id;
    view.query = "";
    searchInput.value = "";
    renderHeader();
    renderList();
    renderSidebar();
    listScroll.scrollTop = 0;
    const numbers = chapterNumbers(chapterById(view.chapter));
    selectLesson(numbers.find((number) => !isMastered(number)) ?? numbers[0]);
    if (isNarrow()) KotobaUI.scrollToTop();
  }

  function applySearch() {
    view.query = searchInput.value;
    renderHeader();
    renderList();
    renderSidebar();
    listScroll.scrollTop = 0;
    const visible = visibleNumbers();
    if (visible.length && !visible.includes(view.selected)) selectLesson(visible[0], { reveal: false });
    else renderDetail();
  }

  function clearSearch() {
    if (!view.query) return;
    view.chapter = chapterOf(view.selected).id;
    view.query = "";
    searchInput.value = "";
    renderHeader();
    renderList();
    renderSidebar();
    selectLesson(view.selected, { reveal: "center" });
  }

  function openPicker() {
    $("#picker-title").textContent = "选择章节";
    $("#picker-list").innerHTML = sideItems.map((item) => item.outerHTML).join("");
    openDialog(picker);
  }

  function toggleMastery(number = view.selected) {
    if (!lessonByNumber.has(String(number))) return;
    const next = !isMastered(number);
    state.mastery[String(Number(number))] = { mastered: next, updatedAt: new Date().toISOString() };
    localChangeVersion += 1;
    rebuildLearnedSet();
    saveState();
    renderRowStates();
    renderSidebar();
    if (!searchQuery()) renderChapterProgress();
    updateMasterButtons();
    queueSync();
    toast(next ? `第 ${pad2(number)} 句已标为掌握` : `已取消第 ${pad2(number)} 句的掌握标记`);
  }

  const speakSelected = () => {
    const lesson = lessonByNumber.get(String(view.selected));
    if (lesson) speak(lesson.japanese);
  };

  /* ============================================================
     跨设备同步（接口与旧版一致）
     ============================================================ */
  function setSyncStatus(kind, label, message) {
    syncTrigger.dataset.state = kind;
    syncDot.dataset.state = kind;
    syncLabel.textContent = label;
    syncTrigger.title = message || "点击立即同步";
    syncTrigger.setAttribute("aria-label", `${label}。${kind === "locked" ? "点击输入访问密钥" : "点击立即同步"}`);
  }

  function readableSyncError(error) {
    if (!navigator.onLine) return "当前离线，记录已保存在本机，联网后会继续同步。";
    return error && error.message ? `同步未完成：${error.message}` : "同步未完成，请稍后再试。";
  }

  function mergeRemoteProgress(payload) {
    const lessons = Array.isArray(payload && payload.lessons) ? payload.lessons : [];
    lessons.forEach((remote) => {
      const key = String(Number(remote.lessonNumber));
      if (!lessonByNumber.has(key)) return;
      const localMastery = state.mastery[key];
      const remoteUpdatedAt = remote.masteredUpdatedAt || "1970-01-01T00:00:00.000Z";
      if (!localMastery || remoteUpdatedAt >= localMastery.updatedAt) {
        state.mastery[key] = { mastered: Boolean(remote.mastered), updatedAt: remoteUpdatedAt };
      }
      state.stats[key] = {
        attempts: Number(remote.attempts) || 0,
        correctCount: Number(remote.correctCount) || 0,
        lastReviewedAt: remote.lastReviewedAt || null,
      };
    });
  }

  async function syncNow(options = {}) {
    if (syncInFlight) return syncInFlight;
    const sentEventIds = new Set(state.pendingEvents.map((event) => event.id));
    const sentChangeVersion = localChangeVersion;
    setSyncStatus("syncing", "同步中", "正在合并这台设备与网站上的学习记录…");

    syncInFlight = (async () => {
      try {
        const response = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masteryUpdates: Object.entries(state.mastery).map((entry) => ({
              lessonNumber: Number(entry[0]),
              mastered: Boolean(entry[1].mastered),
              updatedAt: entry[1].updatedAt,
            })),
            reviewEvents: state.pendingEvents,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
          needsAccess = true;
          setSyncStatus("locked", "未登录", "输入访问密钥后，掌握记录和小测试成绩才能在 Mac 和 iPhone 之间同步");
          return null;
        }
        if (!response.ok) throw new Error(payload.error || payload.message || `服务器返回 ${response.status}`);
        needsAccess = false;
        mergeRemoteProgress(payload);
        state.pendingEvents = state.pendingEvents.filter((event) => !sentEventIds.has(event.id));
        rebuildLearnedSet();
        saveState();
        renderProgress();
        const time = new Date(payload.syncedAt || Date.now()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        setSyncStatus("synced", "已同步", `已在 ${time} 合并手机和电脑记录。`);
        return payload;
      } catch (error) {
        setSyncStatus("error", "待同步", readableSyncError(error));
        if (options.rethrow) throw error;
        return null;
      } finally {
        syncInFlight = null;
        if (localChangeVersion !== sentChangeVersion) queueSync(250);
      }
    })();
    return syncInFlight;
  }

  function queueSync(delay = 900) {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => syncNow(), delay);
  }

  /* ============================================================
     小测试
     ============================================================ */
  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function quizPool(scope) {
    if (scope === "chapter") return LESSON_DATA.filter((lesson) => lesson.chapter === view.chapter);
    if (scope === "open") {
      const open = LESSON_DATA.filter((lesson) => !isMastered(lesson.number));
      return open.length ? open : LESSON_DATA;
    }
    return LESSON_DATA;
  }

  // 优先抽练习次数少的句子
  function selectQuizLessons(candidates) {
    const ranked = candidates
      .map((lesson) => ({ lesson, attempts: Number(state.stats[String(lesson.number)]?.attempts) || 0, random: Math.random() }))
      .sort((a, b) => a.attempts - b.attempts || a.random - b.random);
    const poolSize = Math.min(Math.max(10, Math.ceil(candidates.length / 3)), candidates.length);
    const pool = ranked.slice(0, poolSize).map((item) => item.lesson);
    const selected = shuffle(pool).slice(0, Math.min(10, pool.length));
    while (selected.length < 10 && selected.length < candidates.length) {
      const next = shuffle(candidates).find((candidate) => !selected.some((item) => item.number === candidate.number));
      if (!next) break;
      selected.push(next);
    }
    return selected;
  }

  function normalizeKana(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[\s　、。,.!?！？「」『』・]/g, "")
      .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
  }

  function makeMeaningChoices(lesson) {
    const sameChapter = LESSON_DATA.filter((candidate) => candidate.number !== lesson.number && candidate.chapter === lesson.chapter && candidate.chinese !== lesson.chinese);
    const others = LESSON_DATA.filter((candidate) => candidate.number !== lesson.number && candidate.chapter !== lesson.chapter && candidate.chinese !== lesson.chinese);
    const distractors = [];
    [...shuffle(sameChapter), ...shuffle(others)].forEach((candidate) => {
      if (distractors.length < 3 && !distractors.some((item) => item.chinese === candidate.chinese)) distractors.push(candidate);
    });
    return shuffle([lesson, ...distractors]);
  }

  function eventId() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "_");
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function recordReview(question, correct) {
    const key = String(question.lesson.number);
    const createdAt = new Date().toISOString();
    const current = state.stats[key] || { attempts: 0, correctCount: 0, lastReviewedAt: null };
    state.stats[key] = {
      attempts: (Number(current.attempts) || 0) + 1,
      correctCount: (Number(current.correctCount) || 0) + (correct ? 1 : 0),
      lastReviewedAt: createdAt,
    };
    state.pendingEvents.push({ id: eventId(), lessonNumber: question.lesson.number, mode: question.mode, correct, createdAt });
    state.pendingEvents = state.pendingEvents.slice(-200);
    localChangeVersion += 1;
    saveState();
    renderQuizStats();
    queueSync(350);
  }

  function renderQuizStats() {
    const totals = aggregateStats();
    const accuracy = totals.attempts ? Math.round((totals.correct / totals.attempts) * 100) : 0;
    quizTotalStats.textContent = totals.attempts ? `累计 ${totals.attempts} 题 · 正确率 ${accuracy}%` : "每轮 10 题，答题记录会同步";
  }

  function renderQuizOptions() {
    $$("[data-quiz-scope]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.quizScope === quiz.scope)));
    $$("[data-quiz-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.quizMode === quiz.mode)));
  }

  function setQuizView(name) {
    quizSetup.hidden = name !== "setup";
    quizQuestion.hidden = name !== "question";
    quizSummary.hidden = name !== "summary";
  }

  function openQuiz() {
    const chapter = chapterById(view.chapter);
    const open = LESSON_DATA.filter((lesson) => !isMastered(lesson.number)).length;
    $("#scope-chapter-note").textContent = `${chapter.title} · ${chapter.end - chapter.start + 1} 句`;
    $("#scope-open-note").textContent = open ? `全书还有 ${open} 句` : "都已掌握，将从全部出题";
    renderQuizOptions();
    renderQuizStats();
    setQuizView("setup");
    openDialog(quizDialog);
  }

  function startQuiz() {
    quiz.items = selectQuizLessons(quizPool(quiz.scope)).map((lesson, index) => ({
      lesson,
      mode: quiz.mode === "mixed" ? (index % 2 === 0 ? "kana-input" : "meaning-choice") : quiz.mode,
    }));
    quiz.index = 0;
    quiz.correct = 0;
    quiz.feedback = null;
    quiz.choices = null;
    savePrefs("core", { quizScope: quiz.scope, quizMode: quiz.mode });
    if (!quiz.items.length) return;
    setQuizView("question");
    renderQuestion();
  }

  function renderQuestion() {
    const item = quiz.items[quiz.index];
    const lesson = item.lesson;
    const feedback = quiz.feedback;
    const top = `<div class="quiz-top"><span>第 ${quiz.index + 1} / ${quiz.items.length} 题</span><div class="bar"><span style="width:${(quiz.index / quiz.items.length) * 100}%"></span></div><span>答对 ${quiz.correct}</span></div>`;
    const result = feedback ? `<div class="feedback ${feedback.correct ? "ok" : "bad"}">
        <div class="feedback-head">${feedback.correct ? ICON.check : ICON.wrong}${feedback.correct ? "答对了" : "再看一遍，下次就会了"}</div>
        <div class="feedback-answer"><span class="std" lang="ja">${esc(lesson.reading)}</span><button class="icon-btn" type="button" data-action="quiz-speak" aria-label="朗读">${ICON.speaker}</button></div>
        <p class="feedback-mine">${esc(lesson.chinese)}${feedback.submitted ? ` · 你的答案：<span lang="ja">${esc(feedback.submitted)}</span>` : ""}</p>
      </div>
      <div class="modal-foot"><span class="muted kbd-hint"><span class="kbd">Enter</span> 继续</span><button class="btn btn-primary" type="button" id="next-question" data-action="quiz-next">${quiz.index === quiz.items.length - 1 ? "查看成绩" : "下一题"}</button></div>` : "";

    if (item.mode === "kana-input") {
      quizQuestion.innerHTML = `${top}<p class="field-label">写出这句话的假名读音</p><p class="quiz-prompt" lang="ja">${esc(lesson.japanese)}</p>
        <form class="answer-row" id="kana-answer-form">
          <input class="answer-input${feedback ? (feedback.correct ? " is-correct" : " is-wrong") : ""}" id="kana-answer" lang="ja" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="输入平假名或片假名" aria-label="你的答案"${feedback ? ` readonly value="${esc(feedback.submitted)}"` : ""}>
          ${feedback ? "" : '<button class="btn btn-primary btn-lg" type="submit">确认</button>'}
        </form>${result}`;
      if (!feedback) setTimeout(() => $("#kana-answer")?.focus(), 60);
    } else {
      quiz.choices = quiz.choices || makeMeaningChoices(lesson);
      const choices = quiz.choices.map((choice, index) => {
        const status = feedback ? (choice.number === lesson.number ? " is-right" : choice.number === feedback.pick ? " is-wrong" : "") : "";
        return `<button class="choice${status}" type="button" data-quiz-pick="${choice.number}"${feedback ? " disabled" : ""}><span class="kbd">${index + 1}</span><span>${esc(choice.chinese)}</span></button>`;
      }).join("");
      quizQuestion.innerHTML = `${top}<p class="field-label">选择这句话的中文意思</p><p class="quiz-prompt" lang="ja">${esc(lesson.reading)}</p><div class="choices">${choices}</div>${result}`;
    }
    if (feedback) setTimeout(() => $("#next-question")?.focus(), 60);
  }

  function finishAnswer(correct, extra = {}) {
    if (quiz.feedback) return;
    if (correct) quiz.correct += 1;
    quiz.feedback = { correct, ...extra };
    recordReview(quiz.items[quiz.index], correct);
    renderQuestion();
  }

  function nextQuestion() {
    if (!quiz.feedback) return;
    if (quiz.index >= quiz.items.length - 1) {
      finishQuiz();
      return;
    }
    quiz.index += 1;
    quiz.feedback = null;
    quiz.choices = null;
    renderQuestion();
  }

  function finishQuiz() {
    const rate = quiz.items.length ? quiz.correct / quiz.items.length : 0;
    const message = rate >= 0.9
      ? "非常稳！这组表达已经开始变成你的直觉了。"
      : rate >= 0.7
        ? "掌握得不错，再练一轮会更牢。"
        : "先别急，错题已经记入复习记录，下次会优先遇见薄弱内容。";
    quizSummary.innerHTML = `<div class="quiz-result"><p>本轮成绩</p><b>${quiz.correct} / ${quiz.items.length}</b><p>${message}</p></div>
      <div class="modal-foot"><button class="btn" type="button" data-action="close-dialog">完成</button><button class="btn btn-primary btn-lg" type="button" data-action="quiz-restart">再练 10 题</button></div>`;
    setQuizView("summary");
  }

  /* ============================================================
     事件
     ============================================================ */
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-action]");
    if (!target) return;
    const { dataset } = target;
    if (dataset.chapter) {
      if (target.closest("#picker")) closeDialog(picker);
      setChapter(dataset.chapter);
      return;
    }
    if (dataset.lesson) {
      selectLesson(Number(dataset.lesson), { reveal: false, fromUser: true });
      return;
    }
    if (dataset.quizScope) {
      quiz.scope = dataset.quizScope;
      renderQuizOptions();
      return;
    }
    if (dataset.quizMode) {
      quiz.mode = dataset.quizMode;
      renderQuizOptions();
      return;
    }
    if (dataset.quizPick) {
      const pick = Number(dataset.quizPick);
      finishAnswer(pick === quiz.items[quiz.index].lesson.number, { pick });
      return;
    }
    switch (dataset.action) {
      case "picker": openPicker(); break;
      case "speak-lesson": speakSelected(); break;
      case "toggle-master": toggleMastery(); break;
      case "prev-lesson": stepLesson(-1); break;
      case "next-lesson": stepLesson(1); break;
      case "close-sheet": closeSheet(); break;
      case "quiz-next": nextQuestion(); break;
      case "quiz-restart": startQuiz(); break;
      case "quiz-speak": speak(quiz.items[quiz.index].lesson.japanese); break;
      default: break;
    }
  });

  quizQuestion.addEventListener("submit", (event) => {
    event.preventDefault();
    if (quiz.feedback) return;
    const input = $("#kana-answer");
    const submitted = input.value.trim();
    if (!submitted) {
      input.focus();
      return;
    }
    finishAnswer(normalizeKana(submitted) === normalizeKana(quiz.items[quiz.index].lesson.reading), { submitted });
  });

  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (quizDialog.open) {
      if (quizQuestion.hidden) return;
      if (event.key === "Enter" && quiz.feedback) {
        event.preventDefault();
        nextQuestion();
      } else if (!quiz.feedback && /^[1-4]$/.test(event.key) && !isTyping(event.target)) {
        $$(".choice", quizQuestion)[Number(event.key) - 1]?.click();
      }
      return;
    }
    if (document.querySelector("dialog[open]")) return;
    const typing = isTyping(event.target);
    if (event.key === "Escape") {
      if (view.sheetOpen) closeSheet();
      else if (view.query) clearSearch();
      else if (typing) event.target.blur();
      return;
    }
    if (typing) {
      if (event.target === searchInput && (event.key === "ArrowDown" || event.key === "Enter")) {
        event.preventDefault();
        const first = visibleNumbers()[0];
        if (first !== undefined) {
          searchInput.blur();
          selectLesson(first);
        }
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "j") {
      event.preventDefault();
      stepLesson(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "k") {
      event.preventDefault();
      stepLesson(-1);
    } else if (event.key === " " && (event.target === document.body || event.target.closest(".phrase-row, .phrase-detail, .detail-sheet"))) {
      event.preventDefault();
      speakSelected();
    } else if (event.key === "m" || event.key === "M") {
      toggleMastery();
    }
  });

  searchInput.addEventListener("input", applySearch);
  searchClear.addEventListener("click", () => {
    clearSearch();
    searchInput.focus();
  });
  $("#random-review").addEventListener("click", openQuiz);
  $("#quiz-start").addEventListener("click", startQuiz);
  syncTrigger.addEventListener("click", () => {
    if (needsAccess) KotobaUI.requestAccess({ onSuccess: () => syncNow() });
    else syncNow();
  });
  window.addEventListener("online", () => syncNow());
  window.addEventListener("popstate", () => closeSheet({ fromHistory: true }));
  window.addEventListener("resize", () => {
    if (!isNarrow() && view.sheetOpen) closeSheet();
  });

  // 打印时生成完整教材
  window.addEventListener("beforeprint", () => {
    $("#print-book").innerHTML = CHAPTERS.map((chapter, index) => `<h2>第 ${index + 1} 章 · ${esc(chapter.title)}</h2>${chapterNumbers(chapter)
      .map((number) => `<article class="print-lesson">${lessonTemplateHtml(number)}</article>`)
      .join("")}`).join("");
  });
  window.addEventListener("afterprint", () => {
    $("#print-book").innerHTML = "";
  });

  /* ============================================================
     启动：回到上次看到的句子
     ============================================================ */
  normalizeMasteryKeys();
  rebuildLearnedSet();
  saveState();

  const savedPrefs = prefs("core");
  if (["chapter", "open", "all"].includes(savedPrefs.quizScope)) quiz.scope = savedPrefs.quizScope;
  if (["mixed", "kana-input", "meaning-choice"].includes(savedPrefs.quizMode)) quiz.mode = savedPrefs.quizMode;

  function initialLesson() {
    const hash = location.hash.match(/^#lesson-(\d{1,3})$/);
    if (hash && lessonByNumber.has(String(Number(hash[1])))) return Number(hash[1]);
    const saved = Number(savedPrefs.selected);
    if (lessonByNumber.has(String(saved))) return saved;
    return (LESSON_DATA.find((lesson) => !isMastered(lesson.number)) || LESSON_DATA[0]).number;
  }

  const firstLesson = initialLesson();
  view.chapter = chapterOf(firstLesson).id;
  renderHeader();
  renderList();
  renderRowStates();
  renderSidebar();
  renderQuizStats();
  selectLesson(firstLesson, { reveal: "center" });
  if (document.fonts && document.fonts.status !== "loaded") {
    document.fonts.ready.then(() => {
      if (!isNarrow()) rowByNumber.get(view.selected)?.scrollIntoView({ block: "center" });
    });
  }

  KotobaUI.init();
  setSyncStatus("syncing", "同步中", "正在读取网站上的学习记录…");
  window.addEventListener("load", () => syncNow(), { once: true });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/japanese/sw.js", {
        scope: "/japanese",
        updateViaCache: "none",
      }).catch(() => {
        // The online textbook remains fully usable if offline caching is unavailable.
      });
    }, { once: true });
  }
})();
