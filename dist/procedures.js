// PROC: the PROCEDURES menu, SELECT APPROACH and NOT APPROVED FOR GPS, as the v13 trainer has them. FG1000 has no
// procedures page. DOM-free, so the MFD page and the PFD window share it and the tests can run it.
import { clamp } from "./page.js";
import { approachPatch, approachPoints, gpsApproved, loadedApproach, nearest, routePoint, vtfPatch } from "./nav.js";
import { minView, ROLE, stepBaro, toggleBaro } from "./apr-info.js";
export const PROC_MENU = ["ACTIVATE VECTOR-TO-FINAL", "ACTIVATE APPROACH", "ACTIVATE MISSED APPROACH", "SELECT APPROACH", "SELECT ARRIVAL", "SELECT DEPARTURE"];
const SELECT_APPROACH = 3;
export class ProcFlow {
    h;
    entry;
    airport = null;
    view = "menu";
    item = SELECT_APPROACH;
    yes = true;
    /** The activation NOT APPROVED FOR GPS asks about, and the view NO goes back to. */
    pending = null;
    grp = "APR";
    apr = 0;
    trans = 0;
    /** BARO minimums, feet; null is off. Loading the approach sets the PFD's (Pilot's Guide). */
    baro = null;
    constructor(h, entry = noSpeller) {
        this.h = h;
        this.entry = entry;
    }
    /** Opens on the PROCEDURES menu. SELECT APPROACH opens on the destination: the last airport in the flight plan, else the nearest. */
    open() {
        const s = this.h.s();
        const apts = s.route.map((r) => routePoint(r, s.points, s.airports)).filter((p) => p?.type === "APT");
        this.airport = apts[apts.length - 1]?.id ?? nearest(s.airports, s.lat, s.lon, 0, 1)[0]?.item.id ?? null;
        [this.view, this.item, this.grp, this.apr, this.trans, this.pending, this.baro] = ["menu", SELECT_APPROACH, "APR", 0, 0, null, s.minimums ?? null];
        this.entry.cancel();
    }
    /** LD APR (Nearest Airports): SELECT APPROACH on `name` at `airport`, at its transitions (LOAD? with only one).
     * False when there is no procedure data for it. */
    loadApproach(airport, name) {
        const i = this.h.s().procedures.filter((p) => p.airport === airport).findIndex((p) => p.name === name);
        if (i < 0)
            return false;
        [this.airport, this.view, this.apr, this.trans, this.pending, this.baro] = [airport, "select", i, 0, null, this.h.s().minimums ?? null];
        this.entry.cancel();
        this.grp = this.transitions().length > 1 ? "TRANS" : "MIN";
        return true;
    }
    procs() {
        return this.h.s().procedures.filter((p) => p.airport === this.airport);
    }
    transitions() {
        const p = this.procs()[this.apr];
        return p ? Object.keys(p.transitions) : [];
    }
    loaded() {
        return loadedApproach(this.h.s().route);
    }
    /** The ACTIVATE items need a loaded approach, ACTIVATE MISSED APPROACH one with missed approach legs; SELECT ARRIVAL
     * and SELECT DEPARTURE are not ported. */
    enabled(i) {
        const a = this.loaded();
        if (i === 2)
            return !!a?.pts.some((p) => typeof p !== "string" && p.role === "MISSED");
        return i === SELECT_APPROACH || (i < SELECT_APPROACH && a !== null);
    }
    // v13 trainer: activating an approach the GPS may not fly asks NOT APPROVED FOR GPS first, YES selected.
    confirm(name, act) {
        if (gpsApproved(name))
            return act();
        this.pending = { act, from: this.view === "menu" ? "menu" : "select" };
        [this.view, this.yes] = ["ask", true];
    }
    /** Whether the small knob would spell the airport (keyboard typing goes there). */
    typing() {
        return this.view === "select" && (this.entry.editing || this.grp === "APT");
    }
    fms(outer, d) {
        if (this.view === "menu") {
            for (let i = this.item + d; i >= 0 && i < PROC_MENU.length; i += d) {
                if (this.enabled(i)) {
                    this.item = i;
                    break;
                }
            }
            return;
        }
        if (this.view === "ask") {
            this.yes = !this.yes;
            return;
        }
        // The large knob's stops, as ENT's: the transition only when there is a choice, the minimum altitude only with minimums on.
        const order = ["APT", "APR", "TRANS", "MIN", "MINALT", "LOAD", "ACTIVATE"].filter((g) => (g !== "TRANS" || this.transitions().length > 1) && (g !== "MINALT" || this.baro !== null));
        if (this.entry.editing) {
            if (outer)
                this.entry.outer(d);
            else
                this.entry.inner(d);
        }
        else if (outer)
            this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, order.length - 1)];
        else if (this.grp === "APT")
            this.entry.inner(d);
        else if (this.grp === "APR")
            [this.apr, this.trans] = [clamp(this.apr + d, 0, Math.max(0, this.procs().length - 1)), 0];
        else if (this.grp === "TRANS")
            this.trans = clamp(this.trans + d, 0, Math.max(0, this.transitions().length - 1));
        else if (this.grp === "MIN")
            this.baro = toggleBaro(this.baro, this.h.s().airports.find((a) => a.id === this.airport)?.elev ?? 0);
        else if (this.grp === "MINALT" && this.baro !== null)
            this.baro = stepBaro(this.baro, d);
        else
            this.grp = d > 0 ? "ACTIVATE" : "LOAD";
    }
    ent() {
        if (this.view === "menu")
            return this.menuItem();
        if (this.view === "ask") {
            const pending = this.pending;
            this.view = pending?.from ?? "select";
            this.pending = null;
            if (this.yes)
                pending?.act();
            return;
        }
        const p = this.procs()[this.apr];
        if (this.entry.editing) {
            const v = this.entry.ent();
            if (v)
                [this.airport, this.apr, this.trans, this.grp] = [v, 0, 0, "APR"];
        }
        else if (this.grp === "APT")
            this.grp = "APR";
        else if (this.grp === "APR")
            this.grp = this.transitions().length > 1 ? "TRANS" : "MIN";
        else if (this.grp === "TRANS")
            this.grp = "MIN";
        else if (this.grp === "MIN")
            this.grp = this.baro === null ? "LOAD" : "MINALT";
        else if (this.grp === "MINALT")
            this.grp = "LOAD";
        else if (this.grp === "ACTIVATE" && p)
            this.confirm(p.name, () => this.load(true));
        else
            this.load(this.grp === "ACTIVATE");
    }
    clr() {
        if (this.view === "ask")
            [this.view, this.pending] = [this.pending?.from ?? "select", null]; // as NO
        else if (this.entry.editing)
            this.entry.cancel();
        else if (this.view === "select")
            this.view = "menu";
        else
            this.h.close();
    }
    // ACTIVATE VECTOR-TO-FINAL, ACTIVATE APPROACH and ACTIVATE MISSED APPROACH act on the approach already loaded.
    menuItem() {
        if (this.item === SELECT_APPROACH) {
            this.view = "select";
            return;
        }
        const a = this.loaded();
        if (!a || !this.enabled(this.item))
            return;
        const item = this.item;
        if (item === 2)
            this.activate(item);
        else
            this.confirm(a.name, () => this.activate(item));
    }
    // Worked out from the state when it is carried out, after NOT APPROVED FOR GPS: the host may have changed the route.
    activate(item) {
        const a = this.loaded();
        if (!a || !this.enabled(item))
            return;
        const s = this.h.s();
        const here = { lat: s.lat, lon: s.lon };
        if (item === 0)
            this.h.change(vtfPatch(a.start, a.pts, here));
        else if (item === 1)
            this.h.change({ activeLeg: a.start, directFrom: here, vtf: false });
        else
            this.h.change({ activeLeg: a.start + a.pts.findIndex((p) => typeof p !== "string" && p.role === "MISSED"), directFrom: null, vtf: false });
        this.h.close();
    }
    // Adds the approach after the en route waypoints (replacing an approach loaded before), as the G1000 does. ACTIVATE
    // with the VECTORS transition is vector-to-final: the final approach fix is active, its leg on the final course.
    // shortcut: the missed approach legs follow the missed approach point with no suspend.
    load(activate) {
        const p = this.procs()[this.apr];
        if (!p)
            return;
        const s = this.h.s();
        const name = this.transitions()[this.trans];
        const pts = approachPoints(p, name);
        const patch = approachPatch(s.route, pts, !activate ? "load" : name === "VECTORS" ? "vectors" : "activate", { lat: s.lat, lon: s.lon });
        this.h.change({ ...patch, minimums: this.baro }); // the page opened on the PFD's minimums: OFF here turns them off
        this.h.close();
    }
    /** What the approach loading page draws (as WPT - APPROACH INFORMATION's boxes); `crsr` is the FMS cursor being on.
     * `points`: the approach from the selected transition on, to preview on the map. */
    loading(crsr) {
        const on = (g) => crsr && this.view === "select" && this.grp === g;
        const procs = this.procs();
        const p = procs[this.apr];
        const points = p ? approachPoints(p, this.transitions()[this.trans]) : [];
        return {
            apt: this.entry.editing ? this.entry.value : this.airport ?? "____",
            aptCur: on("APT") || this.entry.editing,
            approaches: procs.length ? procs.map((x, i) => ({ label: x.name, cur: on("APR") && i === this.apr })) : [{ label: "NONE", cur: false, dim: true }],
            transitions: this.transitions().map((label, i) => ({ label, cur: on("TRANS") && i === this.trans })),
            min: minView(this.baro, on("MIN"), on("MINALT")),
            sequence: points.map((x) => ({ label: x.id, role: ROLE[x.role ?? ""] ?? "", cur: false })),
            load: on("LOAD"),
            activate: on("ACTIVATE"),
            points,
        };
    }
}
const noSpeller = { editing: false, value: "", inner() { }, outer: () => false, ent: () => null, cancel() { } };
