import { Page } from "./page.js";
/** A dim key is grey and does nothing: the v13 trainer dims keys whose function is unavailable. */
export type Key = {
    label: string;
    act?: () => void;
    lit?: boolean;
    dim?: boolean;
};
export declare const key: (label: string, act?: () => void, lit?: boolean) => Key;
export declare const dimKey: (label: string) => Key;
export declare const BLANK: Key;
/** The cursor box and selectable text. v13 trainer: full cyan (FG1000 DefaultStyle.HIGHLIGHT_COLOR is a paler #80ffff). */
export declare const CYAN = "#00ffff";
export declare const NS = "http://www.w3.org/2000/svg";
export declare const esc: (t: string) => string;
/** The FMS cursor: black text on a cyan box, as FG1000's highlightTextElement. */
export declare class Highlighter {
    private color;
    private boxes;
    constructor(color?: string);
    set(t: SVGGraphicsElement | null, on: boolean): void;
}
/**
 * GroupElement: `size` rows of the columns `cols` (elements <prefix><col><row>), scrolled to keep the selected row near
 * the middle. `hi` is the column the cursor highlights; with `arrow`, the `Arrow` column marks the selected row.
 */
export declare class ListView {
    private p;
    private cols;
    private size;
    private hi;
    private arrow;
    private scroll?;
    sel: number;
    private thumbTravel;
    constructor(p: Page, cols: string[], size: number, hi: string, arrow?: boolean, scroll?: {
        trough: string;
        thumb: string;
    } | undefined);
    /** Moves the selection; returns whether it moved. */
    move(d: number, len: number): boolean;
    draw(rows: Record<string, string>[], crsr: boolean, hl: Highlighter): void;
}
/** GroupElement.displayGroup: the first row shown, keeping the selected row near the middle. */
export declare function firstRow(sel: number, len: number, size: number): number;
/** An element's bounding box in screen coordinates. */
export declare function screenBox(screen: SVGGElement, e: SVGGraphicsElement): DOMRect;
/**
 * DataEntryElement: an identifier typed with the FMS knobs. The inner knob starts the entry and turns the character at
 * the cursor; the outer moves the cursor; ENT ends it. Elements: <prefix>ID (the value) and ID0..ID<size-1> (the
 * characters while editing).
 */
export declare class IdEntry {
    private p;
    private size;
    private name;
    /** A key typed on the computer keyboard (a letter, a digit, or "" for Backspace), taken by the next inner turn in
     * place of turning: it goes in at the cursor, which moves on. Not on the real unit; NXi takes its keypad this way. */
    static typed: string | null;
    private chars;
    private pos;
    constructor(p: Page, size: number, name?: string);
    get editing(): boolean;
    inner(d: number): void;
    /** Returns whether the entry took the turn. */
    outer(d: number): boolean;
    /** Ends the entry; returns what was typed, or null for nothing. */
    ent(): string | null;
    cancel(): void;
    /** What is typed so far, blanks as "_". */
    get value(): string;
    draw(value: string, crsr: boolean, hl: Highlighter): void;
}
