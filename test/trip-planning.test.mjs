// AUX - TRIP PLANNING's sums (Pilot's Guide): the leg, fuel, density altitude, true airspeed, sunrise and sunset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { densityAltitude, fuelStats, sunTimes, tripLeg, trueAirspeed } from "../dist/trip-planning.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);

test("trip planning: fuel from groundspeed, fuel flow, fuel on board and the time en route", () => {
  const f = fuelStats(120, 10, 40, 1.5);
  assert.deepEqual(f, { efficiency: 12, endurance: 4, remFuel: 25, remEndurance: 2.5, fuelReq: 15, range: 480 });
});

test("trip planning: no fuel flow or groundspeed gives no sums that divide by them", () => {
  const f = fuelStats(0, 0, 40, null);
  assert.deepEqual(f, { efficiency: null, endurance: null, remFuel: null, remEndurance: null, fuelReq: null, range: null });
});

test("trip planning: density altitude, 5000 ft at 29.92 and 25°C is about 7400 ft", () => {
  near(densityAltitude(5000, 29.92, 25), 7400, 150);
  near(densityAltitude(0, 29.92, 15), 0, 1); // standard day
  near(densityAltitude(0, 28.92, 15), 1000 + 118.8 * 2, 1); // 1000 ft of pressure altitude, 2° warmer than its ISA
});

test("trip planning: true airspeed, 120 KCAS at 8000 ft standard is about 136 KTAS", () => {
  near(trueAirspeed(120, 8000, 29.92, 15 - 16), 136, 2);
  near(trueAirspeed(120, 0, 29.92, 15), 120, 0.5);
});

test("trip planning: sunrise and sunset at Phoenix on 21 June 2026", () => {
  const { rise, set } = sunTimes(33.43, -112.01, Date.UTC(2026, 5, 21, 19));
  near(rise, Date.UTC(2026, 5, 21, 12, 19), 4 * 60_000, "rise"); // 05:19 MST
  near(set, Date.UTC(2026, 5, 22, 2, 42), 4 * 60_000, "set"); // 19:42 MST
});

test("trip planning: no sunrise in the polar night", () => {
  assert.deepEqual(sunTimes(80, 0, Date.UTC(2026, 11, 21, 12)), { rise: null, set: null });
});

const pts = [
  { id: "A", type: "FIX", lat: 33, lon: -112 },
  { id: "B", type: "FIX", lat: 34, lon: -112 },
  { id: "C", type: "FIX", lat: 34, lon: -111 },
];
const s = { lat: 33.5, lon: -112, magVar: 10, route: ["A", "B", "C"], activeLeg: 1, points: pts, airports: [] };

test("trip planning: the active leg runs from the aircraft, a later leg from its waypoint before", () => {
  const act = tripLeg(s, 1);
  near(act.dis, 30, 0.1);
  near(act.dtk, 350, 0.1); // 360° true, 10° east variation
  const next = tripLeg(s, 2);
  near(next.dis, 60 * Math.cos((34 * Math.PI) / 180), 0.5);
});

test("trip planning: REM is the rest of the flight plan from the aircraft", () => {
  const rem = tripLeg(s, "REM");
  near(rem.dis, 30 + tripLeg(s, 2).dis, 1e-9);
  assert.equal(rem.dtk, null);
  assert.deepEqual(tripLeg({ ...s, route: [] }, "REM"), { dis: null, dtk: null });
});
