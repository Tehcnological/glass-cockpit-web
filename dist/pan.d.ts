import type { LatLon, MapGeometry, MapPoint } from "./map.js";
/** Pixels the pointer moves for one joystick click. */
export declare const PAN_STEP = 12;
/** Pilot's Guide: with no joystick input for about a minute, pan mode ends and the map recenters on the aircraft. */
export declare const PAN_IDLE_MS = 60000;
/** ENT with the pointer on a waypoint: the WPT page for its type. User waypoints have none (UserWPTInfo has no data here). */
export declare const PAN_WPT_PAGES: Partial<Record<MapPoint["type"], string>>;
/** Pan mode's idle timer: one timeout, started with pan mode, restarted by each joystick move, stopped when pan ends. */
export declare class PanIdle {
    private end;
    private t;
    constructor(end: () => void);
    /** Call on every redraw: starts the timer when pan mode has started, stops it when pan mode has ended. */
    sync(panning: boolean): void;
    moved(): void;
    stop(): void;
}
/** `center`: the map's center; `x`, `y`: the pointer, in pixels from the map window's center; `up`: the map's rotation,
 * held while panning so a heading-up map does not turn under the pointer; `from`: while measuring (Measure
 * Bearing/Distance), the start point the info bar measures from. */
export interface Pan {
    center: LatLon;
    x: number;
    y: number;
    up: number;
    from?: LatLon;
}
/** The map window: its size, pixels per nm, the map's up direction (degrees true), the aircraft's latitude, and the height
 * the info bar covers at its top. */
export interface PanView {
    w: number;
    h: number;
    scale: number;
    up: number;
    lat: number;
    bar?: number;
}
export declare const panStart: (here: LatLon, up?: number) => Pan;
/** One joystick click: `dx`, `dy` are -1, 0 or 1 (right, down positive). */
export declare function panMove(p: Pan, dx: number, dy: number, v: PanView): Pan;
export declare const panPoint: (p: Pan, v: PanView) => LatLon;
/** Where `q` is on the map, in pixels from the map window's center. */
export declare const panProject: (p: Pan, q: LatLon, v: PanView) => [number, number];
/** ENT while measuring: the start point moves to the pointer (Pilot's Guide). */
export declare const panMeasureFrom: (p: Pan, v: PanView) => Pan;
/** RANGE while panning: the map recenters on the pointer (Pilot's Guide, Weather Data Link page; NXi on every map). */
export declare const panTarget: (p: Pan, v: PanView) => Pan;
/** The pointer and the info bar across the top of the map window `m`, as SVG, text `font` px high, and while measuring
 * the line from `start`. Drawn here, not the trainer's. */
export declare function panMarkup(p: Pan, info: ReturnType<typeof panInfo>, m: MapGeometry, font: number, start?: [number, number]): string;
/** The info bar: the point under the pointer (or MAP POINTER), its distance and magnetic bearing from the aircraft, lat/lon. */
export declare function panInfo(p: Pan, v: PanView, here: LatLon, points: (LatLon & {
    id: string;
})[], magVar: number): {
    label: string;
    dis: string;
    brg: string;
    lat: number;
    lon: number;
};
/** The point under the pointer (the closest within a few pixels), or undefined. */
export declare function panUnder<T extends LatLon>(p: Pan, v: PanView, points: T[]): T | undefined;
