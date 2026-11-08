// Glass MFD for the browser: the FG1000 MFD's surround and page groups (Nasal/MFDPages/Surround), engine strip
// (Nasal/EIS/EIS.nas) and pages (Nasal/MFDPages/*, see mfd-pages.ts), Copyright 2018 Stuart Buchanan, ported to
// TypeScript. GPL-2.0-or-later.
//
// FlightGear draws the map with its own Canvas map layers and navigation database. Here the map draws only the points
// it is given, with the symbols and styles of the FG1000 layers (Nasal/canvas/map/*.symbol.nas,
// NavigationMapStyles.nas) and the ownship icon from FG1000/Icons/APSmodel.svg.
import NAV_MAP from "./svg/nav-map.js";
import EIS from "./svg/eis.js";
import { drawEis, engineKeys } from "./eis.js";
import SURROUND from "./svg/surround-mfd.js";
import PAGE_SVGS from "./svg/mfd-pages.js";
import { buildDisplay } from "./display.js";
import { Page, mod } from "./page.js";
import { panInfo, panMarkup, panMeasureFrom, panMove, panProject, panStart, panTarget } from "./pan.js";
import { AIRWAY_RANGE, drawMap, mapGroup, mapUp, profileView, rangeLabel, shownAirways, stepRange } from "./map.js";
import { RADIOS, Surround } from "./surround.js";
import { adjust, bezelInput } from "./bezel.js";
import { BLANK, Highlighter, IdEntry, NS, dimKey, key } from "./ui.js";
import { dataBar, setupDefaults } from "./aux-pages.js";
import { PAGE_GROUPS, makePages } from "./mfd-pages.js";
/** The pan info bar's text size, px. */
const PAN_FONT = 18;
const DEFAULTS = {
    heading: 0, headingBug: 0, course: 0, baro: 29.92, alt: 0, selectedAlt: null, track: 0, groundspeed: 0, dtk: null, ete: null,
    lat: 0, lon: 0, magVar: 0, range: 10, orientation: "NORTH UP",
    points: [], airspaces: [], airways: [], airports: [], stations: [], procedures: [], route: [], activeLeg: 1, directFrom: null, vtf: false,
    engine: { rpm: 0, fuelFlow: 0, oilPressure: 0, oilTemp: 0, egt: 0, vacuum: 0, fuelLeft: 0, fuelRight: 0, volts: 0, engineHours: 0 },
    radios: RADIOS, navVolume: 0.5, comVolume: 0.5, navIdent: false, cdiSource: "NAV1", bearings: {}, checklists: [],
};
// Constants.nas MAP_FULL and MAP_PARTIAL: header 56 px, footer 25 px, engine strip 150 px, data display 300 px; the
// map's range is 689/2 px (NavMap.nas) either way.
const MAP_FULL = { x: 150, y: 56, w: 874, h: 687, cx: 587, cy: 399.5, px: 344.5 };
/** Profile View's window, along the bottom of the full map; and the profile's total width, nm. shortcut: the en
 * route width always (the Pilot's Guide narrows it by flight phase, which the MFD does not know). */
const PROFILE = { x: 150, y: 573, w: 874, h: 170 };
const PROFILE_WIDTH = 4;
const MAP_PARTIAL = { x: 150, y: 56, w: 574, h: 687, cx: 437, cy: 399.5, px: 344.5 };
// Surround.showMenu: the selected group and page, and the rest.
// v13 trainer: the page group window shows the selected page in cyan and the rest in white (FG1000: lilac and grey).
const MENU_SELECTED = "#00ffff";
const MENU_OTHER = "#ffffff";
export class GlassMfd {
    options;
    svg;
    state = { ...DEFAULTS };
    eis;
    nav;
    surround;
    /** Removes the bezel's window listener. */ unbezel = () => { };
    raw;
    map;
    mapPartial;
    /** Pan mode's pointer and info bar, over the full map. */ panLayer;
    /** Profile View's window, and the range box it pushes up. */ profile;
    rangeBox;
    frame;
    pages;
    /** DIRECT TO, PROC, WAYPOINT ENTRY or the PAGE MENU, over the page. */ overlay = null;
    /** The page FPL goes back to: group and page names. */ beforeFpl = ["MapPageGroup", "NavigationMap"];
    timers = { menu: 0, load: 0 };
    /** Once a second: the Utility page's trip statistics, and the AUX pages' clocks. */ clock;
    hl = new Highlighter();
    ui = {
        group: 0, page: 0, shown: [0, 0], menuVisible: false, menu: "top", dcltr: 0, trackVector: 0, airways: 0, airwayRange: { ...AIRWAY_RANGE },
        layers: { TRAFFIC: false, PROFILE: false, TOPO: false, TERRAIN: false }, recent: [], pan: null, setup: setupDefaults(),
    };
    /** The container must be visible: layout is measured once here. */
    constructor(container, options = {}) {
        this.options = options;
        const { svg, screen } = buildDisplay(container, [NAV_MAP, ...Object.values(PAGE_SVGS), SURROUND, EIS], "Multi-function display", options);
        this.svg = svg;
        this.eis = new Page(screen, "EIS");
        this.nav = new Page(screen, "NavigationMap");
        this.surround = new Surround(screen);
        this.raw = new Page(screen, "");
        // The map sits above its black background and below the range/orientation legend.
        this.map = mapGroup(screen, this.nav.el("Legend"), MAP_FULL);
        this.mapPartial = mapGroup(screen, this.nav.el("Legend"), MAP_PARTIAL);
        this.panLayer = mapGroup(screen, this.nav.el("Legend"), MAP_FULL);
        this.profile = mapGroup(screen, this.nav.el("Legend"), { ...PROFILE, cx: 0, cy: 0, px: 0 });
        // The range box (not the orientation box, in the same group) moves above Profile View.
        this.rangeBox = document.createElementNS(NS, "g");
        const box = this.nav.el("Legend").querySelector("rect");
        box.before(this.rangeBox);
        this.rangeBox.append(box, this.nav.el("RangeDisplay"));
        // Pages with no data source (weather, terrain, AUX) show their title and this line, under the surround.
        this.frame = document.createElementNS(NS, "text");
        for (const [k, v] of Object.entries({ x: "587", y: "110", "text-anchor": "middle", fill: "#ffffff", "font-size": "22", "font-family": "'Liberation Sans',Arial,sans-serif" })) {
            this.frame.setAttribute(k, v);
        }
        let surround = this.raw.el("PageTitle");
        while (surround.parentNode !== screen)
            surround = surround.parentNode;
        screen.insertBefore(this.frame, surround);
        addSystemSetupTab(this.raw);
        this.pages = makePages(this.api(), screen);
        this.clock = setInterval(() => {
            this.pages.utility.util.tick(this.state.groundspeed, Date.now());
            for (const m of this.pages.utility.sched.tick(Date.now()))
                this.options.onScheduler?.(m);
            if (this.page.live || this.groupPage.live)
                this.set({}); // still under the PAGE MENU
        }, 1000);
        if (options.bezel)
            this.unbezel = bezelInput(svg, (i) => this.input(i));
        this.loadPage();
    }
    /** Stops the page menu timers. Call when the display is removed. */
    destroy() {
        clearInterval(this.clock);
        clearTimeout(this.timers.menu);
        clearTimeout(this.timers.load);
        this.surround.destroy();
        this.unbezel();
    }
    // What the pages may use.
    api() {
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
            drawMap: (g, geom, center, preview) => drawMap(g, { ...this.state, center, preview, airways: this.airways() }, geom, this.ui.dcltr),
            open: (p) => this.openOverlay(p),
            close: () => this.closeOverlay(),
        };
    }
    /** The page under DIRECT TO or PROC. */
    get groupPage() {
        return this.pages.groups[this.ui.shown[0]][this.ui.shown[1]];
    }
    get page() {
        return this.overlay ?? this.groupPage;
    }
    input(i) {
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
                    if (this.ui.pan && !this.overlay)
                        this.ui.pan = panTarget(this.ui.pan, this.panView());
                    this.change({ range: stepRange(this.state.range, i.value) });
                }
                return this.set({});
            case "FMS_OUTER":
            case "FMS_INNER":
                if (page.crsr && page.fms(i.control === "FMS_OUTER", i.value > 0 ? 1 : -1))
                    return this.set({});
                if (this.overlay)
                    return;
                return this.pageMenu(i.control === "FMS_OUTER", i.value);
            case "CHAR":
                // A typed key: one clockwise turn of the small knob, which the identifier under the cursor takes as the key.
                if (!page.crsr || !page.typing())
                    return;
                IdEntry.typed = String.fromCharCode(i.value);
                try {
                    page.fms(false, 1);
                }
                finally {
                    IdEntry.typed = null; // never left for a later turn of the knob
                }
                return this.set({});
            case "FMS_CRSR":
                page.toggleCrsr();
                return this.set({});
            case "ENT":
                // Measuring (Pilot's Guide): ENT moves the start point to the pointer.
                if (this.ui.pan?.from && !this.overlay)
                    this.ui.pan = panMeasureFrom(this.ui.pan, this.panView());
                else
                    page.ent();
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
                const here = [PAGE_GROUPS[gi].group, PAGE_GROUPS[gi].pages[pi]];
                if (here[1] === "ActiveFlightPlanNarrow")
                    return this.overlay ? this.goToPage(...here) : this.goToPage(...this.beforeFpl);
                this.beforeFpl = here;
                return this.goToPage("FPLPageGroup", "ActiveFlightPlanNarrow");
            }
            case "MENU": {
                // v13 trainer: MENU opens the page's PAGE MENU; MENU again closes it (the trainer then opens its DEMO MODE page,
                // a simulator setting, not ported).
                const menu = this.pages.pageMenu;
                if (this.overlay === menu)
                    this.closeOverlay();
                else if (page.pageMenu()) {
                    menu.open(page.pageMenu(), page.title, this.overlay);
                    this.openOverlay(menu);
                }
                return this.set({});
            }
            case "JOYSTICK_PRESS":
                // v13 trainer: the push starts pan mode on the full navigation map; again ends it and recenters the map.
                if (this.overlay || this.groupPage.navMap !== "full")
                    return;
                this.ui.pan = this.ui.pan ? null : panStart(this.state, this.panView().up);
                return this.set({});
            case "JOYSTICK_HORIZONTAL":
            case "JOYSTICK_VERTICAL": {
                const pan = this.ui.pan;
                if (!pan || this.overlay)
                    return;
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
        const toStation = src === `NAV${this.surround.sel.nav}` ? this.state.bearings[src]?.bearing : null;
        const patch = adjust(i, this.state, this.surround.sel, toStation);
        if (patch)
            this.change(patch);
    }
    change(patch) {
        this.set(patch);
        this.options.onChange?.(patch);
    }
    openOverlay(p) {
        this.overlay?.show(false);
        this.overlay = p;
        this.hideMenu();
        this.ui.menu = "top";
        p.show(true);
        this.surround.setPageTitle(p.title);
    }
    closeOverlay() {
        if (!this.overlay)
            return;
        this.overlay.show(false);
        this.overlay = null;
        this.surround.setPageTitle(this.page.title);
    }
    // SurroundController.handleFMSOuter / Inner: the first click shows the page group menu, later ones step through it;
    // the page loads half a second after the last click and the menu hides after three.
    pageMenu(outer, value) {
        const u = this.ui;
        // AUX - SYSTEM SETUP's Page Navigation: Change On 1st Click moves on the first click too; its timeout.
        if (u.menuVisible || u.setup.firstClick) {
            const d = value > 0 ? 1 : -1;
            if (outer) {
                u.group = mod(u.group + d, PAGE_GROUPS.length);
                u.page = 0;
            }
            else {
                u.page = mod(u.page + d, PAGE_GROUPS[u.group].pages.length);
            }
        }
        this.showMenu();
        clearTimeout(this.timers.menu);
        clearTimeout(this.timers.load);
        this.timers.menu = window.setTimeout(() => this.hideMenu(), u.setup.timeout * 1000);
        this.timers.load = window.setTimeout(() => this.loadPage(), 500);
    }
    showMenu() {
        const u = this.ui;
        u.menuVisible = true;
        PAGE_GROUPS.forEach((g, gi) => {
            const sel = gi === u.group;
            this.raw.show(g.group, sel);
            this.raw.show(g.label, true);
            this.color(g.label, MENU_OTHER);
            if (sel)
                g.pages.forEach((p, pi) => this.color(p, pi === u.page ? MENU_SELECTED : MENU_OTHER));
        });
    }
    hideMenu() {
        this.ui.menuVisible = false;
        for (const g of PAGE_GROUPS) {
            this.raw.show(g.group, false);
            this.raw.show(g.label, false);
        }
    }
    color(id, c) {
        const e = this.raw.el(id);
        if (e)
            for (const t of [e, ...e.querySelectorAll("text, tspan")])
                t.style.fill = c;
    }
    /** Surround.goToPage: by group and page name. */
    goToPage(group, page) {
        const gi = PAGE_GROUPS.findIndex((g) => g.group === group);
        if (gi < 0)
            return;
        this.ui.group = gi;
        this.ui.page = Math.max(0, PAGE_GROUPS[gi].pages.indexOf(page));
        this.hideMenu();
        this.loadPage();
    }
    loadPage() {
        const u = this.ui;
        this.closeOverlay();
        this.groupPage.show(false);
        if (u.shown[0] !== u.group || u.shown[1] !== u.page)
            u.pan = null; // the page group menu reloads the same page too
        u.shown = [u.group, u.page];
        u.menu = "top";
        this.groupPage.show(true);
        this.surround.setPageTitle(this.groupPage.title);
        this.set({});
    }
    /** Merge new values into the state and redraw. */
    set(patch) {
        const s = (this.state = { ...this.state, ...patch });
        this.pages.utility.util.tick(s.groundspeed, Date.now());
        const page = this.page;
        const under = this.groupPage;
        this.surround.setRadios(s.radios, s.cdiSource === "NAV1" ? 1 : s.cdiSource === "NAV2" ? 2 : null);
        this.surround.setVolume("Nav", s.navVolume);
        this.surround.setVolume("Comm", s.comVolume);
        const keys = this.softkeys();
        this.surround.setSoftkeys(keys.map((k) => k.label), keys.map((k) => !!k.lit), keys.map((k) => !!k.dim));
        this.surround.setPageTitle(page.title); // a page's softkeys may change its title (the airport page's APR)
        this.updateHeader(s);
        drawEis(this.eis, s.engine);
        // NavigationMap.ondisplay / ondisplayPartial: the full map, the map beside a page's data, or none. DIRECT TO and
        // WAYPOINT ENTRY are windows over the page, which stays drawn.
        const base = page === this.pages.directTo || page === this.pages.waypointEntry || page === this.pages.pageMenu || page === this.pages.mapSetup || page === this.pages.fplTool ? under : page;
        const mode = base.navMap;
        // Profile View: the navigation map page's (Pilot's Guide), with the PROFILE key or the PAGE MENU.
        const profile = mode === "full" && base.name === "NavigationMap" && !!this.ui.layers.PROFILE;
        this.nav.show("Group", mode !== null);
        this.map.style.display = mode === "full" ? "inline" : "none";
        this.mapPartial.style.display = mode === "partial" ? "inline" : "none";
        if (mode) {
            this.nav.tf("Legend", { tx: mode === "partial" ? MAP_PARTIAL.w - MAP_FULL.w : 0 });
            this.nav.text("RangeDisplay", rangeLabel(s.range));
            this.nav.text("OrientationDisplay", s.orientation);
            const pan = mode === "full" ? this.ui.pan : null;
            const center = pan?.center ?? base.center() ?? undefined;
            const prof = profile && profileView(s.alt, s.range);
            const profilePath = prof ? { nm: prof.nm, width: PROFILE_WIDTH, ticks: prof.nm >= 4 ? prof.ticks.map((t) => t.nm) : [] } : undefined;
            drawMap(mode === "full" ? this.map : this.mapPartial, { ...s, center, up: pan?.up, trackVector: mode === "full" ? this.ui.trackVector : 0, airways: this.airways(), profilePath, nearestLine: base.nearestLine() ?? undefined }, mode === "full" ? MAP_FULL : MAP_PARTIAL, this.ui.dcltr);
        }
        this.drawProfile(profile);
        this.drawPan(mode === "full");
        this.frame.textContent = base.frame();
        if (base !== page)
            base.draw();
        page.draw();
    }
    panView() {
        const s = this.state;
        const up = this.ui.pan?.up ?? mapUp(s);
        return { w: MAP_FULL.w, h: MAP_FULL.h, scale: MAP_FULL.px / s.range, up, lat: s.lat, bar: PAN_FONT * 2.7 };
    }
    panInfo() {
        const s = this.state;
        const named = [...s.points, ...s.route.filter((r) => typeof r !== "string")];
        return panInfo(this.ui.pan, this.panView(), this.ui.pan.from ?? s, named, s.magVar);
    }
    /** Pan mode: the pointer, and the info bar across the top of the map (layout from the v13 trainer, drawn here). */
    drawPan(shown) {
        const pan = shown ? this.ui.pan : null;
        this.panLayer.style.display = pan ? "inline" : "none";
        if (!pan)
            return;
        const start = pan.from && panProject(pan, pan.from, this.panView());
        this.panLayer.innerHTML = panMarkup(pan, this.panInfo(), MAP_FULL, PAN_FONT, start);
    }
    // The softkeys: the page's own, or a menu shared by the pages (EIS engineMenu, NavigationMap mapMenu).
    softkeys() {
        const u = this.ui;
        const to = (m) => () => (u.menu = m);
        const fill = (k) => [...k, ...Array(12).fill(BLANK)].slice(0, 12);
        // v13 trainer layouts: BACK in the eleventh slot, and dim keys for data GCW has no source for.
        switch (u.menu) {
            case "engine":
            case "lean":
            case "system":
                return fill([...engineKeys(u.menu, to), key("BACK", to(u.menu === "engine" ? "top" : "engine"))]);
            case "map": {
                // shortcut: no traffic data; TRAFFIC switches only its setting.
                const layer = (n) => key(n, () => (u.layers[n] = !u.layers[n]), u.layers[n]);
                const airways = ["AIRWAYS", "AIRWY ON", "AIRWY LO", "AIRWY HI"];
                return fill([layer("TRAFFIC"), layer("PROFILE"), dimKey("TOPO"), dimKey("TERRAIN"),
                    key(airways[u.airways], () => (u.airways = (u.airways + 1) % 4), u.airways > 0), BLANK, dimKey("PRECIP"), BLANK, dimKey("METAR"),
                    dimKey("LEGEND"), key("BACK", to("top"))]);
            }
        }
        return fill(this.page.keys());
    }
    // Most pages start with ENGINE and MAP (EIS.engineMenu, NavigationMap.mapMenu).
    topKeys(extra = {}) {
        const k = Array(12).fill(BLANK);
        k[0] = key("ENGINE", () => (this.ui.menu = "engine"));
        k[2] = key("MAP", () => (this.ui.menu = "map"));
        for (const [i, v] of Object.entries(extra))
            k[Number(i)] = v;
        return k;
    }
    // A frequency from a page (ENT on a NRST or WPT frequency) goes to the standby of the selected NAV or COM.
    tune(freq) {
        const r = this.state.radios;
        const nav = freq >= 108 && freq < 118;
        if (!nav && (freq < 118 || freq >= 137))
            return;
        const which = nav ? `nav${this.surround.sel.nav}` : `com${this.surround.sel.com}`;
        this.change({ radios: { ...r, [which]: { ...r[which], standby: freq } } });
    }
    /** The airways the AIRWAYS key shows at this range. */
    airways() {
        return shownAirways(this.state.airways, this.ui.airways, this.state.range, this.ui.airwayRange);
    }
    // Profile View (Pilot's Guide; FG1000 has none): a window under the navigation map with an altitude scale, the
    // aircraft at its altitude, and the distance scale, half the map range. shortcut: no terrain or obstacle data, so
    // the window is empty of terrain; our own layout.
    drawProfile(on) {
        this.profile.style.display = on ? "inline" : "none";
        this.rangeBox.setAttribute("transform", on ? `translate(0 ${-PROFILE.h})` : "");
        if (!on)
            return;
        const s = this.state;
        const p = profileView(s.alt, s.range);
        const { x, y, w, h } = PROFILE;
        const font = `font-family:'Liberation Sans Narrow','Arial Narrow',sans-serif;font-stretch:condensed;font-size:16px`;
        const text = (t, tx, ty, anchor, fill = "#ffffff") => `<text x="${tx}" y="${ty}" fill="${fill}" text-anchor="${anchor}" style="${font}">${t}</text>`;
        let out = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="#000000" stroke="#ffffff"/>`;
        if (!p) {
            this.profile.innerHTML = out + text("PROFILE NOT AVAILABLE", x + w / 2, y + h / 2 + 6, "middle");
            return;
        }
        const [l, r, top, bot] = [x + 60, x + w - 20, y + 12, y + h - 28];
        const altY = (ft) => bot - ((ft - p.bottom) / (p.step * 4)) * (bot - top);
        for (let i = 0; i <= 4; i++) {
            const ft = p.bottom + i * p.step;
            out += `<line x1="${l}" y1="${altY(ft)}" x2="${r}" y2="${altY(ft)}" stroke="#404040"/>` + text(String(ft), l - 6, altY(ft) + 5, "end");
        }
        out += `<line x1="${l}" y1="${bot}" x2="${r}" y2="${bot}" stroke="#ffffff"/>`;
        for (const t of p.ticks) {
            const tx = l + (t.nm / p.nm) * (r - l);
            out += `<line x1="${tx}" y1="${bot}" x2="${tx}" y2="${bot + 6}" stroke="#ffffff"/>` + text(t.label, tx, bot + 22, t.nm === 0 ? "start" : t.nm === p.nm ? "end" : "middle");
        }
        // The aircraft, seen from the side, at its altitude.
        const ay = altY(Math.min(s.alt, p.bottom + p.step * 4));
        out += `<path d="M ${l} ${ay - 6} L ${l + 18} ${ay} L ${l} ${ay + 6} Z" fill="#ffffff" stroke="#000000"/>`;
        this.profile.innerHTML = out;
    }
    // Surround.updateHeaderData, MFD half: FG1000's GS, DTK, TRK, ETE, or the fields AUX - SYSTEM SETUP picks.
    updateHeader(s) {
        const fields = this.ui.setup.dataBar.map((f) => [f, dataBar(f, s, Date.now(), this.ui.setup)]);
        fields.forEach(([label, value], i) => {
            this.surround.p.text(`Header${i + 1}Label`, label);
            this.surround.p.text(`Header${i + 1}Value`, value);
        });
    }
}
export { ete } from "./aux-pages.js";
/** AUX - SYSTEM SETUP in the AUX page group's tab menu, after GPS STATUS (Pilot's Guide; FG1000's menu has no such
 * line). The box grows up a line, as the NRST group's taller box does. */
function addSystemSetupTab(raw) {
    const gps = raw.el("GPSStatus");
    const box = raw.el("AuxPageGroup")?.querySelector("rect");
    if (!gps || !box)
        return;
    const LINE = 16.13;
    box.setAttribute("y", String(Number(box.getAttribute("y")) - LINE));
    box.setAttribute("height", String(Number(box.getAttribute("height")) + LINE));
    // Only elements with their own y move; a tspan without one follows its text.
    const shift = (e, d) => e.hasAttribute("y") && e.setAttribute("y", String(Number(e.getAttribute("y")) + d));
    for (const id of ["TripPlanning", "Utility", "GPSStatus"]) {
        for (const e of [raw.el(id), ...raw.el(id).querySelectorAll("tspan")])
            shift(e, -LINE);
    }
    const t = gps.cloneNode(true);
    for (const e of [t, ...t.querySelectorAll("tspan")]) {
        e.removeAttribute("id");
        shift(e, LINE);
    }
    t.id = "SystemSetup";
    t.querySelector("tspan").textContent = "SYSTEM SETUP";
    gps.after(t);
}
