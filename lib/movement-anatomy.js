import { twoBone } from "./movement-space.js";
// Shared illustrative anthropometry, in drawing units. It is not patient-specific ROM.
export const BONES = Object.freeze({
  upperArm: 33,
  forearm: 30,
  thigh: 46,
  shin: 45,
  torso: 63,
  headReach: 23,
  palm: 4,
});
export const rad = (a) => (a * Math.PI) / 180;
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, s) => a.map((v) => v * s);
export const norm = (a) => Math.hypot(...a);
export const unit = (a) => {
  const n = norm(a);
  if (!Number.isFinite(n) || n < 1e-9)
    throw new RangeError("Zero or invalid direction");
  return mul(a, 1 / n);
};
export const mix = (a, b, t) =>
  Array.isArray(a) ? a.map((v, i) => mix(v, b[i], t)) : a + (b - a) * t;
export const polar = (p, l, a) => [
  p[0] + l * Math.cos(rad(a)),
  p[1] + l * Math.sin(rad(a)),
];
export function chain(root, angles, a, b) {
  const joint = polar(root, a, angles[0]);
  return [root, joint, polar(joint, b, angles[1])];
}
export function solveJoint(root, end, a, b, sign = 1) {
  const delta = sub(end, root),
    d = norm(delta);
  if (d < Math.abs(a - b) + 1e-6 || d > a + b + 1e-6)
    throw Error(`Unreachable joint: ${d.toFixed(3)} / ${a}+${b}`);
  const angle =
    Math.atan2(delta[1], delta[0]) +
    sign *
      Math.acos(
        Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))),
      );
  return add(root, [a * Math.cos(angle), a * Math.sin(angle)]);
}
export function joint3(root, end, a, b, hint = [0, 0, 1]) {
  return twoBone(root, end, a, b, hint);
}
// A fixed elevated frontal projection: forward depth is visible without bending a knee sideways.
export const project = (p) => [p[0], p[1] + 0.22 * p[2]];
export function frontalChain(root, abduction, down = 6.5) {
  const horizontal = Math.sqrt(BONES.thigh ** 2 - down ** 2),
    side = Math.sign(root[0]) || 1;
  const knee = add(root, [
    side * horizontal * Math.sin(rad(abduction)),
    down,
    horizontal * Math.cos(rad(abduction)),
  ]);
  return [root, knee, add(knee, [0, BONES.shin, 0])];
}
export function projectedLimb(points, origin) {
  return points.map((p) => add(project(p), origin));
}
export function gripArm(root, grip, sign = 1) {
  const elbow = solveJoint(
    root,
    grip,
    BONES.upperArm,
    BONES.forearm + BONES.palm,
    sign,
  );
  return [root, elbow, add(elbow, mul(unit(sub(grip, elbow)), BONES.forearm))];
}
export function gripOf(arm) {
  return add(arm[2], mul(unit(sub(arm[2], arm[1])), BONES.palm));
}
export function sagittalFoot(ankle, angle, upsideDown = false, facing = 1) {
  const side = (upsideDown ? -1 : 1) * facing,
    rotate = ([x, y]) =>
      add(ankle, [
        x * Math.cos(rad(angle)) - y * side * Math.sin(rad(angle)),
        x * Math.sin(rad(angle)) + y * side * Math.cos(rad(angle)),
      ]);
  const outline = [
    [-4, -3],
    [4, -3],
    [7, 2],
    [20, 4],
    [22, 6],
    [20, 8],
    [-6, 8],
    [-6, 3],
  ].map(rotate);
  return {
    ankle,
    angle,
    outline,
    heel: rotate([-6, 8]),
    ball: rotate([14, 8]),
    toe: rotate([20, 8]),
    dorsum: rotate([20, 3]),
    view: "side",
  };
}
export function frontalFoot(ankle, side, abduction = 12) {
  const spread = 3 + 12 * Math.sin(rad(abduction)),
    sign = side < 0 ? -1 : 1;
  const local = [
    [-4, -3],
    [4, -3],
    [5, 3],
    [spread + 6, 8],
    [spread + 5, 12],
    [spread - 5, 13],
    [-5, 8],
    [-5, 3],
  ];
  return {
    ankle,
    angle: sign * abduction,
    outline: local.map(([x, y]) => add(ankle, [sign * x, y])),
    heel: add(ankle, [-sign * 3, 8]),
    ball: add(ankle, [sign * spread, 11]),
    toe: add(ankle, [sign * spread, 13]),
    view: "front",
  };
}
export function pivotFoot(ball, angle) {
  const ankle = sub(ball, [
    14 * Math.cos(rad(angle)) - 8 * Math.sin(rad(angle)),
    14 * Math.sin(rad(angle)) + 8 * Math.cos(rad(angle)),
  ]);
  const foot = sagittalFoot(ankle, angle);
  // Toe extension at the MTP joint keeps the toes on the platform as the heel rises.
  foot.ball = [...ball];
  foot.toe = add(ball, [8, 0]);
  foot.outline = [
    ...foot.outline.slice(0, 3),
    add(ball, [0, -5]),
    add(ball, [8, -4]),
    foot.toe,
    ball,
    foot.heel,
    foot.outline[7],
  ];
  foot.contact = "forefoot";
  return foot;
}
