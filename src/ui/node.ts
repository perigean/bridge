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

export interface ElementContext {
    requestDraw(): void;
    requestLayout(): void;
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

abstract class WPHPLayout<Child extends ChildConstraint<any>, State> extends Element<'wphp', Child, State> {
    constructor(state: State, child: Child) {
        super('wphp', state, child);
    }
    abstract layout(left: number, top: number, width: number, height: number): void;
};

abstract class WPHSLayout<Child extends ChildConstraint<any>, State> extends Element<'wphs', Child, State> {
    constructor(state: State, child: Child) {
        super('wphs', state, child);
    }
    abstract layout(left: number, top: number, width: number): void;
};

abstract class WSHPLayout<Child extends ChildConstraint<any>, State> extends Element<'wshp', Child, State> {
    constructor(state: State, child: Child) {
        super('wshp', state, child);
    }
    abstract layout(left: number, top: number, height: number): void;
};

abstract class WSHSLayout<Child extends ChildConstraint<any>, State> extends Element<'wshs', Child, State> {
    constructor(state: State, child: Child) {
        super('wshs', state, child);
    }
    abstract layout(left: number, top: number): void;
};

export type LayoutHasWidthAndHeight = WSHSLayout<any, any>;
export type LayoutTakesWidthAndHeight = WPHPLayout<any, any>;

/*
class FlexLayout<State> extends Element<'flex', WPHPLayout<any, any>, State> {
    size: number;
    grow: number;
    constructor(size: number, grow: number, state: State, child: WPHPLayout<any, any>) {
        super('flex', state, child);
        this.size = size;
        this.grow = grow;
    }
    layout(left:number, top: number, width: number, height: number) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        this.child.layout(left, top, width, height);
    }
};
*/
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

class Debouncer {
    bounce: () => void;
    timeout: number | undefined;

    constructor(f: () => void) {
        this.bounce = () => {
            if (this.timeout === undefined) {
                this.timeout = setTimeout(() => {
                    this.timeout = undefined;
                    f();
                }, 0);
            }
        };
    }

    clear() {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
    }
};

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

export class RootLayout implements ElementContext {
    child: WPHPLayout<any, any>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    resize: ResizeObserver;
    vp: LayoutBox;

    // TODO: we should not rerender if there are pending layout requests.
    debounceLayout: Debouncer;
    debounceDraw: Debouncer;

    private touchTargets: Map<number, HasTouchHandlers<any> | TARGET_ROOT | TARGET_NONE>;
    private touchTargetDetached: OnDetachHandler<any>;
    private touchStart: (evt: TouchEvent) => void; 
    private touchMove: (evt: TouchEvent) => void;
    private touchEnd: (evt: TouchEvent) => void;

    constructor(canvas: HTMLCanvasElement, child: WPHPLayout<any, any>) {
        this.child = child;
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", {alpha: false});
        if (ctx === null) {
            throw new Error("failed to get 2d context");
        }
        this.ctx = ctx;
        this.resize = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length !== 1) {
                throw new Error(`ResizeObserver expects 1 entry, got ${entries.length}`);
            }
            const content = entries[0].contentRect;
            const vp = this.vp;
            vp.left = 0;
            vp.top = 0;
            vp.width = content.width;
            vp.height = content.height
            canvas.width = vp.width * window.devicePixelRatio;
            canvas.height = vp.height * window.devicePixelRatio;
            ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            
            this.debounceLayout.clear();
            this.child.layout(0, 0, vp.width, vp.height);
            this.debounceDraw.clear();
            clearAndDrawElementTree(ctx, this.child, this /* ElementContext */, vp);
        });
        this.resize.observe(canvas, {box: "device-pixel-content-box"});
        this.vp = {
            left: 0,
            top: 0,
            width: canvas.width,
            height: canvas.height,
        };

        this.debounceLayout = new Debouncer(() => {
            this.child.layout(0, 0, this.vp.width, this.vp.height);
            this.requestDraw();
        });
        this.requestLayout = this.debounceLayout.bounce;

        this.debounceDraw = new Debouncer(() => {
            clearAndDrawElementTree(ctx, this.child, this /* ElementContext */, this.vp);
        });
        this.requestDraw = this.debounceDraw.bounce;

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
                    target.onTouchBeginHandler(t.identifier, p, this /* ElementContext */, target.state);
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
                target.onTouchMoveHandler(ts, this /* ElementContext */, target.state);
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
                    target.onTouchEndHandler(id, this /* ElementContext */, target.state);
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

        this.requestLayout();
    }

    disconnect() {
        this.resize.disconnect();
        this.debounceDraw.clear();
        this.debounceLayout.clear();
        callDetachListeners(this.child);

        this.canvas.removeEventListener("touchstart", this.touchStart, false);
        this.canvas.removeEventListener("touchmove", this.touchMove, false);
        this.canvas.removeEventListener("touchend", this.touchEnd, false);
        this.canvas.removeEventListener("touchcancel", this.touchEnd, false);
    }

    ////////////////////////////////////////////////////////////////////////////
    // ElementContext functions
    ////////////////////////////////////////////////////////////////////////////
    requestDraw: () => void;
    requestLayout: () => void;

    ////////////////////////////////////////////////////////////////////////////
    // TouchHandler functions
    ////////////////////////////////////////////////////////////////////////////
    // TODO: add TouchForwarder here. install touch handlers
};

// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures

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
            if (this.scroller.width < this.width / this.zoom) {
                this.zoom = this.width / this.scroller.width;
            }
            if (this.scroller.height < this.height / this.zoom) {
                this.zoom = this.height / this.scroller.height;
            }
            if (this.zoom > this.zoomMax) {
                this.zoom = this.zoomMax;
            }
            const cm = this.p2c([
                (ts[0].curr[0] + ts[1].curr[0]) * 0.5,
                (ts[0].curr[1] + ts[1].curr[1]) * 0.5,
            ]);
            this.scroll[0] += pm[0] - cm[0];
            this.scroll[1] += pm[1] - cm[1];
        }
        this.scroll[0] = clamp(this.scroll[0], 0, this.scroller.width - this.width / this.zoom);
        this.scroll[1] = clamp(this.scroll[1], 0, this.scroller.height - this.height / this.zoom);
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
        // TODO: min zoom;
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

        this.scroller.layout(0, 0);
    }
}

export function Scroll(child: WSHSLayout<any, any>, scroll?: Point2D, zoom?: number, zoomMax?: number): ScrollLayout {
    // NB: scale of 0 is invalid anyways, so it's OK to be falsy.
    return new ScrollLayout(child, scroll || [0, 0], zoom || 1, zoomMax || 10);
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
/*
class LeftHSLayout<State> extends WPHSLayout<WSHSLayout<any, any>, State> {
    constructor(state: State, child: WSHSLayout<any, any>) {
        super(state, child);
        this.height = child.height;
    }

    layout(left: number, top: number, width: number): void {
        const child = this.child;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(left, top);
    }
};

class LeftStackLayout<State> extends WPHPLayout<StaticArray<WSHPLayout<any, any>>, State> {
    constructor(state: State, children: StaticArray<WSHPLayout<any, any>>) {
        super(state, children);
    }
    layout(left: number, top: number, width: number, height: number): void {
        const children = this.child;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        let childLeft = left;
        for (const child of children) {
            child.layout(childLeft, top, height);
            childLeft += child.width;
        }
    }
};

class LeftFlexLayout<State> extends WPHPLayout<StaticArray<FlexLayout<any>>, State> {
    constructor(state: State, children: StaticArray<FlexLayout<any>>) {
        super(state, children);
    }
    layout(left: number, top: number, width: number, height: number): void {
        const children = this.child;
        let sizeSum = 0;
        let growSum = 0;
        for (const child of children) {
            sizeSum += child.size;
            growSum += child.grow;
        }
        const extra = width - sizeSum;
        let childLeft = left;
        for (const child of children) {
            const childWidth = child.size + child.grow * extra / growSum;
            child.layout(childLeft, top, childWidth, height);
            childLeft += child.size;
        }
    }
}

export function Left(child: WSHSLayout<any>): WPHSLayout<any>;
export function Left(child0: WSHPLayout<any>, ...childRest: Array<WSHPLayout<any>>): WPHPLayout<any>;
export function Left(child0: FlexLayout, ...childRest: Array<FlexLayout>): WPHPLayout<any>;
export function Left(child: WSHSLayout<any> | WSHPLayout<any> | FlexLayout, ..._: Array<WSHPLayout<any>> | Array<FlexLayout>): WPHSLayout<any> | WPHPLayout<any> {
    switch (child.layoutType) {
        case 'flex':
            return new LeftFlexLayout(arguments);
        case 'wshp':
            return new LeftStackLayout(arguments);
        case 'wshs':
            return new LeftHSLayout(child);
    }
}

class RightHPLayout extends WPHPLayout<WSHPLayout<any>> {
    constructor(child: WSHPLayout<any>) {
        super(child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = width - child.width;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, top, height);
    }
};

class RightHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
        this.height = child.height;
    }

    layout(left: number, top: number, width: number): void {
        const child = this.child;
        const childLeft = width - child.width;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(childLeft, top);
    }
};

export function Right(child: WSHSLayout<any>): RightHSLayout;
export function Right(child: WSHPLayout<any>): RightHPLayout;
export function Right(child: WSHSLayout<any> | WSHPLayout<any>): RightHSLayout | RightHPLayout {
    if (child.layoutType === 'wshp') {
        return new RightHPLayout(child);
    } else {
        return new RightHSLayout(child);
    }
}
*/

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

// TODO: Top, Bottom

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
