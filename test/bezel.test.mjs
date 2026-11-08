// Knob math from SurroundController.nas: node --test (after npm run build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOTS, adjust } from "../dist/bezel.js";

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

test("arrows at a knob's top corners turn it one detent each way", () => {
  const arrows = SPOTS.filter((s) => s.arrow);
  const turns = (c) => arrows.filter((s) => s.click === c).map((s) => s.value).sort();
  for (const c of ["NAV_INNER", "HEADING", "ALT_INNER", "COM_INNER", "CRS", "RANGE", "FMS_INNER"]) assert.deepEqual(turns(c), [-1, 1], c);
  const alt = arrows.find((s) => s.click === "ALT_INNER");
  assert.equal(alt.shiftClick, "ALT_OUTER"); // shift turns the outer ring
  assert.equal(alt.wheel, "ALT_INNER"); // the wheel still works over an arrow
  assert.equal(arrows.find((s) => s.click === "HEADING").shiftClick, "HEADING"); // a single knob has no outer ring
});

test("an arrow covers no other button", () => {
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const a of SPOTS.filter((s) => s.arrow))
    for (const s of SPOTS.filter((s) => !s.arrow && s.wheel !== a.wheel)) assert.ok(!overlap(a.box, s.box), `${a.click} ${a.value} over ${s.click ?? s.wheel}`);
});
