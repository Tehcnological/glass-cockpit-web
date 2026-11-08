// Glass PFD for the browser: a TypeScript port of the display logic in FlightGear's FG1000
// (Aircraft/Instruments-3d/FG1000/Nasal/MFDPages/PFDInstruments/PFDInstruments.nas, Copyright 2018 Stuart Buchanan),
// driving the same SVG. GPL-2.0-or-later, like the original.
import PFD from "./svg/pfd.js";
import SURROUND from "./svg/surround-pfd.js";
import NRST from "./svg/nrst-pfd.js";
import NRST_INFO from "./svg/nrst-info-pfd.js";
import FPL from "./svg/fpl-pfd.js";
import { buildDisplay, type DisplayOptions } from "./display.js";
import { Page, clamp, deg3, mod, pad } from "./page.js";
import { RADIOS, Surround, type Radios } from "./surround.js";
import { adjust, bezelInput, type Input } from "./bezel.js";
import { DCLTR, drawMap, mapGroup, rangeLabel, stepRange, type Airspace, type MapGeometry, type MapPoint } from "./map.js";
import { bearingDistance, bestApproach, latLon, nearest, nrstFreq, planName, routePoint, type Airport } from "./nav.js";
import { alertsKey, seenAlerts } from "./alerts.js";
import { cdiLabel, dmeText } from "./radio.js";
import { BLANK as blank, CYAN, Highlighter, ListView, NS, dimKey, esc, firstRow, key as k, screenBox, type Key } from "./ui.js";
import { firstOption, fplMenu, stepMenu } from "./page-menu.js";
import { vsiPointer, vsiText } from "./vsi.js";

export { GlassMfd, type MfdState, type Engine } from "./glass-mfd.js";
export type { Checklist } from "./mfd-pages.js";
export type { MapPoint, Airspace, LatLon } from "./map.js";
export type { Airport, Runway, Freq, Station, Procedure, ProcLeg } from "./nav.js";
export { gpsApproved, vtfLeg } from "./nav.js";
export type { Radio, Radios } from "./surround.js";
export type { DisplayOptions } from "./display.js";
export type { Control, Input } from "./bezel.js";

export type CdiSource = "GPS" | "NAV1" | "NAV2" | "OFF";
export type BrgSource = "OFF" | "NAV1" | "NAV2" | "GPS" | "ADF";
/** What a bearing source points at: a station or waypoint, its bearing (magnetic) and distance (nm). */
export interface Pointer { id: string; bearing: number; distance?: number }
export type XpdrMode = "OFF" | "STBY" | "TEST" | "GND" | "ON" | "ALT";
export type VSpeed = "Vglide" | "Vr" | "Vx" | "Vy";

export interface PfdState {
  /** Degrees, nose up positive. */ pitch: number;
  /** Degrees, right wing down positive. */ roll: number;
  /** Slip/skid ball, -1 to 1. */ slip: number;
  /** Knots. */ ias: number;
  /** Predicted airspeed change over 6 seconds, knots. */ iasTrend: number;
  /** Knots. */ tas: number;
  /** Feet. */ alt: number;
  /** Predicted altitude change over 6 seconds, feet. */ altTrend: number;
  /** Feet; null hides the selected altitude box and bug. */ selectedAlt: number | null;
  /** Feet per minute. */ vsi: number;
  /** Inches of mercury. */ baro: number;
  /** Degrees Celsius. */ oat: number;
  /** Magnetic heading, degrees. */ heading: number;
  /** Rate of turn, degrees per second, positive right. */ turnRate: number;
  /** Degrees. */ headingBug: number;
  cdiSource: CdiSource;
  /** Selected course, degrees. */ course: number;
  /** CDI deflection in dots, -2.4 to 2.4; positive is course to the right. */ cdiDots: number;
  /** FROM flag instead of TO. */ from: boolean;
  /** False shows NO DATA instead of the course needle. */ cdiValid: boolean;
  /** GPS annunciation, e.g. ENR, TERM, LPV. */ gpsMode: string;
  /** GPS cross-track error, nm; shown beyond 2 dots. */ xtk: number;
  /** Glideslope, -1 to 1 full scale; null hides it. */ gs: number | null;
  /** Bearing pointer sources, picked with PFD > BRG1 / BRG2. */ brg1: BrgSource;
  brg2: BrgSource;
  /** What each bearing source points at; a source with nothing here shows dashes. */
  bearings: Partial<Record<Exclude<BrgSource, "OFF">, Pointer>>;
  /** Marker beacon: "", "O", "M", "I". */ marker: "" | "O" | "M" | "I";
  /** Flight director command bars; null hides them. */ fd: { pitch: number; roll: number } | null;
  radios: Radios;
  /** NAV and COM volume, 0 to 1; a change shows on the radios for 2 seconds. */ navVolume: number;
  comVolume: number;
  /** NAV station identifier audio, switched by pushing the NAV volume knob. */ navIdent: boolean;
  /** Active flight plan leg in the top bar; `from` null is a direct-to. Null blanks it. */
  leg: { from: string | null; to: string; /** nm */ dis: number; /** degrees */ brg: number } | null;
  /** Aircraft position, for the inset map and the NRST window. */ lat: number;
  lon: number;
  /** Inset map contents (see the MFD's map). */ points: MapPoint[];
  airspaces: Airspace[];
  /** Flight plan, for the inset map and the FPL window: ids of `points` or `airports`, or points of its own. */
  route: (string | MapPoint)[];
  /** Index into `route` of the active waypoint. */ activeLeg: number;
  /** Airports the NRST window lists, nearest first after sorting here. */ airports: Airport[];
  /** Magnetic variation, degrees east positive: bearings to stations are magnetic. */ magVar: number;
  /** Wind, true direction it blows from and knots; null shows NO DATA. */ wind: { direction: number; speed: number } | null;
  xpdr: { mode: XpdrMode; /** Four digits. */ code: string; ident: boolean };
  /** Time of day in seconds for the TIME field; null uses the computer's clock. */ time: number | null;
  /** GPS OBS mode (OBS softkey): course set with the CRS knob instead of the flight plan. */ obs: boolean;
  /** Messages for the ALERTS window. */ alerts: string[];
  /** Which speed references (options.vspeeds) show on the tape, set in TMR/REF. */ vspeedsOn: Record<VSpeed, boolean>;
  /** Barometric minimums, feet (TMR/REF); null is off. */ minimums: number | null;
  /**
   * Failed instruments, flagged with FG1000's red X and yellow text. As the trainer shows them: an AHRS failure flags
   * `attitude` only; an air data failure flags `airspeed`, `altitude` and `vsi` together.
   */
  failed: Partial<Record<Failure, boolean>>;
}

/** A change `onChange` reports: PFD state, plus the MFD's `directFrom` and `vtf` when the PAGE MENU changes the flight plan. */
export type PfdChange = Partial<PfdState> & { directFrom?: import("./map.js").LatLon | null; vtf?: boolean };

export type Failure = "attitude" | "airspeed" | "altitude" | "vsi" | "heading";

export interface PfdOptions extends DisplayOptions {
  /** Called when a bezel input changes the state (heading bug, course, baro, selected altitude, radios, CDI source). */
  onChange?: (patch: PfdChange) => void;
  /** IAS box turns red above this. */ vne?: number;
  /** Speed references, switched on and off in TMR/REF. */ vspeeds?: Partial<Record<VSpeed, number>>;
}

const DEFAULTS: PfdState = {
  pitch: 0, roll: 0, slip: 0, ias: 0, iasTrend: 0, tas: 0, alt: 0, altTrend: 0, selectedAlt: null, vsi: 0,
  baro: 29.92, oat: 15, heading: 0, turnRate: 0, headingBug: 0, cdiSource: "NAV1", course: 0, cdiDots: 0, from: false,
  cdiValid: true, gpsMode: "ENR", xtk: 0, gs: null, brg1: "OFF", brg2: "OFF", bearings: {}, marker: "", fd: null,
  radios: RADIOS, navVolume: 0.5, comVolume: 0.5, navIdent: false, leg: null, lat: 0, lon: 0, points: [], airspaces: [], route: [], activeLeg: 1, airports: [], magVar: 0, wind: null,
  xpdr: { mode: "ALT", code: "1200", ident: false }, time: null, obs: false, alerts: [],
  vspeedsOn: { Vglide: false, Vr: false, Vx: false, Vy: false }, minimums: null, failed: {}, // v13 trainer: references start off
};

type Menu = "top" | "inset" | "pfd" | "wind" | "synvis" | "hsi" | "altunit" | "xpdr" | "code";
/** SETUP: the PFD SETUP MENU; MENU: the flight plan's PAGE MENU. */
type Window = "TMR/REF" | "NRST" | "ALERTS" | "DME" | "SETUP" | "MENU" | null;
const BRG_SOURCES: BrgSource[] = ["OFF", "NAV1", "NAV2", "GPS", "ADF"];
const VSPEEDS: VSpeed[] = ["Vglide", "Vr", "Vx", "Vy"];
const TMR_FIELDS = ["time", "dir", "action", "Vglide", "Vr", "Vx", "Vy", "minimums", "minalt"] as const;
const FONT = `font-family="'Liberation Sans',Arial,sans-serif" font-size="18"`;

// FG1000's failure flags, in its Failures group, by the instrument they cover.
const FAILURES: [Failure, string][] = [["attitude", "NoAttitude"], ["airspeed", "NoASI"], ["altitude", "NoAlt"], ["vsi", "NoVS"], ["heading", "NoHDG"]];

// Parts of the FG1000 PFD this port does not drive. L_NoGPS: the v13 trainer's PFD shows a GPS failure only as an alert.
const HIDDEN = ["L_NoGPS", "GSPD", "PFD-Multilines", "Annunciation", "SelectedALT-meters", "SelectedSPD-bug", "SelectedSPD-bg", "SelectedSPD-text", "SelectedSPD-symbol"];

// Tape clipping, as "rect(top, right, bottom, left)" in screen coordinates.
const CLIPS: Record<string, [number, number, number, number]> = {
  PitchScale: [70, 664, 370, 256],
  SpeedLint1: [252, 226, 318, 204],
  SpeedTape: [115, 239, 455, 156],
  LintAlt: [115, 808, 455, 704],
  AltLint00011: [252, 804, 318, 771],
};

const MAGENTA = "#ff00ff";
const GREEN = "#00ff00";

export class GlassPfd {
  readonly svg: SVGSVGElement;
  private state: PfdState = { ...DEFAULTS };
  private p: Page;
  private surround: Surround;
  private nrst: Page;
  private fpl: Page;
  private fplRows: ListView;
  private turnTrend: SVGPathElement;
  private minBug: SVGGraphicsElement;
  private inset: SVGGElement;
  private insetGeom: MapGeometry;
  private win: SVGGElement;
  private winBox: DOMRect;
  private clock: ReturnType<typeof setInterval>;
  private timers: ReturnType<typeof setTimeout>[] = [];
  // Display settings the menus change, as FG1000 keeps them in the page and its controller.
  private ui = {
    menu: "top" as Menu, inset: false, insetRange: 10, dcltr: 0, window: null as Window, cursor: 0, nrstInfo: false,
    layers: { TRAFFIC: false, TOPO: false, TERRAIN: false } as Record<string, boolean>,
    synvis: { PATHWAY: false, "SYN TERR": false, "HRZN HDG": false, APTSIGNS: false } as Record<string, boolean>,
    wind: 0, meters: false, hpa: false, xpdrEdit: null as string | null, fpl: false,
    timer: { up: true, running: false, base: 0, since: 0 },
    /** The messages the ALERTS window has shown. */ alertsSeen: [] as string[],
    /** PFD > DME shows the DME window; DME TUNING picks its NAV radio. */ dme: false, dmeSource: "NAV1" as "NAV1" | "NAV2",
  };

  /** The container must be visible: layout is measured once here. */
  constructor(container: HTMLElement, private options: PfdOptions = {}) {
    const { svg, screen } = buildDisplay(container, [PFD, SURROUND, NRST, NRST_INFO, FPL], "Primary flight display", options);
    this.svg = svg;
    this.p = new Page(screen, "PFDInstruments");
    this.surround = new Surround(screen);
    this.nrst = new Page(screen, "NearestAirportsPFD");
    this.fpl = new Page(screen, "PFDInstrumentsFlightPlan");
    this.fpl.show("Group", true); // measured for the scroll bar, then hidden until FPL
    this.fplRows = new ListView(this.fpl, ["Arrow", "ID", "Type", "DTK", "DIS"], 5, "Arrow", true, { trough: "ScrollTrough", thumb: "ScrollThumb" });
    // The inset map fills its frame (PFD-Map-bg); its range is the frame's half width.
    const frame = screenBox(screen, this.p.el("PFD-Map-bg")!);
    const half = Math.min(frame.width, frame.height) / 2;
    this.insetGeom = { x: frame.x, y: frame.y, w: frame.width, h: frame.height, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, px: half };
    this.inset = mapGroup(screen, this.p.el("PFD-Map-Display")!.nextElementSibling!, this.insetGeom); // over the frame's black fill
    // TMR/REF and ALERTS open where FG1000 puts the NRST window.
    this.winBox = screenBox(screen, this.nrst.el("Group")!);
    this.win = screen.appendChild(document.createElementNS(NS, "g"));
    // v13 trainer: the VSI scale reads 1 and 2 (thousand fpm) where FG1000's reads 2 and 4 (see vsi.ts).
    for (const [id, t] of [["text4659", "1"], ["text4659-6", "1"], ["text4659-7", "2"], ["text4659-7-9", "2"]]) {
      const e = screen.querySelector(`[id="${id}"]`);
      const label = e?.querySelector("tspan") ?? e;
      if (label) label.textContent = t;
    }
    // Minimums bug: the selected altitude bug, in cyan.
    const bug = this.p.el("SelectedALT-bug")!;
    this.minBug = bug.cloneNode(true) as SVGGraphicsElement;
    for (const e of [this.minBug, ...this.minBug.querySelectorAll<SVGElement>("*")]) {
      e.removeAttribute("id");
      e.style.fill = "#00ffff";
    }
    bug.parentNode!.parentNode!.appendChild(this.minBug); // outside SelectedALT, which hides with no selected altitude
    this.clock = setInterval(() => this.tick(), 1000);
    for (const id of HIDDEN) this.p.show(id, false);
    // FG1000 raises the failure flags with a z-index; in SVG they come first, so move them over the instruments.
    const flags = this.p.el("Failures");
    flags?.parentNode?.appendChild(flags);
    const typo = screen.querySelector('[id="tspan6977"]'); // FG1000 spells it ATTIUDE
    if (typo) typo.textContent = "ATTITUDE FAIL";
    for (const [id, r] of Object.entries(CLIPS)) this.p.clip(id, r);
    // Autopilot annunciations start blank, as Surround.new() leaves them.
    for (const id of ["APLateralArmed", "APLateralActive", "APVerticalArmed", "APVerticalActive", "APVerticalReference", "APStatus"]) {
      this.surround.p.text(`Header${id}`, "");
    }
    if (options.bezel) bezelInput(svg, (i) => this.input(i));
    // FG1000 draws the turn rate scale but never drives it; the trend vector is drawn here.
    const scale = this.p.el("turnrate-indicator")!;
    this.turnTrend = scale.parentNode!.insertBefore(document.createElementNS("http://www.w3.org/2000/svg", "path"), scale.nextSibling);
    for (const [k, v] of Object.entries({ fill: "none", stroke: MAGENTA, "stroke-width": "5" })) this.turnTrend.setAttribute(k, v);
    this.set({});
  }

  // Turn rate trend vector: the heading 6 seconds ahead, along the arc above the compass rose (center 459.5, 586.5).
  // The scale spans about 24° each side, so standard rate (3°/s) reaches 18°.
  private updateTurnRate(rate: number) {
    const a = (Math.max(-24, Math.min(24, rate * 6)) * Math.PI) / 180;
    const [cx, cy, r] = [459.5, 586.5, 157];
    const d = Math.abs(a) < 0.005 ? "" : `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${a > 0 ? 1 : 0} ${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
    this.turnTrend.setAttribute("d", d);
  }

  /** Stops the clock. Call when the display is removed. */
  destroy(): void {
    clearInterval(this.clock);
    this.timers.forEach(clearTimeout);
    this.surround.destroy();
  }

  private input(i: Input) {
    this.options.onInput?.(i);
    const u = this.ui;
    switch (i.control) {
      case "NAV_TOGGLE":
      case "COM_TOGGLE":
        this.surround.toggle(i.control === "NAV_TOGGLE" ? "nav" : "com");
        return this.set({});
      case "SOFTKEY":
        this.menu()[i.value - 1]?.act?.();
        return this.set({});
      case "RANGE":
        if (u.inset) u.insetRange = stepRange(u.insetRange, i.value);
        return this.set({});
      case "FMS_OUTER":
      case "FMS_INNER":
        return this.fms(i.control === "FMS_OUTER", i.value > 0 ? 1 : -1);
      case "MENU":
        // v13 trainer: MENU shows the PFD SETUP MENU, or with the flight plan window open its PAGE MENU; MENU again
        // closes it (the trainer then opens its DEMO MODE page, a simulator setting, not ported).
        if (u.window === "SETUP" || u.window === "MENU") u.window = null;
        else if (u.fpl) [u.window, u.cursor] = ["MENU", firstOption(this.pageMenu().map((o) => !!o.patch))];
        else u.window = "SETUP";
        return this.set({});
      case "FMS_CRSR":
        if (u.window === "SETUP" || u.window === "MENU") u.window = null;
        return this.set({});
      case "ENT":
        if (u.window === "MENU") {
          const o = this.pageMenu()[u.cursor];
          if (o?.patch) {
            u.window = null;
            // The whole patch, so a host sharing it with the MFD also clears its direct-to and vector-to-final.
            this.change(o.patch);
          }
        }
        if (u.window === "NRST" && this.nearest().length) u.nrstInfo = !u.nrstInfo;
        if (u.window === "TMR/REF") this.timerAction();
        return this.set({});
      case "CLR":
        if (u.window === "NRST" && u.nrstInfo) u.nrstInfo = false;
        else if (u.window) u.window = null;
        return this.set({});
      case "FPL":
        // PFDInstrumentsController.handleFPL: shows or hides the flight plan window.
        u.fpl = !u.fpl;
        if (!u.fpl && u.window === "MENU") u.window = null;
        return this.set({});
    }
    const src = this.state.cdiSource;
    const toStation = src === `NAV${this.surround.sel.nav}` ? this.state.bearings[src as "NAV1" | "NAV2"]?.bearing : null;
    const patch = adjust(i, this.state, this.surround.sel, toStation);
    if (patch) this.change(patch);
  }

  /** Apply a change the pilot made and report it. */
  private change(patch: PfdChange) {
    const { directFrom: _d, vtf: _v, ...own } = patch;
    this.set(own);
    this.options.onChange?.(patch);
  }

  private go(menu: Menu) {
    this.ui.menu = menu;
  }

  private openWindow(w: Window) {
    this.ui.window = this.ui.window === w ? null : w;
    this.ui.cursor = 0;
    this.ui.nrstInfo = false;
  }

  // The softkey menus: PFDInstruments.topMenu, insetMenu, PFDMenu, windMenu, transponderMenu, codeMenu. FG1000 leaves
  // SYN VIS, HSI FRMT, ALT UNIT, OBS, TMR/REF and ALERTS as TODO; they follow the real unit here.
  private menu(): Key[] {
    const u = this.ui;
    const s = this.state;
    u.alertsSeen = seenAlerts(s.alerts, u.alertsSeen, u.window === "ALERTS");
    const a = alertsKey(s.alerts, u.alertsSeen);
    // shortcut: the trainer flashes ADVISORY; it is lit steadily here, flash once there is a blink timer.
    const alerts = k(a.label, () => this.openWindow("ALERTS"), u.window === "ALERTS" || a.unread);
    const back = (to: Menu) => k("BACK", () => this.go(to));
    const toggle = (set: Record<string, boolean>, name: string) => k(name, () => (set[name] = !set[name]), set[name]);
    switch (u.menu) {
      case "top": {
        const cdi: CdiSource[] = ["GPS", "NAV1", "NAV2"];
        // v13 trainer: OBS is dim with no flight plan (FG1000 always offers it); while on, it stays so it can be turned off.
        return [
          blank, k("INSET", () => { u.inset = true; this.go("inset"); }), blank, k("PFD", () => this.go("pfd")),
          s.route.length || s.obs ? k("OBS", () => this.change({ obs: !s.obs }), s.obs) : dimKey("OBS"),
          // PFDInstrumentsController.incrCDISource: GPS, NAV1, NAV2.
          k("CDI", () => this.change({ cdiSource: cdi[(cdi.indexOf(s.cdiSource) + 1) % 3] })),
          k("DME", () => this.openWindow("DME"), u.window === "DME"), k("XPDR", () => this.go("xpdr")), k("IDENT", () => this.ident()),
          k("TMR/REF", () => this.openWindow("TMR/REF"), u.window === "TMR/REF"),
          k("NRST", () => this.openWindow("NRST"), u.window === "NRST"), alerts,
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
        const next = (b: BrgSource) => BRG_SOURCES[(BRG_SOURCES.indexOf(b) + 1) % BRG_SOURCES.length];
        return [
          k("SYN VIS", () => this.go("synvis")), k("DFLTS", () => this.defaults()), k("WIND", () => this.go("wind")),
          k("DME", () => (u.dme = !u.dme), u.dme), // v13 trainer: the DME window (FG1000 has the artwork, no key)
          k("BRG1", () => this.change({ brg1: next(s.brg1) }), s.brg1 !== "OFF"), k("HSI FRMT", () => this.go("hsi")),
          k("BRG2", () => this.change({ brg2: next(s.brg2) }), s.brg2 !== "OFF"), blank, k("ALT UNIT", () => this.go("altunit")),
          k("STD BARO", () => this.change({ baro: 29.92 })), back("top"), alerts,
        ];
      }
      case "wind": {
        const opt = (label: string, n: number) => k(label, () => (u.wind = n), u.wind === n);
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
        const mode = (m: XpdrMode) => k(m, () => this.change({ xpdr: { ...s.xpdr, mode: m } }), s.xpdr.mode === m);
        return [blank, blank, mode("STBY"), mode("ON"), mode("ALT"), mode("GND"),
          k("VFR", () => this.change({ xpdr: { ...s.xpdr, code: "1200" } })), k("CODE", () => this.go("code")),
          k("IDENT", () => this.ident()), blank, back("top"), alerts];
      }
      case "code":
        return [...[0, 1, 2, 3, 4, 5, 6, 7].map((d) => k(String(d), () => this.xpdrDigit(String(d)))),
          k("IDENT", () => this.ident()), k("BKSP", () => this.xpdrDigit("BKSP")), back("xpdr"), alerts];
    }
  }

  // PFDInstrumentsController.setTransponderDigit: four digits set the code; BKSP takes one back.
  private xpdrDigit(d: string) {
    const u = this.ui;
    const code = d === "BKSP" ? (u.xpdrEdit ?? "").slice(0, -1) : (u.xpdrEdit ?? "") + d;
    if (code.length === 4) {
      u.xpdrEdit = null;
      this.go("top");
      this.change({ xpdr: { ...this.state.xpdr, code } });
    } else {
      u.xpdrEdit = code;
      this.later(45, () => { u.xpdrEdit = null; }); // transponderEditResetTimer
    }
  }

  // setTransponderIdent: IDNT for 18 seconds; cancels a code entry and returns to the top menu.
  private ident() {
    this.ui.xpdrEdit = null;
    this.go("top");
    this.change({ xpdr: { ...this.state.xpdr, ident: true } });
    this.later(18, () => this.change({ xpdr: { ...this.state.xpdr, ident: false } }));
  }

  private later(sec: number, f: () => void) {
    this.timers.push(setTimeout(() => { f(); this.set({}); }, sec * 1000));
  }

  private defaults() {
    Object.assign(this.ui, { inset: false, wind: 0, meters: false, hpa: false, dcltr: 0 });
    for (const set of [this.ui.layers, this.ui.synvis]) for (const k of Object.keys(set)) set[k] = false;
    this.change({ brg1: "OFF", brg2: "OFF" });
  }

  private nearest() {
    const s = this.state;
    return nearest(s.airports, s.lat, s.lon, s.magVar).map((n) => ({ ...n, a: n.item }));
  }

  // FMS knob in a window: the outer ring moves the cursor, the inner changes the field (NRST: both scroll the list).
  /** The flight plan's PAGE MENU options; those without `patch` are dim. */
  private pageMenu() {
    return fplMenu(this.state.route, this.state.activeLeg);
  }

  private fms(outer: boolean, d: number) {
    const u = this.ui;
    if (u.window === "MENU") u.cursor = stepMenu(this.pageMenu().map((o) => !!o.patch), u.cursor, d);
    if (u.window === "NRST" && !u.nrstInfo) u.cursor = clamp(u.cursor + d, 0, Math.max(0, this.nearest().length - 1));
    // shortcut: no HOLD mode; add it when a scenario needs DME hold.
    if (u.window === "DME" && !outer) u.dmeSource = u.dmeSource === "NAV1" ? "NAV2" : "NAV1";
    if (u.window === "TMR/REF") {
      if (outer) u.cursor = mod(u.cursor + d, TMR_FIELDS.length);
      else this.timerField(d);
    }
    this.set({});
  }

  private timerValue() {
    const t = this.ui.timer;
    const run = t.running ? (Date.now() - t.since) / 1000 : 0;
    return Math.max(0, t.up ? t.base + run : t.base - run);
  }

  // The inner FMS knob on a TMR/REF field (TMR_FIELDS order).
  private timerField(d: number) {
    const u = this.ui;
    const t = u.timer;
    const s = this.state;
    switch (TMR_FIELDS[u.cursor]) {
      case "time": if (!t.running) t.base = Math.max(0, t.base + d * 60); break;
      case "dir": t.base = this.timerValue(); t.since = Date.now(); t.up = !t.up; break;
      case "action": break;
      case "minimums": this.change({ minimums: s.minimums === null ? Math.round(s.alt / 100) * 100 : null }); break;
      case "minalt": if (s.minimums !== null) this.change({ minimums: Math.max(0, s.minimums + d * 10) }); break;
      default: {
        const v = TMR_FIELDS[u.cursor] as VSpeed;
        this.change({ vspeedsOn: { ...s.vspeedsOn, [v]: !s.vspeedsOn[v] } });
      }
    }
  }

  // ENT on the timer's action field: START?, STOP?, RESET?.
  private timerAction() {
    const t = this.ui.timer;
    if (TMR_FIELDS[this.ui.cursor] !== "action") return;
    if (t.running) Object.assign(t, { base: this.timerValue(), running: false });
    else if (t.base > 0 && t.up) t.base = 0;
    else Object.assign(t, { running: true, since: Date.now() });
  }

  private timerLabel() {
    const t = this.ui.timer;
    return t.running ? "STOP?" : t.base > 0 && t.up ? "RESET?" : "START?";
  }

  private tick() {
    const t = this.ui.timer;
    if (t.running && !t.up && this.timerValue() === 0) Object.assign(t, { up: true, base: 0, since: Date.now() }); // counts down to zero, then up
    this.updateXpdr();
    if (this.ui.window === "TMR/REF") this.drawWindow();
  }


  /** Merge new values into the state and redraw. */
  set(patch: Partial<PfdState>): void {
    const s = (this.state = { ...this.state, ...patch });
    this.updateAI(s.pitch, s.roll, s.slip);
    this.updateFD(s);
    this.updateIAS(s.ias, s.iasTrend);
    this.updateVSI(s.vsi);
    this.p.text("TAS-text", `${Math.round(s.tas)}KT`);
    this.updateALT(s.alt, s.altTrend, s.selectedAlt);
    this.p.show("SelectedALT", s.selectedAlt !== null);
    this.p.show("SelectedALT-bug", s.selectedAlt !== null);
    if (s.selectedAlt !== null) this.p.text("SelectedALT-text", String(Math.round(s.selectedAlt)));
    this.p.text("BARO-text", this.ui.hpa ? `${Math.round(s.baro * 33.8639)}HPA` : `${s.baro.toFixed(2)}IN`);
    this.p.show("SelectedALT-meters", this.ui.meters && s.selectedAlt !== null);
    if (this.ui.meters && s.selectedAlt !== null) this.p.text("SelectedALT-meters", `${Math.round(s.selectedAlt * 0.3048)}M`);
    this.minBug.style.display = s.minimums === null ? "none" : "inline";
    if (s.minimums !== null) this.minBug.setAttribute("transform", `translate(0 ${clamp(s.alt - s.minimums, -300, 300) * 0.567})`);
    this.p.text("OAT-text", Math.abs(s.oat) < 10 ? `${s.oat.toFixed(1)} °C` : `${Math.trunc(s.oat)} °C`);
    this.p.tf("Rose", { rot: -s.heading });
    this.updateTurnRate(s.turnRate);
    this.p.text("HDG-text", deg3(s.heading));
    this.p.tf("Heading-bug", { rot: s.headingBug });
    this.p.text("SelectedHDG-text", deg3(s.headingBug));
    for (const [f, id] of FAILURES) this.p.show(id, !!s.failed[f]);
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
    const keys = this.menu();
    this.surround.setSoftkeys(keys.map((k) => k.label), keys.map((k) => !!k.lit), keys.map((k) => !!k.dim));
    this.updateLeg(s.leg);
    this.updateXpdr();
    this.updateWind(s);
    this.updateInset(s);
    this.updateNrst();
    this.updateFlightPlan(s);
    this.drawWindow();
  }

  // setFlightPlan / updateFlightPlan: the flight plan window, shown by FPL while there is a flight plan. The arrow marks
  // the active waypoint; legs already flown show blanks.
  private updateFlightPlan(s: PfdState) {
    const legs = s.route.map((r) => routePoint(r, s.points, s.airports));
    this.fpl.show("Group", this.ui.fpl && legs.length > 0);
    if (!this.ui.fpl || !legs.length) return;
    const rows = legs.map((p, i) => {
      const prev = legs[i - 1];
      const leg = prev && p ? bearingDistance(prev.lat, prev.lon, p.lat, p.lon) : null;
      const flown = i < s.activeLeg;
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
  private updateXpdr() {
    const x = this.state.xpdr;
    const color = ["GND", "ON", "ALT"].includes(x.mode) ? "#33ff33" : "#ffffff";
    this.p.text("XPDR-MODE-text", x.ident ? "IDNT" : x.mode, color);
    const code = this.ui.xpdrEdit === null ? x.code.padStart(4, "0") : this.ui.xpdrEdit.padEnd(4, " ");
    for (let i = 0; i < 4; i++) this.p.text(`XPDR-DIGIT-${3 - i}-text`, code[i], color);
    const now = new Date();
    const t = this.state.time ?? now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const p2 = (n: number) => String(Math.floor(n)).padStart(2, "0");
    this.p.text("TIME-text", `${p2(mod(t / 3600, 12))}:${p2(mod(t / 60, 60))}:${p2(mod(t, 60))}`); // FG1000 shows 12 hours
  }

  // setWindDisplay and updateWindData.
  private updateWind(s: PfdState) {
    const opt = this.ui.wind;
    this.p.show("WindData", opt !== 0);
    for (const n of [1, 2, 3]) this.p.show(`WindData-OPTN${n}`, opt === n && !!s.wind);
    this.p.show("WindData-NODATA", opt !== 0 && !s.wind);
    this.p.show("WindData-NODATA-bg", opt !== 0 && !s.wind);
    if (!opt || !s.wind) return;
    let { direction, speed } = s.wind;
    let alpha = direction - s.heading;
    if (speed < 1) alpha = direction = 0; // stops the arrows wandering in a calm
    if (opt === 1) {
      const cross = speed * Math.sin((alpha * Math.PI) / 180);
      const head = speed * Math.cos((alpha * Math.PI) / 180);
      this.p.text("WindData-OPTN1-crosswind-text", String(Math.trunc(Math.abs(cross))));
      this.p.tf("WindData-OPTN1-crosswind", { rot: cross > 0.1 ? 180 : 0 });
      this.p.text("WindData-OPTN1-headwind-text", String(Math.trunc(Math.abs(head))));
      this.p.tf("WindData-OPTN1-headwind", { rot: head > 0.1 ? 180 : 0 });
    } else if (opt === 2) {
      this.p.tf("WindData-OPTN2-HDG", { rot: alpha + 180 });
      this.p.text("WindData-OPTN2-SPD-text", String(Math.trunc(speed)));
    } else {
      this.p.tf("WindData-OPTN3-HDG", { rot: alpha + 180 });
      this.p.text("WindData-OPTN3-HDG-text", `${pad(Math.trunc(mod(direction, 360)), 3, "0")}°T`);
      this.p.text("WindData-OPTN3-SPD-text", `${Math.trunc(speed)}KT`);
    }
  }

  // setInsetMapVisible and the inset NavMap: north up, the range on the RANGE knob.
  private updateInset(s: PfdState) {
    const u = this.ui;
    for (const id of ["PFD-Map", "PFD-Map-bg", "PFD-Map-bg-1"]) this.p.show(id, u.inset);
    this.inset.style.display = u.inset ? "inline" : "none";
    if (!u.inset) return;
    this.p.text("RangeDisplay", rangeLabel(u.insetRange));
    this.p.text("OrientationDisplay", "NORTH UP");
    drawMap(this.inset, { ...s, range: u.insetRange, orientation: "NORTH UP" }, this.insetGeom, u.dcltr);
  }

  // NearestAirportsPFD: three rows of the 25 nearest, scrolled with the FMS knob; ENT shows the selected airport.
  private updateNrst() {
    const u = this.ui;
    const open = u.window === "NRST";
    this.nrst.show("Group", open && !u.nrstInfo);
    this.nrst.show("Info", open && u.nrstInfo);
    if (!open) return;
    const list = this.nearest();
    const top = clamp(u.cursor - 1, 0, Math.max(0, list.length - 3));
    for (let row = 0; row < 3; row++) {
      const n = list[top + row];
      const cells: Record<string, string> = n
        ? { ID: n.a.id, BRG: `${Math.round(n.brg)}°`, DST: `${n.dist.toFixed(1)}nm`, APP: bestApproach(n.a), CommsType: nrstFreq(n.a)[0], CommsFreq: nrstFreq(n.a)[1], RWY: `${n.a.runways[0]?.length ?? 0}ft` }
        : { ID: row === 0 ? "NONE WITHIN 200NM" : "", BRG: "", DST: "", APP: "", CommsType: "", CommsFreq: "", RWY: "" };
      for (const [k, v] of Object.entries(cells)) this.nrst.text(`${k}${row}`, v);
      this.hl.set(this.nrst.el(`ID${row}`), !!n && top + row === u.cursor);
    }
    const thumb = this.nrst.el("Scroll");
    if (thumb) this.nrst.tf("Scroll", { ty: list.length > 3 ? (top / (list.length - 3)) * 120 : 0 });
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

  private hl = new Highlighter();

  // TMR/REF (generic timer, speed references, minimums) and ALERTS, drawn in the NRST window's place. FG1000 has
  // these as TODO, so the layout follows the real unit.
  private drawWindow() {
    const u = this.ui;
    const s = this.state;
    if (u.window === null || u.window === "NRST") {
      this.win.innerHTML = "";
      return;
    }
    const { x, y, width: w, height: h } = this.winBox;
    // A row is a label and value cells, each right-aligned at `right` px from the window's left edge.
    type Cell = { text: string; field?: string; right: number; cur?: boolean };
    const rows: { label: string; cells: Cell[]; title?: boolean; color?: string; cur?: boolean }[] = [];
    const end = w - 14;
    if (u.window === "TMR/REF") {
      // v13 trainer layout: titled REFERENCES, the timer on one row, GLIDE for the glide speed, minimums on one row.
      const t = Math.round(this.timerValue());
      const p2 = (n: number) => String(n).padStart(2, "0");
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
        { text: s.minimums === null ? "____FT" : `${s.minimums}FT`, field: "minalt", right: end },
      ] });
    } else if (u.window === "DME") {
      // v13 trainer: DME TUNING, the NAV radio the DME window shows; the small FMS knob switches it.
      rows.push({ label: "DME TUNING", cells: [], title: true });
      rows.push({ label: "DME  MODE", cells: [{ text: u.dmeSource, field: "mode", right: end }] });
    } else if (u.window === "SETUP") {
      // v13 trainer: PFD SETUP MENU, the display brightness. shortcut: brightness is not ported, so it stays on AUTO.
      rows.push({ label: "PFD SETUP MENU", cells: [], title: true });
      rows.push({ label: "PFD DSPL", cells: [{ text: "AUTO", right: 150, cur: true }, { text: "100.00%", right: end }] });
      rows.push({ label: "MFD DSPL", cells: [{ text: "AUTO", right: 150 }, { text: "___._%", right: end }] });
    } else if (u.window === "MENU") {
      // v13 trainer: the flight plan's PAGE MENU; available options cyan, the rest grey, scrolling with the cursor.
      const opts = this.pageMenu();
      const shown = Math.max(1, Math.floor((h - 8) / 22) - 2);
      const top = firstRow(u.cursor, opts.length, shown);
      rows.push({ label: "PAGE MENU", cells: [], title: true }, { label: "OPTIONS", cells: [] });
      opts.slice(top, top + shown).forEach((o, i) => rows.push({ label: o.label, cells: [], color: o.patch ? CYAN : "#808080", cur: top + i === u.cursor }));
    } else {
      for (const a of s.alerts) rows.push({ label: a, cells: [] });
    }
    const line = Math.min(22, (h - 8) / Math.max(rows.length, 1));
    const width = (text: string) => text.length * 10 + 8; // shortcut: estimated text width for the cursor box
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" stroke="#ffffff" stroke-width="2"/>`;
    rows.forEach(({ label, cells, title, color, cur: on }, i) => {
      const ty = y + 6 + line * (i + 0.8);
      if (on) out += `<rect x="${x + 6}" y="${ty - line * 0.8}" width="${width(label)}" height="${line}" fill="${CYAN}"/>`;
      out += title
        ? `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" ${FONT} fill="#ffffff">${esc(label)}</text>`
        : `<text x="${x + 10}" y="${ty}" ${FONT} fill="${on ? "#000" : color ?? "#ffffff"}">${esc(label)}</text>`;
      for (const c of cells) {
        const cur = c.cur ?? ((u.window === "TMR/REF" && TMR_FIELDS[u.cursor] === c.field) || c.field === "mode");
        if (cur) out += `<rect x="${x + c.right - width(c.text) + 4}" y="${ty - line * 0.8}" width="${width(c.text)}" height="${line}" fill="${CYAN}"/>`;
        out += `<text x="${x + c.right}" y="${ty}" text-anchor="end" ${FONT} fill="${cur ? "#000" : CYAN}">${esc(c.text)}</text>`;
      }
    });
    this.win.innerHTML = out;
  }

  // Surround.updateHeaderData, PFD half.
  private updateLeg(leg: PfdState["leg"]) {
    const sp = this.surround.p;
    sp.text("HeaderTo", leg?.to ?? "");
    sp.text("HeaderFrom", leg?.from ?? "");
    sp.show("HeaderActiveLeg", !!leg && leg.from !== null);
    sp.show("HeaderDTO", !!leg && leg.from === null);
    sp.text("LegDistance", leg ? `${leg.dis.toFixed(1)}nm` : "");
    sp.text("LegBRG", leg ? deg3(leg.brg) : "");
  }

  private updateAI(pitch: number, roll: number, slip: number) {
    pitch = clamp(pitch, -80, 80);
    this.p.tf("Horizon", { ty: pitch * 6.849, rot: -roll, center: [459, 282.8 - 6.849 * pitch] });
    this.p.tf("bankPointer", { rot: -roll });
    this.p.tf("SlipSkid", { tx: -20 * slip });
  }

  private updateFD({ fd, pitch, roll }: PfdState) {
    // Command bars disappear beyond -20/+30 pitch or 65 bank.
    const on = !!fd && pitch >= -20 && pitch <= 30 && Math.abs(roll) <= 65;
    this.p.show("FlightDirector", on);
    if (fd && on) this.p.tf("FlightDirector", { ty: -(fd.pitch - pitch) * 6.849, rot: -(roll - fd.roll), center: [459, 282.8] });
  }

  private updateIAS(ias: number, trend: number) {
    const on = this.state.vspeedsOn;
    this.p.text("Speed110", ias >= 10 ? pad(Math.floor(ias / 10), 2) : "");
    this.p.tf("SpeedLint1", { ty: (mod(ias, 10) + (ias >= 10 ? 10 : 0)) * 36 });
    this.p.tf("SpeedTape", { ty: ias * 5.711 });
    trend = clamp(trend, -30, 30);
    this.p.tf("Airspeed-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
    const bg = this.p.el("IAS-bg");
    if (bg) bg.style.fill = this.options.vne !== undefined && ias > this.options.vne ? "#ff0000" : "#000000";
    for (const v of ["Vx", "Vy", "Vr", "Vglide"] as const) {
      const spd = this.options.vspeeds?.[v];
      const show = spd !== undefined && on[v] && Math.abs(spd - ias) < 30;
      this.p.show(`IAS-${v}`, show);
      if (show) this.p.tf(`IAS-${v}`, { ty: (ias - spd!) * 5.711 });
    }
  }

  private updateVSI(vsi: number) {
    this.p.tf("VSI", { ty: vsiPointer(vsi) });
    this.p.text("VSIText", vsiText(vsi));
  }

  private updateALT(alt: number, trend: number, selected: number | null) {
    if (alt < 0) this.p.text("Alt11100", "-" + pad(Math.abs(Math.ceil(alt / 100)), 3));
    else if (alt < 100) this.p.text("Alt11100", "");
    else this.p.text("Alt11100", pad(Math.floor(alt / 100), 3));

    this.p.tf("AltLint00011", { ty: (alt % 100) * 1.24 }); // math.fmod keeps the sign of alt

    if (alt > -1000 && alt < 1000000) {
      const neg = alt < 0;
      const a = Math.abs(alt);
      this.p.tf("LintAlt", { ty: mod(a, 100) * (neg ? -0.57375 : 0.57375) });
      const central = (neg ? -1 : 1) * Math.trunc(a / 100) * 100;
      this.p.text("AltBigC", "");
      this.p.text("AltSmallC", "");
      for (let place = 1; place <= 6; place++) {
        for (const [dir, value] of [["U", central + place * 100], ["D", central - place * 100]] as const) {
          const [big, small, offset] = altLabel(value);
          this.p.text(`AltBig${dir}${place}`, big);
          this.p.text(`AltSmall${dir}${place}`, small);
          this.p.tf(`AltSmall${dir}${place}`, { tx: offset });
        }
      }
    }

    trend = clamp(trend, -15, 15);
    this.p.tf("Altitude-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
    if (selected !== null) this.p.tf("SelectedALT-bug", { ty: clamp(alt - selected, -300, 300) * 0.567 });
  }

  // v13 trainer: the label names the station type, VOR1 or LOC2 (FG1000: NAV1, NAV2).
  private setCDISource(source: CdiSource, label: string) {
    for (const s of ["GPS", "NAV1", "NAV2"]) {
      for (const part of ["pointer", "CDI", "FROM", "TO"]) this.p.show(`${s}-${part}`, source === s);
    }
    this.p.text("CDI-SRC-text", label, source === "GPS" ? MAGENTA : GREEN);
    this.p.show("CDI-SRC-text", source !== "OFF");
  }

  private updateCDI(s: PfdState) {
    const src = s.cdiSource;
    if (src === "OFF") return;
    if (!s.cdiValid) {
      for (const part of ["CDI", "FROM", "TO", "pointer"]) this.p.show(`${src}-${part}`, false);
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
    if (xtk) this.p.text("CDI-GPS-XTK-text", `XTK ${Math.abs(s.xtk).toFixed(2)}NM`);
    this.p.show("CDI-GPS-ANN-text", src === "GPS");
    if (src === "GPS") this.p.text("CDI-GPS-ANN-text", s.obs ? "OBS" : s.gpsMode);
    this.p.tf(`${src}-CDI`, { tx: (80 * clamp(s.cdiDots, -2.4, 2.4)) / 2.4 });
    this.p.show(`${src}-TO`, !s.from);
    this.p.show(`${src}-FROM`, s.from);
  }

  // _setBRG and _updateBRG: a source with nothing to point at shows dashes and no needle.
  private updateBRG(brg: "BRG1" | "BRG2", source: BrgSource, s: PfdState) {
    const b = source === "OFF" ? undefined : s.bearings[source];
    this.p.show(brg, source !== "OFF");
    this.p.show(`${brg}-pointer`, !!b);
    if (source === "OFF") return;
    this.p.text(`${brg}-SRC-text`, source);
    this.p.text(`${brg}-WPID-text`, b?.id ?? "----");
    this.p.text(`${brg}-DST-text`, source === "ADF" ? "" : b?.distance === undefined ? "--nm" : `${b.distance.toFixed(1)}NM`);
    if (b) this.p.tf(`${brg}-pointer`, { rot: b.bearing - s.heading });
  }
}


// Altitude tape label for one 100 ft line: [thousands, hundreds, x offset of the hundreds], as FG1000 lays it out.
function altLabel(v: number): [string, string, number] {
  let offset = -30.078;
  let prefix = "";
  if (v < 0) {
    v = -v;
    prefix = "-";
    offset += 15.039;
  }
  if (v === 0) return ["", "0", offset];
  if (v % 500 === 0) return [prefix + v, "", offset];
  if (v < 1000) return ["", prefix + (v % 1000), -30.078];
  if (v < 10000) return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 15.039];
  return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 30.078];
}

