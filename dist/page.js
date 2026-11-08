const NS = "http://www.w3.org/2000/svg";
let clipCount = 0;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const mod = (a, b) => a - b * Math.floor(a / b); // Nasal math.mod: result has the sign of b
export const pad = (s, n, c = " ") => String(s).padStart(n, c);
export const deg3 = (d) => pad(Math.round(mod(d, 360)) % 360, 3, "0") + "°";
export const matrixAttr = (m) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
/** An element's own transform attribute as one matrix, read without layout. */
export function ownMatrix(e) {
    const list = e.transform.baseVal;
    let m = new DOMMatrix();
    for (let i = 0; i < list.numberOfItems; i++)
        m = m.multiply(list.getItem(i).matrix);
    return m;
}
export class Page {
    screen;
    prefix;
    cache = new Map();
    base = new WeakMap();
    centers = new WeakMap();
    /** `screen` is the group holding the 1024 x 768 display; ids are looked up inside it. */
    constructor(screen, prefix) {
        this.screen = screen;
        this.prefix = prefix;
    }
    el(name) {
        if (!this.cache.has(name))
            this.cache.set(name, this.screen.querySelector(`[id="${this.prefix}${name}"]`));
        return this.cache.get(name);
    }
    show(name, on) {
        const e = this.el(name);
        if (e)
            e.style.display = on ? "inline" : "none";
    }
    text(name, value, color) {
        const e = this.el(name);
        if (!e)
            return;
        const target = e.querySelector("tspan") ?? e;
        if (target.textContent !== value)
            target.textContent = value;
        if (color)
            target.style.fill = color;
    }
    fill(name, color) {
        const e = this.el(name);
        if (e)
            e.style.fill = color;
    }
    tf(name, t) {
        const e = this.el(name);
        if (!e)
            return;
        if (!this.base.has(e))
            this.base.set(e, e.getAttribute("transform") ?? "");
        // Translation is in the parent's coordinates, outside the element's own transform (GS-ILS is a rotated square).
        let out = (t.tx || t.ty ? `translate(${t.tx ?? 0} ${t.ty ?? 0}) ` : "") + this.base.get(e);
        if ((t.sy !== undefined && t.sy !== 1) || (t.sx !== undefined && t.sx !== 1))
            out += ` scale(${t.sx ?? 1} ${t.sy ?? 1})`;
        if (t.rot) {
            const [cx, cy] = t.center ?? this.center(e);
            out += ` rotate(${t.rot} ${cx} ${cy})`;
        }
        e.setAttribute("transform", out.trim());
    }
    // FlightGear's default rotation center: bounding box center plus Inkscape's offset (Inkscape's y points up).
    center(e) {
        let c = this.centers.get(e);
        if (!c) {
            const b = e.getBBox();
            c = [b.x + b.width / 2 + Number(e.dataset.tcx ?? 0), b.y + b.height / 2 - Number(e.dataset.tcy ?? 0)];
            this.centers.set(e, c);
        }
        return c;
    }
    // Clip an element to a screen rectangle that stays put while the element moves, as FlightGear's clip does.
    clip(name, [top, right, bottom, left]) {
        const e = this.el(name);
        if (!e?.parentNode)
            return;
        const wrap = document.createElementNS(NS, "g");
        e.parentNode.insertBefore(wrap, e);
        wrap.appendChild(e);
        // Map the screen rectangle into the wrapper's coordinates: wrapper CTM⁻¹ × screen CTM.
        const toUser = wrap.getCTM().inverse().multiply(this.screen.getCTM());
        wrap.setAttribute("clip-path", `url(#${clipRect(wrap, left, top, right - left, bottom - top, toUser)})`);
    }
}
/** Adds a clipPath with one rectangle to `parent` and returns its id. */
export function clipRect(parent, x, y, w, h, m) {
    const id = `glass-clip-${++clipCount}`;
    const cp = document.createElementNS(NS, "clipPath");
    cp.id = id;
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const r = cp.appendChild(document.createElementNS(NS, "rect"));
    for (const [k, v] of Object.entries({ x, y, width: w, height: h }))
        r.setAttribute(k, String(v));
    if (m)
        r.setAttribute("transform", matrixAttr(m));
    parent.appendChild(cp);
    return id;
}
