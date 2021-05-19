// Copyright Charles Dick 2021
import { pointDistance } from "../point.js";
;
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
}
;
export function addChild(e, child, index) {
    const children = new Array(e.child.length + 1);
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
}
export function removeChild(e, index, ec) {
    const children = new Array(e.child.length - 1);
    let j = 0;
    for (let i = 0; i < e.child.length; i++) {
        if (i === index) {
            ec.elementDetached(e.child[i]);
        }
        else {
            children[j++] = e.child[i];
        }
    }
    e.child = children;
}
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
const TARGET_ROOT = 1;
const TARGET_NONE = 2;
export class RootLayout {
    constructor(canvas, child) {
        this.child = child;
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", { alpha: false });
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
                    this.touchTargets.set(t.identifier, TARGET_ROOT);
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
                else if (target === TARGET_ROOT) {
                    // Don't do anything, as the root element can't scroll.
                }
                else if (target === TARGET_NONE) {
                    // Don't do anything, target probably deleted.
                }
                else {
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
                if (target !== TARGET_ROOT && target !== TARGET_NONE) {
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
        this.scrollerStack = [{
                elementDetached: (e) => {
                    for (const [k, v] of this.touchTargets) {
                        if (v === e) {
                            this.touchTargets.set(k, TARGET_NONE);
                        }
                    }
                }
            }];
        this.nextScrollerStackToken = 0;
        this.scrollerStackTokens = [];
        this.requestLayout();
    }
    elementDetached(e) {
        this.scrollerStack[this.scrollerStack.length - 1].elementDetached(e);
    }
    pushScroller(scroller) {
        const token = this.nextScrollerStackToken++;
        this.scrollerStackTokens.push(token);
        this.scrollerStack.push(scroller);
        return token;
    }
    popScroller(token) {
        const t = this.scrollerStackTokens.pop();
        this.scrollerStack.pop();
        if (t !== token) {
            throw new Error(`Token mismatch in popScroller, ${token} given, ${t} on stack`);
        }
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
                width: this.width / this.zoom,
                height: this.height / this.zoom,
            };
            const token = ec.pushScroller(this);
            drawElementTree(ctx, this.scroller, ec, vpScroller);
            ec.popScroller(token);
            // TODO: restore transform in a finally?
            ctx.restore();
        };
        this.onTouchBeginHandler = (id, pp, ec) => {
            const cp = this.p2c(pp);
            const target = findTouchTarget(this.scroller, cp);
            if (target === undefined) {
                // Add placeholder null to active touches, so we know they should scroll.
                this.touchTargets.set(id, TARGET_ROOT);
                this.touchScroll.set(id, { prev: pp, curr: pp });
            }
            else {
                this.touchTargets.set(id, target);
                const token = ec.pushScroller(this);
                target.onTouchBeginHandler(id, cp, ec);
                ec.popScroller(token);
            }
        };
        this.onTouchMoveHandler = (ts, ec) => {
            const targets = new Map();
            for (const t of ts) {
                const target = this.touchTargets.get(t.id);
                if (target === undefined) {
                    throw new Error(`Unknown touch move ID ${t.id}`);
                }
                else if (target === TARGET_ROOT) {
                    const scroll = this.touchScroll.get(t.id);
                    if (scroll === undefined) {
                        throw new Error(`Touch move with ID ${t.id} has target === TARGET_ROOT, but is not in touchScroll`);
                    }
                    scroll.prev = scroll.curr;
                    scroll.curr = t.p;
                }
                else if (target === TARGET_NONE) {
                    // Don't do anything, target deleted.
                }
                else {
                    const tts = targets.get(target) || [];
                    tts.push(t);
                    targets.set(target, tts);
                }
            }
            // Update scroll position.
            this.updateScroll();
            // Forward touch moves.
            const token = ec.pushScroller(this);
            for (const [target, tts] of targets) {
                for (let i = 0; i < tts.length; i++) {
                    tts[i] = {
                        id: tts[i].id,
                        p: this.p2c(tts[i].p),
                    };
                }
                target.onTouchMoveHandler(tts, ec);
            }
            ec.popScroller(token);
            ec.requestDraw();
        };
        this.onTouchEndHandler = (id, ec) => {
            const target = this.touchTargets.get(id);
            if (target === undefined) {
                throw new Error(`Unknown touch end ID ${id}`);
            }
            else if (target === TARGET_ROOT) {
                if (!this.touchScroll.delete(id)) {
                    throw new Error(`Touch end ID ${id} has target TARGET_ROOT, but is not in touchScroll`);
                }
            }
            else if (target === TARGET_NONE) {
                // Do nothing, taret was deleted.
            }
            else {
                this.touchTargets.delete(id);
                if (target.onTouchEndHandler !== undefined) {
                    const token = ec.pushScroller(this);
                    target.onTouchEndHandler(id, ec);
                    ec.popScroller(token);
                }
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
    elementDetached(e) {
        for (const [k, v] of this.touchTargets) {
            if (v === e) {
                this.touchTargets.set(k, TARGET_NONE);
            }
        }
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
export class PositionLayout extends Element {
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
        if (this.child !== undefined) {
            this.child.layout(this.left, this.top, this.width, this.height);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBYW5ELENBQUM7QUFPRCxDQUFDO0FBbUJGLG1FQUFtRTtBQUNuRSx5RUFBeUU7QUFDekUsdUNBQXVDO0FBRXZDLE1BQU0sWUFBWTtJQVlkO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxFQUFVLEVBQUUsQ0FBVSxFQUFFLENBQWlCLEVBQUUsRUFBRTtZQUNyRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsRUFBZSxFQUFFLEVBQWtCLEVBQUUsRUFBRTtZQUM5RCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDaEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLENBQUMsSUFBSSxTQUFTLEVBQUU7b0JBQ2hCLDhEQUE4RDtvQkFDOUQsSUFBSSxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7d0JBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs0QkFDaEIsSUFBSSxFQUFFLENBQUM7NEJBQ1AsSUFBSSxFQUFFLENBQUMsRUFBSyxpRUFBaUU7eUJBQ2hGLENBQUMsQ0FBQztxQkFDTjtpQkFDSjtnQkFDRCxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxLQUFLLFNBQVMsRUFBRTtvQkFDakIsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixLQUFLLFNBQVMsRUFBRTt3QkFDOUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDO3FCQUM5QjtvQkFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO3dCQUNoQixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7d0JBQ1osSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO3FCQUNaLENBQUMsQ0FBQztpQkFDTjthQUNKO1lBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUU7Z0JBQ3ZELElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNsRDtRQUNMLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFrQixFQUFFLEVBQUU7WUFDeEQsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO2dCQUNwRCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUM1QjtZQUNELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZCLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssU0FBUyxFQUFFO2dCQUNwRixJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQzVCO1FBQ0wsQ0FBQyxDQUFDO0lBQ04sQ0FBQztDQUNKO0FBQUEsQ0FBQztBQU9ELENBQUM7QUFJRixTQUFTLGdCQUFnQixDQUFDLENBQW9CO0lBQzFDLElBQUksQ0FBQyxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUU7UUFDOUIsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0tBQ3pCO0lBQ0QsSUFBSSxDQUFDLENBQUMsbUJBQW1CLEtBQUssU0FBUyxJQUFJLENBQUMsQ0FBQyxrQkFBa0IsS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLGlCQUFpQixLQUFLLFNBQVMsRUFBRTtRQUNoSCxNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7S0FDdEQ7SUFDRCxNQUFNLEVBQUUsR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO0lBQzlCLENBQUMsQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUMsbUJBQW1CLENBQUM7SUFDL0MsQ0FBQyxDQUFDLGtCQUFrQixHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQztJQUM3QyxDQUFDLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDLGlCQUFpQixDQUFDO0lBQzNDLE9BQU8sRUFBRSxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLENBQVMsRUFBRSxHQUFXLEVBQUUsR0FBVztJQUM5QyxJQUFJLENBQUMsR0FBRyxHQUFHLEVBQUU7UUFDVCxPQUFPLEdBQUcsQ0FBQztLQUNkO1NBQU0sSUFBSSxDQUFDLEdBQUcsR0FBRyxFQUFFO1FBQ2hCLE9BQU8sR0FBRyxDQUFDO0tBQ2Q7U0FBTTtRQUNILE9BQU8sQ0FBQyxDQUFDO0tBQ1o7QUFDTCxDQUFDO0FBRUQsTUFBTSxPQUFPO0lBUVQsWUFBWSxVQUFzQixFQUFFLEtBQVk7UUFDNUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUN0QixDQUFDO0lBR0QsTUFBTSxDQUFDLE9BQXNCO1FBQ3pCLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxTQUFTLEVBQUU7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1NBQ3pDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUM7UUFDN0IsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQU9ELEtBQUssQ0FBQyxPQUFxQjtRQUN2QixJQUFJLENBQUMsWUFBWSxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO1lBQzlDLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztTQUN4QztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQztRQUN6QyxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBQ0QsS0FBSyxDQUFDLE9BQXFCO1FBQ3ZCLElBQUksQ0FBQyxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0MsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUU7WUFDOUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1NBQ3hDO1FBQ0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDO1FBQ3pDLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxVQUFVLENBQUMsT0FBeUI7UUFDaEMsSUFBSSxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO1lBQ25ELE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztTQUM3QztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEdBQUcsT0FBTyxDQUFDO1FBQzlDLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxRQUFRLENBQUMsT0FBeUI7UUFDOUIsSUFBSSxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxLQUFLLFNBQVMsRUFBRTtZQUNqRCxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7U0FDM0M7UUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsR0FBRyxPQUFPLENBQUM7UUFDNUMsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLE1BQU0sVUFBVSxRQUFRLENBQUMsQ0FBK0MsRUFBRSxLQUF3QixFQUFFLEtBQWM7SUFDOUcsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQW9CLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2xFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNWLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQzVCLElBQUksQ0FBQyxLQUFLLEtBQUssRUFBRTtZQUNiLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQztTQUN6QjtRQUNELFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDOUI7SUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDVCxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDO0tBQ3ZCO0lBQ0QsQ0FBQyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7QUFDdkIsQ0FBQztBQUVELE1BQU0sVUFBVSxXQUFXLENBQUMsQ0FBK0MsRUFBRSxLQUFhLEVBQUUsRUFBa0I7SUFDMUcsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQW9CLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2xFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNWLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNyQyxJQUFJLENBQUMsS0FBSyxLQUFLLEVBQUU7WUFDYixFQUFFLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNsQzthQUFNO1lBQ0gsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUM5QjtLQUNKO0lBQ0QsQ0FBQyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7QUFDdkIsQ0FBQztBQUVELE1BQWUsVUFBK0MsU0FBUSxPQUFzQjtJQUN4RixZQUFZLEtBQVk7UUFDcEIsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6QixDQUFDO0NBRUo7QUFBQSxDQUFDO0FBRUYsTUFBZSxVQUErQyxTQUFRLE9BQXNCO0lBQ3hGLFlBQVksS0FBWTtRQUNwQixLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3pCLENBQUM7Q0FFSjtBQUFBLENBQUM7QUFFRixNQUFlLFVBQStDLFNBQVEsT0FBc0I7SUFDeEYsWUFBWSxLQUFZO1FBQ3BCLEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekIsQ0FBQztDQUVKO0FBQUEsQ0FBQztBQUVGLE1BQWUsVUFBK0MsU0FBUSxPQUFzQjtJQUN4RixZQUFZLEtBQVk7UUFDcEIsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6QixDQUFDO0NBRUo7QUFBQSxDQUFDO0FBTUYsTUFBTSxVQUFXLFNBQVEsT0FBZ0M7SUFHckQsWUFBWSxJQUFZLEVBQUUsSUFBWSxFQUFFLEtBQXNCO1FBQzFELEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDckIsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFXLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzFELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUVGLFNBQVMsZUFBZSxDQUFDLEdBQTZCLEVBQUUsSUFBdUIsRUFBRSxFQUFrQixFQUFFLEVBQWE7SUFDOUcsTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNyQixPQUFPLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3JCLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQXVCLENBQUM7UUFDM0MsSUFBSSxDQUFDLENBQUMsYUFBYSxFQUFFO1lBQ2pCLENBQUMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7U0FDbkM7UUFDRCxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssU0FBUyxFQUFFO1lBQ3ZCLHNDQUFzQztTQUN6QzthQUFNLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDakMsZ0RBQWdEO1lBQ2hELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQzFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzFCO1NBQ0o7YUFBTTtZQUNILEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3ZCO0tBQ0o7QUFDTCxDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxHQUE2QixFQUFFLElBQXVCLEVBQUUsRUFBa0IsRUFBRSxFQUFhO0lBQ3RILEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDO0lBQ3hCLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNELGVBQWUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBTUEsQ0FBQztBQUVGLE1BQU0sU0FBUztJQUlYLFlBQVksQ0FBYTtRQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNmLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxTQUFTLEVBQUU7Z0JBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7b0JBQ3pCLENBQUMsRUFBRSxDQUFDO2dCQUNSLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUNUO1FBQ0wsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELEtBQUs7UUFDRCxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxFQUFFO1lBQzVCLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7U0FDNUI7SUFDTCxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsU0FBUyxlQUFlLENBQUMsSUFBdUIsRUFBRSxDQUFVO0lBQ3hELE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2YsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2YsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUNyQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUF1QixDQUFDO1FBQzNDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFO1lBQzNFLHFCQUFxQjtZQUNyQixTQUFTO1NBQ1o7UUFDRCxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxDQUFDLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO1lBQ2hILE9BQU8sQ0FBcUIsQ0FBQyxDQUFDLGtEQUFrRDtTQUNuRjtRQUNELElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUU7WUFDdkIsc0NBQXNDO1NBQ3pDO2FBQU0sSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNqQywwREFBMEQ7WUFDMUQsOEVBQThFO1lBQzlFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDMUI7YUFBTTtZQUNILEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3ZCO0tBQ0o7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBR0QsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXRCLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV0QixNQUFNLE9BQU8sVUFBVTtJQW9CbkIsWUFBWSxNQUF5QixFQUFFLEtBQXNCO1FBQ3pELElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBQyxDQUFDLENBQUM7UUFDcEQsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1NBQy9DO1FBQ0QsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDLENBQUMsT0FBOEIsRUFBRSxFQUFFO1lBQ2hFLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsdUNBQXVDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2FBQzVFO1lBQ0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztZQUN2QyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25CLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQ1osRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDWCxFQUFFLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDekIsRUFBRSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFBO1lBQzFCLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDbEQsTUFBTSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztZQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFNUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUIsdUJBQXVCLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUMsR0FBRyxFQUFFLDBCQUEwQixFQUFDLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsRUFBRSxHQUFHO1lBQ04sSUFBSSxFQUFFLENBQUM7WUFDUCxHQUFHLEVBQUUsQ0FBQztZQUNOLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztZQUNuQixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07U0FDeEIsQ0FBQztRQUVGLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ3JDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdkIsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBRWhELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ25DLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO1FBRTVDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBZSxFQUFFLEVBQUU7WUFDbEMsSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBQzNCLEtBQUssTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLE9BQU8sRUFBRTtnQkFDekIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7b0JBQ3RCLGNBQWMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLFNBQVM7aUJBQ1o7Z0JBQ0QsTUFBTSxDQUFDLEdBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQ2pELDhEQUE4RDtvQkFDOUQsc0RBQXNEO2lCQUN6RDtxQkFBTTtvQkFDSCxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUN0QixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM1QyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7aUJBQzFFO2FBQ0o7WUFDRCxJQUFJLGNBQWMsRUFBRTtnQkFDaEIsNEVBQTRFO2dCQUM1RSwwQkFBMEI7Z0JBQzFCLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQzthQUN4QjtRQUNMLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFlLEVBQUUsRUFBRTtZQUNqQyxJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7WUFDM0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUM7WUFDOUQsS0FBSyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFO2dCQUN6QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ25ELElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtvQkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7aUJBQ25FO3FCQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsRUFBRTtvQkFDL0IsdURBQXVEO2lCQUMxRDtxQkFBTSxJQUFJLE1BQU0sS0FBSyxXQUFXLEVBQUU7b0JBQy9CLDhDQUE4QztpQkFDakQ7cUJBQU07b0JBQ0gsY0FBYyxHQUFHLElBQUksQ0FBQztvQkFDdEIsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3JDLEVBQUUsQ0FBQyxJQUFJLENBQUM7d0JBQ0osRUFBRSxFQUFFLENBQUMsQ0FBQyxVQUFVO3dCQUNoQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUM7cUJBQzVCLENBQUMsQ0FBQztvQkFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztpQkFDM0I7YUFDSjtZQUNELEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsSUFBSSxPQUFPLEVBQUU7Z0JBQ2hDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7YUFDNUQ7WUFDRCxJQUFJLGNBQWMsRUFBRTtnQkFDaEIsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO2FBQ3hCO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLFFBQVEsR0FBRyxDQUFDLEdBQWUsRUFBRSxFQUFFO1lBQ2hDLElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztZQUMzQixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDM0MsS0FBSyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFO2dCQUN6QixJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEtBQUssRUFBRTtvQkFDeEMsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7aUJBQ2xFO2FBQ0o7WUFDRCxLQUFLLE1BQU0sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLElBQUksT0FBTyxFQUFFO2dCQUNoQyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0IsSUFBSSxNQUFNLEtBQUssV0FBVyxJQUFJLE1BQU0sS0FBSyxXQUFXLEVBQUU7b0JBQ2xELGNBQWMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7aUJBQzNEO2FBQ0o7WUFDRCxJQUFJLGNBQWMsRUFBRTtnQkFDaEIsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO2FBQ3hCO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRSxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUM7Z0JBQ2xCLGVBQWUsRUFBRSxDQUFDLENBQW9CLEVBQUUsRUFBRTtvQkFDdEMsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7d0JBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTs0QkFDVCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7eUJBQ3pDO3FCQUNKO2dCQUNMLENBQUM7YUFDSixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUM7UUFFOUIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFDRCxlQUFlLENBQUMsQ0FBb0I7UUFDaEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUNELFlBQVksQ0FBQyxRQUF3QjtRQUNqQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM1QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ3BDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFDRCxXQUFXLENBQUMsS0FBYTtRQUNyQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLENBQUMsS0FBSyxLQUFLLEVBQUU7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxLQUFLLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztTQUNuRjtJQUNMLENBQUM7SUFFRCxVQUFVO1FBQ04sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN6QixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDNUIsNkJBQTZCO1FBRTdCLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekUsQ0FBQztDQVlKO0FBQUEsQ0FBQztBQUVGLDRHQUE0RztBQUM1RyxxQkFBcUI7QUFDckIsdUhBQXVIO0FBRXZILHlDQUF5QztBQUV6QyxNQUFNLFlBQWEsU0FBUSxVQUFxQjtJQXlENUMsOENBQThDO0lBQzlDLGdEQUFnRDtJQUNoRCxJQUFJO0lBRUosWUFBWSxLQUFzQixFQUFFLE1BQWUsRUFBRSxJQUFZLEVBQUUsT0FBZTtRQUM5RSxrQkFBa0I7UUFDbEIsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFFN0IsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQTZCLEVBQUUsSUFBZSxFQUFFLEVBQWtCLEVBQUUsR0FBYyxFQUFFLEVBQUU7WUFDeEcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBRVgsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQywyQkFBMkI7WUFDM0IsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxQixHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLFVBQVUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUk7Z0JBQzdCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJO2FBQ2xDLENBQUM7WUFDRixNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDcEQsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0Qix3Q0FBd0M7WUFDeEMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xCLENBQUMsQ0FBQztRQUVGLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFXLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQ3ZFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEIsTUFBTSxNQUFNLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDbEQsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFO2dCQUN0Qix5RUFBeUU7Z0JBQ3pFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNwRDtpQkFBTTtnQkFDSCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2QyxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3pCO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsRUFBb0IsRUFBRSxFQUFrQixFQUFFLEVBQUU7WUFDbkUsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUM7WUFDOUQsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDM0MsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFO29CQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztpQkFDcEQ7cUJBQU0sSUFBSSxNQUFNLEtBQUssV0FBVyxFQUFFO29CQUMvQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzFDLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTt3QkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLEVBQUUsd0RBQXdELENBQUMsQ0FBQTtxQkFDdEc7b0JBQ0QsTUFBTSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUMxQixNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3JCO3FCQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsRUFBRTtvQkFDL0IscUNBQXFDO2lCQUN4QztxQkFBTTtvQkFDSCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDdEMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDWixPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztpQkFDNUI7YUFDSjtZQUVELDBCQUEwQjtZQUMxQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFcEIsdUJBQXVCO1lBQ3ZCLE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEMsS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBRTtnQkFDakMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQ2pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRzt3QkFDTCxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7d0JBQ2IsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztxQkFDeEIsQ0FBQztpQkFDTDtnQkFDRCxNQUFNLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ3RDO1lBQ0QsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN0QixFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsRUFBVSxFQUFFLEVBQWtCLEVBQUUsRUFBRTtZQUN4RCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN6QyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7Z0JBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDLENBQUM7YUFDakQ7aUJBQU0sSUFBSSxNQUFNLEtBQUssV0FBVyxFQUFFO2dCQUMvQixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUU7b0JBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztpQkFDM0Y7YUFDSjtpQkFBTSxJQUFJLE1BQU0sS0FBSyxXQUFXLEVBQUU7Z0JBQy9CLGlDQUFpQzthQUNwQztpQkFBTTtnQkFDSCxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0IsSUFBSSxNQUFNLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO29CQUN4QyxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUNwQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUNqQyxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUN6QjthQUNKO1FBQ0wsQ0FBQyxDQUFDO1FBQ0Ysd0NBQXdDO0lBQzVDLENBQUM7SUFqS08sWUFBWTtRQUNoQixNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzFDLElBQUksRUFBRSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDakIsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDakM7YUFBTSxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3hCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7Z0JBQ2hCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRztnQkFDckMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO2FBQ3hDLENBQUMsQ0FBQztZQUNILE1BQU0sRUFBRSxHQUFHLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRCxNQUFNLEVBQUUsR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLDJDQUEyQztZQUMzQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDOUMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO2FBQ2hEO1lBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQzthQUNsRDtZQUNELElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJ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Q2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzVCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQ3RDO0lBQ0wsQ0FBQztDQUNKO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxHQUFHLFFBQStCO0lBQ3ZELE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUM1QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRGljayAyMDIxXG5cbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi4vcG9pbnQuanNcIlxuXG5leHBvcnQgdHlwZSBMYXlvdXRCb3ggPSB7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHRvcDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59O1xuXG4vLyBUT0RPOiBQYXNzIEVsZW1lbnRDb250ZXh0IGFsb25nIHdpdGggbGF5b3V0LCBzbyB0aGF0IHdlIGNhbiBoYXZlIGR5bmFtaWMgbGF5b3V0cy5cblxuaW50ZXJmYWNlIFNjcm9sbGVyRXZlbnRzIHtcbiAgICBlbGVtZW50RGV0YWNoZWQoZTogRWxlbWVudDxhbnksIGFueT4pOiB2b2lkO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50Q29udGV4dCBleHRlbmRzIFNjcm9sbGVyRXZlbnRzIHtcbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZDtcbiAgICBwdXNoU2Nyb2xsZXIoc2Nyb2xsZXI6IFNjcm9sbGVyRXZlbnRzKTogbnVtYmVyO1xuICAgIHBvcFNjcm9sbGVyKHRva2VuOiBudW1iZXIpOiB2b2lkO1xufTtcblxudHlwZSBTdGF0ZWxlc3NIYW5kbGVyID0gKGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpID0+IHZvaWQ7XG5cbnR5cGUgT25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIFRvdWNoTW92ZSA9IHtcbiAgICByZWFkb25seSBpZDogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHA6IFBvaW50MkQ7XG59O1xudHlwZSBPblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBPblRhcEhhbmRsZXIgPSAocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgUGFuUG9pbnQgPSB7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcbmV4cG9ydCB0eXBlIE9uUGFuSGFuZGxlciA9IChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG4vLyBUT0RPOiBQYXNzIHRvdWNoIHNpemUgZG93biB3aXRoIHRvdWNoIGV2ZW50cyAoaW5zdGVhZCBvZiBzY2FsZT8pXG4vLyBJcyB0aGF0IGVub3VnaD8gUHJvYmFibHkgd2Ugd2lsbCBhbHdheXMgd2FudCBhIHRyYW5zb2Zvcm1hdGlvbiBtYXRyaXguXG4vLyBCdXQgZW5vdWdoIGZvciBub3csIHNvIGp1c3QgZG8gdGhhdC5cblxuY2xhc3MgVG91Y2hHZXN0dXJlIHtcbiAgICBvblRhcEhhbmRsZXI/OiBPblRhcEhhbmRsZXI7XG4gICAgb25QYW5IYW5kbGVyPzogT25QYW5IYW5kbGVyO1xuICAgIG9uUGFuQmVnaW5IYW5kbGVyPzogU3RhdGVsZXNzSGFuZGxlcjtcbiAgICBvblBhbkVuZEhhbmRsZXI/OiBTdGF0ZWxlc3NIYW5kbGVyO1xuXG4gICAgcHJpdmF0ZSBhY3RpdmU6IE1hcDxudW1iZXIsIFBvaW50MkQ+O1xuICAgIHByaXZhdGUgcGFuczogTWFwPG51bWJlciwgUGFuUG9pbnQ+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wYW5zID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgXzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLnNldChpZCwgcCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBUb3VjaE1vdmVbXSwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChhICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBwYXNzIGluIGRpc3RhbmNlIHRocmVzaG9sZD8gU2NhbGUgYmFzZSBvbiB0cmFuc2Zvcm1zP1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnREaXN0YW5jZShhLCB0LnApID49IDE2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IGEsICAgIC8vIFVzZSB0aGUgc3RhcnQgcG9pbnQgaGVyZSwgc28gdGhlIGZpcnN0IG1vdmUgaXMgZnJvbSB0aGUgc3RhcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wYW5zLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAocCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25QYW5CZWdpbkhhbmRsZXIoZWMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogcC5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogdC5wLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPiAwICYmIHRoaXMub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuSGFuZGxlcihbLi4udGhpcy5wYW5zLnZhbHVlcygpXSwgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoYSAhPT0gdW5kZWZpbmVkICYmIHRoaXMub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uVGFwSGFuZGxlcihhLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5kZWxldGUoaWQpICYmIHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuRW5kSGFuZGxlcihlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcblxuLy8gU28gdGhhdCB3ZSBjYW4gdGFrZSBJQXJndW1lbnRzIGFzIGNoaWxkcmVuXG5pbnRlcmZhY2UgU3RhdGljQXJyYXk8VD4ge1xuICAgIFtpbmRleDogbnVtYmVyXTogVDtcbiAgICBsZW5ndGg6IG51bWJlcjtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+O1xufTtcblxudHlwZSBDaGlsZENvbnN0cmFpbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZz4gPSBFbGVtZW50PExheW91dFR5cGUsIGFueT4gfCBTdGF0aWNBcnJheTxFbGVtZW50PExheW91dFR5cGUsIGFueT4+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpbml0VG91Y2hHZXN0dXJlKGU6IEVsZW1lbnQ8YW55LCBhbnk+KTogVG91Y2hHZXN0dXJlIHtcbiAgICBpZiAoZS50b3VjaEdlc3R1cmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZS50b3VjaEdlc3R1cmU7XG4gICAgfVxuICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RvdWNoIGdlc3R1cmVzIGFscmVhZHkgY2FwdHVyZWQnKTtcbiAgICB9XG4gICAgY29uc3QgdGcgPSBuZXcgVG91Y2hHZXN0dXJlKCk7XG4gICAgZS5vblRvdWNoQmVnaW5IYW5kbGVyID0gdGcub25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hNb3ZlSGFuZGxlciA9IHRnLm9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hFbmRIYW5kbGVyID0gdGcub25Ub3VjaEVuZEhhbmRsZXI7XG4gICAgcmV0dXJuIHRnO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHggPCBtaW4pIHtcbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9IGVsc2UgaWYgKHggPiBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG59XG5cbmNsYXNzIEVsZW1lbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZywgQ2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8c3RyaW5nPj4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgfVxuXG4gICAgb25EcmF3SGFuZGxlcj86IE9uRHJhd0hhbmRsZXI7XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcj86IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyO1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlO1xuICAgIG9uVGFwKGhhbmRsZXI6IE9uVGFwSGFuZGxlcik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5CZWdpbihoYW5kbGVyOiBTdGF0ZWxlc3NIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5CZWdpbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuRW5kKGhhbmRsZXI6IFN0YXRlbGVzc0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5FbmQgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gYWRkQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnk+Pj4sIGNoaWxkOiBFbGVtZW50PGFueSwgYW55PiwgaW5kZXg/OiBudW1iZXIpIHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IG5ldyBBcnJheTxFbGVtZW50PGFueSwgYW55Pj4oZS5jaGlsZC5sZW5ndGggKyAxKTtcbiAgICBsZXQgaSA9IDA7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAoOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuW2orK10gPSBjaGlsZDtcbiAgICAgICAgfVxuICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICB9XG4gICAgaWYgKGogPT09IGkpIHtcbiAgICAgICAgY2hpbGRyZW5bal0gPSBjaGlsZDtcbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnk+Pj4sIGluZGV4OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnk+PihlLmNoaWxkLmxlbmd0aCAtIDEpO1xuICAgIGxldCBqID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGUuY2hpbGQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPT09IGluZGV4KSB7XG4gICAgICAgICAgICBlYy5lbGVtZW50RGV0YWNoZWQoZS5jaGlsZFtpXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG59XG5cbmFic3RyYWN0IGNsYXNzIFdQSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3cGhwJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHAnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3BocycsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3cGhzJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXU0hQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufTtcblxuYWJzdHJhY3QgY2xhc3MgV1NIU0xheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+PiBleHRlbmRzIEVsZW1lbnQ8J3dzaHMnLCBDaGlsZD4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3NocycsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IHR5cGUgTGF5b3V0SGFzV2lkdGhBbmRIZWlnaHQgPSBXU0hTTGF5b3V0PGFueT47XG5leHBvcnQgdHlwZSBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0ID0gV1BIUExheW91dDxhbnk+O1xuXG5cbmNsYXNzIEZsZXhMYXlvdXQgZXh0ZW5kcyBFbGVtZW50PCdmbGV4JywgV1BIUExheW91dDxhbnk+PiB7XG4gICAgc2l6ZTogbnVtYmVyO1xuICAgIGdyb3c6IG51bWJlcjtcbiAgICBjb25zdHJ1Y3RvcihzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcignZmxleCcsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5zaXplID0gc2l6ZTtcbiAgICAgICAgdGhpcy5ncm93ID0gZ3JvdztcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6bnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnk+O1xuICAgICAgICBpZiAoZS5vbkRyYXdIYW5kbGVyKSB7XG4gICAgICAgICAgICBlLm9uRHJhd0hhbmRsZXIoY3R4LCBlLCBlYywgdnApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIGRyYXcgaXQgbGFzdC5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBlLmNoaWxkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3Qocm9vdC5sZWZ0LCByb290LnRvcCwgcm9vdC53aWR0aCwgcm9vdC5oZWlnaHQpO1xuICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHJvb3QsIGVjLCB2cCk7XG59XG5cbmludGVyZmFjZSBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjtcbn07XG5cbmNsYXNzIERlYm91bmNlciB7XG4gICAgYm91bmNlOiAoKSA9PiB2b2lkO1xuICAgIHRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKGY6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5ib3VuY2UgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lb3V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICBmKCk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY2xlYXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5mdW5jdGlvbiBmaW5kVG91Y2hUYXJnZXQocm9vdDogRWxlbWVudDxhbnksIGFueT4sIHA6IFBvaW50MkQpOiB1bmRlZmluZWQgfCBIYXNUb3VjaEhhbmRsZXJzIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICBjb25zdCB4ID0gcFswXTtcbiAgICBjb25zdCB5ID0gcFsxXTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGUgYXMgSGFzVG91Y2hIYW5kbGVyczsgLy8gVE9ETzogV2h5IGNhbid0IHR5cGUgaW5mZXJlbmNlIGZpZ3VyZSB0aGlzIG91dD9cbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBmaXJzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgdmlzaXQgbGFzdCBjaGlsZCBsYXN0LlxuICAgICAgICAgICAgLy8gVGhlIGxhc3QgY2hpbGQgKHRoZSBvbmUgb24gdG9wKSBzaG91bGQgb3ZlcnJpZGUgcHJldmlvdXMgY2hpbGRyZW4ncyB0YXJnZXQuXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG50eXBlIFRBUkdFVF9ST09UID0gMTtcbmNvbnN0IFRBUkdFVF9ST09UID0gMTtcbnR5cGUgVEFSR0VUX05PTkUgPSAyO1xuY29uc3QgVEFSR0VUX05PTkUgPSAyO1xuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCBpbXBsZW1lbnRzIEVsZW1lbnRDb250ZXh0IHtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnk+O1xuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gICAgcmVzaXplOiBSZXNpemVPYnNlcnZlcjtcbiAgICB2cDogTGF5b3V0Qm94O1xuXG4gICAgLy8gVE9ETzogd2Ugc2hvdWxkIG5vdCByZXJlbmRlciBpZiB0aGVyZSBhcmUgcGVuZGluZyBsYXlvdXQgcmVxdWVzdHMuXG4gICAgZGVib3VuY2VMYXlvdXQ6IERlYm91bmNlcjtcbiAgICBkZWJvdW5jZURyYXc6IERlYm91bmNlcjtcblxuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzIHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFN0YXJ0OiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkOyBcbiAgICBwcml2YXRlIHRvdWNoTW92ZTogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIHRvdWNoRW5kOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuXG4gICAgcHJpdmF0ZSBzY3JvbGxlclN0YWNrOiBBcnJheTxTY3JvbGxlckV2ZW50cz47XG4gICAgcHJpdmF0ZSBuZXh0U2Nyb2xsZXJTdGFja1Rva2VuOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzY3JvbGxlclN0YWNrVG9rZW5zOiBBcnJheTxudW1iZXI+O1xuXG4gICAgY29uc3RydWN0b3IoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIsIHthbHBoYTogZmFsc2V9KTtcbiAgICAgICAgaWYgKGN0eCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZmFpbGVkIHRvIGdldCAyZCBjb250ZXh0XCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xuICAgICAgICB0aGlzLnJlc2l6ZSA9IG5ldyBSZXNpemVPYnNlcnZlcigoZW50cmllczogUmVzaXplT2JzZXJ2ZXJFbnRyeVtdKSA9PiB7XG4gICAgICAgICAgICBpZiAoZW50cmllcy5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFJlc2l6ZU9ic2VydmVyIGV4cGVjdHMgMSBlbnRyeSwgZ290ICR7ZW50cmllcy5sZW5ndGh9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gZW50cmllc1swXS5jb250ZW50UmVjdDtcbiAgICAgICAgICAgIGNvbnN0IHZwID0gdGhpcy52cDtcbiAgICAgICAgICAgIHZwLmxlZnQgPSAwO1xuICAgICAgICAgICAgdnAudG9wID0gMDtcbiAgICAgICAgICAgIHZwLndpZHRoID0gY29udGVudC53aWR0aDtcbiAgICAgICAgICAgIHZwLmhlaWdodCA9IGNvbnRlbnQuaGVpZ2h0XG4gICAgICAgICAgICBjYW52YXMud2lkdGggPSB2cC53aWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY2FudmFzLmhlaWdodCA9IHZwLmhlaWdodCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY3R4LnRyYW5zZm9ybSh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCwgd2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlTGF5b3V0LmNsZWFyKCk7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dCgwLCAwLCB2cC53aWR0aCwgdnAuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuZGVib3VuY2VEcmF3LmNsZWFyKCk7XG4gICAgICAgICAgICBjbGVhckFuZERyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuY2hpbGQsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8sIHZwKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVzaXplLm9ic2VydmUoY2FudmFzLCB7Ym94OiBcImRldmljZS1waXhlbC1jb250ZW50LWJveFwifSk7XG4gICAgICAgIHRoaXMudnAgPSB7XG4gICAgICAgICAgICBsZWZ0OiAwLFxuICAgICAgICAgICAgdG9wOiAwLFxuICAgICAgICAgICAgd2lkdGg6IGNhbnZhcy53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogY2FudmFzLmhlaWdodCxcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmRlYm91bmNlTGF5b3V0ID0gbmV3IERlYm91bmNlcigoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dCgwLCAwLCB0aGlzLnZwLndpZHRoLCB0aGlzLnZwLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3RMYXlvdXQgPSB0aGlzLmRlYm91bmNlTGF5b3V0LmJvdW5jZTtcblxuICAgICAgICB0aGlzLmRlYm91bmNlRHJhdyA9IG5ldyBEZWJvdW5jZXIoKCkgPT4ge1xuICAgICAgICAgICAgY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB0aGlzLnZwKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVxdWVzdERyYXcgPSB0aGlzLmRlYm91bmNlRHJhdy5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTdGFydCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwOiBQb2ludDJEID0gW3QuY2xpZW50WCwgdC5jbGllbnRZXTtcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5jaGlsZCwgcCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIFRBUkdFVF9ST09UKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIHRvIGFjdGl2ZSB0YXJnZXRzIG1hcCBzbyB3ZSBrbm93IGFuYm91dCBpdC5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsb3cgZGVmYXVsdCBhY3Rpb24sIHNvIGUuZy4gcGFnZSBjYW4gYmUgc2Nyb2xsZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcih0LmlkZW50aWZpZXIsIHAsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIC8vIFNvbWUgdGFyZ2V0IHdhcyBzb21lIGZvciBhdCBsZWFzdCBzb21lIG9mIHRoZSB0b3VjaGVzLiBEb24ndCBsZXQgYW55dGhpbmdcbiAgICAgICAgICAgICAgICAvLyBpbiBIVE1MIGdldCB0aGlzIHRvdWNoLlxuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoTW92ZSA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVycywgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCBhcyB0aGUgcm9vdCBlbGVtZW50IGNhbid0IHNjcm9sbC5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBwcm9iYWJseSBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0LmlkZW50aWZpZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiBbdC5jbGllbnRYLCB0LmNsaWVudFldLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoTW92ZUhhbmRsZXIodHMsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hFbmQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBuZXcgTWFwKHRoaXMudG91Y2hUYXJnZXRzKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVkLmRlbGV0ZSh0LmlkZW50aWZpZXIpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpZCwgdGFyZ2V0XSBvZiByZW1vdmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSBUQVJHRVRfUk9PVCAmJiB0YXJnZXQgIT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyU3RhY2sgPSBbe1xuICAgICAgICAgICAgZWxlbWVudERldGFjaGVkOiAoZTogRWxlbWVudDxhbnksIGFueT4pID0+IHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRvdWNoVGFyZ2V0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodiA9PT0gZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfV07XG4gICAgICAgIHRoaXMubmV4dFNjcm9sbGVyU3RhY2tUb2tlbiA9IDA7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXJTdGFja1Rva2VucyA9IFtdO1xuXG4gICAgICAgIHRoaXMucmVxdWVzdExheW91dCgpO1xuICAgIH1cbiAgICBlbGVtZW50RGV0YWNoZWQoZTogRWxlbWVudDxhbnksIGFueT4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY3JvbGxlclN0YWNrW3RoaXMuc2Nyb2xsZXJTdGFjay5sZW5ndGggLSAxXS5lbGVtZW50RGV0YWNoZWQoZSk7XG4gICAgfVxuICAgIHB1c2hTY3JvbGxlcihzY3JvbGxlcjogU2Nyb2xsZXJFdmVudHMpOiBudW1iZXIge1xuICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMubmV4dFNjcm9sbGVyU3RhY2tUb2tlbisrO1xuICAgICAgICB0aGlzLnNjcm9sbGVyU3RhY2tUb2tlbnMucHVzaCh0b2tlbilcbiAgICAgICAgdGhpcy5zY3JvbGxlclN0YWNrLnB1c2goc2Nyb2xsZXIpO1xuICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgfVxuICAgIHBvcFNjcm9sbGVyKHRva2VuOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdCA9IHRoaXMuc2Nyb2xsZXJTdGFja1Rva2Vucy5wb3AoKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlclN0YWNrLnBvcCgpO1xuICAgICAgICBpZiAodCAhPT0gdG9rZW4pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG9rZW4gbWlzbWF0Y2ggaW4gcG9wU2Nyb2xsZXIsICR7dG9rZW59IGdpdmVuLCAke3R9IG9uIHN0YWNrYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnJlc2l6ZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VEcmF3LmNsZWFyKCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQuY2xlYXIoKTtcbiAgICAgICAgLy8gVE9ETzogZGV0YWNoIGFsbCBjaGlsZHJlbi5cblxuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBFbGVtZW50Q29udGV4dCBmdW5jdGlvbnNcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgcmVxdWVzdERyYXc6ICgpID0+IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dDogKCkgPT4gdm9pZDtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBUb3VjaEhhbmRsZXIgZnVuY3Rpb25zXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIFRPRE86IGFkZCBUb3VjaEZvcndhcmRlciBoZXJlLiBpbnN0YWxsIHRvdWNoIGhhbmRsZXJzXG59O1xuXG4vLyBUT0RPOiBIYXZlIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiAoc28gaGlkZSBjaGlsZHJlbiwgYW5kIGZvcndhcmQgdGFwL3Bhbi9kcmF3IG1hbnVhbGx5LCB3aXRoIHRyYW5zZm9ybSlcbi8vIFRPRE86IE1ha2UgaXQgem9vbVxuLy8gVE9ETzogbWF5YmUgaGF2ZSB0d28gZWxlbWVudHM/IGEgdmlld3BvcnQgYW5kIGEgSFNXUyB3aXRoIGFic29sdXRlbHkgcG9zaXRpb25lZCBjaGlsZHJlbiBhbmQgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXNcblxuLy8gVE9ETzogY29udmVydCB0byB1c2UgQWZmaW5lIHRyYW5zZm9ybS5cblxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IGltcGxlbWVudHMgU2Nyb2xsZXJFdmVudHMge1xuICAgIC8vIFNjcm9sbExheW91dCBoYXMgdG8gaW50ZXJjZXB0IGFsbCBldmVudHMgdG8gbWFrZSBzdXJlIGFueSBsb2NhdGlvbnMgYXJlIHVwZGF0ZWQgYnlcbiAgICAvLyB0aGUgc2Nyb2xsIHBvc2l0aW9uLCBzbyBjaGlsZCBpcyB1bmRlZmluZWQsIGFuZCBhbGwgZXZlbnRzIGFyZSBmb3J3YXJkZWQgdG8gc2Nyb2xsZXIuXG4gICAgc2Nyb2xsZXI6IFdTSFNMYXlvdXQ8YW55PjtcbiAgICBzY3JvbGw6IFBvaW50MkQ7XG4gICAgem9vbTogbnVtYmVyO1xuICAgIHpvb21NYXg6IG51bWJlcjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVycyB8IFRBUkdFVF9ST09UIHwgVEFSR0VUX05PTkU+O1xuICAgIHByaXZhdGUgdG91Y2hTY3JvbGw6IE1hcDxudW1iZXIsIHsgcHJldjogUG9pbnQyRCwgY3VycjogUG9pbnQyRCB9PjtcblxuICAgIHByaXZhdGUgdXBkYXRlU2Nyb2xsKCkge1xuICAgICAgICBjb25zdCB0cyA9IFsuLi50aGlzLnRvdWNoU2Nyb2xsLnZhbHVlcygpXTtcbiAgICAgICAgaWYgKHRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHRzWzBdO1xuICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucDJjKHQucHJldik7XG4gICAgICAgICAgICBjb25zdCBjID0gdGhpcy5wMmModC5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzBdICs9IHBbMF0gLSBjWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcFsxXSAtIGNbMV07XG4gICAgICAgIH0gZWxzZSBpZiAodHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwbSA9IHRoaXMucDJjKFtcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlswXSArIHRzWzFdLnByZXZbMF0pICogMC41LFxuICAgICAgICAgICAgICAgICh0c1swXS5wcmV2WzFdICsgdHNbMV0ucHJldlsxXSkgKiAwLjUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGNvbnN0IHBkID0gcG9pbnREaXN0YW5jZSh0c1swXS5wcmV2LCB0c1sxXS5wcmV2KTtcbiAgICAgICAgICAgIGNvbnN0IGNkID0gcG9pbnREaXN0YW5jZSh0c1swXS5jdXJyLCB0c1sxXS5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuem9vbSAqPSBjZCAvIHBkO1xuICAgICAgICAgICAgLy8gQ2xhbXAgem9vbSBzbyB3ZSBjYW4ndCB6b29tIG91dCB0b28gZmFyLlxuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIud2lkdGggPCB0aGlzLndpZHRoIC8gdGhpcy56b29tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy53aWR0aCAvIHRoaXMuc2Nyb2xsZXIud2lkdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxlci5oZWlnaHQgPCB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuaGVpZ2h0IC8gdGhpcy5zY3JvbGxlci5oZWlnaHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy56b29tID4gdGhpcy56b29tTWF4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy56b29tTWF4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY20gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMF0gKyB0c1sxXS5jdXJyWzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclsxXSArIHRzWzFdLmN1cnJbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwbVswXSAtIGNtWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcG1bMV0gLSBjbVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbFswXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzBdLCAwLCB0aGlzLnNjcm9sbGVyLndpZHRoIC0gdGhpcy53aWR0aCAvIHRoaXMuem9vbSk7XG4gICAgICAgIHRoaXMuc2Nyb2xsWzFdID0gY2xhbXAodGhpcy5zY3JvbGxbMV0sIDAsIHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IC0gdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcDJjKHA6IFBvaW50MkQpOiBQb2ludDJEIHtcbiAgICAgICAgY29uc3QgcyA9IHRoaXMuc2Nyb2xsO1xuICAgICAgICBjb25zdCBzaHJpbmsgPSAxIC8gdGhpcy56b29tO1xuICAgICAgICAvLyBUT0RPOiB0YWtlIHBhcmVudCByZWN0IGludG8gYWNjb3VudFxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgKHBbMF0gLSB0aGlzLmxlZnQpICogc2hyaW5rICsgc1swXSxcbiAgICAgICAgICAgIChwWzFdIC0gdGhpcy50b3ApICogc2hyaW5rICsgc1sxXSxcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICAvLyBwcml2YXRlIGMycChjaGlsZENvb3JkOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgLy8gICAgIHJldHVybiBwb2ludFN1YihjaGlsZENvb3JkLCB0aGlzLnNjcm9sbCk7XG4gICAgLy8gfVxuXG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xsOiBQb2ludDJELCB6b29tOiBudW1iZXIsIHpvb21NYXg6IG51bWJlcikge1xuICAgICAgICAvLyBUT0RPOiBtaW4gem9vbTtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlciA9IGNoaWxkO1xuICAgICAgICB0aGlzLnNjcm9sbCA9IHNjcm9sbDtcbiAgICAgICAgdGhpcy56b29tID0gem9vbTtcbiAgICAgICAgdGhpcy56b29tTWF4ID0gem9vbU1heDtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTY3JvbGwgPSBuZXcgTWFwKCk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLmxlZnQsIHRoaXMudG9wKTtcbiAgICAgICAgICAgIC8vIENsaXAgdG8gU2Nyb2xsIHZpZXdwb3J0LlxuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbygwLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oMCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmNsaXAoKTtcbiAgICAgICAgICAgIGN0eC5zY2FsZSh0aGlzLnpvb20sIHRoaXMuem9vbSk7XG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKC10aGlzLnNjcm9sbFswXSwgLXRoaXMuc2Nyb2xsWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IHZwU2Nyb2xsZXIgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogdGhpcy5zY3JvbGxbMF0sXG4gICAgICAgICAgICAgICAgdG9wOiB0aGlzLnNjcm9sbFsxXSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCAvIHRoaXMuem9vbSxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gZWMucHVzaFNjcm9sbGVyKHRoaXMpO1xuICAgICAgICAgICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5zY3JvbGxlciwgZWMsIHZwU2Nyb2xsZXIpO1xuICAgICAgICAgICAgZWMucG9wU2Nyb2xsZXIodG9rZW4pO1xuICAgICAgICAgICAgLy8gVE9ETzogcmVzdG9yZSB0cmFuc2Zvcm0gaW4gYSBmaW5hbGx5P1xuICAgICAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3AgPSB0aGlzLnAyYyhwcCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5zY3JvbGxlciwgY3ApO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIG51bGwgdG8gYWN0aXZlIHRvdWNoZXMsIHNvIHdlIGtub3cgdGhleSBzaG91bGQgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTY3JvbGwuc2V0KGlkLCB7IHByZXY6IHBwLCBjdXJyOiBwcCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gZWMucHVzaFNjcm9sbGVyKHRoaXMpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKGlkLCBjcCwgZWMpO1xuICAgICAgICAgICAgICAgIGVjLnBvcFNjcm9sbGVyKHRva2VuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVycywgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIG1vdmUgSUQgJHt0LmlkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY3JvbGwgPSB0aGlzLnRvdWNoU2Nyb2xsLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjcm9sbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aCBJRCAke3QuaWR9IGhhcyB0YXJnZXQgPT09IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzY3JvbGwucHJldiA9IHNjcm9sbC5jdXJyO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwuY3VyciA9IHQucDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHR0cy5wdXNoKHQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHR0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgc2Nyb2xsIHBvc2l0aW9uLlxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGwoKTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGNvbnN0IHRva2VuID0gZWMucHVzaFNjcm9sbGVyKHRoaXMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0dHNdIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHR0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0dHNbaV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdHRzW2ldLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcDogdGhpcy5wMmModHRzW2ldLnApLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHR0cywgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWMucG9wU2Nyb2xsZXIodG9rZW4pO1xuICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldChpZCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggZW5kIElEICR7aWR9YCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMudG91Y2hTY3JvbGwuZGVsZXRlKGlkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCBJRCAke2lkfSBoYXMgdGFyZ2V0IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90aGluZywgdGFyZXQgd2FzIGRlbGV0ZWQuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRva2VuID0gZWMucHVzaFNjcm9sbGVyKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIGVjKTtcbiAgICAgICAgICAgICAgICAgICAgZWMucG9wU2Nyb2xsZXIodG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gVE9ETzogb3RoZXIgaGFuZGxlcnMgbmVlZCBmb3J3YXJkaW5nLlxuICAgIH1cbiAgICBlbGVtZW50RGV0YWNoZWQoZTogRWxlbWVudDxhbnksIGFueT4pOiB2b2lkIHtcbiAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50b3VjaFRhcmdldHMpIHtcbiAgICAgICAgICAgIGlmICh2ID09PSBlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyLmxheW91dCgwLCAwKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBTY3JvbGwoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xsPzogUG9pbnQyRCwgem9vbT86IG51bWJlciwgem9vbU1heD86IG51bWJlcik6IFNjcm9sbExheW91dCB7XG4gICAgLy8gTkI6IHNjYWxlIG9mIDAgaXMgaW52YWxpZCBhbnl3YXlzLCBzbyBpdCdzIE9LIHRvIGJlIGZhbHN5LlxuICAgIHJldHVybiBuZXcgU2Nyb2xsTGF5b3V0KGNoaWxkLCBzY3JvbGwgfHwgWzAsIDBdLCB6b29tIHx8IDEsIHpvb21NYXggfHwgMTApO1xufVxuXG4vLyBUT0RPOiBzY3JvbGx4LCBzY3JvbGx5XG5cbmNsYXNzIEJveExheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8dW5kZWZpbmVkPiB7XG4gICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgfVxufTtcblxuY2xhc3MgQm94V2l0aENoaWxkTGF5b3V0IGV4dGVuZHMgV1NIU0xheW91dDxXUEhQTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6V1BIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEJveCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueT4pOiBXU0hTTGF5b3V0PGFueT4ge1xuICAgIGlmIChjaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBuZXcgQm94V2l0aENoaWxkTGF5b3V0KHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQod2lkdGgsIGhlaWdodCk7XG59XG5cbmNsYXNzIFdQSFBCb3JkZXJMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFBMYXlvdXQ8YW55Pj4ge1xuICAgIGJvcmRlcjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdQSFBMYXlvdXQ8YW55PiwgYm9yZGVyOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLmJvcmRlciA9IGJvcmRlcjtcbiAgICAgICAgdGhpcy5zdHlsZSA9IHN0eWxlO1xuXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgICAgIGNvbnN0IGIyID0gYiAqIDAuNTtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHRoaXMuc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIGIyLCBib3gudG9wICsgYjIsIGJveC53aWR0aCAtIGIsIGJveC5oZWlnaHQgLSBiKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCArIGIsIHRvcCArIGIsIHdpZHRoIC0gYiAqIDIsIGhlaWdodCAtIGIgKiAyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3JkZXIod2lkdGg6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55Pik6IFdQSFBMYXlvdXQ8YW55PiB7XG4gICAgcmV0dXJuIG5ldyBXUEhQQm9yZGVyTGF5b3V0KGNoaWxkLCB3aWR0aCwgc3R5bGUpO1xufVxuXG5jbGFzcyBGaWxsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRmlsbCgpOiBGaWxsTGF5b3V0IHtcbiAgICByZXR1cm4gbmV3IEZpbGxMYXlvdXQoKTtcbn1cblxuY2xhc3MgQ2VudGVyTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBDZW50ZXJMYXlvdXQge1xuICAgIHJldHVybiBuZXcgQ2VudGVyTGF5b3V0KGNoaWxkKTtcbn1cblxuY2xhc3MgSENlbnRlckhQTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXU0hQTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgSENlbnRlckhTTGF5b3V0IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pik6IEhDZW50ZXJIU0xheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyKGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pOiBIQ2VudGVySFBMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1NIUExheW91dDxhbnk+KTogSENlbnRlckhTTGF5b3V0IHwgSENlbnRlckhQTGF5b3V0IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dzaHAnKSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhQTGF5b3V0KGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBWQ2VudGVyV1BMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXUEhTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wLCB3aWR0aCk7XG4gICAgfVxufTtcblxuY2xhc3MgVkNlbnRlcldTTGF5b3V0IGV4dGVuZHMgV1NIUExheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IGNoaWxkLndpZHRoO1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBWQ2VudGVyV1NMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcihjaGlsZDogV1BIU0xheW91dDxhbnk+KTogVkNlbnRlcldQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdQSFNMYXlvdXQ8YW55Pik6IFZDZW50ZXJXU0xheW91dCB8IFZDZW50ZXJXUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3cGhzJykge1xuICAgICAgICByZXR1cm4gbmV3IFZDZW50ZXJXUExheW91dChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1NMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgTGVmdEhTTGF5b3V0IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuY2xhc3MgTGVmdFN0YWNrTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXU0hQTGF5b3V0PGFueT4+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGRyZW46IFN0YXRpY0FycmF5PFdTSFBMYXlvdXQ8YW55Pj4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGxldCBjaGlsZExlZnQgPSBsZWZ0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGQud2lkdGg7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5jbGFzcyBMZWZ0RmxleExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8RmxleExheW91dD4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dD4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuICAgICAgICBsZXQgc2l6ZVN1bSA9IDA7XG4gICAgICAgIGxldCBncm93U3VtID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgc2l6ZVN1bSArPSBjaGlsZC5zaXplO1xuICAgICAgICAgICAgZ3Jvd1N1bSArPSBjaGlsZC5ncm93O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dHJhID0gd2lkdGggLSBzaXplU3VtO1xuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgY29uc3QgY2hpbGRXaWR0aCA9IGNoaWxkLnNpemUgKyBjaGlsZC5ncm93ICogZXh0cmEgLyBncm93U3VtO1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBjaGlsZFdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkLnNpemU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBXUEhTTGF5b3V0PGFueT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDA6IFdTSFBMYXlvdXQ8YW55PiwgLi4uY2hpbGRSZXN0OiBBcnJheTxXU0hQTGF5b3V0PGFueT4+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQwOiBGbGV4TGF5b3V0LCAuLi5jaGlsZFJlc3Q6IEFycmF5PEZsZXhMYXlvdXQ+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55PiB8IEZsZXhMYXlvdXQsIC4uLl86IEFycmF5PFdTSFBMYXlvdXQ8YW55Pj4gfCBBcnJheTxGbGV4TGF5b3V0Pik6IFdQSFNMYXlvdXQ8YW55PiB8IFdQSFBMYXlvdXQ8YW55PiB7XG4gICAgc3dpdGNoIChjaGlsZC5sYXlvdXRUeXBlKSB7XG4gICAgICAgIGNhc2UgJ2ZsZXgnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0RmxleExheW91dChhcmd1bWVudHMpO1xuICAgICAgICBjYXNlICd3c2hwJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdFN0YWNrTGF5b3V0KGFyZ3VtZW50cyk7XG4gICAgICAgIGNhc2UgJ3dzaHMnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0SFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgUmlnaHRIUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgUmlnaHRIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0IHwgUmlnaHRIUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IFJpZ2h0SFBMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgUmlnaHRIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBEZWJ1Z1RvdWNoKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaWxsOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIHN0cm9rZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKTogQm94TGF5b3V0IHtcbiAgICBjb25zdCB0YXBzOiBBcnJheTxQb2ludDJEPiA9IFtdO1xuICAgIGNvbnN0IHBhbnM6IEFycmF5PEFycmF5PFBhblBvaW50Pj4gPSBbXTtcbiAgICByZXR1cm4gQm94KFxuICAgICAgICB3aWR0aCxcbiAgICAgICAgaGVpZ2h0LFxuICAgICkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGZpbGw7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0cm9rZTtcbiAgICAgICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBmb3IgKGNvbnN0IHRhcCBvZiB0YXBzKSB7XG4gICAgICAgICAgICBjdHgubW92ZVRvKHRhcFswXSArIDE2LCB0YXBbMV0pO1xuICAgICAgICAgICAgY3R4LmVsbGlwc2UodGFwWzBdLCB0YXBbMV0sIDE2LCAxNiwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgcHMgb2YgcGFucykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyhwLnByZXZbMF0sIHAucHJldlsxXSk7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyhwLmN1cnJbMF0sIHAuY3VyclsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH0pLm9uVGFwKChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgdGFwcy5wdXNoKHApO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgcGFucy5wdXNoKHBzKTtcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KTtcbn1cblxuLy8gVE9ETzogVG9wLCBCb3R0b21cblxuY2xhc3MgTGF5ZXJMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFdQSFBMYXlvdXQ8YW55Pj4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZHJlbjogU3RhdGljQXJyYXk8V1BIUExheW91dDxhbnk+Pikge1xuICAgICAgICBzdXBlcihjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBMYXllciguLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnk+Pik6IExheWVyTGF5b3V0IHtcbiAgICByZXR1cm4gbmV3IExheWVyTGF5b3V0KGNoaWxkcmVuKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb25MYXlvdXQgZXh0ZW5kcyBFbGVtZW50PFwicG9zXCIsIFdQSFBMYXlvdXQ8YW55PiB8IHVuZGVmaW5lZD4ge1xuICAgIHJlcXVlc3RMZWZ0OiBudW1iZXI7XG4gICAgcmVxdWVzdFRvcDogbnVtYmVyO1xuICAgIHJlcXVlc3RXaWR0aDogbnVtYmVyO1xuICAgIHJlcXVlc3RIZWlnaHQ6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIHN1cGVyKFwicG9zXCIsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMucmVxdWVzdFRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0V2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0SGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQocGFyZW50OiBMYXlvdXRCb3gpIHtcbiAgICAgICAgdGhpcy53aWR0aCA9IE1hdGgubWluKHRoaXMucmVxdWVzdFdpZHRoLCBwYXJlbnQud2lkdGgpO1xuICAgICAgICB0aGlzLmxlZnQgPSBjbGFtcCh0aGlzLnJlcXVlc3RMZWZ0LCBwYXJlbnQubGVmdCwgcGFyZW50LmxlZnQgKyBwYXJlbnQud2lkdGggLSB0aGlzLndpZHRoKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RIZWlnaHQsIHBhcmVudC5oZWlnaHQpO1xuICAgICAgICB0aGlzLnRvcCA9IGNsYW1wKHRoaXMucmVxdWVzdFRvcCwgcGFyZW50LnRvcCwgcGFyZW50LnRvcCArIHBhcmVudC5oZWlnaHQgLSB0aGlzLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQodGhpcy5sZWZ0LCB0aGlzLnRvcCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLy8gVE9ETzogc3VwcG9ydCBzdGF0aWNhbGx5IHNpemVkIGNoaWxkcmVuLCBcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueT4pIHtcbiAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgY2hpbGQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gRHJhZ2dhYmxlKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZD86IFdQSFBMYXlvdXQ8YW55Pikge1xuICAgIGNvbnN0IGxheW91dCA9IG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbiAgICByZXR1cm4gbGF5b3V0Lm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgbGV0IGR4ID0gMDtcbiAgICAgICAgbGV0IGR5ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBkeCArPSBwLmN1cnJbMF0gLSBwLnByZXZbMF07XG4gICAgICAgICAgICBkeSArPSBwLmN1cnJbMV0gLSBwLnByZXZbMV07XG4gICAgICAgIH1cbiAgICAgICAgZHggLz0gcHMubGVuZ3RoO1xuICAgICAgICBkeSAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCArPSBkeDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgKz0gZHk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KS5vblBhbkVuZCgoKSA9PiB7XG4gICAgICAgIC8vIFRoZSByZXF1ZXN0ZWQgbG9jYXRpb24gY2FuIGJlIG91dHNpZGUgdGhlIGFsbG93ZWQgYm91bmRzIGlmIGRyYWdnZWQgb3V0c2lkZSxcbiAgICAgICAgLy8gYnV0IG9uY2UgdGhlIGRyYWcgaXMgb3Zlciwgd2Ugd2FudCB0byByZXNldCBpdCBzbyB0aGF0IGl0IGRvZXNuJ3Qgc3RhcnQgdGhlcmVcbiAgICAgICAgLy8gb25jZSBhIG5ldyBkcmFnIHN0YXJ0LlxuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgPSBsYXlvdXQubGVmdDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgPSBsYXlvdXQudG9wO1xuICAgIH0pO1xufVxuXG5cbi8vIFRPRE86IGRvZXMgaXQgbWFrZSBzZW5zZSB0byBtYWtlIG90aGVyIGxheW91dCB0eXBlcz9cbi8vIGNsYXNzIFdTSFNSZWxhdGl2ZUxheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+PiB7XG4vLyAgICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbi8vICAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuLy8gICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4vLyAgICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuLy8gICAgIH1cbi8vICAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuLy8gICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuLy8gICAgICAgICB0aGlzLnRvcCA9IHRvcDtcblxuLy8gICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbi8vICAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4vLyAgICAgICAgIH1cbi8vICAgICB9XG4vLyB9O1xuXG5jbGFzcyBXUEhQUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmUoLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0Pik6IFdQSFBSZWxhdGl2ZUxheW91dCB7XG4gICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQoY2hpbGRyZW4pO1xufVxuIl19