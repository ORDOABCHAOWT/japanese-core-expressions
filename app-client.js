(() => {
  const LEGACY_STORAGE_KEY = "nihongo-core-86-learned";
  const STATE_STORAGE_KEY = "nihongo-core-86-state-v2";
  const SYNC_ENDPOINT = "/japanese/api/progress";
  const LESSON_DATA = Array.isArray(window.__LESSON_DATA__) ? window.__LESSON_DATA__ : [];
  const lessonByNumber = new Map(LESSON_DATA.map((lesson) => [String(lesson.number), lesson]));
  const lessonShells = [...document.querySelectorAll(".lesson-shell")];
  const chapterSections = [...document.querySelectorAll("[data-chapter-section]")];
  const chapterLessons = new Map(
    chapterSections.map((section) => [section, [...section.querySelectorAll(".lesson-shell")]]),
  );
  const filters = [...document.querySelectorAll(".chapter-filter")];
  const searchInput = document.querySelector("#lesson-search");
  const searchStatus = document.querySelector("#search-status");
  const emptyState = document.querySelector("#empty-state");
  const learnedCount = document.querySelector("#learned-count");
  const progressRing = document.querySelector("#progress-ring");
  const expandToggle = document.querySelector("#expand-toggle");
  const quizTrigger = document.querySelector("#random-review");
  const syncTrigger = document.querySelector("#sync-trigger");
  const syncLabel = document.querySelector("#sync-label");
  const syncDot = document.querySelector("#sync-dot");
  const quizDialog = document.querySelector("#quiz-dialog");
  const quizSetup = document.querySelector("#quiz-setup");
  const quizQuestion = document.querySelector("#quiz-question");
  const quizSummary = document.querySelector("#quiz-summary");
  const quizTotalStats = document.querySelector("#quiz-total-stats");
  const quizCounter = document.querySelector("#quiz-counter");
  const quizScore = document.querySelector("#quiz-score");
  const quizModeLabel = document.querySelector("#quiz-mode-label");
  const quizPromptLabel = document.querySelector("#quiz-prompt-label");
  const quizPrompt = document.querySelector("#quiz-prompt");
  const kanaAnswerForm = document.querySelector("#kana-answer-form");
  const kanaAnswer = document.querySelector("#kana-answer");
  const meaningChoices = document.querySelector("#meaning-choices");
  const quizFeedback = document.querySelector("#quiz-feedback");
  const nextQuestionButton = document.querySelector("#next-question");
  const summaryScore = document.querySelector("#summary-score");
  const summaryMessage = document.querySelector("#summary-message");

  let activeFilter = "all";
  let learned = new Set();
  let syncInFlight = null;
  let syncTimer = null;
  let filterFrame = 0;
  let localChangeVersion = 0;
  let quizMode = "mixed";
  let quizItems = [];
  let quizIndex = 0;
  let quizCorrect = 0;
  let currentQuestion = null;
  let currentAnswered = false;

  function emptyStateObject() {
    return { mastery: {}, stats: {}, pendingEvents: [] };
  }

  function loadState() {
    let loaded = emptyStateObject();
    try {
      const candidate = JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || "null");
      if (candidate && typeof candidate === "object") {
        loaded.mastery = candidate.mastery && typeof candidate.mastery === "object"
          ? candidate.mastery
          : {};
        loaded.stats = candidate.stats && typeof candidate.stats === "object"
          ? candidate.stats
          : {};
        loaded.pendingEvents = Array.isArray(candidate.pendingEvents)
          ? candidate.pendingEvents.slice(-200)
          : [];
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
            const key = String(number);
            if (lessonByNumber.has(key)) {
              loaded.mastery[key] = { mastered: true, updatedAt: migratedAt };
            }
          });
        }
      } catch {
        // Ignore invalid legacy data.
      }
    }
    return loaded;
  }

  let state = loadState();

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

  function updateLessonProgress(shell, isLearned) {
    const number = shell.dataset.number;
    const button = shell.querySelector("[data-learn]");
    shell.classList.toggle("is-learned", isLearned);
    button.setAttribute("aria-pressed", String(isLearned));
    button.setAttribute(
      "aria-label",
      isLearned
        ? "取消第 " + Number(number) + " 句的已掌握标记"
        : "标记第 " + Number(number) + " 句为已掌握",
    );
    button.querySelector(".learn-label").textContent = isLearned ? "已掌握" : "标为已掌握";
  }

  function renderProgressSummary() {
    const count = learned.size;
    learnedCount.textContent = String(count);
    const degrees = Math.round((count / Math.max(lessonShells.length, 1)) * 360);
    progressRing.style.setProperty("--progress", degrees + "deg");

    const totals = aggregateStats();
    const accuracy = totals.attempts ? Math.round((totals.correct / totals.attempts) * 100) : 0;
    quizTotalStats.textContent = totals.attempts
      ? "已练习 " + totals.attempts + " 题 · 正确率 " + accuracy + "%"
      : "还没有测试记录，先从 10 题开始吧。";
  }

  function renderProgress() {
    rebuildLearnedSet();
    lessonShells.forEach((shell) => updateLessonProgress(shell, learned.has(shell.dataset.number)));
    renderProgressSummary();
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    lessonShells.forEach((shell) => {
      const matchesChapter = activeFilter === "all" || shell.dataset.chapter === activeFilter;
      const matchesSearch = !query || shell.dataset.search.includes(query);
      const visible = matchesChapter && matchesSearch;
      shell.classList.toggle("is-hidden", !visible);
      if (visible) visibleCount += 1;
    });

    chapterSections.forEach((section) => {
      const hasVisibleLesson = chapterLessons.get(section).some(
        (shell) => !shell.classList.contains("is-hidden"),
      );
      section.hidden = !hasVisibleLesson;
    });

    emptyState.classList.toggle("is-visible", visibleCount === 0);
    searchStatus.textContent = query || activeFilter !== "all"
      ? "找到 " + visibleCount + " 条表达 · 小测试将从这些内容中出题"
      : "显示全部 86 条表达";
  }

  function scheduleFilters() {
    window.cancelAnimationFrame(filterFrame);
    filterFrame = window.requestAnimationFrame(() => {
      filterFrame = 0;
      applyFilters();
    });
  }

  function setSyncStatus(kind, label, message) {
    syncTrigger.dataset.state = kind;
    syncDot.dataset.state = kind;
    syncLabel.textContent = label;
    syncTrigger.title = message || "点击立即同步";
    syncTrigger.setAttribute("aria-label", label + "。点击立即同步");
  }

  function readableSyncError(error) {
    if (!navigator.onLine) return "当前离线，记录已保存在本机，联网后会继续同步。";
    return error && error.message
      ? "同步未完成：" + error.message
      : "同步未完成，请稍后再试。";
  }

  function mergeRemoteProgress(payload) {
    const lessons = Array.isArray(payload && payload.lessons) ? payload.lessons : [];
    lessons.forEach((remote) => {
      const key = String(remote.lessonNumber);
      if (!lessonByNumber.has(key)) return;
      const localMastery = state.mastery[key];
      const remoteUpdatedAt = remote.masteredUpdatedAt || "1970-01-01T00:00:00.000Z";
      if (!localMastery || remoteUpdatedAt >= localMastery.updatedAt) {
        state.mastery[key] = {
          mastered: Boolean(remote.mastered),
          updatedAt: remoteUpdatedAt,
        };
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
          headers: {
            "Content-Type": "application/json",
          },
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
        if (!response.ok) {
          throw new Error(payload.error || payload.message || "服务器返回 " + response.status);
        }
        mergeRemoteProgress(payload);
        state.pendingEvents = state.pendingEvents.filter((event) => !sentEventIds.has(event.id));
        saveState();
        renderProgress();
        const time = new Date(payload.syncedAt || Date.now()).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        setSyncStatus("synced", "已同步", "已在 " + time + " 合并手机和电脑记录。");
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

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function visibleLessons() {
    const numbers = new Set(
      lessonShells
        .filter((shell) => !shell.classList.contains("is-hidden"))
        .map((shell) => Number(shell.dataset.number)),
    );
    return LESSON_DATA.filter((lesson) => numbers.has(lesson.number));
  }

  function selectQuizLessons() {
    const source = visibleLessons();
    const candidates = source.length ? source : LESSON_DATA;
    const ranked = candidates
      .map((lesson) => ({
        lesson,
        attempts: Number(state.stats[String(lesson.number)]?.attempts) || 0,
        random: Math.random(),
      }))
      .sort((a, b) => a.attempts - b.attempts || a.random - b.random);
    const poolSize = Math.min(Math.max(10, Math.ceil(candidates.length / 3)), candidates.length);
    const pool = ranked.slice(0, poolSize).map((item) => item.lesson);
    const selected = shuffle(pool).slice(0, Math.min(10, pool.length));
    while (selected.length < 10 && selected.length < candidates.length) {
      const next = shuffle(candidates).find(
        (candidate) => !selected.some((item) => item.number === candidate.number),
      );
      if (!next) break;
      selected.push(next);
    }
    return selected;
  }

  function makeQuizItems(mode) {
    return selectQuizLessons().map((lesson, index) => ({
      lesson,
      mode: mode === "mixed"
        ? (index % 2 === 0 ? "kana-input" : "meaning-choice")
        : mode,
    }));
  }

  function normalizeKana(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/[\s　、。,.!?！？「」『』・]/g, "")
      .replace(/[\u30a1-\u30f6]/g, (character) =>
        String.fromCharCode(character.charCodeAt(0) - 0x60));
  }

  function makeMeaningChoices(lesson) {
    const sameChapter = LESSON_DATA.filter(
      (candidate) =>
        candidate.number !== lesson.number
        && candidate.chapter === lesson.chapter
        && candidate.chinese !== lesson.chinese,
    );
    const others = LESSON_DATA.filter(
      (candidate) =>
        candidate.number !== lesson.number
        && candidate.chapter !== lesson.chapter
        && candidate.chinese !== lesson.chinese,
    );
    const distractors = [];
    [...shuffle(sameChapter), ...shuffle(others)].forEach((candidate) => {
      if (
        distractors.length < 3
        && !distractors.some((item) => item.chinese === candidate.chinese)
      ) {
        distractors.push(candidate);
      }
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
    state.pendingEvents.push({
      id: eventId(),
      lessonNumber: question.lesson.number,
      mode: question.mode,
      correct,
      createdAt,
    });
    state.pendingEvents = state.pendingEvents.slice(-200);
    localChangeVersion += 1;
    saveState();
    renderProgress();
    queueSync(350);
  }

  function setQuizView(view) {
    quizSetup.hidden = view !== "setup";
    quizQuestion.hidden = view !== "question";
    quizSummary.hidden = view !== "summary";
  }

  function renderMeaningChoices(question) {
    meaningChoices.replaceChildren();
    makeMeaningChoices(question.lesson).forEach((lesson, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meaning-choice";
      button.dataset.correct = String(lesson.number === question.lesson.number);
      const indexLabel = document.createElement("span");
      indexLabel.className = "choice-index";
      indexLabel.textContent = String.fromCharCode(65 + index);
      const text = document.createElement("span");
      text.textContent = lesson.chinese;
      button.append(indexLabel, text);
      button.addEventListener("click", () => {
        if (currentAnswered) return;
        const isCorrect = button.dataset.correct === "true";
        meaningChoices.querySelectorAll(".meaning-choice").forEach((choice) => {
          choice.disabled = true;
          if (choice.dataset.correct === "true") choice.classList.add("is-correct");
        });
        if (!isCorrect) button.classList.add("is-wrong");
        finishAnswer(isCorrect, "");
      });
      meaningChoices.append(button);
    });
  }

  function renderQuestion() {
    currentQuestion = quizItems[quizIndex];
    currentAnswered = false;
    const question = currentQuestion;
    quizCounter.textContent = "第 " + (quizIndex + 1) + " / " + quizItems.length + " 题";
    quizScore.textContent = "答对 " + quizCorrect + " 题";
    quizFeedback.hidden = true;
    quizFeedback.className = "quiz-feedback";
    nextQuestionButton.hidden = true;
    kanaAnswerForm.hidden = question.mode !== "kana-input";
    meaningChoices.hidden = question.mode !== "meaning-choice";

    if (question.mode === "kana-input") {
      quizModeLabel.textContent = "假名输入";
      quizPromptLabel.textContent = "请写出这句表达的假名读音";
      quizPrompt.textContent = question.lesson.japanese;
      kanaAnswer.value = "";
      window.setTimeout(() => kanaAnswer.focus(), 80);
    } else {
      quizModeLabel.textContent = "中文选择";
      quizPromptLabel.textContent = "请选择与这段假名对应的中文释义";
      quizPrompt.textContent = question.lesson.reading;
      renderMeaningChoices(question);
    }
  }

  function finishAnswer(correct, submittedAnswer) {
    if (currentAnswered) return;
    currentAnswered = true;
    if (correct) quizCorrect += 1;
    recordReview(currentQuestion, correct);
    quizScore.textContent = "答对 " + quizCorrect + " 题";
    quizFeedback.hidden = false;
    quizFeedback.classList.add(correct ? "is-correct" : "is-wrong");

    const title = document.createElement("strong");
    title.textContent = correct ? "正解！よくできました。" : "再看一遍，下一次就会了。";
    const detail = document.createElement("p");
    detail.textContent = "正确读音：" + currentQuestion.lesson.reading
      + "　｜　中文：" + currentQuestion.lesson.chinese;
    quizFeedback.replaceChildren(title, detail);
    if (submittedAnswer && !correct) {
      const submitted = document.createElement("small");
      submitted.textContent = "你的答案：" + submittedAnswer;
      quizFeedback.append(submitted);
    }
    nextQuestionButton.hidden = false;
    nextQuestionButton.textContent = quizIndex === quizItems.length - 1 ? "查看成绩" : "下一题";
    nextQuestionButton.focus();
  }

  function finishQuiz() {
    setQuizView("summary");
    const rate = quizItems.length ? Math.round((quizCorrect / quizItems.length) * 100) : 0;
    summaryScore.textContent = quizCorrect + " / " + quizItems.length;
    summaryMessage.textContent = rate >= 90
      ? "非常稳！这组表达已经开始变成你的直觉了。"
      : rate >= 70
        ? "掌握得不错，再练一轮会更牢。"
        : "先别急，错题已经记入复习记录，下次会优先遇见薄弱内容。";
  }

  function startQuiz(mode) {
    quizMode = mode;
    quizItems = makeQuizItems(mode);
    quizIndex = 0;
    quizCorrect = 0;
    kanaAnswer.disabled = false;
    if (!quizItems.length) return;
    setQuizView("question");
    renderQuestion();
  }

  document.querySelectorAll("[data-learn]").forEach((button) => {
    button.addEventListener("click", () => {
      const number = button.dataset.learn;
      const isLearned = state.mastery[number] && state.mastery[number].mastered;
      state.mastery[number] = {
        mastered: !isLearned,
        updatedAt: new Date().toISOString(),
      };
      localChangeVersion += 1;
      rebuildLearnedSet();
      saveState();
      updateLessonProgress(button.closest(".lesson-shell"), !isLearned);
      renderProgressSummary();
      queueSync();
    });
  });

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filters.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      applyFilters();
      const firstVisible = chapterSections.find((section) => !section.hidden);
      if (firstVisible && window.matchMedia("(min-width: 901px)").matches) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        firstVisible.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  });

  searchInput.addEventListener("input", scheduleFilters);

  expandToggle.addEventListener("click", () => {
    const visibleDetails = lessonShells
      .filter((shell) => !shell.classList.contains("is-hidden"))
      .map((shell) => shell.querySelector("details"));
    const shouldOpen = visibleDetails.some((detail) => !detail.open);
    expandToggle.disabled = true;
    window.requestAnimationFrame(() => {
      visibleDetails.forEach((detail) => {
        detail.open = shouldOpen;
      });
      expandToggle.textContent = shouldOpen ? "全部折叠" : "全部展开";
      expandToggle.disabled = false;
    });
  });

  syncTrigger.addEventListener("click", () => syncNow());

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  [quizDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });

  quizTrigger.addEventListener("click", () => {
    setQuizView("setup");
    renderProgress();
    openDialog(quizDialog);
  });

  document.querySelectorAll("[data-quiz-mode]").forEach((button) => {
    button.addEventListener("click", () => startQuiz(button.dataset.quizMode));
  });

  document.querySelector("#restart-quiz").addEventListener("click", () => startQuiz(quizMode));

  kanaAnswerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentAnswered) return;
    const submitted = kanaAnswer.value.trim();
    if (!submitted) {
      kanaAnswer.focus();
      return;
    }
    const correct = normalizeKana(submitted) === normalizeKana(currentQuestion.lesson.reading);
    kanaAnswer.disabled = true;
    finishAnswer(correct, submitted);
  });

  nextQuestionButton.addEventListener("click", () => {
    kanaAnswer.disabled = false;
    if (quizIndex >= quizItems.length - 1) {
      finishQuiz();
      return;
    }
    quizIndex += 1;
    renderQuestion();
  });

  window.addEventListener("online", () => {
    syncNow();
  });

  rebuildLearnedSet();
  saveState();
  renderProgress();
  applyFilters();
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
