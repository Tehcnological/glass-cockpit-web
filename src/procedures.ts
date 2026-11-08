// PROC: the PROCEDURES menu, SELECT APPROACH and NOT APPROVED FOR GPS, as the v13 trainer has them. FG1000 has no
// procedures page. DOM-free, so the MFD page and the PFD window share it and the tests can run it.
import { clamp } from "./page.js";
import { approachPatch, gpsApproved, loadedApproach, nearest, routePoint, vtfPatch, type Airport, type Procedure } from "./nav.js";
import type { LatLon, MapPoint } from "./map.js";

export const PROC_MENU = ["ACTIVATE VECTOR-TO-FINAL", "ACTIVATE APPROACH", "ACTIVATE MISSED APPROACH", "SELECT APPROACH", "SELECT ARRIVAL", "SELECT DEPARTURE"];
const SELECT_APPROACH = 3;

/** What the flow reads and where it sends its changes. */
export interface ProcHost {
  s(): LatLon & { route: (string | MapPoint)[]; points: MapPoint[]; airports: Airport[]; procedures: Procedure[] };
  change(patch: object): void;
  close(): void;
}

/** Spells an identifier with the FMS knob: the inner turns the character, the outer moves along. */
export type Speller = { editing: boolean; inner(d: number): void; outer(d: number): boolean; ent(): string | null; cancel(): void };

export class ProcFlow {
  airport: string | null = null;
  view: "menu" | "select" | "ask" = "menu";
  item = SELECT_APPROACH;
  yes = true;
  /** The activation NOT APPROVED FOR GPS asks about, and the view NO goes back to. */
  pending: { act: () => void; from: "menu" | "select" } | null = null;
  grp: "APT" | "APR" | "TRANS" | "LOAD" | "ACTIVATE" = "APR";
  apr = 0;
  trans = 0;

  constructor(private h: ProcHost, readonly entry: Speller = noSpeller) {}

  /** Opens on the PROCEDURES menu. SELECT APPROACH opens on the destination: the last airport in the flight plan, else the nearest. */
  open() {
    const s = this.h.s();
    const apts = s.route.map((r) => routePoint(r, s.points, s.airports)).filter((p) => p?.type === "APT");
    this.airport = apts[apts.length - 1]?.id ?? nearest(s.airports, s.lat, s.lon, 0, 1)[0]?.item.id ?? null;
    [this.view, this.item, this.grp, this.apr, this.trans, this.pending] = ["menu", SELECT_APPROACH, "APR", 0, 0, null];
    this.entry.cancel();
  }

  procs(): Procedure[] {
    return this.h.s().procedures.filter((p) => p.airport === this.airport);
  }

  transitions() {
    const p = this.procs()[this.apr];
    return p ? Object.keys(p.transitions) : [];
  }

  private loaded() {
    return loadedApproach(this.h.s().route);
  }

  /** The ACTIVATE items need a loaded approach, ACTIVATE MISSED APPROACH one with missed approach legs; SELECT ARRIVAL
   * and SELECT DEPARTURE are not ported. */
  enabled(i: number) {
    const a = this.loaded();
    if (i === 2) return !!a?.pts.some((p) => typeof p !== "string" && p.role === "MISSED");
    return i === SELECT_APPROACH || (i < SELECT_APPROACH && a !== null);
  }

  // v13 trainer: activating an approach the GPS may not fly asks NOT APPROVED FOR GPS first, YES selected.
  private confirm(name: string, act: () => void) {
    if (gpsApproved(name)) return act();
    this.pending = { act, from: this.view === "menu" ? "menu" : "select" };
    [this.view, this.yes] = ["ask", true];
  }

  fms(outer: boolean, d: number) {
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
    const order = ["APT", "APR", "TRANS", "LOAD", "ACTIVATE"] as const;
    if (this.entry.editing) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
    } else if (outer) this.grp = order[clamp(order.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, order.length - 1)];
    else if (this.grp === "APT") this.entry.inner(d);
    else if (this.grp === "APR") [this.apr, this.trans] = [clamp(this.apr + d, 0, Math.max(0, this.procs().length - 1)), 0];
    else if (this.grp === "TRANS") this.trans = clamp(this.trans + d, 0, Math.max(0, this.transitions().length - 1));
    else this.grp = d > 0 ? "ACTIVATE" : "LOAD";
  }

  ent() {
    if (this.view === "menu") return this.menuItem();
    if (this.view === "ask") {
      const pending = this.pending;
      this.view = pending?.from ?? "select";
      this.pending = null;
      if (this.yes) pending?.act();
      return;
    }
    const p = this.procs()[this.apr];
    if (this.entry.editing) {
      const v = this.entry.ent();
      if (v) [this.airport, this.apr, this.trans, this.grp] = [v, 0, 0, "APR"];
    } else if (this.grp === "APT") this.grp = "APR";
    else if (this.grp === "APR") this.grp = this.transitions().length > 1 ? "TRANS" : "LOAD";
    else if (this.grp === "TRANS") this.grp = "LOAD";
    else if (this.grp === "ACTIVATE" && p) this.confirm(p.name, () => this.load(true));
    else this.load(this.grp === "ACTIVATE");
  }

  clr() {
    if (this.view === "ask") [this.view, this.pending] = [this.pending?.from ?? "select", null]; // as NO
    else if (this.entry.editing) this.entry.cancel();
    else if (this.view === "select") this.view = "menu";
    else this.h.close();
  }

  // ACTIVATE VECTOR-TO-FINAL, ACTIVATE APPROACH and ACTIVATE MISSED APPROACH act on the approach already loaded.
  private menuItem() {
    if (this.item === SELECT_APPROACH) {
      this.view = "select";
      return;
    }
    const a = this.loaded();
    if (!a || !this.enabled(this.item)) return;
    const item = this.item;
    if (item === 2) this.activate(item);
    else this.confirm(a.name, () => this.activate(item));
  }

  // Worked out from the state when it is carried out, after NOT APPROVED FOR GPS: the host may have changed the route.
  private activate(item: number) {
    const a = this.loaded();
    if (!a || !this.enabled(item)) return;
    const s = this.h.s();
    const here = { lat: s.lat, lon: s.lon };
    if (item === 0) this.h.change(vtfPatch(a.start, a.pts, here));
    else if (item === 1) this.h.change({ activeLeg: a.start, directFrom: here, vtf: false });
    else this.h.change({ activeLeg: a.start + a.pts.findIndex((p) => typeof p !== "string" && p.role === "MISSED"), directFrom: null, vtf: false });
    this.h.close();
  }

  // Adds the approach after the en route waypoints (replacing an approach loaded before), as the G1000 does. ACTIVATE
  // with the VECTORS transition is vector-to-final: the final approach fix is active, its leg on the final course.
  // shortcut: the missed approach legs follow the missed approach point with no suspend.
  private load(activate: boolean) {
    const p = this.procs()[this.apr];
    if (!p) return;
    const s = this.h.s();
    const name = this.transitions()[this.trans];
    const legs = [...(p.transitions[name] ?? []), ...p.legs];
    const pts: MapPoint[] = legs
      .filter((l, i) => i === 0 || l.fix !== legs[i - 1].fix)
      .map((l) => ({ id: l.fix, type: "WPT", lat: l.lat, lon: l.lon, alt: l.alt, role: l.role, approach: p.name }));
    this.h.change(approachPatch(s.route, pts, !activate ? "load" : name === "VECTORS" ? "vectors" : "activate", { lat: s.lat, lon: s.lon }));
    this.h.close();
  }
}

const noSpeller: Speller = { editing: false, inner() {}, outer: () => false, ent: () => null, cancel() {} };
