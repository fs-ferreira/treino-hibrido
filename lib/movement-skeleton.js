import { BONES } from "./movement-anatomy.js";
import { entity, anchor, resolveEntities } from "./movement-objects.js";
import {
  fromScreen,
  toScreen,
  orient,
  relativeTo,
  vadd,
  vsub,
  scale,
  rotate,
  twoBone,
} from "./movement-space.js";

const localFrontArm = new Set(["fly", "cablefly", "pushdown"]);
/** Hand axial rotations are authored per variant, independently of forearm
 * direction. These are illustrative grip presets, not clinical ROM values.
 */
export const gripPresets = Object.freeze({
  lateral: { twist: Math.PI / 2 },
  incline: { twist: 0.25 },
  press: { twist: 0.1 },
  hinge: { twist: 0 },
  split: { twist: 0 },
  curl: { twist: Math.PI },
  preacher: { twist: Math.PI },
  bentrow: { twist: 0 },
  pulldown: { twist: 0 },
  overhead: { twist: Math.PI / 2 },
});
export function buildSkeleton(kind, r) {
  const camera = { depth: r.front ? 0.22 : 0 },
    points = {},
    defs = [];
  for (const key of ["nearArm", "farArm", "nearLeg", "farLeg"]) {
    const source = r.world[key],
      local = r.front && (key.endsWith("Leg") || localFrontArm.has(kind));
    const depth = r.front
      ? 0
      : key.endsWith("Arm")
        ? key.startsWith("far")
          ? -30
          : 6
        : key.startsWith("far")
          ? -24
          : 0;
    points[key] = source.map((p) =>
      local
        ? fromScreen([r.hip[0] + p[0], r.hip[1] + p[1], p[2]])
        : fromScreen([p[0], p[1], depth]),
    );
  }
  const central = (p) => fromScreen([...p, r.front ? 0 : -12]);
  const pelvis = central(r.hip),
    spine = r.spine.map(central),
    neck = central(r.shoulder),
    head = central(r.head);
  // Lumbar and thoracic segments have fixed lengths in every exercise.
  if (kind !== "crunch" && kind !== "reverse")
    spine[1] = vadd(pelvis, scale(vsub(neck, pelvis), 30 / 63));
  const transforms = new Map();
  function node(id, parent, position, direction, role = "joint", twist = 0) {
    const world = {
      position,
      rotation: direction ? orient(direction, twist) : [0, 0, 0, 1],
    };
    transforms.set(id, world);
    const e = entity(id, "bone", {
      parent,
      transform: parent ? relativeTo(transforms.get(parent), world) : world,
      anchors: { joint: anchor([0, 0, 0], role) },
      hidden: true,
    });
    defs.push(e);
    return e;
  }
  node("body.pelvis", null, pelvis, vsub(spine[1], pelvis));
  node("body.lumbar", "body.pelvis", spine[1], vsub(neck, spine[1]));
  node("body.thorax", "body.lumbar", neck, vsub(head, neck));
  node("body.head", "body.thorax", head, vsub(head, neck));
  const hands = [],
    feet = [];
  for (const [side, index] of [
    ["near", 0],
    ["far", 1],
  ]) {
    const arm = points[`${side}Arm`],
      leg = points[`${side}Leg`];
    const twist = gripPresets[kind]?.twist ?? 0;
    node(`body.${side}.scapula`, "body.thorax", arm[0], vsub(arm[1], arm[0]));
    node(
      `body.${side}.elbow`,
      `body.${side}.scapula`,
      arm[1],
      vsub(arm[2], arm[1]),
      "joint",
      index ? -twist : twist,
    );
    node(
      `body.${side}.wrist`,
      `body.${side}.elbow`,
      arm[2],
      vsub(arm[2], arm[1]),
    );
    const dir = vsub(arm[2], arm[1]);
    const rotation = orient(dir, index ? -twist : twist);
    const grip = vadd(arm[2], rotate(rotation, [0, BONES.palm, 0]));
    node(
      `body.${side}.palm`,
      `body.${side}.wrist`,
      grip,
      dir,
      "grip",
      index ? -twist : twist,
    );
    hands.push({
      position: grip,
      rotation,
      wrist: arm[2],
      twist: index ? -twist : twist,
    });
    node(`body.${side}.hip`, "body.pelvis", leg[0], vsub(leg[1], leg[0]));
    node(`body.${side}.knee`, `body.${side}.hip`, leg[1], vsub(leg[2], leg[1]));
    node(
      `body.${side}.ankle`,
      `body.${side}.knee`,
      leg[2],
      vsub(leg[2], leg[1]),
    );
    const old = r.feet[index],
      z = leg[2][2];
    const convert = (p) => fromScreen([p[0], p[1] - camera.depth * z, z]);
    const f = Object.fromEntries(
      Object.entries(old).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? Array.isArray(value[0])
            ? value.map(convert)
            : convert(value)
          : value,
      ]),
    );
    // Foot frames carry the forefoot and MTP articulation as separate nodes.
    f.ankle = leg[2];
    feet.push(f);
    if (r.front) {
      const sideSign = index ? -1 : 1,
        spread =
          3 +
          12 *
            Math.sin(
              ((kind === "adductor" ? r.pose.abduction : 12) * Math.PI) / 180,
            ),
        sole = leg[2][1] - 8;
      f.heel = [leg[2][0] - sideSign * 3, sole, z - 4];
      f.ball = [leg[2][0] + sideSign * spread, sole, z + 14];
      f.toe = [leg[2][0] + sideSign * spread, sole, z + 22];
      f.outline = [
        ...f.outline.slice(0, 3),
        vadd(f.toe, [sideSign * 6, 4, 0]),
        vadd(f.toe, [sideSign * 5, 0, 0]),
        vadd(f.toe, [-sideSign * 5, 0, 0]),
        f.heel,
        f.outline[7],
      ];
    }
    node(
      `body.${side}.ball`,
      `body.${side}.ankle`,
      f.ball,
      vsub(f.toe, f.ball),
      "support",
    );
    node(
      `body.${side}.toe`,
      `body.${side}.ball`,
      f.toe,
      vsub(f.toe, f.ball),
      "support",
    );
  }
  const entities = resolveEntities(defs);
  const bones = [
    ...[
      [pelvis, spine[1], 30, "lumbar"],
      [spine[1], neck, 33, "thorax"],
    ],
    ...Object.entries(points).flatMap(([id, p]) => [
      [
        p[0],
        p[1],
        id.endsWith("Arm") ? BONES.upperArm : BONES.thigh,
        `${id}.proximal`,
      ],
      [
        p[1],
        p[2],
        id.endsWith("Arm") ? BONES.forearm : BONES.shin,
        `${id}.distal`,
      ],
    ]),
  ];
  return {
    entities,
    points,
    pelvis,
    spine,
    neck,
    head,
    hands,
    feet,
    bones,
    camera,
  };
}

/** A rigid shared handle supplies palm orientation. Solve the wrist offset
 * before the elbow, allowing wrist articulation without stretching the arm.
 */
export function bindHandFrames(
  s,
  frames,
  { fixedElbows = false, alignPalms = false } = {},
) {
  const worlds = new Map(s.entities.map((e) => [e.id, e.world]));
  for (let [i, frame] of frames.entries()) {
    const side = i ? "far" : "near",
      arm = s.points[`${side}Arm`];
    if (fixedElbows)
      frame = {
        ...frame,
        position: vadd(arm[2], rotate(frame.rotation, [0, BONES.palm, 0])),
      };
    const wrist = fixedElbows
      ? arm[2]
      : vsub(frame.position, rotate(frame.rotation, [0, BONES.palm, 0]));
    const oldMid = arm[1],
      pole = vsub(
        alignPalms
          ? vsub(wrist, rotate(frame.rotation, [0, BONES.forearm, 0]))
          : oldMid,
        arm[0],
      ),
      elbow = fixedElbows
        ? oldMid
        : twoBone(arm[0], wrist, BONES.upperArm, BONES.forearm, pole);
    arm[1] = elbow;
    arm[2] = wrist;
    for (const [id, position, direction, rotation] of [
      [`body.${side}.scapula`, arm[0], vsub(elbow, arm[0])],
      [`body.${side}.elbow`, elbow, vsub(wrist, elbow)],
      [`body.${side}.wrist`, wrist, null, frame.rotation],
      [`body.${side}.palm`, frame.position, null, frame.rotation],
    ])
      worlds.set(id, { position, rotation: rotation ?? orient(direction) });
    s.hands[i] = { ...s.hands[i], ...frame, wrist };
  }
  s.entities = resolveEntities(
    s.entities.map((e) => ({
      ...e,
      transform: e.parent
        ? relativeTo(worlds.get(e.parent), worlds.get(e.id))
        : worlds.get(e.id),
    })),
  );
  s.bones = s.bones.filter((b) => !b[3].includes("Arm."));
  for (const side of ["near", "far"]) {
    const a = s.points[`${side}Arm`];
    s.bones.push(
      [a[0], a[1], BONES.upperArm, `${side}Arm.proximal`],
      [a[1], a[2], BONES.forearm, `${side}Arm.distal`],
    );
  }
  return s;
}

/** Reach the anchors of one shared object from two different shoulder roots.
 * The palms converge at the load instead of inheriting shoulder-width spacing.
 */
export function reachGripTargets(s, targets) {
  const frames = targets.map((position, i) => {
    const arm = s.points[i ? "farArm" : "nearArm"],
      pole = vsub(arm[1], arm[0]);
    const elbow = twoBone(
      arm[0],
      position,
      BONES.upperArm,
      BONES.forearm + BONES.palm,
      pole,
    );
    const direction = vsub(position, elbow);
    arm[1] = elbow;
    arm[2] = vadd(
      elbow,
      scale(direction, BONES.forearm / (BONES.forearm + BONES.palm)),
    );
    return { position, rotation: orient(direction, s.hands[i].twist) };
  });
  return bindHandFrames(s, frames, { fixedElbows: true });
}

/** Compatibility view for the existing silhouette and rigAt callers. */
export function projectSkeleton(skeleton, r) {
  const result = { ...r };
  result.world = Object.fromEntries(
    Object.entries(skeleton.points).map(([key, points]) => [
      key,
      points.map(([x, y, z]) => [x, 267 - y, z]),
    ]),
  );
  for (const [key, points] of Object.entries(skeleton.points))
    result[key] = points.map((p) => toScreen(p, skeleton.camera));
  result.grips = skeleton.hands.map((h) =>
    toScreen(h.position, skeleton.camera),
  );
  result.hands = skeleton.hands.map((h, i) => ({
    wrist: result[`${i ? "far" : "near"}Arm`][2],
    grip: result.grips[i],
    angle:
      (Math.atan2(
        result.grips[i][1] - result[`${i ? "far" : "near"}Arm`][2][1],
        result.grips[i][0] - result[`${i ? "far" : "near"}Arm`][2][0],
      ) *
        180) /
      Math.PI,
    rotation: h.rotation,
    worldGrip: h.position,
    worldWrist: h.wrist,
  }));
  result.spine = skeleton.spine.map((p) => toScreen(p, skeleton.camera));
  result.feet = skeleton.feet.map((f) =>
    Object.fromEntries(
      Object.entries(f).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? Array.isArray(value[0])
            ? value.map((p) => toScreen(p, skeleton.camera))
            : toScreen(value, skeleton.camera)
          : value,
      ]),
    ),
  );
  return result;
}
