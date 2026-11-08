// The red DISPLAY BACKUP button from the GMA 1347 audio panel, on its own: it selects reversionary mode (Pilot's Guide).
// The rest of the audio panel is audio only, so it is not drawn. A round red button drawn here, not FG1000 art.
const NS = "http://www.w3.org/2000/svg";
/** A round red push button in `container`; each push toggles reversionary mode. */
export class DisplayBackup {
    options;
    on = false;
    button;
    constructor(container, options = {}) {
        this.options = options;
        container.innerHTML =
            `<svg xmlns="${NS}" viewBox="0 0 100 100" role="img" aria-label="Display backup"><defs>` +
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
