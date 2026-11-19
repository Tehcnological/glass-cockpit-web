# Tablet layout and touch input

## Why

instrumentready.com /kit is unusable on a phone: the 1407-wide bezel shrinks to about a quarter, so keys are a few
millimetres across. Phones are dropped. Tablets are supported with one display at a time. The Vue components are a
drop-in for instrumentready.com first; the defaults suit it, and the README says how to change them.

## Goals

- Phones: a notice ("open this on a tablet or computer") instead of the cockpit.
- Tablets: one unit and its bezel, a PFD/MFD switcher, the red DISPLAY BACKUP button on both views.
- Touch, first pass, bezel only: the browser stops getting in the way of keys and knob arrows.
- An option to run without the autopilot (a G1000 with no GFC 700).
- Desktop and mouse/keyboard behavior unchanged, apart from DISPLAY BACKUP now showing in the kit.

## Non-goals

- A phone layout. Touch on the screen area (the G1000 is not a touchscreen). A sim-control drawer for tablets: the
  sliders are KitDemo placeholders, so on a tablet only the autopilot moves the aircraft.
- Measuring redraw cost on a tablet; an iPad check goes on docs/parity.md's "not checked" list.

## Approaches

- A. All in `KitDemo.vue`. Smallest, but only /kit gets it.
- **B. Picked.** Touch fixes in core `src/bezel.ts` (every host, plain JS too, no option); a new `vue/Cockpit.vue`
  owns the layout; `KitDemo.vue` uses it.
- C. Layout in `GlassPfd`/`GlassMfd`. More code, and layout is the host's call everywhere else in this package.

## Design

**`vue/Cockpit.vue`** wraps two `Glass` units. Same data in and out as `Glass` (`state`, `mfd`, `vspeeds`, `afcs`,
`fd`, `startup`; emits `change`, `mfd`, `key`, `aligned`), so the host keeps its own `Afcs` and sim, as KitDemo does.

- `layout`: `auto` (default), `both`, `single`, `none`. `auto`: phone when the screen's short side is under 600 CSS
  px, then single when the primary pointer is coarse (`(pointer: coarse)`), else both.
- `single`: a thin bar on top, PFD | MFD switcher left, DISPLAY BACKUP right. Both units stay mounted (hidden with
  CSS), so alignment, pages and timers survive a switch. The PFD view draws the AFCS keys (`afcsKeys`) when the
  autopilot is on, since the MFD's are out of sight.
- `both`: the current stack, with DISPLAY BACKUP added.
- `none`: the phone notice, a default the host replaces with the `phone` slot.
- DISPLAY BACKUP: on, the PFD takes `reversionary` and a reversionary PFD shows in the MFD's place, as index.html does.
- `autopilot` (default true): false passes `afcsKeys: false` to both units and no `afcs`/`fd`; KitDemo then skips its
  `Afcs` loop. Exposed on KitDemo too.

**Touch, in `bezelInput`:** `touch-action: none` and `-webkit-touch-callout: none` / `user-select: none` on the hotspot
layer, so a press never scrolls, zooms, selects or pops a callout; `contextmenu` cancelled on the layer so a long
press stays a G1000 long press. Hit boxes grow only where they do not overlap a neighbour; nothing drawn changes.

**Docs:** README section on `Cockpit.vue` (props, slot, how to force a layout or use `Glass` directly), the touch
behavior, the autopilot option; CHANGELOG; parity.md "not checked" gets the iPad pass.

## Left to the builder

The exact phone threshold if 600 proves wrong, the bar's styling (kit colors, small), and which hit boxes can grow.
