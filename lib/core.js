import { planWorkoutForDay } from "./plans.js?v=1.6.0";
export const VERSION = 5;
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
export function validateWorkout(entry, key) {
  if (
    !object(entry) ||
    !["upper", "upper2", "lower", "easy", "long", "interval", "rest"].includes(
      entry.type,
    ) ||
    typeof entry.done !== "boolean"
  )
    throw Error("Sessão inválida no backup.");
  const clean = { type: entry.type, done: entry.done, sets: {}, run: null };
  for (const field of ["completedAt", "canceledAt"]) {
    const value = entry[field] ?? null;
    if (
      value !== null &&
      (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString() !== value)
    )
      throw Error("Data de status inválida.");
    clean[field] = value;
  }
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

  if (
    (!clean.done && clean.completedAt) ||
    (clean.canceledAt && (clean.type === "rest" || workoutStarted(clean)))
  )
    throw Error("Estado do treino incompatível com os registros.");
  return clean;
}
// Legacy queued payloads are immutable. Omission must not erase new metadata.
export function preserveWorkoutMetadata(incoming, previous) {
  const next = structuredClone(incoming);
  if (!object(next)) return next;
  for (const field of ["completedAt", "canceledAt"])
    if (!Object.hasOwn(next, field) && previous?.[field] != null)
      next[field] = previous[field];
  return next;
}
export function preserveDayMetadata(incoming, previous) {
  if (!Array.isArray(incoming?.workouts)) return structuredClone(incoming);
  return {
    ...incoming,
    workouts: incoming.workouts.map((item) =>
      preserveWorkoutMetadata(
        item,
        previous?.workouts?.find((old) => old.id === item?.id),
      ),
    ),
  };
}
export function normalizeStoredDay(key, entry) {
  if (!validDate(key) || !object(entry)) throw Error("Dia inválido no backup.");
  if (Object.hasOwn(entry, "workouts")) {
    if (!Array.isArray(entry.workouts))
      throw Error("Treinos do dia inválidos.");
    const ids = new Set();
    return {
      workouts: entry.workouts.map((item) => {
        if (
          !object(item) ||
          typeof item.id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
          ids.has(item.id)
        )
          throw Error("Identificador de treino inválido ou repetido.");
        ids.add(item.id);
        return { id: item.id, ...validateWorkout(item, key) };
      }),
    };
  }
  const item = validateWorkout(entry, key);
  return {
    workouts:
      item.type === "rest" && !workoutStarted(item)
        ? []
        : [{ id: `legacy-${key}`, ...item }],
  };
}
export function validateBackup(value) {
  if (
    !object(value) ||
    ![1, 2, 3, 4, VERSION].includes(value.version) ||
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
  const sessions = {},
    ids = new Set();
  if (Object.keys(value.sessions).length > 20000)
    throw Error("Backup muito grande.");
  for (const [key, entry] of Object.entries(value.sessions)) {
    if (
      value.version >= 4 &&
      (!object(entry) || !Array.isArray(entry.workouts))
    )
      throw Error("Treinos do dia inválidos.");
    const day = normalizeStoredDay(key, entry);
    for (const item of day.workouts) {
      if (ids.has(item.id))
        throw Error("Identificador de treino repetido no diário.");
      ids.add(item.id);
    }
    sessions[key] = day;
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
export function storedWorkouts(day) {
  return day?.workouts ?? (day ? [day] : []);
}
export function createWorkout(type, id = crypto.randomUUID()) {
  if (!["upper", "upper2", "lower", "easy", "long", "interval"].includes(type))
    throw Error("Treino inválido.");
  return {
    id,
    type,
    done: false,
    sets: {},
    run: null,
    completedAt: null,
    canceledAt: null,
  };
}
export function scheduledWorkouts(data, date) {
  if (Object.hasOwn(data.sessions, date))
    return storedWorkouts(data.sessions[date]);
  const type = workoutFor(date, data.settings);
  return type === "rest" ? [] : [createWorkout(type, `plan-${date}`)];
}
export function materializeDay(data, date) {
  if (!validDate(date)) throw Error("Data inválida.");
  return (data.sessions[date] ??= {
    workouts: structuredClone(scheduledWorkouts(data, date)),
  });
}
export function workoutStarted(item) {
  return Boolean(
    item?.done ||
      item?.run ||
      Object.values(item?.sets ?? {}).some((sets) =>
        sets.some((s) => s.done || s.kg !== "" || s.reps !== ""),
      ),
  );
}
export function workoutState(
  item,
  { date = "", today = dateKey(), hasDraft = false } = {},
) {
  if (!item || item.type === "rest")
    return { key: "rest", label: "Descanso", action: "Ver recuperação" };
  if (item.canceledAt)
    return { key: "canceled", label: "Cancelado", action: "Reativar treino" };
  if (item.done)
    return {
      key: "done",
      label: hasDraft ? "Concluído · alterações não salvas" : "Concluído",
      action: "Rever treino",
    };
  if (workoutStarted(item) || hasDraft)
    return {
      key: "started",
      label: "Em andamento",
      action: "Continuar treino",
    };
  return date && date < today
    ? { key: "missed", label: "Não realizado", action: "Reorganizar treino" }
    : { key: "planned", label: "Programado", action: "Iniciar treino" };
}
export function dayState(data, date, today = dateKey()) {
  const items = scheduledWorkouts(data, date).filter((s) => s.type !== "rest");
  if (!items.length) return workoutState(null);
  if (items.every((s) => s.done)) return { key: "done", label: "Concluído" };
  if (items.every((s) => s.canceledAt))
    return { key: "canceled", label: "Cancelado" };
  return items.some(workoutStarted)
    ? { key: "started", label: "Em andamento" }
    : workoutState(items.find((s) => !s.canceledAt) ?? items[0], {
        date,
        today,
      });
}
export function recordedWorkouts(sessions) {
  return Object.entries(sessions)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([date, day]) =>
      storedWorkouts(day).map((workout, index) => ({ date, workout, index })),
    );
}
export function earlierWorkouts(sessions, date) {
  return Object.keys(sessions)
    .filter((key) => key < date)
    .sort()
    .reverse()
    .flatMap((key) =>
      storedWorkouts(sessions[key])
        .filter((s) => !s.canceledAt)
        .slice()
        .reverse()
        .map((workout) => ({ date: key, workout })),
    );
}
export function previousSets(sessions, key, id) {
  const found = earlierWorkouts(sessions, key).find(({ workout }) =>
    workout.sets?.[id]?.some((s) => s.done || s.kg !== "" || s.reps !== ""),
  );
  return found
    ? {
        date: found.date,
        workoutId: found.workout.id,
        sets: found.workout.sets[id],
        withoutWeight: Boolean(found.workout.withoutWeight?.[id]),
      }
    : null;
}
export function addWorkout(data, date, type) {
  const item = createWorkout(type);
  materializeDay(data, date).workouts.push(item);
  return item;
}
export function moveWorkout(data, from, to, id) {
  if (!validDate(from) || !validDate(to) || from === to)
    throw Error("Escolha outra data válida.");
  const item = scheduledWorkouts(data, from).find((s) => s.id === id);
  if (!item || workoutStarted(item) || item.canceledAt)
    throw Error("Somente treinos sem registros podem ser movidos.");
  const source = materializeDay(data, from),
    target = materializeDay(data, to);
  source.workouts = source.workouts.filter((s) => s.id !== id);
  target.workouts.push(item);
  return item;
}
export function cancelWorkout(data, date, id, now = new Date().toISOString()) {
  const existing = scheduledWorkouts(data, date).find((s) => s.id === id);
  if (!existing || existing.type === "rest" || workoutStarted(existing))
    throw Error("Somente treinos sem registros podem ser cancelados.");
  const item = materializeDay(data, date).workouts.find((s) => s.id === id);
  item.canceledAt ??= now;
  return item;
}
export function reactivateWorkout(data, date, id) {
  const item = materializeDay(data, date).workouts.find((s) => s.id === id);
  if (!item?.canceledAt) throw Error("Este treino não está cancelado.");
  item.canceledAt = null;
  return item;
}
export function reopenWorkout(item) {
  if (item.canceledAt) throw Error("Reative o treino antes de registrar.");
  item.done = false;
  item.completedAt = null;
}
export function completeWorkout(item, now = new Date().toISOString()) {
  if (item.canceledAt) throw Error("Reative o treino antes de concluir.");
  if (!item.done) item.completedAt = now;
  item.done = true;
}
export function weekSummary(data, date, today = dateKey()) {
  const start = weekStart(date),
    items = Array.from({ length: 7 }, (_, i) =>
      scheduledWorkouts(data, addDays(start, i)),
    )
      .flat()
      .filter((s) => s.type !== "rest");
  const modality = (types) => ({
    planned: items.filter((s) => types.includes(s.type)).length,
    done: items.filter((s) => types.includes(s.type) && s.done).length,
  });
  return {
    planned: items.length,
    done: items.filter((s) => s.done).length,
    canceled: items.filter((s) => s.canceledAt).length,
    missed: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return scheduledWorkouts(data, day).filter(
        (s) => workoutState(s, { date: day, today }).key === "missed",
      ).length;
    }).reduce((a, b) => a + b, 0),
    strength: modality(["upper", "lower", "upper2"]),
    run: modality(["easy", "interval", "long"]),
  };
}
