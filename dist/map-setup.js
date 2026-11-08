// MAP SETUP's groups and settings on the navigation map (Pilot's Guide). FG1000 has no map setup. Only the groups with
// something this package draws are here: Map, Airways and Profile; a row without `step` is shown grey.
import { ORIENTATIONS, TRACK_VECTOR, stepRange } from "./map.js";
const AIRWAY_MODES = ["Off", "All", "LO Only", "HI Only"];
// Pilot's Guide, Table 5-4: an airway range goes up to 500 nm.
const MAX_AIRWAY_RANGE = 500;
const pick = (list, at, d) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(at) + d))];
const airwayRange = (type, label) => ({
    label,
    value: (s) => `${s.airwayRange[type]}nm`,
    step: (s, d) => ({ airwayRange: { ...s.airwayRange, [type]: Math.min(MAX_AIRWAY_RANGE, stepRange(s.airwayRange[type], d)) } }),
});
const grey = (label) => ({ label });
export const SETUP_GROUPS = [
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
