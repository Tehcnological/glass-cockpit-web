// FAA NASR and CIFP data (public domain) as glass-cockpit-web takes it: the NASR and CIFP records, the transformations
// from the FAA's files to them, and `near`, which picks what a map needs. Build-time code, moved here from instrumentready.com
// on 2026-11-07; no display imports it. The host downloads and unpacks the files. Not for navigation.
import type { Airport, ProcLeg, Procedure, Station } from "./nav.js";
import type { Airspace, MapPoint } from "./map.js";

export type NasrRunway = [id: string, /** feet */ length: number, /** feet */ width: number, surface: string, lights: string];

export interface Nasr {
  cycle: string; // effective date of the NASR cycle
  navaids: [id: string, type: "VOR" | "NDB", lat: number, lon: number, freq: number, name: string, kind: string, city: string,
    state: string, /** degrees, east positive */ magVar: number, cls: string][];
  fixes: [id: string, lat: number, lon: number, state: string][];
  airports: [id: string, icao: string, name: string, lat: number, lon: number, freqs: [use: string, freq: string][],
    /** feet */ elev: number, /** longest first */ runways: NasrRunway[], city: string, state: string, fuel: string][];
  stations: [type: Station["type"], id: string, name: string, lat: number, lon: number, freq: string][];
  airspace: [cls: "B" | "C" | "D", name: string, floor: number | "SFC", ceiling: number, rings: [lat: number, lon: number][][]][];
}

export type CifpLeg = [fix: string, lat: number, lon: number, type: string, alt: string | null, role: ProcLeg["role"] | null];
export interface Cifp {
  cycle: string;
  procedures: [airport: string, name: string, transitions: Record<string, CifpLeg[]>, legs: CifpLeg[]][];
}

/** Distance in nm, flat-earth: fine for picking what is on a map a few hundred nm across. */
function nm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(x, lat2 - lat1) * 60;
}

/** Map points, airspace, airports, frequencies and approaches near a position, in the shapes glass-cockpit-web takes. */
export function near(data: Nasr, cifp: Cifp, lat: number, lon: number, range: number) {
  const within = (r: number) => (la: number, lo: number) => nm(lat, lon, la, lo) <= r;
  const inRange = within(range);
  const apts = data.airports.filter((a) => inRange(a[3], a[4]));
  const procedures: Procedure[] = [];
  const ids = new Set(apts.map((a) => a[1] || a[0]));
  const leg = ([fix, la, lo, type, alt, role]: CifpLeg): ProcLeg => ({ fix, lat: la, lon: lo, type, alt, ...(role && { role }) });
  for (const [airport, name, trans, legs] of cifp.procedures) {
    if (!ids.has(airport)) continue;
    procedures.push({ airport, name, legs: legs.map(leg), transitions: Object.fromEntries(Object.entries(trans).map(([t, l]) => [t, l.map(leg)])) });
  }
  const airports: Airport[] = apts.map(([id, icao, name, la, lo, freqs, elev, runways, city, state, fuel]) => ({
    id: icao || id, name, city, region: state, use: "PUBLIC", lat: la, lon: lo, elev, fuel,
    runways: runways.map(([rid, length, width, surface, lights]) => ({ id: rid, length, width, surface, lights })),
    freqs: freqs.map(([use, freq]) => ({ use, freq })),
    approaches: procedures.filter((p) => p.airport === (icao || id)).map((p) => p.name),
  }));
  const points: MapPoint[] = [
    ...airports.map((a): MapPoint => ({ id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name })),
    // The NRST pages list VORs and NDBs out to 200 nm.
    ...data.navaids.filter((n) => within(Math.max(range, 200))(n[2], n[3])).map(([id, type, la, lo, freq, name, kind, city, state, magVar, cls]): MapPoint => ({
      id, type, lat: la, lon: lo, name, kind, city, region: state, magVar, cls, freq: type === "VOR" ? freq.toFixed(2) : String(freq),
    })),
    ...data.fixes.filter((f) => inRange(f[1], f[2])).map(([id, la, lo, state]): MapPoint => ({ id, type: "FIX", lat: la, lon: lo, region: state })),
  ];
  const airspaces: Airspace[] = data.airspace
    .filter(([, , , , rings]) => rings.some((r) => r.some(([la, lo]) => inRange(la, lo))))
    .map(([cls, , , , rings]) => ({ cls, rings }));
  // The NRST pages look up to 200 nm for centers and flight service.
  const stations: Station[] = data.stations.filter((s) => within(Math.max(range, 200))(s[3], s[4]))
    .map(([type, id, name, la, lo, freq]) => ({ type, id, name, lat: la, lon: lo, freq }));
  return { points, airspaces, airports, stations, procedures };
}

// ARINC 424 approach types (route type of the final approach) as the charts name them.
const TYPES: Record<string, string> = {
  I: "ILS", L: "LOC", B: "LOC BC", R: "RNAV (GPS)", H: "RNAV (RNP)", P: "GPS", V: "VOR", S: "VOR/DME", D: "VOR/DME", N: "NDB",
  Q: "NDB/DME", X: "LDA", U: "SDF", T: "TACAN",
};
const CIRCLING: Record<string, string> = {
  RNV: "RNAV (GPS)", VDM: "VOR/DME", VOR: "VOR", NDB: "NDB", GPS: "GPS", LOC: "LOC", LDA: "LDA", LBC: "LOC BC", TCN: "TACAN", SDF: "SDF", ILS: "ILS",
};

/** "I07L" -> "ILS RWY 07L", "R08-Y" -> "RNAV (GPS) Y RWY 08", "VDM-A" -> "VOR/DME-A". */
export function approachName(id: string): string {
  const c = id.match(/^([A-Z]{3})-([A-Z])$/);
  if (c) return `${CIRCLING[c[1]] ?? c[1]}-${c[2]}`;
  const r = id.match(/^([A-Z])(\d\d[LRC]?)-?([A-Z]?)$/);
  return r ? `${TYPES[r[1]] ?? r[1]}${r[3] ? ` ${r[3]}` : ""} RWY ${r[2]}` : id;
}

// N33263204 / W112193234: degrees, minutes, seconds in hundredths.
function coord(s: string): number | null {
  if (!/^[NSEW]\d{8,9}$/.test(s)) return null;
  const n = s.length - 6; // after the degrees: minutes, then seconds in hundredths
  const v = Number(s.slice(1, n)) + Number(s.slice(n, n + 2)) / 60 + Number(s.slice(n + 2)) / 360000;
  return Math.round((s[0] === "S" || s[0] === "W" ? -v : v) * 1e5) / 1e5;
}

/** Fix positions from the CIFP's waypoint, runway and navaid records. Keys come from cifpFixKey. */
function cifpPositions(lines: string[]): Map<string, [number, number]> {
  const at = new Map<string, [number, number]>();
  for (const l of lines) {
    if (l[0] !== "S") continue;
    const sec = l[4] === "P" ? `P${l[12]}` : l.slice(4, 6);
    let key: string | null = null;
    if (sec === "PC" || sec === "PG" || sec === "PN") key = `${sec}|${l.slice(6, 10).trim()}|${l.slice(13, 18).trim()}`;
    else if (sec === "EA" || sec === "D " || sec === "DB") key = `${sec}|${l.slice(13, 18).trim()}|${l.slice(19, 21)}`;
    if (!key || at.has(key)) continue;
    const la = coord(l.slice(32, 41));
    const lo = coord(l.slice(41, 51));
    if (la !== null && lo !== null) at.set(key, [la, lo]);
  }
  return at;
}

/** The key cifpPositions files an approach leg's fix under. */
function cifpFixKey(l: string, airport: string, fix: string): string {
  const sec = l.slice(36, 38);
  return sec[0] === "P" ? `${sec}|${airport}|${fix}` : `${sec}|${fix}|${l.slice(34, 36)}`;
}

/** An approach leg's altitude constraint, as the chart gives it. */
function cifpAlt(l: string): string | null {
  const [desc, alt1, alt2] = [l[82], l.slice(84, 89).trim(), l.slice(89, 94).trim()];
  return !/^\d+$/.test(alt1) ? null : desc === "B" && /^\d+$/.test(alt2) ? `${Number(alt2)}+` : `${Number(alt1)}${desc === "+" || desc === "-" ? desc : ""}`;
}

/** Waypoint description code, 4th character: the fix's role on the way in. */
const cifpRole = (l: string): CifpLeg[5] => ("ACD".includes(l[42]) ? "IAF" : "BI".includes(l[42]) ? "IF" : l[42] === "F" ? "FAF" : l[42] === "M" ? "MAP" : null);

/**
 * Approaches from the FAA CIFP file (ARINC 424-18, 132 columns): approach records (section P, subsection F) with their
 * fixes' positions from the waypoint, runway and navaid records. Legs without a fix (heading and altitude legs) are
 * left out.
 */
export function parseCifp(text: string): Cifp["procedures"] {
  const lines = text.split(/\r?\n/);
  const at = cifpPositions(lines);
  const procs = new Map<string, Cifp["procedures"][number] & { missed: boolean }>();
  for (const l of lines) {
    if (l[0] !== "S" || l[4] !== "P" || l[12] !== "F" || !"01".includes(l[38])) continue;
    const airport = l.slice(6, 10).trim();
    const id = l.slice(13, 19).trim();
    const fix = l.slice(29, 34).trim();
    if (!fix) continue;
    const pos = at.get(cifpFixKey(l, airport, fix));
    if (!pos) continue;
    const k = `${airport} ${id}`;
    let p = procs.get(k);
    if (!p) procs.set(k, (p = Object.assign([airport, approachName(id), {}, []] as Cifp["procedures"][number], { missed: false })));
    const role: CifpLeg[5] = p.missed ? "MISSED" : cifpRole(l);
    const leg: CifpLeg = [fix, pos[0], pos[1], l.slice(47, 49), cifpAlt(l), role];
    if (l[19] === "A") (p[2][l.slice(20, 25).trim() || "VECTORS"] ??= []).push(leg);
    else p[3].push(leg);
    if (role === "MAP") p.missed = true;
  }
  return [...procs.values()]
    .map(([a, n, t, legs]): Cifp["procedures"][number] => [a, n, { VECTORS: [], ...t }, legs])
    .filter((p) => p[3].length)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

/** The six NASR CSV files buildNasr reads, by file name without .csv, as rows of column name to value. */
export type NasrCsv = Record<"NAV_BASE" | "FIX_BASE" | "APT_BASE" | "APT_RWY" | "FRQ" | "ILS_BASE", Record<string, string>[]>;

/**
 * NASR records from the 28-day subscription's CSV files: navaids (VOR, VOR/DME, VORTAC, NDB, NDB/DME) in service, fixes,
 * public-use airports with their frequencies, runways and details, and ARTCC, FSS and weather frequencies. Class B, C
 * and D airspace comes from a shapefile, so the host builds it and passes it in.
 */
export function buildNasr(cycle: string, csv: NasrCsv, airspace: Nasr["airspace"]): Nasr {
  const round = (v: string | number) => Math.round(Number(v) * 1e5) / 1e5;
  const vhf = (f: string) => Number(f) >= 118 && Number(f) < 137;
  const magVar = (v: string, hemis: string) => (Number(v) || 0) * (hemis === "W" ? -1 : 1);

  // Navaids: VORs and NDBs, in service. Service volume as the G1000 names it.
  const NAV_TYPES: Record<string, "VOR" | "NDB"> = { VOR: "VOR", "VOR/DME": "VOR", VORTAC: "VOR", NDB: "NDB", "NDB/DME": "NDB" };
  const CLASS: Record<string, string> = { H: "HIGH ALT", L: "LOW ALT", T: "TERMINAL" };
  const navRows = csv.NAV_BASE;
  const navaids: Nasr["navaids"] = navRows
    .filter((r) => NAV_TYPES[r.NAV_TYPE] && r.NAV_STATUS.startsWith("OPERATIONAL"))
    .map((r) => [r.NAV_ID, NAV_TYPES[r.NAV_TYPE], round(r.LAT_DECIMAL), round(r.LONG_DECIMAL), Number(r.FREQ), r.NAME, r.NAV_TYPE,
      r.CITY, r.STATE_CODE, magVar(r.MAG_VARN, r.MAG_VARN_HEMIS), CLASS[r.ALT_CODE?.[1]] ?? ""]);

  const fixes: Nasr["fixes"] = csv.FIX_BASE.map((r) => [r.FIX_ID, round(r.LAT_DECIMAL), round(r.LONG_DECIMAL), r.STATE_CODE]);

  // Airport frequencies under the G1000's labels; NASR's other uses (STAR and DP names, CLASS B, ...) are left out.
  const USES: [RegExp, string][] = [[/^D?-?ATIS$/, "ATIS"], [/^LCL\//, "TOWER"], [/^GND\//, "GROUND"], [/^CD(\/|$)/, "CLEARANCE"],
    [/^APCH\//, "APPROACH"], [/^DEP\//, "DEPARTURE"], [/^CTAF$/, "CTAF"], [/^UNICOM$/, "UNICOM"]];
  const apt = csv.APT_BASE.filter((r) => r.SITE_TYPE_CODE === "A" && r.FACILITY_USE_CODE === "PU" && r.ARPT_STATUS === "O");
  const icao = new Map(apt.map((r) => [r.ARPT_ID, r.ICAO_ID || r.ARPT_ID]));
  const freqs = new Map<string, [string, string][]>();
  const add = (id: string, use: string, f: string) => {
    const list = freqs.get(id) ?? [];
    const freq = Number(f).toFixed(3);
    if (!list.some(([u, x]) => u === use && x === freq)) list.push([use, freq]);
    freqs.set(id, list);
  };
  const frq = csv.FRQ;
  for (const r of frq) {
    if (!r.FREQ || !vhf(r.FREQ)) continue;
    if (r.FACILITY_TYPE === "ASOS_AWOS") add(r.SERVICED_FACILITY, r.SERVICED_SITE_TYPE.split("-")[0], r.FREQ);
    for (const use of r.FREQ_USE.split(" ")) {
      const label = USES.find(([re]) => re.test(use))?.[1];
      if (label) add(r.SERVICED_FACILITY, label, r.FREQ);
    }
  }
  for (const r of csv.ILS_BASE) {
    if (r.LOC_FREQ) add(r.ARPT_ID, `${["LS", "LD", "LG"].includes(r.SYSTEM_TYPE_CODE) ? "ILS" : "LOC"} ${r.RWY_END_ID}`, r.LOC_FREQ);
  }
  const runways = new Map<string, Nasr["airports"][number][7]>();
  for (const r of csv.APT_RWY) {
    const list = runways.get(r.ARPT_ID) ?? [];
    list.push([r.RWY_ID.replace("/", "-"), Number(r.RWY_LEN) || 0, Number(r.RWY_WIDTH) || 0, r.SURFACE_TYPE_CODE, r.RWY_LGT_CODE]);
    runways.set(r.ARPT_ID, list);
  }
  const airports: Nasr["airports"] = apt.map((r) => [r.ARPT_ID, r.ICAO_ID, r.ARPT_NAME, round(r.LAT_DECIMAL), round(r.LONG_DECIMAL),
    freqs.get(r.ARPT_ID) ?? [], Math.round(Number(r.ELEV)), (runways.get(r.ARPT_ID) ?? []).sort((a, b) => b[1] - a[1]),
    r.CITY, r.STATE_CODE, (r.FUEL_TYPES ?? "").split(",").filter(Boolean).join(", ")]);

  // Frequencies that are not an airport's own: center outlets (RCAG) under their ARTCC, flight service outlets (RCO)
  // under their FSS, and ASOS/AWOS and ATIS for NRST - NEAREST FREQUENCIES' weather list.
  // Center names come from the navaids' ARTCC columns ("ALBUQUERQUE"), FSS names from the FSS records.
  const names = new Map(frq.filter((r) => r.FACILITY_TYPE === "FSS").map((r) => [r.FACILITY, r.FAC_NAME]));
  for (const r of navRows) for (const [id, name] of [[r.LOW_ALT_ARTCC_ID, r.LOW_ARTCC_NAME], [r.HIGH_ALT_ARTCC_ID, r.HIGH_ARTCC_NAME]]) {
    if (id && name) names.set(id, `${name} CENTER`);
  }
  const stations: Nasr["stations"] = [];
  const seen = new Set<string>();
  for (const r of frq) {
    if (!r.FREQ || !vhf(r.FREQ) || !r.LAT_DECIMAL) continue;
    const at = [round(r.LAT_DECIMAL), round(r.LONG_DECIMAL)] as const;
    let s: Nasr["stations"][number] | null = null;
    if (r.FACILITY_TYPE === "RCAG" && r.ARTCC_OR_FSS_ID) {
      s = ["ARTCC", r.ARTCC_OR_FSS_ID, names.get(r.ARTCC_OR_FSS_ID) ?? r.ARTCC_OR_FSS_ID, ...at, r.FREQ];
    } else if (r.FACILITY_TYPE === "RCO" && r.ARTCC_OR_FSS_ID) s = ["FSS", r.ARTCC_OR_FSS_ID, names.get(r.ARTCC_OR_FSS_ID) ?? r.ARTCC_OR_FSS_ID, ...at, r.FREQ];
    else if (r.FACILITY_TYPE === "ASOS_AWOS") s = ["WX", icao.get(r.SERVICED_FACILITY) ?? r.SERVICED_FACILITY, r.SERVICED_SITE_TYPE, ...at, r.FREQ];
    else if (/(^| )D?-?ATIS( |$)/.test(r.FREQ_USE) && icao.has(r.SERVICED_FACILITY)) s = ["WX", icao.get(r.SERVICED_FACILITY)!, "ATIS", ...at, r.FREQ];
    const k = s && `${s[0]} ${s[1]} ${s[5]}`;
    if (s && !seen.has(k!)) {
      seen.add(k!);
      stations.push(s);
    }
  }

  return { cycle, navaids, fixes, airports, stations, airspace };
}
