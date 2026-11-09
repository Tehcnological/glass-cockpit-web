// Map pan mode, from the Pilot's Guide and the v13 trainer (FG1000 has none): the joystick push puts a pointer on the aircraft and an info bar
// over the map; the joystick moves the pointer, and at the map's edge the map scrolls instead. Pushing again ends it, as
// does a minute with no joystick input. ENT on a waypoint opens its WPT page.
// DOM-free so the tests can run it.
import { bearingDistance, latLon } from "./nav.js";
import { deg3 } from "./page.js";
import { esc } from "./ui.js";
const NM_PER_DEG = 60;
/** Pixels the pointer moves for one joystick click. */
export const PAN_STEP = 12;
/** Pilot's Guide: with no joystick input for about a minute, pan mode ends and the map recenters on the aircraft. */
export const PAN_IDLE_MS = 60_000;
/** ENT with the pointer on a waypoint: the WPT page for its type. WPT is a user waypoint in `points`; the plan's own
 * points (approach fixes, ATK offsets) are not on that page, so ENT passes to the page. */
export const PAN_WPT_PAGES = { APT: "AirportInfo", VOR: "VORInfo", NDB: "NDBInfo", FIX: "IntersectionInfo", WPT: "UserWPTInfo" };
/** Pan mode's idle timer: one timeout, started with pan mode, restarted by each joystick move, stopped when pan ends. */
export class PanIdle {
    end;
    t;
    constructor(end) {
        this.end = end;
    }
    /** Call on every redraw: starts the timer when pan mode has started, stops it when pan mode has ended. */
    sync(panning) {
        if (!panning)
            this.stop();
        else if (this.t === undefined)
            this.moved();
    }
    moved() {
        clearTimeout(this.t);
        this.t = setTimeout(() => {
            this.t = undefined;
            this.end();
        }, PAN_IDLE_MS);
    }
    stop() {
        clearTimeout(this.t);
        this.t = undefined;
    }
}
/** How close to the map's edge the pointer may go. */
const MARGIN = 10;
/** A point within this many pixels of the pointer is the one it names. */
const NEAR = 6;
export const panStart = (here, up = 0) => ({ center: here, x: 0, y: 0, up });
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
    const [mx, my, top] = [v.w / 2 - MARGIN, v.h / 2 - MARGIN, -v.h / 2 + (v.bar ?? 0) + MARGIN];
    const [x, y] = [p.x + dx * PAN_STEP, p.y + dy * PAN_STEP];
    const [cx, cy] = [Math.max(-mx, Math.min(mx, x)), Math.max(top, Math.min(my, y))];
    const center = x === cx && y === cy ? p.center : unproject(p.center, x - cx, y - cy, v);
    return { ...p, center, x: cx, y: cy };
}
export const panPoint = (p, v) => unproject(p.center, p.x, p.y, v);
/** Where `q` is on the map, in pixels from the map window's center. */
export const panProject = (p, q, v) => project(p.center, q, v);
/** ENT while measuring: the start point moves to the pointer (Pilot's Guide). */
export const panMeasureFrom = (p, v) => ({ ...p, from: panPoint(p, v) });
/** RANGE while panning: the map recenters on the pointer (Pilot's Guide, Weather Data Link page; NXi on every map). */
export const panTarget = (p, v) => ({ ...p, center: panPoint(p, v), x: 0, y: 0 });
/** The pointer and the info bar across the top of the map window `m`, as SVG, text `font` px high, and while measuring
 * the line from `start`. Drawn here, not the trainer's. */
export function panMarkup(p, info, m, font, start) {
    const [x, y, k] = [m.cx + p.x, m.cy + p.y, font / 18];
    const t = (tx, ty, s, anchor = "start") => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="#ffffff" font-size="${font}" font-family="'Liberation Sans',Arial,sans-serif">${s}</text>`;
    const [pad, l1, l2] = [font * 0.55, m.y + font * 1.1, m.y + font * 2.3];
    // Measuring: a dashed line from the start point (`start`, from panProject) to the pointer.
    const line = start ? `<line x1="${m.cx + start[0]}" y1="${m.cy + start[1]}" x2="${x}" y2="${y}" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 4"/>` : "";
    // The pointer flashes (Pilot's Guide): a 1 s cycle, shown 0.7 s and hidden 0.3 s. A SMIL animation, so it runs without
    // redraws; with no id, so display.ts's per-display id scoping has nothing to rename. Its begin is the document's
    // start, so redrawing the markup keeps the phase instead of restarting it.
    const flash = `<animate attributeName="visibility" values="visible;hidden" keyTimes="0;0.7" calcMode="discrete" dur="1s" repeatCount="indefinite"/>`;
    return line + `<path d="M${x} ${y}l0 ${22 * k}l${6 * k} ${-6 * k}l${6 * k} ${11 * k}l${4 * k} ${-2 * k}l${-6 * k} ${-11 * k}l${9 * k} 0z" fill="#ffffff" stroke="#000000" stroke-width="1.5">${flash}</path>` +
        `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${font * 2.7}" fill="#000000" stroke="#808080" stroke-width="2"/>` +
        t(m.x + pad, l1, esc(info.label)) + t(m.x + pad, l2, `${info.dis}  ${info.brg}`) +
        t(m.x + m.w - pad, l1, latLon(info.lat, "N", "S"), "end") + t(m.x + m.w - pad, l2, latLon(info.lon, "E", "W"), "end");
}
/** The info bar: the point under the pointer (or MAP POINTER), its distance and magnetic bearing from the aircraft, lat/lon. */
export function panInfo(p, v, here, points, magVar) {
    const at = panPoint(p, v);
    const under = panUnder(p, v, points);
    const { brg, dist } = bearingDistance(here.lat, here.lon, at.lat, at.lon);
    const dis = dist < 0.1 ? `${Math.round(dist * 6076.12)}FT` : dist < 100 ? `${dist.toFixed(1)}NM` : `${Math.round(dist)}NM`;
    return { label: under?.id ?? "MAP POINTER", dis, brg: deg3(brg - magVar), lat: at.lat, lon: at.lon };
}
/** The point under the pointer (the closest within a few pixels), or undefined. */
export function panUnder(p, v, points) {
    let [under, best] = [undefined, NEAR];
    for (const q of points) {
        const [x, y] = project(p.center, q, v);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d <= best)
            [under, best] = [q, d];
    }
    return under;
}
