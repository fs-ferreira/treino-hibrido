import test from "node:test";
import assert from "node:assert/strict";
import { exercises, workouts } from "../lib/exercises.js";
import { exerciseMuscles } from "../lib/muscle-data.js";
import { evaluateMovement } from "../lib/movement-scene.js";
import { defaults, validateBackup, previousSets } from "../lib/core.js";
import { loadSuggestions } from "../lib/progression.js";
import { distance, rotate } from "../lib/movement-space.js";

test("forearm additions follow biceps without reordering the original routine", () => {
  assert.deepEqual(workouts.upper.ids, [
    "pec-deck",
    "incline-press",
    "lat-pulldown",
    "machine-row",
    "lateral-raise",
    "cable-curl",
    "reverse-curl",
    "rope-pushdown",
  ]);
  assert.deepEqual(workouts.upper2.ids, [
    "barbell-row",
    "crossover",
    "shoulder-press",
    "preacher-curl",
    "wrist-curl",
    "french-press",
    "machine-crunch",
    "reverse-crunch",
  ]);
  assert.equal(workouts.lower.ids.length, 7);
  assert.deepEqual(exerciseMuscles["reverse-curl"], {
    primary: ["brachioradialis"],
    secondary: ["brachialis", "biceps"],
  });
  assert.deepEqual(exerciseMuscles["wrist-curl"], {
    primary: ["wrist-flexors"],
    secondary: ["finger-flexors"],
  });
  assert.match(
    exercises["wrist-curl"].execution,
    /6–8 repetições em cada braço/,
  );
});

test("unilateral wrist curl moves only the loaded hand while the forearm rests on the thigh", () => {
  const initial = evaluateMovement("wrist-curl", 0);
  for (let i = 0; i <= 100; i++) {
    const frame = evaluateMovement("wrist-curl", i / 100);
    assert.deepEqual(frame.diagnostics, []);
    for (const [limb, points] of Object.entries(frame.skeleton.points))
      points.forEach((point, index) =>
        assert.ok(distance(point, initial.skeleton.points[limb][index]) < 1e-7),
      );
    assert.ok(
      distance(
        frame.skeleton.hands[1].position,
        initial.skeleton.hands[1].position,
      ) < 1e-7,
    );
    const loads = frame.entities.filter((entity) => entity.type === "dumbbell");
    assert.equal(loads.length, 1);
    assert.ok(
      distance(
        loads[0].worldAnchors.grip.position,
        frame.skeleton.hands[0].position,
      ) < 1e-6,
    );
    const support = frame.constraints.find(
      (constraint) => constraint.id === "support.forearm",
    );
    assert.ok(support.error < 0.25);
    // In the side view, the active wrist is beyond the knee, with the palm facing up.
    assert.ok(frame.rig.nearArm[2][0] > frame.rig.nearLeg[1][0]);
    assert.ok(rotate(frame.skeleton.hands[0].rotation, [0, 0, 1])[1] > 0);
    // The handle stays transverse to the forearm, along the wrist's hinge axis.
    assert.ok(rotate(frame.skeleton.hands[0].rotation, [1, 0, 0])[2] > 0.99);
  }
  const end = evaluateMovement("wrist-curl", 1);
  assert.ok(initial.rig.hands[0].grip[1] > initial.rig.hands[0].wrist[1]);
  assert.ok(end.rig.hands[0].grip[1] < end.rig.hands[0].wrist[1]);
});

test("reverse curl keeps elbows and body fixed with a pronated, connected bar", () => {
  const initial = evaluateMovement("reverse-curl", 0);
  for (let i = 0; i <= 100; i++) {
    const frame = evaluateMovement("reverse-curl", i / 100);
    assert.deepEqual(frame.diagnostics, []);
    assert.ok(distance(frame.skeleton.pelvis, initial.skeleton.pelvis) < 1e-7);
    for (const side of ["near", "far"])
      frame.skeleton.points[`${side}Arm`]
        .slice(0, 2)
        .forEach((point, index) =>
          assert.ok(
            distance(point, initial.skeleton.points[`${side}Arm`][index]) <
              1e-7,
          ),
        );
    assert.equal(frame.skeleton.hands[0].twist, 0);
    assert.ok(rotate(frame.skeleton.hands[0].rotation, [0, 0, 1])[1] < 0);
    assert.equal(
      frame.constraints.filter((constraint) => constraint.type === "grip")
        .length,
      2,
    );
  }
});

test("new exercise records round-trip in v3 backups and use existing progression", () => {
  const data = { ...defaults(), version: 3 };
  const legacy = {
    type: "upper",
    done: true,
    sets: {
      "cable-curl": Array.from({ length: 3 }, () => ({
        kg: 10,
        reps: 8,
        done: true,
      })),
    },
    run: null,
  };
  data.sessions["2026-10-26"] = structuredClone(legacy);
  for (const [date, type, id] of [
    ["2026-11-02", "upper", "reverse-curl"],
    ["2026-11-06", "upper2", "wrist-curl"],
  ]) {
    data.sessions[date] = {
      type,
      done: true,
      sets: {
        [id]: Array.from({ length: 3 }, () => ({ kg: 5, reps: 8, done: true })),
      },
      run: null,
    };
    assert.equal(previousSets(data.sessions, "2026-11-09", id).sets[0].kg, 5);
    assert.equal(loadSuggestions(data.sessions, "2026-11-09", id, 5)[0].kg, 6);
  }
  const restored = validateBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.version, 7);
  for (const [date, entry] of Object.entries(data.sessions)) {
    const { id, ...item } = restored.sessions[date].workouts[0];
    assert.deepEqual(item, { ...entry, completedAt: null, canceledAt: null });
  }
  assert.deepEqual(restored.sessions["2026-10-26"].workouts[0], {
    id: "legacy-2026-10-26",
    ...legacy,
    completedAt: null,
    canceledAt: null,
  });
  assert.equal(
    restored.sessions["2026-10-26"].workouts[0].sets["reverse-curl"],
    undefined,
  );
});
