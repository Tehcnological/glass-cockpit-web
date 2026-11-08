import { test } from "node:test";
import assert from "node:assert/strict";
import { gpsApproved, vtfLeg } from "../dist/nav.js";

test("which approaches the GPS may fly", () => {
  for (const n of ["RNAV (GPS) Y RWY 08", "RNAV (GPS)-D"]) assert.equal(gpsApproved(n), true, n);
  for (const n of ["ILS RWY 07L", "LOC RWY 21", "VOR/DME-A", "RNAV (RNP) Z RWY 03"]) assert.equal(gpsApproved(n), false, n);
});

test("vector-to-final activates the FAF, or the first leg without one", () => {
  assert.equal(vtfLeg([{ role: "IF" }, {}, { role: "FAF" }, { role: "MAP" }]), 2);
  assert.equal(vtfLeg([{ role: "IAF" }, { role: "MAP" }]), 0);
  assert.equal(vtfLeg([]), 0);
});
