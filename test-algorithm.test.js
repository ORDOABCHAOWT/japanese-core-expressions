const assert = require("node:assert/strict");
const scheduler = require("./test-algorithm.js");

const card = {
  writing: "勉強する",
  kana: "べんきょうする",
  polite: "べんきょうします",
  meaning: "学习；用功",
};

assert.equal(scheduler.checkAnswer(card, "audio-ja", " 勉強する。"), true);
assert.equal(scheduler.checkAnswer(card, "zh-ja", "べんきょうします"), true);
assert.equal(scheduler.checkAnswer(card, "jp-zh", "学习"), true);
assert.equal(scheduler.checkAnswer(card, "jp-zh", "休息"), false);
assert.equal(scheduler.checkAnswer(card, "audio-ja", ""), false);

const start = Date.UTC(2026, 0, 1);
let progress = scheduler.advance(null, true, start);
assert.equal(progress.stage, 1);
assert.equal(progress.due, start + 10 * 60 * 1000);
assert.equal(scheduler.isDue(progress, start), false);
assert.equal(scheduler.isDue(progress, progress.due), true);

for (let index = 1; index < scheduler.TOTAL_CHECKPOINTS; index += 1) {
  progress = scheduler.advance(progress, true, progress.due);
}
assert.equal(progress.graduated, true);
assert.equal(progress.stage, scheduler.TOTAL_CHECKPOINTS);

const reset = scheduler.advance({ stage: 4, attempts: 4, correct: 4 }, false, start);
assert.equal(reset.stage, 0);
assert.equal(reset.lapses, 1);
assert.equal(reset.due, start + 10 * 60 * 1000);

const allModes = Object.fromEntries(scheduler.MODE_IDS.map((modeId) => [modeId, { graduated: true }]));
assert.equal(scheduler.cardGraduated({ modes: allModes }), true);
allModes["jp-zh"].graduated = false;
assert.equal(scheduler.cardGraduated({ modes: allModes }), false);

console.log("测试调度验证通过：三种题型、答案归一化、错题重置与艾宾浩斯毕业逻辑正常。");
