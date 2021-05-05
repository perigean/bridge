// Copyright Charles Dick 2021
import { pointDistance } from "../point.js";
;
// TODO: Pass touch size down with touch events (instead of scale?)
// Is that enough? Probably we will always want a transoformation matrix.
// But enough for now, so just do that.
class TouchGesture {
    constructor() {
        this.active = new Map();
        this.pans = new Map();
        this.onTouchBeginHandler = (id, p, _) => {
            this.active.set(id, p);
        };
        this.onTouchMoveHandler = (ts, ec) => {
            for (const t of ts) {
                const a = this.active.get(t.id);
                if (a != undefined) {
                    // TODO: pass in distance threshold? Scale base on transforms?
                    if (pointDistance(a, t.p) >= 16) {
                        this.active.delete(t.id);
                        this.pans.set(t.id, {
                            prev: a,
                            curr: a, // Use the start point here, so the first move is from the start.
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
        this.onTouchEndHandler = (id, ec) => {
            const a = this.active.get(id);
            if (a !== undefined && this.onTapHandler !== undefined) {
                this.onTapHandler(a, ec);
            }
            this.active.delete(id);
            this.pans.delete(id);
        };
    }
}
;
;
class Element {
    constructor(layoutType, child) {
        this.layoutType = layoutType;
        this.child = child;
        this.left = NaN;
        this.top = NaN;
        this.width = NaN;
        this.height = NaN;
    }
    onDraw(handler) {
        if (this.onDrawHandler !== undefined) {
            throw new Error('onDraw already set');
        }
        this.onDrawHandler = handler;
        return this;
    }
    onTap(handler) {
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
    onPan(handler) {
        if (this.touchGesture === undefined) {
            this.touchGesture = new TouchGesture();
        }
        if (this.touchGesture.onPanHandler !== undefined) {
            throw new Error('onPan already set');
        }
        this.touchGesture.onPanHandler = handler;
        return this;
    }
    onAttach(handler) {
        if (this.onAttachHandler !== undefined) {
            throw new Error(`onAttach already set`);
        }
        this.onAttachHandler = handler;
        return this;
    }
    onDetach(handler) {
        if (this.onDetachHandler !== undefined) {
            throw new Error(`onDetach already set`);
        }
        this.onDetachHandler = handler;
        return this;
    }
}
;
class WPHPLayout extends Element {
    constructor(child) {
        super('wphp', child);
    }
}
;
class WPHSLayout extends Element {
    constructor(child) {
        super('wphs', child);
    }
}
;
class WSHPLayout extends Element {
    constructor(child) {
        super('wshp', child);
    }
}
;
class WSHSLayout extends Element {
    constructor(child) {
        super('wshs', child);
    }
}
;
class FlexLayout extends Element {
    constructor(size, grow, child) {
        super('flex', child);
        this.size = size;
        this.grow = grow;
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        this.child.layout(left, top, width, height);
    }
}
;
function callAttachHandlers(root, handler, ec) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop();
        const h = e[handler];
        if (h !== undefined) {
            h(ec);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        }
        else if (e.child[Symbol.iterator]) {
            // Push last child on first, so we visit it last.
            for (let i = e.child.length - 1; i >= 0; i--) {
                stack.push(e.child[i]);
            }
        }
        else {
            stack.push(e.child);
        }
    }
}
function drawElementTree(ctx, root, ec, vp) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop();
        if (e.onDrawHandler) {
            e.onDrawHandler(ctx, e, ec, vp);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        }
        else if (e.child[Symbol.iterator]) {
            // Push last child on first, so we draw it last.
            for (let i = e.child.length - 1; i >= 0; i--) {
                stack.push(e.child[i]);
            }
        }
        else {
            stack.push(e.child);
        }
    }
}
;
class Debouncer {
    constructor(f) {
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
}
;
function findTouchTarget(root, p) {
    const stack = [root];
    const x = p[0];
    const y = p[1];
    let target = undefined;
    while (stack.length > 0) {
        const e = stack.pop();
        if (x < e.left || x >= e.left + e.width || y < e.top || y >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e.onTouchBeginHandler !== undefined && e.onTouchMoveHandler !== undefined && e.onTouchEndHandler !== undefined) {
            target = e; // TODO: Why can't type inference figure this out?
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        }
        else if (e.child[Symbol.iterator]) {
            // Push first child on first, so we visit last child last.
            // The last child (the one on top) should override previous children's target.
            stack.push(...e.child);
        }
        else {
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
export class RootLayout {
    constructor(canvas, child) {
        this.child = child;
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
        if (ctx === null) {
            throw new Error("failed to get 2d context");
        }
        this.ctx = ctx;
        this.resize = new ResizeObserver((entries) => {
            if (entries.length !== 1) {
                throw new Error(`ResizeObserver expects 1 entry, got ${entries.length}`);
            }
            const content = entries[0].contentRect;
            const vp = this.vp;
            vp.left = 0;
            vp.top = 0;
            vp.width = content.width;
            vp.height = content.height;
            canvas.width = vp.width * window.devicePixelRatio;
            canvas.height = vp.height * window.devicePixelRatio;
            ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            this.debounceLayout.clear();
            this.child.layout(0, 0, vp.width, vp.height);
            this.debounceDraw.clear();
            drawElementTree(ctx, this.child, this /* ElementContext */, vp);
        });
        this.resize.observe(canvas, { box: "device-pixel-content-box" });
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
        this.touchStart = (evt) => {
            let preventDefault = false;
            for (const t of evt.touches) {
                let target = this.touchTargets.get(t.identifier);
                if (target !== undefined) {
                    preventDefault = true;
                    continue;
                }
                const p = [t.clientX, t.clientY];
                target = findTouchTarget(this.child, p);
                if (target === undefined) {
                    this.touchTargets.set(t.identifier, null);
                    // Add placeholder to active targets map so we know anbout it.
                    // Allow default action, so e.g. page can be scrolled.
                }
                else {
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
        this.touchMove = (evt) => {
            let preventDefault = false;
            const targets = new Map();
            for (const t of evt.touches) {
                const target = this.touchTargets.get(t.identifier);
                if (target === undefined) {
                    throw new Error(`Touch move without start, id ${t.identifier}`);
                }
                else if (target !== null) {
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
        this.touchEnd = (evt) => {
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
}
;
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
class BoxLayout extends WSHSLayout {
    constructor(width, height) {
        super(undefined);
        this.width = width;
        this.height = height;
    }
    layout(left, top) {
        this.left = left;
        this.top = top;
    }
}
;
export function Box(width, height) {
    return new BoxLayout(width, height);
}
class CenterLayout extends WPHPLayout {
    constructor(child) {
        super(child);
    }
    layout(left, top, width, height) {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;
        const childTop = top + (height - child.height) * 0.5;
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        child.layout(childLeft, childTop);
    }
}
;
export function Center(child) {
    return new CenterLayout(child);
}
class HCenterHPLayout extends WPHPLayout {
    constructor(child) {
        super(child);
    }
    layout(left, top, width, height) {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        child.layout(childLeft, top, height);
    }
}
;
class HCenterHSLayout extends WPHSLayout {
    constructor(child) {
        super(child);
        this.height = child.height;
    }
    layout(left, top, width) {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;
        this.left = left;
        this.top = top;
        this.width = width;
        child.layout(childLeft, top);
    }
}
;
export function HCenter(child) {
    if (child.layoutType === 'wshp') {
        return new HCenterHPLayout(child);
    }
    else {
        return new HCenterHSLayout(child);
    }
}
class VCenterWPLayout extends WPHPLayout {
    constructor(child) {
        super(child);
    }
    layout(left, top, width, height) {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        child.layout(left, childTop, width);
    }
}
;
class VCenterWSLayout extends WSHPLayout {
    constructor(child) {
        super(child);
        this.width = child.width;
    }
    layout(left, top, height) {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;
        this.left = left;
        this.top = top;
        this.height = height;
        child.layout(left, childTop);
    }
}
;
export function VCenter(child) {
    if (child.layoutType === 'wphs') {
        return new VCenterWPLayout(child);
    }
    else {
        return new VCenterWSLayout(child);
    }
}
class LeftHSLayout extends WPHSLayout {
    constructor(child) {
        super(child);
        this.height = child.height;
    }
    layout(left, top, width) {
        const child = this.child;
        this.left = left;
        this.top = top;
        this.width = width;
        child.layout(left, top);
    }
}
;
class LeftStackLayout extends WPHPLayout {
    constructor(children) {
        super(children);
    }
    layout(left, top, width, height) {
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
}
;
class LeftFlexLayout extends WPHPLayout {
    constructor(children) {
        super(children);
    }
    layout(left, top, width, height) {
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
export function Left(child, ..._) {
    switch (child.layoutType) {
        case 'flex':
            return new LeftFlexLayout(arguments);
        case 'wshp':
            return new LeftStackLayout(arguments);
        case 'wshs':
            return new LeftHSLayout(child);
    }
}
class RightHPLayout extends WPHPLayout {
    constructor(child) {
        super(child);
    }
    layout(left, top, width, height) {
        const child = this.child;
        const childLeft = width - child.width;
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        child.layout(childLeft, top, height);
    }
}
;
class RightHSLayout extends WPHSLayout {
    constructor(child) {
        super(child);
        this.height = child.height;
    }
    layout(left, top, width) {
        const child = this.child;
        const childLeft = width - child.width;
        this.left = left;
        this.top = top;
        this.width = width;
        child.layout(childLeft, top);
    }
}
;
export function Right(child) {
    if (child.layoutType === 'wshp') {
        return new RightHPLayout(child);
    }
    else {
        return new RightHSLayout(child);
    }
}
export function DebugTouch(width, height, fill, stroke) {
    const taps = [];
    const pans = [];
    return Box(width, height).onDraw((ctx, box) => {
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
    }).onTap((p, ec) => {
        taps.push(p);
        ec.requestDraw();
    }).onPan((ps, ec) => {
        pans.push(ps);
        ec.requestDraw();
    });
}
// TODO: Top, Bottom
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBZW5ELENBQUM7QUFrQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBVWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQzlELEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRTtvQkFDaEIsOERBQThEO29CQUM5RCxJQUFJLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTt3QkFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFOzRCQUNoQixJQUFJLEVBQUUsQ0FBQzs0QkFDUCxJQUFJ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S0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLEVBQUU7WUFDbkIsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDcEM7U0FDSjtRQUNELEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFVLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDYixFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBbUIsRUFBRSxFQUFrQixFQUFFLEVBQUU7UUFDakQsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNkLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUFFRCxvQkFBb0IiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEaWNrIDIwMjFcblxuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuLi9wb2ludC5qc1wiXG5cbmV4cG9ydCB0eXBlIExheW91dEJveCA9IHtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbn07XG5cbi8vIFRPRE86IFBhc3MgRWxlbWVudENvbnRleHQgYWxvbmcgd2l0aCBsYXlvdXQsIHNvIHRoYXQgd2UgY2FuIGhhdmUgZHluYW1pYyBsYXlvdXRzLlxuXG5leHBvcnQgaW50ZXJmYWNlIEVsZW1lbnRDb250ZXh0IHtcbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZDtcbiAgICAvLyBUT0RPOiByZXF1ZXN0UmVuZGVyP1xufTtcblxudHlwZSBPbkF0dGFjaEhhbmRsZXIgPSAoZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSA9PiB2b2lkO1xudHlwZSBPblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgVG91Y2hNb3ZlID0ge1xuICAgIHJlYWRvbmx5IGlkOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgcDogUG9pbnQyRDtcbn07XG50eXBlIE9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbnR5cGUgT25UYXBIYW5kbGVyID0gKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgUGFuUG9pbnQgPSB7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcbnR5cGUgT25QYW5IYW5kbGVyID0gKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbi8vIFRPRE86IFBhc3MgdG91Y2ggc2l6ZSBkb3duIHdpdGggdG91Y2ggZXZlbnRzIChpbnN0ZWFkIG9mIHNjYWxlPylcbi8vIElzIHRoYXQgZW5vdWdoPyBQcm9iYWJseSB3ZSB3aWxsIGFsd2F5cyB3YW50IGEgdHJhbnNvZm9ybWF0aW9uIG1hdHJpeC5cbi8vIEJ1dCBlbm91Z2ggZm9yIG5vdywgc28ganVzdCBkbyB0aGF0LlxuXG5jbGFzcyBUb3VjaEdlc3R1cmUge1xuICAgIG9uVGFwSGFuZGxlcj86IE9uVGFwSGFuZGxlcjtcbiAgICBvblBhbkhhbmRsZXI/OiBPblBhbkhhbmRsZXI7XG5cbiAgICBwcml2YXRlIGFjdGl2ZTogTWFwPG51bWJlciwgUG9pbnQyRD47XG4gICAgcHJpdmF0ZSBwYW5zOiBNYXA8bnVtYmVyLCBQYW5Qb2ludD47XG4gICAgcmVhZG9ubHkgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICByZWFkb25seSBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICByZWFkb25seSBvblRvdWNoRW5kSGFuZGxlcjogT25Ub3VjaEVuZEhhbmRsZXI7XG4gICAgXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuYWN0aXZlID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBhbnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMub25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBfOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5hY3RpdmUuc2V0KGlkLCBwKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IFRvdWNoTW92ZVtdLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSB0aGlzLmFjdGl2ZS5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKGEgIT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHBhc3MgaW4gZGlzdGFuY2UgdGhyZXNob2xkPyBTY2FsZSBiYXNlIG9uIHRyYW5zZm9ybXM/XG4gICAgICAgICAgICAgICAgICAgIGlmIChwb2ludERpc3RhbmNlKGEsIHQucCkgPj0gMTYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogYSwgICAgLy8gVXNlIHRoZSBzdGFydCBwb2ludCBoZXJlLCBzbyB0aGUgZmlyc3QgbW92ZSBpcyBmcm9tIHRoZSBzdGFydC5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnBhbnMuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBwLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiB0LnAsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA+IDAgJiYgdGhpcy5vblBhbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25QYW5IYW5kbGVyKFsuLi50aGlzLnBhbnMudmFsdWVzKCldLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmIChhICE9PSB1bmRlZmluZWQgJiYgdGhpcy5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25UYXBIYW5kbGVyKGEsIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICB0aGlzLnBhbnMuZGVsZXRlKGlkKTtcbiAgICAgICAgfTtcbiAgICB9XG59O1xuXG4vLyBTbyB0aGF0IHdlIGNhbiB0YWtlIElBcmd1bWVudHMgYXMgY2hpbGRyZW5cbmludGVyZmFjZSBTdGF0aWNBcnJheTxUPiB7XG4gICAgW2luZGV4OiBudW1iZXJdOiBUO1xuICAgIGxlbmd0aDogbnVtYmVyO1xuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8VD47XG59O1xuXG50eXBlIENoaWxkQ29uc3RyYWludDxMYXlvdXRUeXBlIGV4dGVuZHMgc3RyaW5nPiA9IEVsZW1lbnQ8TGF5b3V0VHlwZSwgYW55PiB8IFN0YXRpY0FycmF5PEVsZW1lbnQ8TGF5b3V0VHlwZSwgYW55Pj4gfCB1bmRlZmluZWQ7XG5cbmNsYXNzIEVsZW1lbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZywgQ2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8c3RyaW5nPj4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgfVxuXG4gICAgb25EcmF3SGFuZGxlcj86IE9uRHJhd0hhbmRsZXI7XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcj86IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyO1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlO1xuICAgIG9uVGFwKGhhbmRsZXI6IE9uVGFwSGFuZGxlcik6IHRoaXMge1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc3QgdGMgPSBuZXcgVG91Y2hHZXN0dXJlKCk7XG4gICAgICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IHRjO1xuICAgICAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gdGMub25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICAgICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gdGMub25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgICAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IHRjLm9uVG91Y2hFbmRIYW5kbGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gbmV3IFRvdWNoR2VzdHVyZSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uQXR0YWNoSGFuZGxlcj86IE9uQXR0YWNoSGFuZGxlcjtcbiAgICBvbkF0dGFjaChoYW5kbGVyOiBPbkF0dGFjaEhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25BdHRhY2hIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgb25BdHRhY2ggYWxyZWFkeSBzZXRgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uQXR0YWNoSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uRGV0YWNoSGFuZGxlcj86IE9uQXR0YWNoSGFuZGxlcjtcbiAgICBvbkRldGFjaChoYW5kbGVyOiBPbkF0dGFjaEhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgb25EZXRhY2ggYWxyZWFkeSBzZXRgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn07XG5cbmFic3RyYWN0IGNsYXNzIFdQSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3cGhwJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHAnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3BocycsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3cGhzJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXU0hQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufTtcblxuYWJzdHJhY3QgY2xhc3MgV1NIU0xheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+PiBleHRlbmRzIEVsZW1lbnQ8J3dzaHMnLCBDaGlsZD4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3NocycsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuY2xhc3MgRmxleExheW91dCBleHRlbmRzIEVsZW1lbnQ8J2ZsZXgnLCBXUEhQTGF5b3V0PGFueT4+IHtcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZ3JvdzogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKCdmbGV4JywgY2hpbGQpO1xuICAgICAgICB0aGlzLnNpemUgPSBzaXplO1xuICAgICAgICB0aGlzLmdyb3cgPSBncm93O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDpudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBjYWxsQXR0YWNoSGFuZGxlcnMocm9vdDogRWxlbWVudDxhbnksIGFueT4sIGhhbmRsZXI6IFwib25BdHRhY2hIYW5kbGVyXCIgfCBcIm9uRGV0YWNoSGFuZGxlclwiLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGNvbnN0IGggPSBlW2hhbmRsZXJdO1xuICAgICAgICBpZiAoaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBoKGVjKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBsYXN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSB2aXNpdCBpdCBsYXN0LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGUuY2hpbGQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGRbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3Qocm9vdC5sZWZ0LCByb290LnRvcCwgcm9vdC53aWR0aCwgcm9vdC5oZWlnaHQpO1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55PjtcbiAgICAgICAgaWYgKGUub25EcmF3SGFuZGxlcikge1xuICAgICAgICAgICAgZS5vbkRyYXdIYW5kbGVyKGN0eCwgZSwgZWMsIHZwKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBsYXN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSBkcmF3IGl0IGxhc3QuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gZS5jaGlsZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSGFzVG91Y2hIYW5kbGVycyB7XG4gICAgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcjogT25Ub3VjaEVuZEhhbmRsZXI7XG59O1xuXG5jbGFzcyBEZWJvdW5jZXIge1xuICAgIGJvdW5jZTogKCkgPT4gdm9pZDtcbiAgICB0aW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihmOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuYm91bmNlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGltZW91dCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgZigpO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNsZWFyKCkge1xuICAgICAgICBpZiAodGhpcy50aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZmluZFRvdWNoVGFyZ2V0KHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+LCBwOiBQb2ludDJEKTogdW5kZWZpbmVkIHwgSGFzVG91Y2hIYW5kbGVycyB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgY29uc3QgeCA9IHBbMF07XG4gICAgY29uc3QgeSA9IHBbMV07XG4gICAgbGV0IHRhcmdldDogdW5kZWZpbmVkIHwgSGFzVG91Y2hIYW5kbGVycyA9IHVuZGVmaW5lZDtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGFyZ2V0ID0gZSBhcyBIYXNUb3VjaEhhbmRsZXJzOyAvLyBUT0RPOiBXaHkgY2FuJ3QgdHlwZSBpbmZlcmVuY2UgZmlndXJlIHRoaXMgb3V0P1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGZpcnN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSB2aXNpdCBsYXN0IGNoaWxkIGxhc3QuXG4gICAgICAgICAgICAvLyBUaGUgbGFzdCBjaGlsZCAodGhlIG9uZSBvbiB0b3ApIHNob3VsZCBvdmVycmlkZSBwcmV2aW91cyBjaGlsZHJlbidzIHRhcmdldC5cbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4uZS5jaGlsZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG59XG5cbi8qXG5jbGFzcyBUb3VjaEZvcndhcmQge1xuICAgIHByaXZhdGUgcm9vdDogRWxlbWVudDxhbnksIGFueT47XG4gICAgcHJpdmF0ZSB0YXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzPjtcbiAgICBwcml2YXRlIGRlZmF1bHRCZWdpbj86IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgcHJpdmF0ZSBkZWZhdWx0TW92ZT86IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBwcml2YXRlIGRlZmF1bHRFbmQ/OiBPblRvdWNoRW5kSGFuZGxlcjtcbiAgICBcbiAgICAvLyBUT0RPOiBUaGlzIGhhcyB0byBiZSB1cGRhdGVkIFxuICAgIHByaXZhdGUgcDJjOiBBZmZpbmUyRDtcblxuICAgIHJlYWRvbmx5IG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyO1xuXG4gICAgY29uc3RydWN0b3Iocm9vdDogRWxlbWVudDxhbnksIGFueT4sIHAyYzogQWZmaW5lMkQpIHtcbiAgICAgICAgdGhpcy5yb290ID0gcm9vdDtcbiAgICAgICAgdGhpcy50YXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnAyYyA9IHAyYztcblxuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50YXJnZXRzLmhhcyhpZCkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGJlZ2luIGZvciBleGlzdGluZyBJRCAke2lkfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMucm9vdCwgcCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNwID0gdHJhbnNmb3JtUG9pbnQodGhpcy5wMmMsIHApO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKGlkLCBjcCwgZWMpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRlZmF1bHRCZWdpbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0QmVnaW4oaWQsIHAsIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdHRzTWFwID0gbmV3IE1hcDxudW1iZXIsIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgaWQ6IHQuaWQsXG4gICAgICAgICAgICAgICAgICAgIHA6IHRyYW5zZm9ybVBvaW50KHRoaXMucDJjLCB0LnApLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHR0c01hcC5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmcucHVzaChjdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzTWFwLnNldCh0LmlkLCBbY3RdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpZCwgdHRzXSBvZiB0dHNNYXApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldHMuZ2V0KGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIGVjKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGVmYXVsdE1vdmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIG5lZWRzIHRvIGJlIGNhbGxlZCBiZWZvcmUgd2UgdHJhbnNmb3JtIHRoZSBwb2ludHMuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGVmYXVsdE1vdmUodHMsIGVjKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRhcmdldHMuZ2V0KGlkKTtcbiAgICAgICAgICAgIHRoaXMudGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCBlYyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZGVmYXVsdEVuZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZWZhdWx0RW5kKGlkLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcbiovXG5cbmV4cG9ydCBjbGFzcyBSb290TGF5b3V0IGltcGxlbWVudHMgRWxlbWVudENvbnRleHQge1xuICAgIGNoaWxkOiBXUEhQTGF5b3V0PGFueT47XG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcbiAgICByZXNpemU6IFJlc2l6ZU9ic2VydmVyO1xuICAgIHZwOiBMYXlvdXRCb3g7XG5cbiAgICAvLyBUT0RPOiB3ZSBzaG91bGQgbm90IHJlcmVuZGVyIGlmIHRoZXJlIGFyZSBwZW5kaW5nIGxheW91dCByZXF1ZXN0cy5cbiAgICBkZWJvdW5jZUxheW91dDogRGVib3VuY2VyO1xuICAgIGRlYm91bmNlRHJhdzogRGVib3VuY2VyO1xuXG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldHM6IE1hcDxudW1iZXIsIEhhc1RvdWNoSGFuZGxlcnMgfCBudWxsPjtcbiAgICBwcml2YXRlIHRvdWNoU3RhcnQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7IFxuICAgIHByaXZhdGUgdG91Y2hNb3ZlOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgdG91Y2hFbmQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgXG5cbiAgICBjb25zdHJ1Y3RvcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XG4gICAgICAgIGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIiwge2FscGhhOiBmYWxzZSwgZGVzeW5jaHJvbml6ZWQ6IHRydWV9KTtcbiAgICAgICAgaWYgKGN0eCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZmFpbGVkIHRvIGdldCAyZCBjb250ZXh0XCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xuICAgICAgICB0aGlzLnJlc2l6ZSA9IG5ldyBSZXNpemVPYnNlcnZlcigoZW50cmllczogUmVzaXplT2JzZXJ2ZXJFbnRyeVtdKSA9PiB7XG4gICAgICAgICAgICBpZiAoZW50cmllcy5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFJlc2l6ZU9ic2VydmVyIGV4cGVjdHMgMSBlbnRyeSwgZ290ICR7ZW50cmllcy5sZW5ndGh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZW50cmllc1swXS5jb250ZW50UmVjdDtcbiAgICAgICAgICAgIGNvbnN0IHZwID0gdGhpcy52cDtcbiAgICAgICAgICAgIHZwLmxlZnQgPSAwO1xuICAgICAgICAgICAgdnAudG9wID0gMDtcbiAgICAgICAgICAgIHZwLndpZHRoID0gY29udGVudC53aWR0aDtcbiAgICAgICAgICAgIHZwLmhlaWdodCA9IGNvbnRlbnQuaGVpZ2h0XG4gICAgICAgICAgICBjYW52YXMud2lkdGggPSB2cC53aWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY2FudmFzLmhlaWdodCA9IHZwLmhlaWdodCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY3R4LnRyYW5zZm9ybSh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCwgd2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlTGF5b3V0LmNsZWFyKCk7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dCgwLCAwLCB2cC53aWR0aCwgdnAuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuZGVib3VuY2VEcmF3LmNsZWFyKCk7XG4gICAgICAgICAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB2cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlc2l6ZS5vYnNlcnZlKGNhbnZhcywge2JveDogXCJkZXZpY2UtcGl4ZWwtY29udGVudC1ib3hcIn0pO1xuICAgICAgICB0aGlzLnZwID0ge1xuICAgICAgICAgICAgbGVmdDogMCxcbiAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgIHdpZHRoOiBjYW52YXMud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGNhbnZhcy5oZWlnaHQsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dCA9IG5ldyBEZWJvdW5jZXIoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdGhpcy52cC53aWR0aCwgdGhpcy52cC5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0ID0gdGhpcy5kZWJvdW5jZUxheW91dC5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuY2hpbGQsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8sIHRoaXMudnApO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdyA9IHRoaXMuZGVib3VuY2VEcmF3LmJvdW5jZTtcblxuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFN0YXJ0ID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHA6IFBvaW50MkQgPSBbdC5jbGllbnRYLCB0LmNsaWVudFldO1xuICAgICAgICAgICAgICAgIHRhcmdldCA9IGZpbmRUb3VjaFRhcmdldCh0aGlzLmNoaWxkLCBwKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgbnVsbCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciB0byBhY3RpdmUgdGFyZ2V0cyBtYXAgc28gd2Uga25vdyBhbmJvdXQgaXQuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbG93IGRlZmF1bHQgYWN0aW9uLCBzbyBlLmcuIHBhZ2UgY2FuIGJlIHNjcm9sbGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hCZWdpbkhhbmRsZXIodC5pZGVudGlmaWVyLCBwLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAvLyBTb21lIHRhcmdldCB3YXMgc29tZSBmb3IgYXQgbGVhc3Qgc29tZSBvZiB0aGUgdG91Y2hlcy4gRG9uJ3QgbGV0IGFueXRoaW5nXG4gICAgICAgICAgICAgICAgLy8gaW4gSFRNTCBnZXQgdGhpcyB0b3VjaC5cbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaE1vdmUgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnMsIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBtb3ZlIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0LmlkZW50aWZpZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiBbdC5jbGllbnRYLCB0LmNsaWVudFldLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoTW92ZUhhbmRsZXIodHMsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hFbmQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBuZXcgTWFwKHRoaXMudG91Y2hUYXJnZXRzKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVkLmRlbGV0ZSh0LmlkZW50aWZpZXIpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpZCwgdGFyZ2V0XSBvZiByZW1vdmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcblxuICAgICAgICBjYWxsQXR0YWNoSGFuZGxlcnModGhpcy5jaGlsZCwgXCJvbkF0dGFjaEhhbmRsZXJcIiwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgIHRoaXMucmVxdWVzdExheW91dCgpO1xuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIHRoaXMucmVzaXplLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICAvLyBUT0RPOiBkZXRhY2ggYWxsIGNoaWxkcmVuLlxuXG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIEVsZW1lbnRDb250ZXh0IGZ1bmN0aW9uc1xuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICByZXF1ZXN0RHJhdzogKCkgPT4gdm9pZDtcbiAgICByZXF1ZXN0TGF5b3V0OiAoKSA9PiB2b2lkO1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIFRvdWNoSGFuZGxlciBmdW5jdGlvbnNcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gVE9ETzogYWRkIFRvdWNoRm9yd2FyZGVyIGhlcmUuIGluc3RhbGwgdG91Y2ggaGFuZGxlcnNcbn07XG5cbi8vIFRPRE86IG1ha2Ugc29tIFdQSFBMYXlvdXQgdGhhdCBwb3NpdGlvbnMgYWxsIGNoaWxkcmVuIHdpdGggYWJzb2x1dGUgY29vcmRpbmF0ZXMuXG4vLyBQcm9iYWJseSBuZWVkcyBhIG5ldyBjaGlsZCB0eXBlIHRoYXQgaW5jbHVkZXMgbGVmdCwgdG9wLlxuLy8gVE9ETzogTWFrZSBpdCBwYW4gKGhhdmUgYSBwcm92aWRlZCBzaXplKVxuLy8gVE9ETzogSGF2ZSBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gKHNvIGhpZGUgY2hpbGRyZW4sIGFuZCBmb3J3YXJkIHRhcC9wYW4vZHJhdyBtYW51YWxseSwgd2l0aCB0cmFuc2Zvcm0pXG4vLyBUT0RPOiBNYWtlIGl0IHpvb21cbi8vIFRPRE86IG1heWJlIGhhdmUgdHdvIGVsZW1lbnRzPyBhIHZpZXdwb3J0IGFuZCBhIEhTV1Mgd2l0aCBhYnNvbHV0ZWx5IHBvc2l0aW9uZWQgY2hpbGRyZW4gYW5kIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzXG4vKlxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IHtcbiAgICAvLyBTY3JvbGxMYXlvdXQgaGFzIHRvIGludGVyY2VwdCBhbGwgZXZlbnRzIHRvIG1ha2Ugc3VyZSBhbnkgbG9jYXRpb25zIGFyZSB1cGRhdGVkIGJ5XG4gICAgLy8gdGhlIHNjcm9sbCBwb3NpdGlvbiwgc28gY2hpbGQgaXMgdW5kZWZpbmVkLCBhbmQgYWxsIGV2ZW50cyBhcmUgZm9yd2FyZGVkIHRvIHNjcm9sbGVyLlxuICAgIHNjcm9sbGVyOiBXU0hTTGF5b3V0PGFueT47XG4gICAgc2Nyb2xsWDogbnVtYmVyO1xuICAgIHNjcm9sbFk6IG51bWJlcjtcbiAgICAvLyBQYW5uaW5nIGNvbnRhaW5zIGEgaW5mbyBvbiB0aGUgYWN0aXZlIHBhbnMuIElmIHZhbHVlIGlzIG5vdCBudWxsLCBlIGlzIGEgY2hpbGQgb2Ygc2Nyb2xsZXIuXG4gICAgLy8gSWYgdmFsdWUgaXMgbnVsbCwgdGhlbiBpdCBpcyBhbiBleGlzdGluZyBwYW4gdGhhdCBpcyBjYXB0dXJlZCBieSB0aGlzIFNjcm9sbExheW91dC5cbiAgICBwYW5uaW5nOiBNYXA8bnVtYmVyLCBTY3JvbGxlclBhbm5pbmc+O1xuXG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xsWD86IG51bWJlciwgc2Nyb2xsWT86IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnNjcm9sbGVyID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuc2Nyb2xsWCA9IHNjcm9sbFggfHwgMDtcbiAgICAgICAgdGhpcy5zY3JvbGxZID0gc2Nyb2xsWSB8fCAwO1xuICAgICAgICB0aGlzLnBhbm5pbmcgPSBuZXcgTWFwKCk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdCA9IGN0eC5nZXRUcmFuc2Zvcm0oKTtcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUoLXRoaXMuc2Nyb2xsWCwgLXRoaXMuc2Nyb2xsWSk7XG4gICAgICAgICAgICBjb25zdCB2cFNjcm9sbGVyID0ge1xuICAgICAgICAgICAgICAgIGxlZnQ6IHRoaXMuc2Nyb2xsWCxcbiAgICAgICAgICAgICAgICB0b3A6IHRoaXMuc2Nyb2xsWSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuc2Nyb2xsZXIsIGVjLCB2cFNjcm9sbGVyKTtcbiAgICAgICAgICAgIC8vIFRPRE86IHJlc3RvcmUgdHJhbnNmb3JtIGluIGEgZmluYWxseT9cbiAgICAgICAgICAgIGN0eC5zZXRUcmFuc2Zvcm0odCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5vblBhbkhhbmRsZXIgPSAocGFuOiBQYW4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzUGFuSGFuZGxlciwgUGFuPigpO1xuICAgICAgICAgICAgY29uc3Qgc2Nyb2xsZXJQYW4gPSBuZXcgQXJyYXk8UGFuVG91Y2g+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcGFuKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5wYW5uaW5nLmdldChwLmlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTmV3IHRhcmdldCwgZmluZCBvdXQgd2hvIGNhcHR1cmVzIGl0LlxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIHRyYW5zZm9ybSBuZWVkcyB0byBiZSBmb3IgdGhlIHRpbWUgb2YgdGhlIHN0YXJ0LlxuICAgICAgICAgICAgICAgICAgICAvLyBNYXliZSBpdCdzIE9LIHRvIGp1c3QgaWdvcmUgdGhlIGZpcnN0IGxpdHRsZSBtb3ZlPyBBbmQgYmFzZSB0aGlzIGFsbCBvbiBjdXJyP1xuICAgICAgICAgICAgICAgICAgICAvLyBObyBlYXN5IHdheSB0byBkbyBpdCBwcm9wZXJseS4gV291bGQgbmVlZCBhIHRvdWNoIGRvd24gZXZlbnQsIGFuZCBoYXZlIHRoZSBJRHMgc3RheSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlbiB3ZSBjYW4ga2VlcCBhIG1hcCBvZiB0aGUgdHJhbnNmb3JtZWQgdG91Y2ggZG93bnMsIFxuICAgICAgICAgICAgICAgICAgICAvLyBXYWl0LCB3ZSBuZWVkIHRvIGRvIHRoYXQgZm9yIHRvdWNoZXMhXG4gICAgICAgICAgICAgICAgICAgIC8vIFdhaXQsIHdhaXQsIHdlIG5lZWQgdG8gY29udmVydCBhIHRhcCB0byBhIHBhbiBpZiB0aGUgc3VyZmFjZSBpdCdzIG9uIG1vdmVzIVxuICAgICAgICAgICAgICAgICAgICAvLyBIb3cgdG8gZG8gdGhhdCBwcm9wZXJseT9cbiAgICAgICAgICAgICAgICAgICAgLy8gTWF5YmUgd2Ugc2hvdWxkIGJlIGNvbnZlcnRpbmcgZnJvbSB0b3VjaGVzIHRvIHRhcHMgYW5kIHBhbnMgYXQgdGhpcyBsZXZlbD8gR2V0IHJpZCBvZiBnZXN0dXJlIGFuZCBwdWxsIHRoZSBsb2dpYyBpbnRvIFJvb3QgYW5kIFNjcm9sbGVyP1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGFydDogUG9pbnQyRCA9IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAuc3RhcnRbMF0gLSB0aGlzLmxlZnQgKyB0aGlzLnNjcm9sbFgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0WzFdIC0gdGhpcy50b3AgKyB0aGlzLnNjcm9sbFksXG4gICAgICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBmaW5kRXZlbnRUYXJnZXQodGhpcy5zY3JvbGxlciwgc3RhcnQsIFwib25QYW5IYW5kbGVyXCIpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGFuZGxlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBObyBjaGlsZCBjYXB0dXJlcywgc28gaXQgd2lsbCBiZSB1c2VkIHRvIHNjcm9sbC5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGFubmluZy5zZXQocC5pZCwgbnVsbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxlclBhbi5wdXNoKHApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5uaW5nLnNldChwLmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgW3Njcm9sbGVyUGFuVG91Y2hUYXJnZXRdOiBoYW5kbGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkOiBwLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBzdGFydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBFeGlzdGluZyBwYW4sIGNhcHR1cmVkIGJ5IHRoaXMgc2Nyb2xsZXIuXG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbGVyUGFuLnB1c2gocCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRXhpc3RpbmcgcGFuLCBjYXB0dXJlcyBieSBjaGlsZC5cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnByZXYgPSB0YXJnZXQuY3VycjtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogdXNlIGEgbWF0cml4IHRyYW5zZm9ybVxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuY3VyciA9IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHAuY3VyclswXSAtIHRoaXMubGVmdCArIHRoaXMuc2Nyb2xsWCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHAuY3VyclsxXSAtIHRoaXMudG9wICsgdGhpcy5zY3JvbGxZLFxuICAgICAgICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRQYW4gPSB0YXJnZXRzLmdldCh0YXJnZXRbc2Nyb2xsZXJQYW5Ub3VjaFRhcmdldF0pIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRQYW4ucHVzaCh0YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXRbc2Nyb2xsZXJQYW5Ub3VjaFRhcmdldF0sIHRhcmdldFBhbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBUT0RPOiBzZXBlcmF0ZSBldmVudHMgdGhhdCBhcmUgaGl0dGluZyB0YXJnZXRzIGluc2lkZSBzY3JvbGxlclxuICAgICAgICAgICAgLy8gYmVjYXVzZSB3ZSBuZWVkIHRvIHRyYW5zZm9ybSB0aG9zZSwgYnV0IG5vdCB0cmFuc2Zvcm0gdGhlIG9uZXMgdGhhdCBhcmUgYWN0dWFsbHkgdXNlZCBmb3IgdGhlIHBhbi5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHBhbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBvcyA9IHRoaXMucGFubmluZ1Bvcy5nZXQocC5pZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgeEFkaiA9IHRoaXMuc2Nyb2xsWCAtIHRoaXMubGVmdDtcbiAgICAgICAgICAgICAgICBjb25zdCB5QWRqID0gdGhpcy5zY3JvbGxZIC0gdGhpcy50b3A7XG4gICAgICAgICAgICAgICAgaWYgKHBvcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybWVkUGFuLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHAuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogW3Auc3RhcnRbMF0gKyB4QWRqLCBwLnN0YXJ0WzFdIC0geUFkal0sXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBbcC5wcmV2WzBdICsgeEFkaiwgcC5wcmV2WzFdIC0geUFkal0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiBbcC5jdXJyWzBdICsgeEFkaiwgcC5jdXJyWzFdIC0geUFkal0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEV4aXN0aW5nIHBhbiwgdXNlIHN0YXJ0IGFuZCBwcmV2IHZhbHVlcyBhZGp1c3RlZCB3aGVuIHRoZSBwYW4gc3RhcnRlZC5cbiAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtZWRQYW4ucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogcC5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBwb3Muc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBwb3MucHJldixcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IFtwLmN1cnJbMF0gKyB4QWRqLCBwLmN1cnJbMV0gLSB5QWRqXSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGZpbmRQYW5UYXJnZXRzKHRoaXMuc2Nyb2xsZXIsIClcbiAgICAgICAgICAgIC8vIFRPRE86IGhvdyB0byBtYWtlIHN1cmUgdGhlIHBhbiBwb2ludHMgdGhhdCBsYW5kIG9uIHRoaXMgYXJlIG5vdCB0cmFuc2Zvcm1lZD9cbiAgICAgICAgICAgIFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyLmxheW91dCgwLCAwKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBTY3JvbGwoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xseD86IG51bWJlciwgc2Nyb2xseT86IG51bWJlcik6IFNjcm9sbExheW91dCB7XG4gICAgcmV0dXJuIG5ldyBTY3JvbGxMYXlvdXQoY2hpbGQsIHNjcm9sbHgsIHNjcm9sbHkpO1xufVxuKi9cbi8vIFRPRE86IHNjcm9sbHgsIHNjcm9sbHlcblxuY2xhc3MgQm94TGF5b3V0IGV4dGVuZHMgV1NIU0xheW91dDx1bmRlZmluZWQ+IHtcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQm94KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSA6IEJveExheW91dCB7XG4gICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQod2lkdGgsIGhlaWdodCk7XG59XG5cbmNsYXNzIENlbnRlckxheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIENlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+KTogQ2VudGVyTGF5b3V0IHtcbiAgICByZXR1cm4gbmV3IENlbnRlckxheW91dChjaGlsZCk7XG59XG5cbmNsYXNzIEhDZW50ZXJIUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIEhDZW50ZXJIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBIQ2VudGVySFNMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcihjaGlsZDogV1NIUExheW91dDxhbnk+KTogSENlbnRlckhQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55Pik6IEhDZW50ZXJIU0xheW91dCB8IEhDZW50ZXJIUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIUExheW91dChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIQ2VudGVySFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgVkNlbnRlcldQTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXUEhTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1BIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCwgd2lkdGgpO1xuICAgIH1cbn07XG5cbmNsYXNzIFZDZW50ZXJXU0xheW91dCBleHRlbmRzIFdTSFBMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSBjaGlsZC53aWR0aDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+KTogVkNlbnRlcldTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXIoY2hpbGQ6IFdQSFNMYXlvdXQ8YW55Pik6IFZDZW50ZXJXUExheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXUEhTTGF5b3V0PGFueT4pOiBWQ2VudGVyV1NMYXlvdXQgfCBWQ2VudGVyV1BMYXlvdXQge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3BocycpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1BMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIExlZnRIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmNsYXNzIExlZnRTdGFja0xheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1NIUExheW91dDxhbnk+Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxXU0hQTGF5b3V0PGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5jaGlsZDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkLndpZHRoO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuY2xhc3MgTGVmdEZsZXhMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGRyZW46IFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5jaGlsZDtcbiAgICAgICAgbGV0IHNpemVTdW0gPSAwO1xuICAgICAgICBsZXQgZ3Jvd1N1bSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIHNpemVTdW0gKz0gY2hpbGQuc2l6ZTtcbiAgICAgICAgICAgIGdyb3dTdW0gKz0gY2hpbGQuZ3JvdztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHRyYSA9IHdpZHRoIC0gc2l6ZVN1bTtcbiAgICAgICAgbGV0IGNoaWxkTGVmdCA9IGxlZnQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkV2lkdGggPSBjaGlsZC5zaXplICsgY2hpbGQuZ3JvdyAqIGV4dHJhIC8gZ3Jvd1N1bTtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgY2hpbGRXaWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIGNoaWxkTGVmdCArPSBjaGlsZC5zaXplO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDogV1NIU0xheW91dDxhbnk+KTogV1BIU0xheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQwOiBXU0hQTGF5b3V0PGFueT4sIC4uLmNoaWxkUmVzdDogQXJyYXk8V1NIUExheW91dDxhbnk+Pik6IFdQSFBMYXlvdXQ8YW55PjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkMDogRmxleExheW91dCwgLi4uY2hpbGRSZXN0OiBBcnJheTxGbGV4TGF5b3V0Pik6IFdQSFBMYXlvdXQ8YW55PjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4gfCBGbGV4TGF5b3V0LCAuLi5fOiBBcnJheTxXU0hQTGF5b3V0PGFueT4+IHwgQXJyYXk8RmxleExheW91dD4pOiBXUEhTTGF5b3V0PGFueT4gfCBXUEhQTGF5b3V0PGFueT4ge1xuICAgIHN3aXRjaCAoY2hpbGQubGF5b3V0VHlwZSkge1xuICAgICAgICBjYXNlICdmbGV4JzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdEZsZXhMYXlvdXQoYXJndW1lbnRzKTtcbiAgICAgICAgY2FzZSAnd3NocCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IExlZnRTdGFja0xheW91dChhcmd1bWVudHMpO1xuICAgICAgICBjYXNlICd3c2hzJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdEhTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIFJpZ2h0SFBMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFBMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IHdpZHRoIC0gY2hpbGQud2lkdGg7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIFJpZ2h0SFNMYXlvdXQgZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IHdpZHRoIC0gY2hpbGQud2lkdGg7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIU0xheW91dDxhbnk+KTogUmlnaHRIU0xheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIUExheW91dDxhbnk+KTogUmlnaHRIUExheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1NIUExheW91dDxhbnk+KTogUmlnaHRIU0xheW91dCB8IFJpZ2h0SFBMYXlvdXQge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3NocCcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBSaWdodEhQTGF5b3V0KGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFJpZ2h0SFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gRGVidWdUb3VjaCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdHJva2U6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybik6IEJveExheW91dCB7XG4gICAgY29uc3QgdGFwczogQXJyYXk8UG9pbnQyRD4gPSBbXTtcbiAgICBjb25zdCBwYW5zOiBBcnJheTxBcnJheTxQYW5Qb2ludD4+ID0gW107XG4gICAgcmV0dXJuIEJveChcbiAgICAgICAgd2lkdGgsXG4gICAgICAgIGhlaWdodCxcbiAgICApLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsO1xuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2U7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHRhcCBvZiB0YXBzKSB7XG4gICAgICAgICAgICBjdHgubW92ZVRvKHRhcFswXSArIDE2LCB0YXBbMV0pO1xuICAgICAgICAgICAgY3R4LmVsbGlwc2UodGFwWzBdLCB0YXBbMV0sIDE2LCAxNiwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgcHMgb2YgcGFucykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyhwLnByZXZbMF0sIHAucHJldlsxXSk7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyhwLmN1cnJbMF0sIHAuY3VyclsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH0pLm9uVGFwKChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgdGFwcy5wdXNoKHApO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgcGFucy5wdXNoKHBzKTtcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KTtcbn1cblxuLy8gVE9ETzogVG9wLCBCb3R0b21cbiJdfQ==