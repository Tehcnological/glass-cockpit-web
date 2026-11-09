// PROC: the PROCEDURES flow both units share (the MFD page and the PFD window).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProcFlow, PROC_MENU } from "../dist/procedures.js";

const leg = (fix, lat, role) => ({ fix, lat, lon: -112, type: "TF", alt: null, role });
const legs = [leg("ONEIF", 33.25, "IF"), leg("TWOFA", 33.32, "FAF"), leg("RW36", 33.395, "MAP"), leg("THREE", 33.5, "MISSED")];
const host = () => {
  const h = {
    s: {
      route: ["ABC", "KAAA"], activeLeg: 1, lat: 33, lon: -112, points: [{ id: "ABC", type: "VOR", lat: 33.5, lon: -111.85 }],
      airports: [{ id: "KAAA", name: "Demo Field", lat: 33.4, lon: -112, runways: [], freqs: [], approaches: [] }],
      procedures: ["ILS RWY 36", "RNAV (GPS) RWY 36"].map((name) => ({ airport: "KAAA", name, transitions: { VECTORS: [] }, legs })),
    },
    changes: [], closed: 0,
  };
  h.flow = new ProcFlow({ s: () => h.s, change: (p) => h.changes.push(p), close: () => h.closed++ });
  return h;
};

test("PROC opens on SELECT APPROACH, with the plan's destination", () => {
  const h = host();
  h.flow.open();
  assert.equal(h.flow.view, "menu");
  assert.equal(PROC_MENU[h.flow.item], "SELECT APPROACH");
  assert.equal(h.flow.airport, "KAAA");
  assert.deepEqual(PROC_MENU.map((_, i) => h.flow.enabled(i)), [false, false, false, true, false, false], "nothing loaded yet");
});

test("ACTIVATE an approach the GPS may not fly asks first, then loads it", () => {
  const h = host();
  h.flow.open();
  h.flow.ent(); // SELECT APPROACH
  assert.equal(h.flow.view, "select");
  h.flow.ent(); // the ILS, one transition: on to MINIMUMS
  h.flow.ent(); // minimums off: on to LOAD?
  assert.equal(h.flow.grp, "LOAD");
  h.flow.fms(true, 1);
  h.flow.ent(); // ACTIVATE?
  assert.equal(h.flow.view, "ask");
  h.flow.ent(); // YES
  assert.equal(h.closed, 1);
  assert.deepEqual(h.changes[0].route.map((r) => (typeof r === "string" ? r : r.id)), ["ABC", "KAAA", "ONEIF", "TWOFA", "RW36", "THREE"]);
});

test("CLR steps back: NOT APPROVED FOR GPS, then the menu, then closes", () => {
  const h = host();
  h.flow.open();
  h.flow.ent();
  h.flow.clr();
  assert.equal(h.flow.view, "menu");
  h.flow.clr();
  assert.equal(h.closed, 1);
});

// Pilot's Guide: LD APR on the Nearest Airports page opens the approach loading page with the transitions field highlighted.
test("LD APR opens SELECT APPROACH on that airport and approach, at the transition", () => {
  const h = host();
  h.s.procedures[1].transitions = { VECTORS: [], ABC: [] };
  assert.equal(h.flow.loadApproach("KAAA", "RNAV (GPS) RWY 36"), true);
  assert.deepEqual([h.flow.view, h.flow.airport, h.flow.apr, h.flow.grp], ["select", "KAAA", 1, "TRANS"]);
  assert.equal(h.flow.loadApproach("KAAA", "ILS RWY 36"), true);
  assert.equal(h.flow.grp, "MIN", "one transition: straight to MINIMUMS");
  assert.equal(h.flow.loadApproach("KAAA", "VOR RWY 18"), false, "no procedure data for it");
});

// Pilot's Guide, approach loading: the transition (if more than one), then MINIMUMS (ENT skips them), then LOAD?.
test("SELECT APPROACH steps approach, transition, minimums, then LOAD?", () => {
  const h = host();
  h.s.procedures[0].transitions = { VECTORS: [], ABC: [] };
  h.flow.open();
  h.flow.ent();
  const steps = [];
  for (let i = 0; i < 4; i++) {
    steps.push(h.flow.grp);
    h.flow.ent();
  }
  assert.deepEqual(steps, ["APR", "TRANS", "MIN", "LOAD"]);
  assert.equal(h.changes.length, 1, "ENT on LOAD? loads it");
});

test("BARO minimums: on at the field elevation, 10 ft steps, and loading sets them", () => {
  const h = host();
  h.s.airports[0].elev = 1135;
  h.flow.open();
  h.flow.ent();
  h.flow.ent(); // to MINIMUMS
  h.flow.fms(false, 1); // BARO
  assert.equal(h.flow.baro, 1200);
  h.flow.ent();
  assert.equal(h.flow.grp, "MINALT");
  h.flow.fms(false, -2);
  h.flow.ent();
  assert.equal(h.flow.grp, "LOAD");
  h.flow.ent();
  assert.equal(h.changes[0].minimums, 1180);
});

test("minimums left off do not change the PFD's", () => {
  const h = host();
  h.flow.open();
  h.flow.ent();
  h.flow.ent();
  h.flow.ent();
  h.flow.ent();
  assert.equal("minimums" in h.changes[0], false);
});

test("the loading page's view: approaches, the fix sequence with roles, and LOAD? under the cursor", () => {
  const h = host();
  h.flow.open();
  h.flow.ent();
  h.flow.ent();
  h.flow.ent();
  const v = h.flow.loading(true);
  assert.deepEqual(v.approaches.map((r) => [r.label, r.cur]), [["ILS RWY 36", false], ["RNAV (GPS) RWY 36", false]]);
  assert.deepEqual(v.sequence.map((r) => [r.label, r.role]), [["ONEIF", "IF"], ["TWOFA", "FAF"], ["RW36", "MAP"], ["THREE", "MA"]]);
  assert.deepEqual([v.load, v.activate, v.min.mode], [true, false, "OFF"]);
});
