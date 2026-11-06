import {
  replannedCrossFixture,
  CROSS_DATE,
  HISTORY_DATE,
} from "./helpers/replanned-cross-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  VERSION,
  scheduledWorkouts,
  materializeDay,
  workoutFor,
  addWorkout,
  moveWorkout,
  cancelWorkout,
  reactivateWorkout,
  chooseOptionalWorkout,
  completeWorkout,
  reopenWorkout,
  workoutState,
  workoutStarted,
  weekSummary,
  validateBackup,
  preserveSettingsMetadata,
  preserveDayMetadata,
  isOptionalSaturday,
} from "../lib/core.js";
import {
  ACTIVE_PLAN_ID,
  CROSS_PLAN_ID,
  changePlan,
  cancelPlanChange,
  getActivePlan,
  pendingPlanChange,
  planWeek,
} from "../lib/plans.js";
import { workoutName, workouts } from "../lib/exercises.js";
import { plansView } from "../lib/plans-view.js";
import {
  getRunPlan,
  recommendPace,
  loadSuggestions,
} from "../lib/progression.js";
import { historyView, historyDefaults } from "../lib/history-view.js";
test.beforeEach((t) =>
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-05T12:00:00").getTime(),
  }),
);
const TODAY = "2026-11-02",
  SAT = "2026-11-07";
const diary = () => {
  const d = defaults();
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, TODAY, TODAY);
  return d;
};
test("dated activation preserves older weeks, replaces only the future change and can cancel", () => {
  const d = defaults(),
    base = structuredClone(d.settings);
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, "2026-11-09", TODAY);
  assert.equal(getActivePlan(d.settings, "2026-11-08").id, ACTIVE_PLAN_ID);
  assert.equal(getActivePlan(d.settings, "2026-11-09").id, CROSS_PLAN_ID);
  assert.equal(pendingPlanChange(d.settings, TODAY).from, "2026-11-09");
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, "2026-11-16", TODAY);
  assert.equal(d.settings.planHistory.length, 2);
  assert.equal(d.settings.planHistory[1].from, "2026-11-16");
  assert.deepEqual(cancelPlanChange(d.settings, TODAY), base);
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, TODAY, TODAY);
  d.settings = changePlan(
    d.settings,
    ACTIVE_PLAN_ID,
    "2026-11-10",
    "2026-11-05",
  );
  assert.equal(getActivePlan(d.settings, "2026-11-06").id, CROSS_PLAN_ID);
  assert.equal(getActivePlan(d.settings, "2026-11-10").id, ACTIVE_PLAN_ID);
  assert.throws(() =>
    changePlan(d.settings, CROSS_PLAN_ID, "2026-11-01", TODAY),
  );
  assert.throws(() =>
    changePlan(d.settings, CROSS_PLAN_ID, "2026-02-30", TODAY),
  );
});
test("new calendar replaces unstarted saved dates and keeps catalog independent", () => {
  const d = defaults();
  materializeDay(d, "2026-11-05");
  d.sessions["2026-11-06"] = { workouts: [] };
  const original = structuredClone(d.sessions);
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, TODAY, TODAY);
  assert.deepEqual(d.sessions, original);
  assert.equal(scheduledWorkouts(d, "2026-11-05")[0].type, "cross");
  assert.equal(scheduledWorkouts(d, "2026-11-06")[0].type, "easy");
  assert.equal(workoutFor("2026-11-12", d.settings), "cross");
  assert.deepEqual(
    planWeek(d.settings, CROSS_PLAN_ID).map((d) => d.type),
    ["upper", "interval", "lower", "cross", "easy", "rest", "rest"],
  );
  d.settings.longDay = 0;
  assert.equal(workoutFor("2026-11-08", d.settings), "rest");
  assert.equal(planWeek(d.settings, ACTIVE_PLAN_ID)[6].type, "long");
  const detail = plansView(d.settings, { planId: CROSS_PLAN_ID });
  assert.match(detail, /15<\/b> exercícios regulares/);
  assert.match(detail, /Corrida regenerativa/);
  assert.match(detail, /Sábado opcional/);
  assert.equal((detail.match(/data-action="guide"/g) || []).length, 23);
  assert.deepEqual(d.sessions, original);
});
test("optional selection is per date and always outside weekly goal, including missed and canceled", () => {
  for (const type of ["cross", "upper2", "long"]) {
    const d = diary();
    assert.equal(weekSummary(d, TODAY, TODAY).planned, 5);
    assert.deepEqual(scheduledWorkouts(d, SAT), []);
    const item = chooseOptionalWorkout(d, SAT, type);
    assert.ok(item.optional);
    assert.equal(
      workoutState(item, { date: SAT, today: "2026-12-01" }).key,
      "optional",
    );
    assert.equal(weekSummary(d, TODAY, "2026-12-01").missed, 5);
    assert.deepEqual(scheduledWorkouts(d, "2026-11-14"), []);
    cancelWorkout(d, SAT, item.id);
    assert.equal(weekSummary(d, TODAY, TODAY).canceled, 0);
    reactivateWorkout(d, SAT, item.id);
    if (type === "cross") item.cross = { minutes: 45, rpe: 7, notes: "Aula" };
    completeWorkout(item, "2026-11-07T18:00:00.000Z");
    const s = weekSummary(d, TODAY, TODAY);
    assert.equal(s.planned, 5);
    assert.equal(s.done, 0);
    assert.equal(s.bonus.done, 1);
    assert.throws(() => chooseOptionalWorkout(d, SAT, "rest"), /iniciada/);
    assert.equal(validateBackup(d).sessions[SAT].workouts[0].optional, true);
  }
});
test("choice can be changed or cleared before starting; add, move and reactivation respect limits", () => {
  const d = diary(),
    first = chooseOptionalWorkout(d, SAT, "cross");
  const next = chooseOptionalWorkout(d, SAT, "upper2");
  assert.equal(next.id, first.id);
  assert.throws(() => addWorkout(d, SAT, "long"));
  assert.throws(() => addWorkout(d, "2026-11-14", "easy"));
  chooseOptionalWorkout(d, SAT, "rest");
  assert.deepEqual(scheduledWorkouts(d, SAT), []);
  const extra = addWorkout(d, "2026-11-08", "cross");
  moveWorkout(d, "2026-11-08", SAT, extra.id);
  assert.equal(extra.optional, true);
  cancelWorkout(d, SAT, extra.id);
  chooseOptionalWorkout(d, SAT, "long");
  assert.throws(() => reactivateWorkout(d, SAT, extra.id));
  const lower = scheduledWorkouts(d, "2026-11-04")[0];
  assert.throws(() => moveWorkout(d, "2026-11-04", "2026-11-14", lower.id));
  chooseOptionalWorkout(d, SAT, "rest");
  const bonus = chooseOptionalWorkout(d, SAT, "cross");
  moveWorkout(d, SAT, "2026-11-08", bonus.id);
  assert.equal(bonus.optional, true);
});
test("saved conflicting Saturday remains intact and cannot gain another activity", () => {
  const d = defaults();
  addWorkout(d, SAT, "upper");
  d.sessions[SAT].workouts[1].done = true;
  const saved = structuredClone(d.sessions);
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, TODAY, TODAY);
  assert.deepEqual(d.sessions, saved);
  assert.throws(() => addWorkout(d, SAT, "cross"));
  assert.throws(() => chooseOptionalWorkout(d, SAT, "long"));
  assert.equal(weekSummary(d, TODAY).planned, 7);
});
test("Cross validates its own result and stable conclusion, without fabricated running or strength", () => {
  const d = diary(),
    item = materializeDay(d, "2026-11-05").workouts[0];
  item.cross = { minutes: 50.5, rpe: 0, notes: "<aula>" };
  assert.ok(workoutStarted(item));
  assert.throws(() => cancelWorkout(d, "2026-11-05", item.id));
  completeWorkout(item, "2026-11-05T18:00:00.000Z");
  completeWorkout(item, "2026-11-05T19:00:00.000Z");
  assert.equal(item.completedAt, "2026-11-05T18:00:00.000Z");
  assert.deepEqual(validateBackup(d), d);
  const html = historyView(d, historyDefaults());
  assert.match(html, /CROSS/);
  assert.match(html, /50 min 30 s/);
  assert.match(html, /&lt;aula&gt;/);
  assert.doesNotMatch(html, /Consultar séries registradas/);
  for (const patch of [
    { minutes: 0 },
    { minutes: 1441 },
    { rpe: 11 },
    { rpe: 0.5 },
    { notes: "a".repeat(2001) },
  ]) {
    const bad = structuredClone(d);
    Object.assign(bad.sessions["2026-11-05"].workouts[0].cross, patch);
    assert.throws(() => validateBackup(bad));
  }
  const bad = structuredClone(d);
  delete bad.sessions["2026-11-05"].workouts[0].cross;
  assert.throws(() => validateBackup(bad));
  reopenWorkout(item);
  assert.equal(workoutState(item).key, "started");
});
test("regenerative name follows origin, with shared easy-run calculation and progression", () => {
  const d = diary();
  Object.assign(d.settings, { easyPace: "6:00", hardPace: "5:00" });
  const run = materializeDay(d, "2026-11-06").workouts[0];
  assert.equal(workoutName(run), "Corrida regenerativa");
  assert.equal(workoutName({ type: "easy" }), "Corrida leve");
  const planned = getRunPlan(
    "easy",
    d.settings,
    d.sessions,
    "2026-11-06",
    run.id,
  );
  assert.equal(planned.total.minutes, 30);
  run.run = { minutes: 30, km: 5, rpe: 4, notes: "", plan: planned.snapshot };
  completeWorkout(run);
  d.settings = changePlan(
    d.settings,
    ACTIVE_PLAN_ID,
    "2026-11-09",
    "2026-11-09",
  );
  assert.equal(workoutName(run), "Corrida regenerativa");
  assert.equal(
    recommendPace("easy", d.settings, d.sessions, "2026-11-12").sourceDate,
    "2026-11-06",
  );
  const upper = materializeDay(d, TODAY).workouts[0];
  upper.sets[workouts.upper.ids[0]] = [0, 1, 2].map(() => ({
    kg: 10,
    reps: 8,
    done: true,
  }));
  assert.equal(
    loadSuggestions(d.sessions, "2026-11-09", workouts.upper.ids[0], 5)[0]
      .previousKg,
    10,
  );
});
test("v1–v6 backups migrate to original plan; v7 validates and roundtrips plan history and metadata", () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const old = defaults();
    old.version = version;
    delete old.settings.planHistory;
    if (version === 1) old.settings.recentRun = "legacy note";
    const migrated = validateBackup(old);
    assert.equal(migrated.version, VERSION);
    assert.equal(getActivePlan(migrated.settings).id, ACTIVE_PLAN_ID);
  }
  const d = diary();
  chooseOptionalWorkout(d, SAT, "cross");
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(d))), d);
  for (const planHistory of [
    [],
    [{ planId: CROSS_PLAN_ID, from: null }],
    [
      { planId: ACTIVE_PLAN_ID, from: null },
      { planId: "invalid", from: TODAY },
    ],
    [
      { planId: ACTIVE_PLAN_ID, from: null },
      { planId: CROSS_PLAN_ID, from: "2026-02-30" },
    ],
  ]) {
    const bad = defaults();
    bad.settings.planHistory = planHistory;
    assert.throws(() => validateBackup(bad));
  }
});
test("legacy omissions retain new metadata without mutating immutable operation payloads", () => {
  const d = diary(),
    item = chooseOptionalWorkout(d, SAT, "cross");
  item.cross = { minutes: 40, rpe: 7, notes: "aula" };
  const oldSettings = { ...d.settings };
  delete oldSettings.planHistory;
  const original = JSON.stringify(oldSettings);
  assert.deepEqual(
    preserveSettingsMetadata(oldSettings, d.settings).planHistory,
    d.settings.planHistory,
  );
  assert.equal(JSON.stringify(oldSettings), original);
  const day = structuredClone(d.sessions[SAT]);
  for (const key of ["optional", "sourcePlanId", "cross"])
    delete day.workouts[0][key];
  const body = JSON.stringify(day);
  assert.deepEqual(preserveDayMetadata(day, d.sessions[SAT]), d.sessions[SAT]);
  assert.equal(JSON.stringify(day), body);
});

test("plan change reapplies today and future unstarted days, but preserves an entire started day", () => {
  const d = defaults(),
    today = "2026-11-05",
    future = "2026-11-06";
  const old = materializeDay(d, today);
  old.workouts[0].type = "interval";
  materializeDay(d, future);
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, today, today);
  assert.equal(scheduledWorkouts(d, today)[0].type, "cross");
  assert.equal(scheduledWorkouts(d, future)[0].type, "easy");
  assert.equal(old.workouts[0].type, "interval"); // Reading does not mutate raw history.
  const current = materializeDay(d, today);
  assert.equal(current.workouts[0].type, "cross");
  assert.match(current.planKey, /hibrido-cross@/);
  addWorkout(d, today, "interval");
  assert.equal(scheduledWorkouts(d, today).length, 2); // Explicit changes after activation persist.
  const locked = defaults();
  materializeDay(locked, today).workouts[0].type = "interval";
  locked.sessions[today].workouts[0].run = {
    minutes: 40,
    km: 6,
    rpe: 7,
    notes: "partial",
  };
  addWorkout(locked, today, "upper");
  locked.settings = changePlan(locked.settings, CROSS_PLAN_ID, today, today);
  assert.deepEqual(
    scheduledWorkouts(locked, today).map((w) => w.type),
    ["interval", "upper"],
  );
  assert.deepEqual(validateBackup(d).sessions, d.sessions);
});
test("canceling a future plan reapplies its unstarted programming and never replaces completed history", () => {
  const d = defaults(),
    future = "2026-11-12";
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, "2026-11-09", TODAY);
  assert.equal(materializeDay(d, future).workouts[0].type, "cross");
  d.settings = cancelPlanChange(d.settings, TODAY);
  assert.equal(scheduledWorkouts(d, future)[0].type, "easy");
  const key = d.sessions[future].planKey;
  assert.ok(key);
  const oldDay = materializeDay(d, "2026-10-29");
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, TODAY, TODAY);
  assert.equal(
    scheduledWorkouts(d, "2026-10-29")[0].type,
    oldDay.workouts[0].type,
  );
});

test("the new schedule does not revert when a previously unstarted date becomes past", (t) => {
  const d = defaults(),
    date = "2026-11-05";
  materializeDay(d, date).workouts[0].type = "interval";
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, date, date);
  assert.equal(scheduledWorkouts(d, date)[0].type, "cross");
  t.mock.timers.setTime(new Date("2026-11-06T12:00:00").getTime());
  assert.equal(scheduledWorkouts(d, date)[0].type, "cross");
});

test("completed Cross survives a plan change when its old date ID belongs to a remapped completed run", () => {
  const d = replannedCrossFixture(),
    previous = structuredClone(d.sessions[HISTORY_DATE]);
  const planned = scheduledWorkouts(d, CROSS_DATE)[0];
  assert.equal(planned.type, "cross");
  assert.notEqual(planned.id, previous.workouts[0].id);
  assert.equal(scheduledWorkouts(d, CROSS_DATE)[0].id, planned.id);
  const item = materializeDay(d, CROSS_DATE).workouts[0];
  item.cross = { minutes: 45, rpe: 7, notes: "Cross concluído" };
  completeWorkout(item);
  const restored = validateBackup(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.sessions[CROSS_DATE].workouts[0].done, true);
  assert.equal(restored.sessions[CROSS_DATE].workouts[0].cross.minutes, 45);
  assert.deepEqual(restored.sessions[HISTORY_DATE], previous);
});

test("a virtual date never reuses a moved ID, even for the original or the same assignment", () => {
  const d = defaults(),
    date = CROSS_DATE,
    to = "2026-11-06";
  const original = scheduledWorkouts(d, date)[0].id;
  moveWorkout(d, date, to, original);
  delete d.sessions[date]; // Legacy import without the explicit source rest.
  assert.notEqual(scheduledWorkouts(d, date)[0].id, original);
  assert.equal(
    scheduledWorkouts(d, date)[0].id,
    scheduledWorkouts(d, date)[0].id,
  );
  d.settings = changePlan(d.settings, CROSS_PLAN_ID, date, date);
  const cross = materializeDay(d, date).workouts[0];
  const firstId = cross.id;
  moveWorkout(d, date, to, firstId);
  delete d.sessions[date].planKey; // An older queued day without assignment metadata.
  const candidate = scheduledWorkouts(d, date)[0];
  assert.notEqual(candidate.id, firstId);
  assert.ok(candidate.id.length <= 100);
  const replacement = materializeDay(d, date).workouts[0];
  replacement.cross = { minutes: 30, rpe: 0, notes: "" };
  completeWorkout(replacement);
  assert.doesNotThrow(() => validateBackup(d));
});
