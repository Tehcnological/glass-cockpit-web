<script setup lang="ts">
// Every instrument in the kit on one state, with sliders. The GFC 700's keys on the MFD work once the PFD's AHRS has
// aligned and the preflight test has passed; with the autopilot engaged the sliders fly toward the command bars.
import { onMounted, onUnmounted, reactive, shallowRef } from "vue";
import Steam from "./Steam.vue";
import Glass from "./Glass.vue";
import type { MfdState } from "glass-cockpit-web";
// Not the main entry: that would pull the displays (Glass.vue loads them on its own) into this chunk.
import { Afcs, toyFly, type AfcsKey, type AfcsOutput } from "glass-cockpit-web/afcs";
import { LEVEL, type FlightState } from "./state";

const s = reactive<FlightState>({ ...LEVEL, gs: 0, adf: 30 });
const props = defineProps<{ nav: Pick<MfdState, "points" | "airspaces" | "airports" | "stations" | "procedures">; cycle: string }>();
// Cessna 172S POH speeds, for the PFD's speed references.
const vspeeds = { Vglide: 68, Vr: 55, Vx: 62, Vy: 74 };
const mfd = reactive<Partial<MfdState>>({
  ...props.nav, lat: 33.4, lon: -111.9, range: 10, dtk: 270, ete: 151, route: ["KIWA", "PXR", "KPHX"], activeLeg: 1, directFrom: null, magVar: 10,
  // Shared by both units' ALT knobs.
  selectedAlt: 4000,
  // NAV1 on Phoenix VOR, NAV2 on Stanfield; shared by the PFD and MFD.
  radios: { nav1: { active: 115.6, standby: 113.3, id: "" }, nav2: { active: 114.8, standby: 110.5, id: "" }, com1: { active: 120.9, standby: 121.5 }, com2: { active: 118.3, standby: 132.45 } },
  engine: { rpm: 2400, fuelFlow: 9.5, oilPressure: 60, oilTemp: 190, egt: 0.7, vacuum: 5, fuelLeft: 20, fuelRight: 18, volts: 28.1, engineHours: 1234.5 },
});
const sliders: [keyof FlightState, number, number, number][] = [
  ["pitch", -20, 20, 1], ["roll", -60, 60, 1], ["turnRate", -2, 2, 0.1], ["slip", -1, 1, 0.05],
  ["ias", 0, 200, 1], ["alt", 0, 15000, 10], ["vsi", -2000, 2000, 50], ["heading", 0, 359, 1],
  ["headingBug", 0, 359, 1], ["course", 0, 359, 1], ["cdi", -1, 1, 0.05], ["gs", -1, 1, 0.05], ["adf", -180, 180, 1],
];

// The autopilot, wired as the package's demo (index.html) wires it.
const afcs = new Afcs({ maxSpeed: 140 });
const out = shallowRef<AfcsOutput | null>(null);
let aligned = false, last = 0, drawnAt = 0, raf = 0;
function tick() {
  const now = performance.now(); // one clock: a frame's own timestamp can be earlier than a key press in it
  const dt = Math.min(0.1, (now - last) / 1000); // a background tab pauses frames: no jump after
  last = now;
  // No autopilot until the PFD's AHRS has aligned.
  // shortcut: NAV1 whatever the PFD's CDI softkey shows (Glass.vue keeps the CDI source in the display); upgrade when it hands it back.
  const o = (out.value = afcs.update({
    ...s, cdiDots: s.cdi * 2, selectedAlt: mfd.selectedAlt ?? null, radios: mfd.radios!, cdiSource: "NAV1", cdiValid: true, gpsMode: "ENR", failed: { attitude: !aligned },
  }, now));
  if (!o.ap || !o.fd) return;
  const { cdiDots, ...a } = toyFly({ ...s, cdiDots: s.cdi * 2 }, o.fd, dt);
  // FlightState's CDI is full scale ±1; its turn rate is in standard-rate units (3°/s), from the bank as the demo's PFD.
  Object.assign(s, a, { cdi: Math.max(-1, Math.min(1, cdiDots / 2)), turnRate: (1091 * Math.tan((a.roll * Math.PI) / 180)) / (a.ias + 6) / 3 });
}
// Each change redraws both displays and the steam gauges, so: nothing while the AFCS shows nothing, 10 times a second
// while it only annunciates (they flash), 30 while it flies.
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  const o = out.value;
  if (!o || (!o.fd && !o.display.status.text && !o.display.alert.text) || now - drawnAt < (o.ap ? 33 : 100)) return;
  drawnAt = now;
  tick();
}
const press = (k: AfcsKey) => (tick(), afcs.press(k), tick()); // a key acts on the last update's state: the sliders as they are now
const onAligned = () => ((aligned = true), tick()); // starts the preflight test
onMounted(() => (raf = requestAnimationFrame(loop)));
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="kit">
    <form class="ctl" @submit.prevent>
      <label v-for="[k, min, max, step] in sliders" :key="k">
        <span>{{ k }}</span>
        <input type="range" :min="min" :max="max" :step="step" v-model.number="(s as any)[k]" />
        <output aria-live="off">{{ +Number(s[k]).toFixed(2) }}</output>
      </label>
      <label><span>from</span><input type="checkbox" v-model="s.from" /></label>
      <label><span>range</span><input type="range" min="1" max="200" v-model.number="mfd.range" /><output>{{ mfd.range }}</output></label>
    </form>
    <Glass :state="s" :mfd="mfd" :vspeeds="vspeeds" :afcs="out?.display" :fd="out?.fd" @aligned="onAligned" @change="(p) => Object.assign(s, p)" @mfd="(p) => Object.assign(mfd, p)" />
    <Glass :state="s" unit="mfd" :mfd="mfd" @key="press" @change="(p) => Object.assign(s, p)" @mfd="(p) => Object.assign(mfd, p)" />
    <small><a href="/credits/">FAA NASR {{ cycle }}</a> · Not for navigation</small>
    <Steam :state="s" />
    <Steam :state="s" :gauges="['vor', 'adf']" />
  </div>
</template>

<style scoped>
  .kit { display: grid; gap: 16px; max-width: 900px; }
  .ctl { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px 18px; }
  label { display: grid; grid-template-columns: 84px 1fr 52px; gap: 8px; align-items: center; font: 500 13px var(--mono); color: var(--muted); }
  output { text-align: right; color: var(--ink); }
  input[type="range"] { width: 100%; accent-color: var(--red); }
</style>
