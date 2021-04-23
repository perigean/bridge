// Copyright Charles Dueck 2020

import { Point2D } from "../point.js"

export interface TouchHandler {
    start: (t: Touch) => void;
    move: (ts: TouchList) => void;
    end: (id: number) => void;
}

export class TouchDemux {
    // Map of active touch IDs to their coordinates
    private element: HTMLElement;
    private active: Map<number, Point2D>;
    private handler: TouchHandler;

    private start: (evt: TouchEvent) => void;
    private move: (evt: TouchEvent) => void;
    private end: (evt: TouchEvent) => void;

    constructor(element: HTMLElement, handler: TouchHandler) {
        this.element = element;
        this.active = new Map<number, Point2D>();
        this.handler = handler;

        this.start = (evt: TouchEvent) => {
            evt.preventDefault();
            for (const t of evt.touches) {
                if (!this.active.has(t.identifier)) {
                    this.active.set(t.identifier, [t.clientX, t.clientY]);
                    this.handler.start(t);
                }
            }
        }; 
        this.move = (evt: TouchEvent) => {
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
                this.handler.move(evt.touches);
            }
        };
        this.end = (evt: TouchEvent) => {
            evt.preventDefault();
    
            const removed = new Set<number>(this.active.keys());
            for (const t of evt.touches) {
                removed.delete(t.identifier);
            }
            for (const id of removed) {
                this.active.delete(id);
                this.handler.end(id);
            }
        };
        this.element.addEventListener("touchstart", this.start, false);
        this.element.addEventListener("touchmove", this.move, false);
        this.element.addEventListener("touchend", this.end, false);
        this.element.addEventListener("touchcancel", this.end, false);
    }

    disconnect() {
        this.element.removeEventListener("touchstart", this.start, false);
        this.element.removeEventListener("touchmove", this.move, false);
        this.element.removeEventListener("touchend", this.end, false);
        this.element.removeEventListener("touchcancel", this.end, false);
    }
};
