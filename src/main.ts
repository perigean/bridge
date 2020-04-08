import { Viewport, ViewportPosition } from "./viewport.js"
//import { Point2D } from "./transform.js"

const c = (document.getElementById("canvas") as HTMLCanvasElement);
if (c === null) {
    throw new Error("No canvas element");
}
const ctx = c.getContext("2d");
if (ctx === null) {
    throw new Error("No 2d context");
}
const vp = new Viewport(ctx, () => {
    ctx.fillStyle = "black";
    ctx.fillRect(-16, -16, 32, 32);
});

window.addEventListener("resize", vp.resize);

// Touch handling

// In screen space
// * normalize touches so that canceled touches are continued
// * detect if a touch is a tap or a pan
// * process taps
// * all pans get put into a single pan tracker

export interface ClipPosition {
    (pos: ViewportPosition): ViewportPosition;
}

export class ViewportTouch {
    constructor(_vp: Viewport, _clip: ClipPosition) {
        
    }
};

function touchStart(evt: TouchEvent) {
    evt.preventDefault();
    console.log("touchstart");
    for (const t of evt.touches) {
        console.log("    " + t.clientX + ", " + t.clientY);
    }
}

function touchEndGenerator(name: string) {
    return function touchEnd(evt: TouchEvent) {
        evt.preventDefault();
        console.log(name);
        for (const t of evt.touches) {
            console.log("    " + t.clientX + ", " + t.clientY);
        }
    };
}
    
c.addEventListener("touchstart", touchStart, false);
c.addEventListener("touchend", touchEndGenerator("touchend"), false);
c.addEventListener("touchcancel", touchEndGenerator("touchcancel"), false);
//.addEventListener("touchmove", touchMove, false);
console.log("stuff loaded");