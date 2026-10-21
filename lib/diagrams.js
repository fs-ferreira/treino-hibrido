import { movements } from "./movement-data.js";
import { equipment } from "./movement-equipment.js";
import { icon } from "./icons.js";
let serial = 0;
const rad = (a) => (a * Math.PI) / 180;
export const polar = (p, l, a) => [
  p[0] + l * Math.cos(rad(a)),
  p[1] + l * Math.sin(rad(a)),
];
export const fmt = (p) =>
  p
    .slice(0, 2)
    .map((n) => Number(n.toFixed(2)))
    .join(",");
const shift = (p, x, y) => [p[0] + x, p[1] + y];
const lerp = (a, b, t) =>
  Array.isArray(a) ? a.map((n, i) => lerp(n, b[i], t)) : a + (b - a) * t;
export function poseAt(kind, t) {
  const poses = movements[kind].poses,
    phase = Math.max(0, Math.min(1, t)) * 2,
    i = Math.min(1, Math.floor(phase));
  return Object.fromEntries(
    Object.keys(poses[0]).map((k) => [
      k,
      lerp(poses[i][k], poses[i + 1][k], phase - i),
    ]),
  );
}
// Two-bone inverse kinematics preserves contact points and segment lengths.
export function solveJoint(root, end, a, b, sign = 1) {
  const dx = end[0] - root[0],
    dy = end[1] - root[1],
    d = Math.hypot(dx, dy);
  const angle =
    Math.atan2(dy, dx) +
    sign *
      Math.acos(
        Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))),
      );
  return [root[0] + a * Math.cos(angle), root[1] + a * Math.sin(angle)];
}
const chain = (root, angles, a, b) => {
  const j = polar(root, a, angles[0]);
  return [root, j, polar(j, b, angles[1])];
};
export function rigAt(kind, t) {
  const c = movements[kind],
    p = poseAt(kind, t),
    front = c.view === "front";
  let hip = p.hip,
    shoulder = polar(hip, 65, p.torso),
    nearLeg,
    farLeg,
    feet;
  if (c.anchoredShoulder) shoulder = [...c.anchoredShoulder];
  if (kind === "calf" || kind === "calfseated") {
    const toe = kind === "calf" ? [214, 253] : [210, 253],
      ankle = polar(toe, 25, 195 + p.calf * 1.6);
    if (kind === "calf") {
      hip = shift(ankle, 0, -88);
      shoulder = polar(hip, 65, -90);
      nearLeg = [hip, solveJoint(hip, ankle, 45, 45), ankle];
    } else nearLeg = [hip, solveJoint(hip, ankle, 45, 48, -1), ankle];
    farLeg = nearLeg.map((q) => shift(q, -9, -3));
    feet = [toe, shift(toe, -9, -3)];
  } else if (c.anchor) {
    nearLeg = [hip, solveJoint(hip, c.anchor, 45, 48, c.bend), c.anchor];
    farLeg = c.backAnchor
      ? [hip, solveJoint(hip, c.backAnchor, 45, 48, 1), c.backAnchor]
      : chain(hip, p.freeLeg, 45, 48);
  } else {
    const lowerLength =
      !front &&
      ["row", "preacher", "extension", "overhead", "crunch"].includes(kind)
        ? 62
        : 48;
    nearLeg = chain(shift(hip, front ? 10 : 0, 0), p.legs, 45, lowerLength);
    farLeg = front
      ? nearLeg.map((q) => [hip[0] * 2 - q[0], q[1]])
      : p.freeLeg
        ? chain(shift(hip, -7, -3), p.freeLeg, 45, lowerLength)
        : nearLeg.map((q) => shift(q, -9, -3));
  }
  if (kind === "adductor") {
    // Thighs rotate toward the viewer; the knees remain at seat height.
    const spread = 10 + 45 * Math.cos(rad(10 + 65 * t));
    nearLeg = [
      [hip[0] + 10, hip[1]],
      [hip[0] + spread, hip[1] + 27],
      [hip[0] + spread + 3, 254],
    ];
    farLeg = nearLeg.map((q) => [hip[0] * 2 - q[0], q[1]]);
  }
  let nearArm = chain(shift(shoulder, front ? 19 : 0, 0), p.arms, 34, 34);
  let farArm = front
    ? nearArm.map((q) => [hip[0] * 2 - q[0], q[1]])
    : nearArm.map((q) => shift(q, -9, -4));
  if (kind === "fly" || kind === "cablefly") {
    // Front projection of horizontal adduction; apparent length changes with depth.
    const yaw = 10 + 95 * t,
      root = shift(shoulder, 19, 0);
    nearArm = [
      root,
      [root[0] + 34 * Math.cos(rad(yaw)), root[1] + 8],
      [root[0] + 65 * Math.cos(rad(yaw)), root[1] + 18],
    ];
    farArm = nearArm.map((q) => [hip[0] * 2 - q[0], q[1]]);
  }
  if (kind === "calf") {
    const hand = [262, 115];
    nearArm = [shoulder, solveJoint(shoulder, hand, 44, 44, -1), hand];
    farArm = nearArm.map((q) => shift(q, -8, -4));
  }
  if (kind === "pulldown") {
    const hand = [235, 60 + 58 * t],
      root = shift(shoulder, 19, 0);
    nearArm = [root, solveJoint(root, hand, 34, 34, 1), hand];
    farArm = nearArm.map((q) => [hip[0] * 2 - q[0], q[1]]);
  }
  if (kind === "reverse") {
    const hand = [175, 207];
    nearArm = [shoulder, solveJoint(shoulder, hand, 34, 34, 1), hand];
    farArm = nearArm.map((q) => shift(q, -6, -3));
  }
  const head = polar(shoulder, 25, kind === "reverse" ? 180 : p.torso);
  return {
    hip,
    shoulder,
    head,
    nearArm,
    farArm,
    nearLeg,
    farLeg,
    feet,
    front,
    pose: p,
  };
}
function segment(a, b, w1, w2, active) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
    n = [-Math.sin(angle), Math.cos(angle)];
  const edge = (p, w, s) => [p[0] + n[0] * w * s, p[1] + n[1] * w * s];
  return `<path class="body-segment ${active ? "is-moving" : ""}" d="M${fmt(edge(a, w1, 1))} Q${fmt(edge(lerp(a, b, 0.42), w1 + 1, 1))} ${fmt(edge(b, w2, 1))} Q${fmt(polar(b, w2, (angle * 180) / Math.PI))} ${fmt(edge(b, w2, -1))} L${fmt(edge(a, w1, -1))} Q${fmt(polar(a, w1, (angle * 180) / Math.PI + 180))} ${fmt(edge(a, w1, 1))}Z"/>`;
}
function limb(points, type, active, far = false) {
  const arm = type === "arm",
    moving = ["arms", "legs", "hip"].includes(active);
  return `<g class="${far ? "far-limb" : "near-limb"}">${segment(points[0], points[1], arm ? 8 : 11, arm ? 5 : 7, moving)}${segment(points[1], points[2], arm ? 6 : 8, 4, moving || active === "forearms" || active === "calves")}<circle class="joint-dot" cx="${points[1][0]}" cy="${points[1][1]}" r="3"/></g>`;
}
function foot(leg, toe, kind, far) {
  const a = leg[2],
    end = toe ?? shift(a, kind === "hinge" && far ? 9 : 15, 5);
  return `<path class="shoe ${far ? "far-limb" : ""}" d="M${fmt(shift(a, -5, -2))}L${fmt(shift(a, 5, -2))}L${fmt(shift(end, 4, 0))}Q${fmt(shift(end, 8, 7))} ${fmt(shift(end, 0, 8))}L${fmt(shift(a, -6, 7))}Z"/>`;
}
export function drawMovement(kind, t, prefix, phase = "") {
  const c = movements[kind],
    r = rigAt(kind, t),
    { hip, shoulder, head } = r,
    normal = [-(shoulder[1] - hip[1]) / 65, (shoulder[0] - hip[0]) / 65];
  const side = (p, w, s) => [
    p[0] + normal[0] * w * s,
    p[1] + normal[1] * w * s,
  ];
  const body = `M${fmt(side(shoulder, r.front ? 19 : 13, 1))}Q${fmt(side(lerp(shoulder, hip, 0.45), 17, 1))} ${fmt(side(hip, 12, 1))}L${fmt(side(hip, 12, -1))}Q${fmt(side(lerp(shoulder, hip, 0.45), 13 + (r.pose.curve || 0) * 0.25, -1))} ${fmt(side(shoulder, r.front ? 19 : 13, -1))}Z`;
  const arm = ["arms", "forearms"].includes(c.active) ? c.active : "",
    leg = ["legs", "calves", "hip"].includes(c.active) ? c.active : "";
  return `<svg class="exercise-figure" viewBox="0 0 360 310" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${phase} · ${c.cues.join(". ")}</title><desc id="${prefix}-desc">Vista ${r.front ? "frontal" : "lateral"}. Contorno verde indica a região em movimento; setas mostram a direção. ${c.unilateral ? "Repita do outro lado." : ""}</desc><defs><marker id="${prefix}-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0L6 3L0 6" fill="#79dfe5"/></marker></defs><path class="scene-floor" d="M28 267H332"/>${equipment(kind, r, false)}${limb(r.farLeg, "leg", leg, true)}${foot(r.farLeg, r.feet?.[1], kind, true)}${limb(r.farArm, "arm", arm, true)}<path class="body-torso ${["core", "hip"].includes(c.active) ? "is-moving" : ""}" d="${body}"/><path class="shirt-seam" d="M${fmt(lerp(shoulder, hip, 0.12))}L${fmt(lerp(shoulder, hip, 0.78))}"/><path class="shorts" d="M${fmt(side(hip, 13, 1))}L${fmt(side(hip, 13, -1))}L${fmt(shift(side(hip, 16, -1), 0, 12))}L${fmt(shift(side(hip, 16, 1), 0, 12))}Z"/>${limb(r.nearLeg, "leg", leg)}${foot(r.nearLeg, r.feet?.[0], kind, false)}<path class="neck" d="M${fmt(shoulder)}L${fmt(head)}"/><ellipse class="figure-head" cx="${head[0]}" cy="${head[1]}" rx="11" ry="13"/><path class="hairline" d="M${head[0] - 10} ${head[1] - 3}Q${head[0] - 4} ${head[1] - 18} ${head[0] + 10} ${head[1] - 6}"/>${!r.front ? `<path class="face-detail" d="M${head[0] + 8} ${head[1] - 2}l5 5-5 2"/>` : ""}${limb(r.nearArm, "arm", arm)}${equipment(kind, r, true)}${[r.farArm[2], r.nearArm[2]].map((h) => `<ellipse class="figure-hand" cx="${h[0]}" cy="${h[1]}" rx="5" ry="6"/>`).join("")}<path class="trajectory" d="${c.arrow}" marker-end="url(#${prefix}-arrow)"/><text class="figure-cue" x="20" y="23">${c.cues[0]}</text><text class="figure-cue secondary" x="20" y="294">${c.cues[1]}</text></svg>`;
}
export function illustration(ex) {
  const id = `movement-${ex.id}-${++serial}`,
    c = movements[ex.diagram];
  return `<section class="movement-guide" data-movement="${ex.diagram}" data-movement-id="${id}" aria-label="Ilustração de ${ex.name}"><div class="movement"><figure>${drawMovement(ex.diagram, 0, `${id}-start`, "Início")}<figcaption><b>01</b> Início</figcaption></figure><figure>${drawMovement(ex.diagram, 1, `${id}-end`, "Final")}<figcaption><b>02</b> Final</figcaption></figure></div><p class="movement-legend"><span></span> Contorno: região em movimento · Seta: direção${c.unilateral ? "<strong>Repita do outro lado.</strong>" : ""}</p><button class="button movement-open" type="button" data-motion="open" aria-expanded="false" aria-controls="${id}-player">${icon("play")} Ver movimento</button><div class="movement-player" id="${id}-player" hidden><div class="motion-stage"></div><p class="motion-status" role="status" aria-live="polite">Início</p><div class="motion-controls"><button class="button primary" type="button" data-motion="play">Reproduzir</button><button class="button" type="button" data-motion="pause" disabled>Pausar</button><button class="button quiet" type="button" data-motion="reset">Reiniciar</button></div><div class="motion-steps" role="group" aria-label="Escolher posição"><button type="button" data-motion="start" aria-pressed="true">Início</button><button type="button" data-motion="middle" aria-pressed="false">Meio</button><button type="button" data-motion="end" aria-pressed="false">Final</button></div><p class="caption motion-note">Um ciclo de ida e volta. A velocidade é ilustrativa, não uma prescrição de cadência.</p></div></section><p class="caption">Ilustração didática. Confira as orientações e a demonstração para observar os detalhes da execução.</p>`;
}
