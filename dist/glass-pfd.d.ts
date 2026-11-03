export type CdiSource = "GPS" | "NAV1" | "NAV2" | "OFF";
export type Bearing = {
    source: "NAV1" | "NAV2" | "GPS" | "ADF";
    id: string;
    bearing: number;
    distance?: number;
} | null;
export interface PfdState {
    /** Degrees, nose up positive. */ pitch: number;
    /** Degrees, right wing down positive. */ roll: number;
    /** Slip/skid ball, -1 to 1. */ slip: number;
    /** Knots. */ ias: number;
    /** Predicted airspeed change over 6 seconds, knots. */ iasTrend: number;
    /** Knots. */ tas: number;
    /** Feet. */ alt: number;
    /** Predicted altitude change over 6 seconds, feet. */ altTrend: number;
    /** Feet. */ selectedAlt: number;
    /** Feet per minute. */ vsi: number;
    /** Inches of mercury. */ baro: number;
    /** Degrees Celsius. */ oat: number;
    /** Magnetic heading, degrees. */ heading: number;
    /** Degrees. */ headingBug: number;
    cdiSource: CdiSource;
    /** Selected course, degrees. */ course: number;
    /** CDI deflection in dots, -2.4 to 2.4; positive is course to the right. */ cdiDots: number;
    /** FROM flag instead of TO. */ from: boolean;
    /** False shows NO DATA instead of the course needle. */ cdiValid: boolean;
    /** GPS annunciation, e.g. ENR, TERM, LPV. */ gpsMode: string;
    /** GPS cross-track error, nm; shown beyond 2 dots. */ xtk: number;
    /** Glideslope, -1 to 1 full scale; null hides it. */ gs: number | null;
    brg1: Bearing;
    brg2: Bearing;
    /** Marker beacon: "", "O", "M", "I". */ marker: "" | "O" | "M" | "I";
    /** Flight director command bars; null hides them. */ fd: {
        pitch: number;
        roll: number;
    } | null;
}
export interface PfdOptions {
    /** IAS box turns red above this. */ vne?: number;
    /** Speed references shown on the tape. */ vspeeds?: Partial<Record<"Vx" | "Vy" | "Vr" | "Vglide", number>>;
}
export declare class GlassPfd {
    private options;
    readonly svg: SVGSVGElement;
    private state;
    private cache;
    private base;
    constructor(container: HTMLElement, options?: PfdOptions);
    /** Merge new values into the state and redraw. */
    set(patch: Partial<PfdState>): void;
    private updateAI;
    private updateFD;
    private updateIAS;
    private updateVSI;
    private updateALT;
    private setCDISource;
    private updateCDI;
    private updateBRG;
    private el;
    private show;
    private text;
    private tf;
    private centers;
    private center;
    private clip;
}
