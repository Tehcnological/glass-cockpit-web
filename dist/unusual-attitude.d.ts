import type { Control } from "./bezel.js";
/** Past +30° or -20° pitch, or past 65° bank. Bank is read the short way round, so 350 is 10° left. */
export declare function unusualAttitude(pitch: number, roll: number): boolean;
/** Whether the PFD ignores `control` in an unusual attitude, with `window` open. */
export declare function uaIgnores(control: Control, window: string | null): boolean;
