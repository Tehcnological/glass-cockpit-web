// The MFD's pages: ports of FG1000 Nasal/MFDPages/* (Copyright 2018 Stuart Buchanan), GPL-2.0-or-later. Each page
// draws into its FG1000 SVG (src/fg1000/<page>.svg, prefix <page>) and takes the FMS knob, CRSR, ENT and CLR while its
// cursor is on. Pages FG1000 has no data for show their title, their softkeys, and NO DATA.
import { Page, clamp, deg3, mod } from "./page.js";
import { mapGroup, mapUp, rangeLabel } from "./map.js";
import { SETUP_GROUPS } from "./map-setup.js";
import { bearingDistance, cancelDirectTo, cancelParallel, directToPatch, findPoint, isParallel, latLon, nearest, planEntry, planName, routePoint, vtfEdit } from "./nav.js";
import { FPL_TOOLS, FplTool, toolEnabled } from "./fpl-tools.js";
import { BLANK, CYAN, IdEntry, ListView, NS, dimKey, esc, firstRow, key } from "./ui.js";
import { firstOption, fplMenu, stepMenu } from "./page-menu.js";
import { panStart } from "./pan.js";
import { PROC_MENU, ProcFlow } from "./procedures.js";
import { AprInfo } from "./apr-info.js";
import { Scheduler } from "./scheduler.js";
import { densityAltitude, fuelStats, sunTimes, tripLeg, trueAirspeed } from "./trip-planning.js";
import { SETUP_FIELDS, UTILITY_FIELDS, Utility, airportMatches, clockText, ete, hms, setupValue, stepSetup } from "./aux-pages.js";
// Surround.PAGE_GROUPS
export const PAGE_GROUPS = [
    { group: "MapPageGroup", label: "MapPageGroupLabel", pages: ["NavigationMap", "TrafficMap", "Stormscope", "WeatherDataLink", "TAWSB"] },
    { group: "WPTPageGroup", label: "WPTGroupLabel", pages: ["AirportInfo", "IntersectionInfo", "NDBInfo", "VORInfo", "UserWPTInfo"] },
    // System Setup after GPS Status, as the Pilot's Guide orders them (FG1000 has no System Setup).
    { group: "AuxPageGroup", label: "AuxGroupLabel", pages: ["TripPlanning", "Utility", "GPSStatus", "SystemSetup", "XMRadio", "SystemStatus"] },
    { group: "FPLPageGroup", label: "FPLGroupLabel", pages: ["ActiveFlightPlanNarrow", "FlightPlanCatalog", "StoredFlightPlan"] },
    { group: "LstPageGroup", label: "LstGroupLabel", pages: ["Checklist"] },
    { group: "NrstPageGroup", label: "NrstGroupLabel", pages: ["NearestAirports", "NearestIntersections", "NearestNDB", "NearestVOR", "NearestUserWaypoints", "NearestFrequencies", "NearestAirspaces"] },
];
// Each page's title (<page>.nas, the second argument to MFDPage.new).
const TITLES = {
    NavigationMap: "MAP - NAVIGATION MAP", TrafficMap: "MAP - TRAFFIC MAP", Stormscope: "MAP - STORMSCOPE", WeatherDataLink: "MAP - WEATHER DATA LINK",
    TAWSB: "MAP - TAWS", AirportInfo: "WPT - AIRPORT INFORMATION", IntersectionInfo: "WPT - INTERSECTION INFORMATION", NDBInfo: "WPT - NDB INFORMATION",
    VORInfo: "WPT - VOR INFORMATION", UserWPTInfo: "WPT - USER WPT INFORMATION", TripPlanning: "AUX - TRIP PLANNING", Utility: "AUX - UTILITY",
    GPSStatus: "AUX - GPS STATUS", SystemSetup: "AUX - SYSTEM SETUP", XMRadio: "AUX - XM RADIO", SystemStatus: "AUX - SYSTEM STATUS", ActiveFlightPlanNarrow: "FPL - ACTIVE FLIGHT PLAN",
    FlightPlanCatalog: "FPL - FLIGHT PLAN CATALOG", StoredFlightPlan: "FPL - STORED FLIGHT PLAN", Checklist: "LST - CHECKLIST",
    NearestAirports: "NRST - NEAREST AIRPORTS", NearestIntersections: "NRST - NEAREST INTERSECTIONS", NearestNDB: "NRST - NEAREST NDB",
    NearestVOR: "NRST - NEAREST VOR", NearestUserWaypoints: "NRST - NEAREST USER WPTS", NearestFrequencies: "NRST - NEAREST FREQUENCIES",
    NearestAirspaces: "NRST - NEAREST AIRSPACES", DirectTo: "DIRECT TO", Procedures: "PROC - PROCEDURES",
    WaypointEntry: "FPL - ACTIVE FLIGHT PLAN", // a window over the flight plan page, which keeps its title
    MapSetup: "MAP - NAVIGATION MAP", // likewise over the navigation map
    FplTool: "FPL - ACTIVE FLIGHT PLAN", // over the flight plan page
};
// The map windows of pages with their own map (their <page>NavMap-bg, in screen pixels); FG1000 keeps the full map's
// scale, 689/2 px to the range.
const INFO_MAP = { x: 150, y: 56, w: 550, h: 687, cx: 425, cy: 399.5, px: 344.5 };
const FPL_MAP = { x: 150, y: 56, w: 440, h: 687, cx: 370, cy: 399.5, px: 344.5 };
const DTO_MAP = { x: 705, y: 278, w: 315, h: 325, cx: 862.5, cy: 440.5, px: 162.5 };
// MFDPage.setTextElementBearing / Distance / NavFreq / MagVar
const brg = (b) => (b == null ? "___°" : `${Math.round(b) % 360}°`);
const dis = (d) => (d == null ? "___nm" : `${d.toFixed(1)}nm`);
const navFreq = (f) => (f ? Number(f).toFixed(2) : "___.__");
const magVar = (v) => (v == null ? "" : v < 0 ? `${Math.round(-v)}°W` : `${Math.round(v)}°E`);
/** A page: its SVG elements and how it takes the knobs. The base is a page with no data (title, NO DATA). */
export class MfdPage {
    m;
    name;
    /** The FMS cursor is on the page (CRSR). */ crsr = false;
    /** Redrawn every second (a clock on the page). */ live = false;
    /** The navigation map behind the page: the whole map, or the map beside the page's data. */
    navMap = null;
    p;
    root;
    get s() {
        return this.m.s;
    }
    constructor(m, name, screen) {
        this.m = m;
        this.name = name;
        this.p = new Page(screen, name);
        this.root = screen.querySelector(`[id="Page-${name}"]`);
    }
    get title() {
        return TITLES[this.name] ?? this.name;
    }
    show(on) {
        if (this.root)
            this.root.style.display = on ? "inline" : "none";
        if (!on)
            this.crsr = false;
    }
    /** The text shown on pages with no data source, or "". */
    frame() {
        return this.root ? "" : "NO DATA";
    }
    keys() {
        return this.m.topKeys();
    }
    /** The FMS knob with the cursor on; false leaves the turn to the page menu. */
    fms(_outer, _d) {
        return false;
    }
    /** Whether the small FMS knob, turned clockwise now, would spell an identifier (keyboard typing goes there). */
    typing() {
        return false;
    }
    toggleCrsr() {
        this.crsr = !this.crsr;
    }
    ent() { }
    clr() { }
    /** The RANGE knob, if the page has its own ranges. */
    range(_d) {
        return false;
    }
    /** Where the navigation map centers, if not on the aircraft. */
    center() {
        return null;
    }
    /** The waypoint DIRECT TO starts with from this page (the one under the cursor). */
    selected() {
        return null;
    }
    /** The MENU key's PAGE MENU options, or null for a page without one here. */
    /** Where the navigation map draws the nearest airport line, if this page has one. */
    nearestLine() {
        return null;
    }
    pageMenu() {
        return null;
    }
    draw() { }
}
/** A page with its own map window beside its data. */
class MapPage extends MfdPage {
    geom;
    g;
    constructor(m, name, screen, geom) {
        super(m, name, screen);
        this.geom = geom;
        // Under the range legend (DIRECT TO has no legend group, AirportInfo no legend).
        const before = this.p.el("Legend") ?? this.p.el("RangeDisplay") ?? this.root.querySelector('[id="Background"]');
        this.g = mapGroup(screen, before, geom);
    }
    drawOwnMap(preview) {
        this.m.drawMap(this.g, this.geom, this.center() ?? undefined, preview);
        this.p.text("RangeDisplay", rangeLabel(this.s.range));
        this.p.text("OrientationDisplay", this.s.orientation);
    }
}
// NavigationMap.topMenu
class NavigationMapPage extends MfdPage {
    setup;
    navMap = "full";
    frame() {
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
    constructor(m, name, screen, setup) {
        super(m, name, screen);
        this.setup = setup;
    }
    // v13 trainer's options; Map Setup, Declutter and Measure Bearing/Distance work here (no charts or profile view).
    pageMenu() {
        const u = this.m.ui;
        const s = this.s;
        // Pilot's Guide: the measure pointer starts on the aircraft; while measuring the option reads Stop Measuring.
        const measure = u.pan?.from
            ? { label: "Stop Measuring", act: () => (u.pan = null) }
            : { label: "Measure Bearing/Distance", act: () => (u.pan = { ...panStart(s, mapUp(s)), from: { lat: s.lat, lon: s.lon } }) };
        const profile = { label: u.layers.PROFILE ? "Hide Profile View" : "Show Profile View", act: () => (u.layers.PROFILE = !u.layers.PROFILE) };
        return [
            { label: "Map Setup", act: () => this.m.open(this.setup().open()) }, { label: "Declutter", act: () => (u.dcltr = (u.dcltr + 1) % 4) },
            measure, { label: "Show Chart" }, profile,
        ];
    }
}
// TrafficMap: operating mode, altitude filter and ranges. shortcut: no traffic data, so no targets are drawn.
class TrafficPage extends MfdPage {
    op = false;
    alt = "NORMAL";
    menu = "top";
    ri = 1;
    keys() {
        const k = (label, act, lit = false) => key(label, act, lit);
        if (this.menu === "alt") {
            const a = (m) => k(m, () => (this.alt = m), this.alt === m);
            return [BLANK, BLANK, BLANK, BLANK, a("ABOVE"), a("NORMAL"), a("BELOW"), a("UNREST"), k("BACK", () => (this.menu = "top")), BLANK, BLANK, BLANK];
        }
        return this.m.topKeys({
            4: k("STANDBY", () => (this.op = false), !this.op), 5: k("OPERATE", () => (this.op = true), this.op), 6: k("TEST"), 7: k("FLT ID"),
            8: k("ALT MODE", () => (this.menu = "alt")),
        });
    }
    range(d) {
        this.ri = clamp(this.ri + (d > 0 ? 1 : -1), 0, 2);
        return true;
    }
    show(on) {
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
// Pilot's Guide: LD APR (with an approach under the cursor) or the menu's Load Approach opens PROC's SELECT APPROACH on
// it, at its transitions; ENT on the airport list moves to the next airport.
class NearestAirportsPage extends MfdPage {
    procs;
    navMap = "partial";
    grp = "APT";
    rwy = 0;
    apts = new ListView(this.p, ["Arrow", "ID", "CRS", "DST"], 5, "ID", true, { trough: "AirportScrollBar", thumb: "AirportScroll" });
    freqs = new ListView(this.p, ["FreqLabel", "Freq"], 3, "Freq", false, { trough: "FreqScrollBar", thumb: "FreqScroll" });
    apprs = new ListView(this.p, ["Approach"], 3, "Approach", false, { trough: "ApproachScrollBar", thumb: "ApproachScroll" });
    list() {
        // AUX - SYSTEM SETUP's Nearest Airport criteria: runway surface and length.
        const l = nearest(this.s.airports.filter((a) => airportMatches(a, this.m.ui.setup)), this.s.lat, this.s.lon, this.s.magVar);
        this.apts.sel = Math.min(this.apts.sel, Math.max(0, l.length - 1)); // the criteria may have shortened the list
        return l;
    }
    get apt() {
        return this.list()[this.apts.sel]?.item;
    }
    constructor(m, name, screen, procs) {
        super(m, name, screen);
        this.procs = procs;
    }
    /** LD APR's action: the approach under the cursor, when PROC has its procedure. */
    loadApr() {
        const [a, name] = [this.apt, this.apt?.approaches[this.apprs.sel]];
        if (!this.crsr || this.grp !== "APR" || !a || !name || !this.s.procedures.some((p) => p.airport === a.id && p.name === name))
            return undefined;
        return () => {
            const p = this.procs();
            this.m.open(p);
            p.loadApproach(a.id, name);
        };
    }
    keys() {
        const g = (label, grp) => key(label, () => this.select(grp), this.crsr && this.grp === grp);
        const ld = this.loadApr();
        return this.m.topKeys({ 4: g("APT", "APT"), 5: g("RNWY", "RNWY"), 6: g("FREQ", "FREQ"), 7: g("APR", "APR"), 8: ld ? key("LD APR", ld) : dimKey("LD APR") });
    }
    pageMenu() {
        const w = (label, grp) => ({ label, act: () => this.select(grp) });
        return [w("Select Airport Window", "APT"), w("Select Runway Window", "RNWY"), w("Select Frequency Window", "FREQ"), w("Select Approach Window", "APR"), { label: "Load Approach", act: this.loadApr() }];
    }
    select(grp) {
        this.crsr = true;
        this.grp = grp;
    }
    toggleCrsr() {
        super.toggleCrsr();
        this.grp = "APT";
    }
    fms(outer, d) {
        const a = this.apt;
        if (outer || this.grp === "APT") {
            if (this.apts.move(d, this.list().length))
                [this.rwy, this.freqs.sel, this.apprs.sel] = [0, 0, 0];
            this.grp = "APT";
        }
        else if (this.grp === "RNWY")
            this.rwy = clamp(this.rwy + d, 0, Math.max(0, (a?.runways.length ?? 1) - 1));
        else if (this.grp === "FREQ")
            this.freqs.move(d, a?.freqs.length ?? 0);
        else
            this.apprs.move(d, a?.approaches.length ?? 0);
        return true;
    }
    ent() {
        const f = freqList(this.apt)[this.freqs.sel];
        if (this.crsr && this.grp === "FREQ" && f)
            this.m.tune(Number(f.Freq));
        // Pilot's Guide: ENT also moves to the next airport.
        else if (this.crsr && this.grp === "APT" && this.apts.move(1, this.list().length))
            [this.rwy, this.freqs.sel, this.apprs.sel] = [0, 0, 0];
    }
    selected() {
        return this.crsr ? this.apt?.id ?? null : null;
    }
    // Pilot's Guide: the map draws a dashed white line from the aircraft to the selected airport.
    nearestLine() {
        return this.apt ?? null;
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
const freqList = (a) => [...(a?.freqs ?? [])].sort((x, y) => x.use.localeCompare(y.use)).map((f) => ({ FreqLabel: f.use, Freq: f.freq }));
// NearestVOR, NearestNDB and NearestIntersections: eleven rows, then the selected one's details.
class NearestNavPage extends MfdPage {
    type;
    navMap = "partial";
    grp = "LIST";
    list;
    constructor(m, name, screen, type) {
        super(m, name, screen);
        this.type = type;
        this.list = new ListView(this.p, ["Arrow", "ID", "CRS", "DST"], 11, "ID", true, { trough: "ScrollTrough", thumb: "ScrollThumb" });
    }
    items() {
        return nearest(this.s.points.filter((p) => p.type === this.type), this.s.lat, this.s.lon, this.s.magVar);
    }
    keys() {
        if (this.type !== "VOR")
            return this.m.topKeys();
        const g = (label, grp) => key(label, () => ((this.crsr = true), (this.grp = grp)), this.crsr && this.grp === grp);
        return this.m.topKeys({ 4: g("VOR", "LIST"), 5: g("FREQ", "FREQ") });
    }
    toggleCrsr() {
        super.toggleCrsr();
        this.grp = "LIST";
    }
    fms(_outer, d) {
        if (this.grp === "LIST")
            this.list.move(d, this.items().length);
        return true;
    }
    ent() {
        const p = this.items()[this.list.sel]?.item;
        if (this.crsr && this.grp === "FREQ" && p?.freq)
            this.m.tune(Number(p.freq));
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
function radial(s, p) {
    const vor = nearest(s.points.filter((x) => x.type === "VOR"), p.lat, p.lon, 0, 1)[0]?.item;
    if (!vor)
        return null;
    const { brg, dist } = bearingDistance(vor.lat, vor.lon, p.lat, p.lon);
    return { vor, brg: mod(brg - (vor.magVar ?? s.magVar), 360), dist };
}
/** The airport nearest `p`, with its magnetic bearing and distance from `p`. */
function nearAirport(s, p) {
    return nearest(s.airports, p.lat, p.lon, s.magVar, 1)[0] ?? null;
}
// NearestFrequencies: the nearest ARTCC and FSS with up to three frequencies each, and weather frequencies.
class NearestFrequenciesPage extends MfdPage {
    navMap = "partial";
    grp = "ARTCC";
    sel = { ARTCC: 0, FSS: 0 };
    wx = new ListView(this.p, ["WXID", "WXType", "WXFreq"], 8, "WXFreq", false, { trough: "ScrollTrough", thumb: "ScrollThumb" });
    facility(type) {
        const near = nearest(this.s.stations.filter((x) => x.type === type), this.s.lat, this.s.lon, this.s.magVar, 50);
        const first = near[0];
        if (!first)
            return null;
        const freqs = [...new Set(near.filter((n) => n.item.id === first.item.id).map((n) => n.item.freq))].slice(0, 3);
        return { ...first, freqs };
    }
    wxList() {
        return nearest(this.s.stations.filter((x) => x.type === "WX"), this.s.lat, this.s.lon, this.s.magVar);
    }
    keys() {
        const g = (grp) => key(grp, () => ((this.crsr = true), (this.grp = grp)), this.crsr && this.grp === grp);
        return this.m.topKeys({ 5: g("ARTCC"), 6: g("FSS"), 7: g("WX") });
    }
    toggleCrsr() {
        super.toggleCrsr();
        this.grp = "ARTCC";
    }
    fms(outer, d) {
        if (outer) {
            const order = ["ARTCC", "FSS", "WX"];
            this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, 2)];
        }
        else if (this.grp === "WX")
            this.wx.move(d, this.wxList().length);
        else
            this.sel[this.grp] = clamp(this.sel[this.grp] + d, 0, Math.max(0, (this.facility(this.grp)?.freqs.length ?? 1) - 1));
        return true;
    }
    ent() {
        if (!this.crsr)
            return;
        const f = this.grp === "WX" ? this.wxList()[this.wx.sel]?.item.freq : this.facility(this.grp)?.freqs[this.sel[this.grp]];
        if (f)
            this.m.tune(Number(f));
    }
    draw() {
        for (const type of ["ARTCC", "FSS"]) {
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
    type;
    id = null;
    entry;
    constructor(m, name, screen, type, size) {
        super(m, name, screen, INFO_MAP);
        this.type = type;
        this.entry = new IdEntry(this.p, size);
    }
    point() {
        const all = this.s.points.filter((p) => p.type === this.type);
        return this.id === null ? nearest(all, this.s.lat, this.s.lon, 0, 1)[0]?.item : all.find((p) => p.id === this.id);
    }
    center() {
        return this.point() ?? null;
    }
    selected() {
        return this.point()?.id ?? null;
    }
    fms(outer, d) {
        if (!outer)
            this.entry.inner(d);
        else
            this.entry.outer(d);
        return true;
    }
    typing() {
        return true;
    }
    ent() {
        if (!this.entry.editing)
            return;
        const v = this.entry.ent();
        if (v)
            this.id = v;
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
// The code-drawn windows' text: Map Setup's style.
const PANEL_FONT = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed;font-size:19.35px`;
const panelText = (t, x, y, anchor, fill, cur = false) => `<text ${cur ? "data-cur " : ""}x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" style="${PANEL_FONT}">${esc(t)}</text>`;
/** Puts the cursor's cyan box behind each `data-cur` text in `g`, measured once drawn. */
function cursorBoxes(g) {
    for (const t of g.querySelectorAll("text[data-cur]")) {
        const b = t.getBBox();
        const box = document.createElementNS(NS, "rect");
        for (const [k, v] of Object.entries({ x: b.x - 2, y: b.y - 1, width: b.width + 4, height: b.height + 2, fill: CYAN }))
            box.setAttribute(k, String(v));
        t.before(box);
    }
}
// v13 trainer's MFD windows: a menu (PAGE MENU) dark grey, a full-height window (MAP SETUP, PROCEDURES, DIRECT TO) mid
// grey, both in a light grey frame, with black boxes under stepped titles. FG1000 draws black windows with grey tabs.
const WINDOW_BG = "#24282c";
const PANEL_GREY = "#5f6266";
const WINDOW_FRAME = "#c0c0c0";
/** A window at x, y, w by h filled `fill`, in the trainer's frame: light grey with a darker bevel inside. */
const windowRect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:${fill};stroke:${WINDOW_FRAME};stroke-width:3"/>` +
    `<rect x="${x + 2.5}" y="${y + 2.5}" width="${w - 5}" height="${h - 5}" style="fill:none;stroke:#404040;stroke-width:1"/>`;
/** A black box at x, y, w by h, `title` at its top left: the left side rises to the title's middle and a tick after
 * the title steps down to the top edge (v13 trainer). */
const tabbedBox = (x, y, w, h, title) => {
    const end = x + 12 + title.length * 8.5; // Saira Semi Condensed capitals at 14.5px
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:#000000;stroke:none"/>` +
        `<path d="M${x},${y + h}V${y - 9}H${x + 5}M${end},${y - 9}V${y}H${x + w}V${y + h}H${x}" style="fill:none;stroke:${WINDOW_FRAME};stroke-width:1"/>` +
        `<text x="${x + 8}" y="${y - 3}" fill="#ffffff" style="font-family:'Liberation Sans',sans-serif;font-size:14.5px">${esc(title)}</text>`;
};
/** Redraws an FG1000 window page (DIRECT TO, waypoint entry) as the trainer's: its background (#181818) grey in the
 * trainer's frame, and each box's title tab (a #4b4b4b or #1a3030 rect across the box's top edge) a stepped title above
 * the box, as tabbedBox draws one. Other grey rects (map labels, the waypoint submenu) take the window grey. */
function trainerWindow(root) {
    if (!root)
        return;
    const n = (e, k) => Number(e?.getAttribute(k));
    const has = (e, fill) => fill.test(e.getAttribute("style") ?? "");
    const rects = [...root.querySelectorAll("rect")];
    const texts = [...root.querySelectorAll("text")];
    for (const e of root.querySelectorAll("rect, path"))
        if (has(e, /fill:#181818/))
            Object.assign(e.style, { fill: PANEL_GREY, stroke: WINDOW_FRAME, strokeWidth: "3" });
    for (const tab of rects) {
        if (!has(tab, /fill:#(4b4b4b|1a3030)/))
            continue;
        const [x, y, w, h] = ["x", "y", "width", "height"].map((k) => n(tab, k));
        // A tab is title-high; the waypoint submenu, also #4b4b4b, is not.
        const box = h <= 25 ? rects.find((b) => has(b, /fill:#000000/) && n(b, "x") < x && Math.abs(n(b, "y") - (y + h / 2)) < 3) : undefined;
        const title = texts.find((t) => {
            const at = t.hasAttribute("x") ? t : t.querySelector("tspan");
            return n(at, "x") >= x && n(at, "x") <= x + w && n(at, "y") >= y && n(at, "y") <= y + h;
        });
        if (!box || !title) {
            if (has(tab, /fill:#4b4b4b/))
                tab.style.fill = PANEL_GREY;
            continue;
        }
        const [bx, by] = [n(box, "x"), n(box, "y")];
        const at = title.hasAttribute("x") ? title : title.querySelector("tspan");
        tab.style.display = "none";
        title.setAttribute("transform", `translate(${bx + 8 - n(at, "x")} ${by - 3 - n(at, "y")})`);
        Object.assign(title.style, { fontSize: "14.5px", stroke: "none" });
        const end = bx + 12 + (title.textContent ?? "").length * 8.5; // as tabbedBox
        tab.insertAdjacentHTML("afterend", `<path d="M${bx},${by}V${by - 9}H${bx + 5}M${end},${by - 9}V${by}" style="fill:none;stroke:${WINDOW_FRAME};stroke-width:1"/>`);
    }
}
// WPT - APPROACH INFORMATION's boxes: title, top, rows shown. Fixed, so the sequence box gets what is left.
const APR_BOXES = { AIRPORT: [77, 2], APPROACHES: [166, 5], TRANSITIONS: [338, 3], MINIMUMS: [458, 1], SEQUENCE: [524, 7] };
/** Draws WPT - APPROACH INFORMATION's window from `AprInfo.view` (our own layout: FG1000 has no such page). With `ask`,
 * the approach loading page's: the sequence box shorter, LOAD? and ACTIVATE? under it. */
function aprPanel(v, use, name, ask) {
    let out = windowRect(725, 54, 309, 688, PANEL_GREY);
    // shortcut: the loading page's sequence shows its first 5 fixes (it is not a cursor stop there); the map shows them all.
    const rowsOf = (title) => (ask && title === "SEQUENCE" ? 5 : APR_BOXES[title][1]);
    const box = (title) => {
        const [y] = APR_BOXES[title];
        const n = rowsOf(title);
        out += tabbedBox(730.5, y, 289, n * 26 + 16, title);
        return (i) => y + 30 + i * 26;
    };
    // A list scrolled to keep the cursor (or the first row) in view.
    const list = (title, rows, fill) => {
        const row = box(title);
        const n = rowsOf(title);
        const at = Math.max(0, rows.findIndex((r) => r.cur));
        const top = clamp(at - n + 1, 0, Math.max(0, rows.length - n));
        rows.slice(top, top + n).forEach((r, i) => {
            out += panelText(r.label, 740, row(i), "start", r.cur ? "#000000" : fill(r), r.cur);
            if (r.role)
                out += panelText(r.role, 1010, row(i), "end", r.cur ? "#000000" : "#ffffff");
        });
    };
    const apt = box("AIRPORT");
    out += panelText(v.apt, 740, apt(0), "start", v.aptCur ? "#000000" : CYAN, v.aptCur) + panelText(use, 1010, apt(0), "end", CYAN) +
        panelText(name, 740, apt(1) - 2, "start", "#ffffff");
    list("APPROACHES", v.approaches, (r) => (r.dim ? "#808080" : CYAN));
    list("TRANSITIONS", v.transitions, () => CYAN);
    const min = box("MINIMUMS");
    out += panelText(v.min.mode, 740, min(0), "start", v.min.cur ? "#000000" : CYAN, v.min.cur) +
        panelText(v.min.alt, 1010, min(0), "end", v.min.altCur ? "#000000" : v.min.mode === "OFF" ? "#808080" : CYAN, v.min.altCur);
    list("SEQUENCE", v.sequence, () => "#ffffff");
    if (ask)
        out += panelText("LOAD?", 874, 696, "middle", ask.load ? "#000000" : "#ffffff", ask.load) +
            panelText("ACTIVATE?", 874, 726, "middle", ask.activate ? "#000000" : "#ffffff", ask.activate);
    return out;
}
// AirportInfo: identifier, airport details, runways and frequencies. Its softkeys (Pilot's Guide) show the airport's
// other pages: APR its approaches (WPT - APPROACH INFORMATION, drawn here in place of FG1000's boxes), INFO-1 back.
// DP, STAR and WX are dim: no departure, arrival or weather data. INFO-2 (the AOPA directory) is not ported.
class AirportInfoPage extends MapPage {
    id = null;
    grp = "ID";
    rwy = 0;
    entry = new IdEntry(this.p, 4);
    freqs = new ListView(this.p, ["FreqLabel", "Freq"], 7, "Freq", false, { trough: "FreqScrollBar", thumb: "FreqScroll" });
    view = "INFO";
    apr = new AprInfo(new IdEntry(this.p, 4));
    /** FG1000's boxes, and the approach window drawn in their place. */ info;
    panel;
    constructor(m, screen) {
        super(m, "AirportInfo", screen, INFO_MAP);
        const host = this.root.querySelector('[id="Background"]').parentElement;
        const map = this.g.parentNode;
        this.info = document.createElementNS(NS, "g");
        this.panel = document.createElementNS(NS, "g");
        for (const c of [...host.children])
            if (c !== map)
                this.info.appendChild(c);
        host.append(this.info, this.panel);
    }
    get title() {
        return this.view === "APR" ? "WPT - APPROACH INFORMATION" : super.title;
    }
    ctx() {
        return { airport: this.apt, procedures: this.s.procedures };
    }
    setView(v) {
        if (v === this.view)
            return;
        [this.view, this.crsr] = [v, false];
        this.entry.cancel();
        this.apr.clr();
        // Pilot's Guide: the approach page opens on the airport page's airport.
        if (v === "APR")
            [this.apr.grp, this.apr.apr, this.apr.trans, this.apr.seq] = ["APT", 0, 0, 0];
    }
    keys() {
        return this.m.topKeys({
            4: key("INFO-1", () => this.setView("INFO"), this.view === "INFO"), 5: dimKey("DP"), 6: dimKey("STAR"),
            7: key("APR", () => this.setView("APR"), this.view === "APR"), 8: dimKey("WX"),
        });
    }
    get apt() {
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
        this.apr.clr();
        this.apr.grp = "APT";
    }
    typing() {
        return this.view === "APR" ? this.apr.typing() : this.entry.editing || this.grp === "ID";
    }
    fms(outer, d) {
        if (this.view === "APR") {
            this.apr.fms(this.ctx(), outer, d);
            return true;
        }
        if (this.entry.editing || (this.grp === "ID" && !outer)) {
            if (outer)
                this.entry.outer(d);
            else
                this.entry.inner(d);
        }
        else if (outer) {
            const order = ["ID", "RWY", "FREQ"];
            this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, 2)];
        }
        else if (this.grp === "RWY")
            this.rwy = clamp(this.rwy + d, 0, Math.max(0, (this.apt?.runways.length ?? 1) - 1));
        else
            this.freqs.move(d, this.apt?.freqs.length ?? 0);
        return true;
    }
    ent() {
        if (this.view === "APR") {
            if (!this.crsr)
                return;
            const v = this.apr.ent(this.ctx());
            if (v)
                [this.id, this.rwy, this.freqs.sel] = [v, 0, 0];
        }
        else if (this.entry.editing) {
            const v = this.entry.ent();
            if (v)
                [this.id, this.rwy, this.freqs.sel] = [v, 0, 0];
        }
        else if (this.crsr && this.grp === "FREQ") {
            const f = freqList(this.apt)[this.freqs.sel];
            if (f)
                this.m.tune(Number(f.Freq));
        }
    }
    clr() {
        this.entry.cancel();
        this.apr.clr();
    }
    draw() {
        const a = this.apt;
        this.info.style.display = this.view === "INFO" ? "inline" : "none";
        this.panel.style.display = this.view === "APR" ? "inline" : "none";
        if (this.view === "APR") {
            this.panel.innerHTML = aprPanel(this.apr.view(this.ctx(), this.crsr), a?.use ?? "", (a?.name ?? "").toUpperCase());
            cursorBoxes(this.panel);
            this.drawOwnMap(this.apr.preview(this.ctx()));
            return;
        }
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
    ci = 0;
    sel = 0;
    next = false;
    ticks = new Map();
    thumbTravel = 0;
    constructor(m, screen) {
        super(m, "Checklist", screen);
        const trough = this.p.el("ScrollTrough")?.getBBox();
        const thumb = this.p.el("ScrollThumb")?.getBBox();
        if (trough && thumb)
            this.thumbTravel = Math.max(0, trough.height - thumb.height);
    }
    get list() {
        return this.s.checklists[clamp(this.ci, 0, Math.max(0, this.s.checklists.length - 1))];
    }
    tickList(cl) {
        if (!this.ticks.has(cl))
            this.ticks.set(cl, cl.items.map(() => false));
        return this.ticks.get(cl);
    }
    keys() {
        const cl = this.list;
        const checked = cl ? this.tickList(cl)[this.sel] : false;
        const k = Array(12).fill(BLANK);
        k[0] = key("SYSTEM", () => (this.m.ui.menu = "system"));
        k[5] = key(checked ? "UNCHECK" : "CHECK", () => this.toggle());
        k[10] = key("EXIT", () => this.m.go("MapPageGroup", "NavigationMap"));
        k[11] = key("EMERGCY", () => {
            const i = this.s.checklists.findIndex((c) => /^emergency$/i.test(c.group));
            if (i >= 0)
                [this.ci, this.sel, this.next] = [i, 0, false];
        });
        return k;
    }
    toggle() {
        const cl = this.list;
        if (cl?.items.length)
            this.tickList(cl)[this.sel] = !this.tickList(cl)[this.sel];
    }
    fms(outer, d) {
        const n = this.list?.items.length ?? 0;
        if (outer) {
            [this.ci, this.sel, this.next] = [clamp(this.ci + (d > 0 ? 1 : -1), 0, Math.max(0, this.s.checklists.length - 1)), 0, false];
        }
        else if (this.next) {
            if (d < 0)
                this.next = false;
        }
        else if (d > 0 && this.sel === n - 1)
            this.next = true;
        else
            this.sel = clamp(this.sel + d, 0, Math.max(0, n - 1));
        return true;
    }
    // ChecklistController.handleEnter: check the item and move on; at the end, go to the next checklist.
    ent() {
        const cl = this.list;
        if (!this.crsr || !cl)
            return;
        if (this.next) {
            [this.ci, this.sel, this.next] = [Math.min(this.ci + 1, this.s.checklists.length - 1), 0, false];
            return;
        }
        if (!cl.items.length)
            return;
        this.tickList(cl)[this.sel] = true;
        if (this.sel === cl.items.length - 1)
            this.next = true;
        else
            this.sel++;
    }
    clr() {
        const cl = this.list;
        if (this.crsr && cl?.items.length && !this.next)
            this.tickList(cl)[this.sel] = false;
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
                if (t)
                    Object.assign(t.style, { stroke: "#000", strokeWidth: "6px", paintOrder: "stroke" });
            }
            this.p.show(`ItemBox${i}`, !!it);
            this.p.show(`ItemTick${i}`, !!it && ticks[idx]);
            this.p.show(`ItemDots${i}`, !!it);
            const dots = this.p.el(`ItemDots${i}`);
            if (dots)
                dots.style.stroke = color;
            this.p.show(`ItemSelect${i}`, crsr);
        }
        const many = items.length > 16;
        this.p.show("ScrollTrough", many);
        this.p.show("ScrollThumb", many);
        if (many)
            this.p.tf("ScrollThumb", { ty: (this.thumbTravel * this.sel) / (items.length - 1) });
        const done = items.length > 0 && ticks.every(Boolean);
        this.p.show("Finished", done);
        this.p.show("NotFinished", items.length > 0 && !done);
        this.p.show("Next", !!cl);
        this.m.hl.set(this.p.el("Next"), this.crsr && this.next);
    }
}
/** A flight plan entry resolved to a point. */
const resolve = (s, r) => routePoint(r, s.points, s.airports);
// ActiveFlightPlanNarrow: the legs with desired track, distance and altitude; the arrow marks the active leg. With the
// cursor on, the outer knob moves it and the inner knob opens WAYPOINT ENTRY, which adds a waypoint after the selected one.
// shortcut: ENT on a leg activates it (the real unit's MENU > Activate Leg; FG1000's ENT does nothing), and CLR deletes
// without asking.
class FlightPlanPage extends MapPage {
    entry;
    tools;
    // PAGE MENU (v13 trainer's options): Invert, Delete and Remove Approach work here, and Closest Point of FPL, Parallel
    // Track and Create ATK Offset Waypoint (on the waypoint under the cursor) open their windows; the rest are dim.
    pageMenu() {
        // Each option's change is worked out again from the state when ENT carries it out (the host may have moved on).
        const now = (label) => fplMenu(this.s.route, this.s.activeLeg).find((o) => o.label === label)?.patch;
        const sel = this.crsr ? this.rows.sel : null;
        return fplMenu(this.s.route, this.s.activeLeg).map(({ label, patch }) => FPL_TOOLS.includes(label) ? {
            label,
            act: toolEnabled(label, this.s, sel) ? () => this.m.open(this.tools().open(label, sel ?? 0)) : undefined,
        } : {
            label,
            act: patch && (() => {
                const p = now(label);
                if (p)
                    this.m.change(p);
            }),
        });
    }
    rows = new ListView(this.p, ["Header", "Leg", "DTK", "DIS", "ALT"], 11, "Leg", false, { trough: "ScrollTrough", thumb: "ScrollThumb" });
    constructor(m, screen, entry, tools) {
        super(m, "ActiveFlightPlanNarrow", screen, FPL_MAP);
        this.entry = entry;
        this.tools = tools;
    }
    legs() {
        return this.s.route.map((r) => resolve(this.s, r));
    }
    selected() {
        return this.crsr ? this.legs()[this.rows.sel]?.id ?? null : null;
    }
    fms(outer, d) {
        if (outer)
            this.rows.move(d, this.s.route.length + 1);
        else {
            // handleWaypointEntry: the new waypoint goes after the selected one (on the empty last row, at the end).
            const at = Math.min(this.rows.sel + 1, this.s.route.length);
            this.m.open(this.entry);
            this.entry.open((p) => this.insert(at, p), d);
        }
        return true;
    }
    insert(at, p) {
        const s = this.s;
        const route = cancelParallel(s.route); // editing the plan cancels Parallel Track (Pilot's Guide)
        route.splice(at, 0, planEntry(s, p));
        const activeLeg = at <= s.activeLeg && s.route.length ? s.activeLeg + 1 : s.activeLeg;
        this.m.change({ route, activeLeg, ...vtfEdit(s.vtf, at, s.activeLeg) });
        this.rows.sel = at;
    }
    ent() {
        const at = this.rows.sel;
        const s = this.s;
        // Activating a leg cancels Parallel Track (Pilot's Guide).
        if (this.crsr && at > 0 && at < s.route.length)
            this.m.change({ ...(s.route.some(isParallel) && { route: cancelParallel(s.route) }), activeLeg: at, directFrom: null, vtf: false });
    }
    clr() {
        const s = this.s;
        const at = this.rows.sel;
        if (!this.crsr || at >= s.route.length)
            return;
        const route = cancelParallel(s.route).filter((_, i) => i !== at);
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
        for (let i = 0; i < 11; i++)
            this.p.show(`Arrow${i}`, legs.length > 1 && top + i === s.activeLeg);
        this.p.text("Name", planName(legs));
        const act = legs[s.activeLeg];
        this.p.text("ActiveWPTID", act?.id ?? "");
        this.p.text("ActiveWPTAlt", act?.alt ? `${act.alt}ft` : "");
        for (const id of ["VSTargetFPM", "VSRequiredFPM", "FlightPathAngle", "VerticalDeviation", "TimeToTOD"])
            this.p.text(id, "");
        this.p.show("WaypointWeather", false);
        this.drawOwnMap();
    }
}
/** Adds a waypoint to the RECENT list. */
const remember = (m, id) => (m.ui.recent = [id, ...m.ui.recent.filter((r) => r !== id)].slice(0, 20));
const SHORTCUTS = ["FPL", "NRST", "RECENT", "USER", "AIRWAY"];
// DefaultStyle SCROLL_AVAILABLE / SCROLL_UNAVAILABLE: the arrows beside the list name.
const SCROLL_AVAILABLE = "#80ffff";
const SCROLL_UNAVAILABLE = "#eeeeee";
// The waypoint submenu of DIRECT TO and WAYPOINT ENTRY (WaypointSubmenuGroup), opened by turning the inner knob left on
// the identifier before typing. The inner knob picks the list, the outer moves into it and scrolls, ENT takes the
// waypoint, CLR closes it. There are no user waypoints or airways here, so USER and AIRWAY are empty.
class WaypointSubmenu {
    p;
    m;
    open = false;
    type = 0;
    onList = false;
    list;
    constructor(p, m) {
        this.p = p;
        this.m = m;
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
    items() {
        const s = this.m.s;
        switch (SHORTCUTS[this.type]) {
            case "FPL": return s.route.map((r) => (typeof r === "string" ? r : r.id));
            case "NRST": return nearest(s.airports, s.lat, s.lon, 0).map((n) => n.item.id);
            case "RECENT": return this.m.ui.recent;
        }
        return [];
    }
    fms(outer, d) {
        if (!outer)
            [this.type, this.onList, this.list.sel] = [clamp(this.type + d, 0, SHORTCUTS.length - 1), false, 0];
        else if (this.onList)
            this.list.move(d, this.items().length);
        else
            this.onList = true;
    }
    /** The waypoint under the cursor (the first in the list until the outer knob moves into it). */
    value() {
        return this.items()[this.list.sel] ?? null;
    }
    draw(hl) {
        this.p.show("WaypointSubmenuGroup", this.open);
        if (!this.open)
            return;
        this.p.text("WaypointSubmenuSelect", SHORTCUTS[this.type]);
        hl.set(this.p.el("WaypointSubmenuSelect"), !this.onList);
        const arrow = (id, on) => {
            const e = this.p.el(id);
            for (const x of e ? [e, ...e.querySelectorAll("*")] : [])
                x.style.fill = x.style.stroke = on ? SCROLL_AVAILABLE : SCROLL_UNAVAILABLE;
        };
        arrow("WaypointSubmenuSelectLeft", this.type > 0);
        arrow("WaypointSubmenuSelectRight", this.type < SHORTCUTS.length - 1);
        this.list.draw(this.items().map((id) => ({ WaypointSubmenuScroll: id })), this.onList, hl);
    }
}
// WaypointEntry: the window FPL opens over itself to add a waypoint. The FMS knobs type an identifier (or the submenu
// picks one), ENT shows the waypoint, ENT again adds it, CLR cancels.
class WaypointEntryPage extends MapPage {
    dest = null;
    entry = new IdEntry(this.p, 4);
    sub = new WaypointSubmenu(this.p, this.m);
    done = () => { };
    constructor(m, screen) {
        super(m, "WaypointEntry", screen, DTO_MAP);
        trainerWindow(this.root);
    }
    /** Opens blank, then takes the inner knob turn `d` that opened it. */
    open(done, d) {
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
    toggleCrsr() { } // handleCRSR: no effect
    fms(outer, d) {
        if (this.sub.open)
            this.sub.fms(outer, d);
        else if (this.entry.editing) {
            if (outer)
                this.entry.outer(d);
            else
                this.entry.inner(d);
        }
        else if (!outer && d < 0)
            this.sub.show();
        else if (!outer)
            this.entry.inner(d);
        return true;
    }
    typing() {
        return !this.sub.open;
    }
    ent() {
        if (this.sub.open) {
            const id = this.sub.value();
            if (id)
                this.load(id);
            this.sub.close();
        }
        else if (this.entry.editing)
            this.load(this.entry.ent());
        else {
            if (this.dest)
                this.done(this.dest);
            this.m.close();
        }
    }
    clr() {
        if (this.sub.open)
            this.sub.close();
        else if (this.entry.editing)
            this.entry.cancel();
        else
            this.m.close();
    }
    // loadDestination: nothing typed clears it; an identifier not found leaves the last one.
    load(id) {
        if (!id)
            return void (this.dest = null);
        const p = findPoint(this.s, id);
        if (!p)
            return;
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
    id = null;
    onActivate = false;
    entry = new IdEntry(this.p, 5);
    sub = new WaypointSubmenu(this.p, this.m);
    constructor(m, screen) {
        super(m, "DirectTo", screen, DTO_MAP);
        trainerWindow(this.root);
    }
    open(id) {
        [this.id, this.onActivate, this.crsr] = [id, !!id, true];
        this.entry.cancel();
        this.sub.close();
    }
    point() {
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
    // Pilot's Guide: the Direct-to window's one option. Worked out again when ENT carries it out.
    pageMenu() {
        const act = () => {
            const p = cancelDirectTo(this.s);
            if (p)
                this.m.change(p);
        };
        return [{ label: "Cancel Direct-To NAV", act: cancelDirectTo(this.s) ? act : undefined }];
    }
    fms(outer, d) {
        if (this.sub.open)
            this.sub.fms(outer, d);
        else if (this.entry.editing) {
            if (outer)
                this.entry.outer(d);
            else
                this.entry.inner(d);
        }
        else if (outer)
            this.onActivate = d > 0;
        else if (!this.onActivate && d < 0)
            this.sub.show();
        else if (!this.onActivate)
            this.entry.inner(d);
        return true;
    }
    typing() {
        return !this.sub.open && (this.entry.editing || !this.onActivate);
    }
    pick(id) {
        if (!id)
            return;
        [this.id, this.onActivate] = [id, true];
        remember(this.m, id);
    }
    ent() {
        if (this.sub.open) {
            this.pick(this.sub.value());
            return this.sub.close();
        }
        if (this.entry.editing)
            return this.pick(this.entry.ent());
        if (!this.onActivate)
            return void (this.onActivate = !!this.point());
        const p = this.point();
        if (!p)
            return;
        this.m.change(directToPatch(this.s, p));
        this.m.close();
    }
    clr() {
        if (this.sub.open)
            this.sub.close();
        else if (this.entry.editing)
            this.entry.cancel();
        else
            this.m.close();
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
        for (const id of ["Course0", "Course1", "Course2", "VNVAlt0", "VNVAlt1", "VNVAlt2", "VNVAlt3", "VNVAlt4", "VNVOffset0", "VNVOffset1"])
            this.p.show(id, false);
        this.sub.draw(this.m.hl);
        this.m.hl.set(this.p.el("Activate"), this.onActivate);
        this.drawOwnMap();
    }
}
// PROC: FG1000 has no procedures page. The PROCEDURES window over the page (v13 trainer), then, as the Pilot's Guide
// has it, SELECT APPROACH opens PROC - APPROACH LOADING: a page of its own, the approach previewed on its map beside
// WPT - APPROACH INFORMATION's boxes, with LOAD? and ACTIVATE? under them. The flow is in procedures.ts, shared with the PFD.
class ProceduresPage extends MfdPage {
    entry;
    flow;
    mapG;
    panel;
    drawn = "";
    constructor(m, screen, after) {
        super(m, "Procedures", screen);
        const g = document.createElementNS(NS, "g");
        g.id = "Page-Procedures";
        g.style.display = "none";
        const style = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed`;
        const text = (id, x, y, fill = "#ffffff", size = 19.35, anchor = "start") => `<text id="Procedures${id}" x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" style="${style};font-size:${size}px"></text>`;
        const label = (t, y, fill = CYAN) => `<text x="874" y="${y}" fill="${fill}" text-anchor="middle" style="${style};font-size:19.35px">${t}</text>`;
        let menu = "";
        for (let i = 0; i < PROC_MENU.length; i++)
            menu += text(`Menu${i}`, 740, 130 + i * 30);
        // v13 trainer: ACTIVATE? on an approach the GPS may not fly asks first.
        const ask = ["- NOT APPROVED FOR GPS -", "GPS guidance is for", "monitoring only.", "Activate approach?"].map((t, i) => label(t, 300 + i * 30, "#ffffff")).join("");
        // The loading page covers the page under it, from the engine strip to the screen's right edge.
        g.innerHTML =
            `<g id="ProceduresSelect"><rect x="150" y="53.5" width="874" height="690" fill="#000000"/><g id="ProceduresPanel"/></g>` +
                `<g id="ProceduresMenu">${windowRect(725, 54, 309, 105 + PROC_MENU.length * 30, PANEL_GREY)}` +
                `${label("PROCEDURES", 85, "#ffffff")}${tabbedBox(730.5, 106, 289, PROC_MENU.length * 30 + 10, "OPTIONS")}${menu}</g>` +
                `<g id="ProceduresAsk"><rect x="734.5" y="270" width="290" height="190" style="fill:#000000;stroke:${WINDOW_FRAME};stroke-width:1"/>` +
                `${ask}${text("Yes", 834, 440, "#ffffff", 22, "middle")}${text("No", 914, 440, "#ffffff", 22, "middle")}</g>`;
        after.after(g);
        this.root = g;
        this.panel = this.p.el("Panel");
        this.mapG = mapGroup(screen, this.panel, INFO_MAP);
        this.entry = new IdEntry(this.p, 4);
        this.flow = new ProcFlow({ s: () => this.s, change: (patch) => this.m.change(patch), close: () => this.m.close() }, this.entry);
    }
    /** The PROCEDURES menu, or NOT APPROVED FOR GPS asked from it: a window over the page, which stays drawn. */
    get windowed() {
        const f = this.flow;
        return (f.view === "ask" ? f.pending?.from ?? "select" : f.view) === "menu";
    }
    get title() {
        return this.windowed ? super.title : "PROC - APPROACH LOADING";
    }
    open() {
        this.flow.open();
        this.crsr = true;
    }
    /** LD APR: SELECT APPROACH on `name` at `airport`, at its transitions. */
    loadApproach(airport, name) {
        this.flow.loadApproach(airport, name);
        this.crsr = true;
    }
    keys() {
        return this.m.topKeys();
    }
    toggleCrsr() {
        this.crsr = true;
    }
    typing() {
        return this.flow.typing();
    }
    fms(outer, d) {
        this.flow.fms(outer, d);
        return true;
    }
    ent() {
        this.flow.ent();
    }
    clr() {
        this.flow.clr();
    }
    draw() {
        const f = this.flow;
        // NOT APPROVED FOR GPS shows over the view it was asked from.
        const under = f.view === "ask" ? f.pending?.from ?? "select" : f.view;
        this.p.show("Menu", under === "menu");
        this.p.show("Select", under === "select");
        this.p.show("Ask", f.view === "ask");
        for (let i = 0; i < PROC_MENU.length; i++) {
            // The trainer draws available items cyan and the rest grey.
            this.p.text(`Menu${i}`, PROC_MENU[i], f.enabled(i) ? CYAN : "#808080");
            this.m.hl.set(this.p.el(`Menu${i}`), f.view === "menu" && this.crsr && i === f.item);
        }
        this.p.text("Yes", "YES");
        this.p.text("No", "NO");
        this.m.hl.set(this.p.el("Yes"), f.view === "ask" && f.yes);
        this.m.hl.set(this.p.el("No"), f.view === "ask" && !f.yes);
        if (under !== "select")
            return;
        const apt = this.s.airports.find((a) => a.id === f.airport);
        const v = f.loading(this.crsr);
        // The panel only when it changed (the MFD draws many times a second in flight); the map always, the aircraft moves.
        const panel = aprPanel(v, apt?.use ?? "", (apt?.name ?? "").toUpperCase(), v);
        if (panel !== this.drawn) {
            this.panel.innerHTML = this.drawn = panel;
            cursorBoxes(this.panel);
        }
        this.m.drawMap(this.mapG, INFO_MAP, apt, v.points);
    }
}
// MENU: the page's PAGE MENU, a window over the page (v13 trainer). Either FMS knob moves the cursor, skipping dim
// options; ENT carries out the option; CLR, MENU or pushing the FMS knob closes it.
const MENU_ROWS = 8;
const menuText = (t, x, y, anchor = "start", id = "") => `<text ${id && `id="PageMenu${id}"`} x="${x}" y="${y}" fill="#ffffff" text-anchor="${anchor}" style="font-size:19.35px">${t}</text>`;
export class PageMenuPage extends MfdPage {
    options = [];
    at = 0;
    base = "";
    constructor(m, screen, after) {
        super(m, "PageMenu", screen);
        const g = document.createElementNS(NS, "g");
        g.id = "Page-PageMenu";
        g.style.display = "none";
        let rows = "";
        for (let i = 0; i < MENU_ROWS; i++)
            rows += menuText("", 744, 150 + i * 27, "start", `Option${i}`);
        g.innerHTML = `<g id="PageMenuFrame"/>` + rows;
        after.after(g);
        this.root = g;
    }
    get title() {
        return this.base;
    }
    /** Shows `options` for the page titled `title`, the cursor on the first available option. */
    /** The window the menu was opened over (DIRECT TO) and whether its cursor was on; CLR goes back to it as it was. */
    back = null;
    backCrsr = false;
    open(options, title, back = null) {
        [this.options, this.base, this.crsr, this.back, this.backCrsr] = [options, title, true, back, back?.crsr ?? false];
        this.at = firstOption(options.map((o) => !!o.act));
        // v13 trainer: the window fits its options
        const bottom = 120.5 + Math.min(Math.max(options.length, 1), MENU_ROWS) * 27 + 12;
        this.root.querySelector("#PageMenuFrame").innerHTML =
            windowRect(725, 54, 309, bottom + 28, WINDOW_BG) + menuText("PAGE MENU", 874, 82, "middle") +
                tabbedBox(734.5, 120.5, 290, bottom - 120.5, "OPTIONS") +
                menuText("Press the FMS CRSR knob to", 874, bottom + 37, "middle") + menuText("return to base page", 874, bottom + 62, "middle");
    }
    fms(_outer, d) {
        this.at = stepMenu(this.options.map((o) => !!o.act), this.at, d);
        return true;
    }
    ent() {
        const act = this.options[this.at]?.act;
        if (!act)
            return;
        this.m.close();
        act();
    }
    clr() {
        this.m.close();
        if (!this.back)
            return;
        this.m.open(this.back);
        this.back.crsr = this.backCrsr; // hiding it for the menu turned its cursor off
    }
    toggleCrsr() {
        this.m.close();
    }
    draw() {
        const top = firstRow(this.at, this.options.length, MENU_ROWS);
        for (let i = 0; i < MENU_ROWS; i++) {
            const o = this.options[top + i];
            this.p.text(`Option${i}`, o?.label ?? "", o?.act ? CYAN : "#808080");
            this.m.hl.set(this.p.el(`Option${i}`), !!o && top + i === this.at, { x: 738, w: 283 });
        }
    }
}
// MAP SETUP (Pilot's Guide), the navigation map's settings: a window like the PAGE MENU, opening with the cursor on its
// GROUP (Map, Airways, Profile; see map-setup.ts). The small FMS knob changes the group or the setting under the cursor,
// the large knob moves the cursor; settings this package can't carry out are grey. CLR, MENU or pushing the FMS knob
// closes it. shortcut: a setting changes as the knob turns (the real unit takes it on ENT).
const SETUP_ROWS = Math.max(...SETUP_GROUPS.map((g) => g.rows.length));
export class MapSetupPage extends MfdPage {
    group = 0;
    /** The row under the cursor, -1 for GROUP. */ at = -1;
    constructor(m, screen, after) {
        super(m, "MapSetup", screen);
        const g = document.createElementNS(NS, "g");
        g.id = "Page-MapSetup";
        g.style.display = "none";
        const style = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed;font-size:19.35px`;
        const text = (t, x, y, anchor = "start", id = "", fill = "#ffffff") => `<text ${id && `id="MapSetup${id}"`} x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" style="${style}">${t}</text>`;
        let rows = "";
        for (let i = 0; i < SETUP_ROWS; i++)
            rows += text("", 738, 196 + i * 27, "start", `Label${i}`) + text("", 1012, 196 + i * 27, "end", `Value${i}`, CYAN);
        // v13 trainer: the group in a box of its own, the settings' labels on the window and their values in a black column.
        g.innerHTML =
            windowRect(725, 54, 309, 688, PANEL_GREY) + text("MAP SETUP", 874, 82, "middle") +
                tabbedBox(734.5, 112.5, 290, 34, "GROUP") + text("", 744, 137, "start", "Group", CYAN) +
                `<rect x="886.5" y="172.5" width="138" height="${SETUP_ROWS * 27 + 12}" style="fill:#000000;stroke:${WINDOW_FRAME};stroke-width:1"/>` +
                text("Press the FMS CRSR knob to", 874, 700, "middle") + text("return to base page", 874, 725, "middle") + rows;
        after.after(g);
        this.root = g;
    }
    open() {
        [this.at, this.crsr] = [-1, true];
        return this;
    }
    settings() {
        const u = this.m.ui;
        return { orientation: this.s.orientation, trackVector: u.trackVector, airways: u.airways, airwayRange: u.airwayRange };
    }
    fms(outer, d) {
        const rows = SETUP_GROUPS[this.group].rows;
        if (outer) {
            const stops = [-1, ...rows.flatMap((r, i) => (r.step ? [i] : []))];
            this.at = stops[clamp(stops.indexOf(this.at) + d, 0, stops.length - 1)];
        }
        else if (this.at === -1)
            this.group = clamp(this.group + d, 0, SETUP_GROUPS.length - 1);
        else {
            const { orientation, ...rest } = rows[this.at].step(this.settings(), d);
            if (orientation)
                this.m.change({ orientation });
            Object.assign(this.m.ui, rest);
        }
        return true;
    }
    ent() { }
    clr() {
        this.m.close();
    }
    toggleCrsr() {
        this.m.close();
    }
    draw() {
        const g = SETUP_GROUPS[this.group];
        const s = this.settings();
        this.p.text("Group", g.name);
        this.m.hl.set(this.p.el("Group"), this.at === -1, { x: 738, w: 283 });
        for (let i = 0; i < SETUP_ROWS; i++) {
            const r = g.rows[i];
            this.p.text(`Label${i}`, r?.label ?? "", r?.step ? "#ffffff" : "#a8abae"); // dim, readable on the grey window
            this.p.text(`Value${i}`, r?.step ? r.value(s) : "");
            this.m.hl.set(this.p.el(`Value${i}`), i === this.at);
        }
    }
}
/** The window Closest Point of FPL, Parallel Track and Create ATK Offset Waypoint open over the flight plan, in
 * MapSetupPage's style; its rows come from `FplTool`. */
export class FplToolPage extends MfdPage {
    tool;
    g;
    constructor(m, screen, after) {
        super(m, "FplTool", screen);
        const g = document.createElementNS(NS, "g");
        g.id = "Page-FplTool";
        g.style.display = "none";
        after.after(g);
        this.root = this.g = g;
        this.tool = new FplTool(new IdEntry(this.p, 5));
    }
    open(name, sel) {
        this.tool.open(name, this.s, sel);
        this.crsr = true;
        return this;
    }
    typing() {
        return this.tool.typing();
    }
    fms(outer, d) {
        this.tool.fms(this.s, outer, d);
        return true;
    }
    ent() {
        const r = this.tool.ent(this.s);
        if (r.patch)
            this.m.change(r.patch);
        if (r.close)
            this.m.close();
    }
    // Pilot's Guide: the FMS knob or CLR cancels (CLR first cancels an identifier being spelled).
    clr() {
        if (this.tool.clr())
            this.m.close();
    }
    toggleCrsr() {
        this.m.close();
    }
    draw() {
        const text = panelText;
        const rows = this.tool.rows(this.s);
        let out = windowRect(725, 54, 309, rows.length * 27 + 89, WINDOW_BG);
        rows.forEach((r, i) => {
            const y = i === 0 ? 82 : 100 + i * 27;
            if (r.title) {
                out += text(r.label, 874, y, "middle", "#ffffff");
                return;
            }
            const onLabel = !!r.cur && r.value === undefined;
            out += text(r.label, 744, y, "start", onLabel ? "#000000" : r.dim ? "#808080" : "#ffffff", onLabel);
            if (r.value !== undefined)
                out += text(r.value, 1014, y, "end", r.cur ? "#000000" : CYAN, r.cur);
        });
        const y = 100 + rows.length * 27 + 10;
        this.g.innerHTML = out + text("Press the FMS CRSR knob to", 874, y, "middle", "#ffffff") + text("cancel", 874, y + 25, "middle", "#ffffff");
        cursorBoxes(this.g);
    }
}
/** A box of what this package does not carry out, grey. */
const greyBox = (title, rows) => ({ title, rows: rows.map(([label, value]) => ({ label, value, dim: true })) });
/** `boxes` stacked down a column at x, w wide, from y. */
function panelColumn(x, w, y, boxes, rowH = 23) {
    let out = "";
    for (const b of boxes) {
        out += tabbedBox(x + 0.5, y + 0.5, w, b.rows.length * rowH + 12, b.title);
        b.rows.forEach((r, i) => {
            const ry = y + 24 + i * rowH; // centered in the box: Saira sits lower than Liberation
            const fill = (on, normal) => (on ? "#000000" : r.dim ? "#808080" : normal);
            out += panelText(r.label, x + 10, ry, "start", fill(r.cur === "label", r.cur === "label" ? CYAN : "#ffffff"), r.cur === "label");
            if (r.mid !== undefined)
                out += panelText(r.mid, x + w * 0.62, ry, "end", fill(r.cur === "mid", CYAN), r.cur === "mid");
            if (r.value !== undefined)
                out += panelText(r.value, x + w - 10, ry, "end", fill(r.cur === "value", r.color ?? CYAN), r.cur === "value");
        });
        y += b.rows.length * rowH + 12 + 30;
    }
    return out;
}
/** DD-MMM-YY in the clock's time zone. */
function dateText(ms, s) {
    const date = new Date(ms + (s.timeFormat === "UTC" ? 0 : s.offset * 60_000));
    return `${String(date.getUTCDate()).padStart(2, "0")}-${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}-${String(date.getUTCFullYear()).slice(2)}`;
}
/** A page of its own boxes, with no FG1000 SVG: the AUX pages. */
class PanelPage extends MfdPage {
    live = true; // their clocks run
    g;
    constructor(m, name, screen, after) {
        super(m, name, screen);
        this.g = document.createElementNS(NS, "g");
        this.g.id = `Page-${name}`;
        this.g.style.display = "none";
        after.after(this.g);
        this.root = this.g;
    }
    paint(left, right) {
        this.g.innerHTML = windowRect(151, 54, 883, 688, PANEL_GREY) +
            panelColumn(160, 425, 75, left) + panelColumn(600, 425, 75, right);
        cursorBoxes(this.g);
    }
}
// AUX - SYSTEM SETUP (Pilot's Guide): the settings in `aux-pages.ts` work; the boxes this package does not carry out are grey.
class SystemSetupPage extends PanelPage {
    at = 0;
    toggleCrsr() {
        super.toggleCrsr();
        this.at = 0;
    }
    fms(outer, d) {
        if (outer)
            this.at = clamp(this.at + (d > 0 ? 1 : -1), 0, SETUP_FIELDS.length - 1);
        else
            stepSetup(this.m.ui.setup, this.at, d);
        return true;
    }
    draw() {
        const s = this.m.ui.setup;
        const now = Date.now();
        const field = (box) => SETUP_FIELDS.flatMap((f, i) => f.box === box ? [{ label: f.label, value: setupValue(s, i), cur: this.crsr && i === this.at ? "value" : undefined }] : []);
        this.paint([
            { title: "DATE / TIME", rows: [{ label: "DATE", value: dateText(now, s) }, { label: "TIME", value: clockText(now, s) }, ...field("DATE / TIME")] },
            greyBox("DISPLAY UNITS", [["NAV ANGLE", "MAGNETIC(°)"], ["DIS, SPD", "NAUTICAL(NM,KT)"], ["ALT, VS", "FEET(FT,FPM)"], ["TEMP", "CELSIUS(°C)"], ["FUEL", "GALLONS(GL,GL/HR)"], ["POSITION", "HDDD°MM.MM'"]]),
            greyBox("BARO TRANSITION ALERT", [["ALTITUDE", "18000FT"], ["LEVEL", "FL180"]]),
            greyBox("AIRSPACE ALERTS", [["ALT BUFFER", "200FT"], ["CLASS B/TMA", "ON"], ["CLASS C/TCA", "ON"], ["CLASS D", "ON"], ["RESTRICTED", "ON"], ["MOA (MILITARY)", "ON"], ["OTHER/ADIZ", "ON"]]),
        ], [
            greyBox("ARRIVAL ALERT", [["ALERT", "____"]]),
            greyBox("AUDIO ALERT", [["VOICE", "____"]]),
            greyBox("FLIGHT DIRECTOR", [["ACTIVE FORMAT", "SINGLE CUE"]]),
            { title: "MFD DATA BAR FIELDS", rows: field("MFD DATA BAR FIELDS") },
            { title: "PAGE NAVIGATION", rows: field("PAGE NAVIGATION") },
            greyBox("GPS CDI", [["SELECTED", "AUTO"], ["SYSTEM CDI", "____"]]),
            greyBox("COM CONFIG", [["CHANNEL SPACING", "25.0 KHZ"]]),
            { title: "NEAREST AIRPORT", rows: field("NEAREST AIRPORT") },
        ]);
    }
}
// AUX - UTILITY (Pilot's Guide): the generic, flight and departure timers and trip statistics, reset from the PAGE
// MENU, and the scheduler, below the timers for the large FMS knob. The flight data logger is not ported.
class UtilityPage extends PanelPage {
    at = 0;
    util = new Utility(Date.now());
    sched = new Scheduler();
    /** The cursor is in the scheduler, after the timers. */
    get inSched() {
        return this.at === UTILITY_FIELDS.length;
    }
    toggleCrsr() {
        super.toggleCrsr();
        this.at = 0;
    }
    fms(outer, d) {
        const now = Date.now();
        const s = this.sched;
        if (!outer)
            this.inSched ? s.inner(d, now) : this.util.field(UTILITY_FIELDS[this.at], d, now);
        else if (this.inSched && !s.editing && s.i === 0 && s.f === "text" && d < 0)
            this.at--;
        else if (this.inSched)
            s.outer(d);
        else {
            this.at = clamp(this.at + (d > 0 ? 1 : -1), 0, UTILITY_FIELDS.length);
            if (this.inSched)
                s.cursor(0, "text");
        }
        return true;
    }
    // ENT on the direction or the time goes on to START?; on START?, STOP? or RESET? it carries it out.
    ent() {
        if (!this.crsr)
            return;
        if (this.inSched)
            this.sched.ent();
        else if (UTILITY_FIELDS[this.at] === "action")
            this.util.action(Date.now());
        else if (this.at < 2)
            this.at = 2;
    }
    clr() {
        if (this.crsr && this.inSched)
            this.sched.clr();
    }
    pageMenu() {
        const r = (label, what) => ({ label, act: () => this.util.reset(what, Date.now()) });
        return [
            r("Reset Flight Timer", "flight"), r("Reset Departure Time", "departure"), r("Reset Trip ODOM/AVG GS", "trip"),
            r("Reset Odometer", "odom"), r("Reset Maximum Speed", "max"), r("Reset All", "all"),
        ];
    }
    draw() {
        const u = this.util;
        const now = Date.now();
        const on = (f) => this.crsr && UTILITY_FIELDS[this.at] === f;
        const cur = (f, where) => (on(f) ? where : undefined);
        const flight = u.flight(now);
        const dep = u.departure(now);
        this.paint([
            { title: "TIMERS", rows: [
                    { label: "GENERIC", mid: u.up ? "UP" : "DN", value: hms(u.timer(now)), cur: cur("dir", "mid") ?? cur("time", "value") },
                    { label: u.label(), cur: cur("action", "label") },
                    { label: "FLIGHT", mid: u.flightFrom, value: flight === null ? "__:__:__" : hms(flight), cur: cur("flight", "mid") },
                    { label: "DEPARTURE", mid: u.depFrom, value: dep === null ? "__:__:__" : clockText(dep, this.m.ui.setup), cur: cur("departure", "mid") },
                ] },
            { title: "TRIP STATISTICS", rows: [
                    { label: "ODOMETER", value: `${u.odom.toFixed(1)}NM` }, { label: "TRIP ODOM", value: `${u.trip.toFixed(1)}NM` },
                    { label: "TRIP AVG GS", value: `${u.avgGs()}KT` }, { label: "MAXIMUM GS", value: `${Math.round(u.maxGs)}KT` },
                ] },
        ], [{ title: "SCHEDULER", rows: this.sched.items.flatMap((r, i) => {
                    const s = this.sched;
                    const on = (f) => this.crsr && this.inSched && s.i === i && s.f === f;
                    // While typing, the text up to the large knob's character, blanks as underscores.
                    const typed = on("text") && s.editing && s.editing.join("").slice(0, Math.max(s.pos + 1, s.editing.join("").trimEnd().length)).replace(/ /g, "_");
                    const setup = this.m.ui.setup;
                    const time = r.type === "Event"
                        ? (r.at === null ? "__-___-__ __:__" : `${dateText(r.at, setup)} ${clockText(r.at, setup, false)}`)
                        : hms(r.due === null ? r.timer : Math.max(0, (r.due - now) / 1000));
                    return [
                        { label: typed || r.text || "____________________", cur: on("text") ? "label" : undefined },
                        { label: "", mid: r.type, value: time, cur: on("type") ? "mid" : on("time") ? "value" : undefined },
                    ];
                }) }]);
    }
}
// AUX - TRIP PLANNING (Pilot's Guide; FG1000 shows no data here): AUTO takes groundspeed, fuel flow and fuel on board from the aircraft; MANUAL takes
// them, and the air data density altitude and true airspeed need, from the small FMS knob. The leg is the flight plan's
// REM or one of its legs. WPTS mode and ESA are not ported.
const TRIP_INPUTS = [
    { key: "gs", label: "GS", step: 1, unit: "KT", digits: 0, min: 0, max: 999 },
    { key: "ff", label: "FUEL FLOW", step: 0.1, unit: "GL/HR", digits: 1, min: 0, max: 99.9 },
    { key: "fuel", label: "FUEL ON BOARD", step: 1, unit: "GL", digits: 1, min: 0, max: 999 },
    { key: "cas", label: "CALIBRATED AS", step: 1, unit: "KT", digits: 0, min: 0, max: 999 },
    { key: "alt", label: "IND ALTITUDE", step: 100, unit: "FT", digits: 0, min: -1000, max: 50000 },
    { key: "baro", label: "BARO", step: 0.01, unit: "IN", digits: 2, min: 27, max: 32 },
    { key: "tat", label: "TOTAL AIR TEMP", step: 1, unit: "°C", digits: 0, min: -99, max: 99 },
];
class TripPlanningPage extends PanelPage {
    manual = null;
    leg = "REM";
    /** The flight plan the leg was picked from: a changed plan goes back to REM, as its leg numbers move. */
    legRoute = null;
    at = 0;
    sensors() {
        const s = this.m.s;
        const fuel = s.engine.fuelLeft + s.engine.fuelRight;
        return { gs: Math.round(s.groundspeed), ff: s.engine.fuelFlow, fuel, cas: Math.round(s.groundspeed), alt: Math.round(s.alt / 100) * 100, baro: s.baro, tat: 15 };
    }
    toggleCrsr() {
        super.toggleCrsr();
        this.at = 0;
    }
    fms(outer, d) {
        if (outer)
            this.at = clamp(this.at + (d > 0 ? 1 : -1), 0, this.manual ? TRIP_INPUTS.length : 0);
        else if (this.at === 0) {
            const legs = ["REM", ...this.m.s.route.keys()].filter((l) => l !== 0);
            [this.leg, this.legRoute] = [legs[clamp(legs.indexOf(this.leg) + d, 0, legs.length - 1)], this.m.s.route];
        }
        else if (this.manual) {
            const f = TRIP_INPUTS[this.at - 1];
            this.manual[f.key] = clamp(+(this.manual[f.key] + d * f.step).toFixed(f.digits), f.min, f.max);
        }
        return true;
    }
    keys() {
        return this.m.topKeys({
            4: key("AUTO", () => ([this.manual, this.at] = [null, 0]), !this.manual),
            5: key("MANUAL", () => (this.manual ??= this.sensors()), !!this.manual),
            7: key("FPL", undefined, true), 8: dimKey("WPTS"),
        });
    }
    draw() {
        const s = this.m.s;
        const setup = this.m.ui.setup;
        const now = Date.now();
        if (this.leg !== "REM" && s.route !== this.legRoute)
            this.leg = "REM";
        const inp = this.manual ?? this.sensors();
        const id = (i) => routePoint(s.route[i] ?? "", s.points, s.airports);
        const to = id(this.leg === "REM" ? s.route.length - 1 : this.leg);
        const from = this.leg === "REM" || this.leg === s.activeLeg ? "P.POS" : id(this.leg - 1)?.id;
        const leg = tripLeg(s, this.leg);
        const hours = leg.dis !== null && inp.gs > 0 ? leg.dis / inp.gs : null;
        const f = fuelStats(inp.gs, inp.ff, inp.fuel, hours);
        const sun = to ? sunTimes(to.lat, to.lon, now + (hours ?? 0) * 3_600_000) : { rise: null, set: null };
        const or = (v, fmt, none) => (v === null ? none : fmt(v));
        const hm = (h) => `${h < 0 ? "-" : ""}${hms(Math.abs(h) * 3600).slice(0, 5)}`;
        const clock = (ms) => clockText(ms, setup, false);
        const cur = (i) => (this.crsr && this.at === i ? "value" : undefined);
        // AUTO has no air data: calibrated airspeed and total air temperature are the pilot's to enter.
        const noAir = !this.manual;
        this.paint([
            { title: "FLIGHT PLAN", rows: [
                    { label: "LEG", value: this.leg === "REM" ? "REM" : String(this.leg).padStart(2, "0"), cur: cur(0) },
                    { label: "FROM", value: from ?? "____" }, { label: "TO", value: to?.id ?? "____" },
                ] },
            { title: "INPUT DATA", rows: [
                    { label: "DEP TIME", value: clock(now) },
                    ...TRIP_INPUTS.map((t, i) => noAir && (t.key === "cas" || t.key === "tat")
                        ? { label: t.label, value: `____${t.unit}`, dim: true }
                        : { label: t.label, value: `${inp[t.key].toFixed(t.digits)}${t.unit}`, cur: cur(i + 1) }),
                ] },
        ], [
            { title: "TRIP STATISTICS", rows: [
                    { label: "DTK", value: or(leg.dtk, deg3, "___°") }, { label: "DIS", value: or(leg.dis, (v) => `${v.toFixed(1)}NM`, "___NM") },
                    { label: "ETE", value: or(hours, (h) => ete(h * 3600), "__:__") }, { label: "ETA", value: or(hours, (h) => clock(now + h * 3_600_000), "__:__") },
                    { label: "ESA", value: "____FT", dim: true },
                    { label: "SUNRISE", value: or(sun.rise, clock, "__:__") }, { label: "SUNSET", value: or(sun.set, clock, "__:__") },
                ] },
            { title: "FUEL STATISTICS", rows: [
                    { label: "EFFICIENCY", value: or(f.efficiency, (v) => `${v.toFixed(1)}NM/GL`, "__._NM/GL") },
                    { label: "TOTAL ENDUR", value: or(f.endurance, hm, "__:__") }, { label: "REM FUEL", value: or(f.remFuel, (v) => `${v.toFixed(1)}GL`, "__._GL") },
                    { label: "REM ENDUR", value: or(f.remEndurance, hm, "__:__") }, { label: "FUEL REQ", value: or(f.fuelReq, (v) => `${v.toFixed(1)}GL`, "__._GL") },
                    { label: "TOTAL RANGE", value: or(f.range, (v) => `${Math.round(v)}NM`, "___NM") },
                ] },
            { title: "OTHER STATISTICS", rows: [
                    { label: "DENSITY ALT", value: noAir ? "_____FT" : `${Math.round(densityAltitude(inp.alt, inp.baro, inp.tat))}FT`, dim: noAir },
                    { label: "TRUE AIRSPEED", value: noAir ? "___KT" : `${Math.round(trueAirspeed(inp.cas, inp.alt, inp.baro, inp.tat))}KT`, dim: noAir },
                ] },
        ]);
    }
}
// AUX - GPS STATUS (Pilot's Guide; FG1000 shows no data here): the position, time, altitude, groundspeed and track the aircraft gives. There are no
// satellites here, so the sky view and signal bars are left out and the accuracy, RAIM and SBAS boxes are grey.
class GpsStatusPage extends PanelPage {
    rx = 1;
    sbas = false;
    keys() {
        return this.m.topKeys({
            4: key("GPS1", () => (this.rx = 1), this.rx === 1), 5: key("GPS2", () => (this.rx = 2), this.rx === 2),
            7: key("RAIM", () => (this.sbas = false), !this.sbas), 8: key("SBAS", () => (this.sbas = true), this.sbas),
        });
    }
    draw() {
        const s = this.m.s;
        this.paint([
            { title: `GPS${this.rx} POSITION`, rows: [
                    { label: "SOLUTION", value: "3D NAV" }, { label: "POSITION", value: latLon(s.lat, "N", "S") }, { label: "", value: latLon(s.lon, "E", "W") },
                    { label: "TIME", value: clockText(Date.now(), { timeFormat: "UTC", offset: 0 }) }, { label: "ALTITUDE", value: `${Math.round(s.alt)}FT` },
                    { label: "GS", value: `${Math.round(s.groundspeed)}KT` }, { label: "TRK", value: deg3(s.track) },
                ] },
            greyBox("ACCURACY", [["EPU", "__._NM"], ["HDOP", "__._"], ["HFOM", "__._NM"], ["VFOM", "___FT"]]),
        ], [
            this.sbas
                ? greyBox("SBAS SELECTION", [["WAAS", "ON"], ["EGNOS", "OFF"], ["MSAS", "OFF"]])
                : greyBox("RAIM PREDICTION", [["WAYPOINT", "P.POS"], ["TIME", "__:__"], ["DATE", "__-___-__"], ["AVAILABILITY", "COMPUTE RAIM?"]]),
        ]);
    }
}
// AUX - SYSTEM STATUS (Pilot's Guide; FG1000 shows no data here): every LRU reports in. There are no serial numbers, versions or databases here, so
// the airframe and database boxes are grey and ANN TEST is dim.
const LRUS = ["GDC1", "GEA1", "GIA1", "GIA2", "GMA1", "GMU1", "GRS1", "GTX1", "MFD1", "PFD1"];
class SystemStatusPage extends PanelPage {
    db = "MFD1";
    keys() {
        return this.m.topKeys({ 7: key(`${this.db} DB`, () => (this.db = this.db === "MFD1" ? "PFD1" : "MFD1")), 8: dimKey("ANN TEST") });
    }
    draw() {
        // shortcut: Saira has no ✓, so the browser draws it from a system font; draw it as a path if that shows.
        this.paint([{ title: "LRU INFO", rows: LRUS.map((label) => ({ label, value: "✓", color: "#00ff00" })) }], [
            greyBox("AIRFRAME", [["AIRFRAME", "____"]]),
            greyBox(`${this.db} DATABASE`, [["BASEMAP", "____"], ["NAVIGATION", "____"], ["OBSTACLE", "____"], ["TERRAIN", "____"]]),
        ]);
    }
}
/** Builds every page. Their SVGs (src/svg/mfd-pages.ts) must be in `screen`; they are measured here, so it must be visible. */
export function makePages(m, screen) {
    const roots = [...screen.querySelectorAll('[id^="Page-"]')];
    for (const r of roots)
        r.style.display = "inline";
    const waypointEntry = new WaypointEntryPage(m, screen);
    const top = roots[roots.length - 1].parentNode;
    const utility = new UtilityPage(m, "Utility", screen, top);
    const make = (name) => {
        switch (name) {
            case "NavigationMap": return new NavigationMapPage(m, name, screen, () => mapSetup);
            case "TrafficMap": return new TrafficPage(m, name, screen);
            case "NearestAirports": return new NearestAirportsPage(m, name, screen, () => procedures);
            case "NearestVOR": return new NearestNavPage(m, name, screen, "VOR");
            case "NearestNDB": return new NearestNavPage(m, name, screen, "NDB");
            case "NearestIntersections": return new NearestNavPage(m, name, screen, "FIX");
            case "NearestFrequencies": return new NearestFrequenciesPage(m, name, screen);
            case "VORInfo": return new NavInfoPage(m, name, screen, "VOR", 3);
            case "NDBInfo": return new NavInfoPage(m, name, screen, "NDB", 3);
            case "IntersectionInfo": return new NavInfoPage(m, name, screen, "FIX", 5);
            case "AirportInfo": return new AirportInfoPage(m, screen);
            case "Utility": return utility;
            case "SystemSetup": return new SystemSetupPage(m, name, screen, top);
            case "TripPlanning": return new TripPlanningPage(m, name, screen, top);
            case "GPSStatus": return new GpsStatusPage(m, name, screen, top);
            case "SystemStatus": return new SystemStatusPage(m, name, screen, top);
            case "Checklist": return new ChecklistPage(m, screen);
            case "ActiveFlightPlanNarrow": return new FlightPlanPage(m, screen, waypointEntry, () => fplTool);
        }
        // No data: the map pages keep the navigation map under their title.
        const p = new MfdPage(m, name, screen);
        if (PAGE_GROUPS[0].pages.includes(name))
            p.navMap = "full";
        return p;
    };
    const groups = PAGE_GROUPS.map((g) => g.pages.map(make));
    const directTo = new DirectToPage(m, screen);
    const procedures = new ProceduresPage(m, screen, roots[roots.length - 1].parentNode);
    const pageMenu = new PageMenuPage(m, screen, roots[roots.length - 1].parentNode);
    const mapSetup = new MapSetupPage(m, screen, roots[roots.length - 1].parentNode);
    const fplTool = new FplToolPage(m, screen, roots[roots.length - 1].parentNode);
    for (const r of roots)
        r.style.display = "none";
    return { groups, directTo, procedures, waypointEntry, pageMenu, mapSetup, fplTool, utility };
}
