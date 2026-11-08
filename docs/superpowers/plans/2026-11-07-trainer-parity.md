# Trainer Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GCW's PFD and MFD behave and label like Garmin's Cessna NAVIII Trainer v13.02 (172S) where it differs from FG1000.

**Architecture:** Behavior and labels only, on the existing FG1000 artwork. New logic goes in small pure helpers (`src/radio.ts`, `src/nav.ts`) with unit tests; display wiring in `glass-pfd.ts`, `glass-mfd.ts`, `mfd-pages.ts`, `surround.ts` and `ui.ts` is checked in the demo. Every departure from FG1000 gets a one-line code comment and a README note.

**Tech Stack:** TypeScript, `node --test` against `dist/`, no runtime dependencies.

**Spec:** The live trainer check of 2026-11-07 (Claude, computer use; notes kept outside the repo) plus the Notion page "172S Session 2026-11-05 Full Notes". Chris, 2026-11-07: "prioritize diffs from the v13 trainer, its an official source". The values the tasks need are copied into each task below.

## Global Constraints

- Trainer behavior wins over FG1000. Copy behavior and labels only: no trainer art, sounds, screenshots, CHM text or nav data in the repo.
- Each departure from FG1000: a code comment naming it, and a line in README.md. CHANGELOG.md "Unreleased" gets one line per task.
- Behavior the trainer check did not record stays as FG1000 (or as GCW has it now).
- Never edit `src/svg/` by hand; `dist/` and `src/svg/` are rebuilt and committed with each task (`node scripts/build-svg.mjs`, then `node node_modules/typescript/bin/tsc`).
- Tests stay DOM-free. Commands on this machine: `node node_modules/typescript/bin/tsc` and `node --test test/*.test.mjs` (npm scripts fail here: "node not recognized").
- Softkeys that need data GCW has no source for (weather, terrain, charts, arrivals, departures) are shown dim and do nothing.
- Branch first; never commit on main. Stage by path, never `git add -A`. Commit as `git -c user.name="Chris DeFoe" -c user.email="chris@defoe.me"`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No em dashes anywhere.

## Review Focus

1. A NAV radio tuned to a localizer frequency at the band edges (108.10, 111.95) or a VOR on an even tenth (108.20, 112.00): the CDI label must read LOC or VOR correctly. Test in Task 3.
2. ACTIVATE on an approach with no FAF in its legs (a circling VOR-A, bad CIFP): vector-to-final must fall back to activating the first approach leg, never index -1. Test in Task 7.
3. Approach names `approachName` produces: "RNAV (GPS) Y RWY 08" and "RNAV (GPS)-D" are GPS approaches; "RNAV (RNP) Z RWY 03", "ILS RWY 07L", "VOR/DME-A", "LOC RWY 21" are not. Test in Task 7.
4. ADVISORY after the window was read and a new message arrives: the key goes back to ADVISORY; removing messages never leaves it stuck on ADVISORY. Test in Task 2.
5. DME window with no station for the source (no `bearings.NAV1`): shows "-.--NM", not "undefinedNM". Test in Task 6.

---

### Task 1: Dim softkeys and trainer key layouts

**Files:**
- Modify: `src/ui.ts:5-6` (Key), `src/surround.ts:105-110` (setSoftkeys), `src/glass-pfd.ts:258-316` (menu), `src/glass-mfd.ts:341-370` (softkeys, topKeys), `src/mfd-pages.ts` (NavigationMapPage.keys), README.md, CHANGELOG.md

**Interfaces:**
- Produces: `type Key = { label: string; act?: () => void; lit?: boolean; dim?: boolean }`; `dimKey(label: string): Key` in `src/ui.ts` (no act). `setSoftkeys(labels: string[], lit?: boolean[], dim?: boolean[])`: dim is grey text `#808080` on black.

Layouts (12 slots, index 0 first; `-` blank, `(dim)` via `dimKey`):

| Menu | Keys |
|---|---|
| PFD top | -, INSET, -, PFD, OBS (dim while `route` is empty), CDI, DME (Task 6, blank until then), XPDR, IDENT, TMR/REF, NRST, ALERTS |
| PFD INSET | OFF, DCLTR, WX LGND (dim), TRAFFIC, TOPO (dim), TERRAIN (dim), -, PRECIP (dim), -, METAR (dim), BACK, ALERTS |
| PFD PFD | SYN VIS, DFLTS, WIND, DME (Task 6, blank until then), BRG1, HSI FRMT, BRG2, -, ALT UNIT, STD BARO, BACK, ALERTS |
| MFD top (Navigation Map page) | ENGINE, -, MAP, -, -, -, -, -, -, DCLTR, SHW CHRT (dim), CHKLIST |
| MFD ENGINE | ENGINE, LEAN, SYSTEM, -, -, -, -, -, -, -, BACK, - |
| MFD LEAN | ENGINE, LEAN, SYSTEM, -, CYL SLCT, ASSIST, -, -, -, -, BACK, - |
| MFD SYSTEM | ENGINE, LEAN, SYSTEM, -, -, -, RST FUEL, GAL REM, -, -, BACK, - |
| MFD MAP | TRAFFIC, PROFILE, TOPO (dim), TERRAIN (dim), AIRWAYS, -, PRECIP (dim), -, METAR (dim), LEGEND (dim), BACK, - |

DCLTR stays working on the PFD inset although the trainer dims it there (GCW has the declutter levels); say so in the comment.

- [ ] **Step 1:** Add `dim` to `Key` and `dimKey`; pass `keys.map(k => !!k.dim)` wherever `setSoftkeys` is called; a dim key's act is never run.
- [ ] **Step 2:** Rewrite the PFD and MFD menus to the table. Comment: `// v13 trainer layout (FG1000: <old>)`.
- [ ] **Step 3:** Build and test. Run: `node scripts/build-svg.mjs && node node_modules/typescript/bin/tsc && node --test test/*.test.mjs`. Expected: tsc clean, all tests pass.
- [ ] **Step 4:** Demo check (`index.html`): each menu above reads as in the table; dim keys are grey and do nothing; OBS lights once a route is loaded.
- [ ] **Step 5:** README: softkey section notes the trainer layout and dim keys. CHANGELOG line. Commit `src/ dist/ README.md CHANGELOG.md` by path.

### Task 2: ADVISORY key

**Files:**
- Modify: `src/glass-pfd.ts` (menu `alerts` key, `openWindow`), README.md, CHANGELOG.md
- Test: `test/alerts.test.mjs` (create)

**Interfaces:**
- Produces: `export function alertsKey(count: number, seen: number): { label: "ALERTS" | "ADVISORY"; unread: boolean }` in `src/alerts.ts` (new, DOM-free, so the test can import it).

- [ ] **Step 1: Write the failing test**

```js
import { alertsKey } from "../dist/alerts.js";
test("unread messages turn the key into ADVISORY", () => {
  assert.deepEqual(alertsKey(0, 0), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(2, 0), { label: "ADVISORY", unread: true });
  assert.deepEqual(alertsKey(2, 2), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(3, 2), { label: "ADVISORY", unread: true }); // a new one after reading
  assert.deepEqual(alertsKey(1, 3), { label: "ALERTS", unread: false }); // messages removed
});
```

- [ ] **Step 2:** Run `node node_modules/typescript/bin/tsc; node --test test/alerts.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `alertsKey`. In the PFD keep `ui.alertsSeen`, set to `alerts.length` when the ALERTS window opens and clamped down when alerts shrink. Unread shows the ADVISORY label lit. Comment: `// shortcut: the trainer flashes ADVISORY; it is lit steadily here, flash once there is a blink timer`.
- [ ] **Step 4:** Run the full suite. Expected: all pass.
- [ ] **Step 5:** README (ALERTS: messages are strings, "TITLE - description" as the trainer writes them; unread shows ADVISORY). CHANGELOG. Commit by path.

### Task 3: CDI source labels VOR / LOC and the DTK / CRS box

**Files:**
- Modify: `src/radio.ts`, `src/glass-pfd.ts:436-437,691-697` (setCDISource, SelectedCRS), README.md, CHANGELOG.md
- Test: `test/radio.test.mjs`

**Interfaces:**
- Produces in `src/radio.ts`: `export function isLocalizer(mhz: number): boolean` (108.10 to 111.95 with an odd tenths digit); `export function cdiLabel(source: CdiSource, radios: Radios): string` returning "GPS", "VOR1", "LOC1", "VOR2", "LOC2" or "" for OFF.

- [ ] **Step 1: Write the failing tests**

```js
test("localizer frequencies", () => {
  for (const f of [108.1, 108.15, 109.9, 110.9, 111.95]) assert.equal(isLocalizer(f), true, String(f));
  for (const f of [108.0, 108.2, 108.25, 112.0, 113.1, 117.95]) assert.equal(isLocalizer(f), false, String(f));
});
test("CDI label follows the active NAV frequency", () => {
  const r = { ...radios, nav1: { active: 115.6, standby: 0, id: "" }, nav2: { active: 110.9, standby: 0, id: "" } };
  assert.equal(cdiLabel("GPS", r), "GPS");
  assert.equal(cdiLabel("NAV1", r), "VOR1");
  assert.equal(cdiLabel("NAV2", r), "LOC2");
  assert.equal(cdiLabel("OFF", r), "");
});
```

- [ ] **Step 2:** Run. Expected: FAIL, `isLocalizer` is not exported.
- [ ] **Step 3:** Implement with integer math on `Math.round(mhz * 100)` (no float tenths). `setCDISource` writes `cdiLabel(...)`; `SelectedCRS-bgtext` reads "DTK" for GPS, "CRS" for NAV. Comment the FG1000 departure (FG1000 shows NAV1/NAV2).
- [ ] **Step 4:** Run the full suite. Expected: all pass. Demo: CDI cycles GPS, VOR1 (or LOC1), VOR2/LOC2; the box label switches DTK/CRS.
- [ ] **Step 5:** README, CHANGELOG, commit by path.

### Task 4: REFERENCES window

**Files:**
- Modify: `src/glass-pfd.ts:95-99` (DEFAULTS), `:577-610` (drawWindow), `vue/KitDemo.vue` only if it relies on references being on, README.md, CHANGELOG.md

Trainer values: title "REFERENCES"; rows `TIMER 00:00:00 UP START?`, `GLIDE 68KT OFF`, `Vr 55KT OFF`, `Vx 62KT OFF`, `Vy 74KT OFF`, `MINIMUMS OFF ____FT`. All speed references default OFF.

- [ ] **Step 1:** DEFAULTS `vspeedsOn` all false. Row labels: `Vglide` shows as `GLIDE`, others as `Vr`/`Vx`/`Vy`. Title row "REFERENCES". Minimums on one row: label MINIMUMS, value OFF or BARO, then `____FT` when off and `<n>FT` when on (keep the `minalt` cursor stop on that value).
- [ ] **Step 2:** Run the full suite. Expected: all pass. Demo: TMR/REF matches the rows above; turning a reference on still shows its bug on the tape.
- [ ] **Step 3:** README (references start off, as the trainer). CHANGELOG under a "Changed" note, since a consumer that relied on the bugs showing by default must now set `vspeedsOn`. Commit by path.

### Task 5: Failure flags

**Files:**
- Modify: `src/glass-pfd.ts` (PfdState, DEFAULTS, HIDDEN, update), README.md (remove "failure flags" from Not ported), CHANGELOG.md

**Interfaces:**
- Produces: `PfdState.failed: Partial<Record<"attitude" | "airspeed" | "altitude" | "vsi" | "heading", boolean>>`, default `{}`. Maps to FG1000 groups `NoAttitude`, `NoASI`, `NoAlt`, `NoVS`, `NoHDG` inside `Failures`.

Trainer: GRS (AHRS) failure flags attitude only; GDC (air data) failure flags airspeed, altitude and vertical speed together, the baro box stays; GPS failure shows only the GPS NAV LOST message (the consumer adds the alert and sets `cdiValid: false`).

- [ ] **Step 1:** Take `Failures` out of `HIDDEN`; show each group from `failed`. Replace FG1000's "ATTIUDE FAIL" text (element `text6974`, no page prefix: query it from the screen) with "ATTITUDE FAIL"; comment the typo fix.
- [ ] **Step 2:** Run the full suite. Expected: all pass. Demo: add a "fail AHRS" / "fail ADC" toggle to `index.html`; the flags cover the right instruments only.
- [ ] **Step 3:** README: `failed` documented, the GRS/GDC/GPS mapping as a table, "failure flags" removed from Not ported. CHANGELOG. Commit by path.

### Task 6: DME window and DME TUNING

**Files:**
- Modify: `src/glass-pfd.ts` (HIDDEN, menu slots from Task 1, Window type, drawWindow, FMS knob in the DME window), README.md (remove "DME window" from Not ported), CHANGELOG.md
- Test: `test/radio.test.mjs`

**Interfaces:**
- Produces in `src/radio.ts`: `export function dmeText(p?: { distance?: number }): string`, "12.3NM" or "-.--NM".
- UI-local: `ui.dme: boolean` (PFD > DME toggles `DME1`), `ui.dmeSource: "NAV1" | "NAV2"`; `Window` adds `"DME"`.

Trainer: PFD > DME shows `DME / NAV1 / 110.90 / -.--NM` left of the HSI (the `DME1` artwork: `DME1-SRC-text`, `DME1-FREQ-text` = the source's active frequency, `DME1-DST-text`). The top-row DME key opens a DME TUNING window in the NRST window's place: `DME  MODE  NAV1`; the small FMS knob switches NAV1/NAV2.

- [ ] **Step 1: Write the failing test**

```js
test("DME distance text", () => {
  assert.equal(dmeText({ distance: 12.34 }), "12.3NM");
  assert.equal(dmeText({}), "-.--NM");
  assert.equal(dmeText(undefined), "-.--NM");
});
```

- [ ] **Step 2:** Run. Expected: FAIL, `dmeText` not exported.
- [ ] **Step 3:** Implement `dmeText`; take `DME1` out of `HIDDEN` (shown when `ui.dme`); fill the three texts from `radios` and `bearings[ui.dmeSource]`; add the two DME keys and the DME TUNING window. Comment: `// shortcut: no HOLD mode; add it when a scenario needs DME hold`.
- [ ] **Step 4:** Run the full suite. Expected: all pass. Demo: both DME keys behave as above.
- [ ] **Step 5:** README, CHANGELOG, commit by path.

### Task 7: PROCEDURES menu, NOT APPROVED FOR GPS, vector-to-final

**Files:**
- Modify: `src/nav.ts`, `src/mfd-pages.ts:1027-1150` (ProceduresPage), `:738`, `:995` (other activations clear `vtf`), `src/glass-mfd.ts` (MfdState `vtf`, DEFAULTS), `src/glass-pfd.ts:476` (FPL role tag lowercase), README.md (Not ported keeps approach suspend), CHANGELOG.md
- Test: `test/navdata.test.mjs` or a new `test/nav.test.mjs` (nav.ts is display code, so prefer `test/nav.test.mjs`)

**Interfaces:**
- Consumes: `Procedure`, `ProcLeg` from `src/nav.ts`; `approachName` names from `src/navdata.ts`.
- Produces in `src/nav.ts`: `export function gpsApproved(name: string): boolean` (true for names starting "RNAV (GPS)" or "GPS"); `export function vtfLeg(legs: { role?: string }[]): number` (index of the FAF, else 0). `MfdState.vtf: boolean`, default false, true only after ACTIVATE VECTOR-TO-FINAL or ACTIVATE with the VECTORS transition; any other activation sets it false. The consumer builds the PFD `leg` from it (`from: "vtf 356°"`).

Trainer: PROC opens a PROCEDURES menu: ACTIVATE VECTOR-TO-FINAL, ACTIVATE APPROACH, ACTIVATE MISSED APPROACH (dim until an approach is loaded), SELECT APPROACH, SELECT ARRIVAL, SELECT DEPARTURE (both dim in GCW, not ported). ACTIVATE? on a non-GPS approach asks `- NOT APPROVED FOR GPS -` / `GPS guidance is for monitoring only. Activate approach?` / YES or NO, YES preselected; NO goes back to ACTIVATE? without loading. YES with TRANS VECTORS makes the FAF the active waypoint, no direct-from leg. Flight plan role tags read lowercase: `faf`, `map`.

- [ ] **Step 1: Write the failing tests**

```js
import { gpsApproved, vtfLeg } from "../dist/nav.js";
test("which approaches the GPS may fly", () => {
  for (const n of ["RNAV (GPS) Y RWY 08", "RNAV (GPS)-D"]) assert.equal(gpsApproved(n), true, n);
  for (const n of ["ILS RWY 07L", "LOC RWY 21", "VOR/DME-A", "RNAV (RNP) Z RWY 03"]) assert.equal(gpsApproved(n), false, n);
});
test("vector-to-final activates the FAF, or the first leg without one", () => {
  assert.equal(vtfLeg([{ role: "IF" }, {}, { role: "FAF" }, { role: "MAP" }]), 2);
  assert.equal(vtfLeg([{ role: "IAF" }, { role: "MAP" }]), 0);
  assert.equal(vtfLeg([]), 0);
});
```

- [ ] **Step 2:** Run. Expected: FAIL, exports missing.
- [ ] **Step 3:** Implement the helpers. ProceduresPage gains a `menu` group shown first (`open()` starts there); ENT on SELECT APPROACH goes to today's page; the menu's ACTIVATE APPROACH and ACTIVATE VECTOR-TO-FINAL act on the loaded approach; ACTIVATE MISSED APPROACH sets the active leg to the first `MISSED` point. `load(activate)` asks the NOT APPROVED question first when `!gpsApproved(p.name)`. VTF: `activeLeg = enroute.length + vtfLeg(pts)`, `directFrom: null`, `vtf: true`. Comment each as a v13 trainer behavior (FG1000 has no PROC page).
- [ ] **Step 4:** Run the full suite. Expected: all pass. Demo: PROC > SELECT APPROACH > an ILS > ACTIVATE? shows the prompt; YES with VECTORS puts the arrow on the FAF; the FPL shows `faf`/`map`.
- [ ] **Step 5:** README (PROC section: the menu, the prompt, `vtf`). CHANGELOG. Commit by path.

---

## Not in this plan (trainer behavior not yet checked or out of scope)

- SUSP (the OBS slot turning SUSP after VTF, magenta SUSP on the HSI) and missed-approach sequencing: README "Not ported" keeps them.
- The plan named "FRELS / KIXD" (first fix / approach airport) when only an approach is loaded: `planName` needs the airport passed in; small follow-up.
- NAV1 auto-tuning the ILS frequency on activation: the consumer's radios.
- BARO MIN box, MENU sub-menus, reversionary mode, the MFD's NO GPS POSITION, the LEAN and SYSTEM strip contents: not checked live.
