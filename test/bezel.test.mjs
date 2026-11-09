// Knob math from SurroundController.nas: node --test (after npm run build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOTS, adjust, wheelStep } from "../dist/bezel.js";

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

const turns = (c) => SPOTS.filter((s) => s.arrow && s.click === c).map((s) => s.value).sort();

test("a dual knob has arrows for each ring, a single knob one pair", () => {
  // v13 trainer: on a dual knob the upper arrows turn the outer ring, the lower ones the inner knob.
  for (const c of ["NAV_OUTER", "NAV_INNER", "ALT_OUTER", "ALT_INNER", "COM_OUTER", "COM_INNER", "BARO", "CRS", "FMS_OUTER", "FMS_INNER", "HEADING", "NAV_VOL", "COM_VOL", "RANGE"])
    assert.deepEqual(turns(c), [-1, 1], c);
  const y = (c) => SPOTS.find((s) => s.arrow && s.click === c).box[1];
  assert.ok(y("NAV_OUTER") < y("NAV_INNER"));
  assert.equal(SPOTS.find((s) => s.arrow && s.click === "ALT_INNER").wheel, "ALT_INNER"); // the wheel still works over an arrow
});

test("the joystick moves in eight directions and every knob pushes", () => {
  // A diagonal reports a horizontal and a vertical move.
  const dirs = SPOTS.filter((s) => s.click === "JOYSTICK_HORIZONTAL" || s.click === "JOYSTICK_VERTICAL");
  const moves = dirs.map((s) => (s.click === "JOYSTICK_HORIZONTAL" ? [s.value, s.also?.value ?? 0] : [0, s.value]));
  assert.equal(new Set(moves.map(String)).size, 8);
  for (const c of ["NAV_ID", "NAV_TOGGLE", "HEADING_PRESS", "ALT_PRESS", "COM_VOL_TOGGLE", "COM_TOGGLE", "CRS_CENTER", "JOYSTICK_PRESS", "FMS_CRSR"])
    assert.ok(SPOTS.some((s) => s.click === c && !s.arrow), c);
});

test("an arrow covers no other button", () => {
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const turn = SPOTS.filter((s) => s.arrow);
  for (const a of turn)
    for (const s of SPOTS.filter((s) => s !== a && s.wheel !== a.wheel)) assert.ok(!overlap(a.box, s.box), `${a.click} ${a.value} over ${s.click ?? s.wheel}`);
  for (const a of turn) for (const b of turn) if (a !== b) assert.ok(!overlap(a.box, b.box), `${a.click} ${a.value} over ${b.click} ${b.value}`);
});

test("HDG and CRS speed up when the wheel spins fast; ALT does not", () => {
  assert.equal(wheelStep("HEADING", 500), 1);
  assert.equal(wheelStep("HEADING", 40), 5);
  assert.equal(wheelStep("CRS", 40), 5);
  assert.equal(wheelStep("ALT_INNER", 40), 1);
});

test("a fast spin turns HDG and CRS five degrees a notch", () => {
  assert.deepEqual(go("HEADING", 5), { headingBug: 4 });
  assert.deepEqual(go("CRS", -5), { course: 355 });
});

test("GFC 700 keys: two columns of six in the left column between the HDG and ALT knobs, GDU 1044B order", async () => {
  const { AFCS_SPOTS } = await import("../dist/bezel.js");
  const rows = (x) => AFCS_SPOTS.filter((s) => s.box[0] < x).map((s) => s.click);
  assert.deepEqual(rows(90), ["AP", "HDG", "NAV", "APR", "VS", "FLC"]);
  assert.deepEqual(AFCS_SPOTS.filter((s) => s.box[0] >= 90).map((s) => s.click), ["FD", "ALT", "VNV", "BC", "NOSE_UP", "NOSE_DN"]);
  for (const { box: [x1, y1, x2, y2], label } of AFCS_SPOTS) {
    assert.ok(x1 >= 45 && x2 <= 135 && y1 > 445 && y2 < 769, label); // clear of PUSH HDG SYNC and the ALT label
    assert.ok(label);
  }
  // None overlap the knobs' own spots.
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const s of AFCS_SPOTS) for (const t of [...SPOTS, ...AFCS_SPOTS]) if (s !== t) assert.ok(!hit(s.box, t.box), `${s.label} overlaps`);
});
