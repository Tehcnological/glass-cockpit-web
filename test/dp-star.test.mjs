// Departures (SIDs) and arrivals (STARs): the CIFP records, PROC's SELECT DEPARTURE and SELECT ARRIVAL, the flight
// plan's Remove Departure and Remove Arrival, and WPT - AIRPORT INFORMATION's DP and STAR views.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { near, parseCifp } from "../dist/navdata.js";
import { asWaypoint, holdAtWaypoint, isArrival, isDeparture, procedurePatch, procedurePoints, suspended } from "../dist/nav.js";
import { ProcFlow, PROC_MENU } from "../dist/procedures.js";
import { AprInfo } from "../dist/apr-info.js";
import { airportInfoMenu, fplMenu } from "../dist/page-menu.js";
import { IdEntry } from "../dist/ui.js";

// KPSP JEEON1 (RNAV SID: runway 13B, common legs, BLH and TRM) and KTUS ZONNA2 (RNAV STAR: ELP, EWM and SSO, runways
// 12 and 30) from CIFP 2611, with their fixes.
const CIFP = readFileSync(new URL("fixtures/cifp-sid-star.txt", import.meta.url), "utf8");
const ids = (legs) => legs.map((l) => l[0]);

test("CIFP departures: runway transitions, common legs and en route transitions", () => {
  const sid = parseCifp(CIFP).find((p) => p[1] === "JEEON1");
  const [airport, , trans, legs, kind, runways] = sid;
  assert.deepEqual([airport, kind], ["KPSP", "SID"]);
  assert.deepEqual(Object.keys(runways), ["RW13B"]);
  assert.deepEqual(ids(runways.RW13B), ["KAIMI"], "the heading leg has no fix");
  assert.deepEqual(legs.map((l) => [l[0], l[3], l[4], l[5]]), [["KAIMI", "IF", "6000-", null], ["JEEON", "TF", "4200+", null]]);
  assert.deepEqual(Object.keys(trans), ["BLH", "TRM"], "no VECTORS: that is an approach's");
  assert.deepEqual(ids(trans.BLH), ["JEEON", "TEEGE", "BLH"]);
  assert.equal(runways.RW13B[0][1], 33.75679); // N33°45'24.43"
});

test("CIFP arrivals: en route transitions, then runway transitions; flight levels in feet", () => {
  const star = parseCifp(CIFP).find((p) => p[1] === "ZONNA2");
  const [airport, , trans, legs, kind, runways] = star;
  assert.deepEqual([airport, kind, legs], ["KTUS", "STAR", []]);
  assert.deepEqual(Object.keys(trans), ["ELP", "EWM", "SSO"]);
  assert.deepEqual(ids(trans.ELP), ["ELP", "PENSL", "ZONNA"]);
  assert.deepEqual(Object.keys(runways), ["RW12", "RW30"]);
  assert.deepEqual(ids(runways.RW30), ["ZONNA", "JOKIM", "JOKIM"]);
  assert.deepEqual(trans.SSO.map((l) => l[4]), ["28000-", "21000"]);
});

test("CIFP records without a kind are approaches, as cifp.json files built before SIDs and STARs have them", () => {
  const nasr = { cycle: "", navaids: [], fixes: [], stations: [], airspace: [], airports: [["TUS", "KTUS", "TUCSON INTL", 32.12, -110.94, [], 2643, [], "TUCSON", "AZ", ""]] };
  const leg = (fix) => [fix, 32.1, -110.9, "TF", null, null];
  const out = near(nasr, { cycle: "", procedures: [["KTUS", "ILS RWY 12", { VECTORS: [] }, [leg("ABC")]]] }, 32.12, -110.94, 10);
  assert.equal(out.procedures[0].kind, undefined);
  assert.deepEqual(out.airports[0].approaches, ["ILS RWY 12"]);
});

// The two airports, with what `near` gives for them, and an approach at KTUS.
const nasr = {
  cycle: "", navaids: [], fixes: [], stations: [], airspace: [], airports: [
    ["PSP", "KPSP", "PALM SPRINGS INTL", 33.83, -116.51, [], 477, [], "PALM SPRINGS", "CA", ""],
    ["TUS", "KTUS", "TUCSON INTL", 32.12, -110.94, [], 2643, [], "TUCSON", "AZ", ""],
  ],
};
const fixLeg = (fix, lat, lon, role) => [fix, lat, lon, "TF", null, role];
const approach = ["KTUS", "RNAV (GPS) RWY 12", { VECTORS: [] }, [fixLeg("ONEIF", 32.2, -111, "IF"), fixLeg("TWOFA", 32.15, -110.97, "FAF"), fixLeg("RW12", 32.12, -110.94, "MAP")]];
const data = () => near(nasr, { cycle: "", procedures: [...parseCifp(CIFP), approach] }, 33, -113.7, 400);

test("near includes the SIDs and STARs of the airports in range, but the airports' approaches stay approaches", () => {
  const out = data();
  assert.deepEqual(out.procedures.map((p) => `${p.airport} ${p.name} ${p.kind ?? "APR"}`), ["KPSP JEEON1 SID", "KTUS ZONNA2 STAR", "KTUS RNAV (GPS) RWY 12 APR"]);
  assert.deepEqual(Object.keys(out.procedures[0].runways), ["RW13B"]);
  assert.deepEqual(out.airports.map((a) => a.approaches), [[], ["RNAV (GPS) RWY 12"]]);
});

test("procedure points: a SID from its runway to its transition, a STAR from its transition to its runway, marked", () => {
  const [sid, star] = data().procedures;
  const dp = procedurePoints(sid, "BLH", "RW13B");
  assert.deepEqual(dp.map((p) => p.id), ["KAIMI", "JEEON", "TEEGE", "BLH"], "a fix shared by two parts once");
  assert.ok(dp.every((p) => p.departure === "JEEON1" && isDeparture(p) && !isArrival(p) && p.approach === undefined));
  const ar = procedurePoints(star, "SSO", "RW12");
  assert.deepEqual(ar.map((p) => p.id), ["SSO", "ZONNA", "SSAND", "VOTTO", "JEGEK", "OTUKE"]);
  assert.ok(ar.every((p) => p.arrival === "ZONNA2"));
  assert.deepEqual(procedurePoints(star, "SSO", undefined).map((p) => p.id), ["SSO", "ZONNA"], "no runway: to the end of the common legs");
  // A fix taken by hand is an ordinary waypoint.
  assert.deepEqual(Object.keys(asWaypoint(dp[0])).sort(), ["alt", "id", "lat", "lon", "type"]);
});

const W = (id, marks = {}) => ({ id, type: "WPT", lat: 33, lon: -112, ...marks });

test("loading a departure puts it after the departure airport, replacing one loaded before", () => {
  const [sid] = data().procedures;
  const pts = procedurePoints(sid, "TRM", "RW13B");
  // Before takeoff, flying to the first en route waypoint: the departure's first fix becomes the active one.
  assert.deepEqual(procedurePatch(["KPSP", "BLH", "KTUS"], 1, sid, pts), { route: ["KPSP", ...pts, "BLH", "KTUS"], activeLeg: 1 });
  const old = [W("OLD1", { departure: "X1" }), W("OLD2", { departure: "X1" })];
  const p = procedurePatch(["KPSP", ...old, "BLH", "KTUS"], 3, sid, pts);
  assert.deepEqual(p.route, ["KPSP", ...pts, "BLH", "KTUS"]);
  assert.equal(p.route[p.activeLeg], "BLH", "the active waypoint stays active");
  // With no departure airport in the plan, it goes first.
  assert.deepEqual(procedurePatch([], 0, sid, pts), { route: ["KPSP", ...pts], activeLeg: 1 });
  assert.deepEqual(procedurePatch([], 1, sid, pts), { route: ["KPSP", ...pts], activeLeg: 1 }, "an empty plan's default active leg");
  // An active leg past the end stays within the new plan.
  const p2 = procedurePatch(["KPSP", "KTUS"], 5, sid, pts);
  assert.ok(p2.activeLeg < p2.route.length);
});

// A hold suspends sequencing while it is the active leg (PR 28): loading or removing a departure keeps that in step.
test("with a hold active, loading or removing a departure keeps the active leg in range", () => {
  const [sid] = data().procedures;
  const pts = procedurePoints(sid, "TRM", "RW13B");
  const hold = { course: 90, turn: "R", time: 1 };
  const plan = (route) => ({ route, points: [W("BLH")], airports: [], activeLeg: 1, vtf: false });
  // Holding at an en route waypoint: the hold stays the active leg, and SUSP with it.
  const atBlh = holdAtWaypoint(plan(["KPSP", "BLH", "KTUS"]), 1, hold); // [KPSP, BLH, hold, KTUS]
  const p = procedurePatch(atBlh.route, 2, sid, pts);
  assert.ok(p.route[p.activeLeg].hold, "the hold is still active");
  assert.equal(suspended({ ...p, points: [], airports: [], lat: 33, lon: -112 }), true);
  // Holding at a departure fix: the hold goes with it, and the new departure's first fix is active.
  const dep = W("OLD1", { departure: "X1" });
  const atDep = holdAtWaypoint(plan(["KPSP", dep, "BLH"]), 1, hold); // the hold leg carries `departure`
  const q = procedurePatch(atDep.route, 2, sid, pts);
  assert.deepEqual([q.activeLeg, q.route.some((r) => r.hold)], [1, false]);
  const r = fplMenu(atDep.route, 2).find((o) => o.label === "Remove Departure").patch;
  assert.deepEqual(r, { route: ["KPSP", "BLH"], activeLeg: 1, directFrom: null });
});

test("loading an arrival puts it before the approach, or at the end, replacing one loaded before", () => {
  const [, star] = data().procedures;
  const pts = procedurePoints(star, "SSO", "RW12");
  const apr = [W("ONEIF", { approach: "A", role: "IF" }), W("TWOFA", { approach: "A", role: "FAF" })];
  assert.deepEqual(procedurePatch(["KPSP", "KTUS"], 1, star, pts), { route: ["KPSP", "KTUS", ...pts], activeLeg: 1 });
  const p = procedurePatch(["KPSP", "KTUS", W("OLD", { arrival: "X" }), ...apr], 4, star, pts);
  assert.deepEqual(p.route, ["KPSP", "KTUS", ...pts, ...apr]);
  assert.equal(p.route[p.activeLeg].id, "TWOFA", "the active approach fix stays active");
});

test("Remove Departure and Remove Arrival take out their fixes, as Remove Approach does", () => {
  const route = ["KPSP", W("A", { departure: "D" }), W("B", { departure: "D" }), "BLH", "KTUS", W("C", { arrival: "S" }), W("F", { approach: "X", role: "FAF" })];
  const opt = (label, leg) => fplMenu(route, leg).find((o) => o.label === label).patch;
  assert.deepEqual(opt("Remove Departure", 3), { route: ["KPSP", "BLH", "KTUS", route[5], route[6]], activeLeg: 1 });
  assert.deepEqual(opt("Remove Departure", 2), { route: ["KPSP", "BLH", "KTUS", route[5], route[6]], activeLeg: 1, directFrom: null });
  assert.deepEqual(opt("Remove Arrival", 6), { route: ["KPSP", route[1], route[2], "BLH", "KTUS", route[6]], activeLeg: 5 });
  assert.deepEqual(opt("Remove Approach", 3).route, route.slice(0, 6));
  assert.equal(fplMenu(["KPSP", "KTUS"], 1).find((o) => o.label === "Remove Departure").patch, undefined, "dim with none loaded");
  assert.deepEqual(opt("Invert Flight Plan", 3).route, ["KTUS", "BLH", "KPSP"], "inverting drops every procedure");
});

const host = () => {
  const d = data();
  const h = { s: { route: ["KPSP", "BLH", "KTUS"], activeLeg: 1, lat: 33, lon: -113.7, points: [], airports: d.airports, procedures: d.procedures }, changes: [], closed: 0 };
  h.flow = new ProcFlow({ s: () => h.s, change: (p) => { h.changes.push(p); }, close: () => h.closed++ });
  return h;
};

test("PROC: SELECT ARRIVAL and SELECT DEPARTURE are live", () => {
  const h = host();
  h.flow.open();
  assert.deepEqual(PROC_MENU.map((_, i) => h.flow.enabled(i)), [false, false, false, true, true, true]);
  h.flow.fms(false, 1);
  assert.equal(PROC_MENU[h.flow.item], "SELECT ARRIVAL");
  h.flow.fms(false, 1);
  assert.equal(PROC_MENU[h.flow.item], "SELECT DEPARTURE");
});

// Pilot's Guide: a departure is picked by procedure, runway, then transition; LOAD? adds it to the flight plan.
test("SELECT DEPARTURE opens on the plan's departure airport and steps departure, runway, transition, then LOAD?", () => {
  const h = host();
  h.s.procedures[0].runways.RW31B = []; // a second runway, so there is a choice
  h.flow.open();
  h.flow.fms(false, 2);
  h.flow.ent();
  assert.deepEqual([h.flow.view, h.flow.kind, h.flow.airport], ["select", "SID", "KPSP"]);
  assert.deepEqual(h.flow.procs().map((p) => p.name), ["JEEON1"], "departures only");
  const steps = [];
  for (let i = 0; i < 3; i++) {
    steps.push(h.flow.grp);
    h.flow.ent();
  }
  assert.deepEqual(steps, ["APR", "RWY", "TRANS"]);
  assert.equal(h.flow.grp, "LOAD");
  h.flow.fms(false, 1);
  assert.equal(h.flow.grp, "LOAD", "no ACTIVATE? for a departure");
  const v = h.flow.loading(true);
  assert.deepEqual([v.kind, v.runways.map((r) => r.label), v.transitions.map((r) => r.label)], ["SID", ["RW13B", "RW31B"], ["BLH", "TRM"]]);
  assert.deepEqual(v.points.map((p) => p.id), ["KAIMI", "JEEON", "TEEGE", "BLH"]);
  h.flow.ent();
  assert.equal(h.closed, 1);
  assert.deepEqual(h.changes[0].route.map((r) => (typeof r === "string" ? r : r.id)), ["KPSP", "KAIMI", "JEEON", "TEEGE", "BLH", "BLH", "KTUS"]);
  assert.equal(h.changes[0].activeLeg, 1);
});

// Pilot's Guide: an arrival is picked by procedure, transition, then runway.
test("SELECT ARRIVAL opens on the destination and steps arrival, transition, runway, then LOAD? before the approach", () => {
  const h = host();
  h.s.route.push(W("ONEIF", { approach: "RNAV (GPS) RWY 12", role: "IF" }));
  h.flow.open();
  h.flow.fms(false, 1);
  h.flow.ent();
  assert.deepEqual([h.flow.kind, h.flow.airport], ["STAR", "KTUS"]);
  assert.deepEqual(h.flow.procs().map((p) => p.name), ["ZONNA2"]);
  h.flow.ent();
  assert.equal(h.flow.grp, "TRANS");
  h.flow.fms(false, 2); // SSO
  h.flow.ent();
  assert.equal(h.flow.grp, "RWY");
  h.flow.fms(true, 1);
  assert.equal(h.flow.grp, "LOAD");
  h.flow.fms(true, -1);
  h.flow.ent();
  assert.equal(h.flow.grp, "LOAD");
  assert.deepEqual(h.flow.loading(true).sequence.map((r) => r.label), ["SSO", "ZONNA", "SSAND", "VOTTO", "JEGEK", "OTUKE"]);
  h.flow.ent();
  assert.deepEqual(h.changes[0].route.map((r) => (typeof r === "string" ? r : r.id)), ["KPSP", "BLH", "KTUS", "SSO", "ZONNA", "SSAND", "VOTTO", "JEGEK", "OTUKE", "ONEIF"]);
});

test("SELECT APPROACH lists approaches only", () => {
  const h = host();
  h.flow.open();
  h.flow.ent();
  assert.deepEqual(h.flow.procs().map((p) => p.name), ["RNAV (GPS) RWY 12"]);
  assert.equal(h.flow.loadApproach("KTUS", "ZONNA2"), false, "LD APR takes approaches only");
});

test("WPT - AIRPORT INFORMATION's departure view: departures, runway, transition and the sequence", () => {
  const d = data();
  const c = { airport: d.airports[0], procedures: d.procedures };
  const a = new AprInfo(new IdEntry(null, 4));
  a.kind = "SID";
  assert.equal(a.has(c), true);
  a.ent(c);
  assert.equal(a.grp, "APR");
  a.ent(c);
  assert.equal(a.grp, "RWY");
  a.ent(c);
  assert.equal(a.grp, "TRANS");
  a.fms(c, false, 1); // TRM
  a.ent(c);
  assert.equal(a.grp, "SEQ");
  const v = a.view(c, true);
  assert.deepEqual([v.approaches.map((r) => r.label), v.runways.map((r) => r.label), v.transitions.map((r) => r.label)], [["JEEON1"], ["RW13B"], ["BLH", "TRM"]]);
  assert.deepEqual(v.sequence.map((r) => r.label), ["KAIMI", "JEEON", "TRM"]);
  assert.deepEqual(a.preview(c).map((p) => p.id), ["KAIMI", "JEEON", "TRM"]);
  a.kind = "STAR";
  assert.equal(a.has(c), false, "KPSP has no arrival");
});

test("the airport page's menu opens the departure and arrival pages when it is given them", () => {
  const did = [];
  const menu = airportInfoMenu(undefined, { airport() {}, approach() {}, departure: () => did.push("DP"), arrival: () => did.push("STAR") });
  const live = menu.filter((o) => o.act).map((o) => o.label);
  assert.deepEqual(live, ["Show Departure Page", "Show Arrival Page", "Show Approach Page"]);
  menu[2].act();
  menu[3].act();
  assert.deepEqual(did, ["DP", "STAR"]);
});

// Pilot's Guide: the loading page's DP, STAR and APR softkeys switch between departures, arrivals and approaches.
test("the loading page's softkeys switch between departures, arrivals and approaches", () => {
  const h = host();
  h.flow.open();
  h.flow.select("SID");
  assert.deepEqual([h.flow.view, h.flow.kind, h.flow.airport, h.flow.loading(true).kind], ["select", "SID", "KPSP", "SID"]);
  h.flow.fms(true, 1);
  h.flow.select("APR");
  assert.deepEqual([h.flow.kind, h.flow.airport, h.flow.grp], ["APR", "KTUS", "APR"]);
  assert.deepEqual(h.flow.procs().map((p) => p.name), ["RNAV (GPS) RWY 12"]);
});
