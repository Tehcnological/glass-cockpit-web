import type { Engine } from "./glass-mfd.js";
import { type DisplayOptions } from "./display.js";
import { type RadioFailure, type Radios } from "./surround.js";
import { type Airspace, type LatLon, type MapPoint } from "./map.js";
import { type Airport, type Procedure } from "./nav.js";
import { unusualAttitude } from "./unusual-attitude.js";
import type { AfcsDisplay } from "./afcs.js";
export { unusualAttitude };
export { GlassMfd, type MfdState, type Engine } from "./glass-mfd.js";
export type { Checklist } from "./mfd-pages.js";
export type { MapPoint, Airspace, LatLon } from "./map.js";
export type { Airport, Runway, Freq, Station, Procedure, ProcLeg } from "./nav.js";
export { gpsApproved, vtfLeg } from "./nav.js";
export type { Radio, Radios, RadioFailure } from "./surround.js";
export { DisplayBackup, displayModes, type DisplayMode } from "./display-backup.js";
export type { DisplayOptions } from "./display.js";
export type { Control, Input } from "./bezel.js";
export { Afcs, AFCS_KEYS, type AfcsKey, type AfcsSwitch, type AfcsInput, type AfcsOutput, type AfcsDisplay, type AfcsField, type AfcsOptions } from "./afcs.js";
export type CdiSource = "GPS" | "NAV1" | "NAV2" | "OFF";
export type BrgSource = "OFF" | "NAV1" | "NAV2" | "GPS" | "ADF";
/** What a bearing source points at: a station or waypoint, its bearing (magnetic) and distance (nm). */
export interface Pointer {
    id: string;
    bearing: number;
    distance?: number;
}
export type XpdrMode = "OFF" | "STBY" | "TEST" | "GND" | "ON" | "ALT";
export type VSpeed = "Vglide" | "Vr" | "Vx" | "Vy";
export interface PfdState {
    /** Degrees, nose up positive. */ pitch: number;
    /** Degrees, right wing down positive. */ roll: number;
    /** Slip/skid ball, -1 to 1. */ slip: number;
    /** Knots. */ ias: number;
    /** Predicted airspeed change over 6 seconds, knots. */ iasTrend: number;
    /** Knots. */ tas: number;
    /** Feet. */ alt: number;
    /** Predicted altitude change over 6 seconds, feet. */ altTrend: number;
    /** Feet; null hides the selected altitude box and bug. */ selectedAlt: number | null;
    /** Feet per minute. */ vsi: number;
    /** Inches of mercury. */ baro: number;
    /** Degrees Celsius. */ oat: number;
    /** Magnetic heading, degrees. */ heading: number;
    /** Rate of turn, degrees per second, positive right. */ turnRate: number;
    /** Degrees. */ headingBug: number;
    cdiSource: CdiSource;
    /** Selected course, degrees. */ course: number;
    /** CDI deflection in dots, -2.4 to 2.4; positive is course to the right. */ cdiDots: number;
    /** FROM flag instead of TO. */ from: boolean;
    /** False shows NO DATA instead of the course needle. */ cdiValid: boolean;
    /** GPS annunciation, e.g. ENR, TERM, LPV. */ gpsMode: string;
    /** GPS cross-track error, nm; shown beyond 2 dots. */ xtk: number;
    /** Glideslope, -1 to 1 full scale; null hides it. */ gs: number | null;
    /** Bearing pointer sources, picked with PFD > BRG1 / BRG2. */ brg1: BrgSource;
    brg2: BrgSource;
    /** What each bearing source points at; a source with nothing here shows dashes. */
    bearings: Partial<Record<Exclude<BrgSource, "OFF">, Pointer>>;
    /** Marker beacon: "", "O", "M", "I". */ marker: "" | "O" | "M" | "I";
    /** Flight director command bars; null hides them. */ fd: {
        pitch: number;
        roll: number;
    } | null;
    /** The GFC 700's annunciations (`Afcs.update`'s `display`): the AFCS status box and FLC's airspeed reference. Null blanks them. */
    afcs: AfcsDisplay | null;
    radios: Radios;
    /** NAV and COM volume, 0 to 1; a change shows on the radios for 2 seconds. */ navVolume: number;
    comVolume: number;
    /** NAV station identifier audio, switched by pushing the NAV volume knob. */ navIdent: boolean;
    /** Active flight plan leg in the top bar; `from` null is a direct-to. Null blanks it. */
    leg: {
        from: string | null;
        to: string; /** nm */
        dis: number; /** degrees */
        brg: number;
    } | null;
    /** Aircraft position, for the inset map and the NRST window. */ lat: number;
    lon: number;
    /** Inset map contents (see the MFD's map). */ points: MapPoint[];
    airspaces: Airspace[];
    /** Flight plan, for the inset map and the FPL window: ids of `points` or `airports`, or points of its own. */
    route: (string | MapPoint)[];
    /** Set by DIRECT TO and PROC: where the direct leg to the active waypoint starts, for the inset map. */ directFrom: LatLon | null;
    /** Vector-to-final is active (PROC): `directFrom` is its intercept, not a direct-to, so Cancel Direct-To NAV is dim. */ vtf: boolean;
    /** Index into `route` of the active waypoint. */ activeLeg: number;
    /** Airports the NRST window lists, nearest first after sorting here. */ airports: Airport[];
    /** Approaches the PROC window can load, for the airports in `airports`. */ procedures: Procedure[];
    /** Magnetic variation, degrees east positive: bearings to stations are magnetic. */ magVar: number;
    /** Wind, true direction it blows from and knots; null shows NO DATA. */ wind: {
        direction: number;
        speed: number;
    } | null;
    xpdr: {
        mode: XpdrMode; /** Four digits. */
        code: string;
        ident: boolean;
    };
    /** Time of day in seconds for the TIME field; null uses the computer's clock. */ time: number | null;
    /** GPS OBS mode (OBS softkey): course set with the CRS knob instead of the flight plan. */ obs: boolean;
    /** Messages for the ALERTS window. */ alerts: string[];
    /** Which speed references (options.vspeeds) show on the tape, set in TMR/REF. */ vspeedsOn: Record<VSpeed, boolean>;
    /** Barometric minimums, feet (TMR/REF); null is off. */ minimums: number | null;
    /**
     * Failed instruments, flagged with FG1000's red X and yellow text. As the trainer shows them: an AHRS failure flags
     * `attitude` only; an air data failure flags `airspeed`, `altitude` and `vsi` together.
     * `com1`, `nav1`, `com2` and `nav2` cross out a radio's field (a GIA or display failure; see `displayModes`).
     */
    failed: Partial<Record<Failure, boolean>>;
    /**
     * Reversionary mode (Pilot's Guide; FG1000 does not wire it): the engine strip down the left, `engine` in it, OAT under
     * TAS, the inset map in the lower right and ENGINE on the first softkey. The host sets it on both units' places (the
     * MFD's taken by a second PFD) when DISPLAY BACKUP is pushed or a display fails.
     */
    reversionary: boolean;
    /** For the engine strip in reversionary mode (see the MFD's). */ engine: Engine;
}
/** A change `onChange` reports. */
export type PfdChange = Partial<PfdState>;
export type Failure = "attitude" | "airspeed" | "altitude" | "vsi" | "heading" | RadioFailure;
export interface PfdOptions extends DisplayOptions {
    /** Called when a bezel input changes the state (heading bug, course, baro, selected altitude, radios, CDI source). */
    onChange?: (patch: PfdChange) => void;
    /** IAS box turns red above this. */ vne?: number;
    /** Speed references, switched on and off in TMR/REF. */ vspeeds?: Partial<Record<VSpeed, number>>;
    /** The airspeed tape's color strip, knots (default: the 172S's). */ speedRanges?: SpeedRanges;
}
/** Speed range strip limits, knots: flaps operating vso to vfe (white), normal vs1 to vno (green), caution vno to vne
 * (yellow), vne up (red); under vso is red for low speed awareness. */
export interface SpeedRanges {
    vso: number;
    vs1: number;
    vfe: number;
    vno: number;
    vne: number;
}
/** Cessna 172S, KIAS. */
export declare const SPEEDS_172S: SpeedRanges;
/** The turn rate trend vector for a rate in deg/s: an arc to the heading 6 seconds ahead, clamped to the band, and
 * the arrowhead the Pilot's Guide shows past 4 deg/s, where the prediction is no longer valid. */
export declare function turnVector(rate: number): {
    arc: string;
    arrow: string;
};
export declare class GlassPfd {
    private options;
    readonly svg: SVGSVGElement;
    private state;
    /** In an unusual attitude as of the last set(). */ private ua;
    private eis;
    private eisBack;
    /** Where reversionary mode moves OAT and the inset map. */ private rev;
    private p;
    private surround;
    /** Removes the bezel's window listener. */ private unbezel;
    private nrst;
    private fpl;
    private fplRows;
    private turnTrend;
    private turnArrow;
    /** The pitch ladder's window shape, and the fixed matrices updateAI uses to keep it still on the screen: from the
     * horizon's coordinates to the ladder's, and from the screen to the horizon's parent. */
    private ladder;
    private minBug;
    private inset;
    private insetGeom;
    /** Pan mode's pointer and info bar, over the inset map. */ private panLayer;
    private win;
    private winBox;
    private clock;
    private timers;
    private ui;
    /** DIRECT TO's identifier, spelled with the FMS knob. */ private dtoEntry;
    /** PROC: the same flow as the MFD's PROCEDURES page; its airport identifier is spelled in `procEntry`. */ private proc;
    private procEntry;
    /** The window the flight plan menu's Closest Point of FPL and Parallel Track open. */ private tool;
    /** The container must be visible: layout is measured once here. */
    constructor(container: HTMLElement, options?: PfdOptions);
    private updateTurnRate;
    /** Stops the clock. Call when the display is removed. */
    destroy(): void;
    private input;
    /** Apply a change the pilot made and report it. */
    private change;
    private go;
    private openWindow;
    private menu;
    private xpdrDigit;
    private ident;
    private later;
    private defaults;
    private nearest;
    /** The PAGE MENU options, the flight plan's or the DIRECT TO window's; those without `patch` or `tool` are dim. */
    private pageMenu;
    private fms;
    private dtoPoint;
    private dtoEnt;
    private timerValue;
    private timerField;
    private timerAction;
    private timerLabel;
    private tick;
    /** Merge new values into the state and redraw. */
    set(patch: Partial<PfdState>): void;
    private updateFlightPlan;
    private updateXpdr;
    private updateWind;
    private updateReversionary;
    private updateInset;
    private panView;
    private updateNrst;
    private hl;
    private drawWindow;
    private updateLeg;
    private updateAI;
    private speedStrip;
    private ladderWindow;
    private updateFD;
    /** The AFCS status box, and FLC's airspeed reference (cyan, with its bug) or MAXSPD (flashing yellow) above the tape. */
    private updateAfcs;
    private updateIAS;
    private updateVSI;
    private updateALT;
    private setCDISource;
    private updateCDI;
    private updateBRG;
}
