"use strict";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VzdHVyZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9nZXN0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwrQkFBK0I7QUFFL0IsaUJBQWlCO0FBQ2pCLHdDQUF3QztBQUN4QywwQ0FBMEM7QUFDMUMsMEZBQTBGO0FBQzFGLGlCQUFpQjtBQUNqQixvQ0FBb0M7QUFDcEMsMENBQTBDO0FBQzFDLHVDQUF1QztBQUN2QyxpSEFBaUg7QUFDakgsNEVBQTRFO0FBQzVFLCtDQUErQztBQUMvQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUF3SkUiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbi8vIFRvdWNoIGhhbmRsaW5nXG4vLyAqIGRldGVjdCBpZiBhIHRvdWNoIGlzIGEgdGFwIG9yIGEgcGFuXG4vLyAgICogdGFwcyBkb24ndCBtb3ZlIG1vcmUgdGhhbiAxNiBwaXhlbHNcbi8vICAgKiBUT0RPIG1heWJlOiB0YXBzIGFyZSBmYXN0ZXIgdGhhbiB4MDBtcywgVE9ETzogaW5zdHJ1bWVudCBhbmQgZmluZCBvdXQgd2hhdCBmZWVscyBPS1xuLy8gKiBwcm9jZXNzIHRhcHNcbi8vICAgKiBmaXJzdCB0b3VjaCBzdGFydHMgYWN0aXZlIHRhcFxuLy8gICAqIGFsbCBzdWJzZXF1ZW50IHRvdWNoZXMgYWRkZWQgdG8gdGFwXG4vLyAgICogdGFwIGFjdGl2ZSB1bnRpbCBmaXJzdCB0b3VjaCBlbmRcbi8vICAgKiB0YXAgZmlyZXMgd2hlbiBvbiBsYXN0IHRvdWNoIGVuZCAob3IgdG91Y2ggY29udmVydGVkIHRvIHBhbiksIHVubGVzcyBubyB0YXBzIHJlbWFpbiAoYWxsIGNvbnZlcnRlZCB0byBwYW4pXG4vLyAgICogbmV3IGFjdGl2ZSB0YXAgY2FuIHN0YXJ0IHdoaWxlIG9sZCBvbmUgaXMgcnVubmluZyBidXQgbm9sb25nZXIgYWN0aXZlXG4vLyAqIGFsbCBwYW5zIGdldCBwdXQgaW50byBhIHNpbmdsZSBwYW4gdHJhY2tlclxuLypcbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UsIHBvaW50RXF1YWxzIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcbmltcG9ydCB7IFRvdWNoRGVtdXgsIFRvdWNoSGFuZGxlciB9IGZyb20gXCIuL3RvdWNoLmpzXCJcblxuZXhwb3J0IHR5cGUgVGFwID0gQXJyYXk8UG9pbnQyRD47XG5cbmV4cG9ydCB0eXBlIFBhblRvdWNoID0ge1xuICAgIGlkOiBudW1iZXI7XG4gICAgc3RhcnQ6IFBvaW50MkQ7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcblxuZXhwb3J0IHR5cGUgUGFuID0gQXJyYXk8UGFuVG91Y2g+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEdlc3R1cmVIYW5kbGVyIHtcbiAgICB0YXA6ICh0OiBUYXApID0+IHZvaWQ7XG4gICAgcGFuOiAocDogUGFuKSA9PiB2b2lkO1xuICAgIHBhblRvdWNoRW5kOiAoaWQ6IG51bWJlcikgPT4gdm9pZDtcbn07XG5cbnR5cGUgQWN0aXZlVGFwID0ge1xuICAgIGFjdGl2ZTogU2V0PG51bWJlcj47XG4gICAgcG9zaXRpb25zOiBNYXA8bnVtYmVyLCB7XG4gICAgICAgIGN1cnI6IFBvaW50MkQsXG4gICAgICAgIHN0YXJ0OiBQb2ludDJELFxuICAgIH0+O1xufTtcblxudHlwZSBBY3RpdmVQYW4gPSBNYXA8bnVtYmVyLCBQYW5Ub3VjaD47XG5cbmV4cG9ydCBjbGFzcyBHZXN0dXJlIGltcGxlbWVudHMgVG91Y2hIYW5kbGVyIHtcbiAgICBwcml2YXRlIGRlbXV4OiBUb3VjaERlbXV4O1xuICAgIHByaXZhdGUgaGFuZGxlcjogR2VzdHVyZUhhbmRsZXI7XG4gICAgcHJpdmF0ZSBhZGRUYXA6IEFjdGl2ZVRhcCB8IG51bGw7XG4gICAgcHJpdmF0ZSB0YXBzOiBNYXA8bnVtYmVyLCBBY3RpdmVUYXA+O1xuICAgIHByaXZhdGUgcGFuOiBBY3RpdmVQYW47XG4gICAgcHJpdmF0ZSBuZXh0UGFuSWQ6IG51bWJlcjtcblxuICAgIHByaXZhdGUgZW5kVGFwKHRhcDogQWN0aXZlVGFwLCBpZDogbnVtYmVyLCBwYW5uaW5nOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMudGFwcy5kZWxldGUoaWQpO1xuICAgICAgICB0YXAuYWN0aXZlLmRlbGV0ZShpZCk7XG4gICAgICAgIGlmIChwYW5uaW5nKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGlzIHRhcCBpcyBiZWluZyBjb252ZXJ0ZWQgdG8gYSBwYW4gYmVjYXVzZSBpdCBtb3ZlZCxcbiAgICAgICAgICAgIC8vIHJlbW92ZSBpdCBmcm9tIHRoZSBwb3NpdGlvbnMgbGlzdCwgc28gaXQgZG9lc24ndCBnZXQgc2VudFxuICAgICAgICAgICAgLy8gdG8gdGhlIGhhbmRsZXIgb25jZSBhbGwgZmluZ2VycyBhcmUgdXAuXG4gICAgICAgICAgICB0YXAucG9zaXRpb25zLmRlbGV0ZShpZCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYWRkVGFwID09PSB0YXApIHtcbiAgICAgICAgICAgIHRoaXMuYWRkVGFwID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGFwLmFjdGl2ZS5zaXplID09PSAwICYmIHRhcC5wb3NpdGlvbnMuc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9ucyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHRhcC5wb3NpdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvbnMucHVzaChwLnN0YXJ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlci50YXAocG9zaXRpb25zKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBoYW5kbGVyOiBHZXN0dXJlSGFuZGxlcikge1xuICAgICAgICB0aGlzLmhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICB0aGlzLmFkZFRhcCA9IG51bGw7XG4gICAgICAgIHRoaXMudGFwcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wYW4gPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMubmV4dFBhbklkID0gMDtcbiAgICAgICAgdGhpcy5kZW11eCA9IG5ldyBUb3VjaERlbXV4KGVsZW1lbnQsIHRoaXMpO1xuICAgIH1cblxuICAgIHN0YXJ0KHQ6IFRvdWNoKSB7XG4gICAgICAgIGlmICh0aGlzLnRhcHMuaGFzKHQuaWRlbnRpZmllcikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvdWNoIHN0YXJ0IG9uIGFscmVhZHkgdHJhY2tlZCB0YXBcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYWRkVGFwID09PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBJZiBubyB0YXBzIGFyZSBhY3RpdmUsIHNldCB1cCBhIHRhcCB0byBhZGQgYSB0b3VjaCB0by5cbiAgICAgICAgICAgIHRoaXMuYWRkVGFwID0ge1xuICAgICAgICAgICAgICAgIGFjdGl2ZTogbmV3IFNldCgpLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uczogbmV3IE1hcCgpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFkZFRhcC5hY3RpdmUuYWRkKHQuaWRlbnRpZmllcik7XG4gICAgICAgIGNvbnN0IHBvczogUG9pbnQyRCA9IFt0LmNsaWVudFgsIHQuY2xpZW50WV07XG4gICAgICAgIHRoaXMuYWRkVGFwLnBvc2l0aW9ucy5zZXQodC5pZGVudGlmaWVyLCB7XG4gICAgICAgICAgICBjdXJyOiBwb3MsXG4gICAgICAgICAgICBzdGFydDogcG9zLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50YXBzLnNldCh0LmlkZW50aWZpZXIsIHRoaXMuYWRkVGFwKTtcbiAgICB9XG5cbiAgICBtb3ZlKHRzOiBUb3VjaExpc3QpIHtcbiAgICAgICAgbGV0IHBhbk1vdmVkID0gZmFsc2U7XG4gICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgY29uc3QgdGFwID0gdGhpcy50YXBzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgaWYgKHRhcCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcG9zID0gdGFwLnBvc2l0aW9ucy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAocG9zID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVG91Y2ggaW4gdGFwcywgYnV0IG5vdCBwb3NpdGlvbnNcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvcy5jdXJyID0gW3QuY2xpZW50WCwgdC5jbGllbnRZXTtcbiAgICAgICAgICAgICAgICBpZiAoMTYgPD0gcG9pbnREaXN0YW5jZShwb3MuY3VyciwgcG9zLnN0YXJ0KSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUYXAgaGFzIG1vdmVkIGVub3VnaCB0byBiZSBhIHBhbiBpbnN0ZWFkLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZFRhcCh0YXAsIHQuaWRlbnRpZmllciwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFuLnNldCh0LmlkZW50aWZpZXIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0aGlzLm5leHRQYW5JZCsrLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogcG9zLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBwb3Muc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogcG9zLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcGFuTW92ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcG9zID0gdGhpcy5wYW4uZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHBvcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvdWNoIG5vdCBpbiB0YXBzIG9yIHBhbnNcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvcy5wcmV2ID0gcG9zLmN1cnI7XG4gICAgICAgICAgICAgICAgcG9zLmN1cnIgPSBbdC5jbGllbnRYLCB0LmNsaWVudFldO1xuICAgICAgICAgICAgICAgIGlmICghcG9pbnRFcXVhbHMocG9zLnByZXYsIHBvcy5jdXJyKSkge1xuICAgICAgICAgICAgICAgICAgICBwYW5Nb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChwYW5Nb3ZlZCkge1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb25zID0gW107XG4gICAgICAgICAgICAvLyBOQjogcGFuIGlzIGluIGluc2VydGlvbiBvcmRlciwgc28gcG9zaXRpb25zIHdpbGwgYmUgc2VudCBmcm9tIG9sZGVzdCB0b3VjaCB0byBuZXdlc3QuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgdGhpcy5wYW4udmFsdWVzKCkpIHtcbiAgICAgICAgICAgICAgICBwb3NpdGlvbnMucHVzaChwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlci5wYW4ocG9zaXRpb25zKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVuZChpZDogbnVtYmVyKSB7XG4gICAgICAgIGNvbnN0IHRhcCA9IHRoaXMudGFwcy5nZXQoaWQpO1xuICAgICAgICBpZiAodGFwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZW5kVGFwKHRhcCwgaWQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYW4gPSB0aGlzLnBhbi5nZXQoaWQpO1xuICAgICAgICBpZiAocGFuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlci5wYW5Ub3VjaEVuZChwYW4uaWQpO1xuICAgICAgICAgICAgdGhpcy5wYW4uZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUb3VjaCBlbmQgdGhhdCB3YXMgbm90IGEgdGFwIG9yIGEgcGFuXCIpO1xuICAgIH1cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLmRlbXV4LmRpc2Nvbm5lY3QoKTtcbiAgICB9XG59O1xuXG4vLyBUT0RPOiBiZXR0ZXIgc2VwYXJhdGlvbiBiZXR3ZWVuIElEcyBvbiB0b3VjaCBldmVudHMsIGFuZCB0aGUgaW50ZXJuYWwgSURzIHBhc3NlZCB0byBoYW5kbGVyLlxuKi8iXX0=