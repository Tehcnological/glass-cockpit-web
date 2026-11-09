// Start-up (Line Maintenance Manual, Pilot's Guide): attitude and heading are invalid while the AHRS aligns, air data for
// the first few seconds while the ADC comes up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADC_START_S, AHRS_ALIGN_S, Startup } from "../dist/glass-pfd.js";

test("the AHRS aligns for 40 to 60 s by default, the ADC for a few", () => {
  assert.ok(AHRS_ALIGN_S >= 40 && AHRS_ALIGN_S <= 60);
  assert.ok(ADC_START_S > 0 && ADC_START_S < AHRS_ALIGN_S);
});

test("air data comes valid first, then attitude and heading", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const s = new Startup(AHRS_ALIGN_S, () => calls++);
  assert.deepEqual(s.failed, { attitude: true, heading: true, airspeed: true, altitude: true, vsi: true });
  assert.equal(s.aligning, true);
  t.mock.timers.tick(ADC_START_S * 1000 - 1);
  assert.equal(s.failed.airspeed, true);
  t.mock.timers.tick(1);
  assert.deepEqual(s.failed, { attitude: true, heading: true });
  assert.equal(s.aligning, true);
  assert.equal(calls, 1);
  t.mock.timers.tick((AHRS_ALIGN_S - ADC_START_S) * 1000 - 1);
  assert.equal(s.aligning, true);
  t.mock.timers.tick(1);
  assert.deepEqual(s.failed, {});
  assert.equal(s.aligning, false);
  assert.equal(calls, 2);
});

test("0 skips the start-up; stop cancels it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const off = new Startup(0, () => calls++);
  assert.deepEqual(off.failed, {});
  assert.equal(off.aligning, false);
  const short = new Startup(2, () => calls++); // shorter than the ADC's: both end together, air data first
  t.mock.timers.tick(2000);
  assert.deepEqual(short.failed, {});
  assert.equal(calls, 2);
  const stopped = new Startup(AHRS_ALIGN_S, () => calls++);
  stopped.stop();
  t.mock.timers.tick(AHRS_ALIGN_S * 1000);
  assert.equal(calls, 2);
  assert.equal(stopped.aligning, true);
});
