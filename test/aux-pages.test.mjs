// AUX - SYSTEM SETUP and AUX - UTILITY, as the Pilot's Guide describes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETUP_FIELDS, Utility, airportMatches, clockText, dataBar, setupDefaults, setupValue, stepSetup } from "../dist/aux-pages.js";

const rwy = (length, surface) => ({ id: "18-36", length, width: 100, surface });
const apt = (...runways) => ({ id: "KAAA", name: "A", lat: 0, lon: 0, elev: 0, runways, freqs: [], approaches: [] });

test("nearest airport criteria: surface and minimum runway length", () => {
  const s = setupDefaults(0);
  assert.equal(s.surface, "HARD/SOFT");
  assert.ok(airportMatches(apt(rwy(2000, "TURF")), s));
  assert.ok(!airportMatches(apt(rwy(2000, "WATER")), s));
  assert.ok(!airportMatches(apt(rwy(2000, "TURF")), { surface: "HARD ONLY", minLength: 0 }));
  assert.ok(airportMatches(apt(rwy(2000, "TURF"), rwy(5000, "ASPH-G")), { surface: "HARD ONLY", minLength: 4000 }));
  assert.ok(!airportMatches(apt(rwy(3000, "ASPH")), { surface: "HARD ONLY", minLength: 4000 }));
  assert.ok(airportMatches(apt(rwy(3000, "WATER")), { surface: "WATER", minLength: 0 }));
  assert.ok(airportMatches(apt(), { surface: "HARD ONLY", minLength: 4000 }), "no runway data: kept, it cannot be judged");
});

test("the clock: local 12 and 24 hour with the offset, or UTC", () => {
  const t = Date.UTC(2026, 10, 8, 21, 5, 9);
  assert.equal(clockText(t, { timeFormat: "UTC", offset: -420 }), "21:05:09UTC");
  assert.equal(clockText(t, { timeFormat: "LOCAL 24hr", offset: -420 }), "14:05:09");
  assert.equal(clockText(t, { timeFormat: "LOCAL 12hr", offset: -420 }), "02:05:09pm");
  assert.equal(clockText(t, { timeFormat: "LOCAL 12hr", offset: -420 }, false), "02:05pm");
});

test("the data bar fields", () => {
  const s = {
    groundspeed: 120, dtk: 10, track: 4, ete: 600, lat: 0, lon: 0, magVar: 0, points: [{ id: "A", type: "FIX", lat: 1, lon: 0 }], airports: [],
    route: ["A"], activeLeg: 0, engine: { fuelLeft: 20, fuelRight: 20, fuelFlow: 10 },
  };
  const set = setupDefaults(0);
  const v = (f) => dataBar(f, s, Date.UTC(2026, 0, 1, 12, 0, 0), set);
  assert.deepEqual(set.dataBar, ["GS", "DTK", "TRK", "ETE"]);
  assert.equal(v("GS"), "120kts");
  assert.equal(v("BRG"), "000°");
  assert.equal(v("DIS"), "60.0nm");
  assert.equal(v("ETE"), "10:00");
  assert.equal(v("ETA"), "12:10pm");
  assert.equal(v("FOB"), "40gl");
  assert.equal(v("END"), "04:00");
  assert.equal(v("TKE"), "6°");
  assert.equal(dataBar("BRG", { ...s, route: [] }, 0, set), "___°");
});

test("system setup fields step with the small knob", () => {
  const s = setupDefaults(0);
  const at = (label, i = 0) => SETUP_FIELDS.findIndex((f) => f.label === label) + i;
  stepSetup(s, at("FORMAT"), 1);
  assert.equal(setupValue(s, at("FORMAT")), "LOCAL 24hr");
  stepSetup(s, at("OFFSET"), -3);
  assert.equal(setupValue(s, at("OFFSET")), "-01:30");
  stepSetup(s, at("FIELD 1"), 1);
  assert.equal(s.dataBar[0], "TKE");
  stepSetup(s, at("CHANGE ON 1ST CLICK"), 1);
  assert.equal(s.firstClick, true);
  for (let i = 0; i < 20; i++) stepSetup(s, at("TIMEOUT SECONDS"), 1);
  assert.equal(s.timeout, 10);
  stepSetup(s, at("RUNWAY SURFACE"), 1);
  assert.equal(s.surface, "WATER");
  stepSetup(s, at("MINIMUM LENGTH"), -1);
  assert.equal(s.minLength, 0);
  stepSetup(s, at("MINIMUM LENGTH"), 25);
  assert.equal(setupValue(s, at("MINIMUM LENGTH")), "2500FT");
});

test("generic timer: START?, STOP?, RESET?; a countdown reaching zero counts up", () => {
  const u = new Utility(0);
  assert.equal(u.label(), "START?");
  u.action(0);
  assert.equal(u.label(), "STOP?");
  u.action(65_000);
  assert.deepEqual([u.label(), u.timer(99_000)], ["RESET?", 65]);
  u.action(99_000);
  assert.deepEqual([u.label(), u.timer(99_000)], ["START?", 0]);
  u.field("dir", 1, 0); // DN
  u.field("time", 2, 0); // 2 minutes
  u.action(0);
  assert.equal(u.timer(30_000), 90);
  u.action(30_000);
  u.action(30_000); // reset before zero: back to the starting time
  assert.equal(u.timer(30_000), 120);
  u.action(0);
  assert.equal(u.timer(130_000), 10, "past zero it counts up");
});

test("flight and departure timers: from power on or lift off, and reset", () => {
  const u = new Utility(1000);
  assert.equal(u.flight(61_000), 60);
  u.field("flight", 1, 0); // IN-AIR
  assert.equal(u.flight(61_000), null);
  u.tick(40, 70_000);
  assert.equal(u.flight(100_000), 30);
  assert.equal(u.departure(100_000), 1000);
  u.field("departure", 1, 0);
  assert.equal(u.departure(100_000), 70_000);
  u.reset("flight", 90_000);
  assert.equal(u.flight(100_000), 10);
});

test("trip statistics: odometers, average and maximum groundspeed, and their resets", () => {
  const u = new Utility(0);
  u.tick(0, 0);
  u.tick(120, 30_000); // 30 s at 120 kt: 1 nm
  u.tick(60, 60_000); // 30 s at 60 kt: 0.5 nm
  assert.deepEqual([u.odom, u.trip, u.maxGs], [1.5, 1.5, 120]);
  assert.equal(u.avgGs(), 90);
  u.tick(100, 10 * 60_000); // a gap over a minute is not flown
  assert.equal(u.odom, 1.5);
  u.reset("trip", 0);
  assert.deepEqual([u.odom, u.trip, u.avgGs()], [1.5, 0, 0]);
  u.reset("all", 0);
  assert.deepEqual([u.odom, u.maxGs], [0, 0]);
});
