import { planWorkoutForDay } from "./plans.js?v=1.6.0";
export const VERSION = 3;
// Keep the original storage key so existing diaries migrate in place.
export const KEY = "treino-hibrido:v1";
export const defaults = () => ({
  version: VERSION,
  settings: {
    easyPace: "",
    hardPace: "",
    walkPace: "",
    recentRun: { km: "", seconds: "", date: "" },
    recentRunNote: "",
    useRecentPace: false,
    manualHardPace: "",
    longDay: 6,
    longMinutes: 60,
    loadProgression: 5,
    paceProgression: false,
    paceRevisions: { easy: 0, hard: 0 },
  },
  sessions: {},
});
export function parsePace(value) {
  if (typeof value !== "string" || !/^\d{1,2}:[0-5]\d$/.test(value))
    return null;
  const [m, s] = value.split(":").map(Number);
  return m * 60 + s > 0 ? m * 60 + s : null;
}
export function paceText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const n = Math.round(seconds);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export function maskTime(value, maxDigits = 4) {
  const digits = String(value).replace(/\D/g, "").slice(0, maxDigits);
  return digits.replace(/(\d)(?=(\d{2})+$)/g, "$1:");
}
export function parseDuration(value) {
  if (
    typeof value !== "string" ||
    !/^(?:\d{1,2}:)?\d{1,2}:[0-5]\d$/.test(value)
  )
    return null;
  const parts = value.split(":").map(Number);
  if (parts.length === 3 && parts[1] > 59) return null;
  const seconds = parts.reduce((sum, part) => sum * 60 + part, 0);
  return seconds > 0 && seconds <= 86400 ? seconds : null;
}
export function durationText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function validDate(key) {
  return (
    typeof key === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    !Number.isNaN(dateFromKey(key).valueOf()) &&
    dateKey(dateFromKey(key)) === key
  );
}
export function recentRunPace(run) {
  if (!run || !finite(run.km, 0.001, 1000) || !finite(run.seconds, 1, 86400))
    return null;
  const pace = Math.round(run.seconds / run.km);
  return pace > 0 && pace <= 5999 ? pace : null;
}
export function effectiveHardPace(settings) {
  return settings.useRecentPace
    ? recentRunPace(settings.recentRun)
    : parsePace(settings.hardPace);
}
export const distance = (minutes, pace) =>
  pace ? (minutes * 60) / pace : null;
export const speed = (pace) => (pace ? 3600 / pace : null);
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}
export function addDays(key, n) {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function weekStart(key) {
  const d = dateFromKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}
export function workoutFor(key, settings) {
  const day = dateFromKey(key).getDay();
  return planWorkoutForDay(day, settings);
}
export function runningPlan(type, settings, overrides = {}) {
  const easy = Object.hasOwn(overrides, "easyPace")
      ? overrides.easyPace
      : parsePace(settings.easyPace),
    hard = Object.hasOwn(overrides, "hardPace")
      ? overrides.hardPace
      : effectiveHardPace(settings),
    walk = Object.hasOwn(overrides, "walkPace")
      ? overrides.walkPace
      : parsePace(settings.walkPace);
  let blocks = [];
  if (type === "interval") {
    blocks.push({
      label: "Aquecimento · trote leve",
      minutes: 5,
      pace: easy,
      kind: "easy",
    });
    for (let i = 1; i <= 8; i++) {
      blocks.push(
        {
          label: `Bloco ${i} · moderado-forte`,
          minutes: 3,
          pace: hard,
          kind: "hard",
        },
        {
          label: `Bloco ${i} · recuperação leve`,
          minutes: 1,
          pace: easy,
          kind: "easy",
        },
      );
    }
    blocks.push({
      label: "Desaquecimento · caminhada",
      minutes: 3,
      pace: walk,
      kind: "walk",
    });
  } else
    blocks = [
      {
        label: type === "long" ? "Longão · ritmo leve" : "Corrida leve",
        minutes: type === "long" ? settings.longMinutes : 30,
        pace: easy,
        kind: "easy",
      },
    ];
  return blocks.map((b) => ({
    ...b,
    km: distance(b.minutes, b.pace),
    kph: speed(b.pace),
  }));
}
export function planTotal(blocks) {
  const known = blocks.filter((b) => b.km !== null);
  return {
    minutes: blocks.reduce((s, b) => s + b.minutes, 0),
    km: known.reduce((s, b) => s + b.km, 0),
    complete: known.length === blocks.length,
    known: known.length,
  };
}
function object(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function finite(v, min, max) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
const nullablePace = (value) => value === null || finite(value, 1, 5999);
function validatePlan(plan, type, date) {
  if (
    !object(plan) ||
    ![plan.easyPace, plan.hardPace, plan.walkPace].every(nullablePace) ||
    !finite(plan.longMinutes, 60, 90)
  )
    throw Error("Planejamento de corrida inválido no backup.");
  const a = plan.adjustment;
  if (
    !object(a) ||
    ![a.basePace, a.pace, a.previousPace].every(nullablePace) ||
    (a.sourceDate !== null && !validDate(a.sourceDate)) ||
    (a.rpe !== null && (!Number.isInteger(a.rpe) || !finite(a.rpe, 1, 10))) ||
    !finite(a.percent, -5, 10) ||
    typeof a.blocked !== "boolean" ||
    !["base", "maintain", "ease", "partial", "calibrate", "progress"].includes(
      a.reason,
    )
  )
    throw Error("Ajuste de corrida inválido no backup.");
  if (
    !["easy", "long", "interval"].includes(type) ||
    a.pace !== (type === "interval" ? plan.hardPace : plan.easyPace) ||
    (a.blocked && a.pace !== null) ||
    (a.sourceDate !== null &&
      (a.sourceDate >= date ||
        a.previousPace === null ||
        a.rpe === null ||
        a.reason === "base")) ||
    (a.sourceDate === null &&
      (a.previousPace !== null ||
        a.rpe !== null ||
        a.reason !== "base" ||
        a.percent !== 0))
  )
    throw Error("Referência do planejamento inválida no backup.");
  return {
    easyPace: plan.easyPace,
    hardPace: plan.hardPace,
    walkPace: plan.walkPace,
    longMinutes: plan.longMinutes,
    adjustment: {
      basePace: a.basePace,
      pace: a.pace,
      previousPace: a.previousPace,
      sourceDate: a.sourceDate,
      rpe: a.rpe,
      percent: a.percent,
      reason: a.reason,
      blocked: a.blocked,
    },
  };
}
export function validateBackup(value) {
  if (
    !object(value) ||
    ![1, 2, VERSION].includes(value.version) ||
    !object(value.settings) ||
    !object(value.sessions)
  )
    throw Error(
      "Backup incompatível ou inválido. Seus dados foram preservados.",
    );
  let s = value.settings;
  if (value.version === 1) {
    if (typeof s.recentRun !== "string" || s.recentRun.length > 500)
      throw Error("Configurações inválidas no backup.");
    s = {
      ...s,
      recentRun: { km: "", seconds: "", date: "" },
      recentRunNote: s.recentRun,
      useRecentPace: false,
      manualHardPace: s.hardPace,
    };
  }
  if (value.version < 3)
    s = {
      ...s,
      loadProgression: 5,
      paceProgression: false,
      paceRevisions: { easy: 0, hard: 0 },
    };
  for (const p of ["easyPace", "hardPace", "walkPace"])
    if (s[p] !== "" && !parsePace(s[p]))
      throw Error("O backup contém um pace inválido.");
  if (
    !object(s.recentRun) ||
    (s.recentRun.km !== "" && !finite(s.recentRun.km, 0.001, 1000)) ||
    (s.recentRun.seconds !== "" &&
      (!finite(s.recentRun.seconds, 1, 86400) ||
        !Number.isInteger(s.recentRun.seconds))) ||
    (s.recentRun.date !== "" && !validDate(s.recentRun.date)) ||
    typeof s.recentRunNote !== "string" ||
    s.recentRunNote.length > 500 ||
    typeof s.useRecentPace !== "boolean" ||
    (s.manualHardPace !== "" && !parsePace(s.manualHardPace)) ||
    (s.useRecentPace &&
      (!recentRunPace(s.recentRun) || !validDate(s.recentRun.date))) ||
    ![0, 6].includes(s.longDay) ||
    !finite(s.longMinutes, 60, 90) ||
    !finite(s.loadProgression, 0, 10) ||
    !Number.isInteger(s.loadProgression * 2) ||
    typeof s.paceProgression !== "boolean" ||
    !object(s.paceRevisions) ||
    ![s.paceRevisions.easy, s.paceRevisions.hard].every(
      (v) => Number.isSafeInteger(v) && v >= 0,
    )
  )
    throw Error("Configurações inválidas no backup.");
  const sessions = {};
  if (Object.keys(value.sessions).length > 20000)
    throw Error("Backup muito grande.");
  for (const [key, entry] of Object.entries(value.sessions)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
      Number.isNaN(dateFromKey(key).valueOf()) ||
      dateKey(dateFromKey(key)) !== key ||
      !object(entry) ||
      ![
        "upper",
        "upper2",
        "lower",
        "easy",
        "long",
        "interval",
        "rest",
      ].includes(entry.type) ||
      typeof entry.done !== "boolean"
    )
      throw Error("Sessão inválida no backup.");
    const clean = { type: entry.type, done: entry.done, sets: {}, run: null };
    if (entry.withoutWeight !== undefined) {
      if (!object(entry.withoutWeight))
        throw Error("Modo sem peso inválido no backup.");
      clean.withoutWeight = {};
      for (const [id, enabled] of Object.entries(entry.withoutWeight)) {
        if (!/^[a-z0-9-]{1,50}$/.test(id) || typeof enabled !== "boolean")
          throw Error("Modo sem peso inválido no backup.");
        clean.withoutWeight[id] = enabled;
      }
    }
    if (!object(entry.sets)) throw Error("Séries inválidas.");
    for (const [id, sets] of Object.entries(entry.sets)) {
      if (
        !/^[a-z0-9-]{1,50}$/.test(id) ||
        !Array.isArray(sets) ||
        sets.length !== 3
      )
        throw Error("Exercício inválido.");
      clean.sets[id] = sets.map((set) => {
        if (
          !object(set) ||
          typeof set.done !== "boolean" ||
          (set.kg !== "" && !finite(set.kg, 0, 2000)) ||
          (set.reps !== "" && !finite(set.reps, 0, 1000))
        )
          throw Error("Série inválida.");
        return { kg: set.kg, reps: set.reps, done: set.done };
      });
    }
    if (entry.run !== null && entry.run !== undefined) {
      const r = entry.run;
      if (
        !object(r) ||
        !finite(r.minutes, 0.01, 1440) ||
        !finite(r.km, 0.001, 1000) ||
        !Number.isInteger(r.rpe) ||
        !finite(r.rpe, 0, 10) ||
        typeof r.notes !== "string" ||
        r.notes.length > 2000
      )
        throw Error("Corrida inválida no backup.");
      clean.run = { minutes: r.minutes, km: r.km, rpe: r.rpe, notes: r.notes };
      if (r.hardPace !== undefined || r.hardRpe !== undefined) {
        if (
          entry.type !== "interval" ||
          !nullablePace(r.hardPace) ||
          (r.hardRpe !== null &&
            (!Number.isInteger(r.hardRpe) || !finite(r.hardRpe, 0, 10))) ||
          (r.hardPace === null) !== (r.hardRpe === null)
        )
          throw Error("Dados dos blocos fortes inválidos no backup.");
        clean.run.hardPace = r.hardPace;
        clean.run.hardRpe = r.hardRpe;
      }
      if (r.paceRevision !== undefined) {
        if (!Number.isSafeInteger(r.paceRevision) || r.paceRevision < 0)
          throw Error("Referência de pace inválida.");
        clean.run.paceRevision = r.paceRevision;
      }
      if (r.plan !== undefined)
        clean.run.plan = validatePlan(r.plan, entry.type, key);
    }
    sessions[key] = clean;
  }
  return {
    version: VERSION,
    settings: {
      easyPace: s.easyPace,
      hardPace: s.useRecentPace
        ? paceText(recentRunPace(s.recentRun))
        : s.hardPace,
      walkPace: s.walkPace,
      recentRun: {
        km: s.recentRun.km,
        seconds: s.recentRun.seconds,
        date: s.recentRun.date,
      },
      recentRunNote: s.recentRunNote,
      useRecentPace: s.useRecentPace,
      manualHardPace: s.manualHardPace,
      longDay: s.longDay,
      longMinutes: s.longMinutes,
      loadProgression: s.loadProgression,
      paceProgression: s.paceProgression,
      paceRevisions: { easy: s.paceRevisions.easy, hard: s.paceRevisions.hard },
    },
    sessions,
  };
}
export function previousSets(sessions, key, id) {
  return (
    Object.keys(sessions)
      .filter(
        (k) =>
          k < key &&
          sessions[k].sets?.[id]?.some(
            (s) => s.done || s.kg !== "" || s.reps !== "",
          ),
      )
      .sort()
      .reverse()
      .map((k) => ({ date: k, sets: sessions[k].sets[id] }))[0] || null
  );
}
