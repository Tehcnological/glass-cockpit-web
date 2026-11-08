import type { Radios } from "./surround.js";
export type Control = "NAV_VOL" | "NAV_ID" | "NAV_FREQ_TRANSFER" | "NAV_OUTER" | "NAV_INNER" | "NAV_TOGGLE" | "HEADING" | "HEADING_PRESS" | "ALT_OUTER" | "ALT_INNER" | "COM_VOL" | "COM_VOL_TOGGLE" | "COM_FREQ_TRANSFER" | "COM_FREQ_TRANSFER_HOLD" | "COM_OUTER" | "COM_INNER" | "COM_TOGGLE" | "CRS" | "BARO" | "CRS_CENTER" | "RANGE" | "JOYSTICK_PRESS" | "JOYSTICK_HORIZONTAL" | "JOYSTICK_VERTICAL" | "DTO" | "FPL" | "CLR" | "CLR_HOLD" | "MENU" | "PROC" | "ENT" | "FMS_OUTER" | "FMS_INNER" | "FMS_CRSR" | "SOFTKEY";
/** One bezel input: a knob turned one detent (value +1 clockwise, -1 counterclockwise), a push (1), or a softkey (1 to 12). */
export interface Input {
    control: Control;
    value: number;
}
/** Values the knobs change on either unit. The MFD does not draw them but its knobs turn them, as on the real unit. */
export interface Knobs {
    /** Magnetic heading, degrees. */ heading: number;
    /** Degrees. */ headingBug: number;
    /** Selected course, degrees. */ course: number;
    /** Inches of mercury. */ baro: number;
    /** Feet. */ alt: number;
    /** Feet; null hides the selected altitude. */ selectedAlt: number | null;
    radios: Radios;
    /** NAV and COM volume, 0 to 1 (both radios of a kind share one, as in FG1000). */ navVolume: number;
    comVolume: number;
    /** NAV station identifier audio, switched by pushing the NAV volume knob. */ navIdent: boolean;
}
/** A hotspot. `arrow`: it turns a knob one detent per click, drawn as an arrow here or printed on the bezel. */
export type Spot = {
    box: [number, number, number, number];
    wheel?: Control;
    shiftWheel?: Control;
    click?: Control;
    shiftClick?: Control;
    value?: number;
    arrow?: "drawn" | "printed";
};
export declare const SPOTS: Spot[];
/** Adds the hotspots to a display drawn with its bezel and reports each input. */
export declare function bezelInput(svg: SVGSVGElement, onInput: (input: Input) => void): void;
/**
 * The knob and button changes SurroundController makes, as a patch; null when the input does not change these values.
 * `toStation` is the magnetic bearing to the station of the NAV radio the CDI shows, if the host gives one.
 */
export declare function adjust({ control, value }: Input, k: Knobs, sel: {
    nav: 1 | 2;
    com: 1 | 2;
}, toStation?: number | null): Partial<Knobs> | null;
