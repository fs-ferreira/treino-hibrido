const pt = (p) => p.map((n) => Number(n.toFixed(2))).join(",");
const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
const line = (a, b, cls = "machine-frame") =>
  `<path class="${cls}" d="M${pt(a)}L${pt(b)}"/>`;
const pad = (x, y, w, h, rotation = 0) =>
  `<rect class="machine-pad" x="${x}" y="${y}" width="${w}" height="${h}" rx="4" transform="rotate(${rotation} ${x} ${y})"/>`;
const pulley = (x, y) =>
  `<circle class="pulley" cx="${x}" cy="${y}" r="7"/><circle class="machine-pivot" cx="${x}" cy="${y}" r="2"/>`;
const seat = (front) =>
  front
    ? pad(151, 206, 58, 10) +
      line([165, 216], [165, 264]) +
      line([195, 216], [195, 264])
    : pad(121, 225, 65, 10) +
      line([133, 235], [133, 264]) +
      line([174, 235], [174, 264]);
const tower = (x = 310) =>
  line([x, 264], [x, 43]) +
  line([x - 22, 264], [x + 22, 264]) +
  pad(x - 12, 178, 24, 66) +
  [190, 201, 212, 223, 234]
    .map((y) => line([x - 10, y], [x + 10, y], "plate-line"))
    .join("");
const dumbbell = (p, angle = 0) =>
  `<g class="load" transform="translate(${pt(p)}) rotate(${angle})"><path d="M-13 0h26"/><rect x="-16" y="-9" width="7" height="18" rx="2"/><rect x="9" y="-9" width="7" height="18" rx="2"/></g>`;
const roller = (p) =>
  `<rect class="roller" x="${p[0] - 11}" y="${p[1] - 7}" width="24" height="14" rx="7"/>`;
export function equipment(kind, r, foreground) {
  const [a, b] = r.grips,
    knee = r.nearLeg[1],
    ankle = r.nearLeg[2],
    distal = mix(knee, ankle, 0.86);
  let s = "";
  if (!foreground) {
    if (["fly", "pulldown", "adductor", "press"].includes(kind))
      s += seat(true) + pad(161, 109, 38, 96);
    if (
      [
        "row",
        "preacher",
        "calfseated",
        "extension",
        "overhead",
        "crunch",
      ].includes(kind)
    )
      s += seat(false);
    if (["extension", "overhead", "crunch"].includes(kind))
      s += pad(125, 143, 9, 80);
    if (kind === "incline")
      s +=
        pad(94, 157, 98, 10, 35) +
        pad(169, 212, 44, 10) +
        line([162, 210], [144, 264]) +
        line([203, 222], [218, 264]) +
        line([128, 264], [235, 264]);
    if (kind === "split") {
      const top = r.feet[1].dorsum[1];
      s +=
        pad(249, top, 54, 11) +
        line([257, top + 11], [257, 264]) +
        line([294, top + 11], [294, 264]);
    }
    if (kind === "hinge")
      s += line(r.feet[0].heel, r.feet[0].toe, "contact-line");
    if (kind === "legcurl")
      s +=
        pad(109, 203, 103, 12) +
        line([128, 215], [128, 264]) +
        line([201, 215], [201, 264]) +
        pad(185, 201, 28, 6);
    if (kind === "reverse")
      s +=
        pad(64, 208, 152, 12) +
        line([82, 220], [82, 264]) +
        line([201, 220], [201, 264]);
    if (kind === "row")
      s += pad(159, 151, 10, 48) + line([167, 199], [167, 264]) + tower(295);
    if (kind === "preacher")
      s += pad(145, 160, 59, 11, 42) + line([183, 205], [183, 264]);
    if (kind === "calfseated")
      s += line([236, 264], [236, 177]) + pad(197, 253, 32, 14);
    if (kind === "calf")
      s += line([248, 264], [248, 106]) + pad(206, 253, 31, 14);
    if (["cablefly", "pushdown", "curl", "pulldown"].includes(kind))
      s += tower() + line([310, 43], [180, 43]);
    if (kind === "cablefly") s += tower(50) + pulley(50, 90) + pulley(310, 90);
    if (["pulldown", "pushdown"].includes(kind)) s += pulley(180, 43);
    if (kind === "curl") s += pulley(180, 250) + line([180, 250], [310, 250]);
    if (kind === "fly")
      s +=
        line([60, 264], [60, 104]) +
        line([300, 264], [300, 104]) +
        line([60, 104], [300, 104]) +
        line([161, 104], r.farArm[0]) +
        line([199, 104], r.nearArm[0]) +
        line(r.farArm[0], b) +
        line(r.nearArm[0], a);
    if (kind === "crunch") s += tower(287);
    if (kind === "adductor") s += line([110, 264], [250, 264]);
    if (kind === "extension") s += line(knee, [knee[0], 264]);
    // Floor shadows and moving footrests make each support explicit.
    if (kind === "adductor")
      for (const foot of r.feet) {
        s += pad(foot.ball[0] - 10, foot.toe[1] + 1, 24, 5);
      }
    if (kind === "cablefly")
      for (const foot of r.feet) {
        s += line(
          [foot.heel[0] - 3, foot.toe[1] + 1],
          [foot.toe[0] + 5, foot.toe[1] + 1],
          "scene-floor",
        );
      }
    return `<g class="apparatus">${s}</g>`;
  }
  if (["incline", "lateral", "press", "split"].includes(kind))
    s +=
      dumbbell(b, r.hands[1].angle - 90) + dumbbell(a, r.hands[0].angle - 90);
  if (kind === "hinge") s += dumbbell(b, r.hands[1].angle - 90);
  if (kind === "overhead") {
    const x = (a[0] + b[0]) / 2,
      y = (a[1] + b[1]) / 2;
    // Both palms support the upper head of a single vertical dumbbell.
    s += `<g class="load"><path d="M${x} ${y - 3}v25"/><rect x="${x - 10}" y="${y - 9}" width="20" height="7" rx="2"/><rect x="${x - 10}" y="${y + 20}" width="20" height="7" rx="2"/></g>`;
  }
  if (kind === "cablefly")
    s += line([310, 90], a, "cable") + line([50, 90], b, "cable");
  if (["fly", "cablefly"].includes(kind))
    s +=
      line([a[0], a[1] - 7], [a[0], a[1] + 7], "handle") +
      line([b[0], b[1] - 7], [b[0], b[1] + 7], "handle");
  if (kind === "pulldown")
    s +=
      line([180, 43], [180, a[1] - 6], "cable") +
      `<path class="handle" d="M${b[0] - 8} ${b[1] + 3}L${b[0]} ${b[1]}L${b[0] + 12} ${b[1] - 6}H${a[0] - 12}L${a[0]} ${a[1]}L${a[0] + 8} ${a[1] + 3}"/>` +
      pad(151, 198, 58, 7);
  if (kind === "curl")
    s +=
      line([180, 250], mix(a, b, 0.5), "cable") +
      line([b[0] - 15, b[1]], [a[0] + 15, a[1]], "handle");
  if (kind === "pushdown") {
    const junction = [180, Math.min(a[1], b[1]) - 16];
    s +=
      line([180, 43], junction, "cable") +
      line(junction, a, "rope") +
      line(junction, b, "rope");
  }
  if (kind === "row")
    s += line([295, 163], mix(a, b, 0.5), "cable") + line(b, a, "handle");
  if (kind === "preacher")
    s +=
      `<path class="handle" d="M${b[0] - 16} ${b[1]}l12 -3 8 6 8 -3h15"/>` +
      pad(b[0] - 21, b[1] - 8, 6, 16) +
      pad(a[0] + 13, a[1] - 8, 6, 16);
  if (kind === "bentrow")
    s +=
      line([b[0] - 22, b[1]], [a[0] + 22, a[1]], "handle") +
      roller([b[0] - 20, b[1]]) +
      roller([a[0] + 20, a[1]]);
  if (["legcurl", "extension"].includes(kind))
    s +=
      line(knee, distal) +
      `<circle class="machine-pivot" cx="${knee[0]}" cy="${knee[1]}" r="4"/>` +
      roller(distal);
  if (kind === "adductor") {
    for (const [i, limb] of [r.nearLeg, r.farLeg].entries()) {
      const support = mix(limb[0], limb[1], 0.75);
      s += roller([support[0] + (i ? 7 : -7), support[1]]);
    }
  }
  if (kind === "calfseated") {
    const thigh = mix(r.nearLeg[0], knee, 0.78),
      thighFar = mix(r.farLeg[0], r.farLeg[1], 0.78);
    s +=
      line([236, 177], [thigh[0], thigh[1] - 9]) +
      pad(thigh[0] - 8, thigh[1] - 9, 21, 9) +
      line(b, a, "handle") +
      line([236, 177], mix(a, b, 0.5), "handle") +
      `<circle class="weight-disc" cx="236" cy="185" r="14"/>`;
  }
  if (kind === "crunch")
    s +=
      line([287, 146], mix(a, b, 0.5), "cable") +
      line(a, b, "handle") +
      pad(r.nearArm[1][0] - 8, r.nearArm[1][1] + 3, 18, 8);
  if (kind === "legcurl")
    s += line(
      [r.grips[1][0] - 8, r.grips[1][1]],
      [r.grips[0][0] + 7, r.grips[0][1]],
      "handle",
    );
  return `<g class="apparatus-front">${s}</g>`;
}
