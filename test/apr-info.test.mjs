// WPT - APPROACH INFORMATION (the APR softkey on the airport page), as the Pilot's Guide steps through it: the
// airport, then the approach, its transition, minimums and the fix sequence, each previewed on the map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AprInfo } from "../dist/apr-info.js";
import { approachPoints } from "../dist/nav.js";
import { IdEntry } from "../dist/ui.js";

const leg = (fix, lat, role) => ({ fix, lat, lon: -112, type: "TF", alt: null, role });
const legs = [leg("ONEIF", 33.25, "IF"), leg("TWOFA", 33.32, "FAF"), leg("RW36", 33.395, "MAP"), leg("THREE", 33.5, "MISSED")];
const transitions = { VECTORS: [], ZOMAK: [leg("ZOMAK", 33.18, "IAF"), leg("ONEIF", 33.25, "IF")] };
const airport = { id: "KAAA", name: "Demo Field", lat: 33.4, lon: -112, elev: 1135, runways: [], freqs: [], approaches: ["ILS OR LOC RWY 36", "RNAV (GPS) RWY 36", "VOR RWY 18"] };
const procedures = ["ILS OR LOC RWY 36", "RNAV (GPS) RWY 36"].map((name) => ({ airport: "KAAA", name, transitions, legs }));
const c = { airport, procedures };
const info = () => new AprInfo(new IdEntry(null, 4));

test("approach points: the transition's legs into the approach's, the shared fix once", () => {
  const ids = approachPoints(procedures[0], "ZOMAK").map((p) => `${p.id} ${p.role}`);
  assert.deepEqual(ids, ["ZOMAK IAF", "ONEIF IF", "TWOFA FAF", "RW36 MAP", "THREE MISSED"]);
  assert.equal(approachPoints(procedures[0], "NOPE").length, 4);
});

test("the view: approaches without procedure data are dim, and the selected one's transitions and sequence show", () => {
  const a = info();
  const v = a.view(c, true);
  assert.deepEqual(v.approaches.map((r) => r.dim), [false, false, true]);
  assert.deepEqual(v.transitions.map((r) => r.label), ["VECTORS", "ZOMAK"]);
  assert.deepEqual(v.sequence.map((r) => `${r.label} ${r.role}`), ["ONEIF IF", "TWOFA FAF", "RW36 MAP", "THREE MA"]);
  assert.ok(v.aptCur, "the cursor starts on the airport");
  assert.equal(v.min.mode, "OFF");
});

test("ENT steps approach, transition, minimums (BARO and its altitude), then the sequence", () => {
  const a = info();
  a.ent(c); // airport
  assert.equal(a.grp, "APR");
  a.fms(c, false, 1);
  assert.equal(a.view(c, true).approaches.findIndex((r) => r.cur), 1);
  a.ent(c);
  assert.equal(a.grp, "TRANS");
  a.fms(c, false, 1);
  assert.deepEqual(a.view(c, true).sequence.map((r) => r.label), ["ZOMAK", "ONEIF", "TWOFA", "RW36", "THREE"]);
  a.ent(c);
  assert.equal(a.grp, "MIN");
  a.fms(c, false, 1); // BARO on, from the field elevation
  assert.deepEqual([a.view(c, true).min.mode, a.view(c, true).min.alt], ["BARO", "1200FT"]);
  a.ent(c);
  assert.equal(a.grp, "MINALT");
  a.fms(c, false, 3);
  assert.equal(a.view(c, true).min.alt, "1230FT");
  a.ent(c);
  assert.equal(a.grp, "SEQ");
});

test("minimums off: ENT skips the altitude, and so does the large knob", () => {
  const a = info();
  [a.grp] = ["MIN"];
  a.ent(c);
  assert.equal(a.grp, "SEQ");
  a.fms(c, true, -1);
  assert.equal(a.grp, "MIN");
  a.fms(c, false, 1);
  a.fms(c, true, 1);
  assert.equal(a.grp, "MINALT");
});

test("a new approach starts at its first transition; one with no data has none, and ENT goes on to minimums", () => {
  const a = info();
  [a.grp, a.trans] = ["APR", 1];
  a.fms(c, false, 5);
  assert.equal(a.apr, 2);
  assert.equal(a.trans, 0);
  const v = a.view(c, true);
  assert.deepEqual([v.transitions.length, v.sequence.length], [0, 0]);
  assert.deepEqual(a.preview(c), []);
  a.ent(c);
  assert.equal(a.grp, "MIN");
});

test("spelling an airport: ENT returns it and starts over on its approaches", () => {
  const a = info();
  [a.apr, a.trans] = [1, 1];
  a.fms(c, false, 1); // starts spelling "A"
  assert.ok(a.entry.editing);
  assert.equal(a.view(c, true).apt, "A___");
  assert.equal(a.ent(c), "A");
  assert.deepEqual([a.grp, a.apr, a.trans], ["APR", 0, 0]);
  a.fms(c, false, 1);
  a.clr();
  assert.ok(!a.entry.editing, "CLR cancels the spelling");
});

test("the large knob skips TRANSITIONS when the approach has none", () => {
  const bare = { airport, procedures: [{ airport: "KAAA", name: "ILS OR LOC RWY 36", transitions: {}, legs }] };
  const a = info();
  a.ent(bare);
  a.fms(bare, true, 1);
  assert.equal(a.grp, "MIN");
  a.fms(bare, true, -1);
  assert.equal(a.grp, "APR");
});
