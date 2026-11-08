// Map pan mode, from the Pilot's Guide and the v13 trainer (FG1000 has none): the joystick push puts a pointer on the aircraft and an info bar
// over the map; the joystick moves the pointer, and at the map's edge the map scrolls instead. Pushing again ends it.
// DOM-free so the tests can run it.
import { bearingDistance, latLon } from "./nav.js";
import { deg3 } from "./page.js";
const NM_PER_DEG = 60;
/** Pixels the pointer moves for one joystick click. */
export const PAN_STEP = 12;
/** How close to the map's edge the pointer may go. */
const MARGIN = 10;
/** A point within this many pixels of the pointer is the one it names. */
const NEAR = 6;
export const panStart = (here) => ({ center: here, x: 0, y: 0 });
/** Screen offset from the map's center to lat/lon, the inverse of drawMap's projection. */
function unproject(c, x, y, v) {
    const rad = (v.up * Math.PI) / 180;
    const e = x * Math.cos(rad) - y * Math.sin(rad);
    const n = -x * Math.sin(rad) - y * Math.cos(rad);
    return { lat: c.lat + n / (NM_PER_DEG * v.scale), lon: c.lon + e / (NM_PER_DEG * Math.cos((v.lat * Math.PI) / 180) * v.scale) };
}
function project(c, p, v) {
    const rad = (v.up * Math.PI) / 180;
    const e = (p.lon - c.lon) * NM_PER_DEG * Math.cos((v.lat * Math.PI) / 180) * v.scale;
    const n = (p.lat - c.lat) * NM_PER_DEG * v.scale;
    return [e * Math.cos(rad) - n * Math.sin(rad), -(e * Math.sin(rad) + n * Math.cos(rad))];
}
/** One joystick click: `dx`, `dy` are -1, 0 or 1 (right, down positive). */
export function panMove(p, dx, dy, v) {
    const [mx, my] = [v.w / 2 - MARGIN, v.h / 2 - MARGIN];
    const [x, y] = [p.x + dx * PAN_STEP, p.y + dy * PAN_STEP];
    const [cx, cy] = [Math.max(-mx, Math.min(mx, x)), Math.max(-my, Math.min(my, y))];
    const center = x === cx && y === cy ? p.center : unproject(p.center, x - cx, y - cy, v);
    return { center, x: cx, y: cy };
}
export const panPoint = (p, v) => unproject(p.center, p.x, p.y, v);
/** RANGE while panning: the map recenters on the pointer (Pilot's Guide, Weather Data Link page; NXi on every map). */
export const panTarget = (p, v) => ({ center: panPoint(p, v), x: 0, y: 0 });
/** The pointer and the info bar across the top of the map window `m`, as SVG, text `font` px high. Drawn here, not the trainer's. */
export function panMarkup(p, info, m, font) {
    const [x, y, k] = [m.cx + p.x, m.cy + p.y, font / 18];
    const t = (tx, ty, s, anchor = "start") => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="#ffffff" font-size="${font}" font-family="'Liberation Sans',Arial,sans-serif">${s}</text>`;
    const [pad, l1, l2] = [font * 0.55, m.y + font * 1.1, m.y + font * 2.3];
    return `<path d="M${x} ${y}l0 ${22 * k}l${6 * k} ${-6 * k}l${6 * k} ${11 * k}l${4 * k} ${-2 * k}l${-6 * k} ${-11 * k}l${9 * k} 0z" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>` +
        `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${font * 2.7}" fill="#000000" stroke="#808080" stroke-width="2"/>` +
        t(m.x + pad, l1, info.label) + t(m.x + pad, l2, `${info.dis}  ${info.brg}`) +
        t(m.x + m.w - pad, l1, latLon(info.lat, "N", "S"), "end") + t(m.x + m.w - pad, l2, latLon(info.lon, "E", "W"), "end");
}
/** The info bar: the point under the pointer (or MAP POINTER), its distance and magnetic bearing from the aircraft, lat/lon. */
export function panInfo(p, v, here, points, magVar) {
    const at = panPoint(p, v);
    const under = points.find((q) => {
        const [x, y] = project(p.center, q, v);
        return Math.hypot(x - p.x, y - p.y) <= NEAR;
    });
    const { brg, dist } = bearingDistance(here.lat, here.lon, at.lat, at.lon);
    const dis = dist < 0.1 ? `${Math.round(dist * 6076.12)}FT` : dist < 100 ? `${dist.toFixed(1)}NM` : `${Math.round(dist)}NM`;
    return { label: under?.id ?? "MAP POINTER", dis, brg: deg3(brg - magVar), lat: at.lat, lon: at.lon };
}
