// Map pan mode, from the v13 trainer (FG1000 has none): the joystick push puts a pointer on the aircraft and an info bar
// over the map; the joystick moves the pointer, and at the map's edge the map scrolls instead. Pushing again ends it.
// DOM-free so the tests can run it.
import { bearingDistance } from "./nav.js";
import { deg3 } from "./page.js";
import type { LatLon } from "./map.js";

const NM_PER_DEG = 60;
/** Pixels the pointer moves for one joystick click. */
export const PAN_STEP = 12;
/** How close to the map's edge the pointer may go. */
const MARGIN = 10;
/** A point within this many pixels of the pointer is the one it names. */
const NEAR = 6;

/** `center`: the map's center; `x`, `y`: the pointer, in pixels from the map window's center. */
export interface Pan { center: LatLon; x: number; y: number }
/** The map window: its size, pixels per nm, the map's up direction (degrees true) and the aircraft's latitude. */
export interface PanView { w: number; h: number; scale: number; up: number; lat: number }

export const panStart = (here: LatLon): Pan => ({ center: here, x: 0, y: 0 });

/** Screen offset from the map's center to lat/lon, the inverse of drawMap's projection. */
function unproject(c: LatLon, x: number, y: number, v: PanView): LatLon {
  const rad = (v.up * Math.PI) / 180;
  const e = x * Math.cos(rad) - y * Math.sin(rad);
  const n = -x * Math.sin(rad) - y * Math.cos(rad);
  return { lat: c.lat + n / (NM_PER_DEG * v.scale), lon: c.lon + e / (NM_PER_DEG * Math.cos((v.lat * Math.PI) / 180) * v.scale) };
}

function project(c: LatLon, p: LatLon, v: PanView): [number, number] {
  const rad = (v.up * Math.PI) / 180;
  const e = (p.lon - c.lon) * NM_PER_DEG * Math.cos((v.lat * Math.PI) / 180) * v.scale;
  const n = (p.lat - c.lat) * NM_PER_DEG * v.scale;
  return [e * Math.cos(rad) - n * Math.sin(rad), -(e * Math.sin(rad) + n * Math.cos(rad))];
}

/** One joystick click: `dx`, `dy` are -1, 0 or 1 (right, down positive). */
export function panMove(p: Pan, dx: number, dy: number, v: PanView): Pan {
  const [mx, my] = [v.w / 2 - MARGIN, v.h / 2 - MARGIN];
  const [x, y] = [p.x + dx * PAN_STEP, p.y + dy * PAN_STEP];
  const [cx, cy] = [Math.max(-mx, Math.min(mx, x)), Math.max(-my, Math.min(my, y))];
  const center = x === cx && y === cy ? p.center : unproject(p.center, x - cx, y - cy, v);
  return { center, x: cx, y: cy };
}

export const panPoint = (p: Pan, v: PanView): LatLon => unproject(p.center, p.x, p.y, v);

/** The info bar: the point under the pointer (or MAP POINTER), its distance and magnetic bearing from the aircraft, lat/lon. */
export function panInfo(p: Pan, v: PanView, here: LatLon, points: (LatLon & { id: string })[], magVar: number) {
  const at = panPoint(p, v);
  const under = points.find((q) => {
    const [x, y] = project(p.center, q, v);
    return Math.hypot(x - p.x, y - p.y) <= NEAR;
  });
  const { brg, dist } = bearingDistance(here.lat, here.lon, at.lat, at.lon);
  const dis = dist < 0.1 ? `${Math.round(dist * 6076.12)}FT` : dist < 100 ? `${dist.toFixed(1)}NM` : `${Math.round(dist)}NM`;
  return { label: under?.id ?? "MAP POINTER", dis, brg: deg3(brg - magVar), lat: at.lat, lon: at.lon };
}
