// The GFC 700 automatic flight control system (flight director and autopilot), the most capable autopilot option for the
// 172S's G1000. FG1000 has none: its header leaves the AFCS fields blank. Behavior from the Pilot's Guide's AFCS section;
// the code is this port's own. DOM-free: the host owns one, feeds it the aircraft's state and the AFCS keys (on the MFD's
// bezel), draws `display` on the PFD and flies the aircraft toward `fd` while `ap` is true.
import type { PfdState } from "./glass-pfd.js";
import { clamp, mod } from "./page.js";
import { isLocalizer } from "./radio.js";

/** The AFCS keys on the MFD's bezel, as bezel Controls. */
export const AFCS_KEYS = ["AP", "FD", "HDG", "ALT", "NAV", "VNV", "APR", "BC", "VS", "FLC", "NOSE_UP", "NOSE_DN"] as const;
export type AfcsKey = (typeof AFCS_KEYS)[number];
/** The control wheel's AP DISC switch and the panel's GA switch. CWS is held: see `cws`. */
export type AfcsSwitch = "AP_DISC" | "GA";

export type Lateral = "ROL" | "HDG" | "GPS" | "VOR" | "LOC" | "VAPP" | "BC" | "GA" | "TO";
export type Vertical = "PIT" | "ALT" | "ALTS" | "ALTV" | "VS" | "FLC" | "VPTH" | "GS" | "GP" | "GA" | "TO";

export type AfcsInput = Pick<
  PfdState,
  "pitch" | "roll" | "heading" | "ias" | "alt" | "vsi" | "headingBug" | "course" | "selectedAlt" | "cdiSource" | "cdiDots" |
  "cdiValid" | "gs" | "gpsMode" | "radios" | "failed"
> & {
  /**
   * The host's vertical profile (VNV), null without one: feet above the descent path (null until the path is valid,
   * from a minute before top of descent), the active VNV target altitude, and the vertical speed required, fpm.
   */
  vnv?: { dev: number | null; target: number; vsr: number } | null;
  /** On the ground the GA switch selects takeoff mode. */ onGround?: boolean;
  /**
   * AFCS failures the host flags (Pilot's Guide, AFCS status alerts): `roll` (ROLL), `pitch` (PTCH) and `system` (SYS)
   * disconnect the autopilot and keep it off, the flight director staying; `pft` fails the preflight test (PFT in red),
   * which keeps both off.
   */
  faults?: Partial<Record<"roll" | "pitch" | "system" | "pft", boolean>>;
};

export interface AfcsField { text: string; color: "white" | "green" | "yellow" | "red"; flash: boolean }
/** What the PFD draws: the AFCS status box in its header, and the airspeed reference box above the airspeed tape. */
export interface AfcsDisplay {
  lateralArmed: AfcsField; lateralActive: AfcsField; status: AfcsField;
  verticalActive: AfcsField; verticalReference: AfcsField; verticalArmed: AfcsField;
  /** FLC's airspeed reference, knots, with its bug; null hides them. */ airspeedRef: number | null;
  /** Overspeed: MAXSPD flashes yellow in the airspeed reference box. */ maxspd: boolean;
  /** The AFCS status alert above the airspeed tape: PFT (white while the preflight test runs, red if it failed), or
   * ROLL, PTCH or SYS in red; blank otherwise. */ alert: AfcsField;
}
export interface AfcsOutput {
  /** Command bars, degrees; null when the flight director is off. */ fd: { pitch: number; roll: number } | null;
  /** The servos are flying: the host moves the aircraft toward `fd`. False while CWS is held. */ ap: boolean;
  display: AfcsDisplay;
}

export interface AfcsOptions {
  /** Highest autopilot airspeed, knots: above it MAXSPD shows and the flight director pitches up. Set the aircraft's. */
  maxSpeed?: number;
  /** The preflight test, seconds (default `PFT_S`; 0 skips it): it starts at the first `update` with valid attitude, so
   * after the AHRS aligns. */
  pft?: number;
  /** Called once when the preflight test passes, where the real unit sounds the autopilot disconnect tone. */
  onPreflightPass?: () => void;
}

/** How long the preflight test runs, seconds. Assumed: the Pilot's Guide gives no time, only that it runs at power-up. */
export const PFT_S = 5;

// Pilot's Guide limits and steps.
const PITCH = [-15, 20] as const;
const ROLL = 22;
const VS = [-2000, 1500] as const;
const FLC = [80, 200] as const;
const GA_PITCH = 7;
const FLASH = 10000; // ms: an automatic transition, or a lost mode in yellow
const AP_FLASH = 5000; // ms: a manual disconnect
// Approach annunciations that make GPS APR an approach, and the ones with a glidepath.
const GPS_APPROACH = new Set(["LNAV", "LNAV+V", "L/VNAV", "LPV", "LP", "LP+V"]);
const GLIDEPATH = new Set(["LNAV+V", "L/VNAV", "LPV", "LP+V"]);
const NAV_MODES = new Set<Lateral>(["GPS", "VOR", "LOC", "VAPP", "BC"]);
const ALT_CAPTURE_ARMS = new Set<Vertical>(["PIT", "VS", "FLC", "GA", "TO", "VPTH"]);
const AIR_DATA_MODES = new Set<Vertical>(["ALT", "ALTS", "ALTV", "VS", "FLC", "VPTH"]);
const OVERSPEED_MODES = new Set<Vertical>(["PIT", "VS", "FLC", "VPTH", "ALTS", "ALTV"]);

const wrap = (deg: number) => mod(deg + 180, 360) - 180;
/** Roll Hold's reference: wings level under 6°, the bank held to 22°. */
const rollHold = (roll: number) => (Math.abs(roll) < 6 ? 0 : clamp(roll, -ROLL, ROLL));
/** Bank for a standard rate turn at this airspeed (the GFC 700 banks no steeper). */
const standardRate = (kt: number) => (Math.atan((kt * 0.5144 * Math.PI) / 60 / 9.81) * 180) / Math.PI;

const START: AfcsInput = {
  pitch: 0, roll: 0, heading: 0, ias: 0, alt: 0, vsi: 0, headingBug: 0, course: 0, selectedAlt: null, cdiSource: "OFF",
  cdiDots: 0, cdiValid: false, gs: null, gpsMode: "ENR", radios: undefined as unknown as AfcsInput["radios"], failed: {},
};

interface Flash { until: number; color: AfcsField["color"] }

export class Afcs {
  private ap = false;
  private fdOn = false;
  private held = false; // CWS
  private lat: Lateral = "ROL";
  private latArmed: Lateral | null = null;
  private navKey: "NAV" | "APR" | "BC" | null = null;
  private navSrc = { source: "OFF", freq: 0 };
  private vert: Vertical = "PIT";
  private vnvSel = false; // VNV pressed: VPTH armed, or active as `vert`
  private ack = false; // descent acknowledged
  private apprV: "GS" | "GP" | null = null;
  private ref = { pitch: 0, roll: 0, alt: 0, vs: 0, spd: 0, capVs: 0 };
  private hdgErr = 0;
  private flash: { lat?: Flash; vert?: Flash; ap?: Flash } = {};
  private s: AfcsInput = START;
  private now = 0;
  /** When the preflight test ends, ms: null until attitude is valid, 0 once it has passed. */
  private pftEnd: number | null;

  constructor(private options: AfcsOptions = {}) {
    this.pftEnd = (options.pft ?? PFT_S) > 0 ? null : 0;
  }

  /** An AFCS key on the bezel, or a switch on the yoke or panel. Acts on the state the last `update` was given. */
  press(key: AfcsKey | AfcsSwitch): void {
    const s = this.s;
    if (this.testing) return; // the autopilot and flight director cannot engage until the preflight test passes
    if (key === "AP_DISC") return this.ap ? this.disconnect(false) : void delete this.flash.ap; // also acknowledges
    if (key === "AP") {
      if (this.ap) return this.disconnect(false);
      if (s.failed.attitude || this.servoFault) return;
      this.ap = true;
      delete this.flash.ap;
      if (!this.fdOn) this.activate();
      return;
    }
    if (key === "FD") {
      if (this.ap) return; // disabled while the autopilot is engaged
      return this.fdOn ? this.off() : this.activate();
    }
    if (key === "GA") {
      if (this.ap) this.disconnect(false);
      this.fdOn = true;
      this.lat = this.vert = s.onGround ? "TO" : "GA";
      this.latArmed = this.navKey = this.apprV = null;
      this.vnvSel = false;
      delete this.flash.lat, delete this.flash.vert;
      return;
    }
    if (s.failed.attitude) return;
    switch (key) {
      case "NOSE_UP":
      case "NOSE_DN": return this.nose(key === "NOSE_UP" ? 1 : -1);
      case "HDG": return this.lateral(() => (this.lat === "HDG" ? this.rol() : this.setHdg()));
      case "NAV":
      case "APR":
      case "BC": return this.navigate(key);
      case "ALT": return this.vertical(() => (this.vert === "ALT" ? this.pit() : this.setVert("ALT")));
      case "VS": return this.vertical(() => (this.vert === "VS" ? this.pit() : this.setVert("VS")));
      case "FLC": return this.vertical(() => (this.vert === "FLC" ? this.pit() : this.setVert("FLC")));
      case "VNV": return this.vnvKey();
    }
  }

  /** The control wheel steering button, held down (true) and released. */
  cws(down: boolean): void {
    if (this.testing) return;
    if (down && !this.fdOn && !this.ap) this.activate();
    this.held = down;
    if (!down) this.sync();
  }

  /** Steps the AFCS to `now` (ms) with the aircraft's state and returns what to draw and fly. */
  update(s: AfcsInput, now: number): AfcsOutput {
    const prev = this.s;
    this.s = s;
    this.now = now;
    if (this.pftEnd === null && !s.failed.attitude) this.pftEnd = now + (this.options.pft ?? PFT_S) * 1000;
    if (this.pftEnd && now >= this.pftEnd && !s.faults?.pft) {
      this.pftEnd = 0;
      this.options.onPreflightPass?.();
    }
    if (this.ap && this.servoFault) this.disconnect(true);
    if (this.testing && this.fdOn) this.off();
    if (s.failed.attitude) {
      // Invalid attitude: the flight director cannot compute its modes; the autopilot disconnects with a red AP.
      if (this.ap) this.disconnect(true);
      if (this.fdOn) this.off();
    }
    // Heading Select turns the way the bug was turned, even past 180°; past 340° it reverses.
    if (this.lat === "HDG" && prev !== START) {
      this.hdgErr += wrap(s.headingBug - prev.headingBug) - wrap(s.heading - prev.heading);
      if (Math.abs(this.hdgErr) > 340) this.hdgErr -= 360 * Math.sign(this.hdgErr);
      if (Math.abs(this.hdgErr) < 170) this.hdgErr = wrap(s.headingBug - s.heading);
    }
    if (this.fdOn) {
      if (this.held) this.sync();
      this.lateralTransitions();
      this.verticalTransitions(prev);
    }
    return { fd: this.command(), ap: this.ap && !this.held, display: this.draw() };
  }

  /** The preflight test is running, or has failed. */
  private get testing() {
    return this.pftEnd !== 0 || !!this.s.faults?.pft;
  }

  /** A ROLL, PTCH or SYS failure: no autopilot. */
  private get servoFault() {
    const f = this.s.faults;
    return !!(f?.roll || f?.pitch || f?.system);
  }

  // Key handling.

  /** Flight director on in its default modes, Roll Hold and Pitch Hold. */
  private activate() {
    this.fdOn = true;
    this.rol(false);
    this.pit();
    this.latArmed = this.navKey = this.apprV = null;
    this.vnvSel = false;
  }

  private off() {
    this.fdOn = false;
    this.latArmed = this.navKey = this.apprV = null;
    this.vnvSel = false;
    delete this.flash.lat, delete this.flash.vert;
  }

  private disconnect(automatic: boolean) {
    this.ap = false;
    // Manual: yellow AP for 5 s. Automatic: red AP until AP DISC is pushed.
    this.flash.ap = { until: automatic ? Infinity : this.now + AP_FLASH, color: automatic ? "red" : "yellow" };
  }

  /** A key for one axis: turns the flight director on first, and stops that axis's flashing. */
  private lateral(f: () => void) {
    if (!this.fdOn) this.activate();
    delete this.flash.lat;
    f();
  }
  private vertical(f: () => void) {
    if (!this.fdOn) this.activate();
    delete this.flash.vert;
    if (this.lat === "GA" || this.lat === "TO") this.rol(false); // GA and TO are coupled
    // Another pitch mode over VPTH: VPTH goes back to armed, and a new descent needs acknowledging.
    if (this.vert === "VPTH") this.ack = false;
    f();
  }

  /** Roll Hold, holding the bank (or wings level after a reversion). */
  private rol(level = false) {
    this.lat = "ROL";
    this.ref.roll = level ? 0 : rollHold(this.s.roll);
    if (!this.latArmed) this.navKey = null; // an armed mode keeps its key, which cancels it
  }

  private pit() {
    this.vert = "PIT";
    this.ref.pitch = clamp(this.s.pitch, ...PITCH);
  }

  private setHdg() {
    this.lat = "HDG";
    if (!this.latArmed) this.navKey = null; // NAV pressed after HDG selects it again
    this.hdgErr = wrap(this.s.headingBug - this.s.heading);
  }

  private setVert(v: "ALT" | "VS" | "FLC") {
    const s = this.s;
    if (s.failed.airspeed || s.failed.altitude) return;
    this.vert = v;
    if (v === "ALT") this.ref.alt = Math.round(s.alt / 10) * 10;
    if (v === "VS") this.ref.vs = clamp(Math.round(s.vsi / 100) * 100, ...VS);
    if (v === "FLC") this.ref.spd = clamp(Math.round(s.ias), ...FLC);
  }

  private nose(d: 1 | -1) {
    if (!this.fdOn) return;
    if (this.vert === "GA" || this.vert === "TO") {
      // Changing the attitude in Go Around reverts to Pitch and Roll Hold.
      this.rol(false);
      this.pit();
    }
    if (this.vert === "PIT") this.ref.pitch = clamp(this.ref.pitch + d * 0.5, ...PITCH);
    if (this.vert === "VS") this.ref.vs = clamp(this.ref.vs + d * 100, ...VS);
    if (this.vert === "FLC") this.ref.spd = clamp(this.ref.spd - d, ...FLC); // nose up flies slower
  }

  /** What the selected source gives NAV and APR: GPS, VOR or LOC; null with nothing to fly. */
  private navKind(): "GPS" | "VOR" | "LOC" | null {
    const s = this.s;
    if (!s.cdiValid || s.cdiSource === "OFF") return null;
    if (s.cdiSource === "GPS") return "GPS";
    return isLocalizer(this.freq()) ? "LOC" : "VOR";
  }

  private freq() {
    const s = this.s;
    return s.cdiSource === "NAV1" ? s.radios?.nav1.active ?? 0 : s.cdiSource === "NAV2" ? s.radios?.nav2.active ?? 0 : 0;
  }

  private navigate(key: "NAV" | "APR" | "BC") {
    const s = this.s;
    if (this.navKey === key && this.fdOn) {
      // Pressed again: the mode is cancelled; an active one reverts to Roll Hold.
      delete this.flash.lat;
      if (NAV_MODES.has(this.lat)) this.rol(false);
      this.latArmed = this.navKey = null;
      if (key === "APR") {
        this.apprV = null;
        if (this.vert === "GS" || this.vert === "GP") this.pit();
      }
      return;
    }
    const kind = this.navKind();
    let mode: Lateral | null = null;
    let v: "GS" | "GP" | null = null;
    if (key === "NAV") mode = kind;
    if (key === "BC") mode = kind === "LOC" ? "BC" : null;
    if (key === "APR") {
      // shortcut: GPS APR flies a GPS approach; arming LOC from GPS with an ILS loaded is left to the host's CDI switch.
      if (kind === "GPS" && GPS_APPROACH.has(s.gpsMode)) [mode, v] = ["GPS", GLIDEPATH.has(s.gpsMode) ? "GP" : null];
      if (kind === "VOR") mode = "VAPP";
      if (kind === "LOC") [mode, v] = ["LOC", "GS"];
    }
    if (!mode) return; // the flight director does not come on without a valid source
    this.lateral(() => {
      this.navKey = key;
      this.navSrc = { source: s.cdiSource, freq: this.freq() };
      this.apprV = v;
      if (Math.abs(s.cdiDots) < 1 && this.inside(mode!)) [this.lat, this.latArmed] = [mode!, null];
      else this.latArmed = mode;
    });
  }

  private vnvKey() {
    const s = this.s;
    if (!s.vnv || s.cdiSource !== "GPS") return; // VNV needs a vertical profile on GPS
    if (!this.fdOn) this.activate();
    delete this.flash.vert;
    const pending = this.vnvSel && this.vert !== "VPTH" && s.vnv.dev !== null && !this.ack;
    if (pending) return void (this.ack = true); // acknowledges the descent
    if (this.vnvSel) {
      this.vnvSel = false;
      if (this.vert === "VPTH") this.pit();
      return;
    }
    this.vnvSel = true;
    this.ack = s.vnv.dev !== null;
  }

  /** CWS: the references follow the aircraft while it is hand flown, and are kept on release. */
  private sync() {
    const s = this.s;
    if (this.vert === "GA" || this.vert === "TO") this.pit(), this.rol(false);
    if (this.lat === "ROL") this.ref.roll = this.held ? clamp(s.roll, -ROLL, ROLL) : rollHold(s.roll);
    if (this.vert === "PIT") this.ref.pitch = clamp(s.pitch, ...PITCH);
    if (this.vert === "ALT") this.ref.alt = Math.round(s.alt / 10) * 10;
    if (this.vert === "VS") this.ref.vs = clamp(Math.round(s.vsi / 100) * 100, ...VS);
    if (this.vert === "FLC") this.ref.spd = clamp(Math.round(s.ias), ...FLC);
  }

  // Automatic transitions.

  /** LOC and BC capture only within 105° of the course. */
  private inside(mode: Lateral) {
    const s = this.s;
    if (mode === "LOC") return Math.abs(wrap(s.heading - s.course)) <= 105;
    if (mode === "BC") return Math.abs(wrap(s.heading - s.course - 180)) <= 105;
    return true;
  }

  private lateralTransitions() {
    const s = this.s;
    const navOn = NAV_MODES.has(this.lat);
    if (!navOn && !this.latArmed) return;
    if (s.cdiSource !== this.navSrc.source) {
      // The navigation source switched: an active mode reverts to Roll Hold, wings level, and armed ones are cancelled.
      // shortcut: the CDI's own GPS to LOC switch on an ILS is taken as a manual one; tell them apart if hosts switch it.
      if (navOn) this.rol(true);
      this.latArmed = this.navKey = null;
      this.apprV = null;
      if (this.vert === "GS" || this.vert === "GP") this.pit();
      return;
    }
    if ((this.lat === "VOR" || this.lat === "VAPP") && this.freq() !== this.navSrc.freq) {
      // A different VOR tuned: back to Roll Hold, the mode armed again.
      this.navSrc.freq = this.freq();
      this.latArmed = this.lat;
      this.rol(true);
      return;
    }
    if (navOn && !s.cdiValid) {
      // Lost navigation data: wings level in Roll Hold, flashing yellow.
      this.rol(true);
      this.flash.lat = { until: this.now + FLASH, color: "yellow" };
      if (this.vert === "GS" || this.vert === "GP") this.lostVertical();
      this.apprV = null;
      return;
    }
    if (this.latArmed && s.cdiValid && Math.abs(s.cdiDots) < 1 && this.inside(this.latArmed)) {
      [this.lat, this.latArmed] = [this.latArmed, null];
      this.flash.lat = { until: this.now + FLASH, color: "green" };
    }
  }

  private lostVertical() {
    this.pit();
    this.flash.vert = { until: this.now + FLASH, color: "yellow" };
  }

  /** The altitude capture armed now, if any: ALTV when the VNV target comes before the selected altitude. */
  private capture(): "ALTS" | "ALTV" | null {
    const s = this.s;
    if (!ALT_CAPTURE_ARMS.has(this.vert) || s.selectedAlt === null) return null;
    return this.vnvSel && s.vnv && s.vnv.target > s.selectedAlt ? "ALTV" : "ALTS";
  }

  private verticalTransitions(prev: AfcsInput) {
    const s = this.s;
    const now = this.now;
    const green = () => (this.flash.vert = { until: now + FLASH, color: "green" });
    if ((s.failed.airspeed || s.failed.altitude) && AIR_DATA_MODES.has(this.vert)) {
      if (this.vert === "VPTH") this.ack = false;
      return this.lostVertical();
    }
    if ((this.vert === "GS" || this.vert === "GP") && s.gs === null) return this.lostVertical();
    const selChanged = s.selectedAlt !== prev.selectedAlt && prev !== START;
    // VNV.
    if (this.vnvSel && !s.vnv) {
      // The profile ended or was cancelled. Capturing its last target, the flight director levels off there in ALT.
      this.vnvSel = false;
      if (this.vert === "VPTH") this.lostVertical();
      if (this.vert === "ALTV") this.vert = "ALT";
    }
    if (this.vnvSel && s.vnv) {
      if (this.vert === "VPTH" && s.vnv.dev === null) {
        this.ack = false;
        return this.lostVertical(); // VPTH armed again
      }
      if (this.vert !== "VPTH" && selChanged && s.vnv.dev !== null) this.ack = true; // a new selected altitude acknowledges
      const descending = s.selectedAlt === null || s.selectedAlt <= s.alt - 75;
      const level = this.vert === "ALT" || ALT_CAPTURE_ARMS.has(this.vert);
      if (this.vert !== "VPTH" && level && this.ack && s.vnv.dev !== null && s.vnv.dev >= 0 && descending) {
        // shortcut: a non-path descent (VS or FLC from VPTH) recaptures only after VNV is pressed again, not after
        // the Pilot's Guide's 10 s and 250 ft rule.
        this.vert = "VPTH";
        delete this.flash.vert;
        green();
        return;
      }
    }
    // Approach vertical modes.
    const lateralOk = (this.apprV === "GS" && this.lat === "LOC") || (this.apprV === "GP" && this.lat === "GPS");
    // Near center, or across it since the last update.
    const crossed = s.gs !== null && prev.gs != null && Math.sign(s.gs) !== Math.sign(prev.gs);
    if (this.apprV && lateralOk && s.gs !== null && (Math.abs(s.gs) <= 0.1 || crossed)) {
      this.vert = this.apprV;
      this.apprV = null;
      this.vnvSel = false;
      green();
      return;
    }
    // Altitude capture.
    if ((this.vert === "ALTS" && selChanged) || (this.vert === "ALTV" && s.vnv?.target !== this.ref.alt)) {
      // A new selected altitude (or VNV target) during capture: Pitch Hold, capture armed for the new one.
      this.pit();
      return;
    }
    if (this.vert === "ALTS" || this.vert === "ALTV") {
      if (Math.abs(s.alt - this.ref.alt) < 50) {
        if (this.vert === "ALTV") this.ack = false; // the next descent leg needs acknowledging; VPTH stays armed
        this.vert = "ALT";
        green();
      }
      return;
    }
    const cap = this.capture();
    if (!cap) return;
    const target = cap === "ALTV" ? s.vnv!.target : s.selectedAlt!;
    const err = target - s.alt;
    const toward = Math.sign(err) === Math.sign(s.vsi) || Math.abs(err) < 50;
    if (toward && Math.abs(err) <= Math.max(50, Math.abs(s.vsi) * 0.2)) {
      this.vert = cap;
      this.ref.alt = target;
      this.ref.capVs = Math.max(Math.abs(s.vsi), 200);
      green();
    }
  }

  // Flight director commands.

  private command(): AfcsOutput["fd"] {
    const s = this.s;
    if (!this.fdOn) return null;
    if (this.held) return { pitch: s.pitch, roll: s.roll }; // synchronized while hand flown
    const lim = (n: number) => Math.min(n, standardRate(s.ias || 1));
    let roll = 0;
    const course = (heading: number, track: number) => clamp(wrap(heading - s.heading), -track, track);
    switch (this.lat) {
      case "ROL": roll = this.ref.roll; break;
      case "HDG": roll = clamp(this.hdgErr, -lim(ROLL), lim(ROLL)); break;
      case "GPS":
      case "VOR":
      case "LOC":
      case "VAPP":
      case "BC": {
        // Intercept at up to 45° toward the course, then track it; VOR and LOC bank less once established.
        const dots = this.lat === "BC" ? -s.cdiDots : s.cdiDots;
        const want = s.course + (this.lat === "BC" ? 180 : 0) + clamp(dots * 25, -45, 45);
        const max = this.lat !== "GPS" && Math.abs(s.cdiDots) < 0.5 ? 10 : ROLL;
        roll = course(want, lim(max));
        break;
      }
    }
    const vs = (target: number) => s.pitch + clamp((target - s.vsi) / 150, -3, 3);
    let pitch = s.pitch;
    switch (this.vert) {
      case "PIT": pitch = this.ref.pitch; break;
      case "GA":
      case "TO": pitch = GA_PITCH; break;
      case "ALT": pitch = vs(clamp((this.ref.alt - s.alt) * 4, -700, 700)); break;
      case "ALTS":
      case "ALTV": pitch = vs(clamp((this.ref.alt - s.alt) * 5, -this.ref.capVs, this.ref.capVs)); break;
      case "VS": pitch = vs(this.ref.vs); break;
      case "FLC": {
        pitch = s.pitch + clamp((s.ias - this.ref.spd) / 4, -3, 3); // fast: pitch up
        // Never climbs or descends away from the selected altitude.
        const dir = s.selectedAlt === null ? 0 : Math.sign(s.selectedAlt - s.alt);
        if (dir > 0) pitch = Math.max(pitch, vs(0));
        if (dir < 0) pitch = Math.min(pitch, vs(0));
        break;
      }
      case "VPTH": {
        const v = s.vnv;
        // Back to the path at up to 500 fpm more or less, never climbing.
        if (v && v.dev !== null) pitch = vs(Math.min(0, v.vsr - clamp(v.dev * 3, -500, 500)));
        break;
      }
      case "GS":
      case "GP": pitch = vs(-s.ias * 5.3 + (s.gs ?? 0) * 600); break; // a 3° descent, corrected toward the needle
    }
    if (this.overspeed()) pitch = Math.max(pitch, s.pitch + clamp((s.ias - this.maxSpeed) / 4, 0, 3));
    return { pitch: clamp(pitch, ...PITCH), roll: clamp(roll, -ROLL, ROLL) };
  }

  private get maxSpeed() {
    return this.options.maxSpeed ?? 140;
  }

  private overspeed() {
    return this.fdOn && OVERSPEED_MODES.has(this.vert) && this.s.ias > this.maxSpeed;
  }

  // The PFD's AFCS status box.

  private draw(): AfcsDisplay {
    const now = this.now;
    const blank: AfcsField = { text: "", color: "white", flash: false };
    const field = (text: string, color: AfcsField["color"], f?: Flash): AfcsField =>
      f && f.until > now ? { text, color: f.color, flash: true } : { text, color, flash: false };
    const ap = this.flash.ap && this.flash.ap.until > now ? this.flash.ap : undefined;
    const f = this.s.faults;
    const alert = field(f?.system ? "SYS" : f?.pitch ? "PTCH" : f?.roll ? "ROLL" : this.pftEnd || f?.pft ? "PFT" : "", // nothing until it starts
      f?.system || f?.pitch || f?.roll || f?.pft ? "red" : "white");
    const status = this.ap ? field(this.held ? "CWS" : "AP", this.held ? "white" : "green") : ap ? field("AP", ap.color, ap) : blank;
    if (!this.fdOn) {
      return { lateralArmed: blank, lateralActive: blank, status, verticalActive: blank, verticalReference: blank, verticalArmed: blank, airspeedRef: null, maxspd: false, alert };
    }
    const r = this.ref;
    const reference = this.vert === "ALT" || this.vert === "ALTS" || this.vert === "ALTV" ? `${r.alt}FT`
      : this.vert === "VS" ? `${r.vs}FPM` : this.vert === "FLC" ? `${r.spd}KT` : "";
    const vpthArmed = this.vnvSel && this.vert !== "VPTH" && this.vert !== "ALTV"; // armed again at the level-off
    const armed = [
      this.vert === "ALTS" || this.vert === "ALTV" ? "ALT" : this.capture(),
      vpthArmed ? (this.apprV ? "/V" : "VPTH") : null,
      this.apprV,
    ].filter(Boolean).join(" ");
    // VPTH flashes while a descent waits to be acknowledged.
    const pending = vpthArmed && !this.ack && !!this.s.vnv && this.s.vnv.dev !== null && this.s.vnv.dev < 0;
    return {
      lateralArmed: field(this.latArmed ?? "", "white"),
      lateralActive: field(this.lat, "green", this.flash.lat),
      status,
      verticalActive: field(this.vert, "green", this.flash.vert),
      verticalReference: field(reference, "green"),
      verticalArmed: { text: armed, color: "white", flash: pending },
      airspeedRef: this.vert === "FLC" ? r.spd : null,
      maxspd: this.overspeed(),
      alert,
    };
  }
}
