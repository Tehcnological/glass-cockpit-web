// The demos' toy flight model (this package's own, not flight dynamics) and KitDemo.vue's autopilot wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as afcs from "../dist/afcs.js";
import * as main from "../dist/glass-pfd.js";

const { toyFly } = afcs;
const AC = { pitch: 0, roll: 0, ias: 100, vsi: 0, alt: 3000, heading: 90, course: 90, cdiDots: 0 };
const rad = Math.PI / 180;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test("toyFly: command bars above the pitch raise it at no more than 3°/s", () => {
  near(toyFly(AC, { pitch: 10, roll: 0 }, 0.1).pitch, 0.3);
  near(toyFly(AC, { pitch: 0.1, roll: 0 }, 0.1).pitch, 0.1);
  near(toyFly(AC, { pitch: -10, roll: 0 }, 0.1).pitch, -0.3);
});

test("toyFly: roll at no more than 8°/s, and a right bank turns the heading right", () => {
  const a = toyFly({ ...AC, roll: 20 }, { pitch: 0, roll: 30 }, 0.1);
  near(a.roll, 20.8);
  assert.ok(a.heading > 90);
  assert.ok(toyFly({ ...AC, roll: -20 }, { pitch: 0, roll: -20 }, 0.1).heading < 90);
  assert.ok(toyFly({ ...AC, heading: 359.9, roll: 30 }, { pitch: 0, roll: 30 }, 1).heading < 10, "wraps past 360");
});

test("toyFly: the demo's formulas", () => {
  const ac = { ...AC, pitch: 4, roll: 10, ias: 95, heading: 100, cdiDots: 0.5 };
  const dt = 0.05;
  const ias = 95 + Math.max(-2 * dt, Math.min(2 * dt, Math.max(55, 105 - 3 * (4 - 1)) - 95));
  const vsi = ias * 101.3 * Math.tan((4 - 1) * rad);
  const heading = (100 + ((1091 * Math.tan(10 * rad)) / (ias + 6)) * dt + 360) % 360;
  const cdiDots = Math.max(-2.4, Math.min(2.4, 0.5 - Math.sin((heading - 90) * rad) * (ias / 3600) * dt / 0.3));
  assert.deepEqual(toyFly(ac, { pitch: 4, roll: 10 }, dt), { pitch: 4, roll: 10, ias, vsi, alt: 3000 + (vsi * dt) / 60, heading, cdiDots });
  assert.equal(toyFly({ ...AC, cdiDots: 2.4, heading: 0 }, { pitch: 0, roll: 0 }, 0.1).cdiDots, 2.4, "CDI held to 2.4 dots");
});

test("toyFly is exported from the package's main entry", () => {
  assert.equal(typeof afcs.toyFly, "function");
  assert.equal(main.toyFly, afcs.toyFly);
});

test("KitDemo.vue owns an Afcs: takes Glass's key event, passes afcs and fd to the PFD, from the light export", () => {
  const kit = readFileSync(new URL("../vue/KitDemo.vue", import.meta.url), "utf8");
  assert.match(kit, /from "glass-cockpit-web\/afcs"/);
  assert.doesNotMatch(kit, /^import(?! type)[^\n]*from "glass-cockpit-web";/m, "no runtime import of the display bundle");
  assert.match(kit, /new Afcs\(\{ maxSpeed: 140 \}\)/);
  const tags = kit.match(/^\s*<Glass\b.*$/gm) ?? [];
  const pfd = tags.filter((t) => !t.includes('unit="mfd"'));
  const mfd = tags.filter((t) => t.includes('unit="mfd"'));
  assert.equal(pfd.length, 1);
  assert.equal(mfd.length, 1);
  assert.match(pfd[0], /:afcs="/);
  assert.match(pfd[0], /:fd="/);
  assert.match(pfd[0], /@aligned="/);
  assert.match(mfd[0], /@key="/);
  assert.match(kit, /cancelAnimationFrame/);
  assert.ok(kit.includes("(tick(), afcs.press(k), tick())"), "a key press feeds the sliders in first: Afcs.press acts on the last update");
  assert.ok(kit.includes('<output aria-live="off">'), "the readouts change 30 times a second while it flies: not live regions");
});

test("Glass.vue emits aligned when the PFD's AHRS has aligned", () => {
  const glass = readFileSync(new URL("../vue/Glass.vue", import.meta.url), "utf8");
  assert.match(glass, /aligned: \[\]/);
  assert.match(glass, /emit\("aligned"\)/);
  assert.match(glass, /!pfd\.aligning\) emit\("aligned"\)/, "and on mount when there is no alignment (startup: 0)");
});

test("package.json exports glass-cockpit-web/afcs, with no runtime import of the displays", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.exports["./afcs"], "./dist/afcs.js");
  const js = readFileSync(new URL("../dist/afcs.js", import.meta.url), "utf8");
  const imports = [...js.matchAll(/^import .* from "\.\/(.+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["page.js", "radio.js"]);
  for (const f of imports) assert.doesNotMatch(readFileSync(new URL(`../dist/${f}`, import.meta.url), "utf8"), /^import /m, `${f} imports nothing`);
});
