// Copyright Charles Dueck 2020
import { SceneElement } from "./scene.js";
import { RootLayout, Scroll, Border } from "./ui/node.js";
//import { RootLayout, Fill, Border } from "./ui/node.js"
const scene = {
    truss: {
        fixedPins: [[0, 512], [128, 512], [1920, 512], [2048, 512]],
        startPins: [],
        editPins: [],
        startBeams: [],
        editBeams: [],
        discs: [],
        materials: [],
    },
    terrain: {
        hmap: [512, 512, 576, 640, 672, 688, 688, 768, 768, 768, 768, 688, 672, 640, 576, 512, 512],
        friction: 0.5,
        style: "darkgrey",
    },
    height: 1024,
    width: 2048,
    g: [0, 128],
};
const canvas = document.getElementById("canvas");
new RootLayout(canvas, Border(16, "black", Scroll(SceneElement(scene), undefined, 2)));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUcvQixPQUFPLEVBQVMsWUFBWSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2pELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLGNBQWMsQ0FBQTtBQUN6RCx5REFBeUQ7QUFFekQsTUFBTSxLQUFLLEdBQVc7SUFDbEIsS0FBSyxFQUFFO1FBQ0gsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDM0QsU0FBUyxFQUFFLEVBQUU7UUFDYixRQUFRLEVBQUUsRUFBRTtRQUNaLFVBQVUsRUFBRSxFQUFFO1FBQ2QsU0FBUyxFQUFFLEVBQUU7UUFDYixLQUFLLEVBQUUsRUFBRTtRQUNULFNBQVMsRUFBRSxFQUFFO0tBQ2hCO0lBQ0QsT0FBTyxFQUFFO1FBQ0wsSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUMzRixRQUFRLEVBQUUsR0FBRztRQUNiLEtBQUssRUFBRSxVQUFVO0tBQ3BCO0lBQ0QsTUFBTSxFQUFFLElBQUk7SUFDWixLQUFLLEVBQUUsSUFBSTtJQUNYLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7Q0FDZCxDQUFDO0FBRUYsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRCxJQUFJLFVBQVUsQ0FDVixNQUEyQixFQUMzQixNQUFNLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFDZCxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FDNUMsQ0FDSixDQUFDO0FBRUYsMEJBQTBCO0FBRTFCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQWlLRTtBQUdGLGlDQUFpQztBQUNqQyxTQUFTO0FBQ1QsK0JBQStCO0FBQy9CLCtHQUErRztBQUUvRyxtRkFBbUY7QUFDbkYsd0VBQXdFO0FBQ3hFLGlCQUFpQjtBQUVqQix3R0FBd0c7QUFFeEcsNkNBQTZDO0FBRTdDLHlJQUF5STtBQUV6SSxzQ0FBc0M7QUFFdEMsd0JBQXdCO0FBRXhCLHVCQUF1QjtBQUd2QixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5cbmltcG9ydCB7IFNjZW5lLCBTY2VuZUVsZW1lbnQgfSBmcm9tIFwiLi9zY2VuZS5qc1wiO1xuaW1wb3J0IHsgUm9vdExheW91dCwgU2Nyb2xsLCBCb3JkZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCJcbi8vaW1wb3J0IHsgUm9vdExheW91dCwgRmlsbCwgQm9yZGVyIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiXG5cbmNvbnN0IHNjZW5lIDogU2NlbmUgPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgZml4ZWRQaW5zOiBbWzAsIDUxMl0sIFsxMjgsIDUxMl0sIFsxOTIwLCA1MTJdLCBbMjA0OCwgNTEyXV0sXG4gICAgICAgIHN0YXJ0UGluczogW10sXG4gICAgICAgIGVkaXRQaW5zOiBbXSxcbiAgICAgICAgc3RhcnRCZWFtczogW10sXG4gICAgICAgIGVkaXRCZWFtczogW10sXG4gICAgICAgIGRpc2NzOiBbXSxcbiAgICAgICAgbWF0ZXJpYWxzOiBbXSxcbiAgICB9LFxuICAgIHRlcnJhaW46IHtcbiAgICAgICAgaG1hcDogWzUxMiwgNTEyLCA1NzYsIDY0MCwgNjcyLCA2ODgsIDY4OCwgNzY4LCA3NjgsIDc2OCwgNzY4LCA2ODgsIDY3MiwgNjQwLCA1NzYsIDUxMiwgNTEyXSxcbiAgICAgICAgZnJpY3Rpb246IDAuNSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICB9LFxuICAgIGhlaWdodDogMTAyNCxcbiAgICB3aWR0aDogMjA0OCxcbiAgICBnOiBbMCwgMTI4XSxcbn07XG5cbmNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpO1xubmV3IFJvb3RMYXlvdXQoXG4gICAgY2FudmFzIGFzIEhUTUxDYW52YXNFbGVtZW50LFxuICAgIEJvcmRlcigxNiwgXCJibGFja1wiLFxuICAgICAgICBTY3JvbGwoU2NlbmVFbGVtZW50KHNjZW5lKSwgdW5kZWZpbmVkLCAyKSxcbiAgICApXG4pO1xuXG4vLyBUT0RPOiBUZXN0IGNyZWRlbnRpYWxzLlxuXG4vKlxuaW1wb3J0IHsgVmlld3BvcnQsIFZpZXdwb3J0UG9zaXRpb24sIFBhbkdlc3R1cmUsIFBpbmNoWm9vbUdlc3R1cmUgfSBmcm9tIFwiLi92aWV3cG9ydC5qc1wiXG5pbXBvcnQgeyBUb3VjaERlbXV4IH0gZnJvbSBcIi4vdG91Y2guanNcIlxuaW1wb3J0IHsgR2VzdHVyZXN9IGZyb20gXCIuL2dlc3R1cmUuanNcIlxuaW1wb3J0IHsgc2NlbmVNZXRob2QsIHNjZW5lUmVuZGVyZXIsIFNjZW5lIH0gZnJvbSBcIi4vc2NlbmUuanNcIjtcblxuY29uc3QgYyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCk7XG5pZiAoYyA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGNhbnZhcyBlbGVtZW50XCIpO1xufVxuY29uc3QgY3R4ID0gYy5nZXRDb250ZXh0KFwiMmRcIik7XG5pZiAoY3R4ID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gMmQgY29udGV4dFwiKTtcbn1cblxuY29uc3Qgc2NlbmU6IFNjZW5lID0ge1xuICAgIHRydXNzOiB7XG4gICAgICAgIHBpbnM6IFtcbiAgICAgICAgICAgIFsgNS4wLCA0Mi41XSwgICAgLy8gMC03IFRyYWluXG4gICAgICAgICAgICBbMTAuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMTUuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMjAuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMjUuMCwgNDIuNV0sXG4gICAgICAgICAgICBbMTAuMCwgNDUuMF0sXG4gICAgICAgICAgICBbMTUuMCwgNDUuMF0sXG4gICAgICAgICAgICBbMjAuMCwgNDUuMF0sXG4gICAgICAgICAgICBbNDAuMCwgNTAuMF0sICAgLy8gOC0xNSBCcmlkZ2VcbiAgICAgICAgICAgIFs1MC4wLCA1MC4wXSxcbiAgICAgICAgICAgIFs2MC4wLCA1MC4wXSxcbiAgICAgICAgICAgIFs0MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFs1MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFs2MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFszMC4wLCA0MC4wXSwgICAvLyAxNCBCcmlkZ2UgYW5jaG9yXG4gICAgICAgICAgICBbNzAuMCwgNDAuMF0sXG4gICAgICAgICAgICBbIDAuMCwgNDAuMF0sICAgLy8gcm9hZFxuICAgICAgICAgICAgWzEwMC4wLCA0MC4wXSxcbiAgICAgICAgXSxcbiAgICAgICAgbW9iaWxlUGluczogMTQsXG4gICAgICAgIGJlYW1zOiBbXG4gICAgICAgICAgICB7IHAxOiAwLCBwMjogMSwgbTogMCwgdzogMC4xIH0sIC8vIFRyYWluXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogMywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAzLCBwMjogNCwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogNSwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogNiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAzLCBwMjogNywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAwLCBwMjogNSwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA1LCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogNiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA2LCBwMjogMywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiAyLCBwMjogNywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA3LCBwMjogNCwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogMTQsIG06IDAsIHc6IDEuMCB9LCAvLyBCcmlkZ2VcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxMSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiA4LCBwMjogMTIsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogOCwgcDI6IDksIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogOSwgcDI6IDEyLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogOSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxMCwgcDI6IDEyLCBtOiAwLCB3OiAxLjAgfSxcbiAgICAgICAgICAgIHsgcDE6IDEwLCBwMjogMTMsIG06IDAsIHc6IDEuMCB9LFxuICAgICAgICAgICAgeyBwMTogMTAsIHAyOiAxNSwgbTogMCwgdzogMS4wIH0sXG4gICAgICAgICAgICB7IHAxOiAxNCwgcDI6IDExLCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSwgICAvLyBEZWNrXG4gICAgICAgICAgICB7IHAxOiAxMSwgcDI6IDEyLCBtOiAwLCB3OiAxLjAsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDEyLCBwMjogMTMsIG06IDAsIHc6IDEuMCwgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMTMsIHAyOiAxNSwgbTogMCwgdzogMS4wLCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxNiwgcDI6IDE0LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSwgICAvLyBSb2FkXG4gICAgICAgICAgICB7IHAxOiAxNSwgcDI6IDE3LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgXSxcbiAgICAgICAgZGlzY3M6IFtcbiAgICAgICAgICAgIHsgcDogMCwgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDEsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICAgICAgeyBwOiAyLCByOiAyLjUsIG06IDAsIHY6IDEwLjAgfSxcbiAgICAgICAgICAgIHsgcDogMywgcjogMi41LCBtOiAwLCB2OiAxMC4wIH0sXG4gICAgICAgICAgICB7IHA6IDQsIHI6IDIuNSwgbTogMCwgdjogMTAuMCB9LFxuICAgICAgICBdLFxuICAgICAgICBtYXRlcmlhbHM6IFtcbiAgICAgICAgICAgIHsgICAvLyBSdWJiZXIuXG4gICAgICAgICAgICAgICAgRTogNzAwMDAwMDAuMCxcbiAgICAgICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgICAgIGRlbnNpdHk6IDEyMDAuMCxcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC45LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICB9LFxuICAgIHRlcnJhaW46IHtcbiAgICAgICAgaG1hcDogW1xuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICBdLFxuICAgICAgICBzdHlsZTogXCJkYXJrZ3JleVwiLFxuICAgICAgICBwaXRjaDogNS4wLFxuICAgICAgICBmcmljdGlvbjogMC41LFxuICAgIH0sXG4gICAgaGVpZ2h0OiAxMDAuMCxcbiAgICBnOiBbMC4wLCAtOS44XSxcbn07XG5cbmNvbnN0IG9kZSA9IHNjZW5lTWV0aG9kKHNjZW5lKTtcbmNvbnN0IHJlbmRlciA9IHNjZW5lUmVuZGVyZXIoc2NlbmUpO1xuXG5jb25zdCB2cCA9IG5ldyBWaWV3cG9ydChjdHgsIChfYiwgX3MsIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSA9PiB7XG4gICAgcmVuZGVyKGN0eCwgb2RlKTtcbn0pO1xuXG5mdW5jdGlvbiBjbGlwKHY6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHYpKTtcbn1cblxudnAuc2V0Q2xpcFBvc2l0aW9uKChwOiBWaWV3cG9ydFBvc2l0aW9uKTogVmlld3BvcnRQb3NpdGlvbiA9PiB7XG4gICAgcC5zY2FsZSA9IGNsaXAocC5zY2FsZSwgMTAuMCwgMTAwMC4wKTtcbiAgICBwLnBvc1swXSA9IGNsaXAocC5wb3NbMF0sIDAsIHNjZW5lLnRlcnJhaW4ucGl0Y2ggKiAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpKTtcbiAgICBwLnBvc1sxXSA9IGNsaXAocC5wb3NbMV0sIDAsIHNjZW5lLmhlaWdodCk7XG4gICAgcC5yb3RhdGUgPSAwLjA7XG4gICAgcmV0dXJuIHA7XG59KTtcblxudnAuc2V0UG9zaXRpb24oeyBwb3M6IFs1MCwgNTBdfSk7XG5cbmNvbnN0IGggPSAwLjAwMTtcbnJlcXVlc3RBbmltYXRpb25GcmFtZSgodDA6IERPTUhpZ2hSZXNUaW1lU3RhbXApID0+IHtcbiAgICBmdW5jdGlvbiBtYWluTG9vcCh0OiBET01IaWdoUmVzVGltZVN0YW1wKSB7XG4gICAgICAgIC8vIENvbXB1dGUgdXAgdG8gMjUwbXMgd29ydGggb2YgZnJhbWVzIGF0IGEgdGltZS5cbiAgICAgICAgY29uc3QgZHQgPSBNYXRoLm1pbih0IC0gdDAsIDI1MC4wKTtcbiAgICAgICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihkdCAvICgxMDAwLjAgKiBoKSk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJhbWVzOyBpKyspIHtcbiAgICAgICAgICAgIG9kZS5uZXh0KGgpO1xuICAgICAgICB9XG4gICAgICAgIHZwLnJlcXVlc3RSZWRyYXcoKTtcbiAgICAgICAgLy8gT25seSBsZXQgdGhlIHBoeXNpY3MgYmFja2xvZyBnZXQgdG8gMjUwbXMuXG4gICAgICAgIHQwID0gTWF0aC5tYXgodDAgKyBmcmFtZXMgKiBoICogMTAwMC4wLCB0IC0gMjUwLjApO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xuICAgIH1cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xufSk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHZwLnJlc2l6ZSk7XG5cbmNvbnN0IHRvdWNoID0gbmV3IFRvdWNoRGVtdXgoYyk7XG5jb25zdCBnZXN0dXJlID0gbmV3IEdlc3R1cmVzKCk7XG50b3VjaC5hZGRUb3VjaEhhbmRsZXIoZ2VzdHVyZSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQYW5HZXN0dXJlKHZwKSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQaW5jaFpvb21HZXN0dXJlKHZwKSk7XG4qL1xuXG5cbi8vIFRPRE86IG1vdXNlIGFuZCB0cmFja3BhZCBpbnB1dFxuLy8gc2Nyb2xsXG4vLyBzY3JvbGwgd2hlZWwgem9vbSBpbiBhbmQgb3V0XG4vLyB3aGF0IHRvIHJvdGF0ZT8gcmlnaHQgY2xpY2sgZHJhZywgcm90YXRlIGFyb3VuZCBjZW50ZXIgb2YgdnA/IE1heWJlIGRvbid0IGNhcmUsIHNpbmNlIGJyaWRnZSB3b250IHVzZSByb3RhdGVcblxuLy8gVE9ETzogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvcmVxdWVzdEZ1bGxzY3JlZW5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9GdWxsc2NyZWVuX0FQSS9HdWlkZVxuLy8gTG9vayBpbnRvIHRoaXNcblxuLy8gVE9ETzogcmV3cml0ZSB2aWV3cG9ydCBldGMuIHRvIG5vdCB0YWtlIGNhbGxiYWNrcywganVzdCBjYWxsIGludG8gaXQgdG8gZXhwbGNpdGx5IHNldCB1cCBjYW52YXMsIGV0Yy5cblxuLy8gVE9ETzogUGh5c2ljcyBjYWxjdWxhdGlvbiBpbiBhIHdlYi13b3JrZXIuXG5cbi8vIFRPRE86IEFpciByZXNpc3RhbmNlLCBvciBhdCBsZWFzdCBkYW1waW5nIG9mIHBpbiBtb3ZlbWVudCwgbm90IGp1c3QgYmVhbSBzcHJpbmcgZm9yY2VzLiBLZWVwIGJlYW0gZGFtcGluZywgdGhpcyBzaG91bGQgYmUgaW5kZXBlbmRlbnQuXG5cbi8vIFRPRE86IEJlYW1zIGZhaWwgYWZ0ZXIgc29tZSBzdHJlc3MuXG5cbi8vIFRPRE86IFdvcmsgaGFyZGVuaW5nLlxuXG4vLyBUT0RPOiBCZWFtIGJ1Y2tsaW5nLlxuXG5cbmNvbnNvbGUubG9nKFwic3R1ZmYgbG9hZGVkXCIpO1xuIl19