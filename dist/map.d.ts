export interface MapPoint {
    id: string;
    type: "APT" | "VOR" | "NDB" | "FIX" | "WPT";
    lat: number;
    lon: number;
    /** The rest is for the NRST and WPT pages. */ name?: string;
    /** MHz or kHz as published, e.g. "113.80", "338". */ freq?: string;
    /** e.g. "VORTAC", "VOR/DME", "NDB". */ kind?: string;
    /** Service volume class, e.g. "H", "L", "T". */ cls?: string;
    city?: string;
    /** e.g. "AZ". */ region?: string;
    /** Degrees, east positive. */ magVar?: number;
    /** Flight plan legs: the published altitude, e.g. "3600+" (see `ProcLeg`). */ alt?: string | null;
    /** Flight plan legs: the fix's role in an approach (see `ProcLeg`). */ role?: string;
    /** Flight plan legs: the approach PROC loaded this fix from, e.g. "ILS RWY 36". */ approach?: string;
}
/** A position only. */
export interface LatLon {
    lat: number;
    lon: number;
}
/** Class B, C or D airspace: outlines as rings of [lat, lon]. */
export interface Airspace {
    cls: "B" | "C" | "D";
    rings: [number, number][][];
}
/** Map orientations, as MAP SETUP offers them (Pilot's Guide); FG1000 has north up and heading up. */
export declare const ORIENTATIONS: readonly ["NORTH UP", "TRK UP", "DTK UP", "HDG UP"];
export type Orientation = (typeof ORIENTATIONS)[number];
/** MAP SETUP's track vector look-ahead times, seconds; 0 is off (Pilot's Guide: 30 s to 20 min, 60 s the default). */
export declare const TRACK_VECTOR: number[];
export interface MapData {
    /** Magnetic heading, degrees. */ heading: number;
    /** Aircraft position, decimal degrees. */ lat: number;
    lon: number;
    /** Map range, nm from the aircraft to the edge of the map's short side. */ range: number;
    orientation: Orientation;
    /** The map's rotation, degrees, in place of the orientation's: pan mode holds it still. */ up?: number;
    /** For TRK UP, DTK UP and the track vector: ground track and desired track, degrees, and groundspeed, knots. */ track?: number;
    dtk?: number | null;
    groundspeed?: number;
    /** Track vector look-ahead, seconds; 0 or absent draws none. */ trackVector?: number;
    points: MapPoint[];
    airspaces: Airspace[];
    /** Flight plan in order: ids of `points`, or points of its own (approach fixes). */ route: (string | MapPoint)[];
    /** Index into `route` of the active waypoint; the leg into it is magenta. */ activeLeg: number;
    /** After a Direct-To: where it started; the magenta leg runs from here to the active waypoint. */ directFrom?: LatLon | null;
    /** Map center when not the aircraft (WPT pages center on the waypoint). */ center?: LatLon;
}
/** Map window in screen pixels: clip box, aircraft position, and pixels per `range`. */
export interface MapGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
    px: number;
}
export declare const RANGES: number[];
/** The next range out (dir 1) or in (dir -1) from `r`. */
export declare function stepRange(r: number, dir: number): number;
export declare const rangeLabel: (r: number) => string;
export declare const DCLTR: string[];
/** The map's rotation, degrees: pan mode's held rotation, else the orientation's. DTK UP with no desired track turns to the track. */
export declare function mapUp(s: Pick<MapData, "orientation" | "heading" | "up" | "track" | "dtk">): number;
/** Where the track vector ends: the aircraft's position after `secs` along its track at its groundspeed. */
export declare function trackVectorEnd(s: LatLon & {
    track: number;
    groundspeed: number;
}, secs: number): LatLon;
/** A group in screen coordinates, clipped to the map window, inserted before `before` (in whatever group holds it). */
export declare function mapGroup(screen: SVGGElement, before: Element, m: MapGeometry): SVGGElement;
/** Draws the map into `g`, which must be in screen coordinates (see `mapGroup`). */
export declare function drawMap(g: SVGGElement, s: MapData, m: MapGeometry, declutter?: number): void;
