import type { RadioFailure } from "./surround.js";
export interface DisplayBackupOptions {
    /** Called with the new mode when the button is pushed. */ onChange?: (reversionary: boolean) => void;
}
export interface DisplayMode {
    mode: "normal" | "reversionary" | "off";
    /** The COM/NAV fields to flag invalid (the PFD's `failed`). */ failed: Partial<Record<RadioFailure, boolean>>;
}
/** Each display's mode from DISPLAY BACKUP and which displays have power (Line Maintenance Manual, display failure test):
 * one that fails sends the other into reversionary mode, with the failed one's COM/NAV fields (NAV/COM 1 for the PFD,
 * 2 for the MFD) flagged invalid on it. */
export declare function displayModes(backup: boolean, pfd: boolean, mfd: boolean): {
    pfd: DisplayMode;
    mfd: DisplayMode;
};
/** A round red push button in `container`; each push toggles reversionary mode. */
export declare class DisplayBackup {
    private options;
    private on;
    private button;
    constructor(container: HTMLElement, options?: DisplayBackupOptions);
    get reversionary(): boolean;
    /** Sets the mode; `report` calls `onChange`. The button looks pushed in while reversionary mode is on. */
    set(on: boolean, report?: boolean): void;
}
