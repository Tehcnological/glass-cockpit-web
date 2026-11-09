// The windows the flight plan PAGE MENU opens for Closest Point of FPL, Parallel Track, Create ATK Offset Waypoint,
// Hold At Waypoint and Hold At Present Position, shared by the MFD page and the PFD window, from the Pilot's Guide's
// steps (FG1000 has none). Window titles and field names are drawn here, not the trainer's. DOM-free, so it can be
// tested on its own.
import { atkOffset, bearingDistance, cancelParallel, closestPointOfFpl, findPoint, holdAtPresentPosition, holdAtWaypoint, isHold, isParallel, parallelTrack, routePoint, vtfEdit } from "./nav.js";
import { deg3, mod } from "./page.js";
export const FPL_TOOLS = ["Closest Point Of FPL", "Parallel Track", "Create ATK Offset Waypoint", "Hold At Waypoint", "Hold At Present Position"];
/** Whether the flight plan menu offers `name`; ATK and Hold At Waypoint need the waypoint `sel` under the cursor. */
export function toolEnabled(name, s, sel) {
    if (name === "Hold At Present Position")
        return true;
    // On a hold, the menu offers Remove Hold in Hold At Waypoint's place.
    if (name === "Hold At Waypoint")
        return sel !== null && !isHold(s.route[sel]) && !!routePoint(s.route[sel] ?? "", s.points, s.airports);
    const legs = s.route.filter((r) => routePoint(r, s.points, s.airports)).length > 1;
    // Not from a hold: its leg has no length to measure along.
    return name === "Create ATK Offset Waypoint" ? legs && sel !== null && sel < s.route.length && !isHold(s.route[sel]) : legs;
}
const isHoldTool = (name) => name === "Hold At Waypoint" || name === "Hold At Present Position";
/** A hold leg's flight plan row, MFD and PFD (our own): HOLD, the inbound course, the turns. */
export const holdRow = (h) => ({ Leg: "HOLD", DTK: deg3(h.course), DIS: h.turn === "R" ? "RIGHT" : "LEFT" });
const HOLD_ROWS = 4; // course, turn, leg type, leg length; then LOAD?
export class FplTool {
    entry;
    name = "Parallel Track";
    /** The field the cursor is on. */ row = 0;
    side = "L";
    nm = 1;
    offset = 1;
    sel = 0;
    ref = null;
    found = null;
    // The hold: inbound course (magnetic), turns, legs by time (minutes) or distance (nm).
    hold = { course: 360, turn: "R", byTime: true, time: 1, dist: 1 };
    constructor(entry) {
        this.entry = entry;
    }
    /** Opens `name`'s window; `sel` is the flight plan waypoint under the cursor (ATK, Hold At Waypoint). */
    open(name, s, sel = 0) {
        [this.name, this.sel, this.row, this.side, this.nm, this.offset, this.ref, this.found] = [name, sel, 0, "L", 1, 1, null, null];
        // shortcut: 1 minute legs and right turns, the standard hold; time in 0.5 minute steps from 0.5 to 5, distance in
        // 1 nm steps from 1 to 30. Our own limits; upgrade if the Pilot's Guide gives them.
        this.hold = { course: Math.round(this.inbound(s)) || 360, turn: "R", byTime: true, time: 1, dist: 1 };
        this.entry.cancel();
        // Pilot's Guide: with Parallel Track on, the window opens on CANCEL PARALLEL TRACK?.
        if (name === "Parallel Track" && s.route.some(isParallel))
            this.row = 2;
    }
    /** The hold's default inbound course, magnetic: the leg into the waypoint (from the aircraft on the first), or for
     * present position the track (the PFD has no track input: its heading). */
    inbound(s) {
        if (this.name === "Hold At Present Position")
            return s.track ?? s.heading ?? 0;
        if (this.name !== "Hold At Waypoint")
            return 0;
        const at = (i) => routePoint(s.route[i] ?? "", s.points, s.airports);
        const w = at(this.sel);
        let i = this.sel - 1;
        while (i >= 0 && isHold(s.route[i]))
            i--;
        const from = at(i) ?? s;
        return w ? mod(bearingDistance(from.lat, from.lon, w.lat, w.lon).brg - s.magVar, 360) : 0;
    }
    holdOf() {
        const h = this.hold;
        return { course: h.course, turn: h.turn, ...(h.byTime ? { time: h.time } : { distance: h.dist }) };
    }
    rows(s) {
        if (isHoldTool(this.name)) {
            const h = this.hold;
            const w = routePoint(s.route[this.sel] ?? "", s.points, s.airports);
            return [
                { label: this.name === "Hold At Waypoint" ? "HOLD AT WAYPOINT" : "HOLD AT P.POS", title: true },
                { label: "WAYPOINT", value: this.name === "Hold At Waypoint" ? w?.id ?? "" : "P.POS" },
                { label: "COURSE", value: deg3(h.course), cur: this.row === 0 },
                { label: "TURN", value: h.turn === "R" ? "Right" : "Left", cur: this.row === 1 },
                { label: "LEG", value: h.byTime ? "Time" : "Distance", cur: this.row === 2 },
                h.byTime
                    ? { label: "TIME", value: `${h.time.toFixed(1)}MIN`, cur: this.row === 3 }
                    : { label: "DISTANCE", value: `${h.dist}NM`, cur: this.row === 3 },
                { label: "LOAD?", cur: this.row === HOLD_ROWS },
            ];
        }
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
    fms(_s, outer, d) {
        if (isHoldTool(this.name)) {
            // shortcut: the course steps 1 degree a click, not digit by digit; upgrade if a lesson needs it.
            const h = this.hold;
            if (outer)
                this.row = Math.max(0, Math.min(HOLD_ROWS, this.row + d));
            else if (this.row === 0)
                h.course = mod(h.course - 1 + d, 360) + 1;
            else if (this.row === 1)
                h.turn = h.turn === "R" ? "L" : "R";
            else if (this.row === 2)
                h.byTime = !h.byTime;
            else if (this.row === 3 && h.byTime)
                h.time = Math.max(0.5, Math.min(5, h.time + d / 2));
            else if (this.row === 3)
                h.dist = Math.max(1, Math.min(30, h.dist + d));
        }
        else if (this.name === "Closest Point Of FPL") {
            if (outer)
                this.entry.outer(d);
            else {
                this.entry.inner(d);
                this.found = null; // a new identifier: the old result no longer applies
            }
        }
        else if (this.name === "Create ATK Offset Waypoint") {
            // Steps over 0: +1 and -1 are one click apart.
            const k = (this.offset > 0 ? this.offset - 1 : this.offset) + d * (outer ? 10 : 1);
            this.offset = Math.max(-999, Math.min(999, k >= 0 ? k + 1 : k));
        }
        else if (outer)
            this.row = Math.max(0, Math.min(2, this.row + d));
        else if (this.row === 0)
            this.side = this.side === "L" ? "R" : "L";
        else if (this.row === 1)
            this.nm = Math.max(1, Math.min(99, this.nm + d));
    }
    /** CLR: cancels an identifier being spelled; otherwise true, the window closes. */
    clr() {
        if (!this.entry.editing)
            return true;
        this.entry.cancel();
        return false;
    }
    ent(s) {
        if (isHoldTool(this.name)) {
            if (this.row < HOLD_ROWS) {
                this.row++;
                return { close: false };
            }
            const patch = this.name === "Hold At Waypoint" ? holdAtWaypoint(s, this.sel, this.holdOf()) : holdAtPresentPosition(s, this.holdOf());
            return patch ? { patch, close: true } : { close: false };
        }
        if (this.name === "Closest Point Of FPL") {
            if (!this.entry.editing)
                return { close: !!this.found };
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
            if (!r)
                return { close: false };
            route.splice(r.at, 0, r.point);
            // One inserted on the active leg is the active waypoint only if it is still ahead of the aircraft.
            let activeLeg = r.at < s.activeLeg ? s.activeLeg + 1 : s.activeLeg;
            const to = routePoint(route[r.at + 1] ?? "", s.points, s.airports);
            if (r.at === s.activeLeg && to) {
                // Along-track distance back from the active waypoint, on the leg into it (off course, slant distance misleads).
                const from = s.directFrom ?? routePoint(route[r.at - 1] ?? "", s.points, s.airports) ?? s;
                const leg = bearingDistance(to.lat, to.lon, from.lat, from.lon).brg;
                const back = (p) => {
                    const { brg, dist } = bearingDistance(to.lat, to.lon, p.lat, p.lon);
                    return dist * Math.cos(((brg - leg) * Math.PI) / 180);
                };
                if (back(r.point) >= back(s))
                    activeLeg++;
            }
            return { patch: { route, activeLeg, ...vtfEdit(s.vtf, r.at, s.activeLeg) }, close: true };
        }
        if (this.row < 2) {
            this.row++;
            return { close: false };
        }
        if (s.route.some(isParallel))
            return { patch: { route: cancelParallel(s.route) }, close: true };
        const route = parallelTrack(s, this.side, this.nm);
        return route ? { patch: { route }, close: true } : { close: false };
    }
}
