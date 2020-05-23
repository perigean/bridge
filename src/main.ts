// Copyright Charles Dueck 2020

import { Viewport, ViewportPosition, PanGesture, PinchZoomGesture } from "./viewport.js"
import { TouchDemux } from "./touch.js"
import { Gestures} from "./gesture.js"
import { sceneMethod, sceneRenderer, Scene } from "./scene.js";

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

const scene: Scene = {
    truss: {
        pins: [
            [35.0, 35.0],
            [40.0, 35.0],
            [45.0, 35.0],
            [35.0, 30.0],
            [40.0, 30.0],
            [45.0, 30.0],
            [30.0, 30.0],
            [50.0, 30.0],
        ],
        mobilePins: 7,
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
    },
    terrain: {
        hmap: [
            40.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            40.0,
        ],
        style: "darkgrey",
        pitch: 10.0,
    },
    height: 100.0,
    g: [0.0, -9.8],
};

const ode = sceneMethod(scene);
const render = sceneRenderer(scene);

const vp = new Viewport(ctx, (_b, _s, ctx: CanvasRenderingContext2D) => {
    render(ctx, ode);
});

function clip(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

vp.setClipPosition((p: ViewportPosition): ViewportPosition => {
    p.scale = clip(p.scale, 10.0, 1000.0);
    p.pos[0] = clip(p.pos[0], 0, scene.terrain.pitch * (scene.terrain.hmap.length - 1));
    p.pos[1] = clip(p.pos[1], 0, scene.height);
    p.rotate = 0.0;
    return p;
});

vp.setPosition({ pos: [50, 50]});


const h = 0.001;
requestAnimationFrame((t0: DOMHighResTimeStamp) => {
    function mainLoop(t: DOMHighResTimeStamp) {
        // Compute up to 250ms worth of frames at a time.
        const dt = Math.min(t - t0, 250.0);
        const frames = Math.floor(dt / (1000.0 * h));
        for (let i = 0; i < frames; i++) {
            ode.next(h);
        }
        console.log(frames);
        vp.requestRedraw();
        // Only let the physics backlog get to 250ms.
        t0 = Math.max(t0 + frames * h * 1000.0, t - 250.0);
        requestAnimationFrame(mainLoop);
    }
    requestAnimationFrame(mainLoop);
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

// TODO: pins in simulation are repelled by terrain
// TODO: pins in simulation have friction on terrain

// TODO: discs. Attached to pins, repel terrain at a distance (with friction)
// TODO: discs can rotate at a fixed rate. Rotation only applies to friction force calculation.

// TODO: deck beams. Like regular beams, but repel discs

// TODO: rewrite viewport etc. to not take callbacks, just call into it to explcitly set up canvas, etc.

// TODO: Physics calculation in a web-worker.
console.log("stuff loaded");
