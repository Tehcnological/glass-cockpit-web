// Navigation data the pages show, and the arithmetic they share. The host supplies the data (instrumentready.com uses
// FAA NASR and CIFP); FlightGear reads its own navigation database instead.
import { mod } from "./page.js";
/** Initial great-circle bearing (true) and distance in nm. */
export function bearingDistance(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const dLon = (lon2 - lon1) * r;
    const [p1, p2] = [lat1 * r, lat2 * r];
    const brg = Math.atan2(Math.sin(dLon) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon)) / r;
    const dist = (Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon))) / r) * 60;
    return { brg: mod(brg, 360), dist };
}
/** Up to `n` of `list` within 200 nm (the NRST pages' limit), nearest first, with magnetic bearing and distance. */
export function nearest(list, lat, lon, magVar, n = 25) {
    return list
        .map((item) => {
        const { brg, dist } = bearingDistance(lat, lon, item.lat, item.lon);
        return { item, brg: mod(brg - magVar, 360), dist };
    })
        .filter((x) => x.dist <= 200)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, n);
}
// setTextElementLat / Lon: N33°25.92'
export const latLon = (v, pos, neg) => {
    const a = Math.abs(v);
    return `${v >= 0 ? pos : neg}${Math.floor(a)}°${((a % 1) * 60).toFixed(2)}'`;
};
/** The best approach type an airport has, as the PFD's NRST window shows it. */
export function bestApproach(a) {
    for (const [type, re] of [["ILS", /^ILS|LOC/], ["RNAV", /RNAV|GPS/], ["VOR", /VOR/], ["NDB", /NDB/]]) {
        if (a.approaches.some((n) => re.test(n)))
            return type;
    }
    return "VFR";
}
/** The frequency the PFD's NRST window shows: approach, else tower, else unicom or CTAF (NearestAirportsPFD). */
export function nrstFreq(a) {
    for (const type of ["APPROACH", "TOWER", "UNICOM", "CTAF"]) {
        const f = a.freqs.find((x) => x.use === type);
        if (f)
            return [type === "CTAF" ? "UNICOM" : type, f.freq];
    }
    return ["", ""];
}
/** A flight plan entry as a point: an id of `points` or `airports`, or a point of its own. */
export function routePoint(r, points, airports) {
    if (typeof r !== "string")
        return r;
    const p = points.find((x) => x.id === r);
    if (p)
        return p;
    const a = airports.find((x) => x.id === r);
    return a && { id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name };
}
/** A flight plan's name: origin / destination, the first and last airports, so a loaded approach's fixes don't replace the destination. */
export function planName(legs) {
    const apts = legs.filter((p) => p?.type === "APT");
    const ids = (apts.length > 1 ? apts : legs.filter(Boolean)).map((p) => p.id);
    return ids.length ? `${ids[0]} / ${ids[ids.length - 1]}` : "";
}
/** Whether the GPS may fly an approach (by `approachName`'s names): RNAV (GPS) and GPS approaches. The rest ask NOT APPROVED FOR GPS. */
export function gpsApproved(name) {
    return name.startsWith("RNAV (GPS)") || name.startsWith("GPS");
}
/** Vector-to-final makes the final approach fix active; an approach without one starts at its first leg. */
export function vtfLeg(legs) {
    return Math.max(0, legs.findIndex((l) => typeof l !== "string" && l.role === "FAF"));
}
const isFix = (l) => typeof l === "object" && l.approach !== undefined;
/**
 * Vector-to-final with the approach's fixes from `route[start]`: the final approach fix is active, its leg on the final
 * course, drawn from the approach's own fix before it (a waypoint entered between them is skipped by starting the leg at
 * that fix's position). With no approach fix before the FAF (or no FAF), it goes direct from the aircraft at `here`.
 */
export function vtfPatch(start, legs, here) {
    const i = vtfLeg(legs);
    if (isFix(legs[i - 1]))
        return { activeLeg: start + i, directFrom: null, vtf: true };
    const fix = legs.slice(0, Math.max(0, i)).reverse().find(isFix);
    const from = fix?.lat !== undefined && fix.lon !== undefined ? { lat: fix.lat, lon: fix.lon } : here;
    return { activeLeg: start + i, directFrom: from, vtf: true };
}
/** A route entry PROC loaded as part of an approach; a waypoint entered by hand is not one. */
export const isApproach = (r) => typeof r !== "string" && r.approach !== undefined;
/** The approach loaded in `route`: its fixes, which PROC marks with `approach`, from `start` on. */
// `pts` is the route from there on, with any waypoints inserted among the fixes, so its indexes are the route's from `start`.
export function loadedApproach(route) {
    const start = route.findIndex(isApproach);
    return start < 0 ? null : { start, name: route[start].approach, pts: route.slice(start) };
}
/** PROC's change to the flight plan: the approach `pts` after the en route waypoints (replacing one loaded before), loaded, activated or vectors-to-final. */
export function approachPatch(route0, pts, mode, here) {
    const enroute = route0.filter((r) => !isApproach(r));
    const route = [...enroute, ...pts];
    if (mode === "load")
        return { route, vtf: false };
    if (mode === "activate")
        return { route, activeLeg: enroute.length, directFrom: here, vtf: false };
    return { route, ...vtfPatch(enroute.length, pts, here) };
}
/** A fix entered by hand (WAYPOINT ENTRY, DIRECT TO) is an ordinary waypoint, even when picked from a loaded approach. */
export function asWaypoint(p) {
    const { approach: _a, role: _r, ...w } = p;
    return w;
}
/** A waypoint by identifier: navigation points, then flight plan points (approach fixes), then airports. */
export const findPoint = (s, id) => s.points.find((p) => p.id === id) ?? s.route.find((r) => typeof r === "object" && r.id === id) ?? routePoint(id, [], s.airports);
/** DIRECT TO's ACTIVATE: the leg to `p` from here, in the flight plan if it is there, else as a plan of its own. */
export function directToPatch(s, p) {
    const i = s.route.findIndex((r) => routePoint(r, s.points, s.airports)?.id === p.id);
    const directFrom = { lat: s.lat, lon: s.lon };
    if (i >= 0)
        return { activeLeg: i, directFrom, vtf: false };
    return { route: [s.points.includes(p) || p.type === "APT" ? p.id : asWaypoint(p)], activeLeg: 0, directFrom, vtf: false };
}
/**
 * Vector-to-final after a waypoint is inserted or deleted at `at`, with the final approach fix active at `activeLeg`. Its
 * intercept may start at any approach fix before the FAF or at the aircraft (see `vtfPatch`), so an edit at or before the
 * FAF ends it and its intercept, and the active leg is drawn as an ordinary one; an edit after the FAF keeps it.
 */
export function vtfEdit(vtf, at, activeLeg) {
    if (!vtf)
        return { vtf: false };
    return at > activeLeg ? { vtf: true } : { vtf: false, directFrom: null };
}
