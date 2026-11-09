// Builds the SVG for one display unit: the 1024 x 768 screen, optionally inside the bezel FlightGear draws for its
// FG1000 window (Dialogs/fascia.svg, screen at 186,45 of the 1407 x 918 bezel, per Nasal/GUI.nas).
import BEZEL from "./svg/bezel.js";
import FONT from "./svg/font.js";
import { clipRect } from "./page.js";
import type { Input } from "./bezel.js";

const NS = "http://www.w3.org/2000/svg";

export interface DisplayOptions {
  /** Draw the bezel with its knobs and softkeys around the screen; the mouse works them. */ bezel?: boolean;
  /** Called for every bezel input, including ones the display does not act on (FMS, menus, joystick). */
  onInput?: (input: Input) => void;
  /**
   * Draw the GFC 700's keys (AP, FD, HDG, ALT, NAV, VNV, APR, BC, VS, FLC, NOSE UP, NOSE DN) in the bezel's left column;
   * a press reaches `onInput` for the host's `Afcs`. Default: on for the MFD, off for the PFD (on the MFD in the 172S).
   */
  afcsKeys?: boolean;
}

let displayCount = 0;

/**
 * Prefixes every id the markup references (`url(#id)`, `href="#id"`) with `tag`. A reference resolves to the first
 * element in the document with that id, so two displays inlining the same art would share one copy, and if that copy
 * sits in a display:none display, the other display's gradients and filters do not paint. Ids nothing references keep
 * their names, so `Page.el` and the bezel find them as before.
 */
export function scopeIds(markup: string, tag: string): string {
  const ref = /(url\(#|href="#)([^)"]+)/g;
  const refs = new Set(Array.from(markup.matchAll(ref), (m) => m[2]));
  return markup.replace(ref, (_, a, id) => a + tag + id).replace(/(\sid=")([^"]+)"/g, (m, a, id) => (refs.has(id) ? `${a}${tag}${id}"` : m));
}

export function buildDisplay(container: HTMLElement, pages: string[], label: string, { bezel }: DisplayOptions) {
  const tag = `glass-d${++displayCount}-`;
  container.innerHTML = `<svg xmlns="${NS}" viewBox="${bezel ? "1 132 1407 918" : "0 0 1024 768"}" role="img"></svg>`;
  const svg = container.querySelector("svg")!;
  svg.setAttribute("aria-label", label);
  if (bezel) {
    svg.innerHTML = scopeIds(BEZEL, tag);
    // fascia.svg shades its two side columns unevenly (the left has an extra black overlay and a fainter edge strip), so
    // the left reads darker. Replace the left column's shading with a mirror image of the right's.
    for (const id of ["rect8520", "path12506", "path12557"]) svg.querySelector<SVGElement>(`#${id}`)?.style.setProperty("display", "none");
    for (const id of ["path12508", "rect12510", "path12523"]) {
      const right = svg.querySelector(`#${id}`);
      const left = right?.cloneNode(true) as SVGElement | undefined;
      left?.removeAttribute("id");
      left?.setAttribute("transform", "matrix(-1,0,0,1,1399,0)"); // the columns' edges mirror about x = 699.5
      if (left) right!.after(left);
    }
  }
  // Departs from FG1000 (Liberation Sans Narrow, not bundled): every screen text in Saira Semi Condensed, an open font
  // close to the v13 trainer's, bundled so it looks the same on every machine. The bezel keeps its own lettering.
  const style = svg.appendChild(document.createElementNS(NS, "style"));
  style.textContent = `@font-face{font-family:"Saira Semi Condensed";src:url(${FONT}) format("truetype")}` +
    `.gcw-screen text,.gcw-screen tspan{font-family:"Saira Semi Condensed",sans-serif!important;font-stretch:normal!important}`;
  const screen = svg.appendChild(document.createElementNS(NS, "g"));
  screen.setAttribute("class", "gcw-screen");
  if (bezel) screen.setAttribute("transform", "translate(187 177)");
  screen.innerHTML = `<rect width="1024" height="768" fill="#000"/>${pages.map((p) => `<g>${scopeIds(p, tag)}</g>`).join("")}`;
  screen.setAttribute("clip-path", `url(#${clipRect(screen, 0, 0, 1024, 768)})`);
  return { svg, screen };
}
