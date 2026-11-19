// Knobs by touch or pen (knob-touch.ts) through bezelInput, on a fake DOM: node --test (after npm run build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOTS, bezelInput } from "../dist/bezel.js";
import { GUARD_MS, IDLE_MS, MOVE_PX, SLIDE_PX, TAP_MS } from "../dist/knob-touch.js";

const winOn = {};
function el() {
  const on = {};
  return {
    children: [], dataset: {}, attrs: {}, classList: { add() {} }, textContent: "", parent: null,
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() { const p = this.parent; if (p) p.children.splice(p.children.indexOf(this), 1); this.parent = null; },
    contains(n) { for (; n; n = n.parent) if (n === this) return true; return false; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k === "data-spot" ? this.dataset.spot ?? null : this.attrs[k] ?? null; },
    addEventListener(t, f) { (on[t] ??= []).push(f); },
    fire(t, e) { for (const f of on[t] ?? []) f(e); },
    releasePointerCapture() {},
    getBoundingClientRect() { return { width: 1012 }; }, // an iPad mini's landscape bezel
  };
}
globalThis.document = { createElementNS: () => el() };
globalThis.window = {
  addEventListener(t, f) { (winOn[t] ??= []).push(f); }, removeEventListener() {},
  setTimeout: (...a) => setTimeout(...a),
};

let now = 0;
function bezel() {
  for (const k of Object.keys(winOn)) delete winOn[k];
  const inputs = [];
  const svg = el();
  bezelInput(svg, (i) => inputs.push(`${i.control} ${i.value}`));
  const layer = svg.children[0];
  const knob = (click) => layer.children.find((c) => c.dataset.spot === String(SPOTS.findIndex((s) => s.click === click && !s.arrow)));
  const pop = () => svg.children.find((c) => c.attrs["data-gcw-pop"] !== undefined);
  const key = (label) => { const g = pop(); const i = g.children.findIndex((c) => c.textContent === label); return g.children[i - 1]; };
  // A pointer event as the browser sends it: window (capture) first, then the target, bubbling to the layer.
  const ev = (target, type, x = 0, y = 0, dt = 0, pointerType = "touch") => {
    now += dt;
    const e = { button: 0, pointerId: 1, pointerType, target, clientX: x, clientY: y, timeStamp: now, shiftKey: false };
    if (type === "pointerdown") for (const f of winOn.pointerdown ?? []) f(e);
    if (type === "pointermove") for (const f of winOn.pointermove ?? []) f(e);
    target.fire?.(type, e);
    if (layer.contains(target) && target !== layer) layer.fire(type, e);
  };
  const tap = (target, ms = 100) => (ev(target, "pointerdown"), ev(target, "pointerup", 0, 0, ms), ev(target, "click"));
  return { inputs, svg, layer, knob, pop, key, ev, tap };
}

test("a single knob: a tap pushes, a slide turns and never pushes, a long still press does nothing", () => {
  const { inputs, knob, ev, tap } = bezel();
  const hdg = knob("HEADING_PRESS");
  tap(hdg);
  assert.deepEqual(inputs, ["HEADING_PRESS 1"]);
  inputs.length = 0;
  ev(hdg, "pointerdown", 100, 100);
  ev(hdg, "pointermove", 100, 100 - MOVE_PX - 2 * SLIDE_PX); // up, clockwise
  ev(hdg, "pointerup", 100, 100 - MOVE_PX - 2 * SLIDE_PX, 50);
  ev(hdg, "click");
  assert.deepEqual(inputs, ["HEADING 1", "HEADING 1"]); // 38 px from the start: two whole detents
  inputs.length = 0;
  ev(hdg, "pointerdown", 0, 0);
  ev(hdg, "pointermove", -(MOVE_PX + SLIDE_PX), 3); // left, counterclockwise; the axis is locked, the wobble ignored
  ev(hdg, "pointermove", -(MOVE_PX + SLIDE_PX), 40);
  ev(hdg, "pointerup", -(MOVE_PX + SLIDE_PX), 40, 50);
  assert.deepEqual(inputs, ["HEADING -1"]); // 24 px: one detent
  inputs.length = 0;
  tap(hdg, TAP_MS + 1);
  ev(hdg, "pointerdown", 0, 0);
  ev(hdg, "pointermove", MOVE_PX - 1, 0);
  ev(hdg, "pointerup", MOVE_PX - 1, 0, 50);
  assert.deepEqual(inputs, ["HEADING_PRESS 1"], "the held press did nothing; the small wobble still pushed");
});

test("a dual knob: a tap opens the popout, whose keys turn the rings and repeat while held", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { inputs, knob, pop, key, ev, tap } = bezel();
  tap(knob("ALT_PRESS"));
  assert.ok(pop(), "open");
  assert.deepEqual(inputs, []);
  ev(key("▶▶"), "pointerdown", 0, 0, GUARD_MS);
  t.mock.timers.tick(350);
  t.mock.timers.tick(90);
  ev(key("▶▶"), "pointerup");
  t.mock.timers.tick(1000);
  assert.deepEqual(inputs, ["ALT_OUTER 1", "ALT_OUTER 1", "ALT_OUTER 1"]);
  inputs.length = 0;
  ev(key("◀"), "pointerdown", 0, 0, 10);
  ev(key("◀"), "pointerout");
  t.mock.timers.tick(1000);
  assert.deepEqual(inputs, ["ALT_INNER -1"], "sliding off a key stops it");
});

test("the popout ignores input just after it opens", () => {
  const { inputs, knob, key, ev, tap } = bezel();
  tap(knob("FMS_CRSR"));
  ev(key("▶"), "pointerdown", 0, 0, GUARD_MS - 50);
  ev(key("▶"), "pointerup");
  assert.deepEqual(inputs, []);
});

test("PUSH acts on lift over the same key", () => {
  const { inputs, knob, key, ev, tap } = bezel();
  tap(knob("FMS_CRSR"));
  ev(key("CRSR"), "pointerdown", 0, 0, GUARD_MS);
  assert.deepEqual(inputs, []);
  ev(key("CRSR"), "pointerup");
  assert.deepEqual(inputs, ["FMS_CRSR 1"]);
  ev(key("CRSR"), "pointerdown", 0, 0, 10);
  ev(key("CRSR"), "pointerout");
  ev(key("CRSR"), "pointerup");
  assert.deepEqual(inputs, ["FMS_CRSR 1"]);
});

test("a tap on the popout's knob closes it and pushes the knob", () => {
  const { inputs, knob, pop, tap } = bezel();
  tap(knob("CRS_CENTER"));
  tap(knob("CRS_CENTER"));
  assert.equal(pop(), undefined);
  assert.deepEqual(inputs, ["CRS_CENTER 1"]);
});

test("a tap outside closes the popout and does nothing else", () => {
  const { inputs, knob, pop, tap } = bezel();
  tap(knob("COM_TOGGLE"));
  tap(knob("ENT"));
  assert.equal(pop(), undefined);
  tap(knob("ALT_PRESS"));
  assert.ok(pop(), "another dual knob opens on its own next tap");
  assert.deepEqual(inputs, []);
});

test("the popout closes after IDLE_MS without input", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { knob, pop, tap } = bezel();
  tap(knob("NAV_TOGGLE"));
  t.mock.timers.tick(IDLE_MS - 1);
  assert.ok(pop());
  t.mock.timers.tick(1);
  assert.equal(pop(), undefined);
});

test("RANGE: the joystick's directions, PAN and range", () => {
  const { inputs, knob, key, ev, tap } = bezel();
  tap(knob("JOYSTICK_PRESS"));
  const press = (label) => (ev(key(label), "pointerdown", 0, 0, GUARD_MS), ev(key(label), "pointerup"));
  press("▲"); press("↗"); press("−"); press("PAN");
  assert.deepEqual(inputs, ["JOYSTICK_VERTICAL -1", "JOYSTICK_HORIZONTAL 1", "JOYSTICK_VERTICAL -1", "RANGE -1", "JOYSTICK_PRESS 1"]);
});

test("popout keys are a finger's size on an iPad mini, and the popout stays inside the art", () => {
  const { knob, pop, tap } = bezel();
  for (const click of ["JOYSTICK_PRESS", "ALT_PRESS", "NAV_TOGGLE", "FMS_CRSR"]) {
    tap(knob(click));
    const [, bg, k] = pop().children;
    assert.ok(+k.attrs.width * (1012 / 1407) >= 44, `${click} key`);
    assert.ok(+bg.attrs.y >= 132 && +bg.attrs.y + +bg.attrs.height <= 132 + 918, `${click} inside vertically`);
    assert.ok(+bg.attrs.x >= 1 && +bg.attrs.x + +bg.attrs.width <= 1408, `${click} inside horizontally`);
    tap(knob("ENT")); // close
  }
});

test("the mouse never opens a popout: a click pushes the knob", () => {
  const { inputs, knob, pop, ev } = bezel();
  const alt = knob("ALT_PRESS");
  for (const type of ["pointerdown", "pointerup", "click"]) ev(alt, type, 0, 0, 10, "mouse");
  assert.equal(pop(), undefined);
  assert.deepEqual(inputs, ["ALT_PRESS 1"]);
});
