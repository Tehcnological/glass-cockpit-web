// The PFD turn rate trend vector, as the Pilot's Guide describes it: the heading 6 seconds ahead, and an
// arrowhead past 4 deg/s.
import { test } from "node:test";
import assert from "node:assert/strict";
import { turnVector } from "../dist/glass-pfd.js";

test("turn vector: none when level", () => {
  assert.deepEqual(turnVector(0), { arc: "", arrow: "" });
});

test("turn vector: no arrowhead up to 4 deg/s", () => {
  const v = turnVector(3);
  assert.match(v.arc, /^M /);
  assert.equal(v.arrow, "");
  assert.equal(turnVector(-4).arrow, "");
});

test("turn vector: arrowhead past 4 deg/s, either way", () => {
  assert.match(turnVector(4.5).arrow, /^M .* Z$/);
  assert.match(turnVector(-6).arrow, /^M .* Z$/);
});

test("turn vector: right turns sweep clockwise, left turns counterclockwise", () => {
  assert.match(turnVector(2).arc, / 0 0 1 [\d.]+ [\d.]+$/);
  assert.match(turnVector(-2).arc, / 0 0 0 [\d.]+ [\d.]+$/);
});

test("turn vector: clamped to the band, 24° (4 deg/s in 6 s), with the arrow tip there", () => {
  assert.deepEqual(turnVector(10), turnVector(5));
  const tip = turnVector(5).arrow.match(/L ([\d.]+) ([\d.]+) L/).slice(1).map(Number);
  const [r, a] = [(145 + 170.5) / 2, (24 * Math.PI) / 180];
  assert.ok(Math.abs(tip[0] - (459.5 + r * Math.sin(a))) < 1e-6 && Math.abs(tip[1] - (586.5 - r * Math.cos(a))) < 1e-6, String(tip));
});
