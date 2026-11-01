// Qualitative targets for the variants in exercises.js. Source review and
// simplifications are documented in docs/mapa-muscular.md.
export const muscles = Object.freeze({
  pectorals: "Peitoral maior",
  "anterior-deltoids": "Deltoide anterior",
  "lateral-deltoids": "Deltoide lateral",
  "posterior-deltoids": "Deltoide posterior",
  biceps: "Bíceps braquial",
  triceps: "Tríceps braquial",
  trapezius: "Trapézio",
  rhomboids: "Romboides",
  lats: "Latíssimo do dorso",
  erectors: "Eretores da coluna",
  "rectus-abdominis": "Reto abdominal",
  obliques: "Oblíquos",
  glutes: "Glúteo máximo",
  hamstrings: "Isquiotibiais",
  quadriceps: "Quadríceps",
  adductors: "Adutores",
  gastrocnemius: "Gastrocnêmio",
  soleus: "Sóleo",
});

const profiles = {
  "pec-deck": { primary: ["pectorals"], secondary: ["anterior-deltoids"] },
  "incline-press": {
    primary: ["pectorals"],
    secondary: ["anterior-deltoids", "triceps"],
  },
  "lat-pulldown": {
    primary: ["lats"],
    secondary: ["biceps", "trapezius", "rhomboids", "posterior-deltoids"],
  },
  "machine-row": {
    primary: ["trapezius", "rhomboids"],
    secondary: ["lats", "biceps", "posterior-deltoids"],
  },
  "lateral-raise": { primary: ["lateral-deltoids"], secondary: [] },
  "cable-curl": { primary: ["biceps"], secondary: [] },
  "rope-pushdown": { primary: ["triceps"], secondary: [] },
  "single-rdl": {
    primary: ["glutes", "hamstrings"],
    secondary: ["erectors"],
  },
  bulgarian: {
    primary: ["quadriceps"],
    secondary: ["glutes", "hamstrings", "adductors"],
  },
  "leg-curl": { primary: ["hamstrings"], secondary: [] },
  "leg-extension": { primary: ["quadriceps"], secondary: [] },
  adductor: {
    primary: ["adductors"],
    secondary: ["glutes", "hamstrings"],
  },
  "seated-calf": { primary: ["soleus"], secondary: ["gastrocnemius"] },
  "standing-calf": { primary: ["gastrocnemius"], secondary: ["soleus"] },
  "barbell-row": {
    primary: ["trapezius", "rhomboids"],
    secondary: [
      "lats",
      "biceps",
      "posterior-deltoids",
      "erectors",
      "rectus-abdominis",
    ],
  },
  crossover: { primary: ["pectorals"], secondary: ["anterior-deltoids"] },
  "shoulder-press": {
    primary: ["anterior-deltoids", "lateral-deltoids"],
    secondary: ["triceps", "trapezius"],
  },
  "preacher-curl": { primary: ["biceps"], secondary: [] },
  "french-press": { primary: ["triceps"], secondary: [] },
  "machine-crunch": { primary: ["rectus-abdominis"], secondary: [] },
  "reverse-crunch": { primary: ["rectus-abdominis"], secondary: [] },
};

export const exerciseMuscles = Object.freeze(
  Object.fromEntries(
    Object.entries(profiles).map(([id, profile]) => [
      id,
      Object.freeze({
        primary: Object.freeze(profile.primary),
        secondary: Object.freeze(profile.secondary),
      }),
    ]),
  ),
);
