import {Viewport, } from "./viewport"


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
    ctx.fillRect(-64, -64, 128, 128);
});

document.addEventListener("resize", vp.resize);

/*
import { Point2D } from "./transform"

// previous positions of touches
let touches = new Map<number, Array<Point2D>>();

let drawToken: number | null = null;
function redraw(_: number) {
    drawToken = null;

    if (ctx === null) {
        throw new Error("I don't understand typescript");
    }
    ctx.clearRect(0, 0, c.width, c.height);
    for (const [, ts] of touches) {
        for (const t of ts) {
            ctx.beginPath();
            ctx.ellipse(t[0], t[1], 32, 32, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(ts[0][0], ts[0][1]);
        for (let i = 1; i < ts.length; i++) {
            const t = ts[i];
            ctx.lineTo(t[0], t[1]);
        }
        ctx.stroke();
    }
}

function requestRedraw() {
    if (drawToken === null) {
        drawToken = requestAnimationFrame(redraw);
    }
}

function touchStart(evt: TouchEvent) {
    evt.preventDefault();
    for (const t of evt.touches) {
        touches.set(t.identifier, [[t.pageX, t.pageY]]);
    }
    requestRedraw();
}

function touchEnd(evt: TouchEvent) {
    evt.preventDefault();
    const newTouches = new Map<number, Array<Point2D>>();
    for (const t of evt.touches) {
        const ts = touches.get(t.identifier);
        if (ts === undefined) {
            throw new Error("Touch moved but not tracked");
        }
        newTouches.set(t.identifier, ts);
    }
    touches = newTouches;
    requestRedraw();
}


function touchMove(evt: TouchEvent) {
    evt.preventDefault();
    for (const t of evt.touches) {
        const ts = touches.get(t.identifier);
        if (ts === undefined) {
            throw new Error("Touch moved but not tracked");
        }
        ts.push([t.pageX, t.pageY]);
    }
    requestRedraw();
}
    
c.addEventListener("touchstart", touchStart, false);
c.addEventListener("touchend", touchEnd, false);
c.addEventListener("touchcancel", touchEnd, false);
c.addEventListener("touchmove", touchMove, false);
*/
console.log("stuff loaded");