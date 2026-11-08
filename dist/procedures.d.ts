import { type Airport, type Procedure } from "./nav.js";
import type { LatLon, MapPoint } from "./map.js";
export declare const PROC_MENU: string[];
/** What the flow reads and where it sends its changes. */
export interface ProcHost {
    s(): LatLon & {
        route: (string | MapPoint)[];
        points: MapPoint[];
        airports: Airport[];
        procedures: Procedure[];
    };
    change(patch: object): void;
    close(): void;
}
/** Spells an identifier with the FMS knob: the inner turns the character, the outer moves along. */
export type Speller = {
    editing: boolean;
    inner(d: number): void;
    outer(d: number): boolean;
    ent(): string | null;
    cancel(): void;
};
export declare class ProcFlow {
    private h;
    readonly entry: Speller;
    airport: string | null;
    view: "menu" | "select" | "ask";
    item: number;
    yes: boolean;
    /** The activation NOT APPROVED FOR GPS asks about, and the view NO goes back to. */
    pending: {
        act: () => void;
        from: "menu" | "select";
    } | null;
    grp: "APT" | "APR" | "TRANS" | "LOAD" | "ACTIVATE";
    apr: number;
    trans: number;
    constructor(h: ProcHost, entry?: Speller);
    /** Opens on the PROCEDURES menu. SELECT APPROACH opens on the destination: the last airport in the flight plan, else the nearest. */
    open(): void;
    procs(): Procedure[];
    transitions(): string[];
    private loaded;
    /** The ACTIVATE items need a loaded approach, ACTIVATE MISSED APPROACH one with missed approach legs; SELECT ARRIVAL
     * and SELECT DEPARTURE are not ported. */
    enabled(i: number): boolean;
    private confirm;
    fms(outer: boolean, d: number): void;
    ent(): void;
    clr(): void;
    private menuItem;
    private activate;
    private load;
}
