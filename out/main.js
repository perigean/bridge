// Copyright Charles Dueck 2020
import { Viewport, PanGesture, PinchZoomGesture } from "./viewport.js";
import { TouchDemux } from "./touch.js";
import { Gestures } from "./gesture.js";
import { trussMethod, trussRenderer } from "./truss.js";
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
const truss = {
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
        {
            E: 20000000.0,
            style: "black",
            density: 1200.0,
        },
    ],
    g: [0.0, -9.8],
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
const vp = new Viewport(ctx, (_b, _s, ctx) => {
    render(ctx, ode);
});
function mainLoop(_now) {
    for (let i = 0; i < 10; i++) {
        ode.next(0.016666666); // 600fps.
    }
    vp.requestRedraw();
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);
function clip(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
vp.setClipPosition((p) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLCtCQUErQjtBQUUvQixPQUFPLEVBQUUsUUFBUSxFQUFvQixVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUE7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLFlBQVksQ0FBQTtBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFDLE1BQU0sY0FBYyxDQUFBO0FBQ3RDLE9BQU8sRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFTLE1BQU0sWUFBWSxDQUFDO0FBRS9ELE1BQU0sQ0FBQyxHQUFJLFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUF1QixDQUFDO0FBQ25FLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNaLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztDQUN4QztBQUNELE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDL0IsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFO0lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQztDQUNwQztBQUVELGdCQUFnQjtBQUNoQixrQkFBa0I7QUFDbEIsb0JBQW9CO0FBRXBCLE1BQU0sS0FBSyxHQUFVO0lBQ2pCLElBQUksRUFBRTtRQUNGLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ1gsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ1YsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ1YsQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDWCxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDVixDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQztLQUNkO0lBQ0QsVUFBVSxFQUFFLENBQUM7SUFDYixLQUFLLEVBQUU7UUFDSCxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7UUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7UUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7UUFDOUIsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQzlCLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRTtRQUM5QixFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxF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LENBQUMsSUFBSSxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM5QyxPQUFPLENBQUMsaUJBQWlCLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBRXBELGlDQUFpQztBQUNqQyxTQUFTO0FBQ1QsK0JBQStCO0FBQy9CLCtHQUErRztBQUUvRyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5pbXBvcnQgeyBWaWV3cG9ydCwgVmlld3BvcnRQb3NpdGlvbiwgUGFuR2VzdHVyZSwgUGluY2hab29tR2VzdHVyZSB9IGZyb20gXCIuL3ZpZXdwb3J0LmpzXCJcbmltcG9ydCB7IFRvdWNoRGVtdXggfSBmcm9tIFwiLi90b3VjaC5qc1wiXG5pbXBvcnQgeyBHZXN0dXJlc30gZnJvbSBcIi4vZ2VzdHVyZS5qc1wiXG5pbXBvcnQgeyB0cnVzc01ldGhvZCwgdHJ1c3NSZW5kZXJlciwgVHJ1c3MgfSBmcm9tIFwiLi90cnVzcy5qc1wiO1xuXG5jb25zdCBjID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50KTtcbmlmIChjID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gY2FudmFzIGVsZW1lbnRcIik7XG59XG5jb25zdCBjdHggPSBjLmdldENvbnRleHQoXCIyZFwiKTtcbmlmIChjdHggPT09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyAyZCBjb250ZXh0XCIpO1xufVxuXG4vLyAgICAgMCAtIDEgLSAyXG4vLyAgIC8gfCBcXCB8IC8gfCBcXFxuLy8gNiAtIDMgLSA0IC0gNSAtIDdcblxuY29uc3QgdHJ1c3M6IFRydXNzID0ge1xuICAgIHBpbnM6IFtcbiAgICAgICAgWy01LjAsIDUuMF0sXG4gICAgICAgIFswLjAsIDUuMF0sXG4gICAgICAgIFs1LjAsIDUuMF0sXG4gICAgICAgIFstNS4wLCAwLjBdLFxuICAgICAgICBbMC4wLCAwLjBdLFxuICAgICAgICBbNS4wLCAwLjBdLFxuICAgICAgICBbLTEwLjAsIDAuMF0sXG4gICAgICAgIFsxMC4wLCAwLjBdLFxuICAgIF0sXG4gICAgbW9iaWxlUGluczogNixcbiAgICBiZWFtczogW1xuICAgICAgICB7IHAxOiAwLCBwMjogMSwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgIHsgcDE6IDEsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgeyBwMTogNiwgcDI6IDAsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICB7IHAxOiAzLCBwMjogMCwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgIHsgcDE6IDQsIHAyOiAwLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgeyBwMTogNCwgcDI6IDEsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICB7IHAxOiA0LCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgICAgIHsgcDE6IDUsIHAyOiAyLCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgeyBwMTogNywgcDI6IDIsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICB7IHAxOiA2LCBwMjogMywgbTogMCwgdzogMC4xIH0sXG4gICAgICAgIHsgcDE6IDMsIHAyOiA0LCBtOiAwLCB3OiAwLjEgfSxcbiAgICAgICAgeyBwMTogNCwgcDI6IDUsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICB7IHAxOiA1LCBwMjogNywgbTogMCwgdzogMC4xIH0sXG4gICAgXSxcbiAgICBtYXRlcmlhbHM6IFtcbiAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgIEU6IDIwMDAwMDAwLjAsXG4gICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgZGVuc2l0eTogMTIwMC4wLFxuICAgICAgICAgfSxcbiAgICBdLFxuICAgIGc6IFswLjAsIC05LjhdLCAvLyBUT0RPOiBtb3ZlIHVwIHRvIHNjZW5lIGxldmVsLCB3aGVuIHRoYXQgZXhpc3RzLlxufTtcblxuXG4vLyAyIC0gMCAtIDFcbi8qXG5jb25zdCB0cnVzczogVHJ1c3MgPSB7XG4gICAgcGluczogW1xuICAgICAgICBbMC4wLCAwLjBdLFxuICAgICAgICBbNS4wLCAwLjBdLFxuICAgICAgICBbLTUuMCwgMC4wXSxcbiAgICBdLFxuICAgIG1vYmlsZVBpbnM6IDEsXG4gICAgYmVhbXM6IFtcbiAgICAgICAgeyBwMTogMCwgcDI6IDEsIG06IDAsIHc6IDAuMSB9LFxuICAgICAgICB7IHAxOiAwLCBwMjogMiwgbTogMCwgdzogMC4xIH0sXG4gICAgXSxcbiAgICBtYXRlcmlhbHM6IFtcbiAgICAgICAgeyAgIC8vIFJ1YmJlci5cbiAgICAgICAgICAgIEU6IDUwMDAwLjAsXG4gICAgICAgICAgICBzdHlsZTogXCJibGFja1wiLFxuICAgICAgICAgICAgZGVuc2l0eTogMTIwMC4wLFxuICAgICAgICAgfSxcbiAgICBdLFxuICAgIGc6IFswLjAsIC0xLjBdLCAvLyBUT0RPOiBtb3ZlIHVwIHRvIHNjZW5lIGxldmVsLCB3aGVuIHRoYXQgZXhpc3RzLlxufTtcbiovXG4vLyBUT0RPOiBtYWluIGxvb3Agc2hvdWxkIGJlIGNhbGxzIHRvIHJlbmRlciwgcGx1cyByZXF1ZXN0IHRvIGFzeW5jIGNvbXB1dGUgbmV4dCBwaHlzaWNzIHN0ZXAuXG5cbmNvbnN0IG9kZSA9IHRydXNzTWV0aG9kKHRydXNzKTtcbmNvbnN0IHJlbmRlciA9IHRydXNzUmVuZGVyZXIodHJ1c3MpO1xuXG5jb25zdCB2cCA9IG5ldyBWaWV3cG9ydChjdHgsIChfYiwgX3MsIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSA9PiB7XG4gICAgcmVuZGVyKGN0eCwgb2RlKTtcbn0pO1xuXG5mdW5jdGlvbiBtYWluTG9vcChfbm93OiBET01IaWdoUmVzVGltZVN0YW1wKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG4gICAgICAgIG9kZS5uZXh0KDAuMDE2NjY2NjY2KTsgIC8vIDYwMGZwcy5cbiAgICB9XG4gICAgdnAucmVxdWVzdFJlZHJhdygpO1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShtYWluTG9vcCk7XG59XG5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUobWFpbkxvb3ApO1xuXG5cbmZ1bmN0aW9uIGNsaXAodjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdikpO1xufVxuXG52cC5zZXRDbGlwUG9zaXRpb24oKHA6IFZpZXdwb3J0UG9zaXRpb24pOiBWaWV3cG9ydFBvc2l0aW9uID0+IHtcbiAgICBwLnNjYWxlID0gY2xpcChwLnNjYWxlLCAxMC4wLCAxMDAwLjApO1xuICAgIHAucG9zWzBdID0gY2xpcChwLnBvc1swXSwgLTI1NiwgMjU2KTtcbiAgICBwLnBvc1sxXSA9IGNsaXAocC5wb3NbMV0sIC0yNTYsIDI1Nik7XG4gICAgcmV0dXJuIHA7XG59KTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgdnAucmVzaXplKTtcblxuY29uc3QgdG91Y2ggPSBuZXcgVG91Y2hEZW11eChjKTtcbmNvbnN0IGdlc3R1cmUgPSBuZXcgR2VzdHVyZXMoKTtcbnRvdWNoLmFkZFRvdWNoSGFuZGxlcihnZXN0dXJlKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBhbkdlc3R1cmUodnApKTtcbmdlc3R1cmUuYWRkR2VzdHVyZUhhbmRsZXIobmV3IFBpbmNoWm9vbUdlc3R1cmUodnApKTtcblxuLy8gVE9ETzogbW91c2UgYW5kIHRyYWNrcGFkIGlucHV0XG4vLyBzY3JvbGxcbi8vIHNjcm9sbCB3aGVlbCB6b29tIGluIGFuZCBvdXRcbi8vIHdoYXQgdG8gcm90YXRlPyByaWdodCBjbGljayBkcmFnLCByb3RhdGUgYXJvdW5kIGNlbnRlciBvZiB2cD8gTWF5YmUgZG9uJ3QgY2FyZSwgc2luY2UgYnJpZGdlIHdvbnQgdXNlIHJvdGF0ZVxuXG5jb25zb2xlLmxvZyhcInN0dWZmIGxvYWRlZFwiKTtcbiJdfQ==