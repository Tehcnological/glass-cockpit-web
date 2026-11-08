// The navigation map shared by the MFD map page and the PFD inset: FG1000's map layers (Nasal/canvas/map/*.symbol.nas,
// NavigationMapStyles.nas, ConfigStore.nas; Copyright 2018 Stuart Buchanan, GPL-2.0-or-later) drawn from the points given.
import { clipRect } from "./page.js";
/** Map orientations, as MAP SETUP offers them (Pilot's Guide); FG1000 has north up and heading up. */
export const ORIENTATIONS = ["NORTH UP", "TRK UP", "DTK UP", "HDG UP"];
/** MAP SETUP's track vector look-ahead times, seconds; 0 is off (Pilot's Guide: 30 s to 20 min, 60 s the default). */
export const TRACK_VECTOR = [0, 30, 60, 120, 300, 600, 1200];
// Pilot's Guide, Table 5-4: the map range at or under which each airway type shows by default; MAP SETUP changes it.
export const AIRWAY_RANGE = { LO: 200, HI: 300 };
/** The airways the AIRWAYS key shows at `range`: 0 none, 1 all, 2 low, 3 high. High ones last, drawn over the low. */
export function shownAirways(all, mode, range, limits = AIRWAY_RANGE) {
    const want = (a) => (mode === 1 || (mode === 2 && a.type === "LO") || (mode === 3 && a.type === "HI")) && range <= limits[a.type];
    return [...all.filter((a) => a.type === "LO"), ...all.filter((a) => a.type === "HI")].filter(want);
}
/** Profile View's scales: half the map range (none under 1 nm), five distance marks, and four altitude steps with the
 * aircraft at the start of the second. shortcut: our own altitude steps; the Pilot's Guide gives none. */
export function profileView(alt, range) {
    const nm = range / 2;
    if (nm < 1)
        return null;
    const step = nm <= 5 ? 500 : nm <= 25 ? 1000 : 2000;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ nm: nm * f, label: Number.isInteger(nm * f) ? String(nm * f) : (nm * f).toFixed(1) }));
    return { nm, ticks, step, bottom: Math.max(0, Math.floor(alt / step) * step - step) };
}
/** The points drawn as symbols: a layer's by its range and declutter level, airway fixes past their range (still
 * decluttered), and the route's and a previewed procedure's always. A previewed fix already on the map draws once. */
export function symbolPoints(s, declutter = 0) {
    const byId = new Map(s.points.map((p) => [p.id, p]));
    const route = s.route.map((r) => (typeof r === "string" ? byId.get(r) : r)).filter((p) => !!p);
    const preview = s.preview ?? [];
    const pinned = new Set([...route, ...preview].map((p) => p.id));
    const onAirway = new Set((s.airways ?? []).flatMap((a) => a.points));
    const extra = route.filter((r) => !byId.has(r.id));
    const drawn = new Set([...byId.keys(), ...extra.map((p) => p.id)]);
    return [...s.points, ...extra, ...preview.filter((p) => !drawn.has(p.id))].filter((p) => pinned.has(p.id) || (declutter <= DECLUTTER[p.type] && (s.range <= LAYER_RANGE[p.type] || onAirway.has(p.id))));
}
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
/** The map's rotation, degrees: pan mode's held rotation, else the orientation's. DTK UP with no desired track turns to the track. */
export function mapUp(s) {
    if (s.up !== undefined)
        return s.up;
    // Heading, track and desired track are magnetic; the map is drawn to true north.
    const v = s.magVar ?? 0;
    if (s.orientation === "HDG UP")
        return s.heading + v;
    if (s.orientation === "TRK UP")
        return (s.track ?? s.heading) + v;
    if (s.orientation === "DTK UP")
        return (s.dtk ?? s.track ?? s.heading) + v;
    return 0;
}
/** Where the track vector ends: the aircraft's position after `secs` along its track at its groundspeed. */
export function trackVectorEnd(s, secs) {
    const nm = (s.groundspeed * secs) / 3600;
    const r = ((s.track + (s.magVar ?? 0)) * Math.PI) / 180; // the track is magnetic
    return { lat: s.lat + (nm * Math.cos(r)) / NM_PER_DEG, lon: s.lon + (nm * Math.sin(r)) / (NM_PER_DEG * Math.cos((s.lat * Math.PI) / 180)) };
}
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
    const up = mapUp(s);
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
    // Airways: low grey (the roads' shade), high green (Pilot's Guide); their fixes show at any range.
    for (const a of s.airways ?? []) {
        for (let i = 1; i < a.points.length; i++) {
            const [p, q] = [byId.get(a.points[i - 1]), byId.get(a.points[i])];
            if (!p || !q)
                continue;
            const [[x1, y1], [x2, y2]] = [xy(p), xy(q)];
            out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a.type === "LO" ? "#808080" : "#00c000"}" stroke-width="2"/>`;
        }
    }
    const preview = s.preview ?? [];
    for (let i = 1; i < preview.length; i++) {
        const [[x1, y1], [x2, y2]] = [xy(preview[i - 1]), xy(preview[i])];
        const dash = preview[i].role === "MISSED" ? ` stroke-dasharray="8 6"` : "";
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${dash ? 2 : 3}"${dash}/>`;
    }
    if (s.activeLeg === 0 && s.directFrom && route[0]) {
        const [[x1, y1], [x2, y2]] = [xy(s.directFrom), xy(route[0])];
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff00ff" stroke-width="2"/>`;
    }
    if (s.nearestLine) {
        const [[x1, y1], [x2, y2]] = [xy(s), xy(s.nearestLine)];
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 6"/>`;
    }
    for (const p of symbolPoints(s, declutter)) {
        const [x, y] = xy(p);
        if (x < m.x - 150 || x > m.x + m.w + 150 || y < m.y - 150 || y > m.y + m.h + 150)
            continue;
        const active = route[s.activeLeg]?.id === p.id;
        out += `<g transform="translate(${x} ${y})">${SYMBOLS[p.type](p.id, active)}</g>`;
    }
    // Track vector: a light blue line to where the aircraft will be (Pilot's Guide). shortcut: always straight; the real
    // one bends through up to 90 degrees of a turn at 30 and 60 s. Bend it when the MFD gets a turn rate.
    if (s.trackVector && s.groundspeed && s.track !== undefined) {
        const [[x1, y1], [x2, y2]] = [xy(s), xy(trackVectorEnd({ lat: s.lat, lon: s.lon, track: s.track, groundspeed: s.groundspeed, magVar: s.magVar }, s.trackVector))];
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#00ffff" stroke-width="2"/>`;
    }
    const [ax, ay] = xy(s);
    // Profile View's path: a white box along the track as far and wide as the profile looks, with its distance marks.
    if (s.profilePath) {
        // Along the track when moving; standing still, the track means nothing, so the heading.
        const a = (((s.groundspeed && s.track !== undefined ? s.track : s.heading) + (s.magVar ?? 0) - up) * Math.PI) / 180;
        const [f, r] = [[Math.sin(a), -Math.cos(a)], [Math.cos(a), Math.sin(a)]];
        const [len, half] = [s.profilePath.nm * scale, (s.profilePath.width / 2) * scale];
        const at = (d, side) => `${ax + f[0] * d + r[0] * side},${ay + f[1] * d + r[1] * side}`;
        out += `<polygon points="${at(0, -half)} ${at(len, -half)} ${at(len, half)} ${at(0, half)}" fill="none" stroke="#ffffff" stroke-width="1.5"/>`;
        for (const t of s.profilePath.ticks) {
            for (const side of [-half, half])
                out += `<polyline points="${at(t * scale, side)} ${at(t * scale, side + Math.sign(side) * 8)}" stroke="#ffffff" stroke-width="1.5"/>`;
        }
    }
    // APS_FG1000: the ownship icon at 30%, pointing along the heading relative to the map.
    out += `<g transform="translate(${ax} ${ay}) rotate(${s.heading + (s.magVar ?? 0) - up}) scale(0.3) translate(-43.92 -76)">${APS}</g>`;
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
