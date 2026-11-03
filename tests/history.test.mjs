import test from "node:test";
import assert from "node:assert/strict";
import { defaults, addWorkout, addDays } from "../lib/core.js";
import {
  historyDefaults,
  updateHistoryFilters,
  clearHistoryFilters,
  historyRangeStatus,
  historyEntries,
  historyExercises,
  historyFilterSummary,
  historyView,
} from "../lib/history-view.js";

const TODAY = "2026-11-02";
function diary() {
  const data = defaults();
  for (const offset of [1, 0, -29, -30, -89, -90]) {
    const workout = addWorkout(data, addDays(TODAY, offset), "easy");
    workout.run = { minutes: 30, km: 5, rpe: 4, notes: "" };
    workout.done = true;
  }
  const strength = addWorkout(data, TODAY, "upper");
  strength.sets["pec-deck"] = [0, 1, 2].map(() => ({
    kg: 10,
    reps: 8,
    done: true,
  }));
  strength.sets["incline-press"] = strength.sets["pec-deck"].map((set) => ({
    ...set,
  }));
  return data;
}

test("history periods include their boundary days and exclude future and scheduled workouts", () => {
  const data = diary();
  addWorkout(data, "2026-10-30", "upper");
  for (const [period, expected] of [
    ["30", [TODAY, "2026-10-04"]],
    ["90", [TODAY, "2026-10-04", "2026-10-03", "2026-08-05"]],
  ]) {
    const state = updateHistoryFilters(historyDefaults(), "period", period);
    assert.deepEqual(
      [
        ...new Set(
          historyEntries(data, state.applied, TODAY).map((entry) => entry.date),
        ),
      ],
      expected,
    );
  }
});

test("incomplete and inverted dates preserve the entire applied snapshot and pagination", () => {
  const data = diary();
  let state = updateHistoryFilters(historyDefaults(), "exercise", "pec-deck");
  state = { ...state, limit: 40, expanded: true };
  const previous = structuredClone(state);
  for (const [field, value] of [
    ["period", "custom"],
    ["type", "easy"],
    ["from", TODAY],
    ["to", "2026-10-01"],
  ]) {
    state = updateHistoryFilters(state, field, value);
    assert.deepEqual(state.applied, previous.applied);
    assert.equal(state.limit, 40);
    assert.equal(state.expanded, true);
    assert.deepEqual(
      historyEntries(data, state.applied, TODAY),
      historyEntries(data, previous.applied, TODAY),
    );
  }
  assert.equal(state.draft.exercise, "");
  assert.equal(historyRangeStatus(state.draft), "inverted");
  assert.equal(previous.draft.period, "all");
  const beforeResults = historyView(data, previous).split(
    "data-history-period",
  )[1];
  assert.equal(
    historyView(data, state).split("data-history-period")[1],
    beforeResults,
  );
});

test("a same-day custom range applies all pending changes and resets pagination", () => {
  let state = { ...historyDefaults(), limit: 40 };
  for (const [field, value] of [
    ["period", "custom"],
    ["type", "easy"],
    ["from", TODAY],
    ["to", TODAY],
  ])
    state = updateHistoryFilters(state, field, value);
  assert.equal(historyRangeStatus(state.draft), "valid");
  assert.deepEqual(state.applied, state.draft);
  assert.equal(state.limit, 20);
  assert.equal(historyEntries(diary(), state.applied, TODAY).length, 1);
  assert.equal(
    historyFilterSummary(state.applied),
    "02/11/2026 a 02/11/2026 · Corrida leve",
  );
  assert.match(historyView(diary(), state), /1 treino registrado</);
});

test("date guidance is neutral until an invalid or inverted date is supplied", () => {
  const state = updateHistoryFilters(historyDefaults(), "period", "custom");
  assert.equal(historyRangeStatus(state.draft), "incomplete");
  assert.doesNotMatch(
    historyView(defaults(), state),
    /id="history-range-error"/,
  );
  const invalid = updateHistoryFilters(state, "from", "2026-02-30");
  assert.equal(historyRangeStatus(invalid.draft), "invalid");
  assert.match(historyView(defaults(), invalid), /aria-invalid="true"/);
});

test("exercise options follow workout types and incompatible selections are cleared", () => {
  let state = updateHistoryFilters(historyDefaults(), "exercise", "pec-deck");
  state = updateHistoryFilters(state, "type", "upper");
  assert.equal(state.applied.exercise, "pec-deck");
  state = updateHistoryFilters(state, "type", "lower");
  assert.equal(state.applied.exercise, "");
  assert.equal(historyExercises("all").length, 23);
  assert.equal(historyExercises("lower").length, 7);
  assert.equal(historyExercises("easy").length, 0);
  assert.equal(historyExercises("interval").length, 0);
});

test("clearing removes pending edits and applied filters while preserving expansion", () => {
  let state = { ...historyDefaults(), expanded: true, limit: 40 };
  state = updateHistoryFilters(state, "type", "upper");
  state = updateHistoryFilters(state, "period", "custom");
  assert.deepEqual(clearHistoryFilters(state), {
    ...historyDefaults(),
    expanded: true,
  });
});

test("reselecting the same recorte does not reset pagination or mutate the input", () => {
  const state = { ...historyDefaults(), limit: 40 };
  const before = structuredClone(state);
  assert.equal(updateHistoryFilters(state, "type", "all").limit, 40);
  assert.deepEqual(state, before);
  assert.equal(updateHistoryFilters(state, "unknown", "all"), state);
});
