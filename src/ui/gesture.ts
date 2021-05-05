// Copyright Charles Dueck 2020

// Touch handling
// * detect if a touch is a tap or a pan
//   * taps don't move more than 16 pixels
//   * TODO maybe: taps are faster than x00ms, TODO: instrument and find out what feels OK
// * process taps
//   * first touch starts active tap
//   * all subsequent touches added to tap
//   * tap active until first touch end
//   * tap fires when on last touch end (or touch converted to pan), unless no taps remain (all converted to pan)
//   * new active tap can start while old one is running but nolonger active
// * all pans get put into a single pan tracker
/*
import { Point2D, pointDistance, pointEquals } from "../point.js"
import { TouchDemux, TouchHandler } from "./touch.js"

export type Tap = Array<Point2D>;

export type PanTouch = {
    id: number;
    start: Point2D;
    prev: Point2D;
    curr: Point2D;
};

export type Pan = Array<PanTouch>;

export interface GestureHandler {
    tap: (t: Tap) => void;
    pan: (p: Pan) => void;
    panTouchEnd: (id: number) => void;
};

type ActiveTap = {
    active: Set<number>;
    positions: Map<number, {
        curr: Point2D,
        start: Point2D,
    }>;
};

type ActivePan = Map<number, PanTouch>;

export class Gesture implements TouchHandler {
    private demux: TouchDemux;
    private handler: GestureHandler;
    private addTap: ActiveTap | null;
    private taps: Map<number, ActiveTap>;
    private pan: ActivePan;
    private nextPanId: number;

    private endTap(tap: ActiveTap, id: number, panning: boolean) {
        this.taps.delete(id);
        tap.active.delete(id);
        if (panning) {
            // If this tap is being converted to a pan because it moved,
            // remove it from the positions list, so it doesn't get sent
            // to the handler once all fingers are up.
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
            this.handler.tap(positions);
        }
    }

    constructor(element: HTMLElement, handler: GestureHandler) {
        this.handler = handler;
        this.addTap = null;
        this.taps = new Map();
        this.pan = new Map();
        this.nextPanId = 0;
        this.demux = new TouchDemux(element, this);
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
                        id: this.nextPanId++,
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
            this.handler.pan(positions);
        }
    }

    end(id: number) {
        const tap = this.taps.get(id);
        if (tap !== undefined) {
            this.endTap(tap, id, false);
            return;
        }
        const pan = this.pan.get(id);
        if (pan !== undefined) {
            this.handler.panTouchEnd(pan.id);
            this.pan.delete(id);
            return;
        }
        throw new Error("Touch end that was not a tap or a pan");
    }
    disconnect() {
        this.demux.disconnect();
    }
};

// TODO: better separation between IDs on touch events, and the internal IDs passed to handler.
*/