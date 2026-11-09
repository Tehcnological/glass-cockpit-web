import { clamp, mod } from "./page.js";
import { isLocalizer } from "./radio.js";
/** The AFCS keys on the MFD's bezel, as bezel Controls. */
export const AFCS_KEYS = ["AP", "FD", "HDG", "ALT", "NAV", "VNV", "APR", "BC", "VS", "FLC", "NOSE_UP", "NOSE_DN"];
// Pilot's Guide limits and steps.
const PITCH = [-15, 20];
const ROLL = 22;
const VS = [-2000, 1500];
const FLC = [80, 200];
const GA_PITCH = 7;
const FLASH = 10000; // ms: an automatic transition, or a lost mode in yellow
const AP_FLASH = 5000; // ms: a manual disconnect
// Approach annunciations that make GPS APR an approach, and the ones with a glidepath.
const GPS_APPROACH = new Set(["LNAV", "LNAV+V", "L/VNAV", "LPV", "LP", "LP+V"]);
const GLIDEPATH = new Set(["LNAV+V", "L/VNAV", "LPV", "LP+V"]);
const NAV_MODES = new Set(["GPS", "VOR", "LOC", "VAPP", "BC"]);
const ALT_CAPTURE_ARMS = new Set(["PIT", "VS", "FLC", "GA", "TO", "VPTH"]);
const AIR_DATA_MODES = new Set(["ALT", "ALTS", "ALTV", "VS", "FLC", "VPTH"]);
const OVERSPEED_MODES = new Set(["PIT", "VS", "FLC", "VPTH", "ALTS", "ALTV"]);
const wrap = (deg) => mod(deg + 180, 360) - 180;
/** Roll Hold's reference: wings level under 6°, the bank held to 22°. */
const rollHold = (roll) => (Math.abs(roll) < 6 ? 0 : clamp(roll, -ROLL, ROLL));
/** Bank for a standard rate turn at this airspeed (the GFC 700 banks no steeper). */
const standardRate = (kt) => (Math.atan((kt * 0.5144 * Math.PI) / 60 / 9.81) * 180) / Math.PI;
const START = {
    pitch: 0, roll: 0, heading: 0, ias: 0, alt: 0, vsi: 0, headingBug: 0, course: 0, selectedAlt: null, cdiSource: "OFF",
    cdiDots: 0, cdiValid: false, gs: null, gpsMode: "ENR", radios: undefined, failed: {},
};
export class Afcs {
    options;
    ap = false;
    fdOn = false;
    held = false; // CWS
    lat = "ROL";
    latArmed = null;
    navKey = null;
    navSrc = { source: "OFF", freq: 0 };
    vert = "PIT";
    vnvSel = false; // VNV pressed: VPTH armed, or active as `vert`
    ack = false; // descent acknowledged
    apprV = null;
    fromAltv = false;
    ref = { pitch: 0, roll: 0, alt: 0, vs: 0, spd: 0, capVs: 0 };
    hdgErr = 0;
    flash = {};
    s = START;
    now = 0;
    constructor(options = {}) {
        this.options = options;
    }
    /** An AFCS key on the bezel, or a switch on the yoke or panel. Acts on the state the last `update` was given. */
    press(key) {
        const s = this.s;
        if (key === "AP_DISC")
            return this.ap ? this.disconnect(false) : void delete this.flash.ap; // also acknowledges
        if (key === "AP") {
            if (this.ap)
                return this.disconnect(false);
            if (s.failed.attitude)
                return;
            this.ap = true;
            delete this.flash.ap;
            if (!this.fdOn)
                this.activate();
            return;
        }
        if (key === "FD") {
            if (this.ap)
                return; // disabled while the autopilot is engaged
            return this.fdOn ? this.off() : this.activate();
        }
        if (key === "GA") {
            if (this.ap)
                this.disconnect(false);
            this.fdOn = true;
            this.lat = this.vert = s.onGround ? "TO" : "GA";
            this.latArmed = this.navKey = this.apprV = null;
            this.vnvSel = false;
            delete this.flash.lat, delete this.flash.vert;
            return;
        }
        if (s.failed.attitude)
            return;
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
    cws(down) {
        if (down && !this.fdOn && !this.ap)
            this.activate();
        this.held = down;
        if (!down)
            this.sync();
    }
    /** Steps the AFCS to `now` (ms) with the aircraft's state and returns what to draw and fly. */
    update(s, now) {
        const prev = this.s;
        this.s = s;
        this.now = now;
        if (s.failed.attitude) {
            // Invalid attitude: the flight director cannot compute its modes; the autopilot disconnects with a red AP.
            if (this.ap)
                this.disconnect(true);
            if (this.fdOn)
                this.off();
        }
        // Heading Select turns the way the bug was turned, even past 180°; past 340° it reverses.
        if (this.lat === "HDG" && prev !== START) {
            this.hdgErr += wrap(s.headingBug - prev.headingBug) - wrap(s.heading - prev.heading);
            if (Math.abs(this.hdgErr) > 340)
                this.hdgErr -= 360 * Math.sign(this.hdgErr);
            if (Math.abs(this.hdgErr) < 170)
                this.hdgErr = wrap(s.headingBug - s.heading);
        }
        if (this.fdOn) {
            if (this.held)
                this.sync();
            this.lateralTransitions();
            this.verticalTransitions(prev);
        }
        return { fd: this.command(), ap: this.ap && !this.held, display: this.draw() };
    }
    // Key handling.
    /** Flight director on in its default modes, Roll Hold and Pitch Hold. */
    activate() {
        this.fdOn = true;
        this.rol(false);
        this.pit();
        this.latArmed = this.navKey = this.apprV = null;
        this.vnvSel = false;
    }
    off() {
        this.fdOn = false;
        this.latArmed = this.navKey = this.apprV = null;
        this.vnvSel = false;
        delete this.flash.lat, delete this.flash.vert;
    }
    disconnect(automatic) {
        this.ap = false;
        // Manual: yellow AP for 5 s. Automatic: red AP until AP DISC is pushed.
        this.flash.ap = { until: automatic ? Infinity : this.now + AP_FLASH, color: automatic ? "red" : "yellow" };
    }
    /** A key for one axis: turns the flight director on first, and stops that axis's flashing. */
    lateral(f) {
        if (!this.fdOn)
            this.activate();
        delete this.flash.lat;
        f();
    }
    vertical(f) {
        if (!this.fdOn)
            this.activate();
        delete this.flash.vert;
        if (this.lat === "GA" || this.lat === "TO")
            this.rol(false); // GA and TO are coupled
        // Another pitch mode over VPTH: VPTH goes back to armed, and a new descent needs acknowledging.
        if (this.vert === "VPTH")
            this.ack = false;
        f();
    }
    /** Roll Hold, holding the bank (or wings level after a reversion). */
    rol(level = false) {
        this.lat = "ROL";
        this.ref.roll = level ? 0 : rollHold(this.s.roll);
        if (!this.latArmed)
            this.navKey = null; // an armed mode keeps its key, which cancels it
    }
    pit() {
        this.vert = "PIT";
        this.ref.pitch = clamp(this.s.pitch, ...PITCH);
    }
    setHdg() {
        this.lat = "HDG";
        this.hdgErr = wrap(this.s.headingBug - this.s.heading);
    }
    setVert(v) {
        const s = this.s;
        if (s.failed.airspeed || s.failed.altitude)
            return;
        this.vert = v;
        if (v === "ALT")
            this.ref.alt = Math.round(s.alt / 10) * 10;
        if (v === "VS")
            this.ref.vs = clamp(Math.round(s.vsi / 100) * 100, ...VS);
        if (v === "FLC")
            this.ref.spd = clamp(Math.round(s.ias), ...FLC);
    }
    nose(d) {
        if (!this.fdOn)
            return;
        if (this.vert === "GA" || this.vert === "TO") {
            // Changing the attitude in Go Around reverts to Pitch and Roll Hold.
            this.rol(false);
            this.pit();
        }
        if (this.vert === "PIT")
            this.ref.pitch = clamp(this.ref.pitch + d * 0.5, ...PITCH);
        if (this.vert === "VS")
            this.ref.vs = clamp(this.ref.vs + d * 100, ...VS);
        if (this.vert === "FLC")
            this.ref.spd = clamp(this.ref.spd - d, ...FLC); // nose up flies slower
    }
    /** What the selected source gives NAV and APR: GPS, VOR or LOC; null with nothing to fly. */
    navKind() {
        const s = this.s;
        if (!s.cdiValid || s.cdiSource === "OFF")
            return null;
        if (s.cdiSource === "GPS")
            return "GPS";
        return isLocalizer(this.freq()) ? "LOC" : "VOR";
    }
    freq() {
        const s = this.s;
        return s.cdiSource === "NAV1" ? s.radios?.nav1.active ?? 0 : s.cdiSource === "NAV2" ? s.radios?.nav2.active ?? 0 : 0;
    }
    navigate(key) {
        const s = this.s;
        if (this.navKey === key && this.fdOn) {
            // Pressed again: the mode is cancelled; an active one reverts to Roll Hold.
            delete this.flash.lat;
            if (NAV_MODES.has(this.lat))
                this.rol(false);
            this.latArmed = this.navKey = null;
            if (key === "APR") {
                this.apprV = null;
                if (this.vert === "GS" || this.vert === "GP")
                    this.pit();
            }
            return;
        }
        const kind = this.navKind();
        let mode = null;
        let v = null;
        if (key === "NAV")
            mode = kind;
        if (key === "BC")
            mode = kind === "LOC" ? "BC" : null;
        if (key === "APR") {
            // shortcut: GPS APR flies a GPS approach; arming LOC from GPS with an ILS loaded is left to the host's CDI switch.
            if (kind === "GPS" && GPS_APPROACH.has(s.gpsMode))
                [mode, v] = ["GPS", GLIDEPATH.has(s.gpsMode) ? "GP" : null];
            if (kind === "VOR")
                mode = "VAPP";
            if (kind === "LOC")
                [mode, v] = ["LOC", "GS"];
        }
        if (!mode)
            return; // the flight director does not come on without a valid source
        this.lateral(() => {
            this.navKey = key;
            this.navSrc = { source: s.cdiSource, freq: this.freq() };
            this.apprV = v;
            if (Math.abs(s.cdiDots) < 1 && this.inside(mode))
                [this.lat, this.latArmed] = [mode, null];
            else
                this.latArmed = mode;
        });
    }
    vnvKey() {
        const s = this.s;
        if (!s.vnv || s.cdiSource !== "GPS")
            return; // VNV needs a vertical profile on GPS
        if (!this.fdOn)
            this.activate();
        delete this.flash.vert;
        const pending = this.vnvSel && this.vert !== "VPTH" && s.vnv.dev !== null && !this.ack;
        if (pending)
            return void (this.ack = true); // acknowledges the descent
        if (this.vnvSel) {
            this.vnvSel = false;
            if (this.vert === "VPTH")
                this.pit();
            return;
        }
        this.vnvSel = true;
        this.ack = s.vnv.dev !== null;
    }
    /** CWS: the references follow the aircraft while it is hand flown, and are kept on release. */
    sync() {
        const s = this.s;
        if (this.vert === "GA" || this.vert === "TO")
            this.pit(), this.rol(false);
        if (this.lat === "ROL")
            this.ref.roll = this.held ? clamp(s.roll, -ROLL, ROLL) : rollHold(s.roll);
        if (this.vert === "PIT")
            this.ref.pitch = clamp(s.pitch, ...PITCH);
        if (this.vert === "ALT")
            this.ref.alt = Math.round(s.alt / 10) * 10;
        if (this.vert === "VS")
            this.ref.vs = clamp(Math.round(s.vsi / 100) * 100, ...VS);
        if (this.vert === "FLC")
            this.ref.spd = clamp(Math.round(s.ias), ...FLC);
    }
    // Automatic transitions.
    /** LOC and BC capture only within 105° of the course. */
    inside(mode) {
        const s = this.s;
        if (mode === "LOC")
            return Math.abs(wrap(s.heading - s.course)) <= 105;
        if (mode === "BC")
            return Math.abs(wrap(s.heading - s.course - 180)) <= 105;
        return true;
    }
    lateralTransitions() {
        const s = this.s;
        const navOn = NAV_MODES.has(this.lat);
        if (!navOn && !this.latArmed)
            return;
        if (s.cdiSource !== this.navSrc.source) {
            // The navigation source switched: an active mode reverts to Roll Hold, wings level, and armed ones are cancelled.
            // shortcut: the CDI's own GPS to LOC switch on an ILS is taken as a manual one; tell them apart if hosts switch it.
            if (navOn)
                this.rol(true);
            this.latArmed = this.navKey = null;
            this.apprV = null;
            return;
        }
        if (this.lat === "VOR" && this.freq() !== this.navSrc.freq) {
            // A different VOR tuned: back to Roll Hold, VOR armed again.
            this.navSrc.freq = this.freq();
            this.latArmed = "VOR";
            this.rol(true);
            return;
        }
        if (navOn && !s.cdiValid) {
            // Lost navigation data: wings level in Roll Hold, flashing yellow.
            this.rol(true);
            this.flash.lat = { until: this.now + FLASH, color: "yellow" };
            if (this.vert === "GS" || this.vert === "GP")
                this.lostVertical();
            this.apprV = null;
            return;
        }
        if (this.latArmed && s.cdiValid && Math.abs(s.cdiDots) < 1 && this.inside(this.latArmed)) {
            [this.lat, this.latArmed] = [this.latArmed, null];
            this.flash.lat = { until: this.now + FLASH, color: "green" };
        }
    }
    lostVertical() {
        this.pit();
        this.flash.vert = { until: this.now + FLASH, color: "yellow" };
    }
    /** The altitude capture armed now, if any: ALTV when the VNV target comes before the selected altitude. */
    capture() {
        const s = this.s;
        if (!ALT_CAPTURE_ARMS.has(this.vert) || s.selectedAlt === null)
            return null;
        return this.vnvSel && s.vnv && s.vnv.target > s.selectedAlt ? "ALTV" : "ALTS";
    }
    verticalTransitions(prev) {
        const s = this.s;
        const now = this.now;
        const green = () => (this.flash.vert = { until: now + FLASH, color: "green" });
        if ((s.failed.airspeed || s.failed.altitude) && AIR_DATA_MODES.has(this.vert)) {
            if (this.vert === "VPTH")
                this.ack = false;
            return this.lostVertical();
        }
        if ((this.vert === "GS" || this.vert === "GP") && s.gs === null)
            return this.lostVertical();
        const selChanged = s.selectedAlt !== prev.selectedAlt && prev !== START;
        // VNV.
        if (this.vnvSel && !s.vnv) {
            // The profile ended or was cancelled.
            this.vnvSel = false;
            if (this.vert === "VPTH")
                this.lostVertical();
        }
        if (this.vnvSel && s.vnv) {
            if (this.vert === "VPTH" && s.vnv.dev === null) {
                this.ack = false;
                return this.lostVertical(); // VPTH armed again
            }
            if (this.vert !== "VPTH" && selChanged && s.vnv.dev !== null)
                this.ack = true; // a new selected altitude acknowledges
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
        if (this.apprV && lateralOk && s.gs !== null && Math.abs(s.gs) <= 0.1) {
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
                if (this.vert === "ALTV")
                    this.ack = false; // the next descent leg needs acknowledging; VPTH stays armed
                this.vert = "ALT";
                green();
            }
            return;
        }
        const cap = this.capture();
        if (!cap)
            return;
        const target = cap === "ALTV" ? s.vnv.target : s.selectedAlt;
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
    command() {
        const s = this.s;
        if (!this.fdOn)
            return null;
        if (this.held)
            return { pitch: s.pitch, roll: s.roll }; // synchronized while hand flown
        const lim = (n) => Math.min(n, standardRate(s.ias || 1));
        let roll = 0;
        const course = (heading, track) => clamp(wrap(heading - s.heading), -track, track);
        switch (this.lat) {
            case "ROL":
                roll = this.ref.roll;
                break;
            case "HDG":
                roll = clamp(this.hdgErr, -lim(ROLL), lim(ROLL));
                break;
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
        const vs = (target) => s.pitch + clamp((target - s.vsi) / 150, -3, 3);
        let pitch = s.pitch;
        switch (this.vert) {
            case "PIT":
                pitch = this.ref.pitch;
                break;
            case "GA":
            case "TO":
                pitch = GA_PITCH;
                break;
            case "ALT":
                pitch = vs(clamp((this.ref.alt - s.alt) * 4, -700, 700));
                break;
            case "ALTS":
            case "ALTV":
                pitch = vs(clamp((this.ref.alt - s.alt) * 5, -this.ref.capVs, this.ref.capVs));
                break;
            case "VS":
                pitch = vs(this.ref.vs);
                break;
            case "FLC": {
                pitch = s.pitch + clamp((s.ias - this.ref.spd) / 4, -3, 3); // fast: pitch up
                // Never climbs or descends away from the selected altitude.
                const dir = s.selectedAlt === null ? 0 : Math.sign(s.selectedAlt - s.alt);
                if (dir > 0)
                    pitch = Math.max(pitch, vs(0));
                if (dir < 0)
                    pitch = Math.min(pitch, vs(0));
                break;
            }
            case "VPTH": {
                const v = s.vnv;
                // Back to the path at up to 500 fpm more or less, never climbing.
                if (v && v.dev !== null)
                    pitch = vs(Math.min(0, v.vsr - clamp(v.dev * 3, -500, 500)));
                break;
            }
            case "GS":
            case "GP":
                pitch = vs(-s.ias * 5.3 + (s.gs ?? 0) * 600);
                break; // a 3° descent, corrected toward the needle
        }
        if (this.overspeed())
            pitch = Math.max(pitch, s.pitch + clamp((s.ias - this.maxSpeed) / 4, 0, 3));
        return { pitch: clamp(pitch, ...PITCH), roll: clamp(roll, -ROLL, ROLL) };
    }
    get maxSpeed() {
        return this.options.maxSpeed ?? 140;
    }
    overspeed() {
        return this.fdOn && OVERSPEED_MODES.has(this.vert) && this.s.ias > this.maxSpeed;
    }
    // The PFD's AFCS status box.
    draw() {
        const now = this.now;
        const blank = { text: "", color: "white", flash: false };
        const field = (text, color, f) => f && f.until > now ? { text, color: f.color, flash: true } : { text, color, flash: false };
        const ap = this.flash.ap && this.flash.ap.until > now ? this.flash.ap : undefined;
        const status = this.ap ? field(this.held ? "CWS" : "AP", this.held ? "white" : "green") : ap ? field("AP", ap.color, ap) : blank;
        if (!this.fdOn) {
            return { lateralArmed: blank, lateralActive: blank, status, verticalActive: blank, verticalReference: blank, verticalArmed: blank, airspeedRef: null, maxspd: false };
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
        };
    }
}
