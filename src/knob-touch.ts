// Knobs by touch or pen: this package's own, not FG1000's (FlightGear has the mouse wheel only). Single knobs (HDG,
// NAV and COM volume) turn with a slide and push with a tap. A tap on a dual knob (NAV, COM, CRS/BARO, ALT, FMS) or on
// RANGE opens a small see-through popout beside it with keys big enough for a finger: outer and inner turns and PUSH,
// or for RANGE the joystick's eight directions, PAN and range - and +. A tap anywhere outside its keys, its own knob
// included, closes it and does nothing else; it also closes after IDLE_MS without input. Turn and direction keys act on
// press and repeat while held (CRS 5° a repeat, as a fast wheel spin); PUSH and PAN act on lift, over the same key.
// While a single knob is pressed it shows its slide: a long vertical line with a dot in the middle (up clockwise).
// A knob's arrows (and RANGE's printed joystick arrows, - and +) are its own here: a slide from one is the knob's and a
// tap opens a dual knob's popout, but a tap on a single knob's arrow pushes nothing (HDG SYNC would lose the bug). A
// fast slide turns HDG 5° a detent, as a fast wheel spin does. They stay drawn, as bezel art; bezelInput lights them on hover for the mouse only.
import type { Control, Input, Spot } from "./bezel.js";

/** A press that moves less than this (CSS px) is a tap; past it a single knob's press is a slide and never a push. */
export const MOVE_PX = 10;
/** CSS px of slide per detent. */
export const SLIDE_PX = 14;
/** A still press longer than this (ms) does nothing: not a push, not a popout. */
export const TAP_MS = 500;
/** After a popout opens it ignores input this long (ms), so the opening tap's late click cannot press a key under it. */
export const GUARD_MS = 300;
/** A popout closes after this long (ms) without input. */
export const IDLE_MS = 5000;
/** A popout key is at least this big on screen (CSS px). */
export const KEY_PX = 46;
const REPEAT_DELAY = 350;
const REPEAT_EVERY = 90;

type Key = { label: string; sub?: string; input: Input; also?: Input; hold: boolean; span?: number };
// Detents a held key's repeats turn: CRS as a fast spin of the wheel does (wheelStep). A tap stays one.
const FAST: Partial<Record<Control, number>> = { CRS: 5 };

// The outer and inner rings' labels, and the push's.
const DUAL: Partial<Record<Control, [string, string, string]>> = {
  NAV_INNER: ["MHz", "kHz", "1-2"], COM_INNER: ["MHz", "kHz", "1-2"], CRS: ["BARO", "CRS", "CRS CTR"],
  ALT_INNER: ["1000", "100", "PUSH"], FMS_INNER: ["outer", "inner", "CRSR"],
};
const turn = (control: Control, value: number, label: string, sub: string): Key => ({ label, sub, input: { control, value }, hold: true });
const stick = (h: number, v: number, label: string): Key => h && v
  ? { label, input: { control: "JOYSTICK_HORIZONTAL", value: h }, also: { control: "JOYSTICK_VERTICAL", value: v }, hold: true }
  : { label, input: h ? { control: "JOYSTICK_HORIZONTAL", value: h } : { control: "JOYSTICK_VERTICAL", value: v }, hold: true };

/** The keys a knob's popout shows, in rows; null for a knob without one. */
export function popKeys(s: Spot): { cols: number; keys: Key[] } | null {
  if (s.click === "JOYSTICK_PRESS") return { cols: 3, keys: [
    stick(-1, -1, "↖"), stick(0, -1, "▲"), stick(1, -1, "↗"),
    stick(-1, 0, "◀"), { label: "PAN", input: { control: "JOYSTICK_PRESS", value: 1 }, hold: false }, stick(1, 0, "▶"),
    stick(-1, 1, "↙"), stick(0, 1, "▼"), stick(1, 1, "↘"),
    { ...turn("RANGE", -1, "−", "range"), span: 1.5 }, { ...turn("RANGE", 1, "+", "range"), span: 1.5 },
  ] };
  const d = s.wheel && s.shiftWheel && DUAL[s.wheel];
  if (!d || !s.click) return null;
  return { cols: 2, keys: [
    turn(s.shiftWheel!, -1, "◀◀", d[0]), turn(s.shiftWheel!, 1, "▶▶", d[0]),
    turn(s.wheel!, -1, "◀", d[1]), turn(s.wheel!, 1, "▶", d[1]),
    { label: d[2], input: { control: s.click, value: 1 }, hold: false, span: 2 },
  ] };
}

/** A knob a slide turns and a tap pushes. */
export const slides = (s: Spot) => !!s.wheel && !s.shiftWheel && s.wheel !== "RANGE" && !!s.click && !s.arrow;

type Ev = PointerEvent;
const NS = "http://www.w3.org/2000/svg";
// A press outside an open popout closes it and does nothing else, on every display: the displays share whether the
// current press (the one event every display's capture listener sees) is being swallowed.
let dismissal: { down?: Event; on: boolean } = { on: false };

/**
 * Touch and pen on the knobs of a display drawn by `bezelInput`. `offset` is the art's offset from the spots' coordinates
 * and `width` the viewBox's. The bezel's own handlers call `down` and `up` first and skip the press when they return
 * true, and skip a whole gesture while `swallowed()` (a tap outside an open popout closes it and does nothing else).
 */
export function knobTouch(
  svg: SVGSVGElement, onInput: (i: Input) => void, offset: [number, number], width: number, spots: Spot[],
  /** Detents one detent of a slide turns, from the ms since the last: bezel.ts's wheelStep (HDG 5 when fast). */
  step: (control: Control, gap: number) => number = () => 1,
) {
  const [DX, DY] = offset;
  // The knob an arrow belongs to: the nearest knob to it.
  const knobs = spots.filter((s) => !s.arrow && (slides(s) || popKeys(s)));
  const mid = (s: Spot) => [(s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2];
  const owner = (a: Spot) => {
    const [x, y] = mid(a);
    return knobs.reduce((best, k) => (Math.hypot(mid(k)[0] - x, mid(k)[1] - y) < Math.hypot(mid(best)[0] - x, mid(best)[1] - y) ? k : best));
  };
  // While a single knob is pressed, which way to slide: a vertical line twice its height, a dot in the middle.
  let hint: SVGGElement | undefined;
  const showHint = (s: Spot) => {
    const [x1, y1, x2, y2] = s.box;
    const cx = (x1 + x2) / 2 + DX, cy = (y1 + y2) / 2 + DY, h = y2 - y1;
    hint = el("g", { "data-gcw-slide": "", "pointer-events": "none" }, svg);
    el("line", { x1: cx, y1: cy - h, x2: cx, y2: cy + h, stroke: "rgba(255,255,255,.7)", "stroke-width": 5, "stroke-linecap": "round" }, hint);
    el("circle", { cx, cy, r: 8, fill: "#fff", stroke: "rgba(0,0,0,.5)", "stroke-width": 1.5 }, hint);
  };
  const hideHint = () => (hint?.remove(), (hint = undefined));
  // `id`: the pointer that pressed; `moved`: it has been MOVE_PX from where it went down, so it is not a tap.
  // `fromArrow`: it began on one of the knob's arrows, bezel art by touch, so a tap there pushes nothing.
  let press: { s: Spot; id: number; x: number; y: number; t: number; axis?: "x" | "y"; travel: number; moved: boolean; fromArrow: boolean; last: number } | undefined;
  let pop: { s: Spot; g: SVGGElement; at: number } | undefined;
  let repeat = 0;
  let idle = 0;
  const send = (k: { input: Input; also?: Input }) => (onInput(k.input), k.also && onInput(k.also));
  const stopRepeat = () => clearTimeout(repeat);
  const close = () => {
    stopRepeat();
    clearTimeout(idle);
    pop?.g.remove();
    pop = undefined;
  };
  const wake = () => (clearTimeout(idle), (idle = window.setTimeout(close, IDLE_MS)));

  function open(s: Spot, at: number) {
    const layout = popKeys(s)!;
    // The art's real scale (getScreenCTM), not the box's: a box wider than the art letterboxes it.
    const scale = svg.getScreenCTM?.()?.a || svg.getBoundingClientRect().width / width || 1;
    const rows = Math.ceil(layout.keys.reduce((n, k) => n + (k.span ?? 1), 0) / layout.cols);
    // Finger-sized, but never taller than the art (918 high, 4 margin each side): H = K * (1.125 rows + 0.175).
    const K = Math.min(Math.max(48, KEY_PX / scale), 910 / (1.125 * rows + 0.175));
    const gap = K * 0.125, pad = K * 0.15;
    const W = layout.cols * K + (layout.cols - 1) * gap + 2 * pad;
    const H = rows * K + (rows - 1) * gap + 2 * pad;
    const [x1, y1, x2, y2] = s.box;
    const cx = (x1 + x2) / 2 + DX, cy = (y1 + y2) / 2 + DY;
    // Left knobs open to the right, onto the screen; right knobs to the left. Inside the art, top to bottom.
    const x = cx < width / 2 ? x2 + DX + 16 : x1 + DX - 16 - W;
    const y = Math.min(Math.max(cy - H / 2, DY + 4), DY + 918 - 4 - H);
    const g = el("g", { "data-gcw-pop": "" }, svg);
    g.setAttribute("style", "touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none");
    el("circle", { cx, cy, r: Math.max(x2 - x1, y2 - y1) / 2 + 4, fill: "none", stroke: "rgba(255,255,255,.8)", "stroke-width": 2, "pointer-events": "none" }, g);
    el("rect", { x, y, width: W, height: H, rx: 12, fill: "rgba(12,12,12,.42)", stroke: "rgba(230,230,230,.35)" }, g);
    let col = 0, row = 0;
    for (const k of layout.keys) {
      const span = k.span ?? 1;
      if (col + span > layout.cols + 0.01) (col = 0), row++;
      const kw = span * K + (span - 1) * gap;
      const kx = x + pad + col * (K + gap), ky = y + pad + row * (K + gap);
      const r = el("rect", { x: kx, y: ky, width: kw, height: K, rx: K * 0.2, fill: "rgba(0,0,0,.45)", stroke: "rgba(235,235,235,.75)", "stroke-width": 1.5 }, g);
      const t = el("text", { x: kx + kw / 2, y: ky + K * (k.sub ? 0.5 : 0.6), "text-anchor": "middle", fill: "#f2f2f2", "font-family": "sans-serif", "font-weight": 600, "font-size": K * (k.label.length > 3 ? 0.24 : 0.34), "pointer-events": "none" }, g);
      t.textContent = k.label;
      if (k.sub) {
        const u = el("text", { x: kx + kw / 2, y: ky + K * 0.8, "text-anchor": "middle", fill: "#ddd", "font-family": "sans-serif", "font-size": K * 0.18, "pointer-events": "none" }, g);
        u.textContent = k.sub;
      }
      keyEvents(r, k);
      col += span;
    }
    pop = { s, g, at };
    wake();
  }

  function keyEvents(r: SVGRectElement, k: Key) {
    let downHere = false;
    const lit = (on: boolean) => r.setAttribute("fill", on ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.45)");
    const release = () => (stopRepeat(), (downHere = false), lit(false));
    r.addEventListener("pointerdown", (e: Ev) => {
      downHere = false;
      if (e.button !== 0 || !pop || e.timeStamp - pop.at < GUARD_MS) return;
      lit(true);
      const t = e.target as Element;
      if (t.hasPointerCapture?.(e.pointerId)) t.releasePointerCapture(e.pointerId);
      downHere = true;
      wake();
      if (!k.hold) return;
      stopRepeat();
      send(k);
      const fast = FAST[k.input.control];
      const step = fast ? { ...k, input: { ...k.input, value: k.input.value * fast } } : k;
      const again = (wait: number) => (repeat = window.setTimeout(() => (send(step), wake(), again(REPEAT_EVERY)), wait));
      again(REPEAT_DELAY);
    });
    r.addEventListener("pointerup", () => {
      if (downHere && !k.hold) send(k);
      release();
    });
    r.addEventListener("pointerout", release);
    r.addEventListener("pointercancel", release);
  }

  // A press anywhere outside an open popout's keys, its own knob included, closes it and is swallowed whole.
  const outside = (e: Ev) => {
    if (dismissal.down !== e) dismissal = { down: e, on: false };
    if (!pop || pop.g.contains(e.target as Node)) return;
    close();
    dismissal.on = true;
  };
  const move = (e: Ev) => {
    // A pen hovering sends moves with no button down; another finger is its own gesture.
    if (!press || e.pointerId !== press.id || e.buttons === 0) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) >= MOVE_PX) press.moved = true;
    if (!slides(press.s)) return;
    if (!press.axis) {
      if (Math.hypot(dx, dy) < MOVE_PX) return;
      press.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    // Right and up turn clockwise.
    const along = press.axis === "x" ? dx : -dy;
    while (Math.abs(along - press.travel) >= SLIDE_PX) {
      const dir = along > press.travel ? 1 : -1;
      press.travel += dir * SLIDE_PX;
      const n = step(press.s.wheel!, e.timeStamp - press.last);
      press.last = e.timeStamp;
      onInput({ control: press.s.wheel!, value: dir * n });
    }
  };
  // A press lifted off the bezel, or taken over by the browser, ends here (after the bezel's own pointerup).
  const end = (e: Ev) => press && e.pointerId === press.id && ((press = undefined), hideHint());
  window.addEventListener("pointerdown", outside, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  return {
    swallowed: () => dismissal.on,
    /** A touch or pen press on a spot; true when it is a knob's, handled here. */
    down(e: Ev, spot: Spot | undefined): boolean {
      if (press && press.id !== e.pointerId) return true; // another finger already holds a knob: this one waits
      const s = spot?.arrow ? owner(spot) : spot;
      if (!s || !(slides(s) || popKeys(s))) return false;
      press = { s, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, travel: 0, moved: false, fromArrow: !!spot?.arrow, last: -Infinity };
      hideHint();
      if (slides(s)) showHint(s);
      return true;
    },
    /** The press lifted; true when it was a knob's. */
    up(e: Ev): boolean {
      const p = press;
      if (!p || e.pointerId !== p.id) return false;
      press = undefined;
      hideHint();
      const still = !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < MOVE_PX && e.timeStamp - p.t < TAP_MS;
      if (!still) return true;
      if (slides(p.s)) { if (!p.fromArrow) onInput({ control: p.s.click!, value: 1 }); }
      else open(p.s, e.timeStamp);
      return true;
    },
    destroy() {
      close();
      hideHint();
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    },
  };
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return parent.appendChild(e);
}
