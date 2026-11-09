import { type Airport, type Procedure, type ProcKind } from "./nav.js";
import { type AprRow } from "./apr-info.js";
import type { LatLon, MapPoint } from "./map.js";
export declare const PROC_MENU: string[];
/** What the flow reads and where it sends its changes. */
export interface ProcHost {
    s(): LatLon & {
        route: (string | MapPoint)[];
        activeLeg: number;
        points: MapPoint[];
        airports: Airport[];
        procedures: Procedure[];
        minimums?: number | null;
    };
    change(patch: object): void;
    close(): void;
}
/** Spells an identifier with the FMS knob: the inner turns the character, the outer moves along. */
export type Speller = {
    editing: boolean;
    readonly value: string;
    inner(d: number): void;
    outer(d: number): boolean;
    ent(): string | null;
    cancel(): void;
};
type Grp = "APT" | "APR" | "RWY" | "TRANS" | "MIN" | "MINALT" | "LOAD" | "ACTIVATE";
export declare class ProcFlow {
    private h;
    readonly entry: Speller;
    airport: string | null;
    view: "menu" | "select" | "ask";
    item: number;
    /** The procedures SELECT lists: approaches, arrivals (STAR) or departures (SID). */
    kind: ProcKind;
    yes: boolean;
    /** The activation NOT APPROVED FOR GPS asks about, and the view NO goes back to. */
    pending: {
        act: () => void;
        from: "menu" | "select";
    } | null;
    grp: Grp;
    /** The selected procedure, transition and runway. */
    apr: number;
    trans: number;
    rwy: number;
    /** BARO minimums, feet; null is off. Loading the approach sets the PFD's (Pilot's Guide). */
    baro: number | null;
    constructor(h: ProcHost, entry?: Speller);
    private planAirports;
    /** Opens on the PROCEDURES menu. SELECT APPROACH and SELECT ARRIVAL open on the destination (the last airport in the
     * flight plan), SELECT DEPARTURE on the departure airport (the first); either, else the nearest. */
    open(): void;
    /** LD APR (Nearest Airports): SELECT APPROACH on `name` at `airport`, at its transitions (LOAD? with only one).
     * False when there is no procedure data for it. */
    loadApproach(airport: string, name: string): boolean;
    procs(): Procedure[];
    transitions(): string[];
    /** A departure's or arrival's runway transitions. */
    runways(): string[];
    private points;
    private loaded;
    /** The ACTIVATE items need a loaded approach, ACTIVATE MISSED APPROACH one with missed approach legs. */
    enabled(i: number): boolean;
    private confirm;
    /** Whether the small knob would spell the airport (keyboard typing goes there). */
    typing(): boolean;
    private order;
    fms(outer: boolean, d: number): void;
    ent(): void;
    clr(): void;
    /** SELECT APPROACH, SELECT ARRIVAL or SELECT DEPARTURE: the menu's items, and the loading page's APR, STAR and DP
     * softkeys. A departure opens on the plan's departure airport, the others on its destination. */
    select(kind: ProcKind): void;
    private menuItem;
    private activate;
    private load;
    /** What the loading page draws (as WPT - APPROACH INFORMATION's boxes); `crsr` is the FMS cursor being on.
     * `points`: the procedure from the selected runway or transition on, to preview on the map. */
    loading(crsr: boolean): {
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
        load: boolean;
        activate: boolean;
        points: MapPoint[];
    };
}
export {};
