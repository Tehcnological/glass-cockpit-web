// MAP SETUP's groups and settings on the navigation map (Pilot's Guide). FG1000 has no map setup. Only the groups with
// something this package draws are here: Map, Airways and Profile; a row without `step` is shown grey.
import { ORIENTATIONS, TRACK_VECTOR, stepRange, type Airway, type Orientation } from "./map.js";

export interface MapSettings {
  orientation: Orientation;
  /** Track vector look-ahead, seconds; 0 is off. */ trackVector: number;
  /** The AIRWAYS key's state: 0 off, 1 all, 2 low only, 3 high only. */ airways: number;
  /** The largest map range, nm, each airway type shows at. */ airwayRange: Record<Airway["type"], number>;
}

export interface SetupRow {
  label: string;
  value?: (s: MapSettings) => string;
  /** The change one detent of the small FMS knob makes; none means the setting is not ported. */
  step?: (s: MapSettings, d: number) => Partial<MapSettings>;
}

const AIRWAY_MODES = ["Off", "All", "LO Only", "HI Only"];
// Pilot's Guide, Table 5-4: an airway range goes up to 500 nm.
const MAX_AIRWAY_RANGE = 500;
const pick = <T>(list: readonly T[], at: T, d: number) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(at) + d))];
const airwayRange = (type: Airway["type"], label: string): SetupRow => ({
  label,
  value: (s) => `${s.airwayRange[type]}nm`,
  step: (s, d) => ({ airwayRange: { ...s.airwayRange, [type]: Math.min(MAX_AIRWAY_RANGE, stepRange(s.airwayRange[type], d)) } }),
});
const grey = (label: string): SetupRow => ({ label });

export const SETUP_GROUPS: { name: string; rows: SetupRow[] }[] = [
  {
    name: "Map",
    rows: [
      { label: "ORIENTATION", value: (s) => s.orientation, step: (s, d) => ({ orientation: pick(ORIENTATIONS, s.orientation, d) }) },
      grey("AUTO ZOOM"), grey("LAND DATA"),
      // shortcut: TRACK VECTOR's on/off and look-ahead time are one field; the real unit has two.
      {
        label: "TRACK VECTOR",
        value: (s) => (s.trackVector === 0 ? "Off" : s.trackVector < 120 ? `On ${s.trackVector} sec` : `On ${s.trackVector / 60} min`),
        step: (s, d) => ({ trackVector: pick(TRACK_VECTOR, s.trackVector, d) }),
      },
      grey("WIND VECTOR"), grey("NAV RANGE RING"), grey("TOPO DATA"), grey("FUEL RNG (RSV)"), grey("FIELD OF VIEW"),
    ],
  },
  {
    name: "Airways",
    rows: [
      { label: "AIRWAYS", value: (s) => AIRWAY_MODES[s.airways], step: (s, d) => ({ airways: Math.max(0, Math.min(3, s.airways + d)) }) },
      airwayRange("LO", "LOW ALT AIRWAY"), airwayRange("HI", "HI ALT AIRWAY"),
    ],
  },
  // Profile View's winds aloft: no winds aloft data here.
  { name: "Profile", rows: [grey("PROFILE WINDS")] },
];
