import type { Airport } from "./nav.js";
import type { IdEntry } from "./ui.js";
import type { LatLon, MapPoint } from "./map.js";
export declare const FPL_TOOLS: readonly ["Closest Point Of FPL", "Parallel Track", "Create ATK Offset Waypoint"];
export type FplToolName = (typeof FPL_TOOLS)[number];
type Route = (string | MapPoint)[];
export type ToolState = LatLon & {
    points: MapPoint[];
    airports: Airport[];
    route: Route;
    activeLeg: number;
    directFrom: LatLon | null;
    vtf: boolean;
    magVar: number;
};
export interface ToolRow {
    label: string;
    value?: string;
    cur?: boolean;
    dim?: boolean;
    title?: boolean;
}
/** What ENT does: the change to make, if any, and whether the window closes. */
export type ToolEnt = {
    patch?: {
        route?: Route;
        activeLeg?: number;
        vtf?: boolean;
        directFrom?: null;
        points?: MapPoint[];
    };
    close: boolean;
};
/** Whether the flight plan menu offers `name`; ATK needs the waypoint `sel` under the cursor. */
export declare function toolEnabled(name: FplToolName, s: ToolState, sel: number | null): boolean;
export declare class FplTool {
    private entry;
    name: FplToolName;
    /** The field the cursor is on. */ row: number;
    private side;
    private nm;
    private offset;
    private sel;
    private ref;
    private found;
    constructor(entry: IdEntry);
    /** Opens `name`'s window; `sel` is the flight plan waypoint under the cursor (ATK). */
    open(name: FplToolName, s: ToolState, sel?: number): void;
    rows(s: ToolState): ToolRow[];
    /** The FMS knob: the small one picks a value (spells, on Closest Point), the large one moves (ATK: by 10 nm). */
    /** Whether the small knob would spell (Closest Point's waypoint; keyboard typing goes there). */
    typing(): boolean;
    fms(_s: ToolState, outer: boolean, d: number): void;
    /** CLR: cancels an identifier being spelled; otherwise true, the window closes. */
    clr(): boolean;
    ent(s: ToolState): ToolEnt;
}
export {};
