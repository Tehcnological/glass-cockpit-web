import type { Input } from "./bezel.js";
export interface DisplayOptions {
    /** Draw the bezel with its knobs and softkeys around the screen; the mouse works them. */ bezel?: boolean;
    /** Called for every bezel input, including ones the display does not act on (FMS, menus, joystick). */
    onInput?: (input: Input) => void;
    /**
     * Draw the GFC 700's keys (AP, FD, HDG, ALT, NAV, VNV, APR, BC, VS, FLC, NOSE UP, NOSE DN) in the bezel's left column;
     * a press reaches `onInput` for the host's `Afcs`. Default: on for the MFD, off for the PFD (on the MFD in the 172S).
     */
    afcsKeys?: boolean;
}
export declare function buildDisplay(container: HTMLElement, pages: string[], label: string, { bezel }: DisplayOptions): {
    svg: SVGSVGElement;
    screen: SVGGElement;
};
