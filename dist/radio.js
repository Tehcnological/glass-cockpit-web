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
