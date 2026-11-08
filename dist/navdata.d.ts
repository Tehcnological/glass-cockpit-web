import type { Airport, ProcLeg, Procedure, Station } from "./nav.js";
import type { Airspace, MapPoint } from "./map.js";
export type NasrRunway = [id: string, /** feet */ length: number, /** feet */ width: number, surface: string, lights: string];
export interface Nasr {
    cycle: string;
    navaids: [
        id: string,
        type: "VOR" | "NDB",
        lat: number,
        lon: number,
        freq: number,
        name: string,
        kind: string,
        city: string,
        state: string, /** degrees, east positive */
        magVar: number,
        cls: string
    ][];
    fixes: [id: string, lat: number, lon: number, state: string][];
    airports: [
        id: string,
        icao: string,
        name: string,
        lat: number,
        lon: number,
        freqs: [use: string, freq: string][],
        /** feet */ elev: number, /** longest first */
        runways: NasrRunway[],
        city: string,
        state: string,
        fuel: string
    ][];
    stations: [type: Station["type"], id: string, name: string, lat: number, lon: number, freq: string][];
    airspace: [cls: "B" | "C" | "D", name: string, floor: number | "SFC", ceiling: number, rings: [lat: number, lon: number][][]][];
}
export type CifpLeg = [fix: string, lat: number, lon: number, type: string, alt: string | null, role: ProcLeg["role"] | null];
export interface Cifp {
    cycle: string;
    procedures: [airport: string, name: string, transitions: Record<string, CifpLeg[]>, legs: CifpLeg[]][];
}
/** Map points, airspace, airports, frequencies and approaches near a position, in the shapes glass-cockpit-web takes. */
export declare function near(data: Nasr, cifp: Cifp, lat: number, lon: number, range: number): {
    points: MapPoint[];
    airspaces: Airspace[];
    airports: Airport[];
    stations: Station[];
    procedures: Procedure[];
};
/** "I07L" -> "ILS RWY 07L", "R08-Y" -> "RNAV (GPS) Y RWY 08", "VDM-A" -> "VOR/DME-A". */
export declare function approachName(id: string): string;
/**
 * Approaches from the FAA CIFP file (ARINC 424-18, 132 columns): approach records (section P, subsection F) with their
 * fixes' positions from the waypoint, runway and navaid records. Legs without a fix (heading and altitude legs) are
 * left out.
 */
export declare function parseCifp(text: string): Cifp["procedures"];
