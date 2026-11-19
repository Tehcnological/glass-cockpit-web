// Touch on the bezel, on a fake DOM just big enough for bezelInput: node --test (after npm run build).
// A touch press held past about half a second gets no click on Android (and likely iOS), so a touch acts on pointerup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOTS, bezelInput } from "../dist/bezel.js";

function el() {
  const on = {};
  return {
    children: [], dataset: {}, attrs: {}, classList: { add() {} }, textContent: "",
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k === "data-spot" ? this.dataset.spot ?? null : this.attrs[k] ?? null; },
    addEventListener(t, f) { (on[t] ??= []).push(f); },
    fire(t, e) { for (const f of on[t] ?? []) f(e); },
    releasePointerCapture() { this.released = true; },
  };
}
globalThis.document = { createElementNS: () => el() };
globalThis.window = { addEventListener() {}, setTimeout: (...a) => setTimeout(...a) };

function bezel() {
  const inputs = [];
  const svg = el();
  bezelInput(svg, (i) => inputs.push(i.control));
  const layer = svg.children[0];
  const rect = (click) => layer.children.find((c) => c.dataset.spot === String(SPOTS.findIndex((s) => s.click === click && !s.arrow)));
  const press = (target, type, extra = {}) => layer.fire(type, { button: 0, pointerId: 1, target, shiftKey: false, ...extra });
  return { inputs, layer, rect, press };
}

test("a touch tap acts on pointerup, once, whether or not a click follows", () => {
  const { inputs, rect, press } = bezel();
  const ent = rect("ENT");
  press(ent, "pointerdown", { pointerType: "touch" });
  press(ent, "pointerup", { pointerType: "touch" });
  assert.deepEqual(inputs, ["ENT"]);
  press(ent, "click", {});
  assert.deepEqual(inputs, ["ENT"]);
  press(ent, "pointerdown", { pointerType: "touch" });
  press(ent, "pointerup", { pointerType: "touch" });
  press(ent, "click", {});
  assert.deepEqual(inputs, ["ENT", "ENT"]);
});

test("a touch lifted on another key does nothing; capture is released so the finger can leave", () => {
  const { inputs, rect, press } = bezel();
  const ent = rect("ENT");
  press(ent, "pointerdown", { pointerType: "touch" });
  assert.ok(ent.released);
  press(rect("MENU"), "pointerup", { pointerType: "touch" });
  assert.deepEqual(inputs, []);
});

test("the mouse still acts on click", () => {
  const { inputs, rect, press } = bezel();
  const ent = rect("ENT");
  press(ent, "pointerdown", { pointerType: "mouse" });
  press(ent, "pointerup", { pointerType: "mouse" });
  assert.deepEqual(inputs, []);
  press(ent, "click", {});
  assert.deepEqual(inputs, ["ENT"]);
});

test("a touch held 2 s is one long press", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { inputs, rect, press } = bezel();
  const clr = rect("CLR");
  press(clr, "pointerdown", { pointerType: "touch" });
  t.mock.timers.tick(2000);
  press(clr, "pointerup", { pointerType: "touch" });
  press(clr, "click", {});
  assert.deepEqual(inputs, ["CLR_HOLD"]);
});

test("a display never double-tap zooms, wherever the browser honours touch-action", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/display.ts", import.meta.url), "utf8");
  assert.match(src, /role="img" style="\$\{NO_SELECT\};touch-action:manipulation"/);
});
