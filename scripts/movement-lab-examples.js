import {
  entity,
  stroke,
  anchor,
  dumbbell,
  bar,
  bench,
  platform,
  lever,
  pulley,
  tower,
  weightStack,
  resolveEntities,
  rigidErrors,
  renderEntities,
} from "../lib/movement-objects.js";
import {
  axisAngle,
  compose,
  distance,
  fromTo,
  transformPoint,
  toScreen,
} from "../lib/movement-space.js";
import {
  wrappedCable,
  cableTransmission,
  ropeJunction,
} from "../lib/movement-mechanisms.js";

export const objectExamples = {
  dumbbell: "Halter rígido",
  bar: "Barra e duas pegadas",
  bench: "Banco articulado",
  platform: "Plataforma",
  lever: "Alavanca e eixo",
  cable1: "Polia — transmissão 1:1",
  cable2: "Polia — transmissão 2:1",
  rope: "Corda com dois ramos",
};
export function evaluateObjectDemo(kind, t) {
  if (!Number.isFinite(t) || t < 0 || t > 1 || !objectExamples[kind])
    throw new RangeError("Invalid object example");
  const defs = [],
    constraints = [],
    camera = { depth: 0.16 },
    pose = {
      position: [180, 135, 0],
      rotation: axisAngle([0, 0, 1], -0.5 + t),
    };
  if (kind === "dumbbell")
    defs.push(
      dumbbell("example.load", {
        transform: {
          position: [180, 135, 0],
          rotation: compose(pose, {
            position: [0, 0, 0],
            rotation: axisAngle([0, 1, 0], t * Math.PI),
          }).rotation,
        },
      }),
    );
  if (kind === "bar")
    defs.push(bar("example.bar", { gripWidth: 80, transform: pose }));
  if (kind === "bench")
    defs.push(
      ...bench("example.bench", {
        incline: Math.PI * (0.35 + 0.35 * t),
        transform: { position: [190, 80, 0], rotation: [0, 0, 0, 1] },
      }),
    );
  if (kind === "platform")
    defs.push(platform("example.platform", { width: 90, transform: pose }));
  if (kind === "lever")
    defs.push(
      lever("example.lever", {
        radius: 65,
        transform: { ...pose, rotation: axisAngle([0, 0, 1], -0.8 + t * 1.6) },
      }),
    );
  if (kind.startsWith("cable")) {
    const ratio = kind === "cable2" ? 2 : 1,
      start = [145, 180 - 85 * t, 0],
      guide = [145, 220, 0],
      port = [280, 220, 0],
      travel = 110,
      restLength =
        wrappedCable([145, 180, 0], guide, port).length + ratio * travel;
    const circuit = cableTransmission({
      start,
      guide,
      port,
      ratio,
      travel,
      restLength,
    });
    defs.push(
      tower("example.tower", {
        transform: { position: [280, 3, 0], rotation: [0, 0, 0, 1] },
      }),
      pulley("example.pulley", {
        transform: {
          position: guide,
          rotation: fromTo([0, 0, 1], circuit.route.normal),
        },
      }),
      weightStack("example.weights", {
        transform: { position: circuit.stack, rotation: [0, 0, 0, 1] },
      }),
      entity("example.cable", "cable", {
        geometry: [
          stroke(circuit.route.points, "cable"),
          ...circuit.strands.map((s) => stroke(s, "cable")),
          ...(circuit.movingArc.length
            ? [stroke(circuit.movingArc, "cable")]
            : []),
        ],
      }),
      bar("example.handle", {
        length: 50,
        gripWidth: 30,
        plates: false,
        transform: { position: start, rotation: [0, 0, 0, 1] },
      }),
    );
    if (ratio === 2)
      defs.push(
        pulley("example.moving-pulley", {
          transform: {
            position: [port[0], port[1] - travel + circuit.lift, 0],
            rotation: [0, 0, 0, 1],
          },
        }),
      );
    constraints.push({
      id: "cable-length",
      error: Math.abs(circuit.length - circuit.restLength),
      lift: circuit.lift,
      ratio,
    });
  }
  if (kind === "rope") {
    const a = [150 - t * 5, 130 - t * 35, 0],
      b = [210 + t * 5, 130 - t * 35, 0],
      junction = ropeJunction(a, b, 50, [180, 224, 0]);
    defs.push(
      entity("example.rope", "rope", {
        anchors: {
          left: anchor(a),
          right: anchor(b),
          cable: anchor(junction, "cable"),
        },
        geometry: [
          stroke([a, junction, b], "rope"),
          stroke([junction, [180, 224, 0]], "cable"),
        ],
        dimensions: { branchLength: 50 },
      }),
    );
    constraints.push(
      { id: "rope.left", error: Math.abs(distance(a, junction) - 50) },
      { id: "rope.right", error: Math.abs(distance(b, junction) - 50) },
    );
  }
  const entities = resolveEntities(defs),
    diagnostics = [
      ...rigidErrors(entities),
      ...constraints.filter((c) => c.error > 1e-6),
    ];
  return { entities, camera, constraints, diagnostics };
}
export function drawObjectDemo(frame, prefix, debug = {}) {
  // Reuse evaluated geometry, including the same anchors seen in exercises.
  let markup = renderEntities(frame.entities, frame.camera);
  if (debug.anchors)
    for (const e of frame.entities)
      for (const a of Object.values(e.worldAnchors)) {
        const [x, y, z] = a.position;
        markup += `<circle cx="${x}" cy="${267 - y + frame.camera.depth * z}" r="3" fill="#79dfe5"/>`;
      }
  if (debug.axes)
    for (const e of frame.entities)
      for (const [axis, color] of [
        [[12, 0, 0], "#f99"],
        [[0, 12, 0], "#c3f969"],
        [[0, 0, 12], "#79dfe5"],
      ]) {
        const a = toScreen(e.world.position, frame.camera),
          b = toScreen(transformPoint(e.world, axis), frame.camera);
        markup += `<path d="M${a.join(",")}L${b.join(",")}" stroke="${color}"/>`;
      }
  return `<svg class="exercise-figure" viewBox="0 0 360 310" role="img" aria-labelledby="${prefix}-title"><title id="${prefix}-title">Objeto ou mecanismo isolado</title>${markup}</svg>`;
}
