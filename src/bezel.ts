// Mouse input on the bezel, as FG1000's GUI window takes it (Nasal/GUI.nas, Copyright 2018 Stuart Buchanan,
// GPL-2.0-or-later): the wheel turns a knob (with shift, the outer ring of a dual knob), a click pushes it or a
// button (with shift, a long press), and the twelve keys under the screen are softkeys 1 to 12.
// v13 trainer: a click on an arrow beside a knob turns it, and holding it keeps turning (FG1000 has the wheel only).
// Knob and button behavior: Nasal/MFDPages/Surround/SurroundController.nas.
import { clamp, mod } from "./page.js";
import type { Radios } from "./surround.js";

export type Control =
  | "NAV_VOL" | "NAV_ID" | "NAV_FREQ_TRANSFER" | "NAV_OUTER" | "NAV_INNER" | "NAV_TOGGLE" | "HEADING" | "HEADING_PRESS"
  | "ALT_OUTER" | "ALT_INNER" | "ALT_PRESS" | "COM_VOL" | "COM_VOL_TOGGLE" | "COM_FREQ_TRANSFER" | "COM_FREQ_TRANSFER_HOLD"
  | "COM_OUTER" | "COM_INNER" | "COM_TOGGLE" | "CRS" | "BARO" | "CRS_CENTER" | "RANGE" | "JOYSTICK_PRESS"
  | "JOYSTICK_HORIZONTAL" | "JOYSTICK_VERTICAL" | "DTO" | "FPL" | "CLR" | "CLR_HOLD" | "MENU" | "PROC" | "ENT"
  | "FMS_OUTER" | "FMS_INNER" | "FMS_CRSR" | "SOFTKEY";

/** One bezel input: a knob turned (value +1 a detent clockwise, -1 counterclockwise; HDG and CRS 5 on a fast wheel spin), a push (1), or a softkey (1 to 12). */
export interface Input { control: Control; value: number }

/** Values the knobs change on either unit. The MFD does not draw them but its knobs turn them, as on the real unit. */
export interface Knobs {
  /** Magnetic heading, degrees. */ heading: number;
  /** Degrees. */ headingBug: number;
  /** Selected course, degrees. */ course: number;
  /** Inches of mercury. */ baro: number;
  /** Feet. */ alt: number;
  /** Feet; null hides the selected altitude. */ selectedAlt: number | null;
  radios: Radios;
  /** NAV and COM volume, 0 to 1 (both radios of a kind share one, as in FG1000). */ navVolume: number;
  comVolume: number;
  /** NAV station identifier audio, switched by pushing the NAV volume knob. */ navIdent: boolean;
}

/**
 * A hotspot. `arrow`: it turns a knob or moves the joystick, repeating while held, drawn as an arrow here (`dir`, the
 * way it points in degrees, 0 right and 90 down; `size`, 1 for a large knob) or printed on the bezel. `also`: a
 * second input a click reports (the joystick's diagonals). `shiftClick`: what Shift+click does, and pressing and holding.
 */
export type Spot = {
  box: [number, number, number, number]; wheel?: Control; shiftWheel?: Control; click?: Control; shiftClick?: Control; value?: number;
  arrow?: "drawn" | "printed"; dir?: number; size?: number; also?: Input;
};

// v13 trainer: arrows beside each knob turn it a detent per click, the left ones counterclockwise; on a dual knob the
// upper pair turns the outer ring and the lower pair the inner knob. Here they sit in the top corners of the knob's
// box (its label is above it), the inner pair below the outer. The wheel works over them too.
const turn = (box: Spot["box"], k: Spot, click: Control, value: number, size: number): Spot =>
  ({ box, wheel: k.wheel, shiftWheel: k.shiftWheel, click, value, arrow: "drawn", dir: value < 0 ? 180 : 0, size });
function arrows(k: Spot): Spot[] {
  const [x1, y1, x2] = k.box;
  const pair = (l: Spot["box"], r: Spot["box"], click: Control, size: number) => [turn(l, k, click, -1, size), turn(r, k, click, 1, size)];
  if (x2 - x1 < 60) return pair([x1 - 10, y1 - 2, x1 + 4, y1 + 12], [x2 - 4, y1 - 2, x2 + 10, y1 + 12], k.wheel!, 0.6); // volume
  const outer = pair([x1, y1 - 4, x1 + 18, y1 + 14], [x2 - 18, y1 - 4, x2, y1 + 14], k.shiftWheel ?? k.wheel!, 1);
  if (!k.shiftWheel) return outer;
  return [...outer, ...pair([x1 - 6, y1 + 16, x1 + 12, y1 + 32], [x2 - 12, y1 + 16, x2 + 6, y1 + 32], k.wheel!, 0.65)];
}
// The joystick's diagonals, between its printed up, down, left and right.
const diagonal = (box: Spot["box"], h: number, v: number): Spot => ({
  box, click: "JOYSTICK_HORIZONTAL", value: h, also: { control: "JOYSTICK_VERTICAL", value: v },
  arrow: "drawn", dir: (Math.atan2(v, h) * 180) / Math.PI, size: 0.6,
});

// GUI.nas WHEEL_HOT_SPOTS and CLICK_HOT_SPOTS merged per control, in bezel pixels (top left, bottom right).
export const SPOTS: Spot[] = [
  { box: [65, 45, 112, 90], wheel: "NAV_VOL", click: "NAV_ID" },
  { box: [100, 102, 150, 138], click: "NAV_FREQ_TRANSFER" },
  { box: [45, 168, 135, 250], wheel: "NAV_INNER", shiftWheel: "NAV_OUTER", click: "NAV_TOGGLE" },
  { box: [45, 338, 135, 411], wheel: "HEADING", click: "HEADING_PRESS" },
  // The ALT knob pushes too (FG1000 has no push); the push changes nothing.
  { box: [45, 800, 135, 880], wheel: "ALT_INNER", shiftWheel: "ALT_OUTER", click: "ALT_PRESS" },
  { box: [1290, 45, 1340, 90], wheel: "COM_VOL", click: "COM_VOL_TOGGLE" },
  { box: [1250, 100, 1300, 140], click: "COM_FREQ_TRANSFER", shiftClick: "COM_FREQ_TRANSFER_HOLD" },
  { box: [1275, 170, 1355, 245], wheel: "COM_INNER", shiftWheel: "COM_OUTER", click: "COM_TOGGLE" },
  { box: [1275, 331, 1355, 410], wheel: "CRS", shiftWheel: "BARO", click: "CRS_CENTER" },
  { box: [1295, 500, 1345, 550], wheel: "RANGE", click: "JOYSTICK_PRESS" },
  // Below the RANGE - and + (GUI.nas starts these at 500).
  { box: [1255, 518, 1285, 550], click: "JOYSTICK_HORIZONTAL", value: -1, arrow: "printed" },
  { box: [1345, 518, 1380, 550], click: "JOYSTICK_HORIZONTAL", value: 1, arrow: "printed" },
  { box: [1295, 465, 1345, 500], click: "JOYSTICK_VERTICAL", value: -1, arrow: "printed" },
  { box: [1295, 550, 1345, 585], click: "JOYSTICK_VERTICAL", value: 1, arrow: "printed" },
  { box: [1255, 620, 1305, 660], click: "DTO" },
  { box: [1255, 670, 1305, 710], click: "FPL" },
  { box: [1255, 720, 1305, 760], click: "CLR", shiftClick: "CLR_HOLD" },
  { box: [1325, 620, 1380, 660], click: "MENU" },
  { box: [1325, 670, 1380, 710], click: "PROC" },
  { box: [1325, 720, 1380, 760], click: "ENT" },
  { box: [1275, 800, 1355, 880], wheel: "FMS_INNER", shiftWheel: "FMS_OUTER", click: "FMS_CRSR" },
  // SOFTKEY_HOTSPOTS
  ...[205, 290, 375, 460, 545, 630, 715, 800, 885, 970, 1055, 1145].map(
    (x, i): Spot => ({ box: [x, 830, x + 60, 875], click: "SOFTKEY", value: i + 1 }),
  ),
  // RANGE turns on the - and + printed beside it.
  { box: [1264, 496, 1284, 516], wheel: "RANGE", click: "RANGE", value: -1, arrow: "printed" },
  { box: [1347, 496, 1367, 516], wheel: "RANGE", click: "RANGE", value: 1, arrow: "printed" },
  diagonal([1258, 470, 1290, 494], -1, -1),
  diagonal([1350, 470, 1382, 494], 1, -1),
  diagonal([1258, 553, 1292, 585], -1, 1),
  diagonal([1348, 553, 1382, 585], 1, 1),
];
// After the knobs' own spots, so an arrow is on top of the knob it turns.
SPOTS.push(...SPOTS.filter((s) => s.wheel && s.wheel !== "RANGE" && !s.arrow).flatMap(arrows));

const NS = "http://www.w3.org/2000/svg";
// fascia.svg draws the bezel 1 px right of and 132 px below GUI.nas's coordinates.
const DX = 1;
const DY = 132;
// One detent per 100 px of wheel travel: one notch of a mouse wheel; a trackpad needs a longer swipe.
const DETENT = 100;
// Holding an arrow turns again after REPEAT_DELAY ms, then every REPEAT_EVERY ms.
const REPEAT_DELAY = 350;
const REPEAT_EVERY = 90;
// Holding a key this long is a long press (COM transfer: 121.5; CLR on the MFD: navigation map), as on the real unit.
const HOLD = 2000;

/** Detents one wheel notch turns: HDG and CRS turn 5 when the wheel spins fast (`gap`, ms since the last notch), as a quick twist does. */
export function wheelStep(control: Control, gap: number): number {
  return (control === "HEADING" || control === "CRS") && gap < 100 ? 5 : 1;
}

/** Adds the hotspots to a display drawn with its bezel and reports each input. Returns a function that removes the window listener. */
export function bezelInput(svg: SVGSVGElement, onInput: (input: Input) => void): () => void {
  const layer = svg.appendChild(document.createElementNS(NS, "g"));
  layer.setAttribute("fill", "transparent");
  layer.setAttribute("cursor", "pointer");
  // A slight glow shows where an arrow is, and its drawn arrow brightens.
  layer.appendChild(document.createElementNS(NS, "style")).textContent =
    ".gcw-arrow:hover{fill:rgba(255,255,255,.14)}.gcw-arrow:hover+path{fill-opacity:1}";
  for (const [i, s] of SPOTS.entries()) {
    const [x1, y1, x2, y2] = s.box;
    const r = layer.appendChild(document.createElementNS(NS, "rect"));
    for (const [k, v] of Object.entries({ x: x1 + DX, y: y1 + DY, width: x2 - x1, height: y2 - y1, rx: s.arrow ? 3 : 0 })) r.setAttribute(k, String(v));
    r.dataset.spot = String(i);
    if (!s.arrow) continue;
    r.classList.add("gcw-arrow");
    if (s.arrow === "printed") continue;
    const a = (s.size ?? 1) * 6;
    const p = layer.appendChild(document.createElementNS(NS, "path"));
    p.setAttribute("d", `M${a} 0L${-a} ${-a * 0.8}L${-a} ${a * 0.8}Z`);
    p.setAttribute("transform", `translate(${(x1 + x2) / 2 + DX} ${(y1 + y2) / 2 + DY}) rotate(${s.dir ?? 0})`);
    p.setAttribute("fill", "#e6e6e6");
    p.setAttribute("fill-opacity", "0.6");
    p.setAttribute("pointer-events", "none");
  }
  const spot = (e: Event): Spot | undefined => SPOTS[Number((e.target as Element).getAttribute("data-spot"))];
  const fire = (s: Spot, control: Control) => {
    onInput({ control, value: s.value ?? 1 });
    if (s.also) onInput(s.also);
  };

  let travel = 0;
  let last = -Infinity;
  layer.addEventListener("wheel", (e) => {
    const s = spot(e);
    const control = e.shiftKey ? s?.shiftWheel : s?.wheel;
    if (!control) return;
    e.preventDefault();
    // Some browsers turn shift+wheel into horizontal scrolling.
    travel += (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
    while (Math.abs(travel) >= DETENT) {
      const dir = travel < 0 ? 1 : -1; // wheel up turns clockwise
      travel += dir * DETENT;
      const step = wheelStep(control, e.timeStamp - last);
      last = e.timeStamp;
      onInput({ control, value: dir * step });
    }
  }, { passive: false });

  // Arrows turn on press and keep turning while held; other spots act on click.
  let timer = 0;
  let held = false;
  const stop = () => clearTimeout(timer);
  layer.addEventListener("pointerdown", (e) => {
    const s = spot(e);
    if (e.button !== 0) return;
    if (s?.shiftClick && !s.arrow) {
      stop();
      held = false;
      const control = s.shiftClick;
      timer = window.setTimeout(() => ((held = true), fire(s, control)), HOLD);
      return;
    }
    if (!s?.arrow || !s.click) return;
    const control = s.click;
    stop();
    fire(s, control);
    const again = (wait: number) => (timer = window.setTimeout(() => (fire(s, control), again(REPEAT_EVERY)), wait));
    again(REPEAT_DELAY);
  });
  layer.addEventListener("pointerout", stop);
  layer.addEventListener("pointercancel", stop);
  window.addEventListener("pointerup", stop);
  layer.addEventListener("click", (e) => {
    const s = spot(e);
    if (!s || s.arrow) return;
    if (held) return void (held = false); // the long press already acted
    const control = e.shiftKey ? s.shiftClick : s.click;
    if (control) fire(s, control);
  });
  return () => {
    stop();
    window.removeEventListener("pointerup", stop);
  };
}

// NAV and COM bands in whole MHz (Constants.nas). Frequencies are worked in kHz to keep them exact.
const NAV = [108, 117];
const COM = [118, 136];

/**
 * The knob and button changes SurroundController makes, as a patch; null when the input does not change these values.
 * `toStation` is the magnetic bearing to the station of the NAV radio the CDI shows, if the host gives one.
 */
export function adjust({ control, value }: Input, k: Knobs, sel: { nav: 1 | 2; com: 1 | 2 }, toStation?: number | null): Partial<Knobs> | null {
  const d = value > 0 ? 1 : -1;
  switch (control) {
    // handleCRSCenter sets the selected NAV's course to the bearing to its station, which moves the CDI only when that
    // radio drives it.
    case "CRS_CENTER": return toStation == null ? null : { course: Math.round(mod(toStation, 360)) % 360 };
    // handleNavVol / handleComVol: 1% a detent. handleNavID switches the identifier audio.
    case "NAV_VOL": return { navVolume: clamp(Math.round(k.navVolume * 100) + d, 0, 100) / 100 };
    case "COM_VOL": return { comVolume: clamp(Math.round(k.comVolume * 100) + d, 0, 100) / 100 };
    case "NAV_ID": return { navIdent: !k.navIdent };
    case "HEADING": return { headingBug: mod(Math.round(k.headingBug) + Math.round(value), 360) }; // value: 5 on a fast spin
    case "HEADING_PRESS": return { headingBug: Math.round(mod(k.heading, 360)) % 360 };
    case "CRS": return { course: mod(Math.round(k.course) + Math.round(value), 360) };
    case "BARO": return { baro: Math.round(k.baro * 100 + d) / 100 };
    case "ALT_INNER":
    case "ALT_OUTER": {
      // The real unit always has one (start at the altitude) and keeps it on 100 ft steps, whatever the host set.
      const from = Math.round((k.selectedAlt ?? k.alt) / 100) * 100;
      return { selectedAlt: Math.max(0, from + d * (control === "ALT_INNER" ? 100 : 1000)) };
    }
  }
  const nav = `nav${sel.nav}` as const;
  const com = `com${sel.com}` as const;
  const radio = (key: typeof nav | typeof com, standby: number) => ({ radios: { ...k.radios, [key]: { ...k.radios[key], standby } } });
  const khz = (mhz: number) => Math.round(mhz * 1000);
  switch (control) {
    case "NAV_FREQ_TRANSFER": return { radios: { ...k.radios, [nav]: { ...k.radios[nav], active: k.radios[nav].standby, standby: k.radios[nav].active } } };
    case "COM_FREQ_TRANSFER": return { radios: { ...k.radios, [com]: { ...k.radios[com], active: k.radios[com].standby, standby: k.radios[com].active } } };
    // FG1000 tunes 121.00 here; the real unit's long press tunes the emergency frequency.
    case "COM_FREQ_TRANSFER_HOLD": return { radios: { ...k.radios, [com]: { ...k.radios[com], active: 121.5 } } };
    case "NAV_OUTER": return radio(nav, outer(khz(k.radios[nav].standby), d, NAV) / 1000);
    case "COM_OUTER": return radio(com, outer(khz(k.radios[com].standby), d, COM) / 1000);
    // Inner knobs change only the kHz, wrapping without carrying into the MHz.
    // NAV steps 50 kHz, the VOR and ILS channel spacing (FG1000 uses 25). shortcut: COM steps 25 kHz, no 8.33 kHz channels.
    case "NAV_INNER": return radio(nav, inner(khz(k.radios[nav].standby), d * 50) / 1000);
    case "COM_INNER": return radio(com, inner(khz(k.radios[com].standby), d * 25) / 1000);
  }
  return null;
}

const outer = (f: number, d: number, [lo, hi]: number[]) => (lo + mod(Math.floor(f / 1000) + d - lo, hi - lo + 1)) * 1000 + (f % 1000);
const inner = (f: number, step: number) => Math.floor(f / 1000) * 1000 + mod((f % 1000) + step, 1000);
