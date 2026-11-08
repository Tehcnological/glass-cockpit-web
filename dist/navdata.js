/** Distance in nm, flat-earth: fine for picking what is on a map a few hundred nm across. */
function nm(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
    return Math.hypot(x, lat2 - lat1) * 60;
}
/** Map points, airspace, airports, frequencies and approaches near a position, in the shapes glass-cockpit-web takes. */
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
    const points = [
        ...airports.map((a) => ({ id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name })),
        // The NRST pages list VORs and NDBs out to 200 nm.
        ...data.navaids.filter((n) => within(Math.max(range, 200))(n[2], n[3])).map(([id, type, la, lo, freq, name, kind, city, state, magVar, cls]) => ({
            id, type, lat: la, lon: lo, name, kind, city, region: state, magVar, cls, freq: type === "VOR" ? freq.toFixed(2) : String(freq),
        })),
        ...data.fixes.filter((f) => inRange(f[1], f[2])).map(([id, la, lo, state]) => ({ id, type: "FIX", lat: la, lon: lo, region: state })),
    ];
    const airspaces = data.airspace
        .filter(([, , , , rings]) => rings.some((r) => r.some(([la, lo]) => inRange(la, lo))))
        .map(([cls, , , , rings]) => ({ cls, rings }));
    // The NRST pages look up to 200 nm for centers and flight service.
    const stations = data.stations.filter((s) => within(Math.max(range, 200))(s[3], s[4]))
        .map(([type, id, name, la, lo, freq]) => ({ type, id, name, lat: la, lon: lo, freq }));
    return { points, airspaces, airports, stations, procedures };
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
