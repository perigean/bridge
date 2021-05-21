// Copyright Charles Dick 2021

import { Point2D, pointDistance } from "../point.js"

export type LayoutBox = {
    left: number;
    top: number;
    width: number;
    height: number;
};

// TODO: Pass ElementContext along with layout, so that we can have dynamic layouts.

export interface ElementContext {
    requestDraw(): void;
    requestLayout(): void;
};

type StatelessHandler = (ec: ElementContext) => void;
export type OnDetachHandler = (e: Element<any, any>) => void;
export type OnDrawHandler = (ctx: CanvasRenderingContext2D, box: LayoutBox, ec: ElementContext, vp: LayoutBox) => void;

type OnTouchBeginHandler = (id: number, p: Point2D, ec: ElementContext) => void;
type TouchMove = {
    readonly id: number;
    readonly p: Point2D;
};
type OnTouchMoveHandler = (ts: Array<TouchMove>, ec: ElementContext) => void;
type OnTouchEndHandler = (id: number, ec: ElementContext) => void;

export type OnTapHandler = (p: Point2D, ec: ElementContext) => void;
export type PanPoint = {
    prev: Point2D;
    curr: Point2D;
};
export type OnPanHandler = (ps: Array<PanPoint>, ec: ElementContext) => void;
// TODO: Pass touch size down with touch events (instead of scale?)
// Is that enough? Probably we will always want a transoformation matrix.
// But enough for now, so just do that.

class TouchGesture {
    onTapHandler?: OnTapHandler;
    onPanHandler?: OnPanHandler;
    onPanBeginHandler?: StatelessHandler;
    onPanEndHandler?: StatelessHandler;

    private active: Map<number, Point2D>;
    private pans: Map<number, PanPoint>;
    readonly onTouchBeginHandler: OnTouchBeginHandler;
    readonly onTouchMoveHandler: OnTouchMoveHandler;
    readonly onTouchEndHandler: OnTouchEndHandler;
    
    constructor() {
        this.active = new Map();
        this.pans = new Map();
        this.onTouchBeginHandler = (id: number, p: Point2D, _: ElementContext) => {
            this.active.set(id, p);
        };
        this.onTouchMoveHandler = (ts: TouchMove[], ec: ElementContext) => {
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
                        this.onPanBeginHandler(ec);
                    }
                    this.pans.set(t.id, {
                        prev: p.curr,
                        curr: t.p,
                    });
                }
            }
            if (this.pans.size > 0 && this.onPanHandler !== undefined) {
                this.onPanHandler([...this.pans.values()], ec);
            }
        };
        this.onTouchEndHandler = (id: number, ec: ElementContext) => {
            const a = this.active.get(id);
            if (a !== undefined && this.onTapHandler !== undefined) {
                this.onTapHandler(a, ec);
            }
            this.active.delete(id);
            if (this.pans.delete(id) && this.pans.size === 0 && this.onPanEndHandler !== undefined) {
                this.onPanEndHandler(ec);
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

type ChildConstraint<LayoutType extends string> = Element<LayoutType, any> | StaticArray<Element<LayoutType, any>> | undefined;

function initTouchGesture(e: Element<any, any>): TouchGesture {
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

class Element<LayoutType extends string, Child extends ChildConstraint<string>> {
    layoutType: LayoutType;
    child: Child;
    left: number;
    top: number;
    width: number;
    height: number;

    constructor(layoutType: LayoutType, child: Child) {
        this.layoutType = layoutType;
        this.child = child;
        this.left = NaN;
        this.top = NaN;
        this.width = NaN;
        this.height = NaN;
    }

    onDrawHandler?: OnDrawHandler;
    onDraw(handler: OnDrawHandler): this {
        if (this.onDrawHandler !== undefined) {
            throw new Error('onDraw already set');
        }
        this.onDrawHandler = handler;
        return this;
    }

    onTouchBeginHandler?: OnTouchBeginHandler;
    onTouchMoveHandler?: OnTouchMoveHandler;
    onTouchEndHandler?: OnTouchEndHandler;

    touchGesture?: TouchGesture;
    onTap(handler: OnTapHandler): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onTapHandler !== undefined) {
            throw new Error('onTap already set');
        }
        this.touchGesture.onTapHandler = handler;
        return this;
    }
    onPan(handler: OnPanHandler): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanHandler !== undefined) {
            throw new Error('onPan already set');
        }
        this.touchGesture.onPanHandler = handler;
        return this;
    }
    onPanBegin(handler: StatelessHandler): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanBeginHandler !== undefined) {
            throw new Error('onPanBegin already set');
        }
        this.touchGesture.onPanBeginHandler = handler;
        return this;
    }
    onPanEnd(handler: StatelessHandler): this {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanEndHandler !== undefined) {
            throw new Error('onPanEnd already set');
        }
        this.touchGesture.onPanEndHandler = handler;
        return this;
    }

    onDetachHandler?: OnDetachHandler | Array<OnDetachHandler>;
    onDetach(handler: OnDetachHandler): this {
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
    removeOnDetach(handler: OnDetachHandler): void {
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

export function addChild(e: Element<any, StaticArray<Element<any, any>>>, child: Element<any, any>, ec: ElementContext, index?: number) {
    const children = new Array<Element<any, any>>(e.child.length + 1);
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

function callDetachListeners(root: Element<any, any>) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (Array.isArray(e.onDetachHandler)) {
            for (const handler of e.onDetachHandler) {
                handler(e);
            }
        } else if (e.onDetachHandler !== undefined) {
            e.onDetachHandler(e);
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

export function removeChild(e: Element<any, StaticArray<Element<any, any>>>, index: number, ec: ElementContext) {
    const children = new Array<Element<any, any>>(e.child.length - 1);
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

abstract class WPHPLayout<Child extends ChildConstraint<any>> extends Element<'wphp', Child> {
    constructor(child: Child) {
        super('wphp', child);
    }
    abstract layout(left: number, top: number, width: number, height: number): void;
};

abstract class WPHSLayout<Child extends ChildConstraint<any>> extends Element<'wphs', Child> {
    constructor(child: Child) {
        super('wphs', child);
    }
    abstract layout(left: number, top: number, width: number): void;
};

abstract class WSHPLayout<Child extends ChildConstraint<any>> extends Element<'wshp', Child> {
    constructor(child: Child) {
        super('wshp', child);
    }
    abstract layout(left: number, top: number, height: number): void;
};

abstract class WSHSLayout<Child extends ChildConstraint<any>> extends Element<'wshs', Child> {
    constructor(child: Child) {
        super('wshs', child);
    }
    abstract layout(left: number, top: number): void;
};

export type LayoutHasWidthAndHeight = WSHSLayout<any>;
export type LayoutTakesWidthAndHeight = WPHPLayout<any>;


class FlexLayout extends Element<'flex', WPHPLayout<any>> {
    size: number;
    grow: number;
    constructor(size: number, grow: number, child: WPHPLayout<any>) {
        super('flex', child);
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

function drawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any>, ec: ElementContext, vp: LayoutBox) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (e.onDrawHandler) {
            e.onDrawHandler(ctx, e, ec, vp);
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

function clearAndDrawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any>, ec: ElementContext, vp: LayoutBox) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
    drawElementTree(ctx, root, ec, vp);
}

type HasTouchHandlers = {
    onTouchBeginHandler: OnTouchBeginHandler;
    onTouchMoveHandler: OnTouchMoveHandler;
    onTouchEndHandler: OnTouchEndHandler;
} & Element<any, any>;

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

function findTouchTarget(root: Element<any, any>, p: Point2D): undefined | HasTouchHandlers {
    const stack = [root];
    const x = p[0];
    const y = p[1];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (x < e.left || x >= e.left + e.width || y < e.top || y >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e.onTouchBeginHandler !== undefined && e.onTouchMoveHandler !== undefined && e.onTouchEndHandler !== undefined) {
            return e as HasTouchHandlers; // TODO: Why can't type inference figure this out?
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
    child: WPHPLayout<any>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    resize: ResizeObserver;
    vp: LayoutBox;

    // TODO: we should not rerender if there are pending layout requests.
    debounceLayout: Debouncer;
    debounceDraw: Debouncer;

    private touchTargets: Map<number, HasTouchHandlers | TARGET_ROOT | TARGET_NONE>;
    private touchTargetDetached: OnDetachHandler;
    private touchStart: (evt: TouchEvent) => void; 
    private touchMove: (evt: TouchEvent) => void;
    private touchEnd: (evt: TouchEvent) => void;

    constructor(canvas: HTMLCanvasElement, child: WPHPLayout<any>) {
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
        this.touchTargetDetached = (e: Element<any, any>) => {
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
                    target.onTouchBeginHandler(t.identifier, p, this /* ElementContext */);
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
            const targets = new Map<HasTouchHandlers, Array<TouchMove>>();
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
                target.onTouchMoveHandler(ts, this /* ElementContext */);
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
                    target.onTouchEndHandler(id, this /* ElementContext */);
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

class ScrollLayout extends WPHPLayout<undefined> {
    // ScrollLayout has to intercept all events to make sure any locations are updated by
    // the scroll position, so child is undefined, and all events are forwarded to scroller.
    scroller: WSHSLayout<any>;
    scroll: Point2D;
    zoom: number;
    zoomMax: number;
    private touchTargets: Map<number, HasTouchHandlers | TARGET_ROOT | TARGET_NONE>;
    private touchScroll: Map<number, { prev: Point2D, curr: Point2D }>;
    private touchTargetDetached: OnDetachHandler;

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

    constructor(child: WSHSLayout<any>, scroll: Point2D, zoom: number, zoomMax: number) {
        // TODO: min zoom;
        super(undefined);
        this.scroller = child;
        this.scroll = scroll;
        this.zoom = zoom;
        this.zoomMax = zoomMax;
        this.touchTargets = new Map();
        this.touchScroll = new Map();
        this.touchTargetDetached = (e: Element<any, any>) => {
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
                target.onTouchBeginHandler(id, cp, ec);
            }
        };
        this.onTouchMoveHandler = (ts: Array<TouchMove>, ec: ElementContext) => {
            const targets = new Map<HasTouchHandlers, Array<TouchMove>>();
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
                target.onTouchMoveHandler(tts, ec);
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
                    target.onTouchEndHandler(id, ec);
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

export function Scroll(child: WSHSLayout<any>, scroll?: Point2D, zoom?: number, zoomMax?: number): ScrollLayout {
    // NB: scale of 0 is invalid anyways, so it's OK to be falsy.
    return new ScrollLayout(child, scroll || [0, 0], zoom || 1, zoomMax || 10);
}

// TODO: scrollx, scrolly

class BoxLayout extends WSHSLayout<undefined> {
    constructor(width: number, height: number) {
        super(undefined);
        this.width = width;
        this.height = height;
    }
    layout(left: number, top: number): void {
        this.left = left;
        this.top = top;
    }
};

class BoxWithChildLayout extends WSHSLayout<WPHPLayout<any>> {
    constructor(width: number, height: number, child:WPHPLayout<any>) {
        super(child);
        this.width = width;
        this.height = height;
    }

    layout(left: number, top: number): void {
        this.left = left;
        this.top = top;
        this.child.layout(left, top, this.width, this.height);
    }
};

export function Box(width: number, height: number, child?: WPHPLayout<any>): WSHSLayout<any> {
    if (child !== undefined) {
        return new BoxWithChildLayout(width, height, child);
    }
    return new BoxLayout(width, height);
}

class WPHPBorderLayout extends WPHPLayout<WPHPLayout<any>> {
    border: number;
    style: string | CanvasGradient | CanvasPattern;
    constructor(child: WPHPLayout<any>, border: number, style: string | CanvasGradient | CanvasPattern) {
        super(child);
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

export function Border(width: number, style: string | CanvasGradient | CanvasPattern, child: WPHPLayout<any>): WPHPLayout<any> {
    return new WPHPBorderLayout(child, width, style);
}

class FillLayout extends WPHPLayout<undefined> {
    constructor() {
        super(undefined);
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
}

export function Fill(): FillLayout {
    return new FillLayout();
}

class CenterLayout extends WPHPLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
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

export function Center(child: WSHSLayout<any>): CenterLayout {
    return new CenterLayout(child);
}

class HCenterHPLayout extends WPHPLayout<WSHPLayout<any>> {
    constructor(child: WSHPLayout<any>) {
        super(child);
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

class HCenterHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
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

export function HCenter(child: WSHSLayout<any>): HCenterHSLayout;
export function HCenter(child: WSHPLayout<any>): HCenterHPLayout;
export function HCenter(child: WSHSLayout<any> | WSHPLayout<any>): HCenterHSLayout | HCenterHPLayout {
    if (child.layoutType === 'wshp') {
        return new HCenterHPLayout(child);
    } else {
        return new HCenterHSLayout(child);
    }
}

class VCenterWPLayout extends WPHPLayout<WPHSLayout<any>> {
    constructor(child: WPHSLayout<any>) {
        super(child);
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

class VCenterWSLayout extends WSHPLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
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

export function VCenter(child: WSHSLayout<any>): VCenterWSLayout;
export function VCenter(child: WPHSLayout<any>): VCenterWPLayout;
export function VCenter(child: WSHSLayout<any> | WPHSLayout<any>): VCenterWSLayout | VCenterWPLayout {
    if (child.layoutType === 'wphs') {
        return new VCenterWPLayout(child);
    } else {
        return new VCenterWSLayout(child);
    }
}

class LeftHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
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

class LeftStackLayout extends WPHPLayout<StaticArray<WSHPLayout<any>>> {
    constructor(children: StaticArray<WSHPLayout<any>>) {
        super(children);
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

class LeftFlexLayout extends WPHPLayout<StaticArray<FlexLayout>> {
    constructor(children: StaticArray<FlexLayout>) {
        super(children);
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


export function DebugTouch(width: number, height: number, fill: string | CanvasGradient | CanvasPattern, stroke: string | CanvasGradient | CanvasPattern): BoxLayout {
    const taps: Array<Point2D> = [];
    const pans: Array<Array<PanPoint>> = [];
    return Box(
        width,
        height,
    ).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.fillRect(box.left, box.top, box.width, box.height);
        ctx.beginPath();
        for (const tap of taps) {
            ctx.moveTo(tap[0] + 16, tap[1]);
            ctx.ellipse(tap[0], tap[1], 16, 16, 0, 0, 2 * Math.PI);
        }
        for (const ps of pans) {
            for (const p of ps) {
                ctx.moveTo(p.prev[0], p.prev[1]);
                ctx.lineTo(p.curr[0], p.curr[1]);
            }
        }
        ctx.stroke();
    }).onTap((p: Point2D, ec: ElementContext) => {
        taps.push(p);
        ec.requestDraw();
    }).onPan((ps: Array<PanPoint>, ec: ElementContext) => {
        pans.push(ps);
        ec.requestDraw();
    });
}

// TODO: Top, Bottom

class LayerLayout extends WPHPLayout<StaticArray<WPHPLayout<any>>> {
    constructor(children: StaticArray<WPHPLayout<any>>) {
        super(children);
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

export function Layer(...children: Array<WPHPLayout<any>>): LayerLayout {
    return new LayerLayout(children);
}


export class PositionLayout extends Element<"pos", WPHPLayout<any> | undefined> {
    requestLeft: number;
    requestTop: number;
    requestWidth: number;
    requestHeight: number;

    constructor(left: number, top: number, width: number, height: number, child: WPHPLayout<any> | undefined) {
        super("pos", child);
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
export function Position(left: number, top: number, width: number, height: number, child?: WPHPLayout<any>) {
    return new PositionLayout(left, top, width, height, child);
}

export function Draggable(left: number, top: number, width: number, height: number, child?: WPHPLayout<any>) {
    const layout = new PositionLayout(left, top, width, height, child);
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

class WPHPRelativeLayout extends WPHPLayout<StaticArray<PositionLayout>> {
    constructor(children: StaticArray<PositionLayout>) {
        super(children);
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

export function Relative(...children: Array<PositionLayout>): WPHPRelativeLayout {
    return new WPHPRelativeLayout(children);
}
