import { type Airport, type Procedure, type ProcKind } from "./nav.js";
import type { MapPoint } from "./map.js";
import type { Speller } from "./procedures.js";
export interface AprCtx {
    airport: Airport | undefined;
    procedures: Procedure[];
}
type Grp = "APT" | "APR" | "RWY" | "TRANS" | "MIN" | "MINALT" | "SEQ";
/** A list row: `cur` under the cursor, `sel` the one selected (a one-row box shows it). */
export interface AprRow {
    label: string;
    cur: boolean;
    dim?: boolean;
    role?: string;
    sel?: boolean;
}
export declare const ROLE: Record<string, string>;
export declare const MIN_ALT_MAX = 16000;
/** The minimum altitude field with minimums off. */
export declare const MIN_BLANK = "_____FT";
/** BARO on starts at the field elevation, rounded up to 100 ft; again turns it off. */
export declare const toggleBaro: (baro: number | null, elev: number) => number | null;
/** The minimum altitude steps 10 ft. */
export declare const stepBaro: (baro: number, d: number) => number;
/** The MINIMUMS box: OFF or BARO, and the altitude. */
export declare const minView: (baro: number | null, cur: boolean, altCur: boolean) => {
    mode: string;
    alt: string;
    cur: boolean;
    altCur: boolean;
};
export declare class AprInfo {
    readonly entry: Speller;
    /** Approaches (APR), departures (DP) or arrivals (STAR). */
    kind: ProcKind;
    grp: Grp;
    apr: number;
    trans: number;
    rwy: number;
    seq: number;
    /** BARO minimums, feet; null is off. shortcut: kept on this page; the PFD's minimums are set at TMR/REF. */
    baro: number | null;
    constructor(entry: Speller);
    private names;
    /** Whether the airport has any procedures of this kind (the DP and STAR softkeys are grey without). */
    has(c: AprCtx): boolean;
    private proc;
    private transitions;
    private runways;
    /** The selected procedure from the selected runway or transition on, to preview on the map. */
    preview(c: AprCtx): MapPoint[];
    private order;
    /** Whether the small knob would spell the airport (keyboard typing goes there). */
    typing(): boolean;
    fms(c: AprCtx, outer: boolean, d: number): void;
    /** ENT moves on to the next box; returns an airport identifier just spelled, for the page to show. */
    ent(c: AprCtx): string | null;
    clr(): void;
    /** What the page draws; `crsr` is the FMS cursor being on. */
    view(c: AprCtx, crsr: boolean): {
        kind: ProcKind;
        apt: string;
        aptCur: boolean;
        approaches: AprRow[];
        transitions: AprRow[];
        runways: AprRow[];
        min: {
            mode: string;
            alt: string;
            cur: boolean;
            altCur: boolean;
        };
        sequence: AprRow[];
    };
}
export {};
