# glass-cockpit

A working glass cockpit for the browser: PFD and MFD in a bezel whose knobs, buttons and softkey menus work with the mouse. No dependencies.

- **PFD:** attitude, airspeed and altitude tapes, vertical speed, HSI with course deviation, glideslope, bearing pointers, marker beacons, NAV/COM radios and the active leg across the top, and the softkey menus: inset map, nearest airports, transponder, wind, timer and references with minimums, alerts.
- **MFD:** engine strip, navigation map with the points and flight plan you give it, radios and GS/DTK/TRK/ETE across the top, softkey labels.

It is a TypeScript port of [FlightGear](https://www.flightgear.org/)'s FG1000, by Stuart Buchanan. The SVG artwork is FG1000's (PFD, surround, engine strip, map page, and the bezel from its GUI window), with editor metadata removed, and the display logic is ported from its Nasal code (`Aircraft/Instruments-3d/FG1000` and `Nasal/canvas/map` in [fgdata](https://gitlab.com/flightgear/fgdata)). It is not affiliated with or endorsed by Garmin.

## Use

```js
import { GlassPfd, GlassMfd } from "glass-cockpit";

const pfd = new GlassPfd(document.getElementById("pfd"), { bezel: true, vne: 163, vspeeds: { Vx: 62, Vy: 74 } });
pfd.set({ pitch: 5, roll: 15, ias: 95, alt: 3000, heading: 270, course: 260, cdiDots: -1, cdiSource: "NAV1",
  bearings: { NAV1: { id: "ABC", bearing: 45, distance: 8.2 } } });

const mfd = new GlassMfd(document.getElementById("mfd"), { bezel: true });
mfd.set({
  heading: 270, track: 268, groundspeed: 98, lat: 33.4, lon: -112.0, range: 10,
  points: [{ id: "ABC", type: "VOR", lat: 33.5, lon: -111.9 }], route: ["ABC"],
});
```

The container must be in the page and visible when a display is created, since rotation centers and clipping are measured from the rendered SVG. `set()` takes any subset of the state; see `PfdState` in `src/glass-pfd.ts` and `MfdState` in `src/glass-mfd.ts` for every field and its units.

With the bezel, the mouse works the controls as FlightGear's FG1000 window does: the wheel turns a knob, shift+wheel turns the outer ring of a dual knob, a click pushes a knob or button, shift+click is a long press. HDG (push: sync), CRS (push: `onInput` only, the display has no station bearing), BARO, ALT, NAV and COM tuning, frequency swap, and the tuning box work on both units; RANGE works the MFD map and the PFD inset. Every PFD softkey works: INSET (DCLTR, range), PFD (BRG1/BRG2 cycle OFF, NAV1, NAV2, GPS, ADF over `bearings`; WIND; ALT UNIT meters and hPa; STD BARO; DFLTS), OBS, CDI, XPDR (modes, code entry, IDENT), TMR/REF (FMS outer knob picks a field, inner changes it, ENT starts and stops the timer), NRST (FMS scrolls, ENT shows the airport, CLR goes back) and ALERTS. SYN VIS keys switch only their setting; there is no terrain to draw. NAV tunes in 50 kHz steps and COM in 25 kHz steps. `onChange(patch)` reports state the controls changed, so a host can keep a PFD and MFD in step; `onInput({ control, value })` reports every input, including the FMS knob, menu keys and joystick, which the display does not act on.

FG1000 draws the turn rate scale above the compass rose but never moves anything on it; `turnRate` (degrees per second) draws a magenta trend vector there, the heading 6 seconds ahead, as the real unit does.

FlightGear draws the map from its own navigation database. Here the map shows only the points passed in, with FG1000's symbols for airports, VORs, NDBs, fixes and flight plan waypoints, each layer at FG1000's default ranges (airports and VORs up to 150 nm, NDBs and fixes up to 15 nm; flight plan points always). `airspaces` takes Class B, C and D outlines; FG1000 draws none, so they follow the sectional chart: B solid blue, C solid magenta, D dashed blue, shown up to 150 nm.

Open `index.html` through a local web server for a demo with sliders.

## Build

```sh
npm install
npm run build
```

`dist/` is committed so the package can be installed straight from GitHub.

## Not ported

MFD menus and every MFD page but the navigation map, the PFD flight plan window, synthetic vision, the arc HSI, DME window, selected airspeed, autopilot annunciations, failure flags, the GPS course-to-intercept diamond, and map terrain, airways and declutter. FG1000 renders in Liberation Sans Narrow; without that font installed, some narrow labels fall back to a wider font.

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
