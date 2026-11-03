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
