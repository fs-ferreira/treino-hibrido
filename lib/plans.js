export const ACTIVE_PLAN_ID = "hibrido-3x3";
export const CROSS_PLAN_ID = "hibrido-cross";
export const optionalChoices = Object.freeze(["cross", "upper2", "long"]);
export const trainingPlans = Object.freeze([
  Object.freeze({
    id: ACTIVE_PLAN_ID,
    name: "Treino Híbrido — força e corrida",
    description:
      "Três sessões de musculação e três corridas, com espaço para descansar.",
    weekdays: Object.freeze({
      1: "upper",
      2: "interval",
      3: "lower",
      4: "easy",
      5: "upper2",
    }),
  }),
  Object.freeze({
    id: CROSS_PLAN_ID,
    name: "Treino Híbrido — força, corrida e Cross",
    description: "Cinco sessões regulares e um sábado opcional, como bônus.",
    weekdays: Object.freeze({
      1: "upper",
      2: "interval",
      3: "lower",
      4: "cross",
      5: "easy",
      6: "rest",
      0: "rest",
    }),
  }),
]);
export const getPlan = (id) => trainingPlans.find((p) => p.id === id) ?? null;
export const initialPlanHistory = () => [
  { planId: ACTIVE_PLAN_ID, from: null },
];
const todayKey = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export function getActivePlan(settings = {}, date = todayKey()) {
  const entries = settings.planHistory ?? initialPlanHistory();
  return (
    getPlan(
      entries.filter((e) => e.from === null || e.from <= date).at(-1)?.planId,
    ) ?? trainingPlans[0]
  );
}
export const pendingPlanChange = (settings, today = todayKey()) =>
  settings.planHistory?.find((e) => e.from > today) ?? null;
export function validPlanDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T12:00:00");
  return (
    Number.isFinite(d.valueOf()) &&
    [
      String(d.getFullYear()).padStart(4, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-") === value
  );
}
export function changePlan(settings, planId, from, today = todayKey()) {
  if (!getPlan(planId) || !validPlanDate(from) || from < today)
    throw Error("Escolha um plano e uma data a partir de hoje.");
  const history = (settings.planHistory ?? initialPlanHistory()).filter(
    (e) => e.from === null || (e.from < from && e.from <= today),
  );
  if (history.at(-1).planId !== planId) history.push({ planId, from });
  return { ...settings, planHistory: history };
}
export const cancelPlanChange = (settings, today = todayKey()) => ({
  ...settings,
  planHistory: (settings.planHistory ?? initialPlanHistory()).filter(
    (e) => e.from === null || e.from <= today,
  ),
});
export function validatePlanHistory(value = initialPlanHistory()) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 20000 ||
    value[0]?.from !== null ||
    value[0]?.planId !== ACTIVE_PLAN_ID
  )
    throw Error("Histórico de planos inválido.");
  return value.map((e, i) => {
    if (
      !e ||
      !getPlan(e.planId) ||
      (i && (!validPlanDate(e.from) || (i > 1 && e.from <= value[i - 1].from)))
    )
      throw Error("Histórico de planos inválido.");
    return { planId: e.planId, from: e.from };
  });
}
export function planWorkoutForDay(
  day,
  settings,
  plan = getActivePlan(settings),
) {
  return plan.weekdays[day] ?? (day === settings.longDay ? "long" : "rest");
}
export function planWeek(settings, planId = getActivePlan(settings).id) {
  const plan = getPlan(planId) ?? trainingPlans[0];
  const labels = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    day,
    label: labels[day],
    type: planWorkoutForDay(day, settings, plan),
    optional: plan.id === CROSS_PLAN_ID && day === 6,
  }));
}
