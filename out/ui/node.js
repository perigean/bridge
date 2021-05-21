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
    onDetach(handler) {
        if (this.onDetachHandler === undefined || this.onDetachHandler === handler) {
            this.onDetachHandler = handler;
        }
        else if (Array.isArray(this.onDetachHandler)) {
            if (this.onDetachHandler.indexOf(handler) < 0) {
                this.onDetachHandler.push(handler);
            }
        }
        else {
            this.onDetachHandler = [this.onDetachHandler, handler];
        }
        return this;
    }
    removeOnDetach(handler) {
        if (Array.isArray(this.onDetachHandler)) {
            const i = this.onDetachHandler.indexOf(handler);
            if (i >= 0) {
                // Copy the array, so that it's safe to call this inside an OnDetachHandler.
                this.onDetachHandler = [...this.onDetachHandler].splice(i, 1);
            }
        }
        else if (this.onDetachHandler === handler) {
            this.onDetachHandler = undefined;
        }
    }
}
;
export function addChild(e, child, ec, index) {
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
    ec.requestLayout();
}
function callDetachListeners(root) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop();
        if (Array.isArray(e.onDetachHandler)) {
            for (const handler of e.onDetachHandler) {
                handler(e);
            }
        }
        else if (e.onDetachHandler !== undefined) {
            e.onDetachHandler(e);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        }
        else if (e.child[Symbol.iterator]) {
            stack.push(...e.child);
        }
        else {
            stack.push(e.child);
        }
    }
}
export function removeChild(e, index, ec) {
    const children = new Array(e.child.length - 1);
    let j = 0;
    for (let i = 0; i < e.child.length; i++) {
        if (i === index) {
            callDetachListeners(e.child[i]);
        }
        else {
            children[j++] = e.child[i];
        }
    }
    e.child = children;
    ec.requestLayout();
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
        this.touchTargetDetached = (e) => {
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
}
;
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures
// TODO: convert to use Affine transform.
class ScrollLayout extends WPHPLayout {
    constructor(child, scroll, zoom, zoomMax) {
        // TODO: min zoom;
        super(undefined);
        this.scroller = child;
        this.scroll = scroll;
        this.zoom = zoom;
        this.zoomMax = zoomMax;
        this.touchTargets = new Map();
        this.touchScroll = new Map();
        this.touchTargetDetached = (e) => {
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
            drawElementTree(ctx, this.scroller, ec, vpScroller);
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
                target.onDetach(this.touchTargetDetached);
                target.onTouchBeginHandler(id, cp, ec);
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
                target.removeOnDetach(this.touchTargetDetached);
                if (target.onTouchEndHandler !== undefined) {
                    target.onTouchEndHandler(id, ec);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBY25ELENBQUM7QUFvQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBWWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQzlELEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxJQUFJLFNBQVMsRUFBRTtvQkFDaEIsOERBQThEO29CQUM5RCxJQUFJLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTt3QkFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFOzRCQUNoQixJQUFJLEVBQUUsQ0FBQzs0QkFDUCxJQUFJ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QXVDO0lBQ3BFLFlBQVksUUFBcUM7UUFDN0MsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUN0QztJQUNMLENBQUM7Q0FDSjtBQUVELE1BQU0sVUFBVSxRQUFRLENBQUMsR0FBRyxRQUErQjtJQUN2RCxPQUFPLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDNUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIERpY2sgMjAyMVxuXG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcblxuZXhwb3J0IHR5cGUgTGF5b3V0Qm94ID0ge1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogUGFzcyBFbGVtZW50Q29udGV4dCBhbG9uZyB3aXRoIGxheW91dCwgc28gdGhhdCB3ZSBjYW4gaGF2ZSBkeW5hbWljIGxheW91dHMuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudENvbnRleHQge1xuICAgIHJlcXVlc3REcmF3KCk6IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dCgpOiB2b2lkO1xufTtcblxudHlwZSBTdGF0ZWxlc3NIYW5kbGVyID0gKGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRGV0YWNoSGFuZGxlciA9IChlOiBFbGVtZW50PGFueSwgYW55PikgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpID0+IHZvaWQ7XG5cbnR5cGUgT25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIFRvdWNoTW92ZSA9IHtcbiAgICByZWFkb25seSBpZDogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHA6IFBvaW50MkQ7XG59O1xudHlwZSBPblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBPblRhcEhhbmRsZXIgPSAocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgUGFuUG9pbnQgPSB7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcbmV4cG9ydCB0eXBlIE9uUGFuSGFuZGxlciA9IChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG4vLyBUT0RPOiBQYXNzIHRvdWNoIHNpemUgZG93biB3aXRoIHRvdWNoIGV2ZW50cyAoaW5zdGVhZCBvZiBzY2FsZT8pXG4vLyBJcyB0aGF0IGVub3VnaD8gUHJvYmFibHkgd2Ugd2lsbCBhbHdheXMgd2FudCBhIHRyYW5zb2Zvcm1hdGlvbiBtYXRyaXguXG4vLyBCdXQgZW5vdWdoIGZvciBub3csIHNvIGp1c3QgZG8gdGhhdC5cblxuY2xhc3MgVG91Y2hHZXN0dXJlIHtcbiAgICBvblRhcEhhbmRsZXI/OiBPblRhcEhhbmRsZXI7XG4gICAgb25QYW5IYW5kbGVyPzogT25QYW5IYW5kbGVyO1xuICAgIG9uUGFuQmVnaW5IYW5kbGVyPzogU3RhdGVsZXNzSGFuZGxlcjtcbiAgICBvblBhbkVuZEhhbmRsZXI/OiBTdGF0ZWxlc3NIYW5kbGVyO1xuXG4gICAgcHJpdmF0ZSBhY3RpdmU6IE1hcDxudW1iZXIsIFBvaW50MkQ+O1xuICAgIHByaXZhdGUgcGFuczogTWFwPG51bWJlciwgUGFuUG9pbnQ+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wYW5zID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgXzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLnNldChpZCwgcCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBUb3VjaE1vdmVbXSwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChhICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBwYXNzIGluIGRpc3RhbmNlIHRocmVzaG9sZD8gU2NhbGUgYmFzZSBvbiB0cmFuc2Zvcm1zP1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnREaXN0YW5jZShhLCB0LnApID49IDE2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IGEsICAgIC8vIFVzZSB0aGUgc3RhcnQgcG9pbnQgaGVyZSwgc28gdGhlIGZpcnN0IG1vdmUgaXMgZnJvbSB0aGUgc3RhcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wYW5zLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAocCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25QYW5CZWdpbkhhbmRsZXIoZWMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogcC5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogdC5wLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPiAwICYmIHRoaXMub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuSGFuZGxlcihbLi4udGhpcy5wYW5zLnZhbHVlcygpXSwgZWMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoYSAhPT0gdW5kZWZpbmVkICYmIHRoaXMub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uVGFwSGFuZGxlcihhLCBlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5kZWxldGUoaWQpICYmIHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuRW5kSGFuZGxlcihlYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcblxuLy8gU28gdGhhdCB3ZSBjYW4gdGFrZSBJQXJndW1lbnRzIGFzIGNoaWxkcmVuXG5pbnRlcmZhY2UgU3RhdGljQXJyYXk8VD4ge1xuICAgIFtpbmRleDogbnVtYmVyXTogVDtcbiAgICBsZW5ndGg6IG51bWJlcjtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+O1xufTtcblxudHlwZSBDaGlsZENvbnN0cmFpbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZz4gPSBFbGVtZW50PExheW91dFR5cGUsIGFueT4gfCBTdGF0aWNBcnJheTxFbGVtZW50PExheW91dFR5cGUsIGFueT4+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpbml0VG91Y2hHZXN0dXJlKGU6IEVsZW1lbnQ8YW55LCBhbnk+KTogVG91Y2hHZXN0dXJlIHtcbiAgICBpZiAoZS50b3VjaEdlc3R1cmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZS50b3VjaEdlc3R1cmU7XG4gICAgfVxuICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RvdWNoIGdlc3R1cmVzIGFscmVhZHkgY2FwdHVyZWQnKTtcbiAgICB9XG4gICAgY29uc3QgdGcgPSBuZXcgVG91Y2hHZXN0dXJlKCk7XG4gICAgZS5vblRvdWNoQmVnaW5IYW5kbGVyID0gdGcub25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hNb3ZlSGFuZGxlciA9IHRnLm9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hFbmRIYW5kbGVyID0gdGcub25Ub3VjaEVuZEhhbmRsZXI7XG4gICAgcmV0dXJuIHRnO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHggPCBtaW4pIHtcbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9IGVsc2UgaWYgKHggPiBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG59XG5cbmNsYXNzIEVsZW1lbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZywgQ2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8c3RyaW5nPj4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgfVxuXG4gICAgb25EcmF3SGFuZGxlcj86IE9uRHJhd0hhbmRsZXI7XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcj86IE9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyO1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlO1xuICAgIG9uVGFwKGhhbmRsZXI6IE9uVGFwSGFuZGxlcik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5CZWdpbihoYW5kbGVyOiBTdGF0ZWxlc3NIYW5kbGVyKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5CZWdpbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuRW5kKGhhbmRsZXI6IFN0YXRlbGVzc0hhbmRsZXIpOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5FbmQgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkRldGFjaEhhbmRsZXI/OiBPbkRldGFjaEhhbmRsZXIgfCBBcnJheTxPbkRldGFjaEhhbmRsZXI+O1xuICAgIG9uRGV0YWNoKGhhbmRsZXI6IE9uRGV0YWNoSGFuZGxlcik6IHRoaXMge1xuICAgICAgICBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IHVuZGVmaW5lZCB8fCB0aGlzLm9uRGV0YWNoSGFuZGxlciA9PT0gaGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5vbkRldGFjaEhhbmRsZXIpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIuaW5kZXhPZihoYW5kbGVyKSA8IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlci5wdXNoKGhhbmRsZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBbdGhpcy5vbkRldGFjaEhhbmRsZXIsIGhhbmRsZXJdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICByZW1vdmVPbkRldGFjaChoYW5kbGVyOiBPbkRldGFjaEhhbmRsZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5vbkRldGFjaEhhbmRsZXIpKSB7XG4gICAgICAgICAgICBjb25zdCBpID0gdGhpcy5vbkRldGFjaEhhbmRsZXIuaW5kZXhPZihoYW5kbGVyKTtcbiAgICAgICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHRoZSBhcnJheSwgc28gdGhhdCBpdCdzIHNhZmUgdG8gY2FsbCB0aGlzIGluc2lkZSBhbiBPbkRldGFjaEhhbmRsZXIuXG4gICAgICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBbLi4udGhpcy5vbkRldGFjaEhhbmRsZXJdLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLm9uRGV0YWNoSGFuZGxlciA9PT0gaGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gYWRkQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnk+Pj4sIGNoaWxkOiBFbGVtZW50PGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBpbmRleD86IG51bWJlcikge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnk+PihlLmNoaWxkLmxlbmd0aCArIDEpO1xuICAgIGxldCBpID0gMDtcbiAgICBsZXQgaiA9IDA7XG4gICAgZm9yICg7IGkgPCBlLmNoaWxkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpID09PSBpbmRleCkge1xuICAgICAgICAgICAgY2hpbGRyZW5baisrXSA9IGNoaWxkO1xuICAgICAgICB9XG4gICAgICAgIGNoaWxkcmVuW2orK10gPSBlLmNoaWxkW2ldO1xuICAgIH1cbiAgICBpZiAoaiA9PT0gaSkge1xuICAgICAgICBjaGlsZHJlbltqXSA9IGNoaWxkO1xuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG4gICAgZWMucmVxdWVzdExheW91dCgpO1xufVxuXG5mdW5jdGlvbiBjYWxsRGV0YWNoTGlzdGVuZXJzKHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnk+O1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShlLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBlLm9uRGV0YWNoSGFuZGxlcikge1xuICAgICAgICAgICAgICAgIGhhbmRsZXIoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZS5vbkRldGFjaEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZS5vbkRldGFjaEhhbmRsZXIoZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4uZS5jaGlsZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnk+Pj4sIGluZGV4OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnk+PihlLmNoaWxkLmxlbmd0aCAtIDEpO1xuICAgIGxldCBqID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGUuY2hpbGQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPT09IGluZGV4KSB7XG4gICAgICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKGUuY2hpbGRbaV0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hpbGRyZW5baisrXSA9IGUuY2hpbGRbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xuICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgV1BIUExheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+PiBleHRlbmRzIEVsZW1lbnQ8J3dwaHAnLCBDaGlsZD4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocCcsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdQSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3cGhzJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHMnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55Pj4gZXh0ZW5kcyBFbGVtZW50PCd3c2hwJywgQ2hpbGQ+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dzaHAnLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXU0hTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4+IGV4dGVuZHMgRWxlbWVudDwnd3NocycsIENoaWxkPiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hzJywgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5leHBvcnQgdHlwZSBMYXlvdXRIYXNXaWR0aEFuZEhlaWdodCA9IFdTSFNMYXlvdXQ8YW55PjtcbmV4cG9ydCB0eXBlIExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQgPSBXUEhQTGF5b3V0PGFueT47XG5cblxuY2xhc3MgRmxleExheW91dCBleHRlbmRzIEVsZW1lbnQ8J2ZsZXgnLCBXUEhQTGF5b3V0PGFueT4+IHtcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZ3JvdzogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKCdmbGV4JywgY2hpbGQpO1xuICAgICAgICB0aGlzLnNpemUgPSBzaXplO1xuICAgICAgICB0aGlzLmdyb3cgPSBncm93O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDpudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBkcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueT47XG4gICAgICAgIGlmIChlLm9uRHJhd0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGUub25EcmF3SGFuZGxlcihjdHgsIGUsIGVjLCB2cCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIC8vIFB1c2ggbGFzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgZHJhdyBpdCBsYXN0LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGUuY2hpbGQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGRbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5maWxsUmVjdChyb290LmxlZnQsIHJvb3QudG9wLCByb290LndpZHRoLCByb290LmhlaWdodCk7XG4gICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgcm9vdCwgZWMsIHZwKTtcbn1cblxudHlwZSBIYXNUb3VjaEhhbmRsZXJzID0ge1xuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyO1xufSAmIEVsZW1lbnQ8YW55LCBhbnk+O1xuXG5jbGFzcyBEZWJvdW5jZXIge1xuICAgIGJvdW5jZTogKCkgPT4gdm9pZDtcbiAgICB0aW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihmOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuYm91bmNlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGltZW91dCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgZigpO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNsZWFyKCkge1xuICAgICAgICBpZiAodGhpcy50aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpO1xuICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZmluZFRvdWNoVGFyZ2V0KHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnk+LCBwOiBQb2ludDJEKTogdW5kZWZpbmVkIHwgSGFzVG91Y2hIYW5kbGVycyB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgY29uc3QgeCA9IHBbMF07XG4gICAgY29uc3QgeSA9IHBbMV07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnk+O1xuICAgICAgICBpZiAoeCA8IGUubGVmdCB8fCB4ID49IGUubGVmdCArIGUud2lkdGggfHwgeSA8IGUudG9wIHx8IHkgPj0gZS50b3AgKyBlLmhlaWdodCkge1xuICAgICAgICAgICAgLy8gT3V0c2lkZSBlLCBza2lwLiAgXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgJiYgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBlIGFzIEhhc1RvdWNoSGFuZGxlcnM7IC8vIFRPRE86IFdoeSBjYW4ndCB0eXBlIGluZmVyZW5jZSBmaWd1cmUgdGhpcyBvdXQ/XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIC8vIFB1c2ggZmlyc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIHZpc2l0IGxhc3QgY2hpbGQgbGFzdC5cbiAgICAgICAgICAgIC8vIFRoZSBsYXN0IGNoaWxkICh0aGUgb25lIG9uIHRvcCkgc2hvdWxkIG92ZXJyaWRlIHByZXZpb3VzIGNoaWxkcmVuJ3MgdGFyZ2V0LlxuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5lLmNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxudHlwZSBUQVJHRVRfUk9PVCA9IDE7XG5jb25zdCBUQVJHRVRfUk9PVCA9IDE7XG50eXBlIFRBUkdFVF9OT05FID0gMjtcbmNvbnN0IFRBUkdFVF9OT05FID0gMjtcblxuZXhwb3J0IGNsYXNzIFJvb3RMYXlvdXQgaW1wbGVtZW50cyBFbGVtZW50Q29udGV4dCB7XG4gICAgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55PjtcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xuICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHJlc2l6ZTogUmVzaXplT2JzZXJ2ZXI7XG4gICAgdnA6IExheW91dEJveDtcblxuICAgIC8vIFRPRE86IHdlIHNob3VsZCBub3QgcmVyZW5kZXIgaWYgdGhlcmUgYXJlIHBlbmRpbmcgbGF5b3V0IHJlcXVlc3RzLlxuICAgIGRlYm91bmNlTGF5b3V0OiBEZWJvdW5jZXI7XG4gICAgZGVib3VuY2VEcmF3OiBEZWJvdW5jZXI7XG5cbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVycyB8IFRBUkdFVF9ST09UIHwgVEFSR0VUX05PTkU+O1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXREZXRhY2hlZDogT25EZXRhY2hIYW5kbGVyO1xuICAgIHByaXZhdGUgdG91Y2hTdGFydDogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDsgXG4gICAgcHJpdmF0ZSB0b3VjaE1vdmU6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgcHJpdmF0ZSB0b3VjaEVuZDogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcblxuICAgIGNvbnN0cnVjdG9yKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsIGNoaWxkOiBXUEhQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNoaWxkO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IGNhbnZhcztcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiLCB7YWxwaGE6IGZhbHNlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcbiAgICAgICAgdGhpcy5yZXNpemUgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNpemVPYnNlcnZlciBleHBlY3RzIDEgZW50cnksIGdvdCAke2VudHJpZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVudHJpZXNbMF0uY29udGVudFJlY3Q7XG4gICAgICAgICAgICBjb25zdCB2cCA9IHRoaXMudnA7XG4gICAgICAgICAgICB2cC5sZWZ0ID0gMDtcbiAgICAgICAgICAgIHZwLnRvcCA9IDA7XG4gICAgICAgICAgICB2cC53aWR0aCA9IGNvbnRlbnQud2lkdGg7XG4gICAgICAgICAgICB2cC5oZWlnaHQgPSBjb250ZW50LmhlaWdodFxuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gdnAud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSB2cC5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGN0eC50cmFuc2Zvcm0od2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDAsIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdnAud2lkdGgsIHZwLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICAgICAgY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB2cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlc2l6ZS5vYnNlcnZlKGNhbnZhcywge2JveDogXCJkZXZpY2UtcGl4ZWwtY29udGVudC1ib3hcIn0pO1xuICAgICAgICB0aGlzLnZwID0ge1xuICAgICAgICAgICAgbGVmdDogMCxcbiAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgIHdpZHRoOiBjYW52YXMud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGNhbnZhcy5oZWlnaHQsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dCA9IG5ldyBEZWJvdW5jZXIoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdGhpcy52cC53aWR0aCwgdGhpcy52cC5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0ID0gdGhpcy5kZWJvdW5jZUxheW91dC5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5jaGlsZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdGhpcy52cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3REcmF3ID0gdGhpcy5kZWJvdW5jZURyYXcuYm91bmNlO1xuXG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQgPSAoZTogRWxlbWVudDxhbnksIGFueT4pID0+IHtcbiAgICAgICAgICAgIGxldCBmb3VuZFRhcmdldCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50b3VjaFRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gZSkge1xuICAgICAgICAgICAgICAgICAgICBlLnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChrLCBUQVJHRVRfTk9ORSk7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kVGFyZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZvdW5kVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aXZlIHRvdWNoIGZvciBkZXRhY2hlZCBlbGVtZW50XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoU3RhcnQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcDogUG9pbnQyRCA9IFt0LmNsaWVudFgsIHQuY2xpZW50WV07XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuY2hpbGQsIHApO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCBUQVJHRVRfUk9PVCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciB0byBhY3RpdmUgdGFyZ2V0cyBtYXAgc28gd2Uga25vdyBhbmJvdXQgaXQuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbG93IGRlZmF1bHQgYWN0aW9uLCBzbyBlLmcuIHBhZ2UgY2FuIGJlIHNjcm9sbGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKHQuaWRlbnRpZmllciwgcCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgLy8gU29tZSB0YXJnZXQgd2FzIHNvbWUgZm9yIGF0IGxlYXN0IHNvbWUgb2YgdGhlIHRvdWNoZXMuIERvbid0IGxldCBhbnl0aGluZ1xuICAgICAgICAgICAgICAgIC8vIGluIEhUTUwgZ2V0IHRoaXMgdG91Y2guXG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hNb3ZlID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzLCBBcnJheTxUb3VjaE1vdmU+PigpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggbW92ZSB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIGFzIHRoZSByb290IGVsZW1lbnQgY2FuJ3Qgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBkbyBhbnl0aGluZywgdGFyZ2V0IHByb2JhYmx5IGRlbGV0ZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHQuaWRlbnRpZmllcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IFt0LmNsaWVudFgsIHQuY2xpZW50WV0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0YXJnZXQsIHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0cywgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaEVuZCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IG5ldyBNYXAodGhpcy50b3VjaFRhcmdldHMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbW92ZWQuZGVsZXRlKHQuaWRlbnRpZmllcikgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW2lkLCB0YXJnZXRdIG9mIHJlbW92ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IFRBUkdFVF9ST09UICYmIHRhcmdldCAhPT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcblxuICAgICAgICB0aGlzLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnJlc2l6ZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VEcmF3LmNsZWFyKCk7XG4gICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQuY2xlYXIoKTtcbiAgICAgICAgY2FsbERldGFjaExpc3RlbmVycyh0aGlzLmNoaWxkKTtcblxuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBFbGVtZW50Q29udGV4dCBmdW5jdGlvbnNcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgcmVxdWVzdERyYXc6ICgpID0+IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dDogKCkgPT4gdm9pZDtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBUb3VjaEhhbmRsZXIgZnVuY3Rpb25zXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIFRPRE86IGFkZCBUb3VjaEZvcndhcmRlciBoZXJlLiBpbnN0YWxsIHRvdWNoIGhhbmRsZXJzXG59O1xuXG4vLyBUT0RPOiBIYXZlIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiAoc28gaGlkZSBjaGlsZHJlbiwgYW5kIGZvcndhcmQgdGFwL3Bhbi9kcmF3IG1hbnVhbGx5LCB3aXRoIHRyYW5zZm9ybSlcbi8vIFRPRE86IE1ha2UgaXQgem9vbVxuLy8gVE9ETzogbWF5YmUgaGF2ZSB0d28gZWxlbWVudHM/IGEgdmlld3BvcnQgYW5kIGEgSFNXUyB3aXRoIGFic29sdXRlbHkgcG9zaXRpb25lZCBjaGlsZHJlbiBhbmQgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXNcblxuLy8gVE9ETzogY29udmVydCB0byB1c2UgQWZmaW5lIHRyYW5zZm9ybS5cblxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQ+IHtcbiAgICAvLyBTY3JvbGxMYXlvdXQgaGFzIHRvIGludGVyY2VwdCBhbGwgZXZlbnRzIHRvIG1ha2Ugc3VyZSBhbnkgbG9jYXRpb25zIGFyZSB1cGRhdGVkIGJ5XG4gICAgLy8gdGhlIHNjcm9sbCBwb3NpdGlvbiwgc28gY2hpbGQgaXMgdW5kZWZpbmVkLCBhbmQgYWxsIGV2ZW50cyBhcmUgZm9yd2FyZGVkIHRvIHNjcm9sbGVyLlxuICAgIHNjcm9sbGVyOiBXU0hTTGF5b3V0PGFueT47XG4gICAgc2Nyb2xsOiBQb2ludDJEO1xuICAgIHpvb206IG51bWJlcjtcbiAgICB6b29tTWF4OiBudW1iZXI7XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldHM6IE1hcDxudW1iZXIsIEhhc1RvdWNoSGFuZGxlcnMgfCBUQVJHRVRfUk9PVCB8IFRBUkdFVF9OT05FPjtcbiAgICBwcml2YXRlIHRvdWNoU2Nyb2xsOiBNYXA8bnVtYmVyLCB7IHByZXY6IFBvaW50MkQsIGN1cnI6IFBvaW50MkQgfT47XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldERldGFjaGVkOiBPbkRldGFjaEhhbmRsZXI7XG5cbiAgICBwcml2YXRlIHVwZGF0ZVNjcm9sbCgpIHtcbiAgICAgICAgY29uc3QgdHMgPSBbLi4udGhpcy50b3VjaFNjcm9sbC52YWx1ZXMoKV07XG4gICAgICAgIGlmICh0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSB0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnAyYyh0LnByZXYpO1xuICAgICAgICAgICAgY29uc3QgYyA9IHRoaXMucDJjKHQuY3Vycik7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwWzBdIC0gY1swXTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzFdICs9IHBbMV0gLSBjWzFdO1xuICAgICAgICB9IGVsc2UgaWYgKHRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgY29uc3QgcG0gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLnByZXZbMF0gKyB0c1sxXS5wcmV2WzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlsxXSArIHRzWzFdLnByZXZbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBjb25zdCBwZCA9IHBvaW50RGlzdGFuY2UodHNbMF0ucHJldiwgdHNbMV0ucHJldik7XG4gICAgICAgICAgICBjb25zdCBjZCA9IHBvaW50RGlzdGFuY2UodHNbMF0uY3VyciwgdHNbMV0uY3Vycik7XG4gICAgICAgICAgICB0aGlzLnpvb20gKj0gY2QgLyBwZDtcbiAgICAgICAgICAgIC8vIENsYW1wIHpvb20gc28gd2UgY2FuJ3Qgem9vbSBvdXQgdG9vIGZhci5cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbGVyLndpZHRoIDwgdGhpcy53aWR0aCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMud2lkdGggLyB0aGlzLnNjcm9sbGVyLndpZHRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IDwgdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLmhlaWdodCAvIHRoaXMuc2Nyb2xsZXIuaGVpZ2h0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuem9vbSA+IHRoaXMuem9vbU1heCkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuem9vbU1heDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNtID0gdGhpcy5wMmMoW1xuICAgICAgICAgICAgICAgICh0c1swXS5jdXJyWzBdICsgdHNbMV0uY3VyclswXSkgKiAwLjUsXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMV0gKyB0c1sxXS5jdXJyWzFdKSAqIDAuNSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMF0gKz0gcG1bMF0gLSBjbVswXTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzFdICs9IHBtWzFdIC0gY21bMV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zY3JvbGxbMF0gPSBjbGFtcCh0aGlzLnNjcm9sbFswXSwgMCwgdGhpcy5zY3JvbGxlci53aWR0aCAtIHRoaXMud2lkdGggLyB0aGlzLnpvb20pO1xuICAgICAgICB0aGlzLnNjcm9sbFsxXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzFdLCAwLCB0aGlzLnNjcm9sbGVyLmhlaWdodCAtIHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHAyYyhwOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgICAgIGNvbnN0IHMgPSB0aGlzLnNjcm9sbDtcbiAgICAgICAgY29uc3Qgc2hyaW5rID0gMSAvIHRoaXMuem9vbTtcbiAgICAgICAgLy8gVE9ETzogdGFrZSBwYXJlbnQgcmVjdCBpbnRvIGFjY291bnRcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIChwWzBdIC0gdGhpcy5sZWZ0KSAqIHNocmluayArIHNbMF0sXG4gICAgICAgICAgICAocFsxXSAtIHRoaXMudG9wKSAqIHNocmluayArIHNbMV0sXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Piwgc2Nyb2xsOiBQb2ludDJELCB6b29tOiBudW1iZXIsIHpvb21NYXg6IG51bWJlcikge1xuICAgICAgICAvLyBUT0RPOiBtaW4gem9vbTtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlciA9IGNoaWxkO1xuICAgICAgICB0aGlzLnNjcm9sbCA9IHNjcm9sbDtcbiAgICAgICAgdGhpcy56b29tID0gem9vbTtcbiAgICAgICAgdGhpcy56b29tTWF4ID0gem9vbU1heDtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTY3JvbGwgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCA9IChlOiBFbGVtZW50PGFueSwgYW55PikgPT4ge1xuICAgICAgICAgICAgbGV0IGZvdW5kVGFyZ2V0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRvdWNoVGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGlmICh2ID09PSBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGUucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmRUYXJnZXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZm91bmRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3RpdmUgdG91Y2ggZm9yIGRldGFjaGVkIGVsZW1lbnRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLmxlZnQsIHRoaXMudG9wKTtcbiAgICAgICAgICAgIC8vIENsaXAgdG8gU2Nyb2xsIHZpZXdwb3J0LlxuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbygwLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oMCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmNsaXAoKTtcbiAgICAgICAgICAgIGN0eC5zY2FsZSh0aGlzLnpvb20sIHRoaXMuem9vbSk7XG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKC10aGlzLnNjcm9sbFswXSwgLXRoaXMuc2Nyb2xsWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IHZwU2Nyb2xsZXIgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogdGhpcy5zY3JvbGxbMF0sXG4gICAgICAgICAgICAgICAgdG9wOiB0aGlzLnNjcm9sbFsxXSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCAvIHRoaXMuem9vbSxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuc2Nyb2xsZXIsIGVjLCB2cFNjcm9sbGVyKTtcbiAgICAgICAgICAgIC8vIFRPRE86IHJlc3RvcmUgdHJhbnNmb3JtIGluIGEgZmluYWxseT9cbiAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNwID0gdGhpcy5wMmMocHApO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuc2Nyb2xsZXIsIGNwKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciBudWxsIHRvIGFjdGl2ZSB0b3VjaGVzLCBzbyB3ZSBrbm93IHRoZXkgc2hvdWxkIHNjcm9sbC5cbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaWQsIFRBUkdFVF9ST09UKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoU2Nyb2xsLnNldChpZCwgeyBwcmV2OiBwcCwgY3VycjogcHAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcihpZCwgY3AsIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVycywgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIG1vdmUgSUQgJHt0LmlkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY3JvbGwgPSB0aGlzLnRvdWNoU2Nyb2xsLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjcm9sbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aCBJRCAke3QuaWR9IGhhcyB0YXJnZXQgPT09IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzY3JvbGwucHJldiA9IHNjcm9sbC5jdXJyO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwuY3VyciA9IHQucDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHR0cy5wdXNoKHQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHR0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgc2Nyb2xsIHBvc2l0aW9uLlxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGwoKTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzW2ldID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHR0c1tpXS5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IHRoaXMucDJjKHR0c1tpXS5wKSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIGVjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIGVuZCBJRCAke2lkfWApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnRvdWNoU2Nyb2xsLmRlbGV0ZShpZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBlbmQgSUQgJHtpZH0gaGFzIHRhcmdldCBUQVJHRVRfUk9PVCwgYnV0IGlzIG5vdCBpbiB0b3VjaFNjcm9sbGApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgIC8vIERvIG5vdGhpbmcsIHRhcmV0IHdhcyBkZWxldGVkLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIGVjKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IG90aGVyIGhhbmRsZXJzIG5lZWQgZm9yd2FyZGluZy5cbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxlci5sYXlvdXQoMCwgMCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gU2Nyb2xsKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4sIHNjcm9sbD86IFBvaW50MkQsIHpvb20/OiBudW1iZXIsIHpvb21NYXg/OiBudW1iZXIpOiBTY3JvbGxMYXlvdXQge1xuICAgIC8vIE5COiBzY2FsZSBvZiAwIGlzIGludmFsaWQgYW55d2F5cywgc28gaXQncyBPSyB0byBiZSBmYWxzeS5cbiAgICByZXR1cm4gbmV3IFNjcm9sbExheW91dChjaGlsZCwgc2Nyb2xsIHx8IFswLCAwXSwgem9vbSB8fCAxLCB6b29tTWF4IHx8IDEwKTtcbn1cblxuLy8gVE9ETzogc2Nyb2xseCwgc2Nyb2xseVxuXG5jbGFzcyBCb3hMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgIH1cbn07XG5cbmNsYXNzIEJveFdpdGhDaGlsZExheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8V1BIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOldQSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3god2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkPzogV1BIUExheW91dDxhbnk+KTogV1NIU0xheW91dDxhbnk+IHtcbiAgICBpZiAoY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbmV3IEJveFdpdGhDaGlsZExheW91dCh3aWR0aCwgaGVpZ2h0LCBjaGlsZCk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQm94TGF5b3V0KHdpZHRoLCBoZWlnaHQpO1xufVxuXG5jbGFzcyBXUEhQQm9yZGVyTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXUEhQTGF5b3V0PGFueT4+IHtcbiAgICBib3JkZXI6IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXUEhQTGF5b3V0PGFueT4sIGJvcmRlcjogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICAgICAgdGhpcy5ib3JkZXIgPSBib3JkZXI7XG4gICAgICAgIHRoaXMuc3R5bGUgPSBzdHlsZTtcblxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjb25zdCBiMiA9IGIgKiAwLjU7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSB0aGlzLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IHRoaXMuYm9yZGVyO1xuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyBiMiwgYm94LnRvcCArIGIyLCBib3gud2lkdGggLSBiLCBib3guaGVpZ2h0IC0gYik7XG4gICAgICAgIH07XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQgKyBiLCB0b3AgKyBiLCB3aWR0aCAtIGIgKiAyLCBoZWlnaHQgLSBiICogMik7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gQm9yZGVyKHdpZHRoOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIGNoaWxkOiBXUEhQTGF5b3V0PGFueT4pOiBXUEhQTGF5b3V0PGFueT4ge1xuICAgIHJldHVybiBuZXcgV1BIUEJvcmRlckxheW91dChjaGlsZCwgd2lkdGgsIHN0eWxlKTtcbn1cblxuY2xhc3MgRmlsbExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8dW5kZWZpbmVkPiB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZpbGwoKTogRmlsbExheW91dCB7XG4gICAgcmV0dXJuIG5ldyBGaWxsTGF5b3V0KCk7XG59XG5cbmNsYXNzIENlbnRlckxheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIENlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+KTogQ2VudGVyTGF5b3V0IHtcbiAgICByZXR1cm4gbmV3IENlbnRlckxheW91dChjaGlsZCk7XG59XG5cbmNsYXNzIEhDZW50ZXJIUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIEhDZW50ZXJIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBIQ2VudGVySFNMYXlvdXQ7XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcihjaGlsZDogV1NIUExheW91dDxhbnk+KTogSENlbnRlckhQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXIoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55Pik6IEhDZW50ZXJIU0xheW91dCB8IEhDZW50ZXJIUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIUExheW91dChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIQ2VudGVySFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgVkNlbnRlcldQTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxXUEhTTGF5b3V0PGFueT4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1BIU0xheW91dDxhbnk+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCwgd2lkdGgpO1xuICAgIH1cbn07XG5cbmNsYXNzIFZDZW50ZXJXU0xheW91dCBleHRlbmRzIFdTSFBMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSBjaGlsZC53aWR0aDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcihjaGlsZDogV1NIU0xheW91dDxhbnk+KTogVkNlbnRlcldTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXIoY2hpbGQ6IFdQSFNMYXlvdXQ8YW55Pik6IFZDZW50ZXJXUExheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXUEhTTGF5b3V0PGFueT4pOiBWQ2VudGVyV1NMYXlvdXQgfCBWQ2VudGVyV1BMYXlvdXQge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3BocycpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1BMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIExlZnRIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmNsYXNzIExlZnRTdGFja0xheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1NIUExheW91dDxhbnk+Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkcmVuOiBTdGF0aWNBcnJheTxXU0hQTGF5b3V0PGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5jaGlsZDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkLndpZHRoO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuY2xhc3MgTGVmdEZsZXhMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGRyZW46IFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5jaGlsZDtcbiAgICAgICAgbGV0IHNpemVTdW0gPSAwO1xuICAgICAgICBsZXQgZ3Jvd1N1bSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIHNpemVTdW0gKz0gY2hpbGQuc2l6ZTtcbiAgICAgICAgICAgIGdyb3dTdW0gKz0gY2hpbGQuZ3JvdztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHRyYSA9IHdpZHRoIC0gc2l6ZVN1bTtcbiAgICAgICAgbGV0IGNoaWxkTGVmdCA9IGxlZnQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGNvbnN0IGNoaWxkV2lkdGggPSBjaGlsZC5zaXplICsgY2hpbGQuZ3JvdyAqIGV4dHJhIC8gZ3Jvd1N1bTtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgY2hpbGRXaWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIGNoaWxkTGVmdCArPSBjaGlsZC5zaXplO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDogV1NIU0xheW91dDxhbnk+KTogV1BIU0xheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQwOiBXU0hQTGF5b3V0PGFueT4sIC4uLmNoaWxkUmVzdDogQXJyYXk8V1NIUExheW91dDxhbnk+Pik6IFdQSFBMYXlvdXQ8YW55PjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkMDogRmxleExheW91dCwgLi4uY2hpbGRSZXN0OiBBcnJheTxGbGV4TGF5b3V0Pik6IFdQSFBMYXlvdXQ8YW55PjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4gfCBGbGV4TGF5b3V0LCAuLi5fOiBBcnJheTxXU0hQTGF5b3V0PGFueT4+IHwgQXJyYXk8RmxleExheW91dD4pOiBXUEhTTGF5b3V0PGFueT4gfCBXUEhQTGF5b3V0PGFueT4ge1xuICAgIHN3aXRjaCAoY2hpbGQubGF5b3V0VHlwZSkge1xuICAgICAgICBjYXNlICdmbGV4JzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdEZsZXhMYXlvdXQoYXJndW1lbnRzKTtcbiAgICAgICAgY2FzZSAnd3NocCc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IExlZnRTdGFja0xheW91dChhcmd1bWVudHMpO1xuICAgICAgICBjYXNlICd3c2hzJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdEhTTGF5b3V0KGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIFJpZ2h0SFBMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFBMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IHdpZHRoIC0gY2hpbGQud2lkdGg7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIFJpZ2h0SFNMYXlvdXQgZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55Pj4ge1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGQpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IHdpZHRoIC0gY2hpbGQud2lkdGg7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIU0xheW91dDxhbnk+KTogUmlnaHRIU0xheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIUExheW91dDxhbnk+KTogUmlnaHRIUExheW91dDtcbmV4cG9ydCBmdW5jdGlvbiBSaWdodChjaGlsZDogV1NIU0xheW91dDxhbnk+IHwgV1NIUExheW91dDxhbnk+KTogUmlnaHRIU0xheW91dCB8IFJpZ2h0SFBMYXlvdXQge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3NocCcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBSaWdodEhQTGF5b3V0KGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFJpZ2h0SFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gRGVidWdUb3VjaCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdHJva2U6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybik6IEJveExheW91dCB7XG4gICAgY29uc3QgdGFwczogQXJyYXk8UG9pbnQyRD4gPSBbXTtcbiAgICBjb25zdCBwYW5zOiBBcnJheTxBcnJheTxQYW5Qb2ludD4+ID0gW107XG4gICAgcmV0dXJuIEJveChcbiAgICAgICAgd2lkdGgsXG4gICAgICAgIGhlaWdodCxcbiAgICApLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsO1xuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHJva2U7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgICAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgZm9yIChjb25zdCB0YXAgb2YgdGFwcykge1xuICAgICAgICAgICAgY3R4Lm1vdmVUbyh0YXBbMF0gKyAxNiwgdGFwWzFdKTtcbiAgICAgICAgICAgIGN0eC5lbGxpcHNlKHRhcFswXSwgdGFwWzFdLCAxNiwgMTYsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IHBzIG9mIHBhbnMpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgICAgIGN0eC5tb3ZlVG8ocC5wcmV2WzBdLCBwLnByZXZbMV0pO1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8ocC5jdXJyWzBdLCBwLmN1cnJbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9KS5vblRhcCgocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIHRhcHMucHVzaChwKTtcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KS5vblBhbigocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIHBhbnMucHVzaChwcyk7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSk7XG59XG5cbi8vIFRPRE86IFRvcCwgQm90dG9tXG5cbmNsYXNzIExheWVyTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueT4+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGRyZW46IFN0YXRpY0FycmF5PFdQSFBMYXlvdXQ8YW55Pj4pIHtcbiAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTGF5ZXIoLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55Pj4pOiBMYXllckxheW91dCB7XG4gICAgcmV0dXJuIG5ldyBMYXllckxheW91dChjaGlsZHJlbik7XG59XG5cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uTGF5b3V0IGV4dGVuZHMgRWxlbWVudDxcInBvc1wiLCBXUEhQTGF5b3V0PGFueT4gfCB1bmRlZmluZWQ+IHtcbiAgICByZXF1ZXN0TGVmdDogbnVtYmVyO1xuICAgIHJlcXVlc3RUb3A6IG51bWJlcjtcbiAgICByZXF1ZXN0V2lkdGg6IG51bWJlcjtcbiAgICByZXF1ZXN0SGVpZ2h0OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55PiB8IHVuZGVmaW5lZCkge1xuICAgICAgICBzdXBlcihcInBvc1wiLCBjaGlsZCk7XG4gICAgICAgIHRoaXMucmVxdWVzdExlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJlcXVlc3RUb3AgPSB0b3A7XG4gICAgICAgIHRoaXMucmVxdWVzdFdpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMucmVxdWVzdEhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KHBhcmVudDogTGF5b3V0Qm94KSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RXaWR0aCwgcGFyZW50LndpZHRoKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gY2xhbXAodGhpcy5yZXF1ZXN0TGVmdCwgcGFyZW50LmxlZnQsIHBhcmVudC5sZWZ0ICsgcGFyZW50LndpZHRoIC0gdGhpcy53aWR0aCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0SGVpZ2h0LCBwYXJlbnQuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy50b3AgPSBjbGFtcCh0aGlzLnJlcXVlc3RUb3AsIHBhcmVudC50b3AsIHBhcmVudC50b3AgKyBwYXJlbnQuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KHRoaXMubGVmdCwgdGhpcy50b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vIFRPRE86IHN1cHBvcnQgc3RhdGljYWxseSBzaXplZCBjaGlsZHJlbiwgXG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkPzogV1BIUExheW91dDxhbnk+KSB7XG4gICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGNoaWxkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERyYWdnYWJsZShsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueT4pIHtcbiAgICBjb25zdCBsYXlvdXQgPSBuZXcgUG9zaXRpb25MYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCBjaGlsZCk7XG4gICAgcmV0dXJuIGxheW91dC5vblBhbigocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGxldCBkeCA9IDA7XG4gICAgICAgIGxldCBkeSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgZHggKz0gcC5jdXJyWzBdIC0gcC5wcmV2WzBdO1xuICAgICAgICAgICAgZHkgKz0gcC5jdXJyWzFdIC0gcC5wcmV2WzFdO1xuICAgICAgICB9XG4gICAgICAgIGR4IC89IHBzLmxlbmd0aDtcbiAgICAgICAgZHkgLz0gcHMubGVuZ3RoO1xuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgKz0gZHg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wICs9IGR5O1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSkub25QYW5FbmQoKCkgPT4ge1xuICAgICAgICAvLyBUaGUgcmVxdWVzdGVkIGxvY2F0aW9uIGNhbiBiZSBvdXRzaWRlIHRoZSBhbGxvd2VkIGJvdW5kcyBpZiBkcmFnZ2VkIG91dHNpZGUsXG4gICAgICAgIC8vIGJ1dCBvbmNlIHRoZSBkcmFnIGlzIG92ZXIsIHdlIHdhbnQgdG8gcmVzZXQgaXQgc28gdGhhdCBpdCBkb2Vzbid0IHN0YXJ0IHRoZXJlXG4gICAgICAgIC8vIG9uY2UgYSBuZXcgZHJhZyBzdGFydC5cbiAgICAgICAgbGF5b3V0LnJlcXVlc3RMZWZ0ID0gbGF5b3V0LmxlZnQ7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wID0gbGF5b3V0LnRvcDtcbiAgICB9KTtcbn1cblxuXG4vLyBUT0RPOiBkb2VzIGl0IG1ha2Ugc2Vuc2UgdG8gbWFrZSBvdGhlciBsYXlvdXQgdHlwZXM/XG4vLyBjbGFzcyBXU0hTUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuLy8gICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+KSB7XG4vLyAgICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbi8vICAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuLy8gICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbi8vICAgICB9XG4vLyAgICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbi8vICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbi8vICAgICAgICAgdGhpcy50b3AgPSB0b3A7XG5cbi8vICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4vLyAgICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuLy8gICAgICAgICB9XG4vLyAgICAgfVxuLy8gfTtcblxuY2xhc3MgV1BIUFJlbGF0aXZlTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4+IHtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZHJlbjogU3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+KSB7XG4gICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KHRoaXMgLyogTGF5b3V0Qm94ICovKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFJlbGF0aXZlKC4uLmNoaWxkcmVuOiBBcnJheTxQb3NpdGlvbkxheW91dD4pOiBXUEhQUmVsYXRpdmVMYXlvdXQge1xuICAgIHJldHVybiBuZXcgV1BIUFJlbGF0aXZlTGF5b3V0KGNoaWxkcmVuKTtcbn1cbiJdfQ==