# G1000 buttonology parity

What every control does on every page, where it comes from, and where this package stands. The target is the original
G1000 as Garmin's v13.02 trainer (Cessna 172S) shows it, in behavior and labels: full parity. NXi is a newer G1000 and is
only a reference. No trainer art, screenshots, data or text is copied.

## Sources, in order of authority

1. **v13 trainer**, driven by hand: what it does wins. Findings are noted as "trainer".
2. **NXi G1000** (Working Title, msfs-avionics-mirror): a newer software version, read for behavior only. Its license
   covers use inside MSFS, so none of its code is copied. Its softkey layouts differ from v13 (PFD Opt, Map/HSI, TFC Map)
   and are not followed.
3. **FG1000** (FlightGear, GPL): the code this package is ported from, and the fallback.

## Status

- **Done**: matches the trainer, or the trainer could not be checked and NXi or FG1000 is followed.
- **Partial**: works, with the gaps listed.
- **Missing**: the control does nothing, or the window or page does not exist.
- **No data**: needs data this package has no source for (weather, terrain, charts, XM, databases).

## Bezel controls, both units

| Control | Trainer / NXi behavior | Status |
| --- | --- | --- |
| NAV vol / push | Volume; push: ident audio | Done |
| NAV ⇄ | Swap NAV active and standby | Done |
| NAV dual knob / push | Tune standby; push: move the tuning box NAV1/NAV2 | Done |
| HDG / push | Heading bug; push: sync to heading. Both units drive the same bug | Done (shared through `onChange`; the host must pass it on) |
| ALT dual knob | Selected altitude, 1000 and 100 ft | Done |
| ALT push | Nothing on the 172S | Done (no-op) |
| COM vol / push | Volume; push: squelch off | Partial: push does nothing |
| COM ⇄ / hold | Swap; hold 2 s: tune 121.5 | Done |
| COM dual knob / push | Tune standby; push: COM1/COM2 box | Done |
| CRS/BARO / push | Course, baro; push: course to the station | Done |
| RANGE | Map range, PFD inset or MFD map | Done |
| Joystick push | Pan mode on the map (cursor, range ring, info for the point) | Missing |
| Joystick 8 ways | Moves the pan cursor | Missing: the arrows report input, nothing acts on it |
| DIRECT TO | Direct-to window | MFD done; PFD missing |
| FPL | PFD: flight plan window toggles. MFD: FPL page, again goes back | Done |
| CLR / hold | Back out; hold on the MFD: navigation map | Done |
| MENU | PAGE MENU for the page; PFD with no window: PFD SETUP MENU | Partial: nav map and FPL only (see Page menus) |
| PROC | Procedures window; again closes | MFD done; PFD missing |
| ENT | Accept | Done where a page uses it |
| FMS dual knob | Outer moves the cursor, inner changes the field or opens WPT entry; with no cursor the MFD outer/inner select page group/page | Done on the ported pages |
| FMS push (CRSR) | Cursor on and off | Done on the ported pages |
| Keyboard typing | Not on the real unit (NXi takes a keypad: letters, digits, BKSP, SPC). Wanted here for waypoint entry | Missing (later) |
| Audio panel | GMA 1347 between the units: COM/NAV audio keys, MKR, intercom, and the red DISPLAY BACKUP (reversionary) button | Missing (later; reversionary is the useful part) |

## PFD softkeys (trainer layout, followed)

| Menu | Keys | Status |
| --- | --- | --- |
| Root | INSET, PFD, OBS, CDI, DME, XPDR, IDENT, TMR/REF, NRST, ALERTS/ADVISORY | Done |
| INSET | OFF, DCLTR, WX LGND, TRAFFIC, TOPO, TERRAIN, PRECIP, METAR, BACK | Partial: weather, topo and terrain keys No data |
| PFD | SYN VIS, DFLTS, WIND, DME, BRG1, HSI FRMT, BRG2, ALT UNIT, STD BARO, BACK | Partial: SYN VIS No data; HSI FRMT (arc HSI) missing |
| XPDR | STBY, ON, ALT, VFR, CODE, IDENT, BACK; CODE: digits 0 to 7, BKSP | Done |
| OBS, SUSP | OBS; becomes SUSP during an approach | Partial: SUSP not ported |

## PFD windows

| Window | Status |
| --- | --- |
| Flight plan (FPL) | Partial: shown and its PAGE MENU works (Invert, Delete, Remove Approach); no cursor editing on the PFD |
| PROC (PROCEDURES, SELECT APPROACH and so on) | Missing |
| DIRECT TO | Missing |
| NRST | Done |
| TMR/REF (REFERENCES) | Done |
| ALERTS | Done |
| DME, DME TUNING | Done (no HOLD) |
| PFD SETUP MENU | Partial: shown, brightness not ported |
| Wind, bearing pointers, inset map | Done |

## MFD pages

| Group | Page | Status |
| --- | --- | --- |
| MAP | Navigation map | Partial: no pan mode, no map setup |
| MAP | Traffic map | Done (shows what the host passes) |
| MAP | Stormscope, weather data link, TAWS | No data |
| WPT | Airport information | Partial: info shown; its sub-pages (runways, frequencies, departure, arrival, approach, weather) missing |
| WPT | Intersection, NDB, VOR information | Done |
| WPT | User waypoint information | Missing (no user waypoints) |
| AUX | Trip planning, utility, GPS status, XM, system status | Missing / No data |
| AUX | System setup | Missing |
| FPL | Active flight plan | Partial: insert, delete, activate leg, PAGE MENU; no VNV, no airways, no stored plans |
| FPL | Flight plan catalog, stored plans | Missing |
| LST | Checklists | Done |
| NRST | Airports | Partial: no RNWY, FREQ, APR, LD APR softkeys |
| NRST | Intersections, NDB, VOR | Partial: VOR's FREQ key missing |
| NRST | Frequencies | Done |
| NRST | User waypoints, airspaces | Missing / No data |

## MFD softkeys

| Menu | Trainer keys | Status |
| --- | --- | --- |
| Root | ENGINE, MAP, DCLTR, SHW CHRT, CHKLIST | Done (SHW CHRT No data) |
| MAP | TRAFFIC, PROFILE, TOPO, TERRAIN, AIRWAYS, PRECIP, METAR, LEGEND, BACK | Partial: PROFILE and AIRWAYS missing; the rest No data |
| ENGINE, LEAN, SYSTEM | CYL SLCT, ASSIST, RST FUEL, GAL REM (+/- 1, 10 GAL) | Partial: keys present; GAL REM adjust not checked |
| Nearest airports | APT, RNWY, FREQ, APR, LD APR | Missing |
| Procedures page | DP, STAR, APR, GO BACK | Missing |

## Page menus (MENU)

| Page | Trainer options | Status |
| --- | --- | --- |
| Navigation map | Map Setup, Declutter, Measure Bearing/Distance, Show Chart, Show Profile View | Partial: Declutter only |
| Active flight plan (PFD and MFD) | 18 options | Partial: Invert, Delete, Remove Approach |
| Airport information | View Destination Airport, Show Directory/Departure/Arrival/Approach/Weather Page, View NOTAMs, Chart Mode On | Missing |
| Every other page | Not yet read off the trainer | Missing |

## Dialogs and flows

| Flow | Status |
| --- | --- |
| Waypoint entry (FMS inner knob spells the identifier, with the matching name) | Done on the MFD |
| Direct-to, including from a page's cursor | MFD done |
| PROC: activate vector-to-final, approach, missed; NOT APPROVED FOR GPS | Done on the MFD |
| PROC: select arrival, select departure | Missing |
| Hold at waypoint / present position | Missing |
| Airways (load, collapse, expand) | Missing (no airway data) |
| Duplicate waypoint picker | Missing |
| Approach suspend (SUSP) and missed approach sequencing | Missing |
| VNAV | Missing |

## Not checked on the trainer yet

Each needs a pass on the trainer before it is built: the PAGE MENU of every page other than the three above, the WPT
airport sub-pages, the AUX pages, pan mode, the SUSP key, COM squelch, PFD DIRECT TO and PROC, hold entry, and the
reversionary mode the audio panel's DISPLAY BACKUP button selects.

## Phases

1. **Controls that do nothing now:** joystick pan mode, COM squelch, PFD DIRECT TO and PROC, CLR hold on the PFD.
2. **Page menus:** read each page's options off the trainer, then wire the ones this package can carry out.
3. **Missing pages and softkeys:** WPT airport sub-pages, nearest airport RNWY/FREQ/APR/LD APR, MAP PROFILE and AIRWAYS,
   AUX system setup.
4. **Flows:** SUSP and missed approach sequencing, arrivals and departures, holds, duplicate waypoints.
5. **Later, by request:** keyboard typing, the audio panel and reversionary mode.
