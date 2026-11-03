// The navigation map shared by the MFD map page and the PFD inset: FG1000's map layers (Nasal/canvas/map/*.symbol.nas,
// NavigationMapStyles.nas, ConfigStore.nas; Copyright 2018 Stuart Buchanan, GPL-2.0-or-later) drawn from the points given.
import { clipRect } from "./page.js";
// Constants.nas RANGES, nm; the RANGE knob steps through them.
export const RANGES = [500, 750, 1000, 1500, 2000].map((ft) => ft / 6076.12)
    .concat([0.5, 0.75, 1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 200, 500, 1000, 1500, 2000]);
/** The next range out (dir 1) or in (dir -1) from `r`. */
export function stepRange(r, dir) {
    return dir > 0 ? RANGES.find((x) => x > r + 1e-6) ?? RANGES[RANGES.length - 1] : [...RANGES].reverse().find((x) => x < r - 1e-6) ?? RANGES[0];
}
export const rangeLabel = (r) => (r < 0.5 ? `${Math.round(r * 6076.12)}ft` : `${r}nm`);
// NavMap.DCLTR: the declutter softkey's labels, level 0 to 3.
export const DCLTR = ["DCLTR", "DCLTR-1", "DCLTR-2", "DCLTR-3"];
const rgb = (r, g, b) => `rgb(${r * 255},${g * 255},${b * 255})`;
// ConfigStore.nas layerRanges: each layer shows at map ranges up to `range` nm and declutter levels up to `declutter`.
// Flight plan points always show.
const LAYER_RANGE = { APT: 150, VOR: 150, NDB: 15, FIX: 15, WPT: 2000 };
const DECLUTTER = { APT: 2, VOR: 1, NDB: 1, FIX: 1, WPT: 3 };
// Not in FG1000, which draws no airspace: the sectional chart's convention, B solid blue, C solid magenta, D dashed blue.
// Airspace follows the airport layer's range and declutter level.
const AIRSPACE = {
    B: `stroke="${rgb(0.3, 0.5, 1)}"`, C: `stroke="${rgb(0.8, 0.3, 0.8)}"`, D: `stroke="${rgb(0.3, 0.5, 1)}" stroke-dasharray="6 4"`,
};
const NS = "http://www.w3.org/2000/svg";
const NM_PER_DEG = 60;
/** A group in screen coordinates, clipped to the map window, inserted before `before` (in whatever group holds it). */
export function mapGroup(screen, before, m) {
    const parent = before.parentNode;
    const t = parent.getCTM().inverse().multiply(screen.getCTM());
    const outer = document.createElementNS(NS, "g");
    outer.setAttribute("transform", `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})`);
    parent.insertBefore(outer, before);
    outer.setAttribute("clip-path", `url(#${clipRect(outer, m.x, m.y, m.w, m.h)})`);
    return outer.appendChild(document.createElementNS(NS, "g"));
}
/** Draws the map into `g`, which must be in screen coordinates (see `mapGroup`). */
export function drawMap(g, s, m, declutter = 0) {
    const up = s.orientation === "HDG UP" ? s.heading : 0;
    const scale = m.px / s.range;
    const shown = (layer) => s.range <= LAYER_RANGE[layer] && declutter <= DECLUTTER[layer];
    const cos = Math.cos((s.lat * Math.PI) / 180);
    const rad = (up * Math.PI) / 180;
    const c = s.center ?? s;
    const xy = (p) => {
        const e = (p.lon - c.lon) * NM_PER_DEG * cos * scale;
        const n = (p.lat - c.lat) * NM_PER_DEG * scale;
        return [m.cx + e * Math.cos(rad) - n * Math.sin(rad), m.cy - (e * Math.sin(rad) + n * Math.cos(rad))];
    };
    const byId = new Map(s.points.map((p) => [p.id, p]));
    const route = s.route.map((r) => (typeof r === "string" ? byId.get(r) : r)).filter((p) => !!p);
    let out = "";
    if (shown("APT")) {
        for (const a of s.airspaces) {
            const d = a.rings.map((r) => "M" + r.map(([lat, lon]) => xy({ lat, lon }).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z").join("");
            out += `<path d="${d}" fill="none" stroke-width="1.5" ${AIRSPACE[a.cls]}/>`;
        }
    }
    // RTE: the active leg magenta, the rest white.
    for (let i = 1; i < route.length; i++) {
        const [x1, y1] = xy(i === s.activeLeg && s.directFrom ? s.directFrom : route[i - 1]);
        const [x2, y2] = xy(route[i]);
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i === s.activeLeg ? "#ff00ff" : "#ffffff"}" stroke-width="2"/>`;
    }
    if (s.activeLeg === 0 && s.directFrom && route[0]) {
        const [[x1, y1], [x2, y2]] = [xy(s.directFrom), xy(route[0])];
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff00ff" stroke-width="2"/>`;
    }
    for (const p of [...s.points, ...route.filter((r) => !byId.has(r.id))]) {
        const [x, y] = xy(p);
        if (!shown(p.type) && !route.includes(p))
            continue;
        if (x < m.x - 150 || x > m.x + m.w + 150 || y < m.y - 150 || y > m.y + m.h + 150)
            continue;
        const active = route[s.activeLeg]?.id === p.id;
        out += `<g transform="translate(${x} ${y})">${SYMBOLS[p.type](p.id, active)}</g>`;
    }
    // APS_FG1000: the ownship icon at 30%, pointing along the heading relative to the map.
    const [ax, ay] = xy(s);
    out += `<g transform="translate(${ax} ${ay}) rotate(${s.heading - up}) scale(0.3) translate(-43.92 -76)">${APS}</g>`;
    g.innerHTML = out;
    // Labels on a white box (text_mode FILLEDBOUNDINGBOX, text_padding 2).
    for (const t of g.querySelectorAll("text[data-box]")) {
        const b = t.getBBox();
        const r = document.createElementNS(NS, "rect");
        for (const [k, v] of Object.entries({ x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4, fill: "#ffffff" }))
            r.setAttribute(k, String(v));
        t.before(r);
    }
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
// A label centered above the symbol, black on a white box (FG1000 VOR/NDB/FIX styles: text_offset [0, -12], center-bottom).
const boxLabel = (id, size) => `<text data-box="" y="-12" text-anchor="middle" font-family="'Liberation Sans',Arial,sans-serif" font-size="${size}" fill="#000">${esc(id)}</text>`;
// One drawing per map layer, centered on the point, in screen pixels (each symbol's scale_factor applied).
const SYMBOLS = {
    // APT.symbol: 17 px circle, label at (17, 35), all at 40%.
    APT: (id) => `<g transform="scale(0.4)"><circle r="17" fill="none" stroke="${rgb(0, 0.6, 0.85)}" stroke-width="3"/>` +
        `<text x="17" y="35" font-family="'Liberation Sans',Arial,sans-serif" font-size="28" fill="${rgb(0, 0.6, 0.85)}">${esc(id)}</text></g>`,
    // VOR-FG1000.symbol: compass rose of radius 128 with 10° and 5° ticks, and a hexagon.
    VOR: (id) => {
        let ticks = "M 0 0 L 0 -128";
        for (let i = 0; i < 72; i++) {
            const a = (i * 5 * Math.PI) / 180;
            const r0 = i % 2 ? 0.95 * 128 : 0.9 * 128;
            ticks += ` M ${r0 * Math.sin(a)} ${-r0 * Math.cos(a)} L ${128 * Math.sin(a)} ${-128 * Math.cos(a)}`;
        }
        return `<circle r="128" fill="none" stroke="${rgb(0.2, 0.8, 0.8)}" stroke-width="1"/><path d="${ticks}" stroke="${rgb(0.2, 0.8, 0.8)}" stroke-width="1"/>` +
            `<path d="M -15 0 L -7.5 12.5 L 7.5 12.5 L 15 0 L 7.5 -12.5 L -7.5 -12.5 Z" fill="none" stroke="${rgb(0, 0, 0.5)}" stroke-width="1"/>` +
            boxLabel(id, 14);
    },
    // NDB.symbol at 50%: a dot inside two dashed rings.
    NDB: (id) => `<g transform="scale(0.5)" stroke="${rgb(0.85, 0.2, 0.85)}" fill="none" stroke-width="2"><circle r="2.5" fill="${rgb(0.85, 0.2, 0.85)}"/>` +
        `<circle r="7.5" stroke-dasharray="1 1"/><circle r="13.5" stroke-dasharray="1 1"/></g>` + boxLabel(id, 14),
    // FIX.symbol at 50%: white triangle, black outline.
    FIX: (id) => `<path transform="scale(0.5)" d="M 0 -14 L 12.12 7 L -12.12 7 Z" fill="#fff" stroke="#000" stroke-width="3"/>` + boxLabel(id, 14),
    // WPT.symbol at 50%: four-point star, magenta when active.
    WPT: (id, active) => {
        const c = active ? "#ff00ff" : "#ffffff";
        return `<path transform="scale(0.5)" d="M 0 -25 L -5 -5 L -25 0 L -5 5 L 0 25 L 5 5 L 25 0 L 5 -5 Z" fill="none" stroke="${c}" stroke-width="3"/>` +
            `<text x="25" y="35" font-family="'Liberation Sans',Arial,sans-serif" font-size="14" fill="${c}">${esc(id)}</text>`;
    },
};
// FG1000/Icons/APSmodel.svg, the "airplane" group, translated so the wing's center is at the origin.
const APS = `<g fill="#fff" stroke="#000" stroke-width="3.9685">` +
    `<path d="m 49.91928,116.3638 9.13879,0 -0.27758,10.02755 -14.86121,0 -15.05315,0 0.1063,-10.02755 8.94685,0 0,-61.61222 6,0 6,0 z m -12,-47.864661 12,0 m 0,15 -12,0"/>` +
    `<path d="m 1.990145,83.499139 -0.14173,-15 c 27.960049,0 59.018293,0 84.124015,0 l -0.1063,15 c -27.878168,0 -58.844686,0 -83.875985,0 z"/></g>`;
