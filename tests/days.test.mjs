import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  validateBackup,
  addWorkout,
  moveWorkout,
  scheduledWorkouts,
  dayState,
  weekSummary,
  normalizeStoredDay,
  previousSets,
} from "../lib/core.js";
import { loadSuggestions, recommendPace } from "../lib/progression.js";
const date = "2026-11-02";
test("consulta não materializa; adicionar preserva o treino padrão e aceita tipos repetidos", () => {
  const data = defaults();
  const initial = scheduledWorkouts(data, date)[0];
  assert.equal(Object.keys(data.sessions).length, 0);
  const extra = addWorkout(data, date, "easy");
  addWorkout(data, date, "easy");
  assert.equal(data.sessions[date].workouts.length, 3);
  assert.equal(data.sessions[date].workouts[0].id, initial.id);
  assert.notEqual(extra.id, data.sessions[date].workouts[2].id);
  assert.equal(weekSummary(data, date).planned, 8);
  assert.equal(validateBackup(data).version, 7);
});
test("remanejamento preserva destino e identidade; origem vazia continua descanso", () => {
  const data = defaults(),
    id = scheduledWorkouts(data, date)[0].id;
  moveWorkout(data, date, "2026-11-03", id);
  assert.deepEqual(data.sessions[date].workouts, []);
  assert.equal(data.sessions["2026-11-03"].workouts.length, 2);
  assert.equal(data.sessions["2026-11-03"].workouts[1].id, id);
  assert.equal(dayState(data, date).key, "rest");
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  restored.settings.longDay = 0;
  assert.deepEqual(scheduledWorkouts(restored, date), []);
  assert.equal(weekSummary(data, date).planned, 6);
});
test("registros impedem movimento e não impedem acréscimo independente", () => {
  const data = defaults(),
    item = addWorkout(data, date, "easy");
  item.run = { minutes: 30, km: 5, rpe: 4, notes: "" };
  assert.throws(
    () => moveWorkout(data, date, "2026-11-03", item.id),
    /sem registros/,
  );
  const extra = addWorkout(data, date, "interval");
  extra.done = true;
  assert.equal(dayState(data, date).key, "started");
  assert.equal(
    data.sessions[date].workouts.find((s) => s.id === item.id).done,
    false,
  );
});
test("versão 3 migra deterministicamente preservando dados e sem peso", () => {
  const data = { ...defaults(), version: 3 };
  data.sessions[date] = {
    type: "upper",
    done: false,
    sets: {
      "pec-deck": [
        { kg: 12.5, reps: 8, done: true },
        { kg: "", reps: 0, done: false },
        { kg: 0, reps: "", done: false },
      ],
    },
    withoutWeight: { "pec-deck": true },
    run: null,
  };
  const first = validateBackup(data),
    again = validateBackup(data);
  assert.deepEqual(first, again);
  assert.equal(first.sessions[date].workouts[0].id, `legacy-${date}`);
  assert.deepEqual(
    first.sessions[date].workouts[0].sets,
    data.sessions[date].sets,
  );
  assert.equal(
    first.sessions[date].workouts[0].withoutWeight["pec-deck"],
    true,
  );
  assert.deepEqual(validateBackup(first), first);
});
test("ids repetidos, envelope v4 inválido e referências futuras são rejeitados", () => {
  const data = defaults(),
    item = addWorkout(data, date, "easy");
  data.sessions["2026-11-03"] = { workouts: [structuredClone(item)] };
  assert.throws(() => validateBackup(data), /repetido/);
  assert.throws(
    () =>
      validateBackup({
        ...defaults(),
        sessions: {
          [date]: { type: "upper", done: false, sets: {}, run: null },
        },
      }),
    /Treinos do dia/,
  );
});
test("referências consideram último treino elegível da data anterior e ignoram mesmo dia", () => {
  const data = defaults();
  for (const [d, kg] of [
    ["2026-10-26", 10],
    [date, 90],
  ]) {
    const s = addWorkout(data, d, "upper");
    s.sets["pec-deck"] = [0, 1, 2].map(() => ({ kg, reps: 8, done: true }));
  }
  const last = addWorkout(data, "2026-10-26", "upper");
  last.sets["pec-deck"] = [0, 1, 2].map(() => ({
    kg: 20,
    reps: 8,
    done: true,
  }));
  assert.equal(previousSets(data.sessions, date, "pec-deck").sets[0].kg, 20);
  assert.equal(loadSuggestions(data.sessions, date, "pec-deck", 5)[0].kg, 21);
  Object.assign(data.settings, { easyPace: "6:00", hardPace: "5:00" });
  for (const d of ["2026-10-27", date]) {
    const r = addWorkout(data, d, "interval");
    r.done = true;
    r.run = {
      minutes: 40,
      km: 6,
      rpe: 5,
      hardPace: d === date ? 200 : 300,
      hardRpe: 8,
      notes: "",
    };
  }
  assert.equal(
    recommendPace("interval", data.settings, data.sessions, date).pace,
    300,
  );
});
