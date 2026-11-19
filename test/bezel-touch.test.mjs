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
    // As Chrome: only a touch is captured on press; releasing a pointer that is not captured throws.
    captured: false,
    hasPointerCapture() { return this.captured; },
    releasePointerCapture() { if (!this.captured) throw new Error("NotFoundError"); this.captured = false; this.released = true; },
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
  const press = (target, type, extra = {}) => {
    if (type === "pointerdown" && extra.pointerType === "touch") target.captured = true;
    layer.fire(type, { button: 0, pointerId: 1, target, shiftKey: false, ...extra });
  };
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

test("arrows grow wherever any input is touch, not only when touch is the primary pointer", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/bezel.ts", import.meta.url), "utf8");
  assert.match(src, /matchMedia\("\(any-pointer: coarse\)"\)\.matches \? TOUCH_PAD : 0/);
});

test("a pen press, which the browser does not capture, still turns an arrow and long-presses", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { inputs, layer, rect, press } = bezel();
  const arrow = layer.children.find((c) => c.dataset.spot === String(SPOTS.findIndex((s) => s.arrow === "drawn" && s.click === "HEADING" && s.value === 1)));
  press(arrow, "pointerdown", { pointerType: "pen" });
  press(arrow, "pointerup", { pointerType: "pen" });
  press(rect("CLR"), "pointerdown", { pointerType: "pen" });
  t.mock.timers.tick(2000);
  assert.deepEqual(inputs, ["HEADING", "CLR_HOLD"]);
});

test("a touch slid from one key to another does nothing, and its late click on the layer finds no key", () => {
  const { inputs, layer, rect, press } = bezel();
  press(rect("ENT"), "pointerdown", { pointerType: "touch" });
  press(rect("MENU"), "pointerup", { pointerType: "touch" });
  layer.fire("click", { button: 0, pointerId: 1, target: layer, shiftKey: false }); // the common ancestor
  assert.deepEqual(inputs, []);
  layer.fire("click", { button: 0, pointerId: 1, target: layer, shiftKey: false }); // a mouse click between spots
  assert.deepEqual(inputs, [], "an element with no data-spot is no spot (Number(null) is 0, NAV's volume knob)");
});

test("a pen's barrel button, or a press begun off the bezel, fires no key on lift", () => {
  const { inputs, rect, press } = bezel();
  const ent = rect("ENT");
  press(ent, "pointerdown", { pointerType: "pen" });
  press(ent, "pointerup", { pointerType: "pen" });
  assert.deepEqual(inputs, ["ENT"]);
  press(ent, "pointerdown", { pointerType: "pen", button: 2 });
  press(ent, "pointerup", { pointerType: "pen", button: 2 });
  assert.deepEqual(inputs, ["ENT"], "barrel button");
  press(ent, "pointerup", { pointerType: "pen" }); // went down off the layer
  assert.deepEqual(inputs, ["ENT"], "no press on the bezel");
});

test("right-click keeps the browser's menu for the mouse; touch and pen get none", () => {
  const { layer } = bezel();
  const menu = (pointerType) => { let prevented = false; layer.fire("contextmenu", { pointerType, preventDefault: () => (prevented = true) }); return prevented; };
  assert.equal(menu("mouse"), false);
  assert.equal(menu(undefined), false, "a plain MouseEvent (no pointerType) is the mouse");
  assert.equal(menu("touch"), true);
  assert.equal(menu("pen"), true);
});
