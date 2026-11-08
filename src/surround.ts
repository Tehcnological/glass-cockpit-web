// The frame around every page: NAV/COM radios across the top, a header in the middle of it, and softkey labels along
// the bottom. Port of FG1000 Nasal/MFDPages/Surround/Surround.nas (Copyright 2018 Stuart Buchanan), GPL-2.0-or-later.
import { Page } from "./page.js";

export interface Radio { /** MHz. */ active: number; /** MHz. */ standby: number }
export interface Radios {
  nav1: Radio & { /** Station identifier, shown next to the frequencies. */ id: string };
  nav2: Radio & { id: string };
  com1: Radio;
  com2: Radio;
}

export const RADIOS: Radios = {
  nav1: { active: 110.5, standby: 113.9, id: "" },
  nav2: { active: 112.3, standby: 108.2, id: "" },
  com1: { active: 120.9, standby: 121.5 },
  com2: { active: 118.3, standby: 132.45 },
};

const GREEN = "#00ff00";
const WHITE = "#ffffff";
// Menus and page groups the port does not drive, hidden as Surround.hideMenu() and the volume timers leave them.
const PAGE_GROUPS = ["MapPageGroup", "WPTPageGroup", "AuxPageGroup", "FPLPageGroup", "LstPageGroup", "NrstPageGroup"];
const GROUP_LABELS = ["MapPageGroupLabel", "WPTGroupLabel", "AuxGroupLabel", "FPLGroupLabel", "LstGroupLabel", "NrstGroupLabel"];

export class Surround {
  readonly p: Page;
  private raw: Page;
  /** The radios the tuning knobs work on (the cyan box); the selected COM is the one transmitting. */
  readonly sel: { nav: 1 | 2; com: 1 | 2 } = { nav: 1, com: 1 };

  // showNavVolume / showCommVolume: the last volume shown, and the timers that put the standby frequency back.
  private volume: Record<"Nav" | "Comm", string | null> = { Nav: null, Comm: null };
  private volumeTimers: Record<"Nav" | "Comm", ReturnType<typeof setTimeout> | undefined> = { Nav: undefined, Comm: undefined };

  constructor(screen: SVGGElement) {
    this.p = new Page(screen, "Surround");
    this.raw = new Page(screen, "");
    for (const id of [...PAGE_GROUPS, ...GROUP_LABELS]) this.raw.show(id, false);
    for (const id of ["CommVolume", "CommVolumeLabel", "NavVolume", "NavVolumeLabel", "Nav1Failed", "Nav2Failed", "Comm1Failed", "Comm2Failed"]) {
      this.p.show(id, false);
    }
    this.showSelected();
  }

  /** Pushing a tuning knob moves its box to the other radio (handleNavToggle, handleComToggle). */
  toggle(radio: "nav" | "com") {
    this.sel[radio] = this.sel[radio] === 1 ? 2 : 1;
    this.showSelected();
  }

  private showSelected() {
    for (const n of [1, 2]) {
      this.p.show(`Nav${n}Selected`, this.sel.nav === n);
      this.p.show(`Comm${n}Selected`, this.sel.com === n);
    }
    this.p.show("Comm1SelectedArrow", this.sel.com === 1);
  }

  /**
   * A changed volume shows for 2 seconds in place of the radio 2 standby frequency, as the manual says. The first value
   * set is the starting volume and does not show.
   */
  setVolume(kind: "Nav" | "Comm", v: number) {
    const text = `${Math.trunc(v * 100)}%`;
    const before = this.volume[kind];
    this.volume[kind] = text;
    if (before === null || before === text) return;
    this.showVolume(kind, true);
    this.p.text(`${kind}Volume`, text);
    clearTimeout(this.volumeTimers[kind]);
    this.volumeTimers[kind] = setTimeout(() => this.showVolume(kind, false), 2000);
  }

  private showVolume(kind: "Nav" | "Comm", on: boolean) {
    this.p.show(`${kind}Volume`, on);
    this.p.show(`${kind}VolumeLabel`, on);
    this.p.show(`${kind}2StandbyFreq`, !on);
    this.p.show(`${kind}2Label`, !on);
    this.showSelected();
    if (on && this.sel[kind === "Nav" ? "nav" : "com"] === 2) this.p.show(`${kind}2Selected`, false);
  }

  /** Stops the volume timers. */
  destroy() {
    clearTimeout(this.volumeTimers.Nav);
    clearTimeout(this.volumeTimers.Comm);
  }

  /** `navSource` is the NAV radio driving the CDI; its active frequency shows green. */
  setRadios(r: Radios, navSource: 1 | 2 | null) {
    for (const n of [1, 2] as const) {
      const nav = r[`nav${n}`];
      // FG1000 prints three decimals; the SVG and the real unit have room for two.
      this.p.text(`Nav${n}SelectedFreq`, nav.active.toFixed(2), navSource === n ? GREEN : WHITE);
      this.p.text(`Nav${n}StandbyFreq`, nav.standby.toFixed(2));
      this.p.text(`Nav${n}ID`, nav.id);
      const com = r[`com${n}`];
      this.p.text(`Comm${n}SelectedFreq`, com.active.toFixed(3), n === this.sel.com ? GREEN : WHITE);
      this.p.text(`Comm${n}StandbyFreq`, com.standby.toFixed(3));
    }
  }

  /** Twelve labels, left to right; "" leaves a key blank. A lit key (an option that is on) is black on grey; a dim key is grey. */
  setSoftkeys(labels: string[], lit: boolean[] = [], dim: boolean[] = []) {
    for (let i = 0; i < 12; i++) {
      this.raw.text(`SoftKey${i}`, labels[i] ?? "", lit[i] ? "#000000" : dim[i] ? "#808080" : WHITE);
      this.raw.fill(`SoftKey${i}-bg`, lit[i] ? "#808080" : "#000000");
    }
  }

  setPageTitle(title: string) {
    this.raw.text("PageTitle", title);
  }
}
