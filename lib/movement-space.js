/** Geometry shared by the rig, equipment and validation. World: x right, y up,
 * z toward the viewer. Distances use the original drawing units; angles radians.
 * Quaternions are [x, y, z, w]. No function depends on a previous animation frame.
 * @typedef {[number, number, number]} Vec3
 * @typedef {[number, number, number, number]} Quat
 * @typedef {{position: Vec3, rotation: Quat}} Transform
 */
export const EPSILON = 1e-9;
export const vadd = (a, b) => a.map((n, i) => n + b[i]);
export const vsub = (a, b) => a.map((n, i) => n - b[i]);
export const scale = (a, n) => a.map((v) => v * n);
export const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.hypot(...a);
export const distance = (a, b) => length(vsub(a, b));
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function normalize(a) {
  const n = length(a);
  if (!Number.isFinite(n) || n < EPSILON)
    throw new RangeError("Zero or invalid direction");
  return scale(a, 1 / n);
}
export function perpendicular(axis) {
  const basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].sort((a, b) => Math.abs(dot(a, axis)) - Math.abs(dot(b, axis)))[0];
  return normalize(vsub(basis, scale(axis, dot(basis, axis))));
}
export const identity = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
export function axisAngle(axis, angle) {
  const a = normalize(axis),
    s = Math.sin(angle / 2);
  return [...scale(a, s), Math.cos(angle / 2)];
}
export function multiply(a, b) {
  const [x, y, z, w] = a,
    [u, v, s, t] = b;
  return [
    w * u + x * t + y * s - z * v,
    w * v - x * s + y * t + z * u,
    w * s + x * v - y * u + z * t,
    w * t - x * u - y * v - z * s,
  ];
}
export function rotate(q, v) {
  const u = q.slice(0, 3),
    uv = cross(u, v),
    uuv = cross(u, uv);
  return vadd(v, vadd(scale(uv, 2 * q[3]), scale(uuv, 2)));
}
export const conjugate = (q) => [-q[0], -q[1], -q[2], q[3]];
export function fromTo(a, b) {
  a = normalize(a);
  b = normalize(b);
  const d = clamp(dot(a, b), -1, 1);
  if (d < -1 + EPSILON) return axisAngle(perpendicular(a), Math.PI);
  return normalize([...cross(a, b), 1 + d]);
}
export function slerp(a, b, t) {
  let d = dot(a, b);
  if (d < 0) {
    b = scale(b, -1);
    d = -d;
  }
  if (d > 0.9995) return normalize(a.map((n, i) => n + (b[i] - n) * t));
  const angle = Math.acos(clamp(d, -1, 1)),
    s = Math.sin(angle);
  return a.map(
    (n, i) => (n * Math.sin((1 - t) * angle) + b[i] * Math.sin(t * angle)) / s,
  );
}
export const quaternionAngle = (a, b) =>
  2 * Math.acos(clamp(Math.abs(dot(a, b)), 0, 1));
export const transformPoint = (frame, p) =>
  vadd(frame.position, rotate(frame.rotation, p));
export const inversePoint = (frame, p) =>
  rotate(conjugate(frame.rotation), vsub(p, frame.position));
export function compose(parent, child) {
  return {
    position: transformPoint(parent, child.position),
    rotation: multiply(parent.rotation, child.rotation),
  };
}
export function relativeTo(parent, world) {
  return {
    position: inversePoint(parent, world.position),
    rotation: multiply(conjugate(parent.rotation), world.rotation),
  };
}
/** An orientation with local Y along a bone and independent axial rotation. */
export const orient = (direction, twist = 0) =>
  multiply(fromTo([0, 1, 0], direction), axisAngle([0, 1, 0], twist));
export const fromScreen = ([x, y, z = 0]) => [x, 267 - y, z];
export const toScreen = ([x, y, z = 0], camera = {}) => [
  x,
  267 - y + (camera.depth ?? 0) * z,
];
export const cameraDepth = (p, camera = {}) =>
  p[2] - (camera.depth ?? 0) * p[1];

/** Exact, non-stretching two-bone IK. Pole degeneracies use a stable rest axis. */
export function twoBone(root, target, upper, lower, pole = [0, 0, 1]) {
  const delta = vsub(target, root),
    d = length(delta);
  if (
    !(upper > 0 && lower > 0) ||
    !Number.isFinite(d) ||
    d < EPSILON ||
    d < Math.abs(upper - lower) - EPSILON ||
    d > upper + lower + EPSILON
  )
    throw new RangeError(`Unreachable joint: ${d} / ${upper}+${lower}`);
  const axis = normalize(delta),
    projected = vsub(pole, scale(axis, dot(pole, axis)));
  const bend =
    length(projected) < EPSILON ? perpendicular(axis) : normalize(projected);
  const along = (upper * upper + d * d - lower * lower) / (2 * d),
    height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return vadd(root, vadd(scale(axis, along), scale(bend, height)));
}

/** Monotone cubic Hermite interpolation. Does not overshoot authored targets.
 * Tangents on either side of the middle key agree, including nonuniform motion.
 */
export function sampleTrack(values, t) {
  if (!Number.isFinite(t)) throw new RangeError("Invalid movement phase");
  const phase = clamp(t, 0, 1) * 2,
    i = Math.min(1, Math.floor(phase)),
    u = phase - i;
  if (Array.isArray(values[0]))
    return values[0].map((_, j) =>
      sampleTrack(
        values.map((v) => v[j]),
        t,
      ),
    );
  const [a, b, c] = values,
    d0 = b - a,
    d1 = c - b;
  const middle = d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1);
  const tangents = [d0, middle, d1],
    u2 = u * u,
    u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * values[i] +
    (u3 - 2 * u2 + u) * tangents[i] +
    (-2 * u3 + 3 * u2) * values[i + 1] +
    (u3 - u2) * tangents[i + 1]
  );
}

/** Bounded scalar coupling for a closed mechanism, with an explicit failure. */
export function bisect(fn, low, high, tolerance = 1e-10) {
  let a = fn(low),
    b = fn(high);
  if (Math.abs(a) < tolerance) return low;
  if (Math.abs(b) < tolerance) return high;
  if (!Number.isFinite(a + b) || a * b > 0)
    throw new RangeError("Unreachable mechanism contact");
  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2,
      v = fn(mid);
    if (Math.abs(v) < tolerance) return mid;
    if (v * a > 0) {
      low = mid;
      a = v;
    } else {
      high = mid;
      b = v;
    }
  }
  return (low + high) / 2;
}
