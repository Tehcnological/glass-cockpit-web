// The engine strip's LEAN page (lean assist) and SYSTEM page (fuel calculator), as the Pilot's Guide describes them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FULL_GAL, FuelCalc, LeanAssist, PEAK_DROP } from "../dist/lean.js";
import { eisView, engineBack, engineKeys, leanMarkup, systemMarkup } from "../dist/eis.js";

const cyls = (...egt) => egt.map((e) => ({ egt: e, cht: 350 }));

test("CYL SLCT steps the selected cylinder 1 to 4 and round; not while ASSIST is on", () => {
  const l = new LeanAssist();
  assert.equal(l.selected, 0);
  for (const want of [1, 2, 3, 0]) l.cylSlct(), assert.equal(l.selected, want);
  l.assist();
  l.cylSlct();
  assert.equal(l.selected, 0);
});

test("lean assist: no peak while the EGTs rise; the first cylinder to fall past its peak is marked and selected", () => {
  const l = new LeanAssist();
  l.update(cyls(1300, 1320, 1310, 1290), 12); // off: watches nothing
  l.assist();
  l.update(cyls(1300, 1320, 1310, 1290), 12);
  l.update(cyls(1350, 1380, 1360, 1340), 10);
  l.update(cyls(1360, 1400, 1370, 1350), 9);
  assert.equal(l.peak, null);
  assert.equal(l.delta(cyls(1360, 1400, 1370, 1350)), null, "no peak yet: dashes");
  l.update(cyls(1370, 1400 - PEAK_DROP, 1375, 1360), 8.5); // cylinder 2 has passed its peak
  assert.deepEqual(l.peak, { cyl: 1, egt: 1400, flow: 9 });
  assert.equal(l.selected, 1);
  l.update(cyls(1360, 1350, 1360 - 2 * PEAK_DROP, 1340), 8); // another peaks later: the first one stays
  assert.equal(l.peak.cyl, 1);
  assert.equal(l.delta(cyls(1380, 1375, 1380, 1360)), -25, "below peak, on the peaked cylinder");
  l.assist();
  assert.equal(l.peak, null);
  assert.equal(l.on, false);
});

test("lean assist without per-cylinder data watches nothing", () => {
  const l = new LeanAssist();
  l.assist();
  l.update(undefined, 9);
  assert.equal(l.peak, null);
  assert.equal(l.delta(undefined), null);
});

test("fuel calculator: counts down with fuel flow from the value set; RST FUEL; GAL REM steps", () => {
  const f = new FuelCalc();
  assert.equal(f.remaining, FULL_GAL);
  assert.equal(f.used, 0);
  f.burn(10, 0); // the first call only starts the clock
  f.burn(10, 30 * 60_000); // half an hour at 10 GPH
  assert.equal(f.used, 5);
  assert.equal(f.remaining, FULL_GAL - 5);
  f.adjust(-10);
  assert.equal(f.remaining, FULL_GAL - 15);
  f.adjust(+1);
  assert.equal(f.remaining, FULL_GAL - 14);
  f.adjust(+100);
  assert.equal(f.remaining, FULL_GAL, "not past full");
  f.adjust(-100);
  assert.equal(f.remaining, 0, "not below empty");
  f.burn(10, 60 * 60_000);
  assert.equal(f.remaining, 0);
  f.reset();
  assert.equal(f.used, 0);
  assert.equal(f.remaining, FULL_GAL);
});

const labels = (m, s) => engineKeys(m, () => () => {}, s).map((k) => k.label);

test("engine keys: GAL REM's -10, -1, +1, +10 GAL; BACK from them goes to SYSTEM", () => {
  assert.deepEqual(labels("galrem"), ["", "", "", "", "-10 GAL", "-1 GAL", "+1 GAL", "+10 GAL", "", ""]);
  assert.deepEqual(["engine", "lean", "system", "galrem"].map(engineBack), ["top", "engine", "engine", "system"]);
  assert.deepEqual(["engine", "lean", "system", "galrem", "top", "map"].map(eisView), ["engine", "lean", "system", "system", "engine", "engine"]);
});

test("engine keys work the lean assist and the fuel calculator", () => {
  const s = { lean: new LeanAssist(), fuel: new FuelCalc() };
  const went = [];
  const keys = (m) => engineKeys(m, (to) => () => went.push(to), s);
  keys("lean")[4].act(); // CYL SLCT
  assert.equal(s.lean.selected, 1);
  keys("lean")[5].act(); // ASSIST
  assert.equal(s.lean.on, true);
  assert.equal(keys("lean")[5].lit, true);
  assert.equal(keys("lean")[4].dim, true, "CYL SLCT is disabled in ASSIST");
  keys("system")[7].act(); // GAL REM
  assert.deepEqual(went, ["galrem"]);
  keys("galrem")[4].act();
  keys("galrem")[7].act();
  assert.equal(s.fuel.remaining, FULL_GAL - 10 + 10);
  keys("galrem")[5].act();
  assert.equal(s.fuel.remaining, FULL_GAL - 1);
  s.fuel.used = 3;
  keys("system")[6].act(); // RST FUEL
  assert.deepEqual([s.fuel.used, s.fuel.remaining], [0, FULL_GAL]);
});

const engine = { rpm: 2400, fuelFlow: 9.5, oilPressure: 60, oilTemp: 190, egt: 0.7, vacuum: 5, fuelLeft: 20, fuelRight: 18, volts: 28.1, engineHours: 1234.5 };

test("LEAN page: the selected cylinder's EGT and CHT, a bar per cylinder; dashes without per-cylinder data", () => {
  const l = new LeanAssist();
  l.cylSlct();
  const m = leanMarkup({ ...engine, cylinders: [{ egt: 1350, cht: 340 }, { egt: 1380, cht: 365 }, { egt: 1360, cht: 350 }, { egt: 1340, cht: 345 }] }, l);
  assert.match(m, />1380</);
  assert.match(m, />365</);
  assert.equal((m.match(/class="egt"/g) ?? []).length, 4);
  assert.doesNotMatch(m, /PEAK/, "ASSIST off: no peak rows");
  const bare = leanMarkup(engine, new LeanAssist());
  assert.equal((bare.match(/class="egt"/g) ?? []).length, 4, "every cylinder shows the single EGT");
  assert.equal((bare.match(/>---</g) ?? []).length, 2, "EGT and CHT values dashed");
  l.assist();
  assert.match(leanMarkup(engine, l), /PEAK/);
});

test("SYSTEM page: oil, fuel flow, GAL USED and GAL REM", () => {
  const f = new FuelCalc();
  f.used = 4.25;
  f.remaining = 48.75;
  const m = systemMarkup(engine, f, false);
  for (const t of [">60<", ">190<", ">9.5<", ">4.3<", ">48.8<", "GAL USED", "GAL REM"]) assert.ok(m.includes(t), t);
});
