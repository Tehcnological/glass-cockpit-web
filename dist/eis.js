// The engine strip (FG1000 Nasal/EIS/EIS.nas, Copyright 2018 Stuart Buchanan, ported to TypeScript under GPL-2.0-or-later),
// shared by the MFD and the reversionary PFD, with its softkeys and where the reversionary PFD moves things to make room.
import { clamp } from "./page.js";
import { BLANK, key } from "./ui.js";
// EIS.new: pointer name, min, max, travel in px (PFD.PointerElement).
const POINTERS = [
    ["FuelFlowPointer", "fuelFlow", 0, 20], ["OilPressurePointer", "oilPressure", 0, 115], ["OilTempPointer", "oilTemp", 0, 245],
    ["EGTPointer", "egt", 0, 1], ["EGTCylinder", "egt", 0, 1], ["VacPointer", "vacuum", 3, 7],
    ["LeftFuelPointer", "fuelLeft", 0, 30], ["RightFuelPointer", "fuelRight", 0, 30],
];
/** EIS.updateData, into the strip's page. */
export function drawEis(eis, e) {
    eis.text("RPMDisplay", String(Math.round(e.rpm)));
    eis.text("MBusVolts", e.volts.toFixed(1));
    eis.text("EBusVolts", e.volts.toFixed(1)); // FG1000 shows the main bus on both
    eis.text("EngineHours", e.engineHours.toFixed(1));
    for (const [name, k, min, max] of POINTERS)
        eis.tf(name, { tx: ((clamp(e[k], min, max) - min) / (max - min)) * 135 });
    // PFD.RotatingElement: 0-3000 RPM over 260°, about the needle's hub (its Inkscape transform center).
    eis.tf("RPMPointer", { rot: (clamp(e.rpm, 0, 3000) / 3000) * 260 });
}
/** EIS engineMenu's first ten softkeys. v13 trainer: LEAN's and SYSTEM's keys where the trainer has them (FG1000 packs
 * them after SYSTEM). shortcut: the strip has only its ENGINE page (as FG1000), so LEAN and SYSTEM change the softkeys
 * only and their own keys do nothing. */
export function engineKeys(menu, to) {
    const k = (m) => key(m.toUpperCase(), to(m), menu === m);
    const own = {
        engine: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK],
        lean: [BLANK, key("CYL SLCT"), key("ASSIST"), BLANK, BLANK, BLANK, BLANK],
        system: [BLANK, BLANK, BLANK, key("RST FUEL"), key("GAL REM"), BLANK, BLANK],
    };
    return [k("engine"), k("lean"), k("system"), ...own[menu]];
}
/** Reversionary mode (Pilot's Guide): the engine strip takes the PFD's left side, which FG1000's PFD already keeps clear
 * of the flight instruments, so they stay. OAT moves under TAS, and the inset map from the lower left to the lower
 * right, at the same margin. */
export function reversionaryLayout(tas, oat, inset, width = 1024) {
    return {
        oat: { dx: tas.x - oat.x, dy: tas.y + tas.height + 4 - oat.y },
        inset: { dx: width - 2 * inset.x - inset.width, dy: 0 },
    };
}
