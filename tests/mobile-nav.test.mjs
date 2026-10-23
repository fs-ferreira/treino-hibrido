import test from "node:test";
import assert from "node:assert/strict";
import {
  createMobileNav,
  wrap,
  circularDistance,
  navPositions,
  navRelease,
} from "../lib/mobile-nav.js";
import { motionProgress } from "../lib/motion.js";

function events(extra = {}) {
  const listeners = new Map();
  return Object.assign(
    {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) {
        listeners.get(name)?.delete(fn);
      },
      emit(name, event = {}) {
        for (const fn of listeners.get(name) || [])
          fn({ type: name, ...event });
      },
      listenerCount() {
        return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
      },
    },
    extra,
  );
}
function classes() {
  const set = new Set();
  return {
    add: (x) => set.add(x),
    remove: (x) => set.delete(x),
    toggle(x, on) {
      if (on) set.add(x);
      else set.delete(x);
    },
    contains: (x) => set.has(x),
  };
}
function setup(options = {}) {
  let time = 0,
    nextFrame = 1,
    width = 390;
  const frames = new Map(),
    mobile = events({ matches: options.mobile ?? true }),
    preference = events({ matches: options.reduced ?? false }),
    doc = events({ hidden: false });
  const win = events();
  const track = events({
    scrollLeft: 0,
    getBoundingClientRect: () => ({ width }),
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  const root = events({ classList: classes(), ownerDocument: doc });
  const links = ["hoje", "semana", "treinos", "historico", "configuracoes"].map(
    (route) => ({
      dataset: { nav: route },
      style: {},
      classList: classes(),
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      removeAttribute(k) {
        delete this.attrs[k];
      },
      closest() {
        return this;
      },
      focus() {
        doc.activeElement = this;
        root.emit("focusin", { target: this });
      },
    }),
  );
  root.querySelector = () => track;
  root.querySelectorAll = () => links;
  const nav = createMobileNav(root, {
    window: win,
    document: doc,
    mobile,
    preference,
    supported: options.supported ?? true,
    now: () => time,
    requestFrame: (fn) => {
      const id = nextFrame++;
      frames.set(id, fn);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
  });
  nav.setActive("hoje");
  function tick(ms = 16) {
    time += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(time));
  }
  function finish() {
    for (let i = 0; frames.size && i < 30; i++) tick(20);
    assert.equal(frames.size, 0);
  }
  function pointer(name, x, y = 20, extra = {}) {
    const target = name === "pointerdown" ? root : win;
    target.emit(name, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      isPrimary: true,
      button: 0,
      ...extra,
    });
  }
  function click(detail = 1) {
    let prevented = false;
    root.emit("click", {
      detail,
      preventDefault() {
        prevented = true;
      },
      stopImmediatePropagation() {},
    });
    return prevented;
  }
  return {
    nav,
    root,
    track,
    links,
    win,
    doc,
    mobile,
    preference,
    frames,
    tick,
    finish,
    pointer,
    click,
    setWidth: (w) => {
      width = w;
      win.emit("resize");
    },
  };
}
test("geometria: centenas de voltas mantêm posições, espaços e três itens completos em repouso", () => {
  for (const width of [320, 375, 390, 430, 600]) {
    const positions = navPositions(width, 0);
    assert.equal(
      positions.filter((p) => p.x >= 0 && p.x + p.width <= width).length,
      3,
    );
    assert.equal(
      positions.filter((p) => p.x < width && p.x + p.width > 0).length,
      5,
    );
    for (let step = -2500; step < 2500; step++) {
      const p = step / 13,
        tiles = navPositions(width, p).sort((a, b) => a.x - b.x);
      assert.ok(tiles.every((t) => Number.isFinite(t.x) && t.width >= 44));
      for (let i = 1; i < tiles.length; i++)
        assert.ok(
          Math.abs(tiles[i].x - (tiles[i - 1].x + tiles[i - 1].width) - 8) <
            1e-8,
        );
      assert.ok(
        tiles[0].x <= 8 && tiles.at(-1).x + tiles.at(-1).width >= width - 8,
      );
    }
  }
  assert.equal(wrap(-1, 5), 4);
  assert.equal(circularDistance(-4, 5), 1);
});
test("arraste não navega, agrupa quadros e diferencia gesto vertical, toque e teclado", () => {
  const t = setup();
  t.pointer("pointerdown", 200);
  t.pointer("pointermove", 204);
  assert.equal(t.frames.size, 0);
  t.pointer("pointermove", 202, 70);
  t.pointer("pointerup", 202, 70);
  assert.equal(t.click(), false);
  assert.equal(t.nav.position, 0);
  t.pointer("pointerdown", 200);
  t.pointer("pointermove", 130);
  t.pointer("pointermove", 110);
  assert.equal(t.frames.size, 1);
  t.tick();
  t.pointer("pointerup", 110);
  t.finish();
  assert.equal(t.nav.position, 1);
  assert.equal(t.click(), true);
  assert.equal(t.click(0), false);
  assert.equal(
    t.links.filter((l) => l.attrs["aria-current"] === "page")[0].dataset.nav,
    "hoje",
  );
  t.pointer("pointerdown", 200);
  t.pointer("pointerup", 200);
  assert.equal(t.click(), false);
  t.nav.dispose();
});
test("centenas de gestos atravessam as duas extremidades sem clones nem crescimento de quadros", () => {
  const t = setup();
  for (let i = 0; i < 500; i++) {
    const from = t.nav.position,
      direction = i % 2 === 0 ? -1 : 1;
    t.pointer("pointerdown", 200);
    t.pointer("pointermove", 200 + ((direction * 390) / 3.5) * 6);
    t.tick();
    t.pointer("pointerup", 200 + ((direction * 390) / 3.5) * 6);
    t.finish();
    assert.ok(
      Math.abs(
        circularDistance(t.nav.position - wrap(from - direction * 6, 5), 5),
      ) < 1e-8,
    );
    assert.equal(t.links.length, 5);
    assert.equal(t.frames.size, 0);
  }
  t.nav.dispose();
});
test("toque: captura implícita do link ou ícone não encerra o arraste ao passar para o menu", () => {
  const t = setup();
  // Touch starts with implicit capture on the hit target. Transferring it to
  // the track emits lostpointercapture on that child, bubbling to the track.
  for (const target of [t.links[0], { tagName: "svg" }]) {
    t.nav.setActive("hoje");
    t.finish();
    t.pointer("pointerdown", 200, 20, { pointerType: "touch" });
    t.pointer("pointermove", 180, 20, { pointerType: "touch" });
    t.track.emit("lostpointercapture", { target, pointerId: 1 });
    t.pointer("pointermove", 50, 20, { pointerType: "touch" });
    t.tick();
    assert.ok(t.nav.position > 1 && t.nav.position < 2);
    t.pointer("pointerup", 50, 20, { pointerType: "touch" });
    t.finish();
    assert.equal(t.nav.position, 1);
    assert.equal(t.click(), true);
    assert.equal(t.links[0].attrs["aria-current"], "page");
    assert.equal(t.links.length, 5);
  }
  t.nav.dispose();
});
test("perder a captura do próprio menu encerra o gesto e ignora movimentos posteriores", () => {
  const t = setup();
  t.pointer("pointerdown", 200);
  t.pointer("pointermove", 80);
  t.tick();
  t.track.emit("lostpointercapture", { target: t.track, pointerId: 1 });
  t.pointer("pointermove", -300);
  t.finish();
  assert.equal(t.nav.position, 1);
  assert.equal(t.frames.size, 0);
  assert.equal(t.click(), true);
  t.nav.dispose();
});

test("toque: desvio vertical inicial não rouba o arraste horizontal do menu", () => {
  const t = setup();
  t.pointer("pointerdown", 200, 20, { pointerType: "touch" });
  t.pointer("pointermove", 203, 42, { pointerType: "touch" });
  assert.equal(t.nav.position, 0);
  assert.equal(t.frames.size, 0);
  t.pointer("pointermove", 80, 58, { pointerType: "touch" });
  t.tick();
  assert.ok(t.nav.position > 1);
  t.pointer("pointerup", 80, 58, { pointerType: "touch" });
  t.finish();
  assert.equal(t.nav.position, 1);
  assert.equal(t.click(), true);
  assert.equal(t.links[0].attrs["aria-current"], "page");
  t.nav.dispose();
});

test("toque: movimento apenas vertical no menu não ativa um destino, mas toque curto funciona", () => {
  const t = setup();
  t.pointer("pointerdown", 200, 20, { pointerType: "touch" });
  t.pointer("pointermove", 204, 100, { pointerType: "touch" });
  t.pointer("pointerup", 204, 100, { pointerType: "touch" });
  t.finish();
  assert.equal(t.nav.position, 0);
  assert.equal(t.click(), true);
  t.pointer("pointerdown", 200, 20, { pointerType: "touch" });
  t.pointer("pointermove", 202, 23, { pointerType: "touch" });
  t.pointer("pointerup", 202, 23, { pointerType: "touch" });
  assert.equal(t.click(), false);
  t.nav.dispose();
});

test("toque: segundo dedo interrompe o menu sem bloquear o gesto nativo de zoom", () => {
  const t = setup();
  t.pointer("pointerdown", 200, 20, { pointerType: "touch" });
  t.pointer("pointermove", 80, 20, { pointerType: "touch" });
  t.tick();
  let prevented = false;
  t.pointer("pointerdown", 300, 30, {
    pointerType: "touch",
    pointerId: 2,
    isPrimary: false,
    preventDefault() {
      prevented = true;
    },
  });
  const settled = t.nav.position;
  t.pointer("pointermove", -300, 20, { pointerType: "touch" });
  t.pointer("pointerup", -300, 20, { pointerType: "touch" });
  t.finish();
  assert.equal(t.nav.position, settled);
  assert.equal(Number.isInteger(settled), true);
  assert.equal(prevented, false);
  assert.equal(t.click(), true);
  assert.equal(t.frames.size, 0);
  t.nav.dispose();
});
test("rota usa caminho circular curto e nova ação interrompe o encaixe anterior", () => {
  const t = setup({ reduced: true });
  t.nav.setActive("configuracoes");
  assert.equal(t.nav.position, 4);
  t.preference.matches = false;
  t.nav.setActive("hoje");
  t.tick(160);
  assert.ok(t.nav.position > 4 && t.nav.position < 5);
  t.nav.setActive("treinos");
  assert.equal(t.frames.size, 1);
  t.finish();
  assert.equal(t.nav.position, 2);
  t.nav.setActive("configuracoes");
  t.tick(80);
  t.pointer("pointerdown", 150);
  assert.equal(t.frames.size, 0);
  t.pointer("pointermove", 130);
  t.pointer("pointercancel", 130);
  t.finish();
  assert.ok(Number.isInteger(t.nav.position));
  t.nav.dispose();
});
test("foco revela um link por destino e setas circulam sem trocar a rota nem prender Tab", () => {
  const t = setup();
  t.links[4].focus();
  assert.equal(t.nav.position, 4);
  let prevented = false;
  const key = (k) =>
    t.root.emit("keydown", {
      target: t.doc.activeElement,
      key: k,
      preventDefault() {
        prevented = true;
      },
    });
  key("ArrowRight");
  assert.equal(t.doc.activeElement, t.links[0]);
  assert.equal(t.nav.position, 0);
  key("ArrowLeft");
  assert.equal(t.doc.activeElement, t.links[4]);
  key("Home");
  assert.equal(t.doc.activeElement, t.links[0]);
  key("End");
  assert.equal(t.doc.activeElement, t.links[4]);
  prevented = false;
  key("Tab");
  assert.equal(prevented, false);
  assert.equal(
    t.links.filter((l) => l.attrs["aria-current"] === "page").length,
    1,
  );
  assert.equal(t.links[0].attrs["aria-current"], "page");
  t.nav.dispose();
});
test("redução dinâmica e aba oculta encerram no destino; não sobra animação em repouso", () => {
  const t = setup();
  t.nav.setActive("configuracoes");
  t.tick(50);
  t.preference.matches = true;
  t.preference.emit("change");
  assert.equal(t.nav.position, 4);
  assert.equal(t.frames.size, 0);
  t.nav.setActive("treinos");
  assert.equal(t.nav.position, 2);
  assert.equal(t.frames.size, 0);
  t.pointer("pointerdown", 200);
  t.pointer("pointermove", 100);
  t.tick();
  assert.notEqual(t.nav.position, 2);
  t.pointer("pointerup", 100);
  assert.equal(t.frames.size, 0);
  t.preference.matches = false;
  t.nav.setActive("hoje");
  t.doc.hidden = true;
  t.doc.emit("visibilitychange");
  assert.equal(t.nav.position, 0);
  assert.equal(t.frames.size, 0);
  t.nav.dispose();
});
test("mudança de largura e breakpoint limpa transformações e restaura o destino ativo", () => {
  const t = setup();
  t.nav.setActive("treinos");
  t.finish();
  t.setWidth(320);
  assert.equal(t.nav.position, 2);
  assert.equal(t.links[0].style.width, `${320 / 3.5 - 8}px`);
  t.mobile.matches = false;
  t.mobile.emit("change");
  assert.equal(t.nav.enabled, false);
  assert.ok(
    t.links.every((l) => l.style.transform === "" && l.style.width === ""),
  );
  t.mobile.matches = true;
  t.mobile.emit("change");
  assert.equal(t.nav.enabled, true);
  assert.equal(t.nav.position, 2);
  t.nav.dispose();
  assert.equal(t.win.listenerCount(), 0);
  assert.equal(t.root.listenerCount(), 0);
  assert.equal(t.doc.listenerCount(), 0);
  assert.equal(t.frames.size, 0);
});
test("sem suporte a gestos o menu convencional continua com seus cinco links", () => {
  const t = setup({ supported: false });
  assert.equal(t.nav.enabled, false);
  assert.equal(t.root.classList.contains("is-circular"), false);
  t.nav.setActive("treinos");
  assert.equal(t.links[2].attrs["aria-current"], "page");
  assert.equal(t.frames.size, 0);
  t.nav.dispose();
});
test("curva compartilhada é monotônica e usa tempo, com início e fim exatos", () => {
  assert.equal(motionProgress(0), 0);
  assert.equal(motionProgress(1), 1);
  const values = Array.from({ length: 101 }, (_, i) => motionProgress(i / 100));
  assert.ok(
    values.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v >= values[i - 1])),
  );
});

test("inércia: velocidade projeta avanço curto; pausa e amostras sem tempo não inventam impulso", () => {
  const samples = [
    { x: 200, t: 0 },
    { x: 170, t: 20 },
    { x: 140, t: 40 },
    { x: 110, t: 60 },
  ];
  for (const width of [320, 390, 600]) {
    const release = navRelease(0.8, samples, 60, width / 3.5);
    assert.equal(release.inertia, true);
    assert.ok(release.target > 0.8 && release.target - 0.8 <= 1.5);
    assert.ok(release.duration >= 320 && release.duration <= 460);
  }
  assert.equal(navRelease(0.8, samples, 160, 390 / 3.5).inertia, false);
  assert.equal(
    navRelease(
      0.8,
      [
        { x: 200, t: 0 },
        { x: 110, t: 0 },
      ],
      0,
      390 / 3.5,
    ).inertia,
    false,
  );
  const reversed = navRelease(
    4.2,
    [
      { x: 300, t: 0 },
      { x: 100, t: 30 },
      { x: 140, t: 50 },
      { x: 180, t: 70 },
    ],
    70,
    390 / 3.5,
  );
  assert.equal(reversed.inertia, true);
  assert.ok(reversed.target < 4.2);
});

function flick(t, direction = -1) {
  t.pointer("pointerdown", 250, 20, { pointerType: "touch" });
  for (let i = 1; i <= 4; i++) {
    t.tick(16);
    t.pointer("pointermove", 250 + direction * 20 * i, 22, {
      pointerType: "touch",
    });
  }
  const released = t.nav.position;
  t.pointer("pointerup", 250 + direction * 80, 22, { pointerType: "touch" });
  return released;
}
test("inércia: continua após soltar, desacelera e atravessa as duas extremidades sem navegar", () => {
  for (const direction of [-1, 1]) {
    const t = setup();
    const released = flick(t, direction),
      positions = [released];
    const pending = () => assert.ok(t.frames.size <= 1);
    for (let i = 0; i < 8; i++) {
      t.tick(40);
      pending();
      positions.push(t.nav.position);
    }
    const deltas = positions
      .slice(1)
      .map((p, i) => circularDistance(p - positions[i], 5) * -direction);
    assert.ok(deltas[0] > 0);
    assert.ok(
      deltas.every(
        (d, i) => d >= -1e-9 && (i === 0 || d <= deltas[i - 1] + 1e-9),
      ),
    );
    t.finish();
    const travel = circularDistance(t.nav.position - released, 5) * -direction;
    assert.ok(travel > 0 && travel <= 1.5);
    assert.equal(Number.isInteger(t.nav.position), true);
    assert.equal(t.links[0].attrs["aria-current"], "page");
    assert.equal(t.click(), true);
    t.nav.dispose();
  }
});

test("inércia: novo toque interrompe imediatamente e não herda o impulso", () => {
  const t = setup();
  flick(t);
  t.tick(80);
  const caught = t.nav.position;
  t.pointer("pointerdown", 150, 20, { pointerType: "touch" });
  assert.equal(t.frames.size, 0);
  t.tick(100);
  assert.equal(t.nav.position, caught);
  t.pointer("pointerup", 150, 20, { pointerType: "touch" });
  assert.equal(t.click(), false);
  t.nav.setActive("treinos");
  t.finish();
  assert.equal(t.nav.position, 2);
  t.nav.dispose();
});

test("inércia: movimento reduzido e cancelamento dispensam a continuação; preferência dinâmica encerra quadros", () => {
  const reduced = setup({ reduced: true });
  flick(reduced);
  assert.equal(reduced.frames.size, 0);
  assert.equal(reduced.nav.position, 1);
  reduced.nav.dispose();
  const t = setup();
  t.pointer("pointerdown", 250, 20, { pointerType: "touch" });
  t.tick(20);
  t.pointer("pointermove", 210, 20, { pointerType: "touch" });
  t.tick(20);
  t.pointer("pointermove", 170, 20, { pointerType: "touch" });
  t.pointer("pointercancel", 170, 20, { pointerType: "touch" });
  assert.equal(t.frames.size, 0);
  assert.equal(t.nav.position, 1);
  flick(t);
  t.tick(40);
  t.preference.matches = true;
  t.preference.emit("change");
  assert.equal(t.frames.size, 0);
  assert.equal(Number.isInteger(t.nav.position), true);
  t.nav.dispose();
});
