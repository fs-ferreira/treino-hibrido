import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  scheduledWorkouts,
  materializeDay,
  cancelWorkout,
  reactivateWorkout,
  completeWorkout,
  reopenWorkout,
  workoutState,
  moveWorkout,
  addWorkout,
  weekSummary,
  validateBackup,
  preserveDayMetadata,
} from "../lib/core.js";
import {
  historyEntries,
  historyDefaults,
  historyView,
} from "../lib/history-view.js";
import { dayContents, dayLabel, workoutHero } from "../lib/workout-view.js";
import { backupSummary } from "../lib/backup-view.js";
const DATE = "2026-11-02",
  NOW = "2026-11-04T15:30:00.000Z";

test("missed is derived without materializing; cancellation preserves identity, position and weekly goal", () => {
  const data = defaults(),
    item = scheduledWorkouts(data, DATE)[0],
    before = weekSummary(data, DATE, "2026-11-04");
  assert.equal(
    workoutState(item, { date: DATE, today: "2026-11-04" }).key,
    "missed",
  );
  assert.deepEqual(data.sessions, {});
  cancelWorkout(data, DATE, item.id, NOW);
  cancelWorkout(data, DATE, item.id, "2026-11-05T15:30:00.000Z");
  assert.equal(data.sessions[DATE].workouts[0].id, item.id);
  assert.equal(data.sessions[DATE].workouts[0].canceledAt, NOW);
  const summary = weekSummary(data, DATE, "2026-11-04");
  assert.equal(summary.planned, before.planned);
  assert.equal(summary.done, 0);
  assert.equal(summary.canceled, 1);
  assert.equal(summary.missed, before.missed - 1);
  assert.throws(() => moveWorkout(data, DATE, "2026-11-05", item.id));
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.sessions[DATE].workouts[0].canceledAt, NOW);
  reactivateWorkout(restored, DATE, item.id);
  assert.equal(
    workoutState(restored.sessions[DATE].workouts[0], {
      date: DATE,
      today: "2026-11-04",
    }).key,
    "missed",
  );
  moveWorkout(restored, DATE, "2026-11-09", item.id);
  assert.deepEqual(restored.sessions[DATE].workouts, []);
  assert.equal(weekSummary(restored, DATE).planned, before.planned - 1);
});

test("partial records and conclusions block cancellation; completion is stable until reopening", () => {
  const data = defaults(),
    item = materializeDay(data, DATE).workouts[0];
  item.sets["pec-deck"] = [0, 1, 2].map((i) => ({
    kg: i === 0 ? 10 : "",
    reps: "",
    done: false,
  }));
  assert.equal(workoutState(item, { date: DATE }).key, "started");
  assert.throws(() => cancelWorkout(data, DATE, item.id));
  completeWorkout(item, NOW);
  completeWorkout(item, "2026-11-05T15:30:00.000Z");
  assert.equal(item.completedAt, NOW);
  assert.throws(() => cancelWorkout(data, DATE, item.id));
  reopenWorkout(item);
  assert.equal(item.completedAt, null);
  completeWorkout(item, "2026-11-05T15:30:00.000Z");
  assert.equal(item.completedAt, "2026-11-05T15:30:00.000Z");
});

test("legacy v4 retains unknown completion time; invalid status combinations and timestamps are rejected", () => {
  const data = defaults(),
    item = addWorkout(data, DATE, "easy");
  item.done = true;
  delete item.completedAt;
  delete item.canceledAt;
  const old = { ...data, version: 4 },
    restored = validateBackup(old);
  assert.equal(restored.version, 7);
  assert.equal(restored.sessions[DATE].workouts[1].completedAt, null);
  assert.match(
    workoutHero(restored.sessions[DATE].workouts[1], DATE, data.settings),
    /horário não registrado/,
  );
  for (const update of [
    { done: true, canceledAt: NOW },
    { done: false, completedAt: NOW },
    { canceledAt: "2026-02-30T12:00:00.000Z" },
  ]) {
    Object.assign(
      item,
      { done: false, completedAt: null, canceledAt: null },
      update,
    );
    assert.throws(() => validateBackup(data));
  }
});

test("mixed indicators enumerate each status; canceled entries appear without fabricated results", () => {
  const data = defaults(),
    first = materializeDay(data, DATE).workouts[0];
  completeWorkout(first, NOW);
  const canceled = addWorkout(data, DATE, "easy");
  cancelWorkout(data, DATE, canceled.id, NOW);
  addWorkout(data, DATE, "upper");
  addWorkout(data, DATE, "long");
  const items = data.sessions[DATE].workouts,
    states = items.map((item) =>
      workoutState(item, { date: DATE, today: "2026-11-04" }),
    );
  const html = dayContents(DATE, items, states);
  assert.match(html, /1 de 4 feitos/);
  assert.match(html, /day-more">\+1/);
  assert.match(
    dayLabel(DATE, items, states),
    /Upper: Concluído.*Corrida leve: Cancelado.*Não realizado/,
  );
  assert.equal(historyEntries(data, historyDefaults().applied).length, 2);
  const history = historyView(data, historyDefaults());
  assert.match(history, /Nenhum resultado registrado/);
  assert.doesNotMatch(history, /history-run/);
  assert.match(backupSummary(data), /Cancelados<\/dt><dd>1/);
});

test("omitted legacy metadata preserves cancellation; explicit reactivation can clear it", () => {
  const data = defaults(),
    item = materializeDay(data, DATE).workouts[0];
  cancelWorkout(data, DATE, item.id, NOW);
  const legacy = structuredClone(data.sessions[DATE]);
  delete legacy.workouts[0].canceledAt;
  delete legacy.workouts[0].completedAt;
  const copy = structuredClone(legacy);
  assert.equal(
    preserveDayMetadata(legacy, data.sessions[DATE]).workouts[0].canceledAt,
    NOW,
  );
  assert.deepEqual(legacy, copy);
  legacy.workouts[0].canceledAt = null;
  assert.equal(
    preserveDayMetadata(legacy, data.sessions[DATE]).workouts[0].canceledAt,
    null,
  );
  assert.equal(workoutState(item, { hasDraft: true }).key, "canceled");
});
