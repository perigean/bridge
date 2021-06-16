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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBbUJuRCxDQUFDO0FBb0JGLG1FQUFtRTtBQUNuRSx5RUFBeUU7QUFDekUsdUNBQXVDO0FBRXZDLE1BQU0sWUFBWTtJQVlkO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxFQUFVLEVBQUUsQ0FBVSxFQUFFLENBQWlCLEVBQUUsRUFBRTtZQUNyRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsRUFBZSxFQUFFLEVBQWtCLEVBQUUsS0FBWSxFQUFFLEVBQUU7WUFDNUUsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLElBQUksU0FBUyxFQUFFO29CQUNoQiw4REFBOEQ7b0JBQzlELElBQUksYUFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO3dCQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7NEJBQ2hCLElBQUksRUFBRSxDQUFD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MUYsMkJBQTJCO0FBQzNCLDhCQUE4QjtBQUM5QixnQ0FBZ0M7QUFDaEMsUUFBUTtBQUNSLGdEQUFnRDtBQUNoRCw0QkFBNEI7QUFDNUIsMEJBQTBCO0FBRTFCLDRDQUE0QztBQUM1QyxrREFBa0Q7QUFDbEQsWUFBWTtBQUNaLFFBQVE7QUFDUixLQUFLO0FBRUwsTUFBTSxrQkFBMEIsU0FBUSxVQUF3RDtJQUM1RixZQUFZLEtBQVksRUFBRSxRQUErQztRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUN0QztJQUNMLENBQUM7Q0FDSjtBQUdELE1BQU0sVUFBVSxRQUFRLENBQVEsS0FBdUMsRUFBRSxHQUFHLFFBQXlDO0lBQ2pILElBQUksS0FBSyxZQUFZLE9BQU8sRUFBRTtRQUMxQixPQUFPLElBQUksa0JBQWtCLENBQVksU0FBUyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQztLQUM3RTtJQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBUSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIERpY2sgMjAyMVxuXG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcblxuZXhwb3J0IHR5cGUgTGF5b3V0Qm94ID0ge1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogUmVwbGFjZSB1c2Ugb2YgYW55IHdpdGggdW5rbm93bi5cbi8vIFRPRE86IFBhc3MgRWxlbWVudENvbnRleHQgYWxvbmcgd2l0aCBsYXlvdXQsIHNvIHRoYXQgd2UgY2FuIGhhdmUgZHluYW1pYyBsYXlvdXRzLlxuXG5leHBvcnQgdHlwZSBUaW1lckhhbmRsZXIgPSAodDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxlbWVudENvbnRleHQge1xuICAgIHJlcXVlc3REcmF3KCk6IHZvaWQ7XG4gICAgcmVxdWVzdExheW91dCgpOiB2b2lkO1xuICAgIHRpbWVyKGhhbmRsZXI6IFRpbWVySGFuZGxlciwgZHVyYXRpb246IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlcjtcbiAgICBjbGVhclRpbWVyKGlkOiBudW1iZXIpOiB2b2lkO1xufTtcblxudHlwZSBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT4gPSAoZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBPbkRldGFjaEhhbmRsZXI8U3RhdGU+ID0gKGU6IEVsZW1lbnQ8YW55LCBhbnksIFN0YXRlPiwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgT25EcmF3SGFuZGxlcjxTdGF0ZT4gPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcblxudHlwZSBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPiA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbnR5cGUgVG91Y2hNb3ZlID0ge1xuICAgIHJlYWRvbmx5IGlkOiBudW1iZXI7XG4gICAgcmVhZG9ubHkgcDogUG9pbnQyRDtcbn07XG50eXBlIE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT4gPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xudHlwZSBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT4gPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5cbmV4cG9ydCB0eXBlIE9uVGFwSGFuZGxlcjxTdGF0ZT4gPSAocDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBQYW5Qb2ludCA9IHtcbiAgICBwcmV2OiBQb2ludDJEO1xuICAgIGN1cnI6IFBvaW50MkQ7XG59O1xuZXhwb3J0IHR5cGUgT25QYW5IYW5kbGVyPFN0YXRlPiA9IChwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbi8vIFRPRE86IFBhc3MgdG91Y2ggc2l6ZSBkb3duIHdpdGggdG91Y2ggZXZlbnRzIChpbnN0ZWFkIG9mIHNjYWxlPylcbi8vIElzIHRoYXQgZW5vdWdoPyBQcm9iYWJseSB3ZSB3aWxsIGFsd2F5cyB3YW50IGEgdHJhbnNvZm9ybWF0aW9uIG1hdHJpeC5cbi8vIEJ1dCBlbm91Z2ggZm9yIG5vdywgc28ganVzdCBkbyB0aGF0LlxuXG5jbGFzcyBUb3VjaEdlc3R1cmU8U3RhdGU+IHtcbiAgICBvblRhcEhhbmRsZXI/OiBPblRhcEhhbmRsZXI8U3RhdGU+O1xuICAgIG9uUGFuSGFuZGxlcj86IE9uUGFuSGFuZGxlcjxTdGF0ZT47XG4gICAgb25QYW5CZWdpbkhhbmRsZXI/OiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT47XG4gICAgb25QYW5FbmRIYW5kbGVyPzogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+O1xuXG4gICAgcHJpdmF0ZSBhY3RpdmU6IE1hcDxudW1iZXIsIFBvaW50MkQ+O1xuICAgIHByaXZhdGUgcGFuczogTWFwPG51bWJlciwgUGFuUG9pbnQ+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hCZWdpbkhhbmRsZXI6IE9uVG91Y2hCZWdpbkhhbmRsZXI8U3RhdGU+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hNb3ZlSGFuZGxlcjogT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPjtcbiAgICByZWFkb25seSBvblRvdWNoRW5kSGFuZGxlcjogT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+O1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmFjdGl2ZSA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wYW5zID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgXzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLnNldChpZCwgcCk7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBUb3VjaE1vdmVbXSwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSB0aGlzLmFjdGl2ZS5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKGEgIT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHBhc3MgaW4gZGlzdGFuY2UgdGhyZXNob2xkPyBTY2FsZSBiYXNlIG9uIHRyYW5zZm9ybXM/XG4gICAgICAgICAgICAgICAgICAgIGlmIChwb2ludERpc3RhbmNlKGEsIHQucCkgPj0gMTYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlLmRlbGV0ZSh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogYSwgICAgLy8gVXNlIHRoZSBzdGFydCBwb2ludCBoZXJlLCBzbyB0aGUgZmlyc3QgbW92ZSBpcyBmcm9tIHRoZSBzdGFydC5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnBhbnMuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChwICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5CZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5vblBhbkJlZ2luSGFuZGxlcihlYywgc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFucy5zZXQodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogcC5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycjogdC5wLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPiAwICYmIHRoaXMub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuSGFuZGxlcihbLi4udGhpcy5wYW5zLnZhbHVlcygpXSwgZWMsIHN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldChpZCk7XG4gICAgICAgICAgICBpZiAoYSAhPT0gdW5kZWZpbmVkICYmIHRoaXMub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uVGFwSGFuZGxlcihhLCBlYywgc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hY3RpdmUuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuZGVsZXRlKGlkKSAmJiB0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblBhbkVuZEhhbmRsZXIoZWMsIHN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG59O1xuXG4vLyBTbyB0aGF0IHdlIGNhbiB0YWtlIElBcmd1bWVudHMgYXMgY2hpbGRyZW5cbmludGVyZmFjZSBTdGF0aWNBcnJheTxUPiB7XG4gICAgW2luZGV4OiBudW1iZXJdOiBUO1xuICAgIGxlbmd0aDogbnVtYmVyO1xuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8VD47XG59O1xuXG50eXBlIENoaWxkQ29uc3RyYWludDxMYXlvdXRUeXBlIGV4dGVuZHMgc3RyaW5nPiA9IEVsZW1lbnQ8TGF5b3V0VHlwZSwgYW55LCBhbnk+IHwgU3RhdGljQXJyYXk8RWxlbWVudDxMYXlvdXRUeXBlLCBhbnksIGFueT4+IHwgdW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpbml0VG91Y2hHZXN0dXJlPFN0YXRlPihlOiBFbGVtZW50PGFueSwgYW55LCBTdGF0ZT4pOiBUb3VjaEdlc3R1cmU8U3RhdGU+IHtcbiAgICBpZiAoZS50b3VjaEdlc3R1cmUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZS50b3VjaEdlc3R1cmU7XG4gICAgfVxuICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RvdWNoIGdlc3R1cmVzIGFscmVhZHkgY2FwdHVyZWQnKTtcbiAgICB9XG4gICAgY29uc3QgdGcgPSBuZXcgVG91Y2hHZXN0dXJlKCk7XG4gICAgZS5vblRvdWNoQmVnaW5IYW5kbGVyID0gdGcub25Ub3VjaEJlZ2luSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hNb3ZlSGFuZGxlciA9IHRnLm9uVG91Y2hNb3ZlSGFuZGxlcjtcbiAgICBlLm9uVG91Y2hFbmRIYW5kbGVyID0gdGcub25Ub3VjaEVuZEhhbmRsZXI7XG4gICAgcmV0dXJuIHRnO1xufVxuXG5mdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHggPCBtaW4pIHtcbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9IGVsc2UgaWYgKHggPiBtYXgpIHtcbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG59XG5cbmNsYXNzIEVsZW1lbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZywgQ2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8c3RyaW5nPiwgU3RhdGU+IHtcbiAgICBsYXlvdXRUeXBlOiBMYXlvdXRUeXBlO1xuICAgIGNoaWxkOiBDaGlsZDtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBzdGF0ZTogU3RhdGU7XG5cbiAgICBjb25zdHJ1Y3RvcihsYXlvdXRUeXBlOiBMYXlvdXRUeXBlLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICB0aGlzLmxheW91dFR5cGUgPSBsYXlvdXRUeXBlO1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMubGVmdCA9IE5hTjtcbiAgICAgICAgdGhpcy50b3AgPSBOYU47XG4gICAgICAgIHRoaXMud2lkdGggPSBOYU47XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gTmFOO1xuICAgICAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgfVxuXG4gICAgb25EcmF3SGFuZGxlcj86IE9uRHJhd0hhbmRsZXI8U3RhdGU+O1xuICAgIG9uRHJhdyhoYW5kbGVyOiBPbkRyYXdIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICBpZiAodGhpcy5vbkRyYXdIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25EcmF3IGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vbkRyYXdIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb25Ub3VjaEJlZ2luSGFuZGxlcj86IE9uVG91Y2hCZWdpbkhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hNb3ZlSGFuZGxlcj86IE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaEVuZEhhbmRsZXI/OiBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT47XG5cbiAgICB0b3VjaEdlc3R1cmU/OiBUb3VjaEdlc3R1cmU8U3RhdGU+O1xuICAgIG9uVGFwKGhhbmRsZXI6IE9uVGFwSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25UYXBIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25UYXAgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW4oaGFuZGxlcjogT25QYW5IYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbkJlZ2luKGhhbmRsZXI6IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuQmVnaW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkJlZ2luSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbkVuZChoYW5kbGVyOiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5FbmQgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvbkRldGFjaEhhbmRsZXI/OiBPbkRldGFjaEhhbmRsZXI8U3RhdGU+IHwgQXJyYXk8T25EZXRhY2hIYW5kbGVyPFN0YXRlPj47XG4gICAgb25EZXRhY2goaGFuZGxlcjogT25EZXRhY2hIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IHVuZGVmaW5lZCB8fCB0aGlzLm9uRGV0YWNoSGFuZGxlciA9PT0gaGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5vbkRldGFjaEhhbmRsZXIpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIuaW5kZXhPZihoYW5kbGVyKSA8IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlci5wdXNoKGhhbmRsZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBbdGhpcy5vbkRldGFjaEhhbmRsZXIsIGhhbmRsZXJdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICByZW1vdmVPbkRldGFjaChoYW5kbGVyOiBPbkRldGFjaEhhbmRsZXI8U3RhdGU+KTogdm9pZCB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgY29uc3QgaSA9IHRoaXMub25EZXRhY2hIYW5kbGVyLmluZGV4T2YoaGFuZGxlcik7XG4gICAgICAgICAgICBpZiAoaSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgLy8gQ29weSB0aGUgYXJyYXksIHNvIHRoYXQgaXQncyBzYWZlIHRvIGNhbGwgdGhpcyBpbnNpZGUgYW4gT25EZXRhY2hIYW5kbGVyLlxuICAgICAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gWy4uLnRoaXMub25EZXRhY2hIYW5kbGVyXS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IGhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENoaWxkKGU6IEVsZW1lbnQ8YW55LCBTdGF0aWNBcnJheTxFbGVtZW50PGFueSwgYW55LCBhbnk+PiwgYW55PiwgY2hpbGQ6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIGVjOiBFbGVtZW50Q29udGV4dCwgaW5kZXg/OiBudW1iZXIpIHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IG5ldyBBcnJheTxFbGVtZW50PGFueSwgYW55LCBhbnk+PihlLmNoaWxkLmxlbmd0aCArIDEpO1xuICAgIGxldCBpID0gMDtcbiAgICBsZXQgaiA9IDA7XG4gICAgZm9yICg7IGkgPCBlLmNoaWxkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpID09PSBpbmRleCkge1xuICAgICAgICAgICAgY2hpbGRyZW5baisrXSA9IGNoaWxkO1xuICAgICAgICB9XG4gICAgICAgIGNoaWxkcmVuW2orK10gPSBlLmNoaWxkW2ldO1xuICAgIH1cbiAgICBpZiAoaiA9PT0gaSkge1xuICAgICAgICBjaGlsZHJlbltqXSA9IGNoaWxkO1xuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG4gICAgZWMucmVxdWVzdExheW91dCgpO1xufVxuXG5mdW5jdGlvbiBjYWxsRGV0YWNoTGlzdGVuZXJzKHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4pIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueSwgYW55PjtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZS5vbkRldGFjaEhhbmRsZXIpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhhbmRsZXIgb2YgZS5vbkRldGFjaEhhbmRsZXIpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVyKGUsIGUuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGUub25EZXRhY2hIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGUub25EZXRhY2hIYW5kbGVyKGUsIGUuc3RhdGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKC4uLmUuY2hpbGQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUNoaWxkKGU6IEVsZW1lbnQ8YW55LCBTdGF0aWNBcnJheTxFbGVtZW50PGFueSwgYW55LCBhbnk+PiwgYW55PiwgaW5kZXg6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBuZXcgQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4oZS5jaGlsZC5sZW5ndGggLSAxKTtcbiAgICBsZXQgaiA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlLmNoaWxkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpID09PSBpbmRleCkge1xuICAgICAgICAgICAgY2FsbERldGFjaExpc3RlbmVycyhlLmNoaWxkW2ldKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNoaWxkcmVuW2orK10gPSBlLmNoaWxkW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIGUuY2hpbGQgPSBjaGlsZHJlbjtcbiAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBXUEhQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHAnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocCcsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV1BIU0xheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+LCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PCd3cGhzJywgQ2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dwaHMnLCBzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV1NIUExheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+LCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PCd3c2hwJywgQ2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dzaHAnLCBzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdTSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocycsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hzJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IHR5cGUgTGF5b3V0SGFzV2lkdGhBbmRIZWlnaHQgPSBXU0hTTGF5b3V0PGFueSwgYW55PjtcbmV4cG9ydCB0eXBlIExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQgPSBXUEhQTGF5b3V0PGFueSwgYW55PjtcblxuZnVuY3Rpb24gZHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueSwgYW55PjtcbiAgICAgICAgaWYgKGUub25EcmF3SGFuZGxlcikge1xuICAgICAgICAgICAgZS5vbkRyYXdIYW5kbGVyKGN0eCwgZSwgZWMsIHZwLCBlLnN0YXRlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgLy8gUHVzaCBsYXN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSBkcmF3IGl0IGxhc3QuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gZS5jaGlsZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZFtpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjbGVhckFuZERyYXdFbGVtZW50VHJlZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgcm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94KSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3Qocm9vdC5sZWZ0LCByb290LnRvcCwgcm9vdC53aWR0aCwgcm9vdC5oZWlnaHQpO1xuICAgIGRyYXdFbGVtZW50VHJlZShjdHgsIHJvb3QsIGVjLCB2cCk7XG59XG5cbnR5cGUgSGFzVG91Y2hIYW5kbGVyczxTdGF0ZT4gPSB7XG4gICAgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT47XG59ICYgRWxlbWVudDxhbnksIGFueSwgU3RhdGU+O1xuXG5mdW5jdGlvbiBmaW5kVG91Y2hUYXJnZXQocm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgcDogUG9pbnQyRCk6IHVuZGVmaW5lZCB8IEhhc1RvdWNoSGFuZGxlcnM8YW55PiB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgY29uc3QgeCA9IHBbMF07XG4gICAgY29uc3QgeSA9IHBbMV07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGUgYXMgSGFzVG91Y2hIYW5kbGVyczxhbnk+OyAvLyBUT0RPOiBXaHkgY2FuJ3QgdHlwZSBpbmZlcmVuY2UgZmlndXJlIHRoaXMgb3V0P1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGZpcnN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSB2aXNpdCBsYXN0IGNoaWxkIGxhc3QuXG4gICAgICAgICAgICAvLyBUaGUgbGFzdCBjaGlsZCAodGhlIG9uZSBvbiB0b3ApIHNob3VsZCBvdmVycmlkZSBwcmV2aW91cyBjaGlsZHJlbidzIHRhcmdldC5cbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4uZS5jaGlsZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbnR5cGUgVEFSR0VUX1JPT1QgPSAxO1xuY29uc3QgVEFSR0VUX1JPT1QgPSAxO1xudHlwZSBUQVJHRVRfTk9ORSA9IDI7XG5jb25zdCBUQVJHRVRfTk9ORSA9IDI7XG5cbmNsYXNzIFJvb3RFbGVtZW50Q29udGV4dCBpbXBsZW1lbnRzIEVsZW1lbnRDb250ZXh0IHtcbiAgICBwcml2YXRlIGxheW91dFJlcXVlc3RlZDogYm9vbGVhbjtcbiAgICBwcml2YXRlIGxheW91dEV2YWx1YXRpbmc6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBkcmF3UmVxdWVzdGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgZHJhd0V2YWx1YXRpbmc6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSB2cDogTGF5b3V0Qm94O1xuICAgIHByaXZhdGUgZXZhbHVhdGU6ICgpID0+IHZvaWQ7XG4gICAgcHJpdmF0ZSBldmFsdWF0ZVRva2VuOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBuZXh0VGltZXJJRDogbnVtYmVyO1xuICAgIHByaXZhdGUgdGltZXJzOiBNYXA8bnVtYmVyLCB7IGhhbmRsZXI6IFRpbWVySGFuZGxlciwgc3RhcnQ6IG51bWJlciwgZHVyYXRpb246IG51bWJlciB8IHVuZGVmaW5lZCB9PjtcbiAgICBwcml2YXRlIGNhbGxUaW1lcnNUb2tlbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgY2FsbFRpbWVyczogKG5vdzogbnVtYmVyKSA9PiB2b2lkO1xuXG4gICAgY29uc3RydWN0b3IoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLmxheW91dFJlcXVlc3RlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmxheW91dEV2YWx1YXRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kcmF3UmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuZHJhd0V2YWx1YXRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy52cCA9IHsgbGVmdDogMCwgdG9wOiAwLCB3aWR0aCwgaGVpZ2h0IH07XG4gICAgICAgIHRoaXMuZXZhbHVhdGUgPSAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmV2YWx1YXRlVG9rZW4gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBpZiAodGhpcy5sYXlvdXRSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxheW91dFJlcXVlc3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMubGF5b3V0RXZhbHVhdGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdC5sYXlvdXQodGhpcy52cC5sZWZ0LCB0aGlzLnZwLnRvcCwgdGhpcy52cC53aWR0aCwgdGhpcy52cC5oZWlnaHQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdSZXF1ZXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGF5b3V0RXZhbHVhdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRyYXdSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdFdmFsdWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjbGVhckFuZERyYXdFbGVtZW50VHJlZShjdHgsIHJvb3QsIHRoaXMsIHRoaXMudnApO1xuICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0V2YWx1YXRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5uZXh0VGltZXJJRCA9IDA7XG4gICAgICAgIHRoaXMudGltZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmNhbGxUaW1lcnNUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5jYWxsVGltZXJzID0gKG5vdzogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaW5pc2hlZCA6IEFycmF5PG51bWJlcj4gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMudGltZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYuc3RhcnQgPiBub3cpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGhhbmRsZXJzIHNvbWV0aW1lcyByZWNlaXZlIGEgdGltZXN0YW1wIGVhcmxpZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhhbiBwZXJmb3JtYW5jZS5ub3coKSBjYWxsZWQgd2hlbiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgd2FzIGNhbGxlZC5cbiAgICAgICAgICAgICAgICAgICAgLy8gU28sIGlmIHdlIHNlZSBhIHRpbWUgaW52ZXJzaW9uLCBqdXN0IG1vdmUgdGhlIHN0YXJ0IHRpbWUgZWFybHkuXG4gICAgICAgICAgICAgICAgICAgIHYuc3RhcnQgPSBub3c7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2LmR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiYgdi5kdXJhdGlvbiA8PSBub3cgLSB2LnN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIHYuaGFuZGxlcih2LmR1cmF0aW9uLCB0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgZmluaXNoZWQucHVzaChrKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2LmhhbmRsZXIobm93IC0gdi5zdGFydCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBrIG9mIGZpbmlzaGVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aW1lcnMuZGVsZXRlKGspO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMudGltZXJzLnNpemUgIT09IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbGxUaW1lcnNUb2tlbiA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmNhbGxUaW1lcnMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbGxUaW1lcnNUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZHJhd0V2YWx1YXRpbmcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImRyYXcgcmVxdWVzdGVkIGR1cmluZyBkcmF3IGV2YWx1YXRpb25cIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMubGF5b3V0RXZhbHVhdGluZykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibGF5b3V0IHJlcXVlc3RlZCBkdXJpbmcgZHJhdyBldmFsdWF0aW9uXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRyYXdSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRyYXdSZXF1ZXN0ZWQgPSB0cnVlO1xuICAgICAgICBpZiAodGhpcy5ldmFsdWF0ZVRva2VuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2YWx1YXRlVG9rZW4gPSBzZXRUaW1lb3V0KHRoaXMuZXZhbHVhdGUsIDApO1xuICAgIH1cbiAgICByZXF1ZXN0TGF5b3V0KCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5sYXlvdXRFdmFsdWF0aW5nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJsYXlvdXQgcmVxdWVzdGVkIGR1cmluZyBsYXlvdXQgZXZhbHVhdGlvblwiKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5sYXlvdXRSZXF1ZXN0ZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxheW91dFJlcXVlc3RlZCA9IHRydWU7XG4gICAgICAgIGlmICh0aGlzLmV2YWx1YXRlVG9rZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHNldFRpbWVvdXQodGhpcy5ldmFsdWF0ZSwgMCk7XG4gICAgfVxuXG4gICAgdGltZXIoaGFuZGxlcjogVGltZXJIYW5kbGVyLCBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcbiAgICAgICAgY29uc3QgaWQgPSB0aGlzLm5leHRUaW1lcklEO1xuICAgICAgICB0aGlzLm5leHRUaW1lcklEKys7XG4gICAgICAgIHRoaXMudGltZXJzLnNldChpZCwgeyBoYW5kbGVyLCBzdGFydDogcGVyZm9ybWFuY2Uubm93KCksIGR1cmF0aW9uIH0pO1xuICAgICAgICBpZiAodGhpcy5jYWxsVGltZXJzVG9rZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jYWxsVGltZXJzVG9rZW4gPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5jYWxsVGltZXJzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgY2xlYXJUaW1lcihpZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMudGltZXJzLmRlbGV0ZShpZCk7XG4gICAgICAgIGlmICh0aGlzLnRpbWVycy5zaXplID09PSAwICYmIHRoaXMuY2FsbFRpbWVyc1Rva2VuICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMuY2FsbFRpbWVyc1Rva2VuKTtcbiAgICAgICAgICAgIHRoaXMuY2FsbFRpbWVyc1Rva2VuID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0Vmlld3BvcnQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy52cC53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLnZwLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZXZhbHVhdGVUb2tlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuZXZhbHVhdGVUb2tlbik7XG4gICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICB9XG59O1xuXG5leHBvcnQgY2xhc3MgUm9vdExheW91dCB7XG4gICAgZWM6IFJvb3RFbGVtZW50Q29udGV4dDtcbiAgICBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT47XG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICAvL2N0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHJlc2l6ZTogUmVzaXplT2JzZXJ2ZXI7XG5cbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVyczxhbnk+IHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldERldGFjaGVkOiBPbkRldGFjaEhhbmRsZXI8YW55PjtcbiAgICBwcml2YXRlIHRvdWNoU3RhcnQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7IFxuICAgIHByaXZhdGUgdG91Y2hNb3ZlOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgdG91Y2hFbmQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiLCB7YWxwaGE6IGZhbHNlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVjID0gbmV3IFJvb3RFbGVtZW50Q29udGV4dChjdHgsIGNoaWxkLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xuICAgICAgICBjYW52YXMud2lkdGggPSBjYW52YXMud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGNhbnZhcy5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgY3R4LnRyYW5zZm9ybSh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCwgd2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDApO1xuICAgICAgICB0aGlzLmVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMucmVzaXplID0gbmV3IFJlc2l6ZU9ic2VydmVyKChlbnRyaWVzOiBSZXNpemVPYnNlcnZlckVudHJ5W10pID0+IHtcbiAgICAgICAgICAgIGlmIChlbnRyaWVzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVzaXplT2JzZXJ2ZXIgZXhwZWN0cyAxIGVudHJ5LCBnb3QgJHtlbnRyaWVzLmxlbmd0aH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBlbnRyaWVzWzBdLmNvbnRlbnRSZWN0O1xuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gY29udGVudC53aWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICAgICAgY2FudmFzLmhlaWdodCA9IGNvbnRlbnQuaGVpZ2h0ICogd2luZG93LmRldmljZVBpeGVsUmF0aW87XG4gICAgICAgICAgICBjdHgudHJhbnNmb3JtKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwLCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCk7XG4gICAgICAgICAgICB0aGlzLmVjLnNldFZpZXdwb3J0KGNvbnRlbnQud2lkdGgsIGNvbnRlbnQuaGVpZ2h0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucmVzaXplLm9ic2VydmUoY2FudmFzLCB7Ym94OiBcImRldmljZS1waXhlbC1jb250ZW50LWJveFwifSk7XG5cbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCA9IChlOiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSA9PiB7XG4gICAgICAgICAgICBsZXQgZm91bmRUYXJnZXQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMudG91Y2hUYXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT09IGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaywgVEFSR0VUX05PTkUpO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZFRhcmdldCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmb3VuZFRhcmdldCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGl2ZSB0b3VjaCBmb3IgZGV0YWNoZWQgZWxlbWVudFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaFN0YXJ0ID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHA6IFBvaW50MkQgPSBbdC5jbGllbnRYLCB0LmNsaWVudFldO1xuICAgICAgICAgICAgICAgIHRhcmdldCA9IGZpbmRUb3VjaFRhcmdldCh0aGlzLmNoaWxkLCBwKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdG8gYWN0aXZlIHRhcmdldHMgbWFwIHNvIHdlIGtub3cgYW5ib3V0IGl0LlxuICAgICAgICAgICAgICAgICAgICAvLyBBbGxvdyBkZWZhdWx0IGFjdGlvbiwgc28gZS5nLiBwYWdlIGNhbiBiZSBzY3JvbGxlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEJlZ2luSGFuZGxlcih0LmlkZW50aWZpZXIsIHAsIHRoaXMuZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgLy8gU29tZSB0YXJnZXQgd2FzIHNvbWUgZm9yIGF0IGxlYXN0IHNvbWUgb2YgdGhlIHRvdWNoZXMuIERvbid0IGxldCBhbnl0aGluZ1xuICAgICAgICAgICAgICAgIC8vIGluIEhUTUwgZ2V0IHRoaXMgdG91Y2guXG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hNb3ZlID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gbmV3IE1hcDxIYXNUb3VjaEhhbmRsZXJzPGFueT4sIEFycmF5PFRvdWNoTW92ZT4+KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBtb3ZlIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBkbyBhbnl0aGluZywgYXMgdGhlIHJvb3QgZWxlbWVudCBjYW4ndCBzY3JvbGwuXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCB0YXJnZXQgcHJvYmFibHkgZGVsZXRlZC5cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRzID0gdGFyZ2V0cy5nZXQodGFyZ2V0KSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgdHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdC5pZGVudGlmaWVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgcDogW3QuY2xpZW50WCwgdC5jbGllbnRZXSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMuc2V0KHRhcmdldCwgdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHNdIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHRzLCB0aGlzLmVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hFbmQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQgPSBuZXcgTWFwKHRoaXMudG91Y2hUYXJnZXRzKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVkLmRlbGV0ZSh0LmlkZW50aWZpZXIpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpZCwgdGFyZ2V0XSBvZiByZW1vdmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSBUQVJHRVRfUk9PVCAmJiB0YXJnZXQgIT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoRW5kSGFuZGxlcihpZCwgdGhpcy5lYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnJlc2l6ZS5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuZWMuZGlzY29ubmVjdCgpO1xuICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKHRoaXMuY2hpbGQpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgfVxufTtcblxuLy8gVE9ETzogSGF2ZSBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gKHNvIGhpZGUgY2hpbGRyZW4sIGFuZCBmb3J3YXJkIHRhcC9wYW4vZHJhdyBtYW51YWxseSwgd2l0aCB0cmFuc2Zvcm0pXG4vLyBUT0RPOiBjb252ZXJ0IHRvIHVzZSBBZmZpbmUgdHJhbnNmb3JtLlxuXG5jbGFzcyBTY3JvbGxMYXlvdXQgZXh0ZW5kcyBXUEhQTGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPiB7XG4gICAgLy8gU2Nyb2xsTGF5b3V0IGhhcyB0byBpbnRlcmNlcHQgYWxsIGV2ZW50cyB0byBtYWtlIHN1cmUgYW55IGxvY2F0aW9ucyBhcmUgdXBkYXRlZCBieVxuICAgIC8vIHRoZSBzY3JvbGwgcG9zaXRpb24sIHNvIGNoaWxkIGlzIHVuZGVmaW5lZCwgYW5kIGFsbCBldmVudHMgYXJlIGZvcndhcmRlZCB0byBzY3JvbGxlci5cbiAgICBzY3JvbGxlcjogV1NIU0xheW91dDxhbnksIGFueT47XG4gICAgc2Nyb2xsOiBQb2ludDJEO1xuICAgIHpvb206IG51bWJlcjtcbiAgICB6b29tTWF4OiBudW1iZXI7XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldHM6IE1hcDxudW1iZXIsIEhhc1RvdWNoSGFuZGxlcnM8dW5rbm93bj4gfCBUQVJHRVRfUk9PVCB8IFRBUkdFVF9OT05FPjtcbiAgICBwcml2YXRlIHRvdWNoU2Nyb2xsOiBNYXA8bnVtYmVyLCB7IHByZXY6IFBvaW50MkQsIGN1cnI6IFBvaW50MkQgfT47XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldERldGFjaGVkOiBPbkRldGFjaEhhbmRsZXI8dW5rbm93bj47XG5cbiAgICBwcml2YXRlIGNsYW1wWm9vbSgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIud2lkdGggPCB0aGlzLndpZHRoIC8gdGhpcy56b29tKSB7XG4gICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLndpZHRoIC8gdGhpcy5zY3JvbGxlci53aWR0aDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zY3JvbGxlci5oZWlnaHQgPCB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy5oZWlnaHQgLyB0aGlzLnNjcm9sbGVyLmhlaWdodDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy56b29tID4gdGhpcy56b29tTWF4KSB7XG4gICAgICAgICAgICB0aGlzLnpvb20gPSB0aGlzLnpvb21NYXg7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBjbGFtcFNjcm9sbCgpIHtcbiAgICAgICAgdGhpcy5zY3JvbGxbMF0gPSBjbGFtcCh0aGlzLnNjcm9sbFswXSwgMCwgdGhpcy5zY3JvbGxlci53aWR0aCAtIHRoaXMud2lkdGggLyB0aGlzLnpvb20pO1xuICAgICAgICB0aGlzLnNjcm9sbFsxXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzFdLCAwLCB0aGlzLnNjcm9sbGVyLmhlaWdodCAtIHRoaXMuaGVpZ2h0IC8gdGhpcy56b29tKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZVNjcm9sbCgpIHtcbiAgICAgICAgY29uc3QgdHMgPSBbLi4udGhpcy50b3VjaFNjcm9sbC52YWx1ZXMoKV07XG4gICAgICAgIGlmICh0cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSB0c1swXTtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLnAyYyh0LnByZXYpO1xuICAgICAgICAgICAgY29uc3QgYyA9IHRoaXMucDJjKHQuY3Vycik7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwWzBdIC0gY1swXTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzFdICs9IHBbMV0gLSBjWzFdO1xuICAgICAgICB9IGVsc2UgaWYgKHRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgY29uc3QgcG0gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLnByZXZbMF0gKyB0c1sxXS5wcmV2WzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlsxXSArIHRzWzFdLnByZXZbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBjb25zdCBwZCA9IHBvaW50RGlzdGFuY2UodHNbMF0ucHJldiwgdHNbMV0ucHJldik7XG4gICAgICAgICAgICBjb25zdCBjZCA9IHBvaW50RGlzdGFuY2UodHNbMF0uY3VyciwgdHNbMV0uY3Vycik7XG4gICAgICAgICAgICB0aGlzLnpvb20gKj0gY2QgLyBwZDtcbiAgICAgICAgICAgIC8vIENsYW1wIHpvb20gc28gd2UgY2FuJ3Qgem9vbSBvdXQgdG9vIGZhci5cbiAgICAgICAgICAgIHRoaXMuY2xhbXBab29tKCk7XG4gICAgICAgICAgICBjb25zdCBjbSA9IHRoaXMucDJjKFtcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclswXSArIHRzWzFdLmN1cnJbMF0pICogMC41LFxuICAgICAgICAgICAgICAgICh0c1swXS5jdXJyWzFdICsgdHNbMV0uY3VyclsxXSkgKiAwLjUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzBdICs9IHBtWzBdIC0gY21bMF07XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFsxXSArPSBwbVsxXSAtIGNtWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xhbXBTY3JvbGwoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHAyYyhwOiBQb2ludDJEKTogUG9pbnQyRCB7XG4gICAgICAgIGNvbnN0IHMgPSB0aGlzLnNjcm9sbDtcbiAgICAgICAgY29uc3Qgc2hyaW5rID0gMSAvIHRoaXMuem9vbTtcbiAgICAgICAgLy8gVE9ETzogdGFrZSBwYXJlbnQgcmVjdCBpbnRvIGFjY291bnRcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIChwWzBdIC0gdGhpcy5sZWZ0KSAqIHNocmluayArIHNbMF0sXG4gICAgICAgICAgICAocFsxXSAtIHRoaXMudG9wKSAqIHNocmluayArIHNbMV0sXG4gICAgICAgIF07XG4gICAgfVxuXG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzY3JvbGw6IFBvaW50MkQsIHpvb206IG51bWJlciwgem9vbU1heDogbnVtYmVyKSB7XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlciA9IGNoaWxkO1xuICAgICAgICB0aGlzLnNjcm9sbCA9IHNjcm9sbDtcbiAgICAgICAgdGhpcy56b29tID0gem9vbTtcbiAgICAgICAgdGhpcy56b29tTWF4ID0gem9vbU1heDtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTY3JvbGwgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCA9IChlOiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSA9PiB7XG4gICAgICAgICAgICBsZXQgZm91bmRUYXJnZXQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMudG91Y2hUYXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT09IGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaywgVEFSR0VUX05PTkUpO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZFRhcmdldCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmb3VuZFRhcmdldCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGl2ZSB0b3VjaCBmb3IgZGV0YWNoZWQgZWxlbWVudFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKHRoaXMubGVmdCwgdGhpcy50b3ApO1xuICAgICAgICAgICAgLy8gQ2xpcCB0byBTY3JvbGwgdmlld3BvcnQuXG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHgubW92ZVRvKDAsIDApO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh0aGlzLndpZHRoLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmxpbmVUbygwLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgICAgICAgICBjdHguY2xpcCgpO1xuICAgICAgICAgICAgY3R4LnNjYWxlKHRoaXMuem9vbSwgdGhpcy56b29tKTtcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUoLXRoaXMuc2Nyb2xsWzBdLCAtdGhpcy5zY3JvbGxbMV0pO1xuICAgICAgICAgICAgY29uc3QgdnBTY3JvbGxlciA9IHtcbiAgICAgICAgICAgICAgICBsZWZ0OiB0aGlzLnNjcm9sbFswXSxcbiAgICAgICAgICAgICAgICB0b3A6IHRoaXMuc2Nyb2xsWzFdLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLndpZHRoIC8gdGhpcy56b29tLFxuICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5zY3JvbGxlciwgZWMsIHZwU2Nyb2xsZXIpO1xuICAgICAgICAgICAgLy8gVE9ETzogcmVzdG9yZSB0cmFuc2Zvcm0gaW4gYSBmaW5hbGx5P1xuICAgICAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3AgPSB0aGlzLnAyYyhwcCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5zY3JvbGxlciwgY3ApO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIG51bGwgdG8gYWN0aXZlIHRvdWNoZXMsIHNvIHdlIGtub3cgdGhleSBzaG91bGQgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTY3JvbGwuc2V0KGlkLCB7IHByZXY6IHBwLCBjdXJyOiBwcCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKGlkLCBjcCwgZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnM8YW55PiwgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIG1vdmUgSUQgJHt0LmlkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY3JvbGwgPSB0aGlzLnRvdWNoU2Nyb2xsLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjcm9sbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aCBJRCAke3QuaWR9IGhhcyB0YXJnZXQgPT09IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzY3JvbGwucHJldiA9IHNjcm9sbC5jdXJyO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwuY3VyciA9IHQucDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHR0cy5wdXNoKHQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHR0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgc2Nyb2xsIHBvc2l0aW9uLlxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGwoKTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzW2ldID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHR0c1tpXS5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IHRoaXMucDJjKHR0c1tpXS5wKSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIGVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldChpZCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggZW5kIElEICR7aWR9YCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMudG91Y2hTY3JvbGwuZGVsZXRlKGlkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCBJRCAke2lkfSBoYXMgdGFyZ2V0IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90aGluZywgdGFyZXQgd2FzIGRlbGV0ZWQuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoRW5kSGFuZGxlcihpZCwgZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBUT0RPOiBvdGhlciBoYW5kbGVycyBuZWVkIGZvcndhcmRpbmcuXG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuY2xhbXBab29tKCk7XG4gICAgICAgIHRoaXMuY2xhbXBTY3JvbGwoKTtcblxuICAgICAgICB0aGlzLnNjcm9sbGVyLmxheW91dCgwLCAwKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBTY3JvbGwoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzY3JvbGw/OiBQb2ludDJELCB6b29tPzogbnVtYmVyLCB6b29tTWF4PzogbnVtYmVyKTogU2Nyb2xsTGF5b3V0IHtcbiAgICAvLyBOQjogc2NhbGUgb2YgMCBpcyBpbnZhbGlkIGFueXdheXMsIHNvIGl0J3MgT0sgdG8gYmUgZmFsc3kuXG4gICAgcmV0dXJuIG5ldyBTY3JvbGxMYXlvdXQoY2hpbGQsIHNjcm9sbCB8fCBbMCwgMF0sIHpvb20gfHwgMSwgem9vbU1heCB8fCAxMDApO1xufVxuXG4vLyBUT0RPOiBzY3JvbGx4LCBzY3JvbGx5XG5cbmNsYXNzIEJveExheW91dDxTdGF0ZSwgQ2hpbGQgZXh0ZW5kcyBXUEhQTGF5b3V0PGFueSwgYW55PiB8IHVuZGVmaW5lZD4gZXh0ZW5kcyBXU0hTTGF5b3V0PENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgaWYgKHRoaXMuY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IFdTSFNMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSk6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBXU0hTTGF5b3V0PGFueSwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpcnN0PzogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55Piwgc2Vjb25kPzogV1BIUExheW91dDxhbnksIGFueT4pOiBXU0hTTGF5b3V0PGFueSwgU3RhdGU+IHwgV1NIU0xheW91dDxhbnksIHVuZGVmaW5lZD4ge1xuICAgIGlmIChzZWNvbmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+KHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PHVuZGVmaW5lZCwgV1BIUExheW91dDxhbnksIGFueT4+KHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgZmlyc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8U3RhdGUsIHVuZGVmaW5lZD4od2lkdGgsIGhlaWdodCwgZmlyc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDxTdGF0ZSwgV1BIUExheW91dDxhbnksIGFueT4+KHdpZHRoLCBoZWlnaHQsIGZpcnN0IGFzIFN0YXRlLCBzZWNvbmQpO1xuICAgICAgICAvLyBUT0RPOiB0aGUgc3RhdGUgc2hvdWxkIHR5cGUtY2hlY2suXG4gICAgfVxufVxuXG5jbGFzcyBXUEhQQm9yZGVyTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgYm9yZGVyOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4sIGJvcmRlcjogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdGF0ZTogU3RhdGUpIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5ib3JkZXIgPSBib3JkZXI7XG4gICAgICAgIHRoaXMuc3R5bGUgPSBzdHlsZTtcblxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjb25zdCBiMiA9IGIgKiAwLjU7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSB0aGlzLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IHRoaXMuYm9yZGVyO1xuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyBiMiwgYm94LnRvcCArIGIyLCBib3gud2lkdGggLSBiLCBib3guaGVpZ2h0IC0gYik7XG4gICAgICAgIH07XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQgKyBiLCB0b3AgKyBiLCB3aWR0aCAtIGIgKiAyLCBoZWlnaHQgLSBiICogMik7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gQm9yZGVyPFN0YXRlPih3aWR0aDogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4sIHN0YXRlPzogU3RhdGUpOiBXUEhQTGF5b3V0PGFueSwgYW55PiB7XG4gICAgaWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXUEhQQm9yZGVyTGF5b3V0PHVuZGVmaW5lZD4oY2hpbGQsIHdpZHRoLCBzdHlsZSwgdW5kZWZpbmVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBCb3JkZXJMYXlvdXQ8U3RhdGU+KGNoaWxkLCB3aWR0aCwgc3R5bGUsIHN0YXRlKTtcbiAgICB9XG59XG5cbmNsYXNzIEZpbGxMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlKSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBGaWxsKCk6IEZpbGxMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBGaWxsPFN0YXRlPihzdGF0ZTogU3RhdGUpOiBGaWxsTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBGaWxsPFN0YXRlPihzdGF0ZT86IFN0YXRlKTogRmlsbExheW91dDx1bmRlZmluZWQ+IHwgRmlsbExheW91dDxTdGF0ZT4ge1xuICAgIGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmlsbExheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGaWxsTGF5b3V0PFN0YXRlPihzdGF0ZSk7XG4gICAgfVxufVxuXG5jbGFzcyBDZW50ZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXU0hTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogQ2VudGVyTGF5b3V0PFN0YXRlPiB7XG4gICAgcmV0dXJuIG5ldyBDZW50ZXJMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG59XG5cbmNsYXNzIEhDZW50ZXJIUExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIEhDZW50ZXJIU0xheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIU0xheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55PiB8IFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBIQ2VudGVySFNMYXlvdXQ8U3RhdGU+IHwgSENlbnRlckhQTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIUExheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIU0xheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIFZDZW50ZXJXUExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3AsIHdpZHRoKTtcbiAgICB9XG59O1xuXG5jbGFzcyBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1NIUExheW91dDxXU0hTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gY2hpbGQud2lkdGg7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldTTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1BIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IFZDZW50ZXJXUExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+IHwgV1BIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IFZDZW50ZXJXU0xheW91dDxTdGF0ZT4gfCBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dwaHMnKSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldQTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldTTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZsZXhMYXlvdXQ8U3RhdGUsIENoaWxkIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT4gfCB1bmRlZmluZWQ+IGV4dGVuZHMgRWxlbWVudDwnZmxleCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBncm93OiBudW1iZXI7XG4gICAgY29uc3RydWN0b3Ioc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCdmbGV4Jywgc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5zaXplID0gc2l6ZTtcbiAgICAgICAgdGhpcy5ncm93ID0gZ3JvdztcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6bnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gRmxleChzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlcik6IEZsZXhMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXg8U3RhdGU+KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBzdGF0ZTogU3RhdGUpOiBGbGV4TGF5b3V0PFN0YXRlLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXgoc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8dW5kZWZpbmVkLCBXUEhQTGF5b3V0PGFueSwgYW55Pj47XG5leHBvcnQgZnVuY3Rpb24gRmxleDxTdGF0ZT4oc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDxTdGF0ZSwgV1BIUExheW91dDxhbnksIGFueT4+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXg8U3RhdGU+KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBmaXJzdD86IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIHNlY29uZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDxhbnksIGFueT4ge1xuICAgIGlmIChmaXJzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChzZWNvbmQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIGZpcnN0LCBzZWNvbmQpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpcnN0IGluc3RhbmNlb2YgV1BIUExheW91dCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIHVuZGVmaW5lZCwgZmlyc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIGZpcnN0LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPihzaXplLCBncm93LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgfVxufVxuXG5jbGFzcyBMZWZ0RmxleExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGxldCBzdW1TaXplID0gMDtcbiAgICAgICAgbGV0IHN1bUdyb3cgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgc3VtU2l6ZSArPSBjLnNpemU7XG4gICAgICAgICAgICBzdW1Hcm93ICs9IGMuZ3JvdztcbiAgICAgICAgfVxuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgbGV0IGV4dHJhID0gaGVpZ2h0IC0gc3VtU2l6ZTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGxldCBjaGlsZFdpZHRoID0gYy5zaXplO1xuICAgICAgICAgICAgaWYgKGMuZ3JvdyAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNoaWxkV2lkdGggKz0gZXh0cmEgKiBjLmdyb3cgLyBzdW1Hcm93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYy5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGNoaWxkV2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGRXaWR0aDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBMZWZ0RmxleExheW91dDx1bmRlZmluZWQ+XG5leHBvcnQgZnVuY3Rpb24gTGVmdDxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogTGVmdEZsZXhMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQ8U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IEZsZXhMYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogTGVmdEZsZXhMYXlvdXQ8YW55PiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRmxleExheW91dCkge1xuICAgICAgICByZXR1cm4gbmV3IExlZnRGbGV4TGF5b3V0KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgTGVmdEZsZXhMYXlvdXQoZmlyc3QsIGNoaWxkcmVuKTtcbiAgICB9XG59XG5cbmNsYXNzIEJvdHRvbUZsZXhMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBsZXQgc3VtU2l6ZSA9IDA7XG4gICAgICAgIGxldCBzdW1Hcm93ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIHN1bVNpemUgKz0gYy5zaXplO1xuICAgICAgICAgICAgc3VtR3JvdyArPSBjLmdyb3c7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGNoaWxkVG9wID0gdG9wICsgaGVpZ2h0O1xuICAgICAgICBsZXQgZXh0cmEgPSBoZWlnaHQgLSBzdW1TaXplO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgbGV0IGNoaWxkSGVpZ2h0ID0gYy5zaXplO1xuICAgICAgICAgICAgaWYgKGMuZ3JvdyAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNoaWxkSGVpZ2h0ICs9IGV4dHJhICogYy5ncm93IC8gc3VtR3JvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoaWxkVG9wIC09IGNoaWxkSGVpZ2h0O1xuICAgICAgICAgICAgYy5sYXlvdXQobGVmdCwgY2hpbGRUb3AsIHdpZHRoLCBjaGlsZEhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3R0b20oLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IEJvdHRvbUZsZXhMYXlvdXQ8dW5kZWZpbmVkPlxuZXhwb3J0IGZ1bmN0aW9uIEJvdHRvbTxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogQm90dG9tRmxleExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm90dG9tPFN0YXRlPihmaXJzdDogU3RhdGUgfCBGbGV4TGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IEJvdHRvbUZsZXhMYXlvdXQ8YW55PiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRmxleExheW91dCkge1xuICAgICAgICByZXR1cm4gbmV3IEJvdHRvbUZsZXhMYXlvdXQodW5kZWZpbmVkLCBbZmlyc3QsIC4uLmNoaWxkcmVuXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCb3R0b21GbGV4TGF5b3V0KGZpcnN0LCBjaGlsZHJlbik7XG4gICAgfVxufVxuXG50eXBlIERlYnVnVG91Y2hTdGF0ZSA9IHtcbiAgICBmaWxsOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sXG4gICAgc3Ryb2tlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sXG4gICAgdGFwczogQXJyYXk8UG9pbnQyRD4sXG4gICAgcGFuczogQXJyYXk8QXJyYXk8UGFuUG9pbnQ+Pixcbn07XG5cbmZ1bmN0aW9uIGRlYnVnVG91Y2hPbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBzdGF0ZS5maWxsO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0YXRlLnN0cm9rZTtcbiAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGZvciAoY29uc3QgdGFwIG9mIHN0YXRlLnRhcHMpIHtcbiAgICAgICAgY3R4Lm1vdmVUbyh0YXBbMF0gKyAxNiwgdGFwWzFdKTtcbiAgICAgICAgY3R4LmVsbGlwc2UodGFwWzBdLCB0YXBbMV0sIDE2LCAxNiwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHBzIG9mIHN0YXRlLnBhbnMpIHtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBjdHgubW92ZVRvKHAucHJldlswXSwgcC5wcmV2WzFdKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8ocC5jdXJyWzBdLCBwLmN1cnJbMV0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZGVidWdUb3VjaE9uVGFwKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIHN0YXRlLnRhcHMucHVzaChwKTtcbiAgICBlYy5yZXF1ZXN0RHJhdygpO1xufVxuXG5mdW5jdGlvbiBkZWJ1Z1RvdWNoT25QYW4ocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogRGVidWdUb3VjaFN0YXRlKSB7XG4gICAgc3RhdGUucGFucy5wdXNoKHBzKTtcbiAgICBlYy5yZXF1ZXN0RHJhdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gRGVidWdUb3VjaCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdHJva2U6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybik6IEJveExheW91dDxEZWJ1Z1RvdWNoU3RhdGUsIHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IHN0YXRlID0ge1xuICAgICAgICBmaWxsLFxuICAgICAgICBzdHJva2UsXG4gICAgICAgIHRhcHM6IFtdLFxuICAgICAgICBwYW5zOiBbXSxcbiAgICB9O1xuICAgIHJldHVybiBCb3g8RGVidWdUb3VjaFN0YXRlPih3aWR0aCwgaGVpZ2h0LCBzdGF0ZSlcbiAgICAgICAgLm9uRHJhdyhkZWJ1Z1RvdWNoT25EcmF3KVxuICAgICAgICAub25UYXAoZGVidWdUb3VjaE9uVGFwKVxuICAgICAgICAub25QYW4oZGVidWdUb3VjaE9uUGFuKTtcbn1cblxuY2xhc3MgTGF5ZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBMYXllcjxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KTogTGF5ZXJMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIExheWVyKC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pOiBMYXllckxheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIExheWVyPFN0YXRlPihmaXJzdDogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pik6IExheWVyTGF5b3V0PFN0YXRlPiB8IExheWVyTGF5b3V0PHVuZGVmaW5lZD4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMYXllckxheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IExheWVyTGF5b3V0PFN0YXRlPihmaXJzdCwgY2hpbGRyZW4pO1xufVxuXG5leHBvcnQgdHlwZSBPblN3aXRjaFNlbGVjdCA9IChlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmNsYXNzIFN3aXRjaExheW91dDxJbmRpY2VzIGV4dGVuZHMgbnVtYmVyPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIEluZGljZXM+IHtcbiAgICBwcml2YXRlIGNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj47XG5cbiAgICBjb25zdHJ1Y3RvcihpOiBJbmRpY2VzLCBjaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGksIGNoaWxkcmVuW2ldKTtcbiAgICAgICAgdGhpcy5jaGlsZHJlbiA9IGNoaWxkcmVuO1xuICAgIH1cblxuICAgIHNldChpOiBJbmRpY2VzLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKGkgIT09IHRoaXMuc3RhdGUpIHtcbiAgICAgICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnModGhpcy5jaGlsZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdGF0ZSA9IGk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZ2V0KCk6IEluZGljZXMge1xuICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbnR5cGUgSW5kaWNlczxUIGV4dGVuZHMgYW55W10+ID0gRXhjbHVkZTxQYXJ0aWFsPFQ+W1wibGVuZ3RoXCJdLCBUW1wibGVuZ3RoXCJdPiAmIG51bWJlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIFN3aXRjaDxDaGlsZHJlbiBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+W10+KGk6IEluZGljZXM8Q2hpbGRyZW4+LCAuLi5jaGlsZHJlbjogQ2hpbGRyZW4pOiBTd2l0Y2hMYXlvdXQ8SW5kaWNlczxDaGlsZHJlbj4+IHtcbiAgICByZXR1cm4gbmV3IFN3aXRjaExheW91dChpLCBjaGlsZHJlbik7XG59XG5cbmV4cG9ydCB0eXBlIE11eEtleSA9IHN0cmluZyB8IG51bWJlciB8IHN5bWJvbDtcblxuZnVuY3Rpb24gbXV4RWxlbWVudHMoZW5hYmxlZDogU2V0PE11eEtleT4sIGVzOiBBcnJheTxbTXV4S2V5LCBXUEhQTGF5b3V0PGFueSwgYW55Pl0+KTogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+IHtcbiAgICBjb25zdCByZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBlcykge1xuICAgICAgICBpZiAoZW5hYmxlZC5oYXMoaykpIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKHYpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbmNsYXNzIE11eExheW91dDxLIGV4dGVuZHMgTXV4S2V5PiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+LCB1bmRlZmluZWQ+IHtcbiAgICBwcml2YXRlIGVuYWJsZWQ6IFNldDxLPjtcbiAgICBwcml2YXRlIG11eDogQXJyYXk8W0ssIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT47XG5cbiAgICBjb25zdHJ1Y3RvcihlbmFibGVkOiBTZXQ8Sz4sIGNoaWxkcmVuOiBBcnJheTxbSywgV1BIUExheW91dDxhbnksIGFueT5dPikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQsIG11eEVsZW1lbnRzKGVuYWJsZWQsIGNoaWxkcmVuKSk7XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIHRoaXMubXV4ID0gY2hpbGRyZW47XG4gICAgfVxuXG4gICAgc2V0KGVjOiBFbGVtZW50Q29udGV4dCwgLi4uZW5hYmxlOiBBcnJheTxLPikge1xuICAgICAgICBjb25zdCBlbmFibGVkID0gbmV3IFNldChlbmFibGUpO1xuICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLm11eCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZC5oYXMoaykgJiYgIWVuYWJsZWQuaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgY2FsbERldGFjaExpc3RlbmVycyh2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkO1xuICAgICAgICB0aGlzLmNoaWxkID0gbXV4RWxlbWVudHModGhpcy5lbmFibGVkLCB0aGlzLm11eCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBnZXQoKTogU2V0PEs+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTXV4PEtleSBleHRlbmRzIE11eEtleSwgRW5hYmxlZEtleSBleHRlbmRzIEtleT4oZW5hYmxlZDogQXJyYXk8RW5hYmxlZEtleT4sIC4uLmNoaWxkcmVuOiBBcnJheTxbS2V5LCBXUEhQTGF5b3V0PGFueSwgYW55Pl0+KTogTXV4TGF5b3V0PEtleT4ge1xuICAgIHJldHVybiBuZXcgTXV4TGF5b3V0PHR5cGVvZiBjaGlsZHJlbltudW1iZXJdWzBdPihuZXcgU2V0KGVuYWJsZWQpLCBjaGlsZHJlbik7XG59XG5cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbkxheW91dDxDaGlsZCBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+IHwgdW5kZWZpbmVkLCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PFwicG9zXCIsIENoaWxkLCBTdGF0ZT4ge1xuICAgIHJlcXVlc3RMZWZ0OiBudW1iZXI7XG4gICAgcmVxdWVzdFRvcDogbnVtYmVyO1xuICAgIHJlcXVlc3RXaWR0aDogbnVtYmVyO1xuICAgIHJlcXVlc3RIZWlnaHQ6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcihcInBvc1wiLCBzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLnJlcXVlc3RMZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0VG9wID0gdG9wO1xuICAgICAgICB0aGlzLnJlcXVlc3RXaWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLnJlcXVlc3RIZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChwYXJlbnQ6IExheW91dEJveCkge1xuICAgICAgICB0aGlzLndpZHRoID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0V2lkdGgsIHBhcmVudC53aWR0aCk7XG4gICAgICAgIHRoaXMubGVmdCA9IGNsYW1wKHRoaXMucmVxdWVzdExlZnQsIHBhcmVudC5sZWZ0LCBwYXJlbnQubGVmdCArIHBhcmVudC53aWR0aCAtIHRoaXMud2lkdGgpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IE1hdGgubWluKHRoaXMucmVxdWVzdEhlaWdodCwgcGFyZW50LmhlaWdodCk7XG4gICAgICAgIHRoaXMudG9wID0gY2xhbXAodGhpcy5yZXF1ZXN0VG9wLCBwYXJlbnQudG9wLCBwYXJlbnQudG9wICsgcGFyZW50LmhlaWdodCAtIHRoaXMuaGVpZ2h0KTtcblxuICAgICAgICBpZiAodGhpcy5jaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dCh0aGlzLmxlZnQsIHRoaXMudG9wLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vLyBUT0RPOiBzdXBwb3J0IHN0YXRpY2FsbHkgc2l6ZWQgY2hpbGRyZW4sIFxuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlKTogUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBQb3NpdGlvbkxheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlyc3Q/OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzZWNvbmQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pikge1xuICAgIGlmIChzZWNvbmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCB1bmRlZmluZWQ+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBmaXJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgU3RhdGU+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgZmlyc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCBmaXJzdCBhcyBTdGF0ZSwgc2Vjb25kKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBEcmFnZ2FibGUobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkPzogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICBjb25zdCBsYXlvdXQgPSBuZXcgUG9zaXRpb25MYXlvdXQ8YW55LCB1bmRlZmluZWQ+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBjaGlsZCk7XG4gICAgcmV0dXJuIGxheW91dC5vblBhbigocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGxldCBkeCA9IDA7XG4gICAgICAgIGxldCBkeSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgZHggKz0gcC5jdXJyWzBdIC0gcC5wcmV2WzBdO1xuICAgICAgICAgICAgZHkgKz0gcC5jdXJyWzFdIC0gcC5wcmV2WzFdO1xuICAgICAgICB9XG4gICAgICAgIGR4IC89IHBzLmxlbmd0aDtcbiAgICAgICAgZHkgLz0gcHMubGVuZ3RoO1xuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgKz0gZHg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wICs9IGR5O1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSkub25QYW5FbmQoKCkgPT4ge1xuICAgICAgICAvLyBUaGUgcmVxdWVzdGVkIGxvY2F0aW9uIGNhbiBiZSBvdXRzaWRlIHRoZSBhbGxvd2VkIGJvdW5kcyBpZiBkcmFnZ2VkIG91dHNpZGUsXG4gICAgICAgIC8vIGJ1dCBvbmNlIHRoZSBkcmFnIGlzIG92ZXIsIHdlIHdhbnQgdG8gcmVzZXQgaXQgc28gdGhhdCBpdCBkb2Vzbid0IHN0YXJ0IHRoZXJlXG4gICAgICAgIC8vIG9uY2UgYSBuZXcgZHJhZyBzdGFydC5cbiAgICAgICAgbGF5b3V0LnJlcXVlc3RMZWZ0ID0gbGF5b3V0LmxlZnQ7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wID0gbGF5b3V0LnRvcDtcbiAgICB9KTtcbn1cblxuXG4vLyBUT0RPOiBkb2VzIGl0IG1ha2Ugc2Vuc2UgdG8gbWFrZSBvdGhlciBsYXlvdXQgdHlwZXM/XG4vLyBjbGFzcyBXU0hTUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuLy8gICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+KSB7XG4vLyAgICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbi8vICAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuLy8gICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbi8vICAgICB9XG4vLyAgICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbi8vICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbi8vICAgICAgICAgdGhpcy50b3AgPSB0b3A7XG5cbi8vICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4vLyAgICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuLy8gICAgICAgICB9XG4vLyAgICAgfVxuLy8gfTtcblxuY2xhc3MgV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmUoLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pOiBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZTxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmU8U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IFBvc2l0aW9uTGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pOiBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPiB8IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPih1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+KGZpcnN0LCBjaGlsZHJlbik7XG59XG4iXX0=