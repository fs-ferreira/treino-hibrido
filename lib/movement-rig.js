import { movements } from "./movement-data.js";
import {
  BONES as B,
  add,
  sub,
  mul,
  norm,
  unit,
  mix,
  rad,
  polar,
  chain,
  solveJoint,
  joint3,
  projectedLimb,
  frontalChain,
  gripArm,
  gripOf,
  sagittalFoot,
  frontalFoot,
  pivotFoot,
} from "./movement-anatomy.js";
export { solveJoint, polar } from "./movement-anatomy.js";
export function poseAt(kind, t) {
  const poses = movements[kind].poses,
    phase = Math.max(0, Math.min(1, t)) * 2,
    i = Math.min(1, Math.floor(phase));
  return Object.fromEntries(
    Object.keys(poses[0]).map((k) => [
      k,
      mix(poses[i][k], poses[i + 1][k], phase - i),
    ]),
  );
}
const translate = (points, delta) => points.map((p) => add(p, delta));
const as3 = (points) => points.map((p) => [...p, 0]);
const arm = (root, angles) => chain(root, angles, B.upperArm, B.forearm);
const leg = (root, angles) => chain(root, angles, B.thigh, B.shin);
const angle = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const paired = (points) => points.map(([x, y, z]) => [-x, y, z]);
export function rigAt(kind, t) {
  const c = movements[kind],
    p = poseAt(kind, t),
    front = c.view === "front",
    world = {};
  let hip = p.hip,
    shoulder = polar(hip, B.torso, p.torso),
    spine = [hip, mix(hip, shoulder, 0.48), shoulder],
    nearLeg,
    farLeg,
    feet,
    nearArm,
    farArm,
    grips;
  if (front) {
    if (["fly", "pulldown", "press", "adductor"].includes(kind)) {
      world.nearLeg = frontalChain(
        [10, 0, 0],
        kind === "adductor" ? p.abduction : 10,
      );
      world.farLeg = paired(world.nearLeg);
    } else {
      const root = [10, 0, 0],
        end = [19, c.splitStance ? 85.5 : 90.5, 0];
      world.nearLeg = [
        root,
        joint3(root, end, B.thigh, B.shin, [0, 0, 1]),
        end,
      ];
      world.farLeg = paired(world.nearLeg);
      if (c.splitStance) {
        const root = [-10, 0, 0],
          end = [-22, 85.5, -25];
        world.farLeg = [
          root,
          joint3(root, end, B.thigh, B.shin, [0, 0, 1]),
          end,
        ];
      }
    }
    nearLeg = projectedLimb(world.nearLeg, hip);
    farLeg = projectedLimb(world.farLeg, hip);
    feet = [
      frontalFoot(nearLeg[2], 1, kind === "adductor" ? p.abduction : 12),
      frontalFoot(farLeg[2], -1, kind === "adductor" ? p.abduction : 12),
    ];
  } else if (kind === "calf" || kind === "calfseated") {
    const foot = pivotFoot(kind === "calf" ? [216, 253] : [207, 253], p.calf),
      ankle = foot.ankle;
    if (kind === "calf") {
      hip = add(ankle, [0, -90]);
      shoulder = polar(hip, B.torso, -90);
      spine = [hip, mix(hip, shoulder, 0.48), shoulder];
    }
    nearLeg = [hip, solveJoint(hip, ankle, B.thigh, B.shin, -1), ankle];
    farLeg = translate(nearLeg, [-8, 0]);
    feet = [foot, pivotFoot(add(foot.ball, [-8, 0]), p.calf)];
  } else if (c.anchor) {
    nearLeg = [
      hip,
      solveJoint(hip, c.anchor, B.thigh, B.shin, c.facing === 1 ? -1 : 1),
      c.anchor,
    ];
    farLeg = c.backAnchor
      ? [hip, solveJoint(hip, c.backAnchor, B.thigh, B.shin, 1), c.backAnchor]
      : p.freeLeg
        ? leg(add(hip, [-8, 0]), p.freeLeg)
        : translate(nearLeg, [-8, 0]);
    feet = [
      sagittalFoot(nearLeg[2], c.facing === 1 ? 0 : 180, false, c.facing),
      c.backAnchor
        ? sagittalFoot(farLeg[2], 20, true)
        : p.freeLeg
          ? sagittalFoot(
              farLeg[2],
              angle(...farLeg.slice(1)) - c.facing * 90,
              false,
              c.facing,
            )
          : sagittalFoot(farLeg[2], c.facing === 1 ? 0 : 180, false, c.facing),
    ];
  } else {
    nearLeg = leg(hip, p.legs);
    farLeg = p.freeLeg
      ? leg(add(hip, [-8, 0]), p.freeLeg)
      : translate(nearLeg, [-8, 0]);
    feet = [nearLeg, farLeg].map((l) =>
      sagittalFoot(
        l[2],
        ["extension", "legcurl", "reverse"].includes(kind)
          ? angle(l[1], l[2]) - c.facing * 90
          : 0,
        false,
        c.facing,
      ),
    );
    if (kind === "extension") feet[1] = sagittalFoot(farLeg[2], 0);
  }
  if (kind === "crunch") {
    const lumbar = polar(hip, 30, p.lumbar);
    shoulder = polar(lumbar, 33, p.thorax);
    spine = [hip, lumbar, shoulder];
  }
  if (kind === "reverse") {
    shoulder = [...c.anchoredShoulder];
    spine = [hip, [144, 196], shoulder];
  }
  nearArm = arm(add(shoulder, front ? [19, 0] : [0, 0]), p.arms);
  farArm = front
    ? nearArm.map(([x, y]) => [hip[0] * 2 - x, y])
    : translate(nearArm, [-8, 0]);
  if (["incline", "row", "bentrow"].includes(kind)) {
    nearArm = gripArm(shoulder, p.hand, kind === "bentrow" ? -1 : 1);
    farArm = translate(nearArm, [-8, 0]);
    grips = [p.hand, add(p.hand, [-8, 0])];
  }
  if (kind === "calf") {
    nearArm = gripArm(shoulder, [248, 127], -1);
    farArm = translate(nearArm, [-8, 0]);
    grips = [
      [248, 127],
      [240, 127],
    ];
  }
  if (kind === "pulldown") {
    const root = add(shoulder, [19, 0]),
      hand = [233, p.barY];
    nearArm = gripArm(root, hand, 1);
    farArm = nearArm.map(([x, y]) => [hip[0] * 2 - x, y]);
    grips = [hand, [127, p.barY]];
  }
  if (kind === "fly" || kind === "cablefly") {
    const direction = (yaw) => [
      Math.cos(rad(yaw)) * Math.cos(rad(4)),
      Math.sin(rad(4)),
      Math.sin(rad(yaw)) * Math.cos(rad(4)),
    ];
    const root = [19, -B.torso, 0],
      elbow = add(root, mul(direction(p.yaw), B.upperArm)),
      wrist = add(elbow, mul(direction(p.yaw + 20), B.forearm));
    world.nearArm = [root, elbow, wrist];
    world.farArm = paired(world.nearArm);
    nearArm = projectedLimb(world.nearArm, hip);
    farArm = projectedLimb(world.farArm, hip);
    const palm = add(wrist, mul(direction(p.yaw + 20), B.palm));
    grips = [
      projectedLimb([palm], hip)[0],
      projectedLimb(paired([palm]), hip)[0],
    ];
  }
  if (kind === "pushdown") {
    const root = [19, -B.torso, 0],
      elbow = add(root, [
        B.upperArm * Math.cos(rad(84)),
        B.upperArm * Math.sin(rad(84)),
        0,
      ]);
    const radial = Math.sqrt(B.forearm ** 2 - p.flare ** 2),
      delta = [
        p.flare,
        radial * Math.cos(rad(p.flexion)),
        radial * Math.sin(rad(p.flexion)),
      ],
      wrist = add(elbow, delta);
    world.nearArm = [root, elbow, wrist];
    world.farArm = paired(world.nearArm);
    nearArm = projectedLimb(world.nearArm, hip);
    farArm = projectedLimb(world.farArm, hip);
    const palm = add(wrist, mul(unit(delta), B.palm));
    grips = [
      projectedLimb([palm], hip)[0],
      projectedLimb(paired([palm]), hip)[0],
    ];
  }
  if (kind === "crunch") {
    nearArm = arm(shoulder, [p.thorax + 90, p.thorax]);
    farArm = translate(nearArm, [-8, 0]);
  }
  if (kind === "reverse") {
    nearArm = gripArm(shoulder, [174, 209], 1);
    farArm = translate(nearArm, [-8, 0]);
    grips = [
      [174, 209],
      [166, 209],
    ];
  }
  grips ??= [gripOf(nearArm), gripOf(farArm)];
  const headAngle =
    kind === "crunch" ? p.thorax : kind === "reverse" ? 180 : p.torso;
  const head = polar(shoulder, B.headReach, headAngle);
  for (const key of ["nearLeg", "farLeg", "nearArm", "farArm"])
    world[key] ??= as3({ nearLeg, farLeg, nearArm, farArm }[key]);
  const hands = [nearArm, farArm].map((l, i) => ({
    wrist: l[2],
    grip: grips[i],
    angle: angle(l[2], grips[i]),
  }));
  return {
    hip,
    shoulder,
    head,
    spine,
    nearArm,
    farArm,
    nearLeg,
    farLeg,
    feet,
    hands,
    grips,
    world,
    front,
    headAngle,
    facing: c.facing,
    pose: p,
  };
}
