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
                    if (pointDistance(a, t.p) >= 16 / ec.zoom()) {
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
    touchSink() {
        this.touchGesture = initTouchGesture(this);
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
export class WPHPLayout extends Element {
    constructor(state, child) {
        super('wphp', state, child);
    }
}
;
export class WPHSLayout extends Element {
    constructor(state, child) {
        super('wphs', state, child);
    }
}
;
export class WSHPLayout extends Element {
    constructor(state, child) {
        super('wshp', state, child);
    }
}
;
export class WSHSLayout extends Element {
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
class RootElementContext {
    constructor(ctx, root, width, height) {
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
                }
                finally {
                    this.layoutEvaluating = false;
                }
            }
            if (this.drawRequested) {
                this.drawRequested = false;
                this.drawEvaluating = true;
                try {
                    clearAndDrawElementTree(ctx, root, this, this.vp);
                }
                finally {
                    this.drawEvaluating = false;
                }
            }
        };
        this.evaluateToken = undefined;
        this.nextTimerID = 0;
        this.timers = new Map();
        this.callTimersToken = undefined;
        this.callTimers = (now) => {
            const finished = [];
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
                }
                else {
                    v.handler(now - v.start, this);
                }
            }
            for (const k of finished) {
                this.timers.delete(k);
            }
            if (this.timers.size !== 0) {
                this.callTimersToken = requestAnimationFrame(this.callTimers);
            }
            else {
                this.callTimersToken = undefined;
            }
        };
    }
    requestDraw() {
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
    requestLayout() {
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
    timer(handler, duration) {
        const id = this.nextTimerID;
        this.nextTimerID++;
        this.timers.set(id, { handler, start: performance.now(), duration });
        if (this.callTimersToken === undefined) {
            this.callTimersToken = requestAnimationFrame(this.callTimers);
        }
        return id;
    }
    clearTimer(id) {
        this.timers.delete(id);
        if (this.timers.size === 0 && this.callTimersToken !== undefined) {
            cancelAnimationFrame(this.callTimersToken);
            this.callTimersToken = undefined;
        }
    }
    zoom() {
        return 1;
    }
    setViewport(width, height) {
        this.vp.width = width;
        this.vp.height = height;
        this.requestLayout();
    }
    disconnect() {
        if (this.evaluateToken === undefined) {
            return;
        }
        clearTimeout(this.evaluateToken);
        this.evaluateToken = undefined;
    }
}
;
export class RootLayout {
    constructor(canvas, child) {
        const ctx = canvas.getContext("2d", { alpha: false });
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
        this.resize = new ResizeObserver((entries) => {
            if (entries.length !== 1) {
                throw new Error(`ResizeObserver expects 1 entry, got ${entries.length}`);
            }
            const content = entries[0].contentRect;
            canvas.width = content.width * window.devicePixelRatio;
            canvas.height = content.height * window.devicePixelRatio;
            ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            this.ec.setViewport(content.width, content.height);
        });
        this.resize.observe(canvas, { box: "device-pixel-content-box" });
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
                    target.onTouchBeginHandler(t.identifier, p, this.ec, target.state);
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
                target.onTouchMoveHandler(ts, this.ec, target.state);
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
}
;
class ScrollElementContext {
    constructor(scroll) {
        this.parent = undefined;
        this.scroll = scroll;
    }
    requestDraw() {
        if (this.parent === undefined) {
            throw new Error("ElementContext.requestDraw called outside of callback");
        }
        this.parent.requestDraw();
    }
    requestLayout() {
        if (this.parent === undefined) {
            throw new Error("ElementContext.requestLayout called outside of callback");
        }
        this.parent.requestLayout();
    }
    timer(handler, duration) {
        if (this.parent === undefined) {
            throw new Error("ElementContext.timer called outside of callback");
        }
        return this.parent.timer(handler, duration);
    }
    clearTimer(id) {
        if (this.parent === undefined) {
            throw new Error("ElementContext.clearTimer called outside of callback");
        }
        this.clearTimer(id);
    }
    zoom() {
        if (this.parent === undefined) {
            throw new Error("ElementContext.zoom called outside of callback");
        }
        return this.parent.zoom() * this.scroll.zoom;
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
        this.ec = new ScrollElementContext(this);
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
            this.ec.parent = ec;
            drawElementTree(ctx, this.scroller, this.ec, vpScroller);
            this.ec.parent = undefined;
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
                this.ec.parent = ec;
                target.onTouchBeginHandler(id, cp, this.ec, target.state);
                this.ec.parent = undefined;
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
                this.ec.parent = ec;
                target.onTouchMoveHandler(tts, this.ec, target.state);
                this.ec.parent = undefined;
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
                    this.ec.parent = ec;
                    target.onTouchEndHandler(id, this.ec, target.state);
                    this.ec.parent = undefined;
                }
            }
        };
        // TODO: other handlers need forwarding.
    }
    clampZoom() {
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
    clampScroll() {
        this.scroll[0] = clamp(this.scroll[0], 0, this.scroller.width - this.width / this.zoom);
        this.scroll[1] = clamp(this.scroll[1], 0, this.scroller.height - this.height / this.zoom);
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
        this.clampZoom();
        this.clampScroll();
        this.scroller.layout(0, 0);
    }
}
export function Scroll(child, scroll, zoom, zoomMax) {
    // NB: scale of 0 is invalid anyways, so it's OK to be falsy.
    return new ScrollLayout(child, scroll || [0, 0], zoom || 1, zoomMax || 100);
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
export class FlexLayout extends Element {
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
        let extra = width - sumSize;
        for (const c of this.child) {
            let childWidth = c.size;
            if (c.grow !== 0) {
                childWidth = Math.max(childWidth + extra * c.grow / sumGrow, 0);
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
class SwitchLayout extends WPHPLayout {
    constructor(i, children) {
        super(i, children[i]);
        this.children = children;
    }
    set(i, ec) {
        if (i !== this.state) {
            callDetachListeners(this.child);
        }
        this.state = i;
        this.child = this.children[i];
        ec.requestLayout();
    }
    get() {
        return this.state;
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
export function Switch(i, ...children) {
    return new SwitchLayout(i, children);
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
    set(ec, ...enable) {
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
    get() {
        return this.enabled;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBb0JuRCxDQUFDO0FBb0JGLG1FQUFtRTtBQUNuRSx5RUFBeUU7QUFDekUsdUNBQXVDO0FBRXZDLE1BQU0sWUFBWTtJQVlkO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxFQUFVLEVBQUUsQ0FBVSxFQUFFLENBQWlCLEVBQUUsRUFBRTtZQUNyRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsRUFBZSxFQUFFLEVBQWtCLEVBQUUsS0FBWSxFQUFFLEVBQUU7WUFDNUUsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLElBQUksU0FBUyxFQUFFO29CQUNoQiw4REFBOEQ7b0JBQzlELElBQUksYUFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTt3QkFDekMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxF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QUFNLGtCQUEwQixTQUFRLFVBQXdEO0lBQzVGLFlBQVksS0FBWSxFQUFFLFFBQStDO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUNELE1BQU0sQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLEtBQWEsRUFBRSxNQUFjO1FBQzNELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzVCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1NBQ3RDO0lBQ0wsQ0FBQztDQUNKO0FBR0QsTUFBTSxVQUFVLFFBQVEsQ0FBUSxLQUF1QyxFQUFFLEdBQUcsUUFBeUM7SUFDakgsSUFBSSxLQUFLLFlBQVksT0FBTyxFQUFFO1FBQzFCLE9BQU8sSUFBSSxrQkFBa0IsQ0FBWSxTQUFTLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDO0tBQzdFO0lBQ0QsT0FBTyxJQUFJLGtCQUFrQixDQUFRLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztBQUMxRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRGljayAyMDIxXG5cbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi4vcG9pbnQuanNcIlxuXG5leHBvcnQgdHlwZSBMYXlvdXRCb3ggPSB7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHRvcDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59O1xuXG4vLyBUT0RPOiBSZXBsYWNlIHVzZSBvZiBhbnkgd2l0aCB1bmtub3duLlxuLy8gVE9ETzogUGFzcyBFbGVtZW50Q29udGV4dCBhbG9uZyB3aXRoIGxheW91dCwgc28gdGhhdCB3ZSBjYW4gaGF2ZSBkeW5hbWljIGxheW91dHMuXG5cbmV4cG9ydCB0eXBlIFRpbWVySGFuZGxlciA9ICh0OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcblxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50Q29udGV4dCB7XG4gICAgcmVxdWVzdERyYXcoKTogdm9pZDtcbiAgICByZXF1ZXN0TGF5b3V0KCk6IHZvaWQ7XG4gICAgdGltZXIoaGFuZGxlcjogVGltZXJIYW5kbGVyLCBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyO1xuICAgIGNsZWFyVGltZXIoaWQ6IG51bWJlcik6IHZvaWQ7XG4gICAgem9vbSgpOiBudW1iZXI7XG59O1xuXG50eXBlIFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPiA9IChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4gPSAoZTogRWxlbWVudDxhbnksIGFueSwgU3RhdGU+LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBPbkRyYXdIYW5kbGVyPFN0YXRlPiA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGVjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuXG50eXBlIE9uVG91Y2hCZWdpbkhhbmRsZXI8U3RhdGU+ID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xudHlwZSBUb3VjaE1vdmUgPSB7XG4gICAgcmVhZG9ubHkgaWQ6IG51bWJlcjtcbiAgICByZWFkb25seSBwOiBQb2ludDJEO1xufTtcbnR5cGUgT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPiA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG50eXBlIE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPiA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcblxuZXhwb3J0IHR5cGUgT25UYXBIYW5kbGVyPFN0YXRlPiA9IChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIFBhblBvaW50ID0ge1xuICAgIHByZXY6IFBvaW50MkQ7XG4gICAgY3VycjogUG9pbnQyRDtcbn07XG5leHBvcnQgdHlwZSBPblBhbkhhbmRsZXI8U3RhdGU+ID0gKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuLy8gVE9ETzogUGFzcyB0b3VjaCBzaXplIGRvd24gd2l0aCB0b3VjaCBldmVudHMgKGluc3RlYWQgb2Ygc2NhbGU/KVxuLy8gSXMgdGhhdCBlbm91Z2g/IFByb2JhYmx5IHdlIHdpbGwgYWx3YXlzIHdhbnQgYSB0cmFuc29mb3JtYXRpb24gbWF0cml4LlxuLy8gQnV0IGVub3VnaCBmb3Igbm93LCBzbyBqdXN0IGRvIHRoYXQuXG5cbmNsYXNzIFRvdWNoR2VzdHVyZTxTdGF0ZT4ge1xuICAgIG9uVGFwSGFuZGxlcj86IE9uVGFwSGFuZGxlcjxTdGF0ZT47XG4gICAgb25QYW5IYW5kbGVyPzogT25QYW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkJlZ2luSGFuZGxlcj86IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkVuZEhhbmRsZXI/OiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT47XG5cbiAgICBwcml2YXRlIGFjdGl2ZTogTWFwPG51bWJlciwgUG9pbnQyRD47XG4gICAgcHJpdmF0ZSBwYW5zOiBNYXA8bnVtYmVyLCBQYW5Qb2ludD47XG4gICAgcmVhZG9ubHkgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT47XG4gICAgXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuYWN0aXZlID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBhbnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMub25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBfOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5hY3RpdmUuc2V0KGlkLCBwKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IFRvdWNoTW92ZVtdLCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAoYSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogcGFzcyBpbiBkaXN0YW5jZSB0aHJlc2hvbGQ/IFNjYWxlIGJhc2Ugb24gdHJhbnNmb3Jtcz9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvaW50RGlzdGFuY2UoYSwgdC5wKSA+PSAxNiAvIGVjLnpvb20oKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmUuZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogYSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiBhLCAgICAvLyBVc2UgdGhlIHN0YXJ0IHBvaW50IGhlcmUsIHNvIHRoZSBmaXJzdCBtb3ZlIGlzIGZyb20gdGhlIHN0YXJ0LlxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucGFucy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHAgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPT09IDAgJiYgdGhpcy5vblBhbkJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyKGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBwLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiB0LnAsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA+IDAgJiYgdGhpcy5vblBhbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25QYW5IYW5kbGVyKFsuLi50aGlzLnBhbnMudmFsdWVzKCldLCBlYywgc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmIChhICE9PSB1bmRlZmluZWQgJiYgdGhpcy5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25UYXBIYW5kbGVyKGEsIGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5kZWxldGUoaWQpICYmIHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuRW5kSGFuZGxlcihlYywgc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbn07XG5cbi8vIFNvIHRoYXQgd2UgY2FuIHRha2UgSUFyZ3VtZW50cyBhcyBjaGlsZHJlblxuaW50ZXJmYWNlIFN0YXRpY0FycmF5PFQ+IHtcbiAgICBbaW5kZXg6IG51bWJlcl06IFQ7XG4gICAgbGVuZ3RoOiBudW1iZXI7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxUPjtcbn07XG5cbnR5cGUgQ2hpbGRDb25zdHJhaW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmc+ID0gRWxlbWVudDxMYXlvdXRUeXBlLCBhbnksIGFueT4gfCBTdGF0aWNBcnJheTxFbGVtZW50PExheW91dFR5cGUsIGFueSwgYW55Pj4gfCB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGluaXRUb3VjaEdlc3R1cmU8U3RhdGU+KGU6IEVsZW1lbnQ8YW55LCBhbnksIFN0YXRlPik6IFRvdWNoR2VzdHVyZTxTdGF0ZT4ge1xuICAgIGlmIChlLnRvdWNoR2VzdHVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBlLnRvdWNoR2VzdHVyZTtcbiAgICB9XG4gICAgaWYgKGUub25Ub3VjaEJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaE1vdmVIYW5kbGVyICE9PSB1bmRlZmluZWQgfHwgZS5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVG91Y2ggZ2VzdHVyZXMgYWxyZWFkeSBjYXB0dXJlZCcpO1xuICAgIH1cbiAgICBjb25zdCB0ZyA9IG5ldyBUb3VjaEdlc3R1cmUoKTtcbiAgICBlLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSB0Zy5vblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIGUub25Ub3VjaE1vdmVIYW5kbGVyID0gdGcub25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIGUub25Ub3VjaEVuZEhhbmRsZXIgPSB0Zy5vblRvdWNoRW5kSGFuZGxlcjtcbiAgICByZXR1cm4gdGc7XG59XG5cbmZ1bmN0aW9uIGNsYW1wKHg6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoeCA8IG1pbikge1xuICAgICAgICByZXR1cm4gbWluO1xuICAgIH0gZWxzZSBpZiAoeCA+IG1heCkge1xuICAgICAgICByZXR1cm4gbWF4O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbn1cblxuY2xhc3MgRWxlbWVudDxMYXlvdXRUeXBlIGV4dGVuZHMgc3RyaW5nLCBDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxzdHJpbmc+LCBTdGF0ZT4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHN0YXRlOiBTdGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKGxheW91dFR5cGU6IExheW91dFR5cGUsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB9XG5cbiAgICBvbkRyYXdIYW5kbGVyPzogT25EcmF3SGFuZGxlcjxTdGF0ZT47XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIGlmICh0aGlzLm9uRHJhd0hhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbkRyYXcgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyPzogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaE1vdmVIYW5kbGVyPzogT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcblxuICAgIHRvdWNoR2VzdHVyZT86IFRvdWNoR2VzdHVyZTxTdGF0ZT47XG4gICAgb25UYXAoaGFuZGxlcjogT25UYXBIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuQmVnaW4oaGFuZGxlcjogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5CZWdpbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuRW5kKGhhbmRsZXI6IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbkVuZCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuRW5kSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICB0b3VjaFNpbmsoKTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb25EZXRhY2hIYW5kbGVyPzogT25EZXRhY2hIYW5kbGVyPFN0YXRlPiB8IEFycmF5PE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4+O1xuICAgIG9uRGV0YWNoKGhhbmRsZXI6IE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSB1bmRlZmluZWQgfHwgdGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IGhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRoaXMub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyLmluZGV4T2YoaGFuZGxlcikgPCAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIucHVzaChoYW5kbGVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gW3RoaXMub25EZXRhY2hIYW5kbGVyLCBoYW5kbGVyXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcmVtb3ZlT25EZXRhY2goaGFuZGxlcjogT25EZXRhY2hIYW5kbGVyPFN0YXRlPik6IHZvaWQge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSB0aGlzLm9uRGV0YWNoSGFuZGxlci5pbmRleE9mKGhhbmRsZXIpO1xuICAgICAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgICAgIC8vIENvcHkgdGhlIGFycmF5LCBzbyB0aGF0IGl0J3Mgc2FmZSB0byBjYWxsIHRoaXMgaW5zaWRlIGFuIE9uRGV0YWNoSGFuZGxlci5cbiAgICAgICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IFsuLi50aGlzLm9uRGV0YWNoSGFuZGxlcl0uc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSBoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGNoaWxkOiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIGluZGV4PzogbnVtYmVyKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBuZXcgQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4oZS5jaGlsZC5sZW5ndGggKyAxKTtcbiAgICBsZXQgaSA9IDA7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAoOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuW2orK10gPSBjaGlsZDtcbiAgICAgICAgfVxuICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICB9XG4gICAgaWYgKGogPT09IGkpIHtcbiAgICAgICAgY2hpbGRyZW5bal0gPSBjaGlsZDtcbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xuICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbn1cblxuZnVuY3Rpb24gY2FsbERldGFjaExpc3RlbmVycyhyb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGUub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBoYW5kbGVyIG9mIGUub25EZXRhY2hIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChlLm9uRGV0YWNoSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBlLm9uRGV0YWNoSGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5lLmNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGluZGV4OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+KGUuY2hpbGQubGVuZ3RoIC0gMSk7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnMoZS5jaGlsZFtpXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG4gICAgZWMucmVxdWVzdExheW91dCgpO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV1BIUExheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+LCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PCd3cGhwJywgQ2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHAnLCBzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdQSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3BocycsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3cGhzJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdTSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBXU0hTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dzaHMnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3NocycsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmV4cG9ydCB0eXBlIExheW91dEhhc1dpZHRoQW5kSGVpZ2h0ID0gV1NIU0xheW91dDxhbnksIGFueT47XG5leHBvcnQgdHlwZSBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0ID0gV1BIUExheW91dDxhbnksIGFueT47XG5cbmZ1bmN0aW9uIGRyYXdFbGVtZW50VHJlZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgcm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmIChlLm9uRHJhd0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGUub25EcmF3SGFuZGxlcihjdHgsIGUsIGVjLCB2cCwgZS5zdGF0ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIC8vIFB1c2ggbGFzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgZHJhdyBpdCBsYXN0LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGUuY2hpbGQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGRbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIGVjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgY3R4LmZpbGxSZWN0KHJvb3QubGVmdCwgcm9vdC50b3AsIHJvb3Qud2lkdGgsIHJvb3QuaGVpZ2h0KTtcbiAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCByb290LCBlYywgdnApO1xufVxuXG50eXBlIEhhc1RvdWNoSGFuZGxlcnM8U3RhdGU+ID0ge1xuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcjogT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+O1xufSAmIEVsZW1lbnQ8YW55LCBhbnksIFN0YXRlPjtcblxuZnVuY3Rpb24gZmluZFRvdWNoVGFyZ2V0KHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIHA6IFBvaW50MkQpOiB1bmRlZmluZWQgfCBIYXNUb3VjaEhhbmRsZXJzPGFueT4ge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIGNvbnN0IHggPSBwWzBdO1xuICAgIGNvbnN0IHkgPSBwWzFdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55LCBhbnk+O1xuICAgICAgICBpZiAoeCA8IGUubGVmdCB8fCB4ID49IGUubGVmdCArIGUud2lkdGggfHwgeSA8IGUudG9wIHx8IHkgPj0gZS50b3AgKyBlLmhlaWdodCkge1xuICAgICAgICAgICAgLy8gT3V0c2lkZSBlLCBza2lwLiAgXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgJiYgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBlIGFzIEhhc1RvdWNoSGFuZGxlcnM8YW55PjsgLy8gVE9ETzogV2h5IGNhbid0IHR5cGUgaW5mZXJlbmNlIGZpZ3VyZSB0aGlzIG91dD9cbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBmaXJzdCBjaGlsZCBvbiBmaXJzdCwgc28gd2UgdmlzaXQgbGFzdCBjaGlsZCBsYXN0LlxuICAgICAgICAgICAgLy8gVGhlIGxhc3QgY2hpbGQgKHRoZSBvbmUgb24gdG9wKSBzaG91bGQgb3ZlcnJpZGUgcHJldmlvdXMgY2hpbGRyZW4ncyB0YXJnZXQuXG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG50eXBlIFRBUkdFVF9ST09UID0gMTtcbmNvbnN0IFRBUkdFVF9ST09UID0gMTtcbnR5cGUgVEFSR0VUX05PTkUgPSAyO1xuY29uc3QgVEFSR0VUX05PTkUgPSAyO1xuXG5jbGFzcyBSb290RWxlbWVudENvbnRleHQgaW1wbGVtZW50cyBFbGVtZW50Q29udGV4dCB7XG4gICAgcHJpdmF0ZSBsYXlvdXRSZXF1ZXN0ZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBsYXlvdXRFdmFsdWF0aW5nOiBib29sZWFuO1xuICAgIHByaXZhdGUgZHJhd1JlcXVlc3RlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIGRyYXdFdmFsdWF0aW5nOiBib29sZWFuO1xuICAgIHByaXZhdGUgdnA6IExheW91dEJveDtcbiAgICBwcml2YXRlIGV2YWx1YXRlOiAoKSA9PiB2b2lkO1xuICAgIHByaXZhdGUgZXZhbHVhdGVUb2tlbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgbmV4dFRpbWVySUQ6IG51bWJlcjtcbiAgICBwcml2YXRlIHRpbWVyczogTWFwPG51bWJlciwgeyBoYW5kbGVyOiBUaW1lckhhbmRsZXIsIHN0YXJ0OiBudW1iZXIsIGR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQgfT47XG4gICAgcHJpdmF0ZSBjYWxsVGltZXJzVG9rZW46IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIGNhbGxUaW1lcnM6IChub3c6IG51bWJlcikgPT4gdm9pZDtcblxuICAgIGNvbnN0cnVjdG9yKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBXUEhQTGF5b3V0PGFueSwgYW55Piwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5sYXlvdXRSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5sYXlvdXRFdmFsdWF0aW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZHJhd1JlcXVlc3RlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyYXdFdmFsdWF0aW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMudnAgPSB7IGxlZnQ6IDAsIHRvcDogMCwgd2lkdGgsIGhlaWdodCB9O1xuICAgICAgICB0aGlzLmV2YWx1YXRlID0gKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5ldmFsdWF0ZVRva2VuID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKHRoaXMubGF5b3V0UmVxdWVzdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXlvdXRSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLmxheW91dEV2YWx1YXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJvb3QubGF5b3V0KHRoaXMudnAubGVmdCwgdGhpcy52cC50b3AsIHRoaXMudnAud2lkdGgsIHRoaXMudnAuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3UmVxdWVzdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxheW91dEV2YWx1YXRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kcmF3UmVxdWVzdGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3UmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3RXZhbHVhdGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4LCByb290LCB0aGlzLCB0aGlzLnZwKTtcbiAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdFdmFsdWF0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmV2YWx1YXRlVG9rZW4gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMubmV4dFRpbWVySUQgPSAwO1xuICAgICAgICB0aGlzLnRpbWVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5jYWxsVGltZXJzVG9rZW4gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuY2FsbFRpbWVycyA9IChub3c6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmluaXNoZWQgOiBBcnJheTxudW1iZXI+ID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRpbWVycykge1xuICAgICAgICAgICAgICAgIGlmICh2LnN0YXJ0ID4gbm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBoYW5kbGVycyBzb21ldGltZXMgcmVjZWl2ZSBhIHRpbWVzdGFtcCBlYXJsaWVyXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoYW4gcGVyZm9ybWFuY2Uubm93KCkgY2FsbGVkIHdoZW4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHdhcyBjYWxsZWQuXG4gICAgICAgICAgICAgICAgICAgIC8vIFNvLCBpZiB3ZSBzZWUgYSB0aW1lIGludmVyc2lvbiwganVzdCBtb3ZlIHRoZSBzdGFydCB0aW1lIGVhcmx5LlxuICAgICAgICAgICAgICAgICAgICB2LnN0YXJ0ID0gbm93O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodi5kdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmIHYuZHVyYXRpb24gPD0gbm93IC0gdi5zdGFydCkge1xuICAgICAgICAgICAgICAgICAgICB2LmhhbmRsZXIodi5kdXJhdGlvbiwgdGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGZpbmlzaGVkLnB1c2goayk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdi5oYW5kbGVyKG5vdyAtIHYuc3RhcnQsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBmaW5pc2hlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGltZXJzLmRlbGV0ZShrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnRpbWVycy5zaXplICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYWxsVGltZXJzVG9rZW4gPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5jYWxsVGltZXJzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jYWxsVGltZXJzVG9rZW4gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmVxdWVzdERyYXcoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmRyYXdFdmFsdWF0aW5nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkcmF3IHJlcXVlc3RlZCBkdXJpbmcgZHJhdyBldmFsdWF0aW9uXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmxheW91dEV2YWx1YXRpbmcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImxheW91dCByZXF1ZXN0ZWQgZHVyaW5nIGRyYXcgZXZhbHVhdGlvblwiKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kcmF3UmVxdWVzdGVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kcmF3UmVxdWVzdGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKHRoaXMuZXZhbHVhdGVUb2tlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmFsdWF0ZVRva2VuID0gc2V0VGltZW91dCh0aGlzLmV2YWx1YXRlLCAwKTtcbiAgICB9XG4gICAgcmVxdWVzdExheW91dCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMubGF5b3V0RXZhbHVhdGluZykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibGF5b3V0IHJlcXVlc3RlZCBkdXJpbmcgbGF5b3V0IGV2YWx1YXRpb25cIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubGF5b3V0UmVxdWVzdGVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5sYXlvdXRSZXF1ZXN0ZWQgPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5ldmFsdWF0ZVRva2VuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2YWx1YXRlVG9rZW4gPSBzZXRUaW1lb3V0KHRoaXMuZXZhbHVhdGUsIDApO1xuICAgIH1cblxuICAgIHRpbWVyKGhhbmRsZXI6IFRpbWVySGFuZGxlciwgZHVyYXRpb246IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG4gICAgICAgIGNvbnN0IGlkID0gdGhpcy5uZXh0VGltZXJJRDtcbiAgICAgICAgdGhpcy5uZXh0VGltZXJJRCsrO1xuICAgICAgICB0aGlzLnRpbWVycy5zZXQoaWQsIHsgaGFuZGxlciwgc3RhcnQ6IHBlcmZvcm1hbmNlLm5vdygpLCBkdXJhdGlvbiB9KTtcbiAgICAgICAgaWYgKHRoaXMuY2FsbFRpbWVyc1Rva2VuID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2FsbFRpbWVyc1Rva2VuID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuY2FsbFRpbWVycyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIGNsZWFyVGltZXIoaWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnRpbWVycy5kZWxldGUoaWQpO1xuICAgICAgICBpZiAodGhpcy50aW1lcnMuc2l6ZSA9PT0gMCAmJiB0aGlzLmNhbGxUaW1lcnNUb2tlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLmNhbGxUaW1lcnNUb2tlbik7XG4gICAgICAgICAgICB0aGlzLmNhbGxUaW1lcnNUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHpvb20oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgc2V0Vmlld3BvcnQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy52cC53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLnZwLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZXZhbHVhdGVUb2tlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuZXZhbHVhdGVUb2tlbik7XG4gICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICB9XG59O1xuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCB7XG4gICAgZWM6IFJvb3RFbGVtZW50Q29udGV4dDtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT47XG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICAvL2N0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHJlc2l6ZTogUmVzaXplT2JzZXJ2ZXI7XG5cbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVyczxhbnk+IHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldERldGFjaGVkOiBPbkRldGFjaEhhbmRsZXI8YW55PjtcbiAgICBwcml2YXRlIHRvdWNoU3RhcnQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7IFxuICAgIHByaXZhdGUgdG91Y2hNb3ZlOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgdG91Y2hFbmQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiLCB7YWxwaGE6IGZhbHNlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVjID0gbmV3IFJvb3RFbGVtZW50Q29udGV4dChjdHgsIGNoaWxkLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICBjYW52YXMud2lkdGggPSBjYW52YXMud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGNhbnZhcy5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgY3R4LnRyYW5zZm9ybSh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCwgd2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDApO1xuICAgICAgICB0aGlzLmVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMucmVzaXplID0gbmV3IFJlc2l6ZU9ic2VydmVyKChlbnRyaWVzOiBSZXNpemVPYnNlcnZlckVudHJ5W10pID0+IHtcbiAgICAgICAgICAgIGlmIChlbnRyaWVzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVzaXplT2JzZXJ2ZXIgZXhwZWN0cyAxIGVudHJ5LCBnb3QgJHtlbnRyaWVzLmxlbmd0aH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBlbnRyaWVzWzBdLmNvbnRlbnRSZWN0O1xuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gY29udGVudC53aWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY2FudmFzLmhlaWdodCA9IGNvbnRlbnQuaGVpZ2h0ICogd2luZG93LmRldmljZVBpeGVsUmF0aW87XG4gICAgICAgICAgICBjdHgudHJhbnNmb3JtKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwLCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCk7XG4gICAgICAgICAgICB0aGlzLmVjLnNldFZpZXdwb3J0KGNvbnRlbnQud2lkdGgsIGNvbnRlbnQuaGVpZ2h0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVzaXplLm9ic2VydmUoY2FudmFzLCB7Ym94OiBcImRldmljZS1waXhlbC1jb250ZW50LWJveFwifSk7XG5cbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCA9IChlOiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSA9PiB7XG4gICAgICAgICAgICBsZXQgZm91bmRUYXJnZXQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMudG91Y2hUYXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT09IGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaywgVEFSR0VUX05PTkUpO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZFRhcmdldCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmb3VuZFRhcmdldCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGl2ZSB0b3VjaCBmb3IgZGV0YWNoZWQgZWxlbWVudFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaFN0YXJ0ID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHA6IFBvaW50MkQgPSBbdC5jbGllbnRYLCB0LmNsaWVudFldO1xuICAgICAgICAgICAgICAgIHRhcmdldCA9IGZpbmRUb3VjaFRhcmdldCh0aGlzLmNoaWxkLCBwKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdG8gYWN0aXZlIHRhcmdldHMgbWFwIHNvIHdlIGtub3cgYW5ib3V0IGl0LlxuICAgICAgICAgICAgICAgICAgICAvLyBBbGxvdyBkZWZhdWx0IGFjdGlvbiwgc28gZS5nLiBwYWdlIGNhbiBiZSBzY3JvbGxlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcih0LmlkZW50aWZpZXIsIHAsIHRoaXMuZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgLy8gU29tZSB0YXJnZXQgd2FzIHNvbWUgZm9yIGF0IGxlYXN0IHNvbWUgb2YgdGhlIHRvdWNoZXMuIERvbid0IGxldCBhbnl0aGluZ1xuICAgICAgICAgICAgICAgIC8vIGluIEhUTUwgZ2V0IHRoaXMgdG91Y2guXG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hNb3ZlID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzPGFueT4sIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBtb3ZlIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBkbyBhbnl0aGluZywgYXMgdGhlIHJvb3QgZWxlbWVudCBjYW4ndCBzY3JvbGwuXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCB0YXJnZXQgcHJvYmFibHkgZGVsZXRlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRzID0gdGFyZ2V0cy5nZXQodGFyZ2V0KSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdC5pZGVudGlmaWVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgcDogW3QuY2xpZW50WCwgdC5jbGllbnRZXSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMuc2V0KHRhcmdldCwgdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHNdIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHRzLCB0aGlzLmVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hFbmQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBuZXcgTWFwKHRoaXMudG91Y2hUYXJnZXRzKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVkLmRlbGV0ZSh0LmlkZW50aWZpZXIpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpZCwgdGFyZ2V0XSBvZiByZW1vdmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSBUQVJHRVRfUk9PVCAmJiB0YXJnZXQgIT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoRW5kSGFuZGxlcihpZCwgdGhpcy5lYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnJlc2l6ZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuZWMuZGlzY29ubmVjdCgpO1xuICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKHRoaXMuY2hpbGQpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgfVxufTtcblxuY2xhc3MgU2Nyb2xsRWxlbWVudENvbnRleHQgaW1wbGVtZW50cyBFbGVtZW50Q29udGV4dCB7XG4gICAgcGFyZW50OiBFbGVtZW50Q29udGV4dCB8IHVuZGVmaW5lZDtcbiAgICBzY3JvbGw6IFNjcm9sbExheW91dDtcblxuICAgIGNvbnN0cnVjdG9yKHNjcm9sbDogU2Nyb2xsTGF5b3V0KSB7XG4gICAgICAgIHRoaXMucGFyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLnNjcm9sbCA9IHNjcm9sbDtcbiAgICB9XG5cbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnRDb250ZXh0LnJlcXVlc3REcmF3IGNhbGxlZCBvdXRzaWRlIG9mIGNhbGxiYWNrXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucGFyZW50LnJlcXVlc3REcmF3KCk7XG4gICAgfVxuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnBhcmVudCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50Q29udGV4dC5yZXF1ZXN0TGF5b3V0IGNhbGxlZCBvdXRzaWRlIG9mIGNhbGxiYWNrXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucGFyZW50LnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG4gICAgdGltZXIoaGFuZGxlcjogVGltZXJIYW5kbGVyLCBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMucGFyZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnRDb250ZXh0LnRpbWVyIGNhbGxlZCBvdXRzaWRlIG9mIGNhbGxiYWNrXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudC50aW1lcihoYW5kbGVyLCBkdXJhdGlvbik7XG4gICAgfVxuICAgIGNsZWFyVGltZXIoaWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5wYXJlbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudENvbnRleHQuY2xlYXJUaW1lciBjYWxsZWQgb3V0c2lkZSBvZiBjYWxsYmFja1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyVGltZXIoaWQpO1xuICAgIH1cbiAgICB6b29tKCk6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLnBhcmVudCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50Q29udGV4dC56b29tIGNhbGxlZCBvdXRzaWRlIG9mIGNhbGxiYWNrXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudC56b29tKCkgKiB0aGlzLnNjcm9sbC56b29tO1xuICAgIH1cbn07XG5cbi8vIFRPRE86IEhhdmUgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIChzbyBoaWRlIGNoaWxkcmVuLCBhbmQgZm9yd2FyZCB0YXAvcGFuL2RyYXcgbWFudWFsbHksIHdpdGggdHJhbnNmb3JtKVxuLy8gVE9ETzogY29udmVydCB0byB1c2UgQWZmaW5lIHRyYW5zZm9ybS5cblxuY2xhc3MgU2Nyb2xsTGF5b3V0IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4ge1xuICAgIC8vIFNjcm9sbExheW91dCBoYXMgdG8gaW50ZXJjZXB0IGFsbCBldmVudHMgdG8gbWFrZSBzdXJlIGFueSBsb2NhdGlvbnMgYXJlIHVwZGF0ZWQgYnlcbiAgICAvLyB0aGUgc2Nyb2xsIHBvc2l0aW9uLCBzbyBjaGlsZCBpcyB1bmRlZmluZWQsIGFuZCBhbGwgZXZlbnRzIGFyZSBmb3J3YXJkZWQgdG8gc2Nyb2xsZXIuXG4gICAgc2Nyb2xsZXI6IFdTSFNMYXlvdXQ8YW55LCBhbnk+O1xuICAgIHNjcm9sbDogUG9pbnQyRDtcbiAgICB6b29tOiBudW1iZXI7XG4gICAgem9vbU1heDogbnVtYmVyO1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzPHVua25vd24+IHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFNjcm9sbDogTWFwPG51bWJlciwgeyBwcmV2OiBQb2ludDJELCBjdXJyOiBQb2ludDJEIH0+O1xuICAgIHByaXZhdGUgdG91Y2hUYXJnZXREZXRhY2hlZDogT25EZXRhY2hIYW5kbGVyPHVua25vd24+O1xuICAgIHByaXZhdGUgZWM6IFNjcm9sbEVsZW1lbnRDb250ZXh0O1xuXG4gICAgcHJpdmF0ZSBjbGFtcFpvb20oKSB7XG4gICAgICAgIGlmICh0aGlzLnNjcm9sbGVyLndpZHRoIDwgdGhpcy53aWR0aCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy53aWR0aCAvIHRoaXMuc2Nyb2xsZXIud2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IDwgdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pIHtcbiAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuaGVpZ2h0IC8gdGhpcy5zY3JvbGxlci5oZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuem9vbSA+IHRoaXMuem9vbU1heCkge1xuICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy56b29tTWF4O1xuICAgICAgICB9XG4gICAgfVxuICAgIHByaXZhdGUgY2xhbXBTY3JvbGwoKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsWzBdID0gY2xhbXAodGhpcy5zY3JvbGxbMF0sIDAsIHRoaXMuc2Nyb2xsZXIud2lkdGggLSB0aGlzLndpZHRoIC8gdGhpcy56b29tKTtcbiAgICAgICAgdGhpcy5zY3JvbGxbMV0gPSBjbGFtcCh0aGlzLnNjcm9sbFsxXSwgMCwgdGhpcy5zY3JvbGxlci5oZWlnaHQgLSB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVTY3JvbGwoKSB7XG4gICAgICAgIGNvbnN0IHRzID0gWy4uLnRoaXMudG91Y2hTY3JvbGwudmFsdWVzKCldO1xuICAgICAgICBpZiAodHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHNbMF07XG4gICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wMmModC5wcmV2KTtcbiAgICAgICAgICAgIGNvbnN0IGMgPSB0aGlzLnAyYyh0LmN1cnIpO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMF0gKz0gcFswXSAtIGNbMF07XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFsxXSArPSBwWzFdIC0gY1sxXTtcbiAgICAgICAgfSBlbHNlIGlmICh0cy5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBtID0gdGhpcy5wMmMoW1xuICAgICAgICAgICAgICAgICh0c1swXS5wcmV2WzBdICsgdHNbMV0ucHJldlswXSkgKiAwLjUsXG4gICAgICAgICAgICAgICAgKHRzWzBdLnByZXZbMV0gKyB0c1sxXS5wcmV2WzFdKSAqIDAuNSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgY29uc3QgcGQgPSBwb2ludERpc3RhbmNlKHRzWzBdLnByZXYsIHRzWzFdLnByZXYpO1xuICAgICAgICAgICAgY29uc3QgY2QgPSBwb2ludERpc3RhbmNlKHRzWzBdLmN1cnIsIHRzWzFdLmN1cnIpO1xuICAgICAgICAgICAgdGhpcy56b29tICo9IGNkIC8gcGQ7XG4gICAgICAgICAgICAvLyBDbGFtcCB6b29tIHNvIHdlIGNhbid0IHpvb20gb3V0IHRvbyBmYXIuXG4gICAgICAgICAgICB0aGlzLmNsYW1wWm9vbSgpO1xuICAgICAgICAgICAgY29uc3QgY20gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMF0gKyB0c1sxXS5jdXJyWzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclsxXSArIHRzWzFdLmN1cnJbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwbVswXSAtIGNtWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcG1bMV0gLSBjbVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsYW1wU2Nyb2xsKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwMmMocDogUG9pbnQyRCk6IFBvaW50MkQge1xuICAgICAgICBjb25zdCBzID0gdGhpcy5zY3JvbGw7XG4gICAgICAgIGNvbnN0IHNocmluayA9IDEgLyB0aGlzLnpvb207XG4gICAgICAgIC8vIFRPRE86IHRha2UgcGFyZW50IHJlY3QgaW50byBhY2NvdW50XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAocFswXSAtIHRoaXMubGVmdCkgKiBzaHJpbmsgKyBzWzBdLFxuICAgICAgICAgICAgKHBbMV0gLSB0aGlzLnRvcCkgKiBzaHJpbmsgKyBzWzFdLFxuICAgICAgICBdO1xuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc2Nyb2xsOiBQb2ludDJELCB6b29tOiBudW1iZXIsIHpvb21NYXg6IG51bWJlcikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICAgIHRoaXMuc2Nyb2xsZXIgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5zY3JvbGwgPSBzY3JvbGw7XG4gICAgICAgIHRoaXMuem9vbSA9IHpvb207XG4gICAgICAgIHRoaXMuem9vbU1heCA9IHpvb21NYXg7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoU2Nyb2xsID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmVjID0gbmV3IFNjcm9sbEVsZW1lbnRDb250ZXh0KHRoaXMpO1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQgPSAoZTogRWxlbWVudDxhbnksIGFueSwgYW55PikgPT4ge1xuICAgICAgICAgICAgbGV0IGZvdW5kVGFyZ2V0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRvdWNoVGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGlmICh2ID09PSBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGUucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmRUYXJnZXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZm91bmRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3RpdmUgdG91Y2ggZm9yIGRldGFjaGVkIGVsZW1lbnRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY3R4LnNhdmUoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLmxlZnQsIHRoaXMudG9wKTtcbiAgICAgICAgICAgIC8vIENsaXAgdG8gU2Nyb2xsIHZpZXdwb3J0LlxuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4Lm1vdmVUbygwLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8oMCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmNsaXAoKTtcbiAgICAgICAgICAgIGN0eC5zY2FsZSh0aGlzLnpvb20sIHRoaXMuem9vbSk7XG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKC10aGlzLnNjcm9sbFswXSwgLXRoaXMuc2Nyb2xsWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IHZwU2Nyb2xsZXIgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogdGhpcy5zY3JvbGxbMF0sXG4gICAgICAgICAgICAgICAgdG9wOiB0aGlzLnNjcm9sbFsxXSxcbiAgICAgICAgICAgICAgICB3aWR0aDogdGhpcy53aWR0aCAvIHRoaXMuem9vbSxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuZWMucGFyZW50ID0gZWM7XG4gICAgICAgICAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLnNjcm9sbGVyLCB0aGlzLmVjLCB2cFNjcm9sbGVyKTtcbiAgICAgICAgICAgIHRoaXMuZWMucGFyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgLy8gVE9ETzogcmVzdG9yZSB0cmFuc2Zvcm0gaW4gYSBmaW5hbGx5P1xuICAgICAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3AgPSB0aGlzLnAyYyhwcCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5zY3JvbGxlciwgY3ApO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIG51bGwgdG8gYWN0aXZlIHRvdWNoZXMsIHNvIHdlIGtub3cgdGhleSBzaG91bGQgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTY3JvbGwuc2V0KGlkLCB7IHByZXY6IHBwLCBjdXJyOiBwcCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgIHRoaXMuZWMucGFyZW50ID0gZWM7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hCZWdpbkhhbmRsZXIoaWQsIGNwLCB0aGlzLmVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgIHRoaXMuZWMucGFyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzPGFueT4sIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b3VjaCBtb3ZlIElEICR7dC5pZH1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2Nyb2xsID0gdGhpcy50b3VjaFNjcm9sbC5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzY3JvbGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBtb3ZlIHdpdGggSUQgJHt0LmlkfSBoYXMgdGFyZ2V0ID09PSBUQVJHRVRfUk9PVCwgYnV0IGlzIG5vdCBpbiB0b3VjaFNjcm9sbGApXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLnByZXYgPSBzY3JvbGwuY3VycjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsLmN1cnIgPSB0LnA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCB0YXJnZXQgZGVsZXRlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0dHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0dHMucHVzaCh0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0dHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHNjcm9sbCBwb3NpdGlvbi5cbiAgICAgICAgICAgIHRoaXMudXBkYXRlU2Nyb2xsKCk7XG5cbiAgICAgICAgICAgIC8vIEZvcndhcmQgdG91Y2ggbW92ZXMuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0YXJnZXQsIHR0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHR0c1tpXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0dHNbaV0uaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiB0aGlzLnAyYyh0dHNbaV0ucCksXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuZWMucGFyZW50ID0gZWM7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIHRoaXMuZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5lYy5wYXJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b3VjaCBlbmQgSUQgJHtpZH1gKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy50b3VjaFNjcm9sbC5kZWxldGUoaWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIElEICR7aWR9IGhhcyB0YXJnZXQgVEFSR0VUX1JPT1QsIGJ1dCBpcyBub3QgaW4gdG91Y2hTY3JvbGxgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAvLyBEbyBub3RoaW5nLCB0YXJldCB3YXMgZGVsZXRlZC5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lYy5wYXJlbnQgPSBlYztcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzLmVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVjLnBhcmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IG90aGVyIGhhbmRsZXJzIG5lZWQgZm9yd2FyZGluZy5cbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgdGhpcy5jbGFtcFpvb20oKTtcbiAgICAgICAgdGhpcy5jbGFtcFNjcm9sbCgpO1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIubGF5b3V0KDAsIDApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjcm9sbChjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHNjcm9sbD86IFBvaW50MkQsIHpvb20/OiBudW1iZXIsIHpvb21NYXg/OiBudW1iZXIpOiBTY3JvbGxMYXlvdXQge1xuICAgIC8vIE5COiBzY2FsZSBvZiAwIGlzIGludmFsaWQgYW55d2F5cywgc28gaXQncyBPSyB0byBiZSBmYWxzeS5cbiAgICByZXR1cm4gbmV3IFNjcm9sbExheW91dChjaGlsZCwgc2Nyb2xsIHx8IFswLCAwXSwgem9vbSB8fCAxLCB6b29tTWF4IHx8IDEwMCk7XG59XG5cbi8vIFRPRE86IHNjcm9sbHgsIHNjcm9sbHlcblxuY2xhc3MgQm94TGF5b3V0PFN0YXRlLCBDaGlsZCBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+IHwgdW5kZWZpbmVkPiBleHRlbmRzIFdTSFNMYXlvdXQ8Q2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICBpZiAodGhpcy5jaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogV1NIU0xheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogV1NIU0xheW91dDxhbnksIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlKTogV1NIU0xheW91dDxhbnksIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlyc3Q/OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzZWNvbmQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT4gfCBXU0hTTGF5b3V0PGFueSwgdW5kZWZpbmVkPiB7XG4gICAgaWYgKHNlY29uZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaXJzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4od2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8dW5kZWZpbmVkLCBXUEhQTGF5b3V0PGFueSwgYW55Pj4od2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBmaXJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDxTdGF0ZSwgdW5kZWZpbmVkPih3aWR0aCwgaGVpZ2h0LCBmaXJzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PFN0YXRlLCBXUEhQTGF5b3V0PGFueSwgYW55Pj4od2lkdGgsIGhlaWdodCwgZmlyc3QgYXMgU3RhdGUsIHNlY29uZCk7XG4gICAgICAgIC8vIFRPRE86IHRoZSBzdGF0ZSBzaG91bGQgdHlwZS1jaGVjay5cbiAgICB9XG59XG5cbmNsYXNzIFdQSFBCb3JkZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBib3JkZXI6IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGNvbnN0cnVjdG9yKGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55PiwgYm9yZGVyOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIHN0YXRlOiBTdGF0ZSkge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLmJvcmRlciA9IGJvcmRlcjtcbiAgICAgICAgdGhpcy5zdHlsZSA9IHN0eWxlO1xuXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgICAgIGNvbnN0IGIyID0gYiAqIDAuNTtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHRoaXMuc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIGIyLCBib3gudG9wICsgYjIsIGJveC53aWR0aCAtIGIsIGJveC5oZWlnaHQgLSBiKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNvbnN0IGIgPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCArIGIsIHRvcCArIGIsIHdpZHRoIC0gYiAqIDIsIGhlaWdodCAtIGIgKiAyKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3JkZXI8U3RhdGU+KHdpZHRoOiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Piwgc3RhdGU/OiBTdGF0ZSk6IFdQSFBMYXlvdXQ8YW55LCBhbnk+IHtcbiAgICBpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBCb3JkZXJMYXlvdXQ8dW5kZWZpbmVkPihjaGlsZCwgd2lkdGgsIHN0eWxlLCB1bmRlZmluZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgV1BIUEJvcmRlckxheW91dDxTdGF0ZT4oY2hpbGQsIHdpZHRoLCBzdHlsZSwgc3RhdGUpO1xuICAgIH1cbn1cblxuY2xhc3MgRmlsbExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PHVuZGVmaW5lZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUpIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZpbGwoKTogRmlsbExheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZpbGw8U3RhdGU+KHN0YXRlOiBTdGF0ZSk6IEZpbGxMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEZpbGw8U3RhdGU+KHN0YXRlPzogU3RhdGUpOiBGaWxsTGF5b3V0PHVuZGVmaW5lZD4gfCBGaWxsTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGaWxsTGF5b3V0PHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEZpbGxMYXlvdXQ8U3RhdGU+KHN0YXRlKTtcbiAgICB9XG59XG5cbmNsYXNzIENlbnRlckxheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBDZW50ZXJMYXlvdXQ8U3RhdGU+IHtcbiAgICByZXR1cm4gbmV3IENlbnRlckxheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbn1cblxuY2xhc3MgSENlbnRlckhQTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIUExheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgSENlbnRlckhTTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gbGVmdCArICh3aWR0aCAtIGNoaWxkLndpZHRoKSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogSENlbnRlckhTTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIUExheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIUExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+IHwgV1NIUExheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIU0xheW91dDxTdGF0ZT4gfCBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dzaHAnKSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhQTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgSENlbnRlckhTTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgVkNlbnRlcldQTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCwgd2lkdGgpO1xuICAgIH1cbn07XG5cbmNsYXNzIFZDZW50ZXJXU0xheW91dDxTdGF0ZT4gZXh0ZW5kcyBXU0hQTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMud2lkdGggPSBjaGlsZC53aWR0aDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXUEhTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldQTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4gfCBXUEhTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldTTGF5b3V0PFN0YXRlPiB8IFZDZW50ZXJXUExheW91dDxTdGF0ZT4ge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3BocycpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRmxleExheW91dDxTdGF0ZSwgQ2hpbGQgZXh0ZW5kcyBXUEhQTGF5b3V0PGFueSwgYW55PiB8IHVuZGVmaW5lZD4gZXh0ZW5kcyBFbGVtZW50PCdmbGV4JywgQ2hpbGQsIFN0YXRlPiB7XG4gICAgc2l6ZTogbnVtYmVyO1xuICAgIGdyb3c6IG51bWJlcjtcbiAgICBjb25zdHJ1Y3RvcihzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ2ZsZXgnLCBzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLnNpemUgPSBzaXplO1xuICAgICAgICB0aGlzLmdyb3cgPSBncm93O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDpudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgaWYgKHRoaXMuY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBGbGV4KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyKTogRmxleExheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gRmxleDxTdGF0ZT4oc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSk6IEZsZXhMYXlvdXQ8U3RhdGUsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gRmxleChzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDx1bmRlZmluZWQsIFdQSFBMYXlvdXQ8YW55LCBhbnk+PjtcbmV4cG9ydCBmdW5jdGlvbiBGbGV4PFN0YXRlPihzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBGbGV4TGF5b3V0PFN0YXRlLCBXUEhQTGF5b3V0PGFueSwgYW55Pj47XG5leHBvcnQgZnVuY3Rpb24gRmxleDxTdGF0ZT4oc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIGZpcnN0PzogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55Piwgc2Vjb25kPzogV1BIUExheW91dDxhbnksIGFueT4pOiBGbGV4TGF5b3V0PGFueSwgYW55PiB7XG4gICAgaWYgKGZpcnN0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKHNlY29uZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEZsZXhMYXlvdXQoc2l6ZSwgZ3JvdywgZmlyc3QsIHNlY29uZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmlyc3QgaW5zdGFuY2VvZiBXUEhQTGF5b3V0KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEZsZXhMYXlvdXQoc2l6ZSwgZ3JvdywgdW5kZWZpbmVkLCBmaXJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEZsZXhMYXlvdXQoc2l6ZSwgZ3JvdywgZmlyc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEZsZXhMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+KHNpemUsIGdyb3csIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICB9XG59XG5cbmNsYXNzIExlZnRGbGV4TGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgbGV0IHN1bVNpemUgPSAwO1xuICAgICAgICBsZXQgc3VtR3JvdyA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBzdW1TaXplICs9IGMuc2l6ZTtcbiAgICAgICAgICAgIHN1bUdyb3cgKz0gYy5ncm93O1xuICAgICAgICB9XG4gICAgICAgIGxldCBjaGlsZExlZnQgPSBsZWZ0O1xuICAgICAgICBsZXQgZXh0cmEgPSB3aWR0aCAtIHN1bVNpemU7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBsZXQgY2hpbGRXaWR0aCA9IGMuc2l6ZTtcbiAgICAgICAgICAgIGlmIChjLmdyb3cgIT09IDApIHtcbiAgICAgICAgICAgICAgICBjaGlsZFdpZHRoID0gTWF0aC5tYXgoY2hpbGRXaWR0aCArIGV4dHJhICogYy5ncm93IC8gc3VtR3JvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjLmxheW91dChjaGlsZExlZnQsIHRvcCwgY2hpbGRXaWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgICAgIGNoaWxkTGVmdCArPSBjaGlsZFdpZHRoO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIExlZnQoLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IExlZnRGbGV4TGF5b3V0PHVuZGVmaW5lZD5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0PFN0YXRlPihzdGF0ZTogU3RhdGUsIC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBMZWZ0RmxleExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdDxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgRmxleExheW91dDxhbnksIGFueT4sIC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBMZWZ0RmxleExheW91dDxhbnk+IHtcbiAgICBpZiAoZmlyc3QgaW5zdGFuY2VvZiBGbGV4TGF5b3V0KSB7XG4gICAgICAgIHJldHVybiBuZXcgTGVmdEZsZXhMYXlvdXQodW5kZWZpbmVkLCBbZmlyc3QsIC4uLmNoaWxkcmVuXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMZWZ0RmxleExheW91dChmaXJzdCwgY2hpbGRyZW4pO1xuICAgIH1cbn1cblxuY2xhc3MgQm90dG9tRmxleExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGxldCBzdW1TaXplID0gMDtcbiAgICAgICAgbGV0IHN1bUdyb3cgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgc3VtU2l6ZSArPSBjLnNpemU7XG4gICAgICAgICAgICBzdW1Hcm93ICs9IGMuZ3JvdztcbiAgICAgICAgfVxuICAgICAgICBsZXQgY2hpbGRUb3AgPSB0b3AgKyBoZWlnaHQ7XG4gICAgICAgIGxldCBleHRyYSA9IGhlaWdodCAtIHN1bVNpemU7XG4gICAgICAgIGZvciAoY29uc3QgYyBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBsZXQgY2hpbGRIZWlnaHQgPSBjLnNpemU7XG4gICAgICAgICAgICBpZiAoYy5ncm93ICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgY2hpbGRIZWlnaHQgKz0gZXh0cmEgKiBjLmdyb3cgLyBzdW1Hcm93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hpbGRUb3AgLT0gY2hpbGRIZWlnaHQ7XG4gICAgICAgICAgICBjLmxheW91dChsZWZ0LCBjaGlsZFRvcCwgd2lkdGgsIGNoaWxkSGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEJvdHRvbSguLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogQm90dG9tRmxleExheW91dDx1bmRlZmluZWQ+XG5leHBvcnQgZnVuY3Rpb24gQm90dG9tPFN0YXRlPihzdGF0ZTogU3RhdGUsIC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBCb3R0b21GbGV4TGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3R0b208U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IEZsZXhMYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogQm90dG9tRmxleExheW91dDxhbnk+IHtcbiAgICBpZiAoZmlyc3QgaW5zdGFuY2VvZiBGbGV4TGF5b3V0KSB7XG4gICAgICAgIHJldHVybiBuZXcgQm90dG9tRmxleExheW91dCh1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEJvdHRvbUZsZXhMYXlvdXQoZmlyc3QsIGNoaWxkcmVuKTtcbiAgICB9XG59XG5cbnR5cGUgRGVidWdUb3VjaFN0YXRlID0ge1xuICAgIGZpbGw6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybixcbiAgICBzdHJva2U6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybixcbiAgICB0YXBzOiBBcnJheTxQb2ludDJEPixcbiAgICBwYW5zOiBBcnJheTxBcnJheTxQYW5Qb2ludD4+LFxufTtcblxuZnVuY3Rpb24gZGVidWdUb3VjaE9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBzdGF0ZTogRGVidWdUb3VjaFN0YXRlKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IHN0YXRlLmZpbGw7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gc3RhdGUuc3Ryb2tlO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgZm9yIChjb25zdCB0YXAgb2Ygc3RhdGUudGFwcykge1xuICAgICAgICBjdHgubW92ZVRvKHRhcFswXSArIDE2LCB0YXBbMV0pO1xuICAgICAgICBjdHguZWxsaXBzZSh0YXBbMF0sIHRhcFsxXSwgMTYsIDE2LCAwLCAwLCAyICogTWF0aC5QSSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcHMgb2Ygc3RhdGUucGFucykge1xuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcHMpIHtcbiAgICAgICAgICAgIGN0eC5tb3ZlVG8ocC5wcmV2WzBdLCBwLnByZXZbMV0pO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyhwLmN1cnJbMF0sIHAuY3VyclsxXSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBkZWJ1Z1RvdWNoT25UYXAocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogRGVidWdUb3VjaFN0YXRlKSB7XG4gICAgc3RhdGUudGFwcy5wdXNoKHApO1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGRlYnVnVG91Y2hPblBhbihwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBEZWJ1Z1RvdWNoU3RhdGUpIHtcbiAgICBzdGF0ZS5wYW5zLnB1c2gocHMpO1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBEZWJ1Z1RvdWNoKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaWxsOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIHN0cm9rZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKTogQm94TGF5b3V0PERlYnVnVG91Y2hTdGF0ZSwgdW5kZWZpbmVkPiB7XG4gICAgY29uc3Qgc3RhdGUgPSB7XG4gICAgICAgIGZpbGwsXG4gICAgICAgIHN0cm9rZSxcbiAgICAgICAgdGFwczogW10sXG4gICAgICAgIHBhbnM6IFtdLFxuICAgIH07XG4gICAgcmV0dXJuIEJveDxEZWJ1Z1RvdWNoU3RhdGU+KHdpZHRoLCBoZWlnaHQsIHN0YXRlKVxuICAgICAgICAub25EcmF3KGRlYnVnVG91Y2hPbkRyYXcpXG4gICAgICAgIC5vblRhcChkZWJ1Z1RvdWNoT25UYXApXG4gICAgICAgIC5vblBhbihkZWJ1Z1RvdWNoT25QYW4pO1xufVxuXG5jbGFzcyBMYXllckxheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIExheWVyPFN0YXRlPihzdGF0ZTogU3RhdGUsIC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pOiBMYXllckxheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gTGF5ZXIoLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pik6IExheWVyTGF5b3V0PHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gTGF5ZXI8U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KTogTGF5ZXJMYXlvdXQ8U3RhdGU+IHwgTGF5ZXJMYXlvdXQ8dW5kZWZpbmVkPiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICByZXR1cm4gbmV3IExheWVyTGF5b3V0PHVuZGVmaW5lZD4odW5kZWZpbmVkLCBbZmlyc3QsIC4uLmNoaWxkcmVuXSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgTGF5ZXJMYXlvdXQ8U3RhdGU+KGZpcnN0LCBjaGlsZHJlbik7XG59XG5cbmV4cG9ydCB0eXBlIE9uU3dpdGNoU2VsZWN0ID0gKGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcblxuY2xhc3MgU3dpdGNoTGF5b3V0PEluZGljZXMgZXh0ZW5kcyBudW1iZXI+IGV4dGVuZHMgV1BIUExheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgSW5kaWNlcz4ge1xuICAgIHByaXZhdGUgY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+PjtcblxuICAgIGNvbnN0cnVjdG9yKGk6IEluZGljZXMsIGNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoaSwgY2hpbGRyZW5baV0pO1xuICAgICAgICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW47XG4gICAgfVxuXG4gICAgc2V0KGk6IEluZGljZXMsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBpZiAoaSAhPT0gdGhpcy5zdGF0ZSkge1xuICAgICAgICAgICAgY2FsbERldGFjaExpc3RlbmVycyh0aGlzLmNoaWxkKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN0YXRlID0gaTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IHRoaXMuY2hpbGRyZW5baV07XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBnZXQoKTogSW5kaWNlcyB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0YXRlO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgfVxufTtcblxudHlwZSBJbmRpY2VzPFQgZXh0ZW5kcyBhbnlbXT4gPSBFeGNsdWRlPFBhcnRpYWw8VD5bXCJsZW5ndGhcIl0sIFRbXCJsZW5ndGhcIl0+ICYgbnVtYmVyO1xuXG5leHBvcnQgZnVuY3Rpb24gU3dpdGNoPENoaWxkcmVuIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT5bXT4oaTogSW5kaWNlczxDaGlsZHJlbj4sIC4uLmNoaWxkcmVuOiBDaGlsZHJlbik6IFN3aXRjaExheW91dDxJbmRpY2VzPENoaWxkcmVuPj4ge1xuICAgIHJldHVybiBuZXcgU3dpdGNoTGF5b3V0KGksIGNoaWxkcmVuKTtcbn1cblxuZXhwb3J0IHR5cGUgTXV4S2V5ID0gc3RyaW5nIHwgbnVtYmVyIHwgc3ltYm9sO1xuXG5mdW5jdGlvbiBtdXhFbGVtZW50cyhlbmFibGVkOiBTZXQ8TXV4S2V5PiwgZXM6IEFycmF5PFtNdXhLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4ge1xuICAgIGNvbnN0IHJlcyA9IFtdO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIGVzKSB7XG4gICAgICAgIGlmIChlbmFibGVkLmhhcyhrKSkge1xuICAgICAgICAgICAgcmVzLnB1c2godik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuY2xhc3MgTXV4TGF5b3V0PEsgZXh0ZW5kcyBNdXhLZXk+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4sIHVuZGVmaW5lZD4ge1xuICAgIHByaXZhdGUgZW5hYmxlZDogU2V0PEs+O1xuICAgIHByaXZhdGUgbXV4OiBBcnJheTxbSywgV1BIUExheW91dDxhbnksIGFueT5dPjtcblxuICAgIGNvbnN0cnVjdG9yKGVuYWJsZWQ6IFNldDxLPiwgY2hpbGRyZW46IEFycmF5PFtLLCBXUEhQTGF5b3V0PGFueSwgYW55Pl0+KSB7XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCwgbXV4RWxlbWVudHMoZW5hYmxlZCwgY2hpbGRyZW4pKTtcbiAgICAgICAgdGhpcy5lbmFibGVkID0gZW5hYmxlZDtcbiAgICAgICAgdGhpcy5tdXggPSBjaGlsZHJlbjtcbiAgICB9XG5cbiAgICBzZXQoZWM6IEVsZW1lbnRDb250ZXh0LCAuLi5lbmFibGU6IEFycmF5PEs+KSB7XG4gICAgICAgIGNvbnN0IGVuYWJsZWQgPSBuZXcgU2V0KGVuYWJsZSk7XG4gICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMubXV4KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbmFibGVkLmhhcyhrKSAmJiAhZW5hYmxlZC5oYXMoaykpIHtcbiAgICAgICAgICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBtdXhFbGVtZW50cyh0aGlzLmVuYWJsZWQsIHRoaXMubXV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH1cblxuICAgIGdldCgpOiBTZXQ8Sz4ge1xuICAgICAgICByZXR1cm4gdGhpcy5lbmFibGVkO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBNdXg8S2V5IGV4dGVuZHMgTXV4S2V5LCBFbmFibGVkS2V5IGV4dGVuZHMgS2V5PihlbmFibGVkOiBBcnJheTxFbmFibGVkS2V5PiwgLi4uY2hpbGRyZW46IEFycmF5PFtLZXksIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBNdXhMYXlvdXQ8S2V5PiB7XG4gICAgcmV0dXJuIG5ldyBNdXhMYXlvdXQ8dHlwZW9mIGNoaWxkcmVuW251bWJlcl1bMF0+KG5ldyBTZXQoZW5hYmxlZCksIGNoaWxkcmVuKTtcbn1cblxuZXhwb3J0IGNsYXNzIFBvc2l0aW9uTGF5b3V0PENoaWxkIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT4gfCB1bmRlZmluZWQsIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8XCJwb3NcIiwgQ2hpbGQsIFN0YXRlPiB7XG4gICAgcmVxdWVzdExlZnQ6IG51bWJlcjtcbiAgICByZXF1ZXN0VG9wOiBudW1iZXI7XG4gICAgcmVxdWVzdFdpZHRoOiBudW1iZXI7XG4gICAgcmVxdWVzdEhlaWdodDogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKFwicG9zXCIsIHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMucmVxdWVzdExlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJlcXVlc3RUb3AgPSB0b3A7XG4gICAgICAgIHRoaXMucmVxdWVzdFdpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMucmVxdWVzdEhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KHBhcmVudDogTGF5b3V0Qm94KSB7XG4gICAgICAgIHRoaXMud2lkdGggPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RXaWR0aCwgcGFyZW50LndpZHRoKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gY2xhbXAodGhpcy5yZXF1ZXN0TGVmdCwgcGFyZW50LmxlZnQsIHBhcmVudC5sZWZ0ICsgcGFyZW50LndpZHRoIC0gdGhpcy53aWR0aCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0SGVpZ2h0LCBwYXJlbnQuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy50b3AgPSBjbGFtcCh0aGlzLnJlcXVlc3RUb3AsIHBhcmVudC50b3AsIHBhcmVudC50b3AgKyBwYXJlbnQuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpO1xuXG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KHRoaXMubGVmdCwgdGhpcy50b3AsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vIFRPRE86IHN1cHBvcnQgc3RhdGljYWxseSBzaXplZCBjaGlsZHJlbiwgXG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUpOiBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb248U3RhdGU+KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaXJzdD86IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIHNlY29uZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgaWYgKHNlY29uZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaXJzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIGZpcnN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCBTdGF0ZT4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCBmaXJzdCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIFN0YXRlPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGZpcnN0IGFzIFN0YXRlLCBzZWNvbmQpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERyYWdnYWJsZShsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pikge1xuICAgIGNvbnN0IGxheW91dCA9IG5ldyBQb3NpdGlvbkxheW91dDxhbnksIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIGNoaWxkKTtcbiAgICByZXR1cm4gbGF5b3V0Lm9uUGFuKChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgbGV0IGR4ID0gMDtcbiAgICAgICAgbGV0IGR5ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBkeCArPSBwLmN1cnJbMF0gLSBwLnByZXZbMF07XG4gICAgICAgICAgICBkeSArPSBwLmN1cnJbMV0gLSBwLnByZXZbMV07XG4gICAgICAgIH1cbiAgICAgICAgZHggLz0gcHMubGVuZ3RoO1xuICAgICAgICBkeSAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCArPSBkeDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgKz0gZHk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KS5vblBhbkVuZCgoKSA9PiB7XG4gICAgICAgIC8vIFRoZSByZXF1ZXN0ZWQgbG9jYXRpb24gY2FuIGJlIG91dHNpZGUgdGhlIGFsbG93ZWQgYm91bmRzIGlmIGRyYWdnZWQgb3V0c2lkZSxcbiAgICAgICAgLy8gYnV0IG9uY2UgdGhlIGRyYWcgaXMgb3Zlciwgd2Ugd2FudCB0byByZXNldCBpdCBzbyB0aGF0IGl0IGRvZXNuJ3Qgc3RhcnQgdGhlcmVcbiAgICAgICAgLy8gb25jZSBhIG5ldyBkcmFnIHN0YXJ0LlxuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgPSBsYXlvdXQubGVmdDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RUb3AgPSBsYXlvdXQudG9wO1xuICAgIH0pO1xufVxuXG5cbi8vIFRPRE86IGRvZXMgaXQgbWFrZSBzZW5zZSB0byBtYWtlIG90aGVyIGxheW91dCB0eXBlcz9cbi8vIGNsYXNzIFdTSFNSZWxhdGl2ZUxheW91dCBleHRlbmRzIFdTSFNMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+PiB7XG4vLyAgICAgY29uc3RydWN0b3Iod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4pIHtcbi8vICAgICAgICAgc3VwZXIoY2hpbGRyZW4pO1xuLy8gICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4vLyAgICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuLy8gICAgIH1cbi8vICAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuLy8gICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuLy8gICAgICAgICB0aGlzLnRvcCA9IHRvcDtcblxuLy8gICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbi8vICAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4vLyAgICAgICAgIH1cbi8vICAgICB9XG4vLyB9O1xuXG5jbGFzcyBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KHRoaXMgLyogTGF5b3V0Qm94ICovKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZSguLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFJlbGF0aXZlPFN0YXRlPihzdGF0ZTogU3RhdGUsIC4uLmNoaWxkcmVuOiBBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KTogV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZTxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgUG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+IHwgV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBSZWxhdGl2ZUxheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT4oZmlyc3QsIGNoaWxkcmVuKTtcbn1cbiJdfQ==