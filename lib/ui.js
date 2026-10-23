import { icon } from "./icons.js?v=1.6.0";
const glyphs = {
  "↗": "arrow-up-right",
  "↓": "arrow-down",
  "↑": "arrow-up",
  "←": "arrow-left",
  "→": "arrow-right",
  "↶": "rotate-ccw",
  "✓": "check",
  "⌄": "chevron-down",
  "☾": "moon",
  "▷": "play",
  "≈": "activity",
  "◈": "layout-dashboard",
  "▦": "calendar-days",
  "⚙": "settings",
  "◐": "circle-dashed",
  "○": "circle",
};
export function hydrateIcons(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (
      node.parentElement?.closest(
        "script,style,textarea,option,.history-note,.legacy-note,.form-error",
      )
    )
      continue;
    if (![...node.textContent].some((char) => glyphs[char])) continue;
    const fragment = document.createDocumentFragment();
    for (const part of node.textContent.split(/([↗↓↑←→↶✓⌄☾▷≈◈▦⚙◐○])/)) {
      if (glyphs[part]) {
        const wrapper = document.createElement("span");
        wrapper.innerHTML = icon(glyphs[part]);
        fragment.append(wrapper.firstChild);
      } else fragment.append(document.createTextNode(part));
    }
    node.replaceWith(fragment);
  }
  root.querySelectorAll(".close-button").forEach((button) => {
    button.innerHTML = icon("x");
  });
  root.querySelectorAll(".art-cross").forEach((el) => {
    el.innerHTML = icon("plus");
  });
  const history = root.querySelector('[data-nav="historico"] span');
  if (history) history.innerHTML = icon("chart-no-axes-combined");
  const plans = root.querySelector('[data-nav="treinos"] span');
  if (plans) plans.innerHTML = icon("clipboard-list");
}
export function applyTimeMask(input, mask) {
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret).replace(/\D/g, "").length;
  const formatted = mask(input.value);
  input.value = formatted;
  let next = 0,
    digits = 0;
  while (next < formatted.length && digits < before) {
    if (/\d/.test(formatted[next])) digits++;
    next++;
  }
  input.setSelectionRange(next, next);
}
