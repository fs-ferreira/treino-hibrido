export const ACTIVE_PLAN_ID = "hibrido-3x3";
export const trainingPlans = Object.freeze([
  Object.freeze({
    id: ACTIVE_PLAN_ID,
    name: "Treino Híbrido — força e corrida",
    description:
      "Uma semana para combinar força, resistência e recuperação. Três sessões de musculação e três corridas, com espaço para descansar.",
    weekdays: Object.freeze({
      1: "upper",
      2: "interval",
      3: "lower",
      4: "easy",
      5: "upper2",
    }),
  }),
]);
export const getActivePlan = () => trainingPlans[0];
export const getPlan = (id) =>
  trainingPlans.find((plan) => plan.id === id) ?? null;
export function planWorkoutForDay(day, settings) {
  return (
    getActivePlan().weekdays[day] ??
    (day === settings.longDay ? "long" : "rest")
  );
}
export function planWeek(settings) {
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
    type: planWorkoutForDay(day, settings),
  }));
}
