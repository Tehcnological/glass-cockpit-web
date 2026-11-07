# glass-cockpit-web

A working glass cockpit for the browser: PFD and MFD in a bezel whose knobs, buttons and softkey menus work with the mouse. No dependencies.

- **PFD:** attitude, airspeed and altitude tapes, vertical speed, HSI with course deviation, glideslope, bearing pointers, marker beacons, NAV/COM radios and the active leg across the top, and the softkey menus: inset map, nearest airports, transponder, wind, timer and references with minimums, alerts.
- **MFD:** engine strip, radios and GS/DTK/TRK/ETE across the top, and the page groups the FMS knob steps through: navigation and traffic maps, NRST (airports, VORs, NDBs, intersections, frequencies), WPT information (airport, VOR, NDB, intersection), the active flight plan, checklists, DIRECT TO and PROC (approach loading). Pages with no data to show (weather, terrain, trip planning, GPS status and others) show their title and NO DATA.

It is a TypeScript port of [FlightGear](https://www.flightgear.org/)'s FG1000, by Stuart Buchanan. The SVG artwork is FG1000's (PFD, surround, engine strip, map page, and the bezel from its GUI window), with editor metadata removed, and the display logic is ported from its Nasal code (`Aircraft/Instruments-3d/FG1000` and `Nasal/canvas/map` in [fgdata](https://gitlab.com/flightgear/fgdata)). It is not affiliated with or endorsed by Garmin.

## Use

```js
import { GlassPfd, GlassMfd } from "glass-cockpit-web";

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

### MFD

The pages draw from what you pass in: `points` (with `name`, `freq` and the rest for the WPT and NRST details), `airports` (runways, frequencies, approach names), `stations` (ARTCC, FSS and weather frequencies), `procedures` (approach legs by transition, for PROC) and `checklists`. The FMS knob picks the page group and page (outer ring, then inner) and, with the cursor on (push), the field. ENT on a frequency tunes it to the standby of NAV or COM. FPL shows the active flight plan: with the cursor on, the inner knob opens WAYPOINT ENTRY to insert a waypoint after the selected one, CLR deletes one, ENT on a row makes it the active leg. DIRECT TO opens on the selected waypoint with ACTIVATE? highlighted, so ENT goes direct; the inner knob enters another. In WAYPOINT ENTRY and DIRECT TO, turning the inner knob left before typing opens the FPL, NRST and RECENT lists; the outer knob scrolls a list and ENT takes the waypoint. PROC opens on the destination's approaches: pick one, a transition, then LOAD? or ACTIVATE?. Its fixes join the flight plan after the en route waypoints. The MFD softkeys work: ENGINE (LEAN, SYSTEM), MAP (layers, airways, terrain and traffic switches), DCLTR, CHKLIST, and each page's own keys. CLR held goes to the navigation map. `onChange` reports `route`, `activeLeg` and `directFrom` when FPL, DIRECT TO or PROC change them.

### Bezel

With the bezel, the mouse works the controls as FlightGear's FG1000 window does: the wheel turns a knob, shift+wheel turns the outer ring of a dual knob, a click pushes a knob or button, shift+click is a long press. HDG (push: sync), CRS (push: centers the course on the station when the CDI is on the tuned NAV and `bearings` has it), BARO, ALT, NAV and COM tuning, frequency swap, and the tuning box work on both units; RANGE works the MFD map and the PFD inset. Every PFD softkey works: INSET (DCLTR, range), PFD (BRG1/BRG2 cycle OFF, NAV1, NAV2, GPS, ADF over `bearings`; WIND; ALT UNIT meters and hPa; STD BARO; DFLTS), OBS, CDI, XPDR (modes, code entry, IDENT), TMR/REF (FMS outer knob picks a field, inner changes it, ENT starts and stops the timer), NRST (FMS scrolls, ENT shows the airport, CLR goes back) and ALERTS. SYN VIS keys switch only their setting; there is no terrain to draw. The NAV and COM volume knobs set `navVolume` and `comVolume` (0 to 1) and show the level for 2 s; NAV push toggles `navIdent`. FPL on the PFD toggles the flight plan window. NAV tunes in 50 kHz steps and COM in 25 kHz steps. `onChange(patch)` reports state the controls changed, so a host can keep a PFD and MFD in step; `onInput({ control, value })` reports every input, including the FMS knob, menu keys and joystick, which the display does not act on.

FG1000 draws the turn rate scale above the compass rose but never moves anything on it; `turnRate` (degrees per second) draws a magenta trend vector there, the heading 6 seconds ahead, as the real unit does.

FlightGear draws the map from its own navigation database. Here the map shows only the points passed in, with FG1000's symbols for airports, VORs, NDBs, fixes and flight plan waypoints, each layer at FG1000's default ranges (airports and VORs up to 150 nm, NDBs and fixes up to 15 nm; flight plan points always). `airspaces` takes Class B, C and D outlines; FG1000 draws none, so they follow the sectional chart: B solid blue, C solid magenta, D dashed blue, shown up to 150 nm.

Open `index.html` through a local web server for a demo with sliders.

## Vue

`vue/` holds the Vue components [instrumentready.com](https://instrumentready.com) uses, driven by one `FlightState` (`state.ts`). Import them as `glass-cockpit-web/vue/Glass.vue`.

- `Glass.vue`: the PFD or MFD.
- `Steam.vue`: steam gauges. Needs the [OpenAttitude](https://github.com/OpenAttitude/library) `@openattitude/*` packages it imports (LGPL-3.0-or-later).
- `KitDemo.vue`: every instrument on one state, with sliders. It reads the page's CSS variables and links to the site's credits page.

`glass-cockpit-web/radio` exports `tuneNav`, which tunes NAV1 and NAV2 to the nearest VOR on the frequency.

## Build

```sh
npm install
npm run build
```

`dist/` is committed so the package can be installed straight from GitHub.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs one job, `build-and-test`, on every pull request to main and every push to main. It uses a standard GitHub-hosted runner, which is free for public repos, and no secrets. It stops at the first failure, which shows as a failed check on the PR with the step named:

1. `npm ci`
2. `npm test`: `tsc`, then the unit tests in `test/`
3. Deletes `dist/` and the generated `src/svg/`, runs `npm run build` and fails if the result differs from what is committed
4. Installs the commit from git, as a site does, then imports `GlassPfd`, `GlassMfd` and `tuneNav` and checks for the files in `vue/`

A new push to a PR cancels that PR's older run. There are no path filters on purpose: a required check whose workflow is filtered out never reports, and its PR waits forever.

The workflow token is read-only. Fork PRs run on `pull_request`, so they get no secrets, and first-time contributors need approval before they run. Code review apps such as Cursor Bugbot and Codex are separate from CI, which neither touches nor depends on them. Leave them out of required checks, so a skipped review can't block a merge.

Not covered:

- Linting: no linter is configured, so strict `tsc` is the only static check.
- `vue/`: the components are not compiled or type checked here, because `vue` and `@openattitude/*` are not dependencies of this package. Only their presence is checked.
- A browser: most of `src/` runs only in the DOM and the unit tests cover the bezel and radio logic, so rendering is not exercised.
- Node versions other than 22.
- instrumentready.com's own build, which is in a private repo.
- New major versions of the two actions: `@v7` picks up fixes on its own, and a new major is a manual bump.

A red check blocks merging only if branch protection requires it. These settings do that, and `enforce_admins: false` lets admins still push to main directly, in which case CI reports after the push:

```sh
gh api -X PUT repos/Tehcnological/glass-cockpit-web/branches/main/protection --input - <<'EOF'
{"required_status_checks":{"strict":false,"contexts":["build-and-test"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}
EOF
```

## Not ported

MFD pages that need data this package has no source for (weather, terrain, XM, trip planning, GPS status, stored flight plans, user waypoints, nearest airspaces), DIRECT TO's VNAV fields, approach suspend and missed-approach sequencing, USER and AIRWAY waypoint lists, synthetic vision, the arc HSI, DME window, selected airspeed, autopilot annunciations, failure flags, the GPS course-to-intercept diamond, and map terrain and airways. FG1000 renders in Liberation Sans Narrow; without that font installed, some narrow labels fall back to a wider font.

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
