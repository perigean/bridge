import { Viewport, ViewportPosition } from "./viewport.js"
import { Point2D, pointDistance, pointEquals, pointSub, pointAdd, pointAngle } from "./point.js"
import { transformPoint, transformTranslateCreate, transformRotate, transformScale, transformTranslate } from "./transform.js";

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
    ctx.fillRect(-16, -16, 15, 15);
    ctx.fillRect(1, -16, 15, 15);
    ctx.fillRect(-16, 1, 15, 15);
    ctx.fillRect(1, 1, 15, 15);
});

function clip(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

vp.setClipPosition((p: ViewportPosition): ViewportPosition => {
    p.scale = clip(p.scale, 0.1, 10.0);
    p.pos[0] = clip(p.pos[0], -256, 256);
    p.pos[1] = clip(p.pos[1], -256, 256);
    return p;
});

window.addEventListener("resize", vp.resize);

// TODO: TouchDemux in its own file
export interface TouchHandler {
    start: (t: Touch) => void;
    move: (ts: TouchList) => void;
    end: (id: number) => void;
}

export class TouchDemux {
    // Map of active touch IDs to their coordinates
    private active: Map<number, Point2D>;

    constructor(e: HTMLElement, h: TouchHandler) {
        this.active = new Map<number, Point2D>();

        const start = (evt: TouchEvent) => {
            evt.preventDefault();
            for (const t of evt.touches) {
                if (!this.active.has(t.identifier)) {
                    this.active.set(t.identifier, [t.clientX, t.clientY]);
                    h.start(t);
                }
            }
        }; 
        const move = (evt: TouchEvent) => {
            evt.preventDefault();
            let moved = false;
            for (const t of evt.touches) {
                const a = this.active.get(t.identifier);
                if (a === undefined) {
                    throw new Error("Touch moved without being started");
                }
                if (a[0] != t.clientX || a[1] != t.clientY) {
                    moved = true;
                }
            }
            if (moved) {
                h.move(evt.touches);
            }
        };
        const end = (evt: TouchEvent) => {
            evt.preventDefault();
    
            const removed = new Set<number>(this.active.keys());
            for (const t of evt.touches) {
                removed.delete(t.identifier);
            }
            for (const id of removed) {
                this.active.delete(id);
                h.end(id);
            }
        };
        e.addEventListener("touchstart", start, false);
        e.addEventListener("touchmove", move, false);
        e.addEventListener("touchend", end, false);
        e.addEventListener("touchcancel", end, false);
    }
};

// TODO: Gesture in its own file
export type Tap = Array<Point2D>;

export type Pan = Array<{
    start: Point2D;
    prev: Point2D;
    curr: Point2D;
}>;

export interface GestureHandler {
    tap: (t: Tap) => void;
    pan: (p: Pan) => void;
};

// Touch handling
// * detect if a touch is a tap or a pan
//   * taps don't move more than 16 pixels
//   * maybe: taps are faster than x00ms, TODO: instrument and find out what feels OK
// * process taps
//   * first touch starts active tap
//   * all subsequent touches added to tap
//   * tap active until first touch end
//   * tap fires when on last touch end (or touch converted to pan), unless no taps remain (all converted to pan)
//   * new active tap can start while old one is running but nolonger active
// * all pans get put into a single pan tracker

type ActiveTap = {
    active: Set<number>;
    positions: Map<number, {
        curr: Point2D,
        start: Point2D,
    }>;
};

type ActivePan = Map<number, {
    curr: Point2D,
    prev: Point2D,
    start: Point2D,
}>;

export class Gestures implements TouchHandler {
    private h: GestureHandler;
    private addTap: ActiveTap | null;
    private taps: Map<number, ActiveTap>;
    private pan: ActivePan;

    private endTap(tap: ActiveTap, id: number, panning: boolean) {
        this.taps.delete(id);
        tap.active.delete(id);
        if (panning) {
            tap.positions.delete(id);
        }
        if (this.addTap === tap) {
            this.addTap = null;
        }
        if (tap.active.size === 0 && tap.positions.size > 0) {
            const positions = [];
            for (const p of tap.positions.values()) {
                positions.push(p.start);
            }
            this.h.tap(positions);
        }
    }

    constructor(h: GestureHandler) {
        this.h = h;
        this.addTap = null;
        this.taps = new Map();
        this.pan = new Map();
    }

    start(t: Touch) {
        if (this.taps.has(t.identifier)) {
            throw new Error("Touch start on already tracked tap");
        }
        if (this.addTap === null) {
            // If no taps are active, set up a tap to add a touch to.
            this.addTap = {
                active: new Set(),
                positions: new Map(),
            };
        }
        this.addTap.active.add(t.identifier);
        const pos: Point2D = [t.clientX, t.clientY];
        this.addTap.positions.set(t.identifier, {
            curr: pos,
            start: pos,
        });
        this.taps.set(t.identifier, this.addTap);
    }

    move(ts: TouchList) {
        let panMoved = false;
        for (const t of ts) {
            const tap = this.taps.get(t.identifier);
            if (tap !== undefined) {
                const pos = tap.positions.get(t.identifier);
                if (pos === undefined) {
                    throw new Error("Touch in taps, but not positions");
                }
                pos.curr = [t.clientX, t.clientY];
                if (16 <= pointDistance(pos.curr, pos.start)) {
                    // Tap has moved enough to be a pan instead.
                    this.endTap(tap, t.identifier, true);
                    this.pan.set(t.identifier, {
                        curr: pos.curr,
                        prev: pos.start,
                        start: pos.start,
                    });
                    panMoved = true;
                }
            } else {
                const pos = this.pan.get(t.identifier);
                if (pos === undefined) {
                    throw new Error("Touch not in taps or pans");
                }
                pos.prev = pos.curr;
                pos.curr = [t.clientX, t.clientY];
                if (!pointEquals(pos.prev, pos.curr)) {
                    panMoved = true;
                }
            }
        }
        if (panMoved) {
            const positions = [];
            // NB: pan is in insertion order, so positions will be sent from oldest touch to newest.
            for (const p of this.pan.values()) {
                positions.push(p);
            }
            this.h.pan(positions);
        }
    }

    end(id: number) {
        const tap = this.taps.get(id);
        if (tap !== undefined) {
            this.endTap(tap, id, false);
        } else if (!this.pan.delete(id)) {
            throw new Error("Touch end that was not a tap or a pan");
        }
    }
};

// TODO: put this in its own class
new TouchDemux(c, new Gestures({
    tap: (t: Tap) => {
        const s2w = vp.screen2world();
        console.log("tap: ", t, " world: ", transformPoint(s2w, t[0]));
    },
    pan: (ps: Pan) => {
        const pos = vp.position();
        const s2w = vp.screen2world();
        if (ps.length == 1) {
            const p = ps[ps.length - 1];
            const curr = transformPoint(s2w, p.curr);
            const prev = transformPoint(s2w, p.prev);
            vp.setPosition({
                pos: pointAdd(pos.pos, pointSub(prev, curr)),
            });
        } else if (ps.length >= 2) {
            const p1 = ps[ps.length - 1];
            const p2 = ps[ps.length - 2];
            
            const wp1prev = transformPoint(s2w, p1.prev);
            const curra = pointAngle(pointSub(p2.curr, p1.curr));
            const preva = pointAngle(pointSub(p2.prev, p1.prev));
            const currl = pointDistance(p1.curr, p2.curr);
            const prevl = pointDistance(p1.prev, p2.prev);
            const wp1curr = transformPoint(s2w, p1.curr);
            let t = transformTranslateCreate(-wp1curr[0], -wp1curr[1]);
            t = transformScale(t, prevl / currl);
            t = transformRotate(t, preva - curra);
            t = transformTranslate(t, wp1prev[0], wp1prev[1]);
            // TODO: why does this work? Isn't it backwards?

            vp.setPosition({
                pos: transformPoint(t, pos.pos),
                scale: pos.scale * currl / prevl,
                rotate: pos.rotate - preva + curra,
            });
        }
    },
}));

// TODO: mouse and trackpad input
// drag is pan
// scroll wheel zoom in and out
// what to rotate? right click drag, rotate around center of vp? Maybe don't care, since bridge wont use rotate

console.log("stuff loaded");
