# Changelog

Notable changes. The package is installed from GitHub, so a version here is the `version` in `package.json`, not an npm release.

## Unreleased

- PFD: the pitch ladder no longer moves its cut-off with the horizon. It shows inside a circle under the roll scale, wide enough for the 20° labels, cut flat at the heading box, and gains red extreme pitch chevrons (from 50° up and 30° down). The heading box sits on the turn rate band, whose ticks and trend vector now lie inside it; past 4°/s the trend vector ends in an arrowhead. New export `turnVector`. The airspeed tape gains its color strip, from new option `speedRanges` (default `SPEEDS_172S`), whose `vne` also reds the IAS box when `vne` is not set. The demo's pitch runs to ±80° and its turn rate follows bank and airspeed.

- Navdata: `buildNasr` builds V, T, J and Q airways from NASR's `AWY_SEG_ALT.csv` (optional in `NasrCsv`, any row order; `Nasr` gains `airways`, each point an id and its type), and `near` returns `airways` for the MFD, the segments within range with every point they use in `points`.
- MFD: the map's AIRWAYS key draws airways from new state `airways` (low grey, high green, with their range limits), and PROFILE or the PAGE MENU shows Profile View: altitude and distance scales, the aircraft, and its path on the map, with no terrain (Pilot's Guide). `shownAirways`, `profileView` and `symbolPoints` (which points the map draws: airway fixes past their range but still decluttered, a previewed fix once) in `map.ts`; `MapData` gains `airways` and `profilePath`.
- MFD: AUX - SYSTEM SETUP (time format and offset, MFD data bar fields, page navigation, nearest airport criteria) and AUX - UTILITY (timers, trip statistics, PAGE MENU resets), from the Pilot's Guide. The AUX group gains SYSTEM SETUP after GPS STATUS. `aux-pages.ts` holds their logic; `ete` moved there and is still exported from `glass-mfd`.
- MFD: WPT - APPROACH INFORMATION from the airport page's APR softkey: approaches, transitions, BARO minimums and the fix sequence, previewed on the map (Pilot's Guide). The airport page gains INFO-1, APR and grey DP, STAR and WX. `approachPoints` in `nav.ts`, the page's logic in `apr-info.ts`; `MapData` gains `preview`.
- MFD: Nearest Airports gains LD APR and a PAGE MENU (Select Airport/Runway/Frequency/Approach Window, Load Approach); ENT on the airport list moves to the next airport (Pilot's Guide). `ProcFlow.loadApproach`.
- PFD and MFD: the flight plan PAGE MENU's Closest Point Of FPL and Parallel Track, and on the MFD Create ATK Offset Waypoint, open their windows (Pilot's Guide). `MapPoint` gains `parallel`; `closestPointOfFpl`, `atkOffset`, `parallelTrack` and `cancelParallel` in `nav.ts`, the windows' logic in `fpl-tools.ts`. Direct-to, loading an approach and editing the plan cancel Parallel Track. The demo and the Vue component share `points` between the units, so a user waypoint reaches both.
- MFD: MAP SETUP from the navigation map's PAGE MENU: ORIENTATION and TRACK VECTOR (Pilot's Guide). `orientation` gains TRK UP and DTK UP. The demo's heading-up checkbox is gone; MAP SETUP sets it. Changed: heading, track and desired track are taken as magnetic, so HDG UP, TRK UP, DTK UP and the track vector add `magVar` to point true.
- MFD: the navigation map's Measure Bearing/Distance (Pilot's Guide), built on pan mode.
- Demo: a round red DISPLAY BACKUP button between the units (`display-backup.ts`); the displays have no reversionary mode yet.
- PFD and MFD: MENU in DIRECT TO offers Cancel Direct-To NAV, which resumes the flight plan on the closest leg (Pilot's Guide). PFD state gains `vtf`, which dims it during vector-to-final.
- Softkeys follow the G1000 trainer (v13.02, 172S): its layouts on the PFD and MFD menus, and dim keys for what is unavailable.
- PFD: the ALERTS key reads ADVISORY while a message is unread.
- PFD: the CDI label reads VOR1, LOC1, VOR2 or LOC2, and the course box DTK on GPS. `cdiLabel` and `isLocalizer` in `glass-cockpit-web/radio`.
- Changed: the PFD's speed references start off, as the trainer has them. A host that relied on the bugs showing by default sets `vspeedsOn`. TMR/REF follows the trainer's REFERENCES layout.
- PFD: `failed` shows FG1000's failure flags for attitude, airspeed, altitude, vertical speed and heading.
- PFD: the DME window and DME TUNING. `dmeText` in `glass-cockpit-web/radio`.
- MFD: PROC opens a PROCEDURES menu (activate vector-to-final, approach, missed approach), asks NOT APPROVED FOR GPS before activating a non-GPS approach, and activates vector-to-final with the VECTORS transition. New MFD state `vtf`, and route points PROC loads carry `approach`; `gpsApproved` and `vtfLeg` exported.
- Bezel: clicking an arrow at a knob's top corner turns it one detent (Shift: the outer ring), as clicking beside a knob does on the trainer; RANGE turns on its printed - and +. The wheel still works.
- Bezel: two pairs of arrows on dual knobs (outer and inner), arrows on HDG and the volume knobs, the joystick in eight directions; holding an arrow keeps turning. A fast wheel spin turns HDG and CRS 5°. The ALT knob pushes. Arrows glow under the pointer.
- PFD: the VSI scale stops at ±2000 fpm, its readout rounded to 50 fpm. MENU opens the PFD SETUP MENU, or the flight plan's PAGE MENU.
- MFD: MENU opens a PAGE MENU on the navigation map and flight plan pages (Declutter; Invert, Delete, Remove Approach). FPL again goes back to the previous page; PROC again closes PROCEDURES.
- Bezel: the left column is no longer shaded darker than the right.
- PFD: the pitch ladder no longer overlaps the roll pointer, and the turn rate indicator has half-standard and standard rate ticks.
- MFD and PFD inset: the joystick push starts pan mode: a pointer, and an info bar with the point under it, its distance and bearing, latitude and longitude. RANGE recenters on the pointer. DIRECT TO takes the point under the pointer.
- PFD: DIRECT TO and PROC open their windows, sharing the MFD's flow. New PFD state `procedures`, and `directFrom` so the inset draws a direct leg without a host round trip. Vue passes both from `mfd`.
- Bezel: holding COM ⇄ or CLR for 2 s is a long press, as Shift+click is.
- Demo: the PFD and MFD share their knobs and flight plan, so HDG, ALT, CRS, BARO and the radios on either unit change both. Vue: `mfd.selectedAlt`, when given, is shared by both units.
- Colors: the cursor is full cyan, and the page group window shows the selected page in cyan, the rest white, as on the trainer.
- ALT knob: the selected altitude stays on 100 ft steps, even when the host set an odd value. The demo slider steps 100 ft.
- `glass-cockpit-web/navdata`: NASR and CIFP transformations (`buildNasr`, `parseCifp`, `near`, `approachName`) moved from instrumentready.com, unchanged output. A separate export; the displays don't load it.
- Community docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, NOTICE, issue and PR templates. README reorganised.
- GitHub Actions CI: type check, unit tests, stale `dist/` check, install from git.

## 0.1.0 (2026-11-04)

First version, ported from FlightGear's FG1000.

- PFD: attitude, tapes, vertical speed, HSI with CDI, glideslope, bearing pointers, marker beacons, radios, active leg, flight plan window, and the softkey menus (inset map, nearest airports, transponder, wind, timer and references, alerts).
- MFD: engine strip, navigation and traffic maps, NRST, WPT, FPL with waypoint entry, checklists, DIRECT TO and PROC.
- Bezel: knobs, buttons and softkeys worked with the mouse, NAV/COM tuning and volume, CRS push.
- Vue components (`Glass.vue`, `Steam.vue`, `KitDemo.vue`) and `tuneNav` exported for instrumentready.com.
