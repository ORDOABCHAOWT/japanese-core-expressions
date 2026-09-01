const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "dist", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const flashcardsPath = path.join(__dirname, "dist", "words.html");
const flashcardsHtml = fs.existsSync(flashcardsPath) ? fs.readFileSync(flashcardsPath, "utf8") : "";
const testPath = path.join(__dirname, "dist", "test.html");
const testHtml = fs.existsSync(testPath) ? fs.readFileSync(testPath, "utf8") : "";
const serviceWorkerPath = path.join(__dirname, "dist", "sw.js");
const serviceWorker = fs.existsSync(serviceWorkerPath) ? fs.readFileSync(serviceWorkerPath, "utf8") : "";
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
if (!html.includes('href="/japanese/words"')) {
  failures.push("核心表达页缺少单词闪卡入口");
}
if (!html.includes('href="/japanese/test"')) failures.push("核心表达页缺少词汇测试入口");
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
if (count(/<article class="lesson-shell"/g) !== 136) failures.push("课程卡片不是 136 张");
if (count(/<section class="chapter-section /g) !== 14) failures.push("章节不是 14 个");
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
  "test.html",
]) {
  if (!fs.existsSync(path.join(__dirname, "dist", asset))) {
    failures.push(`缺少 PWA 资源：${asset}`);
  }
}

if (!serviceWorker.includes('const CACHE_NAME = "nihongo-core-v12"')) {
  failures.push("Service Worker 缓存版本未升级");
}
if (!serviceWorker.includes('"/japanese"') || !serviceWorker.includes('"/japanese/words"') || !serviceWorker.includes('"/japanese/test"')) {
  failures.push("Service Worker 缺少分模块离线导航回退");
}
if (!serviceWorker.includes("const MODULE_PATHS = new Set") || !serviceWorker.includes("canonicalModulePath") || !serviceWorker.includes("const cached = await cache.match")) {
  failures.push("模块切换未使用缓存优先的快速导航");
}

if (!flashcardsHtml) {
  failures.push("缺少单词闪卡页面");
} else {
  if (!flashcardsHtml.startsWith("<!doctype html>")) failures.push("单词闪卡缺少 HTML5 doctype");
  if (!flashcardsHtml.includes('href="/japanese"')) failures.push("单词闪卡缺少明确的核心表达入口");
  if (!flashcardsHtml.includes('href="/japanese/test"')) failures.push("单词闪卡缺少词汇测试入口");
  if (!flashcardsHtml.includes('href="/japanese/manifest.webmanifest"')) failures.push("单词闪卡缺少 PWA manifest");
  if (countFlashcards(flashcardsHtml) !== 241) failures.push("单词闪卡不是 241 张");
  if (!flashcardsHtml.includes('category":"N3 常用动词"') || !flashcardsHtml.includes('category":"连接与副词"')) {
    failures.push("单词闪卡缺少 N3 进阶分类");
  }
  if (!flashcardsHtml.includes('rel="prefetch" href="/japanese"')) {
    failures.push("单词闪卡缺少核心表达页预取");
  }
  if (flashcardsHtml.includes('href="/japanese/words.html"') || flashcardsHtml.includes('href="/japanese/index.html"')) {
    failures.push("单词闪卡仍使用会触发线上重定向的旧模块地址");
  }
  if ((flashcardsHtml.match(/<\/head>/g) || []).length !== 1) failures.push("单词闪卡 head 结构异常");
  if ((flashcardsHtml.match(/app\.innerHTML\s*=/g) || []).length !== 1) {
    failures.push("单词闪卡仍可能在交互时整页重建");
  }
  if (!flashcardsHtml.includes('id="study-stage"') || !flashcardsHtml.includes('id="progress-panel"')) {
    failures.push("单词闪卡缺少局部更新区域");
  }
  if (!flashcardsHtml.includes('data-mode="graduated"') || !flashcardsHtml.includes("isTestGraduated")) {
    failures.push("单词闪卡没有排除已通过三路测试的毕业词");
  }

  const flashcardScript = flashcardsHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (!flashcardScript) {
    failures.push("单词闪卡缺少互动脚本");
  } else {
    try {
      new Function(flashcardScript[1]);
    } catch (error) {
      failures.push(`单词闪卡脚本语法错误：${error.message}`);
    }
  }
}

if (!testHtml) {
  failures.push("缺少词汇测试页面");
} else {
  if (!testHtml.startsWith("<!doctype html>")) failures.push("词汇测试缺少 HTML5 doctype");
  if (!testHtml.includes('href="/japanese/test" aria-current="page"')) failures.push("词汇测试缺少当前模块标记");
  if (!testHtml.includes('href="/japanese/words"')) failures.push("词汇测试缺少单词闪卡入口");
  if (!testHtml.includes('"audio-ja"') || !testHtml.includes('"zh-ja"') || !testHtml.includes('"jp-zh"')) {
    failures.push("词汇测试缺少三种测试方式");
  }
  if (!testHtml.includes("10 * MINUTE") || !testHtml.includes("30 * DAY") || !testHtml.includes("cardGraduated")) {
    failures.push("词汇测试缺少完整的艾宾浩斯间隔或三路毕业判定");
  }
  if (!testHtml.includes("state.result?.card || current.card") || !testHtml.includes("state.result?.card || currentQuestion().card")) {
    failures.push("词汇测试结果页没有锁定刚刚作答的词");
  }
  const testCardsMatch = testHtml.match(/const testCards = (\[[\s\S]*?\]);\n/);
  if (!testCardsMatch) {
    failures.push("词汇测试缺少词卡数据");
  } else {
    try {
      if (JSON.parse(testCardsMatch[1]).length !== 241) failures.push("词汇测试不是 241 个词条");
    } catch (error) {
      failures.push(`词汇测试数据无法解析：${error.message}`);
    }
  }
  const testScript = testHtml.match(/<script>([\s\S]*?)<\/script>/);
  if (!testScript) {
    failures.push("词汇测试缺少互动脚本");
  } else {
    try {
      new Function(testScript[1]);
    } catch (error) {
      failures.push(`词汇测试脚本语法错误：${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const sizeKb = Math.round(fs.statSync(htmlPath).size / 1024);
console.log(`验证通过：136 条核心表达、241 张单词闪卡、三路艾宾浩斯词汇测试、14 个章节、快速模块切换与离线资源正常（主页 ${sizeKb} KB）。`);

function countFlashcards(value) {
  const start = value.indexOf("const cards = [");
  const end = value.indexOf("cards.push(...n3Cards);");
  if (start < 0 || end < 0) return 0;
  return [...value.slice(start, end).matchAll(/(?:\bid|"id")\s*:/g)].length;
}
