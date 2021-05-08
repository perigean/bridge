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
function clearAndDrawElementTree(ctx, root, ec, vp) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
    drawElementTree(ctx, root, ec, vp);
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
            clearAndDrawElementTree(ctx, this.child, this /* ElementContext */, vp);
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
            clearAndDrawElementTree(ctx, this.child, this /* ElementContext */, this.vp);
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
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures
// TODO: convert to use Affine transform.
class ScrollLayout extends WPHPLayout {
    // private c2p(childCoord: Point2D): Point2D {
    //     return pointSub(childCoord, this.scroll);
    // }
    constructor(child, scroll, zoom, zoomMax) {
        // TODO: min zoom;
        super(undefined);
        this.scroller = child;
        this.scroll = scroll;
        this.zoom = zoom;
        this.zoomMax = zoomMax;
        this.touchTargets = new Map();
        this.touchScroll = new Map();
        this.onDrawHandler = (ctx, _box, ec, _vp) => {
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
                width: this.width,
                height: this.height,
            };
            drawElementTree(ctx, this.scroller, ec, vpScroller);
            // TODO: restore transform in a finally?
            ctx.restore();
        };
        this.onTouchBeginHandler = (id, pp, ec) => {
            const cp = this.p2c(pp);
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
    updateScroll() {
        const ts = [...this.touchScroll.values()];
        if (ts.length === 1) {
            const t = ts[0];
            const p = this.p2c(t.prev);
            const c = this.p2c(t.curr);
            this.scroll[0] += p[0] - c[0];
            this.scroll[1] += p[1] - c[1];
        }
        else if (ts.length === 2) {
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
    p2c(p) {
        const s = this.scroll;
        const shrink = 1 / this.zoom;
        // TODO: take parent rect into account
        return [
            (p[0] - this.left) * shrink + s[0],
            (p[1] - this.top) * shrink + s[1],
        ];
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        this.scroller.layout(0, 0);
    }
}
export function Scroll(child, scroll, zoom, zoomMax) {
    // NB: scale of 0 is invalid anyways, so it's OK to be falsy.
    return new ScrollLayout(child, scroll || [0, 0], zoom || 1, zoomMax || 10);
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
class WPHPBorderLayout extends WPHPLayout {
    constructor(child, border, style) {
        super(child);
        this.border = border;
        this.style = style;
        this.onDrawHandler = (ctx, box) => {
            const b = this.border;
            const b2 = b * 0.5;
            ctx.strokeStyle = this.style;
            ctx.lineWidth = this.border;
            ctx.strokeRect(box.left + b2, box.top + b2, box.width - b, box.height - b);
        };
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        const b = this.border;
        this.child.layout(left + b, top + b, width - b * 2, height - b * 2);
    }
}
export function Border(width, style, child) {
    return new WPHPBorderLayout(child, width, style);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBZW5ELENBQUM7QUFtQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBWWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQzlELEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRTtvQkFDaEIsOERBQThEO29CQUM5RCxJQUFJLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTt3QkFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFOzRCQUNoQixJQUFJLEVBQUUsQ0FBQzs0QkFDUCxJQUFJ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RSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7Z0JBQ2hCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRztnQkFDckMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO2FBQ3hDLENBQUMsQ0FBQztZQUNILE1BQU0sRUFBRSxHQUFHLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRCxNQUFNLEVBQUUsR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLDJDQUEyQztZQUMzQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDOUMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO2FBQ2hEO1lBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQzthQUNsRDtZQUNELElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFO2dCQUMxQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7YUFDNUI7WUFDRCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO2dCQUNoQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUc7Z0JBQ3JDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRzthQUN4QyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ25DO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDOUYsQ0FBQztJQUVPLEdBQUcsQ0FBQyxDQUFVO1FBQ2xCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDdEIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDN0Isc0NBQXNDO1FBQ3RDLE9BQU87WUFDSCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3BDLENBQUM7SUFDTixDQUFDO0lBa0dELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7Q0FDSjtBQUVELE1BQU0sVUFBVSxNQUFNLENBQUMsS0FBc0IsRUFBRSxNQUFnQixFQUFFLElBQWEsRUFBRSxPQUFnQjtJQUM1Riw2REFBNkQ7SUFDN0QsT0FBTyxJQUFJLFlBQVksQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksSUFBSSxDQUFDLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQy9FLENBQUM7QUFFRCx5QkFBeUI7QUFFekIsTUFBTSxTQUFVLFNBQVEsVUFBcUI7SUFDekMsWUFBWSxLQUFhLEVBQUUsTUFBYztRQUNyQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDekIsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVztRQUM1QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNuQixDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxrQkFBbUIsU0FBUSxVQUEyQjtJQUN4RCxZQUFZLEtBQWEsRUFBRSxNQUFjLEVBQUUsS0FBcUI7UUFDNUQsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2IsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDekIsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVztRQUM1QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLE1BQU0sVUFBVSxHQUFHLENBQUMsS0FBYSxFQUFFLE1BQWMsRUFBRSxLQUF1QjtJQUN0RSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUU7UUFDckIsT0FBTyxJQUFJLGtCQUFrQixDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDdkQ7SUFDRCxPQUFPLElBQUksU0FBUyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztBQUN4QyxDQUFDO0FBRUQsTUFBTSxnQkFBaUIsU0FBUSxVQUEyQjtJQUd0RCxZQUFZLEtBQXNCLEVBQUUsTUFBYyxFQUFFLEtBQThDO1FBQzlGLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRW5CLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxFQUFFO1lBQ25FLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUNuQixHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDN0IsR0FBRyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1lBQzVCLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRSxDQUFDLENBQUM7SUFDTixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7Q0FDSjtBQUVELE1BQU0sVUFBVSxNQUFNLENBQUMsS0FBYSxFQUFFLEtBQThDLEVBQUUsS0FBc0I7SUFDeEcsT0FBTyxJQUFJLGdCQUFnQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDckQsQ0FBQztBQUVELE1BQU0sVUFBVyxTQUFRLFVBQXFCO0lBQzFDO1FBQ0ksS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3pCLENBQUM7Q0FDSjtBQUVELE1BQU0sVUFBVSxJQUFJO0lBQ2hCLE9BQU8sSUFBSSxVQUFVLEVBQUUsQ0FBQztBQUM1QixDQUFDO0FBRUQsTUFBTSxZQUFhLFNBQVEsVUFBMkI7SUFDbEQsWUFBWSxLQUFzQjtRQUM5QixLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakIsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7UUFDckQsTUFBTSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFckQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxVQUFVLE1BQU0sQ0FBQyxLQUFzQjtJQUN6QyxPQUFPLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25DLENBQUM7QUFFRCxNQUFNLGVBQWdCLFNBQVEsVUFBMkI7SUFDckQsWUFBWSxLQUFzQjtRQUM5QixLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakIsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFckQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDekMsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLE1BQU0sZUFBZ0IsU0FBUSxVQUEyQjtJQUNyRCxZQUFZLEtBQXNCO1FBQzlCLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUMvQixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYTtRQUMzQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBRXJELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFFbkIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUlGLE1BQU0sVUFBVSxPQUFPLENBQUMsS0FBd0M7SUFDNUQsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLE1BQU0sRUFBRTtRQUM3QixPQUFPLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3JDO1NBQU07UUFDSCxPQUFPLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3JDO0FBQ0wsQ0FBQztBQUVELE1BQU0sZUFBZ0IsU0FBUSxVQUEyQjtJQUNyRCxZQUFZLEtBQXNCO1FBQzlCLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqQixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN6QixNQUFNLFFBQVEsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUVyRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN4QyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxlQUFnQixTQUFRLFVBQTJCO0lBQ3JELFlBQVksS0FBc0I7UUFDOUIsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2IsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQzdCLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxNQUFjO1FBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFckQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBSUYsTUFBTSxVQUFVLE9BQU8sQ0FBQyxLQUF3QztJQUM1RCxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssTUFBTSxFQUFFO1FBQzdCLE9BQU8sSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7S0FDckM7U0FBTTtRQUNILE9BQU8sSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7S0FDckM7QUFDTCxDQUFDO0FBRUQsTUFBTSxZQUFhLFNBQVEsVUFBMkI7SUFDbEQsWUFBWSxLQUFzQjtRQUM5QixLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDYixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDL0IsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDM0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUV6QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRW5CLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzVCLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFFRixNQUFNLGVBQWdCLFNBQVEsVUFBd0M7SUFDbEUsWUFBWSxRQUFzQztRQUM5QyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFFNUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFDckIsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUU7WUFDMUIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3JDLFNBQVMsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDO1NBQzVCO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLE1BQU0sY0FBZSxTQUFRLFVBQW1DO0lBQzVELFlBQVksUUFBaUM7UUFDekMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQzVCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNoQixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLEVBQUU7WUFDMUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUM7WUFDdEIsT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUM7U0FDekI7UUFDRCxNQUFNLEtBQUssR0FBRyxLQUFLLEdBQUcsT0FBTyxDQUFDO1FBQzlCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQztRQUNyQixLQUFLLE1BQU0sS0FBSyxJQUFJLFFBQVEsRUFBRTtZQUMxQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxHQUFHLE9BQU8sQ0FBQztZQUM3RCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELFNBQVMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDO1NBQzNCO0lBQ0wsQ0FBQztDQUNKO0FBS0QsTUFBTSxVQUFVLElBQUksQ0FBQyxLQUFxRCxFQUFFLEdBQUcsQ0FBNkM7SUFDeEgsUUFBUSxLQUFLLENBQUMsVUFBVSxFQUFFO1FBQ3RCLEtBQUssTUFBTTtZQUNQLE9BQU8sSUFBSSxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDekMsS0FBSyxNQUFNO1lBQ1AsT0FBTyxJQUFJLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMxQyxLQUFLLE1BQU07WUFDUCxPQUFPLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3RDO0FBQ0wsQ0FBQztBQUVELE1BQU0sYUFBYyxTQUFRLFVBQTJCO0lBQ25ELFlBQVksS0FBc0I7UUFDOUIsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBRXRDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3pDLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFFRixNQUFNLGFBQWMsU0FBUSxVQUEyQjtJQUNuRCxZQUFZLEtBQXNCO1FBQzlCLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNiLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUMvQixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYTtRQUMzQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBRXRDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFFbkIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUlGLE1BQU0sVUFBVSxLQUFLLENBQUMsS0FBd0M7SUFDMUQsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLE1BQU0sRUFBRTtRQUM3QixPQUFPLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ25DO1NBQU07UUFDSCxPQUFPLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ25DO0FBQ0wsQ0FBQztBQUdELE1BQU0sVUFBVSxVQUFVLENBQUMsS0FBYSxFQUFFLE1BQWMsRUFBRSxJQUE2QyxFQUFFLE1BQStDO0lBQ3BKLE1BQU0sSUFBSSxHQUFtQixFQUFFLENBQUM7SUFDaEMsTUFBTSxJQUFJLEdBQTJCLEVBQUUsQ0FBQztJQUN4QyxPQUFPLEdBQUcsQ0FDTixLQUFLLEVBQ0wsTUFBTSxDQUNULENBQUMsTUFBTSxDQUFDLENBQUMsR0FBNkIsRUFBRSxHQUFjLEVBQUUsRUFBRTtRQUN2RCxHQUFHLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUNyQixHQUFHLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQztRQUN6QixHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNsQixHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7WUFDcEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUMxRDtRQUNELEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFO1lBQ25CLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ3BDO1NBQ0o7UUFDRCxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDakIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBVSxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2IsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3JCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQW1CLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1FBQ2pELElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDZCxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBRUQsb0JBQW9CO0FBRXBCLE1BQU0sV0FBWSxTQUFRLFVBQXdDO0lBQzlELFlBQVksUUFBc0M7UUFDOUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQzFDO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLE1BQU0sVUFBVSxLQUFLLENBQUMsR0FBRyxRQUFnQztJQUNyRCxPQUFPLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ3JDLENBQUM7QUFHRCxNQUFNLGNBQWUsU0FBUSxPQUErQjtJQU14RCxZQUFZLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWMsRUFBRSxLQUFzQjtRQUN4RixLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxVQUFVLEdBQUcsR0FBRyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQzFCLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO0lBQ2hDLENBQUM7SUFDRCxNQUFNLENBQUMsTUFBaUI7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFGLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV4RixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLDRDQUE0QztBQUM1QyxNQUFNLFVBQVUsUUFBUSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWMsRUFBRSxLQUFzQjtJQUNyRyxPQUFPLElBQUksY0FBYyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMvRCxDQUFDO0FBRUQsTUFBTSxVQUFVLFNBQVMsQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjLEVBQUUsS0FBc0I7SUFDdEcsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFjLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ25FLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQW1CLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1FBQzVELElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNYLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ2hCLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUMvQjtRQUNELEVBQUUsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDO1FBQ2hCLEVBQUUsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1FBQ3hCLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsK0VBQStFO1FBQy9FLGdGQUFnRjtRQUNoRix5QkFBeUI7UUFDekIsTUFBTSxDQUFDLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNuQyxDQUFDLENBQUMsQ0FBQztBQUNQLENBQUM7QUFHRCx1REFBdUQ7QUFDdkQsNkVBQTZFO0FBQzdFLDBGQUEwRjtBQUMxRiwyQkFBMkI7QUFDM0IsOEJBQThCO0FBQzlCLGdDQUFnQztBQUNoQyxRQUFRO0FBQ1IsZ0RBQWdEO0FBQ2hELDRCQUE0QjtBQUM1QiwwQkFBMEI7QUFFMUIsNENBQTRDO0FBQzVDLGtEQUFrRDtBQUNsRCxZQUFZO0FBQ1osUUFBUTtBQUNSLEtBQUs7QUFFTCxNQUFNLGtCQUFtQixTQUFRLFVBQXVDO0lBQ3BFLFlBQVksUUFBcUM7UUFDN0MsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUN0QztJQUNMLENBQUM7Q0FDSjtBQUVELE1BQU0sVUFBVSxRQUFRLENBQUMsR0FBRyxRQUErQjtJQUN2RCxPQUFPLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDNUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIERpY2sgMjAyMVxuXG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcblxuZXhwb3J0IHR5cGUgTGF5b3V0Qm94ID0ge1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogUGFzcyBFbGVtZW50Q29udGV4dCBhbG9uZyB3aXRoIGxheW91dCwgc28gdGhhdCB3ZSBjYW4gaGF2ZSBkeW5hbWljIGxheW91dHMuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudENvbnRleHQge1xuICAgIHJlcXVlc3REcmF3KCk6IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dCgpOiB2b2lkO1xuICAgIC8vIFRPRE86IHJlcXVlc3RSZW5kZXI/XG59O1xuXG50eXBlIFN0YXRlbGVzc0hhbmRsZXIgPSAoZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSA9PiB2b2lkO1xuXG50eXBlIE9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBUb3VjaE1vdmUgPSB7XG4gICAgcmVhZG9ubHkgaWQ6IG51bWJlcjtcbiAgICByZWFkb25seSBwOiBQb2ludDJEO1xufTtcbnR5cGUgT25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIE9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcblxudHlwZSBPblRhcEhhbmRsZXIgPSAocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBQYW5Qb2ludCA9IHtcbiAgICBwcmV2OiBQb2ludDJEO1xuICAgIGN1cnI6IFBvaW50MkQ7XG59O1xudHlwZSBPblBhbkhhbmRsZXIgPSAocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuLy8gVE9ETzogUGFzcyB0b3VjaCBzaXplIGRvd24gd2l0aCB0b3VjaCBldmVudHMgKGluc3RlYWQgb2Ygc2NhbGU/KVxuLy8gSXMgdGhhdCBlbm91Z2g/IFByb2JhYmx5IHdlIHdpbGwgYWx3YXlzIHdhbnQgYSB0cmFuc29mb3JtYXRpb24gbWF0cml4LlxuLy8gQnV0IGVub3VnaCBmb3Igbm93LCBzbyBqdXN0IGRvIHRoYXQuXG5cbmNsYXNzIFRvdWNoR2VzdHVyZSB7XG4gICAgb25UYXBIYW5kbGVyPzogT25UYXBIYW5kbGVyO1xuICAgIG9uUGFuSGFuZGxlcj86IE9uUGFuSGFuZGxlcjtcbiAgICBvblBhbkJlZ2luSGFuZGxlcj86IFN0YXRlbGVzc0hhbmRsZXI7XG4gICAgb25QYW5FbmRIYW5kbGVyPzogU3RhdGVsZXNzSGFuZGxlcjtcblxuICAgIHByaXZhdGUgYWN0aXZlOiBNYXA8bnVtYmVyLCBQb2ludDJEPjtcbiAgICBwcml2YXRlIHBhbnM6IE1hcDxudW1iZXIsIFBhblBvaW50PjtcbiAgICByZWFkb25seSBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIHJlYWRvbmx5IG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIHJlYWRvbmx5IG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMucGFucyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIF86IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5zZXQoaWQsIHApO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogVG91Y2hNb3ZlW10sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAoYSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogcGFzcyBpbiBkaXN0YW5jZSB0aHJlc2hvbGQ/IFNjYWxlIGJhc2Ugb24gdHJhbnNmb3Jtcz9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvaW50RGlzdGFuY2UoYSwgdC5wKSA+PSAxNikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmUuZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogYSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiBhLCAgICAvLyBVc2UgdGhlIHN0YXJ0IHBvaW50IGhlcmUsIHNvIHRoZSBmaXJzdCBtb3ZlIGlzIGZyb20gdGhlIHN0YXJ0LlxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucGFucy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHAgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPT09IDAgJiYgdGhpcy5vblBhbkJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyKGVjKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IHAuY3VycixcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IHQucCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5zaXplID4gMCAmJiB0aGlzLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblBhbkhhbmRsZXIoWy4uLnRoaXMucGFucy52YWx1ZXMoKV0sIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSB0aGlzLmFjdGl2ZS5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKGEgIT09IHVuZGVmaW5lZCAmJiB0aGlzLm9uVGFwSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblRhcEhhbmRsZXIoYSwgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hY3RpdmUuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuZGVsZXRlKGlkKSAmJiB0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblBhbkVuZEhhbmRsZXIoZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbn07XG5cbi8vIFNvIHRoYXQgd2UgY2FuIHRha2UgSUFyZ3VtZW50cyBhcyBjaGlsZHJlblxuaW50ZXJmYWNlIFN0YXRpY0FycmF5PFQ+IHtcbiAgICBbaW5kZXg6IG51bWJlcl06IFQ7XG4gICAgbGVuZ3RoOiBudW1iZXI7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxUPjtcbn07XG5cbnR5cGUgQ2hpbGRDb25zdHJhaW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmc+ID0gRWxlbWVudDxMYXlvdXRUeXBlLCBhbnk+IHwgU3RhdGljQXJyYXk8RWxlbWVudDxMYXlvdXRUeXBlLCBhbnk+PiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaW5pdFRvdWNoR2VzdHVyZShlOiBFbGVtZW50PGFueSwgYW55Pik6IFRvdWNoR2VzdHVyZSB7XG4gICAgaWYgKGUudG91Y2hHZXN0dXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGUudG91Y2hHZXN0dXJlO1xuICAgIH1cbiAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgfHwgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUb3VjaCBnZXN0dXJlcyBhbHJlYWR5IGNhcHR1cmVkJyk7XG4gICAgfVxuICAgIGNvbnN0IHRnID0gbmV3IFRvdWNoR2VzdHVyZSgpO1xuICAgIGUub25Ub3VjaEJlZ2luSGFuZGxlciA9IHRnLm9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgZS5vblRvdWNoTW92ZUhhbmRsZXIgPSB0Zy5vblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgZS5vblRvdWNoRW5kSGFuZGxlciA9IHRnLm9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIHJldHVybiB0Zztcbn1cblxuZnVuY3Rpb24gY2xhbXAoeDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh4IDwgbWluKSB7XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfSBlbHNlIGlmICh4ID4gbWF4KSB7XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxufVxuXG5jbGFzcyBFbGVtZW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmcsIENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PHN0cmluZz4+IHtcbiAgICBsYXlvdXRUeXBlOiBMYXlvdXRUeXBlO1xuICAgIGNoaWxkOiBDaGlsZDtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGxheW91dFR5cGU6IExheW91dFR5cGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICB0aGlzLmxheW91dFR5cGUgPSBsYXlvdXRUeXBlO1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMubGVmdCA9IE5hTjtcbiAgICAgICAgdGhpcy50b3AgPSBOYU47XG4gICAgICAgIHRoaXMud2lkdGggPSBOYU47XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTmFOO1xuICAgIH1cblxuICAgIG9uRHJhd0hhbmRsZXI/OiBPbkRyYXdIYW5kbGVyO1xuICAgIG9uRHJhdyhoYW5kbGVyOiBPbkRyYXdIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIGlmICh0aGlzLm9uRHJhd0hhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbkRyYXcgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyPzogT25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI/OiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgb25Ub3VjaEVuZEhhbmRsZXI/OiBPblRvdWNoRW5kSGFuZGxlcjtcblxuICAgIHRvdWNoR2VzdHVyZT86IFRvdWNoR2VzdHVyZTtcbiAgICBvblRhcChoYW5kbGVyOiBPblRhcEhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25UYXAgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW4oaGFuZGxlcjogT25QYW5IYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuQmVnaW4oaGFuZGxlcjogU3RhdGVsZXNzSGFuZGxlcik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuQmVnaW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkJlZ2luSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbkVuZChoYW5kbGVyOiBTdGF0ZWxlc3NIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuRW5kIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb25BdHRhY2hIYW5kbGVyPzogU3RhdGVsZXNzSGFuZGxlcjtcbiAgICBvbkF0dGFjaChoYW5kbGVyOiBTdGF0ZWxlc3NIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIGlmICh0aGlzLm9uQXR0YWNoSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYG9uQXR0YWNoIGFscmVhZHkgc2V0YCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vbkF0dGFjaEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkRldGFjaEhhbmRsZXI/OiBTdGF0ZWxlc3NIYW5kbGVyO1xuICAgIG9uRGV0YWNoKGhhbmRsZXI6IFN0YXRlbGVzc0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgb25EZXRhY2ggYWxyZWFkeSBzZXRgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn07XG5cbmFic3RyYWN0IGNsYXNzIFdQSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3cGhwJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHAnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3BocycsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3cGhzJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXU0hQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufTtcblxuYWJzdHJhY3QgY2xhc3MgV1NIU0xheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+PiBleHRlbmRzIEVsZW1lbnQ8J3dzaHMnLCBDaGlsZD4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3NocycsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuY2xhc3MgRmxleExheW91dCBleHRlbmRzIEVsZW1lbnQ8J2ZsZXgnLCBXUEhQTGF5b3V0PGFueT4+IHtcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZ3JvdzogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKCdmbGV4JywgY2hpbGQpO1xuICAgICAgICB0aGlzLnNpemUgPSBzaXplO1xuICAgICAgICB0aGlzLmdyb3cgPSBncm93O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDpudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBjYWxsQXR0YWNoSGFuZGxlcnMocm9vdDogRWxlbWVudDxhbnksIGFueT4sIGhhbmRsZXI6IFwib25BdHRhY2hIYW5kbGVyXCIgfCBcIm9uRGV0YWNoSGFuZGxlclwiLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGNvbnN0IGggPSBlW2hhbmRsZXJdO1xuICAgICAgICBpZiAoaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBoKGVjKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBsYXN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSB2aXNpdCBpdCBsYXN0LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGUuY2hpbGQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGRbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnk+O1xuICAgICAgICBpZiAoZS5vbkRyYXdIYW5kbGVyKSB7XG4gICAgICAgICAgICBlLm9uRHJhd0hhbmRsZXIoY3R4LCBlLCBlYywgdnApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIGRyYXcgaXQgbGFzdC5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBlLmNoaWxkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3Qocm9vdC5sZWZ0LCByb290LnRvcCwgcm9vdC53aWR0aCwgcm9vdC5oZWlnaHQpO1xuICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHJvb3QsIGVjLCB2cCk7XG59XG5cbmludGVyZmFjZSBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjtcbn07XG5cbmNsYXNzIERlYm91bmNlciB7XG4gICAgYm91bmNlOiAoKSA9PiB2b2lkO1xuICAgIHRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKGY6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5ib3VuY2UgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lb3V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICBmKCk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY2xlYXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5mdW5jdGlvbiBmaW5kVG91Y2hUYXJnZXQocm9vdDogRWxlbWVudDxhbnksIGFueT4sIHA6IFBvaW50MkQpOiB1bmRlZmluZWQgfCBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICBjb25zdCB4ID0gcFswXTtcbiAgICBjb25zdCB5ID0gcFsxXTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGUgYXMgSGFzVG91Y2hIYW5kbGVyczsgLy8gVE9ETzogV2h5IGNhbid0IHR5cGUgaW5mZXJlbmNlIGZpZ3VyZSB0aGlzIG91dD9cbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBmaXJzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgdmlzaXQgbGFzdCBjaGlsZCBsYXN0LlxuICAgICAgICAgICAgLy8gVGhlIGxhc3QgY2hpbGQgKHRoZSBvbmUgb24gdG9wKSBzaG91bGQgb3ZlcnJpZGUgcHJldmlvdXMgY2hpbGRyZW4ncyB0YXJnZXQuXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCBpbXBsZW1lbnRzIEVsZW1lbnRDb250ZXh0IHtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnk+O1xuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gICAgcmVzaXplOiBSZXNpemVPYnNlcnZlcjtcbiAgICB2cDogTGF5b3V0Qm94O1xuXG4gICAgLy8gVE9ETzogd2Ugc2hvdWxkIG5vdCByZXJlbmRlciBpZiB0aGVyZSBhcmUgcGVuZGluZyBsYXlvdXQgcmVxdWVzdHMuXG4gICAgZGVib3VuY2VMYXlvdXQ6IERlYm91bmNlcjtcbiAgICBkZWJvdW5jZURyYXc6IERlYm91bmNlcjtcblxuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzIHwgbnVsbD47XG4gICAgcHJpdmF0ZSB0b3VjaFN0YXJ0OiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkOyBcbiAgICBwcml2YXRlIHRvdWNoTW92ZTogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIHRvdWNoRW5kOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIFxuXG4gICAgY29uc3RydWN0b3IoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIsIHthbHBoYTogZmFsc2UsIGRlc3luY2hyb25pemVkOiB0cnVlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcbiAgICAgICAgdGhpcy5yZXNpemUgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNpemVPYnNlcnZlciBleHBlY3RzIDEgZW50cnksIGdvdCAke2VudHJpZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVudHJpZXNbMF0uY29udGVudFJlY3Q7XG4gICAgICAgICAgICBjb25zdCB2cCA9IHRoaXMudnA7XG4gICAgICAgICAgICB2cC5sZWZ0ID0gMDtcbiAgICAgICAgICAgIHZwLnRvcCA9IDA7XG4gICAgICAgICAgICB2cC53aWR0aCA9IGNvbnRlbnQud2lkdGg7XG4gICAgICAgICAgICB2cC5oZWlnaHQgPSBjb250ZW50LmhlaWdodFxuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gdnAud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSB2cC5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGN0eC50cmFuc2Zvcm0od2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDAsIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdnAud2lkdGgsIHZwLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICAgICAgY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB2cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlc2l6ZS5vYnNlcnZlKGNhbnZhcywge2JveDogXCJkZXZpY2UtcGl4ZWwtY29udGVudC1ib3hcIn0pO1xuICAgICAgICB0aGlzLnZwID0ge1xuICAgICAgICAgICAgbGVmdDogMCxcbiAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgIHdpZHRoOiBjYW52YXMud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGNhbnZhcy5oZWlnaHQsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dCA9IG5ldyBEZWJvdW5jZXIoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdGhpcy52cC53aWR0aCwgdGhpcy52cC5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0ID0gdGhpcy5kZWJvdW5jZUxheW91dC5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5jaGlsZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdGhpcy52cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3REcmF3ID0gdGhpcy5kZWJvdW5jZURyYXcuYm91bmNlO1xuXG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoU3RhcnQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcDogUG9pbnQyRCA9IFt0LmNsaWVudFgsIHQuY2xpZW50WV07XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuY2hpbGQsIHApO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCBudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIHRvIGFjdGl2ZSB0YXJnZXRzIG1hcCBzbyB3ZSBrbm93IGFuYm91dCBpdC5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsb3cgZGVmYXVsdCBhY3Rpb24sIHNvIGUuZy4gcGFnZSBjYW4gYmUgc2Nyb2xsZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcih0LmlkZW50aWZpZXIsIHAsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIC8vIFNvbWUgdGFyZ2V0IHdhcyBzb21lIGZvciBhdCBsZWFzdCBzb21lIG9mIHRoZSB0b3VjaGVzLiBEb24ndCBsZXQgYW55dGhpbmdcbiAgICAgICAgICAgICAgICAvLyBpbiBIVE1MIGdldCB0aGlzIHRvdWNoLlxuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoTW92ZSA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVycywgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHQuaWRlbnRpZmllcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IFt0LmNsaWVudFgsIHQuY2xpZW50WV0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0YXJnZXQsIHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0cywgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaEVuZCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IG5ldyBNYXAodGhpcy50b3VjaFRhcmdldHMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbW92ZWQuZGVsZXRlKHQuaWRlbnRpZmllcikgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW2lkLCB0YXJnZXRdIG9mIHJlbW92ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuXG4gICAgICAgIGNhbGxBdHRhY2hIYW5kbGVycyh0aGlzLmNoaWxkLCBcIm9uQXR0YWNoSGFuZGxlclwiLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy5yZXNpemUuZGlzY29ubmVjdCgpO1xuICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICB0aGlzLmRlYm91bmNlTGF5b3V0LmNsZWFyKCk7XG4gICAgICAgIC8vIFRPRE86IGRldGFjaCBhbGwgY2hpbGRyZW4uXG5cbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gRWxlbWVudENvbnRleHQgZnVuY3Rpb25zXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIHJlcXVlc3REcmF3OiAoKSA9PiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQ6ICgpID0+IHZvaWQ7XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gVG91Y2hIYW5kbGVyIGZ1bmN0aW9uc1xuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBUT0RPOiBhZGQgVG91Y2hGb3J3YXJkZXIgaGVyZS4gaW5zdGFsbCB0b3VjaCBoYW5kbGVyc1xufTtcblxuLy8gVE9ETzogSGF2ZSBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gKHNvIGhpZGUgY2hpbGRyZW4sIGFuZCBmb3J3YXJkIHRhcC9wYW4vZHJhdyBtYW51YWxseSwgd2l0aCB0cmFuc2Zvcm0pXG4vLyBUT0RPOiBNYWtlIGl0IHpvb21cbi8vIFRPRE86IG1heWJlIGhhdmUgdHdvIGVsZW1lbnRzPyBhIHZpZXdwb3J0IGFuZCBhIEhTV1Mgd2l0aCBhYnNvbHV0ZWx5IHBvc2l0aW9uZWQgY2hpbGRyZW4gYW5kIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzXG5cbi8vIFRPRE86IGNvbnZlcnQgdG8gdXNlIEFmZmluZSB0cmFuc2Zvcm0uXG5cbmNsYXNzIFNjcm9sbExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8dW5kZWZpbmVkPiB7XG4gICAgLy8gU2Nyb2xsTGF5b3V0IGhhcyB0byBpbnRlcmNlcHQgYWxsIGV2ZW50cyB0byBtYWtlIHN1cmUgYW55IGxvY2F0aW9ucyBhcmUgdXBkYXRlZCBieVxuICAgIC8vIHRoZSBzY3JvbGwgcG9zaXRpb24sIHNvIGNoaWxkIGlzIHVuZGVmaW5lZCwgYW5kIGFsbCBldmVudHMgYXJlIGZvcndhcmRlZCB0byBzY3JvbGxlci5cbiAgICBzY3JvbGxlcjogV1NIU0xheW91dDxhbnk+O1xuICAgIHNjcm9sbDogUG9pbnQyRDtcbiAgICB6b29tOiBudW1iZXI7XG4gICAgem9vbU1heDogbnVtYmVyO1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzPjtcbiAgICBwcml2YXRlIHRvdWNoU2Nyb2xsOiBNYXA8bnVtYmVyLCB7IHByZXY6IFBvaW50MkQsIGN1cnI6IFBvaW50MkQgfT47XG5cbiAgICBwcml2YXRlIHVwZGF0ZVNjcm9sbCgpIHtcbiAgICAgICAgY29uc3QgdHMgPSBbLi4udGhpcy50b3VjaFNjcm9sbC52YWx1ZXMoKV07XG4gICAgICAgIGlmICh0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSB0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnAyYyh0LnByZXYpO1xuICAgICAgICAgICAgY29uc3QgYyA9IHRoaXMucDJjKHQuY3Vycik7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwWzBdIC0gY1swXTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzFdICs9IHBbMV0gLSBjWzFdO1xuICAgICAgICB9IGVsc2UgaWYgKHRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgY29uc3QgcG0gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLnByZXZbMF0gKyB0c1sxXS5wcmV2WzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlsxXSArIHRzWzFdLnByZXZbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBjb25zdCBwZCA9IHBvaW50RGlzdGFuY2UodHNbMF0ucHJldiwgdHNbMV0ucHJldik7XG4gICAgICAgICAgICBjb25zdCBjZCA9IHBvaW50RGlzdGFuY2UodHNbMF0uY3VyciwgdHNbMV0uY3Vycik7XG4gICAgICAgICAgICB0aGlzLnpvb20gKj0gY2QgLyBwZDtcbiAgICAgICAgICAgIC8vIENsYW1wIHpvb20gc28gd2UgY2FuJ3Qgem9vbSBvdXQgdG9vIGZhci5cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbGVyLndpZHRoIDwgdGhpcy53aWR0aCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMud2lkdGggLyB0aGlzLnNjcm9sbGVyLndpZHRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IDwgdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLmhlaWdodCAvIHRoaXMuc2Nyb2xsZXIuaGVpZ2h0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuem9vbSA+IHRoaXMuem9vbU1heCkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuem9vbU1heDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNtID0gdGhpcy5wMmMoW1xuICAgICAgICAgICAgICAgICh0c1swXS5jdXJyWzBdICsgdHNbMV0uY3VyclswXSkgKiAwLjUsXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMV0gKyB0c1sxXS5jdXJyWzFdKSAqIDAuNSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMF0gKz0gcG1bMF0gLSBjbVswXTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzFdICs9IHBtWzFdIC0gY21bMV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JvbGxbMF0gPSBjbGFtcCh0aGlzLnNjcm9sbFswXSwgMCwgdGhpcy5zY3JvbGxlci53aWR0aCAtIHRoaXMud2lkdGggLyB0aGlzLnpvb20pO1xuICAgICAgICB0aGlzLnNjcm9sbFsxXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzFdLCAwLCB0aGlzLnNjcm9sbGVyLmhlaWdodCAtIHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHAyYyhwOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgICAgIGNvbnN0IHMgPSB0aGlzLnNjcm9sbDtcbiAgICAgICAgY29uc3Qgc2hyaW5rID0gMSAvIHRoaXMuem9vbTtcbiAgICAgICAgLy8gVE9ETzogdGFrZSBwYXJlbnQgcmVjdCBpbnRvIGFjY291bnRcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIChwWzBdIC0gdGhpcy5sZWZ0KSAqIHNocmluayArIHNbMF0sXG4gICAgICAgICAgICAocFsxXSAtIHRoaXMudG9wKSAqIHNocmluayArIHNbMV0sXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgLy8gcHJpdmF0ZSBjMnAoY2hpbGRDb29yZDogUG9pbnQyRCk6IFBvaW50MkQge1xuICAgIC8vICAgICByZXR1cm4gcG9pbnRTdWIoY2hpbGRDb29yZCwgdGhpcy5zY3JvbGwpO1xuICAgIC8vIH1cblxuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4sIHNjcm9sbDogUG9pbnQyRCwgem9vbTogbnVtYmVyLCB6b29tTWF4OiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogbWluIHpvb207XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5zY3JvbGwgPSBzY3JvbGw7XG4gICAgICAgIHRoaXMuem9vbSA9IHpvb207XG4gICAgICAgIHRoaXMuem9vbU1heCA9IHpvb21NYXg7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoU2Nyb2xsID0gbmV3IE1hcCgpO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5vbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIGVjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUodGhpcy5sZWZ0LCB0aGlzLnRvcCk7XG4gICAgICAgICAgICAvLyBDbGlwIHRvIFNjcm9sbCB2aWV3cG9ydC5cbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5tb3ZlVG8oMCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIDApO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKDAsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5jbGlwKCk7XG4gICAgICAgICAgICBjdHguc2NhbGUodGhpcy56b29tLCB0aGlzLnpvb20pO1xuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSgtdGhpcy5zY3JvbGxbMF0sIC10aGlzLnNjcm9sbFsxXSk7XG4gICAgICAgICAgICBjb25zdCB2cFNjcm9sbGVyID0ge1xuICAgICAgICAgICAgICAgIGxlZnQ6IHRoaXMuc2Nyb2xsWzBdLFxuICAgICAgICAgICAgICAgIHRvcDogdGhpcy5zY3JvbGxbMV0sXG4gICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmhlaWdodCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLnNjcm9sbGVyLCBlYywgdnBTY3JvbGxlcik7XG4gICAgICAgICAgICAvLyBUT0RPOiByZXN0b3JlIHRyYW5zZm9ybSBpbiBhIGZpbmFsbHk/XG4gICAgICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMub25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjcCA9IHRoaXMucDJjKHBwKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGZpbmRUb3VjaFRhcmdldCh0aGlzLnNjcm9sbGVyLCBjcCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgcGxhY2Vob2xkZXIgbnVsbCB0byBhY3RpdmUgdG91Y2hlcywgc28gd2Uga25vdyB0aGV5IHNob3VsZCBzY3JvbGwuXG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFNjcm9sbC5zZXQoaWQsIHsgcHJldjogcHAsIGN1cnI6IHBwIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaWQsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hCZWdpbkhhbmRsZXIoaWQsIGNwLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnMsIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2Nyb2xsID0gdGhpcy50b3VjaFNjcm9sbC5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHR0cy5wdXNoKHQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHR0cyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzY3JvbGwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwucHJldiA9IHNjcm9sbC5jdXJyO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwuY3VyciA9IHQucDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggbW92ZSBJRCAke3QuaWR9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgc2Nyb2xsIHBvc2l0aW9uLlxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGwoKTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzW2ldID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHR0c1tpXS5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IHRoaXMucDJjKHR0c1tpXS5wKSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCBlYyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICghdGhpcy50b3VjaFNjcm9sbC5kZWxldGUoaWQpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIGVuZCBJRCAke2lkfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBUT0RPOiBvdGhlciBoYW5kbGVycyBuZWVkIGZvcndhcmRpbmcuXG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIubGF5b3V0KDAsIDApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjcm9sbChjaGlsZDogV1NIU0xheW91dDxhbnk+LCBzY3JvbGw/OiBQb2ludDJELCB6b29tPzogbnVtYmVyLCB6b29tTWF4PzogbnVtYmVyKTogU2Nyb2xsTGF5b3V0IHtcbiAgICAvLyBOQjogc2NhbGUgb2YgMCBpcyBpbnZhbGlkIGFueXdheXMsIHNvIGl0J3MgT0sgdG8gYmUgZmFsc3kuXG4gICAgcmV0dXJuIG5ldyBTY3JvbGxMYXlvdXQoY2hpbGQsIHNjcm9sbCB8fCBbMCwgMF0sIHpvb20gfHwgMSwgem9vbU1heCB8fCAxMCk7XG59XG5cbi8vIFRPRE86IHNjcm9sbHgsIHNjcm9sbHlcblxuY2xhc3MgQm94TGF5b3V0IGV4dGVuZHMgV1NIU0xheW91dDx1bmRlZmluZWQ+IHtcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICB9XG59O1xuXG5jbGFzcyBCb3hXaXRoQ2hpbGRMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PFdQSFBMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDpXUEhQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQm94KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZD86IFdQSFBMYXlvdXQ8YW55Pik6IFdTSFNMYXlvdXQ8YW55PiB7XG4gICAgaWYgKGNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCb3hXaXRoQ2hpbGRMYXlvdXQod2lkdGgsIGhlaWdodCwgY2hpbGQpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEJveExheW91dCh3aWR0aCwgaGVpZ2h0KTtcbn1cblxuY2xhc3MgV1BIUEJvcmRlckxheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIUExheW91dDxhbnk+PiB7XG4gICAgYm9yZGVyOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1BIUExheW91dDxhbnk+LCBib3JkZXI6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuYm9yZGVyID0gYm9yZGVyO1xuICAgICAgICB0aGlzLnN0eWxlID0gc3R5bGU7XG5cbiAgICAgICAgdGhpcy5vbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYiA9IHRoaXMuYm9yZGVyO1xuICAgICAgICAgICAgY29uc3QgYjIgPSBiICogMC41O1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgYjIsIGJveC50b3AgKyBiMiwgYm94LndpZHRoIC0gYiwgYm94LmhlaWdodCAtIGIpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY29uc3QgYiA9IHRoaXMuYm9yZGVyO1xuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0ICsgYiwgdG9wICsgYiwgd2lkdGggLSBiICogMiwgaGVpZ2h0IC0gYiAqIDIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEJvcmRlcih3aWR0aDogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBjaGlsZDogV1BIUExheW91dDxhbnk+KTogV1BIUExheW91dDxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFdQSFBCb3JkZXJMYXlvdXQoY2hpbGQsIHdpZHRoLCBzdHlsZSk7XG59XG5cbmNsYXNzIEZpbGxMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBGaWxsKCk6IEZpbGxMYXlvdXQge1xuICAgIHJldHVybiBuZXcgRmlsbExheW91dCgpO1xufVxuXG5jbGFzcyBDZW50ZXJMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IENlbnRlckxheW91dCB7XG4gICAgcmV0dXJuIG5ldyBDZW50ZXJMYXlvdXQoY2hpbGQpO1xufVxuXG5jbGFzcyBIQ2VudGVySFBMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFBMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5jbGFzcyBIQ2VudGVySFNMYXlvdXQgZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+KTogSENlbnRlckhTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXIoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pik6IEhDZW50ZXJIUExheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4pOiBIQ2VudGVySFNMYXlvdXQgfCBIQ2VudGVySFBMYXlvdXQge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3NocCcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIQ2VudGVySFBMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIFZDZW50ZXJXUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdQSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3AsIHdpZHRoKTtcbiAgICB9XG59O1xuXG5jbGFzcyBWQ2VudGVyV1NMYXlvdXQgZXh0ZW5kcyBXU0hQTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gY2hpbGQud2lkdGg7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IFZDZW50ZXJXU0xheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyKGNoaWxkOiBXUEhTTGF5b3V0PGFueT4pOiBWQ2VudGVyV1BMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1BIU0xheW91dDxhbnk+KTogVkNlbnRlcldTTGF5b3V0IHwgVkNlbnRlcldQTGF5b3V0IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dwaHMnKSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldQTGF5b3V0KGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFZDZW50ZXJXU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBMZWZ0SFNMYXlvdXQgZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wKTtcbiAgICB9XG59O1xuXG5jbGFzcyBMZWZ0U3RhY2tMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFdTSFBMYXlvdXQ8YW55Pj4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZHJlbjogU3RhdGljQXJyYXk8V1NIUExheW91dDxhbnk+Pikge1xuICAgICAgICBzdXBlcihjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMuY2hpbGQ7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgbGV0IGNoaWxkTGVmdCA9IGxlZnQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIGNoaWxkTGVmdCArPSBjaGlsZC53aWR0aDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmNsYXNzIExlZnRGbGV4TGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxGbGV4TGF5b3V0Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxGbGV4TGF5b3V0Pikge1xuICAgICAgICBzdXBlcihjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGxldCBzaXplU3VtID0gMDtcbiAgICAgICAgbGV0IGdyb3dTdW0gPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBzaXplU3VtICs9IGNoaWxkLnNpemU7XG4gICAgICAgICAgICBncm93U3VtICs9IGNoaWxkLmdyb3c7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXh0cmEgPSB3aWR0aCAtIHNpemVTdW07XG4gICAgICAgIGxldCBjaGlsZExlZnQgPSBsZWZ0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjb25zdCBjaGlsZFdpZHRoID0gY2hpbGQuc2l6ZSArIGNoaWxkLmdyb3cgKiBleHRyYSAvIGdyb3dTdW07XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGNoaWxkV2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGQuc2l6ZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IFdQSFNMYXlvdXQ8YW55PjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkMDogV1NIUExheW91dDxhbnk+LCAuLi5jaGlsZFJlc3Q6IEFycmF5PFdTSFBMYXlvdXQ8YW55Pj4pOiBXUEhQTGF5b3V0PGFueT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDA6IEZsZXhMYXlvdXQsIC4uLmNoaWxkUmVzdDogQXJyYXk8RmxleExheW91dD4pOiBXUEhQTGF5b3V0PGFueT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1NIUExheW91dDxhbnk+IHwgRmxleExheW91dCwgLi4uXzogQXJyYXk8V1NIUExheW91dDxhbnk+PiB8IEFycmF5PEZsZXhMYXlvdXQ+KTogV1BIU0xheW91dDxhbnk+IHwgV1BIUExheW91dDxhbnk+IHtcbiAgICBzd2l0Y2ggKGNoaWxkLmxheW91dFR5cGUpIHtcbiAgICAgICAgY2FzZSAnZmxleCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IExlZnRGbGV4TGF5b3V0KGFyZ3VtZW50cyk7XG4gICAgICAgIGNhc2UgJ3dzaHAnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0U3RhY2tMYXlvdXQoYXJndW1lbnRzKTtcbiAgICAgICAgY2FzZSAnd3Nocyc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IExlZnRIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBSaWdodEhQTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXU0hQTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSB3aWR0aCAtIGNoaWxkLndpZHRoO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5jbGFzcyBSaWdodEhTTGF5b3V0IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSB3aWR0aCAtIGNoaWxkLndpZHRoO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gUmlnaHQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IFJpZ2h0SFNMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gUmlnaHQoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pik6IFJpZ2h0SFBMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gUmlnaHQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55Pik6IFJpZ2h0SFNMYXlvdXQgfCBSaWdodEhQTGF5b3V0IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dzaHAnKSB7XG4gICAgICAgIHJldHVybiBuZXcgUmlnaHRIUExheW91dChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBSaWdodEhTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIERlYnVnVG91Y2god2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpbGw6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgc3Ryb2tlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4pOiBCb3hMYXlvdXQge1xuICAgIGNvbnN0IHRhcHM6IEFycmF5PFBvaW50MkQ+ID0gW107XG4gICAgY29uc3QgcGFuczogQXJyYXk8QXJyYXk8UGFuUG9pbnQ+PiA9IFtdO1xuICAgIHJldHVybiBCb3goXG4gICAgICAgIHdpZHRoLFxuICAgICAgICBoZWlnaHQsXG4gICAgKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gZmlsbDtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlO1xuICAgICAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGZvciAoY29uc3QgdGFwIG9mIHRhcHMpIHtcbiAgICAgICAgICAgIGN0eC5tb3ZlVG8odGFwWzBdICsgMTYsIHRhcFsxXSk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZSh0YXBbMF0sIHRhcFsxXSwgMTYsIDE2LCAwLCAwLCAyICogTWF0aC5QSSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBwcyBvZiBwYW5zKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcHMpIHtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHAucHJldlswXSwgcC5wcmV2WzFdKTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHAuY3VyclswXSwgcC5jdXJyWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfSkub25UYXAoKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICB0YXBzLnB1c2gocCk7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25QYW4oKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBwYW5zLnB1c2gocHMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pO1xufVxuXG4vLyBUT0RPOiBUb3AsIEJvdHRvbVxuXG5jbGFzcyBMYXllckxheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnk+Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIExheWVyKC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueT4+KTogTGF5ZXJMYXlvdXQge1xuICAgIHJldHVybiBuZXcgTGF5ZXJMYXlvdXQoY2hpbGRyZW4pO1xufVxuXG5cbmNsYXNzIFBvc2l0aW9uTGF5b3V0IGV4dGVuZHMgRWxlbWVudDxcInBvc1wiLCBXUEhQTGF5b3V0PGFueT4+IHtcbiAgICByZXF1ZXN0TGVmdDogbnVtYmVyO1xuICAgIHJlcXVlc3RUb3A6IG51bWJlcjtcbiAgICByZXF1ZXN0V2lkdGg6IG51bWJlcjtcbiAgICByZXF1ZXN0SGVpZ2h0OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihcInBvc1wiLCBjaGlsZCk7XG4gICAgICAgIHRoaXMucmVxdWVzdExlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJlcXVlc3RUb3AgPSB0b3A7XG4gICAgICAgIHRoaXMucmVxdWVzdFdpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMucmVxdWVzdEhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KHBhcmVudDogTGF5b3V0Qm94KSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RXaWR0aCwgcGFyZW50LndpZHRoKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gY2xhbXAodGhpcy5yZXF1ZXN0TGVmdCwgcGFyZW50LmxlZnQsIHBhcmVudC5sZWZ0ICsgcGFyZW50LndpZHRoIC0gdGhpcy53aWR0aCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0SGVpZ2h0LCBwYXJlbnQuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy50b3AgPSBjbGFtcCh0aGlzLnJlcXVlc3RUb3AsIHBhcmVudC50b3AsIHBhcmVudC50b3AgKyBwYXJlbnQuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KHRoaXMubGVmdCwgdGhpcy50b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICB9XG59O1xuXG4vLyBUT0RPOiBzdXBwb3J0IHN0YXRpY2FsbHkgc2l6ZWQgY2hpbGRyZW4sIFxuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERyYWdnYWJsZShsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgIGNvbnN0IGxheW91dCA9IG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbiAgICByZXR1cm4gbGF5b3V0Lm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgbGV0IGR4ID0gMDtcbiAgICAgICAgbGV0IGR5ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBkeCArPSBwLmN1cnJbMF0gLSBwLnByZXZbMF07XG4gICAgICAgICAgICBkeSArPSBwLmN1cnJbMV0gLSBwLnByZXZbMV07XG4gICAgICAgIH1cbiAgICAgICAgZHggLz0gcHMubGVuZ3RoO1xuICAgICAgICBkeSAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCArPSBkeDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgKz0gZHk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KS5vblBhbkVuZCgoKSA9PiB7XG4gICAgICAgIC8vIFRoZSByZXF1ZXN0ZWQgbG9jYXRpb24gY2FuIGJlIG91dHNpZGUgdGhlIGFsbG93ZWQgYm91bmRzIGlmIGRyYWdnZWQgb3V0c2lkZSxcbiAgICAgICAgLy8gYnV0IG9uY2UgdGhlIGRyYWcgaXMgb3Zlciwgd2Ugd2FudCB0byByZXNldCBpdCBzbyB0aGF0IGl0IGRvZXNuJ3Qgc3RhcnQgdGhlcmVcbiAgICAgICAgLy8gb25jZSBhIG5ldyBkcmFnIHN0YXJ0LlxuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgPSBsYXlvdXQubGVmdDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgPSBsYXlvdXQudG9wO1xuICAgIH0pO1xufVxuXG5cbi8vIFRPRE86IGRvZXMgaXQgbWFrZSBzZW5zZSB0byBtYWtlIG90aGVyIGxheW91dCB0eXBlcz9cbi8vIGNsYXNzIFdTSFNSZWxhdGl2ZUxheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+PiB7XG4vLyAgICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbi8vICAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuLy8gICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4vLyAgICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuLy8gICAgIH1cbi8vICAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuLy8gICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuLy8gICAgICAgICB0aGlzLnRvcCA9IHRvcDtcblxuLy8gICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbi8vICAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4vLyAgICAgICAgIH1cbi8vICAgICB9XG4vLyB9O1xuXG5jbGFzcyBXUEhQUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmUoLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0Pik6IFdQSFBSZWxhdGl2ZUxheW91dCB7XG4gICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQoY2hpbGRyZW4pO1xufVxuIl19