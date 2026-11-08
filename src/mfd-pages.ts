// The MFD's pages: ports of FG1000 Nasal/MFDPages/* (Copyright 2018 Stuart Buchanan), GPL-2.0-or-later. Each page
// draws into its FG1000 SVG (src/fg1000/<page>.svg, prefix <page>) and takes the FMS knob, CRSR, ENT and CLR while its
// cursor is on. Pages FG1000 has no data for show their title, their softkeys, and NO DATA.
import { Page, clamp, deg3, mod } from "./page.js";
import { mapGroup, rangeLabel, type LatLon, type MapGeometry, type MapPoint } from "./map.js";
import { approachPatch, asWaypoint, bearingDistance, gpsApproved, latLon, loadedApproach, nearest, planName, routePoint, vtfEdit, vtfPatch, type Airport, type Procedure } from "./nav.js";
import { BLANK, CYAN, Highlighter, IdEntry, ListView, NS, dimKey, firstRow, key, type Key } from "./ui.js";
import { firstOption, fplMenu, stepMenu, type MenuOption } from "./page-menu.js";
import type { MfdState } from "./glass-mfd.js";

/** A checklist for LST - CHECKLIST, e.g. { group: "EMERGENCY", name: "ENGINE FIRE", items: [{ name: "Mixture", value: "IDLE CUTOFF" }] }. */
export interface Checklist { group: string; name: string; items: { name: string; value: string }[] }

export interface MfdUi {
  /** The page group menu's selection. */ group: number;
  page: number;
  /** The page on screen: group and page. */ shown: [number, number];
  menuVisible: boolean;
  /** The shared softkey menu showing: "top" (the page's own), "engine", "lean", "system" or "map". */ menu: string;
  /** Declutter level, 0 to 3. */ dcltr: number;
  /** Airways key state, 0 to 3. */ airways: number;
  /** MAP menu toggles. */ layers: Record<string, boolean>;
  /** Waypoints entered in DIRECT TO and WAYPOINT ENTRY, latest first: their RECENT list. */ recent: string[];
}

/** What the MFD gives its pages. */
export interface Mfd {
  readonly s: MfdState;
  readonly ui: MfdUi;
  readonly hl: Highlighter;
  change(patch: Partial<MfdState>): void;
  go(group: string, page: string): void;
  /** Puts a frequency in the standby of the selected NAV or COM, by band. */ tune(freq: number): void;
  /** ENGINE and MAP, plus the page's own keys by index. */ topKeys(extra?: Record<number, Key>): Key[];
  /** Draws the map into a page's own map window. */ drawMap(g: SVGGElement, geom: MapGeometry, center?: LatLon): void;
  /** Opens a window over the page (WAYPOINT ENTRY). */ open(p: MfdPage): void;
  /** Closes DIRECT TO, PROC or WAYPOINT ENTRY. */ close(): void;
}

// Surround.PAGE_GROUPS
export const PAGE_GROUPS = [
  { group: "MapPageGroup", label: "MapPageGroupLabel", pages: ["NavigationMap", "TrafficMap", "Stormscope", "WeatherDataLink", "TAWSB"] },
  { group: "WPTPageGroup", label: "WPTGroupLabel", pages: ["AirportInfo", "IntersectionInfo", "NDBInfo", "VORInfo", "UserWPTInfo"] },
  { group: "AuxPageGroup", label: "AuxGroupLabel", pages: ["TripPlanning", "Utility", "GPSStatus", "XMRadio", "SystemStatus"] },
  { group: "FPLPageGroup", label: "FPLGroupLabel", pages: ["ActiveFlightPlanNarrow", "FlightPlanCatalog", "StoredFlightPlan"] },
  { group: "LstPageGroup", label: "LstGroupLabel", pages: ["Checklist"] },
  { group: "NrstPageGroup", label: "NrstGroupLabel", pages: ["NearestAirports", "NearestIntersections", "NearestNDB", "NearestVOR", "NearestUserWaypoints", "NearestFrequencies", "NearestAirspaces"] },
];

// Each page's title (<page>.nas, the second argument to MFDPage.new).
const TITLES: Record<string, string> = {
  NavigationMap: "MAP - NAVIGATION MAP", TrafficMap: "MAP - TRAFFIC MAP", Stormscope: "MAP - STORMSCOPE", WeatherDataLink: "MAP - WEATHER DATA LINK",
  TAWSB: "MAP - TAWS", AirportInfo: "WPT - AIRPORT INFORMATION", IntersectionInfo: "WPT - INTERSECTION INFORMATION", NDBInfo: "WPT - NDB INFORMATION",
  VORInfo: "WPT - VOR INFORMATION", UserWPTInfo: "WPT - USER WPT INFORMATION", TripPlanning: "AUX - TRIP PLANNING", Utility: "AUX - UTILITY",
  GPSStatus: "AUX - GPS STATUS", XMRadio: "AUX - XM RADIO", SystemStatus: "AUX - SYSTEM STATUS", ActiveFlightPlanNarrow: "FPL - ACTIVE FLIGHT PLAN",
  FlightPlanCatalog: "FPL - FLIGHT PLAN CATALOG", StoredFlightPlan: "FPL - STORED FLIGHT PLAN", Checklist: "LST - CHECKLIST",
  NearestAirports: "NRST - NEAREST AIRPORTS", NearestIntersections: "NRST - NEAREST INTERSECTIONS", NearestNDB: "NRST - NEAREST NDB",
  NearestVOR: "NRST - NEAREST VOR", NearestUserWaypoints: "NRST - NEAREST USER WPTS", NearestFrequencies: "NRST - NEAREST FREQUENCIES",
  NearestAirspaces: "NRST - NEAREST AIRSPACES", DirectTo: "DIRECT TO", Procedures: "PROC - PROCEDURES",
  WaypointEntry: "FPL - ACTIVE FLIGHT PLAN", // a window over the flight plan page, which keeps its title
};

// The map windows of pages with their own map (their <page>NavMap-bg, in screen pixels); FG1000 keeps the full map's
// scale, 689/2 px to the range.
const INFO_MAP: MapGeometry = { x: 150, y: 56, w: 550, h: 687, cx: 425, cy: 399.5, px: 344.5 };
const FPL_MAP: MapGeometry = { x: 150, y: 56, w: 440, h: 687, cx: 370, cy: 399.5, px: 344.5 };
const DTO_MAP: MapGeometry = { x: 705, y: 278, w: 315, h: 325, cx: 862.5, cy: 440.5, px: 162.5 };

// MFDPage.setTextElementBearing / Distance / NavFreq / MagVar
const brg = (b: number | null | undefined) => (b == null ? "___°" : `${Math.round(b) % 360}°`);
const dis = (d: number | null | undefined) => (d == null ? "___nm" : `${d.toFixed(1)}nm`);
const navFreq = (f: string | undefined) => (f ? Number(f).toFixed(2) : "___.__");
const magVar = (v: number | undefined) => (v == null ? "" : v < 0 ? `${Math.round(-v)}°W` : `${Math.round(v)}°E`);

/** A page: its SVG elements and how it takes the knobs. The base is a page with no data (title, NO DATA). */
export class MfdPage {
  /** The FMS cursor is on the page (CRSR). */ crsr = false;
  /** The navigation map behind the page: the whole map, or the map beside the page's data. */
  navMap: "full" | "partial" | null = null;
  protected p: Page;
  protected root: SVGGElement | null;
  protected get s() {
    return this.m.s;
  }

  constructor(protected m: Mfd, readonly name: string, screen: SVGGElement) {
    this.p = new Page(screen, name);
    this.root = screen.querySelector(`[id="Page-${name}"]`);
  }

  get title() {
    return TITLES[this.name] ?? this.name;
  }

  show(on: boolean) {
    if (this.root) this.root.style.display = on ? "inline" : "none";
    if (!on) this.crsr = false;
  }

  /** The text shown on pages with no data source, or "". */
  frame(): string {
    return this.root ? "" : "NO DATA";
  }

  keys(): Key[] {
    return this.m.topKeys();
  }

  /** The FMS knob with the cursor on; false leaves the turn to the page menu. */
  fms(_outer: boolean, _d: number): boolean {
    return false;
  }

  toggleCrsr() {
    this.crsr = !this.crsr;
  }

  ent() {}
  clr() {}

  /** The RANGE knob, if the page has its own ranges. */
  range(_d: number) {
    return false;
  }

  /** Where the navigation map centers, if not on the aircraft. */
  center(): LatLon | null {
    return null;
  }

  /** The waypoint DIRECT TO starts with from this page (the one under the cursor). */
  selected(): string | null {
    return null;
  }

  /** The MENU key's PAGE MENU options, or null for a page without one here. */
  pageMenu(): MenuOption[] | null {
    return null;
  }

  draw() {}
}

/** A page with its own map window beside its data. */
class MapPage extends MfdPage {
  protected g: SVGGElement;

  constructor(m: Mfd, name: string, screen: SVGGElement, private geom: MapGeometry) {
    super(m, name, screen);
    // Under the range legend (DIRECT TO has no legend group, AirportInfo no legend).
    const before = this.p.el("Legend") ?? this.p.el("RangeDisplay") ?? this.root!.querySelector('[id="Background"]')!;
    this.g = mapGroup(screen, before, geom);
  }

  protected drawOwnMap() {
    this.m.drawMap(this.g, this.geom, this.center() ?? undefined);
    this.p.text("RangeDisplay", rangeLabel(this.s.range));
    this.p.text("OrientationDisplay", this.s.orientation);
  }
}

// NavigationMap.topMenu
class NavigationMapPage extends MfdPage {
  navMap = "full" as const;
  frame(): string {
    return ""; // its page is the map, drawn by the MFD
  }
  keys() {
    const u = this.m.ui;
    // v13 trainer slots: DCLTR tenth, SHW CHRT (dim, no charts) eleventh, CHKLIST twelfth (FG1000: ninth and eleventh).
    return this.m.topKeys({
      9: key(["DCLTR", "DCLTR-1", "DCLTR-2", "DCLTR-3"][u.dcltr], () => (u.dcltr = (u.dcltr + 1) % 4)),
      10: dimKey("SHW CHRT"),
      11: key("CHKLIST", () => this.m.go("LstPageGroup", "Checklist")),
    });
  }
  // v13 trainer's options; only Declutter has something to do here (no map setup, measuring, charts or profile view).
  pageMenu(): MenuOption[] {
    const u = this.m.ui;
    return [
      { label: "Map Setup" }, { label: "Declutter", act: () => (u.dcltr = (u.dcltr + 1) % 4) },
      { label: "Measure Bearing/Distance" }, { label: "Show Chart" }, { label: "Show Profile View" },
    ];
  }
}

// TrafficMap: operating mode, altitude filter and ranges. shortcut: no traffic data, so no targets are drawn.
class TrafficPage extends MfdPage {
  private op = false;
  private alt = "NORMAL";
  private menu: "top" | "alt" = "top";
  private ri = 1;

  keys() {
    const k = (label: string, act?: () => void, lit = false) => key(label, act, lit);
    if (this.menu === "alt") {
      const a = (m: string) => k(m, () => (this.alt = m), this.alt === m);
      return [BLANK, BLANK, BLANK, BLANK, a("ABOVE"), a("NORMAL"), a("BELOW"), a("UNREST"), k("BACK", () => (this.menu = "top")), BLANK, BLANK, BLANK];
    }
    return this.m.topKeys({
      4: k("STANDBY", () => (this.op = false), !this.op), 5: k("OPERATE", () => (this.op = true), this.op), 6: k("TEST"), 7: k("FLT ID"),
      8: k("ALT MODE", () => (this.menu = "alt")),
    });
  }

  range(d: number) {
    this.ri = clamp(this.ri + (d > 0 ? 1 : -1), 0, 2);
    return true;
  }

  show(on: boolean) {
    super.show(on);
    this.menu = "top";
  }

  draw() {
    this.p.text("OpMode", this.op ? "OPERATING" : "STANDBY");
    this.p.text("AltMode", this.alt === "UNREST" ? "UNRESTRICTED" : this.alt);
    const inner = [null, "2nm", "4nm"][this.ri];
    this.p.show("InnerRange", !!inner);
    this.p.text("InnerRange", inner ?? "");
    this.p.text("OuterRange", ["2nm", "6nm", "12nm"][this.ri]);
  }
}

// NearestAirports: the airport list, then the selected airport's runways, frequencies and approaches.
class NearestAirportsPage extends MfdPage {
  navMap = "partial" as const;
  private grp: "APT" | "RNWY" | "FREQ" | "APR" = "APT";
  private rwy = 0;
  private apts = new ListView(this.p, ["Arrow", "ID", "CRS", "DST"], 5, "ID", true, { trough: "AirportScrollBar", thumb: "AirportScroll" });
  private freqs = new ListView(this.p, ["FreqLabel", "Freq"], 3, "Freq", false, { trough: "FreqScrollBar", thumb: "FreqScroll" });
  private apprs = new ListView(this.p, ["Approach"], 3, "Approach", false, { trough: "ApproachScrollBar", thumb: "ApproachScroll" });

  private list() {
    return nearest(this.s.airports, this.s.lat, this.s.lon, this.s.magVar);
  }

  private get apt(): Airport | undefined {
    return this.list()[this.apts.sel]?.item;
  }

  keys() {
    const g = (label: string, grp: typeof this.grp) => key(label, () => this.select(grp), this.crsr && this.grp === grp);
    return this.m.topKeys({ 4: g("APT", "APT"), 5: g("RNWY", "RNWY"), 6: g("FREQ", "FREQ"), 7: g("APR", "APR") });
  }

  private select(grp: typeof this.grp) {
    this.crsr = true;
    this.grp = grp;
  }

  toggleCrsr() {
    super.toggleCrsr();
    this.grp = "APT";
  }

  fms(outer: boolean, d: number) {
    const a = this.apt;
    if (outer || this.grp === "APT") {
      if (this.apts.move(d, this.list().length)) [this.rwy, this.freqs.sel, this.apprs.sel] = [0, 0, 0];
      this.grp = "APT";
    } else if (this.grp === "RNWY") this.rwy = clamp(this.rwy + d, 0, Math.max(0, (a?.runways.length ?? 1) - 1));
    else if (this.grp === "FREQ") this.freqs.move(d, a?.freqs.length ?? 0);
    else this.apprs.move(d, a?.approaches.length ?? 0);
    return true;
  }

  ent() {
    const f = freqList(this.apt)[this.freqs.sel];
    if (this.crsr && this.grp === "FREQ" && f) this.m.tune(Number(f.Freq));
  }

  selected() {
    return this.crsr ? this.apt?.id ?? null : null;
  }

  draw() {
    const list = this.list();
    this.apts.draw(list.map((n) => ({ ID: n.item.id, CRS: brg(n.brg), DST: dis(n.dist) })), this.crsr && this.grp === "APT", this.m.hl);
    const a = this.apt;
    this.p.text("Name", a ? a.name.toUpperCase() : "NONE WITHIN 200NM");
    this.p.text("Alt", a ? `${Math.round(a.elev)}ft` : "");
    const r = a?.runways[this.rwy];
    this.p.text("RunwayID", r?.id ?? "");
    this.p.text("RunwayDimensions", r ? `${r.length}ft x ${r.width}ft` : "");
    this.p.text("RunwaySurface", r?.surface ?? "");
    this.p.show("RunwayIDLeft", this.rwy > 0);
    this.p.show("RunwayIDRight", !!a && this.rwy < a.runways.length - 1);
    this.m.hl.set(this.p.el("RunwayID"), this.crsr && this.grp === "RNWY" && !!r);
    this.freqs.draw(freqList(a), this.crsr && this.grp === "FREQ", this.m.hl);
    this.apprs.draw((a?.approaches ?? []).map((n) => ({ Approach: n })), this.crsr && this.grp === "APR", this.m.hl);
  }
}

// NearestAirports and AirportInfo list an airport's frequencies sorted by label (ILS frequencies are labeled "ILS <rwy>").
const freqList = (a: Airport | undefined) =>
  [...(a?.freqs ?? [])].sort((x, y) => x.use.localeCompare(y.use)).map((f) => ({ FreqLabel: f.use, Freq: f.freq }));

// NearestVOR, NearestNDB and NearestIntersections: eleven rows, then the selected one's details.
class NearestNavPage extends MfdPage {
  navMap = "partial" as const;
  private grp: "LIST" | "FREQ" = "LIST";
  private list: ListView;

  constructor(m: Mfd, name: string, screen: SVGGElement, private type: "VOR" | "NDB" | "FIX") {
    super(m, name, screen);
    this.list = new ListView(this.p, ["Arrow", "ID", "CRS", "DST"], 11, "ID", true, { trough: "ScrollTrough", thumb: "ScrollThumb" });
  }

  private items() {
    return nearest(this.s.points.filter((p) => p.type === this.type), this.s.lat, this.s.lon, this.s.magVar);
  }

  keys() {
    if (this.type !== "VOR") return this.m.topKeys();
    const g = (label: string, grp: typeof this.grp) => key(label, () => ((this.crsr = true), (this.grp = grp)), this.crsr && this.grp === grp);
    return this.m.topKeys({ 4: g("VOR", "LIST"), 5: g("FREQ", "FREQ") });
  }

  toggleCrsr() {
    super.toggleCrsr();
    this.grp = "LIST";
  }

  fms(_outer: boolean, d: number) {
    if (this.grp === "LIST") this.list.move(d, this.items().length);
    return true;
  }

  ent() {
    const p = this.items()[this.list.sel]?.item;
    if (this.crsr && this.grp === "FREQ" && p?.freq) this.m.tune(Number(p.freq));
  }

  selected() {
    return this.crsr ? this.items()[this.list.sel]?.item.id ?? null : null;
  }

  draw() {
    const items = this.items();
    this.list.draw(items.map((n) => ({ ID: n.item.id, CRS: brg(n.brg), DST: dis(n.dist) })), this.crsr && this.grp === "LIST", this.m.hl);
    const p = items[this.list.sel]?.item;
    this.p.text("Name", p ? (p.name ?? "").toUpperCase() : "NONE WITHIN 200NM");
    this.p.text("Lat", p ? latLon(p.lat, "N", "S") : "");
    this.p.text("Lon", p ? latLon(p.lon, "E", "W") : "");
    this.p.text("Freq", p?.freq ? (this.type === "VOR" ? navFreq(p.freq) : p.freq) : "");
    this.m.hl.set(this.p.el("Freq"), this.crsr && this.grp === "FREQ" && !!p?.freq);
    if (this.type === "FIX") {
      // The nearest VOR, and the fix's radial and distance from it.
      const v = p && radial(this.s, p);
      this.p.text("VORID", v?.vor.id ?? "");
      this.p.text("VORFreq", v ? navFreq(v.vor.freq) : "");
      this.p.text("VORCRS", v ? brg(v.brg) : "");
      this.p.text("VORDST", v ? dis(v.dist) : "");
    }
  }
}

/** The VOR nearest `p`, with `p`'s magnetic bearing and distance from it. */
function radial(s: MfdState, p: LatLon) {
  const vor = nearest(s.points.filter((x) => x.type === "VOR"), p.lat, p.lon, 0, 1)[0]?.item;
  if (!vor) return null;
  const { brg, dist } = bearingDistance(vor.lat, vor.lon, p.lat, p.lon);
  return { vor, brg: mod(brg - (vor.magVar ?? s.magVar), 360), dist };
}

/** The airport nearest `p`, with its magnetic bearing and distance from `p`. */
function nearAirport(s: MfdState, p: LatLon) {
  return nearest(s.airports, p.lat, p.lon, s.magVar, 1)[0] ?? null;
}

// NearestFrequencies: the nearest ARTCC and FSS with up to three frequencies each, and weather frequencies.
class NearestFrequenciesPage extends MfdPage {
  navMap = "partial" as const;
  private grp: "ARTCC" | "FSS" | "WX" = "ARTCC";
  private sel = { ARTCC: 0, FSS: 0 };
  private wx = new ListView(this.p, ["WXID", "WXType", "WXFreq"], 8, "WXFreq", false, { trough: "ScrollTrough", thumb: "ScrollThumb" });

  private facility(type: "ARTCC" | "FSS") {
    const near = nearest(this.s.stations.filter((x) => x.type === type), this.s.lat, this.s.lon, this.s.magVar, 50);
    const first = near[0];
    if (!first) return null;
    const freqs = [...new Set(near.filter((n) => n.item.id === first.item.id).map((n) => n.item.freq))].slice(0, 3);
    return { ...first, freqs };
  }

  private wxList() {
    return nearest(this.s.stations.filter((x) => x.type === "WX"), this.s.lat, this.s.lon, this.s.magVar);
  }

  keys() {
    const g = (grp: typeof this.grp) => key(grp, () => ((this.crsr = true), (this.grp = grp)), this.crsr && this.grp === grp);
    return this.m.topKeys({ 5: g("ARTCC"), 6: g("FSS"), 7: g("WX") });
  }

  toggleCrsr() {
    super.toggleCrsr();
    this.grp = "ARTCC";
  }

  fms(outer: boolean, d: number) {
    if (outer) {
      const order = ["ARTCC", "FSS", "WX"] as const;
      this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, 2)];
    } else if (this.grp === "WX") this.wx.move(d, this.wxList().length);
    else this.sel[this.grp] = clamp(this.sel[this.grp] + d, 0, Math.max(0, (this.facility(this.grp)?.freqs.length ?? 1) - 1));
    return true;
  }

  ent() {
    if (!this.crsr) return;
    const f = this.grp === "WX" ? this.wxList()[this.wx.sel]?.item.freq : this.facility(this.grp)?.freqs[this.sel[this.grp]];
    if (f) this.m.tune(Number(f));
  }

  draw() {
    for (const type of ["ARTCC", "FSS"] as const) {
      const f = this.facility(type);
      this.p.text(`${type}Name`, f?.item.name ?? "");
      this.p.text(`${type}BRG`, brg(f?.brg));
      this.p.text(`${type}DIS`, dis(f?.dist));
      for (let i = 0; i < 3; i++) {
        this.p.text(`${type}Freq${i}`, f?.freqs[i] ? Number(f.freqs[i]).toFixed(3) : "");
        this.m.hl.set(this.p.el(`${type}Freq${i}`), this.crsr && this.grp === type && this.sel[type] === i && !!f?.freqs[i]);
      }
    }
    this.wx.draw(this.wxList().map((n) => ({ WXID: n.item.id, WXType: n.item.name, WXFreq: Number(n.item.freq).toFixed(3) })), this.crsr && this.grp === "WX", this.m.hl);
  }
}

// VORInfo, NDBInfo and IntersectionInfo: an identifier to type in (the nearest one until then), its details, and the map
// centered on it.
class NavInfoPage extends MapPage {
  private id: string | null = null;
  private entry: IdEntry;

  constructor(m: Mfd, name: string, screen: SVGGElement, private type: "VOR" | "NDB" | "FIX", size: number) {
    super(m, name, screen, INFO_MAP);
    this.entry = new IdEntry(this.p, size);
  }

  private point(): MapPoint | undefined {
    const all = this.s.points.filter((p) => p.type === this.type);
    return this.id === null ? nearest(all, this.s.lat, this.s.lon, 0, 1)[0]?.item : all.find((p) => p.id === this.id);
  }

  center() {
    return this.point() ?? null;
  }

  selected() {
    return this.point()?.id ?? null;
  }

  fms(outer: boolean, d: number) {
    if (!outer) this.entry.inner(d);
    else this.entry.outer(d);
    return true;
  }

  ent() {
    if (!this.entry.editing) return;
    const v = this.entry.ent();
    if (v) this.id = v;
  }

  clr() {
    this.entry.cancel();
  }

  toggleCrsr() {
    super.toggleCrsr();
    this.entry.cancel();
  }

  draw() {
    const p = this.point();
    const none = "_______";
    this.entry.draw(p?.id ?? this.id ?? "#".repeat(this.type === "FIX" ? 5 : 3), this.crsr, this.m.hl);
    this.p.text("Type", p ? p.kind ?? this.type : none);
    this.p.text("Facility", p ? (p.name ?? "").toUpperCase() : none);
    this.p.text("NearestCity", p ? (p.city ?? "").toUpperCase() : none);
    this.p.text("Class", p ? p.cls ?? "" : none);
    this.p.text("Region", p ? p.region ?? "" : none);
    this.p.text("MagVar", magVar(p?.magVar));
    this.p.text("Lat", p ? latLon(p.lat, "N", "S") : "");
    this.p.text("Lon", p ? latLon(p.lon, "E", "W") : "");
    this.p.text("Freq", this.type === "VOR" ? navFreq(p?.freq) : p?.freq ?? "");
    const apt = p && nearAirport(this.s, p);
    this.p.text("AirportID", apt?.item.id ?? "____");
    this.p.text("AirportCRS", apt ? brg(apt.brg) : "");
    this.p.text("AirportDST", apt ? dis(apt.dist) : "");
    if (this.type === "FIX") {
      const v = p && radial(this.s, p);
      this.p.text("VORID", v?.vor.id ?? "");
      this.p.text("VORCRS", v ? brg(v.brg) : "");
      this.p.text("VORDST", v ? dis(v.dist) : "");
    }
    this.p.show("WaypointWeather", false);
    this.drawOwnMap();
  }
}

// AirportInfo: identifier, airport details, runways and frequencies.
class AirportInfoPage extends MapPage {
  private id: string | null = null;
  private grp: "ID" | "RWY" | "FREQ" = "ID";
  private rwy = 0;
  private entry = new IdEntry(this.p, 4);
  private freqs = new ListView(this.p, ["FreqLabel", "Freq"], 7, "Freq", false, { trough: "FreqScrollBar", thumb: "FreqScroll" });

  constructor(m: Mfd, screen: SVGGElement) {
    super(m, "AirportInfo", screen, INFO_MAP);
  }

  private get apt(): Airport | undefined {
    const a = this.s.airports;
    return this.id === null ? nearest(a, this.s.lat, this.s.lon, 0, 1)[0]?.item : a.find((x) => x.id === this.id);
  }

  center() {
    return this.apt ?? null;
  }

  selected() {
    return this.apt?.id ?? null;
  }

  toggleCrsr() {
    super.toggleCrsr();
    this.grp = "ID";
    this.entry.cancel();
  }

  fms(outer: boolean, d: number) {
    if (this.entry.editing || (this.grp === "ID" && !outer)) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
    } else if (outer) {
      const order = ["ID", "RWY", "FREQ"] as const;
      this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, 2)];
    } else if (this.grp === "RWY") this.rwy = clamp(this.rwy + d, 0, Math.max(0, (this.apt?.runways.length ?? 1) - 1));
    else this.freqs.move(d, this.apt?.freqs.length ?? 0);
    return true;
  }

  ent() {
    if (this.entry.editing) {
      const v = this.entry.ent();
      if (v) [this.id, this.rwy, this.freqs.sel] = [v, 0, 0];
    } else if (this.crsr && this.grp === "FREQ") {
      const f = freqList(this.apt)[this.freqs.sel];
      if (f) this.m.tune(Number(f.Freq));
    }
  }

  clr() {
    this.entry.cancel();
  }

  draw() {
    const a = this.apt;
    const none = "_______";
    this.entry.draw(a?.id ?? this.id ?? "####", this.crsr && this.grp === "ID", this.m.hl);
    this.p.text("Usage", a ? a.use ?? "" : none);
    this.p.text("Name", a ? a.name.toUpperCase() : none);
    this.p.text("City", a ? (a.city ?? "").toUpperCase() : none);
    this.p.text("Region", a ? a.region ?? "" : none);
    this.p.text("Alt", a ? `${Math.round(a.elev)}ft` : "");
    this.p.text("Lat", a ? latLon(a.lat, "N", "S") : "");
    this.p.text("Lon", a ? latLon(a.lon, "E", "W") : "");
    this.p.text("Fuel", a?.fuel ?? "");
    this.p.text("TZ", ""); // no time zone data
    const r = a?.runways[this.rwy];
    this.p.text("Runway", r?.id ?? "");
    this.p.text("RwyDimensions", r ? `${r.length}ft x ${r.width}ft` : "");
    this.p.text("RwySurface", r?.surface ?? "");
    this.p.text("RwyLighting", r?.lights ?? "");
    this.p.show("RunwayLeft", this.rwy > 0);
    this.p.show("RunwayRight", !!a && this.rwy < a.runways.length - 1);
    this.m.hl.set(this.p.el("Runway"), this.crsr && this.grp === "RWY" && !!r);
    this.freqs.draw(freqList(a), this.crsr && this.grp === "FREQ", this.m.hl);
    this.p.text("Zoom", rangeLabel(this.s.range));
    this.drawOwnMap();
  }
}

// Checklist: items checked with ENT or CHECK; the last ENT offers the next checklist. Its group and checklist menus
// (GroupSelect, Select) are not drawn: the FMS outer knob steps through the checklists instead.
class ChecklistPage extends MfdPage {
  private ci = 0;
  private sel = 0;
  private next = false;
  private ticks = new Map<Checklist, boolean[]>();
  private thumbTravel = 0;

  constructor(m: Mfd, screen: SVGGElement) {
    super(m, "Checklist", screen);
    const trough = this.p.el("ScrollTrough")?.getBBox();
    const thumb = this.p.el("ScrollThumb")?.getBBox();
    if (trough && thumb) this.thumbTravel = Math.max(0, trough.height - thumb.height);
  }

  private get list() {
    return this.s.checklists[clamp(this.ci, 0, Math.max(0, this.s.checklists.length - 1))];
  }

  private tickList(cl: Checklist) {
    if (!this.ticks.has(cl)) this.ticks.set(cl, cl.items.map(() => false));
    return this.ticks.get(cl)!;
  }

  keys() {
    const cl = this.list;
    const checked = cl ? this.tickList(cl)[this.sel] : false;
    const k: Key[] = Array(12).fill(BLANK);
    k[0] = key("SYSTEM", () => (this.m.ui.menu = "system"));
    k[5] = key(checked ? "UNCHECK" : "CHECK", () => this.toggle());
    k[10] = key("EXIT", () => this.m.go("MapPageGroup", "NavigationMap"));
    k[11] = key("EMERGCY", () => {
      const i = this.s.checklists.findIndex((c) => /^emergency$/i.test(c.group));
      if (i >= 0) [this.ci, this.sel, this.next] = [i, 0, false];
    });
    return k;
  }

  private toggle() {
    const cl = this.list;
    if (cl?.items.length) this.tickList(cl)[this.sel] = !this.tickList(cl)[this.sel];
  }

  fms(outer: boolean, d: number) {
    const n = this.list?.items.length ?? 0;
    if (outer) {
      [this.ci, this.sel, this.next] = [clamp(this.ci + (d > 0 ? 1 : -1), 0, Math.max(0, this.s.checklists.length - 1)), 0, false];
    } else if (this.next) {
      if (d < 0) this.next = false;
    } else if (d > 0 && this.sel === n - 1) this.next = true;
    else this.sel = clamp(this.sel + d, 0, Math.max(0, n - 1));
    return true;
  }

  // ChecklistController.handleEnter: check the item and move on; at the end, go to the next checklist.
  ent() {
    const cl = this.list;
    if (!this.crsr || !cl) return;
    if (this.next) {
      [this.ci, this.sel, this.next] = [Math.min(this.ci + 1, this.s.checklists.length - 1), 0, false];
      return;
    }
    if (!cl.items.length) return;
    this.tickList(cl)[this.sel] = true;
    if (this.sel === cl.items.length - 1) this.next = true;
    else this.sel++;
  }

  clr() {
    const cl = this.list;
    if (this.crsr && cl?.items.length && !this.next) this.tickList(cl)[this.sel] = false;
  }

  draw() {
    const cl = this.list;
    const items = cl?.items ?? [];
    const ticks = cl ? this.tickList(cl) : [];
    this.p.text("GroupName", cl?.group ?? "");
    this.p.text("Name", cl?.name ?? "");
    this.p.show("GroupSelect", false);
    this.p.show("Select", false);
    const top = firstRow(this.sel, items.length, 16);
    for (let i = 0; i < 16; i++) {
      const idx = top + i;
      const it = items[idx];
      const crsr = this.crsr && !this.next && idx === this.sel;
      // ChecklistGroupElement.displayGroup: white under the cursor, green checked, cyan to do.
      const color = crsr ? "#ffffff" : ticks[idx] ? "#00ff00" : "#00ffff";
      for (const n of ["ItemName", "ItemValue"]) {
        this.p.show(`${n}${i}`, !!it);
        this.p.text(`${n}${i}`, it ? (n === "ItemName" ? it.name : it.value) : "", color);
        // FILLEDBOUNDINGBOX: the text on black, over the dots.
        const t = this.p.el(`${n}${i}`);
        if (t) Object.assign(t.style, { stroke: "#000", strokeWidth: "6px", paintOrder: "stroke" });
      }
      this.p.show(`ItemBox${i}`, !!it);
      this.p.show(`ItemTick${i}`, !!it && ticks[idx]);
      this.p.show(`ItemDots${i}`, !!it);
      const dots = this.p.el(`ItemDots${i}`);
      if (dots) dots.style.stroke = color;
      this.p.show(`ItemSelect${i}`, crsr);
    }
    const many = items.length > 16;
    this.p.show("ScrollTrough", many);
    this.p.show("ScrollThumb", many);
    if (many) this.p.tf("ScrollThumb", { ty: (this.thumbTravel * this.sel) / (items.length - 1) });
    const done = items.length > 0 && ticks.every(Boolean);
    this.p.show("Finished", done);
    this.p.show("NotFinished", items.length > 0 && !done);
    this.p.show("Next", !!cl);
    this.m.hl.set(this.p.el("Next"), this.crsr && this.next);
  }
}

/** A flight plan entry resolved to a point. */
const resolve = (s: MfdState, r: string | MapPoint) => routePoint(r, s.points, s.airports);
const airportPoint = (s: MfdState, id: string): MapPoint | undefined => {
  const a = s.airports.find((x) => x.id === id);
  return a && { id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name };
};
/** A waypoint by identifier: navigation points, then flight plan points (approach fixes), then airports. */
const findPoint = (s: MfdState, id: string): MapPoint | undefined =>
  s.points.find((p) => p.id === id) ?? s.route.find((r): r is MapPoint => typeof r === "object" && r.id === id) ?? airportPoint(s, id);

// ActiveFlightPlanNarrow: the legs with desired track, distance and altitude; the arrow marks the active leg. With the
// cursor on, the outer knob moves it and the inner knob opens WAYPOINT ENTRY, which adds a waypoint after the selected one.
// shortcut: ENT on a leg activates it (the real unit's MENU > Activate Leg; FG1000's ENT does nothing), and CLR deletes
// without asking.
class FlightPlanPage extends MapPage {
  // PAGE MENU (v13 trainer's options): Invert, Delete and Remove Approach work here; the rest are dim.
  pageMenu(): MenuOption[] {
    // Each option's change is worked out again from the state when ENT carries it out (the host may have moved on).
    const now = (label: string) => fplMenu(this.s.route, this.s.activeLeg).find((o) => o.label === label)?.patch;
    return fplMenu(this.s.route, this.s.activeLeg).map(({ label, patch }) => ({
      label,
      act: patch && (() => {
        const p = now(label);
        if (p) this.m.change(p);
      }),
    }));
  }

  private rows = new ListView(this.p, ["Header", "Leg", "DTK", "DIS", "ALT"], 11, "Leg", false, { trough: "ScrollTrough", thumb: "ScrollThumb" });

  constructor(m: Mfd, screen: SVGGElement, private entry: WaypointEntryPage) {
    super(m, "ActiveFlightPlanNarrow", screen, FPL_MAP);
  }

  private legs() {
    return this.s.route.map((r) => resolve(this.s, r));
  }

  selected() {
    return this.crsr ? this.legs()[this.rows.sel]?.id ?? null : null;
  }

  fms(outer: boolean, d: number) {
    if (outer) this.rows.move(d, this.s.route.length + 1);
    else {
      // handleWaypointEntry: the new waypoint goes after the selected one (on the empty last row, at the end).
      const at = Math.min(this.rows.sel + 1, this.s.route.length);
      this.m.open(this.entry);
      this.entry.open((p) => this.insert(at, p), d);
    }
    return true;
  }

  private insert(at: number, p: MapPoint) {
    const s = this.s;
    const route = [...s.route];
    route.splice(at, 0, s.points.includes(p) || p.type === "APT" ? p.id : asWaypoint(p));
    const activeLeg = at <= s.activeLeg && s.route.length ? s.activeLeg + 1 : s.activeLeg;
    this.m.change({ route, activeLeg, ...vtfEdit(s.vtf, at, s.activeLeg) });
    this.rows.sel = at;
  }

  ent() {
    const at = this.rows.sel;
    if (this.crsr && at > 0 && at < this.s.route.length) this.m.change({ activeLeg: at, directFrom: null, vtf: false });
  }

  clr() {
    const s = this.s;
    const at = this.rows.sel;
    if (!this.crsr || at >= s.route.length) return;
    const route = s.route.filter((_, i) => i !== at);
    const activeLeg = clamp(at < s.activeLeg ? s.activeLeg - 1 : s.activeLeg, 0, Math.max(0, route.length - 1));
    this.m.change({ route, activeLeg, ...vtfEdit(s.vtf, at, s.activeLeg) });
  }

  draw() {
    const s = this.s;
    const legs = this.legs();
    const rows = legs.map((p, i) => {
      const prev = legs[i - 1];
      const leg = prev && p ? bearingDistance(prev.lat, prev.lon, p.lat, p.lon) : null;
      return {
        Header: "",
        Leg: p ? p.id.slice(0, 7) : String(s.route[i]),
        DTK: leg ? deg3(leg.brg - s.magVar) : "",
        DIS: leg ? dis(leg.dist) : "",
        ALT: p?.alt ? `${p.alt}ft` : "_____ft",
      };
    });
    rows.push({ Header: "", Leg: "_____", DTK: "", DIS: "", ALT: "" }); // the empty row after the last waypoint
    this.rows.draw(rows, this.crsr, this.m.hl);
    const top = firstRow(this.rows.sel, rows.length, 11);
    for (let i = 0; i < 11; i++) this.p.show(`Arrow${i}`, legs.length > 1 && top + i === s.activeLeg);
    this.p.text("Name", planName(legs));
    const act = legs[s.activeLeg];
    this.p.text("ActiveWPTID", act?.id ?? "");
    this.p.text("ActiveWPTAlt", act?.alt ? `${act.alt}ft` : "");
    for (const id of ["VSTargetFPM", "VSRequiredFPM", "FlightPathAngle", "VerticalDeviation", "TimeToTOD"]) this.p.text(id, "");
    this.p.show("WaypointWeather", false);
    this.drawOwnMap();
  }
}

/** Adds a waypoint to the RECENT list. */
const remember = (m: Mfd, id: string) => (m.ui.recent = [id, ...m.ui.recent.filter((r) => r !== id)].slice(0, 20));

const SHORTCUTS = ["FPL", "NRST", "RECENT", "USER", "AIRWAY"];
// DefaultStyle SCROLL_AVAILABLE / SCROLL_UNAVAILABLE: the arrows beside the list name.
const SCROLL_AVAILABLE = "#80ffff";
const SCROLL_UNAVAILABLE = "#eeeeee";

// The waypoint submenu of DIRECT TO and WAYPOINT ENTRY (WaypointSubmenuGroup), opened by turning the inner knob left on
// the identifier before typing. The inner knob picks the list, the outer moves into it and scrolls, ENT takes the
// waypoint, CLR closes it. There are no user waypoints or airways here, so USER and AIRWAY are empty.
class WaypointSubmenu {
  open = false;
  private type = 0;
  private onList = false;
  private list: ListView;

  constructor(private p: Page, private m: Mfd) {
    this.list = new ListView(p, ["WaypointSubmenuScroll"], 4, "WaypointSubmenuScroll", false, {
      trough: "WaypointSubmenuScrollTrough", thumb: "WaypointSubmenuScrollThumb",
    });
  }

  show() {
    [this.open, this.onList, this.list.sel] = [true, false, 0];
  }

  close() {
    this.open = false;
  }

  private items(): string[] {
    const s = this.m.s;
    switch (SHORTCUTS[this.type]) {
      case "FPL": return s.route.map((r) => (typeof r === "string" ? r : r.id));
      case "NRST": return nearest(s.airports, s.lat, s.lon, 0).map((n) => n.item.id);
      case "RECENT": return this.m.ui.recent;
    }
    return [];
  }

  fms(outer: boolean, d: number) {
    if (!outer) [this.type, this.onList, this.list.sel] = [clamp(this.type + d, 0, SHORTCUTS.length - 1), false, 0];
    else if (this.onList) this.list.move(d, this.items().length);
    else this.onList = true;
  }

  /** The waypoint under the cursor (the first in the list until the outer knob moves into it). */
  value(): string | null {
    return this.items()[this.list.sel] ?? null;
  }

  draw(hl: Highlighter) {
    this.p.show("WaypointSubmenuGroup", this.open);
    if (!this.open) return;
    this.p.text("WaypointSubmenuSelect", SHORTCUTS[this.type]);
    hl.set(this.p.el("WaypointSubmenuSelect"), !this.onList);
    const arrow = (id: string, on: boolean) => {
      const e = this.p.el(id);
      for (const x of e ? [e, ...e.querySelectorAll<SVGElement>("*")] : []) x.style.fill = x.style.stroke = on ? SCROLL_AVAILABLE : SCROLL_UNAVAILABLE;
    };
    arrow("WaypointSubmenuSelectLeft", this.type > 0);
    arrow("WaypointSubmenuSelectRight", this.type < SHORTCUTS.length - 1);
    this.list.draw(this.items().map((id) => ({ WaypointSubmenuScroll: id })), this.onList, hl);
  }
}

// WaypointEntry: the window FPL opens over itself to add a waypoint. The FMS knobs type an identifier (or the submenu
// picks one), ENT shows the waypoint, ENT again adds it, CLR cancels.
class WaypointEntryPage extends MapPage {
  private dest: MapPoint | null = null;
  private entry = new IdEntry(this.p, 4);
  private sub = new WaypointSubmenu(this.p, this.m);
  private done: (p: MapPoint) => void = () => {};

  constructor(m: Mfd, screen: SVGGElement) {
    super(m, "WaypointEntry", screen, DTO_MAP);
  }

  /** Opens blank, then takes the inner knob turn `d` that opened it. */
  open(done: (p: MapPoint) => void, d: number) {
    [this.done, this.dest, this.crsr] = [done, null, true];
    this.entry.cancel();
    this.sub.close();
    this.fms(false, d);
  }

  center() {
    return this.dest;
  }

  keys() {
    return this.m.topKeys();
  }

  toggleCrsr() {} // handleCRSR: no effect

  fms(outer: boolean, d: number) {
    if (this.sub.open) this.sub.fms(outer, d);
    else if (this.entry.editing) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
    } else if (!outer && d < 0) this.sub.show();
    else if (!outer) this.entry.inner(d);
    return true;
  }

  ent() {
    if (this.sub.open) {
      const id = this.sub.value();
      if (id) this.load(id);
      this.sub.close();
    } else if (this.entry.editing) this.load(this.entry.ent());
    else {
      if (this.dest) this.done(this.dest);
      this.m.close();
    }
  }

  clr() {
    if (this.sub.open) this.sub.close();
    else if (this.entry.editing) this.entry.cancel();
    else this.m.close();
  }

  // loadDestination: nothing typed clears it; an identifier not found leaves the last one.
  private load(id: string | null) {
    if (!id) return void (this.dest = null);
    const p = findPoint(this.s, id);
    if (!p) return;
    this.dest = p;
    remember(this.m, p.id);
  }

  draw() {
    const p = this.dest;
    const s = this.s;
    this.entry.draw(p?.id ?? "____", this.crsr && !this.sub.open, this.m.hl);
    const apt = p?.type === "APT" ? s.airports.find((a) => a.id === p.id) : undefined;
    const bd = p && bearingDistance(s.lat, s.lon, p.lat, p.lon);
    // displayDestination, with its blanks when there is no waypoint.
    this.p.text("Name", p ? (p.name ?? p.id).toUpperCase() : "___");
    this.p.text("City", p ? (apt?.city ?? p.city ?? "").toUpperCase() : "____________");
    this.p.text("Region", p ? apt?.region ?? p.region ?? "" : "____________");
    this.p.text("LocationBRG", bd ? deg3(bd.brg - s.magVar) : "___°");
    this.p.text("LocationDIS", bd ? `${Math.trunc(bd.dist)}nm` : "__._nm");
    this.p.text("LocationLat", p ? latLon(p.lat, "N", "S") : "_ __°__.__'");
    this.p.text("LocationLon", p ? latLon(p.lon, "E", "W") : "____°__.__'");
    this.g.style.display = p ? "inline" : "none";
    this.sub.draw(this.m.hl);
    this.drawOwnMap();
  }
}

// DirectTo: the waypoint (the one selected on the page it was opened from, or the active one), its bearing and
// distance, then ACTIVATE?. ENT on ACTIVATE? flies direct from present position. The inner knob turned left before
// typing opens the waypoint submenu.
class DirectToPage extends MapPage {
  private id: string | null = null;
  private onActivate = false;
  private entry = new IdEntry(this.p, 5);
  private sub = new WaypointSubmenu(this.p, this.m);

  constructor(m: Mfd, screen: SVGGElement) {
    super(m, "DirectTo", screen, DTO_MAP);
  }

  open(id: string | null) {
    [this.id, this.onActivate, this.crsr] = [id, !!id, true];
    this.entry.cancel();
    this.sub.close();
  }

  private point() {
    return this.id ? findPoint(this.s, this.id) : undefined;
  }

  center() {
    return this.point() ?? null;
  }

  keys() {
    return this.m.topKeys();
  }

  toggleCrsr() {
    this.crsr = true;
  }

  fms(outer: boolean, d: number) {
    if (this.sub.open) this.sub.fms(outer, d);
    else if (this.entry.editing) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
    } else if (outer) this.onActivate = d > 0;
    else if (!this.onActivate && d < 0) this.sub.show();
    else if (!this.onActivate) this.entry.inner(d);
    return true;
  }

  private pick(id: string | null) {
    if (!id) return;
    [this.id, this.onActivate] = [id, true];
    remember(this.m, id);
  }

  ent() {
    if (this.sub.open) {
      this.pick(this.sub.value());
      return this.sub.close();
    }
    if (this.entry.editing) return this.pick(this.entry.ent());
    if (!this.onActivate) return void (this.onActivate = !!this.point());
    const p = this.point();
    if (!p) return;
    const s = this.s;
    const i = s.route.findIndex((r) => resolve(s, r)?.id === p.id);
    const from = { lat: s.lat, lon: s.lon };
    this.m.change(i >= 0 ? { activeLeg: i, directFrom: from, vtf: false } : { route: [s.points.includes(p) || p.type === "APT" ? p.id : asWaypoint(p)], activeLeg: 0, directFrom: from, vtf: false });
    this.m.close();
  }

  clr() {
    if (this.sub.open) this.sub.close();
    else if (this.entry.editing) this.entry.cancel();
    else this.m.close();
  }

  draw() {
    const p = this.point();
    const s = this.s;
    this.entry.draw(p?.id ?? this.id ?? "_____", this.crsr && !this.onActivate && !this.sub.open, this.m.hl);
    const apt = p?.type === "APT" ? s.airports.find((a) => a.id === p.id) : undefined;
    this.p.text("Name", p ? (p.name ?? "").toUpperCase() : "");
    this.p.text("City", (apt?.city ?? p?.city ?? "").toUpperCase());
    this.p.text("Region", apt?.region ?? p?.region ?? "");
    const bd = p && bearingDistance(s.lat, s.lon, p.lat, p.lon);
    const crs = bd ? mod(bd.brg - s.magVar, 360) : null;
    this.p.text("LocationBRG", brg(crs));
    this.p.text("LocationDIS", dis(bd?.dist));
    this.p.text("Course", crs === null ? "___°" : deg3(crs));
    this.p.text("VNVAlt", "_____");
    this.p.text("VNVOffset", "+0");
    for (const id of ["Course0", "Course1", "Course2", "VNVAlt0", "VNVAlt1", "VNVAlt2", "VNVAlt3", "VNVAlt4", "VNVOffset0", "VNVOffset1"]) this.p.show(id, false);
    this.sub.draw(this.m.hl);
    this.m.hl.set(this.p.el("Activate"), this.onActivate);
    this.drawOwnMap();
  }
}

// PROC: FG1000 has no procedures page. This one follows the v13 trainer: a PROCEDURES menu, then the SELECT APPROACH
// window (airport, approach, transition, LOAD? / ACTIVATE?), drawn in the style of the NRST pages' data display.
const PROC_ROWS = 6;
const MENU = ["ACTIVATE VECTOR-TO-FINAL", "ACTIVATE APPROACH", "ACTIVATE MISSED APPROACH", "SELECT APPROACH", "SELECT ARRIVAL", "SELECT DEPARTURE"];
const SELECT_APPROACH = 3;
class ProceduresPage extends MfdPage {
  navMap = "partial" as const;
  private airport: string | null = null;
  private view: "menu" | "select" | "ask" = "menu";
  private item = SELECT_APPROACH;
  private yes = true;
  /** The activation NOT APPROVED FOR GPS asks about, and the view NO goes back to. */
  private pending: { act: () => void; from: "menu" | "select" } | null = null;
  private grp: "APT" | "APR" | "TRANS" | "LOAD" | "ACTIVATE" = "APR";
  private apr = 0;
  private trans = 0;
  private entry: IdEntry;

  constructor(m: Mfd, screen: SVGGElement, after: Element) {
    super(m, "Procedures", screen);
    const g = document.createElementNS(NS, "g");
    g.id = "Page-Procedures";
    g.style.display = "none";
    const style = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed`;
    const text = (id: string, x: number, y: number, fill = "#ffffff", size = 19.35, anchor = "start") =>
      `<text id="Procedures${id}" x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" style="${style};font-size:${size}px"></text>`;
    const label = (t: string, y: number, fill = CYAN) => `<text x="874" y="${y}" fill="${fill}" text-anchor="middle" style="${style};font-size:19.35px">${t}</text>`;
    let rows = "";
    for (let i = 0; i < PROC_ROWS; i++) rows += text(`Approach${i}`, 740, 210 + i * 26);
    for (let i = 0; i < PROC_ROWS; i++) rows += text(`Trans${i}`, 740, 420 + i * 26);
    let menu = "";
    for (let i = 0; i < MENU.length; i++) menu += text(`Menu${i}`, 740, 130 + i * 30);
    // v13 trainer: ACTIVATE? on an approach the GPS may not fly asks first.
    const ask = ["- NOT APPROVED FOR GPS -", "GPS guidance is for", "monitoring only.", "Activate approach?"].map((t, i) => label(t, 300 + i * 30, "#ffffff")).join("");
    g.innerHTML =
      `<rect x="724.5" y="53.5" width="310" height="689" style="fill:#1a3030;stroke:#ffffff;stroke-width:1"/>` +
      `<g id="ProceduresMenu">${label("PROCEDURES", 85)}${menu}</g>` +
      `<g id="ProceduresSelect">` +
      label("APPROACH", 85) + text("ID", 874, 120, "#ffffff", 24, "middle") + text("Name", 874, 148, "#ffffff", 19.35, "middle") +
      label("SELECT APPROACH", 182) + rows + label("TRANSITION", 392) +
      text("Load", 874, 610, "#ffffff", 22, "middle") + text("Activate", 874, 645, "#ffffff", 22, "middle") + `</g>` +
      `<g id="ProceduresAsk"><rect x="734.5" y="270" width="290" height="190" style="fill:#000000;stroke:#ffffff;stroke-width:1"/>` +
      `${ask}${text("Yes", 834, 440, "#ffffff", 22, "middle")}${text("No", 914, 440, "#ffffff", 22, "middle")}</g>`;
    after.after(g);
    this.root = g;
    this.entry = new IdEntry(this.p, 4);
  }

  /** Opens on the PROCEDURES menu. SELECT APPROACH opens on the destination: the last airport in the flight plan, else the nearest. */
  open() {
    const s = this.s;
    const apts = s.route.map((r) => resolve(s, r)).filter((p) => p?.type === "APT");
    this.airport = apts[apts.length - 1]?.id ?? nearest(s.airports, s.lat, s.lon, 0, 1)[0]?.item.id ?? null;
    [this.view, this.item, this.grp, this.apr, this.trans, this.crsr] = ["menu", SELECT_APPROACH, "APR", 0, 0, true];
    this.entry.cancel();
  }

  private procs(): Procedure[] {
    return this.s.procedures.filter((p) => p.airport === this.airport);
  }

  private transitions() {
    const p = this.procs()[this.apr];
    return p ? Object.keys(p.transitions) : [];
  }

  private loaded() {
    return loadedApproach(this.s.route);
  }

  // The ACTIVATE items need a loaded approach, ACTIVATE MISSED APPROACH one with missed approach legs; SELECT ARRIVAL
  // and SELECT DEPARTURE are not ported.
  private enabled(i: number) {
    const a = this.loaded();
    if (i === 2) return !!a?.pts.some((p) => typeof p !== "string" && p.role === "MISSED");
    return i === SELECT_APPROACH || (i < SELECT_APPROACH && a !== null);
  }

  // v13 trainer: activating an approach the GPS may not fly asks NOT APPROVED FOR GPS first, YES selected.
  private confirm(name: string, act: () => void) {
    if (gpsApproved(name)) return act();
    this.pending = { act, from: this.view === "menu" ? "menu" : "select" };
    [this.view, this.yes] = ["ask", true];
  }

  keys() {
    return this.m.topKeys();
  }

  toggleCrsr() {
    this.crsr = true;
  }

  fms(outer: boolean, d: number) {
    if (this.view === "menu") {
      for (let i = this.item + d; i >= 0 && i < MENU.length; i += d) {
        if (this.enabled(i)) {
          this.item = i;
          break;
        }
      }
      return true;
    }
    if (this.view === "ask") {
      this.yes = !this.yes;
      return true;
    }
    const order = ["APT", "APR", "TRANS", "LOAD", "ACTIVATE"] as const;
    if (this.entry.editing) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
    } else if (outer) this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, order.length - 1)];
    else if (this.grp === "APT") this.entry.inner(d);
    else if (this.grp === "APR") [this.apr, this.trans] = [clamp(this.apr + d, 0, Math.max(0, this.procs().length - 1)), 0];
    else if (this.grp === "TRANS") this.trans = clamp(this.trans + d, 0, Math.max(0, this.transitions().length - 1));
    else this.grp = d > 0 ? "ACTIVATE" : "LOAD";
    return true;
  }

  ent() {
    if (this.view === "menu") return this.menuItem();
    if (this.view === "ask") {
      const pending = this.pending;
      this.view = pending?.from ?? "select";
      this.pending = null;
      if (this.yes) pending?.act();
      return;
    }
    const p = this.procs()[this.apr];
    if (this.entry.editing) {
      const v = this.entry.ent();
      if (v) [this.airport, this.apr, this.trans, this.grp] = [v, 0, 0, "APR"];
    } else if (this.grp === "APT") this.grp = "APR";
    else if (this.grp === "APR") this.grp = this.transitions().length > 1 ? "TRANS" : "LOAD";
    else if (this.grp === "TRANS") this.grp = "LOAD";
    else if (this.grp === "ACTIVATE" && p) this.confirm(p.name, () => this.load(true));
    else this.load(this.grp === "ACTIVATE");
  }

  clr() {
    if (this.view === "ask") [this.view, this.pending] = [this.pending?.from ?? "select", null]; // as NO
    else if (this.entry.editing) this.entry.cancel();
    else if (this.view === "select") this.view = "menu";
    else this.m.close();
  }

  // ACTIVATE VECTOR-TO-FINAL, ACTIVATE APPROACH and ACTIVATE MISSED APPROACH act on the approach already loaded.
  private menuItem() {
    if (this.item === SELECT_APPROACH) {
      this.view = "select";
      return;
    }
    const a = this.loaded();
    if (!a || !this.enabled(this.item)) return;
    const item = this.item;
    if (item === 2) this.activate(item);
    else this.confirm(a.name, () => this.activate(item));
  }

  // Worked out from the state when it is carried out, after NOT APPROVED FOR GPS: the host may have changed the route.
  private activate(item: number) {
    const a = this.loaded();
    if (!a || !this.enabled(item)) return;
    const here = { lat: this.s.lat, lon: this.s.lon };
    if (item === 0) this.m.change(vtfPatch(a.start, a.pts, here));
    else if (item === 1) this.m.change({ activeLeg: a.start, directFrom: here, vtf: false });
    else this.m.change({ activeLeg: a.start + a.pts.findIndex((p) => typeof p !== "string" && p.role === "MISSED"), directFrom: null, vtf: false });
    this.m.close();
  }

  // Adds the approach after the en route waypoints (replacing an approach loaded before), as the G1000 does. ACTIVATE
  // with the VECTORS transition is vector-to-final: the final approach fix is active, its leg on the final course.
  // shortcut: the missed approach legs follow the missed approach point with no suspend.
  private load(activate: boolean) {
    const p = this.procs()[this.apr];
    if (!p) return;
    const s = this.s;
    const name = this.transitions()[this.trans];
    const legs = [...(p.transitions[name] ?? []), ...p.legs];
    const pts: MapPoint[] = legs
      .filter((l, i) => i === 0 || l.fix !== legs[i - 1].fix)
      .map((l) => ({ id: l.fix, type: "WPT", lat: l.lat, lon: l.lon, alt: l.alt, role: l.role, approach: p.name }));
    this.m.change(approachPatch(s.route, pts, !activate ? "load" : name === "VECTORS" ? "vectors" : "activate", { lat: s.lat, lon: s.lon }));
    this.m.close();
  }

  draw() {
    // NOT APPROVED FOR GPS shows over the view it was asked from.
    const under = this.view === "ask" ? this.pending?.from ?? "select" : this.view;
    this.p.show("Menu", under === "menu");
    this.p.show("Select", under === "select");
    this.p.show("Ask", this.view === "ask");
    for (let i = 0; i < MENU.length; i++) {
      // The trainer draws available items cyan and the rest grey.
      this.p.text(`Menu${i}`, MENU[i], this.enabled(i) ? CYAN : "#808080");
      this.m.hl.set(this.p.el(`Menu${i}`), this.view === "menu" && this.crsr && i === this.item);
    }
    this.p.text("Yes", "YES");
    this.p.text("No", "NO");
    this.m.hl.set(this.p.el("Yes"), this.view === "ask" && this.yes);
    this.m.hl.set(this.p.el("No"), this.view === "ask" && !this.yes);
    const procs = this.procs();
    const apt = this.s.airports.find((a) => a.id === this.airport);
    const on = this.crsr && this.view === "select";
    this.entry.draw(this.airport ?? "____", on && this.grp === "APT", this.m.hl);
    this.p.text("Name", apt ? apt.name.toUpperCase() : "");
    const list = (name: string, items: string[], sel: number, lit: boolean) => {
      const top = firstRow(sel, items.length, PROC_ROWS);
      for (let i = 0; i < PROC_ROWS; i++) {
        this.p.text(`${name}${i}`, items[top + i] ?? "");
        this.m.hl.set(this.p.el(`${name}${i}`), lit && top + i === sel && !!items[top + i]);
      }
    };
    list("Approach", procs.length ? procs.map((p) => p.name) : ["NONE"], this.apr, on && this.grp === "APR" && procs.length > 0);
    list("Trans", this.transitions(), this.trans, on && this.grp === "TRANS");
    this.p.text("Load", "LOAD?");
    this.p.text("Activate", "ACTIVATE?");
    this.m.hl.set(this.p.el("Load"), on && this.grp === "LOAD");
    this.m.hl.set(this.p.el("Activate"), on && this.grp === "ACTIVATE");
  }
}

// MENU: the page's PAGE MENU, a window over the page (v13 trainer). Either FMS knob moves the cursor, skipping dim
// options; ENT carries out the option; CLR, MENU or pushing the FMS knob closes it.
const MENU_ROWS = 8;
export class PageMenuPage extends MfdPage {
  private options: MenuOption[] = [];
  private at = 0;
  private base = "";

  constructor(m: Mfd, screen: SVGGElement, after: Element) {
    super(m, "PageMenu", screen);
    const g = document.createElementNS(NS, "g");
    g.id = "Page-PageMenu";
    g.style.display = "none";
    const style = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed;font-size:19.35px`;
    const text = (t: string, x: number, y: number, anchor = "start", id = "") =>
      `<text ${id && `id="PageMenu${id}"`} x="${x}" y="${y}" fill="#ffffff" text-anchor="${anchor}" style="${style}">${t}</text>`;
    let rows = "";
    for (let i = 0; i < MENU_ROWS; i++) rows += text("", 744, 150 + i * 27, "start", `Option${i}`);
    g.innerHTML =
      `<rect x="724.5" y="53.5" width="310" height="390" style="fill:#000000;stroke:#ffffff;stroke-width:1"/>` +
      text("PAGE MENU", 874, 82, "middle") + text("OPTIONS", 740, 115) +
      `<rect x="734.5" y="120.5" width="290" height="${MENU_ROWS * 27 + 12}" style="fill:none;stroke:#808080;stroke-width:1"/>` +
      text("Press the FMS CRSR knob to", 874, 395, "middle") + text("return to base page", 874, 420, "middle") + rows;
    after.after(g);
    this.root = g;
  }

  get title() {
    return this.base;
  }

  /** Shows `options` for the page titled `title`, the cursor on the first available option. */
  open(options: MenuOption[], title: string) {
    [this.options, this.base, this.crsr] = [options, title, true];
    this.at = firstOption(options.map((o) => !!o.act));
  }

  fms(_outer: boolean, d: number) {
    this.at = stepMenu(this.options.map((o) => !!o.act), this.at, d);
    return true;
  }

  ent() {
    const act = this.options[this.at]?.act;
    if (!act) return;
    this.m.close();
    act();
  }

  clr() {
    this.m.close();
  }

  toggleCrsr() {
    this.m.close();
  }

  draw() {
    const top = firstRow(this.at, this.options.length, MENU_ROWS);
    for (let i = 0; i < MENU_ROWS; i++) {
      const o = this.options[top + i];
      this.p.text(`Option${i}`, o?.label ?? "", o?.act ? CYAN : "#808080");
      this.m.hl.set(this.p.el(`Option${i}`), !!o && top + i === this.at);
    }
  }
}

export interface Pages {
  groups: MfdPage[][];
  directTo: DirectToPage;
  procedures: ProceduresPage;
  waypointEntry: WaypointEntryPage;
  pageMenu: PageMenuPage;
}

/** Builds every page. Their SVGs (src/svg/mfd-pages.ts) must be in `screen`; they are measured here, so it must be visible. */
export function makePages(m: Mfd, screen: SVGGElement): Pages {
  const roots = [...screen.querySelectorAll<SVGGElement>('[id^="Page-"]')];
  for (const r of roots) r.style.display = "inline";
  const waypointEntry = new WaypointEntryPage(m, screen);
  const make = (name: string): MfdPage => {
    switch (name) {
      case "NavigationMap": return new NavigationMapPage(m, name, screen);
      case "TrafficMap": return new TrafficPage(m, name, screen);
      case "NearestAirports": return new NearestAirportsPage(m, name, screen);
      case "NearestVOR": return new NearestNavPage(m, name, screen, "VOR");
      case "NearestNDB": return new NearestNavPage(m, name, screen, "NDB");
      case "NearestIntersections": return new NearestNavPage(m, name, screen, "FIX");
      case "NearestFrequencies": return new NearestFrequenciesPage(m, name, screen);
      case "VORInfo": return new NavInfoPage(m, name, screen, "VOR", 3);
      case "NDBInfo": return new NavInfoPage(m, name, screen, "NDB", 3);
      case "IntersectionInfo": return new NavInfoPage(m, name, screen, "FIX", 5);
      case "AirportInfo": return new AirportInfoPage(m, screen);
      case "Checklist": return new ChecklistPage(m, screen);
      case "ActiveFlightPlanNarrow": return new FlightPlanPage(m, screen, waypointEntry);
    }
    // No data: the map pages keep the navigation map under their title.
    const p = new MfdPage(m, name, screen);
    if (PAGE_GROUPS[0].pages.includes(name)) p.navMap = "full";
    return p;
  };
  const groups = PAGE_GROUPS.map((g) => g.pages.map(make));
  const directTo = new DirectToPage(m, screen);
  const procedures = new ProceduresPage(m, screen, roots[roots.length - 1].parentNode as Element);
  const pageMenu = new PageMenuPage(m, screen, roots[roots.length - 1].parentNode as Element);
  for (const r of roots) r.style.display = "none";
  return { groups, directTo, procedures, waypointEntry, pageMenu };
}
