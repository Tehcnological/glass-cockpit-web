// GFC 700 flight director and autopilot (Pilot's Guide, AFCS section).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Afcs } from "../dist/afcs.js";

const RADIOS = { nav1: { active: 113.9, standby: 110.1 }, nav2: { active: 109.3, standby: 110.1 }, com1: { active: 118, standby: 118 }, com2: { active: 118, standby: 118 } };
const S = {
  pitch: 2, roll: 0, heading: 90, ias: 100, alt: 3000, vsi: 0, headingBug: 90, course: 90, selectedAlt: 5000, cdiSource: "NAV1",
  cdiDots: 0, cdiValid: true, gs: null, gpsMode: "ENR", radios: RADIOS, failed: {}, vnv: null,
};
// An AFCS with the aircraft in `s`, the last update at `t` ms.
const setup = (s = {}) => {
  const a = new Afcs();
  let t = 0;
  let state = { ...S, ...s };
  let out = a.update(state, t);
  return {
    a,
    get out() { return out; },
    press: (...keys) => { for (const k of keys) a.press(k); out = a.update(state, t); return out; },
    fly: (patch = {}, dt = 100) => { state = { ...state, ...patch }; t += dt; return (out = a.update(state, t)); },
  };
};
const modes = (o) => [o.display.lateralArmed.text, o.display.lateralActive.text, o.display.status.text, o.display.verticalActive.text, o.display.verticalReference.text, o.display.verticalArmed.text];

test("FD key: Roll and Pitch Hold with ALTS armed; again turns it off", () => {
  const u = setup();
  assert.deepEqual(modes(u.press("FD")), ["", "ROL", "", "PIT", "", "ALTS"]);
  assert.equal(u.out.display.lateralActive.color, "green");
  assert.equal(u.out.display.verticalArmed.color, "white");
  assert.deepEqual(u.out.fd, { pitch: 2, roll: 0 });
  assert.deepEqual(modes(u.press("FD")), ["", "", "", "", "", ""]);
  assert.equal(u.out.fd, null);
});

test("Roll Hold: wings level under 6°, holds 6° to 22°, limits beyond", () => {
  assert.equal(setup({ roll: 4 }).press("FD").fd.roll, 0);
  assert.equal(setup({ roll: 15 }).press("FD").fd.roll, 15);
  assert.equal(setup({ roll: -30 }).press("FD").fd.roll, -22);
});

test("Pitch Hold: NOSE UP/DN step 0.5° within -15° to +20°", () => {
  const u = setup({ pitch: 19.8 });
  u.press("FD");
  assert.equal(u.press("NOSE_UP").fd.pitch, 20);
  assert.equal(u.press("NOSE_DN", "NOSE_DN").fd.pitch, 19);
  assert.equal(setup({ pitch: 30 }).press("FD").fd.pitch, 20);
});

test("AP: engages with the flight director in ROL and PIT; FD key disabled; AP again flashes yellow 5 s", () => {
  const u = setup();
  let o = u.press("AP");
  assert.deepEqual(modes(o), ["", "ROL", "AP", "PIT", "", "ALTS"]);
  assert.equal(o.ap, true);
  assert.equal(u.press("FD").display.lateralActive.text, "ROL");
  o = u.press("AP");
  assert.equal(o.ap, false);
  assert.deepEqual(o.display.status, { text: "AP", color: "yellow", flash: true });
  assert.equal(o.display.lateralActive.text, "ROL", "the flight director stays on");
  assert.equal(u.fly({}, 5100).display.status.text, "");
});

test("AP: an attitude failure disconnects it in red until AP DISC, and removes the flight director", () => {
  const u = setup();
  u.press("AP");
  const o = u.fly({ failed: { attitude: true } }, 60000);
  assert.deepEqual(o.display.status, { text: "AP", color: "red", flash: true });
  assert.equal(o.fd, null);
  assert.equal(u.fly({}, 60000).display.status.color, "red");
  assert.equal(u.press("AP_DISC").display.status.text, "");
});

test("keys turn the flight director on in their own modes", () => {
  assert.deepEqual(modes(setup().press("ALT")).slice(1), ["ROL", "", "ALT", "3000FT", ""]);
  assert.deepEqual(modes(setup({ vsi: 540 }).press("VS")).slice(1), ["ROL", "", "VS", "500FPM", "ALTS"]);
  assert.deepEqual(modes(setup({ ias: 85.4 }).press("FLC")).slice(1), ["ROL", "", "FLC", "85KT", "ALTS"]);
  assert.deepEqual(modes(setup().press("HDG")).slice(1, 4), ["HDG", "", "PIT"]);
});

test("VS: reference to the nearest 100 fpm within -2000 to +1500, NOSE keys 100 fpm", () => {
  const u = setup({ vsi: 1480 });
  u.press("VS");
  assert.equal(u.out.display.verticalReference.text, "1500FPM");
  assert.equal(u.press("NOSE_UP").display.verticalReference.text, "1500FPM");
  assert.equal(u.press("NOSE_DN").display.verticalReference.text, "1400FPM");
});

test("FLC: NOSE UP slows the reference 1 kt; the airspeed reference shows above the tape", () => {
  const u = setup({ ias: 90 });
  u.press("FLC");
  assert.equal(u.out.display.airspeedRef, 90);
  assert.equal(u.press("NOSE_UP").display.airspeedRef, 89);
});

test("ALT: holds the altitude to the nearest 10 ft; pressed again, Pitch Hold", () => {
  const u = setup({ alt: 3047 });
  assert.equal(u.press("ALT").display.verticalReference.text, "3050FT");
  assert.equal(u.press("ALT").display.verticalActive.text, "PIT");
});

test("altitude capture: ALTS near the selected altitude with ALT armed, ALT within 50 ft, each flashing green", () => {
  const u = setup({ vsi: 1000 });
  u.press("VS");
  let o = u.fly({ alt: 4700 });
  assert.equal(o.display.verticalActive.text, "VS", "300 ft out at 1000 fpm: not yet");
  o = u.fly({ alt: 4820 });
  assert.deepEqual(modes(o).slice(3), ["ALTS", "5000FT", "ALT"]);
  assert.deepEqual(o.display.verticalActive, { text: "ALTS", color: "green", flash: true });
  o = u.fly({ alt: 4960, vsi: 200 });
  assert.deepEqual(modes(o).slice(3), ["ALT", "5000FT", ""]);
  assert.equal(o.display.verticalActive.flash, true);
  assert.equal(u.fly({}, 10100).display.verticalActive.flash, false);
});

test("altitude capture: climbing away does not capture; a new selected altitude during capture reverts to PIT", () => {
  const u = setup({ vsi: -500, alt: 4900 });
  u.press("VS");
  assert.equal(u.fly().display.verticalActive.text, "VS");
  const v = setup({ vsi: 1000, alt: 4850 });
  v.press("VS");
  assert.equal(v.fly().display.verticalActive.text, "ALTS");
  assert.deepEqual(modes(v.fly({ selectedAlt: 6000 })).slice(3), ["PIT", "", "ALTS"]);
});

test("NAV: captured inside one dot, armed beyond it and captured as the needle centers", () => {
  assert.deepEqual(modes(setup({ cdiDots: 0.5 }).press("NAV")).slice(0, 2), ["", "VOR"]);
  const u = setup({ cdiDots: 2 });
  u.press("HDG");
  assert.deepEqual(modes(u.press("NAV")).slice(0, 2), ["VOR", "HDG"]);
  assert.equal(u.out.display.lateralArmed.color, "white");
  const o = u.fly({ cdiDots: 0.9 });
  assert.deepEqual(modes(o).slice(0, 2), ["", "VOR"]);
  assert.deepEqual(o.display.lateralActive, { text: "VOR", color: "green", flash: true });
});

test("NAV: GPS and LOC by the CDI source; nothing without a valid source", () => {
  assert.equal(setup({ cdiSource: "GPS" }).press("NAV").display.lateralActive.text, "GPS");
  assert.equal(setup({ cdiSource: "NAV2" }).press("NAV").display.lateralActive.text, "LOC");
  const off = setup({ cdiValid: false }).press("NAV");
  assert.equal(off.fd, null, "the flight director stays off");
});

test("NAV: pressed again while active, back to Roll Hold", () => {
  const u = setup();
  u.press("NAV");
  assert.equal(u.press("NAV").display.lateralActive.text, "ROL");
});

test("NAV: lost navigation data rolls wings level in ROL, flashing yellow", () => {
  const u = setup({ roll: 10 });
  u.press("NAV");
  const o = u.fly({ cdiValid: false });
  assert.deepEqual(o.display.lateralActive, { text: "ROL", color: "yellow", flash: true });
  assert.equal(o.fd.roll, 0);
});

test("NAV: switching the CDI source or tuning another VOR reverts to ROL", () => {
  const u = setup();
  u.press("NAV");
  assert.deepEqual(modes(u.fly({ cdiSource: "GPS" })).slice(0, 2), ["", "ROL"]);
  const v = setup();
  v.press("NAV");
  assert.deepEqual(modes(v.fly({ radios: { ...RADIOS, nav1: { active: 116.8, standby: 110.1 } } })).slice(0, 2), ["VOR", "ROL"]);
});

test("APR on a localizer: LOC with GS armed; the glideslope captures as the needle centers", () => {
  const u = setup({ cdiSource: "NAV2", cdiDots: 1.5, gs: 0.8 });
  let o = u.press("APR");
  assert.deepEqual(modes(o).slice(0, 2), ["LOC", "ROL"]);
  assert.equal(o.display.verticalArmed.text, "ALTS GS");
  o = u.fly({ cdiDots: 0.3 });
  assert.equal(o.display.lateralActive.text, "LOC");
  o = u.fly({ gs: 0.05 });
  assert.deepEqual(modes(o).slice(3), ["GS", "", ""]);
  assert.ok(o.fd.pitch < 2, "descends");
  o = u.fly({ gs: null });
  assert.deepEqual(o.display.verticalActive, { text: "PIT", color: "yellow", flash: true });
});

test("APR: VOR is VAPP; GPS needs an approach, with GP armed when it has a glidepath", () => {
  assert.equal(setup().press("APR").display.lateralActive.text, "VAPP");
  assert.equal(setup({ cdiSource: "GPS" }).press("APR").fd, null);
  const u = setup({ cdiSource: "GPS", gpsMode: "LPV", gs: 0.5 });
  assert.equal(u.press("APR").display.verticalArmed.text, "ALTS GP");
  assert.equal(u.fly({ gs: 0 }).display.verticalActive.text, "GP");
  assert.equal(setup({ cdiSource: "GPS", gpsMode: "LNAV" }).press("APR").display.verticalArmed.text, "ALTS");
});

test("BC: only on a localizer, and LOC captures only within 105° of the course", () => {
  assert.equal(setup().press("BC").fd, null);
  assert.equal(setup({ cdiSource: "NAV2", heading: 270 }).press("BC").display.lateralActive.text, "BC");
  assert.equal(setup({ cdiSource: "NAV2", heading: 270 }).press("NAV").display.lateralArmed.text, "LOC");
});

test("HDG: turns toward the bug, the way it was turned, at no more than standard rate", () => {
  const u = setup();
  u.press("HDG");
  let o = u.fly({ headingBug: 180 });
  assert.ok(o.fd.roll > 14 && o.fd.roll < 16, `standard rate at 100 kt is about 15°, got ${o.fd.roll}`);
  // Turned on around past 180° (to 330, 240° right): still a right turn.
  u.fly({ headingBug: 270 });
  o = u.fly({ headingBug: 330 });
  assert.ok(o.fd.roll > 0);
  assert.ok(setup({ headingBug: 80 }).press("HDG").fd.roll < 0);
});

test("CWS: hand flying sets new references; AP shows CWS and the servos let go", () => {
  const u = setup();
  u.press("AP");
  u.a.cws(true);
  let o = u.fly({ pitch: 6, roll: 12 });
  assert.equal(o.display.status.text, "CWS");
  assert.equal(o.ap, false);
  assert.deepEqual(o.fd, { pitch: 6, roll: 12 });
  u.a.cws(false);
  o = u.fly();
  assert.deepEqual(o.fd, { pitch: 6, roll: 12 });
  assert.equal(o.ap, true);
});

test("GA: disconnects the autopilot, GA in both fields with ALTS armed; NOSE keys revert to ROL and PIT", () => {
  const u = setup();
  u.press("AP");
  let o = u.press("GA");
  assert.deepEqual(modes(o), ["", "GA", "AP", "GA", "", "ALTS"]);
  assert.equal(o.display.status.color, "yellow");
  assert.equal(o.fd.pitch, 7);
  assert.deepEqual(modes(setup({ onGround: true }).press("GA")).slice(1, 4), ["TO", "", "TO"]);
  o = u.press("NOSE_UP");
  assert.equal(o.display.lateralActive.text, "ROL");
  assert.equal(o.display.verticalActive.text, "PIT");
});

test("MAXSPD: over the autopilot's speed in Pitch Hold, pitch up; not in ALT", () => {
  const u = setup({ ias: 150, pitch: -5 });
  let o = u.press("FD");
  assert.equal(o.display.maxspd, true);
  assert.ok(o.fd.pitch > -5);
  o = u.press("ALT");
  assert.equal(o.display.maxspd, false);
});

test("VNV: VPTH armed; flashes until acknowledged; captures the path with ALTV when the target comes first", () => {
  const vnv = { dev: null, target: 4000, vsr: -500 };
  const u = setup({ cdiSource: "GPS", alt: 6000, selectedAlt: 3000, vnv });
  u.press("ALT");
  let o = u.press("VNV");
  assert.equal(o.display.verticalArmed.text, "VPTH");
  o = u.fly({ vnv: { ...vnv, dev: -300 } });
  assert.equal(o.display.verticalArmed.flash, true, "a minute out: acknowledge");
  o = u.press("VNV");
  assert.equal(o.display.verticalArmed.flash, false);
  assert.equal(o.display.verticalArmed.text, "VPTH");
  o = u.fly({ vnv: { ...vnv, dev: 0 } });
  assert.deepEqual(modes(o).slice(3), ["VPTH", "", "ALTV"]);
  assert.ok(o.fd.pitch < 2, "descends");
  o = u.fly({ alt: 4080, vsi: -500, vnv: { ...vnv, dev: 0 } });
  assert.deepEqual(modes(o).slice(3), ["ALTV", "4000FT", "ALT"]);
  o = u.fly({ alt: 4020, vsi: -100 });
  assert.deepEqual(modes(o).slice(3), ["ALT", "4000FT", "VPTH"]);
});

test("VNV: without acknowledgment the path is not captured", () => {
  const u = setup({ cdiSource: "GPS", alt: 6000, selectedAlt: 3000, vnv: { dev: null, target: 4000, vsr: -500 } });
  u.press("ALT", "VNV");
  assert.equal(u.fly({ vnv: { dev: 10, target: 4000, vsr: -500 } }).display.verticalActive.text, "ALT");
});

test("VNV: needs a profile on GPS", () => {
  assert.equal(setup({ cdiSource: "GPS" }).press("VNV").fd, null);
  assert.equal(setup({ vnv: { dev: null, target: 4000, vsr: 0 } }).press("VNV").fd, null);
});
