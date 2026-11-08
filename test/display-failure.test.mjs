// Display failures (Line Maintenance Manual, display failure test): the other display reverts on its own, and the COM/NAV
// fields the failed display carried flag invalid on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayModes } from "../dist/display-backup.js";

test("display modes: both powered follow DISPLAY BACKUP", () => {
  assert.deepEqual(displayModes(false, true, true), { pfd: { mode: "normal", failed: {} }, mfd: { mode: "normal", failed: {} } });
  assert.deepEqual(displayModes(true, true, true), { pfd: { mode: "reversionary", failed: {} }, mfd: { mode: "reversionary", failed: {} } });
});

test("display modes: an MFD failure reverts the PFD and flags COM/NAV 2", () => {
  for (const backup of [false, true]) {
    assert.deepEqual(displayModes(backup, true, false), {
      pfd: { mode: "reversionary", failed: { com2: true, nav2: true } },
      mfd: { mode: "off", failed: {} },
    });
  }
});

test("display modes: a PFD failure reverts the MFD and flags COM/NAV 1", () => {
  assert.deepEqual(displayModes(false, false, true), {
    pfd: { mode: "off", failed: {} },
    mfd: { mode: "reversionary", failed: { com1: true, nav1: true } },
  });
});

test("display modes: both failed leaves both off", () => {
  assert.deepEqual(displayModes(false, false, false), { pfd: { mode: "off", failed: {} }, mfd: { mode: "off", failed: {} } });
});
