import test from "node:test";
import assert from "node:assert/strict";
import {
  durationParts,
  readDuration,
  formatDuration,
  durationValueForSave,
} from "../lib/duration-field.js";
import { defaults, validateBackup, addWorkout, paceText } from "../lib/core.js";
import { settingsDraft, validateSettings } from "../lib/settings.js";
import { historyView, historyDefaults } from "../lib/history-view.js";
import { workoutHero } from "../lib/workout-view.js";

test("duration uses base sixty and keeps the persisted diary contract", () => {
  const result = readDuration({ minutes: "21", seconds: "55" });
  assert.equal(result.seconds, 1315);
  assert.equal(paceText(result.seconds / 2.82), "7:46");
  const data = defaults();
  const run = addWorkout(data, "2026-11-05", "easy");
  run.run = { minutes: result.seconds / 60, km: 2.82, rpe: 4, notes: "" };
  const cross = addWorkout(data, "2026-11-05", "cross");
  cross.cross = { minutes: 1 / 60, rpe: 7, notes: "" };
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.sessions, data.sessions);
  assert.deepEqual(
    durationParts(
      restored.sessions["2026-11-05"].workouts.find((s) => s.id === run.id).run
        .minutes * 60,
    ),
    { minutes: "21", seconds: "55" },
  );
});

test("empty, partially filled, zero and invalid duration parts remain distinct", () => {
  assert.deepEqual(readDuration({}), { seconds: null, empty: true, error: "" });
  assert.ok(readDuration({}, { required: true }).error);
  assert.equal(readDuration({ minutes: "21" }).seconds, 1260);
  assert.equal(readDuration({ seconds: "55" }).seconds, 55);
  assert.equal(readDuration({ minutes: "0", seconds: "1" }).seconds, 1);
  assert.equal(readDuration({ minutes: "0", seconds: "59" }).seconds, 59);
  for (const parts of [
    { minutes: "0", seconds: "0" },
    { minutes: "-1" },
    { minutes: "21.55" },
    { minutes: "21,55" },
    { minutes: "1e2" },
    { seconds: "-1" },
    { seconds: "1.5" },
    { seconds: "60" },
    { minutes: " " },
    { seconds: "+1" },
    { minutes: "1440", seconds: "1" },
  ]) {
    const original = structuredClone(parts);
    assert.equal(readDuration(parts).seconds, null);
    assert.ok(readDuration(parts).error);
    assert.deepEqual(parts, original);
  }
  assert.equal(readDuration({ minutes: "1440", seconds: "0" }).seconds, 86400);
});

test("planning accepts only five-minute steps from sixty to ninety minutes", () => {
  const options = {
    precision: "minutes",
    required: true,
    min: 3600,
    max: 5400,
    step: 300,
  };
  for (const minutes of ["60", "65", "75", "90"])
    assert.equal(
      readDuration({ minutes }, options).seconds,
      Number(minutes) * 60,
    );
  for (const minutes of ["", "59", "61", "90.5", "95"])
    assert.ok(readDuration({ minutes }, options).error);
});

test("legacy decimal minutes are formatted as time without reinterpreting their digits", () => {
  assert.deepEqual(durationParts(21.55 * 60), { minutes: "21", seconds: "33" });
  assert.deepEqual(durationParts(59.999 * 60), { minutes: "60", seconds: "0" });
  assert.equal(formatDuration(1315), "21 min 55 s");
  assert.equal(formatDuration(60), "1 min");
  assert.equal(formatDuration(3600), "60 min");
  assert.equal(formatDuration(null), "—");
  const data = defaults(),
    run = addWorkout(data, "2026-11-05", "easy");
  run.run = { minutes: 21.55, km: 2.82, rpe: 4, notes: "" };
  const history = historyView(data, historyDefaults(), { today: "2026-11-06" });
  assert.equal((history.match(/21 min 33 s/g) ?? []).length, 2);
  assert.match(workoutHero(run, "2026-11-05", data.settings), /21 min 33 s/);
  assert.equal(run.run.minutes, 21.55);
  const legacy = 21.55321;
  assert.equal(
    durationValueForSave(Math.round(legacy * 60), legacy, 60),
    legacy,
  );
  assert.equal(durationValueForSave(1315, legacy, 60), 1315 / 60);
});

test("recent run validates both duration parts and keeps seconds in settings", () => {
  const settings = defaults().settings;
  const raw = {
    ...settingsDraft("corrida", settings),
    recentKm: "2.82",
    recentMinutes: "21",
    recentSeconds: "55",
    recentDate: "2026-11-05",
  };
  const valid = validateSettings("corrida", raw, settings, "2026-11-06");
  assert.equal(valid.settings.recentRun.seconds, 1315);
  for (const recentSeconds of ["60", "1.5", "-1"])
    assert.ok(
      validateSettings(
        "corrida",
        { ...raw, recentSeconds },
        settings,
        "2026-11-06",
      ).errors.recentMinutes,
    );
  assert.deepEqual(settingsDraft("corrida", valid.settings), raw);
});
