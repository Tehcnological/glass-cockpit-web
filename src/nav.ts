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

type Leg = string | { role?: string; lat?: number; lon?: number };
const isFix = (l: Leg | undefined): l is { role: string; lat?: number; lon?: number } => typeof l === "object" && l.role !== undefined;

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
  const enroute = route0.filter((r) => !isApproach(r));
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

/**
 * Whether vector-to-final survives a flight plan edit at `at` (`inserted`, or deleted) with the final approach fix active at
 * `activeLeg`: the map draws its leg from the entry before the fix, so an edit there or to the fix itself ends it.
 */
export function vtfInboundKept(at: number, activeLeg: number, inserted: boolean): boolean {
  return inserted ? at !== activeLeg : at < activeLeg - 1 || at > activeLeg;
}
