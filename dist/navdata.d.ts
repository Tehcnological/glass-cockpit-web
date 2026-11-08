import type { Airport, ProcLeg, Procedure, Station } from "./nav.js";
import type { Airspace, Airway, MapPoint } from "./map.js";
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
    /** Points in order, by id and which list has them. Missing from records built before airways were. */
    airways?: [id: Airway["id"], type: Airway["type"], points: [id: string, type: "VOR" | "NDB" | "FIX"][]][];
}
export type CifpLeg = [fix: string, lat: number, lon: number, type: string, alt: string | null, role: ProcLeg["role"] | null];
export interface Cifp {
    cycle: string;
    procedures: [airport: string, name: string, transitions: Record<string, CifpLeg[]>, legs: CifpLeg[]][];
}
/**
 * Map points, airspace, airports, frequencies, approaches and airways near a position, in the shapes glass-cockpit-web
 * takes. An airway comes as the run of its segments within range, whole, and its points outside range join `points`.
 */
export declare function near(data: Nasr, cifp: Cifp, lat: number, lon: number, range: number): {
    points: MapPoint[];
    airspaces: Airspace[];
    airports: Airport[];
    stations: Station[];
    procedures: Procedure[];
    airways: Airway[];
};
/** "I07L" -> "ILS RWY 07L", "R08-Y" -> "RNAV (GPS) Y RWY 08", "VDM-A" -> "VOR/DME-A". */
export declare function approachName(id: string): string;
/**
 * Approaches from the FAA CIFP file (ARINC 424-18, 132 columns): approach records (section P, subsection F) with their
 * fixes' positions from the waypoint, runway and navaid records. Legs without a fix (heading and altitude legs) are
 * left out.
 */
export declare function parseCifp(text: string): Cifp["procedures"];
/**
 * The NASR CSV files buildNasr reads, by file name without .csv, as rows of column name to value. AWY_SEG_ALT (from the
 * AWY zip) is optional: without it there are no airways.
 */
export type NasrCsv = Record<"NAV_BASE" | "FIX_BASE" | "APT_BASE" | "APT_RWY" | "FRQ" | "ILS_BASE", Record<string, string>[]> & {
    AWY_SEG_ALT?: Record<string, string>[];
};
/**
 * NASR records from the 28-day subscription's CSV files: navaids (VOR, VOR/DME, VORTAC, NDB, NDB/DME) in service, fixes,
 * public-use airports with their frequencies, runways and details, ARTCC, FSS and weather frequencies, and V, T, J and Q
 * airways. Class B, C and D airspace comes from a shapefile, so the host builds it and passes it in.
 */
export declare function buildNasr(cycle: string, csv: NasrCsv, airspace: Nasr["airspace"]): Nasr;
