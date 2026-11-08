// The navigation map's AIRWAYS key and Profile View, as the Pilot's Guide describes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { profileView, shownAirways } from "../dist/map.js";

const V1 = { id: "V1", type: "LO", points: ["A", "B"] };
const J2 = { id: "J2", type: "HI", points: ["A", "C"] };

test("airways: off, all, low only, high only; high drawn over low", () => {
  const all = [J2, V1];
  assert.deepEqual(shownAirways(all, 0, 10), []);
  assert.deepEqual(shownAirways(all, 1, 10), [V1, J2]);
  assert.deepEqual(shownAirways(all, 2, 10), [V1]);
  assert.deepEqual(shownAirways(all, 3, 10), [J2]);
});

test("airways: low altitude up to a 200 nm map range, high up to 300", () => {
  assert.deepEqual(shownAirways([V1, J2], 1, 200), [V1, J2]);
  assert.deepEqual(shownAirways([V1, J2], 1, 250), [J2]);
  assert.deepEqual(shownAirways([V1, J2], 1, 500), []);
});

test("profile view: half the map range, unavailable under 1 nm", () => {
  assert.equal(profileView(4500, 1.5), null);
  const p = profileView(4500, 10);
  assert.equal(p.nm, 5);
  assert.deepEqual(p.ticks.map((t) => t.label), ["0", "1.3", "2.5", "3.8", "5"]);
  assert.deepEqual([p.bottom, p.step], [4000, 500], "the aircraft in the second of four steps");
  assert.deepEqual([profileView(4500, 40).bottom, profileView(4500, 40).step], [3000, 1000]);
  assert.deepEqual([profileView(4500, 100).bottom, profileView(4500, 100).step], [2000, 2000]);
  assert.equal(profileView(300, 10).bottom, 0, "not below sea level");
});
