import { getPlan } from "./plans.js?v=1.6.0";
export const sections = Object.freeze([
  "hoje",
  "semana",
  "treinos",
  "historico",
  "configuracoes",
]);
export function isAppHash(value) {
  const key = value.replace(/^#/, "");
  return (
    sections.includes(key) || key === "session" || key.startsWith("treinos/")
  );
}
export function resolveRoute(value) {
  const key = value.replace(/^#/, "");
  if (key.startsWith("treinos/")) {
    const planId = key.slice("treinos/".length);
    return {
      key,
      section: "treinos",
      planId: getPlan(planId)?.id ?? null,
      missingPlan: !getPlan(planId),
    };
  }
  const section = sections.includes(key) ? key : "hoje";
  return { key: section, section, planId: null, missingPlan: false };
}
