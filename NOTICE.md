# Notice

glass-cockpit-web is a TypeScript port of FG1000, the glass cockpit in [FlightGear](https://www.flightgear.org/), by Stuart Buchanan. Copyright 2018 Stuart Buchanan. Licensed GPL-2.0-or-later; this port keeps that license.

From FlightGear's [fgdata](https://gitlab.com/flightgear/fgdata):

- `src/fg1000/*.svg`: FG1000's SVG artwork (PFD, surround, engine strip, MFD pages) from `Aircraft/Instruments-3d/FG1000`, and the bezel (`fascia.svg`) from its GUI window. `scripts/build-svg.mjs` strips editor metadata from them into `src/svg/`.
- The display logic in `src/` is ported from FG1000's Nasal code (`Aircraft/Instruments-3d/FG1000/Nasal`, `Nasal/canvas/map`, `Nasal/canvas/PFD`). Each file's header names the Nasal files it ports.

Not included:

- Liberation Sans Narrow, the font FG1000 renders in. The SVGs name it and fall back to a generic font when it is not installed.
- The [OpenAttitude](https://github.com/OpenAttitude/library) `@openattitude/*` packages (LGPL-3.0-or-later) that `vue/Steam.vue` imports. A site that uses `Steam.vue` installs them itself.

Not affiliated with or endorsed by Garmin or the FlightGear project. For training and simulation only; not for navigation or flight use.
