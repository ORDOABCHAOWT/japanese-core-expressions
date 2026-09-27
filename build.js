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
const themeCss = fs.readFileSync(path.join(projectDir, "ui", "theme.css"), "utf8");
const commonScript = fs.readFileSync(path.join(projectDir, "ui", "common.js"), "utf8");
const KotobaUI = require("./ui/common.js");
const baseCardsMatch = flashcardsTemplate.match(/const cards = (\[[\s\S]*?\n\]);\nconst n3Cards/);

if (!baseCardsMatch) {
  throw new Error("单词闪卡模板缺少基础词卡数据。" );
}

const baseFlashcards = new Function(`"use strict"; return ${baseCardsMatch[1]}`)();
const categoryMetaMatch = flashcardsTemplate.match(/const categoryMeta = (\[[\s\S]*?\n\]);/);
if (!categoryMetaMatch) {
  throw new Error("单词闪卡模板缺少分类数据。");
}
const categoryMarks = Object.fromEntries(
  new Function(`"use strict"; return ${categoryMetaMatch[1]}`)().map((category) => [category.name, category.mark]),
);
const allFlashcards = [...baseFlashcards, ...n3Flashcards];
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
  },
  {
    id: "classroom",
    start: 15,
    end: 21,
    kana: "教室で",
    title: "课堂求助与确认",
    description: "听不清、问意思、确认方式，以及「大丈夫」的场景判断。",
  },
  {
    id: "introduction",
    start: 22,
    end: 34,
    kana: "自己紹介",
    title: "自我介绍",
    description: "姓名、身份、家人、来自哪里，以及目前住在哪里。",
  },
  {
    id: "place",
    start: 35,
    end: 44,
    kana: "もの・場所",
    title: "物品、地点与存在",
    description: "指示词、方位词，以及「あります／います」的基础用法。",
  },
  {
    id: "description",
    start: 45,
    end: 54,
    kana: "形容・気持ち",
    title: "描述与感受",
    description: "い形容词、な形容词，以及喜欢、擅长和想要。",
  },
  {
    id: "actions",
    start: 55,
    end: 65,
    kana: "毎日の動作",
    title: "日常动作与频率",
    description: "ます形的肯定、否定、过去时，以及时间和频率表达。",
  },
  {
    id: "shopping",
    start: 66,
    end: 71,
    kana: "店で",
    title: "点餐与购物",
    description: "提出需要、选择商品、询问价格、结账和婉拒购物袋。",
  },
  {
    id: "travel",
    start: 72,
    end: 79,
    kana: "移動・誘い",
    title: "出行与邀约",
    description: "目的地、交通工具、上下车，以及邀请和共同提议。",
  },
  {
    id: "advanced",
    start: 80,
    end: 86,
    kana: "できること",
    title: "请求与进阶表达",
    description: "请求、许可、禁止、愿望、能力、经历，以及原因说明。",
  },
  {
    id: "n3-habits",
    start: 87,
    end: 96,
    kana: "習慣・予定",
    title: "N3 习惯、计划与义务",
    description: "表达长期习惯、个人计划、既定安排、建议、义务与尝试。",
  },
  {
    id: "n3-evidence",
    start: 97,
    end: 106,
    kana: "推測・伝聞",
    title: "N3 推测、传闻与转述",
    description: "区分可能性、依据判断、外观、传闻、引用与转折。",
  },
  {
    id: "n3-aspect",
    start: 107,
    end: 116,
    kana: "時間・進行",
    title: "N3 时间、状态与进程",
    description: "掌握事前准备、结果状态、动作阶段、期间与同时进行。",
  },
  {
    id: "n3-condition",
    start: 117,
    end: 126,
    kana: "条件・目的",
    title: "N3 条件、原因与目的",
    description: "比较「たら・ば・と・なら」，并表达让步、原因、目的与程度。",
  },
  {
    id: "n3-combination",
    start: 127,
    end: 136,
    kana: "複合表現",
    title: "N3 复合表达与话题组织",
    description: "描述难易、过度、动作起止、限定，以及正式话题关系。",
  },
];

const TOTAL_LESSONS = lessons.length;
const TOTAL_CHAPTERS = chapters.length;
const TOTAL_FLASHCARDS = baseFlashcards.length + n3Flashcards.length;
const { ICON, mixed } = KotobaUI;

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
const chapterData = chapters.map((chapter) => ({
  id: chapter.id,
  start: chapter.start,
  end: chapter.end,
  kana: chapter.kana,
  title: chapter.title,
  descriptionHtml: mixed(chapter.description),
}));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const pad2 = (value) => String(value).padStart(2, "0");
const scriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function splitGloss(value) {
  const match = String(value).match(/^(.*?)（(.*?)）\s*$/);
  return match ? [match[1].trim(), match[2].trim()] : [String(value).trim(), ""];
}

/* ============================================================
   共享外壳：三个模块的顶栏、手机标签栏、快捷键说明完全一致
   ============================================================ */
const MODULES = [
  {
    id: "core",
    href: "/japanese",
    label: "核心表达",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5.5c2.6-1.4 6-1.3 9.5.6 3.5-1.9 6.9-2 9.5-.6v13c-2.6-1.4-6-1.3-9.5.6-3.5-1.9-6.9-2-9.5-.6z"/><path d="M12 6.1v13"/></svg>',
  },
  {
    id: "words",
    href: "/japanese/words",
    label: "单词闪卡",
    badge: "words",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.5" y="3" width="13" height="16" rx="2.5"/><path d="M4 7.5v11A2.5 2.5 0 0 0 6.5 21h9"/></svg>',
  },
  {
    id: "test",
    href: "/japanese/test",
    label: "词汇测试",
    badge: "test",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  },
];
const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
const KEYBOARD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/></svg>';
const SHORTCUTS = {
  core: [["上一句 / 下一句", ["↑", "↓"]], ["朗读当前句", ["空格"]], ["标记 / 取消已掌握", ["M"]], ["搜索全部表达", ["/"]], ["清除搜索、关闭详情", ["Esc"]]],
  words: [["翻面", ["空格"]], ["上一张 / 下一张", ["←", "→"]], ["再练 / 模糊 / 认识", ["1", "2", "3"]], ["朗读", ["P"]]],
  test: [["提交答案", ["Enter"]], ["下一题", ["Enter"]]],
};

function moduleLink(module, current, withIcon) {
  const currentAttr = module.id === current ? ' aria-current="page"' : "";
  const badge = module.badge ? `<span class="pill" data-badge="${module.badge}" hidden></span>` : "";
  return withIcon
    ? `<a href="${module.href}"${currentAttr}>${module.icon}<span>${module.label}</span>${badge}</a>`
    : `<a href="${module.href}"${currentAttr}>${module.label}${badge ? ` ${badge}` : ""}</a>`;
}

function syncButton(current) {
  if (current === "core") {
    return '<button class="sync" id="sync-trigger" type="button" data-state="syncing" title="正在读取网站上的学习记录…"><span class="sync-dot" id="sync-dot" data-state="syncing" aria-hidden="true"></span><span id="sync-label">同步中</span></button>';
  }
  return '<button class="sync" type="button" data-action="local-note" title="闪卡与测试进度保存在当前浏览器"><span class="sync-dot" data-state="local" aria-hidden="true"></span><span>本机保存</span></button>';
}

function shellTop(current) {
  return `<a class="skip-link" href="#main">跳到学习内容</a>
  <div class="status-strip" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="/japanese" aria-label="日语核心表达">
      <span class="seal" lang="ja" aria-hidden="true">言</span>
      <span><span class="brand-name">日语核心表达</span> <span class="brand-sub">零基础到 N3</span></span>
    </a>
    <nav class="seg module-tabs" aria-label="学习模块">${MODULES.map((module) => moduleLink(module, current, false)).join("")}</nav>
    <div class="top-actions">
      ${syncButton(current)}
      <button class="icon-btn" type="button" data-action="shortcuts" aria-label="键盘快捷键" title="键盘快捷键（?）">${KEYBOARD_ICON}</button>
    </div>
  </header>`;
}

function shellBottom(current) {
  const rows = SHORTCUTS[current]
    .map(([label, keys]) => `<div>${label}<span>${keys.map((key) => `<span class="kbd">${key}</span>`).join("")}</span></div>`)
    .join("");
  return `<nav class="tabbar" aria-label="学习模块">${MODULES.map((module) => moduleLink(module, current, true)).join("")}</nav>
  <dialog class="picker" id="picker" aria-labelledby="picker-title">
    <div class="modal-head"><h2 id="picker-title">选择</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="关闭">${ICON.x}</button></div>
    <div class="picker-list" id="picker-list"></div>
  </dialog>
  <dialog class="modal" id="shortcuts" aria-labelledby="shortcuts-title">
    <div class="modal-head"><h2 id="shortcuts-title">键盘快捷键</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="关闭">${ICON.x}</button></div>
    <div class="modal-body shortcut-table"><section>${rows}<div>显示本说明<span><span class="kbd">?</span></span></div></section></div>
  </dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

const SHELL_SLOTS = ["/* THEME_CSS */", "<!-- SHELL_TOP -->", "<!-- SHELL_BOTTOM -->", "/* COMMON_JS */"];
function applyShell(template, current) {
  const html = template
    .replace("/* THEME_CSS */", () => themeCss)
    .replace("<!-- SHELL_TOP -->", () => shellTop(current))
    .replace("<!-- SHELL_BOTTOM -->", () => shellBottom(current))
    .replace("/* COMMON_JS */", () => commonScript);
  const missing = SHELL_SLOTS.filter((slot) => html.includes(slot));
  if (missing.length) throw new Error(`${current} 模板缺少外壳注入点：${missing.join("、")}`);
  return html;
}

/* ============================================================
   单词闪卡与词汇测试
   ============================================================ */
const flashcardsSource = flashcardsTemplate.replace("const n3Cards = [];", () => `const n3Cards = ${JSON.stringify(n3Flashcards)};`);
if (flashcardsSource === flashcardsTemplate) {
  throw new Error("单词闪卡模板缺少 N3 内容注入点。");
}
const flashcardsHtml = applyShell(flashcardsSource, "words");

const testSource = testTemplate
  .replace("/* TEST_ALGORITHM */", () => testAlgorithm)
  .replace("const testCards = [];", () => `const testCards = ${JSON.stringify(allFlashcards)};`)
  .replace("const categoryMarks = {};", () => `const categoryMarks = ${JSON.stringify(categoryMarks)};`)
  .replace("/* TEST_CLIENT */", () => testClient);
if (testSource === testTemplate || testSource.includes("/* TEST_CLIENT */")) {
  throw new Error("词汇测试模板注入失败。");
}
const testHtml = applyShell(testSource, "test");

/* ============================================================
   核心表达
   ============================================================ */
function lessonChapter(number) {
  const value = Number(number);
  return chapters.find((chapter) => value >= chapter.start && value <= chapter.end);
}

function lessonSearchText(lesson) {
  return [
    lesson.japanese,
    lesson.reading,
    lesson.chinese,
    lesson.formula,
    lesson.variation,
    lesson.note,
    ...lesson.words.flatMap((word) => [word.term, word.meaning]),
  ].join(" ").toLowerCase();
}

function lessonRow(lesson) {
  return `<li><button class="phrase-row" type="button" id="lesson-${lesson.number}" data-lesson="${Number(lesson.number)}" data-search="${escapeHtml(lessonSearchText(lesson))}" aria-current="false">
        <span class="row-no">${pad2(lesson.number)}</span>
        <span class="row-text"><span class="row-jp" lang="ja">${escapeHtml(lesson.japanese)}</span><span class="row-zh">${escapeHtml(lesson.chinese)}</span></span>
        <span class="row-state" aria-hidden="true">${ICON.check}</span><span class="sr-only row-status">未掌握</span>
      </button></li>`;
}

function chapterList(chapter, index) {
  const items = lessons.filter((lesson) => Number(lesson.number) >= chapter.start && Number(lesson.number) <= chapter.end);
  return `<p class="group-label" data-group-label="${chapter.id}" hidden>第 ${index + 1} 章 · ${escapeHtml(chapter.title)}</p>
      <ol class="phrase-list" id="chapter-${chapter.id}" data-chapter-list="${chapter.id}"${index === 0 ? "" : " hidden"}>
      ${items.map(lessonRow).join("")}
      </ol>`;
}

function sideItem(chapter, index) {
  const count = chapter.end - chapter.start + 1;
  return `<button class="side-item" type="button" data-chapter="${chapter.id}" aria-current="${index === 0}"><span class="side-no">${pad2(index + 1)}</span><span class="side-title">${escapeHtml(chapter.title)}</span><span class="side-meta" data-chapter-meta="${chapter.id}">0/${count}</span></button>`;
}

function lessonTemplate(lesson) {
  const words = lesson.words.map((word) => {
    const [term, reading] = splitGloss(word.term);
    return `<div class="word"><dt><span lang="ja">${escapeHtml(term)}</span>${reading && reading !== term ? `<small lang="ja">${escapeHtml(reading)}</small>` : ""}</dt><dd>${mixed(word.meaning)}</dd></div>`;
  }).join("");
  const formula = lesson.formula.split("＋").map((piece) => {
    const [main, gloss] = splitGloss(piece);
    return `<span class="chip"><span>${mixed(main)}</span>${gloss ? `<small>${mixed(gloss)}</small>` : ""}</span>`;
  }).join('<span class="plus" aria-hidden="true">＋</span>');
  return `<template id="lesson-tpl-${lesson.number}">
    <div class="detail-hero">
      <p class="detail-jp" lang="ja" data-action="speak-lesson" title="点击朗读">${escapeHtml(lesson.japanese)}</p>
      <p class="detail-reading" lang="ja">${escapeHtml(lesson.reading)}</p>
      <p class="detail-zh">${escapeHtml(lesson.chinese)}</p>
    </div>
    <div class="detail-body">
      <section><h3 class="sec-title">句型拼装</h3><div class="formula">${formula}</div></section>
      <section><h3 class="sec-title">逐词拆解</h3><dl class="word-list">${words}</dl></section>
      <section class="notes"><div class="note"><h4>换着说</h4><p>${mixed(lesson.variation)}</p></div><div class="note warm"><h4>记住</h4><p>${mixed(lesson.note)}</p></div></section>
    </div>
  </template>`;
}

const firstChapter = chapters[0];
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f3ee" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121619" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="日语核心表达">
  <meta name="description" content="${TOTAL_LESSONS}句从零基础到 N3 的日语核心表达互动教材：读音、中文、拼句、逐词拆解、替换练习与记忆提示。">
  <link rel="manifest" href="/japanese/manifest.webmanifest">
  <link rel="prefetch" href="/japanese/words" as="document">
  <link rel="prefetch" href="/japanese/test" as="document">
  <link rel="icon" type="image/png" sizes="32x32" href="/japanese/icon-32.png?v=3">
  <link rel="apple-touch-icon" sizes="180x180" href="/japanese/icon-180.png?v=3">
  <title>核心表达｜日语核心表达</title>
  <style>
${themeCss}
  </style>
</head>
<body data-module="core">
  ${shellTop("core")}
  <div class="shell">
    <aside class="sidebar" aria-label="章节">
      <p class="side-label"><span>章节</span><span class="num" id="side-summary">已掌握 0/${TOTAL_LESSONS}</span></p>
      <nav class="side-list" id="chapter-nav">${chapters.map(sideItem).join("")}</nav>
      <div class="side-foot"><span>掌握记录和小测试成绩会自动同步到你的其他设备</span></div>
    </aside>
    <main class="main" id="main">
      <div class="main-inner">
        <div class="core-page">
          <section class="core-list-col" aria-label="表达列表">
            <header class="page-head core-head">
              <div class="page-title">
                <p class="eyebrow" id="core-eyebrow">第 1 章 · ${pad2(firstChapter.start)}–${pad2(firstChapter.end)}</p>
                <h1><span class="title-text" id="core-title">${escapeHtml(firstChapter.title)}<span class="ja-sub" lang="ja">${escapeHtml(firstChapter.kana)}</span></span><button class="title-btn" type="button" data-action="picker"><span id="core-title-short">${escapeHtml(firstChapter.title)}</span>${ICON.down}</button></h1>
                <p class="page-desc" id="core-desc">${mixed(firstChapter.description)}</p>
              </div>
              <div class="chapter-progress" id="chapter-progress"><span>本章已掌握 <b class="num" id="chapter-done">0</b> / <span class="num" id="chapter-total">${firstChapter.end - firstChapter.start + 1}</span></span><div class="bar success"><span id="chapter-bar"></span></div></div>
              <div class="core-tools">
                <label class="search">${SEARCH_ICON}<input id="lesson-search" type="search" placeholder="搜索日语、读音、中文" autocomplete="off" aria-label="搜索全部 ${TOTAL_LESSONS} 句表达"><button class="icon-btn" id="search-clear" type="button" aria-label="清除搜索" hidden>${ICON.x}</button><span class="kbd kbd-hint" id="search-kbd">/</span></label>
                <button class="btn btn-primary" id="random-review" type="button">小测试</button>
              </div>
            </header>
            <div class="list-scroll" id="list-scroll">
      ${chapters.map(chapterList).join("")}
              <div class="empty" id="empty-state" hidden><div class="empty-seal" lang="ja">無</div><h3>没有找到相符的表达</h3><p>试试更短的日语、假名，或一个中文关键词。</p></div>
              <nav class="chapter-pager" id="chapter-pager" aria-label="章节翻页"></nav>
            </div>
          </section>
          <article class="phrase-detail" id="phrase-detail" aria-label="表达拆解"></article>
        </div>
        <div class="print-book" id="print-book"></div>
      </div>
    </main>
  </div>
  ${shellBottom("core")}
  <section class="detail-sheet" id="detail-sheet" aria-label="表达详情" aria-hidden="true"></section>

  <dialog class="modal" id="quiz-dialog" aria-labelledby="quiz-title">
    <div class="modal-head"><h2 id="quiz-title">小测试</h2><button class="icon-btn" type="button" data-action="close-dialog" aria-label="关闭小测试">${ICON.x}</button></div>
    <div class="modal-body">
      <section id="quiz-setup">
        <p class="field-label">出题范围</p>
        <div class="option-grid">
          <button class="option" type="button" data-quiz-scope="chapter" aria-pressed="true"><strong>本章</strong><span id="scope-chapter-note">当前章节</span></button>
          <button class="option" type="button" data-quiz-scope="open" aria-pressed="false"><strong>未掌握</strong><span id="scope-open-note">还没标记掌握的句子</span></button>
          <button class="option" type="button" data-quiz-scope="all" aria-pressed="false"><strong>全部</strong><span>${TOTAL_LESSONS} 句随机</span></button>
        </div>
        <p class="field-label">题型</p>
        <div class="option-grid">
          <button class="option" type="button" data-quiz-mode="mixed" aria-pressed="true"><strong>混合练习</strong><span>输入假名与选择中文交替</span></button>
          <button class="option" type="button" data-quiz-mode="kana-input" aria-pressed="false"><strong>输入假名</strong><span>看日语，写出读音</span></button>
          <button class="option" type="button" data-quiz-mode="meaning-choice" aria-pressed="false"><strong>选择中文</strong><span>看假名，选中文意思</span></button>
        </div>
        <div class="modal-foot"><span class="muted" id="quiz-total-stats">还没有测试记录</span><button class="btn btn-primary btn-lg" id="quiz-start" type="button">开始 10 题</button></div>
      </section>
      <section id="quiz-question" hidden></section>
      <section id="quiz-summary" hidden></section>
    </div>
  </dialog>

  ${lessons.map(lessonTemplate).join("\n  ")}

  <script>
    window.__LESSON_DATA__ = ${scriptJson(lessonData)};
    window.__CHAPTERS__ = ${scriptJson(chapterData)};
${commonScript}
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
console.log(`已生成 ${lessons.length} 条核心表达、${TOTAL_CHAPTERS} 个章节与 ${TOTAL_FLASHCARDS} 张单词闪卡 PWA：${distDir}`);
