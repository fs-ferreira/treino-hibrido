import test from "node:test";
import assert from "node:assert/strict";
import {
  createMotion,
  createAccordions,
  createDialogController,
} from "../lib/motion.js";

function events(extra = {}) {
  const listeners = new Map();
  return Object.assign(
    {
      addEventListener(name, listener) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(listener);
      },
      removeEventListener(name, listener) {
        listeners.get(name)?.delete(listener);
      },
      emit(name, event = {}) {
        for (const listener of listeners.get(name) ?? []) listener(event);
      },
    },
    extra,
  );
}
function animated(extra = {}) {
  const animations = [];
  return Object.assign(
    events(),
    {
      animations,
      animate() {
        let resolve, reject;
        const animation = {
          finished: new Promise((a, b) => {
            resolve = a;
            reject = b;
          }),
          complete: () => resolve(),
          canceled: false,
          cancel() {
            this.canceled = true;
            reject(new Error("AbortError"));
          },
        };
        animations.push(animation);
        return animation;
      },
    },
    extra,
  );
}
function setup() {
  const preference = events({ matches: false });
  const document = events({ hidden: false });
  return {
    preference,
    document,
    motion: createMotion({ preference, document }),
  };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("movimento: o último toque substitui o anterior sem rejeição pendente", async () => {
  const { motion } = setup(),
    element = animated();
  const first = motion.enter(element),
    second = motion.enter(element, "week", -1);
  assert.equal(await first, false);
  assert.equal(element.animations[0].canceled, true);
  element.animations[1].complete();
  assert.equal(await second, true);
  motion.dispose();
});

test("movimento: redução dinâmica e aba oculta finalizam efeitos e liberam recursos", async () => {
  const { motion, preference, document } = setup(),
    element = animated();
  const active = motion.enter(element);
  preference.matches = true;
  preference.emit("change");
  assert.equal(await active, true);
  await motion.feedback(element);
  assert.equal(element.animations.length, 1);
  preference.matches = false;
  const next = motion.enter(element);
  document.hidden = true;
  document.emit("visibilitychange");
  assert.equal(await next, true);
  motion.dispose();
});

test("movimento: navegador sem a API também dispensa rolagem e efeitos contínuos", async () => {
  const motion = createMotion({ supported: false });
  const element = animated();
  assert.equal(motion.reduced, true);
  assert.equal(await motion.enter(element), true);
  assert.equal(element.animations.length, 0);
  motion.dispose();
});

test("movimento: ausência da API aplica o estado sem impedir a ação", async () => {
  const { motion } = setup();
  assert.equal(await motion.enter({}), true);
  assert.equal(await motion.feedback(null), true);
  motion.dispose();
});

function dialogSetup({ supported = true } = {}) {
  const base = setup();
  let focusCount = 0,
    closeCount = 0;
  const opener = {
    isConnected: true,
    focus() {
      focusCount++;
    },
  };
  const closeButton = { focus() {} };
  const body = {
    style: {
      position: "relative",
      top: "",
      left: "",
      right: "",
      overflow: "",
      paddingRight: "5px",
    },
  };
  Object.assign(base.document, {
    body,
    activeElement: opener,
    documentElement: { clientWidth: 390 },
  });
  const scrolls = [];
  const window = {
    scrollX: 0,
    scrollY: 640,
    innerWidth: 390,
    getComputedStyle: () => ({ paddingRight: "5px" }),
    scrollTo: (value) => scrolls.push(value),
  };
  const dialog = animated({
    open: false,
    dataset: {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelector: () => closeButton,
  });
  if (!supported) delete dialog.animate;
  const controller = createDialogController(dialog, base.motion, {
    document: base.document,
    window,
    mobile: () => true,
    onClose: () => closeCount++,
  });
  return {
    ...base,
    dialog,
    controller,
    body,
    scrolls,
    focusCount: () => focusCount,
    closeCount: () => closeCount,
  };
}

test("painel: confirmação persiste imediatamente e uma única vez, com retorno de foco e rolagem", async () => {
  const s = dialogSetup();
  s.controller.show();
  assert.equal(s.body.style.position, "fixed");
  let accepted = 0;
  assert.equal(
    s.controller.close(() => accepted++),
    true,
  );
  assert.equal(
    s.controller.close(() => accepted++),
    false,
  );
  assert.equal(accepted, 1);
  assert.equal(s.dialog.open, true);
  s.dialog.animations.at(-1).complete();
  await tick();
  assert.equal(s.dialog.open, false);
  assert.equal(s.body.style.position, "relative");
  assert.equal(s.scrolls.at(-1).top, 640);
  assert.equal(s.focusCount(), 1);
  s.dialog.emit("close");
  assert.equal(s.closeCount(), 1);
  s.motion.dispose();
});

test("painel: reabrir durante a saída invalida o fechamento anterior", async () => {
  const s = dialogSetup();
  s.controller.show();
  s.controller.close();
  s.controller.show();
  await tick();
  assert.equal(s.dialog.open, true);
  assert.equal(s.controller.closing, false);
  s.controller.forceClose();
  assert.equal(s.dialog.open, false);
  assert.equal(s.body.style.position, "relative");
  assert.equal(s.closeCount(), 1);
  s.motion.dispose();
});

test("painel: ativar redução no meio da saída encerra a transição e restaura a página", async () => {
  const s = dialogSetup();
  s.controller.show();
  s.controller.close();
  s.preference.matches = true;
  s.preference.emit("change");
  await tick();
  assert.equal(s.dialog.open, false);
  assert.equal(s.body.style.position, "relative");
  assert.equal(s.closeCount(), 1);
  s.motion.dispose();
});

test("painel: Escape e movimento reduzido não deixam o fundo bloqueado", async () => {
  const s = dialogSetup({ supported: false });
  s.controller.show();
  let prevented = false;
  s.dialog.emit("cancel", {
    preventDefault() {
      prevented = true;
    },
  });
  await tick();
  assert.equal(prevented, true);
  assert.equal(s.dialog.open, false);
  assert.equal(s.body.style.position, "relative");
  s.controller.show();
  s.controller.close();
  s.preference.matches = true;
  s.preference.emit("change");
  await tick();
  assert.equal(s.dialog.open, false);
  s.motion.dispose();
});

test("acordeão: toques rápidos terminam no último estado, com altura livre e conteúdo fechado fora do foco", async () => {
  const { motion } = setup();
  const body = { inert: false, contains: () => false };
  const summary = { getBoundingClientRect: () => ({ height: 60 }) };
  const card = animated({
    open: false,
    style: { height: "" },
    dataset: {},
    clientTop: 1,
    ownerDocument: { activeElement: null },
    getBoundingClientRect() {
      return { height: this.open ? 300 : 62 };
    },
    querySelector(selector) {
      return selector === "summary" ? summary : body;
    },
  });
  const states = [],
    accordion = createAccordions(motion, (_, open) => states.push(open));
  accordion.toggle(card);
  accordion.toggle(card);
  assert.equal(body.inert, true);
  card.animations.at(-1).complete();
  await tick();
  assert.equal(card.open, false);
  assert.equal(card.style.height, "");
  assert.equal(body.inert, false); // Native closed <details> now provides the focus boundary.
  assert.deepEqual(states, [true, false]);
  accordion.toggle(card);
  accordion.finish();
  assert.equal(card.open, true);
  assert.equal(card.style.height, "");
  motion.dispose();
});
