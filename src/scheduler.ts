// AUX - UTILITY's scheduler, from the Pilot's Guide (FG1000 has none): reminder messages for the PFD's ALERTS window,
// once when their timer runs out (One-time), each time it does (Periodic), or at a date and time (Event). DOM-free, so
// it can be tested. Messages are not kept over a power cycle as the real unit's are.
import { clamp, mod } from "./page.js";

export const SCHEDULE_TYPES = ["One-time", "Periodic", "Event"] as const;
export type ScheduleField = "text" | "type" | "time";
const FIELDS: ScheduleField[] = ["text", "type", "time"];
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LENGTH = 20;
const STEP = 10 * 60_000; // shortcut: an event's date and time step 10 minutes a detent; the real unit types them in.

export interface Reminder {
  text: string;
  type: (typeof SCHEDULE_TYPES)[number];
  /** One-time and Periodic: the timer, s. */ timer: number;
  /** Event: when, ms. */ at: number | null;
  /** When it next comes due, ms; null for not set. */ due: number | null;
}

const blank = (): Reminder => ({ text: "", type: "One-time", timer: 0, at: null, due: null });

export class Scheduler {
  readonly items: Reminder[] = Array.from({ length: 10 }, blank);
  /** The message and field the cursor is on. */ i = 0;
  f: ScheduleField = "text";
  /** The text being typed, and the character the large knob is on. */ editing: string[] | null = null;
  pos = 0;
  private cleared: string | null = null;

  cursor(i: number, f: ScheduleField) {
    [this.i, this.f, this.editing, this.cleared] = [i, f, null, null];
  }

  private arm(r: Reminder, now: number) {
    r.due = r.type === "Event" ? r.at : r.timer > 0 ? now + r.timer * 1000 : null;
  }

  /** The small FMS knob: a character, the type, or the timer (minutes) or event time. */
  inner(d: number, now: number) {
    const r = this.items[this.i];
    if (this.f === "text") {
      if (!this.editing) [this.editing, this.pos] = [[...r.text.padEnd(LENGTH, " ")], 0];
      this.editing[this.pos] = CHARS[mod(CHARS.indexOf(this.editing[this.pos]) + d, CHARS.length)];
      return;
    }
    if (this.f === "type") r.type = SCHEDULE_TYPES[clamp(SCHEDULE_TYPES.indexOf(r.type) + d, 0, SCHEDULE_TYPES.length - 1)];
    else if (r.type === "Event") r.at = (r.at ?? Math.ceil(now / STEP) * STEP) + d * STEP;
    else r.timer = Math.max(0, r.timer + d * 60);
    this.arm(r, now);
  }

  /** The large FMS knob: along the text being typed, or on through the fields. */
  outer(d: number) {
    if (this.editing) {
      this.pos = clamp(this.pos + Math.sign(d), 0, LENGTH - 1);
      return;
    }
    const at = clamp(this.i * FIELDS.length + FIELDS.indexOf(this.f) + Math.sign(d), 0, this.items.length * FIELDS.length - 1);
    this.cursor(Math.floor(at / FIELDS.length), FIELDS[at % FIELDS.length]);
  }

  /** ENT keeps the text typed; on a cleared line it clears the message's time too; otherwise it goes on a field. */
  ent() {
    if (this.editing) {
      this.items[this.i].text = this.editing.join("").trim(); // a running timer keeps running
      this.editing = null;
      this.outer(1);
    } else if (this.f === "text" && this.cleared !== null) {
      this.items[this.i] = blank();
      this.cleared = null;
    } else this.outer(1);
  }

  /** CLR on a message's text clears it; again, restores it. While typing, it stops. */
  clr() {
    const r = this.items[this.i];
    if (this.editing) this.editing = null;
    else if (this.f !== "text") return;
    else if (this.cleared !== null) [r.text, this.cleared] = [this.cleared, null];
    else if (r.text) [this.cleared, r.text] = [r.text, ""];
  }

  /** The messages that came due by `now`; a periodic one starts its timer again. */
  tick(now: number): string[] {
    const out: string[] = [];
    for (const r of this.items) {
      if (r.due === null || r.due > now) continue;
      if (r.text) out.push(r.text);
      if (r.type === "One-time") r.timer = 0; // spent: it reads 00:00:00 rather than looking set again
      r.due = r.type === "Periodic" ? r.due + Math.ceil((now - r.due + 1) / (r.timer * 1000)) * r.timer * 1000 : null;
    }
    return out;
  }
}
