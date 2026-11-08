import { mod } from "./page.js";
/** Past +30° or -20° pitch, or past 65° bank. Bank is read the short way round, so 350 is 10° left. */
export function unusualAttitude(pitch, roll) {
    return pitch > 30 || pitch < -20 || Math.abs(mod(roll + 180, 360) - 180) > 65;
}
// The map and window keys: the inset map and the windows they open are gone. The FMS keys still work ALERTS and DME,
// which stay.
const MAP_AND_WINDOW_KEYS = new Set(["RANGE", "JOYSTICK_PRESS", "JOYSTICK_HORIZONTAL", "JOYSTICK_VERTICAL", "MENU", "DTO", "PROC", "FPL"]);
const FMS_KEYS = new Set(["FMS_OUTER", "FMS_INNER", "FMS_CRSR", "ENT", "CLR"]);
/** Whether the PFD ignores `control` in an unusual attitude, with `window` open. */
export function uaIgnores(control, window) {
    return MAP_AND_WINDOW_KEYS.has(control) || (FMS_KEYS.has(control) && window !== "ALERTS" && window !== "DME");
}
