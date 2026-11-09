// Softkeys, the FMS cursor and scrolling lists, shared by the PFD and MFD pages. Ports of FlightGear's
// Nasal/canvas/PFD GroupElement, HighlightElement and DefaultStyle (Copyright 2018 Stuart Buchanan), GPL-2.0-or-later.
import { clamp, mod } from "./page.js";
export const key = (label, act, lit = false) => ({ label, act, lit });
export const dimKey = (label) => ({ label, dim: true });
export const BLANK = key("");
/** The cursor box and selectable text. v13 trainer: full cyan (FG1000 DefaultStyle.HIGHLIGHT_COLOR is a paler #80ffff). */
export const CYAN = "#00ffff";
export const NS = "http://www.w3.org/2000/svg";
export const esc = (t) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/** The FMS cursor: black text on a cyan box, as FG1000's highlightTextElement. */
export class Highlighter {
    color;
    boxes = new Map();
    constructor(color = CYAN) {
        this.color = color;
    }
    /** `span`, the box's x and width when it runs across a list row (v13 trainer's menus) rather than hugging the text. */
    set(t, on, span) {
        if (!t)
            return;
        let box = this.boxes.get(t);
        if (!box) {
            if (!on)
                return;
            box = document.createElementNS(NS, "rect");
            box.setAttribute("fill", this.color);
            t.before(box);
            this.boxes.set(t, box);
        }
        const target = (t.querySelector("tspan") ?? t);
        // Off, it clears only its own black: a page that redrew the row in its color keeps that color.
        if (on)
            target.style.fill = "#000000";
        else if (/^(#000000|rgb\(0, 0, 0\))$/.test(target.style.fill))
            target.style.fill = "";
        box.style.display = on && t.style.display !== "none" ? "inline" : "none";
        if (!on)
            return;
        const b = t.getBBox();
        const x = span ? { x: span.x, width: span.w } : { x: b.x - 2, width: b.width + 4 };
        for (const [k, v] of Object.entries({ ...x, y: b.y - 1, height: b.height + 2 }))
            box.setAttribute(k, String(v));
        if (t.getAttribute("transform"))
            box.setAttribute("transform", t.getAttribute("transform"));
    }
}
/**
 * GroupElement: `size` rows of the columns `cols` (elements <prefix><col><row>), scrolled to keep the selected row near
 * the middle. `hi` is the column the cursor highlights; with `arrow`, the `Arrow` column marks the selected row.
 */
export class ListView {
    p;
    cols;
    size;
    hi;
    arrow;
    scroll;
    sel = 0;
    thumbTravel = 0;
    constructor(p, cols, size, hi, arrow = false, scroll) {
        this.p = p;
        this.cols = cols;
        this.size = size;
        this.hi = hi;
        this.arrow = arrow;
        this.scroll = scroll;
        if (scroll) {
            const trough = p.el(scroll.trough)?.getBBox();
            const thumb = p.el(scroll.thumb)?.getBBox();
            if (trough && thumb)
                this.thumbTravel = Math.max(0, trough.height - thumb.height);
        }
    }
    /** Moves the selection; returns whether it moved. */
    move(d, len) {
        const before = this.sel;
        this.sel = clamp(this.sel + (d > 0 ? 1 : -1), 0, Math.max(0, len - 1));
        return this.sel !== before;
    }
    draw(rows, crsr, hl) {
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
            if (many)
                this.p.tf(this.scroll.thumb, { ty: (this.thumbTravel * this.sel) / (rows.length - 1) });
        }
    }
}
/** GroupElement.displayGroup: the first row shown, keeping the selected row near the middle. */
export function firstRow(sel, len, size) {
    const mid = Math.ceil(size / 2);
    if (len <= size || sel < mid)
        return 0;
    return sel > len - mid - 1 ? len - size : sel - mid;
}
/** An element's bounding box in screen coordinates. */
export function screenBox(screen, e) {
    const b = e.getBBox();
    const m = screen.getCTM().inverse().multiply(e.getCTM());
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
    p;
    size;
    name;
    /** A key typed on the computer keyboard (a letter, a digit, or "" for Backspace), taken by the next inner turn in
     * place of turning: it goes in at the cursor, which moves on. Not on the real unit; NXi takes its keypad this way. */
    static typed = null;
    chars = null;
    pos = 0;
    constructor(p, size, name = "ID") {
        this.p = p;
        this.size = size;
        this.name = name;
    }
    get editing() {
        return this.chars !== null;
    }
    inner(d) {
        if (!this.chars) {
            this.chars = Array(this.size).fill("_");
            this.pos = 0;
        }
        const t = IdEntry.typed;
        if (t !== null) {
            IdEntry.typed = null;
            if (t !== "")
                [this.chars[this.pos], this.pos] = [t, Math.min(this.pos + 1, this.size - 1)];
            else {
                if (this.pos > 0 && this.chars[this.pos] === "_")
                    this.pos--;
                this.chars[this.pos] = "_";
            }
            return;
        }
        const c = this.chars[this.pos];
        const i = c === "_" ? (d > 0 ? 0 : CHARSET.length - 1) : mod(CHARSET.indexOf(c) + (d > 0 ? 1 : -1), CHARSET.length);
        this.chars[this.pos] = CHARSET[i];
    }
    /** Returns whether the entry took the turn. */
    outer(d) {
        if (!this.chars)
            return false;
        this.pos = clamp(this.pos + (d > 0 ? 1 : -1), 0, this.size - 1);
        return true;
    }
    /** Ends the entry; returns what was typed, or null for nothing. */
    ent() {
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
    draw(value, crsr, hl) {
        const ed = this.chars;
        // Without an element per character, the whole entry shows in the value element.
        if (!this.p.el(`${this.name}${this.size - 1}`)) {
            this.p.text(this.name, ed ? this.value : value);
            hl.set(this.p.el(this.name), crsr || !!ed);
            for (let i = 0; i < this.size; i++)
                this.p.show(`${this.name}${i}`, false);
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
