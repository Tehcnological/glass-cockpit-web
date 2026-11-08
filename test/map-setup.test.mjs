// MAP SETUP on the navigation map: orientation and the track vector (Pilot's Guide).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ORIENTATIONS, TRACK_VECTOR, mapUp, trackVectorEnd } from "../dist/map.js";

const s = { heading: 30, track: 40, dtk: 50 };

test("the four orientations turn the map to north, track, desired track or heading", () => {
  assert.deepEqual(ORIENTATIONS, ["NORTH UP", "TRK UP", "DTK UP", "HDG UP"]);
  assert.deepEqual(ORIENTATIONS.map((orientation) => mapUp({ ...s, orientation })), [0, 40, 50, 30]);
});

test("DTK UP with no desired track turns to the track; pan mode holds its own rotation", () => {
  assert.equal(mapUp({ ...s, dtk: null, orientation: "DTK UP" }), 40);
  assert.equal(mapUp({ ...s, orientation: "HDG UP", up: 7 }), 7);
});

test("the track vector reaches where the aircraft will be after the look-ahead time", () => {
  assert.deepEqual(TRACK_VECTOR, [0, 30, 60, 120, 300, 600, 1200]);
  const end = trackVectorEnd({ lat: 0, lon: 0, track: 90, groundspeed: 120 }, 60); // 2 nm east
  assert.ok(Math.abs(end.lon - 2 / 60) < 1e-9 && Math.abs(end.lat) < 1e-9);
});

test("track, desired track and heading are magnetic: the map turns to them plus the variation", () => {
  assert.deepEqual(ORIENTATIONS.slice(1).map((orientation) => mapUp({ ...s, magVar: 10, orientation })), [50, 60, 40]);
  const end = trackVectorEnd({ lat: 0, lon: 0, track: 80, groundspeed: 120, magVar: 10 }, 60);
  assert.ok(Math.abs(end.lon - 2 / 60) < 1e-9 && Math.abs(end.lat) < 1e-9);
});
