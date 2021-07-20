// Copyright Charles Dueck 2020
import { SceneElement } from "./scene.js";
import { RootLayout, Border } from "./ui/node.js";
//import { RootLayout, Fill, Border } from "./ui/node.js"
const scene = {
    truss: {
        fixedPins: [[0, 64], [64, 64], [192, 64], [256, 64]],
        startPins: [[2, 62], [12, 62], [17, 62], [27, 62], [32, 62], [42, 62], [47, 62], [57, 62]],
        editPins: [],
        startBeams: [
            { p1: -4, p2: -3, m: 0, w: 1, deck: true },
            { p1: -2, p2: -1, m: 0, w: 1, deck: true },
            { p1: 0, p2: 1, m: 0, w: 2 },
            { p1: 1, p2: 2, m: 0, w: 0.1 },
            { p1: 2, p2: 3, m: 0, w: 2 },
            { p1: 3, p2: 4, m: 0, w: 0.1 },
            { p1: 4, p2: 5, m: 0, w: 2 },
            { p1: 5, p2: 6, m: 0, w: 0.1 },
            { p1: 6, p2: 7, m: 0, w: 2 },
        ],
        editBeams: [],
        discs: [
            { p: 0, r: 2, m: 0, v: -10.0 },
            { p: 1, r: 2, m: 0, v: -10.0 },
            { p: 2, r: 2, m: 0, v: -10.0 },
            { p: 3, r: 2, m: 0, v: -10.0 },
            { p: 4, r: 2, m: 0, v: -10.0 },
            { p: 5, r: 2, m: 0, v: -10.0 },
            { p: 6, r: 2, m: 0, v: -10.0 },
            { p: 7, r: 2, m: 0, v: -10.0 },
        ],
        materials: [
            {
                E: 700000000.0,
                style: "black",
                density: 1200.0,
                friction: 0.9,
            },
        ],
    },
    terrain: {
        hmap: [64, 64, 64, 96, 112, 96, 64, 64, 64],
        friction: 0.5,
        style: "darkgrey",
    },
    height: 128,
    width: 256,
    g: [0, 128],
    undoStack: [],
    redoStack: [],
};
const canvas = document.getElementById("canvas");
new RootLayout(canvas, Border(16, "black", SceneElement(scene)));
// TODO: Test credentials.
/*
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

const scene: Scene = {
    truss: {
        pins: [
            [ 5.0, 42.5],    // 0-7 Train
            [10.0, 42.5],
            [15.0, 42.5],
            [20.0, 42.5],
            [25.0, 42.5],
            [10.0, 45.0],
            [15.0, 45.0],
            [20.0, 45.0],
            [40.0, 50.0],   // 8-15 Bridge
            [50.0, 50.0],
            [60.0, 50.0],
            [40.0, 40.0],
            [50.0, 40.0],
            [60.0, 40.0],
            [30.0, 40.0],   // 14 Bridge anchor
            [70.0, 40.0],
            [ 0.0, 40.0],   // road
            [100.0, 40.0],
        ],
        mobilePins: 14,
        beams: [
            { p1: 0, p2: 1, m: 0, w: 0.1 }, // Train
            { p1: 1, p2: 2, m: 0, w: 0.1 },
            { p1: 2, p2: 3, m: 0, w: 0.1 },
            { p1: 3, p2: 4, m: 0, w: 0.1 },
            { p1: 1, p2: 5, m: 0, w: 0.1 },
            { p1: 2, p2: 6, m: 0, w: 0.1 },
            { p1: 3, p2: 7, m: 0, w: 0.1 },
            { p1: 0, p2: 5, m: 0, w: 0.1 },
            { p1: 5, p2: 2, m: 0, w: 0.1 },
            { p1: 1, p2: 6, m: 0, w: 0.1 },
            { p1: 6, p2: 3, m: 0, w: 0.1 },
            { p1: 2, p2: 7, m: 0, w: 0.1 },
            { p1: 7, p2: 4, m: 0, w: 0.1 },
            { p1: 8, p2: 14, m: 0, w: 1.0 }, // Bridge
            { p1: 8, p2: 11, m: 0, w: 1.0 },
            { p1: 8, p2: 12, m: 0, w: 1.0 },
            { p1: 8, p2: 9, m: 0, w: 1.0 },
            { p1: 9, p2: 12, m: 0, w: 1.0 },
            { p1: 10, p2: 9, m: 0, w: 1.0 },
            { p1: 10, p2: 12, m: 0, w: 1.0 },
            { p1: 10, p2: 13, m: 0, w: 1.0 },
            { p1: 10, p2: 15, m: 0, w: 1.0 },
            { p1: 14, p2: 11, m: 0, w: 1.0, deck: true },   // Deck
            { p1: 11, p2: 12, m: 0, w: 1.0, deck: true },
            { p1: 12, p2: 13, m: 0, w: 1.0, deck: true },
            { p1: 13, p2: 15, m: 0, w: 1.0, deck: true },
            { p1: 16, p2: 14, m: 0, w: 0.1, deck: true },   // Road
            { p1: 15, p2: 17, m: 0, w: 0.1, deck: true },
        ],
        discs: [
            { p: 0, r: 2.5, m: 0, v: 10.0 },
            { p: 1, r: 2.5, m: 0, v: 10.0 },
            { p: 2, r: 2.5, m: 0, v: 10.0 },
            { p: 3, r: 2.5, m: 0, v: 10.0 },
            { p: 4, r: 2.5, m: 0, v: 10.0 },
        ],
        materials: [
            {   // Rubber.
                E: 70000000.0,
                style: "black",
                density: 1200.0,
                friction: 0.9,
            },
        ],
    },
    terrain: {
        hmap: [
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            20.0,
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
            40.0,
        ],
        style: "darkgrey",
        pitch: 5.0,
        friction: 0.5,
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
*/
// TODO: mode where we read accelerometer, and add that to acceleration due to gravity. (scale based on screen size and zoom)
// TODO: mouse and trackpad input
// scroll
// scroll wheel zoom in and out
// what to rotate? right click drag, rotate around center of vp? Maybe don't care, since bridge wont use rotate
// TODO: https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
// https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide
// Look into this
// TODO: rewrite viewport etc. to not take callbacks, just call into it to explcitly set up canvas, etc.
// TODO: Physics calculation in a web-worker.
// TODO: Air resistance, or at least damping of pin movement, not just beam spring forces. Keep beam damping, this should be independent.
// TODO: Beams fail after some stress.
// TODO: Work hardening.
// TODO: Beam buckling.
console.log("stuff loaded");
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUcvQixPQUFPLEVBQWEsWUFBWSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3JELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sY0FBYyxDQUFBO0FBQ2pELHlEQUF5RDtBQUV6RCxNQUFNLEtBQUssR0FBZTtJQUN0QixLQUFLLEVBQUU7UUFDSCxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRCxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRixRQUFRLEVBQUUsRUFBRTtRQUNaLFVBQVUsRUFBRTtZQUNSLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtZQUMxQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7WUFDMUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzVCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDNUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUM1QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1NBQy9CO1FBQ0QsU0FBUyxFQUFFLEVBQUU7UUFDYixLQUFLLEVBQUU7WUFDSCxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtTQUNqQztRQUNELFNBQVMsRUFBRTtZQUNQO2dCQUNJLENBQUMsRUFBRSxXQUFXO2dCQUNkLEtBQUssRUFBRSxPQUFPO2dCQUNkLE9BQU8sRUFBRSxNQUFNO2dCQUNmLFFBQVEsRUFBRSxHQUFHO2FBQ2hCO1NBQ0o7S0FDSjtJQUNELE9BQU8sRUFBRTtRQUNMLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzNDLFFBQVEsRUFBRSxHQUFHO1FBQ2IsS0FBSyxFQUFFLFVBQVU7S0FDcEI7SUFDRCxNQUFNLEVBQUUsR0FBRztJQUNYLEtBQUssRUFBRSxHQUFHO0lBQ1YsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNYLFNBQVMsRUFBRSxFQUFFO0lBQ2IsU0FBUyxFQUFFLEVBQUU7Q0FDaEIsQ0FBQztBQUVGLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakQsSUFBSSxVQUFVLENBQ1YsTUFBMkIsRUFDM0IsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQ2QsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUN0QixDQUNKLENBQUM7QUFFRiwwQkFBMEI7QUFFMUI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBaUtFO0FBRUYsNkhBQTZIO0FBRTdILGlDQUFpQztBQUNqQyxTQUFTO0FBQ1QsK0JBQStCO0FBQy9CLCtHQUErRztBQUUvRyxtRkFBbUY7QUFDbkYsd0VBQXdFO0FBQ3hFLGlCQUFpQjtBQUVqQix3R0FBd0c7QUFFeEcsNkNBQTZDO0FBRTdDLHlJQUF5STtBQUV6SSxzQ0FBc0M7QUFFdEMsd0JBQXdCO0FBRXhCLHVCQUF1QjtBQUd2QixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5cbmltcG9ydCB7IFNjZW5lSlNPTiwgU2NlbmVFbGVtZW50IH0gZnJvbSBcIi4vc2NlbmUuanNcIjtcbmltcG9ydCB7IFJvb3RMYXlvdXQsIEJvcmRlciB9IGZyb20gXCIuL3VpL25vZGUuanNcIlxuLy9pbXBvcnQgeyBSb290TGF5b3V0LCBGaWxsLCBCb3JkZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCJcblxuY29uc3Qgc2NlbmUgOiBTY2VuZUpTT04gPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgZml4ZWRQaW5zOiBbWzAsIDY0XSwgWzY0LCA2NF0sIFsxOTIsIDY0XSwgWzI1NiwgNjRdXSxcbiAgICAgICAgc3RhcnRQaW5zOiBbWzIsIDYyXSwgWzEyLCA2Ml0sIFsxNywgNjJdLCBbMjcsIDYyXSwgWzMyLCA2Ml0sIFs0MiwgNjJdLCBbNDcsIDYyXSwgWzU3LCA2Ml1dLFxuICAgICAgICBlZGl0UGluczogW10sXG4gICAgICAgIHN0YXJ0QmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IC00LCBwMjogLTMsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IC0yLCBwMjogLTEsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAyIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogMywgbTogMCwgdzogMiB9LFxuICAgICAgICAgICAgeyBwMTogMywgcDI6IDQsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNCwgcDI6IDUsIG06IDAsIHc6IDIgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiA3LCBtOiAwLCB3OiAyIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGVkaXRCZWFtczogW10sXG4gICAgICAgIGRpc2NzOiBbXG4gICAgICAgICAgICB7IHA6IDAsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDEsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDIsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDMsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDQsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDUsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDYsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDcsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiA3MDAwMDAwMDAuMCxcbiAgICAgICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgICAgIGRlbnNpdHk6IDEyMDAuMCxcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC45LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICB9LFxuICAgIHRlcnJhaW46IHtcbiAgICAgICAgaG1hcDogWzY0LCA2NCwgNjQsIDk2LCAxMTIsIDk2LCA2NCwgNjQsIDY0XSxcbiAgICAgICAgZnJpY3Rpb246IDAuNSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICB9LFxuICAgIGhlaWdodDogMTI4LFxuICAgIHdpZHRoOiAyNTYsXG4gICAgZzogWzAsIDEyOF0sXG4gICAgdW5kb1N0YWNrOiBbXSxcbiAgICByZWRvU3RhY2s6IFtdLFxufTtcblxuY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNcIik7XG5uZXcgUm9vdExheW91dChcbiAgICBjYW52YXMgYXMgSFRNTENhbnZhc0VsZW1lbnQsXG4gICAgQm9yZGVyKDE2LCBcImJsYWNrXCIsXG4gICAgICAgIFNjZW5lRWxlbWVudChzY2VuZSksXG4gICAgKVxuKTtcblxuLy8gVE9ETzogVGVzdCBjcmVkZW50aWFscy5cblxuLypcbmltcG9ydCB7IFZpZXdwb3J0LCBWaWV3cG9ydFBvc2l0aW9uLCBQYW5HZXN0dXJlLCBQaW5jaFpvb21HZXN0dXJlIH0gZnJvbSBcIi4vdmlld3BvcnQuanNcIlxuaW1wb3J0IHsgVG91Y2hEZW11eCB9IGZyb20gXCIuL3RvdWNoLmpzXCJcbmltcG9ydCB7IEdlc3R1cmVzfSBmcm9tIFwiLi9nZXN0dXJlLmpzXCJcbmltcG9ydCB7IHNjZW5lTWV0aG9kLCBzY2VuZVJlbmRlcmVyLCBTY2VuZSB9IGZyb20gXCIuL3NjZW5lLmpzXCI7XG5cbmNvbnN0IGMgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW52YXNcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQpO1xuaWYgKGMgPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBjYW52YXMgZWxlbWVudFwiKTtcbn1cbmNvbnN0IGN0eCA9IGMuZ2V0Q29udGV4dChcIjJkXCIpO1xuaWYgKGN0eCA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIDJkIGNvbnRleHRcIik7XG59XG5cbmNvbnN0IHNjZW5lOiBTY2VuZSA9IHtcbiAgICB0cnVzczoge1xuICAgICAgICBwaW5zOiBbXG4gICAgICAgICAgICBbIDUuMCwgNDIuNV0sICAgIC8vIDAtNyBUcmFpblxuICAgICAgICAgICAgWzEwLjAsIDQyLjVdLFxuICAgICAgICAgICAgWzE1LjAsIDQyLjVdLFxuICAgICAgICAgICAgWzIwLjAsIDQyLjVdLFxuICAgICAgICAgICAgWzI1LjAsIDQyLjVdLFxuICAgICAgICAgICAgWzEwLjAsIDQ1LjBdLFxuICAgICAgICAgICAgWzE1LjAsIDQ1LjBdLFxuICAgICAgICAgICAgWzIwLjAsIDQ1LjBdLFxuICAgICAgICAgICAgWzQwLjAsIDUwLjBdLCAgIC8vIDgtMTUgQnJpZGdlXG4gICAgICAgICAgICBbNTAuMCwgNTAuMF0sXG4gICAgICAgICAgICBbNjAuMCwgNTAuMF0sXG4gICAgICAgICAgICBbNDAuMCwgNDAuMF0sXG4gICAgICAgICAgICBbNTAuMCwgNDAuMF0sXG4gICAgICAgICAgICBbNjAuMCwgNDAuMF0sXG4gICAgICAgICAgICBbMzAuMCwgNDAuMF0sICAgLy8gMTQgQnJpZGdlIGFuY2hvclxuICAgICAgICAgICAgWzcwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWyAwLjAsIDQwLjBdLCAgIC8vIHJvYWRcbiAgICAgICAgICAgIFsxMDAuMCwgNDAuMF0sXG4gICAgICAgIF0sXG4gICAgICAgIG1vYmlsZVBpbnM6IDE0LFxuICAgICAgICBiZWFtczogW1xuICAgICAgICAgICAgeyBwMTogMCwgcDI6IDEsIG06IDAsIHc6IDAuMSB9LCAvLyBUcmFpblxuICAgICAgICAgICAgeyBwMTogMSwgcDI6IDIsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMiwgcDI6IDMsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMywgcDI6IDQsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMSwgcDI6IDUsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMiwgcDI6IDYsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMywgcDI6IDcsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMCwgcDI6IDUsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNSwgcDI6IDIsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMSwgcDI6IDYsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNiwgcDI6IDMsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogMiwgcDI6IDcsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNywgcDI6IDQsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDE0LCBtOiAwLCB3OiAxLjAgfSwgLy8gQnJpZGdlXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogMTEsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDEyLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiA5LCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDksIHAyOiAxMiwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDksIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiAxMiwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDEzLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogMTUsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTQsIHAyOiAxMSwgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sICAgLy8gRGVja1xuICAgICAgICAgICAgeyBwMTogMTEsIHAyOiAxMiwgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxMiwgcDI6IDEzLCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDEzLCBwMjogMTUsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMTYsIHAyOiAxNCwgbTogMCwgdzogMC4xLCBkZWNrOiB0cnVlIH0sICAgLy8gUm9hZFxuICAgICAgICAgICAgeyBwMTogMTUsIHAyOiAxNywgbTogMCwgdzogMC4xLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGRpc2NzOiBbXG4gICAgICAgICAgICB7IHA6IDAsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiAxLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogMiwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDMsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiA0LCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgbWF0ZXJpYWxzOiBbXG4gICAgICAgICAgICB7ICAgLy8gUnViYmVyLlxuICAgICAgICAgICAgICAgIEU6IDcwMDAwMDAwLjAsXG4gICAgICAgICAgICAgICAgc3R5bGU6IFwiYmxhY2tcIixcbiAgICAgICAgICAgICAgICBkZW5zaXR5OiAxMjAwLjAsXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuOSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgfSxcbiAgICB0ZXJyYWluOiB7XG4gICAgICAgIGhtYXA6IFtcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgXSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICAgICAgcGl0Y2g6IDUuMCxcbiAgICAgICAgZnJpY3Rpb246IDAuNSxcbiAgICB9LFxuICAgIGhlaWdodDogMTAwLjAsXG4gICAgZzogWzAuMCwgLTkuOF0sXG59O1xuXG5jb25zdCBvZGUgPSBzY2VuZU1ldGhvZChzY2VuZSk7XG5jb25zdCByZW5kZXIgPSBzY2VuZVJlbmRlcmVyKHNjZW5lKTtcblxuY29uc3QgdnAgPSBuZXcgVmlld3BvcnQoY3R4LCAoX2IsIF9zLCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkgPT4ge1xuICAgIHJlbmRlcihjdHgsIG9kZSk7XG59KTtcblxuZnVuY3Rpb24gY2xpcCh2OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGgubWluKG1heCwgTWF0aC5tYXgobWluLCB2KSk7XG59XG5cbnZwLnNldENsaXBQb3NpdGlvbigocDogVmlld3BvcnRQb3NpdGlvbik6IFZpZXdwb3J0UG9zaXRpb24gPT4ge1xuICAgIHAuc2NhbGUgPSBjbGlwKHAuc2NhbGUsIDEwLjAsIDEwMDAuMCk7XG4gICAgcC5wb3NbMF0gPSBjbGlwKHAucG9zWzBdLCAwLCBzY2VuZS50ZXJyYWluLnBpdGNoICogKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKSk7XG4gICAgcC5wb3NbMV0gPSBjbGlwKHAucG9zWzFdLCAwLCBzY2VuZS5oZWlnaHQpO1xuICAgIHAucm90YXRlID0gMC4wO1xuICAgIHJldHVybiBwO1xufSk7XG5cbnZwLnNldFBvc2l0aW9uKHsgcG9zOiBbNTAsIDUwXX0pO1xuXG5jb25zdCBoID0gMC4wMDE7XG5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKHQwOiBET01IaWdoUmVzVGltZVN0YW1wKSA9PiB7XG4gICAgZnVuY3Rpb24gbWFpbkxvb3AodDogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xuICAgICAgICAvLyBDb21wdXRlIHVwIHRvIDI1MG1zIHdvcnRoIG9mIGZyYW1lcyBhdCBhIHRpbWUuXG4gICAgICAgIGNvbnN0IGR0ID0gTWF0aC5taW4odCAtIHQwLCAyNTAuMCk7XG4gICAgICAgIGNvbnN0IGZyYW1lcyA9IE1hdGguZmxvb3IoZHQgLyAoMTAwMC4wICogaCkpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZyYW1lczsgaSsrKSB7XG4gICAgICAgICAgICBvZGUubmV4dChoKTtcbiAgICAgICAgfVxuICAgICAgICB2cC5yZXF1ZXN0UmVkcmF3KCk7XG4gICAgICAgIC8vIE9ubHkgbGV0IHRoZSBwaHlzaWNzIGJhY2tsb2cgZ2V0IHRvIDI1MG1zLlxuICAgICAgICB0MCA9IE1hdGgubWF4KHQwICsgZnJhbWVzICogaCAqIDEwMDAuMCwgdCAtIDI1MC4wKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKG1haW5Mb29wKTtcbiAgICB9XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKG1haW5Mb29wKTtcbn0pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCB2cC5yZXNpemUpO1xuXG5jb25zdCB0b3VjaCA9IG5ldyBUb3VjaERlbXV4KGMpO1xuY29uc3QgZ2VzdHVyZSA9IG5ldyBHZXN0dXJlcygpO1xudG91Y2guYWRkVG91Y2hIYW5kbGVyKGdlc3R1cmUpO1xuZ2VzdHVyZS5hZGRHZXN0dXJlSGFuZGxlcihuZXcgUGFuR2VzdHVyZSh2cCkpO1xuZ2VzdHVyZS5hZGRHZXN0dXJlSGFuZGxlcihuZXcgUGluY2hab29tR2VzdHVyZSh2cCkpO1xuKi9cblxuLy8gVE9ETzogbW9kZSB3aGVyZSB3ZSByZWFkIGFjY2VsZXJvbWV0ZXIsIGFuZCBhZGQgdGhhdCB0byBhY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuIChzY2FsZSBiYXNlZCBvbiBzY3JlZW4gc2l6ZSBhbmQgem9vbSlcblxuLy8gVE9ETzogbW91c2UgYW5kIHRyYWNrcGFkIGlucHV0XG4vLyBzY3JvbGxcbi8vIHNjcm9sbCB3aGVlbCB6b29tIGluIGFuZCBvdXRcbi8vIHdoYXQgdG8gcm90YXRlPyByaWdodCBjbGljayBkcmFnLCByb3RhdGUgYXJvdW5kIGNlbnRlciBvZiB2cD8gTWF5YmUgZG9uJ3QgY2FyZSwgc2luY2UgYnJpZGdlIHdvbnQgdXNlIHJvdGF0ZVxuXG4vLyBUT0RPOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRWxlbWVudC9yZXF1ZXN0RnVsbHNjcmVlblxuLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Z1bGxzY3JlZW5fQVBJL0d1aWRlXG4vLyBMb29rIGludG8gdGhpc1xuXG4vLyBUT0RPOiByZXdyaXRlIHZpZXdwb3J0IGV0Yy4gdG8gbm90IHRha2UgY2FsbGJhY2tzLCBqdXN0IGNhbGwgaW50byBpdCB0byBleHBsY2l0bHkgc2V0IHVwIGNhbnZhcywgZXRjLlxuXG4vLyBUT0RPOiBQaHlzaWNzIGNhbGN1bGF0aW9uIGluIGEgd2ViLXdvcmtlci5cblxuLy8gVE9ETzogQWlyIHJlc2lzdGFuY2UsIG9yIGF0IGxlYXN0IGRhbXBpbmcgb2YgcGluIG1vdmVtZW50LCBub3QganVzdCBiZWFtIHNwcmluZyBmb3JjZXMuIEtlZXAgYmVhbSBkYW1waW5nLCB0aGlzIHNob3VsZCBiZSBpbmRlcGVuZGVudC5cblxuLy8gVE9ETzogQmVhbXMgZmFpbCBhZnRlciBzb21lIHN0cmVzcy5cblxuLy8gVE9ETzogV29yayBoYXJkZW5pbmcuXG5cbi8vIFRPRE86IEJlYW0gYnVja2xpbmcuXG5cblxuY29uc29sZS5sb2coXCJzdHVmZiBsb2FkZWRcIik7XG4iXX0=