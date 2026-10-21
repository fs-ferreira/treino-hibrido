const pt = (p) => p.map((n) => Number(n.toFixed(2))).join(",");
const line = (a, b, cls = "machine-frame") =>
  `<path class="${cls}" d="M${pt(a)}L${pt(b)}"/>`;
const pad = (x, y, w, h, rotation = 0) =>
  `<rect class="machine-pad" x="${x}" y="${y}" width="${w}" height="${h}" rx="4" transform="rotate(${rotation} ${x} ${y})"/>`;
const pulley = (x, y) =>
  `<circle class="pulley" cx="${x}" cy="${y}" r="7"/><circle class="machine-pivot" cx="${x}" cy="${y}" r="2"/>`;
const seat = (front = false) =>
  front
    ? pad(151, 194, 58, 10) +
      line([165, 204], [165, 264]) +
      line([195, 204], [195, 264])
    : pad(122, 201, 58, 10) +
      line([135, 211], [135, 264]) +
      line([167, 211], [167, 264]);
const tower = (x = 300) =>
  line([x, 264], [x, 43]) +
  line([x - 22, 264], [x + 22, 264]) +
  pad(x - 12, 178, 24, 66) +
  [190, 201, 212, 223, 234]
    .map((y) => line([x - 10, y], [x + 10, y], "plate-line"))
    .join("");
const dumbbell = (p) =>
  `<g class="load"><path d="M${p[0] - 14} ${p[1]}h28"/><rect x="${p[0] - 17}" y="${p[1] - 10}" width="8" height="20" rx="2"/><rect x="${p[0] + 9}" y="${p[1] - 10}" width="8" height="20" rx="2"/></g>`;
const roller = (p) =>
  `<rect class="roller" x="${p[0] - 11}" y="${p[1] - 8}" width="25" height="15" rx="7"/>`;
export function equipment(kind, r, foreground) {
  const a = r.nearArm[2],
    b = r.farArm[2],
    knee = r.nearLeg[1],
    ankle = r.nearLeg[2];
  let s = "";
  if (!foreground) {
    if (["fly", "pulldown", "adductor", "press"].includes(kind))
      s += seat(true) + pad(161, 99, 38, 91);
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
      s += seat();
    if (["extension", "overhead"].includes(kind)) s += pad(125, 111, 10, 88);
    if (kind === "incline")
      s +=
        pad(95, 150, 98, 11, 35) +
        pad(169, 201, 40, 10) +
        line([162, 199], [144, 264]) +
        line([203, 210], [218, 264]) +
        line([128, 264], [235, 264]);
    if (kind === "split")
      s +=
        pad(226, 211, 58, 12) +
        line([235, 223], [235, 264]) +
        line([274, 223], [274, 264]);
    if (kind === "hinge") s += line([166, 264], [207, 264], "contact-line");
    if (kind === "legcurl" || kind === "reverse")
      s +=
        pad(63, 205, 159, 12) +
        line([82, 217], [82, 264]) +
        line([206, 217], [206, 264]);
    if (kind === "legcurl") s += pad(159, 192, 51, 13);
    if (kind === "row")
      s +=
        pad(158, 123, 12, 53, 10) + line([167, 177], [167, 264]) + tower(295);
    if (kind === "preacher")
      s += pad(150, 141, 61, 12, 40) + line([190, 181], [190, 264]);
    if (kind === "calfseated")
      s +=
        line([235, 261], [235, 166]) +
        line([235, 166], [190, 166]) +
        pad(204, 261, 30, 7);
    if (kind === "calf")
      s += line([262, 264], [262, 90]) + pad(208, 261, 28, 7);
    if (["cablefly", "pushdown", "curl", "pulldown"].includes(kind))
      s += tower(310) + line([310, 43], [180, 43]);
    if (kind === "cablefly") s += tower(50) + pulley(50, 90) + pulley(310, 90);
    if (kind === "pulldown" || kind === "pushdown") s += pulley(180, 43);
    if (kind === "curl") s += pulley(180, 250) + line([180, 250], [310, 250]);
    if (kind === "fly")
      s +=
        line([60, 264], [60, 94]) +
        line([300, 264], [300, 94]) +
        line([60, 94], [300, 94]);
    if (kind === "crunch")
      s +=
        tower(287) +
        pad(129, 111, 12, 77) +
        line([207, 252], [233, 252], "contact-line");
    if (kind === "adductor") s += line([110, 262], [250, 262]);
    if (kind === "extension") s += line([191, 191], [191, 264]);
    return `<g class="apparatus">${s}</g>`;
  }
  if (["incline", "lateral", "press", "split"].includes(kind))
    s += dumbbell(b) + dumbbell(a);
  if (kind === "hinge") s += dumbbell(a);
  if (kind === "overhead")
    s += `<g transform="rotate(90 ${a[0]} ${a[1]})">${dumbbell(a)}</g>`;
  if (kind === "cablefly")
    s += line([310, 90], a, "cable") + line([50, 90], b, "cable");
  if (kind === "fly") s += line([300, 94], a) + line([60, 94], b);
  if (kind === "fly" || kind === "cablefly")
    s +=
      line([a[0], a[1] - 8], [a[0], a[1] + 8], "handle") +
      line([b[0], b[1] - 8], [b[0], b[1] + 8], "handle");
  if (kind === "pulldown") {
    s +=
      line([180, 43], [180, a[1] - 7], "cable") +
      `<path class="handle" d="M${b[0] - 8} ${b[1] + 4}L${b[0]} ${b[1]}L${b[0] + 10} ${a[1] - 7}H${a[0] - 10}L${a[0]} ${a[1]}L${a[0] + 8} ${a[1] + 4}"/>` +
      pad(147, 202, 66, 10);
  }
  if (kind === "curl")
    s +=
      line([180, 250], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], "cable") +
      line([b[0] - 16, b[1]], [a[0] + 16, a[1]], "handle");
  if (kind === "pushdown") {
    const j = [180, Math.min(a[1], b[1]) - 15];
    s += line([180, 43], j, "cable") + line(j, a, "rope") + line(j, b, "rope");
  }
  if (kind === "row") s += line([295, 145], a, "cable") + line(b, a, "handle");
  if (kind === "preacher")
    s +=
      `<path class="handle" d="M${b[0] - 16} ${b[1]}l12 -4 9 8 9 -4h15"/>` +
      pad(b[0] - 21, b[1] - 10, 6, 20) +
      pad(a[0] + 13, a[1] - 10, 6, 20);
  if (kind === "bentrow")
    s +=
      line([b[0] - 24, b[1]], [a[0] + 24, a[1]], "handle") +
      roller([b[0] - 20, b[1]]) +
      roller([a[0] + 20, a[1]]);
  if (kind === "legcurl" || kind === "extension")
    s +=
      line(knee, ankle) +
      `<circle class="machine-pivot" cx="${knee[0]}" cy="${knee[1]}" r="5"/>` +
      roller(ankle);
  if (kind === "adductor")
    s +=
      roller([r.nearLeg[1][0] - 12, r.nearLeg[1][1]]) +
      roller([r.farLeg[1][0] + 12, r.farLeg[1][1]]);
  if (kind === "calfseated")
    s +=
      line([235, 166], [knee[0], knee[1] - 13]) +
      line([235, 166], a, "handle") +
      line(b, a, "handle") +
      pad(knee[0] - 14, knee[1] - 13, 30, 10) +
      `<circle class="weight-disc" cx="235" cy="178" r="16"/>`;
  if (kind === "crunch")
    s +=
      line([287, 125], a, "cable") +
      line(a, b, "handle") +
      pad(r.shoulder[0] + 8, r.shoulder[1] + 7, 12, 27, -15);
  return `<g class="apparatus-front">${s}</g>`;
}
