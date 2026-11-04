import test from "node:test";
import assert from "node:assert/strict";
import {
  displayDate,
  parseDisplayDate,
  dateError,
} from "../lib/field-controls.js";

test("date entry round-trips Brazilian dates without time zones", () => {
  for (const date of ["2026-11-03", "2024-02-29", "2026-01-01", "2026-12-31"])
    assert.equal(parseDisplayDate(displayDate(date)), date);
  assert.equal(displayDate("invalid"), "");
  assert.equal(parseDisplayDate(" 03/11/2026 "), "2026-11-03");
});
test("manual dates reject impossible, incomplete and non-leap dates", () => {
  for (const value of [
    "29/02/2026",
    "31/04/2026",
    "00/11/2026",
    "03/13/2026",
    "3/11/2026",
    "03/11/26",
    "2026-11-03",
  ])
    assert.equal(parseDisplayDate(value), "", value);
  assert.match(dateError("31/02/2026"), /válida/);
  assert.equal(dateError(""), "");
});
test("date bounds are inclusive and retain the user's value for correction", () => {
  const bounds = { min: "2026-01-01", max: "2026-11-03" };
  assert.equal(dateError("01/01/2026", bounds), "");
  assert.equal(dateError("03/11/2026", bounds), "");
  assert.match(dateError("31/12/2025", bounds), /a partir de 01\/01\/2026/);
  assert.match(dateError("04/11/2026", bounds), /até 03\/11\/2026/);
});
