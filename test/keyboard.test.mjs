// Typing identifiers on the computer keyboard (not on the real unit; NXi takes a keypad the same way): a letter or digit
// goes in at the cursor and moves it on, Backspace clears back, Enter is ENT and Escape is CLR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyInput } from "../dist/bezel.js";
import { IdEntry } from "../dist/ui.js";

const key = (k, mods = {}) => keyInput({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

test("keyInput: letters and digits are CHAR, upper case; Backspace, Enter and Escape", () => {
  assert.deepEqual(key("k"), { control: "CHAR", value: 75 });
  assert.deepEqual(key("7"), { control: "CHAR", value: 55 });
  assert.deepEqual(key("Backspace"), { control: "CHAR", value: 8 });
  assert.deepEqual(key("Enter"), { control: "ENT", value: 1 });
  assert.deepEqual(key("Escape"), { control: "CLR", value: 1 });
});

test("keyInput: shortcuts and other keys are left to the browser", () => {
  assert.equal(key("c", { ctrlKey: true }), null);
  assert.equal(key("r", { metaKey: true }), null);
  assert.equal(key("Tab"), null);
  assert.equal(key("-"), null);
});

const typeIn = (e, s) => {
  for (const c of s) {
    IdEntry.typed = c;
    e.inner(1); // the display turns the small knob once with the typed key pending
  }
};

test("IdEntry: typed keys spell from the start and move the cursor on, stopping at the end", () => {
  const e = new IdEntry(null, 4);
  typeIn(e, "KPHXZ");
  assert.equal(e.value, "KPHZ");
  assert.equal(IdEntry.typed, null);
  assert.equal(e.ent(), "KPHZ");
});

test("IdEntry: Backspace clears the last character typed", () => {
  const e = new IdEntry(null, 5);
  typeIn(e, "KPH\b\bX");
  assert.equal(e.value, "KX___");
  const full = new IdEntry(null, 3);
  typeIn(full, "ABC\b\b");
  assert.equal(full.value, "A__");
});

test("IdEntry: without a typed key the inner knob still turns the character", () => {
  const e = new IdEntry(null, 3);
  e.inner(1);
  e.inner(1);
  assert.equal(e.value, "B__");
});

test("unusual attitude: typed keys are ignored as the FMS knob is", async () => {
  const { uaIgnores } = await import("../dist/unusual-attitude.js");
  assert.equal(uaIgnores("CHAR", "DTO"), true);
});
