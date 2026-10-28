/** Catalog of mechanism variants, independent of rendering. The authored motion
 * tracks and source links remain in movement-data/exercises. Controllers name
 * the independent motion; bindings derive all dependent attachments.
 * @typedef {{driver:string, loads?:string, cable?:boolean, seat?:string, mechanism?:string, contacts:string[], joints:string[]}} ExerciseDefinition
 */
const sceneDefinitions = {
  lateral: {
    driver: "shoulder-abduction",
    loads: "dumbbells",
    contacts: ["feet"],
    joints: ["shoulder", "elbow", "wrist"],
  },
  incline: {
    driver: "hand-targets",
    loads: "dumbbells",
    seat: "incline",
    contacts: ["feet", "pelvis", "back"],
    joints: ["shoulder", "elbow", "wrist"],
  },
  bentrow: {
    driver: "bar-path",
    loads: "bar",
    contacts: ["feet"],
    joints: ["shoulder", "elbow"],
  },
  extension: {
    driver: "knee-hinge",
    seat: "side",
    mechanism: "knee",
    contacts: ["pelvis", "back", "roller"],
    joints: ["knee", "ankle"],
  },
  pulldown: {
    driver: "bar-path",
    loads: "wide-bar",
    seat: "front",
    cable: true,
    contacts: ["feet", "pelvis"],
    joints: ["shoulder", "elbow"],
  },
  pushdown: {
    driver: "elbow-extension",
    loads: "rope",
    cable: true,
    contacts: ["feet"],
    joints: ["elbow", "wrist"],
  },
  calfseated: {
    driver: "forefoot-pivot",
    seat: "side",
    mechanism: "thigh",
    contacts: ["forefoot", "pelvis", "thigh-pad"],
    joints: ["ankle", "knee", "mtp"],
  },
  hinge: {
    driver: "hip-hinge",
    loads: "single-dumbbell",
    contacts: ["support-foot"],
    joints: ["hip", "knee", "ankle"],
  },
  split: {
    driver: "pelvis-path",
    loads: "dumbbells",
    seat: "rear-foot",
    contacts: ["support-foot", "rear-foot"],
    joints: ["hip", "knee", "ankle"],
  },
  fly: {
    driver: "shoulder-adduction",
    seat: "front",
    mechanism: "arms",
    contacts: ["feet", "pelvis", "back"],
    joints: ["shoulder", "elbow"],
  },
  cablefly: {
    driver: "shoulder-adduction",
    loads: "handles",
    cable: true,
    contacts: ["feet"],
    joints: ["shoulder", "elbow"],
  },
  row: {
    driver: "handle-path",
    loads: "narrow-bar",
    seat: "row",
    cable: true,
    contacts: ["feet", "pelvis", "chest"],
    joints: ["shoulder", "elbow"],
  },
  curl: {
    driver: "elbow-flexion",
    loads: "narrow-bar",
    cable: true,
    contacts: ["feet"],
    joints: ["elbow", "wrist"],
  },
  preacher: {
    driver: "elbow-flexion",
    loads: "ez-bar",
    seat: "preacher",
    contacts: ["feet", "pelvis", "upper-arm"],
    joints: ["elbow", "wrist"],
  },
  legcurl: {
    driver: "knee-hinge",
    seat: "prone",
    mechanism: "knee",
    contacts: ["pelvis", "thigh", "roller"],
    joints: ["knee", "ankle"],
  },
  adductor: {
    driver: "hip-adduction",
    seat: "front",
    mechanism: "thighs",
    contacts: ["pelvis", "back", "thigh-pad"],
    joints: ["hip", "knee"],
  },
  calf: {
    driver: "forefoot-pivot",
    mechanism: "balance",
    contacts: ["forefoot", "hands"],
    joints: ["ankle", "mtp"],
  },
  press: {
    driver: "shoulder-press",
    loads: "dumbbells",
    seat: "front",
    contacts: ["feet", "pelvis", "back"],
    joints: ["shoulder", "elbow", "wrist"],
  },
  overhead: {
    driver: "elbow-extension",
    loads: "two-hand-dumbbell",
    seat: "side",
    contacts: ["feet", "pelvis", "back"],
    joints: ["elbow", "wrist"],
  },
  crunch: {
    driver: "spine-flexion",
    loads: "narrow-bar",
    seat: "side",
    cable: true,
    contacts: ["feet", "pelvis"],
    joints: ["lumbar", "thorax"],
  },
  reverse: {
    driver: "pelvis-roll",
    seat: "supine",
    contacts: ["thorax", "hands"],
    joints: ["lumbar", "hip", "knee"],
  },
};

// Limits of these authored demonstrations, in radians. Not patient-specific ROM.
const angles = (a, b) => [(a * Math.PI) / 180, (b * Math.PI) / 180];
export const jointLimits = Object.freeze({
  elbow: angles(35, 180),
  knee: angles(65, 180),
  wrist: angles(0, 20),
});
const limitOverrides = {
  lateral: { elbow: angles(160, 180) },
  preacher: { elbow: angles(65, 180) },
  extension: { knee: angles(85, 180) },
  legcurl: { knee: angles(75, 180) },
  pulldown: { knee: angles(80, 110), wrist: angles(0, 15) },
  press: { knee: angles(80, 110) },
  adductor: { knee: angles(80, 110) },
  fly: { knee: angles(80, 110) },
};
export const exerciseScenes = Object.freeze(
  Object.fromEntries(
    Object.entries(sceneDefinitions).map(([kind, definition]) => [
      kind,
      Object.freeze({
        ...definition,
        limits: Object.freeze({ ...jointLimits, ...limitOverrides[kind] }),
      }),
    ]),
  ),
);

// Fixed setup dimensions in authored screen coordinates. Rest cable lengths
// include the external route and 150 units of rail, with two units of preload.
// They are validated across the whole clip; evaluation never scans other frames.
export const cableLayouts = Object.freeze({
  pulldown: [
    { guide: [180, 43], port: [310, 43], restLength: 333.0181981282391 },
  ],
  pushdown: [
    { guide: [180, 43], port: [310, 43], restLength: 352.4627417363449 },
  ],
  cablefly: [
    { guide: [310, 90], port: [310, 43], restLength: 257.7973622379717 },
    { guide: [50, 90], port: [50, 43], restLength: 257.7973622379717 },
  ],
  row: [{ guide: [295, 163], port: [295, 43], restLength: 370.60772659779195 }],
  curl: [{ guide: [180, 250], port: [310, 43], restLength: 496.3582896821616 }],
  crunch: [
    { guide: [287, 146], port: [287, 43], restLength: 336.8804064388119 },
  ],
});
