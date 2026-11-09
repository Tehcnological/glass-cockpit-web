// The engine strip (FG1000 Nasal/EIS/EIS.nas, Copyright 2018 Stuart Buchanan, ported to TypeScript under GPL-2.0-or-later),
// shared by the MFD and the reversionary PFD, with its softkeys and where the reversionary PFD moves things to make room.
// The LEAN and SYSTEM pages are this package's own (Pilot's Guide; FG1000 has no art or logic for them): see EisStrip.
import { clamp, type Page } from "./page.js";
import { BLANK, CYAN, NS, dimKey, key, type Key } from "./ui.js";
import { FuelCalc, LeanAssist } from "./lean.js";
import type { Engine } from "./glass-mfd.js";

// EIS.new: pointer name, min, max, travel in px (PFD.PointerElement).
const POINTERS: [string, "fuelFlow" | "oilPressure" | "oilTemp" | "egt" | "vacuum" | "fuelLeft" | "fuelRight", number, number][] = [
  ["FuelFlowPointer", "fuelFlow", 0, 20], ["OilPressurePointer", "oilPressure", 0, 115], ["OilTempPointer", "oilTemp", 0, 245],
  ["EGTPointer", "egt", 0, 1], ["EGTCylinder", "egt", 0, 1], ["VacPointer", "vacuum", 3, 7],
  ["LeftFuelPointer", "fuelLeft", 0, 30], ["RightFuelPointer", "fuelRight", 0, 30],
];

/** EIS.updateData, into the strip's page. */
export function drawEis(eis: Page, e: Engine) {
  eis.text("RPMDisplay", String(Math.round(e.rpm)));
  eis.text("MBusVolts", e.volts.toFixed(1));
  eis.text("EBusVolts", e.volts.toFixed(1)); // FG1000 shows the main bus on both
  eis.text("EngineHours", e.engineHours.toFixed(1));
  for (const [name, k, min, max] of POINTERS) eis.tf(name, { tx: ((clamp(e[k], min, max) - min) / (max - min)) * 135 });
  // PFD.RotatingElement: 0-3000 RPM over 260°, about the needle's hub (its Inkscape transform center).
  eis.tf("RPMPointer", { rot: (clamp(e.rpm, 0, 3000) / 3000) * 260 });
}

/** The engine softkey menus; `galrem` is SYSTEM's GAL REM keys. */
export type EngineMenu = "engine" | "lean" | "system" | "galrem";

/** The strip's page for a softkey menu (Pilot's Guide): LEAN and SYSTEM show their pages, any other menu ENGINE. */
export const eisView = (menu: string): "engine" | "lean" | "system" =>
  menu === "lean" ? "lean" : menu === "system" || menu === "galrem" ? "system" : "engine";

/** Where BACK goes from an engine menu. */
export const engineBack = (menu: EngineMenu) => (menu === "engine" ? "top" : menu === "galrem" ? "system" : "engine");

/** EIS engineMenu's first ten softkeys. v13 trainer: LEAN's and SYSTEM's keys where the trainer has them (FG1000 packs
 * them after SYSTEM). Pilot's Guide: CYL SLCT is disabled in ASSIST, and GAL REM opens -10, -1, +1 and +10 GAL (their
 * slots are a guess, as the trainer was not checked). `s` is the strip's lean assist and fuel calculator. */
export function engineKeys(menu: EngineMenu, to: (m: EngineMenu) => () => void, s = { lean: new LeanAssist(), fuel: new FuelCalc() }): Key[] {
  if (menu === "galrem") {
    const gal = (n: number) => key(`${n > 0 ? "+" : ""}${n} GAL`, () => s.fuel.adjust(n));
    return [BLANK, BLANK, BLANK, BLANK, gal(-10), gal(-1), gal(1), gal(10), BLANK, BLANK];
  }
  const k = (m: EngineMenu) => key(m.toUpperCase(), to(m), menu === m);
  const own: Record<"engine" | "lean" | "system", Key[]> = {
    engine: [BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK],
    lean: [BLANK, s.lean.on ? dimKey("CYL SLCT") : key("CYL SLCT", () => s.lean.cylSlct()), key("ASSIST", () => s.lean.assist(), s.lean.on), BLANK, BLANK, BLANK, BLANK],
    system: [BLANK, BLANK, BLANK, key("RST FUEL", () => s.fuel.reset()), key("GAL REM", to("galrem")), BLANK, BLANK],
  };
  return [k("engine"), k("lean"), k("system"), ...own[menu]];
}

// The LEAN and SYSTEM pages, drawn here in the ENGINE page's style (FG1000's 15 px white labels, white readouts, cyan
// for the selected cylinder): the RPM gauge above and the fuel quantity, engine hours and electrical block below stay,
// and the band between (FG1000's fuel flow to vacuum gauges) is replaced. Layout from the Pilot's Guide's description.
const BAND = ["g4866", "g4888", "g4934", "g4952", "g4998"]; // EIS.svg's FFLOW, OIL PRES, OIL TEMP, EGT and VAC groups
const LEFT = 6;
const RIGHT = 144;
const DASH = "---";
/** Bar graph scales, degrees F. Assumed: the 172S's gauges carry no numbers; CHT's top is its 500 F redline. */
const EGT_SCALE = [1100, 1600];
const CHT_SCALE = [200, 500];
const COLS = [30, 60, 90, 120]; // cylinder column centers, px
const BAR_W = 20;

const label = (t: string, y: number) => `<text x="${LEFT}" y="${y}" fill="#ffffff" style="font-size:15px">${t}</text>`;
const value = (t: string, y: number, fill = "#ffffff") => `<text x="${RIGHT}" y="${y}" fill="${fill}" text-anchor="end" style="font-size:18px">${t}</text>`;
const row = (l: string, v: string, y: number, fill?: string) => label(l, y) + value(v, y, fill);
/** A section title between rules, as FG1000's ELECTRICAL. */
const title = (t: string, y: number) =>
  `<path d="M8 ${y - 5}h20M122 ${y - 5}h20" stroke="#ffffff"/><text x="75" y="${y}" fill="#ffffff" text-anchor="middle" style="font-size:15px">${t}</text>`;
const frac = (v: number, [lo, hi]: number[]) => clamp((v - lo) / (hi - lo), 0, 1);

/** Four bars standing on `bottom`, `height` px tall: `f` gives each cylinder's fill (0 to 1, null empty), the selected one cyan. */
function bars(cls: string, f: (number | null)[], selected: number, bottom: number, height: number) {
  return COLS.map((x, i) => {
    const h = (f[i] ?? 0) * height;
    return `<rect x="${x - BAR_W / 2}" y="${bottom - height}" width="${BAR_W}" height="${height}" fill="none" stroke="#808080"/>` +
      (f[i] === null ? "" : `<rect class="${cls}" x="${x - BAR_W / 2}" y="${bottom - h}" width="${BAR_W}" height="${h}" fill="${i === selected ? CYAN : "#ffffff"}"/>`);
  }).join("");
}

/**
 * The LEAN page: fuel flow, the ASSIST rows (ΔPEAK and the fuel flow at peak), EGT per cylinder as bars under the
 * selected cylinder's value, the cylinder numbers (the selected one boxed, as FG1000's ENGINE page marks its EGT
 * cylinder), and CHT the same way. Without `cylinders`, every bar shows the single `egt` and the values are dashed.
 */
export function leanMarkup(e: Engine, lean: LeanAssist): string {
  const c = e.cylinders?.length === 4 ? e.cylinders : undefined;
  const sel = lean.selected;
  const egtBar = 360;
  const chtBar = 466;
  let m = row("FFLOW GPH", e.fuelFlow.toFixed(1), 214);
  if (lean.on) {
    const d = lean.delta(c);
    m += row("ΔPEAK °F", d === null ? DASH : String(Math.round(d)), 236, CYAN);
    m += row("PEAK GPH", lean.peak ? lean.peak.flow.toFixed(1) : DASH, 258, CYAN);
  }
  m += row("EGT °F", c ? String(Math.round(c[sel].egt)) : DASH, 280, CYAN);
  m += bars("egt", COLS.map((_, i) => (c ? frac(c[i].egt, EGT_SCALE) : clamp(e.egt, 0, 1))), sel, egtBar, 70);
  // Lean assist marks the peak with a hollow box on the first cylinder to reach it.
  if (lean.peak) {
    const y = egtBar - frac(lean.peak.egt, EGT_SCALE) * 70;
    m += `<rect x="${COLS[lean.peak.cyl] - BAR_W / 2 - 3}" y="${y - 4}" width="${BAR_W + 6}" height="8" fill="none" stroke="${CYAN}" stroke-width="2"/>`;
  }
  m += COLS.map((x, i) =>
    (i === sel ? `<rect x="${x - 9}" y="${egtBar + 3}" width="18" height="17" fill="${CYAN}"/>` : "") +
    `<text x="${x}" y="${egtBar + 17}" fill="${i === sel ? "#000000" : "#ffffff"}" text-anchor="middle" style="font-size:15px">${i + 1}</text>`).join("");
  m += row("CHT °F", c ? String(Math.round(c[sel].cht)) : DASH, 404, CYAN);
  m += bars("cht", COLS.map((_, i) => (c ? frac(c[i].cht, CHT_SCALE) : null)), sel, chtBar, 52);
  m += `<path d="M${COLS[0] - BAR_W / 2} ${chtBar - 52}H${COLS[3] + BAR_W / 2}" stroke="#ff0000" stroke-width="2"/>`;
  return m;
}

/** The SYSTEM page: oil pressure and temperature, and the fuel calculator (fuel flow, GAL USED, GAL REM; GAL REM cyan
 * while its keys are up). Engine hours and the electrical block are below, as on the ENGINE page. */
export function systemMarkup(e: Engine, fuel: FuelCalc, editing: boolean): string {
  return row("OIL PRES PSI", String(Math.round(e.oilPressure)), 216) + row("OIL TEMP °F", String(Math.round(e.oilTemp)), 240) +
    title("FUEL CALC", 274) + row("FFLOW GPH", e.fuelFlow.toFixed(1), 300) + row("GAL USED", fuel.used.toFixed(1), 324) +
    row("GAL REM", fuel.remaining.toFixed(1), 348, editing ? CYAN : "#ffffff");
}

/** The strip with its three pages. The lean assist and fuel calculator live here, in the unit, not in the host's state. */
export class EisStrip {
  lean = new LeanAssist();
  fuel = new FuelCalc();
  private band: SVGGElement;
  /** FG1000's gauges the LEAN and SYSTEM pages replace, found once (any missing are skipped). */ private gauges: SVGElement[];
  private drawn = "";

  constructor(private page: Page) {
    const group = page.el("Group")!;
    this.gauges = BAND.map((id) => group.querySelector<SVGElement>(`[id="${id}"]`)).filter((g): g is SVGElement => !!g);
    this.band = group.appendChild(document.createElementNS(NS, "g"));
  }

  /** Draws the page for the softkey menu `menu`; counts fuel and watches for a peak whatever the page. */
  draw(e: Engine, menu: string, now = Date.now()) {
    drawEis(this.page, e);
    this.fuel.burn(e.fuelFlow, now);
    this.lean.update(e.cylinders, e.fuelFlow);
    const view = eisView(menu);
    for (const g of this.gauges) g.style.display = view === "engine" ? "" : "none";
    const m = view === "lean" ? leanMarkup(e, this.lean) : view === "system" ? systemMarkup(e, this.fuel, menu === "galrem") : "";
    if (m !== this.drawn) this.band.innerHTML = this.drawn = m;
  }
}

interface Box { x: number; y: number; width: number; height: number }

/** Reversionary mode (Pilot's Guide): the engine strip takes the PFD's left side, which FG1000's PFD already keeps clear
 * of the flight instruments, so they stay. OAT moves under TAS, and the inset map from the lower left to the lower
 * right, at the same margin. */
export function reversionaryLayout(tas: Box, oat: Box, inset: Box, width = 1024) {
  return {
    oat: { dx: tas.x - oat.x, dy: tas.y + tas.height + 4 - oat.y },
    inset: { dx: width - 2 * inset.x - inset.width, dy: 0 },
  };
}
