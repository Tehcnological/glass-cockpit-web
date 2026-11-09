import { type Airport, type Procedure } from "./nav.js";
import type { MapPoint } from "./map.js";
import type { Speller } from "./procedures.js";
export interface AprCtx {
    airport: Airport | undefined;
    procedures: Procedure[];
}
type Grp = "APT" | "APR" | "TRANS" | "MIN" | "MINALT" | "SEQ";
export interface AprRow {
    label: string;
    cur: boolean;
    dim?: boolean;
    role?: string;
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
    grp: Grp;
    apr: number;
    trans: number;
    seq: number;
    /** BARO minimums, feet; null is off. shortcut: kept on this page; the PFD's minimums are set at TMR/REF. */
    baro: number | null;
    constructor(entry: Speller);
    private proc;
    private transitions;
    /** The selected approach from the selected transition on, to preview on the map. */
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
        apt: string;
        aptCur: boolean;
        approaches: AprRow[];
        transitions: AprRow[];
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
