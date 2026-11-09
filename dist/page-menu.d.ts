import { type Airport } from "./nav.js";
import type { LatLon, MapPoint } from "./map.js";
/** One option: no `act` (or `patch`) means dim. */
export interface MenuOption {
    label: string;
    act?: () => void;
}
/** The next option the cursor can stop on in direction `d`, or `at` at either end. */
export declare function stepMenu(enabled: readonly boolean[], at: number, d: number): number;
/** The first option the cursor can stop on, or 0. */
export declare const firstOption: (enabled: readonly boolean[]) => number;
/** The flight plan page menu (PFD and MFD FPL), in the trainer's order. */
export declare const FPL_OPTIONS: readonly ["Store Flight Plan", "Invert Flight Plan", "Delete Flight Plan", "Load Airway", "Expand Airways", "Remove Departure", "Remove Arrival", "Remove Approach", "Temperature Compensation", "Closest Point Of FPL", "Parallel Track", "Create New User Waypoint", "Select VNV Profile Window", "Cancel VNV", "VNV D→", "Create ATK Offset Waypoint", "Hold At Waypoint", "Hold At Present Position"];
type Route = (string | MapPoint)[];
type FplPatch = {
    route: Route;
    activeLeg: number;
    directFrom?: LatLon | null;
    vtf: boolean;
};
/** The flight plan menu for `route`; `patch` is the change an option makes, absent when it is dim here. */
export declare function fplMenu(route: Route, activeLeg: number): {
    label: string;
    patch?: FplPatch;
}[];
/** The flight plan's destination: its last airport, or undefined with none. */
export declare const destination: (route: Route, airports: Pick<Airport, "id">[]) => string | undefined;
/** WPT - AIRPORT INFORMATION's menu: `airport` shows an airport on the page, `approach` the approach view. */
export declare function airportInfoMenu(dest: string | undefined, go: {
    airport: (id: string) => void;
    approach: () => void;
}): MenuOption[];
/** NRST - NEAREST VOR's menu: it moves the cursor to the VOR list or the frequency, as the VOR and FREQ softkeys do. */
export declare const nearestVorMenu: (select: (w: "LIST" | "FREQ") => void) => MenuOption[];
/** AUX - TRIP PLANNING's menu: `mode` sets manual (true) or automatic inputs, as the MANUAL and AUTO softkeys do. */
export declare const tripMenu: (mode: (manual: boolean) => void) => MenuOption[];
/**
 * AUX - GPS STATUS's menu: Set WPT to Present Position makes a user waypoint at the aircraft (read when chosen) and
 * gives it to `add`. It is named as Hold At Present Position names its PPOS points (nav.ts's `userName`).
 */
export declare function gpsStatusMenu(s: () => LatLon & {
    route: Route;
    points: MapPoint[];
    airports: Airport[];
}, add: (p: MapPoint) => void): MenuOption[];
export {};
