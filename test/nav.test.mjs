import { test } from "node:test";
import assert from "node:assert/strict";
import { approachPatch, asWaypoint, gpsApproved, loadedApproach, vtfEdit, vtfLeg, vtfPatch } from "../dist/nav.js";

test("which approaches the GPS may fly", () => {
  for (const n of ["RNAV (GPS) Y RWY 08", "RNAV (GPS)-D"]) assert.equal(gpsApproved(n), true, n);
  for (const n of ["ILS RWY 07L", "LOC RWY 21", "VOR/DME-A", "RNAV (RNP) Z RWY 03"]) assert.equal(gpsApproved(n), false, n);
});

test("vector-to-final activates the FAF, or the first leg without one", () => {
  assert.equal(vtfLeg([{ role: "IF" }, {}, { role: "FAF" }, { role: "MAP" }]), 2);
  assert.equal(vtfLeg([{ role: "IAF" }, { role: "MAP" }]), 0);
  assert.equal(vtfLeg([]), 0);
});

const here = { lat: 33.1, lon: -112 };
// Approach fixes as PROC loads them: marked with their approach.
const pt = (id, role) => ({ id, type: "WPT", lat: 33, lon: -112, role, approach: "ILS RWY 36" });

test("vector-to-final from the FAF has no leg from the aircraft", () => {
  assert.deepEqual(vtfPatch(2, [pt("A", "IF"), pt("B", "FAF")], here), { activeLeg: 3, directFrom: null, vtf: true });
});

test("vector-to-final without a FAF to fly to goes direct from the aircraft", () => {
  assert.deepEqual(vtfPatch(2, [pt("B", "FAF"), pt("C", "MAP")], here), { activeLeg: 2, directFrom: here, vtf: true });
  assert.deepEqual(vtfPatch(0, [pt("A", "IAF"), pt("C", "MAP")], here), { activeLeg: 0, directFrom: here, vtf: true });
});

test("loading an approach clears vector-to-final; activating sets or clears it", () => {
  const pts = [pt("A", "IF"), pt("B", "FAF")];
  assert.deepEqual(approachPatch(["KAAA"], pts, "load", here), { route: ["KAAA", ...pts], vtf: false, susp: false });
  assert.deepEqual(approachPatch(["KAAA"], pts, "activate", here), { route: ["KAAA", ...pts], activeLeg: 1, directFrom: here, vtf: false, susp: false });
  assert.deepEqual(approachPatch(["KAAA"], pts, "vectors", here), { route: ["KAAA", ...pts], activeLeg: 2, directFrom: null, vtf: true, susp: false });
});

test("a loaded approach is found by its marked fixes, not by point identity", () => {
  const wpt = { id: "WPONE", type: "WPT", lat: 33, lon: -112 }; // a host's en route point, not in `points`
  assert.equal(loadedApproach(["KAAA", wpt]), null);
  const a = { ...pt("A", "IF"), approach: "ILS RWY 36" };
  const b = { ...pt("B", "FAF"), approach: "ILS RWY 36" };
  assert.deepEqual(loadedApproach(["KAAA", wpt, a, b]), { start: 2, name: "ILS RWY 36", pts: [a, b] });
});

test("loading an approach keeps a host's en route point objects", () => {
  const wpt = { id: "WPONE", type: "WPT", lat: 33, lon: -112 };
  const old = { ...pt("Z", "FAF"), approach: "OLD" };
  const pts = [pt("A", "IF")];
  assert.deepEqual(approachPatch(["KAAA", wpt, old], pts, "load", here).route, ["KAAA", wpt, ...pts]);
});

test("a fix copied into the flight plan by hand is an ordinary waypoint", () => {
  const faf = { ...pt("B", "FAF"), approach: "ILS RWY 36" };
  const w = asWaypoint(faf);
  assert.equal(w.approach, undefined);
  assert.equal(w.role, undefined);
  assert.equal(w.id, "B");
  assert.equal(faf.approach, "ILS RWY 36"); // the loaded fix is unchanged
  const a = { ...pt("A", "IF"), approach: "ILS RWY 36" };
  assert.equal(loadedApproach(["KAAA", w, a, faf]).start, 2);
});

test("an edit at or before the active FAF ends vector-to-final and its intercept", () => {
  // The FAF is active at index 3; the intercept may start at any approach fix before it, or at the aircraft.
  assert.deepEqual(vtfEdit(true, 3, 3), { vtf: false, directFrom: null }); // just before the FAF, or the FAF itself
  assert.deepEqual(vtfEdit(true, 1, 3), { vtf: false, directFrom: null });
  assert.deepEqual(vtfEdit(true, 4, 3), { vtf: true }); // after the FAF
  // Without vector-to-final, a direct-to stays as it is.
  assert.deepEqual(vtfEdit(false, 1, 3), { vtf: false });
});

test("vector-to-final keeps the final course past a waypoint entered before the FAF", () => {
  const fix = { id: "A", type: "WPT", lat: 33.5, lon: -112.2, role: "IF", approach: "ILS RWY 36" };
  const user = { id: "USER", type: "WPT", lat: 34, lon: -111 };
  // The leg is drawn from the approach's own fix before the FAF, not the inserted waypoint.
  assert.deepEqual(vtfPatch(2, [fix, user, pt("B", "FAF")], here), { activeLeg: 4, directFrom: { lat: 33.5, lon: -112.2 }, vtf: true });
  // No approach fix before the FAF: direct from the aircraft.
  assert.deepEqual(vtfPatch(2, ["USER", pt("B", "FAF")], here), { activeLeg: 3, directFrom: here, vtf: true });
});

test("a published fix with no role before the FAF still starts its leg", () => {
  // As JAMIL before WAZUP in the KPHX CIFP fixture: a fix of the approach, no role.
  const jamil = { id: "JAMIL", type: "WPT", lat: 33.4, lon: -112.3, approach: "ILS RWY 08" };
  assert.deepEqual(vtfPatch(2, [pt("A", "IF"), jamil, pt("B", "FAF")], here), { activeLeg: 4, directFrom: null, vtf: true });
});
