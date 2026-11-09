// Moving text keeps a tiny rotation so Chrome does not snap it to whole pixels (TEXT_GLIDE in page.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Page, TEXT_GLIDE } from "../dist/page.js";

const fake = (boxes) => {
  const e = {
    attrs: {},
    dataset: {},
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getBBox: () => boxes.shift(),
  };
  return { e, page: new Page({ querySelector: () => e }, "X") };
};
const rot = (e) => e.attrs.transform.match(/rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/)?.slice(1).map(Number);

test("a gliding element keeps at least TEXT_GLIDE of rotation, turning the way it was asked", () => {
  const { e, page } = fake(Array(4).fill({ x: 0, y: 0, width: 10, height: 10 }));
  page.tf("Tape", { ty: 3.4, glide: true });
  assert.equal(rot(e)[0], TEXT_GLIDE);
  page.tf("Tape", { rot: -0.02, glide: true });
  assert.equal(rot(e)[0], -TEXT_GLIDE);
  page.tf("Tape", { rot: 0.02, glide: true });
  assert.equal(rot(e)[0], TEXT_GLIDE);
  page.tf("Tape", { rot: 12, glide: true });
  assert.equal(rot(e)[0], 12);
});

test("a center measured while hidden (empty box) is measured again once laid out", () => {
  const { e, page } = fake([{ x: 0, y: 0, width: 0, height: 0 }, { x: 700, y: 100, width: 100, height: 300 }]);
  page.tf("Tape", { ty: 1, glide: true });
  page.tf("Tape", { ty: 2, glide: true });
  assert.deepEqual(rot(e).slice(1), [750, 250]);
});
