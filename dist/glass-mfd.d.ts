import { type DisplayOptions } from "./display.js";
import { type Airspace, type MapPoint } from "./map.js";
import type { CdiSource } from "./glass-pfd.js";
import { type Knobs } from "./bezel.js";
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
    /** Map range, nm from the aircraft to the edge of the map's short side. */ range: number;
    orientation: "NORTH UP" | "HDG UP";
    points: MapPoint[];
    airspaces: Airspace[];
    /** Flight plan as point ids, in order. */ route: string[];
    /** Index into `route` of the active waypoint; the leg into it is magenta. */ activeLeg: number;
    engine: Engine;
    /** Which NAV shows green as the CDI source. */ cdiSource: CdiSource;
    /** Twelve softkey labels, left to right. */ softkeys: string[];
}
export interface MfdOptions extends DisplayOptions {
    /** Called when a bezel input changes the state (range, radios, and the shared knob values). */
    onChange?: (patch: Partial<MfdState>) => void;
}
export declare class GlassMfd {
    private options;
    readonly svg: SVGSVGElement;
    private state;
    private eis;
    private nav;
    private surround;
    private map;
    /** The container must be visible: layout is measured once here. */
    constructor(container: HTMLElement, options?: MfdOptions);
    private input;
    /** Merge new values into the state and redraw. */
    set(patch: Partial<MfdState>): void;
    private updateHeader;
    private updateEIS;
}
