// Knob math from SurroundController.nas: node --test (after npm run build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjust } from "../dist/bezel.js";

const k = {
  heading: 359.6, headingBug: 359, course: 0, baro: 29.92, alt: 3040, selectedAlt: null,
  radios: { nav1: { active: 110.5, standby: 117.95, id: "" }, nav2: { active: 112.3, standby: 108.2, id: "" }, com1: { active: 120.9, standby: 136.975 }, com2: { active: 118.3, standby: 132.45 } },
  navVolume: 0.5, comVolume: 1, navIdent: false,
};
const sel = { nav: 1, com: 1 };
const go = (control, value = 1) => adjust({ control, value }, k, sel);

test("heading, course, baro, altitude", () => {
  assert.deepEqual(go("HEADING"), { headingBug: 0 });
  assert.deepEqual(go("HEADING_PRESS"), { headingBug: 0 });
  assert.deepEqual(go("CRS", -1), { course: 359 });
  assert.deepEqual(go("BARO", -1), { baro: 29.91 });
  assert.deepEqual(go("ALT_INNER"), { selectedAlt: 3100 });
  assert.deepEqual(go("ALT_OUTER", -1), { selectedAlt: 2000 });
});

test("selected altitude stays on 100 ft steps", () => {
  const off = (control, value, selectedAlt) => adjust({ control, value }, { ...k, selectedAlt }, sel);
  assert.deepEqual(off("ALT_INNER", 1, 4037), { selectedAlt: 4100 });
  assert.deepEqual(off("ALT_INNER", -1, 4037), { selectedAlt: 3900 });
  assert.deepEqual(off("ALT_OUTER", 1, 4050), { selectedAlt: 5100 });
  assert.deepEqual(off("ALT_INNER", -1, 30), { selectedAlt: 0 });
});

test("frequencies wrap within their band", () => {
  assert.equal(go("NAV_OUTER").radios.nav1.standby, 108.95);
  assert.equal(go("NAV_INNER").radios.nav1.standby, 117);
  assert.equal(go("COM_OUTER").radios.com1.standby, 118.975);
  assert.equal(go("COM_INNER").radios.com1.standby, 136);
  assert.deepEqual(go("NAV_FREQ_TRANSFER").radios.nav1, { active: 117.95, standby: 110.5, id: "" });
  assert.equal(go("COM_FREQ_TRANSFER_HOLD").radios.com1.active, 121.5);
  assert.equal(go("FMS_INNER"), null);
});

test("CRS push, volume and NAV ID", () => {
  assert.deepEqual(adjust({ control: "CRS_CENTER", value: 1 }, k, sel, 47.4), { course: 47 });
  assert.deepEqual(adjust({ control: "CRS_CENTER", value: 1 }, k, sel, 359.7), { course: 0 });
  assert.equal(go("CRS_CENTER"), null); // no station
  assert.deepEqual(go("NAV_VOL"), { navVolume: 0.51 });
  assert.deepEqual(go("COM_VOL"), { comVolume: 1 }); // clamped
  assert.deepEqual(go("COM_VOL", -1), { comVolume: 0.99 });
  assert.deepEqual(go("NAV_ID"), { navIdent: true });
});
