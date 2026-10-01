const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Daily = require("./daily-algorithm.js");

const read = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, "content", file), "utf8"));
const cards = [...read("base-flashcards.json"), ...read("n3-flashcards.json")];
Daily.setCards(cards);

let now = Date.UTC(2026, 9, 1, 12);
Daily.setClock(() => now);
const play = (state, pick) => {
  let guard = 0;
  while (state.session && guard < 100) {
    guard += 1;
    const cur = Daily.current(state);
    Daily.act(state, pick(cur));
  }
  assert.ok(guard < 100, "一轮没有结束");
};
const answerAll = (cur) => (cur.kind === "intro" ? "continue" : "remember");

// 学习日在凌晨 4 点切换
const offset = new Date(now).getTimezoneOffset() * 60000;
const localMidnight = Date.UTC(2026, 9, 2) + offset;
assert.equal(Daily.studyDay(localMidnight + 3.5 * 3600000), Daily.studyDay(localMidnight - 3600000));
assert.equal(Daily.studyDay(localMidnight + 4.5 * 3600000), Daily.studyDay(localMidnight - 3600000) + 1);
assert.match(Daily.dateLabel(Daily.studyDay(localMidnight + 5 * 3600000)), /^10月2日 周五$/);

// 全新开始：每天 2 轮 → 4 个新词，新词先看再检查一次
let state = Daily.normalizeState(null, 1000);
let info = Daily.today(state);
assert.equal(info.totalNew, 4);
assert.equal(info.total, 4);
Daily.startRound(state);
assert.deepEqual(state.session.queue.map((item) => item.kind), ["intro", "intro", "intro", "intro"]);
assert.ok(Daily.newCandidates(Daily.normalizeState(null, 1000)).slice(0, 1)[0].startsWith("n3-"), "默认先学 N3");
play(state, answerAll);
assert.equal(Object.keys(state.lastRound.results).length, 4);
assert.ok(Object.values(state.lastRound.results).every((value) => value === "new"));
info = Daily.today(state);
assert.equal(info.finished, true);
assert.equal(info.done, 4);
assert.deepEqual(state.activeDays, [1000]);
assert.equal(state.pending.words.length, 4);

// 第二天：4 个到期 + 4 个新词；忘了的词退两档、本轮再考一次、明天再来
Daily.setDay(state, 1001);
info = Daily.today(state);
assert.equal(info.totalReview, 4);
assert.equal(info.totalNew, 4);
Daily.startRound(state);
assert.equal(state.session.words.length, 8);
const firstReview = state.session.queue.find((item) => item.kind === "review").id;
let forgot = false;
play(state, (cur) => {
  if (cur.kind === "intro") return "continue";
  if (cur.kind === "review" && cur.id === firstReview && !forgot) {
    forgot = true;
    return "forgot";
  }
  return "easy";
});
assert.equal(state.lastRound.results[firstReview], "forgot");
assert.equal(state.words[firstReview].dueDay, 1002);
assert.equal(state.words[firstReview].lapses, 1);
assert.ok(state.words[firstReview].weak, "答错的方向记成弱项");
const easyReview = Object.entries(state.lastRound.results).find(([id, value]) => value === "easy" && id !== firstReview)[0];
assert.equal(state.words[easyReview].stage, 2);
assert.equal(state.words[easyReview].dueDay, 1001 + 7);

// 每天 1 轮、旧词多：提示排不下，今天不学新词就把位置让给旧词
let backlog = Daily.normalizeState(null, 2000);
backlog.settings.rounds = 1;
cards.slice(0, 15).forEach((item, index) => {
  backlog.words[item.id] = { status: "learning", stage: 2, dueDay: 2000 - (index % 3), lapses: 0, reviews: 3, weak: null, introDay: 1900, introExtra: null, lastDay: 1990, knownDay: null, updatedAt: "2026-09-01T00:00:00.000Z" };
});
info = Daily.today(backlog);
assert.equal(info.total, 10);
assert.equal(info.totalNew, 2);
assert.equal(info.overflow, 7);
Daily.dayRec(backlog).skipNew = true;
info = Daily.today(backlog);
assert.equal(info.totalNew, 0);
assert.equal(info.overflow, 5);
Daily.dayRec(backlog).extraRounds = 1;
assert.equal(Daily.today(backlog).total, 15);

// 换台设备：今天在别处学过的词由记录推出来，不会重复占名额
let other = Daily.normalizeState(null, 1001);
other.words = JSON.parse(JSON.stringify(state.words));
info = Daily.today(other);
assert.equal(info.done, 8);
assert.equal(info.totalNew, 4);
assert.equal(info.newLeft, 0);

// 「早就会了」：词库里标记不占今天的量；本轮里跳过会移出队列；能恢复
let known = Daily.normalizeState(null, 3000);
const before = Daily.today(known).upcoming;
Daily.knownOutside(known, cards[0].id);
assert.equal(Daily.status(known.words[cards[0].id]), "known");
assert.equal(Daily.today(known).upcoming, before);
Daily.restore(known, cards[0].id);
assert.equal(Daily.status(known.words[cards[0].id]), "fresh");
Daily.startRound(known);
const skipped = Daily.current(known).id;
Daily.act(known, "known");
assert.ok(!known.session.queue.slice(known.session.pos).some((item) => item.id === skipped));
assert.equal(known.session.results[skipped], "known");

// 多学新词不占当天名额，在里面跳过熟词也不占
let extra = Daily.normalizeState(null, 4000);
Daily.startExtraNew(extra);
assert.equal(extra.session.words.length, Daily.EXTRA_NEW);
Daily.act(extra, "known");
play(extra, answerAll);
info = Daily.today(extra);
assert.equal(info.extraNew, Daily.EXTRA_NEW - 1);
assert.equal(info.totalNew, 4);
assert.equal(info.done, 0);
assert.equal(info.total, 4);

// 旧版进度迁移：取最好的一份，时间戳早于任何新版记录
const legacyFlash = {
  "greeting-05": { level: 5, due: now + 20 * 86400000, reviews: 9, misses: 0 },
  "n3-life-01": { level: 1, due: now - 86400000, reviews: 2, misses: 1 },
};
const legacyTest = {
  "greeting-05": { modes: { "audio-ja": { stage: 7, graduated: true, attempts: 9, lapses: 0 } } },
  "people-01": { modes: { "zh-ja": { stage: 4, due: now + 3 * 86400000, attempts: 6, lapses: 2 } } },
};
let migrated = Daily.normalizeState(null, Daily.studyDay(now));
assert.equal(Daily.migrateLegacy(migrated, legacyFlash, legacyTest), 3);
assert.equal(migrated.words["greeting-05"].stage, Daily.MASTERED_STAGE);
assert.equal(migrated.words["n3-life-01"].stage, 0);
assert.equal(migrated.words["n3-life-01"].dueDay, Daily.studyDay(now - 86400000));
assert.equal(migrated.words["people-01"].stage, 2);
assert.equal(migrated.words["people-01"].weak, "zh-ja");
assert.ok(migrated.words["people-01"].updatedAt < "1971");
assert.equal(Daily.dueCount(migrated, Daily.studyDay(now)), 1);

// 同步：按更新时间合并，新版记录总比迁移记录新
const body = Daily.syncBody(migrated);
assert.equal(body.words.length, 3);
const server = {
  words: [
    { id: "people-01", data: { ...body.words.find((row) => row.id === "people-01").data, stage: 4 }, updatedAt: "2026-10-01T08:00:00.000Z" },
    { id: "n3-life-01", data: { status: "learning", stage: 0 }, updatedAt: "1970-01-01T00:00:00.000Z" },
    { id: "greeting-05", data: body.words.find((row) => row.id === "greeting-05").data, updatedAt: body.words.find((row) => row.id === "greeting-05").updatedAt },
  ],
  settings: { data: { rounds: 3, source: "course", onboarded: true }, updatedAt: "2026-10-01T08:00:00.000Z" },
  activeDays: [10, 11],
};
assert.equal(Daily.mergeRemote(migrated, server, true), true);
assert.equal(migrated.words["people-01"].stage, 4);
assert.equal(migrated.words["n3-life-01"].reviews, 2, "较新的本地记录保留");
assert.deepEqual(migrated.pending.words, ["n3-life-01"]);
assert.equal(migrated.settings.rounds, 3);
assert.equal(migrated.onboarded, false, "欢迎页是否看过只记在这台设备上");
assert.equal(Object.hasOwn(migrated.settings, "onboarded"), false);
assert.equal(Object.hasOwn(Daily.syncBody({ ...migrated, pending: { words: [], settings: true, activity: false } }).settings.data, "onboarded"), false);
assert.deepEqual(migrated.activeDays, [10, 11]);

// 一次最多送 100 个词
const many = Daily.normalizeState(null, 7000);
cards.forEach((item) => {
  many.words[item.id] = { status: "learning", stage: 1, dueDay: 7001, lapses: 0, reviews: 1, weak: null, introDay: 6990, introExtra: null, lastDay: 6999, knownDay: null, updatedAt: "2026-10-01T00:00:00.000Z" };
  many.pending.words.push(item.id);
});
assert.equal(Daily.syncBody(many).words.length, 100);
Daily.mergeRemote(many, { words: Daily.syncBody(many).words, activeDays: [] });
assert.equal(many.pending.words.length, cards.length - 100);

// 打字判分
const thanks = Daily.card("greeting-05");
assert.equal(Daily.checkTyped(thanks, "ありがとう").ok, true);
assert.equal(Daily.checkTyped(thanks, "アリガトウゴザイマス").ok, true);
assert.equal(Daily.checkTyped(Daily.card("n3-verb-01"), "続けます").ok, true);
assert.equal(Daily.checkTyped(Daily.card("n3-verb-01"), "つずける").near, true);
assert.equal(Daily.checkTyped(Daily.card("n3-verb-01"), "").ok, false);

// 存下来的一轮里有词表中已经没有的词：这一轮作废，不会卡住
const brokenRound = Daily.normalizeState(null, 6000);
Daily.startRound(brokenRound);
brokenRound.session.queue[0].id = "removed-word";
assert.equal(Daily.normalizeState(JSON.parse(JSON.stringify(brokenRound)), 6000).session, null);
// 旧版把 onboarded 放在设置里：读出来时搬到本机字段
assert.equal(Daily.normalizeState({ ...Daily.emptyState(6000), settings: { rounds: 1, onboarded: true }, onboarded: undefined }, 6000).onboarded, true);

// 换日：昨天没做完的一轮放回今天
let stale = Daily.normalizeState(null, 5000);
Daily.startRound(stale);
assert.equal(Daily.setDay(stale, 5001), true);
assert.equal(stale.session, null);

console.log("背单词调度验证通过：每日名额、到期顺序、忘了重考、熟词跳过、跨设备计数、旧版迁移与同步合并正常。");
