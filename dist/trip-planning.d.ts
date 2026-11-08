import type { MfdState } from "./glass-mfd.js";
export interface FuelStats {
    /** nm per gallon. */ efficiency: number | null;
    /** Hours on the fuel on board. */ endurance: number | null;
    /** Gallons left at the end of the trip. */ remFuel: number | null;
    /** Hours left at the end of the trip. */ remEndurance: number | null;
    /** Gallons the trip burns. */ fuelReq: number | null;
    /** nm on the fuel on board. */ range: number | null;
}
/** Knots, gallons an hour, gallons and the trip's hours (null when there is no trip). */
export declare function fuelStats(gs: number, ff: number, fuel: number, hours: number | null): FuelStats;
/** Feet, from the indicated altitude, the altimeter setting (inHg) and the air temperature (°C). */
export declare function densityAltitude(indAlt: number, baro: number, tempC: number): number;
/** Knots, from calibrated airspeed and the air's pressure and temperature; compressibility left out. */
export declare function trueAirspeed(cas: number, indAlt: number, baro: number, tempC: number): number;
/** Sunrise and sunset (ms, UTC) on the local day at `ms`, by the sunrise equation; null both when the sun stays up or down. */
export declare function sunTimes(lat: number, lon: number, ms: number): {
    rise: number | null;
    set: number | null;
};
export type TripState = Pick<MfdState, "lat" | "lon" | "magVar" | "route" | "activeLeg" | "points" | "airports">;
/** Leg `leg` of the flight plan (the leg into `route[leg]`), or REM, the rest of it, both from the aircraft on the active
 * leg. DTK is magnetic, and none for REM. */
export declare function tripLeg(s: TripState, leg: number | "REM"): {
    dis: number | null;
    dtk: number | null;
};
