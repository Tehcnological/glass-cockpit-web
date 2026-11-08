// NRST - NEAREST AIRPORTS: the navigation map draws a dashed white line from the aircraft to the selected airport
// (Pilot's Guide).
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawMap } from "../dist/map.js";

const geom = { x: 0, y: 0, w: 200, h: 200, cx: 100, cy: 100, px: 100 };
const base = { heading: 0, lat: 33, lon: -112, range: 10, orientation: "NORTH UP", points: [], airspaces: [], route: [], activeLeg: 0 };
const draw = (o) => {
  const g = { innerHTML: "", querySelectorAll: () => [] }; // the labels' boxes need a page; none here
  drawMap(g, { ...base, ...o }, geom);
  return g.innerHTML;
};
const dashed = (svg) => [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)" stroke="#ffffff"[^>]*stroke-dasharray/g)].map((m) => m.slice(1).map(Number));

test("nearest line: from the aircraft to the airport, dashed white", () => {
  const lines = dashed(draw({ nearestLine: { lat: 33 + 5 / 60, lon: -112 } })); // 5 nm north: half the range
  assert.equal(lines.length, 1);
  const [x1, y1, x2, y2] = lines[0];
  assert.deepEqual([x1, y1], [100, 100]);
  assert.ok(Math.abs(x2 - 100) < 1e-9 && Math.abs(y2 - 50) < 1e-6, String([x2, y2]));
});

test("nearest line: none without a selected airport", () => {
  assert.deepEqual(dashed(draw({})), []);
});
