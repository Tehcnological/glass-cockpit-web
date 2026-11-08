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

test("an airport's repeated frequency is listed once", () => {
  const twice = { ...rows, FRQ: [...rows.FRQ, rows.FRQ.find((r) => r.SERVICED_FACILITY === "PHX" && r.FREQ_USE.includes("LCL/"))] };
  const phx = (n) => n.airports.find((a) => a[0] === "PHX")[5];
  assert.deepEqual(phx(buildNasr("2026-10-29", twice, [])), phx(expected.nasr));
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
});

test("main entry and radio do not load navdata", () => {
  for (const f of ["glass-pfd.js", "radio.js"]) {
    assert.ok(!readFileSync(new URL(`../dist/${f}`, import.meta.url), "utf8").includes("navdata"), f);
  }
});
