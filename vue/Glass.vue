<script setup lang="ts">
// Glass PFD or MFD from glass-cockpit-web (a port of FlightGear's FG1000, GPL-2.0-or-later, github.com/Tehcnological/glass-cockpit-web),
// loaded as its own script and driven by the kit's FlightState. `mfd` passes map, flight plan and engine data through
// (the PFD uses its position, map and airports for the inset map and NRST window); `vspeeds` sets the PFD's speed references.
// `reversionary` puts a PFD in reversionary mode, with `mfd.engine` in its engine strip; for the MFD's place in
// reversionary mode, the host shows a second `unit="pfd"` with it set.
// The bezel's knobs work with the mouse; changes to FlightState values come back as a `change` event.
// Autopilot: the MFD's GFC 700 keys come out as a `key` event for the host's `Afcs`; its `update` gives `afcs` (the
// annunciations) and `fd` (the command bars) to pass back to the PFD. `afcsKeys` on the PFD in the MFD's place draws them there.
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { AfcsDisplay, AfcsKey, GlassMfd, GlassPfd, MfdState, PfdOptions, PfdState } from "glass-cockpit-web";
import type { FlightState } from "./state";
import { tuneNav } from "glass-cockpit-web/radio";

const props = withDefaults(defineProps<{
  state: FlightState; unit?: "pfd" | "mfd"; bezel?: boolean;
  mfd?: Partial<MfdState>; vspeeds?: PfdOptions["vspeeds"]; reversionary?: boolean;
  afcs?: AfcsDisplay | null; fd?: PfdState["fd"]; afcsKeys?: boolean;
}>(), {
  unit: "pfd",
  bezel: true,
  reversionary: false,
  afcs: null,
  fd: null,
  afcsKeys: undefined,
});
const emit = defineEmits<{ change: [patch: Partial<FlightState>]; mfd: [patch: Partial<MfdState>]; key: [key: AfcsKey] }>();
const box = ref<HTMLDivElement>();
let pfd: GlassPfd | undefined;
let mfd: GlassMfd | undefined;

function draw(s: FlightState) {
  const m = props.mfd ?? {};
  // `mfd.radios`, when given, tunes NAV1 and NAV2 to VORs in `mfd.points`.
  const nav = m.radios && tuneNav(m.radios, m.points ?? [], m.lat ?? 0, m.lon ?? 0);
  pfd?.set({
    pitch: s.pitch, roll: s.roll, slip: s.slip, ias: s.ias, tas: s.ias, alt: s.alt, vsi: s.vsi, baro: s.baro,
    heading: s.heading, turnRate: s.turnRate * 3, headingBug: s.headingBug, course: s.course, from: s.from, gs: s.gs,
    cdiDots: s.cdi * 2, // the PFD's CDI is two dots each side
    bearings: { ...nav?.bearings, ...(s.adf !== null && { ADF: { id: "", bearing: s.heading + s.adf } }) },
    ...pickKeys(m, ["lat", "lon", "points", "airspaces", "route", "activeLeg", "directFrom", "vtf", "airports", "procedures", "magVar", "selectedAlt", "minimums"]),
    ...nav && { radios: nav.radios },
    reversionary: props.reversionary, ...m.engine && { engine: m.engine },
    afcs: props.afcs, fd: props.fd,
  });
  mfd?.set({ heading: s.heading, headingBug: s.headingBug, course: s.course, baro: s.baro, alt: s.alt, track: s.heading, groundspeed: s.ias, ...m, ...nav });
}

onMounted(async () => {
  const lib = await import("glass-cockpit-web");
  // Hand back what FlightState and `mfd` hold (`mfd` would otherwise undo the RANGE knob on the next redraw);
  // the rest (CDI source and the like) stays in the display. `mfd.selectedAlt`, when given, is shared by both units.
  const pick = (patch: object, from: object) => Object.fromEntries(Object.entries(patch).filter(([k]) => k in from));
  const onChange = (patch: object) => {
    const back = pick(patch, props.state);
    if (Object.keys(back).length) emit("change", back);
    // The flight plan's keys, user waypoints (`points`) and minimums (PROC's approach loading sets the PFD's) always go
    // back, so a host that never set `vtf` still shares it.
    const map = pick(patch, { route: 0, activeLeg: 0, directFrom: 0, vtf: 0, points: 0, minimums: 0, ...props.mfd });
    if (Object.keys(map).length) emit("mfd", map);
  };
  const onInput = ({ control }: { control: string }) => (lib.AFCS_KEYS as readonly string[]).includes(control) && emit("key", control as AfcsKey);
  if (props.unit === "mfd") mfd = new lib.GlassMfd(box.value!, { bezel: props.bezel, onChange, onInput, afcsKeys: props.afcsKeys });
  else pfd = new lib.GlassPfd(box.value!, { bezel: props.bezel, onChange, vspeeds: props.vspeeds, onInput, afcsKeys: props.afcsKeys });
  draw(props.state);
});
onUnmounted(() => (pfd?.destroy(), mfd?.destroy()));

const pickKeys = (o: object, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
watch(() => [{ ...props.state }, props.mfd, props.reversionary, props.afcs, props.fd], () => draw(props.state), { deep: true });
</script>

<template>
  <div ref="box" class="glass" :class="{ bezel }"></div>
</template>

<style scoped>
  .glass { aspect-ratio: 4 / 3; background: #000; }
  .glass.bezel { aspect-ratio: 1407 / 918; background: none; }
  .glass :deep(svg) { display: block; width: 100%; height: auto; }
</style>
