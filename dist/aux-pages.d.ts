import { type Airport } from "./nav.js";
import type { MfdState } from "./glass-mfd.js";
export declare const TIME_FORMATS: readonly ["LOCAL 12hr", "LOCAL 24hr", "UTC"];
export declare const SURFACES: readonly ["ANY", "HARD ONLY", "HARD/SOFT", "WATER"];
/** The MFD data bar fields this package can work out (the Pilot's Guide lists more: ESA, MSA, TAS, VSR, XTK, FOD). */
export declare const DATA_FIELDS: readonly ["BRG", "DIS", "DTK", "END", "ETA", "ETE", "FOB", "GS", "TKE", "TRK"];
export type DataField = (typeof DATA_FIELDS)[number];
/** The System Setup settings this package carries out. */
export interface Setup {
    timeFormat: (typeof TIME_FORMATS)[number];
    /** Local time offset from UTC, minutes. */ offset: number;
    /** The MFD data bar's four fields, left to right. */ dataBar: DataField[];
    /** Page Navigation: the first FMS click both shows the page group tabs and moves. */ firstClick: boolean;
    /** Page Navigation: seconds the page group tabs stay up, 2 to 10. */ timeout: number;
    /** Nearest Airports: the runway surface an airport needs. */ surface: (typeof SURFACES)[number];
    /** Nearest Airports: the runway length an airport needs, feet. */ minLength: number;
}
/** Pilot's Guide defaults; FG1000's data bar (GS, DTK, TRK, ETE) and page tab timeout (3 s). `offset`: the browser's. */
export declare const setupDefaults: (offset?: number) => Setup;
export declare const hms: (sec: number) => string;
/** A time of day in the System Setup format. */
export declare function clockText(ms: number, s: Pick<Setup, "timeFormat" | "offset">, seconds?: boolean): string;
export declare function ete(sec: number): string;
/** Whether an airport meets System Setup's Nearest Airports criteria. One without runway data is kept: it cannot be judged. */
export declare function airportMatches(a: Airport, s: Pick<Setup, "surface" | "minLength">): boolean;
export type DataBarState = Pick<MfdState, "groundspeed" | "dtk" | "track" | "ete" | "lat" | "lon" | "magVar" | "route" | "activeLeg" | "points" | "airports"> & {
    engine: Pick<MfdState["engine"], "fuelLeft" | "fuelRight" | "fuelFlow">;
};
/** A data bar field's value; BRG and DIS are to the active waypoint, FOB and END from the fuel gauges. */
export declare function dataBar(f: DataField, s: DataBarState, now: number, setup: Setup): string;
/** System Setup's fields the cursor stops on, by box, in order. */
export declare const SETUP_FIELDS: {
    box: string;
    label: string;
}[];
/** The small FMS knob on field `i`. shortcut: numbers step (30 min, 1 s, 100 ft) rather than being typed digit by digit. */
export declare function stepSetup(s: Setup, i: number, d: number): void;
export declare function setupValue(s: Setup, i: number): string;
type Criterion = "PWR-ON" | "IN-AIR";
export declare const UTILITY_FIELDS: readonly ["dir", "time", "action", "flight", "departure"];
export type UtilityField = (typeof UTILITY_FIELDS)[number];
/** AUX - UTILITY's timers and trip statistics. Times are epoch ms from the caller, so the tests set the clock. */
export declare class Utility {
    private power;
    up: boolean;
    /** The countdown's starting time, s. */ initial: number;
    private base;
    private since;
    running: boolean;
    private stopped;
    flightFrom: Criterion;
    depFrom: Criterion;
    private airborne;
    private flightReset;
    private depReset;
    /** Nautical miles. */ odom: number;
    /** Nautical miles. */ trip: number;
    private tripHours;
    /** Knots. */ maxGs: number;
    private last;
    constructor(power: number);
    /** The generic timer, s: up from its time, or down to zero and then up. */
    timer(now: number): number;
    private counting;
    label(): "STOP?" | "RESET?" | "START?";
    /** ENT on the timer's START?, STOP? or RESET?. RESET returns a countdown not yet at zero to its time, otherwise zero. */
    action(now: number): void;
    /** The small FMS knob on a Utility field. */
    field(f: UtilityField, d: number, now: number): void;
    private start;
    /** Time in flight, s, from power on or lift off (null before it) or the last reset. */
    flight(now: number): number | null;
    /** The departure time, epoch ms, or null before lift off. */
    departure(_now: number): number | null;
    avgGs(): number;
    /** Takes a groundspeed sample. shortcut: a gap of over a minute between samples is not flown. */
    tick(gs: number, now: number): void;
    /** PAGE MENU's resets. */
    reset(what: "flight" | "departure" | "trip" | "odom" | "max" | "all", now: number): void;
}
export {};
