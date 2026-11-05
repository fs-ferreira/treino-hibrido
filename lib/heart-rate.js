// Version 1 targets use % of maximum heart rate, not heart rate reserve.
export const heartRatePhases = (type) =>
  type === "interval"
    ? [
        "warmup",
        ...Array.from({ length: 8 }, () => ["hard", "recovery"]).flat(),
        "cooldown",
      ]
    : ["steady"];

const ranges = Object.freeze({
  warmup: ["Z1–Z2", 50, 70],
  hard: ["Z4", 80, 90],
  recovery: ["Z1–Z2", 50, 70],
  cooldown: ["Z1", 50, 60],
  steady: ["Z2", 60, 70],
});
const integer = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

const localMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
export function parseBirthMonth(text) {
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(text)) return null;
  const [month, year] = text.split("/");
  return Number(year) >= 1900 ? `${year}-${month}` : null;
}
export const birthMonthText = (value) =>
  value ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
export const maskBirthMonth = (value) =>
  String(value)
    .replace(/\D/g, "")
    .slice(0, 6)
    .replace(/^(\d{2})(\d)/, "$1/$2");
export function ageAtMonth(birthMonth, date = localMonth()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(birthMonth ?? "")) return null;
  const [year, month] = birthMonth.split("-").map(Number);
  const [currentYear, currentMonth] = date.slice(0, 7).split("-").map(Number);
  return currentYear - year - (currentMonth < month ? 1 : 0);
}

export function validateHeartRateSettings(
  value = { birthMonth: null, sex: null },
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value.birthMonth !== null &&
      (typeof value.birthMonth !== "string" ||
        !parseBirthMonth(birthMonthText(value.birthMonth)) ||
        value.birthMonth !==
          parseBirthMonth(birthMonthText(value.birthMonth)))) ||
    ![null, "male", "female"].includes(value.sex) ||
    (value.birthMonth === null) !== (value.sex === null)
  )
    throw Error("Referência de frequência cardíaca inválida.");
  return { birthMonth: value.birthMonth, sex: value.sex };
}

export function heartRateReference(settings, date = localMonth()) {
  const { birthMonth, sex } = validateHeartRateSettings(settings);
  const age = ageAtMonth(birthMonth, date);
  if (integer(age, 18, 100))
    return {
      source: "age",
      age,
      sex,
      maxBpm: (sex === "male" ? 220 : 226) - age,
    };
  return { source: "none", age: null, sex: null, maxBpm: null };
}

export function heartRateTarget(phase, maxBpm = null) {
  const [zone, minPercent, maxPercent] = ranges[phase];
  return {
    phase,
    zone,
    minPercent,
    maxPercent,
    minBpm: maxBpm === null ? null : Math.round((maxBpm * minPercent) / 100),
    maxBpm: maxBpm === null ? null : Math.round((maxBpm * maxPercent) / 100),
  };
}

export function createHeartRatePlan(type, settings, date) {
  const reference = heartRateReference(settings, date);
  return {
    version: 1,
    ...reference,
    targets: heartRatePhases(type).map((phase) =>
      heartRateTarget(phase, reference.maxBpm),
    ),
  };
}

export function validateHeartRatePlan(value, type) {
  if (!value || value.version !== 1 || !["age", "none"].includes(value.source))
    throw Error("Planejamento cardíaco inválido.");
  if (
    value.source === "age"
      ? !integer(value.age, 18, 100) ||
        !["male", "female"].includes(value.sex) ||
        value.maxBpm !== (value.sex === "male" ? 220 : 226) - value.age
      : value.age !== null || value.sex !== null || value.maxBpm !== null
  )
    throw Error("Referência de frequência cardíaca inválida.");
  const expected = {
    version: 1,
    source: value.source,
    age: value.age,
    sex: value.sex,
    maxBpm: value.maxBpm,
    targets: heartRatePhases(type).map((phase) =>
      heartRateTarget(phase, value.maxBpm),
    ),
  };
  if (
    value.source !== expected.source ||
    value.maxBpm !== expected.maxBpm ||
    value.age !== expected.age ||
    !Array.isArray(value.targets) ||
    value.targets.length !== expected.targets.length ||
    expected.targets.some((target, i) =>
      Object.entries(target).some(
        ([key, field]) => value.targets[i]?.[key] !== field,
      ),
    )
  )
    throw Error("Metas de frequência cardíaca inválidas.");
  return expected;
}

export function heartRateText(target) {
  const bpm =
    target.minBpm === null ? "" : `${target.minBpm}–${target.maxBpm} bpm · `;
  return `FC de referência: ${bpm}${target.zone} · ${target.minPercent}–${target.maxPercent}% da FC máxima`;
}

export function heartRateReferenceText(reference) {
  if (!reference || reference.source === "none")
    return "Configure nascimento e sexo em Corrida para ver as faixas estimadas em bpm. As etapas mostram zonas e percentuais enquanto isso.";
  return `FC máxima estimada: ${reference.maxBpm} bpm · ${reference.age} anos · ${reference.sex === "male" ? "masculino (220 − idade)" : "feminino (226 − idade)"}. A idade considera o mês de nascimento. É uma estimativa individual aproximada.`;
}

export const intervalHeartRateHelp =
  "A FC responde com atraso: não acelere para atingir imediatamente a faixa dos blocos fortes. Na recuperação de 1 min, reduza o esforço; a FC pode continuar elevada e não precisa chegar à faixa antes do próximo bloco. Na caminhada final, deixe a FC cair gradualmente, sem exigir atingir Z1 em 3 min.";
export const watchHeartRateHelp =
  "Para acompanhar no relógio, use a mesma FC máxima e o método % da FC máxima. Zonas por reserva cardíaca ou limiar podem ser diferentes; compare também os valores em bpm. As faixas são referências de intensidade e não comprovam um pace específico. Combine a leitura com o esforço percebido e o teste da conversa.";
