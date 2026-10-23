import {
  parsePace,
  effectiveHardPace,
  runningPlan,
  planTotal,
} from "./core.js?v=1.6.0";

const earlier = (sessions, date) =>
  Object.keys(sessions)
    .filter((key) => key < date)
    .sort()
    .reverse();
const validPace = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 1 &&
  value <= 5999;
const validEffort = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 10;
export const effortTarget = (type) => (type === "interval" ? [7, 8] : [3, 4]);

// A saved mode belongs to a whole exercise on one date, never to an individual set.
export function withoutWeight(sessions, date, id) {
  if (Object.hasOwn(sessions[date]?.withoutWeight || {}, id))
    return sessions[date].withoutWeight[id];
  // Existing weighted records must not change when older sessions are later edited.
  if (sessions[date]?.sets?.[id]) return false;
  const previous = earlier(sessions, date).find(
    (key) =>
      Object.hasOwn(sessions[key].withoutWeight || {}, id) ||
      sessions[key].sets?.[id],
  );
  return previous ? Boolean(sessions[previous].withoutWeight?.[id]) : false;
}

export function loadSuggestions(sessions, date, id, percent) {
  const keys = earlier(sessions, date);
  return Array.from({ length: 3 }, (_, index) => {
    for (const key of keys) {
      if (sessions[key].withoutWeight?.[id]) continue;
      const set = sessions[key].sets?.[id]?.[index];
      if (
        !set?.done ||
        !Number.isFinite(set.kg) ||
        set.kg <= 0 ||
        !Number.isFinite(set.reps) ||
        set.reps <= 0
      )
        continue;
      const increase = set.reps >= 8 ? percent : 0;
      const kg =
        Math.round((set.kg * (1 + increase / 100) + Number.EPSILON) * 100) /
        100;
      return {
        date: key,
        previousKg: set.kg,
        reps: set.reps,
        kg,
        percent: increase,
        usable: kg <= 2000,
      };
    }
    return null;
  });
}

export function paceRevision(settings, type) {
  return settings.paceRevisions?.[type === "interval" ? "hard" : "easy"] ?? 0;
}
export function nextPaceRevisions(before, after) {
  const easyChanged = parsePace(before.easyPace) !== parsePace(after.easyPace);
  const hardChanged = effectiveHardPace(before) !== effectiveHardPace(after);
  return {
    easy: paceRevision(before, "easy") + Number(easyChanged),
    hard: paceRevision(before, "interval") + Number(easyChanged || hardChanged),
  };
}

// These bounded steps are an app policy, not a physiological RPE-to-speed formula.
export function recommendPace(type, settings, sessions, date) {
  const basePace =
    type === "interval"
      ? effectiveHardPace(settings)
      : parsePace(settings.easyPace);
  const [min, max] = effortTarget(type);
  const result = {
    basePace,
    pace: basePace,
    sourceDate: null,
    previousPace: null,
    rpe: null,
    percent: 0,
    reason: "base",
    blocked: false,
  };
  if (!basePace) return result;
  const history = earlier(sessions, date)
    .flatMap((key) => {
      const s = sessions[key],
        r = s.run;
      if (
        !s.done ||
        s.type !== type ||
        !r ||
        (r.paceRevision ?? 0) !== paceRevision(settings, type)
      )
        return [];
      const pace = type === "interval" ? r.hardPace : (r.minutes * 60) / r.km;
      const rpe = type === "interval" ? r.hardRpe : r.rpe;
      return validPace(pace) && validEffort(rpe)
        ? [{ date: key, pace, rpe }]
        : [];
    })
    .slice(0, 2);
  if (!history.length) return result;
  const last = history[0];
  let percent = 0,
    reason = "maintain";
  if (last.rpe > max) {
    const gap = last.rpe - max;
    percent = Math.min(gap * 2.5, 10);
    reason = "ease";
    if (settings.paceProgression && gap <= 2) {
      percent /= 2;
      reason = "partial";
    }
  } else if (last.rpe < min) {
    percent = -Math.min((min - last.rpe) * 2.5, 5);
    reason = "calibrate";
  } else if (
    settings.paceProgression &&
    history.length === 2 &&
    history[1].rpe >= min &&
    history[1].rpe <= max
  ) {
    percent = -1;
    reason = "progress";
  }
  const pace = Math.round(last.pace * (1 + percent / 100));
  const blocked =
    !validPace(pace) ||
    (type === "interval" &&
      (!parsePace(settings.easyPace) || pace >= parsePace(settings.easyPace)));
  return {
    basePace,
    pace: blocked ? null : pace,
    sourceDate: last.date,
    previousPace: last.pace,
    rpe: last.rpe,
    percent,
    reason,
    blocked,
  };
}

export function getRunPlan(type, settings, sessions, date) {
  const saved = sessions[date]?.run?.plan;
  const adjustment =
    saved?.adjustment ?? recommendPace(type, settings, sessions, date);
  const snapshot = saved || {
    easyPace:
      type === "interval" ? parsePace(settings.easyPace) : adjustment.pace,
    hardPace:
      type === "interval" ? adjustment.pace : effectiveHardPace(settings),
    walkPace: parsePace(settings.walkPace),
    longMinutes: settings.longMinutes,
    adjustment,
  };
  const blocks = runningPlan(
    type,
    { ...settings, longMinutes: snapshot.longMinutes },
    snapshot,
  );
  return {
    blocks,
    total: planTotal(blocks),
    snapshot,
    adjustment,
    saved: Boolean(saved),
  };
}
