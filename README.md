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

- `onChange(patch)` reports state the controls changed, so a host can keep a PFD and MFD in step. Both units also report `route`, `activeLeg`, `directFrom` and `vtf` when the flight plan's PAGE MENU, DIRECT TO or PROC change them.
- `onInput({ control, value })` reports every input, including ones the display does not act on.

### PFD

DIRECT TO and PROC open windows where NRST opens, and work as the MFD's do (see below): DIRECT TO needs `points` and `airports`, PROC `procedures`.

FG1000 draws the turn rate scale above the compass rose but never moves anything on it; `turnRate` (degrees per second) draws a magenta trend vector there, the heading 6 seconds ahead, as the real unit does, with an arrowhead past 4°/s. `turnVector(rate)` returns its path data.

Past +30° or -20° pitch, or 65° bank, the PFD declutters as the Pilot's Guide describes unusual attitudes (FG1000 only removes the command bars): the OAT, wind, inset map, heading and course readouts, baro setting, selected altitude, glideslope and vertical deviation, transponder and clock, autopilot annunciations, and the TMR/REF, NRST, flight plan, PROC, DIRECT TO and setup windows go, and the INSET, PFD, XPDR, IDENT, TMR/REF and NRST softkeys dim. The attitude, airspeed, altitude, vertical speed and HSI stay, with bearing information, the DME window and ALERTS. RANGE, the joystick, MENU, DIRECT TO, PROC and FPL do nothing then, nor do the FMS knobs, ENT and CLR unless ALERTS or the DME window is open. Everything returns as the attitude recovers. `unusualAttitude(pitch, roll)` gives the test, reading bank the short way round (350 is 10° left).

The airspeed tape's color strip comes from the `speedRanges` option, knots: `{ vso, vs1, vfe, vno, vne }`, white from `vso` to `vfe`, green from `vs1` to `vno`, yellow to `vne`, red above, and red under `vso` for low speed awareness. It defaults to the 172S's (`SPEEDS_172S`: 40, 48, 85, 129, 163). Its `vne` also turns the IAS box red when `vne` is not set.

### MFD

The pages draw from what you pass in:

| Field | Used for |
| --- | --- |
| `points` | Map symbols, WPT and NRST details (`name`, `freq` and the rest) |
| `airports` | Runways, frequencies, approach names |
| `stations` | ARTCC, FSS and weather frequencies |
| `airways` | The map's AIRWAYS key: `{ id, type: "LO" \| "HI", points }`, `points` being ids in `points` |
| `procedures` | Approach legs by transition, for PROC |
| `checklists` | CHKLIST |

How the pages work:

- **FMS knob:** picks the page group and page (outer ring, then inner) and, with the cursor on (push), the field. ENT on a frequency tunes it to the standby of NAV or COM.
- **FPL:** shows the active flight plan. With the cursor on, the inner knob opens WAYPOINT ENTRY to insert a waypoint after the selected one, CLR deletes one, ENT on a row makes it the active leg.
- **DIRECT TO:** opens on the selected waypoint with ACTIVATE? highlighted, so ENT goes direct; the inner knob enters another.
- **WAYPOINT ENTRY and DIRECT TO:** turning the inner knob left before typing opens the FPL, NRST and RECENT lists; the outer knob scrolls a list and ENT takes the waypoint.
- **PROC:** opens the PROCEDURES menu (see below). SELECT APPROACH opens on the destination's approaches. Pick one, a transition, then LOAD? or ACTIVATE?. Its fixes join the flight plan after the en route waypoints.
- **Softkeys:** ENGINE (LEAN, SYSTEM), MAP (PROFILE and AIRWAYS; a traffic switch; the data keys are dim), DCLTR, CHKLIST, and each page's own keys.
- **CLR held:** goes to the navigation map.
- **Joystick push:** on the navigation map (and the PFD's inset map), pan mode: a pointer and an info bar (the point under the pointer, or MAP POINTER; distance and bearing from the aircraft; latitude and longitude). The joystick moves the pointer and scrolls the map at its edge. RANGE recenters the map on the pointer. DIRECT TO takes the point under the pointer. Push again, or change page, to end it.

### Bezel controls

With `bezel: true`, the mouse works the controls as FlightGear's FG1000 window does:

| Mouse | Action |
| --- | --- |
| Wheel | Turns a knob |
| Shift+wheel | Turns the outer ring of a dual knob |
| Click | Pushes a knob or button |
| Shift+click, or holding 2 s | Long press: COM ⇄ tunes 121.5 in the active COM; CLR on the MFD goes to the navigation map |
| Click an arrow beside a knob | Turns the knob one detent, left counterclockwise. On a dual knob the upper pair turns the outer ring and the lower pair the inner knob. Holding an arrow keeps turning. RANGE uses the - and + printed beside it. |
| Click the joystick's arrows | Moves the pan pointer: up, down, left, right and the four diagonals. Holding keeps moving it. |

A fast spin of the wheel turns HDG and CRS 5° a notch; a slow one turns 1°. Every knob pushes, ALT included (its push does nothing).

On both units:

- **HDG** (push: sync), **BARO**, **ALT**.
- **CRS** (push: centers the course on the station when the CDI is on the tuned NAV and `bearings` has it).
- **NAV and COM** tuning, frequency swap and the tuning box. NAV tunes in 50 kHz steps and COM in 25 kHz steps.
- **NAV and COM volume** set `navVolume` and `comVolume` (0 to 1) and show the level for 2 s; NAV push toggles `navIdent`.
- **RANGE** works the MFD map and the PFD inset.

Every PFD softkey that is not dim works:

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

`airways` are drawn with the AIRWAYS key (Pilot's Guide): AIRWY ON all, AIRWY LO the low ones in grey, AIRWY HI the high ones in green, over the low. Low airways show at map ranges up to 200 nm, high up to 300; their fixes show at any range while they do. A fix missing from `points` breaks the airway there. Airway names are not labeled, and the Map Setup Airways group is not ported. `glass-cockpit-web/navdata` builds them from NASR (see [Navdata](#navdata)).

**Profile View** (Pilot's Guide; FG1000 has none), from the PROFILE key or the PAGE MENU's Show/Hide Profile View: a window along the bottom of the navigation map with an altitude scale, the aircraft at `alt`, and a distance scale half the map range (PROFILE NOT AVAILABLE under 1 nm); the range box moves above it. A white box on the map marks the path it looks along: the track, 4 nm wide (the en route width; the MFD does not know the flight phase). There is no terrain or obstacle data, so it shows no terrain; its altitude steps and layout are this package's own.

`airspaces` takes Class B, C and D outlines. FG1000 draws none, so they follow the sectional chart: B solid blue, C solid magenta, D dashed blue, shown up to 150 nm.

### Where it follows the G1000 trainer

Where Garmin's G1000 trainer (v13.02, Cessna 172S) and FG1000 differ, this package follows the trainer, in behavior and labels only; the artwork is still FG1000's.

- **Knob arrows:** as on the trainer, clicking beside a knob turns it, and holding keeps turning. Here small arrows (original, not the trainer's) sit above each knob: two pairs on the dual knobs (NAV, ALT, COM, CRS/BARO, FMS), upper for the outer ring and lower for the inner knob, one pair on HDG, and small ones on the volume knobs. RANGE turns on its printed - and +, and the joystick pans in eight directions. A faint glow shows an arrow under the pointer.
- **VSI** scale reads 1 and 2 (thousand fpm) and stops at ±2000 fpm (FG1000: ±4000). The readout shows from 100 fpm, rounded to 50 fpm as the NXi G1000 does; the trainer could not be climbed to check.
- **MENU** on the PFD opens the PFD SETUP MENU (brightness, shown on AUTO; not ported), or with the flight plan window open its PAGE MENU, or in the DIRECT TO window that window's menu (Cancel Direct-To NAV: the flight plan resumes on the leg closest to the aircraft; CLR goes back to DIRECT TO). On the MFD it opens the page's PAGE MENU: on the navigation map, Map Setup, Declutter and Measure Bearing/Distance work. MAP SETUP (Map group) sets ORIENTATION (NORTH UP, TRK UP, DTK UP, HDG UP; `orientation`, reported through `onChange`) and TRACK VECTOR (off, or a light blue line to where the aircraft will be in 30 s to 20 min, always straight); heading, track and desired track are magnetic, and the map adds `magVar`; its other settings are grey. Measure Bearing/Distance (a pointer starts on the aircraft with a dashed line from the start point and the bearing and distance from it in the info bar; ENT moves the start point to the pointer; Stop Measuring or a joystick push ends it; no elevation, as there is no terrain data); on the flight plan page (and the PFD's flight plan window), Invert Flight Plan, Delete Flight Plan and Remove Approach work, and Closest Point Of FPL, Parallel Track and (MFD only, on the waypoint under the cursor) Create ATK Offset Waypoint open windows that follow the Pilot's Guide's steps. Closest Point Of FPL shows the bearing and distance from a reference waypoint to the nearest point on the plan and adds a user waypoint there to `points`, reported through `onChange`. Parallel Track (left or right, 1 to 99 nm) replaces the plan's points from the active leg on, up to an approach, with offset points named with a lower case p that carry `parallel`; a direct-to, loading an approach, editing the plan or activating a leg cancels it, and it is unavailable on a direct-to, an approach leg or a turn over 120 degrees. It does not cancel itself when offset tracks would overlap, and VNV is not ported. An ATK offset (1 to 999 nm, negative before the waypoint) is inserted into the plan; the large FMS knob steps it 10 nm, the small one 1 nm, not digit by digit. Window titles and field names are this package's own; in DIRECT TO, Cancel Direct-To NAV. Other options are listed grey, and the other pages have no menu yet. The FMS knob moves the cursor over the options that work, ENT carries one out, and CLR, MENU again or pushing the FMS knob closes it.
- **FPL and PROC again:** on the MFD, FPL again goes back to the page shown before it, and PROC again closes the PROCEDURES window.
- **Pan mode** (FG1000 has none): the joystick push on the MFD navigation map and the PFD inset map, as the Pilot's Guide and the trainer describe. The pointer and bar are drawn here, not Garmin's.
- **WPT - APPROACH INFORMATION** (Pilot's Guide; FG1000 has none): the airport page's softkeys are INFO-1, DP, STAR, APR and WX. APR shows the airport's approaches (grey where `procedures` has none), the selected one's transitions, BARO minimums and its fix sequence, and previews it on the map, white with the missed approach dashed; INFO-1 goes back. The FMS knob and ENT step airport, approach, transition, minimums and sequence as the Pilot's Guide does. Its window is this package's own layout, in Map Setup's style. The minimums stay on this page (the PFD's are set at TMR/REF). DP, STAR and WX are grey (no departure, arrival or weather data), and INFO-2 (the AOPA directory) is not ported.
- **AUX - SYSTEM SETUP** (Pilot's Guide; FG1000 has none), added to the AUX group after GPS STATUS: the date and time (local 12 or 24 hour with an offset, or UTC), the MFD data bar's four fields (BRG, DIS, DTK, END, ETA, ETE, FOB, GS, TKE, TRK; BRG and DIS to the active waypoint, FOB and END from the fuel gauges), page navigation (change on the first click, tab timeout 2 to 10 s) and the nearest airport criteria (runway surface and minimum length, which filter NRST - NEAREST AIRPORTS; airports without runway data stay). Numbers step with the small FMS knob (30 min, 1 s, 100 ft) rather than being typed. Display units, the baro transition, airspace, arrival and audio alerts, the flight director, GPS CDI and COM spacing are shown grey. The settings live in the MFD and are not reported to the host.
- **AUX - UTILITY** (Pilot's Guide): the generic timer (UP or DN from a time, START?, STOP?, RESET?; a countdown past zero counts up), the flight timer and departure time from power on or lift off (taken as 30 kt groundspeed: the MFD has no air/ground switch), and trip statistics (odometer, trip odometer, average and maximum groundspeed, from `groundspeed` sampled each second; a gap over a minute is not counted). Its PAGE MENU resets them. The scheduler and flight data logger are not ported.
- **NEAREST AIRPORTS LD APR** (Pilot's Guide; FG1000 has none): with an approach under the cursor, LD APR or the PAGE MENU's Load Approach opens PROC's SELECT APPROACH on it at its transitions (LOAD? when it has one); it is grey when `procedures` has no such approach. The PAGE MENU also selects the airport, runway, frequency and approach windows, and ENT on the airport list moves to the next airport.
- **PFD DIRECT TO and PROC** (FG1000 has neither): windows in the NRST window's place, laid out as the trainer's, sharing the MFD's flow. DIRECT TO and PROC again close them.
- **Long press:** holding COM ⇄ or CLR for 2 s acts as on the real unit (FG1000: a separate key binding); COM ⇄ tunes 121.5, where FG1000 tunes 121.00.
- **Pitch ladder:** shown inside a circle under the roll scale, wide enough for the 20° labels, cut flat at the top of the heading box, fixed on the screen (FG1000: a rectangle from y 70, through the pointer, to 370). Red chevrons pointing to the horizon from 50° nose up and 30° nose down (Pilot's Guide); FG1000 has none, so their shape and spacing are this package's own.
- **Airspeed tape:** the color-coded speed range strip along its right edge (Pilot's Guide); FG1000's tape has none. Where the flap range overlaps the normal range, white takes the inner half.
- **Heading box:** 17.2 px higher than FG1000's, sitting on the turn rate band instead of over its top.
- **Attitude and turn rate** (Pilot's Guide): the turn rate band has ticks at half-standard and standard rate each side, with the trend vector drawn through them. FG1000 draws the band alone.
- **Bezel shading:** FG1000's fascia shades its left column darker than its right (an extra overlay and a fainter edge strip); here both match the right.
- **Colors:** the cursor and selectable text are full cyan (FG1000: a paler #80ffff), and the page group window shows the selected page in cyan and the rest in white (FG1000: lilac and grey).

- **Softkey layouts** follow the trainer: DME on the PFD's top row and PFD menu; WX LGND, PRECIP and METAR in the inset menu; DCLTR, SHW CHRT and CHKLIST in the last three MFD slots; BACK in the eleventh slot of the ENGINE, LEAN, SYSTEM and MAP menus; LEAN's CYL SLCT and ASSIST and SYSTEM's RST FUEL and GAL REM where the trainer has them.
- **Dim keys:** a key whose function is unavailable is grey and does nothing. OBS is dim with no flight plan. Keys for data this package has no source for (weather, topography, terrain, charts, map legend) are always dim. The inset's DCLTR stays working, although the trainer dims it.
- **ADVISORY:** the last PFD softkey reads ADVISORY, lit, while a message in `alerts` is unread (one the ALERTS window has not shown, compared by text), and ALERTS once the window has shown it. The trainer flashes it; here it is lit steadily.
- **CDI label** names the station type: GPS, VOR1, LOC1, VOR2 or LOC2, from the NAV radio's active frequency (FG1000: NAV1, NAV2). The course box reads DTK on GPS and CRS on a NAV radio. `cdiLabel` and `isLocalizer` are exported from `glass-cockpit-web/radio`.
- **TMR/REF** is titled REFERENCES, with the timer and the minimums each on one row and the glide speed as GLIDE. The speed references start off (`vspeedsOn` all false); turn them on there, or set `vspeedsOn`.
- **Failures:** `failed` flags instruments with FG1000's red X and yellow text. Set them as the trainer fails its units:

  | Trainer failure | `failed` | Also |
  | --- | --- | --- |
  | AHRS (GRS) | `attitude` | |
  | Air data (GDC) | `airspeed`, `altitude`, `vsi` | The baro box stays |
  | GPS | none | Add a "GPS NAV LOST" message to `alerts` and set `cdiValid: false` on GPS |

  `heading` flags the heading box (FG1000's flag; the trainer's magnetometer failure was not checked). FG1000's NO GPS POSITION flag is not used on the PFD.
- **DME:** PFD > DME shows the DME window left of the HSI: the NAV radio, its active frequency and the distance from `bearings` (dashes without one). The top-row DME key opens DME TUNING, where the small FMS knob switches NAV1 and NAV2. No HOLD.
- **PROC** opens a PROCEDURES menu: ACTIVATE VECTOR-TO-FINAL and ACTIVATE APPROACH (grey until an approach is loaded), ACTIVATE MISSED APPROACH (grey until one with a missed approach is loaded), SELECT APPROACH, and SELECT ARRIVAL and SELECT DEPARTURE (always grey, not ported). Activating an approach the GPS may not fly (anything but RNAV (GPS) and GPS approaches), from ACTIVATE? or the menu, asks NOT APPROVED FOR GPS, YES or NO; NO goes back without activating. CLR goes back from SELECT APPROACH to the menu. PROC marks the fixes it loads with `approach` (the approach's name), which is how it finds the loaded approach. ACTIVATE with the VECTORS transition, or ACTIVATE VECTOR-TO-FINAL, makes the final approach fix active with no leg from the aircraft (direct from the aircraft when the approach has no fix before its FAF), and sets `vtf` on the unit (reported through `onChange`; the PFD keeps it too, which dims Cancel Direct-To NAV) so a host can label the PFD's active leg, as the trainer does: `{ from: "vtf 356°", to: "TWOFA faf" }`. The PFD flight plan tags approach fixes in lowercase: `faf`, `map`. `gpsApproved` and `vtfLeg` are exported for hosts.

## Navdata

`glass-cockpit-web/navdata` turns the FAA's public domain NASR and CIFP files into the data the displays take. It runs at build time, in Node or anywhere else, and has no dependencies. Fetching and unpacking the files is the host's job: instrumentready.com downloads each 28-day cycle and reads the CSVs with `csv-parse`, the zips with `fflate`, and the airspace shapefile with `shapefile` and `simplify-js`.

| Function | Takes | Returns |
| --- | --- | --- |
| `buildNasr(cycle, csv, airspace)` | The NASR CSV rows by file (`NAV_BASE`, `FIX_BASE`, `APT_BASE`, `APT_RWY`, `FRQ`, `ILS_BASE`, and optionally `AWY_SEG_ALT` from the AWY zip), as objects of column name to value; Class B, C and D airspace records the host built | `Nasr`: navaids, fixes, public-use airports, ARTCC/FSS/weather frequencies, airspace, airways |
| `parseCifp(text)` | The CIFP file `FAACIFP18` (ARINC 424) as text | `Cifp["procedures"]`: approaches with transitions, legs, altitudes and fix roles |
| `near(nasr, cifp, lat, lon, range)` | The two above, a position and a range in nm | `{ points, airspaces, airports, stations, procedures, airways }` for `set()`. VORs, NDBs and stations reach 200 nm, as the NRST pages do. Airways come as their segments within range, whole, and their points beyond range join `points` |
| `approachName(id)` | A CIFP approach id such as `R08-Y` | The chart name, `RNAV (GPS) Y RWY 08` |

Airways are the Victor and T routes (`LO`) and the jet and Q routes (`HI`), as AIM 5-3-4 splits them; colored, oceanic and helicopter routes are left out. An airway breaks where NASR marks a gap and where a point has no navaid or fix record (border points, DME and TACAN points, navaids out of service), so every point `near` returns on one is in `points`. The record keeps each point's type (VOR, NDB or fix), so a fix and a navaid sharing an id are told apart; where another point in `points` has an airway point's id, the airway's comes last, the one the map uses. Rows may come in any order. Distances are measured the short way across 180 degrees longitude.

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

- MFD pages that need data this package has no source for: weather, terrain, XM, trip planning, GPS status, system status, stored flight plans, user waypoints, nearest airspaces.
- AUX - UTILITY's scheduler and flight data logger, and the AUX - SYSTEM SETUP settings shown grey.
- DIRECT TO's VNAV fields, approach suspend and missed-approach sequencing.
- USER and AIRWAY waypoint lists.
- Synthetic vision, the arc HSI, DME HOLD, selected airspeed, autopilot annunciations and the GPS course-to-intercept diamond.
- Map terrain (and Profile View's terrain), airway labels and the Map Setup Airways and Profile groups.
- The audio panel (and its reversionary mode button), and typing waypoint names on the keyboard.
- PAGE MENU on pages other than the navigation map, flight plan and DIRECT TO, and most of its options; display brightness; the trainer's DEMO MODE page (MENU twice).
- The autopilot keys the trainer's MFD bezel has (AP, FD, HDG, ALT, NAV, VNV, APR, BC, VS, FLC, UP, DN), reversionary mode, and the map's range ring and measure bearing/distance in pan mode.

FG1000 renders in Liberation Sans Narrow, which is not bundled. Without that font installed, some narrow labels fall back to a wider font.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in [SECURITY.md](SECURITY.md), not in a public issue. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
