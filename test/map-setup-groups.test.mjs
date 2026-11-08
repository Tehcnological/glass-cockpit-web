// MAP SETUP's groups on the navigation map (Pilot's Guide): Map, Airways and Profile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETUP_GROUPS } from "../dist/map-setup.js";
import { shownAirways } from "../dist/map.js";

const settings = { orientation: "NORTH UP", trackVector: 0, airways: 0, airwayRange: { LO: 200, HI: 300 } };
const rows = (name) => SETUP_GROUPS.find((g) => g.name === name).rows;
const row = (group, label) => rows(group).find((r) => r.label === label);

test("map setup: the Map, Airways and Profile groups", () => {
  assert.deepEqual(SETUP_GROUPS.map((g) => g.name), ["Map", "Airways", "Profile"]);
  assert.deepEqual(rows("Airways").map((r) => r.label), ["AIRWAYS", "LOW ALT AIRWAY", "HI ALT AIRWAY"]);
  assert.deepEqual(rows("Profile").map((r) => [r.label, !!r.step]), [["PROFILE WINDS", false]]); // no winds aloft data
});

test("map setup: AIRWAYS is Off, All, LO Only or HI Only, as the AIRWAYS key cycles", () => {
  const r = row("Airways", "AIRWAYS");
  let s = settings;
  const seen = [r.value(s)];
  for (let i = 0; i < 4; i++) seen.push(r.value((s = { ...s, ...r.step(s, 1) })));
  assert.deepEqual(seen, ["Off", "All", "LO Only", "HI Only", "HI Only"]);
  assert.equal(r.value({ ...s, ...r.step(s, -1) }), "LO Only");
});

test("map setup: airway ranges default to 200 and 300 nm and step through the map ranges up to 500", () => {
  const [lo, hi] = [row("Airways", "LOW ALT AIRWAY"), row("Airways", "HI ALT AIRWAY")];
  assert.deepEqual([lo.value(settings), hi.value(settings)], ["200nm", "300nm"]);
  assert.deepEqual(lo.step(settings, -1), { airwayRange: { LO: 100, HI: 300 } });
  assert.deepEqual(lo.step(settings, 1), { airwayRange: { LO: 500, HI: 300 } });
  assert.deepEqual(hi.step({ ...settings, airwayRange: { LO: 200, HI: 500 } }, 1), { airwayRange: { LO: 200, HI: 500 } });
});

test("map setup: the Map group keeps orientation and track vector working", () => {
  assert.deepEqual(row("Map", "ORIENTATION").step(settings, 1), { orientation: "TRK UP" });
  assert.deepEqual(row("Map", "TRACK VECTOR").step(settings, 1), { trackVector: 30 });
  assert.equal(row("Map", "TRACK VECTOR").value({ ...settings, trackVector: 120 }), "On 2 min");
  assert.equal(row("Map", "AUTO ZOOM").step, undefined);
});

test("airways show up to the ranges MAP SETUP sets", () => {
  const V1 = { id: "V1", type: "LO", points: ["A", "B"] };
  const J2 = { id: "J2", type: "HI", points: ["A", "C"] };
  assert.deepEqual(shownAirways([V1, J2], 1, 250, { LO: 500, HI: 200 }), [V1]);
  assert.deepEqual(shownAirways([V1, J2], 1, 250), [J2]); // the defaults
});
