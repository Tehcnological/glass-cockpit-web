// PAGE MENU: the MENU key's options for a page, as the v13 trainer lists them. Options this package cannot carry out
// are dim, as the softkeys are; the cursor skips them. DOM-free, so it can be tested on its own.
import { loadedApproach } from "./nav.js";
/** The next option the cursor can stop on in direction `d`, or `at` at either end. */
export function stepMenu(enabled, at, d) {
    for (let i = at + d; i >= 0 && i < enabled.length; i += d)
        if (enabled[i])
            return i;
    return at;
}
/** The first option the cursor can stop on, or 0. */
export const firstOption = (enabled) => Math.max(0, enabled.indexOf(true));
/** The flight plan page menu (PFD and MFD FPL), in the trainer's order. */
export const FPL_OPTIONS = [
    "Store Flight Plan", "Invert Flight Plan", "Delete Flight Plan", "Load Airway", "Expand Airways", "Remove Departure",
    "Remove Arrival", "Remove Approach", "Temperature Compensation", "Closest Point Of FPL", "Parallel Track",
    "Create New User Waypoint", "Select VNV Profile Window", "Cancel VNV", "VNV D→", "Create ATK Offset Waypoint",
    "Hold At Waypoint", "Hold At Present Position",
];
/** The flight plan menu for `route`; `patch` is the change an option makes, absent when it is dim here. */
export function fplMenu(route, activeLeg) {
    const a = loadedApproach(route);
    const enroute = a ? route.slice(0, a.start) : route;
    const patches = {};
    // Inverting drops the approach, as the G1000 does, and flies the first leg.
    if (enroute.length > 1)
        patches["Invert Flight Plan"] = { route: [...enroute].reverse(), activeLeg: 1, directFrom: null, vtf: false };
    if (route.length)
        patches["Delete Flight Plan"] = { route: [], activeLeg: 0, directFrom: null, vtf: false };
    if (a)
        patches["Remove Approach"] = { route: enroute, activeLeg: Math.min(activeLeg, Math.max(0, enroute.length - 1)), vtf: false };
    return FPL_OPTIONS.map((label) => ({ label, patch: patches[label] }));
}
