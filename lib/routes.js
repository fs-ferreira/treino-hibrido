import { getPlan } from "./plans.js?v=1.6.0";
import { settingsSections } from "./settings.js?v=4.0.0";
import { validDate } from "./core.js";
export const sections = Object.freeze([
  "hoje",
  "treinos",
  "historico",
  "configuracoes",
]);
export function isAppHash(value) {
  const key = value.replace(/^#/, "");
  return (
    sections.includes(key) ||
    key === "semana" ||
    key.startsWith("hoje/") ||
    key === "session" ||
    key.startsWith("treinos/") ||
    key.startsWith("configuracoes/")
  );
}
export function resolveRoute(value) {
  const key = value.replace(/^#/, "");
  if (key.startsWith("hoje/")) {
    const [, date, workoutId, ...extra] = key.split("/");
    if (
      validDate(date) &&
      !extra.length &&
      (!workoutId || /^[a-zA-Z0-9_-]{1,100}$/.test(workoutId))
    )
      return {
        key,
        section: "hoje",
        date,
        workoutId: workoutId ?? null,
        planId: null,
        missingPlan: false,
      };
  }
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
