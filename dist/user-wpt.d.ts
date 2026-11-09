import { type Airport } from "./nav.js";
import type { LatLon, MapPoint } from "./map.js";
type Route = (string | MapPoint)[];
type Plan = {
    points: MapPoint[];
    airports: Pick<Airport, "id">[];
    route: Route;
};
export declare const userWaypoints: (points: MapPoint[]) => MapPoint[];
/** Up to 25 user waypoints within 200 nm of the aircraft, nearest first, with magnetic bearing and distance. */
export declare const nearestUsers: (s: {
    points: MapPoint[];
} & LatLon & {
    magVar: number;
}) => {
    item: MapPoint;
    brg: number;
    dist: number;
}[];
/** A name a new or renamed user waypoint may take: 1 to 6 letters and digits, not a point's or airport's (the pages
 * look waypoints up by identifier, so a repeat would hide one). */
export declare const nameFree: (s: Plan, id: string) => boolean;
/** A new user waypoint `id` at `at`, or null for a name it may not take. */
export declare function createUser(s: Plan, id: string, at: LatLon): {
    points: MapPoint[];
} | null;
/** Renames user waypoint `from`; the flight plan's entries for it (its holds and Parallel Track offsets too) follow. */
export declare function renameUser(s: Plan, from: string, to: string): {
    points: MapPoint[];
    route: (string | MapPoint)[];
} | null;
/** Moves user waypoint `id` to `at`; a hold at it moves with it (the plan is in the patch only then). */
export declare function moveUser(s: Plan, id: string, at: LatLon): {
    route?: (string | MapPoint)[] | undefined;
    points: MapPoint[];
} | null;
/** The small FMS knob on a latitude or longitude: `deg` degrees (a minute is 1/60), latitude held at the poles. */
export declare function stepPosition(p: LatLon, field: "lat" | "lon", deg: number): LatLon;
/** Deletes user waypoints `ids` from `points` and from the flight plan, as CLR on each of its entries would (a hold
 * at one goes with it, the active leg moves with the plan). Our choice: the Pilot's Guide is not clear on a waypoint
 * in the active flight plan, and keeping the entry would leave the plan naming a point that no longer exists. */
export declare function deleteUsers(s: Plan & {
    activeLeg: number;
    vtf: boolean;
}, ids: string[]): {
    route: Route;
    activeLeg: number;
    vtf: boolean;
    directFrom?: null;
    points: MapPoint[];
};
export {};
