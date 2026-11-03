export interface MapPoint {
    id: string;
    type: "APT" | "VOR" | "NDB" | "FIX" | "WPT";
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
    /** Flight plan as point ids, in order. */ route: string[];
    /** Index into `route` of the active waypoint; the leg into it is magenta. */ activeLeg: number;
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
