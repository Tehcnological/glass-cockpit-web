// The SVG side of an FG1000 page: elements are looked up as <prefix><name>, as FlightGear's MFDPage does.
//
// FlightGear's Canvas composes an element's transforms as: its SVG transform, then translation/scale, then a
// rotation about a center (bounding box center plus Inkscape's transform-center offset, unless set explicitly).
// Each later transform applies in the parent's coordinates (OSG multiplies row vectors).
// tf() rebuilds that as one SVG transform string.
export type Tf = { tx?: number; ty?: number; sx?: number; sy?: number; rot?: number; center?: [number, number] };

const NS = "http://www.w3.org/2000/svg";
let clipCount = 0;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mod = (a: number, b: number) => a - b * Math.floor(a / b); // Nasal math.mod: result has the sign of b
export const pad = (s: string | number, n: number, c = " ") => String(s).padStart(n, c);
export const deg3 = (d: number) => pad(Math.round(mod(d, 360)) % 360, 3, "0") + "°";

export const matrixAttr = (m: DOMMatrix) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
/** An element's own transform attribute as one matrix, read without layout. */
export function ownMatrix(e: SVGGraphicsElement): DOMMatrix {
  const list = e.transform.baseVal;
  let m = new DOMMatrix();
  for (let i = 0; i < list.numberOfItems; i++) m = m.multiply(list.getItem(i).matrix);
  return m;
}

export class Page {
  private cache = new Map<string, SVGGraphicsElement | null>();
  private base = new WeakMap<Element, string>();
  private centers = new WeakMap<Element, [number, number]>();

  /** `screen` is the group holding the 1024 x 768 display; ids are looked up inside it. */
  constructor(readonly screen: SVGGElement, readonly prefix: string) {}

  el(name: string): SVGGraphicsElement | null {
    if (!this.cache.has(name)) this.cache.set(name, this.screen.querySelector<SVGGraphicsElement>(`[id="${this.prefix}${name}"]`));
    return this.cache.get(name)!;
  }

  show(name: string, on: boolean) {
    const e = this.el(name);
    if (e) e.style.display = on ? "inline" : "none";
  }

  text(name: string, value: string, color?: string) {
    const e = this.el(name);
    if (!e) return;
    const target = e.querySelector("tspan") ?? e;
    if (target.textContent !== value) target.textContent = value;
    if (color) target.style.fill = color;
  }

  fill(name: string, color: string) {
    const e = this.el(name);
    if (e) e.style.fill = color;
  }

  tf(name: string, t: Tf) {
    const e = this.el(name);
    if (!e) return;
    if (!this.base.has(e)) this.base.set(e, e.getAttribute("transform") ?? "");
    // Translation is in the parent's coordinates, outside the element's own transform (GS-ILS is a rotated square).
    let out = (t.tx || t.ty ? `translate(${t.tx ?? 0} ${t.ty ?? 0}) ` : "") + this.base.get(e)!;
    if ((t.sy !== undefined && t.sy !== 1) || (t.sx !== undefined && t.sx !== 1)) out += ` scale(${t.sx ?? 1} ${t.sy ?? 1})`;
    if (t.rot) {
      const [cx, cy] = t.center ?? this.center(e);
      out += ` rotate(${t.rot} ${cx} ${cy})`;
    }
    e.setAttribute("transform", out.trim());
  }

  // FlightGear's default rotation center: bounding box center plus Inkscape's offset (Inkscape's y points up).
  private center(e: SVGGraphicsElement): [number, number] {
    let c = this.centers.get(e);
    if (!c) {
      const b = e.getBBox();
      c = [b.x + b.width / 2 + Number(e.dataset.tcx ?? 0), b.y + b.height / 2 - Number(e.dataset.tcy ?? 0)];
      this.centers.set(e, c);
    }
    return c;
  }

  // Clip an element to a screen rectangle that stays put while the element moves, as FlightGear's clip does.
  clip(name: string, [top, right, bottom, left]: [number, number, number, number]) {
    const e = this.el(name);
    if (!e?.parentNode) return;
    const wrap = document.createElementNS(NS, "g") as SVGGElement;
    e.parentNode.insertBefore(wrap, e);
    wrap.appendChild(e);
    // Map the screen rectangle into the wrapper's coordinates: wrapper CTM⁻¹ × screen CTM.
    const toUser = wrap.getCTM()!.inverse().multiply(this.screen.getCTM()!);
    wrap.setAttribute("clip-path", `url(#${clipRect(wrap, left, top, right - left, bottom - top, toUser)})`);
  }
}

/** Adds a clipPath with one rectangle to `parent` and returns its id. */
export function clipRect(parent: Element, x: number, y: number, w: number, h: number, m?: DOMMatrix): string {
  const id = `glass-clip-${++clipCount}`;
  const cp = document.createElementNS(NS, "clipPath");
  cp.id = id;
  cp.setAttribute("clipPathUnits", "userSpaceOnUse");
  const r = cp.appendChild(document.createElementNS(NS, "rect"));
  for (const [k, v] of Object.entries({ x, y, width: w, height: h })) r.setAttribute(k, String(v));
  if (m) r.setAttribute("transform", matrixAttr(m));
  parent.appendChild(cp);
  return id;
}
