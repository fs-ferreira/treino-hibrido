import {
  vadd,
  vsub,
  scale,
  dot,
  cross,
  length,
  normalize,
  perpendicular,
  distance,
  clamp,
  bisect,
} from "./movement-space.js";

/** Tangent/arc/tangent route around one ideal, swivelling pulley. The selected
 * plane contains both endpoints and the axle centre. The winding is selected
 * geometrically on every evaluation, so scrubbing does not depend on history.
 */
export function wrappedCable(start, center, end, radius = 7) {
  const a = vsub(start, center),
    b = vsub(end, center),
    da = length(a),
    db = length(b);
  if (!(radius > 0) || da <= radius || db <= radius)
    throw new RangeError("Cable endpoint inside pulley");
  const u = normalize(a),
    normal = cross(a, b);
  const n = length(normal) < 1e-9 ? perpendicular(u) : normalize(normal),
    v = normalize(cross(n, u));
  const endAngle = Math.atan2(dot(b, v), dot(b, u)),
    alpha = Math.acos(radius / da),
    beta = Math.acos(radius / db);
  let best;
  for (const sa of [-1, 1])
    for (const sb of [-1, 1])
      for (const winding of [-1, 1]) {
        const entry = sa * alpha,
          exit = endAngle + sb * beta;
        const p = (angle) =>
          vadd(
            center,
            vadd(
              scale(u, radius * Math.cos(angle)),
              scale(v, radius * Math.sin(angle)),
            ),
          );
        const tangent = (angle) =>
          scale(
            vadd(scale(u, -Math.sin(angle)), scale(v, Math.cos(angle))),
            winding,
          );
        const pa = p(entry),
          pb = p(exit);
        if (
          dot(tangent(entry), normalize(vsub(pa, start))) < 0.999 ||
          dot(tangent(exit), normalize(vsub(end, pb))) < 0.999
        )
          continue;
        const sweep =
          (((winding * (exit - entry)) % (2 * Math.PI)) + 2 * Math.PI) %
          (2 * Math.PI);
        const arcLength = radius * sweep,
          routeLength =
            Math.sqrt(da * da - radius * radius) +
            arcLength +
            Math.sqrt(db * db - radius * radius);
        const arc = Array.from({ length: 25 }, (_, i) =>
          p(entry + (winding * sweep * i) / 24),
        );
        const result = {
          length: routeLength,
          arcLength,
          radius,
          center,
          entry: pa,
          exit: pb,
          points: [start, ...arc, end],
          normal: n,
          sweep,
          winding,
        };
        if (!best || result.length < best.length) best = result;
      }
  if (!best) throw new RangeError("No tangent cable route");
  return best;
}

/** Ideal transmission: external route + N supporting strands = constant.
 * ratio counts supporting strands (1:1 / 2:1). Stack/strand endpoints are real
 * geometry, included in the measured total, not a decorative animation curve.
 */
export function cableTransmission({
  start,
  guide,
  port,
  restLength,
  ratio = 1,
  travel = 115,
  radius = 7,
}) {
  if (![1, 2].includes(ratio)) throw new RangeError("Unsupported cable ratio");
  const route = wrappedCable(start, guide, port, radius),
    lift = (route.length + ratio * travel - restLength) / ratio;
  if (lift < -1e-6 || lift > travel + 1e-6)
    throw new RangeError(`Cable slider outside travel: ${lift}`);
  const y = port[1] - travel + lift;
  const strands = Array.from({ length: ratio }, (_, i) => {
    const x = port[0] + (ratio === 2 ? (i ? 7 : -7) : 0);
    return [
      [x, port[1], port[2]],
      [x, y, port[2]],
    ];
  });
  const movingArc =
    ratio === 2
      ? Array.from({ length: 25 }, (_, i) => [
          port[0] - 7 * Math.cos((Math.PI * i) / 24),
          y - 7 * Math.sin((Math.PI * i) / 24),
          port[2],
        ])
      : [];
  // A half-turn around the travelling sheave adds the constant 7π length.
  const constantArc = ratio === 2 ? 7 * Math.PI : 0;
  return {
    route,
    lift,
    ratio,
    travel,
    strands,
    movingArc,
    stack: [port[0], y - 46 - (ratio === 2 ? 7 : 0), port[2]],
    length:
      route.length +
      strands.reduce((s, [a, b]) => s + distance(a, b), 0) +
      constantArc,
    restLength: restLength + constantArc,
    error: route.length + ratio * (travel - lift) - restLength,
  };
}

/** Both rope branches have the same fixed length, with a junction on the
 * perpendicular bisector, toward the cable guide. No branch can stretch.
 */
export function ropeJunction(left, right, branchLength, toward) {
  const midpoint = scale(vadd(left, right), 0.5),
    separation = distance(left, right) / 2;
  if (separation >= branchLength)
    throw new RangeError("Unreachable rope branches");
  const axis = normalize(vsub(right, left)),
    desired = vsub(toward, midpoint),
    planar = vsub(desired, scale(axis, dot(axis, desired)));
  const up = length(planar) < 1e-9 ? perpendicular(axis) : normalize(planar);
  return vadd(
    midpoint,
    scale(up, Math.sqrt(branchLength * branchLength - separation * separation)),
  );
}

/** Couple a fixed-radius pad to a point on the supported thigh. The point is
 * allowed to slide along the contact surface, not away from it.
 */
export function thighLeverContact(hip, knee, pivot, radius, offset = 9) {
  const point = (u) => {
    const p = vadd(hip, scale(vsub(knee, hip), u));
    return vadd(p, [0, offset, 0]);
  };
  const u = bisect((u) => distance(point(u), pivot) - radius, 0.4, 0.98);
  return { position: point(u), fraction: u };
}

export function segmentDistance(p, a, b) {
  const d = vsub(b, a),
    squared = dot(d, d);
  return distance(
    p,
    vadd(
      a,
      scale(d, squared < 1e-12 ? 0 : clamp(dot(vsub(p, a), d) / squared, 0, 1)),
    ),
  );
}

/** Closest distance of two finite capsule axes, including parallel axes. */
export function segmentSeparation(p1, q1, p2, q2) {
  const d1 = vsub(q1, p1),
    d2 = vsub(q2, p2),
    r = vsub(p1, p2),
    a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r);
  let s = 0,
    t = 0;
  if (a < 1e-12 && e < 1e-12) return distance(p1, p2);
  if (a < 1e-12) t = clamp(f / e, 0, 1);
  else {
    const c = dot(d1, r);
    if (e < 1e-12) s = clamp(-c / a, 0, 1);
    else {
      const b = dot(d1, d2),
        den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return distance(vadd(p1, scale(d1, s)), vadd(p2, scale(d2, t)));
}
