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
        this.onTouchEndHandler = (id, ec) => {
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
}
;
;
function initTouchGesture(e) {
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
function clamp(x, min, max) {
    if (x < min) {
        return min;
    }
    else if (x > max) {
        return max;
    }
    else {
        return x;
    }
}
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
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onTapHandler !== undefined) {
            throw new Error('onTap already set');
        }
        this.touchGesture.onTapHandler = handler;
        return this;
    }
    onPan(handler) {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanHandler !== undefined) {
            throw new Error('onPan already set');
        }
        this.touchGesture.onPanHandler = handler;
        return this;
    }
    onPanBegin(handler) {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanBeginHandler !== undefined) {
            throw new Error('onPanBegin already set');
        }
        this.touchGesture.onPanBeginHandler = handler;
        return this;
    }
    onPanEnd(handler) {
        this.touchGesture = initTouchGesture(this);
        if (this.touchGesture.onPanEndHandler !== undefined) {
            throw new Error('onPanEnd already set');
        }
        this.touchGesture.onPanEndHandler = handler;
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
            this.timeout = undefined;
        }
    }
}
;
function findTouchTarget(root, p) {
    const stack = [root];
    const x = p[0];
    const y = p[1];
    while (stack.length > 0) {
        const e = stack.pop();
        if (x < e.left || x >= e.left + e.width || y < e.top || y >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e.onTouchBeginHandler !== undefined && e.onTouchMoveHandler !== undefined && e.onTouchEndHandler !== undefined) {
            return e; // TODO: Why can't type inference figure this out?
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
    return undefined;
}
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
// TODO: Make it pan (have a provided size)
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures
class ScrollLayout extends WPHPLayout {
    constructor(child, scrollX, scrollY) {
        super(undefined);
        this.scroller = child;
        this.scrollX = scrollX || 0;
        this.scrollY = scrollY || 0;
        this.touchTargets = new Map();
        this.touchScroll = new Map();
        this.onDrawHandler = (ctx, _box, ec, _vp) => {
            ctx.save();
            // TODO: clip.
            ctx.translate(-this.scrollX, -this.scrollY);
            const vpScroller = {
                left: this.scrollX,
                top: this.scrollY,
                width: this.width,
                height: this.height,
            };
            drawElementTree(ctx, this.scroller, ec, vpScroller);
            // TODO: restore transform in a finally?
            ctx.restore();
        };
        this.onTouchBeginHandler = (id, pp, ec) => {
            const cp = [pp[0] + this.scrollX, pp[1] + this.scrollY];
            const target = findTouchTarget(this.scroller, cp);
            if (target === undefined) {
                // Add placeholder null to active touches, so we know they should scroll.
                this.touchScroll.set(id, { prev: pp, curr: pp });
            }
            else {
                this.touchTargets.set(id, target);
                target.onTouchBeginHandler(id, cp, ec);
            }
        };
        this.onTouchMoveHandler = (ts, ec) => {
            const targets = new Map();
            for (const t of ts) {
                const target = this.touchTargets.get(t.id);
                const scroll = this.touchScroll.get(t.id);
                if (target !== undefined) {
                    const tts = targets.get(target) || [];
                    tts.push(t);
                    targets.set(target, tts);
                }
                else if (scroll !== undefined) {
                    scroll.prev = scroll.curr;
                    scroll.curr = t.p;
                }
                else {
                    throw new Error(`Unknown touch move ID ${t.id}`);
                }
            }
            // Update scroll position.
            let dx = 0;
            let dy = 0;
            for (const s of this.touchScroll.values()) {
                dx += s.prev[0] - s.curr[0];
                dy += s.prev[1] - s.curr[1];
            }
            this.scrollX = clamp(this.scrollX + dx, 0, this.scroller.width - this.width);
            this.scrollY = clamp(this.scrollY + dy, 0, this.scroller.height - this.height);
            // Forward touch moves.
            for (const [target, tts] of targets) {
                for (let i = 0; i < tts.length; i++) {
                    tts[i] = {
                        id: tts[i].id,
                        p: [tts[i].p[0] + this.scrollX, tts[i].p[1] + this.scrollY],
                    };
                }
                target.onTouchMoveHandler(tts, ec);
            }
            ec.requestDraw();
        };
        this.onTouchEndHandler = (id, ec) => {
            const target = this.touchTargets.get(id);
            if (target !== undefined) {
                this.touchTargets.delete(id);
                if (target.onTouchEndHandler !== undefined) {
                    target.onTouchEndHandler(id, ec);
                }
            }
            else if (!this.touchScroll.delete(id)) {
                throw new Error(`Unknown touch end ID ${id}`);
            }
        };
        // TODO: other handlers need forwarding.
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        this.scroller.layout(0, 0);
    }
}
export function Scroll(child, scrollx, scrolly) {
    return new ScrollLayout(child, scrollx, scrolly);
}
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
class BoxWithChildLayout extends WSHSLayout {
    constructor(width, height, child) {
        super(child);
        this.width = width;
        this.height = height;
    }
    layout(left, top) {
        this.left = left;
        this.top = top;
        this.child.layout(left, top, this.width, this.height);
    }
}
;
export function Box(width, height, child) {
    if (child !== undefined) {
        return new BoxWithChildLayout(width, height, child);
    }
    return new BoxLayout(width, height);
}
class FillLayout extends WPHPLayout {
    constructor() {
        super(undefined);
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
}
export function Fill() {
    return new FillLayout();
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
class LayerLayout extends WPHPLayout {
    constructor(children) {
        super(children);
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        for (const child of this.child) {
            child.layout(left, top, width, height);
        }
    }
}
;
export function Layer(...children) {
    return new LayerLayout(children);
}
class PositionLayout extends Element {
    constructor(left, top, width, height, child) {
        super("pos", child);
        this.requestLeft = left;
        this.requestTop = top;
        this.requestWidth = width;
        this.requestHeight = height;
    }
    layout(parent) {
        this.width = Math.min(this.requestWidth, parent.width);
        this.left = clamp(this.requestLeft, parent.left, parent.left + parent.width - this.width);
        this.height = Math.min(this.requestHeight, parent.height);
        this.top = clamp(this.requestTop, parent.top, parent.top + parent.height - this.height);
        this.child.layout(this.left, this.top, this.width, this.height);
    }
}
;
// TODO: support statically sized children, 
export function Position(left, top, width, height, child) {
    return new PositionLayout(left, top, width, height, child);
}
export function Draggable(left, top, width, height, child) {
    const layout = new PositionLayout(left, top, width, height, child);
    return layout.onPan((ps, ec) => {
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
class WPHPRelativeLayout extends WPHPLayout {
    constructor(children) {
        super(children);
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        for (const child of this.child) {
            child.layout(this /* LayoutBox */);
        }
    }
}
export function Relative(...children) {
    return new WPHPRelativeLayout(children);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBZW5ELENBQUM7QUFtQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBWWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQzlELEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRTtvQkFDaEIsOERBQThEO29CQUM5RCxJQUFJLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTt3QkFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFOzRCQUNoQixJQUFJLEVBQUUsQ0FBQzs0QkFDUCxJQUFJ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O0FBQ2hDLFFBQVE7QUFDUixnREFBZ0Q7QUFDaEQsNEJBQTRCO0FBQzVCLDBCQUEwQjtBQUUxQiw0Q0FBNEM7QUFDNUMsa0RBQWtEO0FBQ2xELFlBQVk7QUFDWixRQUFRO0FBQ1IsS0FBSztBQUVMLE1BQU0sa0JBQW1CLFNBQVEsVUFBdUM7SUFDcEUsWUFBWSxRQUFxQztRQUM3QyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzVCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQ3RDO0lBQ0wsQ0FBQztDQUNKO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxHQUFHLFFBQStCO0lBQ3ZELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUM1QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRGljayAyMDIxXG5cbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi4vcG9pbnQuanNcIlxuXG5leHBvcnQgdHlwZSBMYXlvdXRCb3ggPSB7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHRvcDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59O1xuXG4vLyBUT0RPOiBQYXNzIEVsZW1lbnRDb250ZXh0IGFsb25nIHdpdGggbGF5b3V0LCBzbyB0aGF0IHdlIGNhbiBoYXZlIGR5bmFtaWMgbGF5b3V0cy5cblxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50Q29udGV4dCB7XG4gICAgcmVxdWVzdERyYXcoKTogdm9pZDtcbiAgICByZXF1ZXN0TGF5b3V0KCk6IHZvaWQ7XG4gICAgLy8gVE9ETzogcmVxdWVzdFJlbmRlcj9cbn07XG5cbnR5cGUgU3RhdGVsZXNzSGFuZGxlciA9IChlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIE9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpID0+IHZvaWQ7XG5cbnR5cGUgT25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIFRvdWNoTW92ZSA9IHtcbiAgICByZWFkb25seSBpZDogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHA6IFBvaW50MkQ7XG59O1xudHlwZSBPblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG50eXBlIE9uVGFwSGFuZGxlciA9IChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIFBhblBvaW50ID0ge1xuICAgIHByZXY6IFBvaW50MkQ7XG4gICAgY3VycjogUG9pbnQyRDtcbn07XG50eXBlIE9uUGFuSGFuZGxlciA9IChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG4vLyBUT0RPOiBQYXNzIHRvdWNoIHNpemUgZG93biB3aXRoIHRvdWNoIGV2ZW50cyAoaW5zdGVhZCBvZiBzY2FsZT8pXG4vLyBJcyB0aGF0IGVub3VnaD8gUHJvYmFibHkgd2Ugd2lsbCBhbHdheXMgd2FudCBhIHRyYW5zb2Zvcm1hdGlvbiBtYXRyaXguXG4vLyBCdXQgZW5vdWdoIGZvciBub3csIHNvIGp1c3QgZG8gdGhhdC5cblxuY2xhc3MgVG91Y2hHZXN0dXJlIHtcbiAgICBvblRhcEhhbmRsZXI/OiBPblRhcEhhbmRsZXI7XG4gICAgb25QYW5IYW5kbGVyPzogT25QYW5IYW5kbGVyO1xuICAgIG9uUGFuQmVnaW5IYW5kbGVyPzogU3RhdGVsZXNzSGFuZGxlcjtcbiAgICBvblBhbkVuZEhhbmRsZXI/OiBTdGF0ZWxlc3NIYW5kbGVyO1xuXG4gICAgcHJpdmF0ZSBhY3RpdmU6IE1hcDxudW1iZXIsIFBvaW50MkQ+O1xuICAgIHByaXZhdGUgcGFuczogTWFwPG51bWJlciwgUGFuUG9pbnQ+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wYW5zID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgXzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLnNldChpZCwgcCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBUb3VjaE1vdmVbXSwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChhICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBwYXNzIGluIGRpc3RhbmNlIHRocmVzaG9sZD8gU2NhbGUgYmFzZSBvbiB0cmFuc2Zvcm1zP1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnREaXN0YW5jZShhLCB0LnApID49IDE2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IGEsICAgIC8vIFVzZSB0aGUgc3RhcnQgcG9pbnQgaGVyZSwgc28gdGhlIGZpcnN0IG1vdmUgaXMgZnJvbSB0aGUgc3RhcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wYW5zLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAocCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25QYW5CZWdpbkhhbmRsZXIoZWMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogcC5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogdC5wLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPiAwICYmIHRoaXMub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuSGFuZGxlcihbLi4udGhpcy5wYW5zLnZhbHVlcygpXSwgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoYSAhPT0gdW5kZWZpbmVkICYmIHRoaXMub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uVGFwSGFuZGxlcihhLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5kZWxldGUoaWQpICYmIHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuRW5kSGFuZGxlcihlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcblxuLy8gU28gdGhhdCB3ZSBjYW4gdGFrZSBJQXJndW1lbnRzIGFzIGNoaWxkcmVuXG5pbnRlcmZhY2UgU3RhdGljQXJyYXk8VD4ge1xuICAgIFtpbmRleDogbnVtYmVyXTogVDtcbiAgICBsZW5ndGg6IG51bWJlcjtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+O1xufTtcblxudHlwZSBDaGlsZENvbnN0cmFpbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZz4gPSBFbGVtZW50PExheW91dFR5cGUsIGFueT4gfCBTdGF0aWNBcnJheTxFbGVtZW50PExheW91dFR5cGUsIGFueT4+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpbml0VG91Y2hHZXN0dXJlKGU6IEVsZW1lbnQ8YW55LCBhbnk+KTogVG91Y2hHZXN0dXJlIHtcbiAgICBpZiAoZS50b3VjaEdlc3R1cmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZS50b3VjaEdlc3R1cmU7XG4gICAgfVxuICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RvdWNoIGdlc3R1cmVzIGFscmVhZHkgY2FwdHVyZWQnKTtcbiAgICB9XG4gICAgY29uc3QgdGcgPSBuZXcgVG91Y2hHZXN0dXJlKCk7XG4gICAgZS5vblRvdWNoQmVnaW5IYW5kbGVyID0gdGcub25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hNb3ZlSGFuZGxlciA9IHRnLm9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hFbmRIYW5kbGVyID0gdGcub25Ub3VjaEVuZEhhbmRsZXI7XG4gICAgcmV0dXJuIHRnO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHggPCBtaW4pIHtcbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9IGVsc2UgaWYgKHggPiBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG59XG5cbmNsYXNzIEVsZW1lbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZywgQ2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8c3RyaW5nPj4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgfVxuXG4gICAgb25EcmF3SGFuZGxlcj86IE9uRHJhd0hhbmRsZXI7XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcj86IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyO1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlO1xuICAgIG9uVGFwKGhhbmRsZXI6IE9uVGFwSGFuZGxlcik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5CZWdpbihoYW5kbGVyOiBTdGF0ZWxlc3NIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5CZWdpbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuRW5kKGhhbmRsZXI6IFN0YXRlbGVzc0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5FbmQgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkF0dGFjaEhhbmRsZXI/OiBTdGF0ZWxlc3NIYW5kbGVyO1xuICAgIG9uQXR0YWNoKGhhbmRsZXI6IFN0YXRlbGVzc0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25BdHRhY2hIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgb25BdHRhY2ggYWxyZWFkeSBzZXRgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uQXR0YWNoSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uRGV0YWNoSGFuZGxlcj86IFN0YXRlbGVzc0hhbmRsZXI7XG4gICAgb25EZXRhY2goaGFuZGxlcjogU3RhdGVsZXNzSGFuZGxlcik6IHRoaXMge1xuICAgICAgICBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBvbkRldGFjaCBhbHJlYWR5IHNldGApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxufTtcblxuYWJzdHJhY3QgY2xhc3MgV1BIUExheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+PiBleHRlbmRzIEVsZW1lbnQ8J3dwaHAnLCBDaGlsZD4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocCcsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdQSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3cGhzJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHMnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3c2hwJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dzaHAnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXU0hTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3NocycsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hzJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5jbGFzcyBGbGV4TGF5b3V0IGV4dGVuZHMgRWxlbWVudDwnZmxleCcsIFdQSFBMYXlvdXQ8YW55Pj4ge1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBncm93OiBudW1iZXI7XG4gICAgY29uc3RydWN0b3Ioc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoJ2ZsZXgnLCBjaGlsZCk7XG4gICAgICAgIHRoaXMuc2l6ZSA9IHNpemU7XG4gICAgICAgIHRoaXMuZ3JvdyA9IGdyb3c7XG4gICAgfVxuICAgIGxheW91dChsZWZ0Om51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIGNhbGxBdHRhY2hIYW5kbGVycyhyb290OiBFbGVtZW50PGFueSwgYW55PiwgaGFuZGxlcjogXCJvbkF0dGFjaEhhbmRsZXJcIiB8IFwib25EZXRhY2hIYW5kbGVyXCIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55PjtcbiAgICAgICAgY29uc3QgaCA9IGVbaGFuZGxlcl07XG4gICAgICAgIGlmIChoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGgoZWMpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIHZpc2l0IGl0IGxhc3QuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gZS5jaGlsZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5maWxsUmVjdChyb290LmxlZnQsIHJvb3QudG9wLCByb290LndpZHRoLCByb290LmhlaWdodCk7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnk+O1xuICAgICAgICBpZiAoZS5vbkRyYXdIYW5kbGVyKSB7XG4gICAgICAgICAgICBlLm9uRHJhd0hhbmRsZXIoY3R4LCBlLCBlYywgdnApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIGRyYXcgaXQgbGFzdC5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBlLmNoaWxkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmludGVyZmFjZSBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjtcbn07XG5cbmNsYXNzIERlYm91bmNlciB7XG4gICAgYm91bmNlOiAoKSA9PiB2b2lkO1xuICAgIHRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKGY6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5ib3VuY2UgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lb3V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICBmKCk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY2xlYXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5mdW5jdGlvbiBmaW5kVG91Y2hUYXJnZXQocm9vdDogRWxlbWVudDxhbnksIGFueT4sIHA6IFBvaW50MkQpOiB1bmRlZmluZWQgfCBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICBjb25zdCB4ID0gcFswXTtcbiAgICBjb25zdCB5ID0gcFsxXTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGUgYXMgSGFzVG91Y2hIYW5kbGVyczsgLy8gVE9ETzogV2h5IGNhbid0IHR5cGUgaW5mZXJlbmNlIGZpZ3VyZSB0aGlzIG91dD9cbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBmaXJzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgdmlzaXQgbGFzdCBjaGlsZCBsYXN0LlxuICAgICAgICAgICAgLy8gVGhlIGxhc3QgY2hpbGQgKHRoZSBvbmUgb24gdG9wKSBzaG91bGQgb3ZlcnJpZGUgcHJldmlvdXMgY2hpbGRyZW4ncyB0YXJnZXQuXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCBpbXBsZW1lbnRzIEVsZW1lbnRDb250ZXh0IHtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnk+O1xuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gICAgcmVzaXplOiBSZXNpemVPYnNlcnZlcjtcbiAgICB2cDogTGF5b3V0Qm94O1xuXG4gICAgLy8gVE9ETzogd2Ugc2hvdWxkIG5vdCByZXJlbmRlciBpZiB0aGVyZSBhcmUgcGVuZGluZyBsYXlvdXQgcmVxdWVzdHMuXG4gICAgZGVib3VuY2VMYXlvdXQ6IERlYm91bmNlcjtcbiAgICBkZWJvdW5jZURyYXc6IERlYm91bmNlcjtcblxuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzIHwgbnVsbD47XG4gICAgcHJpdmF0ZSB0b3VjaFN0YXJ0OiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkOyBcbiAgICBwcml2YXRlIHRvdWNoTW92ZTogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIHRvdWNoRW5kOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIFxuXG4gICAgY29uc3RydWN0b3IoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIsIHthbHBoYTogZmFsc2UsIGRlc3luY2hyb25pemVkOiB0cnVlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcbiAgICAgICAgdGhpcy5yZXNpemUgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNpemVPYnNlcnZlciBleHBlY3RzIDEgZW50cnksIGdvdCAke2VudHJpZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVudHJpZXNbMF0uY29udGVudFJlY3Q7XG4gICAgICAgICAgICBjb25zdCB2cCA9IHRoaXMudnA7XG4gICAgICAgICAgICB2cC5sZWZ0ID0gMDtcbiAgICAgICAgICAgIHZwLnRvcCA9IDA7XG4gICAgICAgICAgICB2cC53aWR0aCA9IGNvbnRlbnQud2lkdGg7XG4gICAgICAgICAgICB2cC5oZWlnaHQgPSBjb250ZW50LmhlaWdodFxuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gdnAud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSB2cC5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGN0eC50cmFuc2Zvcm0od2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDAsIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdnAud2lkdGgsIHZwLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICAgICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5jaGlsZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdnApO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXNpemUub2JzZXJ2ZShjYW52YXMsIHtib3g6IFwiZGV2aWNlLXBpeGVsLWNvbnRlbnQtYm94XCJ9KTtcbiAgICAgICAgdGhpcy52cCA9IHtcbiAgICAgICAgICAgIGxlZnQ6IDAsXG4gICAgICAgICAgICB0b3A6IDAsXG4gICAgICAgICAgICB3aWR0aDogY2FudmFzLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBjYW52YXMuaGVpZ2h0LFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KDAsIDAsIHRoaXMudnAud2lkdGgsIHRoaXMudnAuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVxdWVzdExheW91dCA9IHRoaXMuZGVib3VuY2VMYXlvdXQuYm91bmNlO1xuXG4gICAgICAgIHRoaXMuZGVib3VuY2VEcmF3ID0gbmV3IERlYm91bmNlcigoKSA9PiB7XG4gICAgICAgICAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB0aGlzLnZwKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVxdWVzdERyYXcgPSB0aGlzLmRlYm91bmNlRHJhdy5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTdGFydCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwOiBQb2ludDJEID0gW3QuY2xpZW50WCwgdC5jbGllbnRZXTtcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5jaGlsZCwgcCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIG51bGwpO1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdG8gYWN0aXZlIHRhcmdldHMgbWFwIHNvIHdlIGtub3cgYW5ib3V0IGl0LlxuICAgICAgICAgICAgICAgICAgICAvLyBBbGxvdyBkZWZhdWx0IGFjdGlvbiwgc28gZS5nLiBwYWdlIGNhbiBiZSBzY3JvbGxlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKHQuaWRlbnRpZmllciwgcCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgLy8gU29tZSB0YXJnZXQgd2FzIHNvbWUgZm9yIGF0IGxlYXN0IHNvbWUgb2YgdGhlIHRvdWNoZXMuIERvbid0IGxldCBhbnl0aGluZ1xuICAgICAgICAgICAgICAgIC8vIGluIEhUTUwgZ2V0IHRoaXMgdG91Y2guXG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hNb3ZlID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzLCBBcnJheTxUb3VjaE1vdmU+PigpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggbW92ZSB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRzID0gdGFyZ2V0cy5nZXQodGFyZ2V0KSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdC5pZGVudGlmaWVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgcDogW3QuY2xpZW50WCwgdC5jbGllbnRZXSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMuc2V0KHRhcmdldCwgdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHNdIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHRzLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoRW5kID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkID0gbmV3IE1hcCh0aGlzLnRvdWNoVGFyZ2V0cyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVtb3ZlZC5kZWxldGUodC5pZGVudGlmaWVyKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBlbmQgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbaWQsIHRhcmdldF0gb2YgcmVtb3ZlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoRW5kSGFuZGxlcihpZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG5cbiAgICAgICAgY2FsbEF0dGFjaEhhbmRsZXJzKHRoaXMuY2hpbGQsIFwib25BdHRhY2hIYW5kbGVyXCIsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICB0aGlzLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnJlc2l6ZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VEcmF3LmNsZWFyKCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQuY2xlYXIoKTtcbiAgICAgICAgLy8gVE9ETzogZGV0YWNoIGFsbCBjaGlsZHJlbi5cblxuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBFbGVtZW50Q29udGV4dCBmdW5jdGlvbnNcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgcmVxdWVzdERyYXc6ICgpID0+IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dDogKCkgPT4gdm9pZDtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBUb3VjaEhhbmRsZXIgZnVuY3Rpb25zXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIFRPRE86IGFkZCBUb3VjaEZvcndhcmRlciBoZXJlLiBpbnN0YWxsIHRvdWNoIGhhbmRsZXJzXG59O1xuXG4vLyBUT0RPOiBNYWtlIGl0IHBhbiAoaGF2ZSBhIHByb3ZpZGVkIHNpemUpXG4vLyBUT0RPOiBIYXZlIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiAoc28gaGlkZSBjaGlsZHJlbiwgYW5kIGZvcndhcmQgdGFwL3Bhbi9kcmF3IG1hbnVhbGx5LCB3aXRoIHRyYW5zZm9ybSlcbi8vIFRPRE86IE1ha2UgaXQgem9vbVxuLy8gVE9ETzogbWF5YmUgaGF2ZSB0d28gZWxlbWVudHM/IGEgdmlld3BvcnQgYW5kIGEgSFNXUyB3aXRoIGFic29sdXRlbHkgcG9zaXRpb25lZCBjaGlsZHJlbiBhbmQgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXNcblxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IHtcbiAgICAvLyBTY3JvbGxMYXlvdXQgaGFzIHRvIGludGVyY2VwdCBhbGwgZXZlbnRzIHRvIG1ha2Ugc3VyZSBhbnkgbG9jYXRpb25zIGFyZSB1cGRhdGVkIGJ5XG4gICAgLy8gdGhlIHNjcm9sbCBwb3NpdGlvbiwgc28gY2hpbGQgaXMgdW5kZWZpbmVkLCBhbmQgYWxsIGV2ZW50cyBhcmUgZm9yd2FyZGVkIHRvIHNjcm9sbGVyLlxuICAgIHNjcm9sbGVyOiBXU0hTTGF5b3V0PGFueT47XG4gICAgc2Nyb2xsWDogbnVtYmVyO1xuICAgIHNjcm9sbFk6IG51bWJlcjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVycz47XG4gICAgcHJpdmF0ZSB0b3VjaFNjcm9sbDogTWFwPG51bWJlciwgeyBwcmV2OiBQb2ludDJELCBjdXJyOiBQb2ludDJEIH0+O1xuXG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xsWD86IG51bWJlciwgc2Nyb2xsWT86IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnNjcm9sbGVyID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuc2Nyb2xsWCA9IHNjcm9sbFggfHwgMDtcbiAgICAgICAgdGhpcy5zY3JvbGxZID0gc2Nyb2xsWSB8fCAwO1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFNjcm9sbCA9IG5ldyBNYXAoKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICAgICAgLy8gVE9ETzogY2xpcC5cbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUoLXRoaXMuc2Nyb2xsWCwgLXRoaXMuc2Nyb2xsWSk7XG4gICAgICAgICAgICBjb25zdCB2cFNjcm9sbGVyID0ge1xuICAgICAgICAgICAgICAgIGxlZnQ6IHRoaXMuc2Nyb2xsWCxcbiAgICAgICAgICAgICAgICB0b3A6IHRoaXMuc2Nyb2xsWSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuc2Nyb2xsZXIsIGVjLCB2cFNjcm9sbGVyKTtcbiAgICAgICAgICAgIC8vIFRPRE86IHJlc3RvcmUgdHJhbnNmb3JtIGluIGEgZmluYWxseT9cbiAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNwOiBQb2ludDJEID0gW3BwWzBdICsgdGhpcy5zY3JvbGxYLCBwcFsxXSArIHRoaXMuc2Nyb2xsWV07XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5zY3JvbGxlciwgY3ApO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIG51bGwgdG8gYWN0aXZlIHRvdWNoZXMsIHNvIHdlIGtub3cgdGhleSBzaG91bGQgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTY3JvbGwuc2V0KGlkLCB7IHByZXY6IHBwLCBjdXJyOiBwcCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKGlkLCBjcCwgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzLCBBcnJheTxUb3VjaE1vdmU+PigpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjcm9sbCA9IHRoaXMudG91Y2hTY3JvbGwuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0dHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0dHMucHVzaCh0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0dHMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2Nyb2xsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLnByZXYgPSBzY3JvbGwuY3VycjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLmN1cnIgPSB0LnA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIG1vdmUgSUQgJHt0LmlkfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHNjcm9sbCBwb3NpdGlvbi5cbiAgICAgICAgICAgIGxldCBkeCA9IDA7XG4gICAgICAgICAgICBsZXQgZHkgPSAwO1xuICAgICAgICAgICAgZm9yIChjb25zdCBzIG9mIHRoaXMudG91Y2hTY3JvbGwudmFsdWVzKCkpIHtcbiAgICAgICAgICAgICAgICBkeCArPSBzLnByZXZbMF0gLSBzLmN1cnJbMF07XG4gICAgICAgICAgICAgICAgZHkgKz0gcy5wcmV2WzFdIC0gcy5jdXJyWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zY3JvbGxYID0gY2xhbXAodGhpcy5zY3JvbGxYICsgZHgsIDAsIHRoaXMuc2Nyb2xsZXIud2lkdGggLSB0aGlzLndpZHRoKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWSA9IGNsYW1wKHRoaXMuc2Nyb2xsWSArIGR5LCAwLCB0aGlzLnNjcm9sbGVyLmhlaWdodCAtIHRoaXMuaGVpZ2h0KTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzW2ldID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHR0c1tpXS5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IFt0dHNbaV0ucFswXSArIHRoaXMuc2Nyb2xsWCwgdHRzW2ldLnBbMV0gKyB0aGlzLnNjcm9sbFldLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHR0cywgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldChpZCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIGVjKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLnRvdWNoU2Nyb2xsLmRlbGV0ZShpZCkpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggZW5kIElEICR7aWR9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IG90aGVyIGhhbmRsZXJzIG5lZWQgZm9yd2FyZGluZy5cbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxlci5sYXlvdXQoMCwgMCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gU2Nyb2xsKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4sIHNjcm9sbHg/OiBudW1iZXIsIHNjcm9sbHk/OiBudW1iZXIpOiBTY3JvbGxMYXlvdXQge1xuICAgIHJldHVybiBuZXcgU2Nyb2xsTGF5b3V0KGNoaWxkLCBzY3JvbGx4LCBzY3JvbGx5KTtcbn1cblxuLy8gVE9ETzogc2Nyb2xseCwgc2Nyb2xseVxuXG5jbGFzcyBCb3hMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgIH1cbn07XG5cbmNsYXNzIEJveFdpdGhDaGlsZExheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8V1BIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOldQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3god2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkPzogV1BIUExheW91dDxhbnk+KTogV1NIU0xheW91dDxhbnk+IHtcbiAgICBpZiAoY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbmV3IEJveFdpdGhDaGlsZExheW91dCh3aWR0aCwgaGVpZ2h0LCBjaGlsZCk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQm94TGF5b3V0KHdpZHRoLCBoZWlnaHQpO1xufVxuXG5jbGFzcyBGaWxsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRmlsbCgpOiBGaWxsTGF5b3V0IHtcbiAgICByZXR1cm4gbmV3IEZpbGxMYXlvdXQoKTtcbn1cblxuY2xhc3MgQ2VudGVyTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBDZW50ZXJMYXlvdXQge1xuICAgIHJldHVybiBuZXcgQ2VudGVyTGF5b3V0KGNoaWxkKTtcbn1cblxuY2xhc3MgSENlbnRlckhQTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXU0hQTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgSENlbnRlckhTTGF5b3V0IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IEhDZW50ZXJIU0xheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyKGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pOiBIQ2VudGVySFBMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1NIUExheW91dDxhbnk+KTogSENlbnRlckhTTGF5b3V0IHwgSENlbnRlckhQTGF5b3V0IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dzaHAnKSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhQTGF5b3V0KGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBWQ2VudGVyV1BMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXUEhTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wLCB3aWR0aCk7XG4gICAgfVxufTtcblxuY2xhc3MgVkNlbnRlcldTTGF5b3V0IGV4dGVuZHMgV1NIUExheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IGNoaWxkLndpZHRoO1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBWQ2VudGVyV1NMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcihjaGlsZDogV1BIU0xheW91dDxhbnk+KTogVkNlbnRlcldQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdQSFNMYXlvdXQ8YW55Pik6IFZDZW50ZXJXU0xheW91dCB8IFZDZW50ZXJXUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3cGhzJykge1xuICAgICAgICByZXR1cm4gbmV3IFZDZW50ZXJXUExheW91dChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1NMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgTGVmdEhTTGF5b3V0IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuY2xhc3MgTGVmdFN0YWNrTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXU0hQTGF5b3V0PGFueT4+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGRyZW46IFN0YXRpY0FycmF5PFdTSFBMYXlvdXQ8YW55Pj4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGxldCBjaGlsZExlZnQgPSBsZWZ0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGQud2lkdGg7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5jbGFzcyBMZWZ0RmxleExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8RmxleExheW91dD4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dD4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuICAgICAgICBsZXQgc2l6ZVN1bSA9IDA7XG4gICAgICAgIGxldCBncm93U3VtID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgc2l6ZVN1bSArPSBjaGlsZC5zaXplO1xuICAgICAgICAgICAgZ3Jvd1N1bSArPSBjaGlsZC5ncm93O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dHJhID0gd2lkdGggLSBzaXplU3VtO1xuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgY29uc3QgY2hpbGRXaWR0aCA9IGNoaWxkLnNpemUgKyBjaGlsZC5ncm93ICogZXh0cmEgLyBncm93U3VtO1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBjaGlsZFdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkLnNpemU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBXUEhTTGF5b3V0PGFueT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDA6IFdTSFBMYXlvdXQ8YW55PiwgLi4uY2hpbGRSZXN0OiBBcnJheTxXU0hQTGF5b3V0PGFueT4+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQwOiBGbGV4TGF5b3V0LCAuLi5jaGlsZFJlc3Q6IEFycmF5PEZsZXhMYXlvdXQ+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55PiB8IEZsZXhMYXlvdXQsIC4uLl86IEFycmF5PFdTSFBMYXlvdXQ8YW55Pj4gfCBBcnJheTxGbGV4TGF5b3V0Pik6IFdQSFNMYXlvdXQ8YW55PiB8IFdQSFBMYXlvdXQ8YW55PiB7XG4gICAgc3dpdGNoIChjaGlsZC5sYXlvdXRUeXBlKSB7XG4gICAgICAgIGNhc2UgJ2ZsZXgnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0RmxleExheW91dChhcmd1bWVudHMpO1xuICAgICAgICBjYXNlICd3c2hwJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdFN0YWNrTGF5b3V0KGFyZ3VtZW50cyk7XG4gICAgICAgIGNhc2UgJ3dzaHMnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0SFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgUmlnaHRIUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgUmlnaHRIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0IHwgUmlnaHRIUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IFJpZ2h0SFBMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgUmlnaHRIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBEZWJ1Z1RvdWNoKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaWxsOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIHN0cm9rZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKTogQm94TGF5b3V0IHtcbiAgICBjb25zdCB0YXBzOiBBcnJheTxQb2ludDJEPiA9IFtdO1xuICAgIGNvbnN0IHBhbnM6IEFycmF5PEFycmF5PFBhblBvaW50Pj4gPSBbXTtcbiAgICByZXR1cm4gQm94KFxuICAgICAgICB3aWR0aCxcbiAgICAgICAgaGVpZ2h0LFxuICAgICkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGZpbGw7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0cm9rZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGZvciAoY29uc3QgdGFwIG9mIHRhcHMpIHtcbiAgICAgICAgICAgIGN0eC5tb3ZlVG8odGFwWzBdICsgMTYsIHRhcFsxXSk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZSh0YXBbMF0sIHRhcFsxXSwgMTYsIDE2LCAwLCAwLCAyICogTWF0aC5QSSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBwcyBvZiBwYW5zKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcHMpIHtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHAucHJldlswXSwgcC5wcmV2WzFdKTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHAuY3VyclswXSwgcC5jdXJyWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfSkub25UYXAoKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICB0YXBzLnB1c2gocCk7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25QYW4oKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBwYW5zLnB1c2gocHMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pO1xufVxuXG4vLyBUT0RPOiBUb3AsIEJvdHRvbVxuXG5jbGFzcyBMYXllckxheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnk+Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIExheWVyKC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueT4+KTogTGF5ZXJMYXlvdXQge1xuICAgIHJldHVybiBuZXcgTGF5ZXJMYXlvdXQoY2hpbGRyZW4pO1xufVxuXG5cbmNsYXNzIFBvc2l0aW9uTGF5b3V0IGV4dGVuZHMgRWxlbWVudDxcInBvc1wiLCBXUEhQTGF5b3V0PGFueT4+IHtcbiAgICByZXF1ZXN0TGVmdDogbnVtYmVyO1xuICAgIHJlcXVlc3RUb3A6IG51bWJlcjtcbiAgICByZXF1ZXN0V2lkdGg6IG51bWJlcjtcbiAgICByZXF1ZXN0SGVpZ2h0OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihcInBvc1wiLCBjaGlsZCk7XG4gICAgICAgIHRoaXMucmVxdWVzdExlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJlcXVlc3RUb3AgPSB0b3A7XG4gICAgICAgIHRoaXMucmVxdWVzdFdpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMucmVxdWVzdEhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KHBhcmVudDogTGF5b3V0Qm94KSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RXaWR0aCwgcGFyZW50LndpZHRoKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gY2xhbXAodGhpcy5yZXF1ZXN0TGVmdCwgcGFyZW50LmxlZnQsIHBhcmVudC5sZWZ0ICsgcGFyZW50LndpZHRoIC0gdGhpcy53aWR0aCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0SGVpZ2h0LCBwYXJlbnQuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy50b3AgPSBjbGFtcCh0aGlzLnJlcXVlc3RUb3AsIHBhcmVudC50b3AsIHBhcmVudC50b3AgKyBwYXJlbnQuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KHRoaXMubGVmdCwgdGhpcy50b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICB9XG59O1xuXG4vLyBUT0RPOiBzdXBwb3J0IHN0YXRpY2FsbHkgc2l6ZWQgY2hpbGRyZW4sIFxuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERyYWdnYWJsZShsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgIGNvbnN0IGxheW91dCA9IG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbiAgICByZXR1cm4gbGF5b3V0Lm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgbGV0IGR4ID0gMDtcbiAgICAgICAgbGV0IGR5ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBkeCArPSBwLmN1cnJbMF0gLSBwLnByZXZbMF07XG4gICAgICAgICAgICBkeSArPSBwLmN1cnJbMV0gLSBwLnByZXZbMV07XG4gICAgICAgIH1cbiAgICAgICAgZHggLz0gcHMubGVuZ3RoO1xuICAgICAgICBkeSAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCArPSBkeDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgKz0gZHk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KS5vblBhbkVuZCgoKSA9PiB7XG4gICAgICAgIC8vIFRoZSByZXF1ZXN0ZWQgbG9jYXRpb24gY2FuIGJlIG91dHNpZGUgdGhlIGFsbG93ZWQgYm91bmRzIGlmIGRyYWdnZWQgb3V0c2lkZSxcbiAgICAgICAgLy8gYnV0IG9uY2UgdGhlIGRyYWcgaXMgb3Zlciwgd2Ugd2FudCB0byByZXNldCBpdCBzbyB0aGF0IGl0IGRvZXNuJ3Qgc3RhcnQgdGhlcmVcbiAgICAgICAgLy8gb25jZSBhIG5ldyBkcmFnIHN0YXJ0LlxuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgPSBsYXlvdXQubGVmdDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgPSBsYXlvdXQudG9wO1xuICAgIH0pO1xufVxuXG5cbi8vIFRPRE86IGRvZXMgaXQgbWFrZSBzZW5zZSB0byBtYWtlIG90aGVyIGxheW91dCB0eXBlcz9cbi8vIGNsYXNzIFdTSFNSZWxhdGl2ZUxheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+PiB7XG4vLyAgICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbi8vICAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuLy8gICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4vLyAgICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuLy8gICAgIH1cbi8vICAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuLy8gICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuLy8gICAgICAgICB0aGlzLnRvcCA9IHRvcDtcblxuLy8gICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbi8vICAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4vLyAgICAgICAgIH1cbi8vICAgICB9XG4vLyB9O1xuXG5jbGFzcyBXUEhQUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmUoLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0Pik6IFdQSFBSZWxhdGl2ZUxheW91dCB7XG4gICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQoY2hpbGRyZW4pO1xufVxuIl19