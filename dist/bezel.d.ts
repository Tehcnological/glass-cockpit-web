import type { Radios } from "./surround.js";
export type Control = "NAV_VOL" | "NAV_ID" | "NAV_FREQ_TRANSFER" | "NAV_OUTER" | "NAV_INNER" | "NAV_TOGGLE" | "HEADING" | "HEADING_PRESS" | "ALT_OUTER" | "ALT_INNER" | "ALT_PRESS" | "COM_VOL" | "COM_VOL_TOGGLE" | "COM_FREQ_TRANSFER" | "COM_FREQ_TRANSFER_HOLD" | "COM_OUTER" | "COM_INNER" | "COM_TOGGLE" | "CRS" | "BARO" | "CRS_CENTER" | "RANGE" | "JOYSTICK_PRESS" | "JOYSTICK_HORIZONTAL" | "JOYSTICK_VERTICAL" | "DTO" | "FPL" | "CLR" | "CLR_HOLD" | "MENU" | "PROC" | "ENT" | "FMS_OUTER" | "FMS_INNER" | "FMS_CRSR" | "SOFTKEY";
/** One bezel input: a knob turned (value +1 a detent clockwise, -1 counterclockwise; HDG and CRS 5 on a fast wheel spin), a push (1), or a softkey (1 to 12). */
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
/**
 * A hotspot. `arrow`: it turns a knob or moves the joystick, repeating while held, drawn as an arrow here (`dir`, the
 * way it points in degrees, 0 right and 90 down; `size`, 1 for a large knob) or printed on the bezel. `also`: a
 * second input a click reports (the joystick's diagonals).
 */
export type Spot = {
    box: [number, number, number, number];
    wheel?: Control;
    shiftWheel?: Control;
    click?: Control;
    shiftClick?: Control;
    value?: number;
    arrow?: "drawn" | "printed";
    dir?: number;
    size?: number;
    also?: Input;
};
export declare const SPOTS: Spot[];
/** Detents one wheel notch turns: HDG and CRS turn 5 when the wheel spins fast (`gap`, ms since the last notch), as a quick twist does. */
export declare function wheelStep(control: Control, gap: number): number;
/** Adds the hotspots to a display drawn with its bezel and reports each input. Returns a function that removes the window listener. */
export declare function bezelInput(svg: SVGSVGElement, onInput: (input: Input) => void): () => void;
/**
 * The knob and button changes SurroundController makes, as a patch; null when the input does not change these values.
 * `toStation` is the magnetic bearing to the station of the NAV radio the CDI shows, if the host gives one.
 */
export declare function adjust({ control, value }: Input, k: Knobs, sel: {
    nav: 1 | 2;
    com: 1 | 2;
}, toStation?: number | null): Partial<Knobs> | null;
