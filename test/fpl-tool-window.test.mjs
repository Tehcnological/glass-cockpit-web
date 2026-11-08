// The windows the flight plan menu opens for Closest Point of FPL, Parallel Track and Create ATK Offset Waypoint, as
// the Pilot's Guide steps through them: the small FMS knob picks, ENT moves on and carries it out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FplTool, toolEnabled } from "../dist/fpl-tools.js";
import { atkOffset, parallelTrack } from "../dist/nav.js";
import { IdEntry } from "../dist/ui.js";

const pt = (id, lat, lon) => ({ id, type: "FIX", lat, lon });
const [A, B, C, D, REF] = [pt("A", 0, 0), pt("B", 0, 1), pt("C", 0, 2), pt("D", 1, 2), pt("9", 0.3, 1.5)];
const s = { points: [A, B, C, D, REF], airports: [], route: ["A", "B", "C", "D"], activeLeg: 2, lat: 0, lon: 1.5, directFrom: null, vtf: false, magVar: 0 };
const tool = () => new FplTool(new IdEntry(null, 5));

test("parallel track: direction, then distance, then activate", () => {
  const t = tool();
  t.open("Parallel Track", s);
  assert.equal(t.rows(s)[0].label, "PARALLEL TRACK");
  t.fms(s, false, 1); // Left to Right
  assert.deepEqual(t.ent(s), { close: false });
  for (let i = 0; i < 5; i++) t.fms(s, false, 1); // 1 to 6 nm
  assert.equal(t.rows(s).find((r) => r.label === "DISTANCE").value, "6NM");
  assert.deepEqual(t.ent(s), { close: false });
  assert.deepEqual(t.ent(s), { patch: { route: parallelTrack(s, "R", 6) }, close: true });
});

test("parallel track: the activate prompt is dim where it is unavailable, and opens on cancel when active", () => {
  const t = tool();
  const dto = { ...s, directFrom: { lat: 0, lon: 0 } };
  t.open("Parallel Track", dto);
  t.ent(dto);
  t.ent(dto);
  assert.ok(t.rows(dto).at(-1).dim);
  assert.deepEqual(t.ent(dto), { close: false }, "ENT on a dim prompt does nothing");
  const on = { ...s, route: parallelTrack(s, "L", 5) };
  t.open("Parallel Track", on);
  assert.equal(t.rows(on).at(-1).label, "CANCEL PARALLEL TRACK?");
  assert.ok(t.rows(on).at(-1).cur);
  assert.deepEqual(t.ent(on), { patch: { route: s.route }, close: true });
});

test("closest point of FPL: spell the reference, ENT shows bearing and distance and makes the user waypoint", () => {
  const t = tool();
  t.open("Closest Point Of FPL", s);
  t.fms(s, false, -1); // "9"
  const r = t.ent(s);
  assert.equal(r.close, false);
  assert.equal(r.patch.points.length, s.points.length + 1);
  assert.equal(r.patch.points.at(-1).id, "91");
  const rows = t.rows(s);
  assert.equal(rows.find((x) => x.label === "BRG").value, "180°");
  assert.equal(rows.find((x) => x.label === "DIS").value, "18.0NM");
  assert.deepEqual(t.ent(s), { close: true }, "ENT again closes");
});

test("ATK offset: the small knob sets the distance, ENT inserts the waypoint", () => {
  const t = tool();
  t.open("Create ATK Offset Waypoint", s, 3); // D, after the active C
  t.fms(s, false, -1); // +1 to -1
  t.fms(s, true, -1); // -1 to -11
  assert.equal(t.rows(s).find((r) => r.label === "OFFSET").value, "-11NM");
  const { at, point } = atkOffset(s, 3, -11);
  assert.deepEqual(t.ent(s), { patch: { route: ["A", "B", "C", point, "D"], activeLeg: 2, vtf: false }, close: true });
  assert.equal(at, 3);
});

test("ATK offset on the active waypoint, before it, becomes the active waypoint", () => {
  const t = tool();
  t.open("Create ATK Offset Waypoint", s, 2);
  t.fms(s, false, -1);
  t.fms(s, false, -1); // -2
  assert.equal(t.ent(s).patch.activeLeg, 2);
});

test("which tools the menu offers", () => {
  assert.ok(toolEnabled("Parallel Track", s, null));
  assert.ok(toolEnabled("Closest Point Of FPL", s, null));
  assert.ok(!toolEnabled("Create ATK Offset Waypoint", s, null), "needs a waypoint under the cursor");
  assert.ok(toolEnabled("Create ATK Offset Waypoint", s, 1));
  assert.ok(!toolEnabled("Parallel Track", { ...s, route: ["A"] }, null));
});

// Review fixes.
test("ATK offset after the FROM waypoint, behind the aircraft, does not become the active waypoint", () => {
  const t = tool();
  t.open("Create ATK Offset Waypoint", s, 1); // B, the active leg's start; the aircraft is 30 nm past it
  assert.equal(t.ent(s).patch.activeLeg, 3, "+1 nm after B is behind: C stays active, now at index 3");
  const ahead = { ...s, lon: 1.01 }; // 0.6 nm past B
  t.open("Create ATK Offset Waypoint", ahead, 1);
  t.fms(ahead, false, 1); // +2
  assert.equal(t.ent(ahead).patch.activeLeg, 2, "+2 nm after B is ahead: it is the active waypoint");
});

test("closest point: a second lookup names a new user waypoint, and respelling clears the old result", () => {
  const t = tool();
  const once = { ...s, points: [...s.points, { id: "91", type: "WPT", lat: 0, lon: 1.5 }] };
  t.open("Closest Point Of FPL", once);
  t.fms(once, false, -1);
  assert.equal(t.ent(once).patch.points.at(-1).id, "92");
  t.fms(once, false, -1);
  assert.equal(t.rows(once).find((r) => r.label === "BRG").value, "___°");
});

test("CLR while spelling cancels the entry; CLR again closes", () => {
  const t = tool();
  t.open("Closest Point Of FPL", s);
  t.fms(s, false, 1);
  assert.equal(t.clr(), false);
  assert.equal(t.rows(s)[1].value, "_____");
  assert.equal(t.clr(), true);
});

test("ATK offset on the active leg: ahead or behind by along-track position, not slant distance", () => {
  const t = tool();
  const off = { ...s, lat: 0.2, lon: 1.5 }; // 12 nm north of B-C, abeam 1.5
  t.open("Create ATK Offset Waypoint", off, 1);
  for (let i = 0; i < 28; i++) t.fms(off, false, 1); // +29: lon 1.483, behind
  assert.equal(t.ent(off).patch.activeLeg, 3);
});
