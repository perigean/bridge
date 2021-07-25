// Copyright Charles Dueck 2020
import { SceneElement } from "./scene.js";
import { RootLayout, Border } from "./ui/node.js";
//import { RootLayout, Fill, Border } from "./ui/node.js"
const scene = {
    truss: {
        fixedPins: [[0, 64], [64, 64], [192, 64], [256, 64]],
        trainPins: [[2, 62], [12, 62], [17, 62], [27, 62], [32, 62], [42, 62], [47, 62], [57, 62]],
        editPins: [],
        trainBeams: [
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
                maxLength: 32.0,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUcvQixPQUFPLEVBQWEsWUFBWSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3JELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sY0FBYyxDQUFBO0FBQ2pELHlEQUF5RDtBQUV6RCxNQUFNLEtBQUssR0FBZTtJQUN0QixLQUFLLEVBQUU7UUFDSCxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRCxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxRixRQUFRLEVBQUUsRUFBRTtRQUNaLFVBQVUsRUFBRTtZQUNSLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtZQUMxQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUU7WUFDMUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzVCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDNUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUM1QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1NBQy9CO1FBQ0QsU0FBUyxFQUFFLEVBQUU7UUFDYixLQUFLLEVBQUU7WUFDSCxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtZQUM5QixFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRTtTQUNqQztRQUNELFNBQVMsRUFBRTtZQUNQO2dCQUNJLENBQUMsRUFBRSxXQUFXO2dCQUNkLEtBQUssRUFBRSxPQUFPO2dCQUNkLE9BQU8sRUFBRSxNQUFNO2dCQUNmLFFBQVEsRUFBRSxHQUFHO2dCQUNiLFNBQVMsRUFBRSxJQUFJO2FBQ2xCO1NBQ0o7S0FDSjtJQUNELE9BQU8sRUFBRTtRQUNMLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzNDLFFBQVEsRUFBRSxHQUFHO1FBQ2IsS0FBSyxFQUFFLFVBQVU7S0FDcEI7SUFDRCxNQUFNLEVBQUUsR0FBRztJQUNYLEtBQUssRUFBRSxHQUFHO0lBQ1YsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNYLFNBQVMsRUFBRSxFQUFFO0lBQ2IsU0FBUyxFQUFFLEVBQUU7Q0FDaEIsQ0FBQztBQUVGLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakQsSUFBSSxVQUFVLENBQ1YsTUFBMkIsRUFDM0IsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQ2QsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUN0QixDQUNKLENBQUM7QUFFRiwwQkFBMEI7QUFFMUI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBaUtFO0FBRUYsNkhBQTZIO0FBRTdILGlDQUFpQztBQUNqQyxTQUFTO0FBQ1QsK0JBQStCO0FBQy9CLCtHQUErRztBQUUvRyxtRkFBbUY7QUFDbkYsd0VBQXdFO0FBQ3hFLGlCQUFpQjtBQUVqQix3R0FBd0c7QUFFeEcsNkNBQTZDO0FBRTdDLHlJQUF5STtBQUV6SSxzQ0FBc0M7QUFFdEMsd0JBQXdCO0FBRXhCLHVCQUF1QjtBQUd2QixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5cbmltcG9ydCB7IFNjZW5lSlNPTiwgU2NlbmVFbGVtZW50IH0gZnJvbSBcIi4vc2NlbmUuanNcIjtcbmltcG9ydCB7IFJvb3RMYXlvdXQsIEJvcmRlciB9IGZyb20gXCIuL3VpL25vZGUuanNcIlxuLy9pbXBvcnQgeyBSb290TGF5b3V0LCBGaWxsLCBCb3JkZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCJcblxuY29uc3Qgc2NlbmUgOiBTY2VuZUpTT04gPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgZml4ZWRQaW5zOiBbWzAsIDY0XSwgWzY0LCA2NF0sIFsxOTIsIDY0XSwgWzI1NiwgNjRdXSxcbiAgICAgICAgdHJhaW5QaW5zOiBbWzIsIDYyXSwgWzEyLCA2Ml0sIFsxNywgNjJdLCBbMjcsIDYyXSwgWzMyLCA2Ml0sIFs0MiwgNjJdLCBbNDcsIDYyXSwgWzU3LCA2Ml1dLFxuICAgICAgICBlZGl0UGluczogW10sXG4gICAgICAgIHRyYWluQmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IC00LCBwMjogLTMsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IC0yLCBwMjogLTEsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAyIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogMywgbTogMCwgdzogMiB9LFxuICAgICAgICAgICAgeyBwMTogMywgcDI6IDQsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNCwgcDI6IDUsIG06IDAsIHc6IDIgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiA3LCBtOiAwLCB3OiAyIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGVkaXRCZWFtczogW10sXG4gICAgICAgIGRpc2NzOiBbXG4gICAgICAgICAgICB7IHA6IDAsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDEsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDIsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDMsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDQsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDUsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDYsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDcsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiA3MDAwMDAwMDAuMCxcbiAgICAgICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgICAgIGRlbnNpdHk6IDEyMDAuMCxcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC45LFxuICAgICAgICAgICAgICAgIG1heExlbmd0aDogMzIuMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgfSxcbiAgICB0ZXJyYWluOiB7XG4gICAgICAgIGhtYXA6IFs2NCwgNjQsIDY0LCA5NiwgMTEyLCA5NiwgNjQsIDY0LCA2NF0sXG4gICAgICAgIGZyaWN0aW9uOiAwLjUsXG4gICAgICAgIHN0eWxlOiBcImRhcmtncmV5XCIsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEyOCxcbiAgICB3aWR0aDogMjU2LFxuICAgIGc6IFswLCAxMjhdLFxuICAgIHVuZG9TdGFjazogW10sXG4gICAgcmVkb1N0YWNrOiBbXSxcbn07XG5cbmNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpO1xubmV3IFJvb3RMYXlvdXQoXG4gICAgY2FudmFzIGFzIEhUTUxDYW52YXNFbGVtZW50LFxuICAgIEJvcmRlcigxNiwgXCJibGFja1wiLFxuICAgICAgICBTY2VuZUVsZW1lbnQoc2NlbmUpLFxuICAgIClcbik7XG5cbi8vIFRPRE86IFRlc3QgY3JlZGVudGlhbHMuXG5cbi8qXG5pbXBvcnQgeyBWaWV3cG9ydCwgVmlld3BvcnRQb3NpdGlvbiwgUGFuR2VzdHVyZSwgUGluY2hab29tR2VzdHVyZSB9IGZyb20gXCIuL3ZpZXdwb3J0LmpzXCJcbmltcG9ydCB7IFRvdWNoRGVtdXggfSBmcm9tIFwiLi90b3VjaC5qc1wiXG5pbXBvcnQgeyBHZXN0dXJlc30gZnJvbSBcIi4vZ2VzdHVyZS5qc1wiXG5pbXBvcnQgeyBzY2VuZU1ldGhvZCwgc2NlbmVSZW5kZXJlciwgU2NlbmUgfSBmcm9tIFwiLi9zY2VuZS5qc1wiO1xuXG5jb25zdCBjID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50KTtcbmlmIChjID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gY2FudmFzIGVsZW1lbnRcIik7XG59XG5jb25zdCBjdHggPSBjLmdldENvbnRleHQoXCIyZFwiKTtcbmlmIChjdHggPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyAyZCBjb250ZXh0XCIpO1xufVxuXG5jb25zdCBzY2VuZTogU2NlbmUgPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgcGluczogW1xuICAgICAgICAgICAgWyA1LjAsIDQyLjVdLCAgICAvLyAwLTcgVHJhaW5cbiAgICAgICAgICAgIFsxMC4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsxNS4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsyMC4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsyNS4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsxMC4wLCA0NS4wXSxcbiAgICAgICAgICAgIFsxNS4wLCA0NS4wXSxcbiAgICAgICAgICAgIFsyMC4wLCA0NS4wXSxcbiAgICAgICAgICAgIFs0MC4wLCA1MC4wXSwgICAvLyA4LTE1IEJyaWRnZVxuICAgICAgICAgICAgWzUwLjAsIDUwLjBdLFxuICAgICAgICAgICAgWzYwLjAsIDUwLjBdLFxuICAgICAgICAgICAgWzQwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzUwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzYwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzMwLjAsIDQwLjBdLCAgIC8vIDE0IEJyaWRnZSBhbmNob3JcbiAgICAgICAgICAgIFs3MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFsgMC4wLCA0MC4wXSwgICAvLyByb2FkXG4gICAgICAgICAgICBbMTAwLjAsIDQwLjBdLFxuICAgICAgICBdLFxuICAgICAgICBtb2JpbGVQaW5zOiAxNCxcbiAgICAgICAgYmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSwgLy8gVHJhaW5cbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiAzLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiA1LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA3LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiA1LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAzLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiA3LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDcsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxNCwgbTogMCwgdzogMS4wIH0sIC8vIEJyaWRnZVxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDExLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxMiwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogOSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA5LCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiA5LCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiAxMywgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDE1LCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDE0LCBwMjogMTEsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LCAgIC8vIERlY2tcbiAgICAgICAgICAgIHsgcDE6IDExLCBwMjogMTIsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMTIsIHAyOiAxMywgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxMywgcDI6IDE1LCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDE2LCBwMjogMTQsIG06IDAsIHc6IDAuMSwgZGVjazogdHJ1ZSB9LCAgIC8vIFJvYWRcbiAgICAgICAgICAgIHsgcDE6IDE1LCBwMjogMTcsIG06IDAsIHc6IDAuMSwgZGVjazogdHJ1ZSB9LFxuICAgICAgICBdLFxuICAgICAgICBkaXNjczogW1xuICAgICAgICAgICAgeyBwOiAwLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogMSwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDIsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiAzLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogNCwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiA3MDAwMDAwMC4wLFxuICAgICAgICAgICAgICAgIHN0eWxlOiBcImJsYWNrXCIsXG4gICAgICAgICAgICAgICAgZGVuc2l0eTogMTIwMC4wLFxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgIH0sXG4gICAgdGVycmFpbjoge1xuICAgICAgICBobWFwOiBbXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgIF0sXG4gICAgICAgIHN0eWxlOiBcImRhcmtncmV5XCIsXG4gICAgICAgIHBpdGNoOiA1LjAsXG4gICAgICAgIGZyaWN0aW9uOiAwLjUsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEwMC4wLFxuICAgIGc6IFswLjAsIC05LjhdLFxufTtcblxuY29uc3Qgb2RlID0gc2NlbmVNZXRob2Qoc2NlbmUpO1xuY29uc3QgcmVuZGVyID0gc2NlbmVSZW5kZXJlcihzY2VuZSk7XG5cbmNvbnN0IHZwID0gbmV3IFZpZXdwb3J0KGN0eCwgKF9iLCBfcywgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpID0+IHtcbiAgICByZW5kZXIoY3R4LCBvZGUpO1xufSk7XG5cbmZ1bmN0aW9uIGNsaXAodjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdikpO1xufVxuXG52cC5zZXRDbGlwUG9zaXRpb24oKHA6IFZpZXdwb3J0UG9zaXRpb24pOiBWaWV3cG9ydFBvc2l0aW9uID0+IHtcbiAgICBwLnNjYWxlID0gY2xpcChwLnNjYWxlLCAxMC4wLCAxMDAwLjApO1xuICAgIHAucG9zWzBdID0gY2xpcChwLnBvc1swXSwgMCwgc2NlbmUudGVycmFpbi5waXRjaCAqIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSkpO1xuICAgIHAucG9zWzFdID0gY2xpcChwLnBvc1sxXSwgMCwgc2NlbmUuaGVpZ2h0KTtcbiAgICBwLnJvdGF0ZSA9IDAuMDtcbiAgICByZXR1cm4gcDtcbn0pO1xuXG52cC5zZXRQb3NpdGlvbih7IHBvczogWzUwLCA1MF19KTtcblxuY29uc3QgaCA9IDAuMDAxO1xucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCh0MDogRE9NSGlnaFJlc1RpbWVTdGFtcCkgPT4ge1xuICAgIGZ1bmN0aW9uIG1haW5Mb29wKHQ6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcbiAgICAgICAgLy8gQ29tcHV0ZSB1cCB0byAyNTBtcyB3b3J0aCBvZiBmcmFtZXMgYXQgYSB0aW1lLlxuICAgICAgICBjb25zdCBkdCA9IE1hdGgubWluKHQgLSB0MCwgMjUwLjApO1xuICAgICAgICBjb25zdCBmcmFtZXMgPSBNYXRoLmZsb29yKGR0IC8gKDEwMDAuMCAqIGgpKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykge1xuICAgICAgICAgICAgb2RlLm5leHQoaCk7XG4gICAgICAgIH1cbiAgICAgICAgdnAucmVxdWVzdFJlZHJhdygpO1xuICAgICAgICAvLyBPbmx5IGxldCB0aGUgcGh5c2ljcyBiYWNrbG9nIGdldCB0byAyNTBtcy5cbiAgICAgICAgdDAgPSBNYXRoLm1heCh0MCArIGZyYW1lcyAqIGggKiAxMDAwLjAsIHQgLSAyNTAuMCk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShtYWluTG9vcCk7XG4gICAgfVxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShtYWluTG9vcCk7XG59KTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdnAucmVzaXplKTtcblxuY29uc3QgdG91Y2ggPSBuZXcgVG91Y2hEZW11eChjKTtcbmNvbnN0IGdlc3R1cmUgPSBuZXcgR2VzdHVyZXMoKTtcbnRvdWNoLmFkZFRvdWNoSGFuZGxlcihnZXN0dXJlKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBhbkdlc3R1cmUodnApKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBpbmNoWm9vbUdlc3R1cmUodnApKTtcbiovXG5cbi8vIFRPRE86IG1vZGUgd2hlcmUgd2UgcmVhZCBhY2NlbGVyb21ldGVyLCBhbmQgYWRkIHRoYXQgdG8gYWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LiAoc2NhbGUgYmFzZWQgb24gc2NyZWVuIHNpemUgYW5kIHpvb20pXG5cbi8vIFRPRE86IG1vdXNlIGFuZCB0cmFja3BhZCBpbnB1dFxuLy8gc2Nyb2xsXG4vLyBzY3JvbGwgd2hlZWwgem9vbSBpbiBhbmQgb3V0XG4vLyB3aGF0IHRvIHJvdGF0ZT8gcmlnaHQgY2xpY2sgZHJhZywgcm90YXRlIGFyb3VuZCBjZW50ZXIgb2YgdnA/IE1heWJlIGRvbid0IGNhcmUsIHNpbmNlIGJyaWRnZSB3b250IHVzZSByb3RhdGVcblxuLy8gVE9ETzogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvcmVxdWVzdEZ1bGxzY3JlZW5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9GdWxsc2NyZWVuX0FQSS9HdWlkZVxuLy8gTG9vayBpbnRvIHRoaXNcblxuLy8gVE9ETzogcmV3cml0ZSB2aWV3cG9ydCBldGMuIHRvIG5vdCB0YWtlIGNhbGxiYWNrcywganVzdCBjYWxsIGludG8gaXQgdG8gZXhwbGNpdGx5IHNldCB1cCBjYW52YXMsIGV0Yy5cblxuLy8gVE9ETzogUGh5c2ljcyBjYWxjdWxhdGlvbiBpbiBhIHdlYi13b3JrZXIuXG5cbi8vIFRPRE86IEFpciByZXNpc3RhbmNlLCBvciBhdCBsZWFzdCBkYW1waW5nIG9mIHBpbiBtb3ZlbWVudCwgbm90IGp1c3QgYmVhbSBzcHJpbmcgZm9yY2VzLiBLZWVwIGJlYW0gZGFtcGluZywgdGhpcyBzaG91bGQgYmUgaW5kZXBlbmRlbnQuXG5cbi8vIFRPRE86IEJlYW1zIGZhaWwgYWZ0ZXIgc29tZSBzdHJlc3MuXG5cbi8vIFRPRE86IFdvcmsgaGFyZGVuaW5nLlxuXG4vLyBUT0RPOiBCZWFtIGJ1Y2tsaW5nLlxuXG5cbmNvbnNvbGUubG9nKFwic3R1ZmYgbG9hZGVkXCIpO1xuIl19