import { getPlan } from "./plans.js?v=1.6.0";
import { settingsSections } from "./settings.js?v=1.7.1";
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
    sections.includes(key) ||
    key === "session" ||
    key.startsWith("treinos/") ||
    key.startsWith("configuracoes/")
  );
}
export function resolveRoute(value) {
  const key = value.replace(/^#/, "");
  if (key === "configuracoes" || key.startsWith("configuracoes/")) {
    const requested = key.split("/")[1] || "corrida";
    const settingsSection = settingsSections.some((s) => s.id === requested)
      ? requested
      : "corrida";
    return {
      key: `configuracoes/${settingsSection}`,
      section: "configuracoes",
      settingsSection,
      planId: null,
      missingPlan: false,
    };
  }
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
