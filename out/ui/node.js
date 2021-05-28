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
        this.onTouchMoveHandler = (ts, ec, state) => {
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
        this.onTouchEndHandler = (id, ec, state) => {
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
    constructor(layoutType, state, child) {
        this.layoutType = layoutType;
        this.child = child;
        this.left = NaN;
        this.top = NaN;
        this.width = NaN;
        this.height = NaN;
        this.state = state;
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
                handler(e, e.state);
            }
        }
        else if (e.onDetachHandler !== undefined) {
            e.onDetachHandler(e, e.state);
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
    constructor(state, child) {
        super('wphp', state, child);
    }
}
;
class WPHSLayout extends Element {
    constructor(state, child) {
        super('wphs', state, child);
    }
}
;
class WSHPLayout extends Element {
    constructor(state, child) {
        super('wshp', state, child);
    }
}
;
class WSHSLayout extends Element {
    constructor(state, child) {
        super('wshs', state, child);
    }
}
;
function drawElementTree(ctx, root, ec, vp) {
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop();
        if (e.onDrawHandler) {
            e.onDrawHandler(ctx, e, ec, vp, e.state);
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
                    target.onTouchBeginHandler(t.identifier, p, this /* ElementContext */, target.state);
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
                target.onTouchMoveHandler(ts, this /* ElementContext */, target.state);
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
}
;
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: convert to use Affine transform.
class ScrollLayout extends WPHPLayout {
    constructor(child, scroll, zoom, zoomMax) {
        super(undefined, undefined);
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
                target.onTouchBeginHandler(id, cp, ec, target.state);
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
                target.onTouchMoveHandler(tts, ec, target.state);
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
                    target.onTouchEndHandler(id, ec, target.state);
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
    constructor(width, height, state, child) {
        super(state, child);
        this.width = width;
        this.height = height;
    }
    layout(left, top) {
        this.left = left;
        this.top = top;
        if (this.child !== undefined) {
            this.child.layout(left, top, this.width, this.height);
        }
    }
}
;
export function Box(width, height, first, second) {
    if (second === undefined) {
        if (first === undefined) {
            return new BoxLayout(width, height, undefined, undefined);
        }
        else if (first instanceof Element) {
            return new BoxLayout(width, height, undefined, first);
        }
        else {
            return new BoxLayout(width, height, first, undefined);
        }
    }
    else {
        return new BoxLayout(width, height, first, second);
        // TODO: the state should type-check.
    }
}
class WPHPBorderLayout extends WPHPLayout {
    constructor(child, border, style, state) {
        super(state, child);
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
export function Border(width, style, child, state) {
    if (state === undefined) {
        return new WPHPBorderLayout(child, width, style, undefined);
    }
    else {
        return new WPHPBorderLayout(child, width, style, state);
    }
}
class FillLayout extends WPHPLayout {
    constructor(state) {
        super(state, undefined);
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }
}
export function Fill(state) {
    if (state === undefined) {
        return new FillLayout(undefined);
    }
    else {
        return new FillLayout(state);
    }
}
class CenterLayout extends WPHPLayout {
    constructor(state, child) {
        super(state, child);
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
export function Center(child, state) {
    return new CenterLayout(state, child);
}
class HCenterHPLayout extends WPHPLayout {
    constructor(state, child) {
        super(state, child);
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
    constructor(state, child) {
        super(state, child);
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
export function HCenter(child, state) {
    if (child.layoutType === 'wshp') {
        return new HCenterHPLayout(state, child);
    }
    else {
        return new HCenterHSLayout(state, child);
    }
}
class VCenterWPLayout extends WPHPLayout {
    constructor(state, child) {
        super(state, child);
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
    constructor(state, child) {
        super(state, child);
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
export function VCenter(child, state) {
    if (child.layoutType === 'wphs') {
        return new VCenterWPLayout(state, child);
    }
    else {
        return new VCenterWSLayout(state, child);
    }
}
class FlexLayout extends Element {
    constructor(size, grow, state, child) {
        super('flex', state, child);
        this.size = size;
        this.grow = grow;
    }
    layout(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
        if (this.child !== undefined) {
            this.child.layout(left, top, width, height);
        }
    }
}
;
export function Flex(size, grow, first, second) {
    if (first !== undefined) {
        if (second !== undefined) {
            return new FlexLayout(size, grow, first, second);
        }
        else if (first instanceof WPHPLayout) {
            return new FlexLayout(size, grow, undefined, first);
        }
        else {
            return new FlexLayout(size, grow, first, undefined);
        }
    }
    else {
        return new FlexLayout(size, grow, undefined, undefined);
    }
}
class LeftFlexLayout extends WPHPLayout {
    constructor(state, children) {
        super(state, children);
    }
    layout(left, top, width, height) {
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
}
;
export function Left(first, ...children) {
    if (first instanceof FlexLayout) {
        return new LeftFlexLayout(undefined, [first, ...children]);
    }
    else {
        return new LeftFlexLayout(first, children);
    }
}
class BottomFlexLayout extends WPHPLayout {
    constructor(state, children) {
        super(state, children);
    }
    layout(left, top, width, height) {
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
export function Bottom(first, ...children) {
    if (first instanceof FlexLayout) {
        return new BottomFlexLayout(undefined, [first, ...children]);
    }
    else {
        return new BottomFlexLayout(first, children);
    }
}
function debugTouchOnDraw(ctx, box, _ec, _vp, state) {
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
function debugTouchOnTap(p, ec, state) {
    state.taps.push(p);
    ec.requestDraw();
}
function debugTouchOnPan(ps, ec, state) {
    state.pans.push(ps);
    ec.requestDraw();
}
export function DebugTouch(width, height, fill, stroke) {
    const state = {
        fill,
        stroke,
        taps: [],
        pans: [],
    };
    return Box(width, height, state)
        .onDraw(debugTouchOnDraw)
        .onTap(debugTouchOnTap)
        .onPan(debugTouchOnPan);
}
class LayerLayout extends WPHPLayout {
    constructor(state, children) {
        super(state, children);
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
export function Layer(first, ...children) {
    if (first instanceof Element) {
        return new LayerLayout(undefined, [first, ...children]);
    }
    return new LayerLayout(first, children);
}
function muxElements(enabled, es) {
    const res = [];
    for (const [k, v] of es) {
        if (enabled.has(k)) {
            res.push(v);
        }
    }
    return res;
}
class MuxLayout extends WPHPLayout {
    constructor(enabled, children) {
        super(undefined, muxElements(enabled, children));
        this.enabled = enabled;
        this.mux = children;
    }
    toggle(disable, enable, ec) {
        for (const k of disable) {
            this.enabled.delete(k);
        }
        for (const k of enable) {
            this.enabled.add(k);
        }
        this.child = muxElements(this.enabled, this.mux);
        ec.requestLayout();
    }
    set(ec, ...enable) {
        this.enabled = new Set(enable);
        this.child = muxElements(this.enabled, this.mux);
        ec.requestLayout();
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
// TODO: have the keys used in Mux be part of the type.
export function Mux(enabled, ...children) {
    return new MuxLayout(new Set(enabled), children);
}
export class PositionLayout extends Element {
    constructor(left, top, width, height, state, child) {
        super("pos", state, child);
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
export function Position(left, top, width, height, first, second) {
    if (second === undefined) {
        if (first === undefined) {
            return new PositionLayout(left, top, width, height, undefined, undefined);
        }
        else if (first instanceof Element) {
            return new PositionLayout(left, top, width, height, undefined, first);
        }
        else {
            return new PositionLayout(left, top, width, height, first, undefined);
        }
    }
    else {
        return new PositionLayout(left, top, width, height, first, second);
    }
}
export function Draggable(left, top, width, height, child) {
    const layout = new PositionLayout(left, top, width, height, undefined, child);
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
    constructor(state, children) {
        super(state, children);
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
export function Relative(first, ...children) {
    if (first instanceof Element) {
        return new WPHPRelativeLayout(undefined, [first, ...children]);
    }
    return new WPHPRelativeLayout(first, children);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBZW5ELENBQUM7QUFvQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBWWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxLQUFZLEVBQUUsRUFBRTtZQUM1RSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDaEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLENBQUMsSUFBSSxTQUFTLEVBQUU7b0JBQ2hCLDhEQUE4RDtvQkFDOUQsSUFBSSxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7d0JBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs0QkFDaEIsSUFBSSxFQUFFLENBQUM7NEJBQ1AsSUFBSSxFQUFFLENBQUMsRUFBSyxpRUFBaUU7eUJBQ2hGLENBQUMsQ0FBQztxQkFDTjtpQkFDSjtnQkFDRCxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxLQUFLLFNBQVMsRUFBRTtvQkFDakIsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixLQUFLLFNBQVMsRUFBRTt3QkFDOUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztxQkFDckM7b0JBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTt3QkFDaEIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO3dCQUNaLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztxQkFDWixDQUFDLENBQUM7aUJBQ047YUFDSjtZQUNELElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO2dCQUN2RCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO2FBQ3pEO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsRUFBVSxFQUFFLEVBQWtCLEVBQUUsS0FBWSxFQUFFLEVBQUU7WUFDdEUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO2dCQUNwRCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDbkM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2QixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLFNBQVMsRUFBRTtnQkFDcEYsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDbkM7UUFDTCxDQUFDLENBQUM7SUFDTixDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBT0QsQ0FBQztBQUlGLFNBQVMsZ0JBQWdCLENBQVEsQ0FBMkI7SUFDeEQsSUFBSSxDQUFDLENBQUMsWUFBWSxLQUFLLFNBQVMsRUFBRTtRQUM5QixPQUFPLENBQUMsQ0FBQyxZQUFZLENBQUM7S0FDekI7SUFDRCxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxDQUFDLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO1FBQ2hILE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztLQUN0RDtJQUNELE1BQU0sRUFBRSxHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7SUFDOUIsQ0FBQyxDQUFDLG1CQUFtQixHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQztJQUMvQyxDQUFDLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDO0lBQzdDLENBQUMsQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLENBQUMsaUJBQWlCLENBQUM7SUFDM0MsT0FBTyxFQUFFLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyxLQUFLLENBQUMsQ0FBUyxFQUFFLEdBQVcsRUFBRSxHQUFXO0lBQzlDLElBQUksQ0FBQyxHQUFHLEdBQUcsRUFBRTtRQUNULE9BQU8sR0FBRyxDQUFDO0tBQ2Q7U0FBTSxJQUFJLENBQUMsR0FBRyxHQUFHLEVBQUU7UUFDaEIsT0FBTyxHQUFHLENBQUM7S0FDZDtTQUFNO1FBQ0gsT0FBTyxDQUFDLENBQUM7S0FDWjtBQUNMLENBQUM7QUFFRCxNQUFNLE9BQU87SUFTVCxZQUFZLFVBQXNCLEVBQUUsS0FBWSxFQUFFLEtBQVk7UUFDMUQsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztRQUNsQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUN2QixDQUFDO0lBR0QsTUFBTSxDQUFDLE9BQTZCO1FBQ2hDLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxTQUFTLEVBQUU7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1NBQ3pDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUM7UUFDN0IsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQU9ELEtBQUssQ0FBQyxPQUE0QjtRQUM5QixJQUFJLENBQUMsWUFBWSxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNDLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFO1lBQzlDLE1BQU0sSUFBSSxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztTQUN4QztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQztRQUN6QyxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBQ0QsS0FBSyxDQUFDLE9BQTRCO1FBQzlCLElBQUksQ0FBQyxZQUFZLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0MsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksS0FBSyxTQUFTLEVBQUU7WUFDOUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1NBQ3hDO1FBQ0QsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEdBQUcsT0FBTyxDQUFDO1FBQ3pDLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxVQUFVLENBQUMsT0FBb0M7UUFDM0MsSUFBSSxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO1lBQ25ELE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztTQUM3QztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLEdBQUcsT0FBTyxDQUFDO1FBQzlDLE9BQU8sSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFDRCxRQUFRLENBQUMsT0FBb0M7UUFDekMsSUFBSSxDQUFDLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxLQUFLLFNBQVMsRUFBRTtZQUNqRCxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7U0FDM0M7UUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsR0FBRyxPQUFPLENBQUM7UUFDNUMsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUdELFFBQVEsQ0FBQyxPQUErQjtRQUNwQyxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssT0FBTyxFQUFFO1lBQ3hFLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxDQUFDO1NBQ2xDO2FBQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRTtZQUM1QyxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDM0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDdEM7U0FDSjthQUFNO1lBQ0gsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7U0FDMUQ7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNoQixDQUFDO0lBQ0QsY0FBYyxDQUFDLE9BQStCO1FBQzFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDckMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNSLDRFQUE0RTtnQkFDNUUsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7YUFDakU7U0FDSjthQUFNLElBQUksSUFBSSxDQUFDLGVBQWUsS0FBSyxPQUFPLEVBQUU7WUFDekMsSUFBSSxDQUFDLGVBQWUsR0FBRyxTQUFTLENBQUM7U0FDcEM7SUFDTCxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxVQUFVLFFBQVEsQ0FBQyxDQUF5RCxFQUFFLEtBQTZCLEVBQUUsRUFBa0IsRUFBRSxLQUFjO0lBQ2pKLE1BQU0sUUFBUSxHQUFHLElBQUksS0FBSyxDQUF5QixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN2RSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDVixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDVixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUM1QixJQUFJLENBQUMsS0FBSyxLQUFLLEVBQUU7WUFDYixRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUM7U0FDekI7UUFDRCxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzlCO0lBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ1QsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztLQUN2QjtJQUNELENBQUMsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO0lBQ25CLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztBQUN2QixDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxJQUE0QjtJQUNyRCxNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JCLE9BQU8sS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDckIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBNEIsQ0FBQztRQUNoRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxFQUFFO1lBQ2xDLEtBQUssTUFBTSxPQUFPLElBQUksQ0FBQyxDQUFDLGVBQWUsRUFBRTtnQkFDckMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdkI7U0FDSjthQUFNLElBQUksQ0FBQyxDQUFDLGVBQWUsS0FBSyxTQUFTLEVBQUU7WUFDeEMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ2pDO1FBQ0QsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRTtZQUN2QixzQ0FBc0M7U0FDekM7YUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDMUI7YUFBTTtZQUNILEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3ZCO0tBQ0o7QUFDTCxDQUFDO0FBRUQsTUFBTSxVQUFVLFdBQVcsQ0FBQyxDQUF5RCxFQUFFLEtBQWEsRUFBRSxFQUFrQjtJQUNwSCxNQUFNLFFBQVEsR0FBRyxJQUFJLEtBQUssQ0FBeUIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEtBQUssRUFBRTtZQUNiLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNuQzthQUFNO1lBQ0gsUUFBUSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUM5QjtLQUNKO0lBQ0QsQ0FBQyxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7SUFDbkIsRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDO0FBQ3ZCLENBQUM7QUFFRCxNQUFlLFVBQXNELFNBQVEsT0FBNkI7SUFDdEcsWUFBWSxLQUFZLEVBQUUsS0FBWTtRQUNsQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoQyxDQUFDO0NBRUo7QUFBQSxDQUFDO0FBRUYsTUFBZSxVQUFzRCxTQUFRLE9BQTZCO0lBQ3RHLFlBQVksS0FBWSxFQUFFLEtBQVk7UUFDbEMsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDaEMsQ0FBQztDQUVKO0FBQUEsQ0FBQztBQUVGLE1BQWUsVUFBc0QsU0FBUSxPQUE2QjtJQUN0RyxZQUFZLEtBQVksRUFBRSxLQUFZO1FBQ2xDLEtBQUssQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FFSjtBQUFBLENBQUM7QUFFRixNQUFlLFVBQXNELFNBQVEsT0FBNkI7SUFDdEcsWUFBWSxLQUFZLEVBQUUsS0FBWTtRQUNsQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoQyxDQUFDO0NBRUo7QUFBQSxDQUFDO0FBS0YsU0FBUyxlQUFlLENBQUMsR0FBNkIsRUFBRSxJQUE0QixFQUFFLEVBQWtCLEVBQUUsRUFBYTtJQUNuSCxNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3JCLE9BQU8sS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDckIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBNEIsQ0FBQztRQUNoRCxJQUFJLENBQUMsQ0FBQyxhQUFhLEVBQUU7WUFDakIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQzVDO1FBQ0QsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRTtZQUN2QixzQ0FBc0M7U0FDekM7YUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ2pDLGdEQUFnRDtZQUNoRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUMxQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUMxQjtTQUNKO2FBQU07WUFDSCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN2QjtLQUNKO0FBQ0wsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQUMsR0FBNkIsRUFBRSxJQUE0QixFQUFFLEVBQWtCLEVBQUUsRUFBYTtJQUMzSCxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQztJQUN4QixHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzRCxlQUFlLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDdkMsQ0FBQztBQVFELE1BQU0sU0FBUztJQUlYLFlBQVksQ0FBYTtRQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNmLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxTQUFTLEVBQUU7Z0JBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtvQkFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7b0JBQ3pCLENBQUMsRUFBRSxDQUFDO2dCQUNSLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUNUO1FBQ0wsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELEtBQUs7UUFDRCxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxFQUFFO1lBQzVCLFlBQVksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7U0FDNUI7SUFDTCxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsU0FBUyxlQUFlLENBQUMsSUFBNEIsRUFBRSxDQUFVO0lBQzdELE1BQU0sS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2YsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2YsT0FBTyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUNyQixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUE0QixDQUFDO1FBQ2hELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFO1lBQzNFLHFCQUFxQjtZQUNyQixTQUFTO1NBQ1o7UUFDRCxJQUFJLENBQUMsQ0FBQyxtQkFBbUIsS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxDQUFDLENBQUMsaUJBQWlCLEtBQUssU0FBUyxFQUFFO1lBQ2hILE9BQU8sQ0FBMEIsQ0FBQyxDQUFDLGtEQUFrRDtTQUN4RjtRQUNELElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUU7WUFDdkIsc0NBQXNDO1NBQ3pDO2FBQU0sSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNqQywwREFBMEQ7WUFDMUQsOEVBQThFO1lBQzlFLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDMUI7YUFBTTtZQUNILEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ3ZCO0tBQ0o7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNyQixDQUFDO0FBR0QsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXRCLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV0QixNQUFNLE9BQU8sVUFBVTtJQWlCbkIsWUFBWSxNQUF5QixFQUFFLEtBQTJCO1FBQzlELElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBQyxDQUFDLENBQUM7UUFDcEQsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1NBQy9DO1FBQ0QsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksY0FBYyxDQUFDLENBQUMsT0FBOEIsRUFBRSxFQUFFO1lBQ2hFLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsdUNBQXVDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2FBQzVFO1lBQ0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztZQUN2QyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ25CLEVBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQ1osRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDWCxFQUFFLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDekIsRUFBRSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFBO1lBQzFCLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7WUFDbEQsTUFBTSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztZQUNwRCxHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFNUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUIsdUJBQXVCLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUMsR0FBRyxFQUFFLDBCQUEwQixFQUFDLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsRUFBRSxHQUFHO1lBQ04sSUFBSSxFQUFFLENBQUM7WUFDUCxHQUFHLEVBQUUsQ0FBQztZQUNOLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSztZQUNuQixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07U0FDeEIsQ0FBQztRQUVGLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ3JDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdkIsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBRWhELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ25DLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDO1FBRTVDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxDQUF5QixFQUFFLEVBQUU7WUFDckQsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLEtBQUssTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFO2dCQUNwQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQ1QsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDM0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUN0QyxXQUFXLEdBQUcsSUFBSSxDQUFDO2lCQUN0QjthQUNKO1lBQ0QsSUFBSSxDQUFDLFdBQVcsRUFBRTtnQkFDZCxNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7YUFDM0Q7UUFDTCxDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBZSxFQUFFLEVBQUU7WUFDbEMsSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBQzNCLEtBQUssTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLE9BQU8sRUFBRTtnQkFDekIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7b0JBQ3RCLGNBQWMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLFNBQVM7aUJBQ1o7Z0JBQ0QsTUFBTSxDQUFDLEdBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQ2pELDhEQUE4RDtvQkFDOUQsc0RBQXNEO2lCQUN6RDtxQkFBTTtvQkFDSCxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUN0QixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM1QyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUMxQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDeEY7YUFDSjtZQUNELElBQUksY0FBYyxFQUFFO2dCQUNoQiw0RUFBNEU7Z0JBQzVFLDBCQUEwQjtnQkFDMUIsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO2FBQ3hCO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLEdBQWUsRUFBRSxFQUFFO1lBQ2pDLElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztZQUMzQixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBMkMsQ0FBQztZQUNuRSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxPQUFPLEVBQUU7Z0JBQ3pCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbkQsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFO29CQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztpQkFDbkU7cUJBQU0sSUFBSSxNQUFNLEtBQUssV0FBVyxFQUFFO29CQUMvQix1REFBdUQ7aUJBQzFEO3FCQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsRUFBRTtvQkFDL0IsOENBQThDO2lCQUNqRDtxQkFBTTtvQkFDSCxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUN0QixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDckMsRUFBRSxDQUFDLElBQUksQ0FBQzt3QkFDSixFQUFFLEVBQUUsQ0FBQyxDQUFDLFVBQVU7d0JBQ2hCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQztxQkFDNUIsQ0FBQyxDQUFDO29CQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2lCQUMzQjthQUNKO1lBQ0QsS0FBSyxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxJQUFJLE9BQU8sRUFBRTtnQkFDaEMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzFFO1lBQ0QsSUFBSSxjQUFjLEVBQUU7Z0JBQ2hCLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQzthQUN4QjtRQUNMLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxHQUFlLEVBQUUsRUFBRTtZQUNoQyxJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7WUFDM0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzNDLEtBQUssTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLE9BQU8sRUFBRTtnQkFDekIsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxLQUFLLEVBQUU7b0JBQ3hDLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO2lCQUNsRTthQUNKO1lBQ0QsS0FBSyxNQUFNLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxJQUFJLE9BQU8sRUFBRTtnQkFDaEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzdCLElBQUksTUFBTSxLQUFLLFdBQVcsSUFBSSxNQUFNLEtBQUssV0FBVyxFQUFFO29CQUNsRCxjQUFjLEdBQUcsSUFBSSxDQUFDO29CQUN0QixNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUNoRCxNQUFNLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7aUJBQ3pFO2FBQ0o7WUFDRCxJQUFJLGNBQWMsRUFBRTtnQkFDaEIsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO2FBQ3hCO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUVELFVBQVU7UUFDTixJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1QixtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6RSxDQUFDO0NBWUo7QUFBQSxDQUFDO0FBRUYsNEdBQTRHO0FBQzVHLHlDQUF5QztBQUV6QyxNQUFNLFlBQWEsU0FBUSxVQUFnQztJQTBEdkQsWUFBWSxLQUEyQixFQUFFLE1BQWUsRUFBRSxJQUFZLEVBQUUsT0FBZTtRQUNuRixLQUFLLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBeUIsRUFBRSxFQUFFO1lBQ3JELElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQztZQUN4QixLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtnQkFDcEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO29CQUNULENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7b0JBQzNDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQztvQkFDdEMsV0FBVyxHQUFHLElBQUksQ0FBQztpQkFDdEI7YUFDSjtZQUNELElBQUksQ0FBQyxXQUFXLEVBQUU7Z0JBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO2FBQzNEO1FBQ0wsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQTZCLEVBQUUsSUFBZSxFQUFFLEVBQWtCLEVBQUUsR0FBYyxFQUFFLEVBQUU7WUFDeEcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBRVgsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQywyQkFBMkI7WUFDM0IsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxQixHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoRCxNQUFNLFVBQVUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3BCLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUk7Z0JBQzdCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJO2FBQ2xDLENBQUM7WUFDRixlQUFlLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ3BELHdDQUF3QztZQUN4QyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbEIsQ0FBQyxDQUFDO1FBRUYsSUFBSSxDQUFDLG1CQUFtQixHQUFHLENBQUMsRUFBVSxFQUFFLEVBQVcsRUFBRSxFQUFrQixFQUFFLEVBQUU7WUFDdkUsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNsRCxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7Z0JBQ3RCLHlFQUF5RTtnQkFDekUsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUN2QyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ3BEO2lCQUFNO2dCQUNILElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN4RDtRQUNMLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLEVBQW9CLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQ25FLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUEyQyxDQUFDO1lBQ25FLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO2dCQUNoQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzNDLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtvQkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7aUJBQ3BEO3FCQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsRUFBRTtvQkFDL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUMxQyxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7d0JBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxFQUFFLHdEQUF3RCxDQUFDLENBQUE7cUJBQ3RHO29CQUNELE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDMUIsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUNyQjtxQkFBTSxJQUFJLE1BQU0sS0FBSyxXQUFXLEVBQUU7b0JBQy9CLHFDQUFxQztpQkFDeEM7cUJBQU07b0JBQ0gsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3RDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7aUJBQzVCO2FBQ0o7WUFFRCwwQkFBMEI7WUFDMUIsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBRXBCLHVCQUF1QjtZQUN2QixLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFFO2dCQUNqQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDakMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHO3dCQUNMLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDYixDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUN4QixDQUFDO2lCQUNMO2dCQUNELE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUNwRDtZQUNELEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxFQUFVLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1lBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3pDLElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtnQkFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUNqRDtpQkFBTSxJQUFJLE1BQU0sS0FBSyxXQUFXLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRTtvQkFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxvREFBb0QsQ0FBQyxDQUFDO2lCQUMzRjthQUNKO2lCQUFNLElBQUksTUFBTSxLQUFLLFdBQVcsRUFBRTtnQkFDL0IsaUNBQWlDO2FBQ3BDO2lCQUFNO2dCQUNILElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLE1BQU0sQ0FBQyxpQkFBaUIsS0FBSyxTQUFTLEVBQUU7b0JBQ3hDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDbEQ7YUFDSjtRQUNMLENBQUMsQ0FBQztRQUNGLHdDQUF3QztJQUM1QyxDQUFDO0lBbktPLFlBQVk7UUFDaEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUMxQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ2pCLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ2pDO2FBQU0sSUFBSSxFQUFFLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO2dCQUNoQixDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUc7Z0JBQ3JDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRzthQUN4QyxDQUFDLENBQUM7WUFDSCxNQUFNLEVBQUUsR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakQsTUFBTSxFQUFFLEdBQUcsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUNyQiwyQ0FBMkM7WUFDM0MsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQzlDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQzthQUNoRDtZQUNELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7YUFDbEQ7WUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRTtnQkFDMUIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO2FBQzVCO1lBQ0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztnQkFDaEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHO2dCQUNyQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUc7YUFDeEMsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNuQztRQUNELElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlGLENBQUM7SUFFTyxHQUFHLENBQUMsQ0FBVTtRQUNsQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQ3RCLE1BQU0sTUFBTSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQzdCLHNDQUFzQztRQUN0QyxPQUFPO1lBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNwQyxDQUFDO0lBQ04sQ0FBQztJQXdIRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvQixDQUFDO0NBQ0o7QUFFRCxNQUFNLFVBQVUsTUFBTSxDQUFDLEtBQTJCLEVBQUUsTUFBZ0IsRUFBRSxJQUFhLEVBQUUsT0FBZ0I7SUFDakcsNkRBQTZEO0lBQzdELE9BQU8sSUFBSSxZQUFZLENBQUMsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQztBQUMvRSxDQUFDO0FBRUQseUJBQXlCO0FBRXpCLE1BQU0sU0FBaUUsU0FBUSxVQUF3QjtJQUNuRyxZQUFZLEtBQWEsRUFBRSxNQUFjLEVBQUUsS0FBWSxFQUFFLEtBQVk7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXO1FBQzVCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRTtZQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ3pEO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQU1GLE1BQU0sVUFBVSxHQUFHLENBQVEsS0FBYSxFQUFFLE1BQWMsRUFBRSxLQUFvQyxFQUFFLE1BQTZCO0lBQ3pILElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUN0QixJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUU7WUFDckIsT0FBTyxJQUFJLFNBQVMsQ0FBdUIsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDbkY7YUFBTSxJQUFJLEtBQUssWUFBWSxPQUFPLEVBQUU7WUFDakMsT0FBTyxJQUFJLFNBQVMsQ0FBa0MsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDMUY7YUFBTTtZQUNILE9BQU8sSUFBSSxTQUFTLENBQW1CLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1NBQzNFO0tBQ0o7U0FBTTtRQUNILE9BQU8sSUFBSSxTQUFTLENBQThCLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3pGLHFDQUFxQztLQUN4QztBQUNMLENBQUM7QUFFRCxNQUFNLGdCQUF3QixTQUFRLFVBQXVDO0lBR3pFLFlBQVksS0FBMkIsRUFBRSxNQUFjLEVBQUUsS0FBOEMsRUFBRSxLQUFZO1FBQ2pILEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFFbkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEVBQUU7WUFDbkUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQ25CLEdBQUcsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztZQUM3QixHQUFHLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7WUFDNUIsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsRUFBRSxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9FLENBQUMsQ0FBQztJQUNOLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDdEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztDQUNKO0FBRUQsTUFBTSxVQUFVLE1BQU0sQ0FBUSxLQUFhLEVBQUUsS0FBOEMsRUFBRSxLQUEyQixFQUFFLEtBQWE7SUFDbkksSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO1FBQ3JCLE9BQU8sSUFBSSxnQkFBZ0IsQ0FBWSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztLQUMxRTtTQUFNO1FBQ0gsT0FBTyxJQUFJLGdCQUFnQixDQUFRLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQ2xFO0FBQ0wsQ0FBQztBQUVELE1BQU0sVUFBa0IsU0FBUSxVQUE0QjtJQUN4RCxZQUFZLEtBQVk7UUFDcEIsS0FBSyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN6QixDQUFDO0NBQ0o7QUFJRCxNQUFNLFVBQVUsSUFBSSxDQUFRLEtBQWE7SUFDckMsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO1FBQ3JCLE9BQU8sSUFBSSxVQUFVLENBQVksU0FBUyxDQUFDLENBQUM7S0FDL0M7U0FBTTtRQUNILE9BQU8sSUFBSSxVQUFVLENBQVEsS0FBSyxDQUFDLENBQUM7S0FDdkM7QUFDTCxDQUFDO0FBRUQsTUFBTSxZQUFvQixTQUFRLFVBQXVDO0lBQ3JFLFlBQVksS0FBWSxFQUFFLEtBQTJCO1FBQ2pELEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7UUFDckQsTUFBTSxRQUFRLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFckQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxVQUFVLE1BQU0sQ0FBb0IsS0FBMkIsRUFBRSxLQUFZO0lBQy9FLE9BQU8sSUFBSSxZQUFZLENBQVEsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2pELENBQUM7QUFFRCxNQUFNLGVBQXVCLFNBQVEsVUFBdUM7SUFDeEUsWUFBWSxLQUFZLEVBQUUsS0FBMkI7UUFDakQsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN6QixNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUVyRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN6QyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBRUYsTUFBTSxlQUF1QixTQUFRLFVBQXVDO0lBQ3hFLFlBQVksS0FBWSxFQUFFLEtBQTJCO1FBQ2pELEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO0lBQy9CLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhO1FBQzNDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUM7UUFFckQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUVuQixLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0o7QUFBQSxDQUFDO0FBSUYsTUFBTSxVQUFVLE9BQU8sQ0FBb0IsS0FBa0QsRUFBRSxLQUFZO0lBQ3ZHLElBQUksS0FBSyxDQUFDLFVBQVUsS0FBSyxNQUFNLEVBQUU7UUFDN0IsT0FBTyxJQUFJLGVBQWUsQ0FBUSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDbkQ7U0FBTTtRQUNILE9BQU8sSUFBSSxlQUFlLENBQVEsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQ25EO0FBQ0wsQ0FBQztBQUVELE1BQU0sZUFBdUIsU0FBUSxVQUF1QztJQUN4RSxZQUFZLEtBQVksRUFBRSxLQUEyQjtRQUNqRCxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3pCLE1BQU0sUUFBUSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBRXJELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hDLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFFRixNQUFNLGVBQXVCLFNBQVEsVUFBdUM7SUFDeEUsWUFBWSxLQUFZLEVBQUUsS0FBMkI7UUFDakQsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNwQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDN0IsQ0FBQztJQUVELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLE1BQWM7UUFDNUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUN6QixNQUFNLFFBQVEsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUVyRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFJRixNQUFNLFVBQVUsT0FBTyxDQUFvQixLQUFrRCxFQUFFLEtBQVk7SUFDdkcsSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLE1BQU0sRUFBRTtRQUM3QixPQUFPLElBQUksZUFBZSxDQUFRLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztLQUNuRDtTQUFNO1FBQ0gsT0FBTyxJQUFJLGVBQWUsQ0FBUSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDbkQ7QUFDTCxDQUFDO0FBRUQsTUFBTSxVQUFrRSxTQUFRLE9BQTZCO0lBR3pHLFlBQVksSUFBWSxFQUFFLElBQVksRUFBRSxLQUFZLEVBQUUsS0FBWTtRQUM5RCxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNyQixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVcsRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDMUQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssU0FBUyxFQUFFO1lBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQy9DO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQU1GLE1BQU0sVUFBVSxJQUFJLENBQVEsSUFBWSxFQUFFLElBQVksRUFBRSxLQUFvQyxFQUFFLE1BQTZCO0lBQ3ZILElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRTtRQUNyQixJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7WUFDdEIsT0FBTyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztTQUNwRDthQUFNLElBQUksS0FBSyxZQUFZLFVBQVUsRUFBRTtZQUNwQyxPQUFPLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3ZEO2FBQU07WUFDSCxPQUFPLElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1NBQ3ZEO0tBQ0o7U0FBTTtRQUNILE9BQU8sSUFBSSxVQUFVLENBQXVCLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0tBQ2pGO0FBQ0wsQ0FBQztBQUVELE1BQU0sY0FBc0IsU0FBUSxVQUFvRDtJQUNwRixZQUFZLEtBQVksRUFBRSxRQUEyQztRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNoQixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3hCLE9BQU8sSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDO1NBQ3JCO1FBQ0QsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLElBQUksS0FBSyxHQUFHLE1BQU0sR0FBRyxPQUFPLENBQUM7UUFDN0IsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3hCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDeEIsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsRUFBRTtnQkFDZCxVQUFVLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDO2FBQzFDO1lBQ0QsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM3QyxTQUFTLElBQUksVUFBVSxDQUFDO1NBQzNCO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQUlGLE1BQU0sVUFBVSxJQUFJLENBQVEsS0FBbUMsRUFBRSxHQUFHLFFBQXFDO0lBQ3JHLElBQUksS0FBSyxZQUFZLFVBQVUsRUFBRTtRQUM3QixPQUFPLElBQUksY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUM7S0FDOUQ7U0FBTTtRQUNILE9BQU8sSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0tBQzlDO0FBQ0wsQ0FBQztBQUVELE1BQU0sZ0JBQXdCLFNBQVEsVUFBb0Q7SUFDdEYsWUFBWSxLQUFZLEVBQUUsUUFBMkM7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUN4QixPQUFPLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNsQixPQUFPLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQztTQUNyQjtRQUNELElBQUksUUFBUSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUM7UUFDNUIsSUFBSSxLQUFLLEdBQUcsTUFBTSxHQUFHLE9BQU8sQ0FBQztRQUM3QixLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDeEIsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUN6QixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFO2dCQUNkLFdBQVcsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUM7YUFDM0M7WUFDRCxRQUFRLElBQUksV0FBVyxDQUFDO1lBQ3hCLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLENBQUM7U0FDaEQ7SUFDTCxDQUFDO0NBQ0o7QUFJRCxNQUFNLFVBQVUsTUFBTSxDQUFRLEtBQW1DLEVBQUUsR0FBRyxRQUFxQztJQUN2RyxJQUFJLEtBQUssWUFBWSxVQUFVLEVBQUU7UUFDN0IsT0FBTyxJQUFJLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUM7S0FDaEU7U0FBTTtRQUNILE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7S0FDaEQ7QUFDTCxDQUFDO0FBU0QsU0FBUyxnQkFBZ0IsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxHQUFtQixFQUFFLEdBQWMsRUFBRSxLQUFzQjtJQUNoSSxHQUFHLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDM0IsR0FBRyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO0lBQy9CLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZELEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDMUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUMxRDtJQUNELEtBQUssTUFBTSxFQUFFLElBQUksS0FBSyxDQUFDLElBQUksRUFBRTtRQUN6QixLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDcEM7S0FDSjtJQUNELEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUNqQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsQ0FBVSxFQUFFLEVBQWtCLEVBQUUsS0FBc0I7SUFDM0UsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkIsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxFQUFtQixFQUFFLEVBQWtCLEVBQUUsS0FBc0I7SUFDcEYsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDcEIsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxNQUFNLFVBQVUsVUFBVSxDQUFDLEtBQWEsRUFBRSxNQUFjLEVBQUUsSUFBNkMsRUFBRSxNQUErQztJQUNwSixNQUFNLEtBQUssR0FBRztRQUNWLElBQUk7UUFDSixNQUFNO1FBQ04sSUFBSSxFQUFFLEVBQUU7UUFDUixJQUFJLEVBQUUsRUFBRTtLQUNYLENBQUM7SUFDRixPQUFPLEdBQUcsQ0FBa0IsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUM7U0FDNUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1NBQ3hCLEtBQUssQ0FBQyxlQUFlLENBQUM7U0FDdEIsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFFRCxNQUFNLFdBQW1CLFNBQVEsVUFBb0Q7SUFDakYsWUFBWSxLQUFZLEVBQUUsUUFBMkM7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDNUIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztTQUMxQztJQUNMLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFJRixNQUFNLFVBQVUsS0FBSyxDQUFRLEtBQW1DLEVBQUUsR0FBRyxRQUFxQztJQUN0RyxJQUFJLEtBQUssWUFBWSxPQUFPLEVBQUU7UUFDMUIsT0FBTyxJQUFJLFdBQVcsQ0FBWSxTQUFTLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDO0tBQ3RFO0lBQ0QsT0FBTyxJQUFJLFdBQVcsQ0FBUSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQUlELFNBQVMsV0FBVyxDQUFDLE9BQW9CLEVBQUUsRUFBeUM7SUFDaEYsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ2YsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUNyQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEIsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNmO0tBQ0o7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLFNBQVUsU0FBUSxVQUF3RDtJQUk1RSxZQUFZLE9BQW9CLEVBQUUsUUFBK0M7UUFDN0UsS0FBSyxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLEdBQUcsR0FBRyxRQUFRLENBQUM7SUFDeEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFzQixFQUFFLE1BQXFCLEVBQUUsRUFBa0I7UUFDcEUsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUU7WUFDckIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDMUI7UUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRTtZQUNwQixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN2QjtRQUNELElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRUQsR0FBRyxDQUFDLEVBQWtCLEVBQUUsR0FBRyxNQUFxQjtRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQy9CLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRUQsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDNUIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztTQUMxQztJQUNMLENBQUM7Q0FDSjtBQUFBLENBQUM7QUFFRix1REFBdUQ7QUFDdkQsTUFBTSxVQUFVLEdBQUcsQ0FBQyxPQUFzQixFQUFFLEdBQUcsUUFBK0M7SUFDMUYsT0FBTyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBRUQsTUFBTSxPQUFPLGNBQXNFLFNBQVEsT0FBNEI7SUFNbkgsWUFBWSxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjLEVBQUUsS0FBWSxFQUFFLEtBQVk7UUFDNUYsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUM7UUFDdEIsSUFBSSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7UUFDMUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUM7SUFDaEMsQ0FBQztJQUNELE1BQU0sQ0FBQyxNQUFpQjtRQUNwQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXhGLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUU7WUFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQ25FO0lBQ0wsQ0FBQztDQUNKO0FBQUEsQ0FBQztBQU9GLE1BQU0sVUFBVSxRQUFRLENBQVEsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYyxFQUFFLEtBQW9DLEVBQUUsTUFBNkI7SUFDekosSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFO1FBQ3RCLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRTtZQUNyQixPQUFPLElBQUksY0FBYyxDQUF1QixJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1NBQ25HO2FBQU0sSUFBSSxLQUFLLFlBQVksT0FBTyxFQUFFO1lBQ2pDLE9BQU8sSUFBSSxjQUFjLENBQWtDLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDMUc7YUFBTTtZQUNILE9BQU8sSUFBSSxjQUFjLENBQW1CLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDM0Y7S0FDSjtTQUFNO1FBQ0gsT0FBTyxJQUFJLGNBQWMsQ0FBOEIsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztLQUM1RztBQUNMLENBQUM7QUFFRCxNQUFNLFVBQVUsU0FBUyxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWMsRUFBRSxLQUE0QjtJQUM1RyxNQUFNLE1BQU0sR0FBRyxJQUFJLGNBQWMsQ0FBaUIsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5RixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFtQixFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUM1RCxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDWCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNoQixFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDL0I7UUFDRCxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQztRQUNoQixFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQztRQUNoQixNQUFNLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQztRQUN6QixNQUFNLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztRQUN4QixFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLCtFQUErRTtRQUMvRSxnRkFBZ0Y7UUFDaEYseUJBQXlCO1FBQ3pCLE1BQU0sQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNqQyxNQUFNLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDbkMsQ0FBQyxDQUFDLENBQUM7QUFDUCxDQUFDO0FBR0QsdURBQXVEO0FBQ3ZELDZFQUE2RTtBQUM3RSwwRkFBMEY7QUFDMUYsMkJBQTJCO0FBQzNCLDhCQUE4QjtBQUM5QixnQ0FBZ0M7QUFDaEMsUUFBUTtBQUNSLGdEQUFnRDtBQUNoRCw0QkFBNEI7QUFDNUIsMEJBQTBCO0FBRTFCLDRDQUE0QztBQUM1QyxrREFBa0Q7QUFDbEQsWUFBWTtBQUNaLFFBQVE7QUFDUixLQUFLO0FBRUwsTUFBTSxrQkFBMEIsU0FBUSxVQUF3RDtJQUM1RixZQUFZLEtBQVksRUFBRSxRQUErQztRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUN0QztJQUNMLENBQUM7Q0FDSjtBQUdELE1BQU0sVUFBVSxRQUFRLENBQVEsS0FBdUMsRUFBRSxHQUFHLFFBQXlDO0lBQ2pILElBQUksS0FBSyxZQUFZLE9BQU8sRUFBRTtRQUMxQixPQUFPLElBQUksa0JBQWtCLENBQVksU0FBUyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQztLQUM3RTtJQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBUSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIERpY2sgMjAyMVxuXG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcblxuZXhwb3J0IHR5cGUgTGF5b3V0Qm94ID0ge1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogUmVwbGFjZSB1c2Ugb2YgYW55IHdpdGggdW5rbm93bi5cbi8vIFRPRE86IFBhc3MgRWxlbWVudENvbnRleHQgYWxvbmcgd2l0aCBsYXlvdXQsIHNvIHRoYXQgd2UgY2FuIGhhdmUgZHluYW1pYyBsYXlvdXRzLlxuXG5leHBvcnQgaW50ZXJmYWNlIEVsZW1lbnRDb250ZXh0IHtcbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZDtcbn07XG5cbnR5cGUgUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+ID0gKGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgT25EZXRhY2hIYW5kbGVyPFN0YXRlPiA9IChlOiBFbGVtZW50PGFueSwgYW55LCBTdGF0ZT4sIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRHJhd0hhbmRsZXI8U3RhdGU+ID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5cbnR5cGUgT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT4gPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG50eXBlIFRvdWNoTW92ZSA9IHtcbiAgICByZWFkb25seSBpZDogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHA6IFBvaW50MkQ7XG59O1xudHlwZSBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+ID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbnR5cGUgT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+ID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBPblRhcEhhbmRsZXI8U3RhdGU+ID0gKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgUGFuUG9pbnQgPSB7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcbmV4cG9ydCB0eXBlIE9uUGFuSGFuZGxlcjxTdGF0ZT4gPSAocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG4vLyBUT0RPOiBQYXNzIHRvdWNoIHNpemUgZG93biB3aXRoIHRvdWNoIGV2ZW50cyAoaW5zdGVhZCBvZiBzY2FsZT8pXG4vLyBJcyB0aGF0IGVub3VnaD8gUHJvYmFibHkgd2Ugd2lsbCBhbHdheXMgd2FudCBhIHRyYW5zb2Zvcm1hdGlvbiBtYXRyaXguXG4vLyBCdXQgZW5vdWdoIGZvciBub3csIHNvIGp1c3QgZG8gdGhhdC5cblxuY2xhc3MgVG91Y2hHZXN0dXJlPFN0YXRlPiB7XG4gICAgb25UYXBIYW5kbGVyPzogT25UYXBIYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkhhbmRsZXI/OiBPblBhbkhhbmRsZXI8U3RhdGU+O1xuICAgIG9uUGFuQmVnaW5IYW5kbGVyPzogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+O1xuICAgIG9uUGFuRW5kSGFuZGxlcj86IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPjtcblxuICAgIHByaXZhdGUgYWN0aXZlOiBNYXA8bnVtYmVyLCBQb2ludDJEPjtcbiAgICBwcml2YXRlIHBhbnM6IE1hcDxudW1iZXIsIFBhblBvaW50PjtcbiAgICByZWFkb25seSBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICByZWFkb25seSBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT47XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMucGFucyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIF86IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5zZXQoaWQsIHApO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogVG91Y2hNb3ZlW10sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChhICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBwYXNzIGluIGRpc3RhbmNlIHRocmVzaG9sZD8gU2NhbGUgYmFzZSBvbiB0cmFuc2Zvcm1zP1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnREaXN0YW5jZShhLCB0LnApID49IDE2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IGEsICAgIC8vIFVzZSB0aGUgc3RhcnQgcG9pbnQgaGVyZSwgc28gdGhlIGZpcnN0IG1vdmUgaXMgZnJvbSB0aGUgc3RhcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wYW5zLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAocCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25QYW5CZWdpbkhhbmRsZXIoZWMsIHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IHAuY3VycixcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IHQucCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5zaXplID4gMCAmJiB0aGlzLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblBhbkhhbmRsZXIoWy4uLnRoaXMucGFucy52YWx1ZXMoKV0sIGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSB0aGlzLmFjdGl2ZS5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKGEgIT09IHVuZGVmaW5lZCAmJiB0aGlzLm9uVGFwSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblRhcEhhbmRsZXIoYSwgZWMsIHN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLmRlbGV0ZShpZCkgJiYgdGhpcy5wYW5zLnNpemUgPT09IDAgJiYgdGhpcy5vblBhbkVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25QYW5FbmRIYW5kbGVyKGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcblxuLy8gU28gdGhhdCB3ZSBjYW4gdGFrZSBJQXJndW1lbnRzIGFzIGNoaWxkcmVuXG5pbnRlcmZhY2UgU3RhdGljQXJyYXk8VD4ge1xuICAgIFtpbmRleDogbnVtYmVyXTogVDtcbiAgICBsZW5ndGg6IG51bWJlcjtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+O1xufTtcblxudHlwZSBDaGlsZENvbnN0cmFpbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZz4gPSBFbGVtZW50PExheW91dFR5cGUsIGFueSwgYW55PiB8IFN0YXRpY0FycmF5PEVsZW1lbnQ8TGF5b3V0VHlwZSwgYW55LCBhbnk+PiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaW5pdFRvdWNoR2VzdHVyZTxTdGF0ZT4oZTogRWxlbWVudDxhbnksIGFueSwgU3RhdGU+KTogVG91Y2hHZXN0dXJlPFN0YXRlPiB7XG4gICAgaWYgKGUudG91Y2hHZXN0dXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGUudG91Y2hHZXN0dXJlO1xuICAgIH1cbiAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgfHwgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUb3VjaCBnZXN0dXJlcyBhbHJlYWR5IGNhcHR1cmVkJyk7XG4gICAgfVxuICAgIGNvbnN0IHRnID0gbmV3IFRvdWNoR2VzdHVyZSgpO1xuICAgIGUub25Ub3VjaEJlZ2luSGFuZGxlciA9IHRnLm9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgZS5vblRvdWNoTW92ZUhhbmRsZXIgPSB0Zy5vblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgZS5vblRvdWNoRW5kSGFuZGxlciA9IHRnLm9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIHJldHVybiB0Zztcbn1cblxuZnVuY3Rpb24gY2xhbXAoeDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh4IDwgbWluKSB7XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfSBlbHNlIGlmICh4ID4gbWF4KSB7XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxufVxuXG5jbGFzcyBFbGVtZW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmcsIENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PHN0cmluZz4sIFN0YXRlPiB7XG4gICAgbGF5b3V0VHlwZTogTGF5b3V0VHlwZTtcbiAgICBjaGlsZDogQ2hpbGQ7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHRvcDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgc3RhdGU6IFN0YXRlO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgdGhpcy5sYXlvdXRUeXBlID0gbGF5b3V0VHlwZTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNoaWxkO1xuICAgICAgICB0aGlzLmxlZnQgPSBOYU47XG4gICAgICAgIHRoaXMudG9wID0gTmFOO1xuICAgICAgICB0aGlzLndpZHRoID0gTmFOO1xuICAgICAgICB0aGlzLmhlaWdodCA9IE5hTjtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIH1cblxuICAgIG9uRHJhd0hhbmRsZXI/OiBPbkRyYXdIYW5kbGVyPFN0YXRlPjtcbiAgICBvbkRyYXcoaGFuZGxlcjogT25EcmF3SGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI/OiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyPzogT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+O1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlPFN0YXRlPjtcbiAgICBvblRhcChoYW5kbGVyOiBPblRhcEhhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uVGFwIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25UYXBIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuKGhhbmRsZXI6IE9uUGFuSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5CZWdpbihoYW5kbGVyOiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5CZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbkJlZ2luIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5CZWdpbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5FbmQoaGFuZGxlcjogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuRW5kIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb25EZXRhY2hIYW5kbGVyPzogT25EZXRhY2hIYW5kbGVyPFN0YXRlPiB8IEFycmF5PE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4+O1xuICAgIG9uRGV0YWNoKGhhbmRsZXI6IE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSB1bmRlZmluZWQgfHwgdGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IGhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRoaXMub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyLmluZGV4T2YoaGFuZGxlcikgPCAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIucHVzaChoYW5kbGVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gW3RoaXMub25EZXRhY2hIYW5kbGVyLCBoYW5kbGVyXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcmVtb3ZlT25EZXRhY2goaGFuZGxlcjogT25EZXRhY2hIYW5kbGVyPFN0YXRlPik6IHZvaWQge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSB0aGlzLm9uRGV0YWNoSGFuZGxlci5pbmRleE9mKGhhbmRsZXIpO1xuICAgICAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgICAgIC8vIENvcHkgdGhlIGFycmF5LCBzbyB0aGF0IGl0J3Mgc2FmZSB0byBjYWxsIHRoaXMgaW5zaWRlIGFuIE9uRGV0YWNoSGFuZGxlci5cbiAgICAgICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IFsuLi50aGlzLm9uRGV0YWNoSGFuZGxlcl0uc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSBoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGNoaWxkOiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIGluZGV4PzogbnVtYmVyKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBuZXcgQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4oZS5jaGlsZC5sZW5ndGggKyAxKTtcbiAgICBsZXQgaSA9IDA7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAoOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuW2orK10gPSBjaGlsZDtcbiAgICAgICAgfVxuICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICB9XG4gICAgaWYgKGogPT09IGkpIHtcbiAgICAgICAgY2hpbGRyZW5bal0gPSBjaGlsZDtcbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xuICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbn1cblxuZnVuY3Rpb24gY2FsbERldGFjaExpc3RlbmVycyhyb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGUub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBoYW5kbGVyIG9mIGUub25EZXRhY2hIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChlLm9uRGV0YWNoSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBlLm9uRGV0YWNoSGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5lLmNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGluZGV4OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+KGUuY2hpbGQubGVuZ3RoIC0gMSk7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnMoZS5jaGlsZFtpXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG4gICAgZWMucmVxdWVzdExheW91dCgpO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBXUEhQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHAnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocCcsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHMnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocycsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocycsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hzJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IHR5cGUgTGF5b3V0SGFzV2lkdGhBbmRIZWlnaHQgPSBXU0hTTGF5b3V0PGFueSwgYW55PjtcbmV4cG9ydCB0eXBlIExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQgPSBXUEhQTGF5b3V0PGFueSwgYW55PjtcblxuZnVuY3Rpb24gZHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueSwgYW55PjtcbiAgICAgICAgaWYgKGUub25EcmF3SGFuZGxlcikge1xuICAgICAgICAgICAgZS5vbkRyYXdIYW5kbGVyKGN0eCwgZSwgZWMsIHZwLCBlLnN0YXRlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBsYXN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSBkcmF3IGl0IGxhc3QuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gZS5jaGlsZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjbGVhckFuZERyYXdFbGVtZW50VHJlZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgcm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3Qocm9vdC5sZWZ0LCByb290LnRvcCwgcm9vdC53aWR0aCwgcm9vdC5oZWlnaHQpO1xuICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHJvb3QsIGVjLCB2cCk7XG59XG5cbnR5cGUgSGFzVG91Y2hIYW5kbGVyczxTdGF0ZT4gPSB7XG4gICAgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT47XG59ICYgRWxlbWVudDxhbnksIGFueSwgU3RhdGU+O1xuXG5jbGFzcyBEZWJvdW5jZXIge1xuICAgIGJvdW5jZTogKCkgPT4gdm9pZDtcbiAgICB0aW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihmOiAoKSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuYm91bmNlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMudGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGltZW91dCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgZigpO1xuICAgICAgICAgICAgICAgIH0sIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNsZWFyKCkge1xuICAgICAgICBpZiAodGhpcy50aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpO1xuICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZnVuY3Rpb24gZmluZFRvdWNoVGFyZ2V0KHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIHA6IFBvaW50MkQpOiB1bmRlZmluZWQgfCBIYXNUb3VjaEhhbmRsZXJzPGFueT4ge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIGNvbnN0IHggPSBwWzBdO1xuICAgIGNvbnN0IHkgPSBwWzFdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55LCBhbnk+O1xuICAgICAgICBpZiAoeCA8IGUubGVmdCB8fCB4ID49IGUubGVmdCArIGUud2lkdGggfHwgeSA8IGUudG9wIHx8IHkgPj0gZS50b3AgKyBlLmhlaWdodCkge1xuICAgICAgICAgICAgLy8gT3V0c2lkZSBlLCBza2lwLiAgXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgJiYgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBlIGFzIEhhc1RvdWNoSGFuZGxlcnM8YW55PjsgLy8gVE9ETzogV2h5IGNhbid0IHR5cGUgaW5mZXJlbmNlIGZpZ3VyZSB0aGlzIG91dD9cbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBmaXJzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgdmlzaXQgbGFzdCBjaGlsZCBsYXN0LlxuICAgICAgICAgICAgLy8gVGhlIGxhc3QgY2hpbGQgKHRoZSBvbmUgb24gdG9wKSBzaG91bGQgb3ZlcnJpZGUgcHJldmlvdXMgY2hpbGRyZW4ncyB0YXJnZXQuXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG50eXBlIFRBUkdFVF9ST09UID0gMTtcbmNvbnN0IFRBUkdFVF9ST09UID0gMTtcbnR5cGUgVEFSR0VUX05PTkUgPSAyO1xuY29uc3QgVEFSR0VUX05PTkUgPSAyO1xuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCBpbXBsZW1lbnRzIEVsZW1lbnRDb250ZXh0IHtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT47XG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcbiAgICByZXNpemU6IFJlc2l6ZU9ic2VydmVyO1xuICAgIHZwOiBMYXlvdXRCb3g7XG5cbiAgICAvLyBUT0RPOiB3ZSBzaG91bGQgbm90IHJlcmVuZGVyIGlmIHRoZXJlIGFyZSBwZW5kaW5nIGxheW91dCByZXF1ZXN0cy5cbiAgICBkZWJvdW5jZUxheW91dDogRGVib3VuY2VyO1xuICAgIGRlYm91bmNlRHJhdzogRGVib3VuY2VyO1xuXG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldHM6IE1hcDxudW1iZXIsIEhhc1RvdWNoSGFuZGxlcnM8YW55PiB8IFRBUkdFVF9ST09UIHwgVEFSR0VUX05PTkU+O1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXREZXRhY2hlZDogT25EZXRhY2hIYW5kbGVyPGFueT47XG4gICAgcHJpdmF0ZSB0b3VjaFN0YXJ0OiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkOyBcbiAgICBwcml2YXRlIHRvdWNoTW92ZTogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIHRvdWNoRW5kOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuXG4gICAgY29uc3RydWN0b3IoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XG4gICAgICAgIGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIiwge2FscGhhOiBmYWxzZX0pO1xuICAgICAgICBpZiAoY3R4ID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJmYWlsZWQgdG8gZ2V0IDJkIGNvbnRleHRcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jdHggPSBjdHg7XG4gICAgICAgIHRoaXMucmVzaXplID0gbmV3IFJlc2l6ZU9ic2VydmVyKChlbnRyaWVzOiBSZXNpemVPYnNlcnZlckVudHJ5W10pID0+IHtcbiAgICAgICAgICAgIGlmIChlbnRyaWVzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVzaXplT2JzZXJ2ZXIgZXhwZWN0cyAxIGVudHJ5LCBnb3QgJHtlbnRyaWVzLmxlbmd0aH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBlbnRyaWVzWzBdLmNvbnRlbnRSZWN0O1xuICAgICAgICAgICAgY29uc3QgdnAgPSB0aGlzLnZwO1xuICAgICAgICAgICAgdnAubGVmdCA9IDA7XG4gICAgICAgICAgICB2cC50b3AgPSAwO1xuICAgICAgICAgICAgdnAud2lkdGggPSBjb250ZW50LndpZHRoO1xuICAgICAgICAgICAgdnAuaGVpZ2h0ID0gY29udGVudC5oZWlnaHRcbiAgICAgICAgICAgIGNhbnZhcy53aWR0aCA9IHZwLndpZHRoICogd2luZG93LmRldmljZVBpeGVsUmF0aW87XG4gICAgICAgICAgICBjYW52YXMuaGVpZ2h0ID0gdnAuaGVpZ2h0ICogd2luZG93LmRldmljZVBpeGVsUmF0aW87XG4gICAgICAgICAgICBjdHgudHJhbnNmb3JtKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwLCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQuY2xlYXIoKTtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KDAsIDAsIHZwLndpZHRoLCB2cC5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcuY2xlYXIoKTtcbiAgICAgICAgICAgIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5jaGlsZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdnApO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXNpemUub2JzZXJ2ZShjYW52YXMsIHtib3g6IFwiZGV2aWNlLXBpeGVsLWNvbnRlbnQtYm94XCJ9KTtcbiAgICAgICAgdGhpcy52cCA9IHtcbiAgICAgICAgICAgIGxlZnQ6IDAsXG4gICAgICAgICAgICB0b3A6IDAsXG4gICAgICAgICAgICB3aWR0aDogY2FudmFzLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBjYW52YXMuaGVpZ2h0LFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVib3VuY2VMYXlvdXQgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KDAsIDAsIHRoaXMudnAud2lkdGgsIHRoaXMudnAuaGVpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVxdWVzdExheW91dCA9IHRoaXMuZGVib3VuY2VMYXlvdXQuYm91bmNlO1xuXG4gICAgICAgIHRoaXMuZGVib3VuY2VEcmF3ID0gbmV3IERlYm91bmNlcigoKSA9PiB7XG4gICAgICAgICAgICBjbGVhckFuZERyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuY2hpbGQsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8sIHRoaXMudnApO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdyA9IHRoaXMuZGVib3VuY2VEcmF3LmJvdW5jZTtcblxuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldERldGFjaGVkID0gKGU6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4pID0+IHtcbiAgICAgICAgICAgIGxldCBmb3VuZFRhcmdldCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50b3VjaFRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gZSkge1xuICAgICAgICAgICAgICAgICAgICBlLnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChrLCBUQVJHRVRfTk9ORSk7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kVGFyZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZvdW5kVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aXZlIHRvdWNoIGZvciBkZXRhY2hlZCBlbGVtZW50XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoU3RhcnQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcDogUG9pbnQyRCA9IFt0LmNsaWVudFgsIHQuY2xpZW50WV07XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuY2hpbGQsIHApO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCBUQVJHRVRfUk9PVCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciB0byBhY3RpdmUgdGFyZ2V0cyBtYXAgc28gd2Uga25vdyBhbmJvdXQgaXQuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbG93IGRlZmF1bHQgYWN0aW9uLCBzbyBlLmcuIHBhZ2UgY2FuIGJlIHNjcm9sbGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKHQuaWRlbnRpZmllciwgcCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAvLyBTb21lIHRhcmdldCB3YXMgc29tZSBmb3IgYXQgbGVhc3Qgc29tZSBvZiB0aGUgdG91Y2hlcy4gRG9uJ3QgbGV0IGFueXRoaW5nXG4gICAgICAgICAgICAgICAgLy8gaW4gSFRNTCBnZXQgdGhpcyB0b3VjaC5cbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaE1vdmUgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnM8YW55PiwgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCBhcyB0aGUgcm9vdCBlbGVtZW50IGNhbid0IHNjcm9sbC5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBwcm9iYWJseSBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0LmlkZW50aWZpZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiBbdC5jbGllbnRYLCB0LmNsaWVudFldLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoTW92ZUhhbmRsZXIodHMsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8sIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaEVuZCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IG5ldyBNYXAodGhpcy50b3VjaFRhcmdldHMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbW92ZWQuZGVsZXRlKHQuaWRlbnRpZmllcikgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW2lkLCB0YXJnZXRdIG9mIHJlbW92ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IFRBUkdFVF9ST09UICYmIHRhcmdldCAhPT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuXG4gICAgICAgIHRoaXMucmVxdWVzdExheW91dCgpO1xuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIHRoaXMucmVzaXplLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKHRoaXMuY2hpbGQpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIEVsZW1lbnRDb250ZXh0IGZ1bmN0aW9uc1xuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICByZXF1ZXN0RHJhdzogKCkgPT4gdm9pZDtcbiAgICByZXF1ZXN0TGF5b3V0OiAoKSA9PiB2b2lkO1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vIFRvdWNoSGFuZGxlciBmdW5jdGlvbnNcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gVE9ETzogYWRkIFRvdWNoRm9yd2FyZGVyIGhlcmUuIGluc3RhbGwgdG91Y2ggaGFuZGxlcnNcbn07XG5cbi8vIFRPRE86IEhhdmUgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIChzbyBoaWRlIGNoaWxkcmVuLCBhbmQgZm9yd2FyZCB0YXAvcGFuL2RyYXcgbWFudWFsbHksIHdpdGggdHJhbnNmb3JtKVxuLy8gVE9ETzogY29udmVydCB0byB1c2UgQWZmaW5lIHRyYW5zZm9ybS5cblxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4ge1xuICAgIC8vIFNjcm9sbExheW91dCBoYXMgdG8gaW50ZXJjZXB0IGFsbCBldmVudHMgdG8gbWFrZSBzdXJlIGFueSBsb2NhdGlvbnMgYXJlIHVwZGF0ZWQgYnlcbiAgICAvLyB0aGUgc2Nyb2xsIHBvc2l0aW9uLCBzbyBjaGlsZCBpcyB1bmRlZmluZWQsIGFuZCBhbGwgZXZlbnRzIGFyZSBmb3J3YXJkZWQgdG8gc2Nyb2xsZXIuXG4gICAgc2Nyb2xsZXI6IFdTSFNMYXlvdXQ8YW55LCBhbnk+O1xuICAgIHNjcm9sbDogUG9pbnQyRDtcbiAgICB6b29tOiBudW1iZXI7XG4gICAgem9vbU1heDogbnVtYmVyO1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzPHVua25vd24+IHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFNjcm9sbDogTWFwPG51bWJlciwgeyBwcmV2OiBQb2ludDJELCBjdXJyOiBQb2ludDJEIH0+O1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXREZXRhY2hlZDogT25EZXRhY2hIYW5kbGVyPHVua25vd24+O1xuXG4gICAgcHJpdmF0ZSB1cGRhdGVTY3JvbGwoKSB7XG4gICAgICAgIGNvbnN0IHRzID0gWy4uLnRoaXMudG91Y2hTY3JvbGwudmFsdWVzKCldO1xuICAgICAgICBpZiAodHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHNbMF07XG4gICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wMmModC5wcmV2KTtcbiAgICAgICAgICAgIGNvbnN0IGMgPSB0aGlzLnAyYyh0LmN1cnIpO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMF0gKz0gcFswXSAtIGNbMF07XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFsxXSArPSBwWzFdIC0gY1sxXTtcbiAgICAgICAgfSBlbHNlIGlmICh0cy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBtID0gdGhpcy5wMmMoW1xuICAgICAgICAgICAgICAgICh0c1swXS5wcmV2WzBdICsgdHNbMV0ucHJldlswXSkgKiAwLjUsXG4gICAgICAgICAgICAgICAgKHRzWzBdLnByZXZbMV0gKyB0c1sxXS5wcmV2WzFdKSAqIDAuNSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgY29uc3QgcGQgPSBwb2ludERpc3RhbmNlKHRzWzBdLnByZXYsIHRzWzFdLnByZXYpO1xuICAgICAgICAgICAgY29uc3QgY2QgPSBwb2ludERpc3RhbmNlKHRzWzBdLmN1cnIsIHRzWzFdLmN1cnIpO1xuICAgICAgICAgICAgdGhpcy56b29tICo9IGNkIC8gcGQ7XG4gICAgICAgICAgICAvLyBDbGFtcCB6b29tIHNvIHdlIGNhbid0IHpvb20gb3V0IHRvbyBmYXIuXG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxlci53aWR0aCA8IHRoaXMud2lkdGggLyB0aGlzLnpvb20pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLndpZHRoIC8gdGhpcy5zY3JvbGxlci53aWR0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnNjcm9sbGVyLmhlaWdodCA8IHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy5oZWlnaHQgLyB0aGlzLnNjcm9sbGVyLmhlaWdodDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnpvb20gPiB0aGlzLnpvb21NYXgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLnpvb21NYXg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjbSA9IHRoaXMucDJjKFtcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclswXSArIHRzWzFdLmN1cnJbMF0pICogMC41LFxuICAgICAgICAgICAgICAgICh0c1swXS5jdXJyWzFdICsgdHNbMV0uY3VyclsxXSkgKiAwLjUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzBdICs9IHBtWzBdIC0gY21bMF07XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFsxXSArPSBwbVsxXSAtIGNtWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Nyb2xsWzBdID0gY2xhbXAodGhpcy5zY3JvbGxbMF0sIDAsIHRoaXMuc2Nyb2xsZXIud2lkdGggLSB0aGlzLndpZHRoIC8gdGhpcy56b29tKTtcbiAgICAgICAgdGhpcy5zY3JvbGxbMV0gPSBjbGFtcCh0aGlzLnNjcm9sbFsxXSwgMCwgdGhpcy5zY3JvbGxlci5oZWlnaHQgLSB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwMmMocDogUG9pbnQyRCk6IFBvaW50MkQge1xuICAgICAgICBjb25zdCBzID0gdGhpcy5zY3JvbGw7XG4gICAgICAgIGNvbnN0IHNocmluayA9IDEgLyB0aGlzLnpvb207XG4gICAgICAgIC8vIFRPRE86IHRha2UgcGFyZW50IHJlY3QgaW50byBhY2NvdW50XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAocFswXSAtIHRoaXMubGVmdCkgKiBzaHJpbmsgKyBzWzBdLFxuICAgICAgICAgICAgKHBbMV0gLSB0aGlzLnRvcCkgKiBzaHJpbmsgKyBzWzFdLFxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc2Nyb2xsOiBQb2ludDJELCB6b29tOiBudW1iZXIsIHpvb21NYXg6IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5zY3JvbGwgPSBzY3JvbGw7XG4gICAgICAgIHRoaXMuem9vbSA9IHpvb207XG4gICAgICAgIHRoaXMuem9vbU1heCA9IHpvb21NYXg7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoU2Nyb2xsID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQgPSAoZTogRWxlbWVudDxhbnksIGFueSwgYW55PikgPT4ge1xuICAgICAgICAgICAgbGV0IGZvdW5kVGFyZ2V0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRvdWNoVGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGlmICh2ID09PSBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGUucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmRUYXJnZXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZm91bmRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3RpdmUgdG91Y2ggZm9yIGRldGFjaGVkIGVsZW1lbnRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLmxlZnQsIHRoaXMudG9wKTtcbiAgICAgICAgICAgIC8vIENsaXAgdG8gU2Nyb2xsIHZpZXdwb3J0LlxuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbygwLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oMCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmNsaXAoKTtcbiAgICAgICAgICAgIGN0eC5zY2FsZSh0aGlzLnpvb20sIHRoaXMuem9vbSk7XG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKC10aGlzLnNjcm9sbFswXSwgLXRoaXMuc2Nyb2xsWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IHZwU2Nyb2xsZXIgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogdGhpcy5zY3JvbGxbMF0sXG4gICAgICAgICAgICAgICAgdG9wOiB0aGlzLnNjcm9sbFsxXSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCAvIHRoaXMuem9vbSxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHRoaXMuc2Nyb2xsZXIsIGVjLCB2cFNjcm9sbGVyKTtcbiAgICAgICAgICAgIC8vIFRPRE86IHJlc3RvcmUgdHJhbnNmb3JtIGluIGEgZmluYWxseT9cbiAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNwID0gdGhpcy5wMmMocHApO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuc2Nyb2xsZXIsIGNwKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciBudWxsIHRvIGFjdGl2ZSB0b3VjaGVzLCBzbyB3ZSBrbm93IHRoZXkgc2hvdWxkIHNjcm9sbC5cbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaWQsIFRBUkdFVF9ST09UKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoU2Nyb2xsLnNldChpZCwgeyBwcmV2OiBwcCwgY3VycjogcHAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcihpZCwgY3AsIGVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzPGFueT4sIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b3VjaCBtb3ZlIElEICR7dC5pZH1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2Nyb2xsID0gdGhpcy50b3VjaFNjcm9sbC5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzY3JvbGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBtb3ZlIHdpdGggSUQgJHt0LmlkfSBoYXMgdGFyZ2V0ID09PSBUQVJHRVRfUk9PVCwgYnV0IGlzIG5vdCBpbiB0b3VjaFNjcm9sbGApXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLnByZXYgPSBzY3JvbGwuY3VycjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLmN1cnIgPSB0LnA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCB0YXJnZXQgZGVsZXRlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0dHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0dHMucHVzaCh0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0dHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHNjcm9sbCBwb3NpdGlvbi5cbiAgICAgICAgICAgIHRoaXMudXBkYXRlU2Nyb2xsKCk7XG5cbiAgICAgICAgICAgIC8vIEZvcndhcmQgdG91Y2ggbW92ZXMuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0YXJnZXQsIHR0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHR0c1tpXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0dHNbaV0uaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiB0aGlzLnAyYyh0dHNbaV0ucCksXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoTW92ZUhhbmRsZXIodHRzLCBlYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIGVuZCBJRCAke2lkfWApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnRvdWNoU2Nyb2xsLmRlbGV0ZShpZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBlbmQgSUQgJHtpZH0gaGFzIHRhcmdldCBUQVJHRVRfUk9PVCwgYnV0IGlzIG5vdCBpbiB0b3VjaFNjcm9sbGApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgIC8vIERvIG5vdGhpbmcsIHRhcmV0IHdhcyBkZWxldGVkLlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIGVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gVE9ETzogb3RoZXIgaGFuZGxlcnMgbmVlZCBmb3J3YXJkaW5nLlxuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyLmxheW91dCgwLCAwKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBTY3JvbGwoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzY3JvbGw/OiBQb2ludDJELCB6b29tPzogbnVtYmVyLCB6b29tTWF4PzogbnVtYmVyKTogU2Nyb2xsTGF5b3V0IHtcbiAgICAvLyBOQjogc2NhbGUgb2YgMCBpcyBpbnZhbGlkIGFueXdheXMsIHNvIGl0J3MgT0sgdG8gYmUgZmFsc3kuXG4gICAgcmV0dXJuIG5ldyBTY3JvbGxMYXlvdXQoY2hpbGQsIHNjcm9sbCB8fCBbMCwgMF0sIHpvb20gfHwgMSwgem9vbU1heCB8fCAxMCk7XG59XG5cbi8vIFRPRE86IHNjcm9sbHgsIHNjcm9sbHlcblxuY2xhc3MgQm94TGF5b3V0PFN0YXRlLCBDaGlsZCBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+IHwgdW5kZWZpbmVkPiBleHRlbmRzIFdTSFNMYXlvdXQ8Q2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICBpZiAodGhpcy5jaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogV1NIU0xheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogV1NIU0xheW91dDxhbnksIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlKTogV1NIU0xheW91dDxhbnksIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlyc3Q/OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzZWNvbmQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT4gfCBXU0hTTGF5b3V0PGFueSwgdW5kZWZpbmVkPiB7XG4gICAgaWYgKHNlY29uZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaXJzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4od2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8dW5kZWZpbmVkLCBXUEhQTGF5b3V0PGFueSwgYW55Pj4od2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBmaXJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDxTdGF0ZSwgdW5kZWZpbmVkPih3aWR0aCwgaGVpZ2h0LCBmaXJzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PFN0YXRlLCBXUEhQTGF5b3V0PGFueSwgYW55Pj4od2lkdGgsIGhlaWdodCwgZmlyc3QgYXMgU3RhdGUsIHNlY29uZCk7XG4gICAgICAgIC8vIFRPRE86IHRoZSBzdGF0ZSBzaG91bGQgdHlwZS1jaGVjay5cbiAgICB9XG59XG5cbmNsYXNzIFdQSFBCb3JkZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBib3JkZXI6IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55PiwgYm9yZGVyOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIHN0YXRlOiBTdGF0ZSkge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLmJvcmRlciA9IGJvcmRlcjtcbiAgICAgICAgdGhpcy5zdHlsZSA9IHN0eWxlO1xuXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgICAgIGNvbnN0IGIyID0gYiAqIDAuNTtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHRoaXMuc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIGIyLCBib3gudG9wICsgYjIsIGJveC53aWR0aCAtIGIsIGJveC5oZWlnaHQgLSBiKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCArIGIsIHRvcCArIGIsIHdpZHRoIC0gYiAqIDIsIGhlaWdodCAtIGIgKiAyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3JkZXI8U3RhdGU+KHdpZHRoOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Piwgc3RhdGU/OiBTdGF0ZSk6IFdQSFBMYXlvdXQ8YW55LCBhbnk+IHtcbiAgICBpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBCb3JkZXJMYXlvdXQ8dW5kZWZpbmVkPihjaGlsZCwgd2lkdGgsIHN0eWxlLCB1bmRlZmluZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgV1BIUEJvcmRlckxheW91dDxTdGF0ZT4oY2hpbGQsIHdpZHRoLCBzdHlsZSwgc3RhdGUpO1xuICAgIH1cbn1cblxuY2xhc3MgRmlsbExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PHVuZGVmaW5lZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUpIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZpbGwoKTogRmlsbExheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZpbGw8U3RhdGU+KHN0YXRlOiBTdGF0ZSk6IEZpbGxMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEZpbGw8U3RhdGU+KHN0YXRlPzogU3RhdGUpOiBGaWxsTGF5b3V0PHVuZGVmaW5lZD4gfCBGaWxsTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGaWxsTGF5b3V0PHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEZpbGxMYXlvdXQ8U3RhdGU+KHN0YXRlKTtcbiAgICB9XG59XG5cbmNsYXNzIENlbnRlckxheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBDZW50ZXJMYXlvdXQ8U3RhdGU+IHtcbiAgICByZXR1cm4gbmV3IENlbnRlckxheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbn1cblxuY2xhc3MgSENlbnRlckhQTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIUExheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgSENlbnRlckhTTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogSENlbnRlckhTTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIUExheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIUExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+IHwgV1NIUExheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIU0xheW91dDxTdGF0ZT4gfCBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dzaHAnKSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhQTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhTTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgVkNlbnRlcldQTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCwgd2lkdGgpO1xuICAgIH1cbn07XG5cbmNsYXNzIFZDZW50ZXJXU0xheW91dDxTdGF0ZT4gZXh0ZW5kcyBXU0hQTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSBjaGlsZC53aWR0aDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXUEhTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldQTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4gfCBXUEhTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldTTGF5b3V0PFN0YXRlPiB8IFZDZW50ZXJXUExheW91dDxTdGF0ZT4ge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3BocycpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBGbGV4TGF5b3V0PFN0YXRlLCBDaGlsZCBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+IHwgdW5kZWZpbmVkPiBleHRlbmRzIEVsZW1lbnQ8J2ZsZXgnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBzaXplOiBudW1iZXI7XG4gICAgZ3JvdzogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignZmxleCcsIHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMuc2l6ZSA9IHNpemU7XG4gICAgICAgIHRoaXMuZ3JvdyA9IGdyb3c7XG4gICAgfVxuICAgIGxheW91dChsZWZ0Om51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBpZiAodGhpcy5jaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEZsZXgoc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIpOiBGbGV4TGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBGbGV4PFN0YXRlPihzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgc3RhdGU6IFN0YXRlKTogRmxleExheW91dDxTdGF0ZSwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBGbGV4KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBGbGV4TGF5b3V0PHVuZGVmaW5lZCwgV1BIUExheW91dDxhbnksIGFueT4+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXg8U3RhdGU+KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8U3RhdGUsIFdQSFBMYXlvdXQ8YW55LCBhbnk+PjtcbmV4cG9ydCBmdW5jdGlvbiBGbGV4PFN0YXRlPihzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgZmlyc3Q/OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzZWNvbmQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8YW55LCBhbnk+IHtcbiAgICBpZiAoZmlyc3QgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoc2Vjb25kICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRmxleExheW91dChzaXplLCBncm93LCBmaXJzdCwgc2Vjb25kKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIFdQSFBMYXlvdXQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRmxleExheW91dChzaXplLCBncm93LCB1bmRlZmluZWQsIGZpcnN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRmxleExheW91dChzaXplLCBncm93LCBmaXJzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgRmxleExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4oc2l6ZSwgZ3JvdywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgIH1cbn1cblxuY2xhc3MgTGVmdEZsZXhMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBsZXQgc3VtU2l6ZSA9IDA7XG4gICAgICAgIGxldCBzdW1Hcm93ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIHN1bVNpemUgKz0gYy5zaXplO1xuICAgICAgICAgICAgc3VtR3JvdyArPSBjLmdyb3c7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGNoaWxkTGVmdCA9IGxlZnQ7XG4gICAgICAgIGxldCBleHRyYSA9IGhlaWdodCAtIHN1bVNpemU7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBsZXQgY2hpbGRXaWR0aCA9IGMuc2l6ZTtcbiAgICAgICAgICAgIGlmIChjLmdyb3cgIT09IDApIHtcbiAgICAgICAgICAgICAgICBjaGlsZFdpZHRoICs9IGV4dHJhICogYy5ncm93IC8gc3VtR3JvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGMubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBjaGlsZFdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkV2lkdGg7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTGVmdCguLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogTGVmdEZsZXhMYXlvdXQ8dW5kZWZpbmVkPlxuZXhwb3J0IGZ1bmN0aW9uIExlZnQ8U3RhdGU+KHN0YXRlOiBTdGF0ZSwgLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IExlZnRGbGV4TGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBMZWZ0PFN0YXRlPihmaXJzdDogU3RhdGUgfCBGbGV4TGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IExlZnRGbGV4TGF5b3V0PGFueT4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEZsZXhMYXlvdXQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMZWZ0RmxleExheW91dCh1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IExlZnRGbGV4TGF5b3V0KGZpcnN0LCBjaGlsZHJlbik7XG4gICAgfVxufVxuXG5jbGFzcyBCb3R0b21GbGV4TGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgbGV0IHN1bVNpemUgPSAwO1xuICAgICAgICBsZXQgc3VtR3JvdyA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBzdW1TaXplICs9IGMuc2l6ZTtcbiAgICAgICAgICAgIHN1bUdyb3cgKz0gYy5ncm93O1xuICAgICAgICB9XG4gICAgICAgIGxldCBjaGlsZFRvcCA9IHRvcCArIGhlaWdodDtcbiAgICAgICAgbGV0IGV4dHJhID0gaGVpZ2h0IC0gc3VtU2l6ZTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGxldCBjaGlsZEhlaWdodCA9IGMuc2l6ZTtcbiAgICAgICAgICAgIGlmIChjLmdyb3cgIT09IDApIHtcbiAgICAgICAgICAgICAgICBjaGlsZEhlaWdodCArPSBleHRyYSAqIGMuZ3JvdyAvIHN1bUdyb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaGlsZFRvcCAtPSBjaGlsZEhlaWdodDtcbiAgICAgICAgICAgIGMubGF5b3V0KGxlZnQsIGNoaWxkVG9wLCB3aWR0aCwgY2hpbGRIZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gQm90dG9tKC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBCb3R0b21GbGV4TGF5b3V0PHVuZGVmaW5lZD5cbmV4cG9ydCBmdW5jdGlvbiBCb3R0b208U3RhdGU+KHN0YXRlOiBTdGF0ZSwgLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IEJvdHRvbUZsZXhMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEJvdHRvbTxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgRmxleExheW91dDxhbnksIGFueT4sIC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBCb3R0b21GbGV4TGF5b3V0PGFueT4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEZsZXhMYXlvdXQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCb3R0b21GbGV4TGF5b3V0KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgQm90dG9tRmxleExheW91dChmaXJzdCwgY2hpbGRyZW4pO1xuICAgIH1cbn1cblxudHlwZSBEZWJ1Z1RvdWNoU3RhdGUgPSB7XG4gICAgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLFxuICAgIHN0cm9rZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLFxuICAgIHRhcHM6IEFycmF5PFBvaW50MkQ+LFxuICAgIHBhbnM6IEFycmF5PEFycmF5PFBhblBvaW50Pj4sXG59O1xuXG5mdW5jdGlvbiBkZWJ1Z1RvdWNoT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBEZWJ1Z1RvdWNoU3RhdGUpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gc3RhdGUuZmlsbDtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdGF0ZS5zdHJva2U7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBmb3IgKGNvbnN0IHRhcCBvZiBzdGF0ZS50YXBzKSB7XG4gICAgICAgIGN0eC5tb3ZlVG8odGFwWzBdICsgMTYsIHRhcFsxXSk7XG4gICAgICAgIGN0eC5lbGxpcHNlKHRhcFswXSwgdGFwWzFdLCAxNiwgMTYsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBwcyBvZiBzdGF0ZS5wYW5zKSB7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgY3R4Lm1vdmVUbyhwLnByZXZbMF0sIHAucHJldlsxXSk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHAuY3VyclswXSwgcC5jdXJyWzFdKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRlYnVnVG91Y2hPblRhcChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBEZWJ1Z1RvdWNoU3RhdGUpIHtcbiAgICBzdGF0ZS50YXBzLnB1c2gocCk7XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZnVuY3Rpb24gZGVidWdUb3VjaE9uUGFuKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIHN0YXRlLnBhbnMucHVzaChwcyk7XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERlYnVnVG91Y2god2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpbGw6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgc3Ryb2tlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4pOiBCb3hMYXlvdXQ8RGVidWdUb3VjaFN0YXRlLCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCBzdGF0ZSA9IHtcbiAgICAgICAgZmlsbCxcbiAgICAgICAgc3Ryb2tlLFxuICAgICAgICB0YXBzOiBbXSxcbiAgICAgICAgcGFuczogW10sXG4gICAgfTtcbiAgICByZXR1cm4gQm94PERlYnVnVG91Y2hTdGF0ZT4od2lkdGgsIGhlaWdodCwgc3RhdGUpXG4gICAgICAgIC5vbkRyYXcoZGVidWdUb3VjaE9uRHJhdylcbiAgICAgICAgLm9uVGFwKGRlYnVnVG91Y2hPblRhcClcbiAgICAgICAgLm9uUGFuKGRlYnVnVG91Y2hPblBhbik7XG59XG5cbmNsYXNzIExheWVyTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTGF5ZXI8U3RhdGU+KHN0YXRlOiBTdGF0ZSwgLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pik6IExheWVyTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBMYXllciguLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KTogTGF5ZXJMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBMYXllcjxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pOiBMYXllckxheW91dDxTdGF0ZT4gfCBMYXllckxheW91dDx1bmRlZmluZWQ+IHtcbiAgICBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBuZXcgTGF5ZXJMYXlvdXQ8dW5kZWZpbmVkPih1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBMYXllckxheW91dDxTdGF0ZT4oZmlyc3QsIGNoaWxkcmVuKTtcbn1cblxuZXhwb3J0IHR5cGUgTXV4S2V5ID0gc3RyaW5nIHwgbnVtYmVyIHwgc3ltYm9sO1xuXG5mdW5jdGlvbiBtdXhFbGVtZW50cyhlbmFibGVkOiBTZXQ8TXV4S2V5PiwgZXM6IEFycmF5PFtNdXhLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4ge1xuICAgIGNvbnN0IHJlcyA9IFtdO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIGVzKSB7XG4gICAgICAgIGlmIChlbmFibGVkLmhhcyhrKSkge1xuICAgICAgICAgICAgcmVzLnB1c2godik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuY2xhc3MgTXV4TGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4sIHVuZGVmaW5lZD4ge1xuICAgIHByaXZhdGUgZW5hYmxlZDogU2V0PE11eEtleT47XG4gICAgcHJpdmF0ZSBtdXg6IEFycmF5PFtNdXhLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT47XG5cbiAgICBjb25zdHJ1Y3RvcihlbmFibGVkOiBTZXQ8TXV4S2V5PiwgY2hpbGRyZW46IEFycmF5PFtNdXhLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pIHtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkLCBtdXhFbGVtZW50cyhlbmFibGVkLCBjaGlsZHJlbikpO1xuICAgICAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkO1xuICAgICAgICB0aGlzLm11eCA9IGNoaWxkcmVuO1xuICAgIH1cblxuICAgIHRvZ2dsZShkaXNhYmxlOiBBcnJheTxNdXhLZXk+LCBlbmFibGU6IEFycmF5PE11eEtleT4sIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2YgZGlzYWJsZSkge1xuICAgICAgICAgICAgdGhpcy5lbmFibGVkLmRlbGV0ZShrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGsgb2YgZW5hYmxlKSB7XG4gICAgICAgICAgICB0aGlzLmVuYWJsZWQuYWRkKGspO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hpbGQgPSBtdXhFbGVtZW50cyh0aGlzLmVuYWJsZWQsIHRoaXMubXV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH1cblxuICAgIHNldChlYzogRWxlbWVudENvbnRleHQsIC4uLmVuYWJsZTogQXJyYXk8TXV4S2V5Pikge1xuICAgICAgICB0aGlzLmVuYWJsZWQgPSBuZXcgU2V0KGVuYWJsZSk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBtdXhFbGVtZW50cyh0aGlzLmVuYWJsZWQsIHRoaXMubXV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vIFRPRE86IGhhdmUgdGhlIGtleXMgdXNlZCBpbiBNdXggYmUgcGFydCBvZiB0aGUgdHlwZS5cbmV4cG9ydCBmdW5jdGlvbiBNdXgoZW5hYmxlZDogQXJyYXk8TXV4S2V5PiwgLi4uY2hpbGRyZW46IEFycmF5PFtNdXhLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBNdXhMYXlvdXQge1xuICAgIHJldHVybiBuZXcgTXV4TGF5b3V0KG5ldyBTZXQoZW5hYmxlZCksIGNoaWxkcmVuKTtcbn1cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uTGF5b3V0PENoaWxkIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT4gfCB1bmRlZmluZWQsIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8XCJwb3NcIiwgQ2hpbGQsIFN0YXRlPiB7XG4gICAgcmVxdWVzdExlZnQ6IG51bWJlcjtcbiAgICByZXF1ZXN0VG9wOiBudW1iZXI7XG4gICAgcmVxdWVzdFdpZHRoOiBudW1iZXI7XG4gICAgcmVxdWVzdEhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKFwicG9zXCIsIHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMucmVxdWVzdExlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJlcXVlc3RUb3AgPSB0b3A7XG4gICAgICAgIHRoaXMucmVxdWVzdFdpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMucmVxdWVzdEhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KHBhcmVudDogTGF5b3V0Qm94KSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RXaWR0aCwgcGFyZW50LndpZHRoKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gY2xhbXAodGhpcy5yZXF1ZXN0TGVmdCwgcGFyZW50LmxlZnQsIHBhcmVudC5sZWZ0ICsgcGFyZW50LndpZHRoIC0gdGhpcy53aWR0aCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0SGVpZ2h0LCBwYXJlbnQuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy50b3AgPSBjbGFtcCh0aGlzLnJlcXVlc3RUb3AsIHBhcmVudC50b3AsIHBhcmVudC50b3AgKyBwYXJlbnQuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KHRoaXMubGVmdCwgdGhpcy50b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vIFRPRE86IHN1cHBvcnQgc3RhdGljYWxseSBzaXplZCBjaGlsZHJlbiwgXG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUpOiBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaXJzdD86IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIHNlY29uZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgaWYgKHNlY29uZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaXJzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIGZpcnN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCBTdGF0ZT4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCBmaXJzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIFN0YXRlPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGZpcnN0IGFzIFN0YXRlLCBzZWNvbmQpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERyYWdnYWJsZShsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pikge1xuICAgIGNvbnN0IGxheW91dCA9IG5ldyBQb3NpdGlvbkxheW91dDxhbnksIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIGNoaWxkKTtcbiAgICByZXR1cm4gbGF5b3V0Lm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgbGV0IGR4ID0gMDtcbiAgICAgICAgbGV0IGR5ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBkeCArPSBwLmN1cnJbMF0gLSBwLnByZXZbMF07XG4gICAgICAgICAgICBkeSArPSBwLmN1cnJbMV0gLSBwLnByZXZbMV07XG4gICAgICAgIH1cbiAgICAgICAgZHggLz0gcHMubGVuZ3RoO1xuICAgICAgICBkeSAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCArPSBkeDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgKz0gZHk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KS5vblBhbkVuZCgoKSA9PiB7XG4gICAgICAgIC8vIFRoZSByZXF1ZXN0ZWQgbG9jYXRpb24gY2FuIGJlIG91dHNpZGUgdGhlIGFsbG93ZWQgYm91bmRzIGlmIGRyYWdnZWQgb3V0c2lkZSxcbiAgICAgICAgLy8gYnV0IG9uY2UgdGhlIGRyYWcgaXMgb3Zlciwgd2Ugd2FudCB0byByZXNldCBpdCBzbyB0aGF0IGl0IGRvZXNuJ3Qgc3RhcnQgdGhlcmVcbiAgICAgICAgLy8gb25jZSBhIG5ldyBkcmFnIHN0YXJ0LlxuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgPSBsYXlvdXQubGVmdDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgPSBsYXlvdXQudG9wO1xuICAgIH0pO1xufVxuXG5cbi8vIFRPRE86IGRvZXMgaXQgbWFrZSBzZW5zZSB0byBtYWtlIG90aGVyIGxheW91dCB0eXBlcz9cbi8vIGNsYXNzIFdTSFNSZWxhdGl2ZUxheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+PiB7XG4vLyAgICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbi8vICAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuLy8gICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4vLyAgICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuLy8gICAgIH1cbi8vICAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuLy8gICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuLy8gICAgICAgICB0aGlzLnRvcCA9IHRvcDtcblxuLy8gICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbi8vICAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4vLyAgICAgICAgIH1cbi8vICAgICB9XG4vLyB9O1xuXG5jbGFzcyBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KHRoaXMgLyogTGF5b3V0Qm94ICovKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZSguLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFJlbGF0aXZlPFN0YXRlPihzdGF0ZTogU3RhdGUsIC4uLmNoaWxkcmVuOiBBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KTogV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZTxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgUG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+IHwgV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT4oZmlyc3QsIGNoaWxkcmVuKTtcbn1cbiJdfQ==