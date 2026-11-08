// The windows the flight plan PAGE MENU opens for Closest Point of FPL, Parallel Track and Create ATK Offset Waypoint,
// shared by the MFD page and the PFD window, from the Pilot's Guide's steps (FG1000 has none). Window titles and
// field names are drawn here, not the trainer's. DOM-free, so it can be tested on its own.
import { atkOffset, bearingDistance, cancelParallel, closestPointOfFpl, findPoint, isParallel, parallelTrack, routePoint, vtfEdit } from "./nav.js";
import type { Airport } from "./nav.js";
import { deg3 } from "./page.js";
import type { IdEntry } from "./ui.js";
import type { LatLon, MapPoint } from "./map.js";

export const FPL_TOOLS = ["Closest Point Of FPL", "Parallel Track", "Create ATK Offset Waypoint"] as const;
export type FplToolName = (typeof FPL_TOOLS)[number];

type Route = (string | MapPoint)[];
export type ToolState = LatLon & {
  points: MapPoint[]; airports: Airport[]; route: Route; activeLeg: number; directFrom: LatLon | null; vtf: boolean; magVar: number;
};
export interface ToolRow { label: string; value?: string; cur?: boolean; dim?: boolean; title?: boolean }
/** What ENT does: the change to make, if any, and whether the window closes. */
export type ToolEnt = { patch?: { route?: Route; activeLeg?: number; vtf?: boolean; directFrom?: null; points?: MapPoint[] }; close: boolean };

/** Whether the flight plan menu offers `name`; ATK needs the waypoint `sel` under the cursor. */
export function toolEnabled(name: FplToolName, s: ToolState, sel: number | null): boolean {
  const legs = s.route.filter((r) => routePoint(r, s.points, s.airports)).length > 1;
  return name === "Create ATK Offset Waypoint" ? legs && sel !== null && sel < s.route.length : legs;
}

export class FplTool {
  name: FplToolName = "Parallel Track";
  /** The field the cursor is on. */ row = 0;
  private side: "L" | "R" = "L";
  private nm = 1;
  private offset = 1;
  private sel = 0;
  private ref: string | null = null;
  private found: { brg: number; dist: number } | null = null;

  constructor(private entry: IdEntry) {}

  /** Opens `name`'s window; `sel` is the flight plan waypoint under the cursor (ATK). */
  open(name: FplToolName, s: ToolState, sel = 0) {
    [this.name, this.sel, this.row, this.side, this.nm, this.offset, this.ref, this.found] = [name, sel, 0, "L", 1, 1, null, null];
    this.entry.cancel();
    // Pilot's Guide: with Parallel Track on, the window opens on CANCEL PARALLEL TRACK?.
    if (name === "Parallel Track" && s.route.some(isParallel)) this.row = 2;
  }

  rows(s: ToolState): ToolRow[] {
    if (this.name === "Closest Point Of FPL") {
      const f = this.found;
      return [
        { label: "CLOSEST POINT OF FPL", title: true },
        { label: "", value: this.entry.editing ? this.entry.value : this.ref ?? "_____", cur: true },
        { label: "BRG", value: f ? deg3(f.brg - s.magVar) : "___°" },
        { label: "DIS", value: f ? `${f.dist.toFixed(1)}NM` : "___._NM" },
      ];
    }
    if (this.name === "Create ATK Offset Waypoint") {
      const w = routePoint(s.route[this.sel] ?? "", s.points, s.airports);
      return [
        { label: "ALONG TRACK OFFSET", title: true },
        { label: "WAYPOINT", value: w?.id ?? "" },
        { label: "OFFSET", value: `${this.offset > 0 ? "+" : ""}${this.offset}NM`, cur: true },
      ];
    }
    const on = s.route.some(isParallel);
    return [
      { label: "PARALLEL TRACK", title: true },
      { label: "DIRECTION", value: this.side === "L" ? "Left" : "Right", cur: this.row === 0 },
      { label: "DISTANCE", value: `${this.nm}NM`, cur: this.row === 1 },
      on
        ? { label: "CANCEL PARALLEL TRACK?", cur: this.row === 2 }
        : { label: "ACTIVATE PARALLEL TRACK?", cur: this.row === 2, dim: !parallelTrack(s, this.side, this.nm) },
    ];
  }

  /** The FMS knob: the small one picks a value (spells, on Closest Point), the large one moves (ATK: by 10 nm). */
  // shortcut: ATK's distance changes by 1 nm (small) or 10 nm (large), not digit by digit; upgrade if a lesson needs it.
  /** Whether the small knob would spell (Closest Point's waypoint; keyboard typing goes there). */
  typing() {
    return this.name === "Closest Point Of FPL";
  }

  fms(_s: ToolState, outer: boolean, d: number) {
    if (this.name === "Closest Point Of FPL") {
      if (outer) this.entry.outer(d);
      else {
        this.entry.inner(d);
        this.found = null; // a new identifier: the old result no longer applies
      }
    } else if (this.name === "Create ATK Offset Waypoint") {
      // Steps over 0: +1 and -1 are one click apart.
      const k = (this.offset > 0 ? this.offset - 1 : this.offset) + d * (outer ? 10 : 1);
      this.offset = Math.max(-999, Math.min(999, k >= 0 ? k + 1 : k));
    } else if (outer) this.row = Math.max(0, Math.min(2, this.row + d));
    else if (this.row === 0) this.side = this.side === "L" ? "R" : "L";
    else if (this.row === 1) this.nm = Math.max(1, Math.min(99, this.nm + d));
  }

  /** CLR: cancels an identifier being spelled; otherwise true, the window closes. */
  clr(): boolean {
    if (!this.entry.editing) return true;
    this.entry.cancel();
    return false;
  }

  ent(s: ToolState): ToolEnt {
    if (this.name === "Closest Point Of FPL") {
      if (!this.entry.editing) return { close: !!this.found };
      this.ref = this.entry.ent();
      const ref = this.ref ? findPoint(s, this.ref) : undefined;
      const c = ref && closestPointOfFpl(s, ref);
      this.found = c ? { brg: c.brg, dist: c.dist } : null;
      // The user waypoint goes in the host's points, where the map and the waypoint lookups find it.
      return c ? { patch: { points: [...s.points, c.point] }, close: false } : { close: false };
    }
    if (this.name === "Create ATK Offset Waypoint") {
      // Editing the plan cancels Parallel Track (Pilot's Guide).
      const route = cancelParallel(s.route);
      const r = atkOffset({ ...s, route }, this.sel, this.offset);
      if (!r) return { close: false };
      route.splice(r.at, 0, r.point);
      // One inserted on the active leg is the active waypoint only if it is still ahead of the aircraft.
      let activeLeg = r.at < s.activeLeg ? s.activeLeg + 1 : s.activeLeg;
      const to = routePoint(route[r.at + 1] ?? "", s.points, s.airports);
      if (r.at === s.activeLeg && to) {
        // Along-track distance back from the active waypoint, on the leg into it (off course, slant distance misleads).
        const from = s.directFrom ?? routePoint(route[r.at - 1] ?? "", s.points, s.airports) ?? s;
        const leg = bearingDistance(to.lat, to.lon, from.lat, from.lon).brg;
        const back = (p: LatLon) => {
          const { brg, dist } = bearingDistance(to.lat, to.lon, p.lat, p.lon);
          return dist * Math.cos(((brg - leg) * Math.PI) / 180);
        };
        if (back(r.point) >= back(s)) activeLeg++;
      }
      return { patch: { route, activeLeg, ...vtfEdit(s.vtf, r.at, s.activeLeg) }, close: true };
    }
    if (this.row < 2) {
      this.row++;
      return { close: false };
    }
    if (s.route.some(isParallel)) return { patch: { route: cancelParallel(s.route) }, close: true };
    const route = parallelTrack(s, this.side, this.nm);
    return route ? { patch: { route }, close: true } : { close: false };
  }
}
