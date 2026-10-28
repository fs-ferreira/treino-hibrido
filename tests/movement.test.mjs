import test from "node:test";
import assert from "node:assert/strict";
import { movements } from "../lib/movement-data.js";
import { exercises } from "../lib/exercises.js";
import {
  rigAt,
  poseAt,
  drawMovement,
  illustration,
  solveJoint,
} from "../lib/diagrams.js";
import { BONES, norm, sub, sagittalFoot } from "../lib/movement-anatomy.js";
import { cyclePose, createMovementPlayer } from "../lib/movement-player.js";
const close = (a, b, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const jointAngle = ([root, joint, end]) => {
  const a = sub(root, joint),
    b = sub(end, joint);
  return (
    (Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          a.reduce((s, v, i) => s + v * b[i], 0) / (norm(a) * norm(b)),
        ),
      ),
    ) *
      180) /
    Math.PI
  );
};
test("21 movimentos: posições finitas, enquadradas e distintas em toda a sequência", () => {
  assert.equal(Object.keys(movements).length, 21);
  for (const ex of Object.values(exercises)) {
    assert.equal(movements[ex.diagram].poses.length, 3);
    assert.notDeepEqual(rigAt(ex.diagram, 0), rigAt(ex.diagram, 1));
    for (let i = 0; i <= 100; i++) {
      const r = rigAt(ex.diagram, i / 100);
      for (const p of [
        r.hip,
        r.shoulder,
        r.head,
        ...r.nearArm,
        ...r.farArm,
        ...r.nearLeg,
        ...r.farLeg,
        ...r.feet.flatMap((f) => f.outline),
      ]) {
        assert.ok(p.every(Number.isFinite));
        assert.ok(
          p[0] > 10 && p[0] < 340 && p[1] > 35 && p[1] < 282,
          `${ex.diagram}: ${p}`,
        );
      }
      assert.doesNotMatch(
        drawMovement(ex.diagram, i / 100, "test"),
        /NaN|Infinity|undefined/,
      );
    }
  }
});
test("um único conjunto de proporções em todos os exercícios, inclusive projeções em profundidade", () => {
  for (const kind of Object.keys(movements))
    for (let i = 0; i <= 100; i++) {
      const r = rigAt(kind, i / 100);
      for (const side of ["near", "far"]) {
        const a = r.world[`${side}Arm`],
          l = r.world[`${side}Leg`];
        close(norm(sub(a[1], a[0])), BONES.upperArm);
        close(norm(sub(a[2], a[1])), BONES.forearm);
        close(norm(sub(l[1], l[0])), BONES.thigh);
        close(norm(sub(l[2], l[1])), BONES.shin);
      }
    }
});
test("joelhos dobram no sentido anatômico e cotovelos não excedem a extensão", () => {
  for (const [kind, c] of Object.entries(movements))
    for (let i = 0; i <= 100; i++) {
      const r = rigAt(kind, i / 100);
      for (const side of ["near", "far"]) {
        const leg = r.world[`${side}Leg`],
          arm = r.world[`${side}Arm`];
        assert.ok(
          jointAngle(leg) >= 65 && jointAngle(leg) <= 180,
          `${kind}: joelho`,
        );
        assert.ok(
          jointAngle(arm) >= 35 && jointAngle(arm) <= 180,
          `${kind}: cotovelo`,
        );
        if (!r.front) {
          const a = sub(leg[1], leg[0]),
            b = sub(leg[2], leg[1]);
          assert.ok(
            c.facing * (a[0] * b[1] - a[1] * b[0]) >= -1e-7,
            `${kind}: joelho invertido`,
          );
        }
      }
    }
});
test("joelhos nas vistas frontais flexionam para a frente em vez de criar valgo lateral", () => {
  for (const kind of ["lateral", "cablefly", "pushdown"])
    for (let i = 0; i <= 100; i++)
      for (const side of ["near", "far"]) {
        const [hip, knee, ankle] = rigAt(kind, i / 100).world[`${side}Leg`];
        const along = (knee[1] - hip[1]) / (ankle[1] - hip[1]);
        close((knee[0] - hip[0]) / (ankle[0] - hip[0]), along);
        assert.ok(knee[2] > hip[2] + (ankle[2] - hip[2]) * along);
      }
});
test("solas continuam para baixo ao espelhar a pessoa, com pés frontais simétricos", () => {
  const right = sagittalFoot([0, 0], 0),
    left = sagittalFoot([0, 0], 180, false, -1);
  right.outline.forEach((p, i) => {
    close(p[0], -left.outline[i][0]);
    close(p[1], left.outline[i][1]);
  });
  for (const kind of ["hinge", "split", "bentrow", "incline"])
    for (let i = 0; i <= 100; i++) {
      const f = rigAt(kind, i / 100).feet[0];
      close(f.heel[1], 267);
      close(f.ball[1], 267);
      close(f.toe[1], 267);
    }
  for (const kind of ["fly", "pulldown", "press", "lateral", "adductor"]) {
    const r = rigAt(kind, 0.5);
    assert.ok(r.feet[0].toe[0] > r.feet[0].ankle[0]);
    assert.ok(r.feet[1].toe[0] < r.feet[1].ankle[0]);
  }
});
test("tornozelos da flexora e extensora acompanham a canela sem girar o sapato para trás", () => {
  for (const kind of ["extension", "legcurl", "reverse"])
    for (let i = 0; i <= 100; i++) {
      const r = rigAt(kind, i / 100),
        shin = sub(r.nearLeg[2], r.nearLeg[1]),
        direction = (Math.atan2(shin[1], shin[0]) * 180) / Math.PI;
      close(r.feet[0].angle, direction - movements[kind].facing * 90);
    }
});
test("panturrilhas: antepé e dedos na plataforma, calcanhar sobe e perna conserva os segmentos", () => {
  for (const kind of ["calf", "calfseated"]) {
    const initial = rigAt(kind, 0),
      end = rigAt(kind, 1);
    assert.ok(end.feet[0].heel[1] < initial.feet[0].heel[1] - 10);
    for (let i = 0; i <= 100; i++) {
      const r = rigAt(kind, i / 100);
      for (const side of [0, 1]) {
        assert.deepEqual(r.feet[side].ball, initial.feet[side].ball);
        assert.deepEqual(r.feet[side].toe, initial.feet[side].toe);
      }
      if (kind === "calf")
        close(jointAngle(r.world.nearLeg), jointAngle(initial.world.nearLeg));
    }
  }
});
test("apoios, mãos e barras respeitam os pontos de contato", () => {
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    for (const kind of ["hinge", "split", "bentrow", "incline"])
      assert.deepEqual(rigAt(kind, t).nearLeg[2], movements[kind].anchor);
    const split = rigAt("split", t);
    assert.deepEqual(split.farLeg[2], movements.split.backAnchor);
    close(split.feet[1].dorsum[1], rigAt("split", 0).feet[1].dorsum[1]);
    const lat = rigAt("pulldown", t);
    close(lat.grips[0][0] - lat.grips[1][0], 106);
    close(lat.grips[0][1], lat.grips[1][1]);
    for (const kind of [
      "incline",
      "row",
      "bentrow",
      "pulldown",
      "calf",
      "reverse",
    ]) {
      const r = rigAt(kind, t);
      // A wrist may articulate independently of the forearm when both hands
      // hold a rigid bar. Palm length is measured before projection.
      for (const [side, index] of [
        ["near", 0],
        ["far", 1],
      ])
        close(
          norm(sub(r.hands[index].worldGrip, r.hands[index].worldWrist)),
          BONES.palm,
        );
    }
    const rev = rigAt("reverse", t);
    assert.deepEqual(rev.shoulder, [111, 196]);
    close(jointAngle(rev.world.nearLeg), 90);
    close(rev.pose.legs[0] + rev.pose.pelvis, -75);
  }
});
test("não alonga membros silenciosamente quando um alvo está fora de alcance", () => {
  assert.throws(() => solveJoint([0, 0], [90, 0], 33, 30), /Unreachable/);
});
test("SVGs têm IDs próprios, descrições e referências acessíveis sem colisões", () => {
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
test("ciclo e ângulo do francês continuam sem saltos", () => {
  assert.equal(cyclePose(0), 0);
  close(cyclePose(1500), 0.5);
  assert.equal(cyclePose(3000), 1);
  assert.equal(cyclePose(6000), 0);
  let a = poseAt("overhead", 0).arms[1];
  for (let i = 1; i <= 100; i++) {
    const b = poseAt("overhead", i / 100).arms[1];
    assert.ok(b > a && b - a < 3);
    a = b;
  }
});

test("cabeça orientada com a coluna em decúbito, inclinação e flexão", () => {
  for (const [kind, rotation, facing] of [
    ["hinge", -80, -1],
    ["legcurl", 270, -1],
    ["reverse", 270, 1],
    ["incline", -55, 1],
    ["crunch", 40, 1],
  ]) {
    const markup = drawMovement(kind, 1, "head-check");
    assert.ok(markup.includes(`rotate(${rotation}) scale(${facing} 1)`), kind);
  }
});
test("pés das vistas frontais compartilham o mesmo plano físico de apoio", () => {
  for (const [kind, c] of Object.entries(movements))
    if (c.view === "front")
      for (let i = 0; i <= 100; i++) {
        const { nearLeg, farLeg } = rigAt(kind, i / 100).world;
        close(nearLeg[2][1], farLeg[2][1]);
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
