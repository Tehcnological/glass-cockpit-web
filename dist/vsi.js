// The vertical speed indicator. v13 trainer: the scale reads 1 and 2 (thousands of fpm) where FG1000's reads 2 and 4,
// so the pointer moves twice as far per fpm and stops just past 2000 fpm (2250, as the MSFS G1000 NXi does).
// The readout rounds to 50 fpm (NXi) and shows from 100 fpm up (G1000 pilot's guide); the trainer cannot climb to check.
import { clamp } from "./page.js";
/** The pointer's offset in the PFD's px, up negative. */
export function vsiPointer(vs) {
    return clamp(vs, -2250, 2250) * -0.0693 || 0;
}
/** The digits in the pointer, or "" near level flight. */
export function vsiText(vs) {
    return Math.abs(vs) < 100 ? "" : String(Math.round(vs / 50) * 50);
}
