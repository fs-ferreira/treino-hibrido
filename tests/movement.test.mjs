import test from "node:test";
import assert from "node:assert/strict";
import { movements } from "../lib/movement-data.js";
import { exercises } from "../lib/exercises.js";
import { rigAt, poseAt, drawMovement, illustration } from "../lib/diagrams.js";
import { cyclePose, createMovementPlayer } from "../lib/movement-player.js";
const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
test("21 movimentos têm três poses válidas, enquadradas e distintas", () => {
  for (const exercise of Object.values(exercises)) {
    const kind = exercise.diagram,
      config = movements[kind];
    assert.equal(config.poses.length, 3, kind);
    assert.notDeepEqual(rigAt(kind, 0), rigAt(kind, 1), kind);
    for (let i = 0; i <= 40; i++) {
      const r = rigAt(kind, i / 40);
      for (const p of [
        r.hip,
        r.shoulder,
        r.head,
        ...r.nearArm,
        ...r.farArm,
        ...r.nearLeg,
        ...r.farLeg,
      ]) {
        assert.ok(p.every(Number.isFinite), `${kind}: coordenada finita`);
        assert.ok(
          p[0] > 10 && p[0] < 340 && p[1] > 35 && p[1] < 280,
          `${kind}: ${p}`,
        );
      }
      assert.doesNotMatch(
        drawMovement(kind, i / 40, "test"),
        /NaN|Infinity|undefined/,
      );
    }
  }
});
test("segmentos rígidos conservam comprimento durante a interpolação", () => {
  for (const kind of Object.keys(movements)) {
    // Frontal fly/adduction use projection in depth; screen lengths shorten.
    if (["fly", "cablefly", "adductor"].includes(kind)) continue;
    const initial = rigAt(kind, 0);
    for (let i = 1; i <= 40; i++) {
      const current = rigAt(kind, i / 40);
      for (const limb of ["nearArm", "farArm", "nearLeg", "farLeg"])
        for (let j = 0; j < 2; j++)
          assert.ok(
            Math.abs(
              length(initial[limb][j], initial[limb][j + 1]) -
                length(current[limb][j], current[limb][j + 1]),
            ) < 0.001,
            `${kind} ${limb} ${j}`,
          );
    }
  }
});
test("apoios e largura da barra permanecem fixos", () => {
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    for (const kind of ["hinge", "split"])
      assert.deepEqual(rigAt(kind, t).nearLeg[2], movements[kind].anchor);
    assert.deepEqual(rigAt("split", t).farLeg[2], movements.split.backAnchor);
    assert.deepEqual(rigAt("calf", t).feet[0], [214, 253]);
    assert.deepEqual(rigAt("calfseated", t).feet[0], [210, 253]);
    assert.deepEqual(rigAt("reverse", t).shoulder, [110, 190]);
    const lat = rigAt("pulldown", t);
    assert.equal(lat.nearArm[2][0] - lat.farArm[2][0], 110);
  }
});
test("SVGs repetidos têm IDs únicos e descrições ligadas à instância", () => {
  const markup = Object.values(exercises)
    .flatMap((e) => [illustration(e), illustration(e)])
    .join("");
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of markup.matchAll(/aria-labelledby="([^"]+)"/g))
    for (const id of match[1].split(" ")) assert.ok(ids.includes(id));
  for (const match of markup.matchAll(/url\(#([^)]+)\)/g))
    assert.ok(ids.includes(match[1]));
});
test("ciclo de seis segundos e francês sem salto de ângulo", () => {
  assert.equal(cyclePose(0), 0);
  assert.ok(Math.abs(cyclePose(1500) - 0.5) < 1e-10);
  assert.equal(cyclePose(3000), 1);
  assert.equal(cyclePose(6000), 0);
  assert.equal(cyclePose(9000), 0);
  let angle = poseAt("overhead", 0).arms[1];
  for (let i = 1; i <= 40; i++) {
    const next = poseAt("overhead", i / 40).arms[1];
    assert.ok(next >= angle && next - angle < 5);
    angle = next;
  }
});
function harness(reduce = false) {
  const listeners = new Map(),
    elements = new Map(),
    queue = new Map();
  let n = 0;
  const root = {
    dataset: { movement: "incline", movementId: "unit" },
    querySelector(s) {
      if (!elements.has(s))
        elements.set(s, {
          hidden: false,
          disabled: false,
          textContent: "",
          innerHTML: "",
          attributes: {},
          setAttribute(k, v) {
            this.attributes[k] = v;
          },
        });
      return elements.get(s);
    },
    addEventListener(k, f) {
      listeners.set(k, f);
    },
    removeEventListener(k) {
      listeners.delete(k);
    },
  };
  const preference = {
    matches: reduce,
    addEventListener(k, f) {
      this.change = f;
    },
    removeEventListener() {
      this.change = null;
    },
  };
  const doc = {
    hidden: false,
    addEventListener(k, f) {
      this.change = f;
    },
    removeEventListener() {
      this.change = null;
    },
  };
  const dispose = createMovementPlayer(root, {
    preference,
    document: doc,
    request(f) {
      queue.set(++n, f);
      return n;
    },
    cancel(id) {
      queue.delete(id);
    },
  });
  return {
    root,
    preference,
    doc,
    queue,
    dispose,
    get: (s) => root.querySelector(s),
    click(action) {
      listeners.get("click")?.({
        target: {
          closest() {
            return { dataset: { motion: action } };
          },
        },
      });
    },
    step(time) {
      const frames = [...queue.values()];
      queue.clear();
      frames.forEach((f) => f(time));
    },
  };
}
test("player pausa, retoma, conclui uma vez e libera recursos ao fechar", () => {
  const h = harness();
  assert.equal(h.queue.size, 0);
  h.click("open");
  h.click("play");
  h.step(0);
  h.step(1000);
  const drawing = h.get(".motion-stage").innerHTML;
  h.click("pause");
  assert.equal(h.queue.size, 0);
  assert.equal(h.get(".motion-status").textContent, "Pausado");
  h.step(2000);
  assert.equal(h.get(".motion-stage").innerHTML, drawing);
  h.click("play");
  h.step(2000);
  h.step(7000);
  assert.equal(h.queue.size, 0);
  assert.match(h.get(".motion-status").textContent, /concluído/);
  h.click("play");
  h.step(8000);
  h.dispose();
  assert.equal(h.queue.size, 0);
  assert.equal(h.preference.change, null);
  assert.equal(h.doc.change, null);
});
test("movimento reduzido oferece etapas e não inicia animação", () => {
  const h = harness(true);
  h.click("open");
  assert.equal(h.get(".motion-controls").hidden, true);
  h.click("play");
  assert.equal(h.queue.size, 0);
  h.click("end");
  assert.equal(h.get(".motion-status").textContent, "Final");
  h.click("middle");
  assert.equal(h.get(".motion-status").textContent, "Meio");
  h.click("reset");
  assert.equal(h.get(".motion-status").textContent, "Início");
  h.dispose();
});
test("preferência reduzida e aba oculta interrompem reprodução", () => {
  const h = harness();
  h.click("open");
  h.click("play");
  h.doc.hidden = true;
  h.doc.change();
  assert.equal(h.queue.size, 0);
  h.click("play");
  h.preference.matches = true;
  h.preference.change();
  assert.equal(h.queue.size, 0);
  assert.equal(h.get(".motion-controls").hidden, true);
  h.dispose();
});
