// Navigation data the pages show, and the arithmetic they share. The host supplies the data (instrumentready.com uses
// FAA NASR and CIFP); FlightGear reads its own navigation database instead.
import { mod } from "./page.js";
import type { LatLon, MapPoint } from "./map.js";

export interface Runway { /** "07L-25R" */ id: string; /** Feet. */ length: number; /** Feet. */ width: number; /** e.g. "CONC", "ASPH" */ surface: string; /** e.g. "MED", "HIGH" */ lights?: string }
/** A frequency and what it is for, e.g. { use: "TOWER", freq: "118.700" }. */
export interface Freq { use: string; freq: string }

export interface Airport {
  id: string;
  name: string;
  city?: string;
  /** e.g. "AZ". */ region?: string;
  /** "PUBLIC", "PRIVATE", "MILITARY". */ use?: string;
  lat: number;
  lon: number;
  /** Feet. */ elev: number;
  /** Longest first. */ runways: Runway[];
  freqs: Freq[];
  /** Instrument approaches by name, e.g. "ILS OR LOC RWY 07R" (the PROC key loads them; see `Procedure`). */ approaches: string[];
  /** Fuel types, e.g. "100LL, A". */ fuel?: string;
}

/** A frequency to call that is not an airport's own: an ARTCC or FSS outlet, or an ASOS/AWOS. */
export interface Station {
  type: "ARTCC" | "FSS" | "WX";
  /** WX: the airport or station id; ARTCC/FSS: the facility, e.g. "ZAB". */ id: string;
  /** ARTCC/FSS: e.g. "ALBUQUERQUE CENTER"; WX: "ASOS", "AWOS-3". */ name: string;
  lat: number;
  lon: number;
  freq: string;
}

/** A leg of a procedure (ARINC 424 path terminators, simplified): fly to `fix`. */
export interface ProcLeg {
  fix: string;
  lat: number;
  lon: number;
  /** "IF", "TF", "CF", "DF", "RF" ... as published. */ type: string;
  /** Feet, with "+" at or above, "-" at or below, "" at; null none. */ alt: string | null;
  /** Fix role: initial, intermediate, final approach, missed approach point, missed approach. */ role?: "IAF" | "IF" | "FAF" | "MAP" | "MISSED";
}
/** An approach, with its transitions, as the PROC key lists and loads them. */
export interface Procedure {
  airport: string;
  name: string;
  /** Transition name ("VECTORS" for none) to its legs, which lead into `legs`. */ transitions: Record<string, ProcLeg[]>;
  /** Final approach legs through the missed approach point, then the missed approach (role "MISSED"). */ legs: ProcLeg[];
}

/** Initial great-circle bearing (true) and distance in nm. */
export function bearingDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const dLon = (lon2 - lon1) * r;
  const [p1, p2] = [lat1 * r, lat2 * r];
  const brg = Math.atan2(Math.sin(dLon) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon)) / r;
  const dist = (Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLon))) / r) * 60;
  return { brg: mod(brg, 360), dist };
}

/** Up to `n` of `list` within 200 nm (the NRST pages' limit), nearest first, with magnetic bearing and distance. */
export function nearest<T extends { lat: number; lon: number }>(list: T[], lat: number, lon: number, magVar: number, n = 25) {
  return list
    .map((item) => {
      const { brg, dist } = bearingDistance(lat, lon, item.lat, item.lon);
      return { item, brg: mod(brg - magVar, 360), dist };
    })
    .filter((x) => x.dist <= 200)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

// setTextElementLat / Lon: N33°25.92'
export const latLon = (v: number, pos: string, neg: string) => {
  const a = Math.abs(v);
  return `${v >= 0 ? pos : neg}${Math.floor(a)}°${((a % 1) * 60).toFixed(2)}'`;
};

/** The best approach type an airport has, as the PFD's NRST window shows it. */
export function bestApproach(a: Airport): string {
  for (const [type, re] of [["ILS", /^ILS|LOC/], ["RNAV", /RNAV|GPS/], ["VOR", /VOR/], ["NDB", /NDB/]] as const) {
    if (a.approaches.some((n) => re.test(n))) return type;
  }
  return "VFR";
}

/** The frequency the PFD's NRST window shows: approach, else tower, else unicom or CTAF (NearestAirportsPFD). */
export function nrstFreq(a: Airport): [string, string] {
  for (const type of ["APPROACH", "TOWER", "UNICOM", "CTAF"]) {
    const f = a.freqs.find((x) => x.use === type);
    if (f) return [type === "CTAF" ? "UNICOM" : type, f.freq];
  }
  return ["", ""];
}

/** A flight plan entry as a point: an id of `points` or `airports`, or a point of its own. */
export function routePoint(r: string | MapPoint, points: MapPoint[], airports: Airport[]): MapPoint | undefined {
  if (typeof r !== "string") return r;
  const p = points.find((x) => x.id === r);
  if (p) return p;
  const a = airports.find((x) => x.id === r);
  return a && { id: a.id, type: "APT", lat: a.lat, lon: a.lon, name: a.name };
}

/** A flight plan's name: origin / destination, the first and last airports, so a loaded approach's fixes don't replace the destination. */
export function planName(legs: (MapPoint | undefined)[]): string {
  const apts = legs.filter((p) => p?.type === "APT");
  const ids = (apts.length > 1 ? apts : legs.filter(Boolean)).map((p) => p!.id);
  return ids.length ? `${ids[0]} / ${ids[ids.length - 1]}` : "";
}

/** Whether the GPS may fly an approach (by `approachName`'s names): RNAV (GPS) and GPS approaches. The rest ask NOT APPROVED FOR GPS. */
export function gpsApproved(name: string): boolean {
  return name.startsWith("RNAV (GPS)") || name.startsWith("GPS");
}

/** Vector-to-final makes the final approach fix active; an approach without one starts at its first leg. */
export function vtfLeg(legs: readonly (string | { role?: string })[]): number {
  return Math.max(0, legs.findIndex((l) => typeof l !== "string" && l.role === "FAF"));
}

// An approach's own fix, marked by PROC (a published fix may have no role); a waypoint entered by hand has no marker.
type Leg = string | { role?: string; approach?: string; lat?: number; lon?: number };
const isFix = (l: Leg | undefined): l is { approach: string; lat?: number; lon?: number } => typeof l === "object" && l.approach !== undefined;

/**
 * Vector-to-final with the approach's fixes from `route[start]`: the final approach fix is active, its leg on the final
 * course, drawn from the approach's own fix before it (a waypoint entered between them is skipped by starting the leg at
 * that fix's position). With no approach fix before the FAF (or no FAF), it goes direct from the aircraft at `here`.
 */
export function vtfPatch(start: number, legs: readonly Leg[], here: LatLon): { activeLeg: number; directFrom: LatLon | null; vtf: true } {
  const i = vtfLeg(legs);
  if (isFix(legs[i - 1])) return { activeLeg: start + i, directFrom: null, vtf: true };
  const fix = legs.slice(0, Math.max(0, i)).reverse().find(isFix);
  const from = fix?.lat !== undefined && fix.lon !== undefined ? { lat: fix.lat, lon: fix.lon } : here;
  return { activeLeg: start + i, directFrom: from, vtf: true };
}

type Route = (string | MapPoint)[];
/** A route entry PROC loaded as part of an approach; a waypoint entered by hand is not one. */
export const isApproach = (r: string | MapPoint): r is MapPoint => typeof r !== "string" && r.approach !== undefined;

/** The approach loaded in `route`: its fixes, which PROC marks with `approach`, from `start` on. */
// `pts` is the route from there on, with any waypoints inserted among the fixes, so its indexes are the route's from `start`.
export function loadedApproach(route: Route): { start: number; name: string; pts: Route } | null {
  const start = route.findIndex(isApproach);
  return start < 0 ? null : { start, name: (route[start] as MapPoint).approach!, pts: route.slice(start) };
}

/** PROC's change to the flight plan: the approach `pts` after the en route waypoints (replacing one loaded before), loaded, activated or vectors-to-final. */
export function approachPatch(route0: Route, pts: MapPoint[], mode: "load" | "activate" | "vectors", here: LatLon) {
  // Loading an approach cancels Parallel Track (Pilot's Guide).
  const enroute = cancelParallel(route0).filter((r) => !isApproach(r));
  const route = [...enroute, ...pts];
  if (mode === "load") return { route, vtf: false };
  if (mode === "activate") return { route, activeLeg: enroute.length, directFrom: here, vtf: false };
  return { route, ...vtfPatch(enroute.length, pts, here) };
}

/** A fix entered by hand (WAYPOINT ENTRY, DIRECT TO) is an ordinary waypoint, even when picked from a loaded approach. */
export function asWaypoint(p: MapPoint): MapPoint {
  const { approach: _a, role: _r, ...w } = p;
  return w;
}

type Plan = { points: MapPoint[]; route: (string | MapPoint)[]; airports: Airport[] };

/** How waypoint `p` goes into the flight plan: by id when the host's data has it, an approach fix as a plain
 * waypoint, and a Parallel Track point as the entry it was offset from (an edit cancels Parallel Track). */
export function planEntry(s: Plan, p: MapPoint): string | MapPoint {
  if (p.parallel !== undefined) return p.parallel;
  return s.points.includes(p) || p.type === "APT" ? p.id : asWaypoint(p);
}

/** A waypoint by identifier: navigation points, then flight plan points (approach fixes), then airports. */
export const findPoint = (s: Plan, id: string): MapPoint | undefined =>
  s.points.find((p) => p.id === id) ?? s.route.find((r): r is MapPoint => typeof r === "object" && r.id === id) ?? routePoint(id, [], s.airports);

/** DIRECT TO's ACTIVATE: the leg to `p` from here, in the flight plan if it is there, else as a plan of its own. */
export function directToPatch(s: Plan & LatLon, p: MapPoint) {
  // A direct-to cancels Parallel Track (Pilot's Guide): the plan goes back to its own waypoints.
  const route = cancelParallel(s.route);
  // An offset point (the active one DIRECT TO offers) goes direct to the waypoint it came from.
  const id = p.parallel !== undefined ? routePoint(p.parallel, s.points, s.airports)?.id : p.id;
  const i = route.findIndex((r) => routePoint(r, s.points, s.airports)?.id === id);
  const directFrom = { lat: s.lat, lon: s.lon };
  if (i >= 0) return { ...(s.route.some(isParallel) && { route }), activeLeg: i, directFrom, vtf: false };
  return { route: [planEntry(s, p)], activeLeg: 0, directFrom, vtf: false };
}

/**
 * The Direct-to window's Cancel Direct-To NAV (Pilot's Guide): the plan resumes on the leg closest to the aircraft; a
 * direct-to that replaced the plan leaves nothing to fly. Null (dim) with no direct-to, or on vector-to-final.
 */
export function cancelDirectTo(s: Plan & LatLon & { activeLeg: number; directFrom: LatLon | null; vtf?: boolean }) {
  if (!s.directFrom || s.vtf) return null;
  const pts = s.route.map((r) => routePoint(r, s.points, s.airports));
  // Distance from the aircraft to each leg, flat-earth nm: close enough to pick a leg.
  const { to } = local(s);
  const off = (a: LatLon, b: LatLon) => onLeg(to(a), to(b)).d;
  let [leg, best] = [-1, Infinity];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const d = a && b ? off(a, b) : Infinity;
    if (d < best) [leg, best] = [i, d];
  }
  if (leg < 0) return { route: [], activeLeg: 0, directFrom: null, vtf: false };
  return { activeLeg: leg, directFrom: null, vtf: false };
}

/**
 * Vector-to-final after a waypoint is inserted or deleted at `at`, with the final approach fix active at `activeLeg`. Its
 * intercept may start at any approach fix before the FAF or at the aircraft (see `vtfPatch`), so an edit at or before the
 * FAF ends it and its intercept, and the active leg is drawn as an ordinary one; an edit after the FAF keeps it.
 */
export function vtfEdit(vtf: boolean, at: number, activeLeg: number): { vtf: boolean; directFrom?: null } {
  if (!vtf) return { vtf: false };
  return at > activeLeg ? { vtf: true } : { vtf: false, directFrom: null };
}

// Flat-earth nm around `o` (x east, y north): close enough over a flight plan leg for the FPL tools below.
function local(o: LatLon) {
  const k = 60 * Math.cos((o.lat * Math.PI) / 180);
  return {
    to: (p: LatLon): [number, number] => [(p.lon - o.lon) * k, (p.lat - o.lat) * 60],
    from: ([x, y]: [number, number]): LatLon => ({ lat: o.lat + y / 60, lon: o.lon + x / k }),
  };
}

/** The point of leg a-b closest to the frame's origin, and its distance (a `local` frame). */
function onLeg([ax, ay]: [number, number], [bx, by]: [number, number]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / (dx * dx + dy * dy || 1)));
  const xy: [number, number] = [ax + t * dx, ay + t * dy];
  return { xy, d: Math.hypot(...xy) };
}

const ids = (route: Route) => new Set(route.map((r) => (typeof r === "string" ? r : r.id)));

/** A user waypoint name from `id` not already among `taken`: `id` and a digit. */
// shortcut: the Pilot's Guide only says the name comes from the reference's; upgrade if the trainer shows its scheme.
function userName(id: string, taken: Route): string {
  const used = ids(taken);
  for (let n = 1; ; n++) if (!used.has(`${id.slice(0, 5)}${n}`)) return `${id.slice(0, 5)}${n}`;
}

/**
 * Closest Point of FPL (Pilot's Guide): the point on the plan nearest the reference waypoint `ref`, as a user waypoint
 * named apart from the plan's and `points`, with the true bearing and distance to it from `ref`. Null with no leg.
 */
export function closestPointOfFpl(s: Plan, ref: MapPoint) {
  const pts = s.route.map((r) => routePoint(r, s.points, s.airports));
  const { to, from } = local(ref);
  let best: { d: number; xy: [number, number] } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const c = a && b && onLeg(to(a), to(b));
    if (c && (!best || c.d < best.d)) best = c;
  }
  if (!best) return null;
  const p = from(best.xy);
  const point: MapPoint = { id: userName(ref.id, [...s.route, ...s.points]), type: "WPT", lat: p.lat, lon: p.lon };
  return { point, ...bearingDistance(ref.lat, ref.lon, p.lat, p.lon) };
}

/**
 * Create ATK Offset Waypoint (Pilot's Guide): a waypoint `nm` (1 to 999, negative before) along the plan from the one at
 * `at`, to insert at the returned `at`. Null where the Pilot's Guide forbids it: past the leg's length (on the active
 * waypoint, the distance to go), with no leg that side, or at or after the final approach fix; and where one with
 * the same name is already in the plan.
 */
export function atkOffset(s: Plan & LatLon & { activeLeg: number }, at: number, nm: number) {
  const faf = s.route.findIndex((r) => isApproach(r) && r.role === "FAF");
  if (!Number.isInteger(nm) || !nm || Math.abs(nm) > 999 || (faf >= 0 && at >= faf)) return null;
  const pts = s.route.map((r) => routePoint(r, s.points, s.airports));
  const w = pts[at];
  // Along the plan's leg that side; before the active waypoint, also short of the aircraft's distance to go.
  const here = nm < 0 && at === s.activeLeg ? { lat: s.lat, lon: s.lon } : undefined;
  const other = pts[at + Math.sign(nm)] ?? here;
  if (!w || !other) return null;
  const { to, from } = local(w);
  const [x, y] = to(other);
  const len = Math.hypot(x, y);
  if (Math.abs(nm) >= len || (here && Math.abs(nm) >= Math.hypot(...to(here)))) return null;
  const p = from([(x * Math.abs(nm)) / len, (y * Math.abs(nm)) / len]);
  const point: MapPoint = { id: `${w.id.slice(0, 5)}${nm < 0 ? "-" : "+"}${Math.abs(nm)}`, type: "WPT", lat: p.lat, lon: p.lon };
  // The same offset again would repeat the name (and the place): refused.
  return ids(s.route).has(point.id) ? null : { at: nm < 0 ? at : at + 1, point };
}

export const isParallel = (r: string | MapPoint): r is MapPoint => typeof r !== "string" && r.parallel !== undefined;

/** The plan without Parallel Track: each offset point back to the entry it came from. */
export const cancelParallel = (route: Route): Route => route.map((r) => (isParallel(r) ? r.parallel! : r));

/**
 * Parallel Track (Pilot's Guide): the plan with its en route points from the active leg's start on offset `nm` (1 to
 * 99) to side `L` or `R`, named with a lower case p, so both legs at a turn stay `nm` off. The approach is not offset.
 * Null where the Pilot's Guide makes it unavailable: on a direct-to, an approach leg, or a turn over 120 degrees.
 */
// shortcut: it does not cancel itself when the offset tracks would overlap; upgrade with a leg-length check if needed.
export function parallelTrack(s: Plan & { activeLeg: number; directFrom: LatLon | null }, side: "L" | "R", nm: number): Route | null {
  const route = cancelParallel(s.route);
  const end = route.findIndex(isApproach) < 0 ? route.length : route.findIndex(isApproach);
  const start = Math.max(0, s.activeLeg - 1);
  if (s.directFrom || nm < 1 || nm > 99 || !Number.isInteger(nm) || s.activeLeg >= end || end - start < 2) return null;
  const pts = route.map((r) => routePoint(r, s.points, s.airports));
  // A zero-length leg has no direction to offset from: invalid geometry.
  for (let i = start + 1; i < end; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (!a || !b || bearingDistance(a.lat, a.lon, b.lat, b.lon).dist < 1e-6) return null;
  }
  const out = [...route];
  for (let i = start; i < end; i++) {
    const p = pts[i];
    if (!p) return null;
    const { to, from } = local(p);
    // Unit directions of the legs in and out of p, in p's frame; the first and last have one leg.
    const dir = (q: MapPoint | undefined, sign: number) => {
      if (!q) return null;
      const [x, y] = to(q);
      const l = Math.hypot(x, y) || 1;
      return [(sign * x) / l, (sign * y) / l] as [number, number];
    };
    const din = i > start ? dir(pts[i - 1], -1) : null;
    const dout = i < end - 1 ? dir(pts[i + 1], 1) : null;
    const [ux, uy] = din && dout ? [din[0] + dout[0], din[1] + dout[1]] : (din ?? dout)!;
    const turn = din && dout ? Math.acos(Math.max(-1, Math.min(1, din[0] * dout[0] + din[1] * dout[1]))) : 0;
    if (turn > (120 * Math.PI) / 180) return null;
    const l = Math.hypot(ux, uy);
    const k = ((side === "R" ? 1 : -1) * nm) / Math.cos(turn / 2) / l;
    const q = from([uy * k, -ux * k]); // right of (ux, uy) is (uy, -ux)
    out[i] = { id: `${p.id}p`, type: "WPT", lat: q.lat, lon: q.lon, parallel: route[i] };
  }
  return out;
}
