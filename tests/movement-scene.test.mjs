import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMovement,
  detectInterferences,
} from "../lib/movement-scene.js";
import { exerciseScenes } from "../lib/movement-presets.js";
import { movements } from "../lib/movement-data.js";
import { exercises } from "../lib/exercises.js";
import {
  distance,
  quaternionAngle,
  transformPoint,
} from "../lib/movement-space.js";
import { segmentDistance } from "../lib/movement-mechanisms.js";
import {
  objectExamples,
  evaluateObjectDemo,
} from "../scripts/movement-lab-examples.js";
const close = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const kinds = Object.keys(exerciseScenes);

test("every catalog exercise uses the composed scene, with defined joints and contacts", () => {
  assert.deepEqual(
    new Set(kinds),
    new Set(Object.values(exercises).map((e) => e.diagram)),
  );
  assert.deepEqual(new Set(kinds), new Set(Object.keys(movements)));
  for (const kind of kinds) {
    const f = evaluateMovement(kind, 0);
    assert.ok(f.definition.driver);
    assert.ok(f.constraints.length);
    assert.ok(f.skeleton.entities.length >= 20);
    assert.ok(f.entities.some((e) => e.id === "floor"));
  }
});

test("101 phases of all 21 scenes satisfy lengths, grips, contacts and limits", () => {
  for (const kind of kinds) {
    const initial = evaluateMovement(kind, 0),
      dimensions = new Map(initial.entities.map((e) => [e.id, e.dimensions]));
    for (let i = 0; i <= 100; i++) {
      const f = evaluateMovement(kind, i / 100);
      assert.deepEqual(
        f.diagnostics,
        [],
        `${kind}@${i}: ${JSON.stringify(f.diagnostics)}`,
      );
      for (const [a, b, len] of f.skeleton.bones) close(distance(a, b), len);
      for (const e of f.entities) {
        for (const [name, value] of Object.entries(e.dimensions))
          close(value, dimensions.get(e.id)[name]);
        assert.ok(
          [...e.world.position, ...e.world.rotation].every(Number.isFinite),
        );
        if (e.type === "bench") {
          const floorY = f.entities.find((e) => e.id === "floor").geometry[0]
            .points[0][1];
          const feet = e.geometry.at(-1).points.slice(1, 3);
          for (const point of feet)
            close(transformPoint(e.world, point)[1] - 3, floorY);
        }
        if (e.type === "bar" || e.type === "ez-bar")
          close(
            distance(
              e.worldAnchors.left.position,
              e.worldAnchors.right.position,
            ),
            e.dimensions.gripWidth,
          );
        if (e.type === "bar" || e.type === "ez-bar")
          for (const name of ["left", "right"]) {
            const points = e.geometry[0].points,
              grip = e.anchors[name].position;
            close(
              Math.min(
                ...points
                  .slice(1)
                  .map((p, i) => segmentDistance(grip, points[i], p)),
              ),
              0,
            );
          }
      }
      for (const c of f.constraints) {
        assert.ok(
          c.error <=
            (c.type === "cable" || c.type === "mechanism" ? 1e-6 : 0.25),
        );
        if (c.type === "grip" && c.orientation)
          assert.ok(c.orientationError <= Math.PI / 180);
      }
      for (const c of f.cables) {
        close(c.length, c.restLength);
        assert.ok(c.lift >= 0 && c.lift <= c.travel);
        close(distance(c.route.entry, c.route.center), c.route.radius);
        close(distance(c.route.exit, c.route.center), c.route.radius);
        const weight = f.entities.find(
          (e) => e.id === c.id.replace("cable.", "weights."),
        );
        close(distance(weight.worldAnchors.cable.position, c.strands[0][1]), 0);
      }
    }
  }
});

test("random seeks and interleaved scenes have no accumulated state", () => {
  for (const kind of kinds) {
    const expected = evaluateMovement(kind, 0.371);
    for (const t of [1, 0.5, 0, 0.81, 0.499999, 0.500001])
      evaluateMovement(kind, t);
    evaluateMovement(kinds[(kinds.indexOf(kind) + 1) % kinds.length], 0.7);
    assert.deepEqual(evaluateMovement(kind, 0.371), expected);
    assert.deepEqual(evaluateMovement(kind, 0), evaluateMovement(kind, 0));
  }
  assert.throws(() => evaluateMovement("missing", 0), /Unknown/);
  assert.throws(() => evaluateMovement("lateral", NaN), /phase/);
});

test("support surfaces belong to equipment, and palm frames match actual rigid anchors", () => {
  for (const kind of kinds) {
    const f = evaluateMovement(kind, 0.63),
      lookup = new Map(f.entities.map((e) => [e.id, e]));
    for (const c of f.constraints) {
      if (c.type === "support") {
        const surface = lookup.get(c.target);
        assert.ok(surface.parent);
        assert.ok(lookup.get(surface.parent));
      }
      if (c.type === "grip") {
        const a = lookup.get(c.entity).worldAnchors[c.anchor],
          h = f.skeleton.hands[c.hand];
        close(distance(a.position, h.position), 0);
        if (c.orientation) close(quaternionAngle(a.rotation, h.rotation), 0);
      }
    }
  }
});

test("preacher upper arms remain on the pad; pulldown bar passes in front of the torso", () => {
  const start = evaluateMovement("preacher", 0);
  for (let i = 0; i <= 100; i++) {
    const f = evaluateMovement("preacher", i / 100);
    close(
      distance(f.skeleton.points.nearArm[1], start.skeleton.points.nearArm[1]),
      0,
    );
    const pull = evaluateMovement("pulldown", i / 100);
    assert.ok(
      pull.entities.find((e) => e.id === "load.bar").world.position[2] >
        pull.skeleton.neck[2] + 12,
    );
  }
  const calf = evaluateMovement("calfseated", 0.8);
  assert.ok(calf.entities.some((e) => e.id === "machine.thigh-pad"));
  assert.ok(
    calf.constraints.find((c) => c.id === "thigh-contact").fraction > 0.4,
  );
  const floor = evaluateMovement("reverse", 0.7).entities.find(
    (e) => e.id === "floor",
  );
  assert.ok(floor.geometry[0].points.every((p) => p[1] === 0));
  const shared = evaluateMovement("overhead", 0.7),
    load = shared.entities.find((e) => e.id === "load.shared");
  assert.ok(load.dimensions.gripWidth < load.dimensions.width);
  assert.equal(
    shared.constraints.filter(
      (c) => c.type === "grip" && c.entity === "load.shared",
    ).length,
    2,
  );
});

test("continuous trajectories across the middle key and reversal extremes", () => {
  for (const kind of kinds)
    for (const t of [0, 0.5, 1]) {
      const h = 1e-5,
        a = evaluateMovement(kind, Math.max(0, t - h)),
        b = evaluateMovement(kind, Math.min(1, t + h));
      for (const [key, points] of Object.entries(a.skeleton.points))
        points.forEach((p, i) =>
          assert.ok(
            distance(p, b.skeleton.points[key][i]) < 0.03,
            `${kind} ${key} ${t}`,
          ),
        );
    }
});

test("collision diagnostics detect a load moved into the head", () => {
  const f = evaluateMovement("lateral", 0.5),
    load = f.entities.find((e) => e.id === "load.0");
  const corrupt = {
    ...load,
    world: { ...load.world, position: [...f.skeleton.head] },
  };
  assert.ok(
    detectInterferences(f.skeleton, [corrupt]).some(
      (d) => d.type === "interference" && d.id.endsWith("/head"),
    ),
  );
  assert.deepEqual(detectInterferences(f.skeleton, f.entities), []);
});

test("isolated examples share rigid parts and validate both transmission ratios", () => {
  for (const kind of Object.keys(objectExamples))
    for (let i = 0; i <= 100; i++)
      assert.deepEqual(evaluateObjectDemo(kind, i / 100).diagnostics, []);
  const a = evaluateObjectDemo("cable1", 1).constraints[0],
    b = evaluateObjectDemo("cable2", 1).constraints[0];
  close(a.lift, b.lift * 2);
  assert.throws(() => evaluateObjectDemo("bar", Infinity), /Invalid/);
});
