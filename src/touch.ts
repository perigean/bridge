// Copyright Charles Dueck 2020

import { Point2D } from "./point.js"

export interface TouchHandler {
    start: (t: Touch) => void;
    move: (ts: TouchList) => void;
    end: (id: number) => void;
}

export class TouchDemux {
    // Map of active touch IDs to their coordinates
    private active: Map<number, Point2D>;
    private handlers: Array<TouchHandler>;

    constructor(e: HTMLElement) {
        this.active = new Map<number, Point2D>();
        this.handlers = []

        const start = (evt: TouchEvent) => {
            evt.preventDefault();
            for (const t of evt.touches) {
                if (!this.active.has(t.identifier)) {
                    this.active.set(t.identifier, [t.clientX, t.clientY]);
                    for (const h of this.handlers) {
                        h.start(t);
                    }
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
                for (const h of this.handlers) {
                    h.move(evt.touches);
                }
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
                for (const h of this.handlers) {
                    h.end(id);
                }
            }
        };
        e.addEventListener("touchstart", start, false);
        e.addEventListener("touchmove", move, false);
        e.addEventListener("touchend", end, false);
        e.addEventListener("touchcancel", end, false);
    }

    addTouchHandler(handler: TouchHandler) {
        this.handlers.push(handler);
    }

    removeTouchHandler(handler: TouchHandler) {
        this.handlers = this.handlers.filter(h => h != handler);
    }
};
