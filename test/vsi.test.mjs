// The VSI: a +-2000 fpm scale, the readout in the pointer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vsiPointer, vsiText } from "../dist/vsi.js";

test("the readout rounds to 50 fpm and hides near level", () => {
  assert.equal(vsiText(0), "");
  assert.equal(vsiText(90), "");
  assert.equal(vsiText(-90), "");
  assert.equal(vsiText(100), "100");
  assert.equal(vsiText(730), "750");
  assert.equal(vsiText(-1260), "-1250");
  assert.equal(vsiText(3400), "3400"); // past the scale the pointer stops, the digits do not
});

test("the pointer reaches the 2000 fpm mark and stops just past it", () => {
  assert.equal(vsiPointer(0), 0);
  assert.equal(vsiPointer(2000), -2 * vsiPointer(-1000));
  assert.equal(vsiPointer(5000), vsiPointer(2250));
  assert.equal(vsiPointer(-5000), vsiPointer(-2250));
});
