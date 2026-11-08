// DIRECT TO's lookup and activation, shared by the MFD page and the PFD window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { directToPatch, findPoint } from "../dist/nav.js";

const VOR = { id: "PXR", type: "VOR", lat: 33.4, lon: -111.9 };
const FAF = { id: "FAF", type: "WPT", lat: 33.5, lon: -112, approach: "RNAV 08", role: "FAF" };
const s = {
  points: [VOR], route: ["KPHX", FAF], activeLeg: 1, lat: 33, lon: -112,
  airports: [{ id: "KPHX", name: "Phoenix Sky Harbor", lat: 33.43, lon: -112.01, runways: [], frequencies: [], approaches: [] }],
};

test("findPoint looks in points, then the plan, then airports", () => {
  assert.equal(findPoint(s, "PXR"), VOR);
  assert.equal(findPoint(s, "FAF"), FAF);
  assert.equal(findPoint(s, "KPHX").type, "APT");
  assert.equal(findPoint(s, "NOPE"), undefined);
});

test("direct to a waypoint in the plan activates its leg from here", () => {
  assert.deepEqual(directToPatch(s, findPoint(s, "KPHX")), { activeLeg: 0, directFrom: { lat: 33, lon: -112 }, vtf: false });
});

test("direct to a waypoint off the plan makes it the plan", () => {
  assert.deepEqual(directToPatch(s, VOR), { route: ["PXR"], activeLeg: 0, directFrom: { lat: 33, lon: -112 }, vtf: false });
  const off = { ...s, route: [] };
  assert.deepEqual(directToPatch(off, FAF).route, [{ id: "FAF", type: "WPT", lat: 33.5, lon: -112 }], "an approach fix goes as a plain waypoint");
});
