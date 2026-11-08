import type { LatLon, MapPoint } from "./map.js";
export interface Runway {
    id: string; /** Feet. */
    length: number; /** Feet. */
    width: number; /** e.g. "CONC", "ASPH" */
    surface: string; /** e.g. "MED", "HIGH" */
    lights?: string;
}
/** A frequency and what it is for, e.g. { use: "TOWER", freq: "118.700" }. */
export interface Freq {
    use: string;
    freq: string;
}
export interface Airport {
    id: string;
    name: string;
    city?: string;
    /** e.g. "AZ". */ region?: string;
    /** "PUBLIC", "PRIVATE", "MILITARY". */ use?: string;
    lat: number;
    lon: number;
    /** Feet. */ elev: number;
    /** Longest first. */ runways: Runway[];
    freqs: Freq[];
    /** Instrument approaches by name, e.g. "ILS OR LOC RWY 07R" (the PROC key loads them; see `Procedure`). */ approaches: string[];
    /** Fuel types, e.g. "100LL, A". */ fuel?: string;
}
/** A frequency to call that is not an airport's own: an ARTCC or FSS outlet, or an ASOS/AWOS. */
export interface Station {
    type: "ARTCC" | "FSS" | "WX";
    /** WX: the airport or station id; ARTCC/FSS: the facility, e.g. "ZAB". */ id: string;
    /** ARTCC/FSS: e.g. "ALBUQUERQUE CENTER"; WX: "ASOS", "AWOS-3". */ name: string;
    lat: number;
    lon: number;
    freq: string;
}
/** A leg of a procedure (ARINC 424 path terminators, simplified): fly to `fix`. */
export interface ProcLeg {
    fix: string;
    lat: number;
    lon: number;
    /** "IF", "TF", "CF", "DF", "RF" ... as published. */ type: string;
    /** Feet, with "+" at or above, "-" at or below, "" at; null none. */ alt: string | null;
    /** Fix role: initial, intermediate, final approach, missed approach point, missed approach. */ role?: "IAF" | "IF" | "FAF" | "MAP" | "MISSED";
}
/** An approach, with its transitions, as the PROC key lists and loads them. */
export interface Procedure {
    airport: string;
    name: string;
    /** Transition name ("VECTORS" for none) to its legs, which lead into `legs`. */ transitions: Record<string, ProcLeg[]>;
    /** Final approach legs through the missed approach point, then the missed approach (role "MISSED"). */ legs: ProcLeg[];
}
/** Initial great-circle bearing (true) and distance in nm. */
export declare function bearingDistance(lat1: number, lon1: number, lat2: number, lon2: number): {
    brg: number;
    dist: number;
};
/** Up to `n` of `list` within 200 nm (the NRST pages' limit), nearest first, with magnetic bearing and distance. */
export declare function nearest<T extends {
    lat: number;
    lon: number;
}>(list: T[], lat: number, lon: number, magVar: number, n?: number): {
    item: T;
    brg: number;
    dist: number;
}[];
export declare const latLon: (v: number, pos: string, neg: string) => string;
/** The best approach type an airport has, as the PFD's NRST window shows it. */
export declare function bestApproach(a: Airport): string;
/** The frequency the PFD's NRST window shows: approach, else tower, else unicom or CTAF (NearestAirportsPFD). */
export declare function nrstFreq(a: Airport): [string, string];
/** A flight plan entry as a point: an id of `points` or `airports`, or a point of its own. */
export declare function routePoint(r: string | MapPoint, points: MapPoint[], airports: Airport[]): MapPoint | undefined;
/** A flight plan's name: origin / destination, the first and last airports, so a loaded approach's fixes don't replace the destination. */
export declare function planName(legs: (MapPoint | undefined)[]): string;
/** Whether the GPS may fly an approach (by `approachName`'s names): RNAV (GPS) and GPS approaches. The rest ask NOT APPROVED FOR GPS. */
export declare function gpsApproved(name: string): boolean;
/** Vector-to-final makes the final approach fix active; an approach without one starts at its first leg. */
export declare function vtfLeg(legs: readonly (string | {
    role?: string;
})[]): number;
type Leg = string | {
    role?: string;
    approach?: string;
    lat?: number;
    lon?: number;
};
/**
 * Vector-to-final with the approach's fixes from `route[start]`: the final approach fix is active, its leg on the final
 * course, drawn from the approach's own fix before it (a waypoint entered between them is skipped by starting the leg at
 * that fix's position). With no approach fix before the FAF (or no FAF), it goes direct from the aircraft at `here`.
 */
export declare function vtfPatch(start: number, legs: readonly Leg[], here: LatLon): {
    activeLeg: number;
    directFrom: LatLon | null;
    vtf: true;
};
type Route = (string | MapPoint)[];
/** A route entry PROC loaded as part of an approach; a waypoint entered by hand is not one. */
export declare const isApproach: (r: string | MapPoint) => r is MapPoint;
/** The approach loaded in `route`: its fixes, which PROC marks with `approach`, from `start` on. */
export declare function loadedApproach(route: Route): {
    start: number;
    name: string;
    pts: Route;
} | null;
/** PROC's change to the flight plan: the approach `pts` after the en route waypoints (replacing one loaded before), loaded, activated or vectors-to-final. */
export declare function approachPatch(route0: Route, pts: MapPoint[], mode: "load" | "activate" | "vectors", here: LatLon): {
    route: (string | MapPoint)[];
    vtf: boolean;
    activeLeg?: undefined;
    directFrom?: undefined;
} | {
    route: (string | MapPoint)[];
    activeLeg: number;
    directFrom: LatLon;
    vtf: boolean;
} | {
    activeLeg: number;
    directFrom: LatLon | null;
    vtf: true;
    route: (string | MapPoint)[];
};
/** A fix entered by hand (WAYPOINT ENTRY, DIRECT TO) is an ordinary waypoint, even when picked from a loaded approach. */
export declare function asWaypoint(p: MapPoint): MapPoint;
type Plan = {
    points: MapPoint[];
    route: (string | MapPoint)[];
    airports: Airport[];
};
/** A waypoint by identifier: navigation points, then flight plan points (approach fixes), then airports. */
export declare const findPoint: (s: Plan, id: string) => MapPoint | undefined;
/** DIRECT TO's ACTIVATE: the leg to `p` from here, in the flight plan if it is there, else as a plan of its own. */
export declare function directToPatch(s: Plan & LatLon, p: MapPoint): {
    activeLeg: number;
    directFrom: {
        lat: number;
        lon: number;
    };
    vtf: boolean;
    route?: Route | undefined;
};
/**
 * The Direct-to window's Cancel Direct-To NAV (Pilot's Guide): the plan resumes on the leg closest to the aircraft; a
 * direct-to that replaced the plan leaves nothing to fly. Null (dim) with no direct-to, or on vector-to-final.
 */
export declare function cancelDirectTo(s: Plan & LatLon & {
    activeLeg: number;
    directFrom: LatLon | null;
    vtf?: boolean;
}): {
    route: never[];
    activeLeg: number;
    directFrom: null;
    vtf: boolean;
} | {
    activeLeg: number;
    directFrom: null;
    vtf: boolean;
    route?: undefined;
} | null;
/**
 * Vector-to-final after a waypoint is inserted or deleted at `at`, with the final approach fix active at `activeLeg`. Its
 * intercept may start at any approach fix before the FAF or at the aircraft (see `vtfPatch`), so an edit at or before the
 * FAF ends it and its intercept, and the active leg is drawn as an ordinary one; an edit after the FAF keeps it.
 */
export declare function vtfEdit(vtf: boolean, at: number, activeLeg: number): {
    vtf: boolean;
    directFrom?: null;
};
/**
 * Closest Point of FPL (Pilot's Guide): the point on the plan nearest the reference waypoint `ref`, as a user waypoint
 * named apart from the plan's and `points`, with the true bearing and distance to it from `ref`. Null with no leg.
 */
export declare function closestPointOfFpl(s: Plan, ref: MapPoint): {
    brg: number;
    dist: number;
    point: MapPoint;
} | null;
/**
 * Create ATK Offset Waypoint (Pilot's Guide): a waypoint `nm` (1 to 999, negative before) along the plan from the one at
 * `at`, to insert at the returned `at`. Null where the Pilot's Guide forbids it: past the leg's length (on the active
 * waypoint, the distance to go), with no leg that side, or at or after the final approach fix; and where one with
 * the same name is already in the plan.
 */
export declare function atkOffset(s: Plan & LatLon & {
    activeLeg: number;
}, at: number, nm: number): {
    at: number;
    point: MapPoint;
} | null;
export declare const isParallel: (r: string | MapPoint) => r is MapPoint;
/** The plan without Parallel Track: each offset point back to the entry it came from. */
export declare const cancelParallel: (route: Route) => Route;
/**
 * Parallel Track (Pilot's Guide): the plan with its en route points from the active leg's start on offset `nm` (1 to
 * 99) to side `L` or `R`, named with a lower case p, so both legs at a turn stay `nm` off. The approach is not offset.
 * Null where the Pilot's Guide makes it unavailable: on a direct-to, an approach leg, or a turn over 120 degrees.
 */
export declare function parallelTrack(s: Plan & {
    activeLeg: number;
    directFrom: LatLon | null;
}, side: "L" | "R", nm: number): Route | null;
export {};
