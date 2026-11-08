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
