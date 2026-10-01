/* 背单词调度：一个词一份记录，所有设备共用。
   - 间隔阶梯 1/3/7/16/35/80/180 天；记得 +1 档，很熟 +2 档，忘了退 2 档并在本轮稍后再考一次
   - 每天学几轮决定新词名额（1 轮 2 个、2 轮 4 个、3 轮 6 个），新词名额和到期复习分开算
   - 「早就会了」直接移出每日学习，可以在词库恢复
   - 今天学了多少由各个词的记录推出来，所以换一台设备接着学，计数也对得上
   - 学习日在凌晨 4 点切换 */
const Daily = (() => {
  "use strict";

  const DAY_MS = 86400000;
  const DAY_START_HOUR = 4;
  const IV = [1, 3, 7, 16, 35, 80, 180];
  const MAX_STAGE = IV.length - 1;
  const MASTERED_STAGE = 5;
  const ROUND_SIZE = 10;
  const NEW_PER_DAY = { 1: 2, 2: 4, 3: 6 };
  const EXTRA_NEW = 5;
  const RETRY_GAP = 3;
  const DIRS = {
    "ja-zh": "看日语想意思",
    audio: "听音想意思",
    "zh-ja": "看中文想日语",
  };
  const LEGACY_MODES = { "audio-ja": "audio", "zh-ja": "zh-ja", "jp-zh": "ja-zh" };
  const WEEKDAYS = "日一二三四五六";

  let clock = () => Date.now();
  let CARDS = [];
  let byId = new Map();
  let orderOf = new Map();

  function setCards(cards) {
    CARDS = cards;
    byId = new Map(cards.map((item) => [item.id, item]));
    orderOf = new Map(cards.map((item, index) => [item.id, index]));
  }
  function setClock(fn) {
    clock = fn;
  }

  const card = (id) => byId.get(id);
  const isN3 = (id) => String(id).startsWith("n3-");
  const hash = (text) => [...String(text)].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const stamp = () => new Date(clock()).toISOString();

  /* ---------- 学习日 ---------- */
  function studyDay(ms = clock()) {
    const offset = new Date(ms).getTimezoneOffset() * 60000;
    return Math.floor((ms - offset - DAY_START_HOUR * 3600000) / DAY_MS);
  }
  // 返回的 Date 用 UTC 读数，读出来就是那个学习日的本地日期
  const dateOfDay = (day) => new Date(day * DAY_MS + DAY_START_HOUR * 3600000);
  function dateLabel(day) {
    const date = dateOfDay(day);
    return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 周${WEEKDAYS[date.getUTCDay()]}`;
  }
  const weekdayLabel = (day) => `周${WEEKDAYS[dateOfDay(day).getUTCDay()]}`;

  /* ---------- 状态 ---------- */
  function emptyState(day = studyDay()) {
    return {
      v: 2,
      day,
      settings: { rounds: 2, source: "n3", autoplay: false, onboarded: false },
      settingsUpdatedAt: "",
      words: {},
      days: {},
      activeDays: [],
      session: null,
      lastRound: null,
      pending: { words: [], settings: false, activity: false },
      legacyMigrated: false,
      migratedCount: 0,
    };
  }

  function normalizeState(raw, day = studyDay()) {
    const base = emptyState(day);
    if (!raw || typeof raw !== "object" || raw.v !== 2) return base;
    const state = {
      ...base,
      ...raw,
      settings: { ...base.settings, ...cleanSettings(raw.settings) },
      pending: { ...base.pending, ...(raw.pending && typeof raw.pending === "object" ? raw.pending : {}) },
    };
    if (!state.words || typeof state.words !== "object") state.words = {};
    if (!state.days || typeof state.days !== "object") state.days = {};
    if (!Array.isArray(state.activeDays)) state.activeDays = [];
    if (!Array.isArray(state.pending.words)) state.pending.words = [];
    if (state.session && !Array.isArray(state.session.queue)) state.session = null;
    state.day = null;
    setDay(state, day);
    return state;
  }

  /** 换到新的学习日：昨天没做完的一轮放回今天的安排。返回是否换了日子。 */
  function setDay(state, day = studyDay()) {
    const changed = state.day !== day;
    state.day = day;
    if (state.session && state.session.day !== day) state.session = null;
    if (state.lastRound && state.lastRound.day !== day) state.lastRound = null;
    Object.keys(state.days).forEach((key) => {
      if (Number(key) < day - 14) delete state.days[key];
    });
    return changed;
  }

  function cleanSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    if ([1, 2, 3].includes(source.rounds)) result.rounds = source.rounds;
    if (["n3", "course"].includes(source.source)) result.source = source.source;
    if (typeof source.autoplay === "boolean") result.autoplay = source.autoplay;
    if (typeof source.onboarded === "boolean") result.onboarded = source.onboarded;
    return result;
  }

  const intOrNull = (value) => (Number.isInteger(value) ? value : null);
  function cleanRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      status: ["learning", "known", "fresh"].includes(source.status) ? source.status : "learning",
      stage: Number.isInteger(source.stage) ? Math.max(0, Math.min(MAX_STAGE, source.stage)) : 0,
      dueDay: intOrNull(source.dueDay),
      lapses: Number.isInteger(source.lapses) ? Math.max(0, source.lapses) : 0,
      reviews: Number.isInteger(source.reviews) ? Math.max(0, source.reviews) : 0,
      weak: Object.hasOwn(DIRS, source.weak) ? source.weak : null,
      introDay: intOrNull(source.introDay),
      introExtra: intOrNull(source.introExtra),
      lastDay: intOrNull(source.lastDay),
      knownDay: intOrNull(source.knownDay),
    };
  }

  function dayRec(state, day = state.day) {
    if (!state.days[day]) state.days[day] = { extraRounds: 0, skipNew: false, backlogDismissed: false };
    return state.days[day];
  }

  function touch(state, id) {
    const rec = state.words[id];
    if (!rec) return;
    rec.updatedAt = stamp();
    if (!state.pending.words.includes(id)) state.pending.words.push(id);
  }

  function markActive(state) {
    if (state.activeDays.includes(state.day)) return;
    state.activeDays = [...state.activeDays, state.day].slice(-400);
    state.pending.activity = true;
  }

  function updateSettings(state, patch) {
    state.settings = { ...state.settings, ...cleanSettings(patch) };
    state.settingsUpdatedAt = stamp();
    state.pending.settings = true;
  }

  /* ---------- 选词 ---------- */
  function sessionIds(state) {
    const session = state.session;
    if (!session) return new Set();
    return new Set(session.words.filter((id) => !session.finished[id]));
  }

  const isFresh = (rec) => !rec || rec.status === "fresh";

  function dueIds(state) {
    const skip = sessionIds(state);
    return Object.entries(state.words)
      .filter(([id, rec]) => rec.status === "learning" && Number.isInteger(rec.dueDay) && rec.dueDay <= state.day
        && rec.lastDay !== state.day && !skip.has(id) && byId.has(id))
      .sort(([a, ra], [b, rb]) => ra.dueDay - rb.dueDay || (ra.weak ? 0 : 1) - (rb.weak ? 0 : 1) || ra.stage - rb.stage || orderOf.get(a) - orderOf.get(b))
      .map(([id]) => id);
  }

  function newCandidates(state) {
    const skip = sessionIds(state);
    const ordered = state.settings.source === "n3"
      ? [...CARDS.filter((item) => isN3(item.id)), ...CARDS.filter((item) => !isN3(item.id))]
      : CARDS;
    return ordered.filter((item) => isFresh(state.words[item.id]) && !skip.has(item.id)).map((item) => item.id);
  }

  const newQuota = (state) => NEW_PER_DAY[state.settings.rounds] || 4;

  /** 今天的安排：已经排进来的词 + 还能排进来的词 */
  function today(state) {
    const day = state.day;
    const d = dayRec(state);
    const regular = state.session && !state.session.extra ? state.session : null;
    const assigned = new Set();
    let newUsed = 0;
    Object.entries(state.words).forEach(([id, rec]) => {
      if (!byId.has(id)) return;
      const extraIntro = rec.introExtra === day;
      if (rec.lastDay === day && !extraIntro) assigned.add(id);
      if (rec.introDay === day && !extraIntro && rec.status !== "fresh") newUsed += 1;
    });
    let pending = 0;
    if (regular) {
      regular.words.forEach((id) => {
        assigned.add(id);
        if (!regular.finished[id]) pending += 1;
      });
      newUsed += regular.queue.filter((item) => item.kind === "intro" && isFresh(state.words[item.id]) && !regular.finished[item.id]).length;
    }
    const capacity = (state.settings.rounds + d.extraRounds) * ROUND_SIZE;
    const due = dueIds(state);
    const fresh = newCandidates(state);
    const quota = d.skipNew ? 0 : newQuota(state);
    const newLeft = Math.max(0, Math.min(quota - newUsed, fresh.length));
    const capLeft = Math.max(0, capacity - assigned.size);
    const upcoming = Math.min(capLeft, due.length + newLeft);
    const upcomingNew = Math.min(newLeft, upcoming);
    const upcomingReview = Math.min(due.length, upcoming - upcomingNew);
    const overflow = Math.max(0, due.length - Math.max(0, capLeft - newLeft));
    const total = assigned.size + upcomingNew + upcomingReview;
    const done = assigned.size - pending;
    return {
      quota,
      capacity,
      dueCount: due.length,
      newLeft,
      upcoming: upcomingNew + upcomingReview,
      total,
      totalNew: newUsed + upcomingNew,
      totalReview: total - newUsed - upcomingNew,
      done,
      pending,
      rounds: Math.max(1, Math.ceil(total / ROUND_SIZE)),
      overflow: d.backlogDismissed ? 0 : overflow,
      finished: !state.session && upcomingNew + upcomingReview === 0,
      skipNew: d.skipNew,
      extraRounds: d.extraRounds,
      extraNew: Object.values(state.words).filter((rec) => rec.introExtra === day && rec.status !== "fresh").length,
      freshLeft: fresh.length,
    };
  }

  /* ---------- 题目方向 ---------- */
  function pickDir(state, id, kind) {
    const rec = state.words[id];
    if (rec?.weak && kind !== "check") return rec.weak;
    const stage = rec?.stage ?? 0;
    const seq = kind === "check" || stage < 2 ? ["ja-zh", "audio"] : ["zh-ja", "audio", "ja-zh"];
    return seq[((rec?.reviews ?? 0) + hash(id)) % seq.length];
  }

  /* ---------- 一轮 ---------- */
  function buildQueue(state, reviews, news) {
    const queue = reviews.map((id) => ({ id, kind: "review", dir: pickDir(state, id, "review") }));
    news.forEach((id, index) => {
      queue.splice(Math.min(1 + index * 3, queue.length), 0, { id, kind: "intro" });
    });
    return queue;
  }

  function newSession(state, queue, extra) {
    const info = extra ? null : today(state);
    state.session = {
      day: state.day,
      round: extra ? 0 : Math.floor((info.total - info.upcoming) / ROUND_SIZE) + 1,
      extra,
      queue,
      pos: 0,
      words: queue.map((item) => item.id),
      finished: {},
      results: {},
      revealed: false,
    };
    return state.session;
  }

  function startRound(state) {
    if (state.session) return state.session;
    const info = today(state);
    if (!info.upcoming) return null;
    const due = dueIds(state);
    const fresh = newCandidates(state);
    const size = Math.min(ROUND_SIZE, info.upcoming);
    const roundsLeft = Math.ceil(info.upcoming / ROUND_SIZE);
    let nNew = Math.min(info.newLeft, Math.ceil(info.newLeft / roundsLeft), size);
    const nReview = Math.min(size - nNew, due.length);
    if (nNew + nReview < size) nNew = Math.min(info.newLeft, size - nReview);
    return newSession(state, buildQueue(state, due.slice(0, nReview), fresh.slice(0, nNew)), false);
  }

  function startExtraNew(state) {
    if (state.session) return state.session;
    const news = newCandidates(state).slice(0, EXTRA_NEW);
    if (!news.length) return null;
    return newSession(state, news.map((id) => ({ id, kind: "intro" })), true);
  }

  function current(state) {
    const session = state.session;
    if (!session || session.pos >= session.queue.length) return null;
    const item = session.queue[session.pos];
    const cardData = card(item.id);
    if (!cardData) return null;
    return { ...item, card: cardData, rec: state.words[item.id] || null };
  }

  function insertLater(session, item) {
    session.queue.splice(Math.min(session.pos + 1 + RETRY_GAP, session.queue.length), 0, item);
  }

  function finishWord(state, id, result) {
    state.session.finished[id] = true;
    state.session.results[id] = result;
  }

  function knownRecord(state, id, usedSlot) {
    const rec = state.words[id];
    state.words[id] = {
      ...cleanRecord(rec || { stage: 0 }),
      status: "known",
      knownDay: state.day,
      lastDay: usedSlot ? state.day : rec?.lastDay ?? null,
    };
    touch(state, id);
  }

  function schedule(rec, stage, day) {
    rec.stage = Math.max(0, Math.min(MAX_STAGE, stage));
    rec.dueDay = day + IV[rec.stage];
  }

  /** action: continue | known | forgot | remember | easy；返回 "next" 或 "round-end" */
  function act(state, action) {
    const session = state.session;
    const item = session && session.queue[session.pos];
    if (!item) return "round-end";
    const { id, kind, dir } = item;
    const day = state.day;
    const rec = state.words[id];

    if (action === "known") {
      knownRecord(state, id, true);
      session.queue = session.queue.filter((other, index) => index <= session.pos || other.id !== id);
      finishWord(state, id, "known");
    } else if (kind === "intro") {
      state.words[id] = {
        status: "learning", stage: 0, dueDay: day + IV[0], lapses: 0, reviews: 0, weak: null,
        introDay: day, introExtra: session.extra ? day : null, lastDay: day, knownDay: null,
      };
      touch(state, id);
      session.results[id] = "new";
      insertLater(session, { id, kind: "check", dir: pickDir(state, id, "check") });
    } else if (kind === "check") {
      rec.lastDay = day;
      if (action === "forgot") {
        rec.weak = dir;
        session.results[id] = "forgot";
        insertLater(session, { id, kind: "retry", dir });
      } else {
        schedule(rec, action === "easy" ? 1 : 0, day);
        finishWord(state, id, "new");
      }
      touch(state, id);
    } else if (kind === "review") {
      rec.reviews += 1;
      rec.lastDay = day;
      if (action === "forgot") {
        rec.stage = Math.max(0, rec.stage - 2);
        rec.dueDay = day + 1;
        rec.lapses += 1;
        rec.weak = dir;
        session.results[id] = "forgot";
        insertLater(session, { id, kind: "retry", dir });
      } else {
        schedule(rec, rec.stage + (action === "easy" ? 2 : 1), day);
        if (rec.weak === dir) rec.weak = null;
        finishWord(state, id, action);
      }
      touch(state, id);
    } else if (kind === "retry") {
      finishWord(state, id, session.results[id] === "new" ? "new" : "forgot");
    }

    markActive(state);
    session.pos += 1;
    session.revealed = false;
    if (session.pos >= session.queue.length) {
      endRound(state);
      return "round-end";
    }
    return "next";
  }

  function endRound(state) {
    const session = state.session;
    if (!session) return;
    state.lastRound = { day: session.day, round: session.round, extra: session.extra, words: session.words, results: session.results };
    state.session = null;
  }

  /** 在词库或筛选页把词标成「早就会了」 */
  function knownOutside(state, id) {
    const session = state.session;
    const inSession = Boolean(session && session.words.includes(id) && !session.finished[id]);
    knownRecord(state, id, inSession);
    if (!inSession) return;
    session.queue = session.queue.filter((item, index) => index < session.pos || item.id !== id);
    finishWord(state, id, "known");
    session.revealed = false;
    if (session.pos >= session.queue.length) endRound(state);
  }

  function restore(state, id) {
    const rec = state.words[id];
    if (!rec || rec.status !== "known") return;
    const learned = rec.reviews > 0 || Number.isInteger(rec.introDay);
    state.words[id] = learned
      ? { ...rec, status: "learning", dueDay: state.day, lastDay: rec.lastDay === state.day ? null : rec.lastDay, knownDay: null }
      : { ...rec, status: "fresh", knownDay: null, lastDay: null };
    touch(state, id);
  }

  function setWeak(state, id, weak) {
    const rec = state.words[id];
    if (!rec || rec.weak === weak) return;
    rec.weak = weak;
    touch(state, id);
  }

  function intervalPreview(state, item) {
    if (!item) return {};
    if (item.kind === "check") return { forgot: "稍后再考", remember: "明天", easy: dayLabel(IV[1]) };
    if (item.kind === "retry") return { forgot: "明天", remember: "明天", easy: "明天" };
    const stage = state.words[item.id]?.stage ?? 0;
    return {
      forgot: "明天",
      remember: dayLabel(IV[Math.min(MAX_STAGE, stage + 1)]),
      easy: dayLabel(IV[Math.min(MAX_STAGE, stage + 2)]),
    };
  }

  function dayLabel(days) {
    if (days <= 0) return "今天";
    if (days === 1) return "明天";
    if (days === 2) return "后天";
    if (days < 60) return `${days} 天后`;
    return `约 ${Math.round(days / 30)} 个月后`;
  }

  function dueLabel(state, rec) {
    if (!rec || rec.status !== "learning" || !Number.isInteger(rec.dueDay)) return "";
    return dayLabel(rec.dueDay - state.day);
  }

  function status(rec) {
    if (isFresh(rec)) return "fresh";
    if (rec.status === "known") return "known";
    return rec.stage >= MASTERED_STAGE ? "mastered" : "learning";
  }

  function counts(state) {
    const result = { fresh: 0, learning: 0, mastered: 0, known: 0, n3Seen: 0, n3Total: 0 };
    CARDS.forEach((item) => {
      const rec = state.words[item.id];
      result[status(rec)] += 1;
      if (isN3(item.id)) {
        result.n3Total += 1;
        if (!isFresh(rec)) result.n3Seen += 1;
      }
    });
    return result;
  }

  function forecast(state, days = 7) {
    const list = [];
    for (let offset = 1; offset <= days; offset += 1) {
      const day = state.day + offset;
      list.push({ day, count: Object.values(state.words).filter((rec) => rec.status === "learning" && rec.dueDay === day).length });
    }
    return list;
  }

  function streak(state) {
    const days = new Set(state.activeDays);
    let day = days.has(state.day) ? state.day : state.day - 1;
    let count = 0;
    while (days.has(day)) {
      count += 1;
      day -= 1;
    }
    return count;
  }

  /** 顶栏角标：今天到期、还没复习的词数（不需要词卡数据） */
  function dueCount(state, day = studyDay()) {
    return Object.values(state?.words || {})
      .filter((rec) => rec && rec.status === "learning" && Number.isInteger(rec.dueDay) && rec.dueDay <= day && rec.lastDay !== day)
      .length;
  }

  /* ---------- 旧版进度迁移 ----------
     闪卡熟练度 1–5 级、三种测试各自的 0–7 关，都换算成新档位，取最好的一份。
     迁移记录的时间戳放在 1970 年、按档位递增：两台设备各自迁移时保留档位更高的那份，
     新版里任何一次真实的复习都比它新。 */
  function legacyRecord(flash, test, day) {
    let stage = -1;
    let dueMs = 0;
    let reviews = 0;
    let lapses = 0;
    let weak = null;
    let weakLapses = 0;
    if (flash && Number(flash.reviews) > 0) {
      stage = Math.max(0, Math.min(4, (Number(flash.level) || 0) - 1));
      dueMs = Number(flash.due) || 0;
      reviews += Number(flash.reviews) || 0;
      lapses += Number(flash.misses) || 0;
    }
    Object.entries(test?.modes || {}).forEach(([mode, item]) => {
      if (!item || !(Number(item.attempts) > 0)) return;
      reviews += Number(item.attempts) || 0;
      lapses += Number(item.lapses) || 0;
      const modeStage = item.graduated ? MASTERED_STAGE : Math.max(0, Math.min(4, (Number(item.stage) || 0) - 2));
      if (modeStage > stage) {
        stage = modeStage;
        dueMs = item.graduated ? 0 : Number(item.due) || 0;
      }
      if (!item.graduated && Number(item.lapses) > weakLapses && LEGACY_MODES[mode]) {
        weak = LEGACY_MODES[mode];
        weakLapses = Number(item.lapses);
      }
    });
    if (stage < 0) return null;
    return {
      status: "learning",
      stage,
      dueDay: dueMs ? studyDay(dueMs) : day + IV[stage],
      lapses,
      reviews,
      weak,
      introDay: null,
      introExtra: null,
      lastDay: null,
      knownDay: null,
      updatedAt: new Date(stage * 100000 + Math.min(reviews, 99999)).toISOString(),
    };
  }

  function migrateLegacy(state, flashcards, tests) {
    let count = 0;
    const ids = new Set([...Object.keys(flashcards || {}), ...Object.keys(tests || {})]);
    ids.forEach((id) => {
      if (!byId.has(id)) return;
      const rec = legacyRecord(flashcards?.[id], tests?.[id], state.day);
      if (!rec) return;
      const local = state.words[id];
      if (local && (local.updatedAt || "") >= rec.updatedAt) return;
      state.words[id] = rec;
      if (!state.pending.words.includes(id)) state.pending.words.push(id);
      count += 1;
    });
    state.legacyMigrated = true;
    state.migratedCount = count;
    return count;
  }

  /* ---------- 同步 ---------- */
  function recordData(rec) {
    const { updatedAt, ...data } = rec;
    return cleanRecord(data);
  }

  function syncBody(state) {
    const words = state.pending.words
      .filter((id) => state.words[id]?.updatedAt)
      .map((id) => ({ id, data: recordData(state.words[id]), updatedAt: state.words[id].updatedAt }));
    // 学过的日子在服务器上只增不减，每次只带最近 30 天
    const body = { words, activeDays: state.activeDays.slice(-30) };
    if (state.pending.settings && state.settingsUpdatedAt) {
      body.settings = { data: { ...state.settings }, updatedAt: state.settingsUpdatedAt };
    }
    return body;
  }

  /** 合并服务器返回的记录：每个词、设置都按更新时间取较新的一份；学习日取并集。返回是否有变化。 */
  function mergeRemote(state, payload, sentActivity = false) {
    let changed = false;
    const pending = new Set(state.pending.words);
    (Array.isArray(payload?.words) ? payload.words : []).forEach((row) => {
      if (!row || typeof row.id !== "string" || typeof row.updatedAt !== "string" || !row.data) return;
      const local = state.words[row.id];
      const localAt = local?.updatedAt || "";
      if (!local || row.updatedAt > localAt) {
        state.words[row.id] = { ...cleanRecord(row.data), updatedAt: row.updatedAt };
        pending.delete(row.id);
        changed = true;
      } else if (row.updatedAt === localAt) {
        pending.delete(row.id);
      }
    });
    state.pending.words = [...pending];

    const remoteSettings = payload?.settings;
    if (remoteSettings && typeof remoteSettings.updatedAt === "string") {
      if (!state.settingsUpdatedAt || remoteSettings.updatedAt > state.settingsUpdatedAt) {
        state.settings = { ...state.settings, ...cleanSettings(remoteSettings.data) };
        state.settingsUpdatedAt = remoteSettings.updatedAt;
        state.pending.settings = false;
        changed = true;
      } else if (remoteSettings.updatedAt === state.settingsUpdatedAt) {
        state.pending.settings = false;
      }
    }

    if (Array.isArray(payload?.activeDays)) {
      const merged = new Set(state.activeDays);
      const before = merged.size;
      payload.activeDays.forEach((day) => {
        if (Number.isInteger(day)) merged.add(day);
      });
      if (merged.size !== before) changed = true;
      state.activeDays = [...merged].sort((a, b) => a - b).slice(-400);
      if (sentActivity) state.pending.activity = false;
    }
    return changed;
  }

  const hasPending = (state) => state.pending.words.length > 0 || state.pending.settings || state.pending.activity;

  /* ---------- 专项练习：打字判分 ---------- */
  const ALIASES = {
    "greeting-01": ["おはよう"],
    "greeting-04": ["じゃあまたね", "じゃまた", "またね"],
    "greeting-05": ["ありがとう", "どうもありがとう", "どうもありがとうございます"],
    "greeting-06": ["すいません"],
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[\s　。、，,．.！!？?・･「」『』（）()【】[\]／/\\\-—_～〜…]/g, "");
  }

  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const temp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = temp;
      }
    }
    return row[b.length];
  }

  // 「続ける / つづける / つづけます」也接受「続けます」
  function kanjiPolite(item) {
    if (!item.polite || item.writing === item.kana) return "";
    let n = 0;
    while (n < item.writing.length && n < item.kana.length && item.writing.at(-1 - n) === item.kana.at(-1 - n)) n += 1;
    const stemKana = item.kana.slice(0, item.kana.length - n);
    const stemKanji = item.writing.slice(0, item.writing.length - n);
    return n && item.polite.startsWith(stemKana) ? stemKanji + item.polite.slice(stemKana.length) : "";
  }

  function checkTyped(item, answer) {
    const given = normalize(answer);
    const accepted = [...new Set([item.writing, item.kana, item.polite, kanjiPolite(item), ...(ALIASES[item.id] || [])].map(normalize).filter(Boolean))];
    const ok = Boolean(given) && accepted.includes(given);
    const near = !ok && Boolean(given) && accepted.some((value) => value.length >= 3 && distance(value, given) === 1);
    return { ok, near };
  }

  function practicePool(state, source) {
    const learned = Object.entries(state.words).filter(([id, rec]) => rec.status === "learning" && byId.has(id));
    let list;
    if (source === "weak") {
      list = learned.filter(([, rec]) => rec.weak || rec.lapses > 0)
        .sort(([, a], [, b]) => b.lapses - a.lapses || (b.weak ? 1 : 0) - (a.weak ? 1 : 0));
    } else if (source === "recent") {
      list = learned.sort(([, a], [, b]) => (b.introDay ?? -1e9) - (a.introDay ?? -1e9) || (b.lastDay ?? -1e9) - (a.lastDay ?? -1e9));
    } else {
      list = learned.sort(([a], [b]) => hash(a + state.day) - hash(b + state.day));
    }
    return list.slice(0, 10).map(([id]) => id);
  }

  return {
    IV, ROUND_SIZE, NEW_PER_DAY, EXTRA_NEW, DIRS, MASTERED_STAGE, MAX_STAGE,
    setCards, setClock, card, isN3, studyDay, dateLabel, weekdayLabel,
    emptyState, normalizeState, setDay, dayRec, updateSettings,
    dueIds, newCandidates, today, pickDir, startRound, startExtraNew, current, act,
    knownOutside, restore, setWeak, intervalPreview, dayLabel, dueLabel, status, counts,
    forecast, streak, dueCount, migrateLegacy, syncBody, mergeRemote, hasPending,
    checkTyped, practicePool,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Daily;
