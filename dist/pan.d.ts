import type { LatLon } from "./map.js";
/** Pixels the pointer moves for one joystick click. */
export declare const PAN_STEP = 12;
/** `center`: the map's center; `x`, `y`: the pointer, in pixels from the map window's center. */
export interface Pan {
    center: LatLon;
    x: number;
    y: number;
}
/** The map window: its size, pixels per nm, the map's up direction (degrees true) and the aircraft's latitude. */
export interface PanView {
    w: number;
    h: number;
    scale: number;
    up: number;
    lat: number;
}
export declare const panStart: (here: LatLon) => Pan;
/** One joystick click: `dx`, `dy` are -1, 0 or 1 (right, down positive). */
export declare function panMove(p: Pan, dx: number, dy: number, v: PanView): Pan;
export declare const panPoint: (p: Pan, v: PanView) => LatLon;
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
