# Changelog

Notable changes. The package is installed from GitHub, so a version here is the `version` in `package.json`, not an npm release.

## Unreleased

- Softkeys follow the G1000 trainer (v13.02, 172S): its layouts on the PFD and MFD menus, and dim keys for what is unavailable.
- `glass-cockpit-web/navdata`: NASR and CIFP transformations (`buildNasr`, `parseCifp`, `near`, `approachName`) moved from instrumentready.com, unchanged output. A separate export; the displays don't load it.
- Community docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, NOTICE, issue and PR templates. README reorganised.
- GitHub Actions CI: type check, unit tests, stale `dist/` check, install from git.

## 0.1.0 (2026-11-04)

First version, ported from FlightGear's FG1000.

- PFD: attitude, tapes, vertical speed, HSI with CDI, glideslope, bearing pointers, marker beacons, radios, active leg, flight plan window, and the softkey menus (inset map, nearest airports, transponder, wind, timer and references, alerts).
- MFD: engine strip, navigation and traffic maps, NRST, WPT, FPL with waypoint entry, checklists, DIRECT TO and PROC.
- Bezel: knobs, buttons and softkeys worked with the mouse, NAV/COM tuning and volume, CRS push.
- Vue components (`Glass.vue`, `Steam.vue`, `KitDemo.vue`) and `tuneNav` exported for instrumentready.com.
