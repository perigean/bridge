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
    // TODO: requestRender?
};

type OnAttachHandler = (ec: ElementContext) => void;
type OnDrawHandler = (ctx: CanvasRenderingContext2D, box: LayoutBox, ec: ElementContext, vp: LayoutBox) => void;
type OnTouchBeginHandler = (id: number, p: Point2D, ec: ElementContext) => void;
type TouchMove = {
    readonly id: number;
    readonly p: Point2D;
};
type OnTouchMoveHandler = (ts: Array<TouchMove>, ec: ElementContext) => void;
type OnTouchEndHandler = (id: number, ec: ElementContext) => void;

type OnTapHandler = (p: Point2D, ec: ElementContext) => void;
type PanPoint = {
    prev: Point2D;
    curr: Point2D;
};
type OnPanHandler = (ps: Array<PanPoint>, ec: ElementContext) => void;
// TODO: Pass touch size down with touch events (instead of scale?)
// Is that enough? Probably we will always want a transoformation matrix.
// But enough for now, so just do that.

class TouchGesture {
    onTapHandler?: OnTapHandler;
    onPanHandler?: OnPanHandler;

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
            this.pans.delete(id);
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
        if (this.touchGesture === undefined) {
            const tc = new TouchGesture();
            this.touchGesture = tc;
            this.onTouchBeginHandler = tc.onTouchBeginHandler;
            this.onTouchMoveHandler = tc.onTouchMoveHandler;
            this.onTouchEndHandler = tc.onTouchEndHandler;
        }
        if (this.touchGesture.onTapHandler !== undefined) {
            throw new Error('onTap already set');
        }
        this.touchGesture.onTapHandler = handler;
        return this;
    }
    onPan(handler: OnPanHandler): this {
        if (this.touchGesture === undefined) {
            this.touchGesture = new TouchGesture();
        }
        if (this.touchGesture.onPanHandler !== undefined) {
            throw new Error('onPan already set');
        }
        this.touchGesture.onPanHandler = handler;
        return this;
    }

    onAttachHandler?: OnAttachHandler;
    onAttach(handler: OnAttachHandler): this {
        if (this.onAttachHandler !== undefined) {
            throw new Error(`onAttach already set`);
        }
        this.onAttachHandler = handler;
        return this;
    }

    onDetachHandler?: OnAttachHandler;
    onDetach(handler: OnAttachHandler): this {
        if (this.onDetachHandler !== undefined) {
            throw new Error(`onDetach already set`);
        }
        this.onDetachHandler = handler;
        return this;
    }
};

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

function callAttachHandlers(root: Element<any, any>, handler: "onAttachHandler" | "onDetachHandler", ec: ElementContext) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        const h = e[handler];
        if (h !== undefined) {
            h(ec);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            // Push last child on first, so we visit it last.
            for (let i = e.child.length - 1; i >= 0; i--) {
                stack.push(e.child[i]);
            }
        } else {
            stack.push(e.child);
        }
    }
}

function drawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any>, ec: ElementContext, vp: LayoutBox) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
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

interface HasTouchHandlers {
    onTouchBeginHandler: OnTouchBeginHandler;
    onTouchMoveHandler: OnTouchMoveHandler;
    onTouchEndHandler: OnTouchEndHandler;
};

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
        }
    }
};

function findTouchTarget(root: Element<any, any>, p: Point2D): undefined | HasTouchHandlers {
    const stack = [root];
    const x = p[0];
    const y = p[1];
    let target: undefined | HasTouchHandlers = undefined;
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (x < e.left || x >= e.left + e.width || y < e.top || y >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e.onTouchBeginHandler !== undefined && e.onTouchMoveHandler !== undefined && e.onTouchEndHandler !== undefined) {
            target = e as HasTouchHandlers; // TODO: Why can't type inference figure this out?
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
    return target;
}

/*
class TouchForward {
    private root: Element<any, any>;
    private targets: Map<number, HasTouchHandlers>;
    private defaultBegin?: OnTouchBeginHandler;
    private defaultMove?: OnTouchMoveHandler;
    private defaultEnd?: OnTouchEndHandler;
    
    // TODO: This has to be updated 
    private p2c: Affine2D;

    readonly onTouchBeginHandler: OnTouchBeginHandler;
    readonly onTouchMoveHandler: OnTouchMoveHandler;
    readonly onTouchEndHandler: OnTouchEndHandler;

    constructor(root: Element<any, any>, p2c: Affine2D) {
        this.root = root;
        this.targets = new Map();
        this.p2c = p2c;

        this.onTouchBeginHandler = (id: number, p: Point2D, ec: ElementContext) => {
            if (this.targets.has(id)) {
                throw new Error(`Touch begin for existing ID ${id}`);
            }
            const target = findTouchTarget(this.root, p);
            if (target !== undefined) {
                this.targets.set(id, target);
                const cp = transformPoint(this.p2c, p);
                target.onTouchBeginHandler(id, cp, ec);
            } else if (this.defaultBegin !== undefined) {
                this.defaultBegin(id, p, ec);
            }
        };
        this.onTouchMoveHandler = (ts: Array<TouchMove>, ec: ElementContext) => {
            const ttsMap = new Map<number, Array<TouchMove>>();
            for (const t of ts) {
                const ct = {
                    id: t.id,
                    p: transformPoint(this.p2c, t.p),
                }
                const existing = ttsMap.get(t.id);
                if (existing !== undefined) {
                    existing.push(ct);
                } else {
                    ttsMap.set(t.id, [ct]);
                }
            }
            for (const [id, tts] of ttsMap) {
                const target = this.targets.get(id);
                if (target !== undefined) {
                    target.onTouchMoveHandler(tts, ec);
                } else if (this.defaultMove !== undefined) {
                    // TODO: this needs to be called before we transform the points.
                    this.defaultMove(ts, ec);
                }
            }
        };
        this.onTouchEndHandler = (id: number, ec: ElementContext) => {
            const target = this.targets.get(id);
            this.targets.delete(id);
            if (target !== undefined) {
                target.onTouchEndHandler(id, ec);
            } else if (this.defaultEnd !== undefined) {
                this.defaultEnd(id, ec);
            }
        };
    }
};
*/

export class RootLayout implements ElementContext {
    child: WPHPLayout<any>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    resize: ResizeObserver;
    vp: LayoutBox;

    // TODO: we should not rerender if there are pending layout requests.
    debounceLayout: Debouncer;
    debounceDraw: Debouncer;

    private touchTargets: Map<number, HasTouchHandlers | null>;
    private touchStart: (evt: TouchEvent) => void; 
    private touchMove: (evt: TouchEvent) => void;
    private touchEnd: (evt: TouchEvent) => void;
    

    constructor(canvas: HTMLCanvasElement, child: WPHPLayout<any>) {
        this.child = child;
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", {alpha: false, desynchronized: true});
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
            drawElementTree(ctx, this.child, this /* ElementContext */, vp);
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
            drawElementTree(ctx, this.child, this /* ElementContext */, this.vp);
        });
        this.requestDraw = this.debounceDraw.bounce;

        this.touchTargets = new Map();
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
                    this.touchTargets.set(t.identifier, null);
                    // Add placeholder to active targets map so we know anbout it.
                    // Allow default action, so e.g. page can be scrolled.
                } else {
                    preventDefault = true;
                    this.touchTargets.set(t.identifier, target);
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
                } else if (target !== null) {
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
                if (target !== null) {
                    preventDefault = true;
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

        callAttachHandlers(this.child, "onAttachHandler", this /* ElementContext */);
        this.requestLayout();
    }

    disconnect() {
        this.resize.disconnect();
        this.debounceDraw.clear();
        this.debounceLayout.clear();
        // TODO: detach all children.

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

// TODO: make som WPHPLayout that positions all children with absolute coordinates.
// Probably needs a new child type that includes left, top.
// TODO: Make it pan (have a provided size)
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures
/*
class ScrollLayout extends WPHPLayout<undefined> {
    // ScrollLayout has to intercept all events to make sure any locations are updated by
    // the scroll position, so child is undefined, and all events are forwarded to scroller.
    scroller: WSHSLayout<any>;
    scrollX: number;
    scrollY: number;
    // Panning contains a info on the active pans. If value is not null, e is a child of scroller.
    // If value is null, then it is an existing pan that is captured by this ScrollLayout.
    panning: Map<number, ScrollerPanning>;

    constructor(child: WSHSLayout<any>, scrollX?: number, scrollY?: number) {
        super(undefined);
        this.scroller = child;
        this.scrollX = scrollX || 0;
        this.scrollY = scrollY || 0;
        this.panning = new Map();
        
        this.onDrawHandler = (ctx: CanvasRenderingContext2D, _box: LayoutBox, ec: ElementContext, _vp: LayoutBox) => {
            const t = ctx.getTransform();
            ctx.translate(-this.scrollX, -this.scrollY);
            const vpScroller = {
                left: this.scrollX,
                top: this.scrollY,
                width: this.width,
                height: this.height,
            };
            drawElementTree(ctx, this.scroller, ec, vpScroller);
            // TODO: restore transform in a finally?
            ctx.setTransform(t);
        };

        this.onPanHandler = (pan: Pan, ec: ElementContext) => {
            const targets = new Map<HasPanHandler, Pan>();
            const scrollerPan = new Array<PanTouch>();
            for (const p of pan) {
                const target = this.panning.get(p.id);
                if (target === undefined) {
                    // New target, find out who captures it.
                    // TODO: this transform needs to be for the time of the start.
                    // Maybe it's OK to just igore the first little move? And base this all on curr?
                    // No easy way to do it properly. Would need a touch down event, and have the IDs stay constant.
                    // Then we can keep a map of the transformed touch downs, 
                    // Wait, we need to do that for touches!
                    // Wait, wait, we need to convert a tap to a pan if the surface it's on moves!
                    // How to do that properly?
                    // Maybe we should be converting from touches to taps and pans at this level? Get rid of gesture and pull the logic into Root and Scroller?
                    const start: Point2D = [
                        p.start[0] - this.left + this.scrollX,
                        p.start[1] - this.top + this.scrollY,
                    ];
                    const handler = findEventTarget(this.scroller, start, "onPanHandler");
                    if (handler === undefined) {
                        // No child captures, so it will be used to scroll.
                        this.panning.set(p.id, null);
                        scrollerPan.push(p);
                    } else {
                        this.panning.set(p.id, {
                            [scrollerPanTouchTarget]: handler,
                            id: p.id,
                            start: start,
                            prev: ,
                            curr: ,
                        });
                    }
                } else if (target === null) {
                    // Existing pan, captured by this scroller.
                    scrollerPan.push(p);
                } else {
                    // Existing pan, captures by child.
                    target.prev = target.curr;
                    // TODO: use a matrix transform
                    target.curr = [
                        p.curr[0] - this.left + this.scrollX,
                        p.curr[1] - this.top + this.scrollY,
                    ];
                    const targetPan = targets.get(target[scrollerPanTouchTarget]) || [];
                    targetPan.push(target);
                    targets.set(target[scrollerPanTouchTarget], targetPan);
                }
            }
            
            // TODO: seperate events that are hitting targets inside scroller
            // because we need to transform those, but not transform the ones that are actually used for the pan.
            
            for (const p of pan) {
                const pos = this.panningPos.get(p.id);
                const xAdj = this.scrollX - this.left;
                const yAdj = this.scrollY - this.top;
                if (pos === undefined) {
                    transformedPan.push({
                        id: p.id,
                        start: [p.start[0] + xAdj, p.start[1] - yAdj],
                        prev: [p.prev[0] + xAdj, p.prev[1] - yAdj],
                        curr: [p.curr[0] + xAdj, p.curr[1] - yAdj],
                    });
                } else {
                    // Existing pan, use start and prev values adjusted when the pan started.
                    transformedPan.push({
                        id: p.id,
                        start: pos.start,
                        prev: pos.prev,
                        curr: [p.curr[0] + xAdj, p.curr[1] - yAdj],
                    });
                }
                
            }
            const targets = findPanTargets(this.scroller, )
            // TODO: how to make sure the pan points that land on this are not transformed?
            
        };
    }

    layout(left: number, top: number, width: number, height: number): void {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        this.scroller.layout(0, 0);
    }
}

export function Scroll(child: WSHSLayout<any>, scrollx?: number, scrolly?: number): ScrollLayout {
    return new ScrollLayout(child, scrollx, scrolly);
}
*/
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

export function Box(width: number, height: number) : BoxLayout {
    return new BoxLayout(width, height);
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
