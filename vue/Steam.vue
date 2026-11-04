<script setup lang="ts">
// Steam gauges from OpenAttitude (Torsten Dreyer, LGPL-3.0-or-later), driven by the kit's FlightState.
import { installPanelMath } from "@openattitude/core";
import { AirspeedIndicator } from "@openattitude/steam-airspeedindicator-senecaii";
import { AttitudeIndicator } from "@openattitude/steam-attitudegyro-senecaii";
import { Altimeter20kFt } from "@openattitude/steam-altimeter20kft-senecaii";
import { TurnCoordinator } from "@openattitude/steam-turncoordinator-generic";
import { Ki525 } from "@openattitude/steam-ki525-generic";
import { VerticalSpeedIndicator } from "@openattitude/steam-verticalspeedindicator-generic";
import { Ki209 } from "@openattitude/steam-ki209-generic";
import { Ki227Adf } from "@openattitude/steam-ki227-senecaii";
import type { FlightState } from "./state";

installPanelMath(); // the gauges call Math.clamp

export type Gauge = "asi" | "ai" | "alt" | "tc" | "hsi" | "vsi" | "vor" | "adf";

const props = withDefaults(defineProps<{ state: FlightState; gauges?: Gauge[] }>(), {
  gauges: () => ["asi", "ai", "alt", "tc", "hsi", "vsi"],
});

const HPA_PER_INHG = 33.8639;
</script>

<template>
  <div class="steam">
    <template v-for="g in props.gauges" :key="g">
      <AirspeedIndicator v-if="g === 'asi'" :indicated-speed-kt="state.ias" />
      <AttitudeIndicator v-else-if="g === 'ai'" :pitch-deg="state.pitch" :roll-deg="state.roll" />
      <Altimeter20kFt v-else-if="g === 'alt'" :indicated-altitude-ft="state.alt" :setting-hpa="state.baro * HPA_PER_INHG" />
      <TurnCoordinator v-else-if="g === 'tc'" :indicated-turn-rate="state.turnRate" :indicated-slip-skid="state.slip" />
      <!-- KI 525 deflection is in degrees: 10 is full scale. -->
      <Ki525 v-else-if="g === 'hsi'" :indicated-heading-deg="state.heading" :selected-heading-deg="state.headingBug"
        :selected-course-deg="state.course" :cdi-deflection="state.cdi * 10" :gs-deflection="state.gs ?? 0"
        :has-glideslope="state.gs !== null" :gs-in-range="state.gs !== null" :nav-data-valid="true"
        :to-flag-norm="state.from ? 0 : 1" :from-flag-norm="state.from ? 1 : 0" />
      <VerticalSpeedIndicator v-else-if="g === 'vsi'" :vertical-speed-fpm="state.vsi" />
      <Ki209 v-else-if="g === 'vor'" :selected-obs-deg="state.course" :heading-needle-deflection-norm="state.cdi"
        :gs-needle-deflection-norm="state.gs ?? 0" :has-glideslope="state.gs !== null" :gs-in-range="state.gs !== null"
        :signal-quality-norm="1" :nav-data-valid="true" :to-flag-norm="state.from ? 0 : 1" :from-flag-norm="state.from ? 1 : 0" />
      <Ki227Adf v-else-if="g === 'adf'" :indicated-bearing-deg="state.adf ?? 0" :card-heading-deg="0" />
    </template>
  </div>
</template>

<style scoped>
  .steam { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .steam :deep(svg) { display: block; width: 100%; height: auto; }
</style>
