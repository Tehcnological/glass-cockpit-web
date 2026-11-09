import type { PfdState } from "./glass-pfd.js";
/** The AFCS keys on the MFD's bezel, as bezel Controls. */
export declare const AFCS_KEYS: readonly ["AP", "FD", "HDG", "ALT", "NAV", "VNV", "APR", "BC", "VS", "FLC", "NOSE_UP", "NOSE_DN"];
export type AfcsKey = (typeof AFCS_KEYS)[number];
/** The control wheel's AP DISC switch and the panel's GA switch. CWS is held: see `cws`. */
export type AfcsSwitch = "AP_DISC" | "GA";
export type Lateral = "ROL" | "HDG" | "GPS" | "VOR" | "LOC" | "VAPP" | "BC" | "GA" | "TO";
export type Vertical = "PIT" | "ALT" | "ALTS" | "ALTV" | "VS" | "FLC" | "VPTH" | "GS" | "GP" | "GA" | "TO";
export type AfcsInput = Pick<PfdState, "pitch" | "roll" | "heading" | "ias" | "alt" | "vsi" | "headingBug" | "course" | "selectedAlt" | "cdiSource" | "cdiDots" | "cdiValid" | "gs" | "gpsMode" | "radios" | "failed"> & {
    /**
     * The host's vertical profile (VNV), null without one: feet above the descent path (null until the path is valid,
     * from a minute before top of descent), the active VNV target altitude, and the vertical speed required, fpm.
     */
    vnv?: {
        dev: number | null;
        target: number;
        vsr: number;
    } | null;
    /** On the ground the GA switch selects takeoff mode. */ onGround?: boolean;
    /**
     * AFCS failures the host flags (Pilot's Guide, AFCS status alerts): `roll` (ROLL), `pitch` (PTCH) and `system` (SYS)
     * disconnect the autopilot and keep it off, the flight director staying; `pft` fails the preflight test (PFT in red),
     * which keeps both off.
     */
    faults?: Partial<Record<"roll" | "pitch" | "system" | "pft", boolean>>;
};
export interface AfcsField {
    text: string;
    color: "white" | "green" | "yellow" | "red";
    flash: boolean;
}
/** What the PFD draws: the AFCS status box in its header, and the airspeed reference box above the airspeed tape. */
export interface AfcsDisplay {
    lateralArmed: AfcsField;
    lateralActive: AfcsField;
    status: AfcsField;
    verticalActive: AfcsField;
    verticalReference: AfcsField;
    verticalArmed: AfcsField;
    /** FLC's airspeed reference, knots, with its bug; null hides them. */ airspeedRef: number | null;
    /** Overspeed: MAXSPD flashes yellow in the airspeed reference box. */ maxspd: boolean;
    /** The AFCS status alert above the airspeed tape: PFT (white while the preflight test runs, red if it failed), or
     * ROLL, PTCH or SYS in red; blank otherwise. */ alert: AfcsField;
}
export interface AfcsOutput {
    /** Command bars, degrees; null when the flight director is off. */ fd: {
        pitch: number;
        roll: number;
    } | null;
    /** The servos are flying: the host moves the aircraft toward `fd`. False while CWS is held. */ ap: boolean;
    display: AfcsDisplay;
}
export interface AfcsOptions {
    /** Highest autopilot airspeed, knots: above it MAXSPD shows and the flight director pitches up. Set the aircraft's. */
    maxSpeed?: number;
    /** The preflight test, seconds (default `PFT_S`; 0 skips it): it starts at the first `update` with valid attitude, so
     * after the AHRS aligns. */
    pft?: number;
    /** Called once when the preflight test passes, where the real unit sounds the autopilot disconnect tone. */
    onPreflightPass?: () => void;
}
/** How long the preflight test runs, seconds. Assumed: the Pilot's Guide gives no time, only that it runs at power-up. */
export declare const PFT_S = 5;
export declare class Afcs {
    private options;
    private ap;
    private fdOn;
    private held;
    private lat;
    private latArmed;
    private navKey;
    private navSrc;
    private vert;
    private vnvSel;
    private ack;
    private apprV;
    private ref;
    private hdgErr;
    private flash;
    private s;
    private now;
    /** When the preflight test ends, ms: null until attitude is valid, 0 once it has passed. */
    private pftEnd;
    constructor(options?: AfcsOptions);
    /** An AFCS key on the bezel, or a switch on the yoke or panel. Acts on the state the last `update` was given. */
    press(key: AfcsKey | AfcsSwitch): void;
    /** The control wheel steering button, held down (true) and released. */
    cws(down: boolean): void;
    /** Steps the AFCS to `now` (ms) with the aircraft's state and returns what to draw and fly. */
    update(s: AfcsInput, now: number): AfcsOutput;
    /** The preflight test is running, or has failed. */
    private get testing();
    /** A ROLL, PTCH or SYS failure: no autopilot. */
    private get servoFault();
    /** Flight director on in its default modes, Roll Hold and Pitch Hold. */
    private activate;
    private off;
    private disconnect;
    /** A key for one axis: turns the flight director on first, and stops that axis's flashing. */
    private lateral;
    private vertical;
    /** Roll Hold, holding the bank (or wings level after a reversion). */
    private rol;
    private pit;
    private setHdg;
    private setVert;
    private nose;
    /** What the selected source gives NAV and APR: GPS, VOR or LOC; null with nothing to fly. */
    private navKind;
    private freq;
    private navigate;
    private vnvKey;
    /** CWS: the references follow the aircraft while it is hand flown, and are kept on release. */
    private sync;
    /** LOC and BC capture only within 105° of the course. */
    private inside;
    private lateralTransitions;
    private lostVertical;
    /** The altitude capture armed now, if any: ALTV when the VNV target comes before the selected altitude. */
    private capture;
    private verticalTransitions;
    private command;
    private get maxSpeed();
    private overspeed;
    private draw;
}
