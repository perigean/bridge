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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBa0JuRCxDQUFDO0FBb0JGLG1FQUFtRTtBQUNuRSx5RUFBeUU7QUFDekUsdUNBQXVDO0FBRXZDLE1BQU0sWUFBWTtJQVlkO1FBQ0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxFQUFVLEVBQUUsQ0FBVSxFQUFFLENBQWlCLEVBQUUsRUFBRTtZQUNyRSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsRUFBZSxFQUFFLEVBQWtCLEVBQUUsS0FBWSxFQUFFLEVBQUU7WUFDNUUsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLElBQUksU0FBUyxFQUFFO29CQUNoQiw4REFBOEQ7b0JBQzlELElBQUksYUFBYSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO3dCQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7NEJBQ2hCLElBQUksRUFBRSxDQUFD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QVEsVUFBd0Q7SUFDNUYsWUFBWSxLQUFZLEVBQUUsUUFBK0M7UUFDckUsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBQ0QsTUFBTSxDQUFDLElBQVksRUFBRSxHQUFXLEVBQUUsS0FBYSxFQUFFLE1BQWM7UUFDM0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUVyQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDNUIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7U0FDdEM7SUFDTCxDQUFDO0NBQ0o7QUFHRCxNQUFNLFVBQVUsUUFBUSxDQUFRLEtBQXVDLEVBQUUsR0FBRyxRQUF5QztJQUNqSCxJQUFJLEtBQUssWUFBWSxPQUFPLEVBQUU7UUFDMUIsT0FBTyxJQUFJLGtCQUFrQixDQUFZLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUM7S0FDN0U7SUFDRCxPQUFPLElBQUksa0JBQWtCLENBQVEsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQzFELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEaWNrIDIwMjFcblxuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuLi9wb2ludC5qc1wiXG5cbmV4cG9ydCB0eXBlIExheW91dEJveCA9IHtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbn07XG5cbi8vIFRPRE86IFJlcGxhY2UgdXNlIG9mIGFueSB3aXRoIHVua25vd24uXG4vLyBUT0RPOiBQYXNzIEVsZW1lbnRDb250ZXh0IGFsb25nIHdpdGggbGF5b3V0LCBzbyB0aGF0IHdlIGNhbiBoYXZlIGR5bmFtaWMgbGF5b3V0cy5cblxuZXhwb3J0IHR5cGUgVGltZXJIYW5kbGVyID0gKHQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVsZW1lbnRDb250ZXh0IHtcbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZDtcbiAgICB0aW1lcihoYW5kbGVyOiBUaW1lckhhbmRsZXIsIGR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXI7XG59O1xuXG50eXBlIFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPiA9IChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4gPSAoZTogRWxlbWVudDxhbnksIGFueSwgU3RhdGU+LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5leHBvcnQgdHlwZSBPbkRyYXdIYW5kbGVyPFN0YXRlPiA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGVjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuXG50eXBlIE9uVG91Y2hCZWdpbkhhbmRsZXI8U3RhdGU+ID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xudHlwZSBUb3VjaE1vdmUgPSB7XG4gICAgcmVhZG9ubHkgaWQ6IG51bWJlcjtcbiAgICByZWFkb25seSBwOiBQb2ludDJEO1xufTtcbnR5cGUgT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPiA9ICh0czogQXJyYXk8VG91Y2hNb3ZlPiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG50eXBlIE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPiA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcblxuZXhwb3J0IHR5cGUgT25UYXBIYW5kbGVyPFN0YXRlPiA9IChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIFBhblBvaW50ID0ge1xuICAgIHByZXY6IFBvaW50MkQ7XG4gICAgY3VycjogUG9pbnQyRDtcbn07XG5leHBvcnQgdHlwZSBPblBhbkhhbmRsZXI8U3RhdGU+ID0gKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuLy8gVE9ETzogUGFzcyB0b3VjaCBzaXplIGRvd24gd2l0aCB0b3VjaCBldmVudHMgKGluc3RlYWQgb2Ygc2NhbGU/KVxuLy8gSXMgdGhhdCBlbm91Z2g/IFByb2JhYmx5IHdlIHdpbGwgYWx3YXlzIHdhbnQgYSB0cmFuc29mb3JtYXRpb24gbWF0cml4LlxuLy8gQnV0IGVub3VnaCBmb3Igbm93LCBzbyBqdXN0IGRvIHRoYXQuXG5cbmNsYXNzIFRvdWNoR2VzdHVyZTxTdGF0ZT4ge1xuICAgIG9uVGFwSGFuZGxlcj86IE9uVGFwSGFuZGxlcjxTdGF0ZT47XG4gICAgb25QYW5IYW5kbGVyPzogT25QYW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkJlZ2luSGFuZGxlcj86IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkVuZEhhbmRsZXI/OiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT47XG5cbiAgICBwcml2YXRlIGFjdGl2ZTogTWFwPG51bWJlciwgUG9pbnQyRD47XG4gICAgcHJpdmF0ZSBwYW5zOiBNYXA8bnVtYmVyLCBQYW5Qb2ludD47XG4gICAgcmVhZG9ubHkgb25Ub3VjaEJlZ2luSGFuZGxlcjogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgcmVhZG9ubHkgb25Ub3VjaE1vdmVIYW5kbGVyOiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIHJlYWRvbmx5IG9uVG91Y2hFbmRIYW5kbGVyOiBPblRvdWNoRW5kSGFuZGxlcjxTdGF0ZT47XG4gICAgXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuYWN0aXZlID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBhbnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMub25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwOiBQb2ludDJELCBfOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5hY3RpdmUuc2V0KGlkLCBwKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IFRvdWNoTW92ZVtdLCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYSA9IHRoaXMuYWN0aXZlLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAoYSAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogcGFzcyBpbiBkaXN0YW5jZSB0aHJlc2hvbGQ/IFNjYWxlIGJhc2Ugb24gdHJhbnNmb3Jtcz9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBvaW50RGlzdGFuY2UoYSwgdC5wKSA+PSAxNikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmUuZGVsZXRlKHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldjogYSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiBhLCAgICAvLyBVc2UgdGhlIHN0YXJ0IHBvaW50IGhlcmUsIHNvIHRoZSBmaXJzdCBtb3ZlIGlzIGZyb20gdGhlIHN0YXJ0LlxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucGFucy5nZXQodC5pZCk7XG4gICAgICAgICAgICAgICAgaWYgKHAgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wYW5zLnNpemUgPT09IDAgJiYgdGhpcy5vblBhbkJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyKGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYW5zLnNldCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBwLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyOiB0LnAsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA+IDAgJiYgdGhpcy5vblBhbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25QYW5IYW5kbGVyKFsuLi50aGlzLnBhbnMudmFsdWVzKCldLCBlYywgc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmIChhICE9PSB1bmRlZmluZWQgJiYgdGhpcy5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25UYXBIYW5kbGVyKGEsIGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUoaWQpO1xuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5kZWxldGUoaWQpICYmIHRoaXMucGFucy5zaXplID09PSAwICYmIHRoaXMub25QYW5FbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uUGFuRW5kSGFuZGxlcihlYywgc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cbn07XG5cbi8vIFNvIHRoYXQgd2UgY2FuIHRha2UgSUFyZ3VtZW50cyBhcyBjaGlsZHJlblxuaW50ZXJmYWNlIFN0YXRpY0FycmF5PFQ+IHtcbiAgICBbaW5kZXg6IG51bWJlcl06IFQ7XG4gICAgbGVuZ3RoOiBudW1iZXI7XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxUPjtcbn07XG5cbnR5cGUgQ2hpbGRDb25zdHJhaW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmc+ID0gRWxlbWVudDxMYXlvdXRUeXBlLCBhbnksIGFueT4gfCBTdGF0aWNBcnJheTxFbGVtZW50PExheW91dFR5cGUsIGFueSwgYW55Pj4gfCB1bmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGluaXRUb3VjaEdlc3R1cmU8U3RhdGU+KGU6IEVsZW1lbnQ8YW55LCBhbnksIFN0YXRlPik6IFRvdWNoR2VzdHVyZTxTdGF0ZT4ge1xuICAgIGlmIChlLnRvdWNoR2VzdHVyZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBlLnRvdWNoR2VzdHVyZTtcbiAgICB9XG4gICAgaWYgKGUub25Ub3VjaEJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkIHx8IGUub25Ub3VjaE1vdmVIYW5kbGVyICE9PSB1bmRlZmluZWQgfHwgZS5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVG91Y2ggZ2VzdHVyZXMgYWxyZWFkeSBjYXB0dXJlZCcpO1xuICAgIH1cbiAgICBjb25zdCB0ZyA9IG5ldyBUb3VjaEdlc3R1cmUoKTtcbiAgICBlLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSB0Zy5vblRvdWNoQmVnaW5IYW5kbGVyO1xuICAgIGUub25Ub3VjaE1vdmVIYW5kbGVyID0gdGcub25Ub3VjaE1vdmVIYW5kbGVyO1xuICAgIGUub25Ub3VjaEVuZEhhbmRsZXIgPSB0Zy5vblRvdWNoRW5kSGFuZGxlcjtcbiAgICByZXR1cm4gdGc7XG59XG5cbmZ1bmN0aW9uIGNsYW1wKHg6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoeCA8IG1pbikge1xuICAgICAgICByZXR1cm4gbWluO1xuICAgIH0gZWxzZSBpZiAoeCA+IG1heCkge1xuICAgICAgICByZXR1cm4gbWF4O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbn1cblxuY2xhc3MgRWxlbWVudDxMYXlvdXRUeXBlIGV4dGVuZHMgc3RyaW5nLCBDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxzdHJpbmc+LCBTdGF0ZT4ge1xuICAgIGxheW91dFR5cGU6IExheW91dFR5cGU7XG4gICAgY2hpbGQ6IENoaWxkO1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHN0YXRlOiBTdGF0ZTtcblxuICAgIGNvbnN0cnVjdG9yKGxheW91dFR5cGU6IExheW91dFR5cGUsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHRoaXMubGF5b3V0VHlwZSA9IGxheW91dFR5cGU7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5sZWZ0ID0gTmFOO1xuICAgICAgICB0aGlzLnRvcCA9IE5hTjtcbiAgICAgICAgdGhpcy53aWR0aCA9IE5hTjtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBOYU47XG4gICAgICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB9XG5cbiAgICBvbkRyYXdIYW5kbGVyPzogT25EcmF3SGFuZGxlcjxTdGF0ZT47XG4gICAgb25EcmF3KGhhbmRsZXI6IE9uRHJhd0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIGlmICh0aGlzLm9uRHJhd0hhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvbkRyYXcgYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyPzogT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaE1vdmVIYW5kbGVyPzogT25Ub3VjaE1vdmVIYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoRW5kSGFuZGxlcj86IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcblxuICAgIHRvdWNoR2VzdHVyZT86IFRvdWNoR2VzdHVyZTxTdGF0ZT47XG4gICAgb25UYXAoaGFuZGxlcjogT25UYXBIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblRhcEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblRhcCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBvblBhbihoYW5kbGVyOiBPblBhbkhhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuQmVnaW4oaGFuZGxlcjogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW5CZWdpbiBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuQmVnaW5IYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuRW5kKGhhbmRsZXI6IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPik6IHRoaXMge1xuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZSA9IGluaXRUb3VjaEdlc3R1cmUodGhpcyk7XG4gICAgICAgIGlmICh0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbkVuZCBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuRW5kSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uRGV0YWNoSGFuZGxlcj86IE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4gfCBBcnJheTxPbkRldGFjaEhhbmRsZXI8U3RhdGU+PjtcbiAgICBvbkRldGFjaChoYW5kbGVyOiBPbkRldGFjaEhhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIGlmICh0aGlzLm9uRGV0YWNoSGFuZGxlciA9PT0gdW5kZWZpbmVkIHx8IHRoaXMub25EZXRhY2hIYW5kbGVyID09PSBoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLm9uRGV0YWNoSGFuZGxlci5pbmRleE9mKGhhbmRsZXIpIDwgMCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyLnB1c2goaGFuZGxlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IFt0aGlzLm9uRGV0YWNoSGFuZGxlciwgaGFuZGxlcl07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIHJlbW92ZU9uRGV0YWNoKGhhbmRsZXI6IE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4pOiB2b2lkIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5vbkRldGFjaEhhbmRsZXIpKSB7XG4gICAgICAgICAgICBjb25zdCBpID0gdGhpcy5vbkRldGFjaEhhbmRsZXIuaW5kZXhPZihoYW5kbGVyKTtcbiAgICAgICAgICAgIGlmIChpID49IDApIHtcbiAgICAgICAgICAgICAgICAvLyBDb3B5IHRoZSBhcnJheSwgc28gdGhhdCBpdCdzIHNhZmUgdG8gY2FsbCB0aGlzIGluc2lkZSBhbiBPbkRldGFjaEhhbmRsZXIuXG4gICAgICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSBbLi4udGhpcy5vbkRldGFjaEhhbmRsZXJdLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLm9uRGV0YWNoSGFuZGxlciA9PT0gaGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gYWRkQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+LCBhbnk+LCBjaGlsZDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBpbmRleD86IG51bWJlcikge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+KGUuY2hpbGQubGVuZ3RoICsgMSk7XG4gICAgbGV0IGkgPSAwO1xuICAgIGxldCBqID0gMDtcbiAgICBmb3IgKDsgaSA8IGUuY2hpbGQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPT09IGluZGV4KSB7XG4gICAgICAgICAgICBjaGlsZHJlbltqKytdID0gY2hpbGQ7XG4gICAgICAgIH1cbiAgICAgICAgY2hpbGRyZW5baisrXSA9IGUuY2hpbGRbaV07XG4gICAgfVxuICAgIGlmIChqID09PSBpKSB7XG4gICAgICAgIGNoaWxkcmVuW2pdID0gY2hpbGQ7XG4gICAgfVxuICAgIGUuY2hpbGQgPSBjaGlsZHJlbjtcbiAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG59XG5cbmZ1bmN0aW9uIGNhbGxEZXRhY2hMaXN0ZW5lcnMocm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55Pikge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55LCBhbnk+O1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShlLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiBlLm9uRGV0YWNoSGFuZGxlcikge1xuICAgICAgICAgICAgICAgIGhhbmRsZXIoZSwgZS5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZS5vbkRldGFjaEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZS5vbkRldGFjaEhhbmRsZXIoZSwgZS5zdGF0ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4uZS5jaGlsZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ2hpbGQoZTogRWxlbWVudDxhbnksIFN0YXRpY0FycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+LCBhbnk+LCBpbmRleDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IG5ldyBBcnJheTxFbGVtZW50PGFueSwgYW55LCBhbnk+PihlLmNoaWxkLmxlbmd0aCAtIDEpO1xuICAgIGxldCBqID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGUuY2hpbGQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPT09IGluZGV4KSB7XG4gICAgICAgICAgICBjYWxsRGV0YWNoTGlzdGVuZXJzKGUuY2hpbGRbaV0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hpbGRyZW5baisrXSA9IGUuY2hpbGRbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xuICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFdQSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3BocCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3cGhwJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHMnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocycsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBXU0hQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dzaHAnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3NocCcsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgV1NIU0xheW91dDxDaGlsZCBleHRlbmRzIENoaWxkQ29uc3RyYWludDxhbnk+LCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PCd3c2hzJywgQ2hpbGQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoJ3dzaHMnLCBzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbiAgICBhYnN0cmFjdCBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5leHBvcnQgdHlwZSBMYXlvdXRIYXNXaWR0aEFuZEhlaWdodCA9IFdTSFNMYXlvdXQ8YW55LCBhbnk+O1xuZXhwb3J0IHR5cGUgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCA9IFdQSFBMYXlvdXQ8YW55LCBhbnk+O1xuXG5mdW5jdGlvbiBkcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIGVjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCkge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55LCBhbnk+O1xuICAgICAgICBpZiAoZS5vbkRyYXdIYW5kbGVyKSB7XG4gICAgICAgICAgICBlLm9uRHJhd0hhbmRsZXIoY3R4LCBlLCBlYywgdnAsIGUuc3RhdGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIGRyYXcgaXQgbGFzdC5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBlLmNoaWxkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5maWxsUmVjdChyb290LmxlZnQsIHJvb3QudG9wLCByb290LndpZHRoLCByb290LmhlaWdodCk7XG4gICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgcm9vdCwgZWMsIHZwKTtcbn1cblxudHlwZSBIYXNUb3VjaEhhbmRsZXJzPFN0YXRlPiA9IHtcbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcbn0gJiBFbGVtZW50PGFueSwgYW55LCBTdGF0ZT47XG5cbmZ1bmN0aW9uIGZpbmRUb3VjaFRhcmdldChyb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBwOiBQb2ludDJEKTogdW5kZWZpbmVkIHwgSGFzVG91Y2hIYW5kbGVyczxhbnk+IHtcbiAgICBjb25zdCBzdGFjayA9IFtyb290XTtcbiAgICBjb25zdCB4ID0gcFswXTtcbiAgICBjb25zdCB5ID0gcFsxXTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBlID0gc3RhY2sucG9wKCkgYXMgRWxlbWVudDxhbnksIGFueSwgYW55PjtcbiAgICAgICAgaWYgKHggPCBlLmxlZnQgfHwgeCA+PSBlLmxlZnQgKyBlLndpZHRoIHx8IHkgPCBlLnRvcCB8fCB5ID49IGUudG9wICsgZS5oZWlnaHQpIHtcbiAgICAgICAgICAgIC8vIE91dHNpZGUgZSwgc2tpcC4gIFxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUub25Ub3VjaEJlZ2luSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaE1vdmVIYW5kbGVyICE9PSB1bmRlZmluZWQgJiYgZS5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZSBhcyBIYXNUb3VjaEhhbmRsZXJzPGFueT47IC8vIFRPRE86IFdoeSBjYW4ndCB0eXBlIGluZmVyZW5jZSBmaWd1cmUgdGhpcyBvdXQ/XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUuY2hpbGQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gTm8gY2hpbGRyZW4sIHNvIG5vIG1vcmUgd29yayB0byBkby5cbiAgICAgICAgfSBlbHNlIGlmIChlLmNoaWxkW1N5bWJvbC5pdGVyYXRvcl0pIHtcbiAgICAgICAgICAgIC8vIFB1c2ggZmlyc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIHZpc2l0IGxhc3QgY2hpbGQgbGFzdC5cbiAgICAgICAgICAgIC8vIFRoZSBsYXN0IGNoaWxkICh0aGUgb25lIG9uIHRvcCkgc2hvdWxkIG92ZXJyaWRlIHByZXZpb3VzIGNoaWxkcmVuJ3MgdGFyZ2V0LlxuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5lLmNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxudHlwZSBUQVJHRVRfUk9PVCA9IDE7XG5jb25zdCBUQVJHRVRfUk9PVCA9IDE7XG50eXBlIFRBUkdFVF9OT05FID0gMjtcbmNvbnN0IFRBUkdFVF9OT05FID0gMjtcblxuY2xhc3MgUm9vdEVsZW1lbnRDb250ZXh0IGltcGxlbWVudHMgRWxlbWVudENvbnRleHQge1xuICAgIHByaXZhdGUgbGF5b3V0UmVxdWVzdGVkOiBib29sZWFuO1xuICAgIHByaXZhdGUgbGF5b3V0RXZhbHVhdGluZzogYm9vbGVhbjtcbiAgICBwcml2YXRlIGRyYXdSZXF1ZXN0ZWQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBkcmF3RXZhbHVhdGluZzogYm9vbGVhbjtcbiAgICBwcml2YXRlIHZwOiBMYXlvdXRCb3g7XG4gICAgcHJpdmF0ZSBldmFsdWF0ZTogKCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIGV2YWx1YXRlVG9rZW46IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIG5leHRUaW1lcklEOiBudW1iZXI7XG4gICAgcHJpdmF0ZSB0aW1lcnM6IE1hcDxudW1iZXIsIHsgaGFuZGxlcjogVGltZXJIYW5kbGVyLCBzdGFydDogbnVtYmVyLCBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIH0+O1xuICAgIHByaXZhdGUgY2FsbFRpbWVyc1Rva2VuOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBjYWxsVGltZXJzOiAobm93OiBudW1iZXIpID0+IHZvaWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgcm9vdDogV1BIUExheW91dDxhbnksIGFueT4sIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMubGF5b3V0UmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgIHRoaXMubGF5b3V0RXZhbHVhdGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLmRyYXdSZXF1ZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kcmF3RXZhbHVhdGluZyA9IGZhbHNlO1xuICAgICAgICB0aGlzLnZwID0geyBsZWZ0OiAwLCB0b3A6IDAsIHdpZHRoLCBoZWlnaHQgfTtcbiAgICAgICAgdGhpcy5ldmFsdWF0ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGlmICh0aGlzLmxheW91dFJlcXVlc3RlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMubGF5b3V0UmVxdWVzdGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXlvdXRFdmFsdWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByb290LmxheW91dCh0aGlzLnZwLmxlZnQsIHRoaXMudnAudG9wLCB0aGlzLnZwLndpZHRoLCB0aGlzLnZwLmhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd1JlcXVlc3RlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXlvdXRFdmFsdWF0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZHJhd1JlcXVlc3RlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1JlcXVlc3RlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0V2YWx1YXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eCwgcm9vdCwgdGhpcywgdGhpcy52cCk7XG4gICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3RXZhbHVhdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5ldmFsdWF0ZVRva2VuID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLm5leHRUaW1lcklEID0gMDtcbiAgICAgICAgdGhpcy50aW1lcnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuY2FsbFRpbWVyc1Rva2VuID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLmNhbGxUaW1lcnMgPSAobm93OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbmlzaGVkIDogQXJyYXk8bnVtYmVyPiA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50aW1lcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAodi5zdGFydCA+IG5vdykge1xuICAgICAgICAgICAgICAgICAgICAvLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgaGFuZGxlcnMgc29tZXRpbWVzIHJlY2VpdmUgYSB0aW1lc3RhbXAgZWFybGllclxuICAgICAgICAgICAgICAgICAgICAvLyB0aGFuIHBlcmZvcm1hbmNlLm5vdygpIGNhbGxlZCB3aGVuIHJlcXVlc3RBbmltYXRpb25GcmFtZSB3YXMgY2FsbGVkLlxuICAgICAgICAgICAgICAgICAgICAvLyBTbywgaWYgd2Ugc2VlIGEgdGltZSBpbnZlcnNpb24sIGp1c3QgbW92ZSB0aGUgc3RhcnQgdGltZSBlYXJseS5cbiAgICAgICAgICAgICAgICAgICAgdi5zdGFydCA9IG5vdztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHYuZHVyYXRpb24gIT09IHVuZGVmaW5lZCAmJiB2LmR1cmF0aW9uIDw9IG5vdyAtIHYuc3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdi5oYW5kbGVyKHYuZHVyYXRpb24sIHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICBmaW5pc2hlZC5wdXNoKGspO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHYuaGFuZGxlcihub3cgLSB2LnN0YXJ0LCB0aGlzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgZmluaXNoZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVycy5kZWxldGUoayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lcnMuc2l6ZSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FsbFRpbWVyc1Rva2VuID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuY2FsbFRpbWVycyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FsbFRpbWVyc1Rva2VuID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJlcXVlc3REcmF3KCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5kcmF3RXZhbHVhdGluZykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZHJhdyByZXF1ZXN0ZWQgZHVyaW5nIGRyYXcgZXZhbHVhdGlvblwiKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5sYXlvdXRFdmFsdWF0aW5nKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJsYXlvdXQgcmVxdWVzdGVkIGR1cmluZyBkcmF3IGV2YWx1YXRpb25cIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZHJhd1JlcXVlc3RlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZHJhd1JlcXVlc3RlZCA9IHRydWU7XG4gICAgICAgIGlmICh0aGlzLmV2YWx1YXRlVG9rZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXZhbHVhdGVUb2tlbiA9IHNldFRpbWVvdXQodGhpcy5ldmFsdWF0ZSwgMCk7XG4gICAgfVxuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmxheW91dEV2YWx1YXRpbmcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImxheW91dCByZXF1ZXN0ZWQgZHVyaW5nIGxheW91dCBldmFsdWF0aW9uXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmxheW91dFJlcXVlc3RlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubGF5b3V0UmVxdWVzdGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKHRoaXMuZXZhbHVhdGVUb2tlbiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmFsdWF0ZVRva2VuID0gc2V0VGltZW91dCh0aGlzLmV2YWx1YXRlLCAwKTtcbiAgICB9XG5cbiAgICB0aW1lcihoYW5kbGVyOiBUaW1lckhhbmRsZXIsIGR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMubmV4dFRpbWVySUQ7XG4gICAgICAgIHRoaXMubmV4dFRpbWVySUQrKztcbiAgICAgICAgdGhpcy50aW1lcnMuc2V0KGlkLCB7IGhhbmRsZXIsIHN0YXJ0OiBwZXJmb3JtYW5jZS5ub3coKSwgZHVyYXRpb24gfSk7XG4gICAgICAgIGlmICh0aGlzLmNhbGxUaW1lcnNUb2tlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNhbGxUaW1lcnNUb2tlbiA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmNhbGxUaW1lcnMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICBjbGVhclRpbWVyKGlkOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy50aW1lcnMuZGVsZXRlKGlkKTtcbiAgICAgICAgaWYgKHRoaXMudGltZXJzLnNpemUgPT09IDAgJiYgdGhpcy5jYWxsVGltZXJzVG9rZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5jYWxsVGltZXJzVG9rZW4pO1xuICAgICAgICAgICAgdGhpcy5jYWxsVGltZXJzVG9rZW4gPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRWaWV3cG9ydCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnZwLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMudnAuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB0aGlzLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5ldmFsdWF0ZVRva2VuID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ldmFsdWF0ZVRva2VuKTtcbiAgICAgICAgdGhpcy5ldmFsdWF0ZVRva2VuID0gdW5kZWZpbmVkO1xuICAgIH1cbn07XG5cbmV4cG9ydCBjbGFzcyBSb290TGF5b3V0IHtcbiAgICBlYzogUm9vdEVsZW1lbnRDb250ZXh0O1xuICAgIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55PjtcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xuICAgIC8vY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG4gICAgcmVzaXplOiBSZXNpemVPYnNlcnZlcjtcblxuICAgIHByaXZhdGUgdG91Y2hUYXJnZXRzOiBNYXA8bnVtYmVyLCBIYXNUb3VjaEhhbmRsZXJzPGFueT4gfCBUQVJHRVRfUk9PVCB8IFRBUkdFVF9OT05FPjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0RGV0YWNoZWQ6IE9uRGV0YWNoSGFuZGxlcjxhbnk+O1xuICAgIHByaXZhdGUgdG91Y2hTdGFydDogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDsgXG4gICAgcHJpdmF0ZSB0b3VjaE1vdmU6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgcHJpdmF0ZSB0b3VjaEVuZDogKGV2dDogVG91Y2hFdmVudCkgPT4gdm9pZDtcblxuICAgIGNvbnN0cnVjdG9yKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIsIHthbHBoYTogZmFsc2V9KTtcbiAgICAgICAgaWYgKGN0eCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZmFpbGVkIHRvIGdldCAyZCBjb250ZXh0XCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWMgPSBuZXcgUm9vdEVsZW1lbnRDb250ZXh0KGN0eCwgY2hpbGQsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjaGlsZDtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBjYW52YXM7XG4gICAgICAgIGNhbnZhcy53aWR0aCA9IGNhbnZhcy53aWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICBjYW52YXMuaGVpZ2h0ID0gY2FudmFzLmhlaWdodCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvO1xuICAgICAgICBjdHgudHJhbnNmb3JtKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwLCB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCk7XG4gICAgICAgIHRoaXMuZWMucmVxdWVzdExheW91dCgpO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5yZXNpemUgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNpemVPYnNlcnZlciBleHBlY3RzIDEgZW50cnksIGdvdCAke2VudHJpZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVudHJpZXNbMF0uY29udGVudFJlY3Q7XG4gICAgICAgICAgICBjYW52YXMud2lkdGggPSBjb250ZW50LndpZHRoICogd2luZG93LmRldmljZVBpeGVsUmF0aW87XG4gICAgICAgICAgICBjYW52YXMuaGVpZ2h0ID0gY29udGVudC5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGN0eC50cmFuc2Zvcm0od2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDAsIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwKTtcbiAgICAgICAgICAgIHRoaXMuZWMuc2V0Vmlld3BvcnQoY29udGVudC53aWR0aCwgY29udGVudC5oZWlnaHQpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXNpemUub2JzZXJ2ZShjYW52YXMsIHtib3g6IFwiZGV2aWNlLXBpeGVsLWNvbnRlbnQtYm94XCJ9KTtcblxuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldERldGFjaGVkID0gKGU6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4pID0+IHtcbiAgICAgICAgICAgIGxldCBmb3VuZFRhcmdldCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50b3VjaFRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gZSkge1xuICAgICAgICAgICAgICAgICAgICBlLnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChrLCBUQVJHRVRfTk9ORSk7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kVGFyZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZvdW5kVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aXZlIHRvdWNoIGZvciBkZXRhY2hlZCBlbGVtZW50XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoU3RhcnQgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGxldCB0YXJnZXQgPSB0aGlzLnRvdWNoVGFyZ2V0cy5nZXQodC5pZGVudGlmaWVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcDogUG9pbnQyRCA9IFt0LmNsaWVudFgsIHQuY2xpZW50WV07XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZmluZFRvdWNoVGFyZ2V0KHRoaXMuY2hpbGQsIHApO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCBUQVJHRVRfUk9PVCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBwbGFjZWhvbGRlciB0byBhY3RpdmUgdGFyZ2V0cyBtYXAgc28gd2Uga25vdyBhbmJvdXQgaXQuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbG93IGRlZmF1bHQgYWN0aW9uLCBzbyBlLmcuIHBhZ2UgY2FuIGJlIHNjcm9sbGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KHQuaWRlbnRpZmllciwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKHQuaWRlbnRpZmllciwgcCwgdGhpcy5lYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAvLyBTb21lIHRhcmdldCB3YXMgc29tZSBmb3IgYXQgbGVhc3Qgc29tZSBvZiB0aGUgdG91Y2hlcy4gRG9uJ3QgbGV0IGFueXRoaW5nXG4gICAgICAgICAgICAgICAgLy8gaW4gSFRNTCBnZXQgdGhpcyB0b3VjaC5cbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaE1vdmUgPSAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB7XG4gICAgICAgICAgICBsZXQgcHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnM8YW55PiwgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBldnQudG91Y2hlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIERvbid0IGRvIGFueXRoaW5nLCBhcyB0aGUgcm9vdCBlbGVtZW50IGNhbid0IHNjcm9sbC5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBwcm9iYWJseSBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHMgPSB0YXJnZXRzLmdldCh0YXJnZXQpIHx8IFtdO1xuICAgICAgICAgICAgICAgICAgICB0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkOiB0LmlkZW50aWZpZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwOiBbdC5jbGllbnRYLCB0LmNsaWVudFldLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5zZXQodGFyZ2V0LCB0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0c10gb2YgdGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoTW92ZUhhbmRsZXIodHMsIHRoaXMuZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldmVudERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICBldnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50b3VjaEVuZCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlZCA9IG5ldyBNYXAodGhpcy50b3VjaFRhcmdldHMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlbW92ZWQuZGVsZXRlKHQuaWRlbnRpZmllcikgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIHdpdGhvdXQgc3RhcnQsIGlkICR7dC5pZGVudGlmaWVyfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgW2lkLCB0YXJnZXRdIG9mIHJlbW92ZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5kZWxldGUoaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IFRBUkdFVF9ST09UICYmIHRhcmdldCAhPT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCB0aGlzLmVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLnRvdWNoU3RhcnQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcInRvdWNobW92ZVwiLCB0aGlzLnRvdWNoTW92ZSwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hlbmRcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hjYW5jZWxcIiwgdGhpcy50b3VjaEVuZCwgZmFsc2UpO1xuICAgIH1cblxuICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgIHRoaXMucmVzaXplLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgdGhpcy5lYy5kaXNjb25uZWN0KCk7XG4gICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnModGhpcy5jaGlsZCk7XG5cbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICB9XG59O1xuXG4vLyBUT0RPOiBIYXZlIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiAoc28gaGlkZSBjaGlsZHJlbiwgYW5kIGZvcndhcmQgdGFwL3Bhbi9kcmF3IG1hbnVhbGx5LCB3aXRoIHRyYW5zZm9ybSlcbi8vIFRPRE86IGNvbnZlcnQgdG8gdXNlIEFmZmluZSB0cmFuc2Zvcm0uXG5cbmNsYXNzIFNjcm9sbExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+IHtcbiAgICAvLyBTY3JvbGxMYXlvdXQgaGFzIHRvIGludGVyY2VwdCBhbGwgZXZlbnRzIHRvIG1ha2Ugc3VyZSBhbnkgbG9jYXRpb25zIGFyZSB1cGRhdGVkIGJ5XG4gICAgLy8gdGhlIHNjcm9sbCBwb3NpdGlvbiwgc28gY2hpbGQgaXMgdW5kZWZpbmVkLCBhbmQgYWxsIGV2ZW50cyBhcmUgZm9yd2FyZGVkIHRvIHNjcm9sbGVyLlxuICAgIHNjcm9sbGVyOiBXU0hTTGF5b3V0PGFueSwgYW55PjtcbiAgICBzY3JvbGw6IFBvaW50MkQ7XG4gICAgem9vbTogbnVtYmVyO1xuICAgIHpvb21NYXg6IG51bWJlcjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVyczx1bmtub3duPiB8IFRBUkdFVF9ST09UIHwgVEFSR0VUX05PTkU+O1xuICAgIHByaXZhdGUgdG91Y2hTY3JvbGw6IE1hcDxudW1iZXIsIHsgcHJldjogUG9pbnQyRCwgY3VycjogUG9pbnQyRCB9PjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0RGV0YWNoZWQ6IE9uRGV0YWNoSGFuZGxlcjx1bmtub3duPjtcblxuICAgIHByaXZhdGUgdXBkYXRlU2Nyb2xsKCkge1xuICAgICAgICBjb25zdCB0cyA9IFsuLi50aGlzLnRvdWNoU2Nyb2xsLnZhbHVlcygpXTtcbiAgICAgICAgaWYgKHRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHRzWzBdO1xuICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucDJjKHQucHJldik7XG4gICAgICAgICAgICBjb25zdCBjID0gdGhpcy5wMmModC5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzBdICs9IHBbMF0gLSBjWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcFsxXSAtIGNbMV07XG4gICAgICAgIH0gZWxzZSBpZiAodHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwbSA9IHRoaXMucDJjKFtcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlswXSArIHRzWzFdLnByZXZbMF0pICogMC41LFxuICAgICAgICAgICAgICAgICh0c1swXS5wcmV2WzFdICsgdHNbMV0ucHJldlsxXSkgKiAwLjUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGNvbnN0IHBkID0gcG9pbnREaXN0YW5jZSh0c1swXS5wcmV2LCB0c1sxXS5wcmV2KTtcbiAgICAgICAgICAgIGNvbnN0IGNkID0gcG9pbnREaXN0YW5jZSh0c1swXS5jdXJyLCB0c1sxXS5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuem9vbSAqPSBjZCAvIHBkO1xuICAgICAgICAgICAgLy8gQ2xhbXAgem9vbSBzbyB3ZSBjYW4ndCB6b29tIG91dCB0b28gZmFyLlxuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIud2lkdGggPCB0aGlzLndpZHRoIC8gdGhpcy56b29tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy53aWR0aCAvIHRoaXMuc2Nyb2xsZXIud2lkdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxlci5oZWlnaHQgPCB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuaGVpZ2h0IC8gdGhpcy5zY3JvbGxlci5oZWlnaHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy56b29tID4gdGhpcy56b29tTWF4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy56b29tTWF4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY20gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMF0gKyB0c1sxXS5jdXJyWzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclsxXSArIHRzWzFdLmN1cnJbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwbVswXSAtIGNtWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcG1bMV0gLSBjbVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbFswXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzBdLCAwLCB0aGlzLnNjcm9sbGVyLndpZHRoIC0gdGhpcy53aWR0aCAvIHRoaXMuem9vbSk7XG4gICAgICAgIHRoaXMuc2Nyb2xsWzFdID0gY2xhbXAodGhpcy5zY3JvbGxbMV0sIDAsIHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IC0gdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcDJjKHA6IFBvaW50MkQpOiBQb2ludDJEIHtcbiAgICAgICAgY29uc3QgcyA9IHRoaXMuc2Nyb2xsO1xuICAgICAgICBjb25zdCBzaHJpbmsgPSAxIC8gdGhpcy56b29tO1xuICAgICAgICAvLyBUT0RPOiB0YWtlIHBhcmVudCByZWN0IGludG8gYWNjb3VudFxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgKHBbMF0gLSB0aGlzLmxlZnQpICogc2hyaW5rICsgc1swXSxcbiAgICAgICAgICAgIChwWzFdIC0gdGhpcy50b3ApICogc2hyaW5rICsgc1sxXSxcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHNjcm9sbDogUG9pbnQyRCwgem9vbTogbnVtYmVyLCB6b29tTWF4OiBudW1iZXIpIHtcbiAgICAgICAgc3VwZXIodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLnNjcm9sbGVyID0gY2hpbGQ7XG4gICAgICAgIHRoaXMuc2Nyb2xsID0gc2Nyb2xsO1xuICAgICAgICB0aGlzLnpvb20gPSB6b29tO1xuICAgICAgICB0aGlzLnpvb21NYXggPSB6b29tTWF4O1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFNjcm9sbCA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldERldGFjaGVkID0gKGU6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4pID0+IHtcbiAgICAgICAgICAgIGxldCBmb3VuZFRhcmdldCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgdGhpcy50b3VjaFRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBpZiAodiA9PT0gZSkge1xuICAgICAgICAgICAgICAgICAgICBlLnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChrLCBUQVJHRVRfTk9ORSk7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kVGFyZ2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWZvdW5kVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aXZlIHRvdWNoIGZvciBkZXRhY2hlZCBlbGVtZW50XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgdGhpcy5vbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIGVjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgICAgIGN0eC5zYXZlKCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUodGhpcy5sZWZ0LCB0aGlzLnRvcCk7XG4gICAgICAgICAgICAvLyBDbGlwIHRvIFNjcm9sbCB2aWV3cG9ydC5cbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5tb3ZlVG8oMCwgMCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHRoaXMud2lkdGgsIDApO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBjdHgubGluZVRvKDAsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5jbGlwKCk7XG4gICAgICAgICAgICBjdHguc2NhbGUodGhpcy56b29tLCB0aGlzLnpvb20pO1xuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSgtdGhpcy5zY3JvbGxbMF0sIC10aGlzLnNjcm9sbFsxXSk7XG4gICAgICAgICAgICBjb25zdCB2cFNjcm9sbGVyID0ge1xuICAgICAgICAgICAgICAgIGxlZnQ6IHRoaXMuc2Nyb2xsWzBdLFxuICAgICAgICAgICAgICAgIHRvcDogdGhpcy5zY3JvbGxbMV0sXG4gICAgICAgICAgICAgICAgd2lkdGg6IHRoaXMud2lkdGggLyB0aGlzLnpvb20sXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBkcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLnNjcm9sbGVyLCBlYywgdnBTY3JvbGxlcik7XG4gICAgICAgICAgICAvLyBUT0RPOiByZXN0b3JlIHRyYW5zZm9ybSBpbiBhIGZpbmFsbHk/XG4gICAgICAgICAgICBjdHgucmVzdG9yZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMub25Ub3VjaEJlZ2luSGFuZGxlciA9IChpZDogbnVtYmVyLCBwcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjcCA9IHRoaXMucDJjKHBwKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGZpbmRUb3VjaFRhcmdldCh0aGlzLnNjcm9sbGVyLCBjcCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgcGxhY2Vob2xkZXIgbnVsbCB0byBhY3RpdmUgdG91Y2hlcywgc28gd2Uga25vdyB0aGV5IHNob3VsZCBzY3JvbGwuXG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCBUQVJHRVRfUk9PVCk7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFNjcm9sbC5zZXQoaWQsIHsgcHJldjogcHAsIGN1cnI6IHBwIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaWQsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hCZWdpbkhhbmRsZXIoaWQsIGNwLCBlYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoTW92ZUhhbmRsZXIgPSAodHM6IEFycmF5PFRvdWNoTW92ZT4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVyczxhbnk+LCBBcnJheTxUb3VjaE1vdmU+PigpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIHRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggbW92ZSBJRCAke3QuaWR9YCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9ST09UKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjcm9sbCA9IHRoaXMudG91Y2hTY3JvbGwuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc2Nyb2xsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggbW92ZSB3aXRoIElEICR7dC5pZH0gaGFzIHRhcmdldCA9PT0gVEFSR0VUX1JPT1QsIGJ1dCBpcyBub3QgaW4gdG91Y2hTY3JvbGxgKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbC5wcmV2ID0gc2Nyb2xsLmN1cnI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbC5jdXJyID0gdC5wO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBkbyBhbnl0aGluZywgdGFyZ2V0IGRlbGV0ZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHRzID0gdGFyZ2V0cy5nZXQodGFyZ2V0KSB8fCBbXTtcbiAgICAgICAgICAgICAgICAgICAgdHRzLnB1c2godCk7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMuc2V0KHRhcmdldCwgdHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzY3JvbGwgcG9zaXRpb24uXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVNjcm9sbCgpO1xuXG4gICAgICAgICAgICAvLyBGb3J3YXJkIHRvdWNoIG1vdmVzLlxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGFyZ2V0LCB0dHNdIG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHR0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0dHNbaV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZDogdHRzW2ldLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcDogdGhpcy5wMmModHRzW2ldLnApLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaE1vdmVIYW5kbGVyKHR0cywgZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hFbmRIYW5kbGVyID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KGlkKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biB0b3VjaCBlbmQgSUQgJHtpZH1gKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy50b3VjaFNjcm9sbC5kZWxldGUoaWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggZW5kIElEICR7aWR9IGhhcyB0YXJnZXQgVEFSR0VUX1JPT1QsIGJ1dCBpcyBub3QgaW4gdG91Y2hTY3JvbGxgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAvLyBEbyBub3RoaW5nLCB0YXJldCB3YXMgZGVsZXRlZC5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuZGVsZXRlKGlkKTtcbiAgICAgICAgICAgICAgICB0YXJnZXQucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hFbmRIYW5kbGVyKGlkLCBlYywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IG90aGVyIGhhbmRsZXJzIG5lZWQgZm9yd2FyZGluZy5cbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgdGhpcy5zY3JvbGxlci5sYXlvdXQoMCwgMCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gU2Nyb2xsKGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc2Nyb2xsPzogUG9pbnQyRCwgem9vbT86IG51bWJlciwgem9vbU1heD86IG51bWJlcik6IFNjcm9sbExheW91dCB7XG4gICAgLy8gTkI6IHNjYWxlIG9mIDAgaXMgaW52YWxpZCBhbnl3YXlzLCBzbyBpdCdzIE9LIHRvIGJlIGZhbHN5LlxuICAgIHJldHVybiBuZXcgU2Nyb2xsTGF5b3V0KGNoaWxkLCBzY3JvbGwgfHwgWzAsIDBdLCB6b29tIHx8IDEsIHpvb21NYXggfHwgMTApO1xufVxuXG4vLyBUT0RPOiBzY3JvbGx4LCBzY3JvbGx5XG5cbmNsYXNzIEJveExheW91dDxTdGF0ZSwgQ2hpbGQgZXh0ZW5kcyBXUEhQTGF5b3V0PGFueSwgYW55PiB8IHVuZGVmaW5lZD4gZXh0ZW5kcyBXU0hTTGF5b3V0PENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgaWYgKHRoaXMuY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IFdTSFNMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFdTSFNMYXlvdXQ8YW55LCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSk6IFdTSFNMYXlvdXQ8YW55LCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm94PFN0YXRlPih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBXU0hTTGF5b3V0PGFueSwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpcnN0PzogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55Piwgc2Vjb25kPzogV1BIUExheW91dDxhbnksIGFueT4pOiBXU0hTTGF5b3V0PGFueSwgU3RhdGU+IHwgV1NIU0xheW91dDxhbnksIHVuZGVmaW5lZD4ge1xuICAgIGlmIChzZWNvbmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+KHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PHVuZGVmaW5lZCwgV1BIUExheW91dDxhbnksIGFueT4+KHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgZmlyc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8U3RhdGUsIHVuZGVmaW5lZD4od2lkdGgsIGhlaWdodCwgZmlyc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDxTdGF0ZSwgV1BIUExheW91dDxhbnksIGFueT4+KHdpZHRoLCBoZWlnaHQsIGZpcnN0IGFzIFN0YXRlLCBzZWNvbmQpO1xuICAgICAgICAvLyBUT0RPOiB0aGUgc3RhdGUgc2hvdWxkIHR5cGUtY2hlY2suXG4gICAgfVxufVxuXG5jbGFzcyBXUEhQQm9yZGVyTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgYm9yZGVyOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4sIGJvcmRlcjogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdGF0ZTogU3RhdGUpIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5ib3JkZXIgPSBib3JkZXI7XG4gICAgICAgIHRoaXMuc3R5bGUgPSBzdHlsZTtcblxuICAgICAgICB0aGlzLm9uRHJhd0hhbmRsZXIgPSAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgICAgICBjb25zdCBiMiA9IGIgKiAwLjU7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSB0aGlzLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IHRoaXMuYm9yZGVyO1xuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyBiMiwgYm94LnRvcCArIGIyLCBib3gud2lkdGggLSBiLCBib3guaGVpZ2h0IC0gYik7XG4gICAgICAgIH07XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjb25zdCBiID0gdGhpcy5ib3JkZXI7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQgKyBiLCB0b3AgKyBiLCB3aWR0aCAtIGIgKiAyLCBoZWlnaHQgLSBiICogMik7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gQm9yZGVyPFN0YXRlPih3aWR0aDogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4sIHN0YXRlPzogU3RhdGUpOiBXUEhQTGF5b3V0PGFueSwgYW55PiB7XG4gICAgaWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXUEhQQm9yZGVyTGF5b3V0PHVuZGVmaW5lZD4oY2hpbGQsIHdpZHRoLCBzdHlsZSwgdW5kZWZpbmVkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFdQSFBCb3JkZXJMYXlvdXQ8U3RhdGU+KGNoaWxkLCB3aWR0aCwgc3R5bGUsIHN0YXRlKTtcbiAgICB9XG59XG5cbmNsYXNzIEZpbGxMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDx1bmRlZmluZWQsIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlKSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBGaWxsKCk6IEZpbGxMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBGaWxsPFN0YXRlPihzdGF0ZTogU3RhdGUpOiBGaWxsTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBGaWxsPFN0YXRlPihzdGF0ZT86IFN0YXRlKTogRmlsbExheW91dDx1bmRlZmluZWQ+IHwgRmlsbExheW91dDxTdGF0ZT4ge1xuICAgIGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmlsbExheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGaWxsTGF5b3V0PFN0YXRlPihzdGF0ZSk7XG4gICAgfVxufVxuXG5jbGFzcyBDZW50ZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXU0hTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogQ2VudGVyTGF5b3V0PFN0YXRlPiB7XG4gICAgcmV0dXJuIG5ldyBDZW50ZXJMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG59XG5cbmNsYXNzIEhDZW50ZXJIUExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbmNsYXNzIEhDZW50ZXJIU0xheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhTTGF5b3V0PFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkTGVmdCA9IGxlZnQgKyAod2lkdGggLSBjaGlsZC53aWR0aCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IEhDZW50ZXJIU0xheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55PiB8IFdTSFBMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBIQ2VudGVySFNMYXlvdXQ8U3RhdGU+IHwgSENlbnRlckhQTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIUExheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IEhDZW50ZXJIU0xheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9XG59XG5cbmNsYXNzIFZDZW50ZXJXUExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFNMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFNMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRUb3AgPSB0b3AgKyAoaGVpZ2h0IC0gY2hpbGQuaGVpZ2h0KSAqIDAuNTtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3AsIHdpZHRoKTtcbiAgICB9XG59O1xuXG5jbGFzcyBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1NIUExheW91dDxXU0hTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLndpZHRoID0gY2hpbGQud2lkdGg7XG4gICAgfVxuICAgIFxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChsZWZ0LCBjaGlsZFRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogVkNlbnRlcldTTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1BIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IFZDZW50ZXJXUExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+IHwgV1BIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IFZDZW50ZXJXU0xheW91dDxTdGF0ZT4gfCBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoY2hpbGQubGF5b3V0VHlwZSA9PT0gJ3dwaHMnKSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldQTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgVkNlbnRlcldTTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZsZXhMYXlvdXQ8U3RhdGUsIENoaWxkIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT4gfCB1bmRlZmluZWQ+IGV4dGVuZHMgRWxlbWVudDwnZmxleCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBncm93OiBudW1iZXI7XG4gICAgY29uc3RydWN0b3Ioc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCdmbGV4Jywgc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5zaXplID0gc2l6ZTtcbiAgICAgICAgdGhpcy5ncm93ID0gZ3JvdztcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6bnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gRmxleChzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlcik6IEZsZXhMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXg8U3RhdGU+KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBzdGF0ZTogU3RhdGUpOiBGbGV4TGF5b3V0PFN0YXRlLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXgoc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8dW5kZWZpbmVkLCBXUEhQTGF5b3V0PGFueSwgYW55Pj47XG5leHBvcnQgZnVuY3Rpb24gRmxleDxTdGF0ZT4oc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDxTdGF0ZSwgV1BIUExheW91dDxhbnksIGFueT4+O1xuZXhwb3J0IGZ1bmN0aW9uIEZsZXg8U3RhdGU+KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBmaXJzdD86IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIHNlY29uZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDxhbnksIGFueT4ge1xuICAgIGlmIChmaXJzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChzZWNvbmQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIGZpcnN0LCBzZWNvbmQpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpcnN0IGluc3RhbmNlb2YgV1BIUExheW91dCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIHVuZGVmaW5lZCwgZmlyc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0KHNpemUsIGdyb3csIGZpcnN0LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBGbGV4TGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPihzaXplLCBncm93LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgfVxufVxuXG5jbGFzcyBMZWZ0RmxleExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkcmVuKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGxldCBzdW1TaXplID0gMDtcbiAgICAgICAgbGV0IHN1bUdyb3cgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgc3VtU2l6ZSArPSBjLnNpemU7XG4gICAgICAgICAgICBzdW1Hcm93ICs9IGMuZ3JvdztcbiAgICAgICAgfVxuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgbGV0IGV4dHJhID0gaGVpZ2h0IC0gc3VtU2l6ZTtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGxldCBjaGlsZFdpZHRoID0gYy5zaXplO1xuICAgICAgICAgICAgaWYgKGMuZ3JvdyAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNoaWxkV2lkdGggKz0gZXh0cmEgKiBjLmdyb3cgLyBzdW1Hcm93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYy5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGNoaWxkV2lkdGgsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGRXaWR0aDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KC4uLmNoaWxkcmVuOiBBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4pOiBMZWZ0RmxleExheW91dDx1bmRlZmluZWQ+XG5leHBvcnQgZnVuY3Rpb24gTGVmdDxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogTGVmdEZsZXhMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQ8U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IEZsZXhMYXlvdXQ8YW55LCBhbnk+LCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogTGVmdEZsZXhMYXlvdXQ8YW55PiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRmxleExheW91dCkge1xuICAgICAgICByZXR1cm4gbmV3IExlZnRGbGV4TGF5b3V0KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgTGVmdEZsZXhMYXlvdXQoZmlyc3QsIGNoaWxkcmVuKTtcbiAgICB9XG59XG5cbmNsYXNzIEJvdHRvbUZsZXhMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxGbGV4TGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICBsZXQgc3VtU2l6ZSA9IDA7XG4gICAgICAgIGxldCBzdW1Hcm93ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIHN1bVNpemUgKz0gYy5zaXplO1xuICAgICAgICAgICAgc3VtR3JvdyArPSBjLmdyb3c7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGNoaWxkVG9wID0gdG9wICsgaGVpZ2h0O1xuICAgICAgICBsZXQgZXh0cmEgPSBoZWlnaHQgLSBzdW1TaXplO1xuICAgICAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgbGV0IGNoaWxkSGVpZ2h0ID0gYy5zaXplO1xuICAgICAgICAgICAgaWYgKGMuZ3JvdyAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNoaWxkSGVpZ2h0ICs9IGV4dHJhICogYy5ncm93IC8gc3VtR3JvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNoaWxkVG9wIC09IGNoaWxkSGVpZ2h0O1xuICAgICAgICAgICAgYy5sYXlvdXQobGVmdCwgY2hpbGRUb3AsIHdpZHRoLCBjaGlsZEhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBCb3R0b20oLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IEJvdHRvbUZsZXhMYXlvdXQ8dW5kZWZpbmVkPlxuZXhwb3J0IGZ1bmN0aW9uIEJvdHRvbTxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8RmxleExheW91dDxhbnksIGFueT4+KTogQm90dG9tRmxleExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gQm90dG9tPFN0YXRlPihmaXJzdDogU3RhdGUgfCBGbGV4TGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PEZsZXhMYXlvdXQ8YW55LCBhbnk+Pik6IEJvdHRvbUZsZXhMYXlvdXQ8YW55PiB7XG4gICAgaWYgKGZpcnN0IGluc3RhbmNlb2YgRmxleExheW91dCkge1xuICAgICAgICByZXR1cm4gbmV3IEJvdHRvbUZsZXhMYXlvdXQodW5kZWZpbmVkLCBbZmlyc3QsIC4uLmNoaWxkcmVuXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCb3R0b21GbGV4TGF5b3V0KGZpcnN0LCBjaGlsZHJlbik7XG4gICAgfVxufVxuXG50eXBlIERlYnVnVG91Y2hTdGF0ZSA9IHtcbiAgICBmaWxsOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sXG4gICAgc3Ryb2tlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sXG4gICAgdGFwczogQXJyYXk8UG9pbnQyRD4sXG4gICAgcGFuczogQXJyYXk8QXJyYXk8UGFuUG9pbnQ+Pixcbn07XG5cbmZ1bmN0aW9uIGRlYnVnVG91Y2hPbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIGN0eC5maWxsU3R5bGUgPSBzdGF0ZS5maWxsO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0YXRlLnN0cm9rZTtcbiAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGZvciAoY29uc3QgdGFwIG9mIHN0YXRlLnRhcHMpIHtcbiAgICAgICAgY3R4Lm1vdmVUbyh0YXBbMF0gKyAxNiwgdGFwWzFdKTtcbiAgICAgICAgY3R4LmVsbGlwc2UodGFwWzBdLCB0YXBbMV0sIDE2LCAxNiwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHBzIG9mIHN0YXRlLnBhbnMpIHtcbiAgICAgICAgZm9yIChjb25zdCBwIG9mIHBzKSB7XG4gICAgICAgICAgICBjdHgubW92ZVRvKHAucHJldlswXSwgcC5wcmV2WzFdKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8ocC5jdXJyWzBdLCBwLmN1cnJbMV0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZGVidWdUb3VjaE9uVGFwKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIHN0YXRlLnRhcHMucHVzaChwKTtcbiAgICBlYy5yZXF1ZXN0RHJhdygpO1xufVxuXG5mdW5jdGlvbiBkZWJ1Z1RvdWNoT25QYW4ocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogRGVidWdUb3VjaFN0YXRlKSB7XG4gICAgc3RhdGUucGFucy5wdXNoKHBzKTtcbiAgICBlYy5yZXF1ZXN0RHJhdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gRGVidWdUb3VjaCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBzdHJva2U6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybik6IEJveExheW91dDxEZWJ1Z1RvdWNoU3RhdGUsIHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IHN0YXRlID0ge1xuICAgICAgICBmaWxsLFxuICAgICAgICBzdHJva2UsXG4gICAgICAgIHRhcHM6IFtdLFxuICAgICAgICBwYW5zOiBbXSxcbiAgICB9O1xuICAgIHJldHVybiBCb3g8RGVidWdUb3VjaFN0YXRlPih3aWR0aCwgaGVpZ2h0LCBzdGF0ZSlcbiAgICAgICAgLm9uRHJhdyhkZWJ1Z1RvdWNoT25EcmF3KVxuICAgICAgICAub25UYXAoZGVidWdUb3VjaE9uVGFwKVxuICAgICAgICAub25QYW4oZGVidWdUb3VjaE9uUGFuKTtcbn1cblxuY2xhc3MgTGF5ZXJMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxTdGF0aWNBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBMYXllcjxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KTogTGF5ZXJMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIExheWVyKC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pOiBMYXllckxheW91dDx1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIExheWVyPFN0YXRlPihmaXJzdDogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pik6IExheWVyTGF5b3V0PFN0YXRlPiB8IExheWVyTGF5b3V0PHVuZGVmaW5lZD4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMYXllckxheW91dDx1bmRlZmluZWQ+KHVuZGVmaW5lZCwgW2ZpcnN0LCAuLi5jaGlsZHJlbl0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IExheWVyTGF5b3V0PFN0YXRlPihmaXJzdCwgY2hpbGRyZW4pO1xufVxuXG5leHBvcnQgdHlwZSBPblN3aXRjaFNlbGVjdCA9IChlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmNsYXNzIFN3aXRjaExheW91dDxJbmRpY2VzIGV4dGVuZHMgbnVtYmVyPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIEluZGljZXM+IHtcbiAgICBwcml2YXRlIGNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj47XG5cbiAgICBjb25zdHJ1Y3RvcihpOiBJbmRpY2VzLCBjaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKGksIGNoaWxkcmVuW2ldKTtcbiAgICAgICAgdGhpcy5jaGlsZHJlbiA9IGNoaWxkcmVuO1xuICAgIH1cblxuICAgIHNldChpOiBJbmRpY2VzLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKGkgIT09IHRoaXMuc3RhdGUpIHtcbiAgICAgICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnModGhpcy5jaGlsZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdGF0ZSA9IGk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZ2V0KCk6IEluZGljZXMge1xuICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQpO1xuICAgIH1cbn07XG5cbnR5cGUgSW5kaWNlczxUIGV4dGVuZHMgYW55W10+ID0gRXhjbHVkZTxQYXJ0aWFsPFQ+W1wibGVuZ3RoXCJdLCBUW1wibGVuZ3RoXCJdPiAmIG51bWJlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIFN3aXRjaDxDaGlsZHJlbiBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+W10+KGk6IEluZGljZXM8Q2hpbGRyZW4+LCAuLi5jaGlsZHJlbjogQ2hpbGRyZW4pOiBTd2l0Y2hMYXlvdXQ8SW5kaWNlczxDaGlsZHJlbj4+IHtcbiAgICByZXR1cm4gbmV3IFN3aXRjaExheW91dChpLCBjaGlsZHJlbik7XG59XG5cbmV4cG9ydCB0eXBlIE11eEtleSA9IHN0cmluZyB8IG51bWJlciB8IHN5bWJvbDtcblxuZnVuY3Rpb24gbXV4RWxlbWVudHMoZW5hYmxlZDogU2V0PE11eEtleT4sIGVzOiBBcnJheTxbTXV4S2V5LCBXUEhQTGF5b3V0PGFueSwgYW55Pl0+KTogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+IHtcbiAgICBjb25zdCByZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBlcykge1xuICAgICAgICBpZiAoZW5hYmxlZC5oYXMoaykpIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKHYpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbmNsYXNzIE11eExheW91dDxLIGV4dGVuZHMgTXV4S2V5PiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+LCB1bmRlZmluZWQ+IHtcbiAgICBwcml2YXRlIGVuYWJsZWQ6IFNldDxLPjtcbiAgICBwcml2YXRlIG11eDogQXJyYXk8W0ssIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT47XG5cbiAgICBjb25zdHJ1Y3RvcihlbmFibGVkOiBTZXQ8Sz4sIGNoaWxkcmVuOiBBcnJheTxbSywgV1BIUExheW91dDxhbnksIGFueT5dPikge1xuICAgICAgICBzdXBlcih1bmRlZmluZWQsIG11eEVsZW1lbnRzKGVuYWJsZWQsIGNoaWxkcmVuKSk7XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIHRoaXMubXV4ID0gY2hpbGRyZW47XG4gICAgfVxuXG4gICAgc2V0KGVjOiBFbGVtZW50Q29udGV4dCwgLi4uZW5hYmxlOiBBcnJheTxLPikge1xuICAgICAgICBjb25zdCBlbmFibGVkID0gbmV3IFNldChlbmFibGUpO1xuICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLm11eCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZW5hYmxlZC5oYXMoaykgJiYgIWVuYWJsZWQuaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgY2FsbERldGFjaExpc3RlbmVycyh2KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkO1xuICAgICAgICB0aGlzLmNoaWxkID0gbXV4RWxlbWVudHModGhpcy5lbmFibGVkLCB0aGlzLm11eCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9XG5cbiAgICBnZXQoKTogU2V0PEs+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTXV4PEtleSBleHRlbmRzIE11eEtleSwgRW5hYmxlZEtleSBleHRlbmRzIEtleT4oZW5hYmxlZDogQXJyYXk8RW5hYmxlZEtleT4sIC4uLmNoaWxkcmVuOiBBcnJheTxbS2V5LCBXUEhQTGF5b3V0PGFueSwgYW55Pl0+KTogTXV4TGF5b3V0PEtleT4ge1xuICAgIHJldHVybiBuZXcgTXV4TGF5b3V0PHR5cGVvZiBjaGlsZHJlbltudW1iZXJdWzBdPihuZXcgU2V0KGVuYWJsZWQpLCBjaGlsZHJlbik7XG59XG5cbmV4cG9ydCBjbGFzcyBQb3NpdGlvbkxheW91dDxDaGlsZCBleHRlbmRzIFdQSFBMYXlvdXQ8YW55LCBhbnk+IHwgdW5kZWZpbmVkLCBTdGF0ZT4gZXh0ZW5kcyBFbGVtZW50PFwicG9zXCIsIENoaWxkLCBTdGF0ZT4ge1xuICAgIHJlcXVlc3RMZWZ0OiBudW1iZXI7XG4gICAgcmVxdWVzdFRvcDogbnVtYmVyO1xuICAgIHJlcXVlc3RXaWR0aDogbnVtYmVyO1xuICAgIHJlcXVlc3RIZWlnaHQ6IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcihcInBvc1wiLCBzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLnJlcXVlc3RMZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0VG9wID0gdG9wO1xuICAgICAgICB0aGlzLnJlcXVlc3RXaWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLnJlcXVlc3RIZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxuICAgIGxheW91dChwYXJlbnQ6IExheW91dEJveCkge1xuICAgICAgICB0aGlzLndpZHRoID0gTWF0aC5taW4odGhpcy5yZXF1ZXN0V2lkdGgsIHBhcmVudC53aWR0aCk7XG4gICAgICAgIHRoaXMubGVmdCA9IGNsYW1wKHRoaXMucmVxdWVzdExlZnQsIHBhcmVudC5sZWZ0LCBwYXJlbnQubGVmdCArIHBhcmVudC53aWR0aCAtIHRoaXMud2lkdGgpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IE1hdGgubWluKHRoaXMucmVxdWVzdEhlaWdodCwgcGFyZW50LmhlaWdodCk7XG4gICAgICAgIHRoaXMudG9wID0gY2xhbXAodGhpcy5yZXF1ZXN0VG9wLCBwYXJlbnQudG9wLCBwYXJlbnQudG9wICsgcGFyZW50LmhlaWdodCAtIHRoaXMuaGVpZ2h0KTtcblxuICAgICAgICBpZiAodGhpcy5jaGlsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLmNoaWxkLmxheW91dCh0aGlzLmxlZnQsIHRoaXMudG9wLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vLyBUT0RPOiBzdXBwb3J0IHN0YXRpY2FsbHkgc2l6ZWQgY2hpbGRyZW4sIFxuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlKTogUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCBTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUG9zaXRpb24obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCB1bmRlZmluZWQ+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBQb3NpdGlvbkxheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uPFN0YXRlPihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZmlyc3Q/OiBTdGF0ZSB8IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzZWNvbmQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pikge1xuICAgIGlmIChzZWNvbmQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoZmlyc3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIHVuZGVmaW5lZD4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCB1bmRlZmluZWQ+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBmaXJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgU3RhdGU+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgZmlyc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFBvc2l0aW9uTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4obGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0LCBmaXJzdCBhcyBTdGF0ZSwgc2Vjb25kKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBEcmFnZ2FibGUobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGNoaWxkPzogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICBjb25zdCBsYXlvdXQgPSBuZXcgUG9zaXRpb25MYXlvdXQ8YW55LCB1bmRlZmluZWQ+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCBjaGlsZCk7XG4gICAgcmV0dXJuIGxheW91dC5vblBhbigocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGxldCBkeCA9IDA7XG4gICAgICAgIGxldCBkeSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgZHggKz0gcC5jdXJyWzBdIC0gcC5wcmV2WzBdO1xuICAgICAgICAgICAgZHkgKz0gcC5jdXJyWzFdIC0gcC5wcmV2WzFdO1xuICAgICAgICB9XG4gICAgICAgIGR4IC89IHBzLmxlbmd0aDtcbiAgICAgICAgZHkgLz0gcHMubGVuZ3RoO1xuICAgICAgICBsYXlvdXQucmVxdWVzdExlZnQgKz0gZHg7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wICs9IGR5O1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSkub25QYW5FbmQoKCkgPT4ge1xuICAgICAgICAvLyBUaGUgcmVxdWVzdGVkIGxvY2F0aW9uIGNhbiBiZSBvdXRzaWRlIHRoZSBhbGxvd2VkIGJvdW5kcyBpZiBkcmFnZ2VkIG91dHNpZGUsXG4gICAgICAgIC8vIGJ1dCBvbmNlIHRoZSBkcmFnIGlzIG92ZXIsIHdlIHdhbnQgdG8gcmVzZXQgaXQgc28gdGhhdCBpdCBkb2Vzbid0IHN0YXJ0IHRoZXJlXG4gICAgICAgIC8vIG9uY2UgYSBuZXcgZHJhZyBzdGFydC5cbiAgICAgICAgbGF5b3V0LnJlcXVlc3RMZWZ0ID0gbGF5b3V0LmxlZnQ7XG4gICAgICAgIGxheW91dC5yZXF1ZXN0VG9wID0gbGF5b3V0LnRvcDtcbiAgICB9KTtcbn1cblxuXG4vLyBUT0RPOiBkb2VzIGl0IG1ha2Ugc2Vuc2UgdG8gbWFrZSBvdGhlciBsYXlvdXQgdHlwZXM/XG4vLyBjbGFzcyBXU0hTUmVsYXRpdmVMYXlvdXQgZXh0ZW5kcyBXU0hTTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pj4ge1xuLy8gICAgIGNvbnN0cnVjdG9yKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ+KSB7XG4vLyAgICAgICAgIHN1cGVyKGNoaWxkcmVuKTtcbi8vICAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuLy8gICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbi8vICAgICB9XG4vLyAgICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbi8vICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbi8vICAgICAgICAgdGhpcy50b3AgPSB0b3A7XG5cbi8vICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4vLyAgICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuLy8gICAgICAgICB9XG4vLyAgICAgfVxuLy8gfTtcblxuY2xhc3MgV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkcmVuOiBTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGQpIHtcbiAgICAgICAgICAgIGNoaWxkLmxheW91dCh0aGlzIC8qIExheW91dEJveCAqLyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmUoLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pOiBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBSZWxhdGl2ZTxTdGF0ZT4oc3RhdGU6IFN0YXRlLCAuLi5jaGlsZHJlbjogQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pik6IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmU8U3RhdGU+KGZpcnN0OiBTdGF0ZSB8IFBvc2l0aW9uTGF5b3V0PGFueSwgYW55PiwgLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pOiBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPiB8IFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT4ge1xuICAgIGlmIChmaXJzdCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQ8dW5kZWZpbmVkPih1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+KGZpcnN0LCBjaGlsZHJlbik7XG59XG4iXX0=