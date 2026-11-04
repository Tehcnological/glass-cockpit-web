<script setup lang="ts">
// Every instrument in the kit on one state, with sliders.
import { reactive } from "vue";
import Steam from "./Steam.vue";
import Glass from "./Glass.vue";
import type { MfdState } from "glass-cockpit-web";
import { LEVEL, type FlightState } from "./state";

const s = reactive<FlightState>({ ...LEVEL, gs: 0, adf: 30 });
const props = defineProps<{ nav: Pick<MfdState, "points" | "airspaces" | "airports" | "stations" | "procedures">; cycle: string }>();
// Cessna 172S POH speeds, for the PFD's speed references.
const vspeeds = { Vglide: 68, Vr: 55, Vx: 62, Vy: 74 };
const mfd = reactive<Partial<MfdState>>({
  ...props.nav, lat: 33.4, lon: -111.9, range: 10, dtk: 270, ete: 151, route: ["KIWA", "PXR", "KPHX"], activeLeg: 1, directFrom: null, magVar: 10,
  // NAV1 on Phoenix VOR, NAV2 on Stanfield; shared by the PFD and MFD.
  radios: { nav1: { active: 115.6, standby: 113.3, id: "" }, nav2: { active: 114.8, standby: 110.5, id: "" }, com1: { active: 120.9, standby: 121.5 }, com2: { active: 118.3, standby: 132.45 } },
  engine: { rpm: 2400, fuelFlow: 9.5, oilPressure: 60, oilTemp: 190, egt: 0.7, vacuum: 5, fuelLeft: 20, fuelRight: 18, volts: 28.1, engineHours: 1234.5 },
});
const sliders: [keyof FlightState, number, number, number][] = [
  ["pitch", -20, 20, 1], ["roll", -60, 60, 1], ["turnRate", -2, 2, 0.1], ["slip", -1, 1, 0.05],
  ["ias", 0, 200, 1], ["alt", 0, 15000, 10], ["vsi", -2000, 2000, 50], ["heading", 0, 359, 1],
  ["headingBug", 0, 359, 1], ["course", 0, 359, 1], ["cdi", -1, 1, 0.05], ["gs", -1, 1, 0.05], ["adf", -180, 180, 1],
];
</script>

<template>
  <div class="kit">
    <form class="ctl" @submit.prevent>
      <label v-for="[k, min, max, step] in sliders" :key="k">
        <span>{{ k }}</span>
        <input type="range" :min="min" :max="max" :step="step" v-model.number="(s as any)[k]" />
        <output>{{ s[k] }}</output>
      </label>
      <label><span>from</span><input type="checkbox" v-model="s.from" /></label>
      <label><span>range</span><input type="range" min="1" max="200" v-model.number="mfd.range" /><output>{{ mfd.range }}</output></label>
    </form>
    <Glass :state="s" :mfd="mfd" :vspeeds="vspeeds" @change="(p) => Object.assign(s, p)" @mfd="(p) => Object.assign(mfd, p)" />
    <Glass :state="s" unit="mfd" :mfd="mfd" @change="(p) => Object.assign(s, p)" @mfd="(p) => Object.assign(mfd, p)" />
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
