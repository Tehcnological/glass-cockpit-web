// User waypoints (Pilot's Guide: WPT - USER WPT INFORMATION and NRST - NEAREST USER WPTS; FG1000 has neither page).
// A user waypoint is a `points` entry of type WPT. These build the patches the pages report through `onChange`.
// DOM-free so the tests can run it.
import { cancelParallel, deleteEntry, isHold, isParallel, nearest, type Airport } from "./nav.js";
import { clamp, mod } from "./page.js";
import type { LatLon, MapPoint } from "./map.js";

type Route = (string | MapPoint)[];
type Plan = { points: MapPoint[]; airports: Pick<Airport, "id">[]; route: Route };

export const userWaypoints = (points: MapPoint[]) => points.filter((p) => p.type === "WPT");

/** Up to 25 user waypoints within 200 nm of the aircraft, nearest first, with magnetic bearing and distance. */
export const nearestUsers = (s: { points: MapPoint[] } & LatLon & { magVar: number }) => nearest(userWaypoints(s.points), s.lat, s.lon, s.magVar);

/** A name a new or renamed user waypoint may take: 1 to 6 letters and digits, not a point's or airport's (the pages
 * look waypoints up by identifier, so a repeat would hide one). */
export const nameFree = (s: Plan, id: string) =>
  /^[A-Z0-9]{1,6}$/.test(id) && !s.points.some((p) => p.id === id) && !s.airports.some((a) => a.id === id);

const isUser = (s: Plan, id: string) => s.points.some((p) => p.type === "WPT" && p.id === id);

/** A new user waypoint `id` at `at`, or null for a name it may not take. */
export function createUser(s: Plan, id: string, at: LatLon) {
  return nameFree(s, id) ? { points: [...s.points, { id, type: "WPT" as const, lat: at.lat, lon: at.lon }] } : null;
}

/** Renames user waypoint `from`; the flight plan's entries for it (its holds and Parallel Track offsets too) follow. */
export function renameUser(s: Plan, from: string, to: string) {
  if (!isUser(s, from) || !nameFree(s, to)) return null;
  const route = s.route.map((r) =>
    r === from ? to : isParallel(r) && r.parallel === from ? { ...r, parallel: to } : isHold(r) && r.id === from ? { ...r, id: to } : r);
  return { points: s.points.map((p) => (p.id === from ? { ...p, id: to } : p)), route };
}

/** Moves user waypoint `id` to `at`; a hold at it moves with it (the plan is in the patch only then). */
export function moveUser(s: Plan, id: string, at: LatLon) {
  if (!isUser(s, id)) return null;
  const move = <T extends MapPoint>(p: T): T => ({ ...p, lat: at.lat, lon: at.lon });
  const held = s.route.some((r) => isHold(r) && r.id === id);
  return { points: s.points.map((p) => (p.id === id ? move(p) : p)), ...(held && { route: s.route.map((r) => (isHold(r) && r.id === id ? move(r) : r)) }) };
}

/** The small FMS knob on a latitude or longitude: `deg` degrees (a minute is 1/60), latitude held at the poles. */
export function stepPosition(p: LatLon, field: "lat" | "lon", deg: number): LatLon {
  return field === "lat" ? { ...p, lat: clamp(p.lat + deg, -90, 90) } : { ...p, lon: mod(p.lon + deg + 180, 360) - 180 };
}

/** Deletes user waypoints `ids` from `points` and from the flight plan, as CLR on each of its entries would (a hold
 * at one goes with it, the active leg moves with the plan). Our choice: the Pilot's Guide is not clear on a waypoint
 * in the active flight plan, and keeping the entry would leave the plan naming a point that no longer exists. */
export function deleteUsers(s: Plan & { activeLeg: number; vtf: boolean }, ids: string[]) {
  const gone = new Set(ids);
  let plan: { route: Route; activeLeg: number; vtf: boolean; directFrom?: null } = { route: s.route, activeLeg: s.activeLeg, vtf: s.vtf };
  const route = cancelParallel(s.route);
  for (let i = route.length - 1; i >= 0; i--) {
    const r = route[i];
    if (typeof r === "string" && gone.has(r)) plan = { ...plan, ...deleteEntry(plan, i) };
  }
  return { points: s.points.filter((p) => !(p.type === "WPT" && gone.has(p.id))), ...plan };
}
