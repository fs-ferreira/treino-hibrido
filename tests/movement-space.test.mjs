import test from "node:test";
import assert from "node:assert/strict";
import {
  axisAngle,
  compose,
  relativeTo,
  distance,
  twoBone,
  rotate,
  fromTo,
  slerp,
  sampleTrack,
  normalize,
} from "../lib/movement-space.js";
import { bar, bench, lever, resolveEntities } from "../lib/movement-objects.js";
import {
  wrappedCable,
  cableTransmission,
  ropeJunction,
  segmentSeparation,
} from "../lib/movement-mechanisms.js";
const close = (a, b, t = 1e-6) =>
  assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
test("local/world transforms preserve anchors, rigidity and hierarchy", () => {
  const defs = [
    ...bench("bench", {
      incline: 0.6,
      transform: { position: [20, 40, 8], rotation: axisAngle([0, 1, 0], 0.7) },
    }),
    bar("bar", {
      gripWidth: 80,
      parent: "bench.back",
      transform: { position: [5, 10, 0], rotation: axisAngle([0, 0, 1], 0.3) },
    }),
  ];
  const [base, back, b] = resolveEntities(defs);
  close(
    distance(b.worldAnchors.left.position, b.worldAnchors.right.position),
    80,
  );
  const local = relativeTo(back.world, b.world),
    again = compose(back.world, local);
  close(distance(again.position, b.world.position), 0);
  assert.throws(
    () =>
      resolveEntities([
        { ...defs[0], parent: "bar" },
        { ...defs[2], parent: "bench" },
      ]),
    /Cyclic/,
  );
  assert.throws(
    () => resolveEntities([{ ...defs[0], parent: "absent" }]),
    /Missing/,
  );
  assert.throws(() => resolveEntities([defs[0], defs[0]]), /Duplicate/);
  close(distance(base.worldAnchors.seat.position, base.world.position), 0);
});
test("IK is finite at parallel poles, full extension and near folded poses", () => {
  for (const target of [
    [0, 0, 40],
    [0, 0, 63],
    [3.000001, 0, 0],
    [0, 40, 0],
  ]) {
    const p = twoBone([0, 0, 0], target, 33, 30, [0, 0, 1]);
    assert.ok(p.every(Number.isFinite));
    close(distance([0, 0, 0], p), 33);
    close(distance(p, target), 30);
  }
  assert.throws(() => twoBone([0, 0, 0], [0, 0, 64], 33, 30), /Unreachable/);
  assert.throws(() => twoBone([0, 0, 0], [0, 0, 0], 33, 30), /Unreachable/);
  assert.throws(() => normalize([0, 0, 0]), /direction/);
  close(
    distance(rotate(fromTo([1, 0, 0], [-1, 0, 0]), [1, 0, 0]), [-1, 0, 0]),
    0,
  );
  close(
    distance(
      rotate(slerp([0, 0, 0, 1], [0, 0, 0, -1], 0.5), [1, 0, 0]),
      [1, 0, 0],
    ),
    0,
  );
});
test("Hermite tracks are monotone and have matching middle derivatives", () => {
  for (const values of [
    [0, 10, 11],
    [262, 193, 125],
    [0, 0, 10],
  ]) {
    const h = 1e-6,
      left = (sampleTrack(values, 0.5) - sampleTrack(values, 0.5 - h)) / h,
      right = (sampleTrack(values, 0.5 + h) - sampleTrack(values, 0.5)) / h;
    close(left, right, 0.001);
    for (let i = 0; i <= 100; i++)
      assert.ok(
        sampleTrack(values, i / 100) >= Math.min(...values) - 1e-8 &&
          sampleTrack(values, i / 100) <= Math.max(...values) + 1e-8,
      );
  }
});
test("hinge contact describes a circle without changing the radius", () => {
  for (let i = 0; i <= 100; i++) {
    const [e] = resolveEntities([
      lever("arm", {
        radius: 38.7,
        transform: {
          position: [9, 30, 2],
          rotation: axisAngle([0, 0, 1], (i / 100) * Math.PI),
        },
      }),
    ]);
    close(
      distance(e.worldAnchors.pivot.position, e.worldAnchors.contact.position),
      38.7,
    );
  }
});
test("pulley route has tangent joins and a measured circular arc", () => {
  const r = wrappedCable([0, -60, 4], [0, 0, 0], [80, 0, 0]);
  close(distance(r.entry, r.center), 7);
  close(distance(r.exit, r.center), 7);
  close(r.arcLength, r.radius * r.sweep);
  const tangent = (p, q) => p.reduce((s, n, i) => s + n * q[i], 0);
  close(
    tangent(
      r.entry.map((n, i) => n - r.center[i]),
      r.entry.map((n, i) => n - [0, -60, 4][i]),
    ),
    0,
  );
  assert.throws(() => wrappedCable([0, 1, 0], [0, 0, 0], [20, 0, 0]), /inside/);
});
test("1:1 and 2:1 transmission preserve total cable and halve stack travel", () => {
  const guide = [0, 100, 0],
    port = [80, 100, 0],
    initial = [0, 50, 0],
    start = [0, 20, 0];
  const base = wrappedCable(initial, guide, port).length;
  const results = [1, 2].map((ratio) =>
    cableTransmission({
      start,
      guide,
      port,
      ratio,
      restLength: base + ratio * 115,
    }),
  );
  for (const r of results) close(r.length, r.restLength);
  close(results[0].lift, results[1].lift * 2);
  assert.throws(
    () => cableTransmission({ start: initial, guide, port, restLength: 500 }),
    /outside travel/,
  );
  const junction = ropeJunction([-20, 0, 0], [20, 0, 0], 30, [0, 100, 0]);
  close(distance(junction, [-20, 0, 0]), 30);
  close(distance(junction, [20, 0, 0]), 30);
  close(segmentSeparation([0, 0, 0], [10, 0, 0], [5, -1, 0], [5, 1, 0]), 0);
  close(segmentSeparation([0, 0, 0], [10, 0, 0], [0, 2, 0], [10, 2, 0]), 2);
});
