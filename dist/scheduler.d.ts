export declare const SCHEDULE_TYPES: readonly ["One-time", "Periodic", "Event"];
export type ScheduleField = "text" | "type" | "time";
export interface Reminder {
    text: string;
    type: (typeof SCHEDULE_TYPES)[number];
    /** One-time and Periodic: the timer, s. */ timer: number;
    /** Event: when, ms. */ at: number | null;
    /** When it next comes due, ms; null for not set. */ due: number | null;
}
export declare class Scheduler {
    readonly items: Reminder[];
    /** The message and field the cursor is on. */ i: number;
    f: ScheduleField;
    /** The text being typed, and the character the large knob is on. */ editing: string[] | null;
    pos: number;
    private cleared;
    cursor(i: number, f: ScheduleField): void;
    private arm;
    /** The small FMS knob: a character, the type, or the timer (minutes) or event time. */
    inner(d: number, now: number): void;
    /** The large FMS knob: along the text being typed, or on through the fields. */
    outer(d: number): void;
    /** ENT keeps the text typed; on a cleared line it clears the message's time too; otherwise it goes on a field. */
    ent(now: number): void;
    /** CLR on a message's text clears it; again, restores it. While typing, it stops. */
    clr(): void;
    /** The messages that came due by `now`; a periodic one starts its timer again. */
    tick(now: number): string[];
}
