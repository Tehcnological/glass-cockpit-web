// Map pan mode (joystick), as on the v13 trainer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { panInfo, panMove, panPoint, panStart, panTarget, PAN_STEP } from "../dist/pan.js";

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
