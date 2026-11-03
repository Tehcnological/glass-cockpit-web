// Glass PFD for the browser: a TypeScript port of the display logic in FlightGear's FG1000
// (Aircraft/Instruments-3d/FG1000/Nasal/MFDPages/PFDInstruments/PFDInstruments.nas, Copyright 2018 Stuart Buchanan),
// driving the same SVG. GPL-2.0-or-later, like the original.
//
// FlightGear's Canvas composes an element's transforms as: its SVG transform, then translation/scale, then a
// rotation about a center (bounding box center plus Inkscape's transform-center offset, unless set explicitly).
// tf() rebuilds that as one SVG transform string.
import SVG from "./pfd-svg.js";
const DEFAULTS = {
    pitch: 0, roll: 0, slip: 0, ias: 0, iasTrend: 0, tas: 0, alt: 0, altTrend: 0, selectedAlt: null, vsi: 0,
    baro: 29.92, oat: 15, heading: 0, headingBug: 0, cdiSource: "NAV1", course: 0, cdiDots: 0, from: false,
    cdiValid: true, gpsMode: "ENR", xtk: 0, gs: null, brg1: null, brg2: null, marker: "", fd: null,
};
// Parts of the FG1000 PFD this port does not drive.
const HIDDEN = ["Failures", "GSPD", "PFD-Map", "PFD-Map-bg", "WindData", "PFD-Multilines", "Annunciation", "DME1", "WindData-NODATA", "WindData-NODATA-bg", "WindData-OPTN1", "WindData-OPTN2", "WindData-OPTN3",
    "XPDR-TIME", "SelectedALT-meters", "SelectedSPD-bug", "SelectedSPD-bg", "SelectedSPD-text", "SelectedSPD-symbol"];
// Tape clipping, as "rect(top, right, bottom, left)" in screen coordinates.
const CLIPS = {
    PitchScale: [70, 664, 370, 256],
    SpeedLint1: [252, 226, 318, 204],
    SpeedTape: [115, 239, 455, 156],
    LintAlt: [115, 808, 455, 704],
    AltLint00011: [252, 804, 318, 771],
};
const MAGENTA = "#ff00ff";
const GREEN = "#00ff00";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (a, b) => a - b * Math.floor(a / b); // Nasal math.mod: result has the sign of b
const pad = (s, n, c = " ") => String(s).padStart(n, c);
const deg3 = (d) => pad(Math.round(mod(d, 360)) % 360, 3, "0") + "°";
export class GlassPfd {
    options;
    svg;
    state = { ...DEFAULTS };
    cache = new Map();
    base = new WeakMap();
    constructor(container, options = {}) {
        this.options = options;
        container.innerHTML = SVG;
        this.svg = container.querySelector("svg");
        this.svg.removeAttribute("width");
        this.svg.removeAttribute("height");
        this.svg.setAttribute("viewBox", "0 0 1024 768");
        this.svg.setAttribute("role", "img");
        this.svg.setAttribute("aria-label", "Primary flight display");
        for (const id of HIDDEN)
            this.show(id, false);
        for (const [id, r] of Object.entries(CLIPS))
            this.clip(id, r);
        this.set({});
    }
    /** Merge new values into the state and redraw. */
    set(patch) {
        const s = (this.state = { ...this.state, ...patch });
        this.updateAI(s.pitch, s.roll, s.slip);
        this.updateFD(s);
        this.updateIAS(s.ias, s.iasTrend);
        this.updateVSI(s.vsi);
        this.text("TAS-text", `${Math.round(s.tas)}KT`);
        this.updateALT(s.alt, s.altTrend, s.selectedAlt);
        this.show("SelectedALT", s.selectedAlt !== null);
        this.show("SelectedALT-bug", s.selectedAlt !== null);
        if (s.selectedAlt !== null)
            this.text("SelectedALT-text", String(Math.round(s.selectedAlt)));
        this.text("BARO-text", `${s.baro.toFixed(2)}IN`);
        this.text("OAT-text", Math.abs(s.oat) < 10 ? `${s.oat.toFixed(1)} °C` : `${Math.trunc(s.oat)} °C`);
        this.tf("Rose", { rot: -s.heading });
        this.text("HDG-text", deg3(s.heading));
        this.tf("Heading-bug", { rot: s.headingBug });
        this.text("SelectedHDG-text", deg3(s.headingBug));
        this.setCDISource(s.cdiSource);
        this.text("SelectedCRS-text", deg3(s.course), s.cdiSource === "GPS" ? MAGENTA : GREEN);
        this.updateCDI(s);
        this.show("GS-ILS", s.gs !== null);
        this.show("GS-type", s.gs !== null);
        if (s.gs !== null) {
            this.tf("GS-ILS", { ty: -s.gs * 100 });
            this.text("GS-type", "G");
        }
        this.updateBRG("BRG1", s.brg1, s.heading);
        this.updateBRG("BRG2", s.brg2, s.heading);
        this.show("BRG-circle", !!(s.brg1 || s.brg2));
        this.show("OMI", s.marker !== "");
        this.text("MarkerText", s.marker);
    }
    updateAI(pitch, roll, slip) {
        pitch = clamp(pitch, -80, 80);
        this.tf("Horizon", { ty: pitch * 6.849, rot: -roll, center: [459, 282.8 - 6.849 * pitch] });
        this.tf("bankPointer", { rot: -roll });
        this.tf("SlipSkid", { tx: -20 * slip });
    }
    updateFD({ fd, pitch, roll }) {
        // Command bars disappear beyond -20/+30 pitch or 65 bank.
        const on = !!fd && pitch >= -20 && pitch <= 30 && Math.abs(roll) <= 65;
        this.show("FlightDirector", on);
        if (fd && on)
            this.tf("FlightDirector", { ty: -(fd.pitch - pitch) * 6.849, rot: -(roll - fd.roll), center: [459, 282.8] });
    }
    updateIAS(ias, trend) {
        this.text("Speed110", ias >= 10 ? pad(Math.floor(ias / 10), 2) : "");
        this.tf("SpeedLint1", { ty: (mod(ias, 10) + (ias >= 10 ? 10 : 0)) * 36 });
        this.tf("SpeedTape", { ty: ias * 5.711 });
        trend = clamp(trend, -30, 30);
        this.tf("Airspeed-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
        const bg = this.el("IAS-bg");
        if (bg)
            bg.style.fill = this.options.vne !== undefined && ias > this.options.vne ? "#ff0000" : "#000000";
        for (const v of ["Vx", "Vy", "Vr", "Vglide"]) {
            const spd = this.options.vspeeds?.[v];
            const on = spd !== undefined && Math.abs(spd - ias) < 30;
            this.show(`IAS-${v}`, on);
            if (on)
                this.tf(`IAS-${v}`, { ty: (ias - spd) * 5.711 });
        }
    }
    updateVSI(vsi) {
        this.tf("VSI", { ty: clamp(vsi, -4500, 4500) * -0.03465 });
        this.text("VSIText", String(Math.round(vsi / 10) * 10));
    }
    updateALT(alt, trend, selected) {
        if (alt < 0)
            this.text("Alt11100", "-" + pad(Math.abs(Math.ceil(alt / 100)), 3));
        else if (alt < 100)
            this.text("Alt11100", "");
        else
            this.text("Alt11100", pad(Math.floor(alt / 100), 3));
        this.tf("AltLint00011", { ty: (alt % 100) * 1.24 }); // math.fmod keeps the sign of alt
        if (alt > -1000 && alt < 1000000) {
            const neg = alt < 0;
            const a = Math.abs(alt);
            this.tf("LintAlt", { ty: mod(a, 100) * (neg ? -0.57375 : 0.57375) });
            const central = (neg ? -1 : 1) * Math.trunc(a / 100) * 100;
            this.text("AltBigC", "");
            this.text("AltSmallC", "");
            for (let place = 1; place <= 6; place++) {
                for (const [dir, value] of [["U", central + place * 100], ["D", central - place * 100]]) {
                    const [big, small, offset] = altLabel(value);
                    this.text(`AltBig${dir}${place}`, big);
                    this.text(`AltSmall${dir}${place}`, small);
                    this.tf(`AltSmall${dir}${place}`, { tx: offset });
                }
            }
        }
        trend = clamp(trend, -15, 15);
        this.tf("Altitude-Trend-Indicator", { sy: trend, ty: -284.5 * (trend - 1) });
        if (selected !== null)
            this.tf("SelectedALT-bug", { ty: clamp(alt - selected, -300, 300) * 0.567 });
    }
    setCDISource(source) {
        for (const s of ["GPS", "NAV1", "NAV2"]) {
            for (const part of ["pointer", "CDI", "FROM", "TO"])
                this.show(`${s}-${part}`, source === s);
        }
        this.text("CDI-SRC-text", source, source === "GPS" ? MAGENTA : GREEN);
        this.show("CDI-SRC-text", source !== "OFF");
    }
    updateCDI(s) {
        const src = s.cdiSource;
        if (src === "OFF")
            return;
        if (!s.cdiValid) {
            for (const part of ["CDI", "FROM", "TO", "pointer"])
                this.show(`${src}-${part}`, false);
            this.tf("CDI", { rot: 0 });
            this.show("GPS-CTI-diamond", false);
            this.show("CDI-GPS-XTK-text", false);
            this.text("CDI-GPS-ANN-text", "NO DATA");
            this.show("CDI-GPS-ANN-text", true);
            return;
        }
        this.tf("CDI", { rot: s.course - s.heading });
        this.show("GPS-CTI-diamond", false); // shortcut: GPS course-to-intercept diamond not ported, needs a desired track input
        const xtk = src === "GPS" && Math.abs(s.cdiDots) > 2;
        this.show("CDI-GPS-XTK-text", xtk);
        if (xtk)
            this.text("CDI-GPS-XTK-text", `XTK ${Math.abs(s.xtk).toFixed(2)}NM`);
        this.show("CDI-GPS-ANN-text", src === "GPS");
        if (src === "GPS")
            this.text("CDI-GPS-ANN-text", s.gpsMode);
        this.tf(`${src}-CDI`, { tx: (80 * clamp(s.cdiDots, -2.4, 2.4)) / 2.4 });
        this.show(`${src}-TO`, !s.from);
        this.show(`${src}-FROM`, s.from);
    }
    updateBRG(brg, b, heading) {
        this.show(brg, !!b);
        this.show(`${brg}-pointer`, !!b);
        if (!b)
            return;
        this.text(`${brg}-SRC-text`, b.source);
        this.text(`${brg}-WPID-text`, b.id);
        this.text(`${brg}-DST-text`, b.source === "ADF" || b.distance === undefined ? "" : `${b.distance.toFixed(1)}NM`);
        this.tf(`${brg}-pointer`, { rot: b.bearing - heading });
    }
    // --- SVG helpers -------------------------------------------------------------------------------------------
    el(name) {
        if (!this.cache.has(name))
            this.cache.set(name, this.svg.querySelector(`[id="PFDInstruments${name}"]`));
        return this.cache.get(name);
    }
    show(name, on) {
        const e = this.el(name);
        if (e)
            e.style.display = on ? "" : "none";
    }
    text(name, value, color) {
        const e = this.el(name);
        if (!e)
            return;
        const target = e.querySelector("tspan") ?? e;
        if (target.textContent !== value)
            target.textContent = value;
        if (color)
            target.style.fill = color;
    }
    tf(name, t) {
        const e = this.el(name);
        if (!e)
            return;
        if (!this.base.has(e))
            this.base.set(e, e.getAttribute("transform") ?? "");
        let out = this.base.get(e);
        if (t.tx || t.ty || (t.sy !== undefined && t.sy !== 1) || (t.sx !== undefined && t.sx !== 1)) {
            out += ` translate(${t.tx ?? 0} ${t.ty ?? 0}) scale(${t.sx ?? 1} ${t.sy ?? 1})`;
        }
        if (t.rot) {
            const [cx, cy] = t.center ?? this.center(e);
            out += ` rotate(${t.rot} ${cx} ${cy})`;
        }
        e.setAttribute("transform", out.trim());
    }
    // FlightGear's default rotation center: bounding box center plus Inkscape's offset (Inkscape's y points up).
    centers = new WeakMap();
    center(e) {
        let c = this.centers.get(e);
        if (!c) {
            const b = e.getBBox();
            c = [b.x + b.width / 2 + Number(e.dataset.tcx ?? 0), b.y + b.height / 2 - Number(e.dataset.tcy ?? 0)];
            this.centers.set(e, c);
        }
        return c;
    }
    // Clip an element to a screen rectangle that stays put while the element moves, as FlightGear's clip does.
    clip(name, [top, right, bottom, left]) {
        const e = this.el(name);
        if (!e?.parentNode)
            return;
        const ns = "http://www.w3.org/2000/svg";
        const wrap = document.createElementNS(ns, "g");
        e.parentNode.insertBefore(wrap, e);
        wrap.appendChild(e);
        // Map the screen rectangle (viewBox units) into the wrapper's coordinates: wrapper CTM⁻¹ × root user space CTM.
        const probe = this.svg.appendChild(document.createElementNS(ns, "g"));
        const toUser = wrap.getCTM().inverse().multiply(probe.getCTM());
        probe.remove();
        const id = `pfd-clip-${name}`;
        const cp = document.createElementNS(ns, "clipPath");
        cp.id = id;
        cp.setAttribute("clipPathUnits", "userSpaceOnUse");
        const r = document.createElementNS(ns, "rect");
        r.setAttribute("x", String(left));
        r.setAttribute("y", String(top));
        r.setAttribute("width", String(right - left));
        r.setAttribute("height", String(bottom - top));
        r.setAttribute("transform", `matrix(${toUser.a} ${toUser.b} ${toUser.c} ${toUser.d} ${toUser.e} ${toUser.f})`);
        cp.appendChild(r);
        wrap.appendChild(cp);
        wrap.setAttribute("clip-path", `url(#${id})`);
    }
}
// Altitude tape label for one 100 ft line: [thousands, hundreds, x offset of the hundreds], as FG1000 lays it out.
function altLabel(v) {
    let offset = -30.078;
    let prefix = "";
    if (v < 0) {
        v = -v;
        prefix = "-";
        offset += 15.039;
    }
    if (v === 0)
        return ["", "0", offset];
    if (v % 500 === 0)
        return [prefix + v, "", offset];
    if (v < 1000)
        return ["", prefix + (v % 1000), -30.078];
    if (v < 10000)
        return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 15.039];
    return [prefix + Math.trunc(v / 1000), String(v % 1000), offset + 30.078];
}
