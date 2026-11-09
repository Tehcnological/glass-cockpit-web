const NS = "http://www.w3.org/2000/svg";
/** Each display's mode from DISPLAY BACKUP and which displays have power (Line Maintenance Manual, display failure test):
 * one that fails sends the other into reversionary mode, with the failed one's COM/NAV fields (NAV/COM 1 for the PFD,
 * 2 for the MFD) flagged invalid on it. */
export function displayModes(backup, pfd, mfd) {
    const one = (on, other, lost) => !on ? { mode: "off", failed: {} }
        : other ? { mode: backup ? "reversionary" : "normal", failed: {} }
            : { mode: "reversionary", failed: { [`com${lost}`]: true, [`nav${lost}`]: true } };
    return { pfd: one(pfd, mfd, 2), mfd: one(mfd, pfd, 1) };
}
/** A round red push button in `container`; each push toggles reversionary mode. */
export class DisplayBackup {
    options;
    on = false;
    button;
    constructor(container, options = {}) {
        this.options = options;
        container.innerHTML =
            `<svg xmlns="${NS}" viewBox="0 0 100 100" role="img" aria-label="Display backup" style="user-select:none;-webkit-user-select:none"><defs>` +
                `<radialGradient id="db-red" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ff6b6b"/><stop offset="0.6" stop-color="#d40000"/><stop offset="1" stop-color="#7a0000"/></radialGradient>` +
                `<radialGradient id="db-rim" cx="0.5" cy="0.4" r="0.6"><stop offset="0.7" stop-color="#808080"/><stop offset="1" stop-color="#1a1a1a"/></radialGradient></defs>` +
                `<g style="cursor:pointer" role="button" aria-label="DISPLAY BACKUP">` +
                `<circle cx="50" cy="40" r="30" fill="url(#db-rim)"/><circle cx="50" cy="40" r="24" fill="url(#db-red)" stroke="#400000"/></g>` +
                `<text x="50" y="88" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#ffffff">DISPLAY BACKUP</text></svg>`;
        this.button = container.querySelector("g");
        this.button.addEventListener("click", () => this.set(!this.on, true));
    }
    get reversionary() {
        return this.on;
    }
    /** Sets the mode; `report` calls `onChange`. The button looks pushed in while reversionary mode is on. */
    set(on, report = false) {
        this.on = on;
        this.button.setAttribute("transform", on ? "translate(50 40) scale(0.94) translate(-50 -40)" : "");
        if (report)
            this.options.onChange?.(on);
    }
}
