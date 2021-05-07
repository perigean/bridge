// Copyright Charles Dueck 2020
//import { DebugTouch, Left, VCenter, RootLayout, Layer, Relative, Draggable, Fill, LayoutBox } from "./ui/node.js"
import { RootLayout, Relative, Draggable, Fill, Layer, Left, VCenter, DebugTouch, Scroll, Box } from "./ui/node.js";
const canvas = document.getElementById("canvas");
new RootLayout(canvas, Scroll(Box(4096, 4096, Layer(Left(VCenter(DebugTouch(384, 192, "lightblue", "blue")), VCenter(DebugTouch(192, 384, "lightgreen", "green")), VCenter(DebugTouch(256, 256, "pink", "red"))), Relative(Draggable(0, 0, 64, 64, Fill().onDraw((ctx, box) => {
    ctx.fillStyle = "darkgray";
    ctx.fillRect(box.left, box.top, box.width, box.height);
})), Draggable(128, 128, 64, 64, Fill().onDraw((ctx, box) => {
    ctx.fillStyle = "lightgray";
    ctx.fillRect(box.left, box.top, box.width, box.height);
})))))));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUcvQixtSEFBbUg7QUFDbkgsT0FBTyxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBYSxLQUFLLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLGNBQWMsQ0FBQTtBQUU5SCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2pELElBQUksVUFBVSxDQUNWLE1BQTJCLEVBQzNCLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLENBQ3hCLElBQUksQ0FDQSxPQUFPLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQ2xELE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFDcEQsT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUMvQyxFQUNELFFBQVEsQ0FDSixTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FDakMsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxFQUFFO0lBQzlDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsVUFBVSxDQUFDO0lBQzNCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzNELENBQUMsQ0FBQyxDQUNMLEVBQ0QsU0FBUyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQ3JDLENBQUMsR0FBNkIsRUFBRSxHQUFjLEVBQUUsRUFBRTtJQUM5QyxHQUFHLENBQUMsU0FBUyxHQUFHLFdBQVcsQ0FBQztJQUM1QixHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUMzRCxDQUFDLENBQUMsQ0FDTCxDQUNKLENBQ0osQ0FBQyxDQUFDLENBQ04sQ0FBQztBQUVGLDBCQUEwQjtBQUUxQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFpS0U7QUFHRixpQ0FBaUM7QUFDakMsU0FBUztBQUNULCtCQUErQjtBQUMvQiwrR0FBK0c7QUFFL0csbUZBQW1GO0FBQ25GLHdFQUF3RTtBQUN4RSxpQkFBaUI7QUFFakIsd0dBQXdHO0FBRXhHLDZDQUE2QztBQUU3Qyx5SUFBeUk7QUFFekksc0NBQXNDO0FBRXRDLHdCQUF3QjtBQUV4Qix1QkFBdUI7QUFHdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuXG4vL2ltcG9ydCB7IERlYnVnVG91Y2gsIExlZnQsIFZDZW50ZXIsIFJvb3RMYXlvdXQsIExheWVyLCBSZWxhdGl2ZSwgRHJhZ2dhYmxlLCBGaWxsLCBMYXlvdXRCb3ggfSBmcm9tIFwiLi91aS9ub2RlLmpzXCJcbmltcG9ydCB7IFJvb3RMYXlvdXQsIFJlbGF0aXZlLCBEcmFnZ2FibGUsIEZpbGwsIExheW91dEJveCwgTGF5ZXIsIExlZnQsIFZDZW50ZXIsIERlYnVnVG91Y2gsIFNjcm9sbCwgQm94IH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiXG5cbmNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpO1xubmV3IFJvb3RMYXlvdXQoXG4gICAgY2FudmFzIGFzIEhUTUxDYW52YXNFbGVtZW50LFxuICAgIFNjcm9sbChCb3goNDA5NiwgNDA5NiwgTGF5ZXIoXG4gICAgICAgIExlZnQoXG4gICAgICAgICAgICBWQ2VudGVyKERlYnVnVG91Y2goMzg0LCAxOTIsIFwibGlnaHRibHVlXCIsIFwiYmx1ZVwiKSksXG4gICAgICAgICAgICBWQ2VudGVyKERlYnVnVG91Y2goMTkyLCAzODQsIFwibGlnaHRncmVlblwiLCBcImdyZWVuXCIpKSxcbiAgICAgICAgICAgIFZDZW50ZXIoRGVidWdUb3VjaCgyNTYsIDI1NiwgXCJwaW5rXCIsIFwicmVkXCIpKSxcbiAgICAgICAgKSxcbiAgICAgICAgUmVsYXRpdmUoXG4gICAgICAgICAgICBEcmFnZ2FibGUoMCwgMCwgNjQsIDY0LCBGaWxsKCkub25EcmF3KFxuICAgICAgICAgICAgICAgIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwiZGFya2dyYXlcIjtcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRHJhZ2dhYmxlKDEyOCwgMTI4LCA2NCwgNjQsIEZpbGwoKS5vbkRyYXcoXG4gICAgICAgICAgICAgICAgKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJsaWdodGdyYXlcIjtcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICkpKSxcbik7XG5cbi8vIFRPRE86IFRlc3QgY3JlZGVudGlhbHMuXG5cbi8qXG5pbXBvcnQgeyBWaWV3cG9ydCwgVmlld3BvcnRQb3NpdGlvbiwgUGFuR2VzdHVyZSwgUGluY2hab29tR2VzdHVyZSB9IGZyb20gXCIuL3ZpZXdwb3J0LmpzXCJcbmltcG9ydCB7IFRvdWNoRGVtdXggfSBmcm9tIFwiLi90b3VjaC5qc1wiXG5pbXBvcnQgeyBHZXN0dXJlc30gZnJvbSBcIi4vZ2VzdHVyZS5qc1wiXG5pbXBvcnQgeyBzY2VuZU1ldGhvZCwgc2NlbmVSZW5kZXJlciwgU2NlbmUgfSBmcm9tIFwiLi9zY2VuZS5qc1wiO1xuXG5jb25zdCBjID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50KTtcbmlmIChjID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gY2FudmFzIGVsZW1lbnRcIik7XG59XG5jb25zdCBjdHggPSBjLmdldENvbnRleHQoXCIyZFwiKTtcbmlmIChjdHggPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyAyZCBjb250ZXh0XCIpO1xufVxuXG5jb25zdCBzY2VuZTogU2NlbmUgPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgcGluczogW1xuICAgICAgICAgICAgWyA1LjAsIDQyLjVdLCAgICAvLyAwLTcgVHJhaW5cbiAgICAgICAgICAgIFsxMC4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsxNS4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsyMC4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsyNS4wLCA0Mi41XSxcbiAgICAgICAgICAgIFsxMC4wLCA0NS4wXSxcbiAgICAgICAgICAgIFsxNS4wLCA0NS4wXSxcbiAgICAgICAgICAgIFsyMC4wLCA0NS4wXSxcbiAgICAgICAgICAgIFs0MC4wLCA1MC4wXSwgICAvLyA4LTE1IEJyaWRnZVxuICAgICAgICAgICAgWzUwLjAsIDUwLjBdLFxuICAgICAgICAgICAgWzYwLjAsIDUwLjBdLFxuICAgICAgICAgICAgWzQwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzUwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzYwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzMwLjAsIDQwLjBdLCAgIC8vIDE0IEJyaWRnZSBhbmNob3JcbiAgICAgICAgICAgIFs3MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFsgMC4wLCA0MC4wXSwgICAvLyByb2FkXG4gICAgICAgICAgICBbMTAwLjAsIDQwLjBdLFxuICAgICAgICBdLFxuICAgICAgICBtb2JpbGVQaW5zOiAxNCxcbiAgICAgICAgYmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSwgLy8gVHJhaW5cbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiAzLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiA1LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA3LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiA1LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiA2LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAzLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDIsIHAyOiA3LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDcsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxNCwgbTogMCwgdzogMS4wIH0sIC8vIEJyaWRnZVxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDExLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxMiwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogOSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA5LCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiA5LCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiAxMywgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDE1LCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDE0LCBwMjogMTEsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LCAgIC8vIERlY2tcbiAgICAgICAgICAgIHsgcDE6IDExLCBwMjogMTIsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMTIsIHAyOiAxMywgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxMywgcDI6IDE1LCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDE2LCBwMjogMTQsIG06IDAsIHc6IDAuMSwgZGVjazogdHJ1ZSB9LCAgIC8vIFJvYWRcbiAgICAgICAgICAgIHsgcDE6IDE1LCBwMjogMTcsIG06IDAsIHc6IDAuMSwgZGVjazogdHJ1ZSB9LFxuICAgICAgICBdLFxuICAgICAgICBkaXNjczogW1xuICAgICAgICAgICAgeyBwOiAwLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogMSwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDIsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiAzLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogNCwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiA3MDAwMDAwMC4wLFxuICAgICAgICAgICAgICAgIHN0eWxlOiBcImJsYWNrXCIsXG4gICAgICAgICAgICAgICAgZGVuc2l0eTogMTIwMC4wLFxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgIH0sXG4gICAgdGVycmFpbjoge1xuICAgICAgICBobWFwOiBbXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgIF0sXG4gICAgICAgIHN0eWxlOiBcImRhcmtncmV5XCIsXG4gICAgICAgIHBpdGNoOiA1LjAsXG4gICAgICAgIGZyaWN0aW9uOiAwLjUsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEwMC4wLFxuICAgIGc6IFswLjAsIC05LjhdLFxufTtcblxuY29uc3Qgb2RlID0gc2NlbmVNZXRob2Qoc2NlbmUpO1xuY29uc3QgcmVuZGVyID0gc2NlbmVSZW5kZXJlcihzY2VuZSk7XG5cbmNvbnN0IHZwID0gbmV3IFZpZXdwb3J0KGN0eCwgKF9iLCBfcywgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpID0+IHtcbiAgICByZW5kZXIoY3R4LCBvZGUpO1xufSk7XG5cbmZ1bmN0aW9uIGNsaXAodjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdikpO1xufVxuXG52cC5zZXRDbGlwUG9zaXRpb24oKHA6IFZpZXdwb3J0UG9zaXRpb24pOiBWaWV3cG9ydFBvc2l0aW9uID0+IHtcbiAgICBwLnNjYWxlID0gY2xpcChwLnNjYWxlLCAxMC4wLCAxMDAwLjApO1xuICAgIHAucG9zWzBdID0gY2xpcChwLnBvc1swXSwgMCwgc2NlbmUudGVycmFpbi5waXRjaCAqIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSkpO1xuICAgIHAucG9zWzFdID0gY2xpcChwLnBvc1sxXSwgMCwgc2NlbmUuaGVpZ2h0KTtcbiAgICBwLnJvdGF0ZSA9IDAuMDtcbiAgICByZXR1cm4gcDtcbn0pO1xuXG52cC5zZXRQb3NpdGlvbih7IHBvczogWzUwLCA1MF19KTtcblxuY29uc3QgaCA9IDAuMDAxO1xucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCh0MDogRE9NSGlnaFJlc1RpbWVTdGFtcCkgPT4ge1xuICAgIGZ1bmN0aW9uIG1haW5Mb29wKHQ6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcbiAgICAgICAgLy8gQ29tcHV0ZSB1cCB0byAyNTBtcyB3b3J0aCBvZiBmcmFtZXMgYXQgYSB0aW1lLlxuICAgICAgICBjb25zdCBkdCA9IE1hdGgubWluKHQgLSB0MCwgMjUwLjApO1xuICAgICAgICBjb25zdCBmcmFtZXMgPSBNYXRoLmZsb29yKGR0IC8gKDEwMDAuMCAqIGgpKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmcmFtZXM7IGkrKykge1xuICAgICAgICAgICAgb2RlLm5leHQoaCk7XG4gICAgICAgIH1cbiAgICAgICAgdnAucmVxdWVzdFJlZHJhdygpO1xuICAgICAgICAvLyBPbmx5IGxldCB0aGUgcGh5c2ljcyBiYWNrbG9nIGdldCB0byAyNTBtcy5cbiAgICAgICAgdDAgPSBNYXRoLm1heCh0MCArIGZyYW1lcyAqIGggKiAxMDAwLjAsIHQgLSAyNTAuMCk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShtYWluTG9vcCk7XG4gICAgfVxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShtYWluTG9vcCk7XG59KTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdnAucmVzaXplKTtcblxuY29uc3QgdG91Y2ggPSBuZXcgVG91Y2hEZW11eChjKTtcbmNvbnN0IGdlc3R1cmUgPSBuZXcgR2VzdHVyZXMoKTtcbnRvdWNoLmFkZFRvdWNoSGFuZGxlcihnZXN0dXJlKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBhbkdlc3R1cmUodnApKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBpbmNoWm9vbUdlc3R1cmUodnApKTtcbiovXG5cblxuLy8gVE9ETzogbW91c2UgYW5kIHRyYWNrcGFkIGlucHV0XG4vLyBzY3JvbGxcbi8vIHNjcm9sbCB3aGVlbCB6b29tIGluIGFuZCBvdXRcbi8vIHdoYXQgdG8gcm90YXRlPyByaWdodCBjbGljayBkcmFnLCByb3RhdGUgYXJvdW5kIGNlbnRlciBvZiB2cD8gTWF5YmUgZG9uJ3QgY2FyZSwgc2luY2UgYnJpZGdlIHdvbnQgdXNlIHJvdGF0ZVxuXG4vLyBUT0RPOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRWxlbWVudC9yZXF1ZXN0RnVsbHNjcmVlblxuLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Z1bGxzY3JlZW5fQVBJL0d1aWRlXG4vLyBMb29rIGludG8gdGhpc1xuXG4vLyBUT0RPOiByZXdyaXRlIHZpZXdwb3J0IGV0Yy4gdG8gbm90IHRha2UgY2FsbGJhY2tzLCBqdXN0IGNhbGwgaW50byBpdCB0byBleHBsY2l0bHkgc2V0IHVwIGNhbnZhcywgZXRjLlxuXG4vLyBUT0RPOiBQaHlzaWNzIGNhbGN1bGF0aW9uIGluIGEgd2ViLXdvcmtlci5cblxuLy8gVE9ETzogQWlyIHJlc2lzdGFuY2UsIG9yIGF0IGxlYXN0IGRhbXBpbmcgb2YgcGluIG1vdmVtZW50LCBub3QganVzdCBiZWFtIHNwcmluZyBmb3JjZXMuIEtlZXAgYmVhbSBkYW1waW5nLCB0aGlzIHNob3VsZCBiZSBpbmRlcGVuZGVudC5cblxuLy8gVE9ETzogQmVhbXMgZmFpbCBhZnRlciBzb21lIHN0cmVzcy5cblxuLy8gVE9ETzogV29yayBoYXJkZW5pbmcuXG5cbi8vIFRPRE86IEJlYW0gYnVja2xpbmcuXG5cblxuY29uc29sZS5sb2coXCJzdHVmZiBsb2FkZWRcIik7XG4iXX0=