// WPT - USER WPT INFORMATION and NRST - NEAREST USER WPTS (Pilot's Guide): naming, creating, renaming, moving and
// deleting user waypoints, as patches for the host's `points` and the flight plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUser, deleteUsers, moveUser, nameFree, nearestUsers, renameUser, stepPosition, userWaypoints } from "../dist/user-wpt.js";
import { PAN_WPT_PAGES } from "../dist/pan.js";

const pt = (id, type, lat, lon) => ({ id, type, lat, lon });
const [A, B, U1, U2] = [pt("A", "FIX", 0, 0), pt("B", "VOR", 0, 1), pt("USR1", "WPT", 0, 0.5), pt("PPOS1", "WPT", 0, 2)];
const s = { points: [A, B, U1, U2], airports: [{ id: "KPHX", lat: 0, lon: 3 }], route: ["A", "USR1", "B"], activeLeg: 2, vtf: false, lat: 0, lon: 0.1, magVar: 0 };

test("user waypoints are the host's points of type WPT", () => {
  assert.deepEqual(userWaypoints(s.points).map((p) => p.id), ["USR1", "PPOS1"]);
});

test("a name is 1 to 6 letters and digits not taken by any point or airport", () => {
  assert.ok(nameFree(s, "NEW1"));
  assert.ok(nameFree(s, "ABCDEF"));
  assert.ok(!nameFree(s, ""), "empty");
  assert.ok(!nameFree(s, "ABCDEFG"), "seven characters");
  assert.ok(!nameFree(s, "AB-1"), "not a letter or digit");
  assert.ok(!nameFree(s, "USR1"), "a user waypoint's");
  assert.ok(!nameFree(s, "B"), "a VOR's");
  assert.ok(!nameFree(s, "KPHX"), "an airport's");
});

test("create: a new WPT point at the given position, appended to points", () => {
  const p = createUser(s, "NEW1", { lat: 1, lon: 2 });
  assert.deepEqual(p.points.at(-1), { id: "NEW1", type: "WPT", lat: 1, lon: 2 });
  assert.equal(p.points.length, 5);
  assert.deepEqual(Object.keys(p), ["points"], "points only");
  assert.equal(createUser(s, "USR1", { lat: 1, lon: 2 }), null, "a taken name is refused");
});

test("rename: the point and its flight plan entries, holds and parallel offsets follow", () => {
  const hold = { ...U1, hold: { course: 90, turn: "R", time: 1 } };
  const par = { id: "USR1p", type: "WPT", lat: 0.1, lon: 0.5, parallel: "USR1" };
  const p = renameUser({ ...s, route: ["A", "USR1", hold, par, "B"] }, "USR1", "HOME");
  assert.equal(p.points.find((x) => x.id === "HOME").lon, 0.5);
  assert.ok(!p.points.some((x) => x.id === "USR1"));
  assert.equal(p.route[1], "HOME");
  assert.equal(p.route[2].id, "HOME");
  assert.equal(p.route[3].parallel, "HOME");
  assert.equal(renameUser(s, "USR1", "B"), null, "to a taken name");
  assert.equal(renameUser(s, "A", "ZZZ"), null, "only user waypoints");
});

test("move: the point and a hold at it take the new position", () => {
  const hold = { ...U2, hold: { course: 90, turn: "R", time: 1 } };
  const p = moveUser({ ...s, route: ["A", "PPOS1", hold] }, "PPOS1", { lat: 0.2, lon: 2.5 });
  assert.deepEqual(p.points.find((x) => x.id === "PPOS1"), { ...U2, lat: 0.2, lon: 2.5 });
  assert.deepEqual([p.route[2].lat, p.route[2].lon], [0.2, 2.5]);
  assert.equal(p.route[1], "PPOS1");
  assert.equal(moveUser(s, "USR1", { lat: 1, lon: 1 }).route, undefined, "no hold: the plan is not in the patch");
  assert.equal(moveUser(s, "A", { lat: 1, lon: 1 }), null, "only user waypoints");
});

test("the small FMS knob steps a position by degrees or minutes, latitude held to the poles, longitude wrapped", () => {
  assert.deepEqual(stepPosition({ lat: 10, lon: 20 }, "lat", 1), { lat: 11, lon: 20 });
  const m = stepPosition({ lat: 10, lon: 20 }, "lon", -1 / 60);
  assert.ok(Math.abs(m.lon - (20 - 1 / 60)) < 1e-9);
  assert.equal(stepPosition({ lat: 89.5, lon: 0 }, "lat", 1).lat, 90);
  assert.equal(stepPosition({ lat: 0, lon: 179.5 }, "lon", 1).lon, -179.5);
});

test("delete: from points, and from the flight plan, the active leg moving with it", () => {
  const p = deleteUsers(s, ["USR1"]);
  assert.deepEqual(p.points.map((x) => x.id), ["A", "B", "PPOS1"]);
  assert.deepEqual(p.route, ["A", "B"]);
  assert.equal(p.activeLeg, 1, "B stays active");
  const none = deleteUsers(s, ["PPOS1"]);
  assert.deepEqual(none.route, s.route, "not in the plan: the plan is unchanged");
  assert.equal(none.activeLeg, 2);
});

test("delete takes a waypoint's hold with it; delete all removes every user waypoint", () => {
  const hold = { ...U2, hold: { course: 90, turn: "R", time: 1 } };
  const p = deleteUsers({ ...s, route: ["A", "PPOS1", hold, "B"], activeLeg: 3 }, userWaypoints(s.points).map((x) => x.id));
  assert.deepEqual(p.points.map((x) => x.id), ["A", "B"]);
  assert.deepEqual(p.route, ["A", "B"]);
  assert.equal(p.activeLeg, 1);
});

test("nearest user waypoints: within 200 nm, nearest first, with bearing and distance", () => {
  const far = pt("FAR", "WPT", 10, 10);
  const n = nearestUsers({ ...s, points: [...s.points, far] });
  assert.deepEqual(n.map((x) => x.item.id), ["USR1", "PPOS1"]);
  assert.ok(Math.abs(n[0].dist - 24) < 0.1 && Math.abs(n[0].brg - 90) < 0.1);
  assert.deepEqual(nearestUsers({ ...s, points: [A, B] }), [], "none");
});

test("pan mode's ENT on a user waypoint opens the user waypoint page", () => {
  assert.equal(PAN_WPT_PAGES.WPT, "UserWPTInfo");
});
