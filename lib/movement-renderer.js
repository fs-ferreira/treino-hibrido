import { movements } from "./movement-data.js";
import { evaluateMovement } from "./movement-scene.js";
import { equipmentParts } from "./movement-equipment.js";
import {
  cameraDepth,
  scale,
  vadd,
  toScreen,
  transformPoint,
} from "./movement-space.js";
import { add, sub, mul, unit, mix, norm } from "./movement-anatomy.js";
export const fmt = (p) =>
  p
    .slice(0, 2)
    .map((n) => Number(n.toFixed(2)))
    .join(",");
function segment(a, b, w1, w2, active, extra = "") {
  const axis = unit(sub(b, a)),
    normal = [-axis[1], axis[0]],
    edge = (p, w, s) => add(p, mul(normal, w * s));
  return `<path class="body-segment ${active ? "is-moving" : ""} ${extra}" d="M${fmt(edge(a, w1, 1))}Q${fmt(edge(mix(a, b, 0.4), w1 + 0.3, 1))} ${fmt(edge(b, w2, 1))}Q${fmt(add(b, mul(axis, w2)))} ${fmt(edge(b, w2, -1))}L${fmt(edge(a, w1, -1))}Q${fmt(sub(a, mul(axis, w1)))} ${fmt(edge(a, w1, 1))}Z"/>`;
}
function limb(points, type, active, far) {
  const arm = type === "arm",
    proximal = ["arms", "legs", "hip"].includes(active),
    distal = proximal || ["forearms", "calves"].includes(active);
  return `<g class="${far ? "far-limb" : "near-limb"}">${segment(points[0], points[1], arm ? 6.1 : 9.5, arm ? 4.1 : 6.3, proximal)}${segment(points[1], points[2], arm ? 4.8 : 7, arm ? 2.9 : 3.6, distal)}<circle class="joint-dot" cx="${points[1][0]}" cy="${points[1][1]}" r="2.2"/></g>`;
}
function shoe(foot, far) {
  return `<g class="${far ? "far-limb" : ""}"><path class="shoe" data-foot-view="${foot.view}" d="M${foot.outline.map(fmt).join("L")}Z"/><path class="shoe-seam" d="M${fmt(foot.heel)}L${fmt(foot.ball)}L${fmt(foot.toe)}"/></g>`;
}
function hand(h, far = false) {
  const length = norm(sub(h.grip, h.wrist)),
    angle =
      (Math.atan2(h.grip[1] - h.wrist[1], h.grip[0] - h.wrist[0]) * 180) /
      Math.PI;
  return `<g class="${far ? "far-limb" : ""}" transform="translate(${fmt(h.wrist)}) rotate(${angle})"><path class="figure-hand" d="M-1 -2.7L${length} -3Q${length + 4} -2 ${length + 3} 1L${length + 1} 3H0Z"/><path class="finger-detail" d="M${length} -1.8L${length + 1} 1.8M${length - 1} 2Q${length - 4} 5 ${length - 3} 0"/></g>`;
}
function torso(r, kind) {
  const { hip, shoulder, spine } = r,
    axis = unit(sub(shoulder, hip)),
    n = [-axis[1], axis[0]],
    side = (p, w, s) => add(p, mul(n, w * s));
  const ribs = mix(spine[1], shoulder, 0.35),
    waist = mix(hip, spine[1], 0.35),
    front = r.front;
  const anterior = (p, w) => side(p, w, r.facing),
    posterior = (p, w) => {
      const q = side(p, w, -r.facing);
      return kind === "reverse" ? [q[0], Math.min(q[1], 208)] : q;
    };
  const d = front
    ? `M${fmt(side(shoulder, 18, 1))}Q${fmt(side(ribs, 17, 1))} ${fmt(side(waist, 10, 1))}L${fmt(side(hip, 12, 1))}L${fmt(side(hip, 12, -1))}L${fmt(side(waist, 10, -1))}Q${fmt(side(ribs, 17, -1))} ${fmt(side(shoulder, 18, -1))}Z`
    : `M${fmt(anterior(shoulder, 9))}Q${fmt(anterior(ribs, 14))} ${fmt(anterior(waist, 9))}L${fmt(anterior(hip, 11))}L${fmt(posterior(hip, 11))}Q${fmt(posterior(spine[1], 11))} ${fmt(posterior(shoulder, 9))}Z`;
  return `<path class="body-torso ${movements[kind].active === "core" || movements[kind].active === "hip" ? "is-moving" : ""}" d="${d}"/><path class="shirt-seam" d="M${fmt(mix(shoulder, spine[1], 0.12))}Q${fmt(spine[1])} ${fmt(mix(spine[1], hip, 0.72))}"/>`;
}
function pelvis(r) {
  const n = unit([r.shoulder[1] - r.hip[1], r.hip[0] - r.shoulder[0]]),
    waist = add(r.hip, mul(unit(sub(r.shoulder, r.hip)), 8));
  const hipA = add(r.hip, mul(n, 12)),
    hipB = sub(r.hip, mul(n, 12));
  return `<path class="shorts" d="M${fmt(add(waist, mul(n, 11)))}L${fmt(sub(waist, mul(n, 11)))}L${fmt(hipB)}Q${fmt(add(r.hip, mul(unit(sub(r.hip, waist)), 5)))} ${fmt(hipA)}Z"/>`;
}
function head(r) {
  const roll = r.front ? 0 : r.headAngle + 90;
  return `<path class="neck" d="M${fmt(r.shoulder)}L${fmt(r.head)}"/><g transform="translate(${fmt(r.head)}) rotate(${roll}) scale(${r.front ? 1 : r.facing} 1)"><ellipse class="figure-head" cx="0" cy="0" rx="10" ry="12"/><path class="hairline" d="M-9 -3Q-4 -16 9 -6"/>${r.front ? '<path class="face-detail" d="M-4 0h1m6 0h1"/>' : '<path class="face-detail" d="M8 -2l5 4-5 2"/>'}</g>`;
}
export function drawMovement(kind, t, prefix, phase = "") {
  return drawScene(evaluateMovement(kind, t), prefix, phase);
}

/** Render a previously evaluated frame, also used by the review gallery. */
export function drawScene(frame, prefix, phase = "", debug = {}) {
  const kind = frame.kind;
  const c = movements[kind],
    r = frame.rig,
    arm = ["arms", "forearms"].includes(c.active) ? c.active : "",
    leg = ["legs", "calves", "hip"].includes(c.active) ? c.active : "";
  const legFarActive =
    c.unilateral && ["legcurl", "extension", "split"].includes(kind) ? "" : leg;
  const s = frame.skeleton,
    mean = (points) =>
      scale(
        points.reduce((a, b) => vadd(a, b), [0, 0, 0]),
        1 / points.length,
      );
  const rows = [
    {
      position: mean(s.points.farLeg),
      markup: limb(r.farLeg, "leg", legFarActive, !r.front),
    },
    { position: s.feet[1].ball, markup: shoe(r.feet[1], !r.front) },
    {
      position: mean(s.points.farArm),
      markup: limb(r.farArm, "arm", arm, !r.front),
    },
    { position: mean(s.spine), markup: torso(r, kind) },
    {
      position: mean(s.points.nearLeg),
      markup: limb(r.nearLeg, "leg", leg, false),
    },
    { position: s.feet[0].ball, markup: shoe(r.feet[0], false) },
    { position: vadd(s.pelvis, [0, 0, 0.01]), markup: pelvis(r) },
    { position: s.head, markup: head(r) },
    {
      position: mean(s.points.nearArm),
      markup: limb(r.nearArm, "arm", arm, false),
    },
    ...["far", "near"].map((side) => ({
      position: mean(s.points[`${side}Leg`]),
      markup: segment(
        r[`${side}Leg`][0],
        mix(r[`${side}Leg`][0], r[`${side}Leg`][1], 0.27),
        9.7,
        8.5,
        false,
        "shorts",
      ),
    })),
    ...(debug.bodyOnly ? [] : equipmentParts(frame)),
    ...s.hands.map((h, i) => ({
      position: h.position,
      markup: hand(r.hands[i], i === 1 && !r.front),
    })),
  ].map((row, index) => ({ ...row, index }));
  const content = rows
    .sort(
      (a, b) =>
        (a.layer ?? 0) - (b.layer ?? 0) ||
        cameraDepth(a.position, s.camera) - cameraDepth(b.position, s.camera) ||
        a.index - b.index,
    )
    .map((row) => row.markup)
    .join("");
  return `<svg class="exercise-figure" viewBox="0 0 360 310" role="img" aria-labelledby="${prefix}-title ${prefix}-desc" data-scene="${kind}"><title id="${prefix}-title">${phase} · ${c.cues.join(". ")}</title><desc id="${prefix}-desc">Vista ${r.front ? "frontal levemente elevada" : "lateral"}. Corpo e equipamentos articulados, com pegadas e apoios conectados. ${c.unilateral ? "Repita do outro lado." : ""}</desc><defs><marker id="${prefix}-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0L6 3L0 6" fill="#79dfe5"/></marker></defs>${content}${debug.anchors || debug.axes ? debugScene(frame, debug) : ""}<path class="trajectory" d="${c.arrow}" marker-end="url(#${prefix}-arrow)"/><text class="figure-cue" x="20" y="23">${c.cues[0]}</text><text class="figure-cue secondary" x="20" y="294">${c.cues[1]}</text></svg>`;
}

function debugScene(frame, options) {
  const project = (p) => fmt(toScreen(p, frame.skeleton.camera));
  const entities = options.bodyOnly
    ? frame.skeleton.entities
    : [...frame.entities, ...frame.skeleton.entities];
  return `<g class="scene-debug">${entities
    .map((e) => {
      let markup = "";
      if (options.anchors)
        markup += Object.entries(e.worldAnchors)
          .map(([name, a]) => {
            const p = toScreen(a.position, frame.skeleton.camera);
            return `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${a.role === "support" ? "#ffb86b" : "#79dfe5"}"><title>${e.id}:${name}</title></circle>`;
          })
          .join("");
      if (options.axes)
        for (const [axis, color] of [
          [[10, 0, 0], "#f99"],
          [[0, 10, 0], "#c3f969"],
          [[0, 0, 10], "#79dfe5"],
        ])
          markup += `<path d="M${project(e.world.position)}L${project(transformPoint(e.world, axis))}" stroke="${color}" stroke-width="1"/>`;
      return markup;
    })
    .join("")}</g>`;
}
