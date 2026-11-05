import { icon } from "./icons.js?v=1.6.0";
import { validDate, dateKey, dateFromKey, addDays } from "./core.js?v=6.0.0";
import { createMonthControl } from "./month-control.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fold = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const displayDate = (value) =>
  validDate(value) ? value.split("-").reverse().join("/") : "";
export function parseDisplayDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const key = match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  return validDate(key) ? key : "";
}
export function dateError(raw, { min = "", max = "" } = {}) {
  if (!raw.trim()) return "";
  const key = parseDisplayDate(raw);
  if (!key) return "Informe uma data válida em DD/MM/AAAA.";
  if (min && key < min)
    return `Escolha uma data a partir de ${displayDate(min)}.`;
  if (max && key > max) return `Escolha uma data até ${displayDate(max)}.`;
  return "";
}
const monthName = (date) => date.toLocaleDateString("pt-BR", { month: "long" });
const fullDate = (value) =>
  dateFromKey(value).toLocaleDateString("pt-BR", { dateStyle: "full" });

// Native fields retain the form contract; the visible controls own interaction.
export function createFieldControls({ motion } = {}) {
  const controls = new Map(),
    drafts = new Map();
  let active = null,
    serial = 0;
  const mobile = () => matchMedia("(max-width: 600px)").matches;
  const emit = (node, type) =>
    node.dispatchEvent(new Event(type, { bubbles: true }));
  function labelFor(node) {
    const label = node.labels?.[0]?.cloneNode(true);
    label
      ?.querySelectorAll(
        "input,select,textarea,button,small,.field-error,.field-control",
      )
      .forEach((el) => el.remove());
    return (
      node.getAttribute("aria-label") ||
      label?.textContent.trim() ||
      node.name ||
      "Selecionar"
    );
  }
  function close(restore = false) {
    if (!active) return;
    const old = active;
    active = null;
    (old.control.calendar || old.control.visible).setAttribute(
      "aria-expanded",
      "false",
    );
    old.control.visible.removeAttribute("aria-activedescendant");
    old.control.wrapper.removeAttribute("data-open");
    if (old.popup instanceof HTMLDialogElement) {
      old.popup.close();
      document.body.style.overflow = old.overflow;
    } else if (old.popup.matches(":popover-open")) old.popup.hidePopover();
    old.popup.remove();
    if (restore && old.control.visible.isConnected)
      old.control.visible.focus({ preventScroll: true });
  }
  function position() {
    if (!active || active.popup instanceof HTMLDialogElement) return;
    const { popup, control } = active,
      rect = control.wrapper.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width ?? innerWidth,
      height = viewport?.height ?? innerHeight;
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0;
    const popupWidth = Math.min(
      Math.max(rect.width, active.kind !== "select" ? 336 : 240),
      width - 24,
    );
    const below = height + top - rect.bottom - 16,
      above = rect.top - top - 16;
    const needed =
      active.kind !== "select" ? Math.min(popup.scrollHeight || 460, 520) : 260;
    const up = below < needed && above > below;
    Object.assign(popup.style, {
      width: `${popupWidth}px`,
      maxHeight: `${Math.max(80, Math.min(active.kind !== "select" ? 520 : 360, up ? above : below))}px`,
      left: `${Math.max(left + 12, Math.min(rect.left, left + width - popupWidth - 12))}px`,
      top: "0px",
    });
    popup.style.top = `${Math.max(top + 12, up ? rect.top - popup.offsetHeight - 8 : rect.bottom + 8)}px`;
  }
  function overlay(control, kind) {
    close();
    const calendar = kind !== "select";
    const sheet = calendar && mobile();
    const popup = document.createElement(sheet ? "dialog" : "div");
    popup.className = `field-popup ${calendar ? "field-calendar" : "field-menu"}${sheet ? " field-calendar-sheet" : ""}`;
    popup.setAttribute(
      "aria-label",
      calendar ? `Calendário: ${control.label}` : control.label,
    );
    if (!sheet) popup.setAttribute("popover", "manual");
    if (calendar) popup.setAttribute("role", "dialog");
    (control.native.closest("dialog[open]") || document.body).append(popup);
    active = { popup, control, kind, overflow: document.body.style.overflow };
    (control.calendar || control.visible).setAttribute("aria-expanded", "true");
    if (calendar) {
      popup.id = `${control.native.id}-calendar`;
      (control.calendar || control.visible).setAttribute(
        "aria-controls",
        popup.id,
      );
    }
    control.wrapper.dataset.open = "true";
    popup.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(true);
    });
    popup.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
      if (event.key === "Tab" && kind === "select") close(true);
    });
    if (sheet) {
      document.body.style.overflow = "hidden";
      popup.showModal();
    } else popup.showPopover();
    return popup;
  }
  function sync(control) {
    if (control.kind === "month") return control.sync();
    const { native, visible, wrapper, kind } = control;
    const draft = drafts.get(native.id);
    visible.disabled = native.disabled;
    visible.setAttribute("aria-required", String(native.required));
    visible.setAttribute(
      "aria-invalid",
      String(
        native.getAttribute("aria-invalid") === "true" || Boolean(draft?.error),
      ),
    );
    wrapper.dataset.disabled = String(native.disabled);
    if (kind === "select") {
      visible.querySelector(".field-value").textContent =
        native.selectedOptions[0]?.textContent || "Selecionar";
    } else {
      const ownDraft = draft?.canonical === native.value ? draft : null;
      visible.value = ownDraft ? ownDraft.raw : displayDate(native.value);
      control.error.textContent = ownDraft?.error || "";
      control.error.hidden = !ownDraft?.error;
      native.setCustomValidity(ownDraft?.error || "");
      visible.readOnly = native.readOnly;
      control.calendar.disabled = native.disabled || native.readOnly;
    }
    const describedBy = [
      native.getAttribute("aria-describedby"),
      control.error?.id,
    ]
      .filter(Boolean)
      .join(" ");
    if (describedBy) visible.setAttribute("aria-describedby", describedBy);
  }
  function openSelect(control, edge) {
    const { native, visible } = control;
    if (native.disabled) return;
    const popup = overlay(control, "select");
    const searchable =
      native.dataset.historyField === "exercise" && native.options.length > 12;
    const listId = `${native.id}-options`;
    popup.innerHTML = `${searchable ? `<div class="field-search-wrap"><input class="field-search" type="search" placeholder="Buscar exercício…" aria-label="Buscar exercício" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${listId}" autocomplete="off"></div>` : ""}<div class="field-options" id="${listId}" role="listbox" aria-label="${escape(control.label)}"></div><p class="field-no-results" role="status" hidden>Nenhum exercício encontrado.</p>`;
    visible.setAttribute("aria-controls", listId);
    const list = popup.querySelector(".field-options"),
      search = popup.querySelector("input");
    const options = [...native.options]
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.hidden);
    let shown = options,
      highlighted = native.selectedIndex,
      prefix = "",
      lastTyped = 0;
    function highlight(index) {
      highlighted = index;
      for (const item of list.children)
        item.dataset.highlighted = String(
          Number(item.dataset.index) === highlighted,
        );
      const item = list.querySelector(`[data-index="${highlighted}"]`);
      (search || visible).setAttribute("aria-activedescendant", item?.id || "");
      item?.scrollIntoView({ block: "nearest" });
    }
    function draw() {
      shown = options.filter(
        ({ option }) =>
          !search?.value ||
          fold(option.textContent).includes(fold(search.value)),
      );
      list.innerHTML = shown
        .map(
          ({ option, index }) =>
            `<div id="${listId}-${index}" class="field-option" role="option" aria-selected="${option.selected}" aria-disabled="${option.disabled || option.parentElement.disabled || false}" data-index="${index}"><span>${escape(option.textContent)}</span><span class="field-option-check">${option.selected ? icon("check") : ""}</span></div>`,
        )
        .join("");
      popup.querySelector(".field-no-results").hidden = Boolean(shown.length);
      if (
        !shown.some(
          (item) => item.index === highlighted && !item.option.disabled,
        )
      )
        highlighted = shown.find(({ option }) => !option.disabled)?.index ?? -1;
      position();
      highlight(highlighted);
    }
    function choose(index) {
      const option = native.options[index];
      if (!option || option.disabled || option.parentElement.disabled) return;
      const changed = native.selectedIndex !== index;
      native.selectedIndex = index;
      sync(control);
      close(true);
      if (changed) {
        emit(native, "input");
        emit(native, "change");
      }
    }
    function keydown(event) {
      const enabled = shown.filter(
        ({ option }) => !option.disabled && !option.parentElement.disabled,
      );
      const current = enabled.findIndex((item) => item.index === highlighted);
      let index;
      if (event.key === "ArrowDown")
        index = enabled[(current + 1) % enabled.length]?.index;
      else if (event.key === "ArrowUp")
        index = enabled[(current - 1 + enabled.length) % enabled.length]?.index;
      else if (event.key === "Home") index = enabled[0]?.index;
      else if (event.key === "End") index = enabled.at(-1)?.index;
      else if (event.key === "Enter" || (event.key === " " && !search)) {
        event.preventDefault();
        event.stopPropagation();
        choose(highlighted);
        return;
      } else if (
        event.key.length === 1 &&
        !search &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        prefix = Date.now() - lastTyped < 700 ? prefix + event.key : event.key;
        lastTyped = Date.now();
        index = enabled.find(({ option }) =>
          fold(option.textContent).startsWith(fold(prefix)),
        )?.index;
      } else return;
      event.preventDefault();
      event.stopPropagation();
      if (index !== undefined) highlight(index);
    }
    active.keydown = keydown;
    popup.addEventListener("keydown", keydown);
    search?.addEventListener("input", draw);
    list.addEventListener("pointermove", (event) => {
      const item = event.target.closest("[data-index]");
      if (item?.getAttribute("aria-disabled") === "false")
        highlight(Number(item.dataset.index));
    });
    list.addEventListener("click", (event) => {
      const item = event.target.closest("[data-index]");
      if (item) choose(Number(item.dataset.index));
    });
    if (edge === "Home")
      highlighted = options.find(({ option }) => !option.disabled)?.index;
    if (edge === "End")
      highlighted = options.findLast(({ option }) => !option.disabled)?.index;
    draw();
    (search || visible).focus({ preventScroll: true });
  }
  function openCalendar(control) {
    const { native } = control;
    if (native.disabled || native.readOnly) return;
    const popup = overlay(control, "date");
    let focused = native.value || dateKey();
    if (native.min && focused < native.min) focused = native.min;
    if (native.max && focused > native.max) focused = native.max;
    let month = dateFromKey(focused),
      mode = "days",
      yearPage = month.getFullYear();
    month.setDate(1);
    const unavailable = (key) =>
      Boolean(
        (native.min && key < native.min) || (native.max && key > native.max),
      );
    function choose(key) {
      drafts.delete(native.id);
      native.setCustomValidity("");
      native.value = key;
      sync(control);
      close(true);
      emit(native, "input");
      emit(native, "change");
    }
    function draw(focusSelector) {
      const year = month.getFullYear(),
        m = month.getMonth();
      const from = document.querySelector("#history-from")?.value,
        to = document.querySelector("#history-to")?.value;
      const range = native.dataset.historyField && from && to && from <= to;
      let content;
      if (mode === "days") {
        const first = addDays(dateKey(month), -((month.getDay() + 6) % 7));
        content = `<div class="field-weekdays" aria-hidden="true">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((day) => `<span>${day}</span>`).join("")}</div><div class="field-days" role="grid" aria-label="${escape(monthName(month))} de ${year}">${Array.from(
          { length: 6 },
          (_, week) =>
            `<div class="field-calendar-week" role="row">${Array.from(
              { length: 7 },
              (_, day) => {
                const key = addDays(first, week * 7 + day),
                  date = dateFromKey(key);
                return `<span role="gridcell" aria-selected="${native.value === key}"><button type="button" data-date="${key}" tabindex="${key === focused ? 0 : -1}" aria-label="${escape(fullDate(key))}" ${key === dateKey() ? 'aria-current="date"' : ""} ${unavailable(key) ? "disabled" : ""} data-outside="${date.getMonth() !== m}" data-selected="${native.value === key}" data-in-range="${Boolean(range && key >= from && key <= to)}" data-range-edge="${Boolean(range && (key === from || key === to))}">${date.getDate()}</button></span>`;
              },
            ).join("")}</div>`,
        ).join("")}</div>`;
      } else {
        const values =
          mode === "months"
            ? Array.from({ length: 12 }, (_, i) => i)
            : Array.from({ length: 12 }, (_, i) => yearPage - 5 + i);
        content = `<div class="field-calendar-choices">${values.map((value) => `<button type="button" data-${mode === "months" ? "month" : "year"}="${value}" data-selected="${mode === "months" ? value === m : value === year}">${mode === "months" ? escape(monthName(new Date(year, value, 1))) : value}</button>`).join("")}</div>`;
      }
      popup.innerHTML = `<div class="field-calendar-title"><strong>${escape(control.label)}</strong><button type="button" class="field-calendar-close" data-calendar-close aria-label="Fechar calendário">${icon("x")}</button></div><div class="field-calendar-nav"><button type="button" data-calendar-step="-1" aria-label="${mode === "days" ? "Mês" : "Ano"} anterior">${icon("arrow-left")}</button><div><button type="button" data-calendar-month aria-label="Escolher mês">${escape(monthName(month))}</button><button type="button" data-calendar-year aria-label="Escolher ano">${year}</button></div><button type="button" data-calendar-step="1" aria-label="${mode === "days" ? "Mês" : "Ano"} seguinte">${icon("arrow-right")}</button></div>${mode === "years" ? `<p class="field-year-range" aria-live="polite">${yearPage - 5} – ${yearPage + 6}</p>` : ""}${content}<div class="field-calendar-footer"><span>${native.value ? displayDate(native.value) : "Selecione uma data"}</span><button type="button" data-calendar-today ${unavailable(dateKey()) ? "disabled" : ""}>Hoje</button><button type="button" data-calendar-clear>Limpar</button></div>`;
      position();
      if (focusSelector)
        popup.querySelector(focusSelector)?.focus({ preventScroll: true });
    }
    popup.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.hasAttribute("data-calendar-close")) return close(true);
      if (button.dataset.date) return choose(button.dataset.date);
      if (button.hasAttribute("data-calendar-today")) return choose(dateKey());
      if (button.hasAttribute("data-calendar-clear")) return choose("");
      if (button.dataset.calendarStep) {
        const step = Number(button.dataset.calendarStep);
        if (mode === "years") yearPage += step * 12;
        else if (mode === "months")
          month.setFullYear(month.getFullYear() + step);
        else month.setMonth(month.getMonth() + step);
      }
      if (button.hasAttribute("data-calendar-month")) mode = "months";
      if (button.hasAttribute("data-calendar-year")) {
        mode = "years";
        yearPage = month.getFullYear();
      }
      if (button.dataset.month !== undefined) {
        month.setMonth(Number(button.dataset.month));
        mode = "days";
      }
      if (button.dataset.year) {
        month.setFullYear(Number(button.dataset.year));
        mode = "months";
      }
      focused = dateKey(month);
      draw(
        button.dataset.calendarStep
          ? `[data-calendar-step="${button.dataset.calendarStep}"]`
          : mode === "days"
            ? `[data-date="${focused}"]`
            : ".field-calendar-choices button",
      );
    });
    popup.addEventListener("keydown", (event) => {
      const button = event.target.closest("[data-date]");
      if (!button) return;
      let next = button.dataset.date;
      const day = (dateFromKey(next).getDay() + 6) % 7;
      if (event.key === "ArrowLeft") next = addDays(next, -1);
      else if (event.key === "ArrowRight") next = addDays(next, 1);
      else if (event.key === "ArrowUp") next = addDays(next, -7);
      else if (event.key === "ArrowDown") next = addDays(next, 7);
      else if (event.key === "Home") next = addDays(next, -day);
      else if (event.key === "End") next = addDays(next, 6 - day);
      else if (event.key === "PageUp" || event.key === "PageDown") {
        const date = dateFromKey(next),
          originalDay = date.getDate();
        date.setDate(1);
        date.setMonth(
          date.getMonth() +
            (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
        );
        date.setDate(
          Math.min(
            originalDay,
            new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
          ),
        );
        next = dateKey(date);
      } else return;
      event.preventDefault();
      event.stopPropagation();
      if (unavailable(next)) return;
      focused = next;
      month = dateFromKey(next);
      month.setDate(1);
      draw(`[data-date="${focused}"]`);
    });
    draw(`[data-date="${focused}"]`);
    motion?.play(
      popup,
      [
        {
          opacity: 0,
          transform: mobile() ? "translateY(24px)" : "translateY(4px)",
        },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 200 },
    );
  }
  function enhance(native) {
    if (native.hasAttribute("data-month-picker")) {
      controls.set(
        native,
        createMonthControl({
          native,
          label: labelFor(native),
          overlay,
          close,
          position,
        }),
      );
      return;
    }
    const kind = native.tagName === "SELECT" ? "select" : "date";
    if (!native.id) native.id = `field-${native.name || "control"}-${++serial}`;
    const label = labelFor(native),
      wrapper = document.createElement("span");
    wrapper.className = `field-control field-control-${kind}`;
    native.classList.add("field-native");
    native.tabIndex = -1;
    native.setAttribute("aria-hidden", "true");
    native.after(wrapper);
    wrapper.innerHTML =
      kind === "select"
        ? `<button type="button" class="field-trigger" id="${native.id}-trigger" data-control-for="${native.id}" role="combobox" aria-label="${escape(label)}" aria-haspopup="listbox" aria-controls="${native.id}-options" aria-expanded="false"><span class="field-value"></span>${icon("chevron-down")}</button>`
        : `<span class="field-date-input"><input type="text" class="field-date-text" id="${native.id}-display" data-control-for="${native.id}" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/AAAA" aria-label="${escape(label)}"><button type="button" class="field-date-button" aria-label="Abrir calendário: ${escape(label)}" aria-haspopup="dialog">${icon("calendar-days")}</button></span><span class="field-date-error" id="${native.id}-date-error" role="status" hidden></span>`;
    const visible = wrapper.querySelector(
      kind === "select" ? "button" : "input",
    );
    const control = {
      native,
      wrapper,
      visible,
      kind,
      label,
      dirty: false,
      calendar: wrapper.querySelector(".field-date-button"),
      error: wrapper.querySelector(".field-date-error"),
    };
    control.calendar?.setAttribute("aria-expanded", "false");
    controls.set(native, control);
    native.addEventListener("focus", () =>
      visible.focus({ preventScroll: true }),
    );
    native.addEventListener("invalid", (event) => {
      event.preventDefault();
      visible.setAttribute("aria-invalid", "true");
      if (kind === "date") {
        const error =
          dateError(visible.value, native) ||
          (native.validity.valueMissing
            ? "Informe uma data em DD/MM/AAAA."
            : native.validationMessage);
        drafts.set(native.id, {
          raw: visible.value,
          canonical: native.value,
          error,
        });
        control.error.textContent = error;
        control.error.hidden = false;
      }
      visible.focus();
    });
    for (const name of ["input", "change"])
      native.addEventListener(name, () => sync(control));
    control.observer = new MutationObserver(() => sync(control));
    control.observer.observe(native, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "disabled",
        "required",
        "aria-invalid",
        "aria-describedby",
        "min",
        "max",
        "selected",
      ],
    });
    if (kind === "select") {
      visible.addEventListener("pointerdown", (event) =>
        event.preventDefault(),
      );
      visible.addEventListener("click", () =>
        active?.control === control ? close(true) : openSelect(control),
      );
      visible.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && active?.control === control) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        }
        if (event.key === "Tab") {
          close();
          return;
        }
        if (active?.control === control) return active.keydown?.(event);
        if (
          ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
          (event.key.length === 1 &&
            event.key !== " " &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey)
        ) {
          event.preventDefault();
          openSelect(control, event.key);
          if (event.key.length === 1) active?.keydown?.(event);
        }
      });
    } else {
      function edit(commit) {
        if (commit && !control.dirty) return;
        control.dirty = !commit;
        const raw = visible.value,
          error = dateError(raw, native);
        native.value = parseDisplayDate(raw);
        drafts.set(native.id, {
          raw,
          canonical: native.value,
          error: commit ? error : "",
        });
        native.setCustomValidity(error);
        if (commit) {
          sync(control);
          emit(native, "change");
        } else emit(native, "input");
      }
      visible.addEventListener("input", (event) => {
        event.stopPropagation();
        edit(false);
      });
      visible.addEventListener("change", (event) => event.stopPropagation());
      visible.addEventListener("blur", () => {
        if (active?.control !== control) edit(true);
      });
      visible.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          edit(true);
        }
      });
      control.calendar.addEventListener("click", () => openCalendar(control));
      // Clicking the calendar must not replace its opener during a blur render.
      control.calendar.addEventListener("pointerdown", (event) =>
        event.preventDefault(),
      );
    }
    sync(control);
  }
  const outside = (event) => {
    if (
      active &&
      !active.popup.contains(event.target) &&
      !active.control.wrapper.contains(event.target)
    ) {
      if (
        !(active.popup instanceof HTMLDialogElement) ||
        event.target === active.popup
      )
        close(active.kind === "month");
    }
    if (
      active?.popup === event.target &&
      active.popup instanceof HTMLDialogElement
    ) {
      const box = active.popup.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        close(true);
    }
  };
  document.addEventListener("pointerdown", outside, true);
  window.addEventListener("resize", () => close(true));
  document.addEventListener("scroll", position, true);
  window.visualViewport?.addEventListener("resize", position);
  window.visualViewport?.addEventListener("scroll", position);
  return {
    close,
    reset({ preserveDrafts = false } = {}) {
      close();
      if (!preserveDrafts) drafts.clear();
    },
    refresh(root = document) {
      const popover = typeof HTMLElement.prototype.showPopover === "function";
      for (const [node, control] of controls)
        if (!node.isConnected) {
          control.observer.disconnect();
          controls.delete(node);
        }
      for (const node of root.querySelectorAll(
        popover
          ? 'select:not([data-field-skip]),input[type="date"],input[data-month-picker]'
          : "input[data-month-picker]",
      )) {
        if (!controls.has(node)) enhance(node);
        else sync(controls.get(node));
      }
      position();
    },
    focus(node) {
      (controls.get(node)?.visible || node)?.focus({ preventScroll: true });
    },
  };
}
