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
// Detents a held key's repeats turn: CRS as a fast spin of the wheel does (wheelStep). A tap stays one.
const FAST = { CRS: 5 };
// The outer and inner rings' labels, and the push's.
const DUAL = {
    NAV_INNER: ["MHz", "kHz", "1-2"], COM_INNER: ["MHz", "kHz", "1-2"], CRS: ["BARO", "CRS", "CRS CTR"],
    ALT_INNER: ["1000", "100", "PUSH"], FMS_INNER: ["outer", "inner", "CRSR"],
};
const turn = (control, value, label, sub) => ({ label, sub, input: { control, value }, hold: true });
const stick = (h, v, label) => h && v
    ? { label, input: { control: "JOYSTICK_HORIZONTAL", value: h }, also: { control: "JOYSTICK_VERTICAL", value: v }, hold: true }
    : { label, input: h ? { control: "JOYSTICK_HORIZONTAL", value: h } : { control: "JOYSTICK_VERTICAL", value: v }, hold: true };
/** The keys a knob's popout shows, in rows; null for a knob without one. */
export function popKeys(s) {
    if (s.click === "JOYSTICK_PRESS")
        return { cols: 3, keys: [
                stick(-1, -1, "↖"), stick(0, -1, "▲"), stick(1, -1, "↗"),
                stick(-1, 0, "◀"), { label: "PAN", input: { control: "JOYSTICK_PRESS", value: 1 }, hold: false }, stick(1, 0, "▶"),
                stick(-1, 1, "↙"), stick(0, 1, "▼"), stick(1, 1, "↘"),
                { ...turn("RANGE", -1, "−", "range"), span: 1.5 }, { ...turn("RANGE", 1, "+", "range"), span: 1.5 },
            ] };
    const d = s.wheel && s.shiftWheel && DUAL[s.wheel];
    if (!d || !s.click)
        return null;
    return { cols: 2, keys: [
            turn(s.shiftWheel, -1, "◀◀", d[0]), turn(s.shiftWheel, 1, "▶▶", d[0]),
            turn(s.wheel, -1, "◀", d[1]), turn(s.wheel, 1, "▶", d[1]),
            { label: d[2], input: { control: s.click, value: 1 }, hold: false, span: 2 },
        ] };
}
/** A knob a slide turns and a tap pushes. */
export const slides = (s) => !!s.wheel && !s.shiftWheel && s.wheel !== "RANGE" && !!s.click && !s.arrow;
const NS = "http://www.w3.org/2000/svg";
// A press outside an open popout closes it and does nothing else, on every display: the displays share whether the
// current press (the one event every display's capture listener sees) is being swallowed.
let dismissal = { on: false };
/**
 * Touch and pen on the knobs of a display drawn by `bezelInput`. `offset` is the art's offset from the spots' coordinates
 * and `width` the viewBox's. The bezel's own handlers call `down` and `up` first and skip the press when they return
 * true, and skip a whole gesture while `swallowed()` (a tap outside an open popout closes it and does nothing else).
 */
export function knobTouch(svg, onInput, offset, width, spots) {
    const [DX, DY] = offset;
    // The knob an arrow belongs to: the nearest knob to it.
    const knobs = spots.filter((s) => !s.arrow && (slides(s) || popKeys(s)));
    const mid = (s) => [(s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2];
    const owner = (a) => {
        const [x, y] = mid(a);
        return knobs.reduce((best, k) => (Math.hypot(mid(k)[0] - x, mid(k)[1] - y) < Math.hypot(mid(best)[0] - x, mid(best)[1] - y) ? k : best));
    };
    // While a single knob is pressed, which way to slide: a vertical line twice its height, a dot in the middle.
    let hint;
    const showHint = (s) => {
        const [x1, y1, x2, y2] = s.box;
        const cx = (x1 + x2) / 2 + DX, cy = (y1 + y2) / 2 + DY, h = y2 - y1;
        hint = el("g", { "data-gcw-slide": "", "pointer-events": "none" }, svg);
        el("line", { x1: cx, y1: cy - h, x2: cx, y2: cy + h, stroke: "rgba(255,255,255,.7)", "stroke-width": 5, "stroke-linecap": "round" }, hint);
        el("circle", { cx, cy, r: 8, fill: "#fff", stroke: "rgba(0,0,0,.5)", "stroke-width": 1.5 }, hint);
    };
    const hideHint = () => (hint?.remove(), (hint = undefined));
    // `id`: the pointer that pressed; `moved`: it has been MOVE_PX from where it went down, so it is not a tap.
    let press;
    let pop;
    let repeat = 0;
    let idle = 0;
    const send = (k) => (onInput(k.input), k.also && onInput(k.also));
    const stopRepeat = () => clearTimeout(repeat);
    const close = () => {
        stopRepeat();
        clearTimeout(idle);
        pop?.g.remove();
        pop = undefined;
    };
    const wake = () => (clearTimeout(idle), (idle = window.setTimeout(close, IDLE_MS)));
    function open(s, at) {
        const layout = popKeys(s);
        const scale = svg.getBoundingClientRect().width / width || 1;
        const K = Math.max(48, KEY_PX / scale);
        const gap = K * 0.125, pad = K * 0.15;
        const rows = Math.ceil(layout.keys.reduce((n, k) => n + (k.span ?? 1), 0) / layout.cols);
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
            if (col + span > layout.cols + 0.01)
                (col = 0), row++;
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
    function keyEvents(r, k) {
        let downHere = false;
        const lit = (on) => r.setAttribute("fill", on ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.45)");
        const release = () => (stopRepeat(), (downHere = false), lit(false));
        r.addEventListener("pointerdown", (e) => {
            downHere = false;
            if (e.button !== 0 || !pop || e.timeStamp - pop.at < GUARD_MS)
                return;
            lit(true);
            const t = e.target;
            if (t.hasPointerCapture?.(e.pointerId))
                t.releasePointerCapture(e.pointerId);
            downHere = true;
            wake();
            if (!k.hold)
                return;
            stopRepeat();
            send(k);
            const fast = FAST[k.input.control];
            const step = fast ? { ...k, input: { ...k.input, value: k.input.value * fast } } : k;
            const again = (wait) => (repeat = window.setTimeout(() => (send(step), wake(), again(REPEAT_EVERY)), wait));
            again(REPEAT_DELAY);
        });
        r.addEventListener("pointerup", () => {
            if (downHere && !k.hold)
                send(k);
            release();
        });
        r.addEventListener("pointerout", release);
        r.addEventListener("pointercancel", release);
    }
    // A press anywhere outside an open popout's keys, its own knob included, closes it and is swallowed whole.
    const outside = (e) => {
        if (dismissal.down !== e)
            dismissal = { down: e, on: false };
        if (!pop || pop.g.contains(e.target))
            return;
        close();
        dismissal.on = true;
    };
    const move = (e) => {
        // A pen hovering sends moves with no button down; another finger is its own gesture.
        if (!press || e.pointerId !== press.id || e.buttons === 0)
            return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
        if (Math.hypot(dx, dy) >= MOVE_PX)
            press.moved = true;
        if (!slides(press.s))
            return;
        if (!press.axis) {
            if (Math.hypot(dx, dy) < MOVE_PX)
                return;
            press.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        }
        // Right and up turn clockwise.
        const along = press.axis === "x" ? dx : -dy;
        while (Math.abs(along - press.travel) >= SLIDE_PX) {
            const dir = along > press.travel ? 1 : -1;
            press.travel += dir * SLIDE_PX;
            onInput({ control: press.s.wheel, value: dir });
        }
    };
    // A press lifted off the bezel, or taken over by the browser, ends here (after the bezel's own pointerup).
    const end = (e) => press && e.pointerId === press.id && ((press = undefined), hideHint());
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return {
        swallowed: () => dismissal.on,
        /** A touch or pen press on a spot; true when it is a knob's, handled here. */
        down(e, spot) {
            const s = spot?.arrow ? owner(spot) : spot;
            if (!s || !(slides(s) || popKeys(s)))
                return false;
            press = { s, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, travel: 0, moved: false };
            hideHint();
            if (slides(s))
                showHint(s);
            return true;
        },
        /** The press lifted; true when it was a knob's. */
        up(e) {
            const p = press;
            if (!p || e.pointerId !== p.id)
                return false;
            press = undefined;
            hideHint();
            const still = !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < MOVE_PX && e.timeStamp - p.t < TAP_MS;
            if (!still)
                return true;
            if (slides(p.s))
                onInput({ control: p.s.click, value: 1 });
            else
                open(p.s, e.timeStamp);
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
function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
        e.setAttribute(k, String(v));
    return parent.appendChild(e);
}
