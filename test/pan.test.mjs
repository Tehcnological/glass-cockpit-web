// Map pan mode (joystick), as on the v13 trainer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PanIdle, panInfo, panMarkup, panMeasureFrom, panMove, panPoint, panProject, panStart, panTarget, panUnder, PAN_IDLE_MS, PAN_STEP, PAN_WPT_PAGES } from "../dist/pan.js";

// 100 px a nm, north up, a 400 x 300 px map.
const view = { w: 400, h: 300, scale: 100, up: 0, lat: 0 };
const here = { lat: 0, lon: 0 };

test("pan starts with the pointer on the aircraft, holding the map's rotation", () => {
  assert.deepEqual(panStart(here), { center: here, x: 0, y: 0, up: 0 });
  assert.equal(panStart(here, 270).up, 270, "a heading-up map stays still while panning");
});

test("the pointer stops below the info bar", () => {
  let p = panStart(here);
  for (let i = 0; i < 100; i++) p = panMove(p, 0, -1, { ...view, bar: 48 });
  assert.ok(p.y >= -150 + 48, "not under the bar");
  assert.ok(p.center.lat > 0, "the map moved north");
});

test("the joystick moves the pointer a step a click", () => {
  const p = panMove(panStart(here), 1, -1, view);
  assert.deepEqual([p.x, p.y], [PAN_STEP, -PAN_STEP]);
  assert.deepEqual(p.center, here);
});

test("at the edge of the map the map scrolls instead", () => {
  let p = panStart(here);
  for (let i = 0; i < 100; i++) p = panMove(p, 1, 0, view);
  assert.ok(p.x < 200, "the pointer stays on the map");
  assert.ok(p.center.lon > 0, "the map moved east");
  assert.equal(p.center.lat, 0);
});

test("the pointer's position and the info bar", () => {
  // 1 nm east of the aircraft: 100 px right.
  const p = { center: here, x: 100, y: 0 };
  const at = panPoint(p, view);
  assert.ok(Math.abs(at.lon - 1 / 60) < 1e-9 && Math.abs(at.lat) < 1e-9);
  assert.deepEqual(panInfo(p, view, here, [], 0), { label: "MAP POINTER", dis: "1.0NM", brg: "090°", lat: at.lat, lon: at.lon });
  // Magnetic bearing, feet close in, and a point under the pointer gives its id.
  const close = { center: here, x: 0, y: -5 };
  const info = panInfo(close, view, here, [{ id: "ABC", lat: 0.05 / 60, lon: 0 }], 10);
  assert.equal(info.label, "ABC");
  assert.equal(info.dis, "304FT");
  assert.equal(info.brg, "350°");
});

test("a range change recenters the map on the pointer", () => {
  const p = { center: here, x: 100, y: 0 };
  const t = panTarget(p, view);
  assert.deepEqual([t.x, t.y], [0, 0]);
  assert.deepEqual(t.center, panPoint(p, view));
});

test("the pointer names the closest point, not the first listed", () => {
  const p = { center: here, x: 0, y: 0 };
  const far = { id: "FAR", lat: 0.04 / 60, lon: 0 }; // 4 px away, listed first
  const on = { id: "ON", lat: 0, lon: 0 };
  assert.equal(panInfo(p, view, here, [far, on], 0).label, "ON");
});

test("the info bar escapes identifiers", () => {
  const info = { label: "<x>&", dis: "1.0NM", brg: "090°", lat: 0, lon: 0 };
  const svg = panMarkup({ center: here, x: 0, y: 0 }, info, { x: 0, y: 0, w: 200, h: 100, cx: 100, cy: 50 }, 18);
  assert.ok(!svg.includes("<x>") && svg.includes("&#60;x&#62;&#38;"));
});

// Pilot's Guide: Measure Bearing/Distance draws a dashed line from the start point, and ENT moves the start.
test("measuring: ENT moves the start point to the pointer", () => {
  const p = { ...panStart(here), x: 100, y: 0, from: here };
  const m = panMeasureFrom(p, view);
  assert.deepEqual(m.from, panPoint(p, view));
  assert.deepEqual([m.x, m.y], [100, 0], "the pointer stays");
});

test("measuring draws a dashed line from the start to the pointer", () => {
  const p = { ...panStart(here), x: 100, y: 0, from: here };
  const g = { x: 0, y: 0, w: 400, h: 300, cx: 200, cy: 150 };
  const info = { label: "MAP POINTER", dis: "1.0NM", brg: "090°", lat: 0, lon: 0 };
  assert.deepEqual(panProject(p, here, view).map((n) => n + 0), [0, 0]);
  const svg = panMarkup(p, info, g, 18, panProject(p, here, view));
  assert.match(svg, /<line x1="200" y1="150" x2="300" y2="150"[^>]*stroke-dasharray/);
  assert.doesNotMatch(panMarkup(p, info, g, 18), /<line/, "no line when panning");
});

// Pilot's Guide: the map pointer flashes. An SVG animation with no id, so the per-display id scoping is untouched.
test("the pointer flashes, about once a second, shown longer than hidden; the info bar does not", () => {
  const info = { label: "MAP POINTER", dis: "1.0NM", brg: "090°", lat: 0, lon: 0 };
  const svg = panMarkup(panStart(here), info, { x: 0, y: 0, w: 400, h: 300, cx: 200, cy: 150 }, 18);
  const m = svg.match(/<path[^>]*>(<animate [^>]*\/>)<\/path>/);
  assert.ok(m, "the animation is on the pointer");
  assert.match(m[1], /attributeName="visibility"/);
  assert.match(m[1], /values="visible;hidden"/);
  assert.match(m[1], /calcMode="discrete"/);
  assert.match(m[1], /dur="1s"/);
  assert.match(m[1], /repeatCount="indefinite"/);
  const shown = Number(m[1].match(/keyTimes="0;([\d.]+)"/)[1]);
  assert.ok(shown > 0.5 && shown < 1, "visible longer than hidden");
  assert.equal(svg.match(/<animate/g).length, 1);
  assert.doesNotMatch(svg, /\sid="/);
});

test("the point under the pointer, for ENT's waypoint information", () => {
  const p = { center: here, x: 0, y: 0 };
  const on = { id: "ON", type: "VOR", lat: 0, lon: 0 };
  assert.equal(panUnder(p, view, [{ id: "FAR", type: "FIX", lat: 1, lon: 1 }, on]), on);
  assert.equal(panUnder(p, view, [{ id: "FAR", type: "FIX", lat: 1, lon: 1 }]), undefined);
});

test("ENT opens the WPT page that fits the point; user waypoints have none here", () => {
  assert.deepEqual(PAN_WPT_PAGES, { APT: "AirportInfo", VOR: "VORInfo", NDB: "NDBInfo", FIX: "IntersectionInfo" });
  assert.equal(PAN_WPT_PAGES.WPT, undefined);
});

test("60 s with no joystick input ends pan mode", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(PAN_IDLE_MS, 60_000);
  let ended = 0;
  const idle = new PanIdle(() => ended++);
  idle.sync(true); // pan mode starts
  idle.sync(true); // redraws do not restart it
  t.mock.timers.tick(PAN_IDLE_MS - 1);
  assert.equal(ended, 0);
  idle.moved(); // a joystick move restarts it
  t.mock.timers.tick(PAN_IDLE_MS - 1);
  assert.equal(ended, 0);
  t.mock.timers.tick(1);
  assert.equal(ended, 1);
  idle.sync(true); // pan mode again
  idle.sync(false); // ended by the push: the timer goes with it
  t.mock.timers.tick(PAN_IDLE_MS * 2);
  assert.equal(ended, 1);
});
