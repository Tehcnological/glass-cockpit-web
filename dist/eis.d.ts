import { type Page } from "./page.js";
import { type Key } from "./ui.js";
import { FuelCalc, LeanAssist } from "./lean.js";
import type { Engine } from "./glass-mfd.js";
/** EIS.updateData, into the strip's page. */
export declare function drawEis(eis: Page, e: Engine): void;
/** The engine softkey menus; `galrem` is SYSTEM's GAL REM keys. */
export type EngineMenu = "engine" | "lean" | "system" | "galrem";
/** The strip's page for a softkey menu (Pilot's Guide): LEAN and SYSTEM show their pages, any other menu ENGINE. */
export declare const eisView: (menu: string) => "engine" | "lean" | "system";
/** Where BACK goes from an engine menu. */
export declare const engineBack: (menu: EngineMenu) => "top" | "engine" | "system";
/** EIS engineMenu's first ten softkeys. v13 trainer: LEAN's and SYSTEM's keys where the trainer has them (FG1000 packs
 * them after SYSTEM). Pilot's Guide: CYL SLCT is disabled in ASSIST, and GAL REM opens -10, -1, +1 and +10 GAL (their
 * slots are a guess, as the trainer was not checked). `s` is the strip's lean assist and fuel calculator. */
export declare function engineKeys(menu: EngineMenu, to: (m: EngineMenu) => () => void, s?: {
    lean: LeanAssist;
    fuel: FuelCalc;
}): Key[];
/**
 * The LEAN page: fuel flow, the ASSIST rows (ΔPEAK and the fuel flow at peak), EGT per cylinder as bars under the
 * selected cylinder's value, the cylinder numbers (the selected one boxed, as FG1000's ENGINE page marks its EGT
 * cylinder), and CHT the same way. Without `cylinders`, every bar shows the single `egt` and the values are dashed.
 */
export declare function leanMarkup(e: Engine, lean: LeanAssist): string;
/** The SYSTEM page: oil pressure and temperature, and the fuel calculator (fuel flow, GAL USED, GAL REM; GAL REM cyan
 * while its keys are up). Engine hours and the electrical block are below, as on the ENGINE page. */
export declare function systemMarkup(e: Engine, fuel: FuelCalc, editing: boolean): string;
/** The strip with its three pages. The lean assist and fuel calculator live here, in the unit, not in the host's state. */
export declare class EisStrip {
    private page;
    lean: LeanAssist;
    fuel: FuelCalc;
    private band;
    /** FG1000's gauges the LEAN and SYSTEM pages replace, found once (any missing are skipped). */ private gauges;
    private drawn;
    constructor(page: Page);
    /** Draws the page for the softkey menu `menu`; counts fuel and watches for a peak whatever the page. */
    draw(e: Engine, menu: string, now?: number): void;
}
interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Reversionary mode (Pilot's Guide): the engine strip takes the PFD's left side, which FG1000's PFD already keeps clear
 * of the flight instruments, so they stay. OAT moves under TAS, and the inset map from the lower left to the lower
 * right, at the same margin. */
export declare function reversionaryLayout(tas: Box, oat: Box, inset: Box, width?: number): {
    oat: {
        dx: number;
        dy: number;
    };
    inset: {
        dx: number;
        dy: number;
    };
};
export {};
