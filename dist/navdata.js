/** Distance in nm, flat-earth: fine for picking what is on a map a few hundred nm across. */
function nm(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
    return Math.hypot(x, lat2 - lat1) * 60;
}
/** Distance in nm from a position to the segment a-b, flat-earth as `nm`. */
function toSegment(lat, lon, a, b) {
    const k = Math.cos(lat * (Math.PI / 180));
    const [ax, ay, dx, dy] = [(a.lon - lon) * k, a.lat - lat, (b.lon - a.lon) * k, b.lat - a.lat];
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + t * dx, ay + t * dy) * 60;
}
/**
 * Map points, airspace, airports, frequencies, approaches and airways near a position, in the shapes glass-cockpit-web
 * takes. An airway comes as the run of its segments within range, whole, and its points outside range join `points`.
 */
export function near(data, cifp, lat, lon, range) {
    const within = (r) => (la, lo) => nm(lat, lon, la, lo) <= r;
    const inRange = within(range);
    const apts = data.airports.filter((a) => inRange(a[3], a[4]));
    const procedures = [];
    const ids = new Set(apts.map((a) => a[1] || a[0]));
    const leg = ([fix, la, lo, type, alt, role]) => ({ fix, lat: la, lon: lo, type, alt, ...(role && { role }) });
    for (const [airport, name, trans, legs] of cifp.procedures) {
        if (!ids.has(airport))
            continue;
        procedures.push({ airport, name, legs: legs.map(leg), transitions: Object.fromEntries(Object.entries(trans).map(([t, l]) => [t, l.map(leg)])) });
    }
    const airports = apts.map(([id, icao, name, la, lo, freqs, elev, runways, city, state, fuel]) => ({
        id: icao || id, name, city, region: state, use: "PUBLIC", lat: la, lon: lo, elev, fuel,
        runways: runways.map(([rid, length, width, surface, lights]) => ({ id: rid, length, width, surface, lights })),
        freqs: freqs.map(([use, freq]) => ({ use, freq })),
        approaches: procedures.filter((p) => p.airport === (icao || id)).map((p) => p.name),
    }));
    const navPoint = ([id, type, la, lo, freq, name, kind, city, state, magVar, cls]) => ({
        id, type, lat: la, lon: lo, name, kind, city, region: state, magVar, cls, freq: type === "VOR" ? freq.toFixed(2) : String(freq),
    });
    const fixPoint = ([id, la, lo, state]) => ({ id, type: "FIX", lat: la, lon: lo, region: state });
    const points = [
        ...airports.map((a) => ({ id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name })),
        // The NRST pages list VORs and NDBs out to 200 nm.
        ...data.navaids.filter((n) => within(Math.max(range, 200))(n[2], n[3])).map(navPoint),
        ...data.fixes.filter((f) => inRange(f[1], f[2])).map(fixPoint),
    ];
    const airways = [];
    if (data.airways?.length) {
        // shortcut: an id names one point, the VOR where a VOR and an NDB share it (MAZ, ZFP, a mile apart); no two-letter
        // NDB id shared by distant NDBs is on a V, T, J or Q route in cycle 2026-10-29. Resolve by state if one ever is.
        const at = new Map(data.fixes.map((f) => [f[0], fixPoint(f)]));
        for (const n of data.navaids)
            if (n[1] === "VOR" || !at.has(n[0]))
                at.set(n[0], navPoint(n));
        for (const [id, type, ids] of data.airways) {
            let run = [];
            for (let i = 1; i <= ids.length; i++) { // the pass past the end closes the last run
                const [p, q] = [at.get(ids[i - 1]), at.get(ids[i])];
                if (p && q && toSegment(lat, lon, p, q) <= range) {
                    if (!run.length)
                        run.push(p.id);
                    run.push(q.id);
                }
                else if (run.length) {
                    airways.push({ id, type, points: run });
                    run = [];
                }
            }
        }
        const have = new Set(points.map((p) => p.id));
        for (const id of airways.flatMap((a) => a.points)) {
            if (!have.has(id))
                points.push(at.get(id));
            have.add(id);
        }
    }
    const airspaces = data.airspace
        .filter(([, , , , rings]) => rings.some((r) => r.some(([la, lo]) => inRange(la, lo))))
        .map(([cls, , , , rings]) => ({ cls, rings }));
    // The NRST pages look up to 200 nm for centers and flight service.
    const stations = data.stations.filter((s) => within(Math.max(range, 200))(s[3], s[4]))
        .map(([type, id, name, la, lo, freq]) => ({ type, id, name, lat: la, lon: lo, freq }));
    return { points, airspaces, airports, stations, procedures, airways };
}
// ARINC 424 approach types (route type of the final approach) as the charts name them.
const TYPES = {
    I: "ILS", L: "LOC", B: "LOC BC", R: "RNAV (GPS)", H: "RNAV (RNP)", P: "GPS", V: "VOR", S: "VOR/DME", D: "VOR/DME", N: "NDB",
    Q: "NDB/DME", X: "LDA", U: "SDF", T: "TACAN",
};
const CIRCLING = {
    RNV: "RNAV (GPS)", VDM: "VOR/DME", VOR: "VOR", NDB: "NDB", GPS: "GPS", LOC: "LOC", LDA: "LDA", LBC: "LOC BC", TCN: "TACAN", SDF: "SDF", ILS: "ILS",
};
/** "I07L" -> "ILS RWY 07L", "R08-Y" -> "RNAV (GPS) Y RWY 08", "VDM-A" -> "VOR/DME-A". */
export function approachName(id) {
    const c = id.match(/^([A-Z]{3})-([A-Z])$/);
    if (c)
        return `${CIRCLING[c[1]] ?? c[1]}-${c[2]}`;
    const r = id.match(/^([A-Z])(\d\d[LRC]?)-?([A-Z]?)$/);
    return r ? `${TYPES[r[1]] ?? r[1]}${r[3] ? ` ${r[3]}` : ""} RWY ${r[2]}` : id;
}
// N33263204 / W112193234: degrees, minutes, seconds in hundredths.
function coord(s) {
    if (!/^[NSEW]\d{8,9}$/.test(s))
        return null;
    const n = s.length - 6; // after the degrees: minutes, then seconds in hundredths
    const v = Number(s.slice(1, n)) + Number(s.slice(n, n + 2)) / 60 + Number(s.slice(n + 2)) / 360000;
    return Math.round((s[0] === "S" || s[0] === "W" ? -v : v) * 1e5) / 1e5;
}
/** Fix positions from the CIFP's waypoint, runway and navaid records. Keys come from cifpFixKey. */
function cifpPositions(lines) {
    const at = new Map();
    for (const l of lines) {
        if (l[0] !== "S")
            continue;
        const sec = l[4] === "P" ? `P${l[12]}` : l.slice(4, 6);
        let key = null;
        if (sec === "PC" || sec === "PG" || sec === "PN")
            key = `${sec}|${l.slice(6, 10).trim()}|${l.slice(13, 18).trim()}`;
        else if (sec === "EA" || sec === "D " || sec === "DB")
            key = `${sec}|${l.slice(13, 18).trim()}|${l.slice(19, 21)}`;
        if (!key || at.has(key))
            continue;
        const la = coord(l.slice(32, 41));
        const lo = coord(l.slice(41, 51));
        if (la !== null && lo !== null)
            at.set(key, [la, lo]);
    }
    return at;
}
/** The key cifpPositions files an approach leg's fix under. */
function cifpFixKey(l, airport, fix) {
    const sec = l.slice(36, 38);
    return sec[0] === "P" ? `${sec}|${airport}|${fix}` : `${sec}|${fix}|${l.slice(34, 36)}`;
}
/** An approach leg's altitude constraint, as the chart gives it. */
function cifpAlt(l) {
    const [desc, alt1, alt2] = [l[82], l.slice(84, 89).trim(), l.slice(89, 94).trim()];
    return !/^\d+$/.test(alt1) ? null : desc === "B" && /^\d+$/.test(alt2) ? `${Number(alt2)}+` : `${Number(alt1)}${desc === "+" || desc === "-" ? desc : ""}`;
}
/** Waypoint description code, 4th character: the fix's role on the way in. */
const cifpRole = (l) => ("ACD".includes(l[42]) ? "IAF" : "BI".includes(l[42]) ? "IF" : l[42] === "F" ? "FAF" : l[42] === "M" ? "MAP" : null);
/**
 * Approaches from the FAA CIFP file (ARINC 424-18, 132 columns): approach records (section P, subsection F) with their
 * fixes' positions from the waypoint, runway and navaid records. Legs without a fix (heading and altitude legs) are
 * left out.
 */
export function parseCifp(text) {
    const lines = text.split(/\r?\n/);
    const at = cifpPositions(lines);
    const procs = new Map();
    for (const l of lines) {
        if (l[0] !== "S" || l[4] !== "P" || l[12] !== "F" || !"01".includes(l[38]))
            continue;
        const airport = l.slice(6, 10).trim();
        const id = l.slice(13, 19).trim();
        const fix = l.slice(29, 34).trim();
        if (!fix)
            continue;
        const pos = at.get(cifpFixKey(l, airport, fix));
        if (!pos)
            continue;
        const k = `${airport} ${id}`;
        let p = procs.get(k);
        if (!p)
            procs.set(k, (p = Object.assign([airport, approachName(id), {}, []], { missed: false })));
        const role = p.missed ? "MISSED" : cifpRole(l);
        const leg = [fix, pos[0], pos[1], l.slice(47, 49), cifpAlt(l), role];
        if (l[19] === "A")
            (p[2][l.slice(20, 25).trim() || "VECTORS"] ??= []).push(leg);
        else
            p[3].push(leg);
        if (role === "MAP")
            p.missed = true;
    }
    return [...procs.values()]
        .map(([a, n, t, legs]) => [a, n, { VECTORS: [], ...t }, legs])
        .filter((p) => p[3].length)
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}
/**
 * NASR records from the 28-day subscription's CSV files: navaids (VOR, VOR/DME, VORTAC, NDB, NDB/DME) in service, fixes,
 * public-use airports with their frequencies, runways and details, ARTCC, FSS and weather frequencies, and V, T, J and Q
 * airways. Class B, C and D airspace comes from a shapefile, so the host builds it and passes it in.
 */
export function buildNasr(cycle, csv, airspace) {
    const round = (v) => Math.round(Number(v) * 1e5) / 1e5;
    const vhf = (f) => Number(f) >= 118 && Number(f) < 137;
    const magVar = (v, hemis) => (Number(v) || 0) * (hemis === "W" ? -1 : 1);
    // Navaids: VORs and NDBs, in service. Service volume as the G1000 names it.
    const NAV_TYPES = { VOR: "VOR", "VOR/DME": "VOR", VORTAC: "VOR", NDB: "NDB", "NDB/DME": "NDB" };
    const CLASS = { H: "HIGH ALT", L: "LOW ALT", T: "TERMINAL" };
    const navRows = csv.NAV_BASE;
    const navaids = navRows
        .filter((r) => NAV_TYPES[r.NAV_TYPE] && r.NAV_STATUS.startsWith("OPERATIONAL"))
        .map((r) => [r.NAV_ID, NAV_TYPES[r.NAV_TYPE], round(r.LAT_DECIMAL), round(r.LONG_DECIMAL), Number(r.FREQ), r.NAME, r.NAV_TYPE,
        r.CITY, r.STATE_CODE, magVar(r.MAG_VARN, r.MAG_VARN_HEMIS), CLASS[r.ALT_CODE?.[1]] ?? ""]);
    const fixes = csv.FIX_BASE.map((r) => [r.FIX_ID, round(r.LAT_DECIMAL), round(r.LONG_DECIMAL), r.STATE_CODE]);
    // Airport frequencies under the G1000's labels; NASR's other uses (STAR and DP names, CLASS B, ...) are left out.
    const USES = [[/^D?-?ATIS$/, "ATIS"], [/^LCL\//, "TOWER"], [/^GND\//, "GROUND"], [/^CD(\/|$)/, "CLEARANCE"],
        [/^APCH\//, "APPROACH"], [/^DEP\//, "DEPARTURE"], [/^CTAF$/, "CTAF"], [/^UNICOM$/, "UNICOM"]];
    const apt = csv.APT_BASE.filter((r) => r.SITE_TYPE_CODE === "A" && r.FACILITY_USE_CODE === "PU" && r.ARPT_STATUS === "O");
    const icao = new Map(apt.map((r) => [r.ARPT_ID, r.ICAO_ID || r.ARPT_ID]));
    const freqs = new Map();
    const add = (id, use, f) => {
        const list = freqs.get(id) ?? [];
        const freq = Number(f).toFixed(3);
        if (!list.some(([u, x]) => u === use && x === freq))
            list.push([use, freq]);
        freqs.set(id, list);
    };
    const frq = csv.FRQ;
    for (const r of frq) {
        if (!r.FREQ || !vhf(r.FREQ))
            continue;
        if (r.FACILITY_TYPE === "ASOS_AWOS")
            add(r.SERVICED_FACILITY, r.SERVICED_SITE_TYPE.split("-")[0], r.FREQ);
        for (const use of r.FREQ_USE.split(" ")) {
            const label = USES.find(([re]) => re.test(use))?.[1];
            if (label)
                add(r.SERVICED_FACILITY, label, r.FREQ);
        }
    }
    for (const r of csv.ILS_BASE) {
        if (r.LOC_FREQ)
            add(r.ARPT_ID, `${["LS", "LD", "LG"].includes(r.SYSTEM_TYPE_CODE) ? "ILS" : "LOC"} ${r.RWY_END_ID}`, r.LOC_FREQ);
    }
    const runways = new Map();
    for (const r of csv.APT_RWY) {
        const list = runways.get(r.ARPT_ID) ?? [];
        list.push([r.RWY_ID.replace("/", "-"), Number(r.RWY_LEN) || 0, Number(r.RWY_WIDTH) || 0, r.SURFACE_TYPE_CODE, r.RWY_LGT_CODE]);
        runways.set(r.ARPT_ID, list);
    }
    const airports = apt.map((r) => [r.ARPT_ID, r.ICAO_ID, r.ARPT_NAME, round(r.LAT_DECIMAL), round(r.LONG_DECIMAL),
        freqs.get(r.ARPT_ID) ?? [], Math.round(Number(r.ELEV)), (runways.get(r.ARPT_ID) ?? []).sort((a, b) => b[1] - a[1]),
        r.CITY, r.STATE_CODE, (r.FUEL_TYPES ?? "").split(",").filter(Boolean).join(", ")]);
    // Frequencies that are not an airport's own: center outlets (RCAG) under their ARTCC, flight service outlets (RCO)
    // under their FSS, and ASOS/AWOS and ATIS for NRST - NEAREST FREQUENCIES' weather list.
    // Center names come from the navaids' ARTCC columns ("ALBUQUERQUE"), FSS names from the FSS records.
    const names = new Map(frq.filter((r) => r.FACILITY_TYPE === "FSS").map((r) => [r.FACILITY, r.FAC_NAME]));
    for (const r of navRows)
        for (const [id, name] of [[r.LOW_ALT_ARTCC_ID, r.LOW_ARTCC_NAME], [r.HIGH_ALT_ARTCC_ID, r.HIGH_ARTCC_NAME]]) {
            if (id && name)
                names.set(id, `${name} CENTER`);
        }
    const stations = [];
    const seen = new Set();
    for (const r of frq) {
        if (!r.FREQ || !vhf(r.FREQ) || !r.LAT_DECIMAL)
            continue;
        const at = [round(r.LAT_DECIMAL), round(r.LONG_DECIMAL)];
        let s = null;
        if (r.FACILITY_TYPE === "RCAG" && r.ARTCC_OR_FSS_ID) {
            s = ["ARTCC", r.ARTCC_OR_FSS_ID, names.get(r.ARTCC_OR_FSS_ID) ?? r.ARTCC_OR_FSS_ID, ...at, r.FREQ];
        }
        else if (r.FACILITY_TYPE === "RCO" && r.ARTCC_OR_FSS_ID)
            s = ["FSS", r.ARTCC_OR_FSS_ID, names.get(r.ARTCC_OR_FSS_ID) ?? r.ARTCC_OR_FSS_ID, ...at, r.FREQ];
        else if (r.FACILITY_TYPE === "ASOS_AWOS")
            s = ["WX", icao.get(r.SERVICED_FACILITY) ?? r.SERVICED_FACILITY, r.SERVICED_SITE_TYPE, ...at, r.FREQ];
        else if (/(^| )D?-?ATIS( |$)/.test(r.FREQ_USE) && icao.has(r.SERVICED_FACILITY))
            s = ["WX", icao.get(r.SERVICED_FACILITY), "ATIS", ...at, r.FREQ];
        const k = s && `${s[0]} ${s[1]} ${s[5]}`;
        if (s && !seen.has(k)) {
            seen.add(k);
            stations.push(s);
        }
    }
    // Airways: Victor and T routes low, jet and Q routes high (AIM 5-3-4); colored, oceanic and helicopter (TK) routes are
    // left out. Rows come ordered by AWY_ID, AWY_LOCATION, POINT_SEQ (FAA AWY layout). An airway breaks where NASR marks a
    // gap and where it names a point with no navaid or fix record here (border points, DME and TACAN points).
    const navKeys = new Set(navaids.map((n) => `${n[0]} ${n[1]}`));
    const fixIds = new Set(fixes.map((f) => f[0]));
    const FIX_TYPES = new Set(["CN", "MR", "MW", "NRS", "RADAR", "RP", "VFR", "WP"]); // FROM_PT_TYPE's fix types; the rest are navaids
    const airways = [];
    let run = [];
    let [id, loc] = ["", ""]; // the airway `run` is on; Alaska and the contiguous U.S. reuse ids
    const close = () => {
        if (run.length > 1)
            airways.push([id, "VT".includes(id[0]) ? "LO" : "HI", run]);
        run = [];
    };
    for (const r of csv.AWY_SEG_ALT ?? []) {
        if (!/^[VTJQ]\d+$/.test(r.AWY_ID))
            continue;
        if (r.AWY_ID !== id || r.AWY_LOCATION !== loc) {
            close();
            [id, loc] = [r.AWY_ID, r.AWY_LOCATION];
        }
        const t = r.FROM_PT_TYPE.trim();
        if (FIX_TYPES.has(t) ? fixIds.has(r.FROM_POINT) : navKeys.has(`${r.FROM_POINT} ${NAV_TYPES[t]}`))
            run.push(r.FROM_POINT);
        else
            close();
        if (r.AWY_SEG_GAP_FLAG === "Y")
            close();
    }
    close();
    return { cycle, navaids, fixes, airports, stations, airspace, airways };
}
