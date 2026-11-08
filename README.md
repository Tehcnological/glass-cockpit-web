# glass-cockpit-web

[![CI](https://github.com/Tehcnological/glass-cockpit-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Tehcnological/glass-cockpit-web/actions/workflows/ci.yml)
[![License: GPL-2.0-or-later](https://img.shields.io/badge/license-GPL--2.0--or--later-blue)](LICENSE)

A working glass cockpit for the browser: PFD and MFD in a bezel whose knobs, buttons and softkey menus work with the mouse. No runtime dependencies.

- **PFD:** attitude, airspeed and altitude tapes, vertical speed, HSI with course deviation, glideslope, bearing pointers, marker beacons, NAV/COM radios and the active leg across the top, and the softkey menus: inset map, nearest airports, transponder, wind, timer and references with minimums, alerts.
- **MFD:** engine strip, radios and GS/DTK/TRK/ETE across the top, and the page groups the FMS knob steps through: navigation and traffic maps, NRST (airports, VORs, NDBs, intersections, frequencies), WPT information (airport, VOR, NDB, intersection), the active flight plan, checklists, DIRECT TO and PROC (approach loading). Pages with no data to show (weather, terrain, trip planning, GPS status and others) show their title and NO DATA.

It is a TypeScript port of [FlightGear](https://www.flightgear.org/)'s FG1000, by Stuart Buchanan. The SVG artwork is FG1000's and the display logic is ported from its Nasal code; see [NOTICE.md](NOTICE.md). It is not affiliated with or endorsed by Garmin.

For training and simulation only. Not for navigation or flight use.

## Contents

- [Install](#install)
- [Use](#use): [PFD](#pfd), [MFD](#mfd), [Bezel controls](#bezel-controls), [Map](#map)
- [Navdata](#navdata)
- [Vue](#vue)
- [Demo](#demo)
- [Develop](#develop)
- [CI](#ci)
- [Not ported](#not-ported)
- [Contributing](#contributing)
- [License](#license)

## Install

The package is installed from GitHub, not npm:

```sh
npm install github:Tehcnological/glass-cockpit-web
```

| Import | What it is |
| --- | --- |
| `glass-cockpit-web` | `GlassPfd`, `GlassMfd` and their types |
| `glass-cockpit-web/radio` | `tuneNav`, which tunes NAV1 and NAV2 to the nearest VOR on the frequency |
| `glass-cockpit-web/navdata` | Build-time FAA NASR and CIFP transformations: `buildNasr`, `parseCifp`, `near`, `approachName` (see [Navdata](#navdata)). The displays never load it |
| `glass-cockpit-web/vue/*` | The Vue components (see [Vue](#vue)); `vue` is an optional peer dependency |

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

The container must be in the page and visible when a display is created, since rotation centers and clipping are measured from the rendered SVG. `set()` takes any subset of the state; see `PfdState` in [`src/glass-pfd.ts`](src/glass-pfd.ts) and `MfdState` in [`src/glass-mfd.ts`](src/glass-mfd.ts) for every field and its units.

Two callbacks let a host follow the controls:

- `onChange(patch)` reports state the controls changed, so a host can keep a PFD and MFD in step. On the MFD it also reports `route`, `activeLeg` and `directFrom` when FPL, DIRECT TO or PROC change them.
- `onInput({ control, value })` reports every input, including the FMS knob, menu keys and joystick, which the display does not act on.

### PFD

FG1000 draws the turn rate scale above the compass rose but never moves anything on it; `turnRate` (degrees per second) draws a magenta trend vector there, the heading 6 seconds ahead, as the real unit does.

### MFD

The pages draw from what you pass in:

| Field | Used for |
| --- | --- |
| `points` | Map symbols, WPT and NRST details (`name`, `freq` and the rest) |
| `airports` | Runways, frequencies, approach names |
| `stations` | ARTCC, FSS and weather frequencies |
| `procedures` | Approach legs by transition, for PROC |
| `checklists` | CHKLIST |

How the pages work:

- **FMS knob:** picks the page group and page (outer ring, then inner) and, with the cursor on (push), the field. ENT on a frequency tunes it to the standby of NAV or COM.
- **FPL:** shows the active flight plan. With the cursor on, the inner knob opens WAYPOINT ENTRY to insert a waypoint after the selected one, CLR deletes one, ENT on a row makes it the active leg.
- **DIRECT TO:** opens on the selected waypoint with ACTIVATE? highlighted, so ENT goes direct; the inner knob enters another.
- **WAYPOINT ENTRY and DIRECT TO:** turning the inner knob left before typing opens the FPL, NRST and RECENT lists; the outer knob scrolls a list and ENT takes the waypoint.
- **PROC:** opens on the destination's approaches. Pick one, a transition, then LOAD? or ACTIVATE?. Its fixes join the flight plan after the en route waypoints.
- **Softkeys:** ENGINE (LEAN, SYSTEM), MAP (layers, airways, terrain and traffic switches), DCLTR, CHKLIST, and each page's own keys.
- **CLR held:** goes to the navigation map.

### Bezel controls

With `bezel: true`, the mouse works the controls as FlightGear's FG1000 window does:

| Mouse | Action |
| --- | --- |
| Wheel | Turns a knob |
| Shift+wheel | Turns the outer ring of a dual knob |
| Click | Pushes a knob or button |
| Shift+click | Long press |

On both units:

- **HDG** (push: sync), **BARO**, **ALT**.
- **CRS** (push: centers the course on the station when the CDI is on the tuned NAV and `bearings` has it).
- **NAV and COM** tuning, frequency swap and the tuning box. NAV tunes in 50 kHz steps and COM in 25 kHz steps.
- **NAV and COM volume** set `navVolume` and `comVolume` (0 to 1) and show the level for 2 s; NAV push toggles `navIdent`.
- **RANGE** works the MFD map and the PFD inset.

Every PFD softkey works:

- **INSET:** DCLTR, range.
- **PFD:** BRG1/BRG2 cycle OFF, NAV1, NAV2, GPS, ADF over `bearings`; WIND; ALT UNIT meters and hPa; STD BARO; DFLTS.
- **OBS, CDI.**
- **XPDR:** modes, code entry, IDENT.
- **TMR/REF:** the FMS outer knob picks a field, the inner changes it, ENT starts and stops the timer.
- **NRST:** FMS scrolls, ENT shows the airport, CLR goes back.
- **ALERTS:** lists `alerts`, one string per message, written "TITLE - description" as the trainer shows them.
- **SYN VIS** keys switch only their setting; there is no terrain to draw.
- **FPL** toggles the flight plan window.

### Map

FlightGear draws the map from its own navigation database. Here the map shows only the points passed in, with FG1000's symbols for airports, VORs, NDBs, fixes and flight plan waypoints, each layer at FG1000's default ranges: airports and VORs up to 150 nm, NDBs and fixes up to 15 nm, flight plan points always.

`airspaces` takes Class B, C and D outlines. FG1000 draws none, so they follow the sectional chart: B solid blue, C solid magenta, D dashed blue, shown up to 150 nm.

### Where it follows the G1000 trainer

Where Garmin's G1000 trainer (v13.02, Cessna 172S) and FG1000 differ, this package follows the trainer, in behavior and labels only; the artwork is still FG1000's.

- **Softkey layouts** follow the trainer: DME on the PFD's top row and PFD menu; WX LGND, PRECIP and METAR in the inset menu; DCLTR, SHW CHRT and CHKLIST in the last three MFD slots; BACK in the eleventh slot of the ENGINE, LEAN, SYSTEM and MAP menus; LEAN's CYL SLCT and ASSIST and SYSTEM's RST FUEL and GAL REM where the trainer has them.
- **Dim keys:** a key whose function is unavailable is grey and does nothing. OBS is dim with no flight plan. Keys for data this package has no source for (weather, topography, terrain, charts, map legend) are always dim. The inset's DCLTR stays working, although the trainer dims it.
- **ADVISORY:** the last PFD softkey reads ADVISORY, lit, while a message in `alerts` is unread, and ALERTS once the window has shown it. The trainer flashes it; here it is lit steadily.
- **CDI label** names the station type: GPS, VOR1, LOC1, VOR2 or LOC2, from the NAV radio's active frequency (FG1000: NAV1, NAV2). The course box reads DTK on GPS and CRS on a NAV radio. `cdiLabel` and `isLocalizer` are exported from `glass-cockpit-web/radio`.

## Navdata

`glass-cockpit-web/navdata` turns the FAA's public domain NASR and CIFP files into the data the displays take. It runs at build time, in Node or anywhere else, and has no dependencies. Fetching and unpacking the files is the host's job: instrumentready.com downloads each 28-day cycle and reads the CSVs with `csv-parse`, the zips with `fflate`, and the airspace shapefile with `shapefile` and `simplify-js`.

| Function | Takes | Returns |
| --- | --- | --- |
| `buildNasr(cycle, csv, airspace)` | The NASR CSV rows by file (`NAV_BASE`, `FIX_BASE`, `APT_BASE`, `APT_RWY`, `FRQ`, `ILS_BASE`), as objects of column name to value; Class B, C and D airspace records the host built | `Nasr`: navaids, fixes, public-use airports, ARTCC/FSS/weather frequencies, airspace |
| `parseCifp(text)` | The CIFP file `FAACIFP18` (ARINC 424) as text | `Cifp["procedures"]`: approaches with transitions, legs, altitudes and fix roles |
| `near(nasr, cifp, lat, lon, range)` | The two above, a position and a range in nm | `{ points, airspaces, airports, stations, procedures }` for `set()`. VORs, NDBs and stations reach 200 nm, as the NRST pages do |
| `approachName(id)` | A CIFP approach id such as `R08-Y` | The chart name, `RNAV (GPS) Y RWY 08` |

```js
import { near } from "glass-cockpit-web/navdata";

mfd.set({ lat: 33.4, lon: -111.9, ...near(nasr, cifp, 33.4, -111.9, 40) });
```

Keep the output small for the client: `near` once at build time, and ship only its result. The data is not for navigation.

## Vue

[`vue/`](vue/) holds the Vue components [instrumentready.com](https://instrumentready.com) uses, driven by one `FlightState` ([`vue/state.ts`](vue/state.ts)). Import them as `glass-cockpit-web/vue/Glass.vue`. They are shipped as source, so the site's own Vue build compiles them.

- `Glass.vue`: the PFD or MFD.
- `Steam.vue`: steam gauges. Needs the [OpenAttitude](https://github.com/OpenAttitude/library) `@openattitude/*` packages it imports (LGPL-3.0-or-later), which this package does not install.
- `KitDemo.vue`: every instrument on one state, with sliders. It reads the page's CSS variables and links to the site's credits page.

## Demo

[`index.html`](index.html) is a demo with sliders. It loads `dist/` as ES modules, so serve the repo over HTTP rather than opening the file:

```sh
npx serve .
```

## Develop

Needs Node 22 or newer.

```sh
npm install
npm test        # tsc, then the unit tests in test/
npm run build   # regenerates src/svg/ from src/fg1000/, then compiles to dist/
```

`dist/` and the generated `src/svg/` are committed so the package can be installed straight from GitHub. Run `npm run build` and commit the result with every source change; CI fails if they are stale. There is no `prepare` script on purpose.

Layout:

| Path | What it is |
| --- | --- |
| `src/glass-pfd.ts`, `src/glass-mfd.ts` | The two displays and their state types |
| `src/fg1000/` | FG1000's SVG artwork |
| `src/svg/` | Generated by `scripts/build-svg.mjs`; do not edit |
| `src/display.ts`, `src/bezel.ts` | One display unit's SVG, the bezel and its mouse input |
| `src/surround.ts`, `src/ui.ts` | Radios and softkey labels around every page; softkeys, the FMS cursor and lists |
| `src/mfd-pages.ts`, `src/page.ts` | MFD pages and how they find their SVG elements |
| `src/map.ts`, `src/nav.ts` | The navigation map, the navigation data types and shared arithmetic |
| `src/radio.ts` | NAV tuning to VORs, including `tuneNav` |
| `src/navdata.ts` | The `navdata` export: NASR and CIFP transformations, build time only |
| `test/` | Unit tests (`node --test`) |
| `test/fixtures/` | Real NASR rows from cycle 2026-10-29 and the records instrumentready.com built from them, for `buildNasr` |
| `vue/` | Vue components |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs one job, `build-and-test`, on every pull request to main and every push to main. It uses a standard GitHub-hosted runner, which is free for public repos, and no secrets. It stops at the first failure, which shows as a failed check on the PR with the step named:

1. `npm ci`
2. `npm test`: `tsc`, then the unit tests in `test/`
3. Deletes `dist/` and the generated `src/svg/`, runs `npm run build` and fails if the result differs from what is committed
4. Installs the commit from git, as a site does, then imports `GlassPfd`, `GlassMfd`, `tuneNav` and the four `navdata` functions, fails if the main entry references `navdata`, and checks for the files in `vue/`

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

- MFD pages that need data this package has no source for: weather, terrain, XM, trip planning, GPS status, stored flight plans, user waypoints, nearest airspaces.
- DIRECT TO's VNAV fields, approach suspend and missed-approach sequencing.
- USER and AIRWAY waypoint lists.
- Synthetic vision, the arc HSI, DME window, selected airspeed, autopilot annunciations, failure flags and the GPS course-to-intercept diamond.
- Map terrain and airways.

FG1000 renders in Liberation Sans Narrow, which is not bundled. Without that font installed, some narrow labels fall back to a wider font.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in [SECURITY.md](SECURITY.md), not in a public issue. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
