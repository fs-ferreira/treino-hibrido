import { solveBody, sampleAuthoredPose } from "./movement-body.js";
import {
  buildSkeleton,
  projectSkeleton,
  bindHandFrames,
  reachGripTargets,
} from "./movement-skeleton.js";
import { exerciseScenes, cableLayouts } from "./movement-presets.js";
import {
  entity,
  anchor,
  stroke,
  rectangle,
  box,
  disc,
  dumbbell,
  bar,
  handle,
  bench,
  pad,
  platform,
  lever,
  pulley,
  tower,
  weightStack,
  resolveEntities,
  rigidErrors,
} from "./movement-objects.js";
import {
  fromScreen,
  toScreen,
  axisAngle,
  fromTo,
  multiply,
  rotate,
  vadd,
  vsub,
  scale,
  normalize,
  distance,
  dot,
  length,
  clamp,
  quaternionAngle,
  transformPoint,
  inversePoint,
} from "./movement-space.js";
import {
  cableTransmission,
  ropeJunction,
  thighLeverContact,
  segmentSeparation,
} from "./movement-mechanisms.js";

/** @typedef {{id:string,type:string,source?:string,target?:string,error:number,orientationError?:number}} Constraint
 * @typedef {{kind:string,t:number,definition:object,entities:object[],skeleton:object,rig:object,constraints:Constraint[],cables:object[],diagnostics:object[]}} SceneFrame
 */
const Z = [0, 0, 0, 1];
const at = (x, y, z = 0) => ({
  position: fromScreen([x, y, z]),
  rotation: [...Z],
});
const moved = (position, rotation = Z) => ({ position, rotation });
const mix3 = (a, b, t) => vadd(a, scale(vsub(b, a), t));
const staticCache = new Map();

function addSupport(defs, id, position, normal = [0, 1, 0], parent = "floor") {
  const parentFrame = resolveEntities(defs).find((e) => e.id === parent).world;
  defs.push(
    entity(id, "support", {
      parent,
      transform: moved(inversePoint(parentFrame, position)),
      anchors: { support: anchor([0, 0, 0], "support") },
      normal,
      hidden: true,
    }),
  );
}
function bodySupports(s, preset) {
  const up = [0, 1, 0],
    axis = normalize(vsub(s.neck, s.pelvis)),
    posterior = s.camera.depth ? [0, 0, -1] : [-axis[1], axis[0], 0];
  const pelvisDepth =
    preset.seat === "prone" ? 9.5 : preset.seat === "front" ? 13 : 11;
  const upper = s.points.nearArm,
    upperAxis = normalize(vsub(upper[1], upper[0])),
    under = [upperAxis[1], -upperAxis[0], 0];
  return {
    pelvis: {
      point: vadd(s.pelvis, [0, -pelvisDepth, 0]),
      normal: up,
      parent: "seat",
    },
    back: {
      point: vadd(
        mix3(s.spine[1], s.neck, 0.35),
        scale(posterior, s.camera.depth ? 12 : 11),
      ),
      normal: scale(posterior, -1),
      parent: preset.seat === "incline" ? "seat.back" : "backrest",
    },
    chest: {
      point: vadd(mix3(s.spine[1], s.neck, 0.35), [14, 0, 0]),
      normal: [-1, 0, 0],
      parent: "chest-pad",
    },
    thorax: { point: vadd(s.neck, [0, -11, 0]), normal: up, parent: "seat" },
    "upper-arm": {
      point: vadd(mix3(...upper.slice(0, 2), 0.5), scale(under, 6.1)),
      normal: scale(under, -1),
      parent: "arm-pad",
    },
    thigh: {
      point: vadd(mix3(...s.points.nearLeg.slice(0, 2), 0.5), [0, -9.5, 0]),
      normal: up,
      parent: "seat",
    },
  };
}
function staticEquipment(kind, initial) {
  if (staticCache.has(kind)) return staticCache.get(kind);
  const preset = exerciseScenes[kind],
    defs = [],
    s = initial,
    side = preset.seat,
    surfaces = bodySupports(initial, preset),
    floorY = s.camera.depth ? s.feet[0].ball[1] : 0,
    floorZ = s.camera.depth ? s.feet[0].ball[2] : 0;
  defs.push(
    entity("floor", "floor", {
      geometry: [
        stroke(
          [
            [28, floorY, floorZ],
            [332, floorY, floorZ],
          ],
          "scene-floor",
        ),
      ],
      layer: -2,
    }),
  );
  if (side === "front") {
    defs.push(
      ...bench("seat", {
        width: 58,
        backLength: 0,
        height: 61 - floorY - 3,
        transform: at(180, 206, -12),
        layer: -1,
      }),
    );
    defs.push(
      pad("backrest", {
        width: 38,
        height: 96,
        transform: at(180, 109, -24),
        layer: -1,
      }),
    );
  } else if (["side", "row", "preacher"].includes(side)) {
    defs.push(
      ...bench("seat", {
        width: 65,
        backLength: 0,
        height: surfaces.pelvis.point[1] - 3,
        transform: at(153.5, toScreen(surfaces.pelvis.point)[1], -12),
        layer: -1,
      }),
    );
    if (["extension", "overhead", "crunch"].includes(kind))
      defs.push(
        pad("backrest", {
          width: 9,
          height: 80,
          transform: at(129.5, 143, -12),
          layer: -1,
        }),
      );
    if (side === "row")
      defs.push(
        pad("chest-pad", {
          width: 10,
          height: 48,
          transform: at(164, 151, -12),
          layer: -1,
        }),
        entity("chest-frame", "frame", {
          geometry: [
            stroke([fromScreen([167, 199, -12]), fromScreen([167, 264, -12])]),
          ],
          layer: -1,
        }),
      );
    if (side === "preacher")
      defs.push(
        pad("arm-pad", {
          width: 59,
          height: 11,
          transform: {
            position: vadd(surfaces["upper-arm"].point, [0, 0, -12]),
            rotation: axisAngle([0, 0, 1], (-42 * Math.PI) / 180),
          },
          layer: -1,
        }),
      );
  } else if (side === "incline") {
    defs.push(
      ...bench("seat", {
        width: 44,
        backLength: 98,
        height: 52,
        incline: (145 * Math.PI) / 180,
        transform: at(191, 212, -12),
        layer: -1,
      }),
    );
    const back = defs.at(-1),
      base = defs.at(-2),
      posterior = scale(surfaces.back.normal, -11),
      junction = vadd(s.pelvis, posterior);
    back.transform.position = inversePoint(
      base.transform,
      vadd(junction, [0, 0, -12]),
    );
  } else if (side === "rear-foot") {
    defs.push(
      platform("rear-bench", {
        width: 54,
        transform: at(
          276,
          initial.feet[1].dorsum ? toScreen(initial.feet[1].dorsum)[1] : 210,
          -24,
        ),
        layer: -1,
      }),
    );
    defs.push(
      entity("rear-bench.frame", "frame", {
        geometry: [
          stroke([fromScreen([257, 220, -24]), fromScreen([257, 264, -24])]),
          stroke([fromScreen([294, 220, -24]), fromScreen([294, 264, -24])]),
        ],
        layer: -1,
      }),
    );
  } else if (side === "prone" || side === "supine") {
    const [x, y, width] =
      side === "prone"
        ? [160.5, toScreen(surfaces.pelvis.point)[1], 103]
        : [140, toScreen(surfaces.thorax.point)[1], 152];
    defs.push(
      ...bench("seat", {
        width,
        backLength: 0,
        height: 267 - y - 3,
        transform: at(x, y, -12),
        layer: -1,
      }),
    );
  }
  if (kind === "calf" || kind === "calfseated") {
    const x = kind === "calf" ? 216 : 207;
    defs.push(
      platform("footplate", {
        width: 32,
        depth: 48,
        transform: at(x + 6, 253, -12),
        layer: -1,
      }),
    );
    defs.push(
      entity("machine.frame", "frame", {
        geometry: [
          stroke([
            fromScreen([kind === "calf" ? 248 : 236, 264]),
            fromScreen([
              kind === "calf" ? 248 : 236,
              kind === "calf" ? 106 : 177,
            ]),
          ]),
        ],
        layer: -1,
      }),
    );
  }
  if (preset.cable) {
    const positions =
      kind === "cablefly"
        ? [50, 310]
        : [kind === "row" ? 295 : kind === "crunch" ? 287 : 310];
    for (const [i, x] of positions.entries())
      defs.push(tower(`tower.${i}`, { transform: at(x, 264, -10), layer: -1 }));
  }
  if (kind === "fly")
    defs.push(
      entity("machine.frame", "frame", {
        geometry: [
          stroke([
            [60, 3, -20],
            [60, 163, -20],
            [300, 163, -20],
            [300, 3, -20],
          ]),
        ],
        layer: -1,
      }),
    );
  if (kind === "extension")
    defs.push(
      entity("machine.frame", "frame", {
        geometry: [
          stroke([s.points.nearLeg[1], [s.points.nearLeg[1][0], 3, 0]]),
        ],
        layer: -1,
      }),
    );
  // Supports are fixed in the exercise setup. A plane constrains normal motion
  // while allowing an adductor foot to travel laterally along its footrest.
  for (const [i, f] of s.feet.entries()) {
    for (const key of ["ball", "toe", "heel"]) {
      addSupport(
        defs,
        `support.${i}.${key}`,
        f[key],
        [0, 1, 0],
        preset.contacts.includes("forefoot") ? "footplate" : "floor",
      );
    }
    if (preset.contacts.includes("rear-foot") && i === 1)
      addSupport(defs, "support.rear-foot", f.dorsum, [0, 1, 0], "rear-bench");
  }
  for (const [name, surface] of Object.entries(surfaces))
    if (preset.contacts.includes(name))
      addSupport(
        defs,
        `support.${name}`,
        surface.point,
        surface.normal,
        surface.parent,
      );
  staticCache.set(kind, defs);
  return defs;
}

function fitBar(id, style, hands) {
  const [a, b] = hands,
    span = distance(a.position, b.position),
    midpoint = mix3(a.position, b.position, 0.5),
    axis = normalize(vsub(a.position, b.position)),
    base = fromTo([1, 0, 0], axis);
  const forward = rotate(a.rotation, [0, 1, 0]),
    desired = normalize(vsub(forward, scale(axis, dot(forward, axis))));
  const angle = Math.atan2(
    dot(desired, rotate(base, [0, 0, 1])),
    dot(desired, rotate(base, [0, 1, 0])),
  );
  const rotation = multiply(base, axisAngle([1, 0, 0], angle));
  const projectedWidth = Math.abs((a.position[0] - b.position[0]) / span);
  const extent =
    style === "wide-bar"
      ? 126
      : style === "narrow-bar"
        ? span + 20
        : span + 44 / Math.max(0.3, projectedWidth);
  const result = bar(id, {
    length: extent,
    gripWidth: span,
    ez: style === "ez-bar",
    plates: style === "bar" || style === "ez-bar",
    bendEnds: style === "wide-bar",
    transform: moved(midpoint, rotation),
    layer: 0,
  });
  if (style === "wide-bar") {
    result.anchors.right.rotation = axisAngle([0, 0, 1], -Math.PI / 6);
    result.anchors.left.rotation = axisAngle([0, 0, 1], Math.PI / 6);
  }
  return result;
}

function buildEquipment(kind, s, initial, preset) {
  const defs = [...staticEquipment(kind, initial)],
    bindings = [],
    cables = [],
    measurements = [];
  const gripBind = (hand, id, name = "grip", orientation = true) =>
    bindings.push({
      type: "grip",
      source: `body.${hand ? "far" : "near"}.palm`,
      target: `${id}:${name}`,
      hand,
      entity: id,
      anchor: name,
      orientation,
    });
  const hands = s.hands;
  if (["dumbbells", "single-dumbbell"].includes(preset.loads)) {
    for (const i of preset.loads === "single-dumbbell" ? [1] : [1, 0]) {
      // Local X is the handle axis; local Y follows the palm's forward axis.
      const id = `load.${i}`,
        rotation = hands[i].rotation;
      defs.push(
        dumbbell(id, { transform: moved(hands[i].position, rotation) }),
      );
      gripBind(i, id);
    }
  }
  if (["bar", "wide-bar", "narrow-bar", "ez-bar"].includes(preset.loads)) {
    const load = fitBar("load.bar", preset.loads, hands);
    // Anchor orientation is expressed relative to the rigid bar, not screen
    // angles. Axial wrist rotations remain separate from its handle axis.
    for (const [i, name] of [
      [0, "right"],
      [1, "left"],
    ])
      gripBind(i, "load.bar", name);
    defs.push(load);
  }
  if (preset.loads === "two-hand-dumbbell") {
    const span = distance(hands[0].position, hands[1].position),
      mid = mix3(hands[0].position, hands[1].position, 0.5),
      rotation = fromTo([1, 0, 0], vsub(hands[0].position, hands[1].position));
    const load = entity("load.shared", "dumbbell", {
      transform: moved(mid, rotation),
      dimensions: { length: 32, width: 22, gripWidth: span },
      anchors: {
        left: anchor([-span / 2, 0, 0]),
        right: anchor([span / 2, 0, 0]),
      },
      geometry: [
        stroke(
          [
            [0, 0, 0],
            [0, -18, 0],
          ],
          "handle",
        ),
        ...box(-11, 0, -11, 22, 7, 22, "load"),
        ...box(-11, -25, -11, 22, 7, 22, "load"),
      ],
      colliders: [
        { a: [0, 0, 0], b: [0, -18, 0], radius: 2 },
        ...[
          [0, 3.5, 0],
          [0, -21.5, 0],
        ].map((p) => ({ a: p, b: p, radius: 11 })),
      ],
    });
    defs.push(load);
    gripBind(0, load.id, "right", false);
    gripBind(1, load.id, "left", false);
  }
  if (preset.loads === "handles")
    for (const [i, h] of hands.entries()) {
      defs.push(
        handle(`handle.${i}`, { transform: moved(h.position, h.rotation) }),
      );
      gripBind(i, `handle.${i}`);
    }
  let rope;
  if (preset.loads === "rope") {
    const guide = fromScreen([180, 43]),
      junction = ropeJunction(hands[0].position, hands[1].position, 44, guide);
    rope = { junction, length: 44 };
    defs.push(
      entity("load.rope", "rope", {
        anchors: {
          near: anchor(hands[0].position),
          far: anchor(hands[1].position),
          cable: anchor(junction, "cable"),
        },
        dimensions: { branchLength: 44 },
        geometry: [
          stroke([hands[0].position, junction, hands[1].position], "rope"),
        ],
      }),
    );
    gripBind(0, "load.rope", "near", false);
    gripBind(1, "load.rope", "far", false);
    measurements.push(
      {
        id: "rope.near",
        error: Math.abs(distance(junction, hands[0].position) - 44),
      },
      {
        id: "rope.far",
        error: Math.abs(distance(junction, hands[1].position) - 44),
      },
    );
  }
  if (preset.mechanism === "knee") {
    const pivot = initial.points.nearLeg[1],
      distal = mix3(s.points.nearLeg[1], s.points.nearLeg[2], 0.86),
      axis = normalize(vsub(s.points.nearLeg[2], s.points.nearLeg[1])),
      normal = [-axis[1], axis[0], 0],
      contact = vadd(distal, scale(normal, 11)),
      rotation = fromTo([1, 0, 0], vsub(contact, pivot)),
      radius = Math.hypot(38.7, 11);
    defs.push(
      lever("machine.lever", { radius, transform: moved(pivot, rotation) }),
    );
    measurements.push(
      { id: "knee-axis", error: distance(pivot, s.points.nearLeg[1]) },
      {
        id: "roller-contact",
        error: distance(
          vsub(contact, scale(normal, 7)),
          vadd(distal, scale(normal, 4)),
        ),
      },
    );
  }
  if (preset.mechanism === "thigh") {
    const pivot = fromScreen([236, 177]),
      initialPoint = vadd(
        mix3(initial.points.nearLeg[0], initial.points.nearLeg[1], 0.78),
        [0, 7, 0],
      ),
      radius = distance(initialPoint, pivot);
    const contact = thighLeverContact(
      ...s.points.nearLeg.slice(0, 2),
      pivot,
      radius,
      7,
    );
    defs.push(
      lever("machine.lever", {
        radius,
        roller: false,
        transform: moved(
          pivot,
          fromTo([1, 0, 0], vsub(contact.position, pivot)),
        ),
      }),
    );
    defs.push(
      entity("machine.thigh-pad", "pad", {
        transform: moved(
          contact.position,
          fromTo([1, 0, 0], vsub(s.points.nearLeg[1], s.points.nearLeg[0])),
        ),
        anchors: { support: anchor([0, 0, 0], "contact") },
        geometry: [rectangle(-12, 0, 24, 9, "roller")],
      }),
    );
    defs.push(
      entity("machine.weight", "weight", {
        parent: "machine.lever",
        transform: moved([radius * 0.3, 0, 0]),
        geometry: [disc([0, 0, 0], 12, "weight-disc")],
      }),
    );
    measurements.push({
      id: "thigh-contact",
      error: Math.abs(distance(pivot, contact.position) - radius),
      fraction: contact.fraction,
    });
  }
  if (["arms", "thighs"].includes(preset.mechanism))
    for (const [i, side] of ["near", "far"].entries()) {
      const arm = preset.mechanism === "arms",
        chain = s.points[`${side}${arm ? "Arm" : "Leg"}`],
        pivot = initial.points[`${side}${arm ? "Arm" : "Leg"}`][0],
        direction = normalize(vsub(chain[1], chain[0])),
        medial = normalize([
          i ? direction[2] : -direction[2],
          0,
          i ? -direction[0] : direction[0],
        ]),
        target = arm
          ? hands[i].position
          : vadd(mix3(chain[0], chain[1], 0.75), scale(medial, 14)),
        radius = arm
          ? distance(initial.points[`${side}Arm`][0], initial.hands[i].position)
          : Math.hypot(46 * 0.75, 14);
      defs.push(
        lever(`machine.lever.${i}`, {
          radius,
          transform: moved(pivot, fromTo([1, 0, 0], vsub(target, pivot))),
        }),
      );
      measurements.push({
        id: `${preset.mechanism}.${i}`,
        error: Math.abs(distance(pivot, target) - radius),
      });
      if (arm) {
        const grip = entity(`machine.handle.${i}`, "handle", {
          transform: moved(hands[i].position, hands[i].rotation),
          anchors: { grip: anchor([0, 0, 0]) },
          geometry: [
            stroke(
              [
                [-7, 0, 0],
                [7, 0, 0],
              ],
              "handle",
            ),
          ],
        });
        defs.push(grip);
        gripBind(i, grip.id);
      } else
        defs.push(
          platform(`footrest.${i}`, { transform: moved(s.feet[i].ball) }),
        );
    }
  if (
    preset.mechanism === "balance" ||
    kind === "reverse" ||
    kind === "calfseated" ||
    kind === "legcurl"
  ) {
    const [a, b] = initial.hands;
    const fixed = fitBar("support.handle", "narrow-bar", [a, b]);
    defs.push(fixed);
    gripBind(0, fixed.id, "right", false);
    gripBind(1, fixed.id, "left", false);
    if (kind === "calfseated")
      defs.push(
        entity("support.handle.frame", "frame", {
          geometry: [
            stroke([fromScreen([236, 177]), fixed.transform.position]),
          ],
          layer: -1,
        }),
      );
  }
  if (preset.cable) {
    for (const [id, layout] of cableLayouts[kind].entries()) {
      const start =
        kind === "cablefly"
          ? transformPoint(
              { position: hands[id].position, rotation: hands[id].rotation },
              [0, 8, 0],
            )
          : (rope?.junction ?? mix3(hands[0].position, hands[1].position, 0.5));
      const guide = fromScreen(layout.guide),
        port = fromScreen(layout.port);
      const circuit = cableTransmission({
        start,
        guide,
        port,
        restLength: layout.restLength,
        travel: 150,
      });
      cables.push({ id: `cable.${id}`, ...circuit });
      defs.push(
        pulley(`pulley.${id}`, {
          transform: moved(guide, fromTo([0, 0, 1], circuit.route.normal)),
          layer: -1,
        }),
        entity(`cable.${id}`, "cable", {
          geometry: [
            stroke(circuit.route.points, "cable"),
            ...circuit.strands.map((p) => stroke(p, "cable")),
          ],
        }),
        weightStack(`weights.${id}`, {
          transform: moved(circuit.stack),
          layer: -1,
        }),
      );
    }
  }
  return { defs, bindings, cables, measurements };
}

function bodyAt(kind, t) {
  const pose = sampleAuthoredPose(kind, t),
    drivers = {};
  // The wide bar is a driver: both IK hands read its fixed-width anchors.
  if (kind === "pulldown")
    drivers.barGrips = [
      [233, pose.barY],
      [127, pose.barY],
    ];
  const authored = solveBody(kind, t, drivers);
  const skeleton = buildSkeleton(kind, authored),
    style = exerciseScenes[kind].loads;
  if (style === "two-hand-dumbbell") {
    const centre = vadd(
      mix3(skeleton.hands[0].position, skeleton.hands[1].position, 0.5),
      [0, -2, 0],
    );
    reachGripTargets(skeleton, [
      vadd(centre, [3, 0, 7]),
      vadd(centre, [-3, 0, -7]),
    ]);
  }
  if (["bar", "wide-bar", "narrow-bar", "ez-bar"].includes(style)) {
    if (kind === "pulldown")
      for (const hand of skeleton.hands) hand.position[2] = 24;
    const load = fitBar("driver.bar", style, skeleton.hands);
    if (kind === "pulldown")
      load.transform.rotation = axisAngle(
        [1, 0, 0],
        (pose.barRoll * Math.PI) / 180,
      );
    bindHandFrames(
      skeleton,
      skeleton.hands.map((h, i) => ({
        position: h.position,
        rotation: multiply(
          load.transform.rotation,
          load.anchors[i ? "left" : "right"].rotation,
        ),
      })),
      {
        fixedElbows: ["preacher", "curl", "crunch"].includes(kind),
        alignPalms: kind === "pulldown",
      },
    );
  }
  return { authored, skeleton };
}
const initialCache = new Map();
function initialSkeleton(kind) {
  if (!initialCache.has(kind)) initialCache.set(kind, bodyAt(kind, 0).skeleton);
  return initialCache.get(kind);
}

function angleAt([a, b, c]) {
  const u = vsub(a, b),
    v = vsub(c, b);
  return Math.acos(clamp(dot(u, v) / (length(u) * length(v)), -1, 1));
}
/** Simplified collision volumes, excluding the hands that intentionally grip
 * the load and padded supports that intentionally touch the body. */
export function detectInterferences(skeleton, entities) {
  const body = [
      { id: "head", a: skeleton.head, b: skeleton.head, radius: 11 },
      { id: "torso", a: skeleton.spine[0], b: skeleton.spine[2], radius: 9 },
    ],
    results = [];
  for (const e of entities)
    for (const shape of e.colliders ?? []) {
      const a = transformPoint(e.world, shape.a),
        b = transformPoint(e.world, shape.b);
      for (const target of body) {
        const clearance =
          segmentSeparation(a, b, target.a, target.b) -
          shape.radius -
          target.radius;
        if (clearance < -0.25)
          results.push({
            id: `${e.id}/${target.id}`,
            type: "interference",
            error: -clearance,
          });
      }
    }
  return results;
}
/** Evaluate the entire scene, including invariant errors, in any seek order.
 * @param {string} kind Exercise catalog key.
 * @param {number} t Finite phase, clamped to [0, 1].
 * @returns {SceneFrame}
 */
export function evaluateMovement(kind, t) {
  const definition = exerciseScenes[kind];
  if (!definition) throw new RangeError(`Unknown movement ${kind}`);
  const { authored, skeleton } = bodyAt(kind, t),
    initial = initialSkeleton(kind),
    equipment = buildEquipment(kind, skeleton, initial, definition),
    entities = resolveEntities(equipment.defs),
    lookup = new Map(entities.map((e) => [e.id, e])),
    constraints = [],
    diagnostics = rigidErrors(entities);
  for (const binding of equipment.bindings) {
    const hand = skeleton.hands[binding.hand],
      target = lookup.get(binding.entity).worldAnchors[binding.anchor];
    const error = distance(hand.position, target.position),
      orientationError = binding.orientation
        ? quaternionAngle(hand.rotation, target.rotation)
        : 0;
    constraints.push({
      ...binding,
      id: `grip.${binding.hand}`,
      error,
      orientationError,
    });
  }
  const support = (id, point, fixed = false) => {
    const target = lookup.get(id),
      error = fixed
        ? distance(point, target.world.position)
        : Math.abs(
            dot(vsub(point, target.world.position), target.normal ?? [0, 1, 0]),
          );
    constraints.push({
      id,
      type: "support",
      source: "body",
      target: id,
      error,
    });
  };
  const feet =
    definition.contacts.includes("feet") ||
    definition.contacts.includes("support-foot") ||
    definition.contacts.includes("forefoot");
  if (feet)
    for (const [i, f] of skeleton.feet.entries()) {
      if (definition.contacts.includes("support-foot") && i === 1) continue;
      const forefoot = definition.contacts.includes("forefoot");
      for (const key of forefoot ? ["ball", "toe"] : ["ball", "toe", "heel"])
        support(`support.${i}.${key}`, f[key], forefoot);
    }
  if (definition.contacts.includes("rear-foot"))
    support("support.rear-foot", skeleton.feet[1].dorsum, true);
  for (const [name, surface] of Object.entries(
    bodySupports(skeleton, definition),
  ))
    if (definition.contacts.includes(name))
      support(`support.${name}`, surface.point);
  for (const m of equipment.measurements)
    constraints.push({ ...m, type: "mechanism" });
  for (const c of equipment.cables)
    constraints.push({ id: c.id, type: "cable", error: Math.abs(c.error) });
  for (const [a, b, expected, id] of skeleton.bones) {
    const error = Math.abs(distance(a, b) - expected);
    if (error > 1e-6) diagnostics.push({ id, type: "bone-length", error });
  }
  for (const [key, points] of Object.entries(skeleton.points)) {
    const limits = definition.limits[key.endsWith("Arm") ? "elbow" : "knee"],
      angle = angleAt(points);
    if (angle < limits[0] - 1e-7 || angle > limits[1] + 1e-7)
      diagnostics.push({ id: key, type: "joint-limit", angle });
  }
  for (const [i, hand] of skeleton.hands.entries()) {
    const arm = skeleton.points[i ? "farArm" : "nearArm"],
      bend = Math.acos(
        clamp(
          dot(
            normalize(vsub(arm[2], arm[1])),
            rotate(hand.rotation, [0, 1, 0]),
          ),
          -1,
          1,
        ),
      );
    if (bend > definition.limits.wrist[1] + 1e-7)
      diagnostics.push({ id: `wrist.${i}`, type: "joint-limit", angle: bend });
  }
  for (const c of constraints)
    if (
      c.error > (c.type === "cable" || c.type === "mechanism" ? 1e-6 : 0.25) ||
      c.orientationError > Math.PI / 180
    )
      diagnostics.push(c);
  diagnostics.push(...detectInterferences(skeleton, entities));
  const rig = projectSkeleton(skeleton, authored);
  return {
    kind,
    t: clamp(t, 0, 1),
    definition,
    entities,
    skeleton,
    rig,
    constraints,
    cables: equipment.cables,
    diagnostics,
  };
}
