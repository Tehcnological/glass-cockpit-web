// Glass MFD for the browser: the FG1000 MFD's surround, engine strip (Nasal/EIS/EIS.nas) and navigation map page
// (Nasal/MFDPages/NavigationMap), Copyright 2018 Stuart Buchanan, ported to TypeScript. GPL-2.0-or-later.
//
// FlightGear draws the map with its own Canvas map layers and navigation database. Here the map draws only the points
// it is given, with the symbols and styles of the FG1000 layers (Nasal/canvas/map/*.symbol.nas,
// NavigationMapStyles.nas) and the ownship icon from FG1000/Icons/APSmodel.svg.
import NAV_MAP from "./svg/nav-map.js";
import EIS from "./svg/eis.js";
import SURROUND from "./svg/surround-mfd.js";
import { buildDisplay, type DisplayOptions } from "./display.js";
import { Page, deg3 } from "./page.js";
import { drawMap, mapGroup, rangeLabel, stepRange, type Airspace, type MapPoint } from "./map.js";
import { RADIOS, Surround } from "./surround.js";
import type { CdiSource } from "./glass-pfd.js";
import { adjust, bezelInput, type Input, type Knobs } from "./bezel.js";

export interface Engine {
  rpm: number;
  /** Gallons per hour. */ fuelFlow: number;
  /** PSI. */ oilPressure: number;
  /** Degrees F. */ oilTemp: number;
  /** Exhaust gas temperature, 0 to 1 of the scale. */ egt: number;
  /** Inches of mercury. */ vacuum: number;
  /** Gallons. */ fuelLeft: number;
  /** Gallons. */ fuelRight: number;
  volts: number;
  engineHours: number;
}


/** The knob values (`Knobs`) are not drawn on the MFD; its knobs change them, so a host can share them with a PFD. */
export interface MfdState extends Knobs {
  /** Ground track, degrees. */ track: number;
  /** Knots. */ groundspeed: number;
  /** Desired track, degrees; null shows dashes. */ dtk: number | null;
  /** Time to the next waypoint, seconds; null shows dashes. */ ete: number | null;
  /** Aircraft position, decimal degrees. */ lat: number;
  lon: number;
  /** Map range, nm from the aircraft to the edge of the map's short side. */ range: number;
  orientation: "NORTH UP" | "HDG UP";
  points: MapPoint[];
  airspaces: Airspace[];
  /** Flight plan as point ids, in order. */ route: string[];
  /** Index into `route` of the active waypoint; the leg into it is magenta. */ activeLeg: number;
  engine: Engine;
  /** Which NAV shows green as the CDI source. */ cdiSource: CdiSource;
  /** Twelve softkey labels, left to right. */ softkeys: string[];
}

const DEFAULTS: MfdState = {
  heading: 0, headingBug: 0, course: 0, baro: 29.92, alt: 0, selectedAlt: null, track: 0, groundspeed: 0, dtk: null, ete: null, lat: 0, lon: 0, range: 10, orientation: "NORTH UP",
  points: [], airspaces: [], route: [], activeLeg: 1,
  engine: { rpm: 0, fuelFlow: 0, oilPressure: 0, oilTemp: 0, egt: 0, vacuum: 0, fuelLeft: 0, fuelRight: 0, volts: 0, engineHours: 0 },
  radios: RADIOS, cdiSource: "NAV1",
  // NavigationMap.topMenu
  softkeys: ["ENGINE", "", "MAP", "", "", "", "", "", "DCLTR", "", "CHKLIST", ""],
};

// EIS.new: pointer name, min, max, travel in px (PFD.PointerElement).
const POINTERS: [string, keyof Engine, number, number][] = [
  ["FuelFlowPointer", "fuelFlow", 0, 20], ["OilPressurePointer", "oilPressure", 0, 115], ["OilTempPointer", "oilTemp", 0, 245],
  ["EGTPointer", "egt", 0, 1], ["EGTCylinder", "egt", 0, 1], ["VacPointer", "vacuum", 3, 7],
  ["LeftFuelPointer", "fuelLeft", 0, 30], ["RightFuelPointer", "fuelRight", 0, 30],
];


export interface MfdOptions extends DisplayOptions {
  /** Called when a bezel input changes the state (range, radios, and the shared knob values). */
  onChange?: (patch: Partial<MfdState>) => void;
}

// Constants.nas: header 56 px, footer 25 px, engine strip 150 px wide; the map's range is 689/2 px (NavMap.nas).
const MAP = { x: 150, y: 56, w: 874, h: 687, cx: 587, cy: 399.5, px: 344.5 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class GlassMfd {
  readonly svg: SVGSVGElement;
  private state: MfdState = { ...DEFAULTS };
  private eis: Page;
  private nav: Page;
  private surround: Surround;
  private map: SVGGElement;

  /** The container must be visible: layout is measured once here. */
  constructor(container: HTMLElement, private options: MfdOptions = {}) {
    const { svg, screen } = buildDisplay(container, [NAV_MAP, SURROUND, EIS], "Multi-function display", options);
    this.svg = svg;
    this.eis = new Page(screen, "EIS");
    this.nav = new Page(screen, "NavigationMap");
    this.surround = new Surround(screen);
    this.surround.setPageTitle("MAP - NAVIGATION MAP");

    // The map sits above its black background and below the range/orientation legend.
    this.map = mapGroup(screen, this.nav.el("Legend")!, MAP);
    if (options.bezel) bezelInput(svg, (i) => this.input(i));
    this.set({});
  }

  private input(i: Input) {
    this.options.onInput?.(i);
    if (i.control === "NAV_TOGGLE" || i.control === "COM_TOGGLE") {
      this.surround.toggle(i.control === "NAV_TOGGLE" ? "nav" : "com");
      return this.set({});
    }
    let patch: Partial<MfdState> | null = adjust(i, this.state, this.surround.sel);
    // NavMap.handleRange: clockwise zooms out.
    if (i.control === "RANGE") {
      patch = { range: stepRange(this.state.range, i.value) };
    }
    if (!patch) return;
    this.set(patch);
    this.options.onChange?.(patch);
  }

  /** Merge new values into the state and redraw. */
  set(patch: Partial<MfdState>): void {
    const s = (this.state = { ...this.state, ...patch });
    this.surround.setRadios(s.radios, s.cdiSource === "NAV1" ? 1 : s.cdiSource === "NAV2" ? 2 : null);
    this.surround.setSoftkeys(s.softkeys);
    this.updateHeader(s);
    this.updateEIS(s.engine);
    this.nav.text("RangeDisplay", rangeLabel(s.range));
    this.nav.text("OrientationDisplay", s.orientation);
    drawMap(this.map, s, MAP);
  }

  // Surround.updateHeaderData, MFD half: the default fields GS, DTK, TRK, ETE.
  private updateHeader(s: MfdState) {
    const fields: [string, string][] = [
      ["GS", `${Math.round(s.groundspeed)}kts`],
      ["DTK", s.dtk === null ? "---°" : deg3(s.dtk)],
      ["TRK", deg3(s.track)],
      ["ETE", s.ete === null ? "--:--" : ete(s.ete)],
    ];
    fields.forEach(([label, value], i) => {
      this.surround.p.text(`Header${i + 1}Label`, label);
      this.surround.p.text(`Header${i + 1}Value`, value);
    });
  }

  // EIS.updateData
  private updateEIS(e: Engine) {
    this.eis.text("RPMDisplay", String(Math.round(e.rpm)));
    this.eis.text("MBusVolts", e.volts.toFixed(1));
    this.eis.text("EBusVolts", e.volts.toFixed(1)); // FG1000 shows the main bus on both
    this.eis.text("EngineHours", e.engineHours.toFixed(1));
    for (const [name, key, min, max] of POINTERS) this.eis.tf(name, { tx: ((clamp(e[key], min, max) - min) / (max - min)) * 135 });
    // PFD.RotatingElement: 0-3000 RPM over 260°, about the needle's hub (its Inkscape transform center).
    this.eis.tf("RPMPointer", { rot: (clamp(e.rpm, 0, 3000) / 3000) * 260 });
  }

}

// ETE as Surround.updateHeaderData formats it: m:ss under an hour, h:mm over.
function ete(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return s < 3600 ? `${Math.floor(s / 60)}:${p2(s % 60)}` : `${Math.floor(s / 3600)}:${p2(Math.floor(s / 60) % 60)}`;
}
