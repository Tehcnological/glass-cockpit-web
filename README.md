# glass-pfd

A glass cockpit primary flight display for the browser: attitude, airspeed and altitude tapes, vertical speed, HSI with course deviation, glideslope, bearing pointers, and marker beacons. No dependencies.

It is a TypeScript port of the PFD in [FlightGear](https://www.flightgear.org/)'s FG1000, by Stuart Buchanan. The SVG artwork is FG1000's, with editor metadata removed, and the display logic is ported from its Nasal code (`Aircraft/Instruments-3d/FG1000` in [fgdata](https://gitlab.com/flightgear/fgdata)). It is not affiliated with or endorsed by Garmin.

## Use

```js
import { GlassPfd } from "glass-pfd";

const pfd = new GlassPfd(document.getElementById("pfd"), { vne: 163, vspeeds: { Vx: 62, Vy: 74 } });
pfd.set({ pitch: 5, roll: 15, ias: 95, alt: 3000, heading: 270, course: 260, cdiDots: -1, cdiSource: "NAV1" });
```

The container must be in the page and visible when the PFD is created, since rotation centers and tape clipping are measured from the rendered SVG. `set()` takes any subset of the state; see `PfdState` in `src/glass-pfd.ts` for every field and its units.

Open `index.html` through a local web server for a demo with sliders.

## Build

```sh
npm install
npm run build
```

`dist/` is committed so the package can be installed straight from GitHub.

## Not ported

Softkeys and menus, the inset map, flight plan window, wind display, transponder and timer, DME window, selected airspeed, failure flags, and the GPS course-to-intercept diamond.

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
