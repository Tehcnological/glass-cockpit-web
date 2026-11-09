// The engine strip's LEAN page lean assist and SYSTEM page fuel calculator, as the Cessna 172S G1000 Pilot's Guide
// describes them. FG1000 has neither (its EIS has only the ENGINE page). No DOM: the drawing is in eis.ts.
/** Degrees F an EGT must fall below the highest it reached before lean assist calls that its peak. An assumption: the
 * Pilot's Guide gives no figure, and a small drop keeps sensor noise from marking a peak early. */
export const PEAK_DROP = 10;
/**
 * The LEAN page's selected cylinder and ASSIST mode. Reading of the Pilot's Guide: CYL SLCT steps through the cylinders
 * and is disabled while ASSIST is on; with ASSIST on the unit watches every cylinder as the pilot leans, and the first
 * to pass its peak is marked and selected, with the difference from its peak and the fuel flow at it. ASSIST again
 * turns it off and clears the peak.
 */
export class LeanAssist {
    selected = 0;
    on = false;
    /** The first cylinder to peak (index), its peak EGT and the fuel flow then. */
    peak = null;
    max = [];
    cylSlct(count = 4) {
        if (!this.on)
            this.selected = (this.selected + 1) % count;
    }
    assist() {
        this.on = !this.on;
        this.peak = null;
        this.max = [];
    }
    /** Each draw, with the cylinders and fuel flow (GPH). */
    update(cyls, flow) {
        if (!this.on || this.peak || !cyls)
            return;
        cyls.forEach((c, i) => {
            const m = this.max[i];
            if (!m || c.egt > m.egt)
                this.max[i] = { egt: c.egt, flow };
            else if (!this.peak && m.egt - c.egt >= PEAK_DROP) {
                this.peak = { cyl: i, ...m };
                this.selected = i;
            }
        });
    }
    /** ΔPEAK: the peaked cylinder's EGT now less its peak, degrees F; null before a peak. */
    delta(cyls) {
        const c = this.peak && cyls?.[this.peak.cyl];
        return c ? c.egt - this.peak.egt : null;
    }
}
/** The 172S's usable fuel, gallons: what RST FUEL sets GAL REM to. */
export const FULL_GAL = 53;
/** The SYSTEM page's fuel calculator: a quantity the pilot sets, counted down by fuel flow (not the fuel gauges). */
export class FuelCalc {
    used = 0;
    remaining = FULL_GAL;
    at = null;
    /** Each draw: fuel flow (GPH) since the last call, at time `now` (ms). */
    burn(gph, now) {
        if (this.at !== null) {
            const gal = (gph * (now - this.at)) / 3_600_000;
            this.used += gal;
            this.remaining = Math.max(0, this.remaining - gal);
        }
        this.at = now;
    }
    /** RST FUEL. */
    reset() {
        this.used = 0;
        this.remaining = FULL_GAL;
    }
    /** GAL REM's -10, -1, +1 and +10 GAL, between empty and full. */
    adjust(gal) {
        this.remaining = Math.min(FULL_GAL, Math.max(0, this.remaining + gal));
    }
}
