// The cursor box: moving it off a row leaves the row's own color alone.
import { test } from "node:test";
import assert from "node:assert/strict";

const el = () => ({
  style: {},
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k] ?? null; },
  querySelector: () => null,
  before() {},
  getBBox: () => ({ x: 0, y: 0, width: 10, height: 10 }),
});
globalThis.document = { createElementNS: () => el() };
const { Highlighter } = await import("../dist/ui.js");

test("a row recolored while highlighted keeps its color when the cursor leaves", () => {
  const hl = new Highlighter();
  const row = el();
  hl.set(row, true);
  assert.equal(row.style.fill, "#000000");
  row.style.fill = "#00ffff"; // the page redraws the row's text in its own color, as PageMenuPage.draw does
  hl.set(row, false);
  assert.equal(row.style.fill, "#00ffff");
});

test("a row left black by the cursor goes back to its template color", () => {
  const hl = new Highlighter();
  const row = el();
  hl.set(row, true);
  hl.set(row, false);
  assert.equal(row.style.fill, "");
});
