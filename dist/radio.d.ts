import type { CdiSource, MapPoint, Pointer, Radios } from "./glass-pfd.js";
export declare function tuneNav(radios: Radios, points: MapPoint[], lat: number, lon: number): {
    radios: {
        nav1: import("./surround.js").Radio & {
            id: string;
        };
        nav2: import("./surround.js").Radio & {
            id: string;
        };
        com1: import("./surround.js").Radio;
        com2: import("./surround.js").Radio;
    };
    bearings: Partial<Record<"NAV1" | "NAV2", Pointer>>;
};
/** Localizers are 108.10 to 111.95 MHz with an odd tenths digit; the rest of the NAV band is VORs. */
export declare function isLocalizer(mhz: number): boolean;
/** The CDI source as the v13 trainer names it: GPS, VOR1, LOC1, VOR2, LOC2 (FG1000 shows NAV1 and NAV2). "" for OFF. */
export declare function cdiLabel(source: CdiSource, radios: Radios): string;
