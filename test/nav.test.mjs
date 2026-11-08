import { test } from "node:test";
import assert from "node:assert/strict";
import { approachPatch, asWaypoint, gpsApproved, loadedApproach, vtfLeg, vtfPatch } from "../dist/nav.js";

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
const pt = (id, role) => ({ id, type: "WPT", lat: 33, lon: -112, role });

test("vector-to-final from the FAF has no leg from the aircraft", () => {
  assert.deepEqual(vtfPatch(2, [pt("A", "IF"), pt("B", "FAF")], here), { activeLeg: 3, directFrom: null, vtf: true });
});

test("vector-to-final without a FAF to fly to goes direct from the aircraft", () => {
  assert.deepEqual(vtfPatch(2, [pt("B", "FAF"), pt("C", "MAP")], here), { activeLeg: 2, directFrom: here, vtf: true });
  assert.deepEqual(vtfPatch(0, [pt("A", "IAF"), pt("C", "MAP")], here), { activeLeg: 0, directFrom: here, vtf: true });
});

test("loading an approach clears vector-to-final; activating sets or clears it", () => {
  const pts = [pt("A", "IF"), pt("B", "FAF")];
  assert.deepEqual(approachPatch(["KAAA"], pts, "load", here), { route: ["KAAA", ...pts], vtf: false });
  assert.deepEqual(approachPatch(["KAAA"], pts, "activate", here), { route: ["KAAA", ...pts], activeLeg: 1, directFrom: here, vtf: false });
  assert.deepEqual(approachPatch(["KAAA"], pts, "vectors", here), { route: ["KAAA", ...pts], activeLeg: 2, directFrom: null, vtf: true });
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
