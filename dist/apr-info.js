// WPT - APPROACH INFORMATION: the airport page's APR softkey, as the Pilot's Guide steps through it, and in the same way
// WPT - DEPARTURE INFORMATION (DP) and WPT - ARRIVAL INFORMATION (STAR). FG1000 has no such pages. DOM-free, so the
// tests can run it; the MFD's AirportInfo page draws it.
import { clamp } from "./page.js";
import { procedurePoints, procKind } from "./nav.js";
// The sequence box's role labels. shortcut: our own wording for the missed approach; change it if the trainer differs.
export const ROLE = { IAF: "IAF", IF: "IF", FAF: "FAF", MAP: "MAP", MISSED: "MA" };
// BARO minimums, as WPT - APPROACH INFORMATION, PROC's approach loading and the PFD's TMR/REF set them.
// shortcut: a 16,000 ft ceiling for the minimum altitude, assumed; check it against the Pilot's Guide.
export const MIN_ALT_MAX = 16000;
/** The minimum altitude field with minimums off. */
export const MIN_BLANK = "_____FT";
/** BARO on starts at the field elevation, rounded up to 100 ft; again turns it off. */
export const toggleBaro = (baro, elev) => (baro === null ? Math.ceil(elev / 100) * 100 : null);
/** The minimum altitude steps 10 ft. */
export const stepBaro = (baro, d) => clamp(baro + d * 10, 0, MIN_ALT_MAX);
/** The MINIMUMS box: OFF or BARO, and the altitude. */
export const minView = (baro, cur, altCur) => ({ mode: baro === null ? "OFF" : "BARO", alt: baro === null ? MIN_BLANK : `${baro}FT`, cur, altCur });
// The cursor's stops (Pilot's Guide): as PROC's, with the sequence in place of LOAD?.
const ORDER = {
    APR: ["APT", "APR", "TRANS", "MIN", "MINALT", "SEQ"],
    SID: ["APT", "APR", "RWY", "TRANS", "SEQ"],
    STAR: ["APT", "APR", "TRANS", "RWY", "SEQ"],
};
export class AprInfo {
    entry;
    /** Approaches (APR), departures (DP) or arrivals (STAR). */
    kind = "APR";
    grp = "APT";
    apr = 0;
    trans = 0;
    rwy = 0;
    seq = 0;
    /** BARO minimums, feet; null is off. shortcut: kept on this page; the PFD's minimums are set at TMR/REF. */
    baro = null;
    constructor(entry) {
        this.entry = entry;
    }
    // The list: an airport's approaches by name (some may have no procedure data), its departures or arrivals.
    names(c) {
        if (this.kind === "APR")
            return c.airport?.approaches ?? [];
        return c.procedures.filter((p) => p.airport === c.airport?.id && procKind(p) === this.kind).map((p) => p.name);
    }
    /** Whether the airport has any procedures of this kind (the DP and STAR softkeys are grey without). */
    has(c) {
        return c.procedures.some((p) => p.airport === c.airport?.id && procKind(p) === this.kind);
    }
    proc(c) {
        const name = this.names(c)[this.apr];
        return c.procedures.find((p) => p.airport === c.airport?.id && procKind(p) === this.kind && p.name === name);
    }
    transitions(c) {
        const p = this.proc(c);
        return p ? Object.keys(p.transitions) : [];
    }
    runways(c) {
        return Object.keys(this.proc(c)?.runways ?? {});
    }
    /** The selected procedure from the selected runway or transition on, to preview on the map. */
    preview(c) {
        const p = this.proc(c);
        return p ? procedurePoints(p, this.transitions(c)[this.trans], this.runways(c)[this.rwy]) : [];
    }
    // The large knob's stops, as ENT's: transitions and runways only when the procedure has some, the minimum altitude only with minimums on.
    order(c) {
        return ORDER[this.kind].filter((g) => (g !== "TRANS" || this.transitions(c).length > 0) && (g !== "RWY" || this.runways(c).length > 0) &&
            (g !== "MINALT" || this.baro !== null));
    }
    /** Whether the small knob would spell the airport (keyboard typing goes there). */
    typing() {
        return this.entry.editing || this.grp === "APT";
    }
    fms(c, outer, d) {
        if (this.entry.editing || (this.grp === "APT" && !outer)) {
            if (outer)
                this.entry.outer(d);
            else
                this.entry.inner(d);
            return;
        }
        const o = this.order(c);
        if (outer)
            this.grp = o[clamp(o.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, o.length - 1)];
        else if (this.grp === "APR")
            [this.apr, this.trans, this.rwy, this.seq] = [clamp(this.apr + d, 0, Math.max(0, this.names(c).length - 1)), 0, 0, 0];
        else if (this.grp === "TRANS")
            [this.trans, this.seq] = [clamp(this.trans + d, 0, Math.max(0, this.transitions(c).length - 1)), 0];
        else if (this.grp === "RWY")
            [this.rwy, this.seq] = [clamp(this.rwy + d, 0, Math.max(0, this.runways(c).length - 1)), 0];
        else if (this.grp === "MIN")
            this.baro = toggleBaro(this.baro, c.airport?.elev ?? 0);
        else if (this.grp === "MINALT" && this.baro !== null)
            this.baro = stepBaro(this.baro, d);
        else if (this.grp === "SEQ")
            this.seq = clamp(this.seq + d, 0, Math.max(0, this.preview(c).length - 1));
    }
    /** ENT moves on to the next box; returns an airport identifier just spelled, for the page to show. */
    ent(c) {
        if (this.entry.editing) {
            const v = this.entry.ent();
            if (v)
                [this.grp, this.apr, this.trans, this.rwy, this.seq] = ["APR", 0, 0, 0, 0];
            return v;
        }
        const o = this.order(c);
        this.grp = o[o.indexOf(this.grp) + 1] ?? "SEQ";
        return null;
    }
    clr() {
        this.entry.cancel();
    }
    /** What the page draws; `crsr` is the FMS cursor being on. */
    view(c, crsr) {
        const on = (g) => crsr && this.grp === g;
        const has = (name) => c.procedures.some((p) => p.airport === c.airport?.id && procKind(p) === this.kind && p.name === name);
        return {
            kind: this.kind,
            apt: this.entry.editing ? this.entry.value : c.airport?.id ?? "____",
            aptCur: on("APT") || this.entry.editing,
            approaches: this.names(c).map((label, i) => ({ label, dim: !has(label), cur: on("APR") && i === this.apr })),
            transitions: this.transitions(c).map((label, i) => ({ label, cur: on("TRANS") && i === this.trans, sel: i === this.trans })),
            runways: this.runways(c).map((label, i) => ({ label, cur: on("RWY") && i === this.rwy, sel: i === this.rwy })),
            min: minView(this.baro, on("MIN"), on("MINALT")),
            sequence: this.preview(c).map((p, i) => ({ label: p.id, role: ROLE[p.role ?? ""] ?? "", cur: on("SEQ") && i === this.seq })),
        };
    }
}
