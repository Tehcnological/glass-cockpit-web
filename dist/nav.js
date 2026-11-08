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
    return Math.max(0, legs.findIndex((l) => l.role === "FAF"));
}
/**
 * Vector-to-final with the approach's fixes from `route[start]`: the final approach fix is active, its leg on the final
 * course. With no fix before the FAF to draw that leg from (or no FAF), it goes direct from the aircraft at `here`.
 */
export function vtfPatch(start, legs, here) {
    const i = vtfLeg(legs);
    return { activeLeg: start + i, directFrom: i > 0 ? null : here, vtf: true };
}
/** PROC's change to the flight plan: the approach `pts` after the en route waypoints, loaded, activated or vectors-to-final. */
export function approachPatch(enroute, pts, mode, here) {
    const route = [...enroute, ...pts];
    if (mode === "load")
        return { route, vtf: false };
    if (mode === "activate")
        return { route, activeLeg: enroute.length, directFrom: here, vtf: false };
    return { route, ...vtfPatch(enroute.length, pts, here) };
}
