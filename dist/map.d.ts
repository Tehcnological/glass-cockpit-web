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
export interface MapData {
    /** Magnetic heading, degrees. */ heading: number;
    /** Aircraft position, decimal degrees. */ lat: number;
    lon: number;
    /** Map range, nm from the aircraft to the edge of the map's short side. */ range: number;
    orientation: "NORTH UP" | "HDG UP";
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
/** A group in screen coordinates, clipped to the map window, inserted before `before` (in whatever group holds it). */
export declare function mapGroup(screen: SVGGElement, before: Element, m: MapGeometry): SVGGElement;
/** Draws the map into `g`, which must be in screen coordinates (see `mapGroup`). */
export declare function drawMap(g: SVGGElement, s: MapData, m: MapGeometry, declutter?: number): void;
