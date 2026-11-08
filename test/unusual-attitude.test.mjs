// The PFD's unusual attitude declutter, as the Pilot's Guide gives its limits: past +30° or -20° pitch, or past 65° bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unusualAttitude } from "../dist/glass-pfd.js";
import { uaIgnores } from "../dist/unusual-attitude.js";

test("unusual attitude: not at the limits themselves", () => {
  for (const [pitch, roll] of [[0, 0], [30, 0], [-20, 0], [0, 65], [0, -65], [30, 65], [-20, -65]]) {
    assert.equal(unusualAttitude(pitch, roll), false, `${pitch} ${roll}`);
  }
});

test("unusual attitude: past +30° or -20° pitch, or 65° bank either way", () => {
  for (const [pitch, roll] of [[30.5, 0], [-20.5, 0], [0, 65.5], [0, -65.5], [90, 0], [0, 180]]) {
    assert.equal(unusualAttitude(pitch, roll), true, `${pitch} ${roll}`);
  }
});

test("unusual attitude: bank is read the short way round, so 350 is 10° left", () => {
  assert.equal(unusualAttitude(0, 350), false);
  assert.equal(unusualAttitude(0, 290), true);
  assert.equal(unusualAttitude(0, -350), false);
});

test("unusual attitude: the map and window keys do nothing, as their windows are gone", () => {
  for (const c of ["RANGE", "JOYSTICK_PRESS", "JOYSTICK_HORIZONTAL", "JOYSTICK_VERTICAL", "MENU", "DTO", "PROC", "FPL"]) {
    assert.equal(uaIgnores(c, null), true, c);
    assert.equal(uaIgnores(c, "ALERTS"), true, c);
  }
  for (const c of ["FMS_OUTER", "FMS_INNER", "FMS_CRSR", "ENT", "CLR"]) {
    for (const w of [null, "MENU", "TMR/REF", "NRST", "DTO", "PROC", "SETUP", "TOOL"]) assert.equal(uaIgnores(c, w), true, `${c} ${w}`);
  }
});

test("unusual attitude: the FMS keys still work the ALERTS and DME windows, and the other knobs and softkeys work", () => {
  for (const c of ["FMS_OUTER", "FMS_INNER", "ENT", "CLR"]) {
    assert.equal(uaIgnores(c, "ALERTS"), false, c);
    assert.equal(uaIgnores(c, "DME"), false, c);
  }
  for (const c of ["SOFTKEY", "HEADING", "CRS", "BARO", "ALT_OUTER", "NAV_INNER", "COM_TOGGLE"]) assert.equal(uaIgnores(c, null), false, c);
});
