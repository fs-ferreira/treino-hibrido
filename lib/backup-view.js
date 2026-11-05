import { getActivePlan, pendingPlanChange } from "./plans.js";
import {
  recordedWorkouts,
  workoutStarted,
  durationText,
  VERSION,
} from "./core.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function backupSummary(data, version = data.version) {
  const all = recordedWorkouts(data.sessions),
    records = all.filter(({ workout: s }) => workoutStarted(s)),
    dates = [...new Set(records.map((s) => s.date))].sort(),
    planned = all.filter(
      ({ workout: s }) =>
        !workoutStarted(s) && !s.canceledAt && s.type !== "rest",
    );
  const metric = (label, value) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const s = data.settings;
  return `<p class="eyebrow">O QUE SERÁ RESTAURADO</p><dl class="import-metrics">${metric("Dias com registros", dates.length)}${metric("Treinos registrados", records.length)}${metric("Cancelados", all.filter(({ workout }) => workout.canceledAt).length)}${metric("Concluídos", records.filter(({ workout: w }) => w.done).length)}${metric("Séries feitas", records.flatMap(({ workout: w }) => Object.values(w.sets).flat()).filter((set) => set.done).length)}${metric("Cross", records.filter(({ workout: w }) => w.cross).length)}${metric("Bônus concluídos", records.filter(({ workout: w }) => w.optional && w.done).length)}${metric("Corridas", records.filter(({ workout: w }) => w.run).length)}${metric("Treinos programados no arquivo", planned.length)}${metric("Dias explicitamente em descanso", Object.values(data.sessions).filter((day) => !day.workouts.length).length)}</dl><p class="caption">${dates.length ? `Registros de ${dates[0]} a ${dates.at(-1)}.` : "Sem registros de treino; o arquivo pode conter programação e configurações."}</p><p class="caption">Backup versão ${version}${version === VERSION ? "" : ", convertido para versão " + VERSION + " ao restaurar"}. Configurações incluídas.</p><details class="help-details"><summary>Conferir configurações</summary><dl class="backup-settings">${Object.entries(
    {
      "Plano ativo": getActivePlan(s).name,
      "Próxima mudança": pendingPlanChange(s)
        ? pendingPlanChange(s).from
        : "Nenhuma",
      "Pace leve": s.easyPace || "Não informado",
      "Pace moderado-forte": s.hardPace || "Não informado",
      "Pace de caminhada": s.walkPace || "Não informado",
      "Dia padrão do longão": s.longDay === 6 ? "Sábado" : "Domingo",
      "Duração padrão do longão": `${s.longMinutes} min`,
      "Progressão de carga": `${s.loadProgression}%`,
      "Progressão de pace": s.paceProgression ? "Ativada" : "Desativada",
      "Pace vinculado à corrida recente": s.useRecentPace ? "Sim" : "Não",
      "Corrida recente": s.recentRun.date
        ? `${s.recentRun.date} · ${s.recentRun.km} km · ${durationText(s.recentRun.seconds)}`
        : "Não informada",
      "Pace forte manual": s.manualHardPace || "Não informado",
    },
  )
    .map(
      ([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`,
    )
    .join("")}</dl></details>`;
}
