// Copyright Charles Dueck 2020
import { SceneElement } from "./scene.js";
import { RootLayout, Border } from "./ui/node.js";
const scene = {
    truss: {
        fixedPins: [[0, 64], [100, 64], [156, 64], [256, 64]],
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
                maxLength: 32.1,
                tensionYield: 1.05,
                buckleYield: 0.95,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUUvQixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRTFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sY0FBYyxDQUFBO0FBR2pELE1BQU0sS0FBSyxHQUFlO0lBQ3RCLEtBQUssRUFBRTtRQUNILFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLFFBQVEsRUFBRSxFQUFFO1FBQ1osVUFBVSxFQUFFO1lBQ1IsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO1lBQzFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtZQUMxQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDNUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUM1QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzVCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7U0FDL0I7UUFDRCxTQUFTLEVBQUUsRUFBRTtRQUNiLEtBQUssRUFBRTtZQUNILEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1lBQzlCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFO1NBQ2pDO1FBQ0QsU0FBUyxFQUFFO1lBQ1A7Z0JBQ0ksQ0FBQyxFQUFFLFdBQVc7Z0JBQ2QsS0FBSyxFQUFFLE9BQU87Z0JBQ2QsT0FBTyxFQUFFLE1BQU07Z0JBQ2YsUUFBUSxFQUFFLEdBQUc7Z0JBQ2IsU0FBUyxFQUFFLElBQUk7Z0JBQ2YsWUFBWSxFQUFFLElBQUk7Z0JBQ2xCLFdBQVcsRUFBRSxJQUFJO2FBQ3BCO1NBQ0o7S0FDSjtJQUNELE9BQU8sRUFBRTtRQUNMLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzNDLFFBQVEsRUFBRSxHQUFHO1FBQ2IsS0FBSyxFQUFFLFVBQVU7S0FDcEI7SUFDRCxNQUFNLEVBQUUsR0FBRztJQUNYLEtBQUssRUFBRSxHQUFHO0lBQ1YsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztJQUNYLFNBQVMsRUFBRSxFQUFFO0lBQ2IsU0FBUyxFQUFFLEVBQUU7Q0FDaEIsQ0FBQztBQUVGLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakQsSUFBSSxVQUFVLENBQ1YsTUFBMkIsRUFDM0IsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQ2QsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUN0QixDQUNKLENBQUM7QUFFRiwwQkFBMEI7QUFFMUI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBaUtFO0FBRUYsNkhBQTZIO0FBRTdILGlDQUFpQztBQUNqQyxTQUFTO0FBQ1QsK0JBQStCO0FBQy9CLCtHQUErRztBQUUvRyxtRkFBbUY7QUFDbkYsd0VBQXdFO0FBQ3hFLGlCQUFpQjtBQUVqQix3R0FBd0c7QUFFeEcsNkNBQTZDO0FBRTdDLHlJQUF5STtBQUV6SSxzQ0FBc0M7QUFFdEMsd0JBQXdCO0FBRXhCLHVCQUF1QjtBQUd2QixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5pbXBvcnQgeyBTY2VuZUVsZW1lbnQgfSBmcm9tIFwiLi9zY2VuZS5qc1wiO1xuaW1wb3J0IHsgU2NlbmVKU09OIH0gZnJvbSBcIi4vdHJ1c3NKU09OLmpzXCI7XG5pbXBvcnQgeyBSb290TGF5b3V0LCBCb3JkZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCJcblxuXG5jb25zdCBzY2VuZSA6IFNjZW5lSlNPTiA9IHtcbiAgICB0cnVzczoge1xuICAgICAgICBmaXhlZFBpbnM6IFtbMCwgNjRdLCBbMTAwLCA2NF0sIFsxNTYsIDY0XSwgWzI1NiwgNjRdXSxcbiAgICAgICAgdHJhaW5QaW5zOiBbWzIsIDYyXSwgWzEyLCA2Ml0sIFsxNywgNjJdLCBbMjcsIDYyXSwgWzMyLCA2Ml0sIFs0MiwgNjJdLCBbNDcsIDYyXSwgWzU3LCA2Ml1dLFxuICAgICAgICBlZGl0UGluczogW10sXG4gICAgICAgIHRyYWluQmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IC00LCBwMjogLTMsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IC0yLCBwMjogLTEsIG06IDAsIHc6IDEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAyIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogMywgbTogMCwgdzogMiB9LFxuICAgICAgICAgICAgeyBwMTogMywgcDI6IDQsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICAgICAgeyBwMTogNCwgcDI6IDUsIG06IDAsIHc6IDIgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiA3LCBtOiAwLCB3OiAyIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGVkaXRCZWFtczogW10sXG4gICAgICAgIGRpc2NzOiBbXG4gICAgICAgICAgICB7IHA6IDAsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDEsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDIsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDMsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDQsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDUsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDYsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDcsIHI6IDIsIG06IDAsIHY6IC0xMC4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiA3MDAwMDAwMDAuMCxcbiAgICAgICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgICAgIGRlbnNpdHk6IDEyMDAuMCxcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC45LFxuICAgICAgICAgICAgICAgIG1heExlbmd0aDogMzIuMSxcbiAgICAgICAgICAgICAgICB0ZW5zaW9uWWllbGQ6IDEuMDUsXG4gICAgICAgICAgICAgICAgYnVja2xlWWllbGQ6IDAuOTUsXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgIH0sXG4gICAgdGVycmFpbjoge1xuICAgICAgICBobWFwOiBbNjQsIDY0LCA2NCwgOTYsIDExMiwgOTYsIDY0LCA2NCwgNjRdLFxuICAgICAgICBmcmljdGlvbjogMC41LFxuICAgICAgICBzdHlsZTogXCJkYXJrZ3JleVwiLFxuICAgIH0sXG4gICAgaGVpZ2h0OiAxMjgsXG4gICAgd2lkdGg6IDI1NixcbiAgICBnOiBbMCwgMTI4XSxcbiAgICB1bmRvU3RhY2s6IFtdLFxuICAgIHJlZG9TdGFjazogW10sXG59O1xuXG5jb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKTtcbm5ldyBSb290TGF5b3V0KFxuICAgIGNhbnZhcyBhcyBIVE1MQ2FudmFzRWxlbWVudCxcbiAgICBCb3JkZXIoMTYsIFwiYmxhY2tcIixcbiAgICAgICAgU2NlbmVFbGVtZW50KHNjZW5lKSxcbiAgICApXG4pO1xuXG4vLyBUT0RPOiBUZXN0IGNyZWRlbnRpYWxzLlxuXG4vKlxuaW1wb3J0IHsgVmlld3BvcnQsIFZpZXdwb3J0UG9zaXRpb24sIFBhbkdlc3R1cmUsIFBpbmNoWm9vbUdlc3R1cmUgfSBmcm9tIFwiLi92aWV3cG9ydC5qc1wiXG5pbXBvcnQgeyBUb3VjaERlbXV4IH0gZnJvbSBcIi4vdG91Y2guanNcIlxuaW1wb3J0IHsgR2VzdHVyZXN9IGZyb20gXCIuL2dlc3R1cmUuanNcIlxuaW1wb3J0IHsgc2NlbmVNZXRob2QsIHNjZW5lUmVuZGVyZXIsIFNjZW5lIH0gZnJvbSBcIi4vc2NlbmUuanNcIjtcblxuY29uc3QgYyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCk7XG5pZiAoYyA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGNhbnZhcyBlbGVtZW50XCIpO1xufVxuY29uc3QgY3R4ID0gYy5nZXRDb250ZXh0KFwiMmRcIik7XG5pZiAoY3R4ID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gMmQgY29udGV4dFwiKTtcbn1cblxuY29uc3Qgc2NlbmU6IFNjZW5lID0ge1xuICAgIHRydXNzOiB7XG4gICAgICAgIHBpbnM6IFtcbiAgICAgICAgICAgIFsgNS4wLCA0Mi41XSwgICAgLy8gMC03IFRyYWluXG4gICAgICAgICAgICBbMTAuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMTUuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMjAuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMjUuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMTAuMCwgNDUuMF0sXG4gICAgICAgICAgICBbMTUuMCwgNDUuMF0sXG4gICAgICAgICAgICBbMjAuMCwgNDUuMF0sXG4gICAgICAgICAgICBbNDAuMCwgNTAuMF0sICAgLy8gOC0xNSBCcmlkZ2VcbiAgICAgICAgICAgIFs1MC4wLCA1MC4wXSxcbiAgICAgICAgICAgIFs2MC4wLCA1MC4wXSxcbiAgICAgICAgICAgIFs0MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFs1MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFs2MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFszMC4wLCA0MC4wXSwgICAvLyAxNCBCcmlkZ2UgYW5jaG9yXG4gICAgICAgICAgICBbNzAuMCwgNDAuMF0sXG4gICAgICAgICAgICBbIDAuMCwgNDAuMF0sICAgLy8gcm9hZFxuICAgICAgICAgICAgWzEwMC4wLCA0MC4wXSxcbiAgICAgICAgXSxcbiAgICAgICAgbW9iaWxlUGluczogMTQsXG4gICAgICAgIGJlYW1zOiBbXG4gICAgICAgICAgICB7IHAxOiAwLCBwMjogMSwgbTogMCwgdzogMC4xIH0sIC8vIFRyYWluXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogMywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAzLCBwMjogNCwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogNSwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogNiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAzLCBwMjogNywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAwLCBwMjogNSwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA1LCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogNiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA2LCBwMjogMywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogNywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA3LCBwMjogNCwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogMTQsIG06IDAsIHc6IDEuMCB9LCAvLyBCcmlkZ2VcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxMSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDksIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogOSwgcDI6IDEyLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogOSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDEyLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogMTMsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiAxNSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxNCwgcDI6IDExLCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSwgICAvLyBEZWNrXG4gICAgICAgICAgICB7IHAxOiAxMSwgcDI6IDEyLCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDEyLCBwMjogMTMsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMTMsIHAyOiAxNSwgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxNiwgcDI6IDE0LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSwgICAvLyBSb2FkXG4gICAgICAgICAgICB7IHAxOiAxNSwgcDI6IDE3LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgXSxcbiAgICAgICAgZGlzY3M6IFtcbiAgICAgICAgICAgIHsgcDogMCwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDEsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiAyLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogMywgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDQsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICBdLFxuICAgICAgICBtYXRlcmlhbHM6IFtcbiAgICAgICAgICAgIHsgICAvLyBSdWJiZXIuXG4gICAgICAgICAgICAgICAgRTogNzAwMDAwMDAuMCxcbiAgICAgICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgICAgIGRlbnNpdHk6IDEyMDAuMCxcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC45LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICB9LFxuICAgIHRlcnJhaW46IHtcbiAgICAgICAgaG1hcDogW1xuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICBdLFxuICAgICAgICBzdHlsZTogXCJkYXJrZ3JleVwiLFxuICAgICAgICBwaXRjaDogNS4wLFxuICAgICAgICBmcmljdGlvbjogMC41LFxuICAgIH0sXG4gICAgaGVpZ2h0OiAxMDAuMCxcbiAgICBnOiBbMC4wLCAtOS44XSxcbn07XG5cbmNvbnN0IG9kZSA9IHNjZW5lTWV0aG9kKHNjZW5lKTtcbmNvbnN0IHJlbmRlciA9IHNjZW5lUmVuZGVyZXIoc2NlbmUpO1xuXG5jb25zdCB2cCA9IG5ldyBWaWV3cG9ydChjdHgsIChfYiwgX3MsIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSA9PiB7XG4gICAgcmVuZGVyKGN0eCwgb2RlKTtcbn0pO1xuXG5mdW5jdGlvbiBjbGlwKHY6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHYpKTtcbn1cblxudnAuc2V0Q2xpcFBvc2l0aW9uKChwOiBWaWV3cG9ydFBvc2l0aW9uKTogVmlld3BvcnRQb3NpdGlvbiA9PiB7XG4gICAgcC5zY2FsZSA9IGNsaXAocC5zY2FsZSwgMTAuMCwgMTAwMC4wKTtcbiAgICBwLnBvc1swXSA9IGNsaXAocC5wb3NbMF0sIDAsIHNjZW5lLnRlcnJhaW4ucGl0Y2ggKiAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpKTtcbiAgICBwLnBvc1sxXSA9IGNsaXAocC5wb3NbMV0sIDAsIHNjZW5lLmhlaWdodCk7XG4gICAgcC5yb3RhdGUgPSAwLjA7XG4gICAgcmV0dXJuIHA7XG59KTtcblxudnAuc2V0UG9zaXRpb24oeyBwb3M6IFs1MCwgNTBdfSk7XG5cbmNvbnN0IGggPSAwLjAwMTtcbnJlcXVlc3RBbmltYXRpb25GcmFtZSgodDA6IERPTUhpZ2hSZXNUaW1lU3RhbXApID0+IHtcbiAgICBmdW5jdGlvbiBtYWluTG9vcCh0OiBET01IaWdoUmVzVGltZVN0YW1wKSB7XG4gICAgICAgIC8vIENvbXB1dGUgdXAgdG8gMjUwbXMgd29ydGggb2YgZnJhbWVzIGF0IGEgdGltZS5cbiAgICAgICAgY29uc3QgZHQgPSBNYXRoLm1pbih0IC0gdDAsIDI1MC4wKTtcbiAgICAgICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihkdCAvICgxMDAwLjAgKiBoKSk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJhbWVzOyBpKyspIHtcbiAgICAgICAgICAgIG9kZS5uZXh0KGgpO1xuICAgICAgICB9XG4gICAgICAgIHZwLnJlcXVlc3RSZWRyYXcoKTtcbiAgICAgICAgLy8gT25seSBsZXQgdGhlIHBoeXNpY3MgYmFja2xvZyBnZXQgdG8gMjUwbXMuXG4gICAgICAgIHQwID0gTWF0aC5tYXgodDAgKyBmcmFtZXMgKiBoICogMTAwMC4wLCB0IC0gMjUwLjApO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xuICAgIH1cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xufSk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHZwLnJlc2l6ZSk7XG5cbmNvbnN0IHRvdWNoID0gbmV3IFRvdWNoRGVtdXgoYyk7XG5jb25zdCBnZXN0dXJlID0gbmV3IEdlc3R1cmVzKCk7XG50b3VjaC5hZGRUb3VjaEhhbmRsZXIoZ2VzdHVyZSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQYW5HZXN0dXJlKHZwKSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQaW5jaFpvb21HZXN0dXJlKHZwKSk7XG4qL1xuXG4vLyBUT0RPOiBtb2RlIHdoZXJlIHdlIHJlYWQgYWNjZWxlcm9tZXRlciwgYW5kIGFkZCB0aGF0IHRvIGFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS4gKHNjYWxlIGJhc2VkIG9uIHNjcmVlbiBzaXplIGFuZCB6b29tKVxuXG4vLyBUT0RPOiBtb3VzZSBhbmQgdHJhY2twYWQgaW5wdXRcbi8vIHNjcm9sbFxuLy8gc2Nyb2xsIHdoZWVsIHpvb20gaW4gYW5kIG91dFxuLy8gd2hhdCB0byByb3RhdGU/IHJpZ2h0IGNsaWNrIGRyYWcsIHJvdGF0ZSBhcm91bmQgY2VudGVyIG9mIHZwPyBNYXliZSBkb24ndCBjYXJlLCBzaW5jZSBicmlkZ2Ugd29udCB1c2Ugcm90YXRlXG5cbi8vIFRPRE86IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9FbGVtZW50L3JlcXVlc3RGdWxsc2NyZWVuXG4vLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRnVsbHNjcmVlbl9BUEkvR3VpZGVcbi8vIExvb2sgaW50byB0aGlzXG5cbi8vIFRPRE86IHJld3JpdGUgdmlld3BvcnQgZXRjLiB0byBub3QgdGFrZSBjYWxsYmFja3MsIGp1c3QgY2FsbCBpbnRvIGl0IHRvIGV4cGxjaXRseSBzZXQgdXAgY2FudmFzLCBldGMuXG5cbi8vIFRPRE86IFBoeXNpY3MgY2FsY3VsYXRpb24gaW4gYSB3ZWItd29ya2VyLlxuXG4vLyBUT0RPOiBBaXIgcmVzaXN0YW5jZSwgb3IgYXQgbGVhc3QgZGFtcGluZyBvZiBwaW4gbW92ZW1lbnQsIG5vdCBqdXN0IGJlYW0gc3ByaW5nIGZvcmNlcy4gS2VlcCBiZWFtIGRhbXBpbmcsIHRoaXMgc2hvdWxkIGJlIGluZGVwZW5kZW50LlxuXG4vLyBUT0RPOiBCZWFtcyBmYWlsIGFmdGVyIHNvbWUgc3RyZXNzLlxuXG4vLyBUT0RPOiBXb3JrIGhhcmRlbmluZy5cblxuLy8gVE9ETzogQmVhbSBidWNrbGluZy5cblxuXG5jb25zb2xlLmxvZyhcInN0dWZmIGxvYWRlZFwiKTtcbiJdfQ==