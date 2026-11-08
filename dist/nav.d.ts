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
/**
 * Vector-to-final with the approach's fixes from `route[start]`: the final approach fix is active, its leg on the final
 * course. With no fix before the FAF to draw that leg from (or no FAF), it goes direct from the aircraft at `here`.
 */
export declare function vtfPatch(start: number, legs: readonly (string | {
    role?: string;
})[], here: LatLon): {
    activeLeg: number;
    directFrom: LatLon | null;
    vtf: true;
};
type Route = (string | MapPoint)[];
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
export {};
