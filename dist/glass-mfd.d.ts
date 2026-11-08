import { type DisplayOptions } from "./display.js";
import { type Airspace, type LatLon, type MapPoint, type Orientation } from "./map.js";
import type { CdiSource } from "./glass-pfd.js";
import { type Knobs } from "./bezel.js";
import type { Airport, Procedure, Station } from "./nav.js";
import { type Checklist } from "./mfd-pages.js";
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
    /** NORTH UP, TRK UP, DTK UP or HDG UP; MAP SETUP changes it and reports it. */ orientation: Orientation;
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
    bearings: Partial<Record<"NAV1" | "NAV2", {
        bearing: number;
    }>>;
    /** For LST - CHECKLIST. */ checklists: Checklist[];
}
export interface MfdOptions extends DisplayOptions {
    /** Called when a bezel input changes the state (range, radios, flight plan, and the shared knob values). */
    onChange?: (patch: Partial<MfdState>) => void;
}
export declare class GlassMfd {
    private options;
    readonly svg: SVGSVGElement;
    private state;
    private eis;
    private nav;
    private surround;
    /** Removes the bezel's window listener. */ private unbezel;
    private raw;
    private map;
    private mapPartial;
    /** Pan mode's pointer and info bar, over the full map. */ private panLayer;
    private frame;
    private pages;
    /** DIRECT TO, PROC, WAYPOINT ENTRY or the PAGE MENU, over the page. */ private overlay;
    /** The page FPL goes back to: group and page names. */ private beforeFpl;
    private timers;
    /** Once a second: the Utility page's trip statistics, and the AUX pages' clocks. */ private clock;
    private hl;
    private ui;
    /** The container must be visible: layout is measured once here. */
    constructor(container: HTMLElement, options?: MfdOptions);
    /** Stops the page menu timers. Call when the display is removed. */
    destroy(): void;
    private api;
    /** The page under DIRECT TO or PROC. */
    private get groupPage();
    private get page();
    private input;
    private change;
    private openOverlay;
    private closeOverlay;
    private pageMenu;
    private showMenu;
    private hideMenu;
    private color;
    /** Surround.goToPage: by group and page name. */
    private goToPage;
    private loadPage;
    /** Merge new values into the state and redraw. */
    set(patch: Partial<MfdState>): void;
    private panView;
    private panInfo;
    /** Pan mode: the pointer, and the info bar across the top of the map (layout from the v13 trainer, drawn here). */
    private drawPan;
    private softkeys;
    private topKeys;
    private tune;
    private updateHeader;
    private updateEIS;
}
export { ete } from "./aux-pages.js";
