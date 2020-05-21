// Copyright Charles Dueck 2020

import { Viewport, ViewportPosition, PanGesture, PinchZoomGesture } from "./viewport.js"
import { TouchDemux } from "./touch.js"
import { Gestures} from "./gesture.js"
import { trussMethod, trussRenderer, Truss } from "./truss.js";

const c = (document.getElementById("canvas") as HTMLCanvasElement);
if (c === null) {
    throw new Error("No canvas element");
}
const ctx = c.getContext("2d");
if (ctx === null) {
    throw new Error("No 2d context");
}

//     0 - 1 - 2
//   / | \ | / | \
// 6 - 3 - 4 - 5 - 7

const truss: Truss = {
    pins: [
        [-5.0, 5.0],
        [0.0, 5.0],
        [5.0, 5.0],
        [-5.0, 0.0],
        [0.0, 0.0],
        [5.0, 0.0],
        [-10.0, 0.0],
        [10.0, 0.0],
    ],
    mobilePins: 6,
    beams: [
        { p1: 0, p2: 1, m: 0, w: 0.1 },
        { p1: 1, p2: 2, m: 0, w: 0.1 },
        { p1: 6, p2: 0, m: 0, w: 0.1 },
        { p1: 3, p2: 0, m: 0, w: 0.1 },
        { p1: 4, p2: 0, m: 0, w: 0.1 },
        { p1: 4, p2: 1, m: 0, w: 0.1 },
        { p1: 4, p2: 2, m: 0, w: 0.1 },
        { p1: 5, p2: 2, m: 0, w: 0.1 },
        { p1: 7, p2: 2, m: 0, w: 0.1 },
        { p1: 6, p2: 3, m: 0, w: 0.1 },
        { p1: 3, p2: 4, m: 0, w: 0.1 },
        { p1: 4, p2: 5, m: 0, w: 0.1 },
        { p1: 5, p2: 7, m: 0, w: 0.1 },
    ],
    materials: [
        {   // Rubber.
            E: 20000000.0,
            style: "black",
            density: 1200.0,
         },
    ],
    g: [0.0, -9.8], // TODO: move up to scene level, when that exists.
};


// 2 - 0 - 1
/*
const truss: Truss = {
    pins: [
        [0.0, 0.0],
        [5.0, 0.0],
        [-5.0, 0.0],
    ],
    mobilePins: 1,
    beams: [
        { p1: 0, p2: 1, m: 0, w: 0.1 },
        { p1: 0, p2: 2, m: 0, w: 0.1 },
    ],
    materials: [
        {   // Rubber.
            E: 50000.0,
            style: "black",
            density: 1200.0,
         },
    ],
    g: [0.0, -1.0], // TODO: move up to scene level, when that exists.
};
*/
// TODO: main loop should be calls to render, plus request to async compute next physics step.

const ode = trussMethod(truss);
const render = trussRenderer(truss);

const vp = new Viewport(ctx, (_b, _s, ctx: CanvasRenderingContext2D) => {
    render(ctx, ode);
});

function mainLoop(_now: DOMHighResTimeStamp) {
    for (let i = 0; i < 10; i++) {
        ode.next(0.016666666);
    }
    vp.requestRedraw();
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);


function clip(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

vp.setClipPosition((p: ViewportPosition): ViewportPosition => {
    p.scale = clip(p.scale, 10.0, 1000.0);
    p.pos[0] = clip(p.pos[0], -256, 256);
    p.pos[1] = clip(p.pos[1], -256, 256);
    return p;
});

window.addEventListener("resize", vp.resize);

const touch = new TouchDemux(c);
const gesture = new Gestures();
touch.addTouchHandler(gesture);
gesture.addGestureHandler(new PanGesture(vp));
gesture.addGestureHandler(new PinchZoomGesture(vp));

// TODO: mouse and trackpad input
// scroll
// scroll wheel zoom in and out
// what to rotate? right click drag, rotate around center of vp? Maybe don't care, since bridge wont use rotate

console.log("stuff loaded");
