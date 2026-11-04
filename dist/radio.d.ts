import type { MapPoint, Pointer, Radios } from "./glass-pfd.js";
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
