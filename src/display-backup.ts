// The red DISPLAY BACKUP button from the GMA 1347 audio panel, on its own: it selects reversionary mode (Pilot's Guide).
// The rest of the audio panel is audio only, so it is not drawn. A round red button drawn here, not FG1000 art.
import type { RadioFailure } from "./surround.js";

const NS = "http://www.w3.org/2000/svg";
/** Inline style for an svg that is a control surface: clicks work it, so its text does not select. */
export const NO_SELECT = "user-select:none;-webkit-user-select:none";

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
export function displayModes(backup: boolean, pfd: boolean, mfd: boolean): { pfd: DisplayMode; mfd: DisplayMode } {
  const one = (on: boolean, other: boolean, lost: 1 | 2): DisplayMode =>
    !on ? { mode: "off", failed: {} }
    : other ? { mode: backup ? "reversionary" : "normal", failed: {} }
    : { mode: "reversionary", failed: { [`com${lost}`]: true, [`nav${lost}`]: true } };
  return { pfd: one(pfd, mfd, 2), mfd: one(mfd, pfd, 1) };
}

/** A round red push button in `container`; each push toggles reversionary mode. */
export class DisplayBackup {
  private on = false;
  private button: SVGGElement;

  constructor(container: HTMLElement, private options: DisplayBackupOptions = {}) {
    container.innerHTML =
      `<svg xmlns="${NS}" viewBox="0 0 100 100" role="img" aria-label="Display backup" style="${NO_SELECT}"><defs>` +
      `<radialGradient id="db-red" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ff6b6b"/><stop offset="0.6" stop-color="#d40000"/><stop offset="1" stop-color="#7a0000"/></radialGradient>` +
      `<radialGradient id="db-rim" cx="0.5" cy="0.4" r="0.6"><stop offset="0.7" stop-color="#808080"/><stop offset="1" stop-color="#1a1a1a"/></radialGradient></defs>` +
      `<g style="cursor:pointer" role="button" aria-label="DISPLAY BACKUP">` +
      `<circle cx="50" cy="40" r="30" fill="url(#db-rim)"/><circle cx="50" cy="40" r="24" fill="url(#db-red)" stroke="#400000"/></g>` +
      `<text x="50" y="88" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#ffffff">DISPLAY BACKUP</text></svg>`;
    this.button = container.querySelector("g")!;
    this.button.addEventListener("click", () => this.set(!this.on, true));
  }

  get reversionary() {
    return this.on;
  }

  /** Sets the mode; `report` calls `onChange`. The button looks pushed in while reversionary mode is on. */
  set(on: boolean, report = false) {
    this.on = on;
    this.button.setAttribute("transform", on ? "translate(50 40) scale(0.94) translate(-50 -40)" : "");
    if (report) this.options.onChange?.(on);
  }
}
