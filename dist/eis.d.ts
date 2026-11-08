import { type Page } from "./page.js";
import { type Key } from "./ui.js";
import type { Engine } from "./glass-mfd.js";
/** EIS.updateData, into the strip's page. */
export declare function drawEis(eis: Page, e: Engine): void;
export type EngineMenu = "engine" | "lean" | "system";
/** EIS engineMenu's first ten softkeys. v13 trainer: LEAN's and SYSTEM's keys where the trainer has them (FG1000 packs
 * them after SYSTEM). shortcut: the strip has only its ENGINE page (as FG1000), so LEAN and SYSTEM change the softkeys
 * only and their own keys do nothing. */
export declare function engineKeys(menu: EngineMenu, to: (m: EngineMenu) => () => void): Key[];
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
