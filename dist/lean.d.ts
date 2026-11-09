/** One cylinder's temperatures, degrees F. */
export interface Cylinder {
    egt: number;
    cht: number;
}
/** Degrees F an EGT must fall below the highest it reached before lean assist calls that its peak. An assumption: the
 * Pilot's Guide gives no figure, and a small drop keeps sensor noise from marking a peak early. */
export declare const PEAK_DROP = 10;
/**
 * The LEAN page's selected cylinder and ASSIST mode. Reading of the Pilot's Guide: CYL SLCT steps through the cylinders
 * and is disabled while ASSIST is on; with ASSIST on the unit watches every cylinder as the pilot leans, and the first
 * to pass its peak is marked and selected, with the difference from its peak and the fuel flow at it. ASSIST again
 * turns it off and clears the peak.
 */
export declare class LeanAssist {
    selected: number;
    on: boolean;
    /** The first cylinder to peak (index), its peak EGT and the fuel flow then. */
    peak: {
        cyl: number;
        egt: number;
        flow: number;
    } | null;
    private max;
    cylSlct(count?: number): void;
    assist(): void;
    /** Each draw, with the cylinders and fuel flow (GPH). */
    update(cyls: Cylinder[] | undefined, flow: number): void;
    /** ΔPEAK: the peaked cylinder's EGT now less its peak, degrees F; null before a peak. */
    delta(cyls: Cylinder[] | undefined): number | null;
}
/** The 172S's usable fuel, gallons: what RST FUEL sets GAL REM to. */
export declare const FULL_GAL = 53;
/** The SYSTEM page's fuel calculator: a quantity the pilot sets, counted down by fuel flow (not the fuel gauges). */
export declare class FuelCalc {
    used: number;
    remaining: number;
    private at;
    /** Each draw: fuel flow (GPH) since the last call, at time `now` (ms). */
    burn(gph: number, now: number): void;
    /** RST FUEL. */
    reset(): void;
    /** GAL REM's -10, -1, +1 and +10 GAL, between empty and full. */
    adjust(gal: number): void;
}
