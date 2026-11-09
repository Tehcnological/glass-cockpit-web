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

The package is installed from GitHub, not npm. Pin a commit, so package.json names it and `npm update` can't move it:

```sh
npm install github:Tehcnological/glass-cockpit-web#<commit>
```

To update, run the same command with the new commit.

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

- `onScheduler(message)` (MFD) hands over a scheduler message from AUX - UTILITY when it comes due; add it to the PFD's `alerts` and the ALERTS key reads ADVISORY. The demo does. The host decides when to take it off.
- `onChange(patch)` reports state the controls changed, so a host can keep a PFD and MFD in step. Both units also report `route`, `activeLeg`, `directFrom`, `vtf` and `susp` when the flight plan's PAGE MENU, DIRECT TO, PROC or SUSP change them, and `susp` when the aircraft passes the missed approach point or a hold becomes the active leg.
- `onInput({ control, value })` reports every input, including ones the display does not act on.

A hold in `route` is an entry of its own, a point right after the fix it holds at, at the fix's position, with `hold: { course, turn: "L" | "R", time?, distance? }` (inbound course, magnetic degrees; legs in minutes or nm; `Hold` in [`src/nav.ts`](src/nav.ts)). The displays do not move the aircraft, so the host sequences the plan: `sequenceLeg(route, activeLeg)` gives the leg to fly once the aircraft reaches the active waypoint, which makes a hold fix's hold active and keeps a hold active until the pilot presses SUSP, removes it or activates another leg; while a hold is active both units set `susp` (see SUSP below). The leg into a hold has no length, so `bearingDistance` over it gives nothing usable: while the active entry is a hold, fly `hold.course` (magnetic) as the desired track to the fix; the racetrack on the map is advisory.

### PFD

DIRECT TO and PROC open windows where NRST opens, and work as the MFD's do (see below): DIRECT TO needs `points` and `airports`, PROC `procedures`.

FG1000 draws the turn rate scale above the compass rose but never moves anything on it; `turnRate` (degrees per second) draws a magenta trend vector there, the heading 6 seconds ahead, as the real unit does, with an arrowhead past 4°/s. `turnVector(rate)` returns its path data.

Moving text (the airspeed and altitude tapes and their rolling digits, the VSI pointer, the pitch ladder, map labels) carries a 0.05° rotation that FG1000 does not: Chrome draws text under a pure translation on whole pixels, so the numbers stepped while the lines beside them glided. The rotation is under a tenth of a pixel across a label (`TEXT_GLIDE` in `src/page.ts`).

Past +30° or -20° pitch, or 65° bank, the PFD declutters as the Pilot's Guide describes unusual attitudes (FG1000 only removes the command bars): the OAT, wind, inset map, heading and course readouts, baro setting, selected altitude, glideslope and vertical deviation, transponder and clock, autopilot annunciations, and the TMR/REF, NRST, flight plan, PROC, DIRECT TO and setup windows go, and the INSET, PFD, XPDR, IDENT, TMR/REF and NRST softkeys dim. The attitude, airspeed, altitude, vertical speed and HSI stay, with bearing information, the DME window and ALERTS. RANGE, the joystick, MENU, DIRECT TO, PROC and FPL do nothing then, nor do the FMS knobs, ENT and CLR unless ALERTS or the DME window is open. Everything returns as the attitude recovers. `unusualAttitude(pitch, roll)` gives the test, reading bank the short way round (350 is 10° left).

### Autopilot

The GFC 700 flight director and autopilot (Pilot's Guide; the most capable of the 172S's two autopilot options, the other being the KAP 140). FG1000 has no autopilot logic and leaves the AFCS fields blank. Its keys are drawn in the MFD bezel's left column, where the v13 trainer and the GDU 1044B have them: AP, FD, HDG, ALT, NAV, VNV, APR, BC, VS, FLC, NOSE UP and NOSE DN (option `afcsKeys`, on for the MFD, off for the PFD; FG1000's bezel is the GDU 1040's, so they are drawn as copies of its FPL key). A press reaches `onInput` as `{ control: "AP" }` and the like.

The logic is `Afcs`, without the DOM, owned by the host, since its keys are on one unit and its annunciations on the other:

```js
import { Afcs, AFCS_KEYS } from "glass-cockpit-web";
const afcs = new Afcs({ maxSpeed: 140 }); // the aircraft's highest autopilot airspeed, knots
const mfd = new GlassMfd(el, { bezel: true, onInput: (i) => AFCS_KEYS.includes(i.control) && afcs.press(i.control) });
// Each frame, with the PFD's state (and `vnv`, `onGround` if the host has them):
const out = afcs.update(pfdState, performance.now());
pfd.set({ ...pfdState, fd: out.fd, afcs: out.display });
if (out.ap) flyToward(out.fd); // the host moves the aircraft; GCW only draws
```

`press` also takes the yoke's `AP_DISC` and the panel's `GA`; `cws(down)` holds control wheel steering. It covers:

- Flight director activation as the Pilot's Guide tabulates it (FD and AP in ROL and PIT; ALT, VS, FLC, HDG, NAV, APR, BC and VNV in their own modes), the FD key disabled while the autopilot is engaged, and a mode's key pressed again reverting that axis to ROL or PIT.
- Lateral: ROL (wings level under 6°, holds to 22°), HDG (turning the way the bug went, past 340° reversing), NAV and APR on GPS, VOR (VAPP) or LOC, and BC, armed beyond one dot and captured inside it; LOC within 105° of the course. Bank is limited to 22° and standard rate, 10° once established on a VOR or localizer. Switching the CDI or tuning another VOR reverts to ROL; losing the signal rolls wings level with ROL flashing yellow.
- Vertical: PIT (NOSE keys 0.5°, -15° to +20°), ALT (to the nearest 10 ft), VS (100 fpm, -2000 to +1500), FLC (1 kt, 80 to 200, never climbing or descending away from the selected altitude), ALTS armed with PIT, VS, FLC and GA and capturing to ALT at 50 ft, GS on a localizer approach and GP on an LPV, L/VNAV or LNAV+V approach, VNV (VPTH and ALTV, with the descent acknowledged by VNV or a new selected altitude) from the host's `vnv` profile, and GA (TO on the ground), which disconnects the autopilot.
- Annunciations: armed white, active green, an automatic transition flashing green for 10 s, a lost mode yellow; AP green, CWS white, a manual disconnect flashing yellow for 5 s and an automatic one (attitude failure) red until AP DISC. FLC's airspeed reference shows above the airspeed tape with its bug, and MAXSPD flashes there past `maxSpeed` (the flight director pitches up).
- Command bars limited to +20°/-15° pitch and 22° bank.

The pitch and roll laws are this package's own, simple proportional ones: the command bars point the right way at sensible rates, not as a certified GFC 700 would fly. The demo flies its sliders toward them with a toy model, and has AP DISC, CWS and GA buttons.

At power-up the AHRS aligns before attitude is valid (Line Maintenance Manual; FG1000 starts with everything valid). For the first `startup` seconds (option, default `AHRS_ALIGN_S`, 45; `0` skips it) the attitude area has no horizon and shows FG1000's red X with AHRS ALIGN: Keep Wings Level in yellow, in a black box of this package's own (FG1000 has no alignment annunciation), and the heading box is flagged, as the magnetometer's data comes through the AHRS. Airspeed, altitude and vertical speed are flagged for the first `ADC_START_S` (5 s; assumed, as the manuals give only the AHRS's time). These add to the host's `failed`, which they do not change. `pfd.aligning` is true while it aligns, and `onChange` reports `{ aligning: false }` once when it ends: a host passes `failed.attitude` to `Afcs.update` until then, so the autopilot cannot engage, as the demo does. `Startup` (exported) holds the timers. The demo and `KitDemo.vue` align on load; `Glass.vue` takes a `startup` prop.

Once attitude is valid (the first `update` without `failed.attitude`, so after the AHRS aligns), `Afcs` runs the GFC 700's preflight test for `pft` seconds (option, default `PFT_S`, 5, assumed: the Pilot's Guide gives no time; `0` skips it). Until it passes the autopilot and flight director cannot engage: every key, switch and CWS press is ignored (the Pilot's Guide gives no refusal of its own), and PFT shows in white in the AFCS status alert box above the airspeed tape. When it passes the box clears and the `onPreflightPass` option is called once, where the real unit sounds the autopilot disconnect tone; the host plays any sound. The host flags AFCS failures in `Afcs.update`'s input as `faults`: `roll`, `pitch` and `system` show ROLL, PTCH or SYS in red, disconnect the autopilot as an automatic disconnect (red AP until AP DISC) and keep it from engaging, the flight director staying on; `pft` fails the preflight test, PFT in red, keeping both off. One alert shows at a time, SYS first, then PTCH, ROLL and PFT; it comes out as `display.alert`. FG1000 has no art for these alerts, so the box is this package's own, in the AFCS status box's style (black, a white border, the header's text size), above FLC's airspeed reference box. The demo runs the test after alignment.

The airspeed tape's color strip comes from the `speedRanges` option, knots: `{ vso, vs1, vfe, vno, vne }`, white from `vso` to `vfe`, green from `vs1` to `vno`, yellow to `vne`, red above, and red under `vso` for low speed awareness. It defaults to the 172S's (`SPEEDS_172S`: 40, 48, 85, 129, 163). Its `vne` also turns the IAS box red when `vne` is not set.

`reversionary: true` puts the PFD in reversionary mode, as the Pilot's Guide shows it (FG1000 does not wire it): the MFD's engine strip down the left on a black backing, drawn from `engine` (the MFD's `Engine`), OAT under TAS, the inset map in the lower right, and ENGINE on the first softkey (ENGINE, LEAN and SYSTEM, with their pages, as on the MFD). FG1000's PFD already keeps the strip's width clear of the flight instruments, so they stay where they are. DISPLAY BACKUP puts both displays in reversionary mode, so the host sets it on the PFD and shows a second `GlassPfd` with it in the MFD's place; the demo lays one over the MFD, which keeps its pages for when the button is pushed again. A display that fails sends the other into reversionary mode on its own (Line Maintenance Manual): `displayModes(backup, pfdPowered, mfdPowered)` (exported with `DisplayBackup`) gives each display's mode, `normal`, `reversionary` or `off`, and the `failed` radios to cross out on the one left: COM/NAV 2 on the PFD when the MFD fails, COM/NAV 1 on the MFD's place when the PFD fails. The demo's fail PFD and fail MFD boxes show it. `Glass.vue` takes a `reversionary` prop, with `mfd.engine` for the strip.

### MFD

The pages draw from what you pass in:

| Field | Used for |
| --- | --- |
| `points` | Map symbols, WPT and NRST details (`name`, `freq` and the rest) |
| `airports` | Runways, frequencies, approach names |
| `stations` | ARTCC, FSS and weather frequencies |
| `airways` | The map's AIRWAYS key: `{ id, type: "LO" \| "HI", points }`, `points` being ids in `points` |
| `procedures` | Approaches, departures (SIDs) and arrivals (STARs) with their legs by transition (and runway), for PROC and the WPT airport page (see `Procedure`) |
| `checklists` | CHKLIST |
| `engine` | The engine strip (`Engine`: RPM, fuel flow, oil, `egt` as 0 to 1 of the gauge, vacuum, fuel, volts, engine hours); optional `cylinders`, four `{ egt, cht }` in degrees F, for the LEAN page |

How the pages work:

- **FMS knob:** picks the page group and page (outer ring, then inner) and, with the cursor on (push), the field. ENT on a frequency tunes it to the standby of NAV or COM.
- **FPL:** shows the active flight plan. With the cursor on, the inner knob opens WAYPOINT ENTRY to insert a waypoint after the selected one, CLR deletes one, ENT on a row makes it the active leg.
- **DIRECT TO:** opens on the selected waypoint with ACTIVATE? highlighted, so ENT goes direct; the inner knob enters another.
- **WAYPOINT ENTRY and DIRECT TO:** turning the inner knob left before typing opens the FPL, NRST, RECENT and USER lists; the outer knob scrolls a list and ENT takes the waypoint.
- **User waypoints** are `points` of type `WPT` (the host's, and those Closest Point Of FPL, Hold At Present Position and WPT - USER WPT INFORMATION make). Creating, renaming, moving and deleting them is reported through `onChange` as `points` (and `route` when the plan has them). See WPT - USER WPT INFORMATION below.
- **PROC:** opens the PROCEDURES menu (see below), a window over the page. SELECT APPROACH opens PROC - APPROACH LOADING (Pilot's Guide; the trainer uses a window): the approach previewed on the map beside the airport, approach, transition, minimums and fix sequence boxes of WPT - APPROACH INFORMATION. Pick an approach, a transition, BARO minimums (ENT skips them; the page opens on the minimums already set), then LOAD? or ACTIVATE?. Its fixes join the flight plan after the en route waypoints, and minimums set here are reported as `minimums` through `onChange`, for the PFD's (the demo and `Glass.vue` pass them on). The PFD's PROC window steps the same way, with a MINIMUMS row.
- **Engine strip:** ENGINE shows FG1000's ENGINE page; LEAN and SYSTEM show their pages until BACK or another menu. LEAN (Pilot's Guide): fuel flow, then EGT per cylinder as four bars under the selected cylinder's value (the selected one cyan, its number boxed), and CHT the same way. CYL SLCT steps the cylinder. ASSIST watches every cylinder as you lean: the first whose EGT falls 10 F (`PEAK_DROP`, an assumption) below its highest is marked with a hollow box and selected, with ΔPEAK (its EGT less its peak) and the fuel flow at peak; CYL SLCT is disabled while ASSIST is on, and ASSIST again clears it. Without `cylinders` every bar shows `egt`, the values are dashed and ASSIST finds no peak. SYSTEM: oil pressure and temperature and the fuel calculator: fuel flow, GAL USED and GAL REM, counted down by fuel flow from the quantity set, not from the fuel gauges. RST FUEL zeroes GAL USED and sets GAL REM to 53 gal (`FULL_GAL`, the 172S's usable fuel); GAL REM opens -10, -1, +1 and +10 GAL (between empty and full). The calculator lives in each unit (a reversionary PFD keeps its own) and is not reported to the host. Both pages keep the RPM gauge, fuel quantity, engine hours and electrical block. `lean.ts` holds the logic.
- **Softkeys:** ENGINE (LEAN, SYSTEM), MAP (PROFILE and AIRWAYS; a traffic switch; the data keys are dim), DCLTR, CHKLIST, and each page's own keys.
- **CLR held:** goes to the navigation map.
- **Joystick push:** on the navigation map, the flight plan page's map (and the PFD's inset map), pan mode: a flashing pointer and an info bar (the point under the pointer, or MAP POINTER; distance and bearing from the aircraft; latitude and longitude). The joystick moves the pointer and scrolls the map at its edge. RANGE recenters the map on the pointer. DIRECT TO takes the point under the pointer. On the MFD, ENT on an airport, VOR, NDB, intersection or user waypoint opens its WPT page; the push or CLR goes back to the map. Push again, change page, or leave the joystick alone for 60 s to end it.

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

The keyboard works the display last clicked (not on the real unit or in FG1000; NXi takes its keypad the same way): a letter or digit types into the identifier under the cursor and moves on, Backspace clears back, Enter is ENT and Escape is CLR. It types where the small FMS knob would spell: DIRECT TO, waypoint entry, the WPT pages, PROC and Closest Point Of FPL, on both units. Bezel inputs report a typed key as `{ control: "CHAR", value: <character code> }`, 8 for Backspace; `keyInput` maps a key event.

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
- **OBS, CDI.** OBS reads SUSP while sequencing is suspended at the missed approach point or a hold (see SUSP below).
- **XPDR:** modes, code entry, IDENT.
- **TMR/REF:** the FMS outer knob picks a field, the inner changes it, ENT starts and stops the timer.
- **NRST:** FMS scrolls, ENT shows the airport, CLR goes back.
- **ALERTS:** lists `alerts`, one string per message, written "TITLE - description" as the trainer shows them.
- **SYN VIS** keys switch only their setting; there is no terrain to draw.
- **FPL** toggles the flight plan window.

### Map

FlightGear draws the map from its own navigation database. Here the map shows only the points passed in, with FG1000's symbols for airports, VORs, NDBs, fixes and flight plan waypoints, each layer at FG1000's default ranges: airports and VORs up to 150 nm, NDBs and fixes up to 15 nm, flight plan points always.

`airways` are drawn with the AIRWAYS key (Pilot's Guide): AIRWY ON all, AIRWY LO the low ones in grey, AIRWY HI the high ones in green, over the low. Low airways show at map ranges up to 200 nm, high up to 300; their fixes show at any range while they do. A fix missing from `points` breaks the airway there. MAP SETUP's Airways group sets the AIRWAYS key's state and each type's range (up to 500 nm). Airway names are not labeled. `glass-cockpit-web/navdata` builds them from NASR (see [Navdata](#navdata)).

**Profile View** (Pilot's Guide; FG1000 has none), from the PROFILE key or the PAGE MENU's Show/Hide Profile View: a window along the bottom of the navigation map with an altitude scale, the aircraft at `alt`, and a distance scale half the map range (PROFILE NOT AVAILABLE under 1 nm); the range box moves above it. A white box on the map marks the path it looks along: the track, 4 nm wide (the en route width; the MFD does not know the flight phase). There is no terrain or obstacle data, so it shows no terrain; its altitude steps and layout are this package's own.

`airspaces` takes Class B, C and D outlines. FG1000 draws none, so they follow the sectional chart: B solid blue, C solid magenta, D dashed blue, shown up to 150 nm.

### Where it follows the G1000 trainer

Where Garmin's G1000 trainer (v13.02, Cessna 172S) and FG1000 differ, this package follows the trainer, in behavior and labels only; the artwork is still FG1000's.

- **Knob arrows:** as on the trainer, clicking beside a knob turns it, and holding keeps turning. Here small arrows (original, not the trainer's) sit above each knob: two pairs on the dual knobs (NAV, ALT, COM, CRS/BARO, FMS), upper for the outer ring and lower for the inner knob, one pair on HDG, and small ones on the volume knobs. RANGE turns on its printed - and +, and the joystick pans in eight directions. A faint glow shows an arrow under the pointer. The RANGE knob's and joystick arrows' boxes are centered on the fascia's printed arrows, not where FG1000's GUI.nas puts them (the knob and up and down arrows 6 px to the right, left and right 8 px low).
- **VSI** scale reads 1 and 2 (thousand fpm) and stops at ±2000 fpm (FG1000: ±4000). The readout shows from 100 fpm, rounded to 50 fpm as the NXi G1000 does; the trainer could not be climbed to check.
- **MENU** on the PFD opens the PFD SETUP MENU (brightness, shown on AUTO; not ported), or with the flight plan window open its PAGE MENU, or in the DIRECT TO window that window's menu (Cancel Direct-To NAV: the flight plan resumes on the leg closest to the aircraft; CLR goes back to DIRECT TO). On the MFD it opens the page's PAGE MENU: on the navigation map, Map Setup, Declutter and Measure Bearing/Distance work. MAP SETUP (Map group) sets ORIENTATION (NORTH UP, TRK UP, DTK UP, HDG UP; `orientation`, reported through `onChange`) and TRACK VECTOR (off, or a light blue line to where the aircraft will be in 30 s to 20 min, always straight); heading, track and desired track are magnetic, and the map adds `magVar`. GROUP (the small FMS knob on the cursor's first stop) switches to Airways (AIRWAYS off, all, low or high only; the low and high ranges) or Profile (PROFILE WINDS, grey: no winds aloft). Its other settings are grey. Measure Bearing/Distance (a pointer starts on the aircraft with a dashed line from the start point and the bearing and distance from it in the info bar; ENT moves the start point to the pointer; Stop Measuring or a joystick push ends it; no elevation, as there is no terrain data); on the flight plan page (and the PFD's flight plan window), Invert Flight Plan, Delete Flight Plan and Remove Approach work, and Closest Point Of FPL, Parallel Track, Hold At Present Position and (MFD only, on the waypoint under the cursor: the PFD's flight plan window has no cursor) Create ATK Offset Waypoint and Hold At Waypoint open windows that follow the Pilot's Guide's steps (FG1000 has none of them). Closest Point Of FPL shows the bearing and distance from a reference waypoint to the nearest point on the plan and adds a user waypoint there to `points`, reported through `onChange`. Parallel Track (left or right, 1 to 99 nm) replaces the plan's points from the active leg on, up to an approach, with offset points named with a lower case p that carry `parallel`; a direct-to, loading an approach, editing the plan or activating a leg cancels it, and it is unavailable on a direct-to, an approach leg or a turn over 120 degrees. It does not cancel itself when offset tracks would overlap, and VNV is not ported. An ATK offset (1 to 999 nm, negative before the waypoint) is inserted into the plan; the large FMS knob steps it 10 nm, the small one 1 nm, not digit by digit. The hold windows set the inbound course (magnetic, 1 degree a click; Hold At Waypoint starts on the course into the waypoint, Hold At Present Position on the track, or on the PFD, which has no track input, the heading), the turns (right, or left), and legs by time (1 minute, 0.5 to 5 in half minutes) or distance (1 nm, 1 to 30); ENT steps down to LOAD?, which puts a hold leg into the plan (see the API note on `hold` above) and closes the window. Hold At Waypoint holds after the waypoint under the cursor, replacing a hold there. Hold At Present Position adds a user waypoint PPOS1 (PPOS2 and on) here to `points`, reported through `onChange`, before the active waypoint, and goes direct to it with the hold after it. The flight plan shows a hold as a HOLD row under its fix with the inbound course and RIGHT or LEFT, and the map draws a racetrack there, magenta while the hold is active, sized for standard rate turns and the leg time at the groundspeed (90 kt under 30 kt, as on the PFD inset) or the leg distance; it is our own drawing, without entry procedures. With the cursor on a hold, Remove Hold takes Hold At Waypoint's place; it and CLR delete the hold, and an active hold gives way to the leg after it. CLR on a fix deletes its hold with it, inverting the plan drops holds, and Parallel Track is unavailable across a hold (its leg has no length). The expect further clearance time is not ported. Window titles and field names are this package's own; in DIRECT TO, Cancel Direct-To NAV. On WPT - AIRPORT INFORMATION, View Destination Airport (the flight plan's last airport; grey without one) and Show Approach Page work; Show Directory, Departure, Arrival and Weather Page, View NOTAMs and Chart Mode On are grey, as the INFO-2, DP, STAR and WX softkeys are dim (no directory, procedure, weather, NOTAM or chart data). On NRST - NEAREST VOR, Select VOR Window and Select Frequency Window put the cursor in that window, as the VOR and FREQ softkeys do; the nearest NDB and intersection pages have no menu. On AUX - TRIP PLANNING, Flight Plan Mode (the only mode, already on), Auto Mode and Manual Mode do what the FPL, AUTO and MANUAL softkeys do; Waypoints Mode is grey (WPTS not ported). On AUX - GPS STATUS, Set WPT to Present Position adds a user waypoint here to `points` (PPOS1, PPOS2 and on, named as Hold At Present Position names its point), reported through `onChange`, and shows it as RAIM PREDICTION's waypoint, which stays grey: there are no satellites, so no RAIM prediction. FG1000 has none of these menus. Other options are listed grey, and the other pages have no menu yet. The FMS knob moves the cursor over the options that work, ENT carries one out, and CLR, MENU again or pushing the FMS knob closes it.
- **FPL and PROC again:** on the MFD, FPL again goes back to the page shown before it, and PROC again closes the PROCEDURES window.
- **Pan mode** (FG1000 has none): the joystick push on the MFD navigation map, the flight plan page's map and the PFD inset map, as the Pilot's Guide and the trainer describe: the pointer flashes (here once a second, shown 0.7 s), ENT on a waypoint opens its WPT page (a point of the plan's own, such as an approach fix, has none, so ENT passes to the page), and 60 s without joystick input ends pan mode and recenters. The pointer and bar are drawn here, not Garmin's. No ground elevation or airspace in the info bar: there is no terrain or airspace data for it.
- **WPT - USER WPT INFORMATION and NRST - NEAREST USER WPTS** (Pilot's Guide; FG1000 has neither page nor SVG, so both are drawn here in the AUX pages' box style, our own layout, the window down the right). The WPT page shows the user waypoint picked (the nearest until then), its comment (the point's `name`, not editable), a reference box (the nearest VOR's radial and the nearest airport's bearing to the waypoint, with distances; display only), its position, every user waypoint in a list, and its own map centered on it. With the cursor on, the large FMS knob steps the identifier, latitude degrees and minutes, longitude degrees and minutes, then the list. The small knob (or the keyboard) spells an identifier: ENT shows that user waypoint, or under a new name (1 to 6 letters and digits, not any point's or airport's) creates one at the aircraft's position; a name in use changes nothing and NAME IN USE shows beside it (our own wording) until the next knob turn. On a position it steps a degree or a minute, applied at once (the Pilot's Guide's ENT to accept is not kept). ENT on the list shows that waypoint. Its PAGE MENU: Create New User Waypoint and Rename User Waypoint put the cursor on the identifier to spell the name, Delete User Waypoint, Delete All User Waypoints, Use Present Position; Waypoint Setup is grey (no temporary waypoints). Deleting a waypoint the flight plan uses removes it from the plan as CLR would (our choice), with a hold at it. The NRST page lists up to 25 within 200 nm (NONE WITHIN 200NM otherwise), with bearing, distance and the selected one's position; with the cursor on, ENT opens its WPT page and DIRECT TO takes it. Reference waypoint entry (RAD/RAD, RAD/DIS) is not ported.
- **WPT - APPROACH INFORMATION** (Pilot's Guide; FG1000 has none): the airport page's softkeys are INFO-1, DP, STAR, APR and WX. APR shows the airport's approaches (grey where `procedures` has none), the selected one's transitions, BARO minimums and its fix sequence, and previews it on the map, white with the missed approach dashed; INFO-1 goes back. The FMS knob and ENT step airport, approach, transition, minimums and sequence as the Pilot's Guide does. Its window is this package's own layout, in Map Setup's style. The minimums stay on this page (the PFD's are set at TMR/REF). DP and STAR show WPT - DEPARTURE INFORMATION and WPT - ARRIVAL INFORMATION in the same window: the airport's departures or arrivals, a one-row RUNWAY and TRANSITION (a departure's runway first, an arrival's transition), the fix sequence and the map preview; the knob and ENT step them in that order. They are grey where `procedures` has no departure or arrival for the airport, as the PAGE MENU's Show Departure Page and Show Arrival Page are. WX is grey (no weather data), and INFO-2 (the AOPA directory) is not ported.
- **AUX - SYSTEM SETUP** (Pilot's Guide; FG1000 has none), added to the AUX group after GPS STATUS: the date and time (local 12 or 24 hour with an offset, or UTC), the MFD data bar's four fields (BRG, DIS, DTK, END, ETA, ETE, FOB, GS, TKE, TRK; BRG and DIS to the active waypoint, FOB and END from the fuel gauges), page navigation (change on the first click, tab timeout 2 to 10 s) and the nearest airport criteria (runway surface and minimum length, which filter NRST - NEAREST AIRPORTS; airports without runway data stay). Numbers step with the small FMS knob (30 min, 1 s, 100 ft) rather than being typed. Display units, the baro transition, airspace, arrival and audio alerts, the flight director, GPS CDI and COM spacing are shown grey. The settings live in the MFD and are not reported to the host.
- **AUX - UTILITY** (Pilot's Guide): the generic timer (UP or DN from a time, START?, STOP?, RESET?; a countdown past zero counts up), the flight timer and departure time from power on or lift off (taken as 30 kt groundspeed: the MFD has no air/ground switch), and trip statistics (odometer, trip odometer, average and maximum groundspeed, from `groundspeed` sampled each second; a gap over a minute is not counted). Its PAGE MENU resets them. The SCHEDULER box below the timers on the large FMS knob holds ten messages: the small FMS knob types a name (the large one moves along it, ENT keeps it; CLR clears it, again restores it, ENT on a cleared line clears the message), then its type (One-time, the default; Periodic; Event) and its timer or time. Timers step a minute a detent and event times 10 minutes, rather than being typed. A message comes due through `onScheduler`, checked each second. Messages are not kept over a reload. The flight data logger is not ported.
- **AUX - TRIP PLANNING** (Pilot's Guide): the flight plan's REM (the rest of it from the aircraft) or one of its legs (the active leg from the aircraft), with DTK, DIS, ETE, ETA, and sunrise and sunset at its end; efficiency, endurance, remaining fuel and endurance, fuel required and range; and, in MANUAL, density altitude and true airspeed. AUTO (the default) takes groundspeed, fuel flow and fuel on board from the aircraft and the departure time from the clock; MANUAL starts from those and steps them, and calibrated airspeed, indicated altitude, baro and total air temperature, with the small FMS knob. Its boxes are this package's layout, in System Setup's style. WPTS mode and ESA are grey. The sums are in `trip-planning.ts`.
- **AUX - GPS STATUS** (Pilot's Guide): GPS1 or GPS2 (the same data), the solution, position, UTC time, altitude, groundspeed and track from the aircraft. There are no satellites here: the sky view and signal bars are left out, and the accuracy, RAIM prediction (RAIM softkey) and SBAS selection (SBAS softkey) boxes are grey.
- **Engine strip LEAN and SYSTEM pages** (Pilot's Guide; FG1000 has their softkeys but no art or logic): drawn here in the ENGINE page's style (15 px white labels, white readouts, cyan for the selected cylinder), our own layout, in the band FG1000's ENGINE page gives its fuel flow to vacuum gauges. The bar scales (EGT 1100 to 1600 F, CHT 200 to 500 F with a red line at the top) are assumptions, as are the GAL REM keys' slots; the trainer was not checked. See the MFD's engine strip above.
- **AUX - SYSTEM STATUS** (Pilot's Guide): every LRU reports in with a green check. The airframe and database boxes are grey (MFD1 DB and PFD1 DB switch the database box), and ANN TEST is dim.
- **NEAREST AIRPORTS LD APR** (Pilot's Guide; FG1000 has none): with an approach under the cursor, LD APR or the PAGE MENU's Load Approach opens PROC's SELECT APPROACH on it at its transitions (LOAD? when it has one); it is grey when `procedures` has no such approach. The PAGE MENU also selects the airport, runway, frequency and approach windows, and ENT on the airport list moves to the next airport.
- **PFD DIRECT TO and PROC** (FG1000 has neither): windows in the NRST window's place, laid out as the trainer's, sharing the MFD's flow. DIRECT TO and PROC again close them.
- **Long press:** holding COM ⇄ or CLR for 2 s acts as on the real unit (FG1000: a separate key binding); COM ⇄ tunes 121.5, where FG1000 tunes 121.00.
- **Pitch ladder:** shown inside a circle under the roll scale, wide enough for the 20° labels, cut flat at the top of the heading box, fixed on the screen (FG1000: a rectangle from y 70, through the pointer, to 370). Red chevrons pointing to the horizon from 50° nose up and 30° nose down (Pilot's Guide); FG1000 has none, so their shape and spacing are this package's own.
- **Airspeed tape:** the color-coded speed range strip along its right edge (Pilot's Guide); FG1000's tape has none. Where the flap range overlaps the normal range, white takes the inner half.
- **Heading box:** 17.2 px higher than FG1000's, sitting on the turn rate band instead of over its top.
- **Attitude and turn rate** (Pilot's Guide): the turn rate band has ticks at half-standard and standard rate each side, with the trend vector drawn through them. FG1000 draws the band alone.
- **Bezel shading:** FG1000's fascia shades its left column darker than its right (an extra overlay and a fainter edge strip); here both match the right.
- **Colors:** the cursor and selectable text are full cyan (FG1000: a paler #80ffff), and the page group window shows the selected page in cyan and the rest in white (FG1000: lilac and grey).
- **Font:** the screens draw every text in Saira Semi Condensed Medium, bundled (SIL Open Font License 1.1, `src/fonts/`), chosen for its likeness to the trainer's lettering; FG1000 names Liberation Sans Narrow and does not bundle it. The displays load the file through `new URL(..., import.meta.url)`, so a bundler emits it as an asset and a CSP of `font-src 'self'` allows it; a page that loads `dist/` straight from a server needs `src/fonts/` served beside it, as the package has it. The bezel keeps FG1000's lettering. The trainer's own font is Garmin's and is not used.
- **MFD windows:** drawn as the trainer draws them, in a light grey frame with black boxes whose titles step their top edge (FG1000: black windows, grey title tabs). PAGE MENU and the flight plan tools' windows are dark grey and fit their contents, with a cursor bar across the whole row. MAP SETUP, DIRECT TO, the waypoint approach panel (and PROC - APPROACH LOADING's) and the AUX pages are full-height and mid grey, and the PROCEDURES menu is mid grey and fits its options; MAP SETUP keeps its group in a box of its own, its labels on the grey and its values in a black column.

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
  | GIA 1 or 2, or a display (Line Maintenance Manual) | `com1` and `nav1`, or `com2` and `nav2` | FG1000's red X over the radio's field; `displayModes` sets them for a display |

  `heading` flags the heading box (FG1000's flag; the trainer's magnetometer failure was not checked). FG1000's NO GPS POSITION flag is not used on the PFD. At power-up the PFD flags attitude and heading while the AHRS aligns, and air data for its first seconds, on its own (option `startup`, see PFD above); attitude then shows AHRS ALIGN: Keep Wings Level in a box of this package's own over the red X, with no horizon. The GFC 700's preflight test follows the alignment, with PFT above the airspeed tape (`pft` on `Afcs`, see Autopilot above); `faults` on `Afcs.update` flags ROLL, PTCH and SYS there. The trainer's AFCS failures were not checked.
- **DME:** PFD > DME shows the DME window left of the HSI: the NAV radio, its active frequency and the distance from `bearings` (dashes without one). The top-row DME key opens DME TUNING, where the small FMS knob switches NAV1 and NAV2. No HOLD.
- **PROC** opens a PROCEDURES menu: ACTIVATE VECTOR-TO-FINAL and ACTIVATE APPROACH (grey until an approach is loaded), ACTIVATE MISSED APPROACH (grey until one with a missed approach is loaded), SELECT APPROACH, SELECT ARRIVAL and SELECT DEPARTURE. SELECT DEPARTURE opens PROC - DEPARTURE LOADING on the flight plan's first airport and steps departure, runway, transition, then LOAD?; SELECT ARRIVAL opens PROC - ARRIVAL LOADING on the destination and steps arrival, transition, runway, then LOAD? (a runway or transition only when there is a choice; no ACTIVATE?, no minimums). On the MFD both are pages beside a map preview, as approach loading is, with DP, STAR and APR softkeys to switch between the three and GO BACK to leave (their slots are assumed). LOAD? puts a departure's fixes after its airport (the airport first when the plan does not have it) and an arrival's before the approach, or at the end, each replacing one loaded before; the active waypoint stays active, except that loading a departure before takeoff (flying the leg out of its airport) makes its first fix active. PROC marks the fixes it loads with `departure` or `arrival` (the procedure's name), and the flight plan PAGE MENU's Remove Departure and Remove Arrival take them out, as Remove Approach does; Invert Flight Plan drops all three. The flight plan lists them as it lists approach fixes, without the Pilot's Guide's procedure header rows. Activating an approach the GPS may not fly (anything but RNAV (GPS) and GPS approaches), from ACTIVATE? or the menu, asks NOT APPROVED FOR GPS, YES or NO; NO goes back without activating. CLR goes back from SELECT APPROACH to the menu. PROC marks the fixes it loads with `approach` (the approach's name), which is how it finds the loaded approach. ACTIVATE with the VECTORS transition, or ACTIVATE VECTOR-TO-FINAL, makes the final approach fix active with no leg from the aircraft (direct from the aircraft when the approach has no fix before its FAF), and sets `vtf` on the unit (reported through `onChange`; the PFD keeps it too, which dims Cancel Direct-To NAV) so a host can label the PFD's active leg, as the trainer does: `{ from: "vtf 356°", to: "TWOFA faf" }`. The PFD flight plan tags approach fixes in lowercase: `faf`, `map`. `gpsApproved` and `vtfLeg` are exported for hosts.
- **SUSP** (Pilot's Guide; FG1000 has no suspend and would sequence onto the missed approach): with the loaded approach's missed approach point active, once the aircraft passes it (beyond the MAP along the leg into it) both units set `susp` and report it through `onChange`. The MAP stays the active waypoint and the GPS CDI stays on the final course; the PFD's OBS softkey reads SUSP, lit, and the HSI's GPS annunciation reads SUSP. The units do not sequence the plan themselves: a host that sequences `activeLeg` holds at the MAP while `susp` is set. Pressing SUSP, or ACTIVATE MISSED APPROACH (before or after the MAP), makes the leg from the MAP to the first missed approach fix active. An approach with no missed approach legs stays suspended at the MAP, and SUSP does nothing. `susp` ends when the MAP stops being the active waypoint (another leg activated, the plan deleted), on a direct-to (even one to the MAP) and on loading an approach. No SUSP in OBS mode, even when a host shares `susp` from the MFD (which cannot see OBS), so OBS can always be turned off. A hold suspends sequencing too: while a hold in the plan is the active leg, both units set `susp` the same way and the hold stays active (`sequenceLeg`). Pressing SUSP there makes the leg after the hold active, flown from the hold fix; a hold last in the plan keeps holding and SUSP does nothing (our reading: there is no leg to sequence onto). Remove Hold also resumes on the leg after it, ending `susp`. `pastMap`, `suspended`, `missedPatch` and `resumePatch` (the SUSP key's patch at either) in `nav.ts` hold the rules.

## Navdata

`glass-cockpit-web/navdata` turns the FAA's public domain NASR and CIFP files into the data the displays take. It runs at build time, in Node or anywhere else, and has no dependencies. Fetching and unpacking the files is the host's job: instrumentready.com downloads each 28-day cycle and reads the CSVs with `csv-parse`, the zips with `fflate`, and the airspace shapefile with `shapefile` and `simplify-js`.

| Function | Takes | Returns |
| --- | --- | --- |
| `buildNasr(cycle, csv, airspace)` | The NASR CSV rows by file (`NAV_BASE`, `FIX_BASE`, `APT_BASE`, `APT_RWY`, `FRQ`, `ILS_BASE`, and optionally `AWY_SEG_ALT` from the AWY zip), as objects of column name to value; Class B, C and D airspace records the host built | `Nasr`: navaids, fixes, public-use airports, ARTCC/FSS/weather frequencies, airspace, airways |
| `parseCifp(text)` | The CIFP file `FAACIFP18` (ARINC 424) as text | `Cifp["procedures"]`: approaches with transitions, legs, altitudes and fix roles; SIDs and STARs with their runway transitions, common legs and en route transitions |
| `near(nasr, cifp, lat, lon, range)` | The two above, a position and a range in nm | `{ points, airspaces, airports, stations, procedures, airways }` for `set()`. `procedures` has the approaches, SIDs and STARs of the airports in range; an airport's `approaches` names its approaches only. VORs, NDBs and stations reach 200 nm, as the NRST pages do. Airways come as their segments within range, whole, and their points beyond range join `points` |
| `approachName(id)` | A CIFP approach id such as `R08-Y` | The chart name, `RNAV (GPS) Y RWY 08` |

Airways are the Victor and T routes (`LO`) and the jet and Q routes (`HI`), as AIM 5-3-4 splits them; colored, oceanic and helicopter routes are left out. An airway breaks where NASR marks a gap and where a point has no navaid or fix record (border points, DME and TACAN points, navaids out of service), so every point `near` returns on one is in `points`. The record keeps each point's type (VOR, NDB or fix), so a fix and a navaid sharing an id are told apart; where another point in `points` has an airway point's id, the airway's comes last, the one the map uses. Rows may come in any order. Distances are measured the short way across 180 degrees longitude.

A `Cifp` procedure is a tuple, `CifpProcedure`: `[airport, name, transitions, legs]` for an approach, as records built before SIDs and STARs have it, and `[airport, name, transitions, legs, kind, runways]` for a SID (`kind` `"SID"`) or STAR (`"STAR"`). For those, `transitions` are the en route transitions, `legs` the common legs (may be empty) and `runways` the runway transitions by CIFP name (`"RW30"`; `"RW13B"` for both runways 13). A SID runs runway, common legs, transition; a STAR transition, common legs, runway. The name is the CIFP's (`JEEON1`), legs carry no fix role, and flight level constraints come in feet (`FL210` as `"21000"`). `near` turns them into `Procedure`s with `kind` and `runways`; an approach has neither. A `cifp.json` written before this keeps loading, with approaches only; regenerate it (`npm run nasr` in instrumentready.com) to get departures and arrivals. With them, the 2611 cycle's 40 nm Phoenix slice grows from about 121 KB to 250 KB.

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

- MFD pages that need data this package has no source for: weather, terrain, XM, stored flight plans, nearest airspaces.
- AUX - UTILITY's flight data logger and typed scheduler times, the AUX - SYSTEM SETUP settings shown grey, Trip Planning's WPTS mode and ESA, GPS Status's sky view, signal bars, accuracy, RAIM and SBAS, and System Status's airframe, databases and ANN TEST.
- DIRECT TO's VNAV fields; a hold's expect further clearance time and entry procedures, procedure holding legs (CIFP HF, HM, HA: the navdata has no hold course, turn or leg length), and Hold At Waypoint on the PFD.
- The flight plan's procedure header rows (departure, arrival and approach fixes are listed as waypoints); SID and STAR legs without a fix (heading, altitude and vector legs), as with approaches.
- The AIRWAY waypoint list; user waypoints' reference waypoint entry, comments and temporary waypoints (Waypoint Setup).
- Synthetic vision, the arc HSI, DME HOLD and the GPS course-to-intercept diamond.
- Map terrain (and Profile View's terrain and winds) and airway labels.
- The audio panel (the demo has its DISPLAY BACKUP button only), and typing the scheduler's messages on the keyboard.
- PAGE MENU on pages other than the navigation map, flight plan, DIRECT TO, nearest airports, nearest VOR, airport information, trip planning, utility, GPS status and user waypoint information, and most of its options; display brightness; the trainer's DEMO MODE page (MENU twice).
- The GFC 700's PTRM and mistrim alerts (ELE and AIL arrows) above the airspeed tape (the model has no servos or trim to report them), the VS reference box and bug above the vertical speed tape, the GPS to LOC switch on an ILS keeping GPS active (it reverts to ROL as a manual switch does), the VNV non-path descent recapture rule and overspeed reversion, the MET switch, the trim and the servos; the engine strip's invalid flags, battery amps (FG1000's +110 placeholders stay) and the SYSTEM page's time remaining, the MFD's red COM/NAV fields (`failed` is the PFD's), and the map's range ring and measure bearing/distance in pan mode.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in [SECURITY.md](SECURITY.md), not in a public issue. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

GPL-2.0-or-later, the same as FlightGear. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Copyright 2018 Stuart Buchanan (FG1000). Port copyright 2026 Christopher DeFoe.
