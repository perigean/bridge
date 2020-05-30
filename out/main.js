// Copyright Charles Dueck 2020
import { Viewport, PanGesture, PinchZoomGesture } from "./viewport.js";
import { TouchDemux } from "./touch.js";
import { Gestures } from "./gesture.js";
import { sceneMethod, sceneRenderer } from "./scene.js";
const c = document.getElementById("canvas");
if (c === null) {
    throw new Error("No canvas element");
}
const ctx = c.getContext("2d");
if (ctx === null) {
    throw new Error("No 2d context");
}
/*
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
        mobilePins: 8,
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
            { p1: 6, p2: 3, m: 0, w: 0.1, deck: true },
            { p1: 3, p2: 4, m: 0, w: 0.1, deck: true },
            { p1: 4, p2: 5, m: 0, w: 0.1, deck: true },
            { p1: 5, p2: 7, m: 0, w: 0.1, deck: true },
        ],
        discs: [
        ],
        materials: [
            {   // Rubber.
                E: 20000000.0,
                style: "black",
                density: 1200.0,
                friction: 0.9,
            },
        ],
    },
    terrain: {
        hmap: [
            40.0,
            16.0,
            14.0,
            12.0,
            10.0,
            8.0,
            6.0,
            5.0,
            4.0,
            4.0,
            40.0,
        ],
        style: "darkgrey",
        pitch: 10.0,
        friction: 0.5,
    },
    height: 100.0,
    g: [0.0, -9.8],
};
*/
/*
//             0
//
// 6 - 1 - 2 - 3 - 4 - 5 - 7
const w = 1;
const scene: Scene = {
    truss: {
        pins: [
            [40.0, 40.0],
            [25.0, 27.5],
            [30.0, 25.0],
            [35.0, 22.5],
            [40.0, 20.0],
            [45.0, 22.5],
            [50.0, 25.0],
            [55.0, 27.5],
            [20.0, 30.0],
            [60.0, 30.0],
        ],
        mobilePins: 8,
        beams: [
            { p1: 8, p2: 1, m: 0, w: w, deck: true },
            { p1: 1, p2: 2, m: 0, w: w, deck: true },
            { p1: 2, p2: 3, m: 0, w: w, deck: true },
            { p1: 3, p2: 4, m: 0, w: w, deck: true },
            { p1: 4, p2: 5, m: 0, w: w, deck: true },
            { p1: 5, p2: 6, m: 0, w: w, deck: true },
            { p1: 6, p2: 7, m: 0, w: w, deck: true },
            { p1: 7, p2: 9, m: 0, w: w, deck: true },
        ],
        discs: [
            { p: 0, r: 2.5, m: 0 },
        ],
        materials: [
            {   // Rubber.
                E: 20000000.0,
                style: "black",
                density: 1200.0,
                friction: 0.9,
            },
        ],
    },
    terrain: {
        hmap: [
            40.0,
            16.0,
            14.0,
            12.0,
            10.0,
            8.0,
            6.0,
            5.0,
            4.0,
            4.0,
            40.0,
        ],
        style: "darkgrey",
        pitch: 10.0,
        friction: 0.5,
    },
    height: 100.0,
    g: [0.0, -9.8],
};
*/
//             0
//
// 1 ---------------------- 2
const w = 1;
const scene = {
    truss: {
        pins: [
            [40.0, 40.0],
            [20.0, 30.0],
            [60.0, 25.0],
        ],
        mobilePins: 1,
        beams: [
            { p1: 1, p2: 2, m: 0, w: w, deck: true },
        ],
        discs: [
            { p: 0, r: 2.5, m: 0, v: -1.0 },
        ],
        materials: [
            {
                E: 20000000.0,
                style: "black",
                density: 1200.0,
                friction: 0.9,
            },
        ],
    },
    terrain: {
        hmap: [
            40.0,
            16.0,
            14.0,
            12.0,
            10.0,
            8.0,
            6.0,
            5.0,
            4.0,
            4.0,
            40.0,
        ],
        style: "darkgrey",
        pitch: 10.0,
        friction: 0.5,
    },
    height: 100.0,
    g: [0.0, -9.8],
};
const ode = sceneMethod(scene);
const render = sceneRenderer(scene);
const vp = new Viewport(ctx, (_b, _s, ctx) => {
    render(ctx, ode);
});
function clip(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
vp.setClipPosition((p) => {
    p.scale = clip(p.scale, 10.0, 1000.0);
    p.pos[0] = clip(p.pos[0], 0, scene.terrain.pitch * (scene.terrain.hmap.length - 1));
    p.pos[1] = clip(p.pos[1], 0, scene.height);
    p.rotate = 0.0;
    return p;
});
vp.setPosition({ pos: [50, 50] });
const h = 0.001;
requestAnimationFrame((t0) => {
    function mainLoop(t) {
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
// TODO: mouse and trackpad input
// scroll
// scroll wheel zoom in and out
// what to rotate? right click drag, rotate around center of vp? Maybe don't care, since bridge wont use rotate
// TODO: https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
// https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide
// Look into this
// TODO: discs have friction
// TODO: discs can rotate at a fixed rate. Rotation only applies to friction force calculation.
// TODO: rewrite viewport etc. to not take callbacks, just call into it to explcitly set up canvas, etc.
// TODO: Physics calculation in a web-worker.
// TODO: Air resistance, or at least damping of pin movement, not just beam spring forces. Keep beam damping, this should be independent.
// TODO: Beams fail after some stress.
// TODO: Work hardening.
// TODO: Beam buckling.
console.log("stuff loaded");
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUUvQixPQUFPLEVBQUUsUUFBUSxFQUFvQixVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUE7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQTtBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFDLE1BQU0sY0FBYyxDQUFBO0FBQ3RDLE9BQU8sRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFTLE1BQU0sWUFBWSxDQUFDO0FBRS9ELE1BQU0sQ0FBQyxHQUFJLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUF1QixDQUFDO0FBQ25FLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztDQUN4QztBQUNELE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFO0lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztDQUNwQztBQUNEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQWlFRTtBQUNGOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUErREU7QUFFRixnQkFBZ0I7QUFDaEIsRUFBRTtBQUNGLDZCQUE2QjtBQUM3QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDWixNQUFNLEtBQUssR0FBVTtJQUNqQixLQUFLLEVBQUU7UUFDSCxJQUFJLEVBQUU7WUFDRixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7WUFDWixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7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LG1GQUFtRjtBQUNuRix3RUFBd0U7QUFDeEUsaUJBQWlCO0FBRWpCLDRCQUE0QjtBQUM1QiwrRkFBK0Y7QUFFL0Ysd0dBQXdHO0FBRXhHLDZDQUE2QztBQUU3Qyx5SUFBeUk7QUFFekksc0NBQXNDO0FBRXRDLHdCQUF3QjtBQUV4Qix1QkFBdUI7QUFHdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgVmlld3BvcnQsIFZpZXdwb3J0UG9zaXRpb24sIFBhbkdlc3R1cmUsIFBpbmNoWm9vbUdlc3R1cmUgfSBmcm9tIFwiLi92aWV3cG9ydC5qc1wiXG5pbXBvcnQgeyBUb3VjaERlbXV4IH0gZnJvbSBcIi4vdG91Y2guanNcIlxuaW1wb3J0IHsgR2VzdHVyZXN9IGZyb20gXCIuL2dlc3R1cmUuanNcIlxuaW1wb3J0IHsgc2NlbmVNZXRob2QsIHNjZW5lUmVuZGVyZXIsIFNjZW5lIH0gZnJvbSBcIi4vc2NlbmUuanNcIjtcblxuY29uc3QgYyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCk7XG5pZiAoYyA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGNhbnZhcyBlbGVtZW50XCIpO1xufVxuY29uc3QgY3R4ID0gYy5nZXRDb250ZXh0KFwiMmRcIik7XG5pZiAoY3R4ID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gMmQgY29udGV4dFwiKTtcbn1cbi8qXG4vLyAgICAgMCAtIDEgLSAyXG4vLyAgIC8gfCBcXCB8IC8gfCBcXFxuLy8gNiAtIDMgLSA0IC0gNSAtIDdcblxuY29uc3Qgc2NlbmU6IFNjZW5lID0ge1xuICAgIHRydXNzOiB7XG4gICAgICAgIHBpbnM6IFtcbiAgICAgICAgICAgIFszNS4wLCAzNS4wXSxcbiAgICAgICAgICAgIFs0MC4wLCAzNS4wXSxcbiAgICAgICAgICAgIFs0NS4wLCAzNS4wXSxcbiAgICAgICAgICAgIFszNS4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs0MC4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs0NS4wLCAzMC4wXSxcbiAgICAgICAgICAgIFszMC4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs1MC4wLCAzMC4wXSxcbiAgICAgICAgXSxcbiAgICAgICAgbW9iaWxlUGluczogOCxcbiAgICAgICAgYmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDcsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAzLCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiA1LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiA3LCBtOiAwLCB3OiAwLjEsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgXSxcbiAgICAgICAgZGlzY3M6IFtcbiAgICAgICAgXSxcbiAgICAgICAgbWF0ZXJpYWxzOiBbXG4gICAgICAgICAgICB7ICAgLy8gUnViYmVyLlxuICAgICAgICAgICAgICAgIEU6IDIwMDAwMDAwLjAsXG4gICAgICAgICAgICAgICAgc3R5bGU6IFwiYmxhY2tcIixcbiAgICAgICAgICAgICAgICBkZW5zaXR5OiAxMjAwLjAsXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuOSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgfSxcbiAgICB0ZXJyYWluOiB7XG4gICAgICAgIGhtYXA6IFtcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICAxNi4wLFxuICAgICAgICAgICAgMTQuMCxcbiAgICAgICAgICAgIDEyLjAsXG4gICAgICAgICAgICAxMC4wLFxuICAgICAgICAgICAgOC4wLFxuICAgICAgICAgICAgNi4wLFxuICAgICAgICAgICAgNS4wLFxuICAgICAgICAgICAgNC4wLFxuICAgICAgICAgICAgNC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgXSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICAgICAgcGl0Y2g6IDEwLjAsXG4gICAgICAgIGZyaWN0aW9uOiAwLjUsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEwMC4wLFxuICAgIGc6IFswLjAsIC05LjhdLFxufTtcbiovXG4vKlxuLy8gICAgICAgICAgICAgMFxuLy9cbi8vIDYgLSAxIC0gMiAtIDMgLSA0IC0gNSAtIDdcbmNvbnN0IHcgPSAxO1xuY29uc3Qgc2NlbmU6IFNjZW5lID0ge1xuICAgIHRydXNzOiB7XG4gICAgICAgIHBpbnM6IFtcbiAgICAgICAgICAgIFs0MC4wLCA0MC4wXSxcbiAgICAgICAgICAgIFsyNS4wLCAyNy41XSxcbiAgICAgICAgICAgIFszMC4wLCAyNS4wXSxcbiAgICAgICAgICAgIFszNS4wLCAyMi41XSxcbiAgICAgICAgICAgIFs0MC4wLCAyMC4wXSxcbiAgICAgICAgICAgIFs0NS4wLCAyMi41XSxcbiAgICAgICAgICAgIFs1MC4wLCAyNS4wXSxcbiAgICAgICAgICAgIFs1NS4wLCAyNy41XSxcbiAgICAgICAgICAgIFsyMC4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs2MC4wLCAzMC4wXSxcbiAgICAgICAgXSxcbiAgICAgICAgbW9iaWxlUGluczogOCxcbiAgICAgICAgYmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IDgsIHAyOiAxLCBtOiAwLCB3OiB3LCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiAxLCBwMjogMiwgbTogMCwgdzogdywgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogMiwgcDI6IDMsIG06IDAsIHc6IHcsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiB3LCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiA0LCBwMjogNSwgbTogMCwgdzogdywgZGVjazogdHJ1ZSB9LFxuICAgICAgICAgICAgeyBwMTogNSwgcDI6IDYsIG06IDAsIHc6IHcsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiA3LCBtOiAwLCB3OiB3LCBkZWNrOiB0cnVlIH0sXG4gICAgICAgICAgICB7IHAxOiA3LCBwMjogOSwgbTogMCwgdzogdywgZGVjazogdHJ1ZSB9LFxuICAgICAgICBdLFxuICAgICAgICBkaXNjczogW1xuICAgICAgICAgICAgeyBwOiAwLCByOiAyLjUsIG06IDAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgbWF0ZXJpYWxzOiBbXG4gICAgICAgICAgICB7ICAgLy8gUnViYmVyLlxuICAgICAgICAgICAgICAgIEU6IDIwMDAwMDAwLjAsXG4gICAgICAgICAgICAgICAgc3R5bGU6IFwiYmxhY2tcIixcbiAgICAgICAgICAgICAgICBkZW5zaXR5OiAxMjAwLjAsXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuOSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgfSxcbiAgICB0ZXJyYWluOiB7XG4gICAgICAgIGhtYXA6IFtcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgICAgICAxNi4wLFxuICAgICAgICAgICAgMTQuMCxcbiAgICAgICAgICAgIDEyLjAsXG4gICAgICAgICAgICAxMC4wLFxuICAgICAgICAgICAgOC4wLFxuICAgICAgICAgICAgNi4wLFxuICAgICAgICAgICAgNS4wLFxuICAgICAgICAgICAgNC4wLFxuICAgICAgICAgICAgNC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgXSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICAgICAgcGl0Y2g6IDEwLjAsXG4gICAgICAgIGZyaWN0aW9uOiAwLjUsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEwMC4wLFxuICAgIGc6IFswLjAsIC05LjhdLFxufTtcbiovXG5cbi8vICAgICAgICAgICAgIDBcbi8vXG4vLyAxIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gMlxuY29uc3QgdyA9IDE7XG5jb25zdCBzY2VuZTogU2NlbmUgPSB7XG4gICAgdHJ1c3M6IHtcbiAgICAgICAgcGluczogW1xuICAgICAgICAgICAgWzQwLjAsIDQwLjBdLFxuICAgICAgICAgICAgWzIwLjAsIDMwLjBdLFxuICAgICAgICAgICAgWzYwLjAsIDI1LjBdLFxuICAgICAgICBdLFxuICAgICAgICBtb2JpbGVQaW5zOiAxLFxuICAgICAgICBiZWFtczogW1xuICAgICAgICAgICAgeyBwMTogMSwgcDI6IDIsIG06IDAsIHc6IHcsIGRlY2s6IHRydWUgfSxcbiAgICAgICAgXSxcbiAgICAgICAgZGlzY3M6IFtcbiAgICAgICAgICAgIHsgcDogMCwgcjogMi41LCBtOiAwLCB2OiAtMS4wIH0sXG4gICAgICAgIF0sXG4gICAgICAgIG1hdGVyaWFsczogW1xuICAgICAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgICAgICBFOiAyMDAwMDAwMC4wLFxuICAgICAgICAgICAgICAgIHN0eWxlOiBcImJsYWNrXCIsXG4gICAgICAgICAgICAgICAgZGVuc2l0eTogMTIwMC4wLFxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjksXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgIH0sXG4gICAgdGVycmFpbjoge1xuICAgICAgICBobWFwOiBbXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgMTYuMCxcbiAgICAgICAgICAgIDE0LjAsXG4gICAgICAgICAgICAxMi4wLFxuICAgICAgICAgICAgMTAuMCxcbiAgICAgICAgICAgIDguMCxcbiAgICAgICAgICAgIDYuMCxcbiAgICAgICAgICAgIDUuMCxcbiAgICAgICAgICAgIDQuMCxcbiAgICAgICAgICAgIDQuMCxcbiAgICAgICAgICAgIDQwLjAsXG4gICAgICAgIF0sXG4gICAgICAgIHN0eWxlOiBcImRhcmtncmV5XCIsXG4gICAgICAgIHBpdGNoOiAxMC4wLFxuICAgICAgICBmcmljdGlvbjogMC41LFxuICAgIH0sXG4gICAgaGVpZ2h0OiAxMDAuMCxcbiAgICBnOiBbMC4wLCAtOS44XSxcbn07XG5cbmNvbnN0IG9kZSA9IHNjZW5lTWV0aG9kKHNjZW5lKTtcbmNvbnN0IHJlbmRlciA9IHNjZW5lUmVuZGVyZXIoc2NlbmUpO1xuXG5jb25zdCB2cCA9IG5ldyBWaWV3cG9ydChjdHgsIChfYiwgX3MsIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSA9PiB7XG4gICAgcmVuZGVyKGN0eCwgb2RlKTtcbn0pO1xuXG5mdW5jdGlvbiBjbGlwKHY6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHYpKTtcbn1cblxudnAuc2V0Q2xpcFBvc2l0aW9uKChwOiBWaWV3cG9ydFBvc2l0aW9uKTogVmlld3BvcnRQb3NpdGlvbiA9PiB7XG4gICAgcC5zY2FsZSA9IGNsaXAocC5zY2FsZSwgMTAuMCwgMTAwMC4wKTtcbiAgICBwLnBvc1swXSA9IGNsaXAocC5wb3NbMF0sIDAsIHNjZW5lLnRlcnJhaW4ucGl0Y2ggKiAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpKTtcbiAgICBwLnBvc1sxXSA9IGNsaXAocC5wb3NbMV0sIDAsIHNjZW5lLmhlaWdodCk7XG4gICAgcC5yb3RhdGUgPSAwLjA7XG4gICAgcmV0dXJuIHA7XG59KTtcblxudnAuc2V0UG9zaXRpb24oeyBwb3M6IFs1MCwgNTBdfSk7XG5cbmNvbnN0IGggPSAwLjAwMTtcbnJlcXVlc3RBbmltYXRpb25GcmFtZSgodDA6IERPTUhpZ2hSZXNUaW1lU3RhbXApID0+IHtcbiAgICBmdW5jdGlvbiBtYWluTG9vcCh0OiBET01IaWdoUmVzVGltZVN0YW1wKSB7XG4gICAgICAgIC8vIENvbXB1dGUgdXAgdG8gMjUwbXMgd29ydGggb2YgZnJhbWVzIGF0IGEgdGltZS5cbiAgICAgICAgY29uc3QgZHQgPSBNYXRoLm1pbih0IC0gdDAsIDI1MC4wKTtcbiAgICAgICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihkdCAvICgxMDAwLjAgKiBoKSk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZnJhbWVzOyBpKyspIHtcbiAgICAgICAgICAgIG9kZS5uZXh0KGgpO1xuICAgICAgICB9XG4gICAgICAgIHZwLnJlcXVlc3RSZWRyYXcoKTtcbiAgICAgICAgLy8gT25seSBsZXQgdGhlIHBoeXNpY3MgYmFja2xvZyBnZXQgdG8gMjUwbXMuXG4gICAgICAgIHQwID0gTWF0aC5tYXgodDAgKyBmcmFtZXMgKiBoICogMTAwMC4wLCB0IC0gMjUwLjApO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xuICAgIH1cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xufSk7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIHZwLnJlc2l6ZSk7XG5cbmNvbnN0IHRvdWNoID0gbmV3IFRvdWNoRGVtdXgoYyk7XG5jb25zdCBnZXN0dXJlID0gbmV3IEdlc3R1cmVzKCk7XG50b3VjaC5hZGRUb3VjaEhhbmRsZXIoZ2VzdHVyZSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQYW5HZXN0dXJlKHZwKSk7XG5nZXN0dXJlLmFkZEdlc3R1cmVIYW5kbGVyKG5ldyBQaW5jaFpvb21HZXN0dXJlKHZwKSk7XG5cbi8vIFRPRE86IG1vdXNlIGFuZCB0cmFja3BhZCBpbnB1dFxuLy8gc2Nyb2xsXG4vLyBzY3JvbGwgd2hlZWwgem9vbSBpbiBhbmQgb3V0XG4vLyB3aGF0IHRvIHJvdGF0ZT8gcmlnaHQgY2xpY2sgZHJhZywgcm90YXRlIGFyb3VuZCBjZW50ZXIgb2YgdnA/IE1heWJlIGRvbid0IGNhcmUsIHNpbmNlIGJyaWRnZSB3b250IHVzZSByb3RhdGVcblxuLy8gVE9ETzogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvcmVxdWVzdEZ1bGxzY3JlZW5cbi8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9GdWxsc2NyZWVuX0FQSS9HdWlkZVxuLy8gTG9vayBpbnRvIHRoaXNcblxuLy8gVE9ETzogZGlzY3MgaGF2ZSBmcmljdGlvblxuLy8gVE9ETzogZGlzY3MgY2FuIHJvdGF0ZSBhdCBhIGZpeGVkIHJhdGUuIFJvdGF0aW9uIG9ubHkgYXBwbGllcyB0byBmcmljdGlvbiBmb3JjZSBjYWxjdWxhdGlvbi5cblxuLy8gVE9ETzogcmV3cml0ZSB2aWV3cG9ydCBldGMuIHRvIG5vdCB0YWtlIGNhbGxiYWNrcywganVzdCBjYWxsIGludG8gaXQgdG8gZXhwbGNpdGx5IHNldCB1cCBjYW52YXMsIGV0Yy5cblxuLy8gVE9ETzogUGh5c2ljcyBjYWxjdWxhdGlvbiBpbiBhIHdlYi13b3JrZXIuXG5cbi8vIFRPRE86IEFpciByZXNpc3RhbmNlLCBvciBhdCBsZWFzdCBkYW1waW5nIG9mIHBpbiBtb3ZlbWVudCwgbm90IGp1c3QgYmVhbSBzcHJpbmcgZm9yY2VzLiBLZWVwIGJlYW0gZGFtcGluZywgdGhpcyBzaG91bGQgYmUgaW5kZXBlbmRlbnQuXG5cbi8vIFRPRE86IEJlYW1zIGZhaWwgYWZ0ZXIgc29tZSBzdHJlc3MuXG5cbi8vIFRPRE86IFdvcmsgaGFyZGVuaW5nLlxuXG4vLyBUT0RPOiBCZWFtIGJ1Y2tsaW5nLlxuXG5cbmNvbnNvbGUubG9nKFwic3R1ZmYgbG9hZGVkXCIpO1xuIl19