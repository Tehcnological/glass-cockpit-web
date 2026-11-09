// Approach suspend (SUSP) and missed approach sequencing (Pilot's Guide).
import { test } from "node:test";
import assert from "node:assert/strict";
import { approachPatch, approachPoints, directToPatch, missedPatch, pastMap, resumePatch, suspended } from "../dist/nav.js";
import { ProcFlow } from "../dist/procedures.js";

const leg = (fix, lat, role) => ({ fix, lat, lon: -112, type: "TF", alt: null, role });
const legs = [leg("ONEIF", 33.25, "IF"), leg("TWOFA", 33.32, "FAF"), leg("RW36", 33.395, "MAP"), leg("THREE", 33.5, "MISSED")];
const proc = (l = legs) => ({ airport: "KAAA", name: "RNAV (GPS) RWY 36", transitions: { VECTORS: [] }, legs: l });
const airports = [{ id: "KAAA", name: "Demo Field", lat: 33.4, lon: -112, elev: 1200, runways: [], freqs: [], approaches: [] }];
// En route ABC, KAAA, then the approach: ONEIF 2, TWOFA 3, RW36 (MAP) 4, THREE (missed) 5.
const plan = (lat, l = legs) => ({
  points: [{ id: "ABC", type: "VOR", lat: 33.5, lon: -111.85 }], airports, procedures: [proc(l)],
  route: ["ABC", "KAAA", ...approachPoints(proc(l), "VECTORS")], activeLeg: 4, directFrom: null, vtf: false, susp: false, lat, lon: -112,
});

test("past the active missed approach point, along the final course", () => {
  assert.equal(pastMap(plan(33.39)), false, "short of the MAP");
  assert.equal(pastMap(plan(33.40)), true, "past it");
  assert.equal(pastMap({ ...plan(33.40), activeLeg: 3 }), false, "the FAF active");
  // A direct-to the MAP from past it flies back to it: not past until the aircraft crosses it again.
  assert.equal(pastMap({ ...plan(33.45), directFrom: { lat: 33.45, lon: -112 } }), false);
  assert.equal(pastMap({ ...plan(33.38), directFrom: { lat: 33.45, lon: -112 } }), true);
});

test("sequencing suspends at the MAP, which stays active, until it is no longer the active waypoint", () => {
  assert.equal(suspended(plan(33.39)), false);
  assert.equal(suspended(plan(33.40)), true);
  assert.equal(suspended({ ...plan(33.39), susp: true }), true, "stays suspended once set, wherever the aircraft goes");
  assert.equal(suspended({ ...plan(33.40), susp: true, activeLeg: 5 }), false, "the missed approach active");
  assert.equal(suspended({ ...plan(33.40), susp: true, route: [], activeLeg: 0 }), false, "the plan deleted");
  assert.equal(suspended({ ...plan(33.40), obs: true }), false, "not in OBS mode");
  assert.equal(suspended({ ...plan(33.40), obs: true, susp: true }), false, "OBS wins over a shared susp");
  // An approach with no missed approach legs holds the MAP too.
  assert.equal(suspended(plan(33.40, legs.slice(0, 3))), true);
});

test("SUSP and ACTIVATE MISSED APPROACH: the first missed approach leg active", () => {
  const s = plan(33.40);
  assert.deepEqual(missedPatch(s.route, null), { activeLeg: 5, directFrom: null, vtf: false, susp: false });
  assert.deepEqual(missedPatch(s.route, { lat: 33.4, lon: -112 }), { activeLeg: 5, directFrom: { lat: 33.4, lon: -112 }, vtf: false, susp: false });
  assert.equal(missedPatch(plan(33.40, legs.slice(0, 3)).route, null), null, "no missed approach");
  // The SUSP key at the MAP: the same patch, and nothing without a missed approach.
  assert.deepEqual(resumePatch(s), missedPatch(s.route, null));
  assert.equal(resumePatch(plan(33.40, legs.slice(0, 3))), null);
});

const activateMissed = (s) => {
  const h = { s, changes: [] };
  h.flow = new ProcFlow({ s: () => h.s, change: (p) => h.changes.push(p), close: () => {} });
  h.flow.open();
  h.flow.fms(true, -1); // from SELECT APPROACH up to ACTIVATE MISSED APPROACH
  h.flow.ent();
  return h.changes[0];
};

test("ACTIVATE MISSED APPROACH flies the leg from the MAP, as SUSP does, short of it or past it", () => {
  assert.deepEqual(activateMissed({ ...plan(33.30), activeLeg: 3 }), { activeLeg: 5, directFrom: null, vtf: false, susp: false });
  assert.deepEqual(activateMissed({ ...plan(33.42), susp: true }), { activeLeg: 5, directFrom: null, vtf: false, susp: false });
});

test("loading an approach and a direct-to clear SUSP", () => {
  const s = plan(33.40);
  assert.equal(approachPatch(s.route, approachPoints(proc(), "VECTORS"), "load", s).susp, false);
  assert.equal(directToPatch(s, s.route[4]).susp, false, "even direct to the MAP");
  assert.equal(directToPatch(s, s.points[0]).susp, false);
});
