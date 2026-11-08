// DIRECT TO's lookup and activation, shared by the MFD page and the PFD window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelDirectTo, directToPatch, findPoint } from "../dist/nav.js";

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

// Pilot's Guide: Cancel Direct-To NAV resumes the flight plan along the closest leg.
const wp = (id, lat) => ({ id, type: "WPT", lat, lon: -112 });
const plan = { points: [], airports: [], route: [wp("A", 33), wp("B", 33.5), wp("C", 34), wp("D", 34.5)], lon: -112, vtf: false };

test("cancel direct-to resumes the plan on the closest leg", () => {
  const s = { ...plan, activeLeg: 3, directFrom: { lat: 33.1, lon: -112 }, lat: 33.7 };
  assert.deepEqual(cancelDirectTo(s), { activeLeg: 2, directFrom: null, vtf: false }, "B to C is closest");
});

test("cancel direct-to off the plan ends navigation", () => {
  const s = { ...plan, route: [wp("X", 34)], activeLeg: 0, directFrom: { lat: 33, lon: -112 }, lat: 33 };
  assert.deepEqual(cancelDirectTo(s), { route: [], activeLeg: 0, directFrom: null, vtf: false });
});

test("cancel direct-to is dim with no direct-to, or on vector-to-final", () => {
  assert.equal(cancelDirectTo({ ...plan, activeLeg: 1, directFrom: null, lat: 33 }), null);
  assert.equal(cancelDirectTo({ ...plan, activeLeg: 1, directFrom: { lat: 33, lon: -112 }, vtf: true, lat: 33 }), null);
});
