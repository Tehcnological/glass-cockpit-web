// Glass PFD for the browser: a TypeScript port of the display logic in FlightGear's FG1000
// (Aircraft/Instruments-3d/FG1000/Nasal/MFDPages/PFDInstruments/PFDInstruments.nas, Copyright 2018 Stuart Buchanan),
// driving the same SVG. GPL-2.0-or-later, like the original.
import PFD from "./svg/pfd.js";
import SURROUND from "./svg/surround-pfd.js";
import NRST from "./svg/nrst-pfd.js";
import NRST_INFO from "./svg/nrst-info-pfd.js";
import FPL from "./svg/fpl-pfd.js";
import EIS from "./svg/eis.js";
import { drawEis, engineKeys, reversionaryLayout } from "./eis.js";
import { buildDisplay } from "./display.js";
import { Page, clamp, deg3, matrixAttr, mod, ownMatrix, pad } from "./page.js";
import { RADIOS, Surround } from "./surround.js";
import { adjust, bezelInput } from "./bezel.js";
import { DCLTR, drawMap, mapGroup, rangeLabel, stepRange } from "./map.js";
import { ProcFlow, PROC_MENU } from "./procedures.js";
import { MIN_BLANK, minView, stepBaro } from "./apr-info.js";
import { PanIdle, panInfo, panMarkup, panMove, panStart, panTarget } from "./pan.js";
import { bearingDistance, bestApproach, directToPatch, cancelDirectTo, findPoint, latLon, missedPatch, nearest, nrstFreq, planName, routePoint, suspended } from "./nav.js";
import { alertsKey, seenAlerts } from "./alerts.js";
import { cdiLabel, dmeText } from "./radio.js";
import { BLANK as blank, CYAN, Highlighter, IdEntry, ListView, NS, dimKey, esc, firstRow, key as k, screenBox } from "./ui.js";
import { firstOption, fplMenu, stepMenu } from "./page-menu.js";
import { FPL_TOOLS, FplTool, holdRow, toolEnabled } from "./fpl-tools.js";
import { vsiPointer, vsiText } from "./vsi.js";
import { uaIgnores, unusualAttitude } from "./unusual-attitude.js";
export { unusualAttitude };
export { GlassMfd } from "./glass-mfd.js";
export { gpsApproved, sequenceLeg, vtfLeg } from "./nav.js";
export { DisplayBackup, displayModes } from "./display-backup.js";
export { Afcs, AFCS_KEYS } from "./afcs.js";
/** How long the AHRS aligns at power-up, seconds (Line Maintenance Manual: 40 to 60 s). */
export const AHRS_ALIGN_S = 45;
/** How long air data is invalid at power-up, seconds. Assumed: the manuals give the AHRS's time only, and the ADC is
 * ready well before it. */
export const ADC_START_S = 5;
/**
 * The power-up start-up (Line Maintenance Manual; FG1000 starts with everything valid): attitude and heading (the
 * magnetometer's data comes through the AHRS) invalid while the AHRS aligns, `seconds`, and air data for the first
 * `ADC_START_S` of it. `changed` is called as each ends.
 */
export class Startup {
    /** The instruments still invalid, as `PfdState.failed`. */ failed = {};
    timers = [];
    constructor(seconds, changed) {
        if (!(seconds > 0))
            return;
        this.failed = { attitude: true, heading: true, airspeed: true, altitude: true, vsi: true };
        const after = (sec, failed) => this.timers.push(setTimeout(() => ((this.failed = failed), changed()), sec * 1000));
        after(Math.min(ADC_START_S, seconds), { attitude: true, heading: true }); // equal delays fire in order: air data first
        after(seconds, {});
    }
    get aligning() {
        return !!this.failed.attitude;
    }
    stop() {
        this.timers.forEach(clearTimeout);
    }
}
const DEFAULTS = {
    pitch: 0, roll: 0, slip: 0, ias: 0, iasTrend: 0, tas: 0, alt: 0, altTrend: 0, selectedAlt: null, vsi: 0,
    baro: 29.92, oat: 15, heading: 0, turnRate: 0, headingBug: 0, cdiSource: "NAV1", course: 0, cdiDots: 0, from: false,
    cdiValid: true, gpsMode: "ENR", xtk: 0, gs: null, brg1: "OFF", brg2: "OFF", bearings: {}, marker: "", fd: null, afcs: null,
    radios: RADIOS, navVolume: 0.5, comVolume: 0.5, navIdent: false, leg: null, lat: 0, lon: 0, points: [], airspaces: [], route: [], directFrom: null, vtf: false, susp: false, activeLeg: 1, airports: [], procedures: [], magVar: 0, wind: null,
    xpdr: { mode: "ALT", code: "1200", ident: false }, time: null, obs: false, alerts: [],
    vspeedsOn: { Vglide: false, Vr: false, Vx: false, Vy: false }, minimums: null, failed: {}, // v13 trainer: references start off
    reversionary: false,
    engine: { rpm: 0, fuelFlow: 0, oilPressure: 0, oilTemp: 0, egt: 0, vacuum: 0, fuelLeft: 0, fuelRight: 0, volts: 0, engineHours: 0 },
};
const ENGINE_MENUS = ["engine", "lean", "system"];
/** SETUP: the PFD SETUP MENU; MENU: the flight plan's PAGE MENU. */
/** Whether a PAGE MENU option can be chosen: it makes a change or opens a window. */
const on = (o) => !!(o.patch || o.tool);
const BRG_SOURCES = ["OFF", "NAV1", "NAV2", "GPS", "ADF"];
const VSPEEDS = ["Vglide", "Vr", "Vx", "Vy"];
const TMR_FIELDS = ["time", "dir", "action", "Vglide", "Vr", "Vx", "Vy", "minimums", "minalt"];
const FONT = `font-family="'Liberation Sans',Arial,sans-serif" font-size="18"`;
// FG1000's failure flags, in its Failures group, by the instrument they cover.
const FAILURES = [["attitude", "NoAttitude"], ["airspeed", "NoASI"], ["altitude", "NoAlt"], ["vsi", "NoVS"], ["heading", "NoHDG"]];
// What the PFD removes in an unusual attitude (Pilot's Guide), held hidden through Page.hidden: what set() otherwise
// always shows, and what its updaters show as they decide. The inset map and the windows are kept closed by their
// updaters. Traffic, the VNV target altitude and an MDA/DH readout are not drawn here, so not listed.
const UA_ALWAYS = ["OAT", "XPDR-TIME", "SelectedHDG", "SelectedCRS", "BARO", "VDI"];
const UA_HIDDEN = new Set([...UA_ALWAYS, "SelectedALT", "SelectedALT-bug", "SelectedALT-meters", "WindData", "GS-ILS", "GS-type"]);
/** The autopilot annunciations in the header. */
const AFCS = ["APLateralArmed", "APLateralActive", "APVerticalArmed", "APVerticalActive", "APVerticalReference", "APStatus"];
const AFCS_HIDDEN = new Set(AFCS.map((id) => `Header${id}`));
const AFCS_FIELDS = [
    ["lateralArmed", "APLateralArmed"], ["lateralActive", "APLateralActive"], ["verticalArmed", "APVerticalArmed"],
    ["verticalActive", "APVerticalActive"], ["verticalReference", "APVerticalReference"], ["status", "APStatus"],
];
const AFCS_COLORS = { white: "#ffffff", green: "#00ff00", yellow: "#ffff00", red: "#ff0000" };
// Parts of the FG1000 PFD this port does not drive. L_NoGPS: the v13 trainer's PFD shows a GPS failure only as an alert.
const HIDDEN = ["L_NoGPS", "GSPD", "PFD-Multilines", "Annunciation", "SelectedALT-meters", "SelectedSPD-bug", "SelectedSPD-bg", "SelectedSPD-text", "SelectedSPD-symbol"];
// Tape clipping, as "rect(top, right, bottom, left)" in screen coordinates.
const CLIPS = {
    SpeedLint1: [252, 226, 318, 204],
    SpeedTape: [115, 239, 455, 156],
    LintAlt: [115, 808, 455, 704],
    AltLint00011: [252, 804, 318, 771],
};
const MAGENTA = "#ff00ff";
/** Cessna 172S, KIAS. */
export const SPEEDS_172S = { vso: 40, vs1: 48, vfe: 85, vno: 129, vne: 163 };
let ladderCount = 0;
/** The heading box sits on the turn rate band (Pilot's Guide: the band is directly above the card); FG1000 has it
 * 17.2 px lower, over the band's top. */
const HDG_LIFT = 17.2;
/** The pitch ladder's window on the screen: a circle about the aircraft symbol (459, 282.8), wide enough for the 20°
 * labels whole (their far corners are 166.5 out) and inside the roll scale (187), cut flat at the heading box's top.
 * The roll pointer and slip/skid bar draw over it. */
const LADDER = { cx: 459, cy: 282.8, r: 167, bottom: 400.5 - HDG_LIFT };
// The turn rate band above the compass card: its center and the radii it spans (FG1000's band art).
const TURN = { cx: 459.5, cy: 586.5, r0: 145, r1: 170.5 };
/** A point on the turn rate band, `t` radians right of the lubber line, `r` from the card's center. */
const turnAt = (t, r) => `${TURN.cx + r * Math.sin(t)} ${TURN.cy - r * Math.cos(t)}`;
/** The turn rate trend vector for a rate in deg/s: an arc to the heading 6 seconds ahead, clamped to the band, and
 * the arrowhead the Pilot's Guide shows past 4 deg/s, where the prediction is no longer valid. */
export function turnVector(rate) {
    const a = (clamp(rate * 6, -24, 24) * Math.PI) / 180;
    if (Math.abs(a) < 0.005)
        return { arc: "", arrow: "" };
    const r = (TURN.r0 + TURN.r1) / 2;
    const at = (t, rr = r) => turnAt(t, rr);
    const arrow = Math.abs(rate) > 4;
    const end = arrow ? a - Math.sign(a) * (10 / r) : a; // the arrowhead takes the last 10 px
    return {
        arc: `M ${at(0)} A ${r} ${r} 0 0 ${a > 0 ? 1 : 0} ${at(end)}`,
        arrow: arrow ? `M ${at(end, r - 7)} L ${at(a)} L ${at(end, r + 7)} Z` : "",
    };
}
const INSET_PAN_FONT = 12;
const GREEN = "#00ff00";
export class GlassPfd {
    options;
    svg;
    state = { ...DEFAULTS };
    /** In an unusual attitude as of the last set(). */ ua = false;
    eis;
    eisBack;
    /** Where reversionary mode moves OAT and the inset map. */ rev;
    p;
    surround;
    /** Removes the bezel's window listener. */ unbezel = () => { };
    nrst;
    fpl;
    fplRows;
    turnTrend;
    turnArrow;
    /** The pitch ladder's window shape, and the fixed matrices updateAI uses to keep it still on the screen: from the
     * horizon's coordinates to the ladder's, and from the screen to the horizon's parent. */
    ladder;
    minBug;
    inset;
    insetGeom;
    /** Pan mode's pointer and info bar, over the inset map. */ panLayer;
    win;
    winBox;
    clock;
    timers = [];
    startup;
    /** The AHRS alignment box, over FG1000's attitude red X. */ alignBox;
    /** FG1000's ATTITUDE FAIL text, which the alignment box replaces. */ alignText;
    // Display settings the menus change, as FG1000 keeps them in the page and its controller.
    ui = {
        menu: "top", inset: false, insetRange: 10, dcltr: 0, window: null, cursor: 0, nrstInfo: false,
        layers: { TRAFFIC: false, TOPO: false, TERRAIN: false },
        synvis: { PATHWAY: false, "SYN TERR": false, "HRZN HDG": false, APTSIGNS: false },
        wind: 0, meters: false, hpa: false, xpdrEdit: null, fpl: false,
        timer: { up: true, running: false, base: 0, since: 0 },
        /** The messages the ALERTS window has shown. */ alertsSeen: [],
        /** PFD > DME shows the DME window; DME TUNING picks its NAV radio. */ dme: false, dmeSource: "NAV1",
        /** The window the PAGE MENU belongs to. */ menuOf: "FPL",
        /** DIRECT TO: the waypoint, and whether the cursor is on ACTIVATE? (else on the identifier). */ dto: { id: null, act: false },
        /** Pan mode on the inset map (joystick push), or null. */ pan: null,
    };
    /** Pan mode ends after a minute with no joystick input, as on the MFD. */
    idle = new PanIdle(() => {
        this.ui.pan = null;
        this.set({});
    });
    /** DIRECT TO's identifier, spelled with the FMS knob. */ dtoEntry;
    /** PROC: the same flow as the MFD's PROCEDURES page; its airport identifier is spelled in `procEntry`. */ proc;
    procEntry;
    /** The window the flight plan menu's Closest Point of FPL and Parallel Track open. */ tool;
    /** The container must be visible: layout is measured once here. */
    constructor(container, options = {}) {
        this.options = options;
        const { svg, screen } = buildDisplay(container, [PFD, EIS, SURROUND, NRST, NRST_INFO, FPL], "Primary flight display", options);
        this.svg = svg;
        this.p = new Page(screen, "PFDInstruments");
        this.dtoEntry = new IdEntry(this.p, 5);
        this.procEntry = new IdEntry(this.p, 4);
        this.tool = new FplTool(new IdEntry(this.p, 5));
        this.proc = new ProcFlow({ s: () => this.state, change: (patch) => this.change(patch), close: () => (this.ui.window = null) }, this.procEntry);
        this.surround = new Surround(screen);
        this.nrst = new Page(screen, "NearestAirportsPFD");
        this.fpl = new Page(screen, "PFDInstrumentsFlightPlan");
        this.fpl.show("Group", true); // measured for the scroll bar, then hidden until FPL
        this.fplRows = new ListView(this.fpl, ["Arrow", "ID", "Type", "DTK", "DIS"], 5, "Arrow", true, { trough: "ScrollTrough", thumb: "ScrollThumb" });
        // The inset map fills its frame (PFD-Map-bg); its range is the frame's half width.
        const frame = screenBox(screen, this.p.el("PFD-Map-bg"));
        const half = Math.min(frame.width, frame.height) / 2;
        this.insetGeom = { x: frame.x, y: frame.y, w: frame.width, h: frame.height, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, px: half };
        // Both go over the frame's black fill, before the same node, so the pan layer lands above the map.
        const above = this.p.el("PFD-Map-Display").nextElementSibling;
        this.inset = mapGroup(screen, above, this.insetGeom);
        this.panLayer = mapGroup(screen, above, this.insetGeom);
        // TMR/REF and ALERTS open where FG1000 puts the NRST window.
        this.winBox = screenBox(screen, this.nrst.el("Group"));
        this.win = screen.appendChild(document.createElementNS(NS, "g"));
        // v13 trainer: the VSI scale reads 1 and 2 (thousand fpm) where FG1000's reads 2 and 4 (see vsi.ts).
        for (const [id, t] of [["text4659", "1"], ["text4659-6", "1"], ["text4659-7", "2"], ["text4659-7-9", "2"]]) {
            const e = screen.querySelector(`[id="${id}"]`);
            const label = e?.querySelector("tspan") ?? e;
            if (label)
                label.textContent = t;
        }
        // Minimums bug: the selected altitude bug, in cyan.
        const bug = this.p.el("SelectedALT-bug");
        this.minBug = bug.cloneNode(true);
        for (const e of [this.minBug, ...this.minBug.querySelectorAll("*")]) {
            e.removeAttribute("id");
            e.style.fill = "#00ffff";
        }
        bug.parentNode.parentNode.appendChild(this.minBug); // outside SelectedALT, which hides with no selected altitude
        this.clock = setInterval(() => this.tick(), 1000);
        for (const id of HIDDEN)
            this.p.show(id, false);
        // FG1000 raises the failure flags with a z-index; in SVG they come first, so move them over the instruments.
        const flags = this.p.el("Failures");
        flags?.parentNode?.appendChild(flags);
        const typo = screen.querySelector('[id="tspan6977"]'); // FG1000 spells it ATTIUDE
        if (typo)
            typo.textContent = "ATTITUDE FAIL";
        // AHRS alignment (Pilot's Guide): the red X with AHRS ALIGN and a keep wings level line in yellow. FG1000 has no
        // alignment annunciation, so this box is our own, drawn where its ATTITUDE FAIL text is.
        this.alignText = screen.querySelector('[id="text6974"]');
        this.alignBox = this.p.el("NoAttitude").appendChild(document.createElementNS(NS, "g"));
        this.alignBox.innerHTML = `<rect x="364.5" y="200" width="190" height="56" fill="#000000"/>` +
            `<text x="459.5" y="222" text-anchor="middle" ${FONT} fill="#ffcf00">AHRS ALIGN:</text>` +
            `<text x="459.5" y="246" text-anchor="middle" ${FONT} fill="#ffcf00">Keep Wings Level</text>`;
        this.startup = new Startup(options.startup ?? AHRS_ALIGN_S, () => {
            this.set({});
            if (!this.startup.aligning)
                this.options.onChange?.({ aligning: false });
        });
        for (const [id, r] of Object.entries(CLIPS))
            this.p.clip(id, r);
        this.ladderWindow();
        this.p.el("HDG")?.setAttribute("transform", `translate(0 ${-HDG_LIFT})`);
        this.speedStrip(options.speedRanges ?? SPEEDS_172S);
        // Reversionary mode: the engine strip on a black backing over the horizon, OAT and the inset map moved for it.
        this.eis = new Page(screen, "EIS");
        const strip = screenBox(screen, this.eis.el("Group"));
        this.eisBack = document.createElementNS(NS, "rect");
        for (const [a, v] of [["x", 0], ["y", strip.y], ["width", strip.x + strip.width], ["height", strip.height], ["fill", "#000000"]])
            this.eisBack.setAttribute(a, String(v));
        this.eis.el("Group").parentNode.insertBefore(this.eisBack, this.eis.el("Group"));
        this.rev = reversionaryLayout(screenBox(screen, this.p.el("TAS")), screenBox(screen, this.p.el("OAT")), frame);
        // Autopilot annunciations start blank, as Surround.new() leaves them.
        for (const id of AFCS)
            this.surround.p.text(`Header${id}`, "");
        // Flashing AFCS annunciations (FG1000 draws none).
        svg.appendChild(document.createElementNS(NS, "style")).textContent =
            ".gcw-flash{animation:gcw-flash 1s steps(1) infinite}@keyframes gcw-flash{50%{visibility:hidden}}";
        if (options.bezel)
            this.unbezel = bezelInput(svg, (i) => this.input(i), options.afcsKeys ?? false);
        // FG1000 draws the turn rate scale but never drives it; the trend vector is drawn here.
        const scale = this.p.el("turnrate-indicator");
        this.turnTrend = scale.parentNode.insertBefore(document.createElementNS(NS, "path"), scale.nextSibling);
        for (const [k, v] of Object.entries({ fill: "none", stroke: MAGENTA, "stroke-width": "5" }))
            this.turnTrend.setAttribute(k, v);
        this.turnArrow = scale.parentNode.insertBefore(document.createElementNS(NS, "path"), this.turnTrend.nextSibling);
        this.turnArrow.setAttribute("fill", MAGENTA);
        // Pilot's Guide: ticks each side of the lubber line at half-standard and standard rate (9° and 18° in 6 s). FG1000
        // draws the band only.
        const ticks = [-18, -9, 9, 18].map((deg) => `M ${turnAt((deg * Math.PI) / 180, TURN.r0)} L ${turnAt((deg * Math.PI) / 180, TURN.r1)}`);
        const tickPath = scale.parentNode.insertBefore(document.createElementNS(NS, "path"), this.turnTrend); // the trend vector over the ticks
        for (const [k, v] of Object.entries({ d: ticks.join(" "), stroke: "#ffffff", "stroke-width": "2" }))
            tickPath.setAttribute(k, v);
        this.set({});
    }
    // Turn rate trend vector: the heading 6 seconds ahead, along the arc above the compass rose, through the ticks.
    // The scale spans about 24° each side, so standard rate (3°/s) reaches 18°.
    updateTurnRate(rate) {
        const v = turnVector(rate);
        this.turnTrend.setAttribute("d", v.arc);
        this.turnArrow.setAttribute("d", v.arrow);
    }
    /** True while the AHRS aligns at power-up: attitude is invalid, so a host holds the autopilot off (`failed.attitude`
     * to `Afcs.update`). `onChange` reports `aligning: false` when it ends. */
    get aligning() {
        return this.startup.aligning;
    }
    /** Stops the clock. Call when the display is removed. */
    destroy() {
        clearInterval(this.clock);
        this.startup.stop();
        this.timers.forEach(clearTimeout);
        this.idle.stop();
        this.surround.destroy();
        this.unbezel();
    }
    input(i) {
        this.options.onInput?.(i);
        const u = this.ui;
        if (this.ua && uaIgnores(i.control, u.window))
            return;
        switch (i.control) {
            case "NAV_TOGGLE":
            case "COM_TOGGLE":
                this.surround.toggle(i.control === "NAV_TOGGLE" ? "nav" : "com");
                return this.set({});
            case "SOFTKEY":
                this.menu()[i.value - 1]?.act?.();
                return this.set({});
            case "RANGE":
                if (u.inset && u.pan)
                    u.pan = panTarget(u.pan, this.panView());
                if (u.inset)
                    u.insetRange = stepRange(u.insetRange, i.value);
                return this.set({});
            case "JOYSTICK_PRESS":
                // Pilot's Guide: the joystick push shows the map pointer; again removes it and recenters on the aircraft.
                // NXi pans the PFD inset map the same way.
                if (u.inset)
                    u.pan = u.pan ? null : panStart(this.state);
                return this.set({});
            case "JOYSTICK_HORIZONTAL":
            case "JOYSTICK_VERTICAL": {
                if (!u.inset || !u.pan)
                    return;
                const h = i.control === "JOYSTICK_HORIZONTAL";
                u.pan = panMove(u.pan, h ? i.value : 0, h ? 0 : i.value, this.panView());
                this.idle.moved();
                return this.set({});
            }
            case "FMS_OUTER":
            case "FMS_INNER":
                return this.fms(i.control === "FMS_OUTER", i.value > 0 ? 1 : -1);
            case "CHAR": {
                // A typed key: one clockwise turn of the small knob, which the identifier under the cursor takes as the key.
                const on = u.window === "DTO" ? this.dtoEntry.editing || !u.dto.act : u.window === "PROC" ? this.proc.typing() : u.window === "TOOL" && this.tool.typing();
                if (!on)
                    return;
                IdEntry.typed = String.fromCharCode(i.value);
                try {
                    this.fms(false, 1);
                }
                finally {
                    IdEntry.typed = null; // never left for a later turn of the knob
                }
                return;
            }
            case "MENU":
                // v13 trainer: MENU shows the PFD SETUP MENU, or with the flight plan window open its PAGE MENU; MENU again
                // closes it (the trainer then opens its DEMO MODE page, a simulator setting, not ported).
                // Pilot's Guide: in the DIRECT TO window MENU shows that window's menu.
                if (u.window === "SETUP" || u.window === "MENU")
                    u.window = u.window === "MENU" && u.menuOf === "DTO" ? "DTO" : null;
                else if (u.window === "DTO" || u.fpl) {
                    u.menuOf = u.window === "DTO" ? "DTO" : "FPL";
                    [u.window, u.cursor] = ["MENU", firstOption(this.pageMenu().map(on))];
                }
                else
                    u.window = "SETUP";
                return this.set({});
            case "FMS_CRSR":
                if (u.window === "SETUP" || u.window === "MENU" || u.window === "TOOL")
                    u.window = null;
                return this.set({});
            case "ENT":
                if (u.window === "TOOL") {
                    const r = this.tool.ent(this.state);
                    if (r.close)
                        u.window = null;
                    if (r.patch)
                        this.change(r.patch);
                    return this.set({});
                }
                if (u.window === "MENU") {
                    const o = this.pageMenu()[u.cursor];
                    if (o?.tool) {
                        this.tool.open(o.tool, this.state);
                        u.window = "TOOL";
                        return this.set({});
                    }
                    if (o?.patch) {
                        u.window = null;
                        // The whole patch, so a host sharing it with the MFD also clears its direct-to and vector-to-final.
                        this.change(o.patch);
                    }
                }
                if (u.window === "NRST" && this.nearest().length)
                    u.nrstInfo = !u.nrstInfo;
                if (u.window === "TMR/REF")
                    this.timerAction();
                if (u.window === "DTO")
                    this.dtoEnt();
                else if (u.window === "PROC")
                    this.proc.ent();
                return this.set({});
            case "CLR":
                if (u.window === "NRST" && u.nrstInfo)
                    u.nrstInfo = false;
                else if (u.window === "DTO" && this.dtoEntry.editing)
                    this.dtoEntry.cancel();
                else if (u.window === "PROC")
                    this.proc.clr();
                else if (u.window === "MENU" && u.menuOf === "DTO")
                    u.window = "DTO";
                else if (u.window === "TOOL")
                    u.window = this.tool.clr() ? null : u.window;
                else if (u.window)
                    u.window = null;
                return this.set({});
            case "DTO": {
                // v13 trainer: DIRECT TO opens its window in the NRST window's place, on the active waypoint; DTO again closes it.
                // Pilot's Guide: the destination can come from the map pointer.
                const s = this.state;
                const act = s.route[s.activeLeg];
                const named = [...s.points, ...s.route.filter((r) => typeof r !== "string")];
                const under = u.pan ? panInfo(u.pan, this.panView(), s, named, s.magVar).label : "MAP POINTER";
                const id = under !== "MAP POINTER" ? under : typeof act === "string" ? act : act?.id ?? null;
                this.openWindow("DTO");
                u.dto = { id, act: !!id && !!findPoint(this.state, id) };
                this.dtoEntry.cancel();
                return this.set({});
            }
            case "PROC":
                // v13 trainer: PROC opens the PROCEDURES window where DIRECT TO opens; PROC again closes it.
                this.openWindow("PROC");
                if (u.window === "PROC")
                    this.proc.open();
                return this.set({});
            case "FPL":
                // PFDInstrumentsController.handleFPL: shows or hides the flight plan window.
                u.fpl = !u.fpl;
                if (!u.fpl && ((u.window === "MENU" && u.menuOf === "FPL") || u.window === "TOOL"))
                    u.window = null;
                return this.set({});
        }
        const src = this.state.cdiSource;
        const toStation = src === `NAV${this.surround.sel.nav}` ? this.state.bearings[src]?.bearing : null;
        const patch = adjust(i, this.state, this.surround.sel, toStation);
        if (patch)
            this.change(patch);
    }
    /** Apply a change the pilot made and report it. */
    change(patch) {
        this.set(patch);
        this.options.onChange?.(patch);
    }
    go(menu) {
        this.ui.menu = menu;
    }
    openWindow(w) {
        this.ui.window = this.ui.window === w ? null : w;
        this.ui.cursor = 0;
        this.ui.nrstInfo = false;
    }
    // The softkey menus: PFDInstruments.topMenu, insetMenu, PFDMenu, windMenu, transponderMenu, codeMenu. FG1000 leaves
    // SYN VIS, HSI FRMT, ALT UNIT, OBS, TMR/REF and ALERTS as TODO; they follow the real unit here.
    menu() {
        const u = this.ui;
        const s = this.state;
        u.alertsSeen = seenAlerts(s.alerts, u.alertsSeen, u.window === "ALERTS");
        const a = alertsKey(s.alerts, u.alertsSeen);
        // shortcut: the trainer flashes ADVISORY; it is lit steadily here, flash once there is a blink timer.
        const alerts = k(a.label, () => this.openWindow("ALERTS"), u.window === "ALERTS" || a.unread);
        const back = (to) => k("BACK", () => this.go(to));
        const toggle = (set, name) => k(name, () => (set[name] = !set[name]), set[name]);
        // Pilot's Guide: in an unusual attitude the removed items' softkeys are disabled. The top level shows, dimmed where
        // they are; the submenu comes back as the attitude recovers.
        const off = (key) => (this.ua ? dimKey(key.label) : key);
        switch (this.ua ? "top" : u.menu) {
            case "top": {
                const cdi = ["GPS", "NAV1", "NAV2"];
                // v13 trainer: OBS is dim with no flight plan (FG1000 always offers it); while on, it stays so it can be turned off.
                // Pilot's Guide (FG1000 has no SUSP): suspended at the missed approach point the key reads SUSP, lit, and sequences
                // onto the missed approach from the MAP; with no missed approach it stays suspended.
                return [
                    s.reversionary ? k("ENGINE", () => this.go("engine")) : blank,
                    off(k("INSET", () => { u.inset = true; this.go("inset"); })), blank, off(k("PFD", () => this.go("pfd"))),
                    s.susp ? k("SUSP", () => { const p = missedPatch(s.route, null); if (p)
                        this.change(p); }, true)
                        : s.route.length || s.obs ? k("OBS", () => this.change({ obs: !s.obs }), s.obs) : dimKey("OBS"),
                    // PFDInstrumentsController.incrCDISource: GPS, NAV1, NAV2.
                    k("CDI", () => this.change({ cdiSource: cdi[(cdi.indexOf(s.cdiSource) + 1) % 3] })),
                    k("DME", () => this.openWindow("DME"), u.window === "DME"), off(k("XPDR", () => this.go("xpdr"))), off(k("IDENT", () => this.ident())),
                    off(k("TMR/REF", () => this.openWindow("TMR/REF"), u.window === "TMR/REF")),
                    off(k("NRST", () => this.openWindow("NRST"), u.window === "NRST")), alerts,
                ];
            }
            case "inset":
                // v13 trainer layout (FG1000: OFF, DCLTR, -, TRAFFIC, TOPO, TERRAIN). Keys for data GCW has no source for are dim;
                // DCLTR stays working although the trainer dims it.
                return [
                    k("OFF", () => { u.inset = false; this.go("top"); }), k(DCLTR[u.dcltr], () => (u.dcltr = (u.dcltr + 1) % 4)), dimKey("WX LGND"),
                    toggle(u.layers, "TRAFFIC"), dimKey("TOPO"), dimKey("TERRAIN"), blank, dimKey("PRECIP"), blank, dimKey("METAR"), back("top"), alerts,
                ];
            case "pfd": {
                const next = (b) => BRG_SOURCES[(BRG_SOURCES.indexOf(b) + 1) % BRG_SOURCES.length];
                return [
                    k("SYN VIS", () => this.go("synvis")), k("DFLTS", () => this.defaults()), k("WIND", () => this.go("wind")),
                    k("DME", () => (u.dme = !u.dme), u.dme), // v13 trainer: the DME window (FG1000 has the artwork, no key)
                    k("BRG1", () => this.change({ brg1: next(s.brg1) }), s.brg1 !== "OFF"), k("HSI FRMT", () => this.go("hsi")),
                    k("BRG2", () => this.change({ brg2: next(s.brg2) }), s.brg2 !== "OFF"), blank, k("ALT UNIT", () => this.go("altunit")),
                    k("STD BARO", () => this.change({ baro: 29.92 })), back("top"), alerts,
                ];
            }
            case "wind": {
                const opt = (label, n) => k(label, () => (u.wind = n), u.wind === n);
                return [blank, blank, opt("OPTN1", 1), opt("OPTN2", 2), opt("OPTN3", 3), opt("OFF", 0), blank, blank, blank, blank, back("pfd"), alerts];
            }
            case "synvis":
                // shortcut: no terrain data, so these switch only the setting (onInput reports the key); draw synthetic vision once there is a terrain source.
                return [toggle(u.synvis, "PATHWAY"), toggle(u.synvis, "SYN TERR"), toggle(u.synvis, "HRZN HDG"), toggle(u.synvis, "APTSIGNS"),
                    blank, blank, blank, blank, blank, blank, back("pfd"), alerts];
            case "hsi":
                // shortcut: only the 360° HSI is drawn; ARC HSI needs its own artwork.
                return [blank, blank, blank, blank, blank, k("360 HSI", undefined, true), blank, blank, blank, blank, back("pfd"), alerts];
            case "altunit":
                return [blank, blank, blank, blank, blank, k("METERS", () => (u.meters = !u.meters), u.meters), blank,
                    k("IN", () => (u.hpa = false), !u.hpa), k("HPA", () => (u.hpa = true), u.hpa), blank, back("pfd"), alerts];
            case "xpdr": {
                const mode = (m) => k(m, () => this.change({ xpdr: { ...s.xpdr, mode: m } }), s.xpdr.mode === m);
                return [blank, blank, mode("STBY"), mode("ON"), mode("ALT"), mode("GND"),
                    k("VFR", () => this.change({ xpdr: { ...s.xpdr, code: "1200" } })), k("CODE", () => this.go("code")),
                    k("IDENT", () => this.ident()), blank, back("top"), alerts];
            }
            case "engine":
            case "lean":
            case "system":
                return [...engineKeys(u.menu, (m) => () => this.go(m)), back(u.menu === "engine" ? "top" : "engine"), alerts]; // reached only from ENGINE
            case "code":
                return [...[0, 1, 2, 3, 4, 5, 6, 7].map((d) => k(String(d), () => this.xpdrDigit(String(d)))),
                    k("IDENT", () => this.ident()), k("BKSP", () => this.xpdrDigit("BKSP")), back("xpdr"), alerts];
        }
    }
    // PFDInstrumentsController.setTransponderDigit: four digits set the code; BKSP takes one back.
    xpdrDigit(d) {
        const u = this.ui;
        const code = d === "BKSP" ? (u.xpdrEdit ?? "").slice(0, -1) : (u.xpdrEdit ?? "") + d;
        if (code.length === 4) {
            u.xpdrEdit = null;
            this.go("top");
            this.change({ xpdr: { ...this.state.xpdr, code } });
        }
        else {
            u.xpdrEdit = code;
            this.later(45, () => { u.xpdrEdit = null; }); // transponderEditResetTimer
        }
    }
    // setTransponderIdent: IDNT for 18 seconds; cancels a code entry and returns to the top menu.
    ident() {
        this.ui.xpdrEdit = null;
        this.go("top");
        this.change({ xpdr: { ...this.state.xpdr, ident: true } });
        this.later(18, () => this.change({ xpdr: { ...this.state.xpdr, ident: false } }));
    }
    later(sec, f) {
        this.timers.push(setTimeout(() => { f(); this.set({}); }, sec * 1000));
    }
    defaults() {
        Object.assign(this.ui, { inset: false, wind: 0, meters: false, hpa: false, dcltr: 0 });
        for (const set of [this.ui.layers, this.ui.synvis])
            for (const k of Object.keys(set))
                set[k] = false;
        this.change({ brg1: "OFF", brg2: "OFF" });
    }
    nearest() {
        const s = this.state;
        return nearest(s.airports, s.lat, s.lon, s.magVar).map((n) => ({ ...n, a: n.item }));
    }
    // FMS knob in a window: the outer ring moves the cursor, the inner changes the field (NRST: both scroll the list).
    /** The PAGE MENU options, the flight plan's or the DIRECT TO window's; those without `patch` or `tool` are dim. */
    // Create ATK Offset Waypoint and Hold At Waypoint need the waypoint under a cursor, which this flight plan window does
    // not have yet (dim here; they work on the MFD). Hold At Present Position works.
    pageMenu() {
        if (this.ui.menuOf === "DTO")
            return [{ label: "Cancel Direct-To NAV", patch: cancelDirectTo(this.state) }];
        return fplMenu(this.state.route, this.state.activeLeg).map((o) => {
            const t = o.label;
            return FPL_TOOLS.includes(t) ? { label: o.label, tool: toolEnabled(t, this.state, null) ? t : undefined } : o;
        });
    }
    fms(outer, d) {
        const u = this.ui;
        if (u.window === "MENU")
            u.cursor = stepMenu(this.pageMenu().map(on), u.cursor, d);
        if (u.window === "TOOL")
            this.tool.fms(this.state, outer, d);
        if (u.window === "NRST" && !u.nrstInfo)
            u.cursor = clamp(u.cursor + d, 0, Math.max(0, this.nearest().length - 1));
        // shortcut: no HOLD mode; add it when a scenario needs DME hold.
        if (u.window === "DME" && !outer)
            u.dmeSource = u.dmeSource === "NAV1" ? "NAV2" : "NAV1";
        if (u.window === "PROC")
            this.proc.fms(outer, d);
        if (u.window === "DTO") {
            // As the MFD's DIRECT TO: the inner knob spells the identifier, the outer moves to ACTIVATE?.
            const e = this.dtoEntry;
            if (e.editing)
                outer ? e.outer(d) : e.inner(d);
            else if (outer)
                u.dto.act = d > 0 && !!this.dtoPoint();
            else if (!u.dto.act)
                e.inner(d);
        }
        if (u.window === "TMR/REF") {
            if (outer)
                u.cursor = mod(u.cursor + d, TMR_FIELDS.length);
            else
                this.timerField(d);
        }
        this.set({});
    }
    dtoPoint() {
        const id = this.ui.dto.id;
        return id ? findPoint(this.state, id) : undefined;
    }
    // ENT in DIRECT TO: takes the spelled identifier, then moves to ACTIVATE?, then flies direct.
    dtoEnt() {
        const u = this.ui;
        const e = this.dtoEntry;
        if (e.editing) {
            const id = e.ent();
            if (id)
                u.dto = { id, act: !!findPoint(this.state, id) };
            return;
        }
        const p = this.dtoPoint();
        if (!u.dto.act)
            u.dto.act = !!p;
        else if (p) {
            u.window = null;
            this.change(directToPatch(this.state, p));
        }
    }
    timerValue() {
        const t = this.ui.timer;
        const run = t.running ? (Date.now() - t.since) / 1000 : 0;
        return Math.max(0, t.up ? t.base + run : t.base - run);
    }
    // The inner FMS knob on a TMR/REF field (TMR_FIELDS order).
    timerField(d) {
        const u = this.ui;
        const t = u.timer;
        const s = this.state;
        switch (TMR_FIELDS[u.cursor]) {
            case "time":
                if (!t.running)
                    t.base = Math.max(0, t.base + d * 60);
                break;
            case "dir":
                t.base = this.timerValue();
                t.since = Date.now();
                t.up = !t.up;
                break;
            case "action": break;
            case "minimums":
                this.change({ minimums: s.minimums === null ? Math.round(s.alt / 100) * 100 : null });
                break;
            case "minalt":
                if (s.minimums !== null)
                    this.change({ minimums: stepBaro(s.minimums, d) });
                break;
            default: {
                const v = TMR_FIELDS[u.cursor];
                this.change({ vspeedsOn: { ...s.vspeedsOn, [v]: !s.vspeedsOn[v] } });
            }
        }
    }
    // ENT on the timer's action field: START?, STOP?, RESET?.
    timerAction() {
        const t = this.ui.timer;
        if (TMR_FIELDS[this.ui.cursor] !== "action")
            return;
        if (t.running)
            Object.assign(t, { base: this.timerValue(), running: false });
        else if (t.base > 0 && t.up)
            t.base = 0;
        else
            Object.assign(t, { running: true, since: Date.now() });
    }
    timerLabel() {
        const t = this.ui.timer;
        return t.running ? "STOP?" : t.base > 0 && t.up ? "RESET?" : "START?";
    }
    tick() {
        const t = this.ui.timer;
        if (t.running && !t.up && this.timerValue() === 0)
            Object.assign(t, { up: true, base: 0, since: Date.now() }); // counts down to zero, then up
        this.updateXpdr();
        if (this.ui.window === "TMR/REF")
            this.drawWindow();
    }
    /** Merge new values into the state and redraw. */
    set(patch) {
        const s = (this.state = { ...this.state, ...patch });
        // SUSP as the aircraft passes the missed approach point, reported after the redraw; a host's own `susp` is not echoed back.
        const report = suspended(s) !== s.susp && !("susp" in patch);
        s.susp = suspended(s);
        // Unusual attitude declutter, undone as the attitude recovers. Bearing information, the DME window and ALERTS stay
        // (Pilot's Guide: the Bearing Information, Alerts and Annunciation windows can be displayed).
        this.ua = unusualAttitude(s.pitch, s.roll);
        this.p.hidden = this.ua ? UA_HIDDEN : new Set();
        this.surround.p.hidden = this.ua ? AFCS_HIDDEN : new Set();
        for (const id of UA_ALWAYS)
            this.p.show(id, true);
        for (const id of AFCS)
            this.surround.p.show(`Header${id}`, true);
        this.updateAI(s.pitch, s.roll, s.slip);
        this.updateFD(s);
        this.updateAfcs(s.afcs, s.ias);
        this.updateIAS(s.ias, s.iasTrend);
        this.updateVSI(s.vsi);
        this.p.text("TAS-text", `${Math.round(s.tas)}KT`);
        this.updateALT(s.alt, s.altTrend, s.selectedAlt);
        this.p.show("SelectedALT", s.selectedAlt !== null);
        this.p.show("SelectedALT-bug", s.selectedAlt !== null);
        if (s.selectedAlt !== null)
            this.p.text("SelectedALT-text", String(Math.round(s.selectedAlt)));
        this.p.text("BARO-text", this.ui.hpa ? `${Math.round(s.baro * 33.8639)}HPA` : `${s.baro.toFixed(2)}IN`);
        this.p.show("SelectedALT-meters", this.ui.meters && s.selectedAlt !== null);
        if (this.ui.meters && s.selectedAlt !== null)
            this.p.text("SelectedALT-meters", `${Math.round(s.selectedAlt * 0.3048)}M`);
        this.minBug.style.display = s.minimums === null ? "none" : "inline";
        if (s.minimums !== null)
            this.minBug.setAttribute("transform", `translate(0 ${clamp(s.alt - s.minimums, -300, 300) * 0.567})`);
        this.p.text("OAT-text", Math.abs(s.oat) < 10 ? `${s.oat.toFixed(1)} °C` : `${Math.trunc(s.oat)} °C`);
        this.p.tf("Rose", { rot: -s.heading });
        this.updateTurnRate(s.turnRate);
        this.p.text("HDG-text", deg3(s.heading));
        this.p.tf("Heading-bug", { rot: s.headingBug });
        this.p.text("SelectedHDG-text", deg3(s.headingBug));
        // The start-up's invalid instruments draw as failures; while aligning the attitude area has no horizon and shows the
        // alignment box instead of ATTITUDE FAIL.
        const failed = { ...s.failed, ...this.startup.failed };
        for (const [f, id] of FAILURES)
            this.p.show(id, !!failed[f]);
        const aligning = this.startup.aligning;
        this.p.show("Horizon", !aligning);
        this.alignBox.style.display = aligning ? "inline" : "none";
        this.alignText.style.display = aligning ? "none" : "inline";
        this.surround.setFailed(failed);
        this.p.show("DME1", this.ui.dme);
        if (this.ui.dme) {
            const src = this.ui.dmeSource;
            this.p.text("DME1-SRC-text", src);
            this.p.text("DME1-FREQ-text", s.radios[src === "NAV1" ? "nav1" : "nav2"].active.toFixed(2));
            this.p.text("DME1-DST-text", dmeText(s.bearings[src]));
        }
        this.setCDISource(s.cdiSource, cdiLabel(s.cdiSource, s.radios));
        this.p.text("SelectedCRS-text", deg3(s.course), s.cdiSource === "GPS" ? MAGENTA : GREEN);
        this.p.text("SelectedCRS-bgtext", s.cdiSource === "GPS" ? "DTK" : "CRS"); // v13 trainer: DTK on GPS (FG1000: always CRS)
        this.updateCDI(s);
        this.p.show("GS-ILS", s.gs !== null);
        this.p.show("GS-type", s.gs !== null);
        if (s.gs !== null) {
            this.p.tf("GS-ILS", { ty: -s.gs * 100 });
            this.p.text("GS-type", "G");
        }
        this.updateBRG("BRG1", s.brg1, s);
        this.updateBRG("BRG2", s.brg2, s);
        this.p.show("BRG-circle", s.brg1 !== "OFF" || s.brg2 !== "OFF");
        this.p.show("OMI", s.marker !== "");
        this.p.text("MarkerText", s.marker);
        this.surround.setRadios(s.radios, s.cdiSource === "NAV1" ? 1 : s.cdiSource === "NAV2" ? 2 : null);
        this.surround.setVolume("Nav", s.navVolume);
        this.surround.setVolume("Comm", s.comVolume);
        this.updateReversionary(s); // before the softkeys: it can leave an engine menu
        const keys = this.menu();
        this.surround.setSoftkeys(keys.map((k) => k.label), keys.map((k) => !!k.lit), keys.map((k) => !!k.dim));
        this.updateLeg(s.leg);
        this.updateXpdr();
        this.updateWind(s);
        this.updateInset(s);
        this.updateNrst();
        this.updateFlightPlan(s);
        this.drawWindow();
        if (report)
            this.options.onChange?.({ susp: s.susp });
    }
    // setFlightPlan / updateFlightPlan: the flight plan window, shown by FPL while there is a flight plan. The arrow marks
    // the active waypoint; legs already flown show blanks.
    updateFlightPlan(s) {
        const on = this.ui.fpl && !this.ua;
        const legs = on ? s.route.map((r) => routePoint(r, s.points, s.airports)) : [];
        this.fpl.show("Group", legs.length > 0);
        if (!legs.length)
            return;
        const rows = legs.map((p, i) => {
            const prev = legs[i - 1];
            const leg = prev && p ? bearingDistance(prev.lat, prev.lon, p.lat, p.lon) : null;
            const flown = i < s.activeLeg;
            if (p?.hold) {
                const h = holdRow(p.hold);
                return { ID: h.Leg, Type: "", DTK: h.DTK, DIS: h.DIS };
            }
            return {
                ID: (p?.id ?? String(s.route[i])).slice(0, 7),
                Type: (p?.role ?? "").slice(0, 4).toLowerCase(), // v13 trainer: faf, map (FG1000 has no roles)
                DTK: flown ? "___°" : leg ? deg3(leg.brg - s.magVar) : "",
                DIS: flown ? "___nm" : leg ? `${leg.dist.toFixed(1)}nm` : "",
            };
        });
        this.fplRows.sel = s.activeLeg;
        this.fplRows.draw(rows, false, this.hl);
        this.fpl.text("Name", planName(legs));
    }
    // updateTransponder and updateTime: white in OFF, STBY, TEST; green in GND, ON, ALT. A code being entered shows
    // what is typed so far.
    updateXpdr() {
        const x = this.state.xpdr;
        const color = ["GND", "ON", "ALT"].includes(x.mode) ? "#33ff33" : "#ffffff";
        this.p.text("XPDR-MODE-text", x.ident ? "IDNT" : x.mode, color);
        const code = this.ui.xpdrEdit === null ? x.code.padStart(4, "0") : this.ui.xpdrEdit.padEnd(4, " ");
        for (let i = 0; i < 4; i++)
            this.p.text(`XPDR-DIGIT-${3 - i}-text`, code[i], color);
        const now = new Date();
        const t = this.state.time ?? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const p2 = (n) => String(Math.floor(n)).padStart(2, "0");
        this.p.text("TIME-text", `${p2(mod(t / 3600, 12))}:${p2(mod(t / 60, 60))}:${p2(mod(t, 60))}`); // FG1000 shows 12 hours
    }
    // setWindDisplay and updateWindData.
    updateWind(s) {
        const opt = this.ui.wind;
        this.p.show("WindData", opt !== 0);
        for (const n of [1, 2, 3])
            this.p.show(`WindData-OPTN${n}`, opt === n && !!s.wind);
        this.p.show("WindData-NODATA", opt !== 0 && !s.wind);
        this.p.show("WindData-NODATA-bg", opt !== 0 && !s.wind);
        if (!opt || !s.wind)
            return;
        let { direction, speed } = s.wind;
        let alpha = direction - s.heading;
        if (speed < 1)
            alpha = direction = 0; // stops the arrows wandering in a calm
        if (opt === 1) {
            const cross = speed * Math.sin((alpha * Math.PI) / 180);
            const head = speed * Math.cos((alpha * Math.PI) / 180);
            this.p.text("WindData-OPTN1-crosswind-text", String(Math.trunc(Math.abs(cross))));
            this.p.tf("WindData-OPTN1-crosswind", { rot: cross > 0.1 ? 180 : 0 });
            this.p.text("WindData-OPTN1-headwind-text", String(Math.trunc(Math.abs(head))));
            this.p.tf("WindData-OPTN1-headwind", { rot: head > 0.1 ? 180 : 0 });
        }
        else if (opt === 2) {
            this.p.tf("WindData-OPTN2-HDG", { rot: alpha + 180 });
            this.p.text("WindData-OPTN2-SPD-text", String(Math.trunc(speed)));
        }
        else {
            this.p.tf("WindData-OPTN3-HDG", { rot: alpha + 180 });
            this.p.text("WindData-OPTN3-HDG-text", `${pad(Math.trunc(mod(direction, 360)), 3, "0")}°T`);
            this.p.text("WindData-OPTN3-SPD-text", `${Math.trunc(speed)}KT`);
        }
    }
    updateReversionary(s) {
        const on = s.reversionary;
        this.eis.show("Group", on);
        this.eisBack.style.display = on ? "inline" : "none";
        if (on)
            drawEis(this.eis, s.engine);
        const move = (id, d) => this.p.el(id)?.setAttribute("transform", on ? `translate(${d.dx} ${d.dy})` : "");
        move("OAT", this.rev.oat);
        move("PFD-Map", this.rev.inset);
        if (!on && ENGINE_MENUS.includes(this.ui.menu))
            this.ui.menu = "top";
    }
    // setInsetMapVisible and the inset NavMap: north up, the range on the RANGE knob.
    updateInset(s) {
        const u = this.ui;
        const on = u.inset && !this.ua;
        for (const id of ["PFD-Map", "PFD-Map-bg", "PFD-Map-bg-1"])
            this.p.show(id, on);
        if (!u.inset)
            u.pan = null;
        this.idle.sync(!!u.pan);
        this.inset.style.display = on ? "inline" : "none";
        this.panLayer.style.display = on && u.pan ? "inline" : "none";
        if (!on)
            return;
        this.p.text("RangeDisplay", rangeLabel(u.insetRange));
        this.p.text("OrientationDisplay", "NORTH UP");
        drawMap(this.inset, { ...s, range: u.insetRange, orientation: "NORTH UP", center: u.pan?.center }, this.insetGeom, u.dcltr);
        if (u.pan) {
            const named = [...s.points, ...s.route.filter((r) => typeof r !== "string")];
            this.panLayer.innerHTML = panMarkup(u.pan, panInfo(u.pan, this.panView(), s, named, s.magVar), this.insetGeom, INSET_PAN_FONT);
        }
    }
    panView() {
        const g = this.insetGeom;
        return { w: g.w, h: g.h, scale: g.px / this.ui.insetRange, up: 0, lat: this.state.lat, bar: INSET_PAN_FONT * 2.7 };
    }
    // NearestAirportsPFD: three rows of the 25 nearest, scrolled with the FMS knob; ENT shows the selected airport.
    updateNrst() {
        const u = this.ui;
        const open = u.window === "NRST" && !this.ua;
        this.nrst.show("Group", open && !u.nrstInfo);
        this.nrst.show("Info", open && u.nrstInfo);
        if (!open)
            return;
        const list = this.nearest();
        const top = clamp(u.cursor - 1, 0, Math.max(0, list.length - 3));
        for (let row = 0; row < 3; row++) {
            const n = list[top + row];
            const cells = n
                ? { ID: n.a.id, BRG: `${Math.round(n.brg)}°`, DST: `${n.dist.toFixed(1)}nm`, APP: bestApproach(n.a), CommsType: nrstFreq(n.a)[0], CommsFreq: nrstFreq(n.a)[1], RWY: `${n.a.runways[0]?.length ?? 0}ft` }
                : { ID: row === 0 ? "NONE WITHIN 200NM" : "", BRG: "", DST: "", APP: "", CommsType: "", CommsFreq: "", RWY: "" };
            for (const [k, v] of Object.entries(cells))
                this.nrst.text(`${k}${row}`, v);
            this.hl.set(this.nrst.el(`ID${row}`), !!n && top + row === u.cursor);
        }
        const thumb = this.nrst.el("Scroll");
        if (thumb)
            this.nrst.tf("Scroll", { ty: list.length > 3 ? (top / (list.length - 3)) * 120 : 0 });
        const sel = list[u.cursor]?.a;
        if (u.nrstInfo && sel) {
            this.nrst.text("InfoID", sel.id);
            this.nrst.text("InfoName", sel.name.toUpperCase());
            this.nrst.text("InfoFacility", "");
            this.nrst.text("InfoUsage", "PUBLIC");
            this.nrst.text("InfoFacility", sel.city ?? "");
            this.nrst.text("InfoTime", "");
            this.nrst.text("InfoAlt", `${Math.round(sel.elev)}ft`);
            this.nrst.text("InfoRegion", "");
            this.nrst.text("InfoLat", latLon(sel.lat, "N", "S"));
            this.nrst.text("InfoLon", latLon(sel.lon, "E", "W"));
            this.nrst.text("InfoBack", "BACK");
            this.hl.set(this.nrst.el("InfoBack"), true);
        }
    }
    hl = new Highlighter();
    // TMR/REF (generic timer, speed references, minimums) and ALERTS, drawn in the NRST window's place. FG1000 has
    // these as TODO, so the layout follows the real unit.
    drawWindow() {
        const u = this.ui;
        const s = this.state;
        if (u.window === null || u.window === "NRST" || (this.ua && u.window !== "ALERTS" && u.window !== "DME")) {
            this.win.innerHTML = "";
            return;
        }
        const { x, y, width: w, height: h } = this.winBox;
        const rows = [];
        const end = w - 14;
        if (u.window === "TMR/REF") {
            // v13 trainer layout: titled REFERENCES, the timer on one row, GLIDE for the glide speed, minimums on one row.
            const t = Math.round(this.timerValue());
            const p2 = (n) => String(n).padStart(2, "0");
            rows.push({ label: "REFERENCES", cells: [], title: true });
            rows.push({ label: "TIMER", cells: [
                    { text: `${p2(Math.floor(t / 3600))}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`, field: "time", right: 160 },
                    { text: u.timer.up ? "UP" : "DN", field: "dir", right: 200 },
                    { text: this.timerLabel(), field: "action", right: end },
                ] });
            for (const v of VSPEEDS) {
                const spd = this.options.vspeeds?.[v];
                const name = v === "Vglide" ? "GLIDE" : v;
                rows.push({ label: `${name}  ${spd === undefined ? "---" : spd}KT`, cells: [{ text: s.vspeedsOn[v] ? "ON" : "OFF", field: v, right: end }] });
            }
            rows.push({ label: "MINIMUMS", cells: [
                    { text: s.minimums === null ? "OFF" : "BARO", field: "minimums", right: 180 },
                    { text: s.minimums === null ? MIN_BLANK : `${s.minimums}FT`, field: "minalt", right: end },
                ] });
        }
        else if (u.window === "DME") {
            // v13 trainer: DME TUNING, the NAV radio the DME window shows; the small FMS knob switches it.
            rows.push({ label: "DME TUNING", cells: [], title: true });
            rows.push({ label: "DME  MODE", cells: [{ text: u.dmeSource, field: "mode", right: end }] });
        }
        else if (u.window === "SETUP") {
            // v13 trainer: PFD SETUP MENU, the display brightness. shortcut: brightness is not ported, so it stays on AUTO.
            rows.push({ label: "PFD SETUP MENU", cells: [], title: true });
            rows.push({ label: "PFD DSPL", cells: [{ text: "AUTO", right: 150, cur: true }, { text: "100.00%", right: end }] });
            rows.push({ label: "MFD DSPL", cells: [{ text: "AUTO", right: 150 }, { text: "___._%", right: end }] });
        }
        else if (u.window === "DTO") {
            // v13 trainer layout: the identifier with its name and city, VNV altitude and offset, bearing, distance, course.
            const p = this.dtoPoint();
            const apt = p?.type === "APT" ? s.airports.find((a) => a.id === p.id) : undefined;
            const bd = p && bearingDistance(s.lat, s.lon, p.lat, p.lon);
            const crs = bd ? deg3(bd.brg - s.magVar) : "___°";
            const white = "#ffffff";
            rows.push({ label: "DIRECT TO", cells: [], title: true });
            rows.push({ label: "", cells: [{ text: this.dtoEntry.editing ? this.dtoEntry.value : p?.id ?? u.dto.id ?? "_____", right: 80, cur: !u.dto.act }] });
            rows.push({ label: (p?.name ?? "").toUpperCase(), cells: [] }, { label: (apt?.city ?? p?.city ?? "").toUpperCase(), cells: [] });
            rows.push({ label: "ALT", cells: [{ text: "_____FT", right: 120, cur: false }, { text: "OFFSET", right: end - 50, cur: false, color: white }, { text: "+0NM", right: end, cur: false }] });
            rows.push({ label: "BRG", cells: [{ text: crs, right: 100, cur: false }, { text: "DIS", right: end - 70, cur: false, color: white }, { text: bd ? `${bd.dist.toFixed(1)}NM` : "___NM", right: end, cur: false }] });
            rows.push({ label: "CRS", cells: [{ text: crs, right: 100, cur: false }] });
            rows.push({ label: "ACTIVATE?", cells: [], cur: u.dto.act });
        }
        else if (u.window === "PROC") {
            // v13 trainer: the MFD's PROCEDURES items, in the PFD's window.
            const f = this.proc;
            if (f.view === "menu") {
                rows.push({ label: "PROCEDURES", cells: [], title: true });
                PROC_MENU.forEach((m, i) => rows.push({ label: m, cells: [], color: f.enabled(i) ? CYAN : "#808080", cur: i === f.item }));
            }
            else if (f.view === "ask") {
                rows.push({ label: "- NOT APPROVED FOR GPS -", cells: [], title: true });
                for (const t of ["GPS guidance is for", "monitoring only.", "Activate approach?"])
                    rows.push({ label: t, cells: [] });
                rows.push({ label: "", cells: [{ text: "YES", right: 110, cur: f.yes }, { text: "NO", right: 190, cur: !f.yes }] });
            }
            else {
                const g = f.grp;
                const apt = s.airports.find((a) => a.id === f.airport);
                const procs = f.procs();
                rows.push({ label: { APR: "APPROACH", SID: "DEPARTURE", STAR: "ARRIVAL" }[f.kind], cells: [], title: true });
                rows.push({ label: "", cells: [{ text: this.procEntry.editing ? this.procEntry.value : f.airport ?? "____", right: 70, cur: g === "APT" }] });
                rows.push({ label: apt ? apt.name.toUpperCase() : "", cells: [] });
                rows.push({ label: "", cells: [{ text: procs[f.apr]?.name ?? "NONE", right: end, cur: g === "APR" && procs.length > 0 }] });
                const trans = { label: "TRANS", cells: [{ text: f.transitions()[f.trans] ?? "", right: end, cur: g === "TRANS" }] };
                const rwy = { label: "RWY", cells: [{ text: f.runways()[f.rwy] ?? "", right: end, cur: g === "RWY" }] };
                // Pilot's Guide: a departure's runway comes before its transition, an arrival's after.
                if (f.kind === "SID")
                    rows.push(rwy, trans);
                else if (f.kind === "STAR")
                    rows.push(trans, rwy);
                else {
                    rows.push(trans);
                    const min = minView(f.baro, g === "MIN", g === "MINALT");
                    rows.push({ label: "MINIMUMS", cells: [{ text: min.mode, right: 170, cur: min.cur }, { text: min.alt, right: end, cur: min.altCur }] });
                }
                rows.push({ label: "LOAD?", cells: [], cur: g === "LOAD" });
                if (f.kind === "APR")
                    rows.push({ label: "ACTIVATE?", cells: [], cur: g === "ACTIVATE" });
            }
        }
        else if (u.window === "MENU") {
            // v13 trainer: the flight plan's PAGE MENU; available options cyan, the rest grey, scrolling with the cursor.
            const opts = this.pageMenu();
            const shown = Math.max(1, Math.floor((h - 8) / 22) - 2);
            const top = firstRow(u.cursor, opts.length, shown);
            rows.push({ label: "PAGE MENU", cells: [], title: true }, { label: "OPTIONS", cells: [] });
            opts.slice(top, top + shown).forEach((o, i) => rows.push({ label: o.label, cells: [], color: on(o) ? CYAN : "#808080", cur: top + i === u.cursor }));
        }
        else if (u.window === "TOOL") {
            for (const r of this.tool.rows(s)) {
                const cells = r.value === undefined ? [] : [{ text: r.value, right: end, cur: !!r.cur }];
                rows.push({ label: r.label, cells, title: r.title, color: r.dim ? "#808080" : undefined, cur: !!r.cur && r.value === undefined });
            }
        }
        else {
            for (const a of s.alerts)
                rows.push({ label: a, cells: [] });
        }
        const line = Math.min(22, (h - 8) / Math.max(rows.length, 1));
        const width = (text) => text.length * 10 + 8; // shortcut: estimated text width for the cursor box
        let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" stroke="#ffffff" stroke-width="2"/>`;
        rows.forEach(({ label, cells, title, color, cur: on }, i) => {
            const ty = y + 6 + line * (i + 0.8);
            if (on)
                out += `<rect x="${x + 6}" y="${ty - line * 0.8}" width="${width(label)}" height="${line}" fill="${CYAN}"/>`;
            out += title
                ? `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" ${FONT} fill="#ffffff">${esc(label)}</text>`
                : `<text x="${x + 10}" y="${ty}" ${FONT} fill="${on ? "#000" : color ?? "#ffffff"}">${esc(label)}</text>`;
            for (const c of cells) {
                const cur = c.cur ?? ((u.window === "TMR/REF" && TMR_FIELDS[u.cursor] === c.field) || c.field === "mode");
                if (cur)
                    out += `<rect x="${x + c.right - width(c.text) + 4}" y="${ty - line * 0.8}" width="${width(c.text)}" height="${line}" fill="${CYAN}"/>`;
                out += `<text x="${x + c.right}" y="${ty}" text-anchor="end" ${FONT} fill="${cur ? "#000" : c.color ?? CYAN}">${esc(c.text)}</text>`;
            }
        });
        this.win.innerHTML = out;
    }
    // Surround.updateHeaderData, PFD half.
    updateLeg(leg) {
        const sp = this.surround.p;
        sp.text("HeaderTo", leg?.to ?? "");
        sp.text("HeaderFrom", leg?.from ?? "");
        sp.show("HeaderActiveLeg", !!leg && leg.from !== null);
        sp.show("HeaderDTO", !!leg && leg.from === null);
        sp.text("LegDistance", leg ? `${leg.dis.toFixed(1)}nm` : "");
        sp.text("LegBRG", leg ? deg3(leg.brg) : "");
    }
    updateAI(pitch, roll, slip) {
        pitch = clamp(pitch, -80, 80);
        this.p.tf("Horizon", { ty: pitch * 6.849, rot: -roll, glide: true, center: [459, 282.8 - 6.849 * pitch] });
        this.p.tf("bankPointer", { rot: -roll });
        this.p.tf("SlipSkid", { tx: -20 * slip });
        // The ladder moves inside the horizon; its window stays put on the screen. Only the horizon's own transform changes,
        // so this reads that attribute rather than the CTM (no layout, and no null while the display is hidden).
        const { clip, fromHorizon, fromScreen } = this.ladder;
        clip.setAttribute("transform", matrixAttr(fromHorizon.multiply(ownMatrix(this.p.el("Horizon")).inverse()).multiply(fromScreen)));
    }
    // Pilot's Guide: the color-coded speed range strip on the moving tape; FG1000's tape has none. Drawn along its right
    // edge; where the flap range overlaps the normal range, white takes the inner half (as the arcs nest on a round gauge).
    speedStrip(v) {
        const tape = this.p.el("SpeedTape");
        if (!tape)
            return;
        const y = (kt) => 284.5 - 5.711 * kt; // the tape's 0 kt line, 5.711 px a knot
        const band = (from, to, x, w, fill) => `<rect x="${x}" y="${y(to)}" width="${w}" height="${y(from) - y(to)}" fill="${fill}"/>`;
        const [x, w] = [229, 10]; // up to the tape's clip at 239, over the tick ends
        const g = tape.appendChild(document.createElementNS(NS, "g"));
        g.innerHTML = band(0, v.vso, x, w, "#ff0000") + band(v.vs1, v.vno, x, w, "#00ff00") + band(v.vso, v.vfe, x, w / 2, "#ffffff") +
            band(v.vno, v.vne, x, w, "#ffff00") + band(v.vne, 999, x, w, "#ff0000");
    }
    // The pitch ladder shows inside a circle under the roll scale, down to the top of the heading box, cut hard (Chris's
    // call; FG1000 cuts a rectangle from y 70, through the pointer, to 370). Also the extreme pitch chevrons
    // (Pilot's Guide: red, pointing to the horizon, from 50° up and 30° down); FG1000 has none, so their shape and
    // spacing are ours. updateAI keeps the window fixed on the screen.
    ladderWindow() {
        const ladder = this.p.el("PitchScale");
        const horizon = this.p.el("Horizon");
        const { cx, cy, r, bottom } = LADDER;
        const id = `glass-ladder-${++ladderCount}`;
        const cp = ladder.parentNode.appendChild(document.createElementNS(NS, "clipPath"));
        cp.id = id;
        cp.setAttribute("clipPathUnits", "userSpaceOnUse");
        const shape = cp.appendChild(document.createElementNS(NS, "path"));
        const dx = Math.sqrt(r * r - (bottom - cy) ** 2); // where the circle meets the flat bottom
        shape.setAttribute("d", `M ${cx - dx} ${bottom} A ${r} ${r} 0 1 1 ${cx + dx} ${bottom} Z`);
        ladder.setAttribute("clip-path", `url(#${id})`);
        // Chevrons midway between the ladder's lines, in the horizon's coordinates (0° at y 282.8, 6.849 px a degree).
        const chevron = (deg) => {
            const [y, d] = [282.8 - 6.849 * deg, deg > 0 ? 1 : -1];
            const pts = `${459 - 34},${y - 16 * d} ${459},${y + 16 * d} ${459 + 34},${y - 16 * d}`;
            return `<polyline points="${pts}" fill="none" stroke="#ffffff" stroke-width="12" stroke-linejoin="miter"/>` +
                `<polyline points="${pts}" fill="none" stroke="#ff0000" stroke-width="8" stroke-linejoin="miter"/>`;
        };
        const chevrons = ladder.appendChild(document.createElementNS(NS, "g"));
        chevrons.innerHTML = [55, 65, 75, -35, -45, -55, -65, -75].map(chevron).join("");
        this.ladder = {
            clip: shape,
            // getCTM gives a legacy SVGMatrix, whose multiply refuses a DOMMatrix
            fromHorizon: DOMMatrix.fromMatrix(ladder.getCTM().inverse().multiply(horizon.getCTM())),
            fromScreen: DOMMatrix.fromMatrix(horizon.parentNode.getCTM().inverse().multiply(this.p.screen.getCTM())),
        };
    }
    updateFD({ fd, pitch, roll }) {
        // Command bars disappear in an unusual attitude.
        const on = !!fd && !unusualAttitude(pitch, roll);
        this.p.show("FlightDirector", on);
        if (fd && on)
            this.p.tf("FlightDirector", { ty: -(fd.pitch - pitch) * 6.849, rot: -(roll - fd.roll), center: [459, 282.8] });
    }
    /** The AFCS status box, and FLC's airspeed reference (cyan, with its bug) or MAXSPD (flashing yellow) above the tape. */
    updateAfcs(a, ias) {
        for (const [k, id] of AFCS_FIELDS) {
            const f = a?.[k];
            this.surround.p.text(`Header${id}`, f?.text ?? "", AFCS_COLORS[f?.color ?? "white"]);
            this.surround.p.el(`Header${id}`)?.classList.toggle("gcw-flash", !!f?.flash);
        }
        const ref = a?.airspeedRef ?? null;
        const max = !!a?.maxspd;
        for (const id of ["SelectedSPD-bg", "SelectedSPD-text"])
            this.p.show(id, ref !== null || max);
        this.p.show("SelectedSPD-symbol", ref !== null && !max);
        this.p.show("SelectedSPD-bug", ref !== null);
        this.p.text("SelectedSPD-text", max ? "MAXSPD" : ref === null ? "" : `${ref}KT`, max ? "#ffff00" : CYAN);
        this.p.el("SelectedSPD-text")?.classList.toggle("gcw-flash", max);
        if (ref !== null)
            this.p.tf("SelectedSPD-bug", { ty: clamp(ias - ref, -30, 30) * 5.711 });
    }
    updateIAS(ias, trend) {
        const on = this.state.vspeedsOn;
        this.p.text("Speed110", ias >= 10 ? pad(Math.floor(ias / 10), 2) : "");
        this.p.tf("SpeedLint1", { ty: (mod(ias, 10) + (ias >= 10 ? 10 : 0)) * 36, glide: true });
        this.p.tf("SpeedTape", { ty: ias * 5.711, glide: true });
        trend = clamp(trend, -30, 30);
        this.p.tf("Airspeed-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
        const bg = this.p.el("IAS-bg");
        const vne = this.options.vne ?? (this.options.speedRanges ?? SPEEDS_172S).vne;
        if (bg)
            bg.style.fill = vne !== undefined && ias > vne ? "#ff0000" : "#000000";
        for (const v of ["Vx", "Vy", "Vr", "Vglide"]) {
            const spd = this.options.vspeeds?.[v];
            const show = spd !== undefined && on[v] && Math.abs(spd - ias) < 30;
            this.p.show(`IAS-${v}`, show);
            if (show)
                this.p.tf(`IAS-${v}`, { ty: (ias - spd) * 5.711 });
        }
    }
    updateVSI(vsi) {
        this.p.tf("VSI", { ty: vsiPointer(vsi), glide: true });
        this.p.text("VSIText", vsiText(vsi));
    }
    updateALT(alt, trend, selected) {
        if (alt < 0)
            this.p.text("Alt11100", "-" + pad(Math.abs(Math.ceil(alt / 100)), 3));
        else if (alt < 100)
            this.p.text("Alt11100", "");
        else
            this.p.text("Alt11100", pad(Math.floor(alt / 100), 3));
        this.p.tf("AltLint00011", { ty: (alt % 100) * 1.24, glide: true }); // math.fmod keeps the sign of alt
        if (alt > -1000 && alt < 1000000) {
            const neg = alt < 0;
            const a = Math.abs(alt);
            this.p.tf("LintAlt", { ty: mod(a, 100) * (neg ? -0.57375 : 0.57375), glide: true });
            const central = (neg ? -1 : 1) * Math.trunc(a / 100) * 100;
            this.p.text("AltBigC", "");
            this.p.text("AltSmallC", "");
            for (let place = 1; place <= 6; place++) {
                for (const [dir, value] of [["U", central + place * 100], ["D", central - place * 100]]) {
                    const [big, small, offset] = altLabel(value);
                    this.p.text(`AltBig${dir}${place}`, big);
                    this.p.text(`AltSmall${dir}${place}`, small);
                    this.p.tf(`AltSmall${dir}${place}`, { tx: offset });
                }
            }
        }
        trend = clamp(trend, -15, 15);
        this.p.tf("Altitude-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
        if (selected !== null)
            this.p.tf("SelectedALT-bug", { ty: clamp(alt - selected, -300, 300) * 0.567 });
    }
    // v13 trainer: the label names the station type, VOR1 or LOC2 (FG1000: NAV1, NAV2).
    setCDISource(source, label) {
        for (const s of ["GPS", "NAV1", "NAV2"]) {
            for (const part of ["pointer", "CDI", "FROM", "TO"])
                this.p.show(`${s}-${part}`, source === s);
        }
        this.p.text("CDI-SRC-text", label, source === "GPS" ? MAGENTA : GREEN);
        this.p.show("CDI-SRC-text", source !== "OFF");
    }
    updateCDI(s) {
        const src = s.cdiSource;
        if (src === "OFF")
            return;
        if (!s.cdiValid) {
            for (const part of ["CDI", "FROM", "TO", "pointer"])
                this.p.show(`${src}-${part}`, false);
            this.p.tf("CDI", { rot: 0 });
            this.p.show("GPS-CTI-diamond", false);
            this.p.show("CDI-GPS-XTK-text", false);
            this.p.text("CDI-GPS-ANN-text", "NO DATA");
            this.p.show("CDI-GPS-ANN-text", true);
            return;
        }
        this.p.tf("CDI", { rot: s.course - s.heading });
        this.p.show("GPS-CTI-diamond", false); // shortcut: GPS course-to-intercept diamond not ported, needs a desired track input
        const xtk = src === "GPS" && Math.abs(s.cdiDots) > 2;
        this.p.show("CDI-GPS-XTK-text", xtk);
        if (xtk)
            this.p.text("CDI-GPS-XTK-text", `XTK ${Math.abs(s.xtk).toFixed(2)}NM`);
        this.p.show("CDI-GPS-ANN-text", src === "GPS");
        if (src === "GPS")
            this.p.text("CDI-GPS-ANN-text", s.obs ? "OBS" : s.susp ? "SUSP" : s.gpsMode);
        this.p.tf(`${src}-CDI`, { tx: (80 * clamp(s.cdiDots, -2.4, 2.4)) / 2.4 });
        this.p.show(`${src}-TO`, !s.from);
        this.p.show(`${src}-FROM`, s.from);
    }
    // _setBRG and _updateBRG: a source with nothing to point at shows dashes and no needle.
    updateBRG(brg, source, s) {
        const b = source === "OFF" ? undefined : s.bearings[source];
        this.p.show(brg, source !== "OFF");
        this.p.show(`${brg}-pointer`, !!b);
        if (source === "OFF")
            return;
        this.p.text(`${brg}-SRC-text`, source);
        this.p.text(`${brg}-WPID-text`, b?.id ?? "----");
        this.p.text(`${brg}-DST-text`, source === "ADF" ? "" : b?.distance === undefined ? "--nm" : `${b.distance.toFixed(1)}NM`);
        if (b)
            this.p.tf(`${brg}-pointer`, { rot: b.bearing - s.heading });
    }
}
// Altitude tape label for one 100 ft line: [thousands, hundreds, x offset of the hundreds], as FG1000 lays it out.
function altLabel(v) {
    let offset = -30.078;
    let prefix = "";
    if (v < 0) {
        v = -v;
        prefix = "-";
        offset += 15.039;
    }
    if (v === 0)
        return ["", "0", offset];
    if (v % 500 === 0)
        return [prefix + v, "", offset];
    if (v < 1000)
        return ["", prefix + (v % 1000), -30.078];
    if (v < 10000)
        return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 15.039];
    return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 30.078];
}
