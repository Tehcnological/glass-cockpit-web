import { type Airway, type Orientation } from "./map.js";
export interface MapSettings {
    orientation: Orientation;
    /** Track vector look-ahead, seconds; 0 is off. */ trackVector: number;
    /** The AIRWAYS key's state: 0 off, 1 all, 2 low only, 3 high only. */ airways: number;
    /** The largest map range, nm, each airway type shows at. */ airwayRange: Record<Airway["type"], number>;
}
export interface SetupRow {
    label: string;
    value?: (s: MapSettings) => string;
    /** The change one detent of the small FMS knob makes; none means the setting is not ported. */
    step?: (s: MapSettings, d: number) => Partial<MapSettings>;
}
export declare const SETUP_GROUPS: {
    name: string;
    rows: SetupRow[];
}[];
