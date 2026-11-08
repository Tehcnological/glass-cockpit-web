export type Tf = {
    tx?: number;
    ty?: number;
    sx?: number;
    sy?: number;
    rot?: number;
    center?: [number, number];
};
export declare const clamp: (v: number, lo: number, hi: number) => number;
export declare const mod: (a: number, b: number) => number;
export declare const pad: (s: string | number, n: number, c?: string) => string;
export declare const deg3: (d: number) => string;
export declare const matrixAttr: (m: DOMMatrix) => string;
/** An element's own transform attribute as one matrix, read without layout. */
export declare function ownMatrix(e: SVGGraphicsElement): DOMMatrix;
export declare class Page {
    readonly screen: SVGGElement;
    readonly prefix: string;
    private cache;
    private base;
    private centers;
    /** `screen` is the group holding the 1024 x 768 display; ids are looked up inside it. */
    constructor(screen: SVGGElement, prefix: string);
    el(name: string): SVGGraphicsElement | null;
    /** Names `show` keeps hidden whatever it is asked, while set. */
    hidden: ReadonlySet<string>;
    show(name: string, on: boolean): void;
    text(name: string, value: string, color?: string): void;
    fill(name: string, color: string): void;
    tf(name: string, t: Tf): void;
    private center;
    clip(name: string, [top, right, bottom, left]: [number, number, number, number]): void;
}
/** Adds a clipPath with one rectangle to `parent` and returns its id. */
export declare function clipRect(parent: Element, x: number, y: number, w: number, h: number, m?: DOMMatrix): string;
