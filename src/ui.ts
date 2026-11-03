// Softkeys, the FMS cursor and scrolling lists, shared by the PFD and MFD pages. Ports of FlightGear's
// Nasal/canvas/PFD GroupElement, HighlightElement and DefaultStyle (Copyright 2018 Stuart Buchanan), GPL-2.0-or-later.
import { Page, clamp, mod } from "./page.js";

export type Key = { label: string; act?: () => void; lit?: boolean };
export const key = (label: string, act?: () => void, lit = false): Key => ({ label, act, lit });
export const BLANK = key("");

/** DefaultStyle.HIGHLIGHT_COLOR: the cursor box. */
export const CYAN = "#80ffff";
export const NS = "http://www.w3.org/2000/svg";
export const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The FMS cursor: black text on a cyan box, as FG1000's highlightTextElement. */
export class Highlighter {
  private boxes = new Map<Element, SVGRectElement>();
  constructor(private color = CYAN) {}

  set(t: SVGGraphicsElement | null, on: boolean) {
    if (!t) return;
    let box = this.boxes.get(t);
    if (!box) {
      if (!on) return;
      box = document.createElementNS(NS, "rect");
      box.setAttribute("fill", this.color);
      t.before(box);
      this.boxes.set(t, box);
    }
    const target = (t.querySelector("tspan") ?? t) as SVGElement;
    target.style.fill = on ? "#000000" : "";
    box.style.display = on && t.style.display !== "none" ? "inline" : "none";
    if (!on) return;
    const b = t.getBBox();
    for (const [k, v] of Object.entries({ x: b.x - 2, y: b.y - 1, width: b.width + 4, height: b.height + 2 })) box.setAttribute(k, String(v));
    if (t.getAttribute("transform")) box.setAttribute("transform", t.getAttribute("transform")!);
  }
}

/**
 * GroupElement: `size` rows of the columns `cols` (elements <prefix><col><row>), scrolled to keep the selected row near
 * the middle. `hi` is the column the cursor highlights; with `arrow`, the `Arrow` column marks the selected row.
 */
export class ListView {
  sel = 0;
  private thumbTravel = 0;

  constructor(
    private p: Page,
    private cols: string[],
    private size: number,
    private hi: string,
    private arrow = false,
    private scroll?: { trough: string; thumb: string },
  ) {
    if (scroll) {
      const trough = p.el(scroll.trough)?.getBBox();
      const thumb = p.el(scroll.thumb)?.getBBox();
      if (trough && thumb) this.thumbTravel = Math.max(0, trough.height - thumb.height);
    }
  }

  /** Moves the selection; returns whether it moved. */
  move(d: number, len: number) {
    const before = this.sel;
    this.sel = clamp(this.sel + (d > 0 ? 1 : -1), 0, Math.max(0, len - 1));
    return this.sel !== before;
  }

  draw(rows: Record<string, string>[], crsr: boolean, hl: Highlighter) {
    this.sel = clamp(this.sel, 0, Math.max(0, rows.length - 1));
    const top = firstRow(this.sel, rows.length, this.size);
    for (let i = 0; i < this.size; i++) {
      const row = rows[top + i];
      for (const c of this.cols) {
        const name = `${c}${i}`;
        if (c === "Arrow") {
          this.p.show(name, !!row && top + i === this.sel);
          continue;
        }
        this.p.show(name, !!row);
        this.p.text(name, row?.[c] ?? "");
      }
      hl.set(this.p.el(`${this.hi}${i}`), crsr && !!row && top + i === this.sel);
    }
    if (this.scroll) {
      const many = rows.length > this.size;
      this.p.show(this.scroll.trough, many);
      this.p.show(this.scroll.thumb, many);
      if (many) this.p.tf(this.scroll.thumb, { ty: (this.thumbTravel * this.sel) / (rows.length - 1) });
    }
  }
}

/** GroupElement.displayGroup: the first row shown, keeping the selected row near the middle. */
export function firstRow(sel: number, len: number, size: number) {
  const mid = Math.ceil(size / 2);
  if (len <= size || sel < mid) return 0;
  return sel > len - mid - 1 ? len - size : sel - mid;
}

/** An element's bounding box in screen coordinates. */
export function screenBox(screen: SVGGElement, e: SVGGraphicsElement): DOMRect {
  const b = e.getBBox();
  const m = screen.getCTM()!.inverse().multiply(e.getCTM()!);
  const a = new DOMPoint(b.x, b.y).matrixTransform(m);
  const c = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
  return new DOMRect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
}

// DataEntryElement.CHARSET
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * DataEntryElement: an identifier typed with the FMS knobs. The inner knob starts the entry and turns the character at
 * the cursor; the outer moves the cursor; ENT ends it. Elements: <prefix>ID (the value) and ID0..ID<size-1> (the
 * characters while editing).
 */
export class IdEntry {
  private chars: string[] | null = null;
  private pos = 0;
  constructor(private p: Page, private size: number, private name = "ID") {}

  get editing() {
    return this.chars !== null;
  }

  inner(d: number) {
    if (!this.chars) {
      this.chars = Array(this.size).fill("_");
      this.pos = 0;
    }
    const c = this.chars[this.pos];
    const i = c === "_" ? (d > 0 ? 0 : CHARSET.length - 1) : mod(CHARSET.indexOf(c) + (d > 0 ? 1 : -1), CHARSET.length);
    this.chars[this.pos] = CHARSET[i];
  }

  /** Returns whether the entry took the turn. */
  outer(d: number) {
    if (!this.chars) return false;
    this.pos = clamp(this.pos + (d > 0 ? 1 : -1), 0, this.size - 1);
    return true;
  }

  /** Ends the entry; returns what was typed, or null for nothing. */
  ent(): string | null {
    const v = this.chars?.filter((c) => c !== "_").join("") ?? "";
    this.chars = null;
    return v || null;
  }

  cancel() {
    this.chars = null;
  }

  /** What is typed so far, blanks as "_". */
  get value() {
    return this.chars?.join("") ?? "";
  }

  draw(value: string, crsr: boolean, hl: Highlighter) {
    const ed = this.chars;
    // Without an element per character, the whole entry shows in the value element.
    if (!this.p.el(`${this.name}${this.size - 1}`)) {
      this.p.text(this.name, ed ? this.value : value);
      hl.set(this.p.el(this.name), crsr || !!ed);
      for (let i = 0; i < this.size; i++) this.p.show(`${this.name}${i}`, false);
      return;
    }
    this.p.show(this.name, !ed);
    this.p.text(this.name, value);
    hl.set(this.p.el(this.name), crsr && !ed);
    for (let i = 0; i < this.size; i++) {
      this.p.show(`${this.name}${i}`, !!ed);
      this.p.text(`${this.name}${i}`, ed?.[i] ?? "");
      hl.set(this.p.el(`${this.name}${i}`), !!ed && i === this.pos);
    }
  }
}
