import { Viewport, ViewportPosition } from "./viewport.js"
import { Point2D } from "./transform.js"

const c = (document.getElementById("canvas") as HTMLCanvasElement);
if (c === null) {
    throw new Error("No canvas element");
}
const ctx = c.getContext("2d");
if (ctx === null) {
    throw new Error("No 2d context");
}
const vp = new Viewport(ctx, () => {
    ctx.fillStyle = "black";
    ctx.fillRect(-16, -16, 32, 32);
});

window.addEventListener("resize", vp.resize);

// Touch handling

// In screen space
// * normalize touches so that canceled touches are continued
// * detect if a touch is a tap or a pan
// * process taps
// * all pans get put into a single pan tracker

export interface ClipPosition {
    (pos: ViewportPosition): ViewportPosition;
}

export class ViewportTouch {
    constructor(_vp: Viewport, _clip: ClipPosition) {
        
    }
};

const points = new Map<number, {start: Point2D, move: Point2D}>();

function touchStart(evt: TouchEvent) {
    evt.preventDefault();
    console.log("touchstart");
    for (const t of evt.touches) {
        if (!points.has(t.identifier)) {
            points.set(t.identifier, {start: [t.clientX, t.clientY], move: [t.clientX, t.clientY]});
        }
    }
}

function touchEnd(evt: TouchEvent) {
    evt.preventDefault();
    
    const removed = new Set<number>(points.keys());
    for (const t of evt.touches) {
        removed.delete(t.identifier);
    }
    for (const i of removed) {
        const t = points.get(i);
        if (!t) {
            throw new Error("missing point with id " + i);
        }
        const d = [t.move[0] - t.start[0], t.move[1] - t.start[1]];
        console.log("touch " + i + " moved " + Math.sqrt(d[0] * d[0] + d[1] * d[1]));
        points.delete(i);
    }
};

function touchMove(evt: TouchEvent) {
    evt.preventDefault();
    for (const t of evt.touches) {
        const p = points.get(t.identifier);
        if (!p) {
            throw new Error("missing point with id " + t.identifier);
        }
        p.move[0] = t.clientX;
        p.move[1] = t.clientY;
    }
}

c.addEventListener("touchstart", touchStart, false);
c.addEventListener("touchend", touchEnd, false);
c.addEventListener("touchcancel", touchEnd, false);
c.addEventListener("touchmove", touchMove, false);
console.log("stuff loaded");