import type { LatLon, MapGeometry } from "./map.js";
/** Pixels the pointer moves for one joystick click. */
export declare const PAN_STEP = 12;
/** `center`: the map's center; `x`, `y`: the pointer, in pixels from the map window's center; `up`: the map's rotation,
 * held while panning so a heading-up map does not turn under the pointer. */
export interface Pan {
    center: LatLon;
    x: number;
    y: number;
    up: number;
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
/** RANGE while panning: the map recenters on the pointer (Pilot's Guide, Weather Data Link page; NXi on every map). */
export declare const panTarget: (p: Pan, v: PanView) => Pan;
/** The pointer and the info bar across the top of the map window `m`, as SVG, text `font` px high. Drawn here, not the trainer's. */
export declare function panMarkup(p: Pan, info: ReturnType<typeof panInfo>, m: MapGeometry, font: number): string;
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
