# Tablet layout and touch input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Touch-friendly bezel in core, and a drop-in `Cockpit.vue` that shows both units on desktop, one unit with a PFD/MFD switcher and DISPLAY BACKUP on tablets, a notice on phones, with an option to run without the autopilot.

**Architecture:** Touch fixes live in `bezelInput` (`src/bezel.ts`) so every host gets them. Layout lives in a new `vue/Cockpit.vue` wrapping `Glass.vue`; it routes the same props and events as `Glass`, so the host keeps its own `Afcs` and sim. `KitDemo.vue` switches to it.

**Tech Stack:** TypeScript, Vue 3 SFC (optional peer), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-19-tablet-touch-design.md`

## Global Constraints

- No runtime dependencies; `vue` stays an optional peer.
- `dist/` and `src/svg/` committed and current (`npm run build`); never edit `src/svg/` by hand.
- Mouse and keyboard behavior on a fine pointer unchanged.
- "Not for navigation" stays visible in the kit on every layout.
- No em dashes in code, comments or docs.
- Node may be missing from PATH: `export PATH="/c/Program Files/nodejs:$PATH"`.
- Commit as `git -c user.name="Christopher DeFoe" -c user.email="243516562+Tehcnological@users.noreply.github.com"`.

## Review Focus

- Two touch arrows side by side (inner/outer knob pairs, volume pairs): padded boxes must not overlap, or a tap turns the wrong ring. Task 1 test.
- A long press on a key on iOS: no callout, no text selection, still one long-press input. Manual, on the iPad list.
- Switching PFD/MFD mid-alignment: alignment keeps counting (units stay mounted, hidden with CSS, not `v-if`). Manual check in Task 2.
- DISPLAY BACKUP pushed while on the MFD tab: the MFD's place shows a reversionary PFD; pushed again, the MFD comes back on the page it was on. Manual check in Task 2.
- `autopilot: false`: no AFCS keys on either bezel and no annunciations, and KitDemo runs no `Afcs` loop. Manual check in Task 2.

---

### Task 1: Touch in the bezel

**Files:**
- Modify: `src/bezel.ts` (`bezelInput`, new export `touchBoxes`)
- Test: `test/bezel.test.mjs`
- Rebuild: `dist/`, `src/svg/`

**Interfaces:**
- Produces: `export function touchBoxes(spots: Spot[], pad: number): Spot["box"][]`, each spot's box grown by up to `pad` on each side, stopping short of any other spot's original box; boxes of non-arrow spots returned unchanged. `export const TOUCH_PAD = 8` (viewBox units).

- [ ] **Step 1: Write the failing tests** in `test/bezel.test.mjs` (import `SPOTS, touchBoxes, TOUCH_PAD` from `../dist/bezel.js`):

```js
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
test("touch boxes never overlap a neighbour", () => {
  const t = touchBoxes(SPOTS, TOUCH_PAD);
  for (let i = 0; i < t.length; i++) for (let j = 0; j < SPOTS.length; j++)
    if (i !== j && !hit(SPOTS[i].box, SPOTS[j].box)) assert.ok(!hit(t[i], SPOTS[j].box), `${i} grows into ${j}`);
});
test("touch boxes grow arrows and keep everything else", () => {
  const t = touchBoxes(SPOTS, TOUCH_PAD);
  SPOTS.forEach((s, i) => {
    if (!s.arrow) assert.deepEqual(t[i], s.box);
    else assert.ok(t[i][2] - t[i][0] >= s.box[2] - s.box[0] && t[i][3] - t[i][1] >= s.box[3] - s.box[1]);
  });
  assert.ok(SPOTS.some((s, i) => s.arrow && t[i][2] - t[i][0] > s.box[2] - s.box[0]));
});
```

Spots that already overlap each other (a knob's box under its arrows) are skipped by the `hit` guard; growth only has to avoid spots it did not touch before.

- [ ] **Step 2:** `npm test` fails: `touchBoxes` is not exported.
- [ ] **Step 3: Implement.** `touchBoxes`: per arrow spot, grow each side independently by `pad`, then shrink that side back to the nearest edge of any spot it did not already overlap. In `bezelInput`:
  - `const coarse = matchMedia?.("(pointer: coarse)").matches ?? false;` rects use `touchBoxes(spots, coarse ? TOUCH_PAD : 0)` for their geometry; arrow paths still centre on the original box. Fine pointers get pad 0, so hover glow is unchanged.
  - On the layer: `style="touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none"`.
  - `layer.addEventListener("contextmenu", (e) => e.preventDefault())`.
  - Header comment: one line that touch is this package's addition (FG1000 has the mouse wheel only).
- [ ] **Step 4:** `npm run build && npm test`: all pass.
- [ ] **Step 5:** Commit `src/bezel.ts test/bezel.test.mjs dist src/svg`: "Bezel: touch input (no scroll, zoom or callout; bigger arrow targets on touch)".

### Task 2: `Cockpit.vue`, KitDemo, docs

**Files:**
- Create: `vue/Cockpit.vue`
- Modify: `vue/KitDemo.vue`, `vue/Glass.vue` (header comment only, pointing to Cockpit), `README.md`, `CHANGELOG.md`, `docs/parity.md`

**Interfaces:**
- Consumes: `Glass.vue` props/events as they are; `DisplayBackup` from `glass-cockpit-web` (dynamic import, as `Glass.vue` does).
- Produces, `Cockpit.vue`:
  - Props: `state: FlightState`, `mfd?: Partial<MfdState>`, `vspeeds?`, `afcs?: AfcsDisplay | null`, `fd?`, `startup?: number`, `layout?: "auto" | "both" | "single" | "none"` (default `auto`), `autopilot?: boolean` (default `true`).
  - Emits: `change`, `mfd`, `key`, `aligned` (as `Glass`), and `layout: [resolved: "both" | "single" | "none"]` once on mount.
  - Slot `phone`, default `<p>Open this on a tablet or computer.</p>`.
- Produces, `KitDemo.vue`: new prop `autopilot?: boolean` (default `true`); also passes `layout` through (default `auto`).

- [ ] **Step 1: Cockpit.vue.**
  - Resolve once on mount: `auto` -> `coarse = matchMedia("(pointer: coarse)").matches`; `none` if `coarse && Math.min(innerWidth, innerHeight) < 600`, else `single` if `coarse`, else `both`. Emit `layout`.
  - `none`: render only the slot.
  - Otherwise render: PFD `Glass` (`reversionary = backup`, `afcsKeys = autopilot && resolved === "single"`), MFD `Glass` (`afcsKeys = autopilot`), and while `backup` a reversionary PFD `Glass` in the MFD's place (`startup: 0`, `afcsKeys = autopilot`, `mfd` passed so its engine strip has `mfd.engine`). Hide with CSS (`v-show`), never `v-if` on the PFD or MFD, so they keep running.
  - `single`: a bar above, `PFD | MFD` toggle (two buttons, `aria-pressed`) left, DISPLAY BACKUP right; only the chosen place shows. `both`: the stack with DISPLAY BACKUP above it on the right.
  - DISPLAY BACKUP: `new lib.DisplayBackup(el, { onChange: (on) => (backup.value = on) })`, about 56 px.
  - `autopilot: false`: pass `afcs: null`, `fd: null`, `afcsKeys: false` to every unit.
  - Header comment says what it does, the defaults, and that hosts can use `Glass` directly.
- [ ] **Step 2: KitDemo.vue.** Replace the two `Glass` with one `Cockpit`. Store the emitted layout; show sliders and `Steam` only when it is `both`. Keep the `FAA NASR ... Not for navigation` line on every layout. With `autopilot: false`, don't start the `requestAnimationFrame` loop and don't pass `afcs`/`fd`.
- [ ] **Step 3: Docs.**
  - README: a `Cockpit.vue` section (props, slot, layouts, how to force one or use `Glass` directly); touch behavior under the bezel controls; the `autopilot` option.
  - CHANGELOG: one entry for the release.
  - `docs/parity.md` "Not checked": add the iPad pass (taps, long press, knob arrows, joystick pan, redraw cost).
- [ ] **Step 4: Verify.**
  - `npm run build && npm test` pass.
  - In `../instrumentready.com`, a throwaway, uncommitted dependency on the worktree (`npm install ../glass-pfd-tablet --no-save`), then `npx astro check` passes. Restore with `npm ci` after.
  - Manual review-focus checks are Chris's, on the site's dev server, in a desktop browser with touch emulation.
- [ ] **Step 5:** Commit `vue README.md CHANGELOG.md docs/parity.md`: "Cockpit.vue: tablet layout with a PFD/MFD switcher and DISPLAY BACKUP; autopilot option".

### Task 3: PR

- [ ] Push `tablet-touch`, open a PR. The body says what changed, that the iPad check is pending, and that the site pin is not bumped. Do not merge.
