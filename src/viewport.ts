// viewport.js
//
// Copyright Charles Dick 2020
import { Point2D } from "./point.js"
import { Affine2D, transformTranslateCreate, transformRotate, transformStretch, transformInvert, transformPoint, transformTranslate } from './transform.js';

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
            const dpr = window.devicePixelRatio;
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            this.setPosition(this.pos);
        }
        const canvas = this.ctx.canvas;
        const dpr = window.devicePixelRatio;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;

        // Will be reset in setLocation below.
        this.pos = { pos: [0.0, 0.0], scale: dpr, rotate: 0.0 };
        this.t = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
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

    setPosition(pos: ViewportPosition) {
        const canvas = this.ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        let t = transformTranslateCreate(-pos.pos[0], -pos.pos[1]);
        t = transformRotate(t, pos.rotate);
        t = transformStretch(t, pos.scale, -pos.scale);
        t = transformTranslate(t, width * 0.5, height * 0.5);
        this.t = t;

        const invt = transformInvert(t);
        this.bounds[0] = transformPoint(invt, [0, 0]);
        this.bounds[1] = transformPoint(invt, [width, 0]);
        this.bounds[2] = transformPoint(invt, [0, height]);
        this.bounds[3] = transformPoint(invt, [width, height]);
        this.pos = pos;
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
        this.render(this.bounds, this.pos.scale, ctx);
    }

}
