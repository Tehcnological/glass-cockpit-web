// Builds the SVG for one display unit: the 1024 x 768 screen, optionally inside the bezel FlightGear draws for its
// FG1000 window (Dialogs/fascia.svg, screen at 186,45 of the 1407 x 918 bezel, per Nasal/GUI.nas).
import BEZEL from "./svg/bezel.js";
import { clipRect } from "./page.js";
import type { Input } from "./bezel.js";

const NS = "http://www.w3.org/2000/svg";

export interface DisplayOptions {
  /** Draw the bezel with its knobs and softkeys around the screen; the mouse works them. */ bezel?: boolean;
  /** Called for every bezel input, including ones the display does not act on (FMS, menus, joystick). */
  onInput?: (input: Input) => void;
}

export function buildDisplay(container: HTMLElement, pages: string[], label: string, { bezel }: DisplayOptions) {
  container.innerHTML = `<svg xmlns="${NS}" viewBox="${bezel ? "1 132 1407 918" : "0 0 1024 768"}" role="img"></svg>`;
  const svg = container.querySelector("svg")!;
  svg.setAttribute("aria-label", label);
  if (bezel) {
    svg.innerHTML = BEZEL;
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
  const screen = svg.appendChild(document.createElementNS(NS, "g"));
  if (bezel) screen.setAttribute("transform", "translate(187 177)");
  screen.innerHTML = `<rect width="1024" height="768" fill="#000"/>${pages.map((p) => `<g>${p}</g>`).join("")}`;
  screen.setAttribute("clip-path", `url(#${clipRect(screen, 0, 0, 1024, 768)})`);
  return { svg, screen };
}
