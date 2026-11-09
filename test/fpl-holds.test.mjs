// Hold At Waypoint and Hold At Present Position (Pilot's Guide): the hold window, the hold leg in the plan, its
// racetrack and sequencing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FplTool, toolEnabled } from "../dist/fpl-tools.js";
import { deleteEntry, holdAtPresentPosition, holdAtWaypoint, holdTrack, isHold, sequenceLeg } from "../dist/nav.js";
import { fplMenu } from "../dist/page-menu.js";
import { symbolPoints } from "../dist/map.js";
import { IdEntry } from "../dist/ui.js";

// Due east along the equator, 60 nm a leg, then north: A (0,0) - B (0,1) - C (0,2) - D (1,2).
const pt = (id, lat, lon, more = {}) => ({ id, type: "FIX", lat, lon, ...more });
const [A, B, C, D] = [pt("A", 0, 0), pt("B", 0, 1), pt("C", 0, 2), pt("D", 1, 2)];
const s = { points: [A, B, C, D], airports: [], route: ["A", "B", "C", "D"], activeLeg: 1, lat: 0, lon: 0.5, directFrom: null, vtf: false, magVar: 0, track: 45 };
const tool = () => new FplTool(new IdEntry(null, 5));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const H = { course: 90, turn: "R", time: 1 };

test("hold at waypoint: a hold leg after the fix, at the fix's position", () => {
  const p = holdAtWaypoint(s, 2, H); // at C, B active
  assert.equal(p.route.length, 5);
  const h = p.route[3];
  assert.ok(isHold(h));
  assert.equal(h.id, "C");
  assert.ok(near(h.lat, 0) && near(h.lon, 2));
  assert.deepEqual(h.hold, H);
  assert.equal(p.activeLeg, 1, "inserted after the active waypoint: it stays");
  assert.equal(holdAtWaypoint(s, 0, H).activeLeg, 2, "inserted before: the active waypoint moves down one");
  // Holding again at the same fix replaces the hold.
  const again = holdAtWaypoint({ ...s, route: p.route }, 2, { course: 270, turn: "L", distance: 4 });
  assert.equal(again.route.length, 5);
  assert.deepEqual(again.route[3].hold, { course: 270, turn: "L", distance: 4 });
});

test("the hold window: course into the fix, right turns, 1 minute legs; LOAD? inserts the hold", () => {
  const t = tool();
  t.open("Hold At Waypoint", s, 2);
  const rows = t.rows(s);
  assert.equal(rows[0].label, "HOLD AT WAYPOINT");
  assert.equal(rows.find((r) => r.label === "WAYPOINT").value, "C");
  assert.equal(rows.find((r) => r.label === "COURSE").value, "090°", "B to C is due east");
  assert.ok(rows.find((r) => r.label === "COURSE").cur);
  assert.equal(rows.find((r) => r.label === "TURN").value, "Right");
  assert.equal(rows.find((r) => r.label === "LEG").value, "Time");
  assert.equal(rows.find((r) => r.label === "TIME").value, "1.0MIN");
  t.fms(s, false, -5); // 085
  assert.deepEqual(t.ent(s), { close: false });
  t.fms(s, false, 1); // Left
  t.ent(s);
  t.ent(s); // Time
  t.fms(s, false, 1); // 1.5 min
  assert.equal(t.rows(s).find((r) => r.label === "TIME").value, "1.5MIN");
  t.ent(s);
  assert.ok(t.rows(s).at(-1).cur && t.rows(s).at(-1).label === "LOAD?");
  const want = holdAtWaypoint(s, 2, { course: 85, turn: "L", time: 1.5 });
  assert.deepEqual(t.ent(s), { patch: want, close: true });
});

test("the hold window: time in half minutes 0.5 to 5, or distance in nm; the large knob moves the cursor", () => {
  const t = tool();
  t.open("Hold At Waypoint", s, 2);
  t.fms(s, true, 3); // to the leg value
  t.fms(s, false, -5);
  assert.equal(t.rows(s).find((r) => r.label === "TIME").value, "0.5MIN");
  t.fms(s, false, 20);
  assert.equal(t.rows(s).find((r) => r.label === "TIME").value, "5.0MIN");
  t.fms(s, true, -1);
  t.fms(s, false, 1); // Distance
  assert.equal(t.rows(s).find((r) => r.label === "LEG").value, "Distance");
  assert.equal(t.rows(s).find((r) => r.label === "DISTANCE").value, "1NM");
  t.fms(s, true, 1);
  t.fms(s, false, 3);
  t.fms(s, true, 1);
  const h = t.ent(s).patch.route[3].hold;
  assert.equal(h.distance, 4);
  assert.equal(h.time, undefined);
});

test("CLR or MENU closes the hold window without a change", () => {
  const t = tool();
  t.open("Hold At Waypoint", s, 2);
  assert.equal(t.clr(), true);
});

test("hold at present position: a user waypoint here, direct to it, the hold after it on the current track", () => {
  const t = tool();
  t.open("Hold At Present Position", s);
  const rows = t.rows(s);
  assert.equal(rows[0].label, "HOLD AT P.POS");
  assert.equal(rows.find((r) => r.label === "COURSE").value, "045°", "the current track");
  for (let i = 0; i < 4; i++) t.ent(s);
  const r = t.ent(s);
  assert.equal(r.close, true);
  assert.deepEqual(r.patch, holdAtPresentPosition(s, { course: 45, turn: "R", time: 1 }));
  const p = r.patch;
  const w = p.points.at(-1);
  assert.equal(p.points.length, s.points.length + 1, "added to points, reported through onChange");
  assert.ok(near(w.lat, 0) && near(w.lon, 0.5));
  assert.match(w.id, /^PPOS\d$/);
  assert.deepEqual(p.route, ["A", w.id, { ...w, hold: { course: 45, turn: "R", time: 1 } }, "B", "C", "D"]);
  assert.equal(p.activeLeg, 1);
  assert.deepEqual(p.directFrom, { lat: 0, lon: 0.5 });
  const empty = holdAtPresentPosition({ ...s, route: [], activeLeg: 1 }, H);
  assert.equal(empty.route.length, 2);
  assert.equal(empty.activeLeg, 0);
});

test("the PFD falls back to the heading for present position's course", () => {
  const t = tool();
  const pfd = { ...s, track: undefined, heading: 200 };
  t.open("Hold At Present Position", pfd);
  assert.equal(t.rows(pfd).find((r) => r.label === "COURSE").value, "200°");
});

test("which hold options the menu offers", () => {
  assert.ok(!toolEnabled("Hold At Waypoint", s, null), "needs a waypoint under the cursor");
  assert.ok(toolEnabled("Hold At Waypoint", s, 2));
  assert.ok(!toolEnabled("Hold At Waypoint", s, 4), "not on the empty row");
  const held = { ...s, route: holdAtWaypoint(s, 2, H).route };
  assert.ok(!toolEnabled("Hold At Waypoint", held, 3), "on a hold: Remove Hold instead");
  assert.ok(toolEnabled("Hold At Present Position", s, null));
  assert.ok(toolEnabled("Hold At Present Position", { ...s, route: [] }, null));
});

test("sequencing: reaching a hold fix makes the hold active, and the plan stays on it", () => {
  const route = holdAtWaypoint(s, 2, H).route; // A B C hold D
  assert.equal(sequenceLeg(route, 1), 2);
  assert.equal(sequenceLeg(route, 2), 3, "C reached: the hold");
  assert.equal(sequenceLeg(route, 3), 3, "the hold stays active");
  assert.equal(sequenceLeg(route, 4), 4, "the last waypoint");
});

test("removing an active hold resumes on the leg after it; deleting a fix deletes its hold", () => {
  const route = holdAtWaypoint(s, 2, H).route;
  assert.deepEqual(deleteEntry({ route, activeLeg: 3, vtf: false }, 3), { route: s.route, activeLeg: 3, vtf: false });
  assert.deepEqual(deleteEntry({ route, activeLeg: 4, vtf: false }, 2), { route: ["A", "B", "D"], activeLeg: 2, vtf: false });
  assert.deepEqual(deleteEntry({ route, activeLeg: 3, vtf: false }, 2), { route: ["A", "B", "D"], activeLeg: 2, vtf: false });
  assert.deepEqual(deleteEntry({ route: s.route, activeLeg: 2, vtf: false }, 1), { route: ["A", "C", "D"], activeLeg: 1, vtf: false });
});

test("inverting the plan drops its holds", () => {
  const route = holdAtWaypoint(s, 2, H).route;
  assert.deepEqual(fplMenu(route, 1).find((o) => o.label === "Invert Flight Plan").patch.route, ["D", "C", "B", "A"]);
});

test("the racetrack: standard rate turns at the groundspeed, legs of the hold's time or distance", () => {
  // Inbound 360 to the fix at (0, 0), right turns, 120 kt: radius 120 / (60 pi) nm, legs 2 nm.
  const { pts, r } = holdTrack({ lat: 0, lon: 0 }, { course: 360, turn: "R", time: 1 }, 0, 120);
  assert.ok(near(r, 120 / (60 * Math.PI)));
  const [f, f2, s2, s1] = pts;
  assert.ok(near(f.lat, 0) && near(f.lon, 0));
  assert.ok(near(f2.lon * 60, 2 * r, 1e-9) && near(f2.lat, 0), "outbound side to the right (east)");
  assert.ok(near(s2.lat * 60, -2, 1e-9) && near(s1.lat * 60, -2, 1e-9) && near(s1.lon, 0));
  const left = holdTrack({ lat: 0, lon: 0 }, { course: 90, turn: "L", distance: 5 }, 0, 120).pts;
  assert.ok(near(left[1].lat * 60, 2 * r, 1e-6), "left of an eastbound inbound is north");
  assert.ok(near(left[3].lon * 60, -5, 1e-6));
});

test("a hold at an approach fix goes with the approach and does not draw the fix twice", () => {
  const faf = pt("FAF", 0, 3, { approach: "RNAV 08", role: "FAF" });
  const route = holdAtWaypoint({ ...s, route: [...s.route, faf] }, 4, H).route;
  assert.equal(route[5].approach, "RNAV 08");
  assert.equal(route[5].role, undefined, "but is not the FAF");
  const m = { points: s.points, route, airspaces: [], range: 10, lat: 0, lon: 0 };
  assert.equal(symbolPoints(m).filter((p) => p.id === "FAF").length, 1);
});
