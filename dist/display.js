// Builds the SVG for one display unit: the 1024 x 768 screen, optionally inside the bezel FlightGear draws for its
// FG1000 window (Dialogs/fascia.svg, screen at 186,45 of the 1407 x 918 bezel, per Nasal/GUI.nas).
import BEZEL from "./svg/bezel.js";
import { clipRect } from "./page.js";
const NS = "http://www.w3.org/2000/svg";
let displayCount = 0;
/**
 * Prefixes every id the markup references (`url(#id)`, `href="#id"`) with `tag`. A reference resolves to the first
 * element in the document with that id, so two displays inlining the same art would share one copy, and if that copy
 * sits in a display:none display, the other display's gradients and filters do not paint. Ids nothing references keep
 * their names, so `Page.el` and the bezel find them as before.
 */
export function scopeIds(markup, tag) {
    const ref = /(url\(#|href="#)([^)"]+)/g;
    const refs = new Set(Array.from(markup.matchAll(ref), (m) => m[2]));
    return markup.replace(ref, (_, a, id) => a + tag + id).replace(/(\sid=")([^"]+)"/g, (m, a, id) => (refs.has(id) ? `${a}${tag}${id}"` : m));
}
export function buildDisplay(container, pages, label, { bezel }) {
    const tag = `glass-d${++displayCount}-`;
    container.innerHTML = `<svg xmlns="${NS}" viewBox="${bezel ? "1 132 1407 918" : "0 0 1024 768"}" role="img"></svg>`;
    const svg = container.querySelector("svg");
    svg.setAttribute("aria-label", label);
    if (bezel) {
        svg.innerHTML = scopeIds(BEZEL, tag);
        // fascia.svg shades its two side columns unevenly (the left has an extra black overlay and a fainter edge strip), so
        // the left reads darker. Replace the left column's shading with a mirror image of the right's.
        for (const id of ["rect8520", "path12506", "path12557"])
            svg.querySelector(`#${id}`)?.style.setProperty("display", "none");
        for (const id of ["path12508", "rect12510", "path12523"]) {
            const right = svg.querySelector(`#${id}`);
            const left = right?.cloneNode(true);
            left?.removeAttribute("id");
            left?.setAttribute("transform", "matrix(-1,0,0,1,1399,0)"); // the columns' edges mirror about x = 699.5
            if (left)
                right.after(left);
        }
    }
    const screen = svg.appendChild(document.createElementNS(NS, "g"));
    if (bezel)
        screen.setAttribute("transform", "translate(187 177)");
    screen.innerHTML = `<rect width="1024" height="768" fill="#000"/>${pages.map((p) => `<g>${scopeIds(p, tag)}</g>`).join("")}`;
    screen.setAttribute("clip-path", `url(#${clipRect(screen, 0, 0, 1024, 768)})`);
    return { svg, screen };
}
