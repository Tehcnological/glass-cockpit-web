# Changelog

Notable changes. The package is installed from GitHub, so a version here is the `version` in `package.json`, not an npm release.

## Unreleased

- PFD and MFD: MENU in DIRECT TO offers Cancel Direct-To NAV, which resumes the flight plan on the closest leg (Pilot's Guide).
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
