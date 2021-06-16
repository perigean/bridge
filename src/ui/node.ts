// Copyright Charles Dick 2021

import { Point2D, pointDistance } from "../point.js"

export type LayoutBox = {
    left: number;
    top: number;
    width: number;
    height: number;
};

// TODO: Replace use of any with unknown.
// TODO: Pass ElementContext along with layout, so that we can have dynamic layouts.

export type TimerHandler = (t: number, ec: ElementContext) => void;

export interface ElementContext {
    requestDraw(): void;
    requestLayout(): void;
    timer(handler: TimerHandler, duration: number | undefined): number;
    clearTimer(id: number): void;
};

type ParameterlessHandler<State> = (ec: ElementContext, state: State) => void;
export type OnDetachHandler<State> = (e: Element<any, any, State>, state: State) => void;
export type OnDrawHandler<State> = (ctx: CanvasRenderingContext2D, box: LayoutBox, ec: ElementContext, vp: LayoutBox, state: State) => void;

type OnTouchBeginHandler<State> = (id: number, p: Point2D, ec: ElementContext, state: State) => void;
type TouchMove = {
    readonly id: number;
    readonly p: Point2D;
};
type OnTouchMoveHandler<State> = (ts: Array<TouchMove>, ec: ElementContext, state: State) => void;
type OnTouchEndHandler<State> = (id: number, ec: ElementContext, state: State) => void;

export type OnTapHandler<State> = (p: Point2D, ec: ElementContext, state: State) => void;
export type PanPoint = {
    prev: Point2D;
    curr: Point2D;
};
export type OnPanHandler<State> = (ps: Array<PanPoint>, ec: ElementContext, state: State) => void;
// TODO: Pass touch size down with touch events (instead of scale?)
// Is that enough? Probably we will always want a transoformation matrix.
// But enough for now, so just do that.

class TouchGesture<State> {
    onTapHandler?: OnTapHandler<State>;
    onPanHandler?: OnPanHandler<State>;
    onPanBeginHandler?: ParameterlessHandler<State>;
    onPanEndHandler?: ParameterlessHandler<State>;

    private active: Map<number, Point2D>;
    private pans: Map<number, PanPoint>;
    readonly onTouchBeginHandler: OnTouchBeginHandler<State>;
    readonly onTouchMoveHandler: OnTouchMoveHandler<State>;
    readonly onTouchEndHandler: OnTouchEndHandler<State>;
    
    constructor() {
        this.active = new Map();
        this.pans = new Map();
        this.onTouchBeginHandler = (id: number, p: Point2D, _: ElementContext) => {
            this.active.set(id, p);
        };
        this.onTouchMoveHandler = (ts: TouchMove[], ec: ElementContext, state: State) => {
            for (const t of ts) {
                const a = this.active.get(t.id);
                if (a != undefined) {
                    // TODO: pass in distance threshold? Scale base on transforms?
                    if (pointDistance(a, t.p) >= 16) {
                        this.active.delete(t.id);
                        this.pans.set(t.id, {
                            prev: a,
                            curr: a,    // Use the start point here, so the first move is from the start.
                        });
                    }
                }
                const p = this.pans.get(t.id);
                if (p !== undefined) {
                    if (this.pans.size === 0 && this.onPanBeginHandler !== undefined) {
                        this.onPanBeginHandler(ec, state);
                    }
                    this.pans.set(t.id, {
                        prev: p.curr,
                        curr: t.p,
                    });
                }
            }
            if (this.pans.size > 0 && this.onPanHandler !== undefined) {
                this.onPanHandler([...this.pans.values()], ec, state);
            }
        };
        this.onTouchEndHandler = (id: number, ec: ElementContext, state: State) => {
            const a = this.active.get(id);
            if (a !== undefined && this.onTapHandler !== undefined) {
                this.onTapHandler(a, ec, state);
            }
            this.active.delete(id);
            if (this.pans.delete(id) && this.pans.size === 0 && this.onPanEndHandler !== undefined) {
                this.onPanEndHandler(ec, state);
            }
        };
    }
};

// So that we can take IArguments as children
interface StaticArray<T> {
    [index: number]: T;
    length: number;
    [Symbol.iterator](): IterableIterator<T>;
};

type ChildConstraint<LayoutType extends string> = Element<LayoutType, any, any> | StaticArray<Element<LayoutType, any, any>> | undefined;

function initTouchGesture<State>(e: Element<any, any, State>): TouchGesture<State> {
    if (e.touchGesture !== undefined) {
        return e.touchGesture;
    }
    if (e.onTouchBeginHandler !== undefined || e.onTouchMoveHandler !== undefined || e.onTouchEndHandler !== undefined) {
        throw new Error('Touch gestures already captured');
    }
    const tg = new TouchGesture();
    e.onTouchBeginHandler = tg.onTouchBeginHandler;
    e.onTouchMoveHandler = tg.onTouchMoveHandler;
    e.onTouchEndHandler = tg.onTouchEndHandler;
    return tg;
}

function clamp(x: number, min: number, max: number): number {
    if (x < min) {
        return min;
    } else if (x > max) {
        return max;
    } else {
        return x;
    }
}

class Element<LayoutType extends string, Child extends ChildConstraint<string>, State> {
    layoutType: LayoutType;
    child: Child;
    left: number;
    top: number;
    width: number;
    height: number;
    state: State;

    constructor(layoutType: LayoutType, state: State, child: Child) {
        this.layoutType = layoutType;
        this.child = child;
        this.left = NaN;
        this.top = NaN;
        this.width = NaN;
        this.height = NaN;
        this.state = state;
    }

    onDrawHandler?: OnDrawHandler<State>;
    onDraw(handler: OnDrawHandler<State>): this {
        if (this.onDrawHandler !== undefined) {
            throw new Error('onDraw already set');
        }
        this.onDrawHandler = handler;
        return this;
    }

    onTouchBeginHandler?: OnTouchBeginHandler<State>;
    onTouchMoveHandler?: OnTouchMoveHandler<State>;
    onTouchEndHandler?: OnTouchEndHandler<State>;

    touchGesture?: TouchGesture<State>;
    onTap(handler: OnTapHandler<State>): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onTapHandler !== undefined) {
            throw new Error('onTap already set');
        }
        this.touchGesture.onTapHandler = handler;
        return this;
    }
    onPan(handler: OnPanHandler<State>): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanHandler !== undefined) {
            throw new Error('onPan already set');
        }
        this.touchGesture.onPanHandler = handler;
        return this;
    }
    onPanBegin(handler: ParameterlessHandler<State>): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanBeginHandler !== undefined) {
            throw new Error('onPanBegin already set');
        }
        this.touchGesture.onPanBeginHandler = handler;
        return this;
    }
    onPanEnd(handler: ParameterlessHandler<State>): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanEndHandler !== undefined) {
            throw new Error('onPanEnd already set');
        }
        this.touchGesture.onPanEndHandler = handler;
        return this;
    }

    onDetachHandler?: OnDetachHandler<State> | Array<OnDetachHandler<State>>;
    onDetach(handler: OnDetachHandler<State>): this {
        if (this.onDetachHandler === undefined || this.onDetachHandler === handler) {
            this.onDetachHandler = handler;
        } else if (Array.isArray(this.onDetachHandler)) {
            if (this.onDetachHandler.indexOf(handler) < 0) {
                this.onDetachHandler.push(handler);
            }
        } else {
            this.onDetachHandler = [this.onDetachHandler, handler];
        }
        return this;
    }
    removeOnDetach(handler: OnDetachHandler<State>): void {
        if (Array.isArray(this.onDetachHandler)) {
            const i = this.onDetachHandler.indexOf(handler);
            if (i >= 0) {
                // Copy the array, so that it's safe to call this inside an OnDetachHandler.
                this.onDetachHandler = [...this.onDetachHandler].splice(i, 1);
            }
        } else if (this.onDetachHandler === handler) {
            this.onDetachHandler = undefined;
        }
    }
};

export function addChild(e: Element<any, StaticArray<Element<any, any, any>>, any>, child: Element<any, any, any>, ec: ElementContext, index?: number) {
    const children = new Array<Element<any, any, any>>(e.child.length + 1);
    let i = 0;
    let j = 0;
    for (; i < e.child.length; i++) {
        if (i === index) {
            children[j++] = child;
        }
        children[j++] = e.child[i];
    }
    if (j === i) {
        children[j] = child;
    }
    e.child = children;
    ec.requestLayout();
}

function callDetachListeners(root: Element<any, any, any>) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any, any>;
        if (Array.isArray(e.onDetachHandler)) {
            for (const handler of e.onDetachHandler) {
                handler(e, e.state);
            }
        } else if (e.onDetachHandler !== undefined) {
            e.onDetachHandler(e, e.state);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            stack.push(...e.child);
        } else {
            stack.push(e.child);
        }
    }
}

export function removeChild(e: Element<any, StaticArray<Element<any, any, any>>, any>, index: number, ec: ElementContext) {
    const children = new Array<Element<any, any, any>>(e.child.length - 1);
    let j = 0;
    for (let i = 0; i < e.child.length; i++) {
        if (i === index) {
            callDetachListeners(e.child[i]);
        } else {
            children[j++] = e.child[i];
        }
    }
    e.child = children;
    ec.requestLayout();
}

export abstract class WPHPLayout<Child extends ChildConstraint<any>, State> extends Element<'wphp', Child, State> {
    constructor(state: State, child: Child) {
        super('wphp', state, child);
    }
    abstract layout(left: number, top: number, width: number, height: number): void;
};

export abstract class WPHSLayout<Child extends ChildConstraint<any>, State> extends Element<'wphs', Child, State> {
    constructor(state: State, child: Child) {
        super('wphs', state, child);
    }
    abstract layout(left: number, top: number, width: number): void;
};

export abstract class WSHPLayout<Child extends ChildConstraint<any>, State> extends Element<'wshp', Child, State> {
    constructor(state: State, child: Child) {
        super('wshp', state, child);
    }
    abstract layout(left: number, top: number, height: number): void;
};

export abstract class WSHSLayout<Child extends ChildConstraint<any>, State> extends Element<'wshs', Child, State> {
    constructor(state: State, child: Child) {
        super('wshs', state, child);
    }
    abstract layout(left: number, top: number): void;
};

export type LayoutHasWidthAndHeight = WSHSLayout<any, any>;
export type LayoutTakesWidthAndHeight = WPHPLayout<any, any>;

function drawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any, any>, ec: ElementContext, vp: LayoutBox) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any, any>;
        if (e.onDrawHandler) {
            e.onDrawHandler(ctx, e, ec, vp, e.state);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            // Push last child on first, so we draw it last.
            for (let i = e.child.length - 1; i >= 0; i--) {
                stack.push(e.child[i]);
            }
        } else {
            stack.push(e.child);
        }
    }
}

function clearAndDrawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any, any>, ec: ElementContext, vp: LayoutBox) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
    drawElementTree(ctx, root, ec, vp);
}

type HasTouchHandlers<State> = {
    onTouchBeginHandler: OnTouchBeginHandler<State>;
    onTouchMoveHandler: OnTouchMoveHandler<State>;
    onTouchEndHandler: OnTouchEndHandler<State>;
} & Element<any, any, State>;

function findTouchTarget(root: Element<any, any, any>, p: Point2D): undefined | HasTouchHandlers<any> {
    const stack = [root];
    const x = p[0];
    const y = p[1];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any, any>;
        if (x < e.left || x >= e.left + e.width || y < e.top || y >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e.onTouchBeginHandler !== undefined && e.onTouchMoveHandler !== undefined && e.onTouchEndHandler !== undefined) {
            return e as HasTouchHandlers<any>; // TODO: Why can't type inference figure this out?
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            // Push first child on first, so we visit last child last.
            // The last child (the one on top) should override previous children's target.
            stack.push(...e.child);
        } else {
            stack.push(e.child);
        }
    }
    return undefined;
}

type TARGET_ROOT = 1;
const TARGET_ROOT = 1;
type TARGET_NONE = 2;
const TARGET_NONE = 2;

class RootElementContext implements ElementContext {
    private layoutRequested: boolean;
    private layoutEvaluating: boolean;
    private drawRequested: boolean;
    private drawEvaluating: boolean;
    private vp: LayoutBox;
    private evaluate: () => void;
    private evaluateToken: number | undefined;
    private nextTimerID: number;
    private timers: Map<number, { handler: TimerHandler, start: number, duration: number | undefined }>;
    private callTimersToken: number | undefined;
    private callTimers: (now: number) => void;

    constructor(ctx: CanvasRenderingContext2D, root: WPHPLayout<any, any>, width: number, height: number) {
        this.layoutRequested = false;
        this.layoutEvaluating = false;
        this.drawRequested = false;
        this.drawEvaluating = false;
        this.vp = { left: 0, top: 0, width, height };
        this.evaluate = () => {
            this.evaluateToken = undefined;
            if (this.layoutRequested) {
                this.layoutRequested = false;
                this.layoutEvaluating = true;
                try {
                    root.layout(this.vp.left, this.vp.top, this.vp.width, this.vp.height);
                    this.drawRequested = true;
                } finally {
                    this.layoutEvaluating = false;
                }
            }
            if (this.drawRequested) {
                this.drawRequested = false;
                this.drawEvaluating = true;
                try {
                    clearAndDrawElementTree(ctx, root, this, this.vp);
                } finally {
                    this.drawEvaluating = false;
                }
            }
        };
        this.evaluateToken = undefined;
        this.nextTimerID = 0;
        this.timers = new Map();
        this.callTimersToken = undefined;
        this.callTimers = (now: number) => {
            const finished : Array<number> = [];
            for (const [k, v] of this.timers) {
                if (v.start > now) {
                    // requestAnimationFrame handlers sometimes receive a timestamp earlier
                    // than performance.now() called when requestAnimationFrame was called.
                    // So, if we see a time inversion, just move the start time early.
                    v.start = now;
                }
                if (v.duration !== undefined && v.duration <= now - v.start) {
                    v.handler(v.duration, this);
                    finished.push(k);
                } else {
                    v.handler(now - v.start, this);
                }
            }
            for (const k of finished) {
                this.timers.delete(k);
            }
            if (this.timers.size !== 0) {
                this.callTimersToken = requestAnimationFrame(this.callTimers);
            } else {
                this.callTimersToken = undefined;
            }
        };
    }

    requestDraw(): void {
        if (this.drawEvaluating) {
            throw new Error("draw requested during draw evaluation");
        }
        if (this.layoutEvaluating) {
            throw new Error("layout requested during draw evaluation");
        }
        if (this.drawRequested) {
            return;
        }
        this.drawRequested = true;
        if (this.evaluateToken !== undefined) {
            return;
        }
        this.evaluateToken = setTimeout(this.evaluate, 0);
    }
    requestLayout(): void {
        if (this.layoutEvaluating) {
            throw new Error("layout requested during layout evaluation");
        }
        if (this.layoutRequested) {
            return;
        }
        this.layoutRequested = true;
        if (this.evaluateToken !== undefined) {
            return;
        }
        this.evaluateToken = setTimeout(this.evaluate, 0);
    }

    timer(handler: TimerHandler, duration: number | undefined): number {
        const id = this.nextTimerID;
        this.nextTimerID++;
        this.timers.set(id, { handler, start: performance.now(), duration });
        if (this.callTimersToken === undefined) {
            this.callTimersToken = requestAnimationFrame(this.callTimers);
        }
        return id;
    }

    clearTimer(id: number) {
        this.timers.delete(id);
        if (this.timers.size === 0 && this.callTimersToken !== undefined) {
            cancelAnimationFrame(this.callTimersToken);
            this.callTimersToken = undefined;
        }
    }

    setViewport(width: number, height: number) {
        this.vp.width = width;
        this.vp.height = height;
        this.requestLayout();
    }

    disconnect(): void {
        if (this.evaluateToken === undefined) {
            return;
        }
        clearTimeout(this.evaluateToken);
        this.evaluateToken = undefined;
    }
};

export class RootLayout {
    ec: RootElementContext;
    child: WPHPLayout<any, any>;
    canvas: HTMLCanvasElement;
    //ctx: CanvasRenderingContext2D;
    resize: ResizeObserver;

    private touchTargets: Map<number, HasTouchHandlers<any> | TARGET_ROOT | TARGET_NONE>;
    private touchTargetDetached: OnDetachHandler<any>;
    private touchStart: (evt: TouchEvent) => void; 
    private touchMove: (evt: TouchEvent) => void;
    private touchEnd: (evt: TouchEvent) => void;

    constructor(canvas: HTMLCanvasElement, child: WPHPLayout<any, any>) {
        const ctx = canvas.getContext("2d", {alpha: false});
        if (ctx === null) {
            throw new Error("failed to get 2d context");
        }
        this.ec = new RootElementContext(ctx, child, canvas.width, canvas.height);
        this.child = child;
        this.canvas = canvas;
        canvas.width = canvas.width * window.devicePixelRatio;
        canvas.height = canvas.height * window.devicePixelRatio;
        ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        this.ec.requestLayout();
        
        this.resize = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length !== 1) {
                throw new Error(`ResizeObserver expects 1 entry, got ${entries.length}`);
            }
            const content = entries[0].contentRect;
            canvas.width = content.width * window.devicePixelRatio;
            canvas.height = content.height * window.devicePixelRatio;
            ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            this.ec.setViewport(content.width, content.height);
        });
        this.resize.observe(canvas, {box: "device-pixel-content-box"});

        this.touchTargets = new Map();
        this.touchTargetDetached = (e: Element<any, any, any>) => {
            let foundTarget = false;
            for (const [k, v] of this.touchTargets) {
                if (v === e) {
                    e.removeOnDetach(this.touchTargetDetached);
                    this.touchTargets.set(k, TARGET_NONE);
                    foundTarget = true;
                }
            }
            if (!foundTarget) {
                throw new Error("no active touch for detached element");
            }
        };
        this.touchStart = (evt: TouchEvent) => {
            let preventDefault = false;
            for (const t of evt.touches) {
                let target = this.touchTargets.get(t.identifier);
                if (target !== undefined) {
                    preventDefault = true;
                    continue;
                }
                const p: Point2D = [t.clientX, t.clientY];
                target = findTouchTarget(this.child, p);
                if (target === undefined) {
                    this.touchTargets.set(t.identifier, TARGET_ROOT);
                    // Add placeholder to active targets map so we know anbout it.
                    // Allow default action, so e.g. page can be scrolled.
                } else {
                    preventDefault = true;
                    this.touchTargets.set(t.identifier, target);
                    target.onDetach(this.touchTargetDetached);
                    target.onTouchBeginHandler(t.identifier, p, this.ec, target.state);
                }
            }
            if (preventDefault) {
                // Some target was some for at least some of the touches. Don't let anything
                // in HTML get this touch.
                evt.preventDefault();
            }
        };
        this.touchMove = (evt: TouchEvent) => {
            let preventDefault = false;
            const targets = new Map<HasTouchHandlers<any>, Array<TouchMove>>();
            for (const t of evt.touches) {
                const target = this.touchTargets.get(t.identifier);
                if (target === undefined) {
                    throw new Error(`Touch move without start, id ${t.identifier}`);
                } else if (target === TARGET_ROOT) {
                    // Don't do anything, as the root element can't scroll.
                } else if (target === TARGET_NONE) {
                    // Don't do anything, target probably deleted.
                } else {
                    preventDefault = true;
                    const ts = targets.get(target) || [];
                    ts.push({
                        id: t.identifier,
                        p: [t.clientX, t.clientY],
                    });
                    targets.set(target, ts);
                }
            }
            for (const [target, ts] of targets) {
                target.onTouchMoveHandler(ts, this.ec, target.state);
            }
            if (preventDefault) {
                evt.preventDefault();
            }
        };
        this.touchEnd = (evt: TouchEvent) => {
            let preventDefault = false;
            const removed = new Map(this.touchTargets);
            for (const t of evt.touches) {
                if (removed.delete(t.identifier) === false) {
                    throw new Error(`Touch end without start, id ${t.identifier}`);
                }
            }
            for (const [id, target] of removed) {
                this.touchTargets.delete(id);
                if (target !== TARGET_ROOT && target !== TARGET_NONE) {
                    preventDefault = true;
                    target.removeOnDetach(this.touchTargetDetached);
                    target.onTouchEndHandler(id, this.ec, target.state);
                }
            }
            if (preventDefault) {
                evt.preventDefault();
            }
        };
        this.canvas.addEventListener("touchstart", this.touchStart, false);
        this.canvas.addEventListener("touchmove", this.touchMove, false);
        this.canvas.addEventListener("touchend", this.touchEnd, false);
        this.canvas.addEventListener("touchcancel", this.touchEnd, false);
    }

    disconnect() {
        this.resize.disconnect();
        this.ec.disconnect();
        callDetachListeners(this.child);

        this.canvas.removeEventListener("touchstart", this.touchStart, false);
        this.canvas.removeEventListener("touchmove", this.touchMove, false);
        this.canvas.removeEventListener("touchend", this.touchEnd, false);
        this.canvas.removeEventListener("touchcancel", this.touchEnd, false);
    }
};

// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: convert to use Affine transform.

class ScrollLayout extends WPHPLayout<undefined, undefined> {
    // ScrollLayout has to intercept all events to make sure any locations are updated by
    // the scroll position, so child is undefined, and all events are forwarded to scroller.
    scroller: WSHSLayout<any, any>;
    scroll: Point2D;
    zoom: number;
    zoomMax: number;
    private touchTargets: Map<number, HasTouchHandlers<unknown> | TARGET_ROOT | TARGET_NONE>;
    private touchScroll: Map<number, { prev: Point2D, curr: Point2D }>;
    private touchTargetDetached: OnDetachHandler<unknown>;

    private clampZoom() {
        if (this.scroller.width < this.width / this.zoom) {
            this.zoom = this.width / this.scroller.width;
        }
        if (this.scroller.height < this.height / this.zoom) {
            this.zoom = this.height / this.scroller.height;
        }
        if (this.zoom > this.zoomMax) {
            this.zoom = this.zoomMax;
        }
    }
    private clampScroll() {
        this.scroll[0] = clamp(this.scroll[0], 0, this.scroller.width - this.width / this.zoom);
        this.scroll[1] = clamp(this.scroll[1], 0, this.scroller.height - this.height / this.zoom);
    }

    private updateScroll() {
        const ts = [...this.touchScroll.values()];
        if (ts.length === 1) {
            const t = ts[0];
            const p = this.p2c(t.prev);
            const c = this.p2c(t.curr);
            this.scroll[0] += p[0] - c[0];
            this.scroll[1] += p[1] - c[1];
        } else if (ts.length === 2) {
            const pm = this.p2c([
                (ts[0].prev[0] + ts[1].prev[0]) * 0.5,
                (ts[0].prev[1] + ts[1].prev[1]) * 0.5,
            ]);
            const pd = pointDistance(ts[0].prev, ts[1].prev);
            const cd = pointDistance(ts[0].curr, ts[1].curr);
            this.zoom *= cd / pd;
            // Clamp zoom so we can't zoom out too far.
            this.clampZoom();
            const cm = this.p2c([
                (ts[0].curr[0] + ts[1].curr[0]) * 0.5,
                (ts[0].curr[1] + ts[1].curr[1]) * 0.5,
            ]);
            this.scroll[0] += pm[0] - cm[0];
            this.scroll[1] += pm[1] - cm[1];
        }
        this.clampScroll();
    }

    private p2c(p: Point2D): Point2D {
        const s = this.scroll;
        const shrink = 1 / this.zoom;
        // TODO: take parent rect into account
        return [
            (p[0] - this.left) * shrink + s[0],
            (p[1] - this.top) * shrink + s[1],
        ];
    }

    constructor(child: WSHSLayout<any, any>, scroll: Point2D, zoom: number, zoomMax: number) {
        super(undefined, undefined);
        this.scroller = child;
        this.scroll = scroll;
        this.zoom = zoom;
        this.zoomMax = zoomMax;
        this.touchTargets = new Map();
        this.touchScroll = new Map();
        this.touchTargetDetached = (e: Element<any, any, any>) => {
            let foundTarget = false;
            for (const [k, v] of this.touchTargets) {
                if (v === e) {
                    e.removeOnDetach(this.touchTargetDetached);
                    this.touchTargets.set(k, TARGET_NONE);
                    foundTarget = true;
                }
            }
            if (!foundTarget) {
                throw new Error("no active touch for detached element");
            }
        };
        
        this.onDrawHandler = (ctx: CanvasRenderingContext2D, _box: LayoutBox, ec: ElementContext, _vp: LayoutBox) => {
            ctx.save();
            
            ctx.translate(this.left, this.top);
            // Clip to Scroll viewport.
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.width, 0);
            ctx.lineTo(this.width, this.height);
            ctx.lineTo(0, this.height);
            ctx.closePath();
            ctx.clip();
            ctx.scale(this.zoom, this.zoom);
            ctx.translate(-this.scroll[0], -this.scroll[1]);
            const vpScroller = {
                left: this.scroll[0],
                top: this.scroll[1],
                width: this.width / this.zoom,
                height: this.height / this.zoom,
            };
            drawElementTree(ctx, this.scroller, ec, vpScroller);
            // TODO: restore transform in a finally?
            ctx.restore();
        };

        this.onTouchBeginHandler = (id: number, pp: Point2D, ec: ElementContext) => {
            const cp = this.p2c(pp);
            const target = findTouchTarget(this.scroller, cp);
            if (target === undefined) {
                // Add placeholder null to active touches, so we know they should scroll.
                this.touchTargets.set(id, TARGET_ROOT);
                this.touchScroll.set(id, { prev: pp, curr: pp });
            } else {
                this.touchTargets.set(id, target);
                target.onDetach(this.touchTargetDetached);
                target.onTouchBeginHandler(id, cp, ec, target.state);
            }
        };
        this.onTouchMoveHandler = (ts: Array<TouchMove>, ec: ElementContext) => {
            const targets = new Map<HasTouchHandlers<any>, Array<TouchMove>>();
            for (const t of ts) {
                const target = this.touchTargets.get(t.id);
                if (target === undefined) {
                    throw new Error(`Unknown touch move ID ${t.id}`);
                } else if (target === TARGET_ROOT) {
                    const scroll = this.touchScroll.get(t.id);
                    if (scroll === undefined) {
                        throw new Error(`Touch move with ID ${t.id} has target === TARGET_ROOT, but is not in touchScroll`)
                    }
                    scroll.prev = scroll.curr;
                    scroll.curr = t.p;
                } else if (target === TARGET_NONE) {
                    // Don't do anything, target deleted.
                } else {
                    const tts = targets.get(target) || [];
                    tts.push(t);
                    targets.set(target, tts);
                }
            }

            // Update scroll position.
            this.updateScroll();

            // Forward touch moves.
            for (const [target, tts] of targets) {
                for (let i = 0; i < tts.length; i++) {
                    tts[i] = {
                        id: tts[i].id,
                        p: this.p2c(tts[i].p),
                    };
                }
                target.onTouchMoveHandler(tts, ec, target.state);
            }
            ec.requestDraw();
        };
        this.onTouchEndHandler = (id: number, ec: ElementContext) => {
            const target = this.touchTargets.get(id);
            if (target === undefined) {
                throw new Error(`Unknown touch end ID ${id}`);
            } else if (target === TARGET_ROOT) {
                if (!this.touchScroll.delete(id)) {
                    throw new Error(`Touch end ID ${id} has target TARGET_ROOT, but is not in touchScroll`);
                }
            } else if (target === TARGET_NONE) {
                // Do nothing, taret was deleted.
            } else {
                this.touchTargets.delete(id);
                target.removeOnDetach(this.touchTargetDetached);
                if (target.onTouchEndHandler !== undefined) {
                    target.onTouchEndHandler(id, ec, target.state);
                }
            }
        };
        // TODO: other handlers need forwarding.
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        this.clampZoom();
        this.clampScroll();

        this.scroller.layout(0, 0);
    }
}

export function Scroll(child: WSHSLayout<any, any>, scroll?: Point2D, zoom?: number, zoomMax?: number): ScrollLayout {
    // NB: scale of 0 is invalid anyways, so it's OK to be falsy.
    return new ScrollLayout(child, scroll || [0, 0], zoom || 1, zoomMax || 100);
}

// TODO: scrollx, scrolly

class BoxLayout<State, Child extends WPHPLayout<any, any> | undefined> extends WSHSLayout<Child, State> {
    constructor(width: number, height: number, state: State, child: Child) {
        super(state, child);
        this.width = width;
        this.height = height;
    }
    layout(left: number, top: number): void {
        this.left = left;
        this.top = top;
        if (this.child !== undefined) {
            this.child.layout(left, top, this.width, this.height);
        }
    }
};

export function Box<State>(width: number, height: number): WSHSLayout<undefined, undefined>;
export function Box<State>(width: number, height: number, child: WPHPLayout<any, any>): WSHSLayout<any, undefined>;
export function Box<State>(width: number, height: number, state: State): WSHSLayout<any, State>;
export function Box<State>(width: number, height: number, state: State, child: WPHPLayout<any, any>): WSHSLayout<any, State>;
export function Box<State>(width: number, height: number, first?: State | WPHPLayout<any, any>, second?: WPHPLayout<any, any>): WSHSLayout<any, State> | WSHSLayout<any, undefined> {
    if (second === undefined) {
        if (first === undefined) {
            return new BoxLayout<undefined, undefined>(width, height, undefined, undefined);
        } else if (first instanceof Element) {
            return new BoxLayout<undefined, WPHPLayout<any, any>>(width, height, undefined, first);
        } else {
            return new BoxLayout<State, undefined>(width, height, first, undefined);
        }
    } else {
        return new BoxLayout<State, WPHPLayout<any, any>>(width, height, first as State, second);
        // TODO: the state should type-check.
    }
}

class WPHPBorderLayout<State> extends WPHPLayout<WPHPLayout<any, any>, State> {
    border: number;
    style: string | CanvasGradient | CanvasPattern;
    constructor(child: WPHPLayout<any, any>, border: number, style: string | CanvasGradient | CanvasPattern, state: State) {
        super(state, child);
        this.border = border;
        this.style = style;

        this.onDrawHandler = (ctx: CanvasRenderingContext2D, box: LayoutBox) => {
            const b = this.border;
            const b2 = b * 0.5;
            ctx.strokeStyle = this.style;
            ctx.lineWidth = this.border;
            ctx.strokeRect(box.left + b2, box.top + b2, box.width - b, box.height - b);
        };
    }
    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        const b = this.border;
        this.child.layout(left + b, top + b, width - b * 2, height - b * 2);
    }
}

export function Border<State>(width: number, style: string | CanvasGradient | CanvasPattern, child: WPHPLayout<any, any>, state?: State): WPHPLayout<any, any> {
    if (state === undefined) {
        return new WPHPBorderLayout<undefined>(child, width, style, undefined);
    } else {
        return new WPHPBorderLayout<State>(child, width, style, state);
    }
}

class FillLayout<State> extends WPHPLayout<undefined, State> {
    constructor(state: State) {
        super(state, undefined);
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
}

export function Fill(): FillLayout<undefined>;
export function Fill<State>(state: State): FillLayout<State>;
export function Fill<State>(state?: State): FillLayout<undefined> | FillLayout<State> {
    if (state === undefined) {
        return new FillLayout<undefined>(undefined);
    } else {
        return new FillLayout<State>(state);
    }
}

class CenterLayout<State> extends WPHPLayout<WSHSLayout<any, any>, State> {
    constructor(state: State, child: WSHSLayout<any, any>) {
        super(state, child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, childTop);
    }
};

export function Center<State = undefined>(child: WSHSLayout<any, any>, state: State): CenterLayout<State> {
    return new CenterLayout<State>(state, child);
}

class HCenterHPLayout<State> extends WPHPLayout<WSHPLayout<any, any>, State> {
    constructor(state: State, child: WSHPLayout<any, any>) {
        super(state, child);
    }
    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, top, height);
    }
};

class HCenterHSLayout<State> extends WPHSLayout<WSHSLayout<any, any>, State> {
    constructor(state: State, child: WSHSLayout<any, any>) {
        super(state, child);
        this.height = child.height;
    }
    
    layout(left: number, top: number, width: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(childLeft, top);
    }
};

export function HCenter<State = undefined>(child: WSHSLayout<any, any>, state: State): HCenterHSLayout<State>;
export function HCenter<State = undefined>(child: WSHPLayout<any, any>, state: State): HCenterHPLayout<State>;
export function HCenter<State = undefined>(child: WSHSLayout<any, any> | WSHPLayout<any, any>, state: State): HCenterHSLayout<State> | HCenterHPLayout<State> {
    if (child.layoutType === 'wshp') {
        return new HCenterHPLayout<State>(state, child);
    } else {
        return new HCenterHSLayout<State>(state, child);
    }
}

class VCenterWPLayout<State> extends WPHPLayout<WPHSLayout<any, any>, State> {
    constructor(state: State, child: WPHSLayout<any, any>) {
        super(state, child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(left, childTop, width);
    }
};

class VCenterWSLayout<State> extends WSHPLayout<WSHSLayout<any, any>, State> {
    constructor(state: State, child: WSHSLayout<any, any>) {
        super(state, child);
        this.width = child.width;
    }
    
    layout(left: number, top: number, height: number): void {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.height = height;

        child.layout(left, childTop);
    }
};

export function VCenter<State = undefined>(child: WSHSLayout<any, any>, state: State): VCenterWSLayout<State>;
export function VCenter<State = undefined>(child: WPHSLayout<any, any>, state: State): VCenterWPLayout<State>;
export function VCenter<State = undefined>(child: WSHSLayout<any, any> | WPHSLayout<any, any>, state: State): VCenterWSLayout<State> | VCenterWPLayout<State> {
    if (child.layoutType === 'wphs') {
        return new VCenterWPLayout<State>(state, child);
    } else {
        return new VCenterWSLayout<State>(state, child);
    }
}

export class FlexLayout<State, Child extends WPHPLayout<any, any> | undefined> extends Element<'flex', Child, State> {
    size: number;
    grow: number;
    constructor(size: number, grow: number, state: State, child: Child) {
        super('flex', state, child);
        this.size = size;
        this.grow = grow;
    }
    layout(left:number, top: number, width: number, height: number) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        if (this.child !== undefined) {
            this.child.layout(left, top, width, height);
        }
    }
};

export function Flex(size: number, grow: number): FlexLayout<undefined, undefined>;
export function Flex<State>(size: number, grow: number, state: State): FlexLayout<State, undefined>;
export function Flex(size: number, grow: number, child: WPHPLayout<any, any>): FlexLayout<undefined, WPHPLayout<any, any>>;
export function Flex<State>(size: number, grow: number, state: State, child: WPHPLayout<any, any>): FlexLayout<State, WPHPLayout<any, any>>;
export function Flex<State>(size: number, grow: number, first?: State | WPHPLayout<any, any>, second?: WPHPLayout<any, any>): FlexLayout<any, any> {
    if (first !== undefined) {
        if (second !== undefined) {
            return new FlexLayout(size, grow, first, second);
        } else if (first instanceof WPHPLayout) {
            return new FlexLayout(size, grow, undefined, first);
        } else {
            return new FlexLayout(size, grow, first, undefined);
        }
    } else {
        return new FlexLayout<undefined, undefined>(size, grow, undefined, undefined);
    }
}

class LeftFlexLayout<State> extends WPHPLayout<StaticArray<FlexLayout<any, any>>, State> {
    constructor(state: State, children: StaticArray<FlexLayout<any, any>>) {
        super(state, children);
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        let sumSize = 0;
        let sumGrow = 0;
        for (const c of this.child) {
            sumSize += c.size;
            sumGrow += c.grow;
        }
        let childLeft = left;
        let extra = height - sumSize;
        for (const c of this.child) {
            let childWidth = c.size;
            if (c.grow !== 0) {
                childWidth += extra * c.grow / sumGrow;
            }
            c.layout(childLeft, top, childWidth, height);
            childLeft += childWidth;
        }
    }
};

export function Left(...children: Array<FlexLayout<any, any>>): LeftFlexLayout<undefined>
export function Left<State>(state: State, ...children: Array<FlexLayout<any, any>>): LeftFlexLayout<State>;
export function Left<State>(first: State | FlexLayout<any, any>, ...children: Array<FlexLayout<any, any>>): LeftFlexLayout<any> {
    if (first instanceof FlexLayout) {
        return new LeftFlexLayout(undefined, [first, ...children]);
    } else {
        return new LeftFlexLayout(first, children);
    }
}

class BottomFlexLayout<State> extends WPHPLayout<StaticArray<FlexLayout<any, any>>, State> {
    constructor(state: State, children: StaticArray<FlexLayout<any, any>>) {
        super(state, children);
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        let sumSize = 0;
        let sumGrow = 0;
        for (const c of this.child) {
            sumSize += c.size;
            sumGrow += c.grow;
        }
        let childTop = top + height;
        let extra = height - sumSize;
        for (const c of this.child) {
            let childHeight = c.size;
            if (c.grow !== 0) {
                childHeight += extra * c.grow / sumGrow;
            }
            childTop -= childHeight;
            c.layout(left, childTop, width, childHeight);
        }
    }
}

export function Bottom(...children: Array<FlexLayout<any, any>>): BottomFlexLayout<undefined>
export function Bottom<State>(state: State, ...children: Array<FlexLayout<any, any>>): BottomFlexLayout<State>;
export function Bottom<State>(first: State | FlexLayout<any, any>, ...children: Array<FlexLayout<any, any>>): BottomFlexLayout<any> {
    if (first instanceof FlexLayout) {
        return new BottomFlexLayout(undefined, [first, ...children]);
    } else {
        return new BottomFlexLayout(first, children);
    }
}

type DebugTouchState = {
    fill: string | CanvasGradient | CanvasPattern,
    stroke: string | CanvasGradient | CanvasPattern,
    taps: Array<Point2D>,
    pans: Array<Array<PanPoint>>,
};

function debugTouchOnDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, state: DebugTouchState) {
    ctx.fillStyle = state.fill;
    ctx.strokeStyle = state.stroke;
    ctx.lineWidth = 2;
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.beginPath();
    for (const tap of state.taps) {
        ctx.moveTo(tap[0] + 16, tap[1]);
        ctx.ellipse(tap[0], tap[1], 16, 16, 0, 0, 2 * Math.PI);
    }
    for (const ps of state.pans) {
        for (const p of ps) {
            ctx.moveTo(p.prev[0], p.prev[1]);
            ctx.lineTo(p.curr[0], p.curr[1]);
        }
    }
    ctx.stroke();
}

function debugTouchOnTap(p: Point2D, ec: ElementContext, state: DebugTouchState) {
    state.taps.push(p);
    ec.requestDraw();
}

function debugTouchOnPan(ps: Array<PanPoint>, ec: ElementContext, state: DebugTouchState) {
    state.pans.push(ps);
    ec.requestDraw();
}

export function DebugTouch(width: number, height: number, fill: string | CanvasGradient | CanvasPattern, stroke: string | CanvasGradient | CanvasPattern): BoxLayout<DebugTouchState, undefined> {
    const state = {
        fill,
        stroke,
        taps: [],
        pans: [],
    };
    return Box<DebugTouchState>(width, height, state)
        .onDraw(debugTouchOnDraw)
        .onTap(debugTouchOnTap)
        .onPan(debugTouchOnPan);
}

class LayerLayout<State> extends WPHPLayout<StaticArray<WPHPLayout<any, any>>, State> {
    constructor(state: State, children: StaticArray<WPHPLayout<any, any>>) {
        super(state, children);
    }
    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        for (const child of this.child) {
            child.layout(left, top, width, height);
        }
    }
};

export function Layer<State>(state: State, ...children: Array<WPHPLayout<any, any>>): LayerLayout<State>;
export function Layer(...children: Array<WPHPLayout<any, any>>): LayerLayout<undefined>;
export function Layer<State>(first: State | WPHPLayout<any, any>, ...children: Array<WPHPLayout<any, any>>): LayerLayout<State> | LayerLayout<undefined> {
    if (first instanceof Element) {
        return new LayerLayout<undefined>(undefined, [first, ...children]);
    }
    return new LayerLayout<State>(first, children);
}

export type OnSwitchSelect = (ec: ElementContext) => void;

class SwitchLayout<Indices extends number> extends WPHPLayout<WPHPLayout<any, any>, Indices> {
    private children: Array<WPHPLayout<any, any>>;

    constructor(i: Indices, children: Array<WPHPLayout<any, any>>) {
        super(i, children[i]);
        this.children = children;
    }

    set(i: Indices, ec: ElementContext) {
        if (i !== this.state) {
            callDetachListeners(this.child);
        }
        this.state = i;
        this.child = this.children[i];
        ec.requestLayout();
    }

    get(): Indices {
        return this.state;
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        
        this.child.layout(left, top, width, height);
    }
};

type Indices<T extends any[]> = Exclude<Partial<T>["length"], T["length"]> & number;

export function Switch<Children extends WPHPLayout<any, any>[]>(i: Indices<Children>, ...children: Children): SwitchLayout<Indices<Children>> {
    return new SwitchLayout(i, children);
}

export type MuxKey = string | number | symbol;

function muxElements(enabled: Set<MuxKey>, es: Array<[MuxKey, WPHPLayout<any, any>]>): Array<WPHPLayout<any, any>> {
    const res = [];
    for (const [k, v] of es) {
        if (enabled.has(k)) {
            res.push(v);
        }
    }
    return res;
}

class MuxLayout<K extends MuxKey> extends WPHPLayout<StaticArray<WPHPLayout<any, any>>, undefined> {
    private enabled: Set<K>;
    private mux: Array<[K, WPHPLayout<any, any>]>;

    constructor(enabled: Set<K>, children: Array<[K, WPHPLayout<any, any>]>) {
        super(undefined, muxElements(enabled, children));
        this.enabled = enabled;
        this.mux = children;
    }

    set(ec: ElementContext, ...enable: Array<K>) {
        const enabled = new Set(enable);
        for (const [k, v] of this.mux) {
            if (this.enabled.has(k) && !enabled.has(k)) {
                callDetachListeners(v);
            }
        }
        this.enabled = enabled;
        this.child = muxElements(this.enabled, this.mux);
        ec.requestLayout();
    }

    get(): Set<K> {
        return this.enabled;
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        for (const child of this.child) {
            child.layout(left, top, width, height);
        }
    }
};

export function Mux<Key extends MuxKey, EnabledKey extends Key>(enabled: Array<EnabledKey>, ...children: Array<[Key, WPHPLayout<any, any>]>): MuxLayout<Key> {
    return new MuxLayout<typeof children[number][0]>(new Set(enabled), children);
}

export class PositionLayout<Child extends WPHPLayout<any, any> | undefined, State> extends Element<"pos", Child, State> {
    requestLeft: number;
    requestTop: number;
    requestWidth: number;
    requestHeight: number;

    constructor(left: number, top: number, width: number, height: number, state: State, child: Child) {
        super("pos", state, child);
        this.requestLeft = left;
        this.requestTop = top;
        this.requestWidth = width;
        this.requestHeight = height;
    }
    layout(parent: LayoutBox) {
        this.width = Math.min(this.requestWidth, parent.width);
        this.left = clamp(this.requestLeft, parent.left, parent.left + parent.width - this.width);
        this.height = Math.min(this.requestHeight, parent.height);
        this.top = clamp(this.requestTop, parent.top, parent.top + parent.height - this.height);

        if (this.child !== undefined) {
            this.child.layout(this.left, this.top, this.width, this.height);
        }
    }
};

// TODO: support statically sized children, 
export function Position(left: number, top: number, width: number, height: number): PositionLayout<undefined, undefined>;
export function Position<State>(left: number, top: number, width: number, height: number, state: State): PositionLayout<undefined, State>;
export function Position(left: number, top: number, width: number, height: number, child: WPHPLayout<any, any>): PositionLayout<WPHPLayout<any, any>, undefined>;
export function Position<State>(left: number, top: number, width: number, height: number, state: State, child: WPHPLayout<any, any>): PositionLayout<WPHPLayout<any, any>, State>;
export function Position<State>(left: number, top: number, width: number, height: number, first?: State | WPHPLayout<any, any>, second?: WPHPLayout<any, any>) {
    if (second === undefined) {
        if (first === undefined) {
            return new PositionLayout<undefined, undefined>(left, top, width, height, undefined, undefined);
        } else if (first instanceof Element) {
            return new PositionLayout<WPHPLayout<any, any>, undefined>(left, top, width, height, undefined, first);
        } else {
            return new PositionLayout<undefined, State>(left, top, width, height, first, undefined);
        }
    } else {
        return new PositionLayout<WPHPLayout<any, any>, State>(left, top, width, height, first as State, second);
    }
}

export function Draggable(left: number, top: number, width: number, height: number, child?: WPHPLayout<any, any>) {
    const layout = new PositionLayout<any, undefined>(left, top, width, height, undefined, child);
    return layout.onPan((ps: Array<PanPoint>, ec: ElementContext) => {
        let dx = 0;
        let dy = 0;
        for (const p of ps) {
            dx += p.curr[0] - p.prev[0];
            dy += p.curr[1] - p.prev[1];
        }
        dx /= ps.length;
        dy /= ps.length;
        layout.requestLeft += dx;
        layout.requestTop += dy;
        ec.requestLayout();
    }).onPanEnd(() => {
        // The requested location can be outside the allowed bounds if dragged outside,
        // but once the drag is over, we want to reset it so that it doesn't start there
        // once a new drag start.
        layout.requestLeft = layout.left;
        layout.requestTop = layout.top;
    });
}


// TODO: does it make sense to make other layout types?
// class WSHSRelativeLayout extends WSHSLayout<StaticArray<PositionLayout>> {
//     constructor(width: number, height: number, children: StaticArray<PositionLayout>) {
//         super(children);
//         this.width = width;
//         this.height = height;
//     }
//     layout(left: number, top: number): void {
//         this.left = left;
//         this.top = top;

//         for (const child of this.child) {
//             child.layout(this /* LayoutBox */);
//         }
//     }
// };

class WPHPRelativeLayout<State> extends WPHPLayout<StaticArray<PositionLayout<any, any>>, State> {
    constructor(state: State, children: StaticArray<PositionLayout<any, any>>) {
        super(state, children);
    }
    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        for (const child of this.child) {
            child.layout(this /* LayoutBox */);
        }
    }
}
export function Relative(...children: Array<PositionLayout<any, any>>): WPHPRelativeLayout<undefined>;
export function Relative<State>(state: State, ...children: Array<PositionLayout<any, any>>): WPHPRelativeLayout<State>;
export function Relative<State>(first: State | PositionLayout<any, any>, ...children: Array<PositionLayout<any, any>>): WPHPRelativeLayout<undefined> | WPHPRelativeLayout<State> {
    if (first instanceof Element) {
        return new WPHPRelativeLayout<undefined>(undefined, [first, ...children]);
    }
    return new WPHPRelativeLayout<State>(first, children);
}
