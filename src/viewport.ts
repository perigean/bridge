// viewport.js
//
// Copyright Charles Dick 2020
import { Point2D } from "./point.js"
import { Affine2D, transformTranslateCreate, transformRotate, transformStretch, transformInvert, transformPoint, transformTranslate, transformScale } from './transform.js';

export const TOP_LEFT = 0;
export const TOP_RIGHT = 1;
export const BOTTOM_LEFT = 2;
export const BOTTOM_RIGHT = 3;

export type Bounds = [Point2D, Point2D, Point2D, Point2D];

export type ViewportPosition = {
    pos: Point2D;
    scale: number;
    rotate: number;
};

export interface ClipPosition {
    (pos: ViewportPosition): ViewportPosition;
}

export interface Render {
    (b: Bounds, s: number, ctx: CanvasRenderingContext2D): void;
}

// Viewport keeps track of world <-> screen coordinates
// World coordinates are +x -> right, +y -> up
export class Viewport {
    readonly ctx: CanvasRenderingContext2D;
    private pos: ViewportPosition;
    private w2c: Affine2D;  // World to canvas transform
    private w2s: Affine2D;  // World to screen transform, different from w2c if window.devicePixelRatio != 1
    private s2w: Affine2D;  // Screen to world transform
    private clearStyle: null | string | CanvasGradient | CanvasPattern;
    private render: Render;
    private bounds: Bounds;
    // Needs to be hooked up to DOM resize listener
    resize: () => void;

    private posClipper: ClipPosition | null;

    // Redraw debouncing methods
    private redraw: () => void;
    private clearRecentRedraw: () => void;
    private recentRedraw: boolean;
    private redrawRequested: boolean;

    private requestRedraw() {
        if (this.recentRedraw) {
            this.redrawRequested = true;
        } else {
            this.redraw();
        }
    }

    constructor(ctx: CanvasRenderingContext2D, render: Render) {
        this.ctx = ctx;
        this.clearStyle = "white";
        this.posClipper = null;
        this.render = render;
        this.recentRedraw = false;
        this.redrawRequested = false;
        this.redraw = () => {
            this.recentRedraw = true;
            requestAnimationFrame(this.clearRecentRedraw);
            const ctx = this.ctx;
            if (this.clearStyle !== null) {
                const fillStyle = ctx.fillStyle;
                ctx.fillStyle = this.clearStyle;
                ctx.resetTransform();
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.fillStyle = fillStyle;
            }
            const t = this.w2c;
            ctx.setTransform(t[0], t[3], t[1], t[4], t[2], t[5]);
            this.render(this.bounds, this.pos.scale, ctx);
        }
        this.clearRecentRedraw = () => {
            const requested = this.redrawRequested;
            this.recentRedraw = false;
            this.redrawRequested = false;
            if (requested) {
                this.redraw();
            }
        }
        this.resize = () => {
            const canvas = this.ctx.canvas;
            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            this.setPosition(this.pos);
        }
        const canvas = this.ctx.canvas;
        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;

        // Will be reset in setLocation below.
        this.pos = { pos: [0.0, 0.0], scale: 1.0, rotate: 0.0 };
        this.s2w = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        this.w2c = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        this.w2s = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        this.bounds = [
            [0.0, 0.0],
            [0.0, 0.0],
            [0.0, 0.0],
            [0.0, 0.0],
        ];
        this.setPosition(this.pos);
    }

    setClearStyle(clearStyle: null | string | CanvasGradient | CanvasPattern) {
        this.clearStyle = clearStyle;
        this.requestRedraw();
    }

    setClipPosition(clip: ClipPosition) {
        this.posClipper = clip;
    }

    setPosition(pos: Partial<ViewportPosition>) {
        if (pos.pos !== undefined) {
            this.pos.pos = pos.pos;
        }
        if (pos.rotate !== undefined) {
            if (pos.rotate >= Math.PI) {
                this.pos.rotate = pos.rotate - Math.floor(pos.rotate / (2.0 * Math.PI)) * 2.0 * Math.PI;
            } else if (pos.rotate < -Math.PI) {
                this.pos.rotate = pos.rotate - Math.ceil(pos.rotate / (2.0 * Math.PI)) * 2.0 * Math.PI;
            } else {
                this.pos.rotate = pos.rotate;
            }
        }
        if (pos.scale !== undefined) {
            this.pos.scale = pos.scale;
        }
        if (this.posClipper !== null) {
            this.pos = this.posClipper(this.pos);
        }
        const canvas = this.ctx.canvas;
        const dpr = window.devicePixelRatio;
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        let w2 = transformTranslateCreate(-this.pos.pos[0], -this.pos.pos[1]);
        w2 = transformRotate(w2, this.pos.rotate);
        w2 = transformStretch(w2, this.pos.scale, -this.pos.scale);
        w2 = transformTranslate(w2, width * 0.5, height * 0.5);
        this.w2s = w2;
        w2 = transformScale(w2, dpr);
        this.w2c = w2;

        const s2w = transformInvert(this.w2s);
        this.bounds[0] = transformPoint(s2w, [0, 0]);
        this.bounds[1] = transformPoint(s2w, [width, 0]);
        this.bounds[2] = transformPoint(s2w, [0, height]);
        this.bounds[3] = transformPoint(s2w, [width, height]);
        this.s2w = s2w;
        this.requestRedraw();
    }

    position(): Readonly<ViewportPosition> {
        return this.pos;
    }

    screen2world(): Readonly<Affine2D> {
        return this.s2w;
    }

    world2screen(): Readonly<Affine2D> {
        return this.w2s;
    }
}
