const fs = require("fs");
const path = require("path");

const read = (file) => {
  const target = path.join(__dirname, "dist", file);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
};
const htmlPath = path.join(__dirname, "dist", "index.html");
const html = read("index.html");
const wordsHtml = read("words.html");
const libraryHtml = read("library.html");
const testHtml = read("test.html");
const serviceWorker = read("sw.js");
const failures = [];

function count(pattern) {
  return [...html.matchAll(pattern)].length;
}

if (!html.startsWith("<!doctype html>")) failures.push("缺少 HTML5 doctype");
if (!html.includes('<meta charset="utf-8">')) failures.push("缺少 UTF-8 声明");
if (!html.includes("</html>")) failures.push("HTML 未闭合");
if (!html.includes('<link rel="manifest" href="/japanese/manifest.webmanifest">')) {
  failures.push("缺少 PWA manifest");
}
if (!html.includes('navigator.serviceWorker.register("/japanese/sw.js"')) {
  failures.push("缺少离线缓存注册");
}
if (!html.includes('scope: "/japanese"')) {
  failures.push("PWA scope 未匹配 Vercel 的无尾斜杠地址");
}
if (!html.includes('const SYNC_ENDPOINT = "/japanese/api/progress"')) {
  failures.push("缺少跨设备同步接口");
}
if (!html.includes('id="sync-trigger"') || !html.includes('id="quiz-dialog"')) {
  failures.push("缺少自动同步状态或小测试窗口");
}
if (!html.includes('href="/japanese/words"')) failures.push("核心表达页缺少背单词入口");
if (!html.includes('href="/japanese/library"')) failures.push("核心表达页缺少词库入口");
if (!html.includes("function dueCount(")) failures.push("核心表达页缺少背单词角标计算");
if (!html.includes('href="/japanese" aria-current="page"')) {
  failures.push("核心表达页缺少明确的当前模块入口");
}
if (html.includes('href="/japanese/words.html"') || html.includes('href="/japanese/index.html"')) {
  failures.push("核心表达页仍使用会触发线上重定向的旧模块地址");
}
if (html.includes('id="sync-dialog"') || html.includes('id="sync-code-input"')) {
  failures.push("仍包含同步码配对界面");
}
if (!html.includes('data-quiz-mode="kana-input"') || !html.includes('data-quiz-mode="meaning-choice"')) {
  failures.push("缺少假名输入或中文选择模式");
}
if (count(/<button class="phrase-row"/g) !== 136) failures.push("表达列表不是 136 条");
if (count(/<template id="lesson-tpl-/g) !== 136) failures.push("逐句拆解不是 136 份");
if (count(/<ol class="phrase-list"/g) !== 14) failures.push("章节不是 14 个");
if (!html.includes('id="chapter-n3-habits"') || !html.includes('id="lesson-136"')) {
  failures.push("缺少 N3 进阶章节或最后一条表达");
}
if (/\*\*[^*]+\*\*/.test(html)) failures.push("仍有未转换的 Markdown");
if (/<(?:link|img|script)[^>]+(?:src|href)=["']https?:/i.test(html)) {
  failures.push("存在外部资源，不能完全离线使用");
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) failures.push(`存在重复 id：${[...new Set(duplicateIds)].join("、")}`);

for (let index = 1; index <= 136; index += 1) {
  const number = String(index).padStart(2, "0");
  if (count(new RegExp(`id="lesson-${number}"`, "g")) !== 1) {
    failures.push(`第 ${number} 句缺失或重复`);
  }
}

const script = html.match(/<script>([\s\S]*?)<\/script>/);
if (!script) {
  failures.push("缺少互动脚本");
} else {
  try {
    new Function(script[1]);
  } catch (error) {
    failures.push(`互动脚本语法错误：${error.message}`);
  }
}

for (const asset of [
  "manifest.webmanifest",
  "sw.js",
  "icon-32.png",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "icon-1024.png",
  "words.html",
  "library.html",
  "test.html",
]) {
  if (!fs.existsSync(path.join(__dirname, "dist", asset))) {
    failures.push(`缺少 PWA 资源：${asset}`);
  }
}

if (!serviceWorker.includes('const CACHE_NAME = "nihongo-core-v17"')) {
  failures.push("Service Worker 缓存版本未升级");
}
if (!serviceWorker.includes('"/japanese/words"') || !serviceWorker.includes('"/japanese/library"') || !serviceWorker.includes('"/japanese/test"')) {
  failures.push("Service Worker 缺少分模块离线导航回退");
}
if (!serviceWorker.includes("const MODULE_PATHS = new Set") || !serviceWorker.includes("canonicalModulePath") || !serviceWorker.includes("const cached = await cache.match")) {
  failures.push("模块切换未使用缓存优先的快速导航");
}

// 安装信息里的快捷入口要和现在的三个模块一致（改了以后记得升 Service Worker 的缓存版本）
try {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const shortcutUrls = (manifest.shortcuts || []).map((item) => item.url).join(" ");
  if (shortcutUrls !== "/japanese /japanese/words /japanese/library") failures.push(`manifest 的快捷入口不对：${shortcutUrls}`);
  if (/闪卡|词汇测试|三路/.test(JSON.stringify(manifest))) failures.push("manifest 里还有旧模块的名字");
  if (!(manifest.icons || []).every((icon) => /\?v=3$/.test(icon.src))) failures.push("manifest 图标地址缺少版本号");
} catch (error) {
  failures.push(`manifest 无法解析：${error.message}`);
}

function checkScript(name, page) {
  const script = page.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) {
    failures.push(`${name}缺少互动脚本`);
    return;
  }
  try {
    new Function(script[1]);
  } catch (error) {
    failures.push(`${name}脚本语法错误：${error.message}`);
  }
}

function checkWordsPage(name, page, module, otherHref) {
  if (!page) {
    failures.push(`缺少${name}页面`);
    return;
  }
  if (!page.startsWith("<!doctype html>")) failures.push(`${name}缺少 HTML5 doctype`);
  if (!page.includes(`<body data-module="${module}">`)) failures.push(`${name}模块标记不对`);
  if (!page.includes(`href="/japanese/${module}" aria-current="page"`)) failures.push(`${name}缺少当前模块标记`);
  if (!page.includes('href="/japanese"') || !page.includes(`href="${otherHref}"`)) failures.push(`${name}缺少其他模块入口`);
  if (!page.includes('href="/japanese/manifest.webmanifest"')) failures.push(`${name}缺少 PWA manifest`);
  if (!page.includes('const ENDPOINT = "/japanese/api/words"') || !page.includes('id="sync-trigger"')) failures.push(`${name}缺少跨设备同步`);
  if (!page.includes("function requestAccess(")) failures.push(`${name}缺少访问密钥入口`);
  if (!page.includes('id="words-dialog"')) failures.push(`${name}缺少设置与详情窗口`);
  if (page.includes('href="/japanese/words.html"') || page.includes('href="/japanese/index.html"')) failures.push(`${name}仍使用会触发线上重定向的旧模块地址`);
  if ((page.match(/<\/head>/g) || []).length !== 1) failures.push(`${name} head 结构异常`);
  const cardsMatch = page.match(/const WORD_CARDS = (\[[\s\S]*?\]);\n/);
  const categoriesMatch = page.match(/const WORD_CATEGORIES = (\[[\s\S]*?\]);\n/);
  try {
    const cards = JSON.parse(cardsMatch[1]);
    const categories = JSON.parse(categoriesMatch[1]);
    if (cards.length !== 241 || new Set(cards.map((card) => card.id)).size !== 241) failures.push(`${name}不是 241 个不重复的词`);
    if (categories.length !== 15) failures.push(`${name}分类不是 15 个`);
    if (!cards.some((card) => card.category === "N3 常用动词") || !cards.some((card) => card.id === "greeting-05")) failures.push(`${name}缺少入门或 N3 词`);
  } catch (error) {
    failures.push(`${name}词卡数据无法解析：${error.message}`);
  }
  for (const marker of ["Daily.startRound", "Daily.knownOutside", "Daily.startExtraNew", "Daily.checkTyped", "data-action=\"known\"", "早就会了，跳过", "NEW_PER_DAY = { 1: 2, 2: 4, 3: 6 }"]) {
    if (!page.includes(marker)) failures.push(`${name}缺少：${marker}`);
  }
  checkScript(name, page);
}

checkWordsPage("背单词", wordsHtml, "words", "/japanese/library");
checkWordsPage("词库", libraryHtml, "library", "/japanese/words");
if (!testHtml.includes('location.replace("/japanese/words")') || !testHtml.includes('url=/japanese/words')) {
  failures.push("旧的词汇测试地址没有转到背单词");
}

// 三个模块必须共用同一套主题：同样的字体角色、配色和最小字号
const pages = { 核心表达: html, 背单词: wordsHtml, 词库: libraryHtml };
const themes = Object.entries(pages).map(([name, page]) => [name, ((page.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "").trim()]);
if (!themes[0][1] || new Set(themes.map(([, css]) => css)).size !== 1) {
  failures.push("三个模块没有使用同一套主题样式");
}
const themeCss = themes[0][1];
if (!themeCss.includes(":lang(ja) { font-family: var(--font-ja); }")) failures.push("缺少日文内容专用字体规则");
const tinyFonts = [...themeCss.matchAll(/font(?:-size)?:[^;{}]*?(\d+(?:\.\d+)?)px/g)]
  .filter((match) => Number(match[1]) < 12)
  .map((match) => match[0]);
if (tinyFonts.length) failures.push(`存在小于 12px 的字号：${tinyFonts.join("；")}`);
for (const [name, page] of Object.entries(pages)) {
  if (!page.includes('class="topbar"') || !page.includes('class="tabbar"')) failures.push(`${name}缺少统一的顶栏或手机标签栏`);
  if (!page.includes("viewport-fit=cover")) failures.push(`${name}缺少全面屏适配`);
  if (!page.includes('<div class="status-strip" aria-hidden="true"></div>')) failures.push(`${name}缺少 iOS 顶边色带`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const sizeKb = Math.round(fs.statSync(htmlPath).size / 1024);
console.log(`验证通过：136 条核心表达、背单词与词库共 241 个词、14 个章节、统一主题、跨设备同步入口、快速模块切换与离线资源正常（主页 ${sizeKb} KB）。`);
