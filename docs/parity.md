# G1000 buttonology parity

What every control does on every page, where it comes from, and where this package stands. The target is the original
G1000 in the Cessna Nav III (172S), in behavior and labels: full parity. NXi is a newer G1000 and is only a reference. No
Garmin art, screenshots, data or manual text is copied.

## Sources, in order of authority

1. **Garmin's manuals**: the G1000 Pilot's Guide for Cessna Nav III (190-00498-08 Rev. A, system software 0563.30) and
   the Nav III Line Maintenance Manual. Behavior read from them is noted as "Pilot's Guide".
2. **v13 trainer** (Cessna NAVIII Trainer v13.02), driven by hand. Noted as "trainer".
3. **NXi G1000** (Working Title, msfs-avionics-mirror): a newer software version, read for behavior only. Its license
   covers use inside MSFS, so none of its code is copied. Its softkey layouts differ from v13 (PFD Opt, Map/HSI, TFC Map)
   and are not followed.
4. **FG1000** (FlightGear, GPL): the code and art this package is ported from, and the fallback.

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
| COM vol / push | Volume; push: squelch off (audio only; the trainer shows nothing) | Done (no-op) |
| COM ⇄ / hold | Swap; hold 2 s: 121.5 in the active COM | Done (hold 2 s or Shift+click) |
| COM dual knob / push | Tune standby; push: COM1/COM2 box | Done |
| CRS/BARO / push | Course, baro; push: course to the station | Done |
| RANGE | Map range, PFD inset or MFD map | Done |
| Joystick push | Pilot's Guide and trainer: the map pointer and an info bar (lat/lon, bearing and distance from the aircraft, ground elevation; the name of an object under it); again removes it and recenters. RANGE while panning recenters on the pointer. NXi: the PFD inset pans too | Partial: MFD navigation map and PFD inset. Missing: the flashing pointer, elevation, airspace info, ENT for waypoint info, the 60 s idle recenter, panning on the flight plan page |
| Joystick 8 ways | Moves the pointer; at the map's edge the map scrolls | Done |
| DIRECT TO | Direct-to window; again closes on the PFD | Done |
| FPL | PFD: flight plan window toggles. MFD: FPL page, again goes back | Done |
| CLR / hold | Back out; hold (MFD only, Pilot's Guide): navigation map | Done (hold 2 s or Shift+click) |
| MENU | PAGE MENU for the page; PFD with no window: PFD SETUP MENU | Partial: nav map and FPL only (see Page menus) |
| PROC | Procedures window; again closes | Done |
| ENT | Accept | Done where a page uses it |
| FMS dual knob | Outer moves the cursor, inner changes the field or opens WPT entry; with no cursor the MFD outer/inner select page group/page | Done on the ported pages |
| FMS push (CRSR) | Cursor on and off | Done on the ported pages |
| Keyboard typing | Not on the real unit (NXi takes a keypad: letters, digits, BKSP, SPC). Wanted here for waypoint entry | Missing (later) |
| Audio panel | GMA 1347 between the units: COM/NAV audio keys, MKR, intercom, and the red DISPLAY BACKUP (reversionary) button. The trainer has none; its Options menu toggles reversionary mode. FG1000 has a flat GMA1347 texture | Missing (later; reversionary on both units, art direction needed) |
| Autopilot keys (MFD bezel) | Trainer: GFC 700 keys in the MFD's left column (AP, FD, HDG, ALT, NAV, VNV, APR, BC, VS, FLC, UP, DN). FG1000's 2D bezel has none; its 3D GDU-1044B texture has their labels, and fgdata has the GFC700 logic | Missing (art direction needed) |
| Reversionary mode | Trainer: the PFD with the engine strip down the left; softkeys ENGINE, INSET, PFD, OBS, CDI, DME, XPDR, IDENT, TMR/REF, NRST, ALERTS | Missing (later) |

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
| PROC (PROCEDURES, SELECT APPROACH and so on) | Done (the MFD's flow, in the NRST window's place) |
| DIRECT TO | Done (no VNV fields) |
| NRST | Done |
| TMR/REF (REFERENCES) | Done |
| ALERTS | Done |
| DME, DME TUNING | Done (no HOLD) |
| PFD SETUP MENU | Partial: shown, brightness not ported |
| Wind, bearing pointers, inset map | Done |

## MFD pages

| Group | Page | Status |
| --- | --- | --- |
| MAP | Navigation map | Partial: no map setup |
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
| Direct-to, including from a page's cursor or the pan pointer | Done |
| PROC: activate vector-to-final, approach, missed; NOT APPROVED FOR GPS | Done on the MFD |
| PROC: select arrival, select departure | Missing |
| Hold at waypoint / present position | Missing |
| Airways (load, collapse, expand) | Missing (no airway data) |
| Duplicate waypoint picker | Missing |
| Approach suspend (SUSP) and missed approach sequencing | Missing |
| VNAV | Missing |

## Not checked on the trainer yet

Each needs a pass on the trainer before it is built: the PAGE MENU of every page other than the three above, the WPT
airport sub-pages, the AUX pages, the SUSP key and hold entry. Read the Pilot's Guide first.

## Phases

1. **Controls that did nothing:** joystick pan mode, COM squelch, PFD DIRECT TO and PROC, long presses. Done.
2. **Page menus:** read each page's options off the trainer, then wire the ones this package can carry out.
3. **Missing pages and softkeys:** WPT airport sub-pages, nearest airport RNWY/FREQ/APR/LD APR, MAP PROFILE and AIRWAYS,
   AUX system setup.
4. **Flows:** SUSP and missed approach sequencing, arrivals and departures, holds, duplicate waypoints.
5. **Later, by request:** keyboard typing, the audio panel and reversionary mode.
