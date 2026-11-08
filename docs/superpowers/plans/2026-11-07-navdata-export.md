# Navdata Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move instrumentready.com's pure NASR and CIFP transformations into glass-cockpit-web as a separate `glass-cockpit-web/navdata` export, with tests proving the output is unchanged.

**Architecture:** A new `src/navdata.ts` in GCW holds the record types, the NASR row-to-record mapping, the CIFP parser, approach naming and `near`. It takes data that has already been read (parsed CSV rows, CIFP text, finished airspace records) and has no package imports. instrumentready keeps everything with a dependency or a site choice: downloads, cycle dates, unzip, `csv-parse`, `shapefile`, `simplify-js`, the airspace build, the Phoenix cut (`kitData`) and writing the JSON files.

**Tech Stack:** TypeScript 5 (`tsc`), `node --test`, npm installs from GitHub.

**Spec:** the accepted navdata ownership intent and boundary in the Notion handoff pack (Claude Handoff Pack + ACS/PTS Schema, "GCW navdata ownership"), as confirmed by Chris on 2026-11-07: a dependency-free pure-parser export in GCW, with site orchestration staying in instrumentready.

## Global Constraints

- GCW keeps no runtime dependencies. `src/navdata.ts` imports only GCW's own types.
- `navdata` is a separate export (`./navdata` to `./dist/navdata.js`). The main entry (`dist/glass-pfd.js`) and `glass-cockpit-web/radio` must not import it.
- The move preserves behaviour exactly: no formula, filter, rounding or ordering changes. `near` keeps its flat-earth `nm`; do not swap in `bearingDistance`.
- Commit `dist/` with every source change. No `prepare` script.
- GPL-2.0-or-later, as the rest of GCW. Chris wrote the moved code, so moving it from the private repo into GPL is his call, made on 2026-11-07.
- instrumentready keeps cycle choice, FAA URLs, the 33.4, -111.9, 40 nm kit cut and branding.
- No em dashes in code, comments or docs.
- Another session has uncommitted work in instrumentready.com: lesson plan content, the scaffold script, the template, CLAUDE.md, the schema sections, `src/pages/credits.astro` (its CIFP airways line) and `HANDOFF.md`. None of it is this work's to commit, edit, stash or reformat.
  - **Part A** only reads instrumentready: the fixture and parity scripts live in the session scratchpad, write nothing in instrumentready.com, and run no `npm install` there.
  - **Part B** starts only once that work is committed (`git status --short` in instrumentready.com prints nothing).
  - **Staging, always:** stage files by explicit path, never `git add -A`, `git add .` or `git commit -a`, and check `git diff --cached --name-only` against the task's file list before committing.
- Commit as `git -c user.name="Chris DeFoe" -c user.email="chris@defoe.me"`.
- On Chris's Windows machine, `npm test` and `npx` fail with "node is not recognized". Run `node node_modules/typescript/bin/tsc` and `node --test test/` directly; CI runs the real `npm test`.

## Review Focus

1. NASR rows with an empty or missing optional column (`ALT_CODE`, `FUEL_TYPES`, `ICAO_ID`, `LAT_DECIMAL` on FRQ) produce the same record as today: `""` class, `""` fuel, the FAA id in place of a missing ICAO id, and the row skipped for stations. Pinned in Task 2's fixture.
2. The same frequency listed twice for one airport and use comes out once. Pinned in Task 2.
3. CIFP text with CRLF line endings parses the same as LF. Pinned in Task 1.
4. `near` lists VORs, NDBs and ARTCC/FSS/WX stations out to 200 nm even when `range` is smaller, and airports, fixes and airspace only within `range`. Pinned in Task 1.
5. Importing `glass-cockpit-web` or `glass-cockpit-web/radio` does not load `navdata.js`. Pinned in Task 1 and in CI (Task 3).

---

## Part A: glass-cockpit-web (branch `navdata-export`)

### Task 1: `navdata` export with CIFP parsing, approach names and `near`

**Files:**
- Create: `src/navdata.ts`
- Modify: `package.json` (`exports`)
- Create: `test/navdata.test.mjs`
- Regenerate: `dist/`

**Interfaces:**
- Produces, in `src/navdata.ts`, moved verbatim from instrumentready `src/lib/nasr.ts` at 2bff1af, with import paths changed to GCW's own (`./nav.js`, `./map.js`):
  - `export interface Nasr`, `export interface Cifp`. Export the private `Runway` tuple as `NasrRunway` and `Leg` as `CifpLeg` (renamed so they don't clash with GCW's `Runway` interface).
  - `export function near(data: Nasr, cifp: Cifp, lat: number, lon: number, range: number): { points: MapPoint[]; airspaces: Airspace[]; airports: Airport[]; stations: Station[]; procedures: Procedure[] }`
  - `export function approachName(id: string): string`
  - `export function parseCifp(text: string): Cifp["procedures"]`
  - `nm`, `coord`, `cifpPositions`, `cifpFixKey`, `cifpAlt`, `cifpRole`, `TYPES` and `CIRCLING` stay module-private.
  - `kitData` does not move.
- `package.json` `exports` gains `"./navdata": "./dist/navdata.js"`.

- [ ] **Step 1: Write the failing tests** in `test/navdata.test.mjs`, importing from `../dist/navdata.js`:
  - `CIFP approaches: transitions, final legs, fix positions and roles`: copy instrumentready's `src/lib/nasr.test.ts` test of that name with its `CIFP` fixture unchanged (KPHX ILS RWY 08, cycle 2611) and every assertion unchanged.
  - `approach names`: copy instrumentready's six `approachName` assertions unchanged.
  - `CIFP with CRLF line endings parses the same`: `assert.deepEqual(parseCifp(CIFP.replace(/\n/g, "\r\n")), parseCifp(CIFP))`.
  - `near keeps navaids and stations to 200 nm and the rest to range`: hand-built `Nasr` and `Cifp` with `cycle: "2026-10-29"`, centered at 33.4, -111.9, `range` 40:
    - one airport at 33.43, -112.01 (in);
    - one airport at 34.65, -112.42 (about 80 nm, out);
    - one VOR at 34.65, -112.42 (in, because of the 200 nm rule);
    - one VOR at 37.0, -111.9 (216 nm, out);
    - one fix 10 nm away (in) and one 60 nm away (out);
    - one WX station 100 nm away (in);
    - one airspace ring with a point inside 40 nm (in) and one entirely 80 nm out (out).

    Assert:
    - the ids in `points` by type;
    - `airports.length === 1`;
    - `stations.length === 1`;
    - `airspaces.length === 1`;
    - that the in-range airport's `approaches` equals the names of procedures whose `airport` matches it.
  - `main entry does not load navdata`: read `dist/glass-pfd.js` and `dist/radio.js` as text and assert neither contains `navdata`.
- [ ] **Step 2: Run them to see them fail**

  Run: `node --test test/navdata.test.mjs`
  Expected: FAIL with `Cannot find module '.../dist/navdata.js'`.
- [ ] **Step 3: Create `src/navdata.ts`** with the Interfaces above. Header comment: what it is, that the FAA data is public domain, that it moved from instrumentready.com on 2026-11-07, and that it is build-time code no display imports. Add the `./navdata` export.
- [ ] **Step 4: Build and run all tests**

  Run: `npm run build` (on Windows: `node scripts/build-svg.mjs && node node_modules/typescript/bin/tsc -p tsconfig.json`), then `node --test test/`
  Expected: all tests pass, including the existing bezel and radio tests. `git status` shows `dist/navdata.js` and `dist/navdata.d.ts` and no change to other `dist/` files apart from `.d.ts` files that re-export types, if any.
- [ ] **Step 5: Commit** `src/navdata.ts`, `test/navdata.test.mjs`, `package.json` and `dist/` with the message "navdata export: CIFP parsing, approach names and near, moved from instrumentready.com".

### Task 2: `buildNasr`, the NASR row-to-record mapping

**Files:**
- Modify: `src/navdata.ts`
- Create: `test/fixtures/nasr-rows.json`, `test/fixtures/nasr-expected.json`
- Modify: `test/navdata.test.mjs`
- Regenerate: `dist/`

**Interfaces:**
- Consumes: `Nasr` from Task 1.
- Produces:
  - `export type NasrCsv = Record<"NAV_BASE" | "FIX_BASE" | "APT_BASE" | "APT_RWY" | "FRQ" | "ILS_BASE", Record<string, string>[]>`, keyed by the CSV file name without `.csv`, holding rows as `csv-parse` returns them with `columns: true`.
  - `export function buildNasr(cycle: string, csv: NasrCsv, airspace: Nasr["airspace"]): Nasr`
  - The body is instrumentready `scripts/nasr.ts` at 2bff1af from `const round` through the end of the stations loop (just before "Class B, C and D outlines"), verbatim, with each `await csv("X", "Y.csv")` replaced by `csv.Y` (`csv.NAV_BASE`, `csv.FIX_BASE`, `csv.APT_BASE`, `csv.FRQ`, `csv.ILS_BASE`, `csv.APT_RWY`). That covers `round`, `vhf`, `magVar`, `NAV_TYPES`, `CLASS`, `USES`, navaids, fixes, airport frequencies, ILS, runways, airports and stations. It returns `{ cycle, navaids, fixes, airports, stations, airspace }`, keeping the key order of today's `out`.

- [ ] **Step 1: Make the fixtures** with a one-off script kept in the session scratchpad, not committed. Run it from instrumentready.com so it can use that repo's `csv-parse` and `fflate` and its `.cache/nasr/2026-10-29/` downloads. It writes:
  - `nasr-rows.json`: a `NasrCsv` of the real 2026-10-29 rows:
    - **Airports:** every APT_BASE, APT_RWY and ILS_BASE row for PHX, CHD and FFZ, plus one APT_BASE row for a private-use AZ airport (filtered out). Use one with an empty `FUEL_TYPES` if possible; otherwise blank that cell and say so in `source`.
    - **Navaids:** the NAV_BASE rows for PXR and TFD, plus one AZ row with a NAV_TYPE that is filtered out (for example `VOT` or `TACAN`) and one not OPERATIONAL, if the cycle has them.
    - **Fixes:** the FIX_BASE rows for ALLIS, AVENT and SARTE.
    - **Frequencies:** every FRQ row whose `SERVICED_FACILITY` is PHX, CHD or FFZ; the first three RCAG rows with `ARTCC_OR_FSS_ID` ZAB; and the FSS row that names an RCO's `ARTCC_OR_FSS_ID`, with that RCO row.
  - `nasr-expected.json`: `{ "source": "<one line: instrumentready 2bff1af src/data/nasr.json, cycle 2026-10-29, sliced to the fixture's ids>", "nasr": <Nasr> }`. The `nasr` value is sliced from instrumentready's committed `src/data/nasr.json`, not computed by new code:
    - the `navaids`, `fixes` and `airports` whose ids are in the fixture;
    - the `stations` produced by the fixture's FRQ rows, in file order;
    - `airspace: []`.

  If the slice and the rows disagree (for example a duplicate frequency at PHX spans a row that isn't included), widen the rows, never edit the expected output.
- [ ] **Step 2: Write the failing tests**
  - `buildNasr reproduces today's records for real 2026-10-29 rows`: `assert.deepEqual(buildNasr("2026-10-29", rows, []), expected.nasr)`.
  - `an airport's repeated frequency is listed once`: copy one PHX FRQ row and assert PHX's `freqs` is unchanged.
- [ ] **Step 3: Run them to see them fail**

  Run: `node --test test/navdata.test.mjs`
  Expected: FAIL with `buildNasr is not a function`.
- [ ] **Step 4: Implement `buildNasr`** as given in Interfaces, then rebuild.
- [ ] **Step 5: Run the tests**

  Run: `node --test test/`
  Expected: PASS.
- [ ] **Step 6: Compare against today's full output (one-off, not committed).** From instrumentready.com, run a scratchpad `parity.ts` with instrumentready's `tsx`. It:
  - reads the cached 2026-10-29 zips the way `scripts/nasr.ts` does;
  - calls GCW's `buildNasr` and `parseCifp` from the absolute path of `glass-pfd/dist/navdata.js`;
  - asserts that `JSON.stringify` of `buildNasr("2026-10-29", rows, committed.airspace)` equals the committed `src/data/nasr.json` byte for byte;
  - asserts the same for `{ cycle, procedures: parseCifp(...) }` against `src/data/cifp.json`;
  - asserts that `near(committed nasr, committed cifp, 33.4, -111.9, 40)` deep-equals `src/data/kit.json`'s `nav`.

  Expected: all three pass, and instrumentready's `git status` is unchanged afterwards. Paste the output into the PR description.
- [ ] **Step 7: Commit** `src/navdata.ts`, the two fixtures, the test and `dist/` with the message "navdata: buildNasr, NASR rows to records, proven against the 2026-10-29 output".

### Task 3: Docs, CI and the PR

**Files:**
- Modify: `README.md` (the Install table, plus a new "Navdata" section after "Map"), `CHANGELOG.md` (Unreleased), `.github/workflows/ci.yml` (step "Installs from git the way a site does"), `CLAUDE.md` (Project paragraph)

**Interfaces:**
- Consumes: the `./navdata` export and the four function names from Tasks 1 and 2.

- [ ] **Step 1: README.**
  - Add an Install table row: `glass-cockpit-web/navdata` | Build-time FAA NASR and CIFP transformations: `buildNasr`, `parseCifp`, `near`, `approachName`. Not loaded by the displays.
  - Add a "Navdata" section: what each function takes and returns, and that downloading, unzipping, CSV parsing and the airspace shapefile stay with the host (which packages instrumentready uses for them). Add a one-line example of `near(...)` feeding `mfd.set(...)`, and say the data is FAA public domain and not for navigation.
- [ ] **Step 2: CHANGELOG.** Under Unreleased, add: "`glass-cockpit-web/navdata`: NASR and CIFP transformations moved from instrumentready.com, unchanged output."
- [ ] **Step 3: CI.** In the install-from-git step, add `const n = await import('glass-cockpit-web/navdata'); for (const f of [n.buildNasr, n.parseCifp, n.near, n.approachName]) if (typeof f !== 'function') throw ...`. Add a check that importing `glass-cockpit-web` does not load navdata: `grep -q navdata node_modules/glass-cockpit-web/dist/glass-pfd.js && exit 1 || true`. In the README "CI" section, add these to step 4's description.
- [ ] **Step 4: CLAUDE.md.** One sentence in Project: GCW owns the NASR/CIFP transformations (`navdata`); instrumentready owns downloads, the cycle and the Phoenix cut.
- [ ] **Step 5: Verify.** Check every relative link in README, and grep the changed docs for em dashes. Expected: no broken links, no em dashes.
- [ ] **Step 6: Commit, push the branch and open a PR.** The PR body lists the three parity results from Task 2 Step 6. Merging is Chris's call.

---

## Part B: instrumentready.com (only after its working tree is clean)

### Task 4: Use `glass-cockpit-web/navdata`

**Precondition:** `git -C instrumentready.com status --short` prints nothing, and Part A is merged to GCW main. If anything is still uncommitted, stop and ask Chris; do not work around it. `credits.astro` and `HANDOFF.md` are the files that overlap with the other session's work: read their committed versions before Step 6.

**Files:**
- Modify: `package.json`, `package-lock.json` (GCW pin from `7b5fe15` to the merge commit)
- Modify: `scripts/nasr.ts` (the code from `const round` through the stations loop becomes one `buildNasr` call)
- Modify: `src/lib/nasr.ts` (keeps only `kitData` and type re-exports)
- Delete: `src/lib/nasr.test.ts` (its tests now live in GCW)
- Unchanged: `src/lib/kit.test.ts`, `scripts/kit-data.ts`, `src/pages/credits.astro`

**Interfaces:**
- Consumes: `buildNasr`, `parseCifp`, `near`, `Nasr`, `Cifp`, `NasrCsv` from `glass-cockpit-web/navdata`.
- Produces: `src/lib/nasr.ts` exports:
  - `kitData(data: Nasr, cifp: Cifp)`, unchanged;
  - `export type { Nasr, Cifp } from "glass-cockpit-web/navdata"`, so `kit.test.ts` keeps importing types from `./nasr`.

- [ ] **Step 1: Update the pin:** `npm install glass-cockpit-web@github:Tehcnological/glass-cockpit-web`. Expected: `package-lock.json` resolves to the Part A merge commit.
- [ ] **Step 2: Edit `scripts/nasr.ts`:**
  - Build `const rows: NasrCsv` from the six `csv()` calls (the same sub-archives and file names as today).
  - Keep the airspace block as it is.
  - Replace the mapping code with `const out = buildNasr(cycle, rows, airspace)`.
  - Take `parseCifp` from GCW.
  - Keep the closing log line, reading counts from `out`.
- [ ] **Step 3: Slim `src/lib/nasr.ts`** to its header comment, the type re-export and `kitData` (importing `near` from GCW). Delete `src/lib/nasr.test.ts`.
- [ ] **Step 4: Prove the output is unchanged**

  Run: `npx tsx scripts/nasr.ts 2026-10-29 && npx tsx scripts/kit-data.ts && git diff --exit-code src/data`
  Expected: no diff in `src/data/nasr.json`, `cifp.json` or `kit.json`. The run uses `.cache/nasr/2026-10-29/`, so nothing is downloaded.
- [ ] **Step 5: Tests and build**

  Run: `npm test`, then `npm run build`
  Expected: both pass. `kit.test.ts` still proves `kit.json` equals `kitData` and stays under 1 MB.
- [ ] **Step 6: README and HANDOFF.** Where they describe `npm run nasr`, say the transformations come from `glass-cockpit-web/navdata` and this repo keeps the downloads, cycle and Phoenix cut. Edit only those lines. `credits.astro` stays unchanged: it reads the JSON files, which don't change.
- [ ] **Step 7: Commit, push and open a PR.** Stage by path: `package.json package-lock.json scripts/nasr.ts src/lib/nasr.ts src/lib/nasr.test.ts README.md HANDOFF.md`. Before committing, confirm `git diff --cached --name-only` lists exactly those files. Put the Step 4 output in the PR description. Merging is Chris's call.
