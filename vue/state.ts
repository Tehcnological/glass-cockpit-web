// One aircraft state for the instrument kit. Topic tools set it; Steam.vue and Glass.vue draw it.
export interface FlightState {
  /** Degrees, nose up positive. */ pitch: number;
  /** Degrees, right wing down positive. */ roll: number;
  /** Turn rate in standard-rate units: 1 = 3°/s right. */ turnRate: number;
  /** Ball, -1 to 1, positive right. */ slip: number;
  /** Knots. */ ias: number;
  /** Feet. */ alt: number;
  /** Feet per minute. */ vsi: number;
  /** Altimeter setting, inches of mercury. */ baro: number;
  /** Magnetic heading, degrees. */ heading: number;
  /** Degrees. */ headingBug: number;
  /** Selected course (OBS), degrees. */ course: number;
  /** Course deviation as a fraction of full scale, -1 to 1; positive means the course is to the right. */ cdi: number;
  /** FROM flag instead of TO. */ from: boolean;
  /** Glideslope, fraction of full scale, positive means fly up; null when there is no glideslope. */ gs: number | null;
  /** ADF relative bearing, degrees; null when no NDB is tuned. */ adf: number | null;
}

export const LEVEL: FlightState = {
  pitch: 0, roll: 0, turnRate: 0, slip: 0, ias: 100, alt: 3000, vsi: 0, baro: 29.92,
  heading: 90, headingBug: 90, course: 90, cdi: 0, from: false, gs: null, adf: null,
};
