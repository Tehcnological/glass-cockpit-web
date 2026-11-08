// WPT - APPROACH INFORMATION: the airport page's APR softkey, as the Pilot's Guide steps through it. FG1000 has no such
// page. DOM-free, so the tests can run it; the MFD's AirportInfo page draws it.
import { clamp } from "./page.js";
import { approachPoints, type Airport, type Procedure } from "./nav.js";
import type { MapPoint } from "./map.js";
import type { Speller } from "./procedures.js";

export interface AprCtx { airport: Airport | undefined; procedures: Procedure[] }
type Grp = "APT" | "APR" | "TRANS" | "MIN" | "MINALT" | "SEQ";
export interface AprRow { label: string; cur: boolean; dim?: boolean; role?: string }

// The sequence box's role labels. shortcut: our own wording for the missed approach; change it if the trainer differs.
const ROLE: Record<string, string> = { IAF: "IAF", IF: "IF", FAF: "FAF", MAP: "MAP", MISSED: "MA" };

export class AprInfo {
  grp: Grp = "APT";
  apr = 0;
  trans = 0;
  seq = 0;
  /** BARO minimums, feet; null is off. shortcut: kept on this page; the PFD's minimums are set at TMR/REF. */
  baro: number | null = null;

  constructor(readonly entry: Speller) {}

  private proc(c: AprCtx): Procedure | undefined {
    const name = c.airport?.approaches[this.apr];
    return c.procedures.find((p) => p.airport === c.airport?.id && p.name === name);
  }

  private transitions(c: AprCtx) {
    const p = this.proc(c);
    return p ? Object.keys(p.transitions) : [];
  }

  /** The selected approach from the selected transition on, to preview on the map. */
  preview(c: AprCtx): MapPoint[] {
    const p = this.proc(c);
    return p ? approachPoints(p, this.transitions(c)[this.trans]) : [];
  }

  // The large knob's stops, as ENT's: transitions only when the approach has some, the minimum altitude only with minimums on.
  private order(c: AprCtx): Grp[] {
    return (["APT", "APR", "TRANS", "MIN", "MINALT", "SEQ"] as Grp[]).filter((g) =>
      (g !== "TRANS" || this.transitions(c).length > 0) && (g !== "MINALT" || this.baro !== null));
  }

  fms(c: AprCtx, outer: boolean, d: number) {
    if (this.entry.editing || (this.grp === "APT" && !outer)) {
      if (outer) this.entry.outer(d);
      else this.entry.inner(d);
      return;
    }
    const o = this.order(c);
    if (outer) this.grp = o[clamp(o.indexOf(this.grp) + (d > 0 ? 1 : -1), 0, o.length - 1)];
    else if (this.grp === "APR") [this.apr, this.trans, this.seq] = [clamp(this.apr + d, 0, Math.max(0, (c.airport?.approaches.length ?? 1) - 1)), 0, 0];
    else if (this.grp === "TRANS") [this.trans, this.seq] = [clamp(this.trans + d, 0, Math.max(0, this.transitions(c).length - 1)), 0];
    // BARO on starts at the field elevation, rounded up to 100 ft; the altitude steps 10 ft, as TMR/REF's.
    else if (this.grp === "MIN") this.baro = this.baro === null ? Math.ceil((c.airport?.elev ?? 0) / 100) * 100 : null;
    else if (this.grp === "MINALT" && this.baro !== null) this.baro = Math.max(0, this.baro + d * 10);
    else if (this.grp === "SEQ") this.seq = clamp(this.seq + d, 0, Math.max(0, this.preview(c).length - 1));
  }

  /** ENT moves on to the next box; returns an airport identifier just spelled, for the page to show. */
  ent(c: AprCtx): string | null {
    if (this.entry.editing) {
      const v = this.entry.ent();
      if (v) [this.grp, this.apr, this.trans, this.seq] = ["APR", 0, 0, 0];
      return v;
    }
    const next: Record<Grp, Grp> = {
      APT: "APR", APR: this.transitions(c).length ? "TRANS" : "MIN", TRANS: "MIN", MIN: this.baro === null ? "SEQ" : "MINALT", MINALT: "SEQ", SEQ: "SEQ",
    };
    this.grp = next[this.grp];
    return null;
  }

  clr() {
    this.entry.cancel();
  }

  /** What the page draws; `crsr` is the FMS cursor being on. */
  view(c: AprCtx, crsr: boolean) {
    const on = (g: Grp) => crsr && this.grp === g;
    const has = (name: string) => c.procedures.some((p) => p.airport === c.airport?.id && p.name === name);
    return {
      apt: this.entry.editing ? this.entry.value : c.airport?.id ?? "____",
      aptCur: on("APT") || this.entry.editing,
      approaches: (c.airport?.approaches ?? []).map((label, i): AprRow => ({ label, dim: !has(label), cur: on("APR") && i === this.apr })),
      transitions: this.transitions(c).map((label, i): AprRow => ({ label, cur: on("TRANS") && i === this.trans })),
      min: { mode: this.baro === null ? "OFF" : "BARO", alt: this.baro === null ? "_____FT" : `${this.baro}FT`, cur: on("MIN"), altCur: on("MINALT") },
      sequence: this.preview(c).map((p, i): AprRow => ({ label: p.id, role: ROLE[p.role ?? ""] ?? "", cur: on("SEQ") && i === this.seq })),
    };
  }
}
