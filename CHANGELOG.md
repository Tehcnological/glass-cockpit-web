# Changelog

Notable changes. The package is installed from GitHub, so a version here is the `version` in `package.json`, not an npm release.

## Unreleased

- Community docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, NOTICE, issue and PR templates. README reorganised.
- GitHub Actions CI: type check, unit tests, stale `dist/` check, install from git.

## 0.1.0 (2026-11-04)

First version, ported from FlightGear's FG1000.

- PFD: attitude, tapes, vertical speed, HSI with CDI, glideslope, bearing pointers, marker beacons, radios, active leg, flight plan window, and the softkey menus (inset map, nearest airports, transponder, wind, timer and references, alerts).
- MFD: engine strip, navigation and traffic maps, NRST, WPT, FPL with waypoint entry, checklists, DIRECT TO and PROC.
- Bezel: knobs, buttons and softkeys worked with the mouse, NAV/COM tuning and volume, CRS push.
- Vue components (`Glass.vue`, `Steam.vue`, `KitDemo.vue`) and `tuneNav` exported for instrumentready.com.
