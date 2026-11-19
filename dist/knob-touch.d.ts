import type { Input, Spot } from "./bezel.js";
/** A press that moves less than this (CSS px) is a tap; past it a single knob's press is a slide and never a push. */
export declare const MOVE_PX = 10;
/** CSS px of slide per detent. */
export declare const SLIDE_PX = 14;
/** A still press longer than this (ms) does nothing: not a push, not a popout. */
export declare const TAP_MS = 500;
/** After a popout opens it ignores input this long (ms), so the opening tap's late click cannot press a key under it. */
export declare const GUARD_MS = 300;
/** A popout closes after this long (ms) without input. */
export declare const IDLE_MS = 5000;
/** A popout key is at least this big on screen (CSS px). */
export declare const KEY_PX = 46;
type Key = {
    label: string;
    sub?: string;
    input: Input;
    also?: Input;
    hold: boolean;
    span?: number;
};
/** The keys a knob's popout shows, in rows; null for a knob without one. */
export declare function popKeys(s: Spot): {
    cols: number;
    keys: Key[];
} | null;
/** A knob a slide turns and a tap pushes. */
export declare const slides: (s: Spot) => boolean;
type Ev = PointerEvent;
/**
 * Touch and pen on the knobs of a display drawn by `bezelInput`. `offset` is the art's offset from the spots' coordinates
 * and `width` the viewBox's. The bezel's own handlers call `down` and `up` first and skip the press when they return
 * true, and skip a whole gesture while `swallowed()` (a tap outside an open popout closes it and does nothing else).
 */
export declare function knobTouch(svg: SVGSVGElement, onInput: (i: Input) => void, offset: [number, number], width: number, spots: Spot[], hints: boolean): {
    swallowed: () => boolean;
    /** A touch or pen press on a spot; true when it is a knob's, handled here. */
    down(e: Ev, s: Spot | undefined): boolean;
    /** The press lifted; true when it was a knob's. */
    up(e: Ev): boolean;
    destroy(): void;
};
export {};
