import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approachName, buildNasr, near, parseCifp } from "../dist/navdata.js";

const fixture = (f) => JSON.parse(readFileSync(new URL(`fixtures/${f}`, import.meta.url), "utf8"));
const rows = fixture("nasr-rows.json");
const expected = fixture("nasr-expected.json");

test("buildNasr reproduces today's records for real 2026-10-29 rows", () => {
  assert.deepEqual(buildNasr("2026-10-29", rows, []), expected.nasr);
});

const copy = (row, patch, drop) => {
  const r = { ...row, ...patch };
  if (drop) delete r[drop];
  return r;
};

test("an FRQ row without a position makes no station", () => {
  const rcag = rows.FRQ.find((r) => r.FACILITY_TYPE === "RCAG");
  const more = { ...rows, FRQ: [...rows.FRQ, copy(rcag, { LAT_DECIMAL: "", LONG_DECIMAL: "", FREQ: "135.99" })] };
  assert.deepEqual(buildNasr("2026-10-29", more, []).stations, expected.nasr.stations);
});

test("a navaid with an empty or missing ALT_CODE has no class", () => {
  const pxr = rows.NAV_BASE.find((r) => r.NAV_ID === "PXR");
  const more = { ...rows, NAV_BASE: [...rows.NAV_BASE, copy(pxr, { NAV_ID: "ZZY", ALT_CODE: "" }), copy(pxr, { NAV_ID: "ZZZ" }, "ALT_CODE")] };
  const cls = (id) => buildNasr("2026-10-29", more, []).navaids.find((n) => n[0] === id)[10];
  assert.equal(cls("ZZY"), "");
  assert.equal(cls("ZZZ"), "");
});

test("an airport with no FUEL_TYPES column has no fuel", () => {
  const p01 = rows.APT_BASE.find((r) => r.ARPT_ID === "P01");
  const more = { ...rows, APT_BASE: rows.APT_BASE.map((r) => (r === p01 ? copy(r, {}, "FUEL_TYPES") : r)) };
  assert.equal(buildNasr("2026-10-29", more, []).airports.find((a) => a[0] === "P01")[10], "");
});

test("a weather station takes the FAA id when there is no ICAO id or no airport", () => {
  // The fixture has no ASOS/AWOS rows, so make one from a PHX tower row.
  const asos = copy(rows.FRQ.find((r) => r.FACILITY_TYPE === "ATCT" && r.SERVICED_FACILITY === "PHX"), { FACILITY_TYPE: "ASOS_AWOS", SERVICED_SITE_TYPE: "ASOS", FREQ_USE: "" });
  const more = { ...rows, FRQ: [...rows.FRQ, copy(asos, { SERVICED_FACILITY: "P01", FREQ: "135.95" }), copy(asos, { SERVICED_FACILITY: "XYZ", FREQ: "135.85" })] };
  const ids = buildNasr("2026-10-29", more, []).stations.filter((s) => s[0] === "WX").map((s) => s[1]);
  assert.ok(ids.includes("P01"), ids.join());
  assert.ok(ids.includes("XYZ"), ids.join());
});

test("an airport's repeated frequency is listed once", () => {
  const twice = { ...rows, FRQ: [...rows.FRQ, rows.FRQ.find((r) => r.SERVICED_FACILITY === "PHX" && r.FREQ_USE.includes("LCL/"))] };
  const phx = (n) => n.airports.find((a) => a[0] === "PHX")[5];
  assert.deepEqual(phx(buildNasr("2026-10-29", twice, [])), phx(expected.nasr));
});

const awy = fixture("awy-rows.json");
const withAwy = (seg = awy.AWY_SEG_ALT) => ({
  ...rows, NAV_BASE: [...rows.NAV_BASE, ...awy.NAV_BASE], FIX_BASE: [...rows.FIX_BASE, ...awy.FIX_BASE], AWY_SEG_ALT: seg,
});

const idsOf = (airways) => airways.map(([id, type, points]) => [id, type, points.map((p) => p[0])]);

test("buildNasr builds airways from real 2026-10-29 AWY_SEG_ALT rows as AWY_BASE strings them", () => {
  assert.deepEqual(idsOf(buildNasr("2026-10-29", withAwy(), []).airways), fixture("awy-expected.json").airways);
});

test("buildNasr orders an airway's rows by POINT_SEQ, whatever order they come in", () => {
  assert.deepEqual(buildNasr("2026-10-29", withAwy([...awy.AWY_SEG_ALT].reverse()), []).airways, buildNasr("2026-10-29", withAwy(), []).airways);
});

test("buildNasr keeps each airway point's type, so a fix sharing a VOR's id is not taken for it", () => {
  const fix = copy(awy.FIX_BASE[0], { FIX_ID: "BXK" });
  const q180 = buildNasr("2026-10-29", { ...withAwy(), FIX_BASE: [...withAwy().FIX_BASE, fix] }).airways.find((a) => a[0] === "Q180");
  assert.deepEqual(q180[2], [["BXK", "VOR"], ["SATRN", "FIX"], ["WOBUG", "FIX"], ["DMN", "VOR"], ["EWM", "VOR"]]);
});

test("an airway breaks at a gap and at a point with no record; other routes are left out; Alaska ids stay apart", () => {
  const seg = awy.AWY_SEG_ALT.map((r) =>
    r.AWY_ID === "J212" && r.FROM_POINT === "CULTS" ? copy(r, { AWY_SEG_GAP_FLAG: "Y" })
      : r.AWY_ID === "T310" && r.FROM_POINT === "MESCA" ? copy(r, { FROM_PT_TYPE: "DME" })
        : r);
  const v461 = seg.filter((r) => r.AWY_ID === "V461");
  seg.push(...v461.map((r) => copy(r, { AWY_ID: "TK502" })), ...v461.map((r) => copy(r, { AWY_LOCATION: "A" })));
  assert.deepEqual(idsOf(buildNasr("2026-10-29", withAwy(seg), []).airways), [
    ["J212", "HI", ["TFD", "BXK", "CULTS"]], ["J212", "HI", ["HRRBR", "CURIV", "DECAS", "PSP"]],
    ["Q180", "HI", ["BXK", "SATRN", "WOBUG", "DMN", "EWM"]],
    ["T310", "LO", ["TUS", "OBISE", "SULLI"]], ["T310", "LO", ["HOOVE", "NOCHI", "SSO", "SVC", "KEAPS", "TCS"]],
    ["V461", "LO", ["GBN", "BXK"]], ["V461", "LO", ["GBN", "BXK"]],
  ]);
});

test("near returns the airway segments within range, whole, with every point they use", () => {
  const out = near(buildNasr("2026-10-29", withAwy(), []), { cycle: "2026-10-29", procedures: [] }, 33.4, -111.9, 40);
  // TFD-BXK and BXK-SATRN pass within 40 nm; SATRN-WOBUG starts at SATRN, 35 nm out. BXK-CULTS and V461 do not.
  assert.deepEqual(out.airways, [
    { id: "J212", type: "HI", points: ["TFD", "BXK"] }, { id: "Q180", type: "HI", points: ["BXK", "SATRN", "WOBUG"] },
  ]);
  const ids = out.points.map((p) => p.id);
  for (const a of out.airways) for (const id of a.points) assert.ok(ids.includes(id), id);
  assert.equal(out.points.find((p) => p.id === "WOBUG").type, "FIX"); // beyond the 40 nm fix cut
  assert.equal(new Set(ids).size, ids.length);
});

const record = (o) => ({ cycle: "2026-10-29", navaids: [], fixes: [], airports: [], stations: [], airspace: [], ...o });
const noCifp = { cycle: "2026-10-29", procedures: [] };
const last = (out, id) => out.points.filter((p) => p.id === id).at(-1); // the map takes an id's last point

test("near resolves an airway point by its type: an NDB, not the fix sharing its id", () => {
  const nasr = record({
    navaids: [["ABC", "NDB", 37, -112, 350, "ABC", "NDB", "", "AZ", 10, ""]],
    fixes: [["P2", 36.9, -112, "AZ"], ["ABC", 33.45, -111.9, "AZ"]],
    airways: [["V1", "LO", [["P2", "FIX"], ["ABC", "NDB"]]]],
  });
  assert.deepEqual(near(nasr, noCifp, 33.4, -111.9, 10).airways, []); // the NDB is 215 nm north
  const out = near(nasr, noCifp, 36.95, -112, 10);
  assert.deepEqual(out.airways, [{ id: "V1", type: "LO", points: ["P2", "ABC"] }]);
  assert.equal(last(out, "ABC").type, "NDB");
});

test("near adds an airway point beyond range even when an airport in range has its id", () => {
  const nasr = record({
    airports: [["WOB", "", "TEST", 33.4, -111.9, [], 1000, [], "", "AZ", ""]],
    fixes: [["P1", 33.41, -111.9, "AZ"], ["WOB", 33.9, -111.9, "AZ"]],
    airways: [["V1", "LO", [["P1", "FIX"], ["WOB", "FIX"]]]],
  });
  const out = near(nasr, noCifp, 33.4, -111.9, 10);
  assert.deepEqual(out.airways, [{ id: "V1", type: "LO", points: ["P1", "WOB"] }]);
  assert.equal(last(out, "WOB").type, "FIX");
});

test("near measures across 180 degrees longitude, and keeps an Alaska airway apart from one sharing its id", () => {
  const nasr = record({
    fixes: [["A", 52, 179.5, "AK"], ["B", 52, -179.5, "AK"], ["C", 52, 179.95, "AK"], ["D", 33.4, -111.9, "AZ"], ["E", 33.5, -111.9, "AZ"]],
    airways: [["V1", "LO", [["A", "FIX"], ["B", "FIX"]]], ["V1", "LO", [["D", "FIX"], ["E", "FIX"]]]],
  });
  const out = near(nasr, noCifp, 52, -179.95, 10);
  assert.deepEqual(out.airways, [{ id: "V1", type: "LO", points: ["A", "B"] }]);
  assert.deepEqual(out.points.map((p) => p.id).sort(), ["A", "B", "C"]); // C is 4 nm west, across the line
});

// KPHX ILS RWY 08 from CIFP 2611, with its fixes.
const CIFP = `
SUSAEAENRT   ALLIS K20    C   L N33265718W112373164                       E0098     NAR           ALLIS                    275972605
SUSAEAENRT   AVENT K20    C   L N33413173W112020993                       E0097     NAR           AVENT                    281962605
SUSAP KPHXK2CHIKID K20    R     N33262658W112212608                       E0098     NAR           HIKID                    878002403
SUSAP KPHXK2CILIKE K20    R     N33262696W112170867                       E0097     NAR           ILIKE                    878052605
SUSAP KPHXK2CJAMIL K20    C     N33262719W112125126                       E0097     NAR           JAMIL                    878072605
SUSAP KPHXK2CSARTE K20    R     N33262606W112254134                       E0098     NAR           SARTE                    878472605
SUSAP KPHXK2CWAZUP K20    C     N33262727W112083386                       E0097     NAR           WAZUP                    878732605
SUSAP KPHXK2FI08   AALLIS 010ALLISK2EA0E  A    IF                                             18000                 0 NS   887222201
SUSAP KPHXK2FI08   AALLIS 020         0        VI                     1230        + 06000                           0 NS   887232201
SUSAP KPHXK2FI08   AALLIS 030SARTEK2PC0E       CF ISYQK2      2581022107810094PI  + 06000                           0 NS   887242201
SUSAP KPHXK2FI08   AALLIS 040HIKIDK2PC0E       CF ISYQK2      2581018507810036PI  + 06000                           0 NS   887252201
SUSAP KPHXK2FI08   AALLIS 050ILIKEK2PC0EE B    CF ISYQK2      2581014907810036PI  + 05000                           0 NS   887262201
SUSAP KPHXK2FI08   I      010ILIKEK2PC0E  I    IF ISYQK2      25810149        PI  J 050000300018000                 0 NS   887272201
SUSAP KPHXK2FI08   I      011JAMILK2PC0E       CF ISYQK2      2581011307800036PI  + 04000                           0 NS   887282201
SUSAP KPHXK2FI08   I      020WAZUPK2PC0E  F    CF ISYQK2      2581007707800036PI  H 0300003000            PXR   K2D 0 NS   887292201
SUSAP KPHXK2FI08   I      030RW08 K2PG0GY M    CF ISYQK2      2581001907800058PI    01168             -300          0 NS   887302201
SUSAP KPHXK2FI08   I      040         0  M     CA                     0781        + 03000                           0 NS   887312201
SUSAP KPHXK2FI08   I      060AVENTK2EA0EY      CF PXR K2      3360015933600129D   + 05000                           0 NS   887332201
SUSAP KPHXK2GRW08    0114890780 N33262709W112013666         +0309301113089855150IISYQ1                                     889101612
`;

test("CIFP approaches: transitions, final legs, fix positions and roles", () => {
  const [p] = parseCifp(CIFP);
  const [airport, name, trans, legs] = p;
  assert.equal(airport, "KPHX");
  assert.equal(name, "ILS RWY 08");
  assert.deepEqual(Object.keys(trans), ["VECTORS", "ALLIS"]);
  assert.deepEqual(trans.ALLIS.map((l) => l[0]), ["ALLIS", "SARTE", "HIKID", "ILIKE"]); // the heading leg has no fix
  assert.deepEqual(legs.map((l) => [l[0], l[4], l[5]]), [
    ["ILIKE", "5000", "IF"], ["JAMIL", "4000+", null], ["WAZUP", "3000", "FAF"], ["RW08", "1168", "MAP"], ["AVENT", "5000+", "MISSED"],
  ]);
  // N33°26'57.18" W112°37'31.64"
  assert.deepEqual(trans.ALLIS[0].slice(1, 3), [33.44922, -112.62546]);
  // Inbound fixes run east toward the runway.
  assert.ok(legs[0][2] < legs[1][2] && legs[1][2] < legs[2][2] && legs[2][2] < legs[3][2]);
});

test("approach names", () => {
  assert.equal(approachName("I07L"), "ILS RWY 07L");
  assert.equal(approachName("R08-Y"), "RNAV (GPS) Y RWY 08");
  assert.equal(approachName("R30CY"), "RNAV (GPS) Y RWY 30C");
  assert.equal(approachName("H03-Z"), "RNAV (RNP) Z RWY 03");
  assert.equal(approachName("VDM-A"), "VOR/DME-A");
  assert.equal(approachName("RNV-D"), "RNAV (GPS)-D");
});

test("CIFP with CRLF line endings parses the same", () => {
  assert.deepEqual(parseCifp(CIFP.replace(/\n/g, "\r\n")), parseCifp(CIFP));
});

test("near keeps navaids and stations to 200 nm and the rest to range", () => {
  const leg = (fix, lat, lon) => [fix, lat, lon, "TF", null, null];
  const nasr = {
    cycle: "2026-10-29",
    navaids: [
      ["FAR", "VOR", 34.65, -112.42, 113.4, "FAR VOR", "VORTAC", "PRESCOTT", "AZ", 11, "LOW ALT"], // ~80 nm: in, NRST reach
      ["OUT", "VOR", 37.0, -111.9, 112.0, "OUT VOR", "VOR", "PAGE", "AZ", 11, ""], // ~216 nm: out
    ],
    fixes: [["NEAR1", 33.5, -112.05, "AZ"], ["FAR1", 34.4, -111.9, "AZ"]], // ~10 nm in, ~60 nm out
    airports: [
      ["PHX", "KPHX", "PHOENIX SKY HARBOR INTL", 33.43, -112.01, [["TOWER", "118.700"]], 1135,
        [["08-26", 11489, 150, "CONC", "HIGH"]], "PHOENIX", "AZ", "100LL, A"],
      ["PRC", "KPRC", "PRESCOTT RGNL", 34.65, -112.42, [], 5045, [], "PRESCOTT", "AZ", ""], // ~80 nm: out
    ],
    stations: [["WX", "KPRC", "ASOS", 34.65, -112.42, "135.775"]], // ~80 nm: in
    airspace: [
      ["B", "PHOENIX", "SFC", 10000, [[[33.43, -112.01], [33.5, -112.0], [33.43, -111.95]]]],
      ["D", "PRESCOTT", "SFC", 7500, [[[34.65, -112.42], [34.7, -112.4], [34.6, -112.4]]]],
    ],
  };
  const cifp = {
    cycle: "2026-10-29",
    procedures: [
      ["KPHX", "ILS RWY 08", { VECTORS: [] }, [leg("ILIKE", 33.44, -112.28)]],
      ["KPRC", "ILS RWY 21L", { VECTORS: [] }, [leg("XXX", 34.7, -112.4)]],
    ],
  };
  const out = near(nasr, cifp, 33.4, -111.9, 40);
  const ids = (type) => out.points.filter((p) => p.type === type).map((p) => p.id);
  assert.deepEqual(ids("APT"), ["KPHX"]);
  assert.deepEqual(ids("VOR"), ["FAR"]);
  assert.deepEqual(ids("FIX"), ["NEAR1"]);
  assert.equal(out.airports.length, 1);
  assert.deepEqual(out.airports[0].approaches, ["ILS RWY 08"]);
  assert.deepEqual(out.procedures.map((p) => p.airport), ["KPHX"]);
  assert.equal(out.stations.length, 1);
  assert.equal(out.airspaces.length, 1);
  assert.equal(out.airspaces[0].cls, "B");
  assert.deepEqual(out.airways, []); // a record built before airways has none
});

test("main entry and radio do not load navdata, directly or through their imports", () => {
  const seen = new Set();
  const walk = (url) => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const [, spec] of readFileSync(url, "utf8").matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) walk(new URL(spec, url));
  };
  for (const f of ["glass-pfd.js", "radio.js"]) walk(new URL(`../dist/${f}`, import.meta.url));
  assert.ok(seen.size > 5, `only ${seen.size} modules found; the import walk is broken`);
  assert.ok(![...seen].some((u) => u.endsWith("/navdata.js")), [...seen].join("\n"));
});
