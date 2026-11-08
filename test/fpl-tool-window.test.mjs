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
