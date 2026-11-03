import type { Input } from "./bezel.js";
export interface DisplayOptions {
    /** Draw the bezel with its knobs and softkeys around the screen; the mouse works them. */ bezel?: boolean;
    /** Called for every bezel input, including ones the display does not act on (FMS, menus, joystick). */
    onInput?: (input: Input) => void;
}
export declare function buildDisplay(container: HTMLElement, pages: string[], label: string, { bezel }: DisplayOptions): {
    svg: SVGSVGElement;
    screen: SVGGElement;
};
