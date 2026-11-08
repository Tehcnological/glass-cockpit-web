import { test } from "node:test";
import assert from "node:assert/strict";
import { cdiLabel, dmeText, isLocalizer, tuneNav } from "../dist/radio.js";

const points = [
  { id: "PXR", type: "VOR", lat: 33.43302, lon: -111.9702, freq: "115.60", magVar: 12 },
  { id: "FAR", type: "VOR", lat: 36, lon: -111.9, freq: "115.60", magVar: 12 }, // same frequency, farther
  { id: "TFD", type: "VOR", lat: 32.88585, lon: -111.90873, freq: "114.80", magVar: 12 },
];
const radios = {
  nav1: { active: 115.6, standby: 114.8, id: "" }, nav2: { active: 110.5, standby: 114.8, id: "" },
  com1: { active: 120.9, standby: 136.975 }, com2: { active: 118.3, standby: 132.45 },
};

test("NAV radios find the nearest VOR on the frequency, with magnetic bearing", () => {
  const { radios: r, bearings } = tuneNav(radios, points, 33.4, -111.9);
  assert.equal(r.nav1.id, "PXR");
  assert.equal(r.nav2.id, "");
  assert.equal(bearings.NAV1?.id, "PXR");
  assert.ok(Math.abs(bearings.NAV1.bearing - 287.4) < 0.5, String(bearings.NAV1.bearing)); // 299.4 true, 12 east
  assert.ok(Math.abs(bearings.NAV1.distance - 4.0) < 0.1);
  assert.equal(bearings.NAV2, undefined);
  assert.equal(r.com1, radios.com1);
});

test("localizer frequencies", () => {
  for (const f of [108.1, 108.15, 109.9, 110.9, 111.95]) assert.equal(isLocalizer(f), true, String(f));
  for (const f of [108.0, 108.2, 108.25, 112.0, 113.1, 117.95]) assert.equal(isLocalizer(f), false, String(f));
});

test("CDI label follows the active NAV frequency", () => {
  const r = { ...radios, nav1: { active: 115.6, standby: 0, id: "" }, nav2: { active: 110.9, standby: 0, id: "" } };
  assert.equal(cdiLabel("GPS", r), "GPS");
  assert.equal(cdiLabel("NAV1", r), "VOR1");
  assert.equal(cdiLabel("NAV2", r), "LOC2");
  assert.equal(cdiLabel("OFF", r), "");
});

test("DME distance text", () => {
  assert.equal(dmeText({ distance: 12.34 }), "12.3NM");
  assert.equal(dmeText({}), "-.--NM");
  assert.equal(dmeText(undefined), "-.--NM");
});
