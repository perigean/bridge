// Copyright Charles Dueck 2020

import { Point2D } from "../point.js"

export type TouchMove = {
    id: number;
    start: Point2D;
    prev: Point2D;
    curr: Point2D;
};

export interface TouchHandler<ExtraData> {
    touchBegin: (id: number, p: Point2D) => ExtraData;
    touchMove: (ts: Array<TouchMove>) => void;
    touchEnd: (id: number) => void;
};

export class TouchDemux<ExtraData> {
    private element: HTMLElement;
    private handler: TouchHandler<ExtraData>;
    private active: Map<number, TouchMove & ExtraData>;

    private start: (evt: TouchEvent) => void;
    private move: (evt: TouchEvent) => void;
    private end: (evt: TouchEvent) => void;

    constructor(element: HTMLElement, handler: TouchHandler<ExtraData>) {
        this.element = element;
        this.handler = handler;
        this.active = new Map();

        this.start = (evt: TouchEvent) => {
            evt.preventDefault();
            for (const touch of evt.touches) {
                if (!this.active.has(touch.identifier)) {
                    const start: Point2D = [touch.clientX, touch.clientY];
                    const extra = this.handler.touchBegin(touch.identifier, start);
                    const tm: TouchMove & ExtraData = {
                        id: touch.identifier,
                        start: start,
                        prev: start,
                        curr: start,
                        ...extra,
                    };
                    this.active.set(touch.identifier, tm);
                }
            }
        }; 
        this.move = (evt: TouchEvent) => {
            evt.preventDefault();

            let moved = false;
            for (const touch of evt.touches) {
                const tm = this.active.get(touch.identifier);
                if (tm === undefined) {
                    throw new Error("Touch moved without being started");
                }
                if (tm.curr[0] != touch.clientX || tm.curr[1] != touch.clientY) {
                    moved = true;
                    tm.prev = tm.curr;
                    tm.curr = [touch.clientX, touch.clientY];
                }
            }
            if (moved) {
                this.handler.touchMove([...this.active.values()]);
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
                this.handler.touchEnd(id);
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
