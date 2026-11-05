import test from "node:test";
import assert from "node:assert/strict";
import {
  birthMonthAllowed,
  birthMonthYears,
  displayBirthMonth,
} from "../lib/month-control.js";

test("month-only picker preserves the exact inclusive age bounds by month", () => {
  for (const [month, allowed] of [
    ["1925-11", false],
    ["1925-12", true],
    ["2008-11", true],
    ["2008-12", false],
  ])
    assert.equal(birthMonthAllowed(month, "2026-11-05"), allowed, month);
  assert.equal(birthMonthAllowed("1990-13", "2026-11-05"), false);
  assert.equal(birthMonthAllowed(null, "2026-11-05"), false);
  assert.equal(birthMonthAllowed("2008-12", "2026-12-01"), true);
  assert.equal(birthMonthAllowed("1925-12", "2026-12-01"), false);
  assert.equal(birthMonthYears("2026-11-05")[0], 2008);
  assert.equal(birthMonthYears("2026-11-05").at(-1), 1925);
});
test("month-only display is Portuguese and never adds a day", () => {
  assert.equal(displayBirthMonth("11/1996"), "nov/1996");
  assert.equal(displayBirthMonth("01/1930"), "jan/1930");
  assert.equal(displayBirthMonth(""), "Selecionar mês e ano");
  assert.equal(displayBirthMonth("13/1996"), "Selecionar mês e ano");
});
