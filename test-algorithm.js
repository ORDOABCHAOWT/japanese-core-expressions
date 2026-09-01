const TestScheduler = (() => {
  "use strict";

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const MODE_IDS = ["audio-ja", "zh-ja", "jp-zh"];
  const INTERVALS = [10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  const TOTAL_CHECKPOINTS = INTERVALS.length + 1;

  function emptyModeProgress() {
    return {
      stage: 0,
      due: 0,
      attempts: 0,
      correct: 0,
      lapses: 0,
      graduated: false,
      graduatedAt: 0,
    };
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP")
      .replace(/[\s\u3000。、，,；;：:！!？?・･「」『』（）()【】\[\]／/\\\-—_]/g, "");
  }

  function unique(values) {
    return [...new Set(values.map(normalizeText).filter(Boolean))];
  }

  function acceptedAnswers(card, modeId) {
    if (modeId === "jp-zh") {
      const meanings = String(card.meaning || "").split(/[；;，,、/]/);
      return unique([card.meaning, ...meanings]);
    }
    return unique([card.writing, card.kana, card.polite]);
  }

  function checkAnswer(card, modeId, answer) {
    const normalized = normalizeText(answer);
    return Boolean(normalized) && acceptedAnswers(card, modeId).includes(normalized);
  }

  function advance(previousValue, passed, now = Date.now()) {
    const previous = { ...emptyModeProgress(), ...(previousValue || {}) };
    if (previous.graduated) return previous;

    if (!passed) {
      return {
        ...previous,
        stage: 0,
        due: now + INTERVALS[0],
        attempts: previous.attempts + 1,
        lapses: previous.lapses + 1,
      };
    }

    const nextStage = previous.stage + 1;
    const graduated = nextStage >= TOTAL_CHECKPOINTS;
    return {
      ...previous,
      stage: nextStage,
      due: graduated ? 0 : now + INTERVALS[Math.min(previous.stage, INTERVALS.length - 1)],
      attempts: previous.attempts + 1,
      correct: previous.correct + 1,
      graduated,
      graduatedAt: graduated ? now : 0,
    };
  }

  function isDue(value, now = Date.now()) {
    const progress = { ...emptyModeProgress(), ...(value || {}) };
    return !progress.graduated && (progress.attempts === 0 || progress.due <= now);
  }

  function cardGraduated(cardProgress) {
    const modes = cardProgress?.modes || {};
    return MODE_IDS.every((modeId) => Boolean(modes[modeId]?.graduated));
  }

  function nextIntervalLabel(progressValue) {
    const progress = { ...emptyModeProgress(), ...(progressValue || {}) };
    if (progress.graduated) return "已毕业";
    if (progress.attempts === 0) return "现在开始";
    const delta = progress.due - Date.now();
    if (delta <= 0) return "现在复习";
    if (delta < DAY) return `${Math.max(1, Math.ceil(delta / MINUTE))} 分钟后`;
    return `${Math.ceil(delta / DAY)} 天后`;
  }

  return {
    MODE_IDS,
    INTERVALS,
    TOTAL_CHECKPOINTS,
    acceptedAnswers,
    advance,
    cardGraduated,
    checkAnswer,
    emptyModeProgress,
    isDue,
    nextIntervalLabel,
    normalizeText,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TestScheduler;
}
