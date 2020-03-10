
const c = (document.getElementById("canvas") as HTMLCanvasElement);
if (c === null) {
    throw "where did the canvas go?";
}

const ctx = c.getContext("2d");
if (ctx === null) {
    throw "not supported";
}

ctx.strokeStyle = "black";
ctx.lineWidth = 2;


import { Point2D } from "./transform"

// previous positions of touches
const touches = new Map<number, Array<Point2D>>();

function redraw(_: number) {
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

let drawToken: number | null = null;
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
    for (const t of evt.touches) {
        touches.delete(t.identifier);
    }
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
