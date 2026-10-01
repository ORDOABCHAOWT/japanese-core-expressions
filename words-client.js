(() => {
  "use strict";

  Daily.setCards(WORD_CARDS);
  const { ICON, esc, speak, toast, openDialog, closeDialog, isTyping } = KotobaUI;
  const app = document.getElementById("app");
  const dialog = document.getElementById("words-dialog");
  const page = document.body.dataset.module === "library" ? "library" : "words";
  const BASE = WORD_CARDS.filter((item) => !Daily.isN3(item.id));
  const markOf = new Map(WORD_CATEGORIES.map((cat) => [cat.name, cat.mark]));
  const DIR_LABEL = Daily.DIRS;
  const STATUS_LABEL = { fresh: "未学", learning: "学习中", mastered: "已掌握", known: "已跳过" };
  const RESULT_LABEL = { forgot: "忘了", remember: "记得", easy: "很熟", new: "新词", known: "已跳过" };
  const WEAK_FOR_MODE = { dictation: "audio", spelling: "zh-ja" };
  const canSpeak = typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

  const SVG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
    pen: SVG('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    search: SVG('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    lock: SVG('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  };

  const state = WordsStore.init();
  const ui = {
    view: "",
    screen: new Set(),
    lib: { filter: "all", q: "", batch: false, picked: new Set() },
    practice: { stage: "setup", mode: "dictation", source: "recent", items: [], index: 0, answers: [] },
    animate: false,
  };

  /* ---------- 小部件 ---------- */
  function say(text, button) {
    if (!canSpeak) {
      toast("这个浏览器不能朗读日语");
      return;
    }
    button?.classList.add("is-playing");
    speak(text, () => button?.classList.remove("is-playing"));
  }
  const sayBtn = (text, label = "朗读") => `<button class="icon-btn" type="button" data-say="${esc(text)}" aria-label="${label}" title="${label}">${ICON.speaker}</button>`;
  const keyHint = (items) => `<p class="shortcut-hint">${items.map(([key, label]) => `<span><span class="kbd">${key}</span>${label}</span>`).join("")}</p>`;
  const bigClass = (text) => (text.length > 6 ? " long" : "");
  const rowMain = (item) => `<div class="w-row-main"><span class="w-row-word" lang="ja">${esc(item.writing)}</span>${item.writing !== item.kana ? `<span class="w-row-kana" lang="ja">${esc(item.kana)}</span>` : ""}<span class="w-row-meaning">${esc(item.meaning)}</span></div>`;
  const groups = (cards) => WORD_CATEGORIES.map((cat) => [cat.name, cards.filter((item) => item.category === cat.name)]).filter(([, list]) => list.length);
  const quota = () => Daily.NEW_PER_DAY[state.settings.rounds];

  function shortDay(day) {
    const offset = day - state.day;
    if (offset === 1) return "明天";
    if (offset === 2) return "后天";
    return Daily.weekdayLabel(day);
  }

  function commit() {
    WordsStore.commit();
  }

  /* ---------- 视图切换：子页面进历史，返回手势回到上一级 ---------- */
  function baseView() {
    if (page === "library") return "library";
    return state.settings.onboarded ? "home" : "welcome";
  }

  function show(view) {
    ui.view = view;
    render();
    window.scrollTo(0, 0);
    document.querySelector(".main")?.scrollTo?.(0, 0);
  }

  function enter(view) {
    if (history.state?.wordsView) history.replaceState({ wordsView: view }, "");
    else history.pushState({ wordsView: view }, "");
    show(view);
  }

  function leave() {
    if (history.state?.wordsView) history.back();
    else show(baseView());
  }

  window.addEventListener("popstate", () => {
    const view = history.state?.wordsView;
    if (view === "round" && !state.session) {
      show(baseView());
      return;
    }
    show(view || baseView());
  });

  /* ---------- 欢迎 ---------- */
  function renderWelcome() {
    const changes = [
      ["一轮 10 个词，有明确的终点", "打开就是今天的安排。中途退出，下次从原处接着做。"],
      ["新词有固定名额", "每天学几轮由你定，新词名额跟着走；到期的旧词不会把新词挤掉。"],
      ["会的词可以跳过", "「很熟」把下次复习推后；「早就会了」直接移出每日学习，在词库里随时能恢复。"],
      ["不用三种题型各过 7 关", "一个词一份记录。日常用回想卡自己评分，听写和拼写放进专项练习。"],
    ];
    app.innerHTML = `<div class="w-welcome"><div class="w-welcome-card">
      <div><p class="eyebrow">背单词 · 新版</p><h1>每天点一下，就知道今天学什么</h1></div>
      <ol class="w-changes">${changes.map(([title, text], index) => `<li><span class="w-n">${index + 1}</span><div><strong>${title}</strong><span>${text}</span></div></li>`).join("")}</ol>
      ${state.migratedCount ? `<p class="w-migrate">旧版闪卡和三种测试的记录已经合并：${state.migratedCount} 个词沿用原来的进度，取几份记录里最好的一份。今天到期 ${Daily.dueIds(state).length} 个，其余按原来的间隔往后排。</p>` : ""}
      <div class="w-welcome-actions">
        <button class="btn btn-primary btn-xl" type="button" data-action="welcome-screen">先挑出已经会的入门词</button>
        <button class="btn btn-quiet" type="button" data-action="welcome-skip">跳过，直接开始</button>
      </div>
    </div></div>`;
  }

  /* ---------- 筛入门熟词 ---------- */
  function openScreen() {
    ui.screen = new Set(BASE.filter((item) => Daily.status(state.words[item.id]) === "known").map((item) => item.id));
    enter("screen");
  }

  function renderScreen() {
    app.innerHTML = `<header class="page-head"><div class="page-title"><p class="eyebrow">入门词 · ${BASE.length} 个 · 约 1 分钟</p><h1>哪些词你早就会了？</h1></div></header>
      <p class="w-screen-intro">点一下标成「早就会了」，这些词不再出现在每日学习里。拿不准的就别选，交给每日复习判断。以后在词库里随时能恢复。</p>
      ${groups(BASE).map(([cat, list]) => {
        const all = list.every((item) => ui.screen.has(item.id));
        return `<section class="w-screen-group" data-group="${esc(cat)}"><div class="w-screen-head"><h3>${esc(cat)} <span class="muted num">${list.length}</span></h3><button class="btn" type="button" data-action="screen-group" data-cat="${esc(cat)}">${all ? "取消这一组" : "这一组都会"}</button></div>
          <div class="w-chip-grid">${list.map((item) => `<button class="w-word-chip" type="button" data-screen-word="${item.id}" aria-pressed="${ui.screen.has(item.id)}"><span class="w-chip-word" lang="ja">${esc(item.writing)}</span><span class="w-chip-meaning">${esc(item.meaning)}</span></button>`).join("")}</div></section>`;
      }).join("")}
      <div class="w-batch"><span>已选 <b class="num" id="screen-count">${ui.screen.size}</b> 个</span><span class="w-batch-actions"><button class="btn btn-quiet" type="button" data-action="screen-cancel">${state.settings.onboarded ? "取消" : "以后再说"}</button><button class="btn btn-primary" type="button" data-action="screen-done">完成</button></span></div>`;
  }

  function syncScreenGroup(cat) {
    const section = [...app.querySelectorAll("[data-group]")].find((element) => element.dataset.group === cat);
    if (!section) return;
    const list = BASE.filter((item) => item.category === cat);
    section.querySelectorAll("[data-screen-word]").forEach((chip) => chip.setAttribute("aria-pressed", String(ui.screen.has(chip.dataset.screenWord))));
    section.querySelector("[data-action='screen-group']").textContent = list.every((item) => ui.screen.has(item.id)) ? "取消这一组" : "这一组都会";
    document.getElementById("screen-count").textContent = String(ui.screen.size);
  }

  function finishScreen() {
    const before = new Set(BASE.filter((item) => Daily.status(state.words[item.id]) === "known").map((item) => item.id));
    let added = 0;
    ui.screen.forEach((id) => {
      if (!before.has(id)) {
        Daily.knownOutside(state, id);
        added += 1;
      }
    });
    before.forEach((id) => {
      if (!ui.screen.has(id)) Daily.restore(state, id);
    });
    if (!state.settings.onboarded) Daily.updateSettings(state, { onboarded: true });
    commit();
    toast(added ? `跳过了 ${added} 个词，在词库里能恢复` : "没有新跳过的词");
    leave();
  }

  /* ---------- 今日学习 ---------- */
  function roundTrack(t, session) {
    const finished = session && !session.extra ? Object.keys(session.finished).length : 0;
    return Array.from({ length: t.rounds }, (_, index) => {
      const start = index * Daily.ROUND_SIZE;
      const size = Math.max(0, Math.min(Daily.ROUND_SIZE, t.total - start));
      const done = Math.max(0, Math.min(size, t.done - start));
      const current = session && !session.extra
        ? session.round === index + 1
        : !t.finished && t.done >= start && t.done < start + Math.max(size, 1);
      const pct = session && !session.extra && session.round === index + 1
        ? (finished / session.words.length) * 100
        : size ? (done / size) * 100 : 0;
      const label = pct >= 100 ? `第 ${index + 1} 轮 · 完成` : current && session && !session.extra ? `第 ${index + 1} 轮 · ${finished}/${session.words.length}` : `第 ${index + 1} 轮`;
      return `<div class="w-step${current ? " is-current" : ""}"><div class="bar success"><span style="width:${pct}%"></span></div><small>${label}</small></div>`;
    }).join("");
  }

  function renderHome() {
    const t = Daily.today(state);
    const session = state.session;
    const counts = Daily.counts(state);
    const forecast = Daily.forecast(state);
    const maxForecast = Math.max(1, ...forecast.map((item) => item.count));
    const finishedInSession = session ? Object.keys(session.finished).length : 0;
    const locked = WordsStore.status().kind === "locked";

    let card;
    if (t.finished && !session) {
      card = `<div class="w-done"><div class="w-seal" lang="ja">済</div><h2>今天的安排完成了</h2>
        <p>今天学了 ${t.done} 个词，其中新词 ${t.totalNew} 个${t.extraNew ? `，另外多学了 ${t.extraNew} 个` : ""}。明天有 ${forecast[0].count} 个词到期。</p></div>
        ${t.dueCount ? `<button class="btn btn-xl" type="button" data-action="add-round">还有 ${t.dueCount} 个到期的词，今天加一轮</button>` : ""}`;
    } else {
      const cta = session
        ? `<button class="btn btn-primary btn-xl" type="button" data-action="resume">${session.extra ? "继续多学新词" : `继续第 ${session.round} 轮`} · ${finishedInSession}/${session.words.length}</button>`
        : `<button class="btn btn-primary btn-xl" type="button" data-action="start">开始第 ${Math.floor(t.done / Daily.ROUND_SIZE) + 1} 轮 · ${Math.min(Daily.ROUND_SIZE, t.upcoming)} 个词</button>`;
      card = `<div class="w-today-top">
          <p class="w-big"><b class="num">${t.total}</b>个词<span>· ${t.rounds} 轮</span></p>
          <div class="w-chips"><span class="w-chip new">新词 <b>${t.totalNew}</b></span><span class="w-chip">到期复习 <b>${t.totalReview}</b></span>${t.overflow ? `<span class="w-chip warn">排不下 <b>${t.overflow}</b></span>` : ""}${t.extraNew ? `<span class="w-chip">另外多学 <b>${t.extraNew}</b></span>` : ""}</div>
        </div>
        ${t.skipNew ? '<p class="muted">今天暂停了新词，先清旧词。<button class="w-link" type="button" data-action="resume-new">恢复新词</button></p>' : ""}
        <div class="w-track">${roundTrack(t, session)}</div>
        ${cta}
        <p class="w-today-note">每轮 10 个词，大约 4 分钟。中途退出，下次从原处接着做。</p>`;
    }

    const backlog = t.overflow && !session
      ? `<div class="w-notice" role="status"><p><b>到期的旧词比今天排得下的多 ${t.overflow} 个。</b>多出来的会顺延到明天，不处理也可以。要不要先把旧词清掉？</p>
        <div class="w-notice-actions">${!t.skipNew && t.quota ? '<button class="btn" type="button" data-action="skip-new">今天不学新词</button>' : ""}<button class="btn" type="button" data-action="add-round">今天加一轮</button><button class="btn btn-quiet" type="button" data-action="dismiss-backlog">先这样</button></div></div>`
      : "";
    const lockNote = locked
      ? `<div class="w-notice"><p><b>这台设备还没登录。</b>进度先存在这里，输入访问密钥后会和其他设备合并。</p><div class="w-notice-actions"><button class="btn" type="button" data-action="unlock">${ICONS.lock}输入访问密钥</button></div></div>`
      : "";

    const total = WORD_CARDS.length;
    const segment = (n, cls) => (n ? `<i class="${cls}" style="width:${(n / total) * 100}%"></i>` : "");
    app.innerHTML = `<div class="w-home">
      <section class="w-home-main">
        <header class="page-head"><div class="page-title"><p class="eyebrow">${Daily.dateLabel(state.day)}</p><h1>今日学习</h1></div></header>
        <article class="w-today">${card}</article>
        ${backlog}${lockNote}
        <div class="w-more-grid">
          <button class="w-more" type="button" data-action="extra-new"${session || !t.freshLeft ? " disabled" : ""}><span class="w-more-icon">${ICONS.plus}</span><strong>多学几个新词</strong><span>再学 ${Daily.EXTRA_NEW} 个，不占今天的名额。之后几天的复习会多一些。</span></button>
          <button class="w-more" type="button" data-action="practice"><span class="w-more-icon">${ICONS.pen}</span><strong>专项练习</strong><span>听写、拼写日语。只记下弱项，不改变每日安排。</span></button>
        </div>
      </section>
      <aside class="w-home-side">
        <section class="panel"><h3>词汇进度</h3>
          <div class="w-stack" aria-hidden="true">${segment(counts.mastered, "sw-mastered")}${segment(counts.learning, "sw-learning")}${segment(counts.known, "sw-known")}</div>
          <div class="w-legend"><div><span class="w-swatch sw-mastered"></span>已掌握<b>${counts.mastered}</b></div><div><span class="w-swatch sw-learning"></span>学习中<b>${counts.learning}</b></div><div><span class="w-swatch sw-known"></span>已跳过<b>${counts.known}</b></div><div><span class="w-swatch sw-fresh"></span>未学<b>${counts.fresh}</b></div></div>
          <div class="w-stat-row"><span>N3 词已学</span><b>${counts.n3Seen} / ${counts.n3Total}</b></div>
          <div class="w-stat-row"><span>连续学习</span><b>${Daily.streak(state)} 天</b></div>
        </section>
        <section class="panel"><h3>之后 7 天到期</h3>
          <div class="w-forecast">${forecast.map((item) => `<div class="w-fc"><b>${item.count}</b><span class="w-col" style="height:${Math.max(4, (item.count / maxForecast) * 100)}%"></span><small>${shortDay(item.day)}</small></div>`).join("")}</div>
          <p class="panel-note">只算已经学过的词，不含之后每天的新词。</p>
        </section>
        <section class="panel"><h3>每日安排</h3><div class="w-settings">
          <div><span>每天</span><b>${state.settings.rounds} 轮 · 约 ${state.settings.rounds * 10} 个词</b></div>
          <div><span>新词名额</span><b>每天 ${quota()} 个</b></div>
          <div><span>新词范围</span><b>${state.settings.source === "n3" ? "N3 优先" : "按课程顺序"}</b></div>
          <div><span>未学的 ${counts.fresh} 个词</span><b>${counts.fresh ? `约 ${Math.ceil(counts.fresh / quota())} 天学完` : "已经学完"}</b></div>
          <button class="btn" type="button" data-action="settings">调整</button>
        </div></section>
      </aside>
    </div>`;
  }

  function openSettings() {
    const rounds = state.settings.rounds;
    dialog.innerHTML = `<div class="modal-head"><h2>每日安排</h2><button class="icon-btn" type="button" data-action="close-words-dialog" aria-label="关闭">${ICON.x}</button></div>
      <div class="modal-body">
        <p class="field-label">每天学几轮</p>
        <div class="option-grid">${[1, 2, 3].map((n) => `<button class="option" type="button" data-rounds="${n}" aria-pressed="${rounds === n}"><strong>${n} 轮${n === 2 ? "（推荐）" : ""}</strong><span>约 ${n * 10} 个词，每天 ${Daily.NEW_PER_DAY[n]} 个新词</span></button>`).join("")}</div>
        <p class="panel-note">每个新词之后几周还要复习好几次，所以新词名额跟着每天的量走，大约每 10 个词放 2 个新词，这样旧词不容易积压。</p>
        <p class="field-label">新词从哪里来</p>
        <div class="option-grid w-two">
          <button class="option" type="button" data-source="n3" aria-pressed="${state.settings.source === "n3"}"><strong>N3 优先</strong><span>先学 120 个 N3 词，学完再补入门词</span></button>
          <button class="option" type="button" data-source="course" aria-pressed="${state.settings.source === "course"}"><strong>按课程顺序</strong><span>从入门词开始，按课本顺序往下学</span></button>
        </div>
        <div class="w-toggle-row"><span>新词出现和显示答案时自动朗读</span><button class="w-switch" type="button" role="switch" aria-checked="${state.settings.autoplay}" aria-label="自动朗读" data-action="toggle-autoplay"></button></div>
        <div class="modal-foot"><span class="muted">设置会同步到其他设备</span><button class="btn btn-primary" type="button" data-action="close-words-dialog">完成</button></div>
      </div>`;
    openDialog(dialog);
  }

  /* ---------- 一轮 ---------- */
  function promptBlock(item, dir) {
    if (dir === "audio") {
      return `<div class="w-prompt"><p class="w-hint">听一听，是什么意思？</p><button class="w-orb" type="button" data-say="${esc(item.kana)}" aria-label="再听一次">${ICON.speaker}</button></div>`;
    }
    if (dir === "zh-ja") {
      return `<div class="w-prompt"><p class="w-hint">用日语怎么说？</p><p class="w-zh-big">${esc(item.meaning)}</p></div>`;
    }
    return `<div class="w-prompt"><p class="w-hint">这个词是什么意思？</p><p class="w-ja-big${bigClass(item.writing)}" lang="ja">${esc(item.writing)}</p>${item.writing !== item.kana ? `<p class="card-reading" lang="ja">${esc(item.kana)}</p>` : ""}</div>`;
  }

  function answerBlock(item, { word, meaning }) {
    return `<div class="w-answer">
      ${word ? `<p class="w-ja-mid" lang="ja">${esc(item.writing)}</p>${item.writing !== item.kana ? `<p class="card-reading" lang="ja">${esc(item.kana)}</p>` : ""}` : ""}
      ${item.polite ? `<p class="card-polite"><span class="tag">ます形</span><span lang="ja">${esc(item.polite)}</span></p>` : ""}
      ${meaning ? `<p class="card-meaning">${esc(item.meaning)}</p>` : ""}
      <div class="card-example"><p class="ex-ja" lang="ja">${esc(item.example)}</p><p class="ex-zh">${esc(item.exampleZh)}</p>${sayBtn(item.example, "朗读例句")}</div>
      ${item.note ? `<p class="card-note">${KotobaUI.mixed(item.note)}</p>` : ""}
    </div>`;
  }

  const shownDir = (cur) => (cur.dir === "audio" && !canSpeak ? "ja-zh" : cur.dir);

  function renderRound() {
    const session = state.session;
    const cur = Daily.current(state);
    if (!session || !cur) {
      show(baseView());
      return;
    }
    const item = cur.card;
    const finished = Object.keys(session.finished).length;
    const size = session.words.length;
    const dir = shownDir(cur);
    const title = session.extra ? "多学新词" : `第 ${session.round} 轮`;
    let tags;
    let body;
    let actions;
    let hint;
    let speakTop = true;

    if (cur.kind === "intro") {
      tags = `<span class="w-tag new">新词</span><span class="w-tag quiet">${esc(item.category)}</span>`;
      body = `<div class="w-prompt"><p class="w-ja-big${bigClass(item.writing)}" lang="ja">${esc(item.writing)}</p>${item.writing !== item.kana ? `<p class="card-reading" lang="ja">${esc(item.kana)}</p>` : ""}</div>${answerBlock(item, { word: false, meaning: true })}`;
      actions = `<button class="btn btn-primary btn-xl" type="button" data-action="continue">记住了，继续 <span class="kbd kbd-hint">空格</span></button>
        <button class="w-link" type="button" data-action="known">早就会了，跳过</button>`;
      hint = keyHint([["空格", "继续"], ["P", "朗读"], ["Esc", "先退出"]]);
    } else {
      const [kindLabel, kindClass] = { review: ["复习", ""], check: ["新词 · 检查一下", "new"], retry: ["再考一次", "retry"] }[cur.kind];
      const weak = cur.kind === "review" && cur.rec?.weak === cur.dir ? '<span class="w-tag quiet">上次卡在这里</span>' : "";
      tags = `<span class="w-tag ${kindClass}">${kindLabel}</span><span class="w-tag quiet">${DIR_LABEL[dir]}</span>${weak}`;
      body = promptBlock(item, dir);
      if (session.revealed) {
        body += answerBlock(item, { word: dir !== "ja-zh", meaning: dir !== "zh-ja" });
        const preview = Daily.intervalPreview(state, cur);
        actions = cur.kind === "retry"
          ? `<div class="w-rate two"><button class="r-forgot" type="button" data-action="forgot">还没记住<small>明天再复习</small></button><button class="r-remember" type="button" data-action="remember">想起来了<small>明天再复习</small></button></div>`
          : `<div class="w-rate"><button class="r-forgot" type="button" data-action="forgot">忘了<small>${preview.forgot}</small></button><button class="r-remember" type="button" data-action="remember">记得<small>${preview.remember}</small></button><button class="r-easy" type="button" data-action="easy">很熟<small>${preview.easy}</small></button></div>`;
        actions += '<button class="w-link" type="button" data-action="known">早就会了，跳过</button>';
        hint = keyHint(cur.kind === "retry" ? [["1", "还没记住"], ["2", "想起来了"], ["P", "朗读"]] : [["1", "忘了"], ["2", "记得"], ["3", "很熟"], ["P", "朗读"]]);
      } else {
        speakTop = dir !== "audio";
        actions = `<button class="btn btn-primary btn-xl" type="button" data-action="reveal">想好了，显示答案 <span class="kbd kbd-hint">空格</span></button>
          <button class="w-link" type="button" data-action="known">早就会了，跳过</button>`;
        hint = keyHint([["空格", "显示答案"], ["P", "朗读"], ["Esc", "先退出"]]);
      }
    }

    app.innerHTML = `<div class="w-round">
      <div class="w-round-head"><button class="icon-btn" type="button" data-action="exit-round" aria-label="先退出，下次接着做" title="先退出，下次接着做">${ICON.x}</button>
        <div class="bar success" role="progressbar" aria-valuemin="0" aria-valuemax="${size}" aria-valuenow="${finished}" aria-label="本轮进度"><span style="width:${(finished / size) * 100}%"></span></div>
        <span class="w-count num">${title} · ${finished}/${size}</span></div>
      <article class="w-card${ui.animate ? " card-enter" : ""}">
        <div class="w-card-top"><div class="w-tags">${tags}</div>${speakTop ? sayBtn(item.kana) : ""}</div>
        ${body}
      </article>
      <div class="w-actions">${actions}</div>
      ${hint}
    </div>`;
    ui.animate = false;
  }

  function autoSpeak() {
    const cur = Daily.current(state);
    if (!cur || !canSpeak) return;
    if (cur.kind !== "intro" && shownDir(cur) === "audio" && !state.session.revealed) say(cur.card.kana, app.querySelector(".w-orb"));
    else if (cur.kind === "intro" && state.settings.autoplay) say(cur.card.kana);
  }

  function startRound() {
    WordsStore.refreshDay();
    if (!Daily.startRound(state)) {
      toast("今天没有要学的词了");
      render();
      return;
    }
    commit();
    ui.animate = true;
    enter("round");
    autoSpeak();
  }

  function startExtra() {
    if (!Daily.startExtraNew(state)) {
      toast("没有未学的词了");
      return;
    }
    commit();
    ui.animate = true;
    enter("round");
    autoSpeak();
  }

  function reveal() {
    const session = state.session;
    const cur = Daily.current(state);
    if (!session || !cur || cur.kind === "intro" || session.revealed) return;
    session.revealed = true;
    commit();
    render();
    if (state.settings.autoplay && shownDir(cur) !== "audio") say(cur.card.kana);
  }

  function answer(action) {
    const session = state.session;
    const cur = Daily.current(state);
    if (!session || !cur) return;
    if (cur.kind === "intro" && !["continue", "known"].includes(action)) return;
    if (cur.kind !== "intro" && action === "continue") return;
    if (cur.kind !== "intro" && action !== "known" && !session.revealed) return;
    const result = Daily.act(state, cur.kind === "retry" && action === "easy" ? "remember" : action);
    commit();
    if (action === "known") toast(`「${cur.card.writing}」移出了每日学习，在词库里能恢复`);
    if (result === "round-end") {
      enter("round-end");
      return;
    }
    ui.animate = true;
    render();
    autoSpeak();
  }

  function exitRound() {
    leave();
    toast("进度已保存，下次从这里接着做");
  }

  function renderRoundEnd() {
    const last = state.lastRound;
    if (!last) {
      show(baseView());
      return;
    }
    const t = Daily.today(state);
    const values = Object.values(last.results);
    const n = (key) => values.filter((value) => value === key).length;
    const forecast = Daily.forecast(state);
    const title = last.extra ? `多学了 ${n("new") + n("forgot")} 个新词` : `第 ${last.round} 轮完成`;
    const known = n("known");
    const sub = t.finished ? `今天的安排完成了。明天有 ${forecast[0].count} 个词到期。` : `今天还剩 ${t.upcoming} 个词。`;
    const rows = last.words.filter((id) => Daily.card(id)).map((id) => {
      const item = Daily.card(id);
      const result = last.results[id] || "remember";
      const rec = state.words[id];
      const due = rec?.status === "learning" ? Daily.dueLabel(state, rec) : "";
      return `<div class="w-row">${rowMain(item)}<div class="w-row-side"><span class="w-status ${result}">${RESULT_LABEL[result]}</span>${due ? `<small>下次：${due}</small>` : ""}</div></div>`;
    }).join("");
    const actions = t.finished || last.extra
      ? '<button class="btn btn-primary btn-xl" type="button" data-action="go-home">回到今日学习</button>'
      : `<button class="btn btn-primary btn-xl" type="button" data-action="start">开始第 ${Math.floor(t.done / Daily.ROUND_SIZE) + 1} 轮 · ${Math.min(Daily.ROUND_SIZE, t.upcoming)} 个词</button><button class="btn btn-quiet" type="button" data-action="go-home">先休息，回到首页</button>`;
    app.innerHTML = `<div class="w-summary">
      <div class="w-summary-head"><div class="w-seal">${ICON.check}</div><h2>${title}</h2><p>${sub}${known ? ` 跳过了 ${known} 个已经会的词。` : ""}</p>
        <div class="w-tally"><div><b>${n("remember")}</b><span>记得</span></div><div><b>${n("easy")}</b><span>很熟</span></div><div><b>${n("forgot")}</b><span>忘了</span></div><div><b>${n("new")}</b><span>新词</span></div></div>
      </div>
      <div class="w-list">${rows}</div>
      <div class="w-summary-actions">${actions}</div>
      <p class="muted w-center">忘了的词今天不再出现，明天会再复习一次。</p>
    </div>`;
  }

  /* ---------- 词库 ---------- */
  function renderLibrary() {
    const counts = Daily.counts(state);
    const filters = [["all", "全部", WORD_CARDS.length], ["learning", "学习中", counts.learning], ["mastered", "已掌握", counts.mastered], ["fresh", "未学", counts.fresh], ["known", "已跳过", counts.known]];
    app.innerHTML = `<header class="page-head"><div class="page-title"><p class="eyebrow">词库 · ${WORD_CARDS.length} 个词</p><h1>每个词学到哪儿了</h1></div>
        <span class="w-notice-actions"><button class="btn" type="button" data-action="open-screen">筛一遍入门词</button><button class="btn" type="button" data-action="batch">${ui.lib.batch ? "退出批量" : "批量跳过"}</button></span></header>
      <div class="w-lib-tools"><div class="seg" role="group" aria-label="按状态筛选">${filters.map(([id, label, count]) => `<button type="button" data-filter="${id}" aria-pressed="${ui.lib.filter === id}">${label}<span class="w-seg-count num">${count}</span></button>`).join("")}</div>
        <label class="search">${ICONS.search}<input id="lib-search" type="search" placeholder="搜索日语、读音或中文" value="${esc(ui.lib.q)}" autocomplete="off" aria-label="搜索词库"></label></div>
      <div id="lib-list"></div>`;
    renderLibList();
  }

  function renderLibList() {
    const box = document.getElementById("lib-list");
    if (!box) return;
    const q = ui.lib.q.trim().toLowerCase();
    const list = WORD_CARDS.filter((item) => (ui.lib.filter === "all" || Daily.status(state.words[item.id]) === ui.lib.filter)
      && (!q || [item.writing, item.kana, item.meaning].some((value) => value.toLowerCase().includes(q))));
    if (!list.length) {
      box.innerHTML = '<div class="panel"><p class="muted">没有符合条件的词。</p></div>';
      return;
    }
    box.innerHTML = groups(list).map(([cat, items]) => `<section class="w-group"><h3><span class="side-mark" lang="ja">${esc(markOf.get(cat) || cat.slice(0, 1))}</span>${esc(cat)} <small class="num">${items.length}</small></h3>
      <div class="w-list">${items.map((item) => {
        const rec = state.words[item.id];
        const itemStatus = Daily.status(rec);
        const due = itemStatus === "learning" || itemStatus === "mastered" ? `下次：${Daily.dueLabel(state, rec)}` : "";
        const picked = ui.lib.picked.has(item.id);
        const lock = ui.lib.batch && itemStatus === "known";
        return `<button class="w-row${ui.lib.batch ? " selectable" : ""}${picked ? " is-picked" : ""}" type="button" data-word="${item.id}"${lock ? " disabled" : ""}>${ui.lib.batch ? `<span class="w-check">${ICON.check}</span>` : ""}${rowMain(item)}<div class="w-row-side"><span class="w-status ${itemStatus}">${STATUS_LABEL[itemStatus]}</span>${due ? `<small>${due}</small>` : ""}</div></button>`;
      }).join("")}</div></section>`).join("")
      + (ui.lib.batch ? `<div class="w-batch"><span>已选 <b class="num">${ui.lib.picked.size}</b> 个</span><span class="w-batch-actions"><button class="btn btn-quiet" type="button" data-action="batch">取消</button><button class="btn btn-primary" type="button" data-action="batch-known"${ui.lib.picked.size ? "" : " disabled"}>标为早就会了</button></span></div>` : "");
  }

  function openWord(id) {
    const item = Daily.card(id);
    const rec = state.words[id];
    const itemStatus = Daily.status(rec);
    const facts = rec && (itemStatus === "learning" || itemStatus === "mastered")
      ? `<div><span>记忆阶段</span><span class="w-stage-dots" aria-label="第 ${rec.stage + 1} 档，共 ${Daily.MAX_STAGE + 1} 档">${Array.from({ length: Daily.MAX_STAGE + 1 }, (_, index) => `<i class="${index <= rec.stage ? "on" : ""}"></i>`).join("")}</span></div>
        <div><span>下次复习</span><b>${Daily.dueLabel(state, rec)}</b></div>
        <div><span>忘记次数</span><b class="num">${rec.lapses}</b></div>
        ${rec.weak ? `<div><span>弱项</span><b>${DIR_LABEL[rec.weak]}</b></div>` : ""}`
      : "";
    dialog.innerHTML = `<div class="modal-head"><h2>${esc(item.category)}</h2><button class="icon-btn" type="button" data-action="close-words-dialog" aria-label="关闭">${ICON.x}</button></div>
      <div class="modal-body">
        <div class="w-detail-hero"><p class="w-ja-mid" lang="ja">${esc(item.writing)}</p>${item.writing !== item.kana ? `<p class="card-reading" lang="ja">${esc(item.kana)}</p>` : ""}${item.polite ? `<p class="card-polite"><span class="tag">ます形</span><span lang="ja">${esc(item.polite)}</span></p>` : ""}<p class="card-meaning">${esc(item.meaning)}</p>${sayBtn(item.kana)}</div>
        <div class="card-example"><p class="ex-ja" lang="ja">${esc(item.example)}</p><p class="ex-zh">${esc(item.exampleZh)}</p>${sayBtn(item.example, "朗读例句")}</div>
        <div class="w-facts"><div><span>状态</span><b>${STATUS_LABEL[itemStatus]}</b></div>${facts}</div>
        <div class="modal-foot">${itemStatus === "known"
          ? `<button class="btn btn-primary" type="button" data-action="restore" data-id="${id}">恢复到每日学习</button>`
          : `<button class="btn" type="button" data-action="mark-known" data-id="${id}">早就会了，跳过</button>`}<button class="btn btn-quiet" type="button" data-action="close-words-dialog">关闭</button></div>
      </div>`;
    openDialog(dialog);
  }

  /* ---------- 专项练习 ---------- */
  function renderPractice() {
    const p = ui.practice;
    if (p.stage === "run") {
      renderPracticeRun();
      return;
    }
    if (p.stage === "end") {
      renderPracticeEnd();
      return;
    }
    const pools = { recent: Daily.practicePool(state, "recent").length, weak: Daily.practicePool(state, "weak").length, all: Daily.practicePool(state, "all").length };
    const size = pools[p.source];
    const modes = [["dictation", "听写", "听读音，写出日语"], ["spelling", "拼写", "看中文，写出日语"]];
    const sources = [["recent", "最近学的", "最近 10 个"], ["weak", "薄弱词", pools.weak ? `忘过或有弱项的 ${pools.weak} 个` : "暂时没有"], ["all", "随机", "从学过的词里抽 10 个"]];
    app.innerHTML = `<div class="w-practice">
      <header class="page-head"><div class="page-title"><p class="eyebrow">背单词 · 专项练习</p><h1>听写和拼写</h1></div><button class="btn btn-quiet" type="button" data-action="go-home">回到今日学习</button></header>
      <div class="panel">
        <p class="field-label">练什么</p>
        <div class="option-grid w-two">${modes.map(([id, title, text]) => `<button class="option" type="button" data-pmode="${id}" aria-pressed="${p.mode === id}"><strong>${title}</strong><span>${text}</span></button>`).join("")}</div>
        <p class="field-label">从哪些词里出题</p>
        <div class="option-grid">${sources.map(([id, title, text]) => `<button class="option" type="button" data-psource="${id}" aria-pressed="${p.source === id}"><strong>${title}</strong><span>${text}</span></button>`).join("")}</div>
        <p class="panel-note">写错的词会记下弱项：听写错了，下次复习先考听音；拼写错了，先考看中文想日语。练习本身不改变每日的复习安排。</p>
        <div class="w-panel-cta"><button class="btn btn-primary btn-xl" type="button" data-action="practice-start"${size ? "" : " disabled"}>${size ? `开始 · ${size} 题` : "先在今日学习里学几个词"}</button></div>
      </div>
    </div>`;
  }

  function renderPracticeRun() {
    const p = ui.practice;
    const id = p.items[p.index];
    const item = Daily.card(id);
    const done = p.answers[p.index];
    const dictation = p.mode === "dictation" && canSpeak;
    const prompt = dictation
      ? `<p class="w-hint">听读音，写出日语</p><button class="w-orb" type="button" data-say="${esc(item.kana)}" aria-label="再听一次">${ICON.speaker}</button>`
      : `<p class="w-hint">写出对应的日语</p><p class="w-zh-big">${esc(item.meaning)}</p>`;
    let after = '<div class="answer-help"><span>汉字、假名、ます形或常见说法都算对</span><button class="w-link" type="button" data-action="practice-idk">不知道，看答案</button></div>';
    if (done) {
      const cls = done.ok ? "ok" : done.near ? "near" : "bad";
      const head = done.ok ? (done.overridden ? "已改判为正确" : "写对了") : done.near ? "只差一个字" : done.answer ? "这次没写对" : "看一下答案";
      after = `<div class="feedback ${cls}" role="status"><div class="feedback-head">${done.ok ? ICON.check : ICON.wrong}${head}</div>
        <div class="feedback-answer"><span class="std"><span lang="ja">${esc(item.writing)}</span>${item.writing !== item.kana ? `<small lang="ja">${esc(item.kana)}</small>` : ""}</span>${sayBtn(item.kana)}</div>
        ${!done.ok && done.answer ? `<p class="feedback-mine">你写的：<span lang="ja">${esc(done.answer)}</span></p>` : ""}
        ${!done.ok ? `<p class="feedback-mine">已记下弱项，下次复习先考「${DIR_LABEL[WEAK_FOR_MODE[p.mode]]}」。</p>` : ""}
        <p class="feedback-ex"><span lang="ja">${esc(item.example)}</span>${esc(item.exampleZh)}</p>
        ${!done.ok && done.answer ? '<div class="w-notice-actions"><button class="btn" type="button" data-action="practice-override">我其实写对了</button></div>' : ""}
      </div>`;
    }
    app.innerHTML = `<div class="w-practice">
      <div class="w-round-head"><button class="icon-btn" type="button" data-action="practice-exit" aria-label="结束练习" title="结束练习">${ICON.x}</button>
        <div class="bar"><span style="width:${(p.answers.filter(Boolean).length / p.items.length) * 100}%"></span></div><span class="w-count num">${p.index + 1}/${p.items.length}</span></div>
      <div class="q-card"><div class="q-meta"><span>${dictation ? "听写" : "拼写"}</span><span>${esc(item.category)}</span></div>${prompt}</div>
      <form class="answer-row" id="practice-form" autocomplete="off">
        <input class="answer-input${done ? (done.ok ? " is-correct" : " is-wrong") : ""}" id="practice-input" name="answer" type="text" lang="ja" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="输入日语，汉字或假名都可以" aria-label="你的答案"${done ? ` readonly value="${esc(done.answer)}"` : ""}>
        <button class="btn btn-primary btn-lg" type="submit">${done ? (p.index + 1 < p.items.length ? "下一题" : "看结果") : "确认"}</button>
      </form>
      ${after}
    </div>`;
  }

  function focusPractice() {
    setTimeout(() => {
      const done = ui.practice.answers[ui.practice.index];
      const target = done ? app.querySelector("#practice-form button[type='submit']") : document.getElementById("practice-input");
      if (done || window.matchMedia("(hover: hover)").matches) target?.focus({ preventScroll: true });
    }, 0);
  }

  function startPractice() {
    const p = ui.practice;
    p.items = Daily.practicePool(state, p.source);
    if (!p.items.length) return;
    p.index = 0;
    p.answers = [];
    p.stage = "run";
    enter("practice");
    focusPractice();
    if (p.mode === "dictation") say(Daily.card(p.items[0]).kana, app.querySelector(".w-orb"));
  }

  function recordPractice(value) {
    const p = ui.practice;
    const id = p.items[p.index];
    const rec = state.words[id];
    const result = value ? Daily.checkTyped(Daily.card(id), value) : { ok: false, near: false };
    p.answers[p.index] = { id, answer: value, ok: result.ok, near: result.near, prevWeak: rec?.weak ?? null };
    if (!result.ok && rec) {
      Daily.setWeak(state, id, WEAK_FOR_MODE[p.mode]);
      commit();
    }
    render();
    focusPractice();
  }

  function practiceNext() {
    const p = ui.practice;
    if (p.index + 1 >= p.items.length) {
      p.stage = "end";
      render();
      return;
    }
    p.index += 1;
    render();
    focusPractice();
    if (p.mode === "dictation") say(Daily.card(p.items[p.index]).kana, app.querySelector(".w-orb"));
  }

  function renderPracticeEnd() {
    const p = ui.practice;
    const right = p.answers.filter((item) => item.ok).length;
    const wrong = p.answers.filter((item) => !item.ok);
    app.innerHTML = `<div class="w-summary">
      <div class="w-summary-head"><div class="w-seal">${ICON.check}</div><h2>${right} / ${p.items.length} 写对</h2>
        <p>${wrong.length ? `写错的 ${wrong.length} 个词记下了弱项，复习时会先考「${DIR_LABEL[WEAK_FOR_MODE[p.mode]]}」。` : "全部写对了，弱项没有变化。"}</p></div>
      ${wrong.length ? `<div class="w-list">${wrong.map((item) => `<div class="w-row">${rowMain(Daily.card(item.id))}<div class="w-row-side"><span class="w-status forgot">${item.answer ? "写错" : "不知道"}</span></div></div>`).join("")}</div>` : ""}
      <div class="w-summary-actions"><button class="btn btn-primary btn-xl" type="button" data-action="practice-again">再练一组</button><button class="btn btn-quiet" type="button" data-action="go-home">回到今日学习</button></div>
    </div>`;
  }

  /* ---------- 渲染 ---------- */
  const VIEWS = {
    welcome: renderWelcome,
    screen: renderScreen,
    home: renderHome,
    round: renderRound,
    "round-end": renderRoundEnd,
    practice: renderPractice,
    library: renderLibrary,
  };

  function render() {
    if (!VIEWS[ui.view] || (page === "library" && !["library", "screen"].includes(ui.view))) ui.view = baseView();
    if (page === "words" && ui.view === "library") ui.view = baseView();
    const focus = ui.view === "round" || (ui.view === "practice" && ui.practice.stage === "run");
    document.body.classList.toggle("is-focus", focus);
    VIEWS[ui.view]();
  }

  /* ---------- 事件 ---------- */
  const actions = {
    "welcome-screen": openScreen,
    "welcome-skip": () => {
      Daily.updateSettings(state, { onboarded: true });
      commit();
      show("home");
    },
    "open-screen": openScreen,
    "screen-done": finishScreen,
    "screen-cancel": () => {
      if (!state.settings.onboarded) {
        Daily.updateSettings(state, { onboarded: true });
        commit();
      }
      leave();
    },
    "screen-group": (element) => {
      const cat = element.dataset.cat;
      const list = BASE.filter((item) => item.category === cat);
      const all = list.every((item) => ui.screen.has(item.id));
      list.forEach((item) => (all ? ui.screen.delete(item.id) : ui.screen.add(item.id)));
      syncScreenGroup(cat);
    },
    start: startRound,
    resume: () => {
      ui.animate = true;
      enter("round");
      autoSpeak();
    },
    "extra-new": startExtra,
    reveal,
    continue: () => answer("continue"),
    known: () => answer("known"),
    forgot: () => answer("forgot"),
    remember: () => answer("remember"),
    easy: () => answer("easy"),
    "exit-round": exitRound,
    "go-home": leave,
    settings: openSettings,
    unlock: () => WordsStore.unlock(),
    "close-words-dialog": () => closeDialog(dialog),
    "toggle-autoplay": () => {
      Daily.updateSettings(state, { autoplay: !state.settings.autoplay });
      commit();
      openSettings();
    },
    "skip-new": () => {
      Daily.dayRec(state).skipNew = true;
      commit();
      render();
      toast("今天先不学新词，空出来的位置给旧词");
    },
    "resume-new": () => {
      Daily.dayRec(state).skipNew = false;
      commit();
      render();
    },
    "add-round": () => {
      Daily.dayRec(state).extraRounds += 1;
      commit();
      render();
      toast("今天多加了一轮");
    },
    "dismiss-backlog": () => {
      Daily.dayRec(state).backlogDismissed = true;
      commit();
      render();
    },
    practice: () => {
      ui.practice.stage = "setup";
      enter("practice");
    },
    "practice-start": startPractice,
    "practice-idk": () => recordPractice(""),
    "practice-override": () => {
      const p = ui.practice;
      const done = p.answers[p.index];
      if (!done) return;
      done.ok = true;
      done.overridden = true;
      Daily.setWeak(state, done.id, done.prevWeak);
      commit();
      render();
      focusPractice();
    },
    "practice-exit": () => {
      ui.practice.stage = "setup";
      leave();
    },
    "practice-again": () => {
      ui.practice.stage = "setup";
      render();
    },
    batch: () => {
      ui.lib.batch = !ui.lib.batch;
      ui.lib.picked = new Set();
      render();
    },
    "batch-known": () => {
      const count = ui.lib.picked.size;
      ui.lib.picked.forEach((id) => Daily.knownOutside(state, id));
      ui.lib.picked = new Set();
      ui.lib.batch = false;
      commit();
      render();
      toast(`${count} 个词移出了每日学习`);
    },
    "mark-known": (element) => {
      Daily.knownOutside(state, element.dataset.id);
      commit();
      closeDialog(dialog);
      render();
      toast("移出了每日学习，在「已跳过」里能恢复");
    },
    restore: (element) => {
      const id = element.dataset.id;
      Daily.restore(state, id);
      commit();
      closeDialog(dialog);
      render();
      toast(Daily.status(state.words[id]) === "fresh" ? "恢复为未学，会按新词名额排进来" : "恢复了，今天就会回到复习里");
    },
  };

  document.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog(dialog);
      return;
    }
    const element = event.target.closest("button, [data-action]");
    if (!element || element.disabled || !element.closest("#app, #words-dialog")) return;
    const data = element.dataset;
    if (data.say !== undefined) {
      say(data.say, element);
      return;
    }
    if (data.screenWord) {
      const id = data.screenWord;
      if (ui.screen.has(id)) ui.screen.delete(id);
      else ui.screen.add(id);
      syncScreenGroup(Daily.card(id).category);
      return;
    }
    if (data.filter) {
      ui.lib.filter = data.filter;
      renderLibrary();
      return;
    }
    if (data.word) {
      if (!ui.lib.batch) {
        openWord(data.word);
        return;
      }
      if (ui.lib.picked.has(data.word)) ui.lib.picked.delete(data.word);
      else ui.lib.picked.add(data.word);
      const y = window.scrollY;
      renderLibList();
      window.scrollTo(0, y);
      return;
    }
    if (data.rounds) {
      Daily.updateSettings(state, { rounds: Number(data.rounds) });
      commit();
      openSettings();
      render();
      return;
    }
    if (data.source) {
      Daily.updateSettings(state, { source: data.source });
      commit();
      openSettings();
      render();
      return;
    }
    if (data.pmode) {
      ui.practice.mode = data.pmode;
      render();
      return;
    }
    if (data.psource) {
      ui.practice.source = data.psource;
      render();
      return;
    }
    actions[data.action]?.(element);
  });

  document.addEventListener("input", (event) => {
    if (event.target.id !== "lib-search") return;
    ui.lib.q = event.target.value;
    renderLibList();
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id !== "practice-form") return;
    event.preventDefault();
    if (ui.practice.answers[ui.practice.index]) {
      practiceNext();
      return;
    }
    const value = event.target.elements.answer.value.trim();
    if (!value) {
      event.target.elements.answer.focus();
      return;
    }
    recordPractice(value);
  });

  window.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (document.querySelector("dialog[open]") || event.metaKey || event.ctrlKey || event.altKey) return;
    if (ui.view === "practice" && ui.practice.stage === "run") {
      if (event.key === "Escape") actions["practice-exit"]();
      return;
    }
    if (ui.view !== "round" || isTyping(event.target)) return;
    const cur = Daily.current(state);
    if (!cur) return;
    if (event.code === "Space" || (event.key === "Enter" && !event.target.closest?.("button"))) {
      event.preventDefault();
      if (cur.kind === "intro") answer("continue");
      else if (!state.session.revealed) reveal();
    } else if (state.session.revealed && cur.kind !== "intro" && ["1", "2", "3"].includes(event.key)) {
      answer({ 1: "forgot", 2: "remember", 3: "easy" }[event.key]);
    } else if (event.key === "p" || event.key === "P") {
      say(cur.card.kana);
    } else if (event.key === "Escape") {
      exitRound();
    }
  });

  // 别的设备同步过来新记录、或者过了凌晨 4 点：刷新当前页面（正在答的题不受影响）
  WordsStore.onChange(() => {
    // 在另一台设备上已经开始用新版了：同步到之后直接进今日学习
    if (ui.view === "welcome" && state.settings.onboarded) ui.view = baseView();
    if (ui.view === "round" && !Daily.current(state)) ui.view = baseView();
    if (ui.view === "practice" && ui.practice.stage === "run") return;
    if (ui.view === "screen") return;
    render();
  });
  let lastStatus = WordsStore.status().kind;
  WordsStore.onStatus((status) => {
    const changed = (status.kind === "locked") !== (lastStatus === "locked");
    lastStatus = status.kind;
    if (changed && ui.view === "home") render();
  });

  if (history.state?.wordsView) history.replaceState(null, "");
  ui.view = baseView();
  render();
  KotobaUI.init();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/japanese/sw.js", { scope: "/japanese" }).catch(() => {});
    });
  }
})();
