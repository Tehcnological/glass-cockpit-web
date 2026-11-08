// Mouse input on the bezel, as FG1000's GUI window takes it (Nasal/GUI.nas, Copyright 2018 Stuart Buchanan,
// GPL-2.0-or-later): the wheel turns a knob (with shift, the outer ring of a dual knob), a click pushes it or a
// button (with shift, a long press), and the twelve keys under the screen are softkeys 1 to 12.
// v13 trainer: a click on an arrow at a knob's top corner also turns it (FG1000 has the wheel only).
// Knob and button behavior: Nasal/MFDPages/Surround/SurroundController.nas.
import { clamp, mod } from "./page.js";
// v13 trainer: clicking beside a knob turns it a detent, the left side counterclockwise, with shift the outer ring.
// Here the arrows sit in the top corners of the knob's box (its label is above); the wheel works over them too.
const ARROW = 18;
const arrows = ({ box: [x1, y1, x2], wheel, shiftWheel }) => [[x1, -1], [x2 - ARROW, 1]].map(([x, value]) => ({
    box: [x, y1 - 4, x + ARROW, y1 + ARROW - 4], wheel, shiftWheel, click: wheel, shiftClick: shiftWheel ?? wheel, value, arrow: "drawn",
}));
// GUI.nas WHEEL_HOT_SPOTS and CLICK_HOT_SPOTS merged per control, in bezel pixels (top left, bottom right).
export const SPOTS = [
    { box: [65, 45, 112, 90], wheel: "NAV_VOL", click: "NAV_ID" },
    { box: [100, 102, 150, 138], click: "NAV_FREQ_TRANSFER" },
    { box: [45, 168, 135, 250], wheel: "NAV_INNER", shiftWheel: "NAV_OUTER", click: "NAV_TOGGLE" },
    { box: [45, 338, 135, 411], wheel: "HEADING", click: "HEADING_PRESS" },
    { box: [45, 800, 135, 880], wheel: "ALT_INNER", shiftWheel: "ALT_OUTER" },
    { box: [1290, 45, 1340, 90], wheel: "COM_VOL", click: "COM_VOL_TOGGLE" },
    { box: [1250, 100, 1300, 140], click: "COM_FREQ_TRANSFER", shiftClick: "COM_FREQ_TRANSFER_HOLD" },
    { box: [1275, 170, 1355, 245], wheel: "COM_INNER", shiftWheel: "COM_OUTER", click: "COM_TOGGLE" },
    { box: [1275, 331, 1355, 410], wheel: "CRS", shiftWheel: "BARO", click: "CRS_CENTER" },
    { box: [1295, 500, 1345, 550], wheel: "RANGE", click: "JOYSTICK_PRESS" },
    // Below the RANGE - and + (GUI.nas starts these at 500).
    { box: [1255, 518, 1285, 550], click: "JOYSTICK_HORIZONTAL", value: -1 },
    { box: [1345, 518, 1380, 550], click: "JOYSTICK_HORIZONTAL", value: 1 },
    { box: [1295, 465, 1345, 500], click: "JOYSTICK_VERTICAL", value: -1 },
    { box: [1295, 550, 1345, 585], click: "JOYSTICK_VERTICAL", value: 1 },
    { box: [1255, 620, 1305, 660], click: "DTO" },
    { box: [1255, 670, 1305, 710], click: "FPL" },
    { box: [1255, 720, 1305, 760], click: "CLR", shiftClick: "CLR_HOLD" },
    { box: [1325, 620, 1380, 660], click: "MENU" },
    { box: [1325, 670, 1380, 710], click: "PROC" },
    { box: [1325, 720, 1380, 760], click: "ENT" },
    { box: [1275, 800, 1355, 880], wheel: "FMS_INNER", shiftWheel: "FMS_OUTER", click: "FMS_CRSR" },
    // SOFTKEY_HOTSPOTS
    ...[205, 290, 375, 460, 545, 630, 715, 800, 885, 970, 1055, 1145].map((x, i) => ({ box: [x, 830, x + 60, 875], click: "SOFTKEY", value: i + 1 })),
    // RANGE turns on the - and + printed beside it; the small volume knobs have no room for arrows.
    { box: [1264, 496, 1284, 516], wheel: "RANGE", click: "RANGE", value: -1, arrow: "printed" },
    { box: [1347, 496, 1367, 516], wheel: "RANGE", click: "RANGE", value: 1, arrow: "printed" },
];
// After the knobs' own spots, so an arrow is on top of the knob it turns.
SPOTS.push(...SPOTS.filter((s) => ["NAV_INNER", "HEADING", "ALT_INNER", "COM_INNER", "CRS", "FMS_INNER"].includes(s.wheel ?? "")).flatMap(arrows));
const NS = "http://www.w3.org/2000/svg";
// fascia.svg draws the bezel 1 px right of and 132 px below GUI.nas's coordinates.
const DX = 1;
const DY = 132;
// One detent per 100 px of wheel travel: one notch of a mouse wheel; a trackpad needs a longer swipe.
const DETENT = 100;
/** Adds the hotspots to a display drawn with its bezel and reports each input. */
export function bezelInput(svg, onInput) {
    const marks = svg.appendChild(document.createElementNS(NS, "g"));
    marks.setAttribute("fill", "#e6e6e6");
    for (const { box: [x1, y1, x2, y2], arrow, value } of SPOTS) {
        if (arrow !== "drawn")
            continue;
        const [x, y, d] = [(x1 + x2) / 2 + DX, (y1 + y2) / 2 + DY, value < 0 ? 1 : -1];
        const p = marks.appendChild(document.createElementNS(NS, "path"));
        p.setAttribute("d", `M${x + 4 * d} ${y - 5}L${x - 4 * d} ${y}L${x + 4 * d} ${y + 5}Z`);
    }
    const layer = svg.appendChild(document.createElementNS(NS, "g"));
    layer.setAttribute("fill", "transparent");
    layer.setAttribute("cursor", "pointer");
    for (const [i, s] of SPOTS.entries()) {
        const [x1, y1, x2, y2] = s.box;
        const r = layer.appendChild(document.createElementNS(NS, "rect"));
        for (const [k, v] of Object.entries({ x: x1 + DX, y: y1 + DY, width: x2 - x1, height: y2 - y1 }))
            r.setAttribute(k, String(v));
        r.dataset.spot = String(i);
    }
    const spot = (e) => SPOTS[Number(e.target.getAttribute("data-spot"))];
    let travel = 0;
    layer.addEventListener("wheel", (e) => {
        const control = e.shiftKey ? spot(e).shiftWheel : spot(e).wheel;
        if (!control)
            return;
        e.preventDefault();
        // Some browsers turn shift+wheel into horizontal scrolling.
        travel += (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
        while (Math.abs(travel) >= DETENT) {
            const value = travel < 0 ? 1 : -1; // wheel up turns clockwise
            travel += value * DETENT;
            onInput({ control, value });
        }
    }, { passive: false });
    layer.addEventListener("click", (e) => {
        const s = spot(e);
        const control = e.shiftKey ? s.shiftClick : s.click;
        if (control)
            onInput({ control, value: s.value ?? 1 });
    });
}
// NAV and COM bands in whole MHz (Constants.nas). Frequencies are worked in kHz to keep them exact.
const NAV = [108, 117];
const COM = [118, 136];
/**
 * The knob and button changes SurroundController makes, as a patch; null when the input does not change these values.
 * `toStation` is the magnetic bearing to the station of the NAV radio the CDI shows, if the host gives one.
 */
export function adjust({ control, value }, k, sel, toStation) {
    const d = value > 0 ? 1 : -1;
    switch (control) {
        // handleCRSCenter sets the selected NAV's course to the bearing to its station, which moves the CDI only when that
        // radio drives it.
        case "CRS_CENTER": return toStation == null ? null : { course: Math.round(mod(toStation, 360)) % 360 };
        // handleNavVol / handleComVol: 1% a detent. handleNavID switches the identifier audio.
        case "NAV_VOL": return { navVolume: clamp(Math.round(k.navVolume * 100) + d, 0, 100) / 100 };
        case "COM_VOL": return { comVolume: clamp(Math.round(k.comVolume * 100) + d, 0, 100) / 100 };
        case "NAV_ID": return { navIdent: !k.navIdent };
        case "HEADING": return { headingBug: mod(Math.round(k.headingBug) + d, 360) };
        case "HEADING_PRESS": return { headingBug: Math.round(mod(k.heading, 360)) % 360 };
        case "CRS": return { course: mod(Math.round(k.course) + d, 360) };
        case "BARO": return { baro: Math.round(k.baro * 100 + d) / 100 };
        case "ALT_INNER":
        case "ALT_OUTER": {
            // The real unit always has one (start at the altitude) and keeps it on 100 ft steps, whatever the host set.
            const from = Math.round((k.selectedAlt ?? k.alt) / 100) * 100;
            return { selectedAlt: Math.max(0, from + d * (control === "ALT_INNER" ? 100 : 1000)) };
        }
    }
    const nav = `nav${sel.nav}`;
    const com = `com${sel.com}`;
    const radio = (key, standby) => ({ radios: { ...k.radios, [key]: { ...k.radios[key], standby } } });
    const khz = (mhz) => Math.round(mhz * 1000);
    switch (control) {
        case "NAV_FREQ_TRANSFER": return { radios: { ...k.radios, [nav]: { ...k.radios[nav], active: k.radios[nav].standby, standby: k.radios[nav].active } } };
        case "COM_FREQ_TRANSFER": return { radios: { ...k.radios, [com]: { ...k.radios[com], active: k.radios[com].standby, standby: k.radios[com].active } } };
        // FG1000 tunes 121.00 here; the real unit's long press tunes the emergency frequency.
        case "COM_FREQ_TRANSFER_HOLD": return { radios: { ...k.radios, [com]: { ...k.radios[com], active: 121.5 } } };
        case "NAV_OUTER": return radio(nav, outer(khz(k.radios[nav].standby), d, NAV) / 1000);
        case "COM_OUTER": return radio(com, outer(khz(k.radios[com].standby), d, COM) / 1000);
        // Inner knobs change only the kHz, wrapping without carrying into the MHz.
        // NAV steps 50 kHz, the VOR and ILS channel spacing (FG1000 uses 25). shortcut: COM steps 25 kHz, no 8.33 kHz channels.
        case "NAV_INNER": return radio(nav, inner(khz(k.radios[nav].standby), d * 50) / 1000);
        case "COM_INNER": return radio(com, inner(khz(k.radios[com].standby), d * 25) / 1000);
    }
    return null;
}
const outer = (f, d, [lo, hi]) => (lo + mod(Math.floor(f / 1000) + d - lo, hi - lo + 1)) * 1000 + (f % 1000);
const inner = (f, step) => Math.floor(f / 1000) * 1000 + mod((f % 1000) + step, 1000);
