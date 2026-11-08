// Glass MFD for the browser: the FG1000 MFD's surround and page groups (Nasal/MFDPages/Surround), engine strip
// (Nasal/EIS/EIS.nas) and pages (Nasal/MFDPages/*, see mfd-pages.ts), Copyright 2018 Stuart Buchanan, ported to
// TypeScript. GPL-2.0-or-later.
//
// FlightGear draws the map with its own Canvas map layers and navigation database. Here the map draws only the points
// it is given, with the symbols and styles of the FG1000 layers (Nasal/canvas/map/*.symbol.nas,
// NavigationMapStyles.nas) and the ownship icon from FG1000/Icons/APSmodel.svg.
import NAV_MAP from "./svg/nav-map.js";
import EIS from "./svg/eis.js";
import SURROUND from "./svg/surround-mfd.js";
import PAGE_SVGS from "./svg/mfd-pages.js";
import { buildDisplay, type DisplayOptions } from "./display.js";
import { Page, clamp, deg3, mod } from "./page.js";
import { panInfo, panMarkup, panMeasureFrom, panMove, panProject, panStart, panTarget, type PanView } from "./pan.js";
import { drawMap, mapGroup, rangeLabel, stepRange, type Airspace, type LatLon, type MapGeometry, type MapPoint } from "./map.js";
import { RADIOS, Surround } from "./surround.js";
import type { CdiSource } from "./glass-pfd.js";
import { adjust, bezelInput, type Input, type Knobs } from "./bezel.js";
import type { Airport, Procedure, Station } from "./nav.js";
import { BLANK, Highlighter, NS, dimKey, key, type Key } from "./ui.js";
import { PAGE_GROUPS, makePages, type Checklist, type Mfd, type MfdPage, type MfdUi, type Pages } from "./mfd-pages.js";

/** The pan info bar's text size, px. */
const PAN_FONT = 18;

export interface Engine {
  rpm: number;
  /** Gallons per hour. */ fuelFlow: number;
  /** PSI. */ oilPressure: number;
  /** Degrees F. */ oilTemp: number;
  /** Exhaust gas temperature, 0 to 1 of the scale. */ egt: number;
  /** Inches of mercury. */ vacuum: number;
  /** Gallons. */ fuelLeft: number;
  /** Gallons. */ fuelRight: number;
  volts: number;
  engineHours: number;
}

/** The knob values (`Knobs`) are not drawn on the MFD; its knobs change them, so a host can share them with a PFD. */
export interface MfdState extends Knobs {
  /** Ground track, degrees. */ track: number;
  /** Knots. */ groundspeed: number;
  /** Desired track, degrees; null shows dashes. */ dtk: number | null;
  /** Time to the next waypoint, seconds; null shows dashes. */ ete: number | null;
  /** Aircraft position, decimal degrees. */ lat: number;
  lon: number;
  /** Magnetic variation, degrees east positive: bearings on the pages are magnetic. */ magVar: number;
  /** Map range, nm from the aircraft to the edge of the map's short side. */ range: number;
  orientation: "NORTH UP" | "HDG UP";
  /** Map symbols, and the VORs, NDBs and fixes the NRST and WPT pages list (`name`, `freq` and the rest fill in their details). */
  points: MapPoint[];
  airspaces: Airspace[];
  /** For the NRST and WPT airport pages, DIRECT TO and PROC. */ airports: Airport[];
  /** ARTCC, FSS and weather frequencies for NRST - NEAREST FREQUENCIES. */ stations: Station[];
  /** Approaches PROC can load, for the airports in `airports`. */ procedures: Procedure[];
  /** Flight plan in order: ids of `points` or `airports`, or points of its own (approach fixes). FPL, DIRECT TO and PROC change it. */
  route: (string | MapPoint)[];
  /** Index into `route` of the active waypoint; the leg into it is magenta. */ activeLeg: number;
  /** Set by DIRECT TO: where the direct leg to the active waypoint starts. */ directFrom: LatLon | null;
  /** Vector-to-final is active (PROC): the active waypoint is the final approach fix, on the final course. */ vtf: boolean;
  engine: Engine;
  /** Which NAV shows green as the CDI source. */ cdiSource: CdiSource;
  /** Bearing to each NAV radio's station, magnetic (the PFD's `bearings` fit): CRS push sets the course to the CDI radio's. */
  bearings: Partial<Record<"NAV1" | "NAV2", { bearing: number }>>;
  /** For LST - CHECKLIST. */ checklists: Checklist[];
}

const DEFAULTS: MfdState = {
  heading: 0, headingBug: 0, course: 0, baro: 29.92, alt: 0, selectedAlt: null, track: 0, groundspeed: 0, dtk: null, ete: null,
  lat: 0, lon: 0, magVar: 0, range: 10, orientation: "NORTH UP",
  points: [], airspaces: [], airports: [], stations: [], procedures: [], route: [], activeLeg: 1, directFrom: null, vtf: false,
  engine: { rpm: 0, fuelFlow: 0, oilPressure: 0, oilTemp: 0, egt: 0, vacuum: 0, fuelLeft: 0, fuelRight: 0, volts: 0, engineHours: 0 },
  radios: RADIOS, navVolume: 0.5, comVolume: 0.5, navIdent: false, cdiSource: "NAV1", bearings: {}, checklists: [],
};

// EIS.new: pointer name, min, max, travel in px (PFD.PointerElement).
const POINTERS: [string, keyof Engine, number, number][] = [
  ["FuelFlowPointer", "fuelFlow", 0, 20], ["OilPressurePointer", "oilPressure", 0, 115], ["OilTempPointer", "oilTemp", 0, 245],
  ["EGTPointer", "egt", 0, 1], ["EGTCylinder", "egt", 0, 1], ["VacPointer", "vacuum", 3, 7],
  ["LeftFuelPointer", "fuelLeft", 0, 30], ["RightFuelPointer", "fuelRight", 0, 30],
];

export interface MfdOptions extends DisplayOptions {
  /** Called when a bezel input changes the state (range, radios, flight plan, and the shared knob values). */
  onChange?: (patch: Partial<MfdState>) => void;
}

// Constants.nas MAP_FULL and MAP_PARTIAL: header 56 px, footer 25 px, engine strip 150 px, data display 300 px; the
// map's range is 689/2 px (NavMap.nas) either way.
const MAP_FULL: MapGeometry = { x: 150, y: 56, w: 874, h: 687, cx: 587, cy: 399.5, px: 344.5 };
const MAP_PARTIAL: MapGeometry = { x: 150, y: 56, w: 574, h: 687, cx: 437, cy: 399.5, px: 344.5 };
// Surround.showMenu: the selected group and page, and the rest.
// v13 trainer: the page group window shows the selected page in cyan and the rest in white (FG1000: lilac and grey).
const MENU_SELECTED = "#00ffff";
const MENU_OTHER = "#ffffff";

export class GlassMfd {
  readonly svg: SVGSVGElement;
  private state: MfdState = { ...DEFAULTS };
  private eis: Page;
  private nav: Page;
  private surround: Surround;
  /** Removes the bezel's window listener. */ private unbezel = () => {};
  private raw: Page;
  private map: SVGGElement;
  private mapPartial: SVGGElement;
  /** Pan mode's pointer and info bar, over the full map. */ private panLayer: SVGGElement;
  private frame: SVGTextElement;
  private pages: Pages;
  /** DIRECT TO, PROC, WAYPOINT ENTRY or the PAGE MENU, over the page. */ private overlay: MfdPage | null = null;
  /** The page FPL goes back to: group and page names. */ private beforeFpl: [string, string] = ["MapPageGroup", "NavigationMap"];
  private timers = { menu: 0, load: 0 };
  private hl = new Highlighter();
  private ui: MfdUi = {
    group: 0, page: 0, shown: [0, 0], menuVisible: false, menu: "top", dcltr: 0, airways: 0,
    layers: { TRAFFIC: false, PROFILE: false, TOPO: false, TERRAIN: false }, recent: [], pan: null,
  };

  /** The container must be visible: layout is measured once here. */
  constructor(container: HTMLElement, private options: MfdOptions = {}) {
    const { svg, screen } = buildDisplay(container, [NAV_MAP, ...Object.values(PAGE_SVGS), SURROUND, EIS], "Multi-function display", options);
    this.svg = svg;
    this.eis = new Page(screen, "EIS");
    this.nav = new Page(screen, "NavigationMap");
    this.surround = new Surround(screen);
    this.raw = new Page(screen, "");

    // The map sits above its black background and below the range/orientation legend.
    this.map = mapGroup(screen, this.nav.el("Legend")!, MAP_FULL);
    this.mapPartial = mapGroup(screen, this.nav.el("Legend")!, MAP_PARTIAL);
    this.panLayer = mapGroup(screen, this.nav.el("Legend")!, MAP_FULL);
    // Pages with no data source (weather, terrain, AUX) show their title and this line, under the surround.
    this.frame = document.createElementNS(NS, "text");
    for (const [k, v] of Object.entries({ x: "587", y: "110", "text-anchor": "middle", fill: "#ffffff", "font-size": "22", "font-family": "'Liberation Sans',Arial,sans-serif" })) {
      this.frame.setAttribute(k, v);
    }
    let surround: Node = this.raw.el("PageTitle")!;
    while (surround.parentNode !== screen) surround = surround.parentNode!;
    screen.insertBefore(this.frame, surround);
    this.pages = makePages(this.api(), screen);
    if (options.bezel) this.unbezel = bezelInput(svg, (i) => this.input(i));
    this.loadPage();
  }

  /** Stops the page menu timers. Call when the display is removed. */
  destroy(): void {
    clearTimeout(this.timers.menu);
    clearTimeout(this.timers.load);
    this.surround.destroy();
    this.unbezel();
  }

  // What the pages may use.
  private api(): Mfd {
    const self = this;
    return {
      get s() {
        return self.state;
      },
      ui: this.ui,
      hl: this.hl,
      change: (patch) => this.change(patch),
      go: (group, page) => this.goToPage(group, page),
      tune: (freq) => this.tune(freq),
      topKeys: (extra) => this.topKeys(extra),
      drawMap: (g, geom, center) => drawMap(g, { ...this.state, center }, geom, this.ui.dcltr),
      open: (p) => this.openOverlay(p),
      close: () => this.closeOverlay(),
    };
  }

  /** The page under DIRECT TO or PROC. */
  private get groupPage(): MfdPage {
    return this.pages.groups[this.ui.shown[0]][this.ui.shown[1]];
  }

  private get page(): MfdPage {
    return this.overlay ?? this.groupPage;
  }

  private input(i: Input) {
    this.options.onInput?.(i);
    const page = this.page;
    switch (i.control) {
      case "NAV_TOGGLE":
      case "COM_TOGGLE":
        this.surround.toggle(i.control === "NAV_TOGGLE" ? "nav" : "com");
        return this.set({});
      case "SOFTKEY":
        this.softkeys()[i.value - 1]?.act?.();
        return this.set({});
      case "RANGE":
        // NavMap.handleRange: clockwise zooms out. Pages with their own ranges (traffic) take it first.
        if (!page.range(i.value)) {
          if (this.ui.pan && !this.overlay) this.ui.pan = panTarget(this.ui.pan, this.panView());
          this.change({ range: stepRange(this.state.range, i.value) });
        }
        return this.set({});
      case "FMS_OUTER":
      case "FMS_INNER":
        if (page.crsr && page.fms(i.control === "FMS_OUTER", i.value > 0 ? 1 : -1)) return this.set({});
        if (this.overlay) return;
        return this.pageMenu(i.control === "FMS_OUTER", i.value);
      case "FMS_CRSR":
        page.toggleCrsr();
        return this.set({});
      case "ENT":
        // Measuring (Pilot's Guide): ENT moves the start point to the pointer.
        if (this.ui.pan?.from && !this.overlay) this.ui.pan = panMeasureFrom(this.ui.pan, this.panView());
        else page.ent();
        return this.set({});
      case "CLR":
        page.clr();
        return this.set({});
      case "CLR_HOLD":
        // MFDPageController.handleClearHold: back to the navigation map.
        return this.goToPage("MapPageGroup", "NavigationMap");
      case "FPL": {
        // v13 trainer: FPL again goes back to the page shown before it ("Press the FPL key to view the previous page").
        const [gi, pi] = this.ui.shown;
        const here: [string, string] = [PAGE_GROUPS[gi].group, PAGE_GROUPS[gi].pages[pi]];
        if (here[1] === "ActiveFlightPlanNarrow") return this.overlay ? this.goToPage(...here) : this.goToPage(...this.beforeFpl);
        this.beforeFpl = here;
        return this.goToPage("FPLPageGroup", "ActiveFlightPlanNarrow");
      }
      case "MENU": {
        // v13 trainer: MENU opens the page's PAGE MENU; MENU again closes it (the trainer then opens its DEMO MODE page,
        // a simulator setting, not ported).
        const menu = this.pages.pageMenu;
        if (this.overlay === menu) this.closeOverlay();
        else if (page.pageMenu()) {
          menu.open(page.pageMenu()!, page.title, this.overlay);
          this.openOverlay(menu);
        }
        return this.set({});
      }
      case "JOYSTICK_PRESS":
        // v13 trainer: the push starts pan mode on the full navigation map; again ends it and recenters the map.
        if (this.overlay || this.groupPage.navMap !== "full") return;
        this.ui.pan = this.ui.pan ? null : panStart(this.state, this.panView().up);
        return this.set({});
      case "JOYSTICK_HORIZONTAL":
      case "JOYSTICK_VERTICAL": {
        const pan = this.ui.pan;
        if (!pan || this.overlay) return;
        const h = i.control === "JOYSTICK_HORIZONTAL";
        this.ui.pan = panMove(pan, h ? i.value : 0, h ? 0 : i.value, this.panView());
        return this.set({});
      }
      case "DTO": {
        // The waypoint selected on the page or under the pan pointer, else the active one.
        const act = this.state.route[this.state.activeLeg];
        const under = this.ui.pan && !this.overlay ? this.panInfo().label : "MAP POINTER";
        const id = page.selected() ?? (under !== "MAP POINTER" ? under : null) ?? (typeof act === "string" ? act : act?.id ?? null);
        this.openOverlay(this.pages.directTo);
        this.pages.directTo.open(id);
        return this.set({});
      }
      case "PROC":
        // v13 trainer: PROC again closes the window.
        if (this.overlay === this.pages.procedures) {
          this.closeOverlay();
          return this.set({});
        }
        this.openOverlay(this.pages.procedures);
        this.pages.procedures.open();
        return this.set({});
    }
    const src = this.state.cdiSource;
    const toStation = src === `NAV${this.surround.sel.nav}` ? this.state.bearings[src as "NAV1" | "NAV2"]?.bearing : null;
    const patch = adjust(i, this.state, this.surround.sel, toStation);
    if (patch) this.change(patch);
  }

  private change(patch: Partial<MfdState>) {
    this.set(patch);
    this.options.onChange?.(patch);
  }

  private openOverlay(p: MfdPage) {
    this.overlay?.show(false);
    this.overlay = p;
    this.hideMenu();
    this.ui.menu = "top";
    p.show(true);
    this.surround.setPageTitle(p.title);
  }

  private closeOverlay() {
    if (!this.overlay) return;
    this.overlay.show(false);
    this.overlay = null;
    this.surround.setPageTitle(this.page.title);
  }

  // SurroundController.handleFMSOuter / Inner: the first click shows the page group menu, later ones step through it;
  // the page loads half a second after the last click and the menu hides after three.
  private pageMenu(outer: boolean, value: number) {
    const u = this.ui;
    if (u.menuVisible) {
      const d = value > 0 ? 1 : -1;
      if (outer) {
        u.group = mod(u.group + d, PAGE_GROUPS.length);
        u.page = 0;
      } else {
        u.page = mod(u.page + d, PAGE_GROUPS[u.group].pages.length);
      }
    }
    this.showMenu();
    clearTimeout(this.timers.menu);
    clearTimeout(this.timers.load);
    this.timers.menu = window.setTimeout(() => this.hideMenu(), 3000);
    this.timers.load = window.setTimeout(() => this.loadPage(), 500);
  }

  private showMenu() {
    const u = this.ui;
    u.menuVisible = true;
    PAGE_GROUPS.forEach((g, gi) => {
      const sel = gi === u.group;
      this.raw.show(g.group, sel);
      this.raw.show(g.label, true);
      this.color(g.label, MENU_OTHER);
      if (sel) g.pages.forEach((p, pi) => this.color(p, pi === u.page ? MENU_SELECTED : MENU_OTHER));
    });
  }

  private hideMenu() {
    this.ui.menuVisible = false;
    for (const g of PAGE_GROUPS) {
      this.raw.show(g.group, false);
      this.raw.show(g.label, false);
    }
  }

  private color(id: string, c: string) {
    const e = this.raw.el(id);
    if (e) for (const t of [e, ...e.querySelectorAll<SVGElement>("text, tspan")]) t.style.fill = c;
  }

  /** Surround.goToPage: by group and page name. */
  private goToPage(group: string, page: string) {
    const gi = PAGE_GROUPS.findIndex((g) => g.group === group);
    if (gi < 0) return;
    this.ui.group = gi;
    this.ui.page = Math.max(0, PAGE_GROUPS[gi].pages.indexOf(page));
    this.hideMenu();
    this.loadPage();
  }

  private loadPage() {
    const u = this.ui;
    this.closeOverlay();
    this.groupPage.show(false);
    if (u.shown[0] !== u.group || u.shown[1] !== u.page) u.pan = null; // the page group menu reloads the same page too
    u.shown = [u.group, u.page];
    u.menu = "top";
    this.groupPage.show(true);
    this.surround.setPageTitle(this.groupPage.title);
    this.set({});
  }

  /** Merge new values into the state and redraw. */
  set(patch: Partial<MfdState>): void {
    const s = (this.state = { ...this.state, ...patch });
    const page = this.page;
    const under = this.groupPage;
    this.surround.setRadios(s.radios, s.cdiSource === "NAV1" ? 1 : s.cdiSource === "NAV2" ? 2 : null);
    this.surround.setVolume("Nav", s.navVolume);
    this.surround.setVolume("Comm", s.comVolume);
    const keys = this.softkeys();
    this.surround.setSoftkeys(keys.map((k) => k.label), keys.map((k) => !!k.lit), keys.map((k) => !!k.dim));
    this.updateHeader(s);
    this.updateEIS(s.engine);
    // NavigationMap.ondisplay / ondisplayPartial: the full map, the map beside a page's data, or none. DIRECT TO and
    // WAYPOINT ENTRY are windows over the page, which stays drawn.
    const base = page === this.pages.directTo || page === this.pages.waypointEntry || page === this.pages.pageMenu ? under : page;
    const mode = base.navMap;
    this.nav.show("Group", mode !== null);
    this.map.style.display = mode === "full" ? "inline" : "none";
    this.mapPartial.style.display = mode === "partial" ? "inline" : "none";
    if (mode) {
      this.nav.tf("Legend", { tx: mode === "partial" ? MAP_PARTIAL.w - MAP_FULL.w : 0 });
      this.nav.text("RangeDisplay", rangeLabel(s.range));
      this.nav.text("OrientationDisplay", s.orientation);
      const pan = mode === "full" ? this.ui.pan : null;
      const center = pan?.center ?? base.center() ?? undefined;
      drawMap(mode === "full" ? this.map : this.mapPartial, { ...s, center, up: pan?.up }, mode === "full" ? MAP_FULL : MAP_PARTIAL, this.ui.dcltr);
    }
    this.drawPan(mode === "full");
    this.frame.textContent = base.frame();
    if (base !== page) base.draw();
    page.draw();
  }

  private panView(): PanView {
    const s = this.state;
    const up = this.ui.pan?.up ?? (s.orientation === "HDG UP" ? s.heading : 0);
    return { w: MAP_FULL.w, h: MAP_FULL.h, scale: MAP_FULL.px / s.range, up, lat: s.lat, bar: PAN_FONT * 2.7 };
  }

  private panInfo() {
    const s = this.state;
    const named = [...s.points, ...s.route.filter((r): r is MapPoint => typeof r !== "string")];
    return panInfo(this.ui.pan!, this.panView(), this.ui.pan!.from ?? s, named, s.magVar);
  }

  /** Pan mode: the pointer, and the info bar across the top of the map (layout from the v13 trainer, drawn here). */
  private drawPan(shown: boolean) {
    const pan = shown ? this.ui.pan : null;
    this.panLayer.style.display = pan ? "inline" : "none";
    if (!pan) return;
    const start = pan.from && panProject(pan, pan.from, this.panView());
    this.panLayer.innerHTML = panMarkup(pan, this.panInfo(), MAP_FULL, PAN_FONT, start);
  }

  // The softkeys: the page's own, or a menu shared by the pages (EIS engineMenu, NavigationMap mapMenu).
  private softkeys(): Key[] {
    const u = this.ui;
    const to = (m: string) => () => (u.menu = m);
    const eis = (): Key[] => [key("ENGINE", to("engine"), u.menu === "engine"), key("LEAN", to("lean"), u.menu === "lean"), key("SYSTEM", to("system"), u.menu === "system")];
    const fill = (k: Key[]) => [...k, ...Array(12).fill(BLANK)].slice(0, 12);
    // v13 trainer layouts: BACK in the eleventh slot, LEAN's and SYSTEM's keys where the trainer has them (FG1000 packs
    // them after SYSTEM), and dim keys for data GCW has no source for.
    switch (u.menu) {
      // shortcut: the engine strip has only its ENGINE page (as FG1000); LEAN and SYSTEM change the softkeys only.
      case "engine":
        return fill([...eis(), BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, key("BACK", to("top"))]);
      case "lean":
        return fill([...eis(), BLANK, key("CYL SLCT"), key("ASSIST"), BLANK, BLANK, BLANK, BLANK, key("BACK", to("engine"))]);
      case "system":
        return fill([...eis(), BLANK, BLANK, BLANK, key("RST FUEL"), key("GAL REM"), BLANK, BLANK, key("BACK", to("engine"))]);
      case "map": {
        // shortcut: no traffic, profile or airway data; these keys switch only their setting.
        const layer = (n: string) => key(n, () => (u.layers[n] = !u.layers[n]), u.layers[n]);
        const airways = ["AIRWAYS", "AIRWY ON", "AIRWY LO", "AIRWY HI"];
        return fill([layer("TRAFFIC"), layer("PROFILE"), dimKey("TOPO"), dimKey("TERRAIN"),
          key(airways[u.airways], () => (u.airways = (u.airways + 1) % 4), u.airways > 0), BLANK, dimKey("PRECIP"), BLANK, dimKey("METAR"),
          dimKey("LEGEND"), key("BACK", to("top"))]);
      }
    }
    return fill(this.page.keys());
  }

  // Most pages start with ENGINE and MAP (EIS.engineMenu, NavigationMap.mapMenu).
  private topKeys(extra: Record<number, Key> = {}): Key[] {
    const k: Key[] = Array(12).fill(BLANK);
    k[0] = key("ENGINE", () => (this.ui.menu = "engine"));
    k[2] = key("MAP", () => (this.ui.menu = "map"));
    for (const [i, v] of Object.entries(extra)) k[Number(i)] = v;
    return k;
  }

  // A frequency from a page (ENT on a NRST or WPT frequency) goes to the standby of the selected NAV or COM.
  private tune(freq: number) {
    const r = this.state.radios;
    const nav = freq >= 108 && freq < 118;
    if (!nav && (freq < 118 || freq >= 137)) return;
    const which = nav ? (`nav${this.surround.sel.nav}` as const) : (`com${this.surround.sel.com}` as const);
    this.change({ radios: { ...r, [which]: { ...r[which], standby: freq } } });
  }

  // Surround.updateHeaderData, MFD half: the default fields GS, DTK, TRK, ETE.
  private updateHeader(s: MfdState) {
    const fields: [string, string][] = [
      ["GS", `${Math.round(s.groundspeed)}kts`],
      ["DTK", s.dtk === null ? "---°" : deg3(s.dtk)],
      ["TRK", deg3(s.track)],
      ["ETE", s.ete === null ? "--:--" : ete(s.ete)],
    ];
    fields.forEach(([label, value], i) => {
      this.surround.p.text(`Header${i + 1}Label`, label);
      this.surround.p.text(`Header${i + 1}Value`, value);
    });
  }

  // EIS.updateData
  private updateEIS(e: Engine) {
    this.eis.text("RPMDisplay", String(Math.round(e.rpm)));
    this.eis.text("MBusVolts", e.volts.toFixed(1));
    this.eis.text("EBusVolts", e.volts.toFixed(1)); // FG1000 shows the main bus on both
    this.eis.text("EngineHours", e.engineHours.toFixed(1));
    for (const [name, key, min, max] of POINTERS) this.eis.tf(name, { tx: ((clamp(e[key], min, max) - min) / (max - min)) * 135 });
    // PFD.RotatingElement: 0-3000 RPM over 260°, about the needle's hub (its Inkscape transform center).
    this.eis.tf("RPMPointer", { rot: (clamp(e.rpm, 0, 3000) / 3000) * 260 });
  }
}

// ETE as Surround.updateHeaderData formats it: m:ss under an hour, h:mm over.
export function ete(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return s < 3600 ? `${Math.floor(s / 60)}:${p2(s % 60)}` : `${Math.floor(s / 3600)}:${p2(Math.floor(s / 60) % 60)}`;
}
