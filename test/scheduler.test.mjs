// AUX - UTILITY's scheduler (Pilot's Guide): reminder messages, one-time, periodic or at a date and time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "../dist/scheduler.js";

const T0 = Date.UTC(2026, 10, 8, 20, 0);
const min = 60_000;

/** Types `text` into message `i` with the knobs, as a pilot would. */
function type(s, i, text, now = T0) {
  s.cursor(i, "text");
  for (const [k, c] of [...text].entries()) {
    if (k > 0) s.outer(1, now);
    const from = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".indexOf(c);
    for (let n = 0; n < from; n++) s.inner(1, now); // from a blank
  }
  s.ent(now);
}

test("scheduler: ten empty messages, one-time by default", () => {
  const s = new Scheduler();
  assert.equal(s.items.length, 10);
  assert.deepEqual(s.items[0], { text: "", type: "One-time", timer: 0, at: null, due: null });
});

test("scheduler: the small knob types a message, the large knob moves along it, ENT keeps it", () => {
  const s = new Scheduler();
  type(s, 0, "FUEL 2");
  assert.equal(s.items[0].text, "FUEL 2");
  assert.equal(s.editing, null);
});

test("scheduler: a one-time message comes due once its timer runs out", () => {
  const s = new Scheduler();
  type(s, 0, "TANKS");
  s.cursor(0, "time");
  s.inner(30, T0); // 30 minutes
  assert.deepEqual(s.tick(T0 + 29 * min), []);
  assert.deepEqual(s.tick(T0 + 30 * min), ["TANKS"]);
  assert.deepEqual(s.tick(T0 + 90 * min), []);
});

test("scheduler: a periodic message comes due every time its timer runs out", () => {
  const s = new Scheduler();
  type(s, 1, "TANKS");
  s.cursor(1, "type");
  s.inner(1, T0);
  assert.equal(s.items[1].type, "Periodic");
  s.cursor(1, "time");
  s.inner(30, T0);
  assert.deepEqual(s.tick(T0 + 30 * min), ["TANKS"]);
  assert.deepEqual(s.tick(T0 + 31 * min), []);
  assert.deepEqual(s.tick(T0 + 60 * min), ["TANKS"]);
});

test("scheduler: an event message comes due at its date and time", () => {
  const s = new Scheduler();
  type(s, 2, "OIL");
  s.cursor(2, "type");
  s.inner(2, T0);
  assert.equal(s.items[2].type, "Event");
  s.cursor(2, "time");
  s.inner(6, T0); // an hour on from the next ten minutes
  assert.equal(s.items[2].at, T0 + 60 * min);
  assert.deepEqual(s.tick(T0 + 59 * min), []);
  assert.deepEqual(s.tick(T0 + 60 * min), ["OIL"]);
});

test("scheduler: no message without its text, and CLR clears the text, again restores it", () => {
  const s = new Scheduler();
  s.cursor(0, "time");
  s.inner(1, T0);
  assert.deepEqual(s.tick(T0 + min), []);
  type(s, 3, "AB");
  s.cursor(3, "text");
  s.clr();
  assert.equal(s.items[3].text, "");
  s.clr();
  assert.equal(s.items[3].text, "AB");
  s.clr();
  s.ent(T0); // ENT on the cleared line clears its time too
  assert.deepEqual(s.items[3], { text: "", type: "One-time", timer: 0, at: null, due: null });
});

test("scheduler: renaming a running message keeps its countdown", () => {
  const s = new Scheduler();
  type(s, 0, "A");
  s.cursor(0, "time");
  s.inner(30, T0);
  type(s, 0, "AB", T0 + 25 * min);
  assert.equal(s.items[0].due, T0 + 30 * min);
});

test("scheduler: a one-time message's timer reads zero once it has come due", () => {
  const s = new Scheduler();
  type(s, 0, "A");
  s.cursor(0, "time");
  s.inner(30, T0);
  s.tick(T0 + 30 * min);
  assert.equal(s.items[0].timer, 0);
});
