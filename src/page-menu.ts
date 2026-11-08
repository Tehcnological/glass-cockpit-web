// PAGE MENU: the MENU key's options for a page, as the v13 trainer lists them. Options this package cannot carry out
// are dim, as the softkeys are; the cursor skips them. DOM-free, so it can be tested on its own.
import { cancelParallel, isApproach } from "./nav.js";
import type { LatLon, MapPoint } from "./map.js";

/** One option: no `act` (or `patch`) means dim. */
export interface MenuOption { label: string; act?: () => void }

/** The next option the cursor can stop on in direction `d`, or `at` at either end. */
export function stepMenu(enabled: readonly boolean[], at: number, d: number): number {
  for (let i = at + d; i >= 0 && i < enabled.length; i += d) if (enabled[i]) return i;
  return at;
}

/** The first option the cursor can stop on, or 0. */
export const firstOption = (enabled: readonly boolean[]) => Math.max(0, enabled.indexOf(true));

/** The flight plan page menu (PFD and MFD FPL), in the trainer's order. */
export const FPL_OPTIONS = [
  "Store Flight Plan", "Invert Flight Plan", "Delete Flight Plan", "Load Airway", "Expand Airways", "Remove Departure",
  "Remove Arrival", "Remove Approach", "Temperature Compensation", "Closest Point Of FPL", "Parallel Track",
  "Create New User Waypoint", "Select VNV Profile Window", "Cancel VNV", "VNV D→", "Create ATK Offset Waypoint",
  "Hold At Waypoint", "Hold At Present Position",
] as const;

type Route = (string | MapPoint)[];
type FplPatch = { route: Route; activeLeg: number; directFrom?: LatLon | null; vtf: boolean };

/** The flight plan menu for `route`; `patch` is the change an option makes, absent when it is dim here. */
export function fplMenu(route: Route, activeLeg: number): { label: string; patch?: FplPatch }[] {
  // Waypoints entered by hand among the approach fixes stay; the active one is the first kept from the active leg on.
  // Both edits cancel Parallel Track (Pilot's Guide), so they start from the plan's own points.
  const enroute = cancelParallel(route).filter((r) => !isApproach(r));
  const a = enroute.length < route.length;
  const kept = route.slice(0, activeLeg).filter((r) => !isApproach(r)).length;
  const patches: Partial<Record<(typeof FPL_OPTIONS)[number], FplPatch>> = {};
  // Inverting drops the approach, as the G1000 does, and flies the first leg.
  if (enroute.length > 1) patches["Invert Flight Plan"] = { route: [...enroute].reverse(), activeLeg: 1, directFrom: null, vtf: false };
  if (route.length) patches["Delete Flight Plan"] = { route: [], activeLeg: 0, directFrom: null, vtf: false };
  if (a) {
    const patch: FplPatch = { route: enroute, activeLeg: Math.min(kept, Math.max(0, enroute.length - 1)), vtf: false };
    // A direct-to an approach fix (activating the approach makes one) ends with it; one to a waypoint kept stays.
    if (route[activeLeg] !== undefined && isApproach(route[activeLeg])) patch.directFrom = null;
    patches["Remove Approach"] = patch;
  }
  return FPL_OPTIONS.map((label) => ({ label, patch: patches[label] }));
}
