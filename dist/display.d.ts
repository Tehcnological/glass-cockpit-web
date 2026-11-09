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
/**
 * Prefixes every id the markup references (`url(#id)`, `href="#id"`) with `tag`. A reference resolves to the first
 * element in the document with that id, so two displays inlining the same art would share one copy, and if that copy
 * sits in a display:none display, the other display's gradients and filters do not paint. Ids nothing references keep
 * their names, so `Page.el` and the bezel find them as before.
 */
export declare function scopeIds(markup: string, tag: string): string;
export declare function buildDisplay(container: HTMLElement, pages: string[], label: string, { bezel }: DisplayOptions): {
    svg: SVGSVGElement;
    screen: SVGGElement;
};
