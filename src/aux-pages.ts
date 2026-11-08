// AUX - SYSTEM SETUP and AUX - UTILITY, as the Pilot's Guide describes them. FG1000 has neither page. DOM-free, so the
// tests can run it; the MFD's pages draw it.
import { clamp, deg3, mod } from "./page.js";
import { bearingDistance, routePoint, type Airport } from "./nav.js";
import type { MfdState } from "./glass-mfd.js";

export const TIME_FORMATS = ["LOCAL 12hr", "LOCAL 24hr", "UTC"] as const;
export const SURFACES = ["ANY", "HARD ONLY", "HARD/SOFT", "WATER"] as const;
/** The MFD data bar fields this package can work out (the Pilot's Guide lists more: ESA, MSA, TAS, VSR, XTK, FOD). */
export const DATA_FIELDS = ["BRG", "DIS", "DTK", "END", "ETA", "ETE", "FOB", "GS", "TKE", "TRK"] as const;
export type DataField = (typeof DATA_FIELDS)[number];

/** The System Setup settings this package carries out. */
export interface Setup {
  timeFormat: (typeof TIME_FORMATS)[number];
  /** Local time offset from UTC, minutes. */ offset: number;
  /** The MFD data bar's four fields, left to right. */ dataBar: DataField[];
  /** Page Navigation: the first FMS click both shows the page group tabs and moves. */ firstClick: boolean;
  /** Page Navigation: seconds the page group tabs stay up, 2 to 10. */ timeout: number;
  /** Nearest Airports: the runway surface an airport needs. */ surface: (typeof SURFACES)[number];
  /** Nearest Airports: the runway length an airport needs, feet. */ minLength: number;
}

/** Pilot's Guide defaults; FG1000's data bar (GS, DTK, TRK, ETE) and page tab timeout (3 s). `offset`: the browser's. */
export const setupDefaults = (offset = -new Date().getTimezoneOffset()): Setup => ({
  timeFormat: "LOCAL 12hr", offset, dataBar: ["GS", "DTK", "TRK", "ETE"], firstClick: false, timeout: 3, surface: "HARD/SOFT", minLength: 0,
});

const p2 = (n: number) => String(n).padStart(2, "0");
export const hms = (sec: number) => `${p2(Math.floor(sec / 3600))}:${p2(Math.floor(sec / 60) % 60)}:${p2(Math.floor(sec) % 60)}`;

/** A time of day in the System Setup format. */
export function clockText(ms: number, s: Pick<Setup, "timeFormat" | "offset">, seconds = true): string {
  const d = new Date(ms + (s.timeFormat === "UTC" ? 0 : s.offset * 60_000));
  const [h, m, sec] = [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  const t = (hh: number) => `${p2(hh)}:${p2(m)}${seconds ? `:${p2(sec)}` : ""}`;
  if (s.timeFormat === "UTC") return `${t(h)}UTC`;
  if (s.timeFormat === "LOCAL 24hr") return t(h);
  return `${t(h % 12 || 12)}${h < 12 ? "am" : "pm"}`;
}

// ETE as Surround.updateHeaderData formats it: m:ss under an hour, h:mm over.
export function ete(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return s < 3600 ? `${Math.floor(s / 60)}:${p2(s % 60)}` : `${Math.floor(s / 3600)}:${p2(Math.floor(s / 60) % 60)}`;
}

// Runway surfaces by NASR code. shortcut: by prefix; codes we don't know count as soft.
const surfaceOf = (code: string) => (/WATER/i.test(code) ? "WATER" : /^(ASPH|CONC|PEM|BIT)/i.test(code) ? "HARD" : "SOFT");

/** Whether an airport meets System Setup's Nearest Airports criteria. One without runway data is kept: it cannot be judged. */
export function airportMatches(a: Airport, s: Pick<Setup, "surface" | "minLength">): boolean {
  if (!a.runways.length) return true;
  return a.runways.some((r) => {
    const k = surfaceOf(r.surface);
    const ok = s.surface === "ANY" || (s.surface === "HARD ONLY" ? k === "HARD" : s.surface === "WATER" ? k === "WATER" : k !== "WATER");
    return ok && r.length >= s.minLength;
  });
}

export type DataBarState = Pick<MfdState, "groundspeed" | "dtk" | "track" | "ete" | "lat" | "lon" | "magVar" | "route" | "activeLeg" | "points" | "airports"> & {
  engine: Pick<MfdState["engine"], "fuelLeft" | "fuelRight" | "fuelFlow">;
};

/** A data bar field's value; BRG and DIS are to the active waypoint, FOB and END from the fuel gauges. */
export function dataBar(f: DataField, s: DataBarState, now: number, setup: Setup): string {
  // Only BRG and DIS look up the active waypoint.
  const toActive = () => {
    const to = routePoint(s.route[s.activeLeg] ?? "", s.points, s.airports);
    return to && bearingDistance(s.lat, s.lon, to.lat, to.lon);
  };
  const fob = s.engine.fuelLeft + s.engine.fuelRight;
  switch (f) {
    case "GS": return `${Math.round(s.groundspeed)}kts`;
    case "DTK": return s.dtk === null ? "---°" : deg3(s.dtk);
    case "TRK": return deg3(s.track);
    case "ETE": return s.ete === null ? "--:--" : ete(s.ete);
    case "ETA": return s.ete === null ? "--:--" : clockText(now + s.ete * 1000, setup, false);
    case "BRG": { const bd = toActive(); return bd ? deg3(bd.brg - s.magVar) : "___°"; }
    case "DIS": { const bd = toActive(); return bd ? `${bd.dist.toFixed(1)}nm` : "___nm"; }
    case "TKE": return s.dtk === null ? "___°" : `${Math.round(Math.abs(mod(s.track - s.dtk + 180, 360) - 180))}°`;
    case "FOB": return `${Math.round(fob)}gl`;
    case "END": return s.engine.fuelFlow > 0 ? hms((fob / s.engine.fuelFlow) * 3600).slice(0, 5) : "--:--";
  }
}

/** System Setup's fields the cursor stops on, by box, in order. */
export const SETUP_FIELDS: { box: string; label: string }[] = [
  { box: "DATE / TIME", label: "FORMAT" }, { box: "DATE / TIME", label: "OFFSET" },
  ...[1, 2, 3, 4].map((i) => ({ box: "MFD DATA BAR FIELDS", label: `FIELD ${i}` })),
  { box: "PAGE NAVIGATION", label: "CHANGE ON 1ST CLICK" }, { box: "PAGE NAVIGATION", label: "TIMEOUT SECONDS" },
  { box: "NEAREST AIRPORT", label: "RUNWAY SURFACE" }, { box: "NEAREST AIRPORT", label: "MINIMUM LENGTH" },
];

const step = <T>(list: readonly T[], v: T, d: number) => list[clamp(list.indexOf(v) + d, 0, list.length - 1)];

/** The small FMS knob on field `i`. shortcut: numbers step (30 min, 1 s, 100 ft) rather than being typed digit by digit. */
export function stepSetup(s: Setup, i: number, d: number) {
  const l = SETUP_FIELDS[i]?.label ?? "";
  if (l === "FORMAT") s.timeFormat = step(TIME_FORMATS, s.timeFormat, d);
  else if (l === "OFFSET") s.offset = clamp(s.offset + d * 30, -14 * 60, 14 * 60);
  else if (l.startsWith("FIELD")) s.dataBar[Number(l.slice(6)) - 1] = step(DATA_FIELDS, s.dataBar[Number(l.slice(6)) - 1], d);
  else if (l === "CHANGE ON 1ST CLICK") s.firstClick = d > 0;
  else if (l === "TIMEOUT SECONDS") s.timeout = clamp(s.timeout + d, 2, 10);
  else if (l === "RUNWAY SURFACE") s.surface = step(SURFACES, s.surface, d);
  else if (l === "MINIMUM LENGTH") s.minLength = clamp(s.minLength + d * 100, 0, 99_999);
}

export function setupValue(s: Setup, i: number): string {
  const l = SETUP_FIELDS[i]?.label ?? "";
  if (l === "FORMAT") return s.timeFormat;
  if (l === "OFFSET") return `${s.offset < 0 ? "-" : "+"}${p2(Math.floor(Math.abs(s.offset) / 60))}:${p2(Math.abs(s.offset) % 60)}`;
  if (l.startsWith("FIELD")) return s.dataBar[Number(l.slice(6)) - 1];
  if (l === "CHANGE ON 1ST CLICK") return s.firstClick ? "ON" : "OFF";
  if (l === "TIMEOUT SECONDS") return String(s.timeout);
  if (l === "RUNWAY SURFACE") return s.surface;
  if (l === "MINIMUM LENGTH") return `${s.minLength}FT`;
  return "";
}

type Criterion = "PWR-ON" | "IN-AIR";
export const UTILITY_FIELDS = ["dir", "time", "action", "flight", "departure"] as const;
export type UtilityField = (typeof UTILITY_FIELDS)[number];
/** Groundspeed taken as lifted off, knots. shortcut: the MFD has no air/ground switch; use one if a host provides it. */
const LIFT_OFF = 30;

/** AUX - UTILITY's timers and trip statistics. Times are epoch ms from the caller, so the tests set the clock. */
export class Utility {
  up = true;
  /** The countdown's starting time, s. */ initial = 0;
  private base = 0;
  private since = 0;
  running = false;
  private stopped = false;
  flightFrom: Criterion = "PWR-ON";
  depFrom: Criterion = "PWR-ON";
  private airborne: number | null = null;
  private flightReset = 0;
  private depReset = 0;
  /** Nautical miles. */ odom = 0;
  /** Nautical miles. */ trip = 0;
  /** Distance and time at or over lift-off groundspeed, for TRIP AVG GS (taxiing left out). */
  private airNm = 0;
  private airHours = 0;
  /** Knots. */ maxGs = 0;
  private last: number | null = null;

  constructor(private power: number) {}

  /** The generic timer, s: up from its time, or down to zero and then up. */
  timer(now: number) {
    const run = this.running ? (now - this.since) / 1000 : 0;
    return Math.floor(this.up ? this.base + run : Math.abs(this.base - run));
  }

  private counting(now: number) {
    const run = this.running ? (now - this.since) / 1000 : 0;
    return this.up || this.base - run <= 0 ? "up" : "down";
  }

  label() {
    return this.running ? "STOP?" : this.stopped ? "RESET?" : "START?";
  }

  /** ENT on the timer's START?, STOP? or RESET?. RESET returns a countdown not yet at zero to its time, otherwise zero. */
  action(now: number) {
    if (this.running) {
      const down = this.counting(now) === "down";
      [this.base, this.up, this.running, this.stopped] = [this.timer(now), !down, false, true];
    } else if (this.stopped) {
      [this.base, this.stopped] = [this.up ? 0 : this.initial, false];
    } else [this.running, this.since] = [true, now];
  }

  /** The small FMS knob on a Utility field. */
  field(f: UtilityField, d: number, now: number) {
    const flip = (c: Criterion): Criterion => (c === "PWR-ON" ? "IN-AIR" : "PWR-ON");
    if (f === "dir") [this.base, this.since, this.up] = [this.timer(now), now, !this.up];
    else if (f === "time" && !this.running) this.initial = this.base = Math.max(0, this.base + d * 60);
    else if (f === "flight") this.flightFrom = flip(this.flightFrom);
    else if (f === "departure") this.depFrom = flip(this.depFrom);
  }

  private start(c: Criterion, reset: number) {
    const from = c === "PWR-ON" ? this.power : this.airborne;
    return from === null ? null : Math.max(from, reset);
  }

  /** Time in flight, s, from power on or lift off (null before it) or the last reset. */
  flight(now: number) {
    const t = this.start(this.flightFrom, this.flightReset);
    return t === null ? null : Math.floor((now - t) / 1000);
  }

  /** The departure time, epoch ms, or null before lift off. */
  departure(_now: number) {
    return this.start(this.depFrom, this.depReset);
  }

  avgGs() {
    return this.airHours > 0 ? Math.round(this.airNm / this.airHours) : 0;
  }

  /** Takes a groundspeed sample. shortcut: a gap of over a minute between samples is not flown. */
  tick(gs: number, now: number) {
    if (gs >= LIFT_OFF && this.airborne === null) this.airborne = now;
    const h = this.last === null ? 0 : (now - this.last) / 3_600_000;
    if (h > 0 && h <= 1 / 60) {
      this.odom += gs * h;
      this.trip += gs * h;
      if (gs >= LIFT_OFF) [this.airNm, this.airHours] = [this.airNm + gs * h, this.airHours + h];
    }
    this.maxGs = Math.max(this.maxGs, gs);
    this.last = now;
  }

  /** PAGE MENU's resets. */
  reset(what: "flight" | "departure" | "trip" | "odom" | "max" | "all", now: number) {
    if (what === "flight" || what === "all") this.flightReset = now;
    if (what === "departure" || what === "all") this.depReset = now;
    if (what === "trip" || what === "all") [this.trip, this.airNm, this.airHours] = [0, 0, 0];
    if (what === "odom" || what === "all") this.odom = 0;
    if (what === "max" || what === "all") this.maxGs = 0;
  }
}
