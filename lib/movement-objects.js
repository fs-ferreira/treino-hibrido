import {
  identity,
  compose,
  axisAngle,
  transformPoint,
  length,
  distance,
  toScreen,
  cameraDepth,
} from "./movement-space.js";

/** @typedef {{position:number[], rotation:number[], role:string}} Anchor
 * @typedef {{id:string, type:string, parent?:string, transform:import('./movement-space.js').Transform, anchors:Object<string,Anchor>, geometry:object[], dimensions:object, layer:number}} EntityDefinition
 * Geometry and anchors stay in the entity's local frame. No geometry is fitted
 * to projected hand coordinates. A single transform moves the entire object.
 */
export function entity(id, type, options = {}) {
  return {
    id,
    type,
    transform: identity(),
    anchors: {},
    geometry: [],
    colliders: [],
    dimensions: {},
    layer: 0,
    ...options,
  };
}
export const anchor = (position, role = "grip", rotation = [0, 0, 0, 1]) => ({
  position,
  rotation,
  role,
});
export const stroke = (points, cls = "machine-frame") => ({
  shape: "path",
  points,
  cls,
});
export const polygon = (points, cls = "machine-pad") => ({
  shape: "polygon",
  points,
  cls,
});
export const disc = (center, radius, cls = "machine-pivot") => ({
  shape: "disc",
  center,
  radius,
  cls,
});
export const rectangle = (x, y, w, h, cls = "machine-pad") =>
  polygon(
    [
      [x, y, 0],
      [x + w, y, 0],
      [x + w, y + h, 0],
      [x, y + h, 0],
    ],
    cls,
  );
export const box = (x, y, z, w, h, d, cls = "load") =>
  [
    [
      [x, y, z],
      [x + w, y, z],
      [x + w, y + h, z],
      [x, y + h, z],
    ],
    [
      [x, y, z + d],
      [x + w, y, z + d],
      [x + w, y + h, z + d],
      [x, y + h, z + d],
    ],
    [
      [x, y, z],
      [x, y + h, z],
      [x, y + h, z + d],
      [x, y, z + d],
    ],
    [
      [x + w, y, z],
      [x + w, y + h, z],
      [x + w, y + h, z + d],
      [x + w, y, z + d],
    ],
    [
      [x, y + h, z],
      [x + w, y + h, z],
      [x + w, y + h, z + d],
      [x, y + h, z + d],
    ],
  ].map((p) => polygon(p, cls));

export function dumbbell(
  id,
  { length: span = 32, grip = [0, 0, 0], ...options } = {},
) {
  return entity(id, "dumbbell", {
    dimensions: { length: span },
    anchors: { grip: anchor(grip) },
    geometry: [
      stroke(
        [
          [-span / 2, 0, 0],
          [span / 2, 0, 0],
        ],
        "handle",
      ),
      ...box(-span / 2, -9, -9, 7, 18, 18),
      ...box(span / 2 - 7, -9, -9, 7, 18, 18),
    ],
    colliders: [
      { a: [-span / 2, 0, 0], b: [span / 2, 0, 0], radius: 2 },
      ...[-1, 1].map((sign) => ({
        a: [sign * (span / 2 - 3.5), 0, 0],
        b: [sign * (span / 2 - 3.5), 0, 0],
        radius: 9,
      })),
    ],
    ...options,
  });
}
export function bar(
  id,
  {
    length: span = 140,
    gripWidth = 80,
    ez = false,
    plates = true,
    bendEnds = false,
    ...options
  } = {},
) {
  const points = ez
    ? [
        [-span / 2, 0, 0],
        [-gripWidth / 2 - 8, 0, 0],
        [-gripWidth / 2 - 4, 3, 0],
        [-gripWidth / 2, 0, 0],
        [gripWidth / 2, 0, 0],
        [gripWidth / 2 + 4, 3, 0],
        [gripWidth / 2 + 8, 0, 0],
        [span / 2, 0, 0],
      ]
    : bendEnds
      ? [
          [-span / 2, -5, 0],
          [-span / 2 + 8, 0, 0],
          [span / 2 - 8, 0, 0],
          [span / 2, -5, 0],
        ]
      : [
          [-span / 2, 0, 0],
          [span / 2, 0, 0],
        ];
  return entity(id, ez ? "ez-bar" : "bar", {
    dimensions: { length: span, gripWidth },
    anchors: {
      left: anchor([-gripWidth / 2, 0, 0]),
      right: anchor([gripWidth / 2, 0, 0]),
      cable: anchor([0, 0, 0], "cable"),
    },
    geometry: [
      stroke(points, "handle"),
      ...(plates
        ? [
            ...box(-span / 2, -8, -8, 5, 16, 16),
            ...box(span / 2 - 5, -8, -8, 5, 16, 16),
          ]
        : []),
    ],
    colliders: points.slice(1).map((b, i) => ({ a: points[i], b, radius: 2 })),
    ...options,
  });
}
export function handle(id, { width = 16, ...options } = {}) {
  return entity(id, "handle", {
    dimensions: { width },
    anchors: { grip: anchor([0, 0, 0]), cable: anchor([0, 8, 0], "cable") },
    geometry: [
      stroke(
        [
          [-width / 2, 0, 0],
          [width / 2, 0, 0],
        ],
        "handle",
      ),
      stroke(
        [
          [-width / 2, 0, 0],
          [0, 8, 0],
          [width / 2, 0, 0],
        ],
        "cable",
      ),
    ],
    ...options,
  });
}
export function platform(id, { width = 32, depth = 24, ...options } = {}) {
  return entity(id, "platform", {
    dimensions: { width, depth },
    anchors: { support: anchor([0, 0, 0], "support") },
    geometry: box(-width / 2, -10, -depth / 2, width, 10, depth, "machine-pad"),
    ...options,
  });
}
export function pad(
  id,
  { width = 58, height = 10, depth = 24, ...options } = {},
) {
  return entity(id, "pad", {
    dimensions: { width, height, depth },
    anchors: { support: anchor([0, 0, 0], "support") },
    geometry: box(
      -width / 2,
      -height,
      -depth / 2,
      width,
      height,
      depth,
      "machine-pad",
    ),
    ...options,
  });
}
/** Base and seat are fixed. Backrest rotates about the seat junction. */
export function bench(
  id,
  {
    width = 60,
    backLength = 90,
    depth = 48,
    height = 50,
    incline = Math.PI / 2,
    ...options
  } = {},
) {
  const base = entity(id, "bench", {
    anchors: { seat: anchor([0, 0, 0], "support") },
    dimensions: { width, backLength, depth, height },
    geometry: [
      ...box(-width / 2, -10, -depth / 2, width, 10, depth, "machine-pad"),
      stroke([
        [-width * 0.35, -10, 0],
        [-width * 0.4, -height, 0],
        [width * 0.4, -height, 0],
        [width * 0.35, -10, 0],
      ]),
    ],
    ...options,
  });
  if (!backLength) return [base];
  const back = entity(`${id}.back`, "backrest", {
    parent: id,
    transform: {
      position: [-width / 2, 0, 0],
      rotation: axisAngle([0, 0, 1], incline),
    },
    anchors: { support: anchor([backLength / 2, 0, 0], "support") },
    dimensions: { length: backLength, depth },
    geometry: box(0, -10, -depth / 2, backLength, 10, depth, "machine-pad"),
  });
  return [base, back];
}
export function lever(id, { radius = 40, roller = true, ...options } = {}) {
  return entity(id, "lever", {
    dimensions: { radius },
    anchors: {
      pivot: anchor([0, 0, 0], "axis"),
      contact: anchor([radius, 0, 0], "contact"),
    },
    geometry: [
      stroke([
        [0, 0, 0],
        [radius, 0, 0],
      ]),
      disc([0, 0, 0], 4),
      ...(roller ? [rectangle(radius - 11, -7, 24, 14, "roller")] : []),
    ],
    ...options,
  });
}
export function pulley(id, { radius = 7, ...options } = {}) {
  return entity(id, "pulley", {
    dimensions: { radius },
    anchors: { axis: anchor([0, 0, 0], "axis") },
    geometry: [disc([0, 0, 0], radius, "pulley"), disc([0, 0, 0], 2)],
    ...options,
  });
}
export function tower(id, { height = 221, ...options } = {}) {
  return entity(id, "tower", {
    dimensions: { height },
    anchors: { rail: anchor([0, 0, 0], "slider") },
    geometry: [
      stroke([
        [0, 0, 0],
        [0, height, 0],
      ]),
      stroke([
        [-22, 0, 0],
        [22, 0, 0],
      ]),
    ],
    ...options,
  });
}
export function weightStack(id, options = {}) {
  return entity(id, "weight-stack", {
    dimensions: { width: 24, height: 46 },
    anchors: { cable: anchor([0, 46, 0], "cable") },
    geometry: [
      rectangle(-12, 0, 24, 46),
      ...[9, 18, 27, 36].map((y) =>
        stroke(
          [
            [-10, y, 0],
            [10, y, 0],
          ],
          "plate-line",
        ),
      ),
    ],
    ...options,
  });
}

/** Resolve hierarchy with cycle/missing-parent detection; definitions are reusable. */
export function resolveEntities(definitions) {
  const lookup = new Map(),
    resolved = new Map(),
    visiting = new Set();
  for (const d of definitions) {
    if (lookup.has(d.id)) throw new Error(`Duplicate entity ${d.id}`);
    lookup.set(d.id, d);
  }
  function resolve(id) {
    if (resolved.has(id)) return resolved.get(id);
    const d = lookup.get(id);
    if (!d) throw new Error(`Missing entity ${id}`);
    if (visiting.has(id)) throw new Error(`Cyclic entity ${id}`);
    visiting.add(id);
    const world = d.parent
      ? compose(resolve(d.parent).world, d.transform)
      : d.transform;
    if (
      ![...world.position, ...world.rotation].every(Number.isFinite) ||
      Math.abs(length(world.rotation) - 1) > 1e-6
    )
      throw new Error(`Invalid transform ${id}`);
    const result = {
      ...d,
      world,
      worldAnchors: Object.fromEntries(
        Object.entries(d.anchors).map(([name, a]) => [
          name,
          { ...compose(world, a), role: a.role },
        ]),
      ),
    };
    visiting.delete(id);
    resolved.set(id, result);
    return result;
  }
  return definitions.map((d) => resolve(d.id));
}

const fmt = (p) => p.map((n) => Number(n.toFixed(3))).join(",");
/** Renderer knows geometry, projection and layers, never exercise kinds. */
export function renderEntities(entities, camera) {
  return entities
    .filter((e) => !e.hidden)
    .map((e, index) => ({
      e,
      index,
      depth: cameraDepth(e.world.position, camera),
    }))
    .sort(
      (a, b) => a.e.layer - b.e.layer || a.depth - b.depth || a.index - b.index,
    )
    .map(({ e }) => {
      const project = (p) => toScreen(transformPoint(e.world, p), camera);
      const markup = e.geometry
        .map((g) => {
          if (g.shape === "disc") {
            const points = Array.from({ length: 32 }, (_, i) => [
              g.center[0] + g.radius * Math.cos((i * Math.PI) / 16),
              g.center[1] + g.radius * Math.sin((i * Math.PI) / 16),
              g.center[2],
            ]);
            return `<path class="${g.cls}" d="M${points.map((p) => fmt(project(p))).join("L")}Z"/>`;
          }
          return `<path class="${g.cls}" d="M${g.points.map((p) => fmt(project(p))).join("L")}${g.shape === "polygon" ? "Z" : ""}"/>`;
        })
        .join("");
      return `<g data-entity="${e.id}" data-object="${e.type}">${markup}</g>`;
    })
    .join("");
}

export function rigidErrors(entities) {
  return entities.flatMap((e) => {
    if (e.type !== "lever") return [];
    const error = Math.abs(
      distance(e.worldAnchors.pivot.position, e.worldAnchors.contact.position) -
        e.dimensions.radius,
    );
    return error > 1e-6 ? [{ id: e.id, type: "rigidity", error }] : [];
  });
}
