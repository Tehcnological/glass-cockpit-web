# Changelog

Notable changes. The package is installed from GitHub, so a version here is the `version` in `package.json`, not an npm release.

## Unreleased

- Softkeys follow the G1000 trainer (v13.02, 172S): its layouts on the PFD and MFD menus, and dim keys for what is unavailable.
- PFD: the ALERTS key reads ADVISORY while a message is unread.
- PFD: the CDI label reads VOR1, LOC1, VOR2 or LOC2, and the course box DTK on GPS. `cdiLabel` and `isLocalizer` in `glass-cockpit-web/radio`.
- Changed: the PFD's speed references start off, as the trainer has them. A host that relied on the bugs showing by default sets `vspeedsOn`. TMR/REF follows the trainer's REFERENCES layout.
- PFD: `failed` shows FG1000's failure flags for attitude, airspeed, altitude, vertical speed and heading.
- PFD: the DME window and DME TUNING. `dmeText` in `glass-cockpit-web/radio`.
- MFD: PROC opens a PROCEDURES menu (activate vector-to-final, approach, missed approach), asks NOT APPROVED FOR GPS before activating a non-GPS approach, and activates vector-to-final with the VECTORS transition. New MFD state `vtf`; `gpsApproved` and `vtfLeg` exported.
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
