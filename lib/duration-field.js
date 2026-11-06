const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// Seconds are the component boundary; persisted diary units belong to its callers.
export function durationParts(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return { minutes: "", seconds: "" };
  const total = Math.round(seconds);
  return {
    minutes: String(Math.floor(total / 60)),
    seconds: String(total % 60),
  };
}

export function readDuration(
  parts,
  {
    required = false,
    min = 1,
    max = 86400,
    step = 1,
    precision = "seconds",
  } = {},
) {
  const minutes = String(parts.minutes ?? ""),
    seconds = precision === "minutes" ? "" : String(parts.seconds ?? "");
  const empty = minutes === "" && seconds === "";
  const fail = (error, part = "minutes") => ({
    seconds: null,
    empty,
    error,
    part,
  });
  if (empty)
    return required
      ? fail("Informe a duração.")
      : { seconds: null, empty, error: "" };
  if (minutes !== "" && !/^\d+$/.test(minutes))
    return fail("Use minutos inteiros, sem vírgula ou ponto.");
  if (seconds !== "" && (!/^\d+$/.test(seconds) || Number(seconds) > 59))
    return fail("Use segundos inteiros de 0 a 59.", "seconds");
  const total = Number(minutes) * 60 + Number(seconds);
  if (!Number.isSafeInteger(total) || total < min || total > max)
    return fail(
      `Informe uma duração entre ${formatDuration(min)} e ${formatDuration(max)}.`,
    );
  if ((total - min) % step !== 0)
    return fail(
      `Use intervalos de ${formatDuration(step)} a partir de ${formatDuration(min)}.`,
    );
  return { seconds: total, empty, error: "" };
}

export function formatDuration(seconds) {
  const parts = durationParts(seconds);
  if (parts.minutes === "") return "—";
  return `${parts.minutes} min${Number(parts.seconds) ? ` ${parts.seconds} s` : ""}`;
}

// Editing notes must not round a legacy duration that only changed for display.
export function durationValueForSave(seconds, previous, secondsPerUnit = 1) {
  return Number.isFinite(previous) &&
    Math.round(previous * secondsPerUnit) === seconds
    ? previous
    : seconds / secondsPerUnit;
}

export function durationField({
  id,
  name = "minutes",
  secondsName = "seconds",
  label = "Duração realizada",
  value = null,
  parts = durationParts(value),
  required = false,
  min = 1,
  max = 86400,
  step = 1,
  precision = "seconds",
  disabled = false,
  errorId = `${id}-error`,
}) {
  const hint =
    precision === "minutes"
      ? `De ${formatDuration(min)} a ${formatDuration(max)}, em passos de ${formatDuration(step)}.`
      : "";
  // Text with a numeric keyboard retains incomplete/invalid drafts (e.g. "21,")
  // that native number inputs would silently turn into an empty value.
  const input = (part, fieldName, inputId, title) =>
    `<label for="${escape(inputId)}">${title}<input id="${escape(inputId)}" name="${escape(fieldName)}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-duration-part="${part}" value="${escape(parts[part])}" placeholder="0" aria-describedby="${hint ? `${escape(id)}-hint ` : ""}${escape(errorId)}" ${disabled ? "disabled" : ""}></label>`;
  return `<fieldset class="duration-field" data-duration-field data-precision="${precision}" data-required="${required}" data-min="${min}" data-max="${max}" data-step="${step}" ${disabled ? "disabled" : ""}><legend>${escape(label)}</legend><div class="duration-parts">${input("minutes", name, id, "Minutos")}${precision === "seconds" ? input("seconds", secondsName, `${id}-seconds`, "Segundos") : ""}</div>${hint ? `<p class="caption duration-hint" id="${escape(id)}-hint">${hint}</p>` : ""}<span class="field-error" id="${escape(errorId)}" data-duration-error aria-live="polite" hidden></span></fieldset>`;
}

export function readDurationField(field) {
  const parts = Object.fromEntries(
    [...field.querySelectorAll("[data-duration-part]")].map((input) => [
      input.dataset.durationPart,
      input.value,
    ]),
  );
  return readDuration(parts, {
    required: field.dataset.required === "true",
    precision: field.dataset.precision,
    min: Number(field.dataset.min),
    max: Number(field.dataset.max),
    step: Number(field.dataset.step),
  });
}

export function fillDurationField(field, seconds) {
  const parts = durationParts(seconds);
  for (const input of field.querySelectorAll("[data-duration-part]"))
    input.value = parts[input.dataset.durationPart];
  return syncDurationField(field);
}

export function syncDurationField(field, { showErrors = false } = {}) {
  const result = readDurationField(field);
  if (showErrors) field.dataset.showErrors = "true";
  const visible = field.dataset.showErrors === "true";
  for (const input of field.querySelectorAll("[data-duration-part]")) {
    const invalid =
      Boolean(result.error) && input.dataset.durationPart === result.part;
    input.setCustomValidity(invalid ? result.error : "");
    input.setAttribute("aria-invalid", String(visible && invalid));
  }
  const error = field.querySelector("[data-duration-error]");
  error.textContent = visible ? result.error : "";
  error.hidden = !error.textContent;
  return result;
}

export function syncDurationFields(root, options) {
  return [...root.querySelectorAll("[data-duration-field]")]
    .filter((field) => !field.disabled)
    .map((field) => syncDurationField(field, options));
}
