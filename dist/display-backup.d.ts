export interface DisplayBackupOptions {
    /** Called with the new mode when the button is pushed. */ onChange?: (reversionary: boolean) => void;
}
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
