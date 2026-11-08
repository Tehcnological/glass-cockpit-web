import { Page } from "./page.js";
import { type LatLon, type MapGeometry, type MapPoint } from "./map.js";
import { Highlighter, type Key } from "./ui.js";
import type { MfdState } from "./glass-mfd.js";
/** A checklist for LST - CHECKLIST, e.g. { group: "EMERGENCY", name: "ENGINE FIRE", items: [{ name: "Mixture", value: "IDLE CUTOFF" }] }. */
export interface Checklist {
    group: string;
    name: string;
    items: {
        name: string;
        value: string;
    }[];
}
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
export declare const PAGE_GROUPS: {
    group: string;
    label: string;
    pages: string[];
}[];
/** A page: its SVG elements and how it takes the knobs. The base is a page with no data (title, NO DATA). */
export declare class MfdPage {
    protected m: Mfd;
    readonly name: string;
    /** The FMS cursor is on the page (CRSR). */ crsr: boolean;
    /** The navigation map behind the page: the whole map, or the map beside the page's data. */
    navMap: "full" | "partial" | null;
    protected p: Page;
    protected root: SVGGElement | null;
    protected get s(): MfdState;
    constructor(m: Mfd, name: string, screen: SVGGElement);
    get title(): string;
    show(on: boolean): void;
    /** The text shown on pages with no data source, or "". */
    frame(): string;
    keys(): Key[];
    /** The FMS knob with the cursor on; false leaves the turn to the page menu. */
    fms(_outer: boolean, _d: number): boolean;
    toggleCrsr(): void;
    ent(): void;
    clr(): void;
    /** The RANGE knob, if the page has its own ranges. */
    range(_d: number): boolean;
    /** Where the navigation map centers, if not on the aircraft. */
    center(): LatLon | null;
    /** The waypoint DIRECT TO starts with from this page (the one under the cursor). */
    selected(): string | null;
    draw(): void;
}
/** A page with its own map window beside its data. */
declare class MapPage extends MfdPage {
    private geom;
    protected g: SVGGElement;
    constructor(m: Mfd, name: string, screen: SVGGElement, geom: MapGeometry);
    protected drawOwnMap(): void;
}
declare class WaypointEntryPage extends MapPage {
    private dest;
    private entry;
    private sub;
    private done;
    constructor(m: Mfd, screen: SVGGElement);
    /** Opens blank, then takes the inner knob turn `d` that opened it. */
    open(done: (p: MapPoint) => void, d: number): void;
    center(): MapPoint | null;
    keys(): Key[];
    toggleCrsr(): void;
    fms(outer: boolean, d: number): boolean;
    ent(): void;
    clr(): void;
    private load;
    draw(): void;
}
declare class DirectToPage extends MapPage {
    private id;
    private onActivate;
    private entry;
    private sub;
    constructor(m: Mfd, screen: SVGGElement);
    open(id: string | null): void;
    private point;
    center(): MapPoint | null;
    keys(): Key[];
    toggleCrsr(): void;
    fms(outer: boolean, d: number): boolean;
    private pick;
    ent(): void;
    clr(): void;
    draw(): void;
}
declare class ProceduresPage extends MfdPage {
    navMap: "partial";
    private airport;
    private view;
    private item;
    private yes;
    private grp;
    private apr;
    private trans;
    private entry;
    constructor(m: Mfd, screen: SVGGElement, after: Element);
    /** Opens on the PROCEDURES menu. SELECT APPROACH opens on the destination: the last airport in the flight plan, else the nearest. */
    open(): void;
    private procs;
    private transitions;
    /** The loaded approach: its fixes are the route's own points, after the en route waypoints (see `load`). */
    private loaded;
    private enabled;
    keys(): Key[];
    toggleCrsr(): void;
    fms(outer: boolean, d: number): boolean;
    ent(): void;
    clr(): void;
    private menuItem;
    private load;
    draw(): void;
}
export interface Pages {
    groups: MfdPage[][];
    directTo: DirectToPage;
    procedures: ProceduresPage;
    waypointEntry: WaypointEntryPage;
}
/** Builds every page. Their SVGs (src/svg/mfd-pages.ts) must be in `screen`; they are measured here, so it must be visible. */
export declare function makePages(m: Mfd, screen: SVGGElement): Pages;
export {};
