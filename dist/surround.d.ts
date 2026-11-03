import { Page } from "./page.js";
export interface Radio {
    active: number; /** MHz. */
    standby: number;
}
export interface Radios {
    nav1: Radio & {
        id: string;
    };
    nav2: Radio & {
        id: string;
    };
    com1: Radio;
    com2: Radio;
}
export declare const RADIOS: Radios;
export declare class Surround {
    readonly p: Page;
    private raw;
    /** The radios the tuning knobs work on (the cyan box); the selected COM is the one transmitting. */
    readonly sel: {
        nav: 1 | 2;
        com: 1 | 2;
    };
    constructor(screen: SVGGElement);
    /** Pushing a tuning knob moves its box to the other radio (handleNavToggle, handleComToggle). */
    toggle(radio: "nav" | "com"): void;
    private showSelected;
    /** `navSource` is the NAV radio driving the CDI; its active frequency shows green. */
    setRadios(r: Radios, navSource: 1 | 2 | null): void;
    /** Twelve labels, left to right; "" leaves a key blank. A lit key (an option that is on) is black on grey. */
    setSoftkeys(labels: string[], lit?: boolean[]): void;
    setPageTitle(title: string): void;
}
