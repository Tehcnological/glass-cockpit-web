<script setup lang="ts">
// The PFD and MFD (Glass.vue) with the red DISPLAY BACKUP button, laid out for the device. This package's own; FG1000
// has no layout. Same data in and out as Glass.vue: the host keeps its own Afcs and sim (see KitDemo.vue).
// `layout`: `auto` (default) picks `none` on a phone (touch, short side under 600 px), `single` on another touch screen,
// else `both`; it is resolved once on mount and reported as a `layout` event.
// - `both`: PFD over MFD.
// - `single`: one at a time, with a PFD | MFD switcher. Both keep running, hidden but laid out (their text is measured
//   with getBBox, which a display:none unit cannot do), so alignment and pages survive a switch; the PFD draws the
//   GFC 700's keys, as the MFD's are out of sight.
// - `none`: no displays, the `phone` slot (default: a line asking for a tablet or computer).
// DISPLAY BACKUP puts the PFD in reversionary mode and shows a second, reversionary PFD in the MFD's place, over the MFD,
// which keeps its pages for when it is pushed again (as index.html does). `autopilot: false` drops the GFC 700: no keys
// on either bezel and no annunciations. A host that wants another layout uses Glass.vue directly.
import { nextTick, onMounted, ref } from "vue";
import type { AfcsDisplay, AfcsKey, MfdState, PfdOptions, PfdState } from "glass-cockpit-web";
import type { FlightState } from "./state";
import Glass from "./Glass.vue";

type Layout = "both" | "single" | "none";
const props = withDefaults(defineProps<{
  state: FlightState; mfd?: Partial<MfdState>; vspeeds?: PfdOptions["vspeeds"]; afcs?: AfcsDisplay | null; fd?: PfdState["fd"];
  startup?: number; layout?: "auto" | Layout; autopilot?: boolean;
}>(), { afcs: null, fd: null, startup: undefined, layout: "auto", autopilot: true });
const emit = defineEmits<{
  change: [patch: Partial<FlightState>]; mfd: [patch: Partial<MfdState>]; key: [key: AfcsKey]; aligned: []; layout: [layout: Layout];
}>();

const resolved = ref<Layout>();
const view = ref<"pfd" | "mfd">("pfd");
const backup = ref(false);
const backupEl = ref<HTMLDivElement>();

onMounted(async () => {
  let l = props.layout;
  if (l === "auto") {
    const coarse = matchMedia("(pointer: coarse)").matches;
    l = coarse && Math.min(innerWidth, innerHeight) < 600 ? "none" : coarse ? "single" : "both";
  }
  resolved.value = l;
  emit("layout", l);
  if (l === "none") return;
  const { DisplayBackup } = await import("glass-cockpit-web");
  await nextTick();
  new DisplayBackup(backupEl.value!, { onChange: (on) => (backup.value = on) });
});
</script>

<template>
  <div class="cockpit" :class="resolved">
    <slot v-if="resolved === 'none'" name="phone"><p class="phone">Open this on a tablet or computer.</p></slot>
    <template v-else-if="resolved">
      <div class="bar">
        <div v-if="resolved === 'single'" class="switch" role="group" aria-label="Display">
          <button v-for="u in (['pfd', 'mfd'] as const)" :key="u" type="button" :aria-pressed="view === u" @click="view = u">{{ u.toUpperCase() }}</button>
        </div>
        <div ref="backupEl" class="backup"></div>
      </div>
      <div class="units">
        <div class="place" :class="{ hidden: resolved === 'single' && view !== 'pfd' }">
          <Glass :state="state" :mfd="mfd" :vspeeds="vspeeds" :startup="startup" :reversionary="backup"
            :afcs="autopilot ? afcs : null" :fd="autopilot ? fd : null" :afcs-keys="autopilot && resolved === 'single'"
            @aligned="emit('aligned')" @key="(k) => emit('key', k)" @change="(p) => emit('change', p)" @mfd="(p) => emit('mfd', p)" />
        </div>
        <div class="place" :class="{ hidden: resolved === 'single' && view !== 'mfd' }">
          <Glass :class="{ hidden: backup }" :state="state" unit="mfd" :mfd="mfd" :afcs-keys="autopilot"
            @key="(k) => emit('key', k)" @change="(p) => emit('change', p)" @mfd="(p) => emit('mfd', p)" />
          <Glass v-if="backup" :state="state" :mfd="mfd" :vspeeds="vspeeds" :startup="0" reversionary
            :afcs="autopilot ? afcs : null" :fd="autopilot ? fd : null" :afcs-keys="autopilot"
            @key="(k) => emit('key', k)" @change="(p) => emit('change', p)" @mfd="(p) => emit('mfd', p)" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
  .cockpit { display: grid; gap: 8px; }
  .bar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .switch { display: flex; margin-right: auto; }
  .switch button { font: 600 14px var(--mono, monospace); padding: 8px 18px; min-height: 44px; border: 1px solid #555; background: #111; color: #ccc; }
  .switch button[aria-pressed="true"] { background: #e6e6e6; color: #000; }
  .backup { width: 56px; }
  .units { display: grid; gap: 16px; }
  /* A place stacks its units in one cell: the reversionary PFD over the MFD. */
  .place { display: grid; }
  .place > * { grid-area: 1 / 1; }
  /* One at a time: both places in one cell, as large as the screen's height allows. */
  .single .units { grid-template: 1fr / 1fr; }
  .single .place { grid-area: 1 / 1; width: min(100%, calc((100dvh - 72px) * 1407 / 918)); margin-inline: auto; }
  .hidden { visibility: hidden; }
  .phone { padding: 24px 0; }
</style>
