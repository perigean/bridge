// viewport.js
//
// Copyright Charles Dick 2020
import {Affine2D, Point2D, transformTranslateCreate, transformStretch, transformTranslate, transformInvert, transformPoint, transformRotate} from './transform';

export const TOP_LEFT = 0;
export const TOP_RIGHT = 1;
export const BOTTOM_LEFT = 2;
export const BOTTOM_RIGHT = 3;

export type Bounds = [Point2D, Point2D, Point2D, Point2D];

export interface Render {
    (b: Bounds, s: number, ctx: CanvasRenderingContext2D): void;
}

// Viewport keeps track of world <-> screen coordinates
// World coordinates are +x -> right, +y -> up
export class Viewport {
    private ctx: CanvasRenderingContext2D;
    private scale: number;
    private t: Affine2D;
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
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            this.redraw();
        }
        const canvas = this.ctx.canvas;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // Will be reset in setLocation below.
        this.scale = 0.0;
        this.t = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        this.bounds = [
            [0.0, 0.0],
            [0.0, 0.0],
            [0.0, 0.0],
            [0.0, 0.0],
        ];
        this.setLocation([0.0, 0.0], 1.0, 0.0);
    }

    setClearStyle(clearStyle: null | string | CanvasGradient | CanvasPattern) {
        this.clearStyle = clearStyle;
    }

    setLocation(pos: Point2D, scale: number, rotate: number) {
        const canvas = this.ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        let t = transformTranslateCreate(-width * 0.5, -height * 0.5);
        t = transformRotate(t, rotate);
        t = transformStretch(t, scale, -scale);
        t = transformTranslate(t, -pos[0], -pos[1]);
        this.t = t;

        const invt = transformInvert(t);
        this.bounds[0] = transformPoint(invt, [0, 0]);
        this.bounds[1] = transformPoint(invt, [width, 0]);
        this.bounds[2] = transformPoint(invt, [0, height]);
        this.bounds[3] = transformPoint(invt, [width, height]);
        this.scale = scale;
        this.redraw();
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
        const t = this.t;
        ctx.setTransform(t[0], t[3], t[1], t[4], t[2], t[5]);
        this.render(this.bounds, this.scale, ctx);
    }

}
