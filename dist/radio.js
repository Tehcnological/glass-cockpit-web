// shortcut: flat-earth distance and bearing; within a degree inside 200 nm. Use a great circle if scenarios go farther.
const nm = (lat1, lon1, lat2, lon2) => Math.hypot((lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)), lat2 - lat1) * 60;
export function tuneNav(radios, points, lat, lon) {
    const bearings = {};
    const out = { ...radios };
    for (const n of [1, 2]) {
        const r = radios[`nav${n}`];
        const [p] = points
            .filter((p) => p.type === "VOR" && Math.abs(Number(p.freq) - r.active) < 0.005)
            .sort((a, b) => nm(lat, lon, a.lat, a.lon) - nm(lat, lon, b.lat, b.lon));
        out[`nav${n}`] = { ...r, id: p?.id ?? "" };
        if (!p)
            continue;
        const x = (p.lon - lon) * Math.cos(((lat + p.lat) / 2) * (Math.PI / 180));
        const brg = (Math.atan2(x, p.lat - lat) * 180) / Math.PI - (p.magVar ?? 0);
        bearings[`NAV${n}`] = { id: p.id, bearing: ((brg % 360) + 360) % 360, distance: nm(lat, lon, p.lat, p.lon) };
    }
    return { radios: out, bearings };
}
/** Localizers are 108.10 to 111.95 MHz with an odd tenths digit; the rest of the NAV band is VORs. */
export function isLocalizer(mhz) {
    const k = Math.round(mhz * 100);
    return k >= 10810 && k <= 11195 && Math.floor(k / 10) % 2 === 1;
}
/** The CDI source as the v13 trainer names it: GPS, VOR1, LOC1, VOR2, LOC2 (FG1000 shows NAV1 and NAV2). "" for OFF. */
export function cdiLabel(source, radios) {
    if (source === "GPS" || source === "OFF")
        return source === "GPS" ? "GPS" : "";
    const n = source === "NAV1" ? 1 : 2;
    return (isLocalizer(radios[`nav${n}`].active) ? "LOC" : "VOR") + n;
}
