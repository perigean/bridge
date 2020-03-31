import { Viewport, } from "./viewport";
const c = document.getElementById("canvas");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxRQUFRLEdBQUcsTUFBTSxZQUFZLENBQUE7QUFHckMsTUFBTSxDQUFDLEdBQUksUUFBUSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQXVCLENBQUM7QUFDbkUsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFO0lBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0NBQ3hDO0FBQ0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMvQixJQUFJLEdBQUcsS0FBSyxJQUFJLEVBQUU7SUFDZCxNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0NBQ3BDO0FBQ0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRTtJQUM5QixHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQztJQUN4QixHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUMsQ0FBQztBQUVILFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRS9DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUEyRUU7QUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtWaWV3cG9ydCwgfSBmcm9tIFwiLi92aWV3cG9ydFwiXG5cblxuY29uc3QgYyA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKSBhcyBIVE1MQ2FudmFzRWxlbWVudCk7XG5pZiAoYyA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGNhbnZhcyBlbGVtZW50XCIpO1xufVxuY29uc3QgY3R4ID0gYy5nZXRDb250ZXh0KFwiMmRcIik7XG5pZiAoY3R4ID09PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gMmQgY29udGV4dFwiKTtcbn1cbmNvbnN0IHZwID0gbmV3IFZpZXdwb3J0KGN0eCwgKCkgPT4ge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcImJsYWNrXCI7XG4gICAgY3R4LmZpbGxSZWN0KC02NCwgLTY0LCAxMjgsIDEyOCk7XG59KTtcblxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCB2cC5yZXNpemUpO1xuXG4vKlxuaW1wb3J0IHsgUG9pbnQyRCB9IGZyb20gXCIuL3RyYW5zZm9ybVwiXG5cbi8vIHByZXZpb3VzIHBvc2l0aW9ucyBvZiB0b3VjaGVzXG5sZXQgdG91Y2hlcyA9IG5ldyBNYXA8bnVtYmVyLCBBcnJheTxQb2ludDJEPj4oKTtcblxubGV0IGRyYXdUb2tlbjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5mdW5jdGlvbiByZWRyYXcoXzogbnVtYmVyKSB7XG4gICAgZHJhd1Rva2VuID0gbnVsbDtcblxuICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSSBkb24ndCB1bmRlcnN0YW5kIHR5cGVzY3JpcHRcIik7XG4gICAgfVxuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgYy53aWR0aCwgYy5oZWlnaHQpO1xuICAgIGZvciAoY29uc3QgWywgdHNdIG9mIHRvdWNoZXMpIHtcbiAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZSh0WzBdLCB0WzFdLCAzMiwgMzIsIDAsIDAsIE1hdGguUEkgKiAyKTtcbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8odHNbMF1bMF0sIHRzWzBdWzFdKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCB0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgdCA9IHRzW2ldO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh0WzBdLCB0WzFdKTtcbiAgICAgICAgfVxuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZXF1ZXN0UmVkcmF3KCkge1xuICAgIGlmIChkcmF3VG9rZW4gPT09IG51bGwpIHtcbiAgICAgICAgZHJhd1Rva2VuID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHJlZHJhdyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0b3VjaFN0YXJ0KGV2dDogVG91Y2hFdmVudCkge1xuICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICB0b3VjaGVzLnNldCh0LmlkZW50aWZpZXIsIFtbdC5wYWdlWCwgdC5wYWdlWV1dKTtcbiAgICB9XG4gICAgcmVxdWVzdFJlZHJhdygpO1xufVxuXG5mdW5jdGlvbiB0b3VjaEVuZChldnQ6IFRvdWNoRXZlbnQpIHtcbiAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBuZXdUb3VjaGVzID0gbmV3IE1hcDxudW1iZXIsIEFycmF5PFBvaW50MkQ+PigpO1xuICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICBjb25zdCB0cyA9IHRvdWNoZXMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgIGlmICh0cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUb3VjaCBtb3ZlZCBidXQgbm90IHRyYWNrZWRcIik7XG4gICAgICAgIH1cbiAgICAgICAgbmV3VG91Y2hlcy5zZXQodC5pZGVudGlmaWVyLCB0cyk7XG4gICAgfVxuICAgIHRvdWNoZXMgPSBuZXdUb3VjaGVzO1xuICAgIHJlcXVlc3RSZWRyYXcoKTtcbn1cblxuXG5mdW5jdGlvbiB0b3VjaE1vdmUoZXZ0OiBUb3VjaEV2ZW50KSB7XG4gICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgIGNvbnN0IHRzID0gdG91Y2hlcy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgaWYgKHRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvdWNoIG1vdmVkIGJ1dCBub3QgdHJhY2tlZFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0cy5wdXNoKFt0LnBhZ2VYLCB0LnBhZ2VZXSk7XG4gICAgfVxuICAgIHJlcXVlc3RSZWRyYXcoKTtcbn1cbiAgICBcbmMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdG91Y2hTdGFydCwgZmFsc2UpO1xuYy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdG91Y2hFbmQsIGZhbHNlKTtcbmMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRvdWNoRW5kLCBmYWxzZSk7XG5jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdG91Y2hNb3ZlLCBmYWxzZSk7XG4qL1xuY29uc29sZS5sb2coXCJzdHVmZiBsb2FkZWRcIik7Il19