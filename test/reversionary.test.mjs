// Reversionary mode (Pilot's Guide, Line Maintenance Manual): the PFD with the engine strip down its left.
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineKeys, reversionaryLayout } from "../dist/eis.js";

test("reversionary: OAT moves under TAS, and the inset map from the lower left to the lower right", () => {
  const tas = { x: 153, y: 455, width: 86, height: 23 };
  const oat = { x: 2, y: 720, width: 95, height: 23 };
  const inset = { x: 4, y: 487, width: 310, height: 230 };
  const l = reversionaryLayout(tas, oat, inset);
  assert.deepEqual(l.oat, { dx: 151, dy: 455 + 23 + 4 - 720 });
  assert.deepEqual(l.inset, { dx: 1024 - 4 - 310 - 4, dy: 0 }); // the same margin on the right
});

const labels = (m) => engineKeys(m, () => () => {}).map((k) => k.label);

test("engine keys: ENGINE, LEAN and SYSTEM, with LEAN's and SYSTEM's keys where the trainer has them", () => {
  assert.deepEqual(labels("engine"), ["ENGINE", "LEAN", "SYSTEM", "", "", "", "", "", "", ""]);
  assert.deepEqual(labels("lean"), ["ENGINE", "LEAN", "SYSTEM", "", "CYL SLCT", "ASSIST", "", "", "", ""]);
  assert.deepEqual(labels("system"), ["ENGINE", "LEAN", "SYSTEM", "", "", "", "RST FUEL", "GAL REM", "", ""]);
});

test("engine keys: the shown menu's key is lit and each goes to its menu", () => {
  const went = [];
  const keys = engineKeys("lean", (m) => () => went.push(m));
  assert.deepEqual(keys.slice(0, 3).map((k) => !!k.lit), [false, true, false]);
  keys[2].act();
  assert.deepEqual(went, ["system"]);
});
