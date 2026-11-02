import { exerciseMuscles, muscles } from "./muscle-data.js";

// Original schematic anatomy. Paths describe the left half and are mirrored
// around x=80 so both sides always share the same scale and muscle role.
export const muscleRegions = {
  front: {
    pectorals: ["M77 60 Q65 53 52 62 L55 78 Q65 87 77 79 Z"],
    "anterior-deltoids": ["M51 56 Q43 55 40 65 L38 78 Q44 77 49 70 L53 62 Z"],
    "lateral-deltoids": ["M40 61 Q32 64 32 78 L34 87 L40 77 Q39 68 44 62 Z"],
    biceps: ["M38 81 Q31 85 29 101 L26 116 Q31 123 36 113 L43 85 Z"],
    brachialis: ["M40 95 L37 113 L33 123 L29 120 L34 108 Z"],
    brachioradialis: [
      "M26 115 Q20 123 18 137 L13 157 L16 162 L23 146 L28 128 L30 121 Z",
    ],
    "wrist-flexors": ["M30 126 L33 128 L27 145 L21 163 L18 165 L22 147 Z"],
    "finger-flexors": ["M27 130 L28 135 L22 151 L17 168 L14 167 L18 151 Z"],
    "rectus-abdominis": [
      "M68 85 L77 85 L77 97 L67 97 Z",
      "M67 100 L77 100 L77 112 L67 112 Z",
      "M67 115 L77 115 L77 127 L68 127 Z",
      "M69 130 L77 130 L77 149 Q70 145 69 130 Z",
    ],
    obliques: ["M55 86 L64 90 L64 125 L68 151 L58 141 Q54 117 55 106 Z"],
    quadriceps: [
      "M53 168 Q47 188 50 213 L53 240 Q56 252 61 253 L65 246 L63 212 L65 179 Z",
      "M67 184 L75 195 L71 232 Q70 246 65 251 L65 221 Z",
    ],
    adductors: ["M65 164 L78 174 L77 190 L69 220 L66 192 Z"],
  },
  back: {
    trapezius: ["M73 44 L78 47 L78 79 L71 88 L66 65 L51 58 Z"],
    rhomboids: ["M68 74 L75 88 L78 82 L78 108 L69 101 L64 89 Z"],
    lats: ["M53 77 L62 83 L66 105 L73 115 L68 139 L57 127 Q52 108 53 77 Z"],
    "posterior-deltoids": ["M49 58 Q36 54 33 74 L36 83 L44 73 L53 69 Z"],
    "lateral-deltoids": ["M34 65 Q29 73 31 83 L34 88 L38 80 L37 72 Z"],
    triceps: ["M37 84 L45 78 L42 96 L36 117 Q32 124 27 118 L30 101 Z"],
    erectors: ["M73 114 L78 111 L78 155 L69 149 Z"],
    glutes: ["M59 145 L76 158 L78 179 Q72 192 56 187 Q48 171 53 155 Z"],
    hamstrings: [
      "M53 191 Q62 195 64 192 L63 229 L59 253 L53 247 Q48 219 53 191 Z",
      "M67 192 L76 185 L73 222 L67 251 L63 247 L66 221 Z",
    ],
    gastrocnemius: [
      "M55 265 Q60 260 63 269 L63 294 Q57 309 54 292 Z",
      "M66 265 Q73 265 72 280 L69 299 L65 294 Z",
    ],
    soleus: [
      "M52 281 L54 300 L62 310 L66 302 L71 287 L68 316 L64 332 L59 331 L54 311 Z",
    ],
  },
};

const silhouette =
  "M80 5 C65 5 61 16 64 29 Q65 38 72 41 L71 48 L51 54 Q34 54 29 70 L23 106 L18 126 L10 159 L6 171 Q4 181 10 185 L17 180 L20 169 L29 144 L33 126 L40 108 L46 88 L51 108 L53 134 L48 162 Q44 184 46 208 L51 253 Q47 270 50 293 L55 325 L54 338 L48 346 Q47 351 55 352 L69 351 L71 340 L70 321 L75 282 L74 260 L78 222 L80 198 L82 222 L86 260 L85 282 L90 321 L89 340 L91 351 L105 352 Q113 351 112 346 L106 338 L105 325 L110 293 Q113 270 109 253 L114 208 Q116 184 112 162 L107 134 L109 108 L114 88 L120 108 L127 126 L131 144 L140 169 L143 180 L150 185 Q156 181 154 171 L150 159 L142 126 L137 106 L131 70 Q126 54 109 54 L89 48 L88 41 Q95 38 96 29 C99 16 95 5 80 5 Z";

const frontNeutral = [
  "M27 125 L31 129 L24 150 L18 164 L13 161 L20 139 Z",
  "M54 265 Q60 260 65 265 L67 298 L64 328 L59 328 L57 302 Z",
];
const backNeutral = ["M27 125 L31 129 L24 150 L18 164 L13 161 L20 139 Z"];
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const bilateral = (paths) =>
  paths
    .map(
      (d) =>
        `<path d="${d}" data-side="left"/><path d="${d}" transform="translate(160 0) scale(-1 1)" data-side="right"/>`,
    )
    .join("");

export function muscleViews(profile) {
  const active = [...profile.primary, ...profile.secondary];
  for (const view of ["front", "back"])
    if (active.every((id) => muscleRegions[view][id])) return [view];
  return ["front", "back"];
}

function body(view, profile) {
  const label = view === "front" ? "Frente" : "Costas";
  return `<div class="muscle-map-view" data-muscle-view="${view}"><svg viewBox="0 0 160 360" role="group" aria-label="Vista ${view === "front" ? "frontal" : "posterior"}" xmlns="http://www.w3.org/2000/svg">
    <path class="muscle-silhouette" d="${silhouette}" aria-hidden="true"/>
    <g class="muscle-region" aria-hidden="true">${bilateral(view === "front" ? frontNeutral : backNeutral)}</g>
    ${Object.entries(muscleRegions[view])
      .map(([id, paths]) => {
        const role = profile.primary.includes(id)
          ? "primary"
          : profile.secondary.includes(id)
            ? "secondary"
            : null;
        const name = muscles[id],
          roleLabel = role === "primary" ? "Principal" : "Secundário";
        return `<g class="muscle-region${role ? ` muscle-${role}` : ""}" ${role ? `data-muscle="${id}" data-muscle-role="${role}" data-muscle-name="${name}" role="button" tabindex="0" aria-pressed="false" aria-label="${name} · ${roleLabel}"` : 'aria-hidden="true"'}>${bilateral(paths)}</g>`;
      })
      .join("")}
    <path class="muscle-body-detail" d="${view === "front" ? "M72 44 Q80 49 88 44 M57 151 L80 169 L103 151 M56 259 L66 259 M94 259 L104 259" : "M80 49 L80 156 M57 257 L68 257 M92 257 L103 257"}" aria-hidden="true"/>
  </svg><span aria-hidden="true">${label}</span></div>`;
}

export function muscleMap(exercise, context = "session") {
  const profile = exerciseMuscles[exercise.id];
  if (!profile) return "";
  const id = `${context}-muscles-${exercise.id}`;
  const names = (group) => group.map((key) => muscles[key]).join(", ");
  const description = `Principais: ${names(profile.primary)}. Secundários: ${profile.secondary.length ? names(profile.secondary) : "nenhum destacado"}.`;
  return `<figure class="muscle-map" data-muscle-map="${exercise.id}" aria-label="Músculos de ${escape(exercise.name)}" aria-describedby="${id}-description">
    <figcaption class="muscle-map-description" id="${id}-description">${description}</figcaption>
    <div class="muscle-map-views">${muscleViews(profile)
      .map((view) => body(view, profile))
      .join("")}</div>
    <div class="muscle-map-legend" aria-hidden="true"><span><i class="muscle-swatch primary"></i>Principal</span><span><i class="muscle-swatch secondary"></i>Secundários</span></div>
    <p class="muscle-map-tooltip" role="status" aria-live="polite" aria-atomic="true"></p>
  </figure>`;
}

// One controller on the persistent main element also handles newly rendered
// cards. Selection only updates the SVG and feedback; it never renders forms.
export function createMuscleMapController(root) {
  const doc = root.ownerDocument;
  let selection = null;
  const targetFor = (event) => event.target.closest?.("[data-muscle]");
  function reset() {
    if (!selection) return;
    selection.target.classList.remove("is-selected");
    selection.target.setAttribute("aria-pressed", "false");
    selection.feedback.textContent = "";
    selection = null;
  }
  function show(target, pinned = false) {
    reset();
    const feedback = target
      .closest("[data-muscle-map]")
      .querySelector(".muscle-map-tooltip");
    const role =
      target.dataset.muscleRole === "primary" ? "Principal" : "Secundário";
    feedback.textContent = `${target.dataset.muscleName} · ${role}`;
    target.classList.add("is-selected");
    target.setAttribute("aria-pressed", "true");
    selection = { target, feedback, pinned };
  }
  function activate(target) {
    if (selection?.target === target && selection.pinned) reset();
    else show(target, true);
  }
  const handlers = {
    pointerover(event) {
      const target = targetFor(event);
      if (
        event.pointerType !== "touch" &&
        target &&
        !target.contains(event.relatedTarget) &&
        selection?.target !== target
      )
        show(target);
    },
    pointerout(event) {
      const target = targetFor(event);
      if (
        target &&
        selection?.target === target &&
        !selection.pinned &&
        !target.contains(event.relatedTarget) &&
        doc.activeElement !== target
      )
        reset();
    },
    focusin(event) {
      const target = targetFor(event);
      if (target) show(target);
      else reset();
    },
    focusout(event) {
      if (targetFor(event) === selection?.target) reset();
    },
    click(event) {
      const target = targetFor(event);
      if (target) activate(target);
    },
    keydown(event) {
      const target = targetFor(event);
      if (target && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        activate(target);
      }
    },
    toggle(event) {
      if (
        !event.target.open &&
        selection &&
        event.target.contains(selection.target)
      )
        reset();
    },
  };
  const outside = (event) => {
    if (!targetFor(event)) reset();
  };
  const escapeKey = (event) => {
    if (event.key === "Escape") reset();
  };
  for (const [name, handler] of Object.entries(handlers))
    root.addEventListener(name, handler, name === "toggle");
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("keydown", escapeKey);
  return {
    reset,
    dispose() {
      reset();
      for (const [name, handler] of Object.entries(handlers))
        root.removeEventListener(name, handler, name === "toggle");
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("keydown", escapeKey);
    },
  };
}
