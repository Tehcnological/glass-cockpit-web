// The flight plan menu's Closest Point of FPL, Create ATK Offset Waypoint and Parallel Track (Pilot's Guide).
import { test } from "node:test";
import assert from "node:assert/strict";
import { atkOffset, bearingDistance, cancelParallel, closestPointOfFpl, parallelTrack, routePoint } from "../dist/nav.js";

// A plan due east along the equator, 60 nm a leg, then north: A (0,0) - B (0,1) - C (0,2) - D (1,2).
const pt = (id, lat, lon, more = {}) => ({ id, type: "FIX", lat, lon, ...more });
const [A, B, C, D] = [pt("A", 0, 0), pt("B", 0, 1), pt("C", 0, 2), pt("D", 1, 2)];
const s = { points: [A, B, C, D], airports: [], route: ["A", "B", "C", "D"], activeLeg: 1, lat: 0, lon: 0.5, directFrom: null };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test("closest point of the plan to a reference waypoint, and a user waypoint there named from it", () => {
  const ref = pt("REF", 0.3, 1.5); // 18 nm north of the B-C leg
  const c = closestPointOfFpl(s, ref);
  assert.ok(near(c.point.lon, 1.5), "on the B-C leg");
  assert.ok(near(c.point.lat, 0) && near(c.point.lon, 1.5));
  assert.equal(c.point.type, "WPT");
  assert.match(c.point.id, /^REF\d$/);
  assert.ok(near(c.dist, 18, 0.1) && near(c.brg, 180, 0.1), "from the reference waypoint");
  assert.equal(closestPointOfFpl({ ...s, route: ["A"] }, ref), null, "no leg, no closest point");
});

test("the user waypoint's name does not repeat one in the plan", () => {
  const ref = pt("REF", 0.5, 1.5);
  const taken = { ...s, route: [...s.route, pt("REF1", 2, 2)] };
  assert.equal(closestPointOfFpl(taken, ref).point.id, "REF2");
});

test("along track offset: negative before the waypoint, positive after, along its legs", () => {
  const before = atkOffset(s, 2, -10);
  assert.equal(before.at, 2);
  assert.ok(near(before.point.lat, 0) && near(before.point.lon, 2 - 10 / 60, 1e-4));
  const after = atkOffset(s, 2, 10);
  assert.equal(after.at, 3);
  assert.ok(near(after.point.lat, 10 / 60, 1e-4) && near(after.point.lon, 2, 1e-4));
  assert.notEqual(before.point.id, after.point.id);
});

test("along track offset limits: shorter than the leg, the distance to go on the active waypoint, 1 to 999 nm", () => {
  assert.equal(atkOffset(s, 2, 60), null, "C-D is 60 nm");
  assert.equal(atkOffset(s, 2, 0), null);
  assert.equal(atkOffset(s, 0, -5), null, "nothing before the first waypoint");
  assert.equal(atkOffset(s, 3, 5), null, "nothing after the last");
  assert.equal(atkOffset(s, 1, -35), null, "B is active, 30 nm to go");
  assert.ok(atkOffset(s, 1, -25));
});

test("no along track offset at or after the final approach fix", () => {
  const ap = { approach: "RNAV 08" };
  const route = ["A", pt("IF", 0, 1, ap), pt("FAF", 0, 2, { ...ap, role: "FAF" }), pt("MAP", 1, 2, ap)];
  const a = { ...s, route };
  assert.ok(atkOffset(a, 1, 5));
  assert.equal(atkOffset(a, 2, -5), null);
  assert.equal(atkOffset(a, 3, -5), null);
});

test("parallel track offsets the plan from the active leg on, names end in p, and cancels back", () => {
  const t = { ...s, activeLeg: 2 }; // B to C: B is the active leg's start
  const route = parallelTrack(t, "R", 6);
  assert.equal(route[0], "A", "before the active leg's start stays");
  assert.deepEqual(route.slice(1).map((r) => r.id), ["Bp", "Cp", "Dp"]);
  const [b, c, d] = route.slice(1);
  assert.ok(near(b.lat, -0.1, 1e-3) && near(b.lon, 1, 1e-3), "6 nm right of an eastbound leg is south");
  assert.ok(near(d.lon, 2.1, 1e-3), "6 nm right of a northbound leg is east");
  // C turns 90 degrees: its offset is on the bisector, 6/cos(45) from C, so both legs stay 6 nm off.
  assert.ok(near(c.lat, -0.1, 1e-3) && near(c.lon, 2.1, 1e-3));
  assert.deepEqual(cancelParallel(route), s.route);
  const left = parallelTrack(t, "L", 6);
  assert.ok(near(left[1].lat, 0.1, 1e-3));
  assert.deepEqual(parallelTrack({ ...t, route }, "L", 6), left, "a new parallel track starts from the original plan");
});

test("parallel track is unavailable on a direct-to, an approach leg, a turn over 120 degrees, or out of 1 to 99 nm", () => {
  assert.equal(parallelTrack({ ...s, directFrom: { lat: 0, lon: 0 } }, "R", 5), null);
  assert.equal(parallelTrack({ ...s, route: ["A", "B", pt("BACK", 0.1, 0)] }, "R", 5), null);
  const ap = { ...s, route: ["A", pt("IF", 0, 1, { approach: "RNAV 08" })] };
  assert.equal(parallelTrack(ap, "R", 5), null);
  assert.equal(parallelTrack(s, "R", 0), null);
  assert.equal(parallelTrack(s, "R", 100), null);
  // An approach after the en route legs is not offset.
  const withAp = { ...s, route: [...s.route, pt("IF", 2, 2, { approach: "RNAV 08" })] };
  assert.equal(parallelTrack(withAp, "R", 5)[4].id, "IF");
});

test("parallel points resolve as flight plan points", () => {
  const p = parallelTrack(s, "R", 6)[1];
  assert.equal(routePoint(p, s.points, []), p);
  assert.ok(bearingDistance(0, 1, p.lat, p.lon).dist > 5.9);
});

test("direct-to and loading an approach cancel parallel track", async () => {
  const { approachPatch, directToPatch } = await import("../dist/nav.js");
  const route = parallelTrack({ ...s, activeLeg: 2 }, "R", 6);
  const p = { ...s, route };
  assert.deepEqual(directToPatch(p, C), { route: s.route, activeLeg: 2, directFrom: { lat: 0, lon: 0.5 }, vtf: false });
  assert.deepEqual(approachPatch(route, [pt("IF", 2, 2, { approach: "X" })], "load", s).route.slice(0, 4), s.route);
});

test("the same along track offset twice is refused: its name would repeat", () => {
  const { point, at } = atkOffset(s, 2, -10);
  const route = [...s.route];
  route.splice(at, 0, point);
  assert.equal(atkOffset({ ...s, route }, 3, -10), null);
});

test("inverting the plan or removing the approach cancels parallel track", async () => {
  const { fplMenu } = await import("../dist/page-menu.js");
  const ap = pt("IF", 2, 2, { approach: "X" });
  const route = [...parallelTrack({ ...s, activeLeg: 2 }, "R", 6), ap];
  const m = fplMenu(route, 2);
  assert.deepEqual(m.find((o) => o.label === "Invert Flight Plan").patch.route, ["D", "C", "B", "A"]);
  assert.deepEqual(m.find((o) => o.label === "Remove Approach").patch.route, s.route);
});

test("direct-to an offset waypoint cancels parallel track and flies to its original", async () => {
  const { directToPatch } = await import("../dist/nav.js");
  const route = parallelTrack({ ...s, activeLeg: 2 }, "R", 6);
  assert.deepEqual(directToPatch({ ...s, route }, route[2]), { route: s.route, activeLeg: 2, directFrom: { lat: 0, lon: 0.5 }, vtf: false });
});

test("an offset before the active waypoint lies on the inbound leg even when the aircraft is off course", () => {
  const off = { ...s, activeLeg: 2, lat: 0.2, lon: 1.5 }; // 12 nm north of B-C, 30 nm to go
  const r = atkOffset(off, 2, -10);
  assert.ok(near(r.point.lat, 0) && near(r.point.lon, 2 - 10 / 60, 1e-4));
  assert.equal(atkOffset({ ...off, lat: 0.1, lon: 1.95 }, 2, -10), null, "under 7 nm to go");
});

test("parallel track is unavailable with a zero-length leg", () => {
  assert.equal(parallelTrack({ ...s, route: ["A", "A", "B"], activeLeg: 1 }, "R", 5), null);
});

test("a waypoint entered from a parallel plan goes in as the waypoint it came from", async () => {
  const { planEntry } = await import("../dist/nav.js");
  const route = parallelTrack({ ...s, activeLeg: 2 }, "R", 6);
  assert.equal(planEntry(s, route[1]), "B");
  assert.equal(planEntry(s, B), "B");
  assert.deepEqual(planEntry(s, { ...pt("F", 1, 1), approach: "X", role: "FAF" }), pt("F", 1, 1));
});

test("during a direct-to, an offset before the active waypoint lies on the direct course", () => {
  const dto = { ...s, activeLeg: 2, lat: 0.5, lon: 2, directFrom: { lat: 0.5, lon: 2 } }; // 30 nm north of C, direct to C
  const r = atkOffset(dto, 2, -10);
  assert.ok(near(r.point.lat, 10 / 60, 1e-4) && near(r.point.lon, 2, 1e-4));
});
