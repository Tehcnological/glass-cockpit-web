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
export {};
