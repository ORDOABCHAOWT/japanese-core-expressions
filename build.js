const fs = require("fs");
const path = require("path");

const projectDir = __dirname;
const sourcePath = path.join(projectDir, "原文提取.md");
const publicDir = path.join(projectDir, "public");
const distDir = path.join(projectDir, "dist");
const outputPath = path.join(distDir, "index.html");
const flashcardsPath = path.join(projectDir, "单词闪卡.html");
const flashcardsOutputPath = path.join(distDir, "words.html");
const testTemplatePath = path.join(projectDir, "词汇测试.html");
const testOutputPath = path.join(distDir, "test.html");
const n3LessonsPath = path.join(projectDir, "content", "n3-lessons.json");
const n3FlashcardsPath = path.join(projectDir, "content", "n3-flashcards.json");

const raw = fs.readFileSync(sourcePath, "utf8");
const clientScript = fs.readFileSync(path.join(projectDir, "app-client.js"), "utf8");
const n3Lessons = JSON.parse(fs.readFileSync(n3LessonsPath, "utf8"));
const n3Flashcards = JSON.parse(fs.readFileSync(n3FlashcardsPath, "utf8"));
const flashcardsTemplate = fs.readFileSync(flashcardsPath, "utf8");
const testTemplate = fs.readFileSync(testTemplatePath, "utf8");
const testAlgorithm = fs.readFileSync(path.join(projectDir, "test-algorithm.js"), "utf8");
const testClient = fs.readFileSync(path.join(projectDir, "test-client.js"), "utf8");
const baseCardsMatch = flashcardsTemplate.match(/const cards = (\[[\s\S]*?\n\]);\nconst n3Cards/);

if (!baseCardsMatch) {
  throw new Error("单词闪卡模板缺少基础词卡数据。" );
}

const baseFlashcards = new Function(`"use strict"; return ${baseCardsMatch[1]}`)();
const allFlashcards = [...baseFlashcards, ...n3Flashcards];
const flashcardsHtml = flashcardsTemplate.replace(
  "const n3Cards = [];",
  `const n3Cards = ${JSON.stringify(n3Flashcards)};`,
);
const testHtml = testTemplate
  .replace("/* TEST_ALGORITHM */", testAlgorithm)
  .replace("const testCards = [];", `const testCards = ${JSON.stringify(allFlashcards)};`)
  .replace("/* TEST_CLIENT */", testClient);

if (flashcardsHtml === flashcardsTemplate) {
  throw new Error("单词闪卡模板缺少 N3 内容注入点。");
}
if (testHtml === testTemplate || testHtml.includes("/* TEST_CLIENT */")) {
  throw new Error("词汇测试模板注入失败。" );
}

const n3CardRequired = ["id", "category", "kana", "writing", "meaning", "example", "exampleZh"];
const invalidN3Cards = n3Flashcards.filter(
  (card) => n3CardRequired.some((field) => !card[field]),
);
const n3CardIds = new Set(n3Flashcards.map((card) => card.id));
if (n3Flashcards.length !== 120 || n3CardIds.size !== n3Flashcards.length || invalidN3Cards.length) {
  throw new Error(
    `N3 词卡校验未通过：共 ${n3Flashcards.length} 张，唯一 ID ${n3CardIds.size} 个，结构异常 ${invalidN3Cards.length} 张。`,
  );
}

const normalized = raw
  .replace(/\r/g, "")
  .replace(/\\\n/g, "\n")
  .replace(/([^\n])\n(?!\n|\*\*)/g, "$1$2");

const lessonPattern =
  /\*\*(\d{2}) ｜ (.+?)\*\*\n+([\s\S]*?)(?=\n\*\*\d{2} ｜ |\s*$)/g;
const lessons = [];
let lessonMatch;

while ((lessonMatch = lessonPattern.exec(normalized))) {
  const [, number, japanese, body] = lessonMatch;
  const lesson = {
    number,
    japanese: japanese.trim(),
    reading: "",
    chinese: "",
    formula: "",
    words: [],
    variation: "",
    note: "",
  };
  let mode = "meta";

  for (const line of body.split("\n").map((item) => item.trim()).filter(Boolean)) {
    const field = line.match(/^\*\*(.+?)：\*\*(.*)$/);
    if (!field) continue;
    const [, label, valueRaw] = field;
    const value = valueRaw.trim();

    if (label === "读音") lesson.reading = value;
    else if (label === "中文") lesson.chinese = value;
    else if (label === "拼句") lesson.formula = value;
    else if (label === "逐词") mode = "words";
    else if (label === "换着说") {
      mode = "meta";
      lesson.variation = value;
    } else if (label === "记住") {
      mode = "meta";
      lesson.note = value;
    } else if (mode === "words") {
      lesson.words.push({ term: label, meaning: value });
    }
  }

  lessons.push(lesson);
}

const baseLessonCount = lessons.length;
lessons.push(...n3Lessons);

const required = ["reading", "chinese", "formula", "variation", "note"];
const invalidLessons = lessons.filter(
  (lesson) => required.some((field) => !lesson[field]) || lesson.words.length === 0,
);

const lessonNumbers = lessons.map((lesson) => Number(lesson.number));
const sequentialLessons = lessonNumbers.every((number, index) => number === index + 1);
if (
  baseLessonCount !== 86
  || n3Lessons.length !== 50
  || lessons.length !== 136
  || !sequentialLessons
  || invalidLessons.length > 0
) {
  throw new Error(
    `内容解析未通过：共 ${lessons.length} 条，结构异常 ${invalidLessons
      .map((lesson) => lesson.number)
      .join("、") || "无"}。`,
  );
}

const chapters = [
  {
    id: "aisatsu",
    start: 1,
    end: 14,
    kana: "あいさつ",
    title: "问候与礼貌",
    description: "打招呼、道歉，以及家庭中常见的出门与回家固定语。",
    accent: "red",
  },
  {
    id: "classroom",
    start: 15,
    end: 21,
    kana: "教室で",
    title: "课堂求助与确认",
    description: "听不清、问意思、确认方式，以及「大丈夫」的场景判断。",
    accent: "blue",
  },
  {
    id: "introduction",
    start: 22,
    end: 34,
    kana: "自己紹介",
    title: "自我介绍",
    description: "姓名、身份、家人、来自哪里，以及目前住在哪里。",
    accent: "gold",
  },
  {
    id: "place",
    start: 35,
    end: 44,
    kana: "もの・場所",
    title: "物品、地点与存在",
    description: "指示词、方位词，以及「あります／います」的基础用法。",
    accent: "green",
  },
  {
    id: "description",
    start: 45,
    end: 54,
    kana: "形容・気持ち",
    title: "描述与感受",
    description: "い形容词、な形容词，以及喜欢、擅长和想要。",
    accent: "red",
  },
  {
    id: "actions",
    start: 55,
    end: 65,
    kana: "毎日の動作",
    title: "日常动作与频率",
    description: "ます形的肯定、否定、过去时，以及时间和频率表达。",
    accent: "blue",
  },
  {
    id: "shopping",
    start: 66,
    end: 71,
    kana: "店で",
    title: "点餐与购物",
    description: "提出需要、选择商品、询问价格、结账和婉拒购物袋。",
    accent: "gold",
  },
  {
    id: "travel",
    start: 72,
    end: 79,
    kana: "移動・誘い",
    title: "出行与邀约",
    description: "目的地、交通工具、上下车，以及邀请和共同提议。",
    accent: "green",
  },
  {
    id: "advanced",
    start: 80,
    end: 86,
    kana: "できること",
    title: "请求与进阶表达",
    description: "请求、许可、禁止、愿望、能力、经历，以及原因说明。",
    accent: "red",
  },
  {
    id: "n3-habits",
    start: 87,
    end: 96,
    kana: "習慣・予定",
    title: "N3 习惯、计划与义务",
    description: "表达长期习惯、个人计划、既定安排、建议、义务与尝试。",
    accent: "blue",
  },
  {
    id: "n3-evidence",
    start: 97,
    end: 106,
    kana: "推測・伝聞",
    title: "N3 推测、传闻与转述",
    description: "区分可能性、依据判断、外观、传闻、引用与转折。",
    accent: "gold",
  },
  {
    id: "n3-aspect",
    start: 107,
    end: 116,
    kana: "時間・進行",
    title: "N3 时间、状态与进程",
    description: "掌握事前准备、结果状态、动作阶段、期间与同时进行。",
    accent: "green",
  },
  {
    id: "n3-condition",
    start: 117,
    end: 126,
    kana: "条件・目的",
    title: "N3 条件、原因与目的",
    description: "比较「たら・ば・と・なら」，并表达让步、原因、目的与程度。",
    accent: "red",
  },
  {
    id: "n3-combination",
    start: 127,
    end: 136,
    kana: "複合表現",
    title: "N3 复合表达与话题组织",
    description: "描述难易、过度、动作起止、限定，以及正式话题关系。",
    accent: "blue",
  },
];

const TOTAL_LESSONS = lessons.length;
const TOTAL_CHAPTERS = chapters.length;
const TOTAL_FLASHCARDS = baseFlashcards.length + n3Flashcards.length;

const lessonData = lessons.map((lesson) => {
  const number = Number(lesson.number);
  const chapter = chapters.find((item) => number >= item.start && number <= item.end);
  return {
    number,
    japanese: lesson.japanese,
    reading: lesson.reading,
    chinese: lesson.chinese,
    chapter: chapter.id,
  };
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function lessonChapter(number) {
  const value = Number(number);
  return chapters.find((chapter) => value >= chapter.start && value <= chapter.end);
}

function formulaPieces(value) {
  return value
    .split("＋")
    .map((piece) => `<span>${escapeHtml(piece.trim())}</span>`)
    .join('<b aria-hidden="true">＋</b>');
}

function lessonMarkup(lesson) {
  const chapter = lessonChapter(lesson.number);
  const searchText = [
    lesson.japanese,
    lesson.reading,
    lesson.chinese,
    lesson.formula,
    lesson.variation,
    lesson.note,
    ...lesson.words.flatMap((word) => [word.term, word.meaning]),
  ].join(" ");

  return `
    <article class="lesson-shell" id="lesson-${lesson.number}" data-number="${lesson.number}" data-chapter="${chapter.id}" data-search="${escapeHtml(searchText.toLowerCase())}">
      <button class="learn-toggle" type="button" aria-label="标记第 ${Number(lesson.number)} 句为已掌握" aria-pressed="false" data-learn="${lesson.number}">
        <span class="checkmark" aria-hidden="true">✓</span>
        <span class="learn-label">标为已掌握</span>
      </button>
      <details class="lesson-card">
        <summary>
          <span class="lesson-number">${lesson.number}</span>
          <span class="summary-copy">
            <span class="jp-phrase" lang="ja">${escapeHtml(lesson.japanese)}</span>
            <span class="reading" lang="ja">${escapeHtml(lesson.reading)}</span>
            <span class="translation">${escapeHtml(lesson.chinese)}</span>
          </span>
          <span class="open-cue" aria-hidden="true"><i></i><em>拆解</em></span>
        </summary>
        <div class="lesson-detail">
          <section class="formula-block" aria-label="句型拼装">
            <div class="micro-heading"><span>01</span> 句型拼装</div>
            <div class="formula">${formulaPieces(lesson.formula)}</div>
          </section>
          <section class="words-block" aria-label="逐词拆解">
            <div class="micro-heading"><span>02</span> 逐词拆解</div>
            <dl class="word-grid">
              ${lesson.words
                .map(
                  (word) => `
                    <div>
                      <dt lang="ja">${escapeHtml(word.term)}</dt>
                      <dd>${escapeHtml(word.meaning)}</dd>
                    </div>`,
                )
                .join("")}
            </dl>
          </section>
          <div class="study-notes">
            <section class="variation-block">
              <div class="note-label">换着说</div>
              <p>${escapeHtml(lesson.variation)}</p>
            </section>
            <section class="remember-block">
              <div class="note-label">记住</div>
              <p>${escapeHtml(lesson.note)}</p>
            </section>
          </div>
        </div>
      </details>
    </article>`;
}

function chapterMarkup(chapter, index) {
  const items = lessons.filter(
    (lesson) => Number(lesson.number) >= chapter.start && Number(lesson.number) <= chapter.end,
  );
  return `
    <section class="chapter-section accent-${chapter.accent}" id="chapter-${chapter.id}" data-chapter-section="${chapter.id}">
      <header class="chapter-heading">
        <div class="chapter-index">第${String(index + 1).padStart(2, "0")}章</div>
        <div>
          <p class="chapter-kana" lang="ja">${chapter.kana}</p>
          <h2>${chapter.title}</h2>
          <p>${chapter.description}</p>
        </div>
        <div class="chapter-range">${String(chapter.start).padStart(2, "0")} — ${String(chapter.end).padStart(2, "0")}</div>
      </header>
      <div class="lesson-list">
        ${items.map(lessonMarkup).join("")}
      </div>
    </section>`;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#173245">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="日语核心表达">
  <meta name="description" content="${TOTAL_LESSONS}句从零基础到 N3 的日语核心表达互动教材：读音、中文、拼句、逐词拆解、替换练习与记忆提示。">
  <link rel="manifest" href="/japanese/manifest.webmanifest">
  <link rel="prefetch" href="/japanese/words" as="document">
  <link rel="prefetch" href="/japanese/test" as="document">
  <link rel="icon" type="image/png" sizes="32x32" href="/japanese/icon-32.png?v=2">
  <link rel="apple-touch-icon" sizes="180x180" href="/japanese/icon-180.png?v=2">
  <title>日语零基础核心表达｜互动教材</title>
  <style>
    :root {
      --paper: #f4f0e5;
      --paper-light: #fbfaf5;
      --paper-deep: #e9e3d3;
      --ink: #1d2832;
      --ink-soft: #54616a;
      --indigo: #23445d;
      --indigo-deep: #173245;
      --vermilion: #bd4435;
      --gold: #c39438;
      --moss: #6f8067;
      --line: rgba(31, 48, 59, 0.16);
      --shadow: 0 12px 34px rgba(35, 50, 59, 0.09);
      --radius: 14px;
      --font-sans: "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans CJK JP", "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
      --font-serif: "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", "Songti SC", serif;
    }

    * { box-sizing: border-box; }
    @view-transition { navigation: auto; }
    ::view-transition-old(root) { animation: module-fade-out 90ms ease-out both; }
    ::view-transition-new(root) { animation: module-fade-in 140ms ease-out both; }
    @keyframes module-fade-out { to { opacity: 0.82; } }
    @keyframes module-fade-in { from { opacity: 0.82; } }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: var(--font-sans);
      background-color: var(--paper);
      background-image:
        linear-gradient(rgba(73, 88, 96, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(73, 88, 96, 0.025) 1px, transparent 1px),
        radial-gradient(circle at 18% 5%, rgba(255,255,255,0.86), transparent 31%);
      background-size: 28px 28px, 28px 28px, auto;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }

    button, input { font: inherit; }
    button { color: inherit; }
    button, a, summary { touch-action: manipulation; }
    a { color: inherit; }

    .skip-link {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 100;
      padding: 10px 14px;
      color: white;
      background: var(--indigo-deep);
      border-radius: 6px;
      transform: translateY(-150%);
    }
    .skip-link:focus { transform: translateY(0); }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 62px;
      padding: 8px clamp(18px, 4vw, 58px);
      border-bottom: 1px solid var(--line);
      background: rgba(244, 240, 229, 0.97);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      text-decoration: none;
    }
    .brand-seal {
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border: 2px solid var(--vermilion);
      color: var(--vermilion);
      font-family: var(--font-serif);
      font-size: 17px;
      font-weight: 700;
      line-height: 1;
      transform: rotate(-2deg);
    }
    .brand-copy strong,
    .brand-copy small { display: block; }
    .brand-copy strong {
      font-family: var(--font-serif);
      font-size: 15px;
      letter-spacing: 0.08em;
    }
    .brand-copy small {
      color: var(--ink-soft);
      font-size: 9px;
      letter-spacing: 0.17em;
      text-transform: uppercase;
    }

    .module-switcher {
      position: absolute;
      left: 50%;
      display: flex;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: rgba(251, 250, 245, 0.8);
      transform: translateX(-50%);
    }
    .module-switcher a {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      padding: 0 13px;
      border-radius: 7px;
      color: var(--ink-soft);
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
      white-space: nowrap;
    }
    .module-switcher a:hover { color: var(--indigo-deep); }
    .module-switcher a:focus-visible {
      outline: 3px solid rgba(35, 68, 93, 0.2);
      outline-offset: 2px;
    }
    .module-switcher a[aria-current="page"] {
      color: white;
      background: var(--indigo-deep);
      box-shadow: 0 5px 14px rgba(23, 50, 69, 0.16);
    }

    .top-progress {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .sync-trigger {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      gap: 8px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: pointer;
      color: var(--ink);
      background: rgba(251, 250, 245, 0.8);
    }
    .sync-trigger:hover { border-color: var(--indigo); }
    .sync-trigger:focus-visible {
      outline: 3px solid rgba(35, 68, 93, 0.2);
      outline-offset: 2px;
    }
    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9ba3a7;
      box-shadow: 0 0 0 3px rgba(155, 163, 167, 0.14);
    }
    .sync-dot[data-state="syncing"] {
      background: var(--gold);
      box-shadow: 0 0 0 3px rgba(195, 148, 56, 0.16);
    }
    .sync-dot[data-state="synced"] {
      background: var(--moss);
      box-shadow: 0 0 0 3px rgba(111, 128, 103, 0.16);
    }
    .sync-dot[data-state="error"] {
      background: var(--vermilion);
      box-shadow: 0 0 0 3px rgba(189, 68, 53, 0.14);
    }
    .sync-label {
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .top-progress-copy {
      text-align: right;
      line-height: 1.25;
    }
    .top-progress-copy small,
    .top-progress-copy strong { display: block; }
    .top-progress-copy small {
      color: var(--ink-soft);
      font-size: 10px;
      letter-spacing: 0.12em;
    }
    .top-progress-copy strong { font-size: 13px; }
    .progress-ring {
      --progress: 0deg;
      display: grid;
      width: 38px;
      height: 38px;
      place-items: center;
      border-radius: 50%;
      background: conic-gradient(var(--vermilion) var(--progress), var(--paper-deep) 0);
    }
    .progress-ring::after {
      content: "";
      width: 28px;
      height: 28px;
      border-radius: inherit;
      background: var(--paper-light);
    }

    .hero {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
      min-height: 610px;
      overflow: hidden;
      border-bottom: 1px solid var(--line);
    }
    .hero::before {
      content: "";
      position: absolute;
      right: 12%;
      bottom: -170px;
      width: 420px;
      height: 420px;
      border: 1px solid rgba(244, 240, 229, 0.18);
      border-radius: 50%;
      box-shadow: 0 0 0 55px rgba(244, 240, 229, 0.035), 0 0 0 110px rgba(244, 240, 229, 0.025);
      pointer-events: none;
    }
    .hero-main {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 80px clamp(24px, 7vw, 110px) 90px;
      background: var(--paper-light);
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 28px;
      color: var(--vermilion);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .eyebrow::before {
      content: "";
      width: 34px;
      height: 2px;
      background: currentColor;
    }
    h1 {
      max-width: 760px;
      margin: 0;
      font-family: var(--font-serif);
      font-size: clamp(52px, 7vw, 94px);
      font-weight: 600;
      letter-spacing: -0.06em;
      line-height: 1.05;
    }
    h1 em {
      color: var(--indigo);
      font-style: normal;
    }
    .hero-lead {
      max-width: 640px;
      margin: 28px 0 0;
      color: var(--ink-soft);
      font-size: clamp(16px, 1.5vw, 19px);
    }
    .hero-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 28px;
      margin-top: 42px;
    }
    .hero-stats div {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 8px;
      align-items: baseline;
    }
    .hero-stats strong {
      color: var(--indigo);
      font-family: var(--font-serif);
      font-size: 25px;
    }
    .hero-stats span {
      color: var(--ink-soft);
      font-size: 12px;
      letter-spacing: 0.05em;
    }

    .hero-side {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      overflow: hidden;
      color: var(--paper-light);
      background-color: var(--indigo);
      background-image:
        repeating-linear-gradient(45deg, transparent 0 17px, rgba(255,255,255,0.025) 17px 18px),
        linear-gradient(145deg, rgba(255,255,255,0.06), transparent 45%);
    }
    .vertical-title {
      z-index: 1;
      margin: 0;
      font-family: var(--font-serif);
      font-size: clamp(29px, 4vw, 51px);
      letter-spacing: 0.15em;
      line-height: 1.45;
      writing-mode: vertical-rl;
    }
    .vertical-title span {
      display: block;
      margin-inline-start: 18px;
      color: rgba(255,255,255,0.64);
      font-family: var(--font-sans);
      font-size: 11px;
      letter-spacing: 0.35em;
    }
    .hero-stamp {
      position: absolute;
      right: 15%;
      bottom: 14%;
      display: grid;
      width: 92px;
      height: 92px;
      place-items: center;
      border: 3px double rgba(255,255,255,0.74);
      border-radius: 50%;
      color: white;
      font-family: var(--font-serif);
      font-size: 18px;
      letter-spacing: 0.12em;
      line-height: 1.15;
      text-align: center;
      transform: rotate(7deg);
    }

    .control-wrap {
      position: relative;
      z-index: 5;
      max-width: 1220px;
      margin: -38px auto 0;
      padding: 0 24px;
    }
    .controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(251, 250, 245, 0.96);
      box-shadow: var(--shadow);
    }
    .search-box {
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-box span {
      position: absolute;
      left: 15px;
      color: var(--ink-soft);
      font-size: 18px;
      pointer-events: none;
    }
    .search-box input {
      width: 100%;
      height: 46px;
      padding: 0 16px 0 43px;
      border: 1px solid var(--line);
      border-radius: 8px;
      outline: none;
      color: var(--ink);
      background: white;
    }
    .search-box input:focus {
      border-color: var(--indigo);
      box-shadow: 0 0 0 3px rgba(35, 68, 93, 0.12);
    }
    .control-button {
      min-height: 46px;
      padding: 0 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: pointer;
      background: var(--paper-light);
      transition: 160ms ease;
    }
    .control-button:hover { border-color: var(--indigo); transform: translateY(-1px); }
    .control-button:focus-visible {
      outline: 3px solid rgba(35, 68, 93, 0.2);
      outline-offset: 2px;
    }
    .control-button.primary {
      border-color: var(--indigo);
      color: white;
      background: var(--indigo);
    }
    .search-status {
      grid-column: 1 / -1;
      min-height: 18px;
      margin: -2px 4px 0;
      color: var(--ink-soft);
      font-size: 12px;
    }

    .page-layout {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: clamp(28px, 5vw, 70px);
      max-width: 1220px;
      margin: 0 auto;
      padding: 76px 24px 100px;
    }
    .chapter-nav {
      position: sticky;
      top: 88px;
      align-self: start;
    }
    .chapter-nav > p {
      margin: 0 0 16px;
      color: var(--ink-soft);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .chapter-filter {
      display: grid;
      grid-template-columns: 25px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;
      width: 100%;
      padding: 9px 8px;
      border: 0;
      border-bottom: 1px solid var(--line);
      cursor: pointer;
      text-align: left;
      background: transparent;
      transition: 150ms ease;
    }
    .chapter-filter:hover { padding-left: 12px; color: var(--vermilion); }
    .chapter-filter[aria-pressed="true"] {
      color: white;
      background: var(--indigo);
      border-bottom-color: var(--indigo);
    }
    .chapter-filter .nav-index {
      color: var(--vermilion);
      font-family: var(--font-serif);
      font-size: 12px;
    }
    .chapter-filter[aria-pressed="true"] .nav-index { color: #f0c6bd; }
    .chapter-filter .nav-title { font-size: 13px; font-weight: 650; }
    .chapter-filter .nav-count {
      color: var(--ink-soft);
      font-size: 10px;
    }
    .chapter-filter[aria-pressed="true"] .nav-count { color: rgba(255,255,255,0.66); }
    .chapter-filter.all-filter { margin-bottom: 7px; border-top: 1px solid var(--line); }

    .content { min-width: 0; }
    .chapter-section {
      --chapter-accent: var(--vermilion);
      scroll-margin-top: 96px;
      margin-bottom: 86px;
      content-visibility: auto;
      contain-intrinsic-size: auto 1400px;
    }
    .chapter-section.accent-blue { --chapter-accent: #426d88; }
    .chapter-section.accent-gold { --chapter-accent: var(--gold); }
    .chapter-section.accent-green { --chapter-accent: var(--moss); }
    .chapter-heading {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr) auto;
      gap: 22px;
      align-items: end;
      margin-bottom: 24px;
      padding-bottom: 22px;
      border-bottom: 2px solid var(--chapter-accent);
    }
    .chapter-index {
      display: grid;
      width: 64px;
      height: 64px;
      place-items: center;
      border: 1px solid var(--chapter-accent);
      color: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 13px;
      letter-spacing: 0.06em;
      transform: rotate(-1deg);
    }
    .chapter-kana {
      margin: 0 0 2px;
      color: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.13em;
    }
    .chapter-heading h2 {
      margin: 0;
      font-family: var(--font-serif);
      font-size: clamp(27px, 3vw, 39px);
      font-weight: 600;
      line-height: 1.25;
    }
    .chapter-heading p:last-child {
      max-width: 620px;
      margin: 7px 0 0;
      color: var(--ink-soft);
      font-size: 13px;
    }
    .chapter-range {
      align-self: center;
      color: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 13px;
      letter-spacing: 0.13em;
    }

    .lesson-list { display: grid; gap: 14px; }
    .lesson-shell {
      position: relative;
      scroll-margin-top: 90px;
    }
    .lesson-shell.is-hidden { display: none; }
    .lesson-shell.is-learned .lesson-card { border-color: rgba(111, 128, 103, 0.55); }
    .lesson-shell.is-learned .lesson-number { background: var(--moss); }
    .lesson-card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(251, 250, 245, 0.87);
      box-shadow: 0 3px 0 rgba(31, 48, 59, 0.035);
      contain: layout paint style;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .lesson-card:hover {
      border-color: rgba(35, 68, 93, 0.32);
      box-shadow: 0 9px 24px rgba(35, 50, 59, 0.07);
    }
    .lesson-card[open] { background: var(--paper-light); }
    .lesson-card summary {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 54px;
      gap: 18px;
      align-items: center;
      min-height: 126px;
      padding: 22px 86px 22px 22px;
      cursor: pointer;
      list-style: none;
    }
    .lesson-card summary::-webkit-details-marker { display: none; }
    .lesson-card summary:focus-visible {
      outline: 3px solid rgba(35, 68, 93, 0.2);
      outline-offset: -4px;
    }
    .lesson-number {
      display: grid;
      width: 44px;
      height: 44px;
      place-items: center;
      border-radius: 50%;
      color: white;
      background: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 14px;
      transition: background 160ms ease;
    }
    .summary-copy { display: block; min-width: 0; }
    .jp-phrase,
    .reading,
    .translation { display: block; }
    .jp-phrase {
      font-family: var(--font-serif);
      font-size: clamp(21px, 2.4vw, 29px);
      font-weight: 600;
      line-height: 1.4;
    }
    .reading {
      margin-top: 3px;
      color: var(--chapter-accent);
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .translation {
      margin-top: 7px;
      color: var(--ink-soft);
      font-size: 14px;
    }
    .open-cue {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      color: var(--ink-soft);
    }
    .open-cue i {
      position: relative;
      display: block;
      width: 20px;
      height: 20px;
    }
    .open-cue i::before,
    .open-cue i::after {
      content: "";
      position: absolute;
      top: 9px;
      left: 2px;
      width: 16px;
      height: 1px;
      background: currentColor;
      transition: transform 180ms ease;
    }
    .open-cue i::after { transform: rotate(90deg); }
    .lesson-card[open] .open-cue i::after { transform: rotate(0); }
    .open-cue em {
      font-style: normal;
      font-size: 9px;
      letter-spacing: 0.12em;
    }
    .learn-toggle {
      position: absolute;
      z-index: 3;
      top: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 4px 9px;
      border: 1px solid var(--line);
      border-radius: 5px;
      cursor: pointer;
      color: var(--ink-soft);
      background: rgba(251, 250, 245, 0.94);
      transition: 150ms ease;
    }
    .learn-toggle:hover { border-color: var(--moss); color: var(--moss); }
    .learn-toggle:focus-visible {
      outline: 3px solid rgba(111, 128, 103, 0.22);
      outline-offset: 2px;
    }
    .checkmark { font-size: 12px; opacity: 0.4; }
    .learn-label { font-size: 10px; }
    .learn-toggle[aria-pressed="true"] {
      border-color: var(--moss);
      color: white;
      background: var(--moss);
    }
    .learn-toggle[aria-pressed="true"] .checkmark { opacity: 1; }

    .lesson-detail {
      display: grid;
      gap: 28px;
      padding: 8px 28px 30px 88px;
      border-top: 1px dashed var(--line);
    }
    .micro-heading {
      margin-bottom: 12px;
      color: var(--ink-soft);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.15em;
    }
    .micro-heading span {
      margin-right: 8px;
      color: var(--chapter-accent);
      font-family: var(--font-serif);
    }
    .formula {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .formula span {
      padding: 7px 11px;
      border: 1px solid color-mix(in srgb, var(--chapter-accent) 34%, transparent);
      border-radius: 4px;
      color: var(--ink);
      background: color-mix(in srgb, var(--chapter-accent) 8%, white);
      font-size: 13px;
    }
    .formula b {
      color: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 15px;
      font-weight: 400;
    }
    .word-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--line);
    }
    .word-grid > div {
      min-width: 0;
      padding: 14px 16px 15px;
      background: white;
    }
    .word-grid dt {
      color: var(--chapter-accent);
      font-family: var(--font-serif);
      font-size: 15px;
      font-weight: 700;
    }
    .word-grid dd {
      margin: 5px 0 0;
      color: var(--ink-soft);
      font-size: 12px;
    }
    .study-notes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .study-notes section {
      position: relative;
      min-height: 100px;
      padding: 19px 18px 15px;
      border-radius: 8px;
    }
    .variation-block { background: #e5edf0; }
    .remember-block { background: #f1e4cf; }
    .note-label {
      display: inline-block;
      margin-bottom: 7px;
      padding-bottom: 2px;
      border-bottom: 2px solid currentColor;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .variation-block .note-label { color: var(--indigo); }
    .remember-block .note-label { color: #8e6324; }
    .study-notes p {
      margin: 0;
      color: #3f4c54;
      font-size: 12px;
    }

    .empty-state {
      display: none;
      padding: 70px 20px;
      border: 1px dashed var(--line);
      text-align: center;
      background: rgba(251,250,245,0.7);
    }
    .empty-state.is-visible { display: block; }
    .empty-state strong {
      display: block;
      font-family: var(--font-serif);
      font-size: 24px;
    }
    .empty-state p { margin: 6px 0 0; color: var(--ink-soft); }

    .page-footer {
      padding: 42px 24px;
      border-top: 1px solid var(--line);
      color: var(--paper-light);
      background: var(--indigo-deep);
      text-align: center;
    }
    .page-footer strong {
      display: block;
      font-family: var(--font-serif);
      font-size: 21px;
      letter-spacing: 0.08em;
    }
    .page-footer p {
      margin: 7px 0 0;
      color: rgba(255,255,255,0.62);
      font-size: 11px;
      letter-spacing: 0.08em;
    }

    dialog {
      width: min(680px, calc(100% - 32px));
      max-height: min(780px, calc(100dvh - 32px));
      padding: 0;
      overflow: auto;
      border: 0;
      border-radius: 12px;
      color: var(--ink);
      background: var(--paper-light);
      box-shadow: 0 30px 90px rgba(23, 50, 69, 0.28);
    }
    dialog::backdrop {
      background: rgba(22, 34, 42, 0.58);
      backdrop-filter: blur(4px);
    }
    .dialog-card { padding: clamp(22px, 4vw, 38px); }
    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 26px;
    }
    .dialog-kicker {
      margin: 0 0 5px;
      color: var(--vermilion);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }
    .dialog-header h2 {
      margin: 0;
      font-family: var(--font-serif);
      font-size: clamp(27px, 5vw, 36px);
      line-height: 1.2;
    }
    .dialog-close {
      display: grid;
      flex: 0 0 auto;
      width: 44px;
      height: 44px;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: pointer;
      background: transparent;
      font-size: 22px;
    }
    .dialog-close:hover { border-color: var(--indigo); }
    .dialog-intro {
      margin: -10px 0 22px;
      color: var(--ink-soft);
      font-size: 14px;
    }
    .field-label {
      display: block;
      margin-bottom: 7px;
      font-size: 12px;
      font-weight: 800;
    }
    .kana-answer {
      width: 100%;
      min-height: 48px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      outline: none;
      color: var(--ink);
      background: white;
    }
    .kana-answer:focus {
      border-color: var(--indigo);
      box-shadow: 0 0 0 3px rgba(35, 68, 93, 0.12);
    }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .dialog-button {
      min-height: 44px;
      padding: 0 15px;
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: pointer;
      background: var(--paper-light);
    }
    .dialog-button:hover { border-color: var(--indigo); }
    .dialog-button.primary {
      border-color: var(--indigo);
      color: white;
      background: var(--indigo);
    }
    .dialog-button.danger { color: var(--vermilion); }
    .dialog-button:disabled { cursor: not-allowed; opacity: 0.5; }
    .quiz-total-stats {
      margin: -10px 0 20px;
      padding: 12px 14px;
      border-left: 3px solid var(--moss);
      color: #47534b;
      background: #e8eee7;
      font-size: 13px;
    }
    .quiz-modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .quiz-mode {
      min-height: 132px;
      padding: 17px;
      border: 1px solid var(--line);
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
      background: white;
      transition: 160ms ease;
    }
    .quiz-mode:hover {
      border-color: var(--indigo);
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(35, 50, 59, 0.08);
    }
    .quiz-mode strong,
    .quiz-mode span { display: block; }
    .quiz-mode strong {
      margin-bottom: 6px;
      font-family: var(--font-serif);
      font-size: 18px;
    }
    .quiz-mode span { color: var(--ink-soft); font-size: 12px; }
    .quiz-mode.recommended {
      border-color: rgba(189, 68, 53, 0.42);
      background: #fbf4ef;
    }
    .quiz-toolbar {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 20px;
      color: var(--ink-soft);
      font-size: 12px;
      font-weight: 700;
    }
    .quiz-mode-label {
      display: inline-block;
      margin-bottom: 9px;
      padding: 3px 9px;
      border-radius: 999px;
      color: var(--indigo);
      background: #e5edf0;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .quiz-prompt-label {
      margin: 0 0 8px;
      color: var(--ink-soft);
      font-size: 12px;
    }
    .quiz-prompt {
      min-height: 90px;
      margin: 0 0 20px;
      font-family: var(--font-serif);
      font-size: clamp(29px, 6vw, 43px);
      line-height: 1.45;
    }
    .answer-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }
    .meaning-choices {
      display: grid;
      gap: 9px;
    }
    .meaning-choice {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      align-items: center;
      min-height: 52px;
      gap: 10px;
      padding: 8px 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      background: white;
    }
    .meaning-choice:hover { border-color: var(--indigo); }
    .meaning-choice.is-correct {
      border-color: var(--moss);
      background: #e7efe4;
    }
    .meaning-choice.is-wrong {
      border-color: var(--vermilion);
      background: #f8e5df;
    }
    .choice-index {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border-radius: 50%;
      color: white;
      background: var(--indigo);
      font-size: 11px;
      font-weight: 800;
    }
    .quiz-feedback {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 8px;
      font-size: 13px;
    }
    .quiz-feedback.is-correct { background: #e7efe4; }
    .quiz-feedback.is-wrong { background: #f8e5df; }
    .quiz-feedback strong,
    .quiz-feedback small { display: block; }
    .quiz-feedback p { margin: 5px 0 0; }
    .quiz-feedback small { margin-top: 4px; color: var(--ink-soft); }
    .quiz-next-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 14px;
    }
    .summary-card {
      padding: 34px 22px;
      border: 1px solid var(--line);
      border-radius: 12px;
      text-align: center;
      background: #f3ead8;
    }
    .summary-card p { margin: 0; color: var(--ink-soft); font-size: 12px; }
    .summary-score {
      display: block;
      margin: 6px 0 10px;
      color: var(--vermilion);
      font-family: var(--font-serif);
      font-size: 54px;
      line-height: 1.1;
    }
    .summary-message { font-size: 14px !important; }
    [hidden] { display: none !important; }

    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; min-height: 0; }
      .hero-main { min-height: 530px; padding-bottom: 110px; }
      .hero-side { min-height: 185px; justify-content: flex-start; padding: 28px 30px; }
      .vertical-title { font-size: 29px; writing-mode: horizontal-tb; }
      .vertical-title span { display: inline; margin: 0 0 0 18px; }
      .hero-stamp { right: 9%; bottom: 18%; width: 72px; height: 72px; font-size: 15px; }
      .control-wrap { margin-top: -31px; }
      .page-layout { grid-template-columns: 1fr; padding-top: 42px; }
      .chapter-nav {
        position: sticky;
        top: 61px;
        z-index: 20;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        margin: 0 -24px;
        padding: 10px 24px;
        background: rgba(244, 240, 229, 0.98);
        scrollbar-width: none;
      }
      .chapter-nav::-webkit-scrollbar { display: none; }
      .chapter-nav > p { display: none; }
      .chapter-filter {
        grid-template-columns: auto;
        flex: 0 0 auto;
        width: auto;
        min-height: 38px;
        padding: 7px 12px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--paper-light);
      }
      .chapter-filter:hover { padding-left: 12px; }
      .chapter-filter .nav-index,
      .chapter-filter .nav-count { display: none; }
      .chapter-filter.all-filter { margin: 0; border-top: 1px solid var(--line); }
    }

    @media (max-width: 680px) {
      .topbar { min-height: 56px; padding-inline: 15px; }
      .brand-copy small { display: none; }
      .module-switcher { position: static; transform: none; }
      .module-switcher a { min-height: 32px; padding-inline: 10px; font-size: 10px; }
      .top-progress-copy { display: none; }
      .top-actions { gap: 7px; }
      .sync-trigger { min-height: 40px; padding-inline: 9px; }
      .sync-label { font-size: 11px; }
      .hero-main { min-height: 480px; padding: 62px 22px 92px; }
      h1 { font-size: clamp(45px, 14vw, 66px); }
      .hero-lead { margin-top: 22px; font-size: 15px; }
      .hero-stats { margin-top: 28px; gap: 8px 20px; }
      .hero-side { min-height: 140px; padding: 22px; }
      .hero-stamp { width: 61px; height: 61px; font-size: 13px; }
      .control-wrap { padding: 0 14px; }
      .controls { grid-template-columns: 1fr 1fr; padding: 11px; }
      .search-box { grid-column: 1 / -1; }
      .control-button { padding-inline: 10px; font-size: 12px; }
      .page-layout { padding: 34px 14px 72px; }
      .chapter-nav { top: 55px; margin-inline: -14px; padding-inline: 14px; }
      .chapter-section { margin-bottom: 64px; }
      .chapter-heading {
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 14px;
        align-items: start;
      }
      .chapter-index { width: 48px; height: 48px; font-size: 11px; }
      .chapter-range { display: none; }
      .chapter-heading h2 { font-size: 26px; }
      .lesson-card summary {
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 12px;
        min-height: 132px;
        padding: 40px 15px 18px;
      }
      .lesson-number { width: 34px; height: 34px; font-size: 11px; }
      .open-cue { display: none; }
      .jp-phrase { font-size: 21px; }
      .learn-toggle { top: 8px; right: 9px; min-height: 27px; }
      .learn-label { font-size: 9px; }
      .lesson-detail { padding: 18px 15px 22px; }
      .word-grid { grid-template-columns: 1fr; }
      .study-notes { grid-template-columns: 1fr; }
      dialog {
        width: calc(100% - 20px);
        max-height: calc(100dvh - 20px);
      }
      .dialog-card { padding: 20px 17px 24px; }
      .dialog-header { margin-bottom: 22px; }
      .answer-row { grid-template-columns: 1fr; }
      .quiz-modes { grid-template-columns: 1fr; }
      .quiz-mode { min-height: 92px; }
      .quiz-prompt { min-height: 70px; }
      .button-row .dialog-button { flex: 1 1 140px; }
    }

    @media (max-width: 520px) {
      .brand-copy { display: none; }
      .module-switcher a { padding-inline: 8px; }
      .sync-trigger { width: 40px; justify-content: center; }
      .sync-label, .top-progress { display: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition: none !important; }
      ::view-transition-old(root), ::view-transition-new(root) { animation: none !important; }
    }

    @media print {
      body { background: white; font-size: 10pt; }
      .topbar, .hero-side, .control-wrap, .chapter-nav, .learn-toggle, .page-footer, dialog { display: none !important; }
      .hero { display: block; min-height: 0; border: 0; }
      .hero-main { min-height: 0; padding: 20mm 15mm 12mm; }
      h1 { font-size: 38pt; }
      .page-layout { display: block; max-width: none; padding: 0 15mm; }
      .chapter-section { break-before: page; margin: 0; }
      .chapter-section { content-visibility: visible; contain-intrinsic-size: none; }
      .chapter-heading { margin-top: 10mm; }
      .lesson-shell { break-inside: avoid; }
      .lesson-card { box-shadow: none; }
      .lesson-card summary { min-height: 0; padding: 12px; }
      .lesson-card details { display: block; }
      details:not([open]) > *:not(summary) { display: block; }
      .lesson-detail { padding: 12px 12px 16px 62px; }
      .open-cue { display: none; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">跳到学习内容</a>
  <header class="topbar">
    <a class="brand" href="#top" aria-label="回到页面顶部">
      <span class="brand-seal" aria-hidden="true">言</span>
      <span class="brand-copy">
        <strong>ことば帖</strong>
        <small>Japanese phrase book</small>
      </span>
    </a>
    <nav class="module-switcher" aria-label="日语学习板块">
      <a href="/japanese" aria-current="page">核心表达</a>
      <a href="/japanese/words">单词闪卡</a>
      <a href="/japanese/test">词汇测试</a>
    </nav>
    <div class="top-actions">
      <button class="sync-trigger" id="sync-trigger" type="button" data-state="syncing" title="正在读取网站上的学习记录…">
        <span class="sync-dot" id="sync-dot" data-state="syncing" aria-hidden="true"></span>
        <span class="sync-label" id="sync-label">同步中</span>
      </button>
      <div class="top-progress" aria-live="polite">
        <span class="top-progress-copy">
          <small>学习进度</small>
          <strong><span id="learned-count">0</span> / ${TOTAL_LESSONS} 句</strong>
        </span>
        <span class="progress-ring" id="progress-ring" aria-hidden="true"></span>
      </div>
    </div>
  </header>

  <main id="main-content">
    <section class="hero" id="top">
      <div class="hero-main">
        <p class="eyebrow">Beginner to N3 · Core Expressions</p>
        <h1>日语核心表达<br><em>从零到 N3</em></h1>
        <p class="hero-lead">从问候、出行一路学到 N3 的推测、条件与复合表达，用「读音—拼句—逐词—替换」四步法把语法变成真正能开口的句子。</p>
        <div class="hero-stats" aria-label="教材概况">
          <div><strong>${TOTAL_LESSONS}</strong><span>核心表达</span></div>
          <div><strong>${TOTAL_CHAPTERS}</strong><span>学习章节</span></div>
          <div><strong>4</strong><span>拆解步骤</span></div>
        </div>
      </div>
      <div class="hero-side" aria-hidden="true">
        <p class="vertical-title" lang="ja">日本語・基礎表現<span>一文ずつ、身につける。</span></p>
        <div class="hero-stamp">初級<br>至 N3</div>
      </div>
    </section>

    <div class="control-wrap">
      <div class="controls" role="search">
        <label class="search-box">
          <span aria-hidden="true">⌕</span>
          <input id="lesson-search" type="search" placeholder="搜索日语、读音、中文或语法…" autocomplete="off" aria-label="搜索课程内容">
        </label>
        <button class="control-button" id="expand-toggle" type="button">全部展开</button>
        <button class="control-button primary" id="random-review" type="button">开始小测试</button>
        <div class="search-status" id="search-status" aria-live="polite">显示全部 ${TOTAL_LESSONS} 条表达</div>
      </div>
    </div>

    <div class="page-layout">
      <nav class="chapter-nav" aria-label="章节筛选">
        <p>Chapter index</p>
        <button class="chapter-filter all-filter" type="button" data-filter="all" aria-pressed="true">
          <span class="nav-index">00</span><span class="nav-title">全部章节</span><span class="nav-count">${TOTAL_LESSONS}</span>
        </button>
        ${chapters
          .map(
            (chapter, index) => `
              <button class="chapter-filter" type="button" data-filter="${chapter.id}" aria-pressed="false">
                <span class="nav-index">${String(index + 1).padStart(2, "0")}</span>
                <span class="nav-title">${chapter.title}</span>
                <span class="nav-count">${chapter.end - chapter.start + 1}</span>
              </button>`,
          )
          .join("")}
      </nav>

      <div class="content">
        ${chapters.map(chapterMarkup).join("")}
        <div class="empty-state" id="empty-state">
          <strong>没有找到相符内容</strong>
          <p>试试输入更短的日语、假名、中文词或语法名称。</p>
        </div>
      </div>
    </div>
  </main>

  <dialog id="quiz-dialog" aria-labelledby="quiz-title">
    <div class="dialog-card">
      <header class="dialog-header">
        <div>
          <p class="dialog-kicker">Mini review</p>
          <h2 id="quiz-title">十题小测</h2>
        </div>
        <button class="dialog-close" type="button" data-close-dialog aria-label="关闭小测试">×</button>
      </header>

      <section id="quiz-setup">
        <p class="dialog-intro">系统会优先抽取练习次数较少的表达。若你正在搜索或筛选章节，小测只从当前内容中出题。</p>
        <p class="quiz-total-stats" id="quiz-total-stats">还没有测试记录，先从 10 题开始吧。</p>
        <div class="quiz-modes">
          <button class="quiz-mode recommended" type="button" data-quiz-mode="mixed">
            <strong>混合练习</strong>
            <span>输入假名与中文选择交替出现，推荐日常复习。</span>
          </button>
          <button class="quiz-mode" type="button" data-quiz-mode="kana-input">
            <strong>输入假名</strong>
            <span>看到日语表达，写出正确的假名读音。</span>
          </button>
          <button class="quiz-mode" type="button" data-quiz-mode="meaning-choice">
            <strong>选择中文</strong>
            <span>看到假名，从四个选项中选择中文释义。</span>
          </button>
        </div>
      </section>

      <section id="quiz-question" hidden>
        <div class="quiz-toolbar">
          <span id="quiz-counter">第 1 / 10 题</span>
          <span id="quiz-score">答对 0 题</span>
        </div>
        <span class="quiz-mode-label" id="quiz-mode-label">假名输入</span>
        <p class="quiz-prompt-label" id="quiz-prompt-label">请写出这句表达的假名读音</p>
        <p class="quiz-prompt" id="quiz-prompt" lang="ja"></p>
        <form id="kana-answer-form">
          <label class="field-label" for="kana-answer">你的答案</label>
          <div class="answer-row">
            <input
              class="kana-answer"
              id="kana-answer"
              type="text"
              lang="ja"
              inputmode="text"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="请输入平假名或片假名"
            >
            <button class="dialog-button primary" type="submit">确认答案</button>
          </div>
        </form>
        <div class="meaning-choices" id="meaning-choices" hidden></div>
        <div class="quiz-feedback" id="quiz-feedback" hidden aria-live="polite"></div>
        <div class="quiz-next-row">
          <button class="dialog-button primary" id="next-question" type="button" hidden>下一题</button>
        </div>
      </section>

      <section id="quiz-summary" hidden>
        <div class="summary-card">
          <p>本轮成绩</p>
          <strong class="summary-score" id="summary-score">0 / 10</strong>
          <p class="summary-message" id="summary-message"></p>
          <div class="button-row" style="justify-content:center">
            <button class="dialog-button primary" id="restart-quiz" type="button">再练十题</button>
            <button class="dialog-button" type="button" data-close-dialog>完成</button>
          </div>
        </div>
      </section>
    </div>
  </dialog>

  <footer class="page-footer">
    <strong lang="ja">毎日、少しずつ。</strong>
    <p>每天一点点，让 ${TOTAL_LESSONS} 句从入门到 N3 真正成为你的日语。</p>
  </footer>

  <script>
    window.__LESSON_DATA__ = ${JSON.stringify(lessonData)};
${clientScript}
  </script>
</body>
</html>`;

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(path.join(distDir, "words"), { recursive: true, force: true });
fs.mkdirSync(path.dirname(flashcardsOutputPath), { recursive: true });
fs.writeFileSync(outputPath, html.replace(/[ \t]+$/gm, ""));
fs.writeFileSync(flashcardsOutputPath, flashcardsHtml);
fs.writeFileSync(testOutputPath, testHtml);
for (const fileName of [
  "manifest.webmanifest",
  "sw.js",
  "icon-32.png",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "icon-1024.png",
]) {
  fs.copyFileSync(path.join(publicDir, fileName), path.join(distDir, fileName));
}
console.log(`已生成 ${lessons.length} 条核心表达与 ${TOTAL_FLASHCARDS} 张单词闪卡 PWA：${distDir}`);
