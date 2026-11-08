// The PFD's unusual attitude declutter, as the Pilot's Guide gives its limits: past +30° or -20° pitch, or past 65° bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unusualAttitude } from "../dist/glass-pfd.js";

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
