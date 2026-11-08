// AUX - TRIP PLANNING's sums, from the Pilot's Guide (FG1000 has no trip planning page). DOM-free, so they can be tested.
import { mod } from "./page.js";
import { bearingDistance, routePoint } from "./nav.js";
/** Knots, gallons an hour, gallons and the trip's hours (null when there is no trip). */
export function fuelStats(gs, ff, fuel, hours) {
    const endurance = ff > 0 ? fuel / ff : null;
    const trip = hours !== null && ff > 0;
    return {
        efficiency: ff > 0 && gs > 0 ? gs / ff : null,
        endurance,
        remFuel: trip ? fuel - ff * hours : null,
        remEndurance: endurance !== null && hours !== null ? endurance - hours : null,
        fuelReq: trip ? ff * hours : null,
        range: endurance !== null && gs > 0 ? endurance * gs : null,
    };
}
const pressureAlt = (indAlt, baro) => indAlt + (29.92 - baro) * 1000;
/** Feet, from the indicated altitude, the altimeter setting (inHg) and the air temperature (°C). */
export function densityAltitude(indAlt, baro, tempC) {
    const pa = pressureAlt(indAlt, baro);
    return pa + 118.8 * (tempC - (15 - (2 * pa) / 1000));
}
/** Knots, from calibrated airspeed and the air's pressure and temperature; compressibility left out. */
export function trueAirspeed(cas, indAlt, baro, tempC) {
    const delta = Math.pow(1 - 6.8756e-6 * pressureAlt(indAlt, baro), 5.2559);
    const theta = (tempC + 273.15) / 288.15;
    return cas / Math.sqrt(delta / theta);
}
/** Sunrise and sunset (ms, UTC) on the local day at `ms`, by the sunrise equation; null both when the sun stays up or down. */
export function sunTimes(lat, lon, ms) {
    const r = Math.PI / 180;
    const n = Math.floor(ms / 86_400_000 + lon / 360) - 10_957; // days since 1 January 2000
    const j = n - lon / 360;
    const m = mod(357.5291 + 0.98560028 * j, 360);
    const c = 1.9148 * Math.sin(m * r) + 0.02 * Math.sin(2 * m * r) + 0.0003 * Math.sin(3 * m * r);
    const l = mod(m + c + 282.9372, 360);
    const transit = 2451545 + j + 0.0053 * Math.sin(m * r) - 0.0069 * Math.sin(2 * l * r);
    const sinD = Math.sin(l * r) * Math.sin(23.4397 * r);
    const cosD = Math.cos(Math.asin(sinD));
    const cosW = (Math.sin(-0.833 * r) - Math.sin(lat * r) * sinD) / (Math.cos(lat * r) * cosD);
    if (Math.abs(cosW) > 1)
        return { rise: null, set: null };
    const w = Math.acos(cosW) / r / 360;
    const toMs = (jd) => (jd - 2440587.5) * 86_400_000;
    return { rise: toMs(transit - w), set: toMs(transit + w) };
}
/** Leg `leg` of the flight plan (the leg into `route[leg]`), or REM, the rest of it, both from the aircraft on the active
 * leg. DTK is magnetic, and none for REM. */
export function tripLeg(s, leg) {
    const at = (i) => routePoint(s.route[i] ?? "", s.points, s.airports);
    const one = (i) => {
        const [from, to] = [i === s.activeLeg ? s : at(i - 1), at(i)];
        return from && to ? bearingDistance(from.lat, from.lon, to.lat, to.lon) : null;
    };
    if (leg !== "REM") {
        const bd = one(leg);
        return bd ? { dis: bd.dist, dtk: mod(bd.brg - s.magVar, 360) } : { dis: null, dtk: null };
    }
    let dis = null;
    for (let i = s.activeLeg; i < s.route.length; i++) {
        const bd = one(i);
        if (bd)
            dis = (dis ?? 0) + bd.dist;
    }
    return { dis, dtk: null };
}
