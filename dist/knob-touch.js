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
/**
 * Touch and pen on the knobs of a display drawn by `bezelInput`. `offset` is the art's offset from the spots' coordinates
 * and `width` the viewBox's. The bezel's own handlers call `down` and `up` first and skip the press when they return
 * true, and skip a whole gesture while `swallowed()` (a tap outside an open popout closes it and does nothing else).
 */
export function knobTouch(svg, onInput, offset, width) {
    const [DX, DY] = offset;
    let press;
    let pop;
    let swallow = false;
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
        r.addEventListener("pointerdown", (e) => {
            downHere = false;
            if (!pop || e.timeStamp - pop.at < GUARD_MS)
                return;
            const t = e.target;
            if (t.hasPointerCapture?.(e.pointerId))
                t.releasePointerCapture(e.pointerId);
            downHere = true;
            wake();
            if (!k.hold)
                return;
            stopRepeat();
            send(k);
            const again = (wait) => (repeat = window.setTimeout(() => (send(k), wake(), again(REPEAT_EVERY)), wait));
            again(REPEAT_DELAY);
        });
        r.addEventListener("pointerup", () => {
            stopRepeat();
            if (downHere && !k.hold)
                send(k);
            downHere = false;
        });
        r.addEventListener("pointerout", () => (stopRepeat(), (downHere = false)));
        r.addEventListener("pointercancel", () => (stopRepeat(), (downHere = false)));
    }
    // A press outside an open popout, and not on its knob, closes it and is swallowed whole.
    const outside = (e) => {
        swallow = false;
        if (!pop || pop.g.contains(e.target))
            return;
        if (e.target?.getAttribute?.("data-spot") === String(spotIndex(pop.s)))
            return;
        close();
        swallow = true;
    };
    let spotIndex = () => -1;
    const move = (e) => {
        if (!press || !slides(press.s))
            return;
        const dx = e.clientX - press.x, dy = e.clientY - press.y;
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
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("pointermove", move);
    return {
        /** For the bezel's spots, to tell a press on the popout's own knob from one outside. */
        spots(index) { spotIndex = index; },
        swallowed: () => swallow,
        /** A touch or pen press on a spot; true when it is a knob's, handled here. */
        down(e, s) {
            if (!s || s.arrow || !(slides(s) || popKeys(s)))
                return false;
            press = { s, x: e.clientX, y: e.clientY, t: e.timeStamp, travel: 0 };
            return true;
        },
        /** The press lifted; true when it was a knob's. */
        up(e) {
            const p = press;
            press = undefined;
            if (!p)
                return false;
            const still = !p.axis && Math.hypot(e.clientX - p.x, e.clientY - p.y) < MOVE_PX && e.timeStamp - p.t < TAP_MS;
            if (!still)
                return true;
            if (slides(p.s))
                onInput({ control: p.s.click, value: 1 });
            else if (pop?.s === p.s)
                close(), onInput({ control: p.s.click, value: 1 });
            else
                close(), open(p.s, e.timeStamp);
            return true;
        },
        destroy() {
            close();
            window.removeEventListener("pointerdown", outside, true);
            window.removeEventListener("pointermove", move);
        },
    };
}
function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
        e.setAttribute(k, String(v));
    return parent.appendChild(e);
}
