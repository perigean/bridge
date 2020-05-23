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
//     0 - 1 - 2
//   / | \ | / | \
// 6 - 3 - 4 - 5 - 7
const scene = {
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
            {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUUvQixPQUFPLEVBQUUsUUFBUSxFQUFvQixVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUE7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQTtBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFDLE1BQU0sY0FBYyxDQUFBO0FBQ3RDLE9BQU8sRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFTLE1BQU0sWUFBWSxDQUFDO0FBRS9ELE1BQU0sQ0FBQyxHQUFJLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUF1QixDQUFDO0FBQ25FLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztDQUN4QztBQUNELE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFO0lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztDQUNwQztBQUVELGdCQUFnQjtBQUNoQixrQkFBa0I7QUFDbEIsb0JBQW9CO0FBRXBCLE1BQU0sS0FBSyxHQUFVO0lBQ2pCLEtBQUssRUFBRTtRQUNILElBQUksRUFBRTtZQUNGLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztTQUNmO1FBQ0QsVUFBVSxFQUFFLENBQUM7UUFDYixLQUFLLEVBQUU7WUFDSCxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7WUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtZQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxF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QUFDVCwrQkFBK0I7QUFDL0IsK0dBQStHO0FBRS9HLG1EQUFtRDtBQUNuRCxvREFBb0Q7QUFFcEQsNkVBQTZFO0FBQzdFLCtGQUErRjtBQUUvRix3REFBd0Q7QUFFeEQsd0dBQXdHO0FBRXhHLDZDQUE2QztBQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5pbXBvcnQgeyBWaWV3cG9ydCwgVmlld3BvcnRQb3NpdGlvbiwgUGFuR2VzdHVyZSwgUGluY2hab29tR2VzdHVyZSB9IGZyb20gXCIuL3ZpZXdwb3J0LmpzXCJcbmltcG9ydCB7IFRvdWNoRGVtdXggfSBmcm9tIFwiLi90b3VjaC5qc1wiXG5pbXBvcnQgeyBHZXN0dXJlc30gZnJvbSBcIi4vZ2VzdHVyZS5qc1wiXG5pbXBvcnQgeyBzY2VuZU1ldGhvZCwgc2NlbmVSZW5kZXJlciwgU2NlbmUgfSBmcm9tIFwiLi9zY2VuZS5qc1wiO1xuXG5jb25zdCBjID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50KTtcbmlmIChjID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gY2FudmFzIGVsZW1lbnRcIik7XG59XG5jb25zdCBjdHggPSBjLmdldENvbnRleHQoXCIyZFwiKTtcbmlmIChjdHggPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyAyZCBjb250ZXh0XCIpO1xufVxuXG4vLyAgICAgMCAtIDEgLSAyXG4vLyAgIC8gfCBcXCB8IC8gfCBcXFxuLy8gNiAtIDMgLSA0IC0gNSAtIDdcblxuY29uc3Qgc2NlbmU6IFNjZW5lID0ge1xuICAgIHRydXNzOiB7XG4gICAgICAgIHBpbnM6IFtcbiAgICAgICAgICAgIFszNS4wLCAzNS4wXSxcbiAgICAgICAgICAgIFs0MC4wLCAzNS4wXSxcbiAgICAgICAgICAgIFs0NS4wLCAzNS4wXSxcbiAgICAgICAgICAgIFszNS4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs0MC4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs0NS4wLCAzMC4wXSxcbiAgICAgICAgICAgIFszMC4wLCAzMC4wXSxcbiAgICAgICAgICAgIFs1MC4wLCAzMC4wXSxcbiAgICAgICAgXSxcbiAgICAgICAgbW9iaWxlUGluczogNyxcbiAgICAgICAgYmVhbXM6IFtcbiAgICAgICAgICAgIHsgcDE6IDAsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDEsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAxLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDcsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDYsIHAyOiAzLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDQsIHAyOiA1LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgICAgIHsgcDE6IDUsIHAyOiA3LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgXSxcbiAgICAgICAgbWF0ZXJpYWxzOiBbXG4gICAgICAgICAgICB7ICAgLy8gUnViYmVyLlxuICAgICAgICAgICAgICAgIEU6IDIwMDAwMDAwLjAsXG4gICAgICAgICAgICAgICAgc3R5bGU6IFwiYmxhY2tcIixcbiAgICAgICAgICAgICAgICBkZW5zaXR5OiAxMjAwLjAsXG4gICAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgIH0sXG4gICAgdGVycmFpbjoge1xuICAgICAgICBobWFwOiBbXG4gICAgICAgICAgICA0MC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgMjAuMCxcbiAgICAgICAgICAgIDIwLjAsXG4gICAgICAgICAgICAyMC4wLFxuICAgICAgICAgICAgNDAuMCxcbiAgICAgICAgXSxcbiAgICAgICAgc3R5bGU6IFwiZGFya2dyZXlcIixcbiAgICAgICAgcGl0Y2g6IDEwLjAsXG4gICAgfSxcbiAgICBoZWlnaHQ6IDEwMC4wLFxuICAgIGc6IFswLjAsIC05LjhdLFxufTtcblxuY29uc3Qgb2RlID0gc2NlbmVNZXRob2Qoc2NlbmUpO1xuY29uc3QgcmVuZGVyID0gc2NlbmVSZW5kZXJlcihzY2VuZSk7XG5cbmNvbnN0IHZwID0gbmV3IFZpZXdwb3J0KGN0eCwgKF9iLCBfcywgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpID0+IHtcbiAgICByZW5kZXIoY3R4LCBvZGUpO1xufSk7XG5cbmZ1bmN0aW9uIGNsaXAodjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdikpO1xufVxuXG52cC5zZXRDbGlwUG9zaXRpb24oKHA6IFZpZXdwb3J0UG9zaXRpb24pOiBWaWV3cG9ydFBvc2l0aW9uID0+IHtcbiAgICBwLnNjYWxlID0gY2xpcChwLnNjYWxlLCAxMC4wLCAxMDAwLjApO1xuICAgIHAucG9zWzBdID0gY2xpcChwLnBvc1swXSwgMCwgc2NlbmUudGVycmFpbi5waXRjaCAqIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSkpO1xuICAgIHAucG9zWzFdID0gY2xpcChwLnBvc1sxXSwgMCwgc2NlbmUuaGVpZ2h0KTtcbiAgICBwLnJvdGF0ZSA9IDAuMDtcbiAgICByZXR1cm4gcDtcbn0pO1xuXG52cC5zZXRQb3NpdGlvbih7IHBvczogWzUwLCA1MF19KTtcblxuXG5jb25zdCBoID0gMC4wMDE7XG5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKHQwOiBET01IaWdoUmVzVGltZVN0YW1wKSA9PiB7XG4gICAgZnVuY3Rpb24gbWFpbkxvb3AodDogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xuICAgICAgICAvLyBDb21wdXRlIHVwIHRvIDI1MG1zIHdvcnRoIG9mIGZyYW1lcyBhdCBhIHRpbWUuXG4gICAgICAgIGNvbnN0IGR0ID0gTWF0aC5taW4odCAtIHQwLCAyNTAuMCk7XG4gICAgICAgIGNvbnN0IGZyYW1lcyA9IE1hdGguZmxvb3IoZHQgLyAoMTAwMC4wICogaCkpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZyYW1lczsgaSsrKSB7XG4gICAgICAgICAgICBvZGUubmV4dChoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZyhmcmFtZXMpO1xuICAgICAgICB2cC5yZXF1ZXN0UmVkcmF3KCk7XG4gICAgICAgIC8vIE9ubHkgbGV0IHRoZSBwaHlzaWNzIGJhY2tsb2cgZ2V0IHRvIDI1MG1zLlxuICAgICAgICB0MCA9IE1hdGgubWF4KHQwICsgZnJhbWVzICogaCAqIDEwMDAuMCwgdCAtIDI1MC4wKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKG1haW5Mb29wKTtcbiAgICB9XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKG1haW5Mb29wKTtcbn0pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCB2cC5yZXNpemUpO1xuXG5jb25zdCB0b3VjaCA9IG5ldyBUb3VjaERlbXV4KGMpO1xuY29uc3QgZ2VzdHVyZSA9IG5ldyBHZXN0dXJlcygpO1xudG91Y2guYWRkVG91Y2hIYW5kbGVyKGdlc3R1cmUpO1xuZ2VzdHVyZS5hZGRHZXN0dXJlSGFuZGxlcihuZXcgUGFuR2VzdHVyZSh2cCkpO1xuZ2VzdHVyZS5hZGRHZXN0dXJlSGFuZGxlcihuZXcgUGluY2hab29tR2VzdHVyZSh2cCkpO1xuXG4vLyBUT0RPOiBtb3VzZSBhbmQgdHJhY2twYWQgaW5wdXRcbi8vIHNjcm9sbFxuLy8gc2Nyb2xsIHdoZWVsIHpvb20gaW4gYW5kIG91dFxuLy8gd2hhdCB0byByb3RhdGU/IHJpZ2h0IGNsaWNrIGRyYWcsIHJvdGF0ZSBhcm91bmQgY2VudGVyIG9mIHZwPyBNYXliZSBkb24ndCBjYXJlLCBzaW5jZSBicmlkZ2Ugd29udCB1c2Ugcm90YXRlXG5cbi8vIFRPRE86IHBpbnMgaW4gc2ltdWxhdGlvbiBhcmUgcmVwZWxsZWQgYnkgdGVycmFpblxuLy8gVE9ETzogcGlucyBpbiBzaW11bGF0aW9uIGhhdmUgZnJpY3Rpb24gb24gdGVycmFpblxuXG4vLyBUT0RPOiBkaXNjcy4gQXR0YWNoZWQgdG8gcGlucywgcmVwZWwgdGVycmFpbiBhdCBhIGRpc3RhbmNlICh3aXRoIGZyaWN0aW9uKVxuLy8gVE9ETzogZGlzY3MgY2FuIHJvdGF0ZSBhdCBhIGZpeGVkIHJhdGUuIFJvdGF0aW9uIG9ubHkgYXBwbGllcyB0byBmcmljdGlvbiBmb3JjZSBjYWxjdWxhdGlvbi5cblxuLy8gVE9ETzogZGVjayBiZWFtcy4gTGlrZSByZWd1bGFyIGJlYW1zLCBidXQgcmVwZWwgZGlzY3NcblxuLy8gVE9ETzogcmV3cml0ZSB2aWV3cG9ydCBldGMuIHRvIG5vdCB0YWtlIGNhbGxiYWNrcywganVzdCBjYWxsIGludG8gaXQgdG8gZXhwbGNpdGx5IHNldCB1cCBjYW52YXMsIGV0Yy5cblxuLy8gVE9ETzogUGh5c2ljcyBjYWxjdWxhdGlvbiBpbiBhIHdlYi13b3JrZXIuXG5jb25zb2xlLmxvZyhcInN0dWZmIGxvYWRlZFwiKTtcbiJdfQ==