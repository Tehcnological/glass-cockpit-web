// PAGE MENU option lists and cursor, as on the v13 trainer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FPL_OPTIONS, fplMenu, stepMenu } from "../dist/page-menu.js";

test("the cursor skips dim options and stops at the ends", () => {
  const on = [true, false, true, false, false, true];
  assert.equal(stepMenu(on, 0, 1), 2);
  assert.equal(stepMenu(on, 2, 1), 5);
  assert.equal(stepMenu(on, 5, 1), 5);
  assert.equal(stepMenu(on, 2, -1), 0);
  assert.equal(stepMenu(on, 0, -1), 0);
  assert.equal(stepMenu([false, false], 0, 1), 0);
});

test("the flight plan menu lists the trainer's options in its order", () => {
  assert.equal(FPL_OPTIONS.length, 18);
  assert.equal(FPL_OPTIONS[0], "Store Flight Plan");
  assert.equal(FPL_OPTIONS[2], "Delete Flight Plan");
  assert.equal(FPL_OPTIONS[17], "Hold At Present Position");
  assert.deepEqual(fplMenu([], 0).map((o) => o.label), FPL_OPTIONS);
});

const pt = (id, approach) => ({ id, type: "WPT", lat: 33, lon: -112, ...(approach ? { approach, role: "FAF" } : {}) });

test("only what the package can do is offered", () => {
  const on = (route) => fplMenu(route, 1).filter((o) => o.patch).map((o) => o.label);
  assert.deepEqual(on([]), []);
  assert.deepEqual(on(["KAAA"]), ["Delete Flight Plan"]);
  assert.deepEqual(on(["ABC", "KAAA"]), ["Invert Flight Plan", "Delete Flight Plan"]);
  assert.deepEqual(on(["ABC", "KAAA", pt("A", "ILS")]), ["Invert Flight Plan", "Delete Flight Plan", "Remove Approach"]);
});

test("delete, invert and remove approach change the flight plan", () => {
  const route = ["ABC", "WPONE", "KAAA", pt("A", "ILS"), pt("B", "ILS")];
  const opt = (label) => fplMenu(route, 4).find((o) => o.label === label).patch;
  assert.deepEqual(opt("Delete Flight Plan"), { route: [], activeLeg: 0, directFrom: null, vtf: false });
  // Inverting drops the approach and makes the first leg active.
  assert.deepEqual(opt("Invert Flight Plan"), { route: ["KAAA", "WPONE", "ABC"], activeLeg: 1, directFrom: null, vtf: false });
  assert.deepEqual(opt("Remove Approach"), { route: ["ABC", "WPONE", "KAAA"], activeLeg: 2, vtf: false });
});
