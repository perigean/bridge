// viewport.js
//
// Copyright Charles Dick 2020
import {Affine2D, Point2D, transformTranslateCreate, transformStretch, transformTranslate, transformInvert} from './transform';

// Viewport keeps track of world <-> screen coordinates
// World coordinates are +x -> right, +y -> up
class Viewport {
    private ctx: CanvasRenderingContext2D;
    private pos: Point2D;
    private scale: number;
    // TODO: bounding box for world
    // TODO: figure out touch events
    // TODO: figure out how/when drawing happens
    w2s: Affine2D;
    s2w: Affine2D;

    private resetTransforms() {
        const canvas = this.ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        let s2w = transformTranslateCreate(-width * 0.5, -height * 0.5);
        s2w = transformStretch(s2w, this.scale, -this.scale);
        s2w = transformTranslate(s2w, -this.pos[0], -this.pos[1]);
        this.s2w = s2w;
        this.w2s = transformInvert(s2w);
        this.ctx.transform(s2w[0], s2w[3], s2w[1], s2w[4], s2w[2], s2w[5]);
    }

    constructor(ctx: CanvasRenderingContext2D, pos: Point2D, scale: number) {
        this.ctx = ctx;
        this.pos = pos;
        this.scale = scale;
        this.resetTransforms();
    }

}
