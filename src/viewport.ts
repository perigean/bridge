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

    constructor(ctx: CanvasRenderingContext2D, render: Render) {
        this.ctx = ctx;
        this.clearStyle = "white";
        this.render = render;
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
        this.redraw();
    }

    setPosition(pos: Partial<ViewportPosition>) {
        if (pos.pos !== undefined) {
            this.pos.pos = pos.pos;
        }
        if (pos.rotate !== undefined) {
            this.pos.rotate = pos.rotate;
        }
        if (pos.scale !== undefined) {
            this.pos.scale = pos.scale;
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
        
        console.log("vp.pos ", this.pos.pos);

        const s2w = transformInvert(this.w2s);
        this.bounds[0] = transformPoint(s2w, [0, 0]);
        this.bounds[1] = transformPoint(s2w, [width, 0]);
        this.bounds[2] = transformPoint(s2w, [0, height]);
        this.bounds[3] = transformPoint(s2w, [width, height]);
        this.s2w = s2w;
        this.redraw();
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

    redraw() {
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

}
