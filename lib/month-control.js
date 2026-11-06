import { dateKey } from "./core.js?v=7.1.1";
import { ageAtMonth, parseBirthMonth } from "./heart-rate.js";
import { icon } from "./icons.js?v=1.6.0";

const months = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("pt-BR", { month: "long" }),
);
export const birthMonthAllowed = (value, today = dateKey()) => {
  const age = ageAtMonth(value, today);
  return age !== null && age >= 18 && age <= 100;
};
export function birthMonthYears(today = dateKey()) {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: 84 }, (_, i) => year - 18 - i).filter((y) =>
    months.some((_, i) =>
      birthMonthAllowed(`${y}-${String(i + 1).padStart(2, "0")}`, today),
    ),
  );
}
const key = (year, month) => `${year}-${String(month + 1).padStart(2, "0")}`;
export const displayBirthMonth = (raw) => {
  const value = parseBirthMonth(raw);
  return value
    ? `${months[Number(value.slice(5)) - 1].slice(0, 3)}/${value.slice(0, 4)}`
    : "Selecionar mês e ano";
};

// Uses the same overlay, positioning and focus lifecycle as full-date calendars.
// The named field keeps MM/AAAA so settings validation and drafts stay unchanged.
export function createMonthControl({
  native,
  label,
  overlay,
  close,
  position,
}) {
  const wrapper = document.createElement("span");
  wrapper.className = "field-control field-control-month";
  const enhanced = typeof HTMLElement.prototype.showPopover === "function";
  native.classList.add("field-native");
  native.tabIndex = -1;
  native.setAttribute("aria-hidden", "true");
  native.after(wrapper);
  const years = birthMonthYears();
  const yearOptions = `<option value="">Escolher ano</option>${years.map((year) => `<option value="${year}">${year}</option>`).join("")}`;
  wrapper.innerHTML = enhanced
    ? `<button type="button" class="field-trigger" id="${native.id}-trigger" data-control-for="${native.id}" aria-label="${label}" aria-haspopup="dialog" aria-expanded="false"><span class="field-value"></span>${icon("calendar-days")}</button>`
    : `<span class="month-fallback"><select data-field-skip aria-label="Ano de nascimento">${yearOptions}</select><select data-field-skip aria-label="Mês de nascimento"></select><button type="button" class="text-button" data-month-clear>Limpar</button></span>`;
  const visible = wrapper.querySelector(enhanced ? "button" : "select");
  const control = { native, wrapper, visible, label, kind: "month", sync };
  function emit() {
    native.dispatchEvent(new Event("input", { bubbles: true }));
    native.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function choose(value) {
    native.value = value ? `${value.slice(5)}/${value.slice(0, 4)}` : "";
    sync();
    if (enhanced) close(true);
    emit();
  }
  function monthOptions(year) {
    return `<option value="">Escolher mês</option>${months.map((month, i) => `<option value="${i + 1}" ${!year || !birthMonthAllowed(key(year, i)) ? "disabled" : ""}>${month}</option>`).join("")}`;
  }
  function sync() {
    const value = parseBirthMonth(native.value);
    const disabled = native.disabled || native.readOnly;
    wrapper.dataset.disabled = String(disabled);
    for (const target of wrapper.querySelectorAll("button,select")) {
      target.disabled = disabled;
      target.setAttribute(
        "aria-invalid",
        native.getAttribute("aria-invalid") || "false",
      );
      target.setAttribute(
        "aria-describedby",
        native.getAttribute("aria-describedby") || "",
      );
    }
    if (enhanced) {
      visible.querySelector(".field-value").textContent = displayBirthMonth(
        native.value,
      );
      visible.setAttribute(
        "aria-label",
        `${label}: ${displayBirthMonth(native.value)}`,
      );
    } else {
      const [year, month] = wrapper.querySelectorAll("select");
      year.value = value?.slice(0, 4) || "";
      month.innerHTML = monthOptions(year.value);
      month.value = value ? String(Number(value.slice(5))) : "";
      month.disabled = disabled || !year.value;
    }
  }
  function open() {
    if (native.disabled || native.readOnly) return;
    const popup = overlay(control, "month");
    popup.classList.add("field-month-calendar");
    const selected = parseBirthMonth(native.value);
    let year = selected?.slice(0, 4) || "";
    popup.innerHTML = `<div class="field-calendar-title"><strong>Nascimento · mês e ano</strong><button type="button" class="field-calendar-close" data-month-close aria-label="Fechar calendário">${icon("x")}</button></div><label class="month-year-label" for="${native.id}-year">Ano<select data-field-skip aria-label="Ano" id="${native.id}-year">${yearOptions}</select></label><p class="month-prompt" role="status">${year ? "Escolha o mês." : "Escolha o ano para ver os meses disponíveis."}</p><div class="field-month-grid" role="grid" aria-label="Mês de nascimento"></div><div class="field-calendar-footer"><span>${displayBirthMonth(native.value)}</span><button type="button" data-month-clear>Limpar</button></div>`;
    const yearSelect = popup.querySelector("select");
    yearSelect.value = year;
    const grid = popup.querySelector(".field-month-grid");
    function draw() {
      const enabled = months
        .map((_, i) => i)
        .filter((i) => year && birthMonthAllowed(key(year, i)));
      const initial =
        enabled.find((i) => key(year, i) === selected) ?? enabled[0];
      grid.innerHTML = Array.from(
        { length: 4 },
        (_, row) =>
          `<div role="row">${months
            .slice(row * 3, row * 3 + 3)
            .map((month, offset) => {
              const i = row * 3 + offset,
                active = key(year, i) === selected;
              return `<span role="gridcell" aria-selected="${active}"><button type="button" data-birth-month="${i}" data-selected="${active}" aria-label="${month}${year ? ` de ${year}` : ""}" tabindex="${i === initial ? 0 : -1}" ${enabled.includes(i) ? "" : "disabled"}>${month.slice(0, 3)}</button></span>`;
            })
            .join("")}</div>`,
      ).join("");
      position();
    }
    yearSelect.addEventListener("change", () => {
      year = yearSelect.value;
      popup.querySelector(".month-prompt").textContent = year
        ? "Escolha o mês."
        : "Escolha o ano para ver os meses disponíveis.";
      draw();
      grid.querySelector('[tabindex="0"]')?.focus();
    });
    popup.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.hasAttribute("data-month-close")) close(true);
      else if (button.hasAttribute("data-month-clear")) choose("");
      else if (button.hasAttribute("data-birth-month"))
        choose(key(year, Number(button.dataset.birthMonth)));
    });
    grid.addEventListener("keydown", (event) => {
      const current = event.target.closest("[data-birth-month]");
      if (!current) return;
      const index = Number(current.dataset.birthMonth),
        row = Math.floor(index / 3);
      let next;
      if (event.key === "ArrowRight") next = index + 1;
      else if (event.key === "ArrowLeft") next = index - 1;
      else if (event.key === "ArrowDown") next = index + 3;
      else if (event.key === "ArrowUp") next = index - 3;
      else if (event.key === "Home") next = row * 3;
      else if (event.key === "End") next = row * 3 + 2;
      else return;
      event.preventDefault();
      event.stopPropagation();
      const target = grid.querySelector(
        `[data-birth-month="${next}"]:not(:disabled)`,
      );
      if (target) {
        current.tabIndex = -1;
        target.tabIndex = 0;
        target.focus();
      }
    });
    draw();
    (
      grid.querySelector('[data-selected="true"]:not(:disabled)') || yearSelect
    ).focus();
  }
  if (enhanced) visible.addEventListener("click", open);
  else {
    const [year, month] = wrapper.querySelectorAll("select");
    year.addEventListener("change", () => {
      month.innerHTML = monthOptions(year.value);
      month.disabled = !year.value;
    });
    month.addEventListener("change", () => {
      if (month.value && year.value)
        choose(key(year.value, Number(month.value) - 1));
    });
    wrapper.querySelector("button").addEventListener("click", () => choose(""));
  }
  native.addEventListener("focus", () =>
    visible.focus({ preventScroll: true }),
  );
  for (const event of ["input", "change"]) native.addEventListener(event, sync);
  control.observer = new MutationObserver(sync);
  control.observer.observe(native, {
    attributes: true,
    attributeFilter: [
      "disabled",
      "readonly",
      "aria-invalid",
      "aria-describedby",
    ],
  });
  sync();
  return control;
}
