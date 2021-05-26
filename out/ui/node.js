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
/*
class FlexLayout<State> extends Element<'flex', WPHPLayout<any, any>, State> {
    size: number;
    grow: number;
    constructor(size: number, grow: number, state: State, child: WPHPLayout<any, any>) {
        super('flex', state, child);
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
*/
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
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures
// TODO: convert to use Affine transform.
class ScrollLayout extends WPHPLayout {
    constructor(child, scroll, zoom, zoomMax) {
        // TODO: min zoom;
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
// TODO: Top, Bottom
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91aS9ub2RlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDhCQUE4QjtBQUU5QixPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sYUFBYSxDQUFBO0FBZW5ELENBQUM7QUFvQkYsbUVBQW1FO0FBQ25FLHlFQUF5RTtBQUN6RSx1Q0FBdUM7QUFFdkMsTUFBTSxZQUFZO0lBWWQ7UUFDSSxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQVUsRUFBRSxDQUFVLEVBQUUsQ0FBaUIsRUFBRSxFQUFFO1lBQ3JFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFDRixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxFQUFlLEVBQUUsRUFBa0IsRUFBRSxLQUFZLEVBQUUsRUFBRTtZQUM1RSxLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDaEIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLENBQUMsSUFBSSxTQUFTLEVBQUU7b0JBQ2hCLDhEQUE4RDtvQkFDOUQsSUFBSSxhQUFhLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7d0JBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTs0QkFDaEIsSUFBSSxFQUFFLENBQUM7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QUNSLGdEQUFnRDtBQUNoRCw0QkFBNEI7QUFDNUIsMEJBQTBCO0FBRTFCLDRDQUE0QztBQUM1QyxrREFBa0Q7QUFDbEQsWUFBWTtBQUNaLFFBQVE7QUFDUixLQUFLO0FBRUwsTUFBTSxrQkFBMEIsU0FBUSxVQUF3RDtJQUM1RixZQUFZLEtBQVksRUFBRSxRQUErQztRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBWSxFQUFFLEdBQVcsRUFBRSxLQUFhLEVBQUUsTUFBYztRQUMzRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztTQUN0QztJQUNMLENBQUM7Q0FDSjtBQUdELE1BQU0sVUFBVSxRQUFRLENBQVEsS0FBdUMsRUFBRSxHQUFHLFFBQXlDO0lBQ2pILElBQUksS0FBSyxZQUFZLE9BQU8sRUFBRTtRQUMxQixPQUFPLElBQUksa0JBQWtCLENBQVksU0FBUyxFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQztLQUM3RTtJQUNELE9BQU8sSUFBSSxrQkFBa0IsQ0FBUSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIERpY2sgMjAyMVxuXG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4uL3BvaW50LmpzXCJcblxuZXhwb3J0IHR5cGUgTGF5b3V0Qm94ID0ge1xuICAgIGxlZnQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufTtcblxuLy8gVE9ETzogUmVwbGFjZSB1c2Ugb2YgYW55IHdpdGggdW5rbm93bi5cbi8vIFRPRE86IFBhc3MgRWxlbWVudENvbnRleHQgYWxvbmcgd2l0aCBsYXlvdXQsIHNvIHRoYXQgd2UgY2FuIGhhdmUgZHluYW1pYyBsYXlvdXRzLlxuXG5leHBvcnQgaW50ZXJmYWNlIEVsZW1lbnRDb250ZXh0IHtcbiAgICByZXF1ZXN0RHJhdygpOiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQoKTogdm9pZDtcbn07XG5cbnR5cGUgUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+ID0gKGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgT25EZXRhY2hIYW5kbGVyPFN0YXRlPiA9IChlOiBFbGVtZW50PGFueSwgYW55LCBTdGF0ZT4sIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbmV4cG9ydCB0eXBlIE9uRHJhd0hhbmRsZXI8U3RhdGU+ID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgZWM6IEVsZW1lbnRDb250ZXh0LCB2cDogTGF5b3V0Qm94LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG5cbnR5cGUgT25Ub3VjaEJlZ2luSGFuZGxlcjxTdGF0ZT4gPSAoaWQ6IG51bWJlciwgcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG50eXBlIFRvdWNoTW92ZSA9IHtcbiAgICByZWFkb25seSBpZDogbnVtYmVyO1xuICAgIHJlYWRvbmx5IHA6IFBvaW50MkQ7XG59O1xudHlwZSBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+ID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBTdGF0ZSkgPT4gdm9pZDtcbnR5cGUgT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+ID0gKGlkOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuXG5leHBvcnQgdHlwZSBPblRhcEhhbmRsZXI8U3RhdGU+ID0gKHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB2b2lkO1xuZXhwb3J0IHR5cGUgUGFuUG9pbnQgPSB7XG4gICAgcHJldjogUG9pbnQyRDtcbiAgICBjdXJyOiBQb2ludDJEO1xufTtcbmV4cG9ydCB0eXBlIE9uUGFuSGFuZGxlcjxTdGF0ZT4gPSAocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHZvaWQ7XG4vLyBUT0RPOiBQYXNzIHRvdWNoIHNpemUgZG93biB3aXRoIHRvdWNoIGV2ZW50cyAoaW5zdGVhZCBvZiBzY2FsZT8pXG4vLyBJcyB0aGF0IGVub3VnaD8gUHJvYmFibHkgd2Ugd2lsbCBhbHdheXMgd2FudCBhIHRyYW5zb2Zvcm1hdGlvbiBtYXRyaXguXG4vLyBCdXQgZW5vdWdoIGZvciBub3csIHNvIGp1c3QgZG8gdGhhdC5cblxuY2xhc3MgVG91Y2hHZXN0dXJlPFN0YXRlPiB7XG4gICAgb25UYXBIYW5kbGVyPzogT25UYXBIYW5kbGVyPFN0YXRlPjtcbiAgICBvblBhbkhhbmRsZXI/OiBPblBhbkhhbmRsZXI8U3RhdGU+O1xuICAgIG9uUGFuQmVnaW5IYW5kbGVyPzogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+O1xuICAgIG9uUGFuRW5kSGFuZGxlcj86IFBhcmFtZXRlcmxlc3NIYW5kbGVyPFN0YXRlPjtcblxuICAgIHByaXZhdGUgYWN0aXZlOiBNYXA8bnVtYmVyLCBQb2ludDJEPjtcbiAgICBwcml2YXRlIHBhbnM6IE1hcDxudW1iZXIsIFBhblBvaW50PjtcbiAgICByZWFkb25seSBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICByZWFkb25seSBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT47XG4gICAgcmVhZG9ubHkgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcbiAgICBcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5hY3RpdmUgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMucGFucyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5vblRvdWNoQmVnaW5IYW5kbGVyID0gKGlkOiBudW1iZXIsIHA6IFBvaW50MkQsIF86IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZS5zZXQoaWQsIHApO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLm9uVG91Y2hNb3ZlSGFuZGxlciA9ICh0czogVG91Y2hNb3ZlW10sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IFN0YXRlKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhID0gdGhpcy5hY3RpdmUuZ2V0KHQuaWQpO1xuICAgICAgICAgICAgICAgIGlmIChhICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBwYXNzIGluIGRpc3RhbmNlIHRocmVzaG9sZD8gU2NhbGUgYmFzZSBvbiB0cmFuc2Zvcm1zP1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9pbnREaXN0YW5jZShhLCB0LnApID49IDE2KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZS5kZWxldGUodC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IGEsICAgIC8vIFVzZSB0aGUgc3RhcnQgcG9pbnQgaGVyZSwgc28gdGhlIGZpcnN0IG1vdmUgaXMgZnJvbSB0aGUgc3RhcnQuXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5wYW5zLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAocCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBhbnMuc2l6ZSA9PT0gMCAmJiB0aGlzLm9uUGFuQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMub25QYW5CZWdpbkhhbmRsZXIoZWMsIHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhbnMuc2V0KHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IHAuY3VycixcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnI6IHQucCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMucGFucy5zaXplID4gMCAmJiB0aGlzLm9uUGFuSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblBhbkhhbmRsZXIoWy4uLnRoaXMucGFucy52YWx1ZXMoKV0sIGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaEVuZEhhbmRsZXIgPSAoaWQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogU3RhdGUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSB0aGlzLmFjdGl2ZS5nZXQoaWQpO1xuICAgICAgICAgICAgaWYgKGEgIT09IHVuZGVmaW5lZCAmJiB0aGlzLm9uVGFwSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vblRhcEhhbmRsZXIoYSwgZWMsIHN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWN0aXZlLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICBpZiAodGhpcy5wYW5zLmRlbGV0ZShpZCkgJiYgdGhpcy5wYW5zLnNpemUgPT09IDAgJiYgdGhpcy5vblBhbkVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHRoaXMub25QYW5FbmRIYW5kbGVyKGVjLCBzdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxufTtcblxuLy8gU28gdGhhdCB3ZSBjYW4gdGFrZSBJQXJndW1lbnRzIGFzIGNoaWxkcmVuXG5pbnRlcmZhY2UgU3RhdGljQXJyYXk8VD4ge1xuICAgIFtpbmRleDogbnVtYmVyXTogVDtcbiAgICBsZW5ndGg6IG51bWJlcjtcbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+O1xufTtcblxudHlwZSBDaGlsZENvbnN0cmFpbnQ8TGF5b3V0VHlwZSBleHRlbmRzIHN0cmluZz4gPSBFbGVtZW50PExheW91dFR5cGUsIGFueSwgYW55PiB8IFN0YXRpY0FycmF5PEVsZW1lbnQ8TGF5b3V0VHlwZSwgYW55LCBhbnk+PiB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaW5pdFRvdWNoR2VzdHVyZTxTdGF0ZT4oZTogRWxlbWVudDxhbnksIGFueSwgU3RhdGU+KTogVG91Y2hHZXN0dXJlPFN0YXRlPiB7XG4gICAgaWYgKGUudG91Y2hHZXN0dXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGUudG91Y2hHZXN0dXJlO1xuICAgIH1cbiAgICBpZiAoZS5vblRvdWNoQmVnaW5IYW5kbGVyICE9PSB1bmRlZmluZWQgfHwgZS5vblRvdWNoTW92ZUhhbmRsZXIgIT09IHVuZGVmaW5lZCB8fCBlLm9uVG91Y2hFbmRIYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUb3VjaCBnZXN0dXJlcyBhbHJlYWR5IGNhcHR1cmVkJyk7XG4gICAgfVxuICAgIGNvbnN0IHRnID0gbmV3IFRvdWNoR2VzdHVyZSgpO1xuICAgIGUub25Ub3VjaEJlZ2luSGFuZGxlciA9IHRnLm9uVG91Y2hCZWdpbkhhbmRsZXI7XG4gICAgZS5vblRvdWNoTW92ZUhhbmRsZXIgPSB0Zy5vblRvdWNoTW92ZUhhbmRsZXI7XG4gICAgZS5vblRvdWNoRW5kSGFuZGxlciA9IHRnLm9uVG91Y2hFbmRIYW5kbGVyO1xuICAgIHJldHVybiB0Zztcbn1cblxuZnVuY3Rpb24gY2xhbXAoeDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh4IDwgbWluKSB7XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfSBlbHNlIGlmICh4ID4gbWF4KSB7XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxufVxuXG5jbGFzcyBFbGVtZW50PExheW91dFR5cGUgZXh0ZW5kcyBzdHJpbmcsIENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PHN0cmluZz4sIFN0YXRlPiB7XG4gICAgbGF5b3V0VHlwZTogTGF5b3V0VHlwZTtcbiAgICBjaGlsZDogQ2hpbGQ7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHRvcDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgc3RhdGU6IFN0YXRlO1xuXG4gICAgY29uc3RydWN0b3IobGF5b3V0VHlwZTogTGF5b3V0VHlwZSwgc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgdGhpcy5sYXlvdXRUeXBlID0gbGF5b3V0VHlwZTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNoaWxkO1xuICAgICAgICB0aGlzLmxlZnQgPSBOYU47XG4gICAgICAgIHRoaXMudG9wID0gTmFOO1xuICAgICAgICB0aGlzLndpZHRoID0gTmFOO1xuICAgICAgICB0aGlzLmhlaWdodCA9IE5hTjtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIH1cblxuICAgIG9uRHJhd0hhbmRsZXI/OiBPbkRyYXdIYW5kbGVyPFN0YXRlPjtcbiAgICBvbkRyYXcoaGFuZGxlcjogT25EcmF3SGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EcmF3SGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uRHJhdyBhbHJlYWR5IHNldCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IGhhbmRsZXI7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG9uVG91Y2hCZWdpbkhhbmRsZXI/OiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI/OiBPblRvdWNoTW92ZUhhbmRsZXI8U3RhdGU+O1xuICAgIG9uVG91Y2hFbmRIYW5kbGVyPzogT25Ub3VjaEVuZEhhbmRsZXI8U3RhdGU+O1xuXG4gICAgdG91Y2hHZXN0dXJlPzogVG91Y2hHZXN0dXJlPFN0YXRlPjtcbiAgICBvblRhcChoYW5kbGVyOiBPblRhcEhhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uVGFwSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uVGFwIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25UYXBIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIG9uUGFuKGhhbmRsZXI6IE9uUGFuSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5IYW5kbGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignb25QYW4gYWxyZWFkeSBzZXQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRvdWNoR2VzdHVyZS5vblBhbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5CZWdpbihoYW5kbGVyOiBQYXJhbWV0ZXJsZXNzSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUgPSBpbml0VG91Y2hHZXN0dXJlKHRoaXMpO1xuICAgICAgICBpZiAodGhpcy50b3VjaEdlc3R1cmUub25QYW5CZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdvblBhbkJlZ2luIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5CZWdpbkhhbmRsZXIgPSBoYW5kbGVyO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgb25QYW5FbmQoaGFuZGxlcjogUGFyYW1ldGVybGVzc0hhbmRsZXI8U3RhdGU+KTogdGhpcyB7XG4gICAgICAgIHRoaXMudG91Y2hHZXN0dXJlID0gaW5pdFRvdWNoR2VzdHVyZSh0aGlzKTtcbiAgICAgICAgaWYgKHRoaXMudG91Y2hHZXN0dXJlLm9uUGFuRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ29uUGFuRW5kIGFscmVhZHkgc2V0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy50b3VjaEdlc3R1cmUub25QYW5FbmRIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgb25EZXRhY2hIYW5kbGVyPzogT25EZXRhY2hIYW5kbGVyPFN0YXRlPiB8IEFycmF5PE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4+O1xuICAgIG9uRGV0YWNoKGhhbmRsZXI6IE9uRGV0YWNoSGFuZGxlcjxTdGF0ZT4pOiB0aGlzIHtcbiAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSB1bmRlZmluZWQgfHwgdGhpcy5vbkRldGFjaEhhbmRsZXIgPT09IGhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gaGFuZGxlcjtcbiAgICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRoaXMub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyLmluZGV4T2YoaGFuZGxlcikgPCAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbkRldGFjaEhhbmRsZXIucHVzaChoYW5kbGVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMub25EZXRhY2hIYW5kbGVyID0gW3RoaXMub25EZXRhY2hIYW5kbGVyLCBoYW5kbGVyXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgcmVtb3ZlT25EZXRhY2goaGFuZGxlcjogT25EZXRhY2hIYW5kbGVyPFN0YXRlPik6IHZvaWQge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLm9uRGV0YWNoSGFuZGxlcikpIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSB0aGlzLm9uRGV0YWNoSGFuZGxlci5pbmRleE9mKGhhbmRsZXIpO1xuICAgICAgICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICAgICAgICAgIC8vIENvcHkgdGhlIGFycmF5LCBzbyB0aGF0IGl0J3Mgc2FmZSB0byBjYWxsIHRoaXMgaW5zaWRlIGFuIE9uRGV0YWNoSGFuZGxlci5cbiAgICAgICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IFsuLi50aGlzLm9uRGV0YWNoSGFuZGxlcl0uc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMub25EZXRhY2hIYW5kbGVyID09PSBoYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLm9uRGV0YWNoSGFuZGxlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGNoaWxkOiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIGluZGV4PzogbnVtYmVyKSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBuZXcgQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4oZS5jaGlsZC5sZW5ndGggKyAxKTtcbiAgICBsZXQgaSA9IDA7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAoOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuW2orK10gPSBjaGlsZDtcbiAgICAgICAgfVxuICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICB9XG4gICAgaWYgKGogPT09IGkpIHtcbiAgICAgICAgY2hpbGRyZW5bal0gPSBjaGlsZDtcbiAgICB9XG4gICAgZS5jaGlsZCA9IGNoaWxkcmVuO1xuICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbn1cblxuZnVuY3Rpb24gY2FsbERldGFjaExpc3RlbmVycyhyb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KGUub25EZXRhY2hIYW5kbGVyKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBoYW5kbGVyIG9mIGUub25EZXRhY2hIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChlLm9uRGV0YWNoSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBlLm9uRGV0YWNoSGFuZGxlcihlLCBlLnN0YXRlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZS5jaGlsZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAvLyBObyBjaGlsZHJlbiwgc28gbm8gbW9yZSB3b3JrIHRvIGRvLlxuICAgICAgICB9IGVsc2UgaWYgKGUuY2hpbGRbU3ltYm9sLml0ZXJhdG9yXSkge1xuICAgICAgICAgICAgc3RhY2sucHVzaCguLi5lLmNoaWxkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVDaGlsZChlOiBFbGVtZW50PGFueSwgU3RhdGljQXJyYXk8RWxlbWVudDxhbnksIGFueSwgYW55Pj4sIGFueT4sIGluZGV4OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gbmV3IEFycmF5PEVsZW1lbnQ8YW55LCBhbnksIGFueT4+KGUuY2hpbGQubGVuZ3RoIC0gMSk7XG4gICAgbGV0IGogPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZS5jaGlsZC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaSA9PT0gaW5kZXgpIHtcbiAgICAgICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnMoZS5jaGlsZFtpXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjaGlsZHJlbltqKytdID0gZS5jaGlsZFtpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlLmNoaWxkID0gY2hpbGRyZW47XG4gICAgZWMucmVxdWVzdExheW91dCgpO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBXUEhQTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHAnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocCcsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBXUEhTTGF5b3V0PENoaWxkIGV4dGVuZHMgQ2hpbGRDb25zdHJhaW50PGFueT4sIFN0YXRlPiBleHRlbmRzIEVsZW1lbnQ8J3dwaHMnLCBDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBDaGlsZCkge1xuICAgICAgICBzdXBlcignd3BocycsIHN0YXRlLCBjaGlsZCk7XG4gICAgfVxuICAgIGFic3RyYWN0IGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFBMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocCcsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hwJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcbn07XG5cbmFic3RyYWN0IGNsYXNzIFdTSFNMYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBDaGlsZENvbnN0cmFpbnQ8YW55PiwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnd3NocycsIENoaWxkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IENoaWxkKSB7XG4gICAgICAgIHN1cGVyKCd3c2hzJywgc3RhdGUsIGNoaWxkKTtcbiAgICB9XG4gICAgYWJzdHJhY3QgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkO1xufTtcblxuZXhwb3J0IHR5cGUgTGF5b3V0SGFzV2lkdGhBbmRIZWlnaHQgPSBXU0hTTGF5b3V0PGFueSwgYW55PjtcbmV4cG9ydCB0eXBlIExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQgPSBXUEhQTGF5b3V0PGFueSwgYW55PjtcblxuLypcbmNsYXNzIEZsZXhMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgRWxlbWVudDwnZmxleCcsIFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBncm93OiBudW1iZXI7XG4gICAgY29uc3RydWN0b3Ioc2l6ZTogbnVtYmVyLCBncm93OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgICAgIHN1cGVyKCdmbGV4Jywgc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5zaXplID0gc2l6ZTtcbiAgICAgICAgdGhpcy5ncm93ID0gZ3JvdztcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6bnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgfVxufTtcbiovXG5mdW5jdGlvbiBkcmF3RWxlbWVudFRyZWUoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHJvb3Q6IEVsZW1lbnQ8YW55LCBhbnksIGFueT4sIGVjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCkge1xuICAgIGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuICAgIHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IGUgPSBzdGFjay5wb3AoKSBhcyBFbGVtZW50PGFueSwgYW55LCBhbnk+O1xuICAgICAgICBpZiAoZS5vbkRyYXdIYW5kbGVyKSB7XG4gICAgICAgICAgICBlLm9uRHJhd0hhbmRsZXIoY3R4LCBlLCBlYywgdnAsIGUuc3RhdGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGxhc3QgY2hpbGQgb24gZmlyc3QsIHNvIHdlIGRyYXcgaXQgbGFzdC5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBlLmNoaWxkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sucHVzaChlLmNoaWxkW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goZS5jaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCByb290OiBFbGVtZW50PGFueSwgYW55LCBhbnk+LCBlYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5maWxsUmVjdChyb290LmxlZnQsIHJvb3QudG9wLCByb290LndpZHRoLCByb290LmhlaWdodCk7XG4gICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgcm9vdCwgZWMsIHZwKTtcbn1cblxudHlwZSBIYXNUb3VjaEhhbmRsZXJzPFN0YXRlPiA9IHtcbiAgICBvblRvdWNoQmVnaW5IYW5kbGVyOiBPblRvdWNoQmVnaW5IYW5kbGVyPFN0YXRlPjtcbiAgICBvblRvdWNoTW92ZUhhbmRsZXI6IE9uVG91Y2hNb3ZlSGFuZGxlcjxTdGF0ZT47XG4gICAgb25Ub3VjaEVuZEhhbmRsZXI6IE9uVG91Y2hFbmRIYW5kbGVyPFN0YXRlPjtcbn0gJiBFbGVtZW50PGFueSwgYW55LCBTdGF0ZT47XG5cbmNsYXNzIERlYm91bmNlciB7XG4gICAgYm91bmNlOiAoKSA9PiB2b2lkO1xuICAgIHRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICAgIGNvbnN0cnVjdG9yKGY6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5ib3VuY2UgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy50aW1lb3V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICBmKCk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY2xlYXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLnRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5mdW5jdGlvbiBmaW5kVG91Y2hUYXJnZXQocm9vdDogRWxlbWVudDxhbnksIGFueSwgYW55PiwgcDogUG9pbnQyRCk6IHVuZGVmaW5lZCB8IEhhc1RvdWNoSGFuZGxlcnM8YW55PiB7XG4gICAgY29uc3Qgc3RhY2sgPSBbcm9vdF07XG4gICAgY29uc3QgeCA9IHBbMF07XG4gICAgY29uc3QgeSA9IHBbMV07XG4gICAgd2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZSA9IHN0YWNrLnBvcCgpIGFzIEVsZW1lbnQ8YW55LCBhbnksIGFueT47XG4gICAgICAgIGlmICh4IDwgZS5sZWZ0IHx8IHggPj0gZS5sZWZ0ICsgZS53aWR0aCB8fCB5IDwgZS50b3AgfHwgeSA+PSBlLnRvcCArIGUuaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBPdXRzaWRlIGUsIHNraXAuICBcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLm9uVG91Y2hCZWdpbkhhbmRsZXIgIT09IHVuZGVmaW5lZCAmJiBlLm9uVG91Y2hNb3ZlSGFuZGxlciAhPT0gdW5kZWZpbmVkICYmIGUub25Ub3VjaEVuZEhhbmRsZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIGUgYXMgSGFzVG91Y2hIYW5kbGVyczxhbnk+OyAvLyBUT0RPOiBXaHkgY2FuJ3QgdHlwZSBpbmZlcmVuY2UgZmlndXJlIHRoaXMgb3V0P1xuICAgICAgICB9XG4gICAgICAgIGlmIChlLmNoaWxkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIC8vIE5vIGNoaWxkcmVuLCBzbyBubyBtb3JlIHdvcmsgdG8gZG8uXG4gICAgICAgIH0gZWxzZSBpZiAoZS5jaGlsZFtTeW1ib2wuaXRlcmF0b3JdKSB7XG4gICAgICAgICAgICAvLyBQdXNoIGZpcnN0IGNoaWxkIG9uIGZpcnN0LCBzbyB3ZSB2aXNpdCBsYXN0IGNoaWxkIGxhc3QuXG4gICAgICAgICAgICAvLyBUaGUgbGFzdCBjaGlsZCAodGhlIG9uZSBvbiB0b3ApIHNob3VsZCBvdmVycmlkZSBwcmV2aW91cyBjaGlsZHJlbidzIHRhcmdldC5cbiAgICAgICAgICAgIHN0YWNrLnB1c2goLi4uZS5jaGlsZCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGFjay5wdXNoKGUuY2hpbGQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbnR5cGUgVEFSR0VUX1JPT1QgPSAxO1xuY29uc3QgVEFSR0VUX1JPT1QgPSAxO1xudHlwZSBUQVJHRVRfTk9ORSA9IDI7XG5jb25zdCBUQVJHRVRfTk9ORSA9IDI7XG5cbmV4cG9ydCBjbGFzcyBSb290TGF5b3V0IGltcGxlbWVudHMgRWxlbWVudENvbnRleHQge1xuICAgIGNoaWxkOiBXUEhQTGF5b3V0PGFueSwgYW55PjtcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xuICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHJlc2l6ZTogUmVzaXplT2JzZXJ2ZXI7XG4gICAgdnA6IExheW91dEJveDtcblxuICAgIC8vIFRPRE86IHdlIHNob3VsZCBub3QgcmVyZW5kZXIgaWYgdGhlcmUgYXJlIHBlbmRpbmcgbGF5b3V0IHJlcXVlc3RzLlxuICAgIGRlYm91bmNlTGF5b3V0OiBEZWJvdW5jZXI7XG4gICAgZGVib3VuY2VEcmF3OiBEZWJvdW5jZXI7XG5cbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVyczxhbnk+IHwgVEFSR0VUX1JPT1QgfCBUQVJHRVRfTk9ORT47XG4gICAgcHJpdmF0ZSB0b3VjaFRhcmdldERldGFjaGVkOiBPbkRldGFjaEhhbmRsZXI8YW55PjtcbiAgICBwcml2YXRlIHRvdWNoU3RhcnQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7IFxuICAgIHByaXZhdGUgdG91Y2hNb3ZlOiAoZXZ0OiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgdG91Y2hFbmQ6IChldnQ6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG5cbiAgICBjb25zdHJ1Y3RvcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNoaWxkO1xuICAgICAgICB0aGlzLmNhbnZhcyA9IGNhbnZhcztcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiLCB7YWxwaGE6IGZhbHNlfSk7XG4gICAgICAgIGlmIChjdHggPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImZhaWxlZCB0byBnZXQgMmQgY29udGV4dFwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcbiAgICAgICAgdGhpcy5yZXNpemUgPSBuZXcgUmVzaXplT2JzZXJ2ZXIoKGVudHJpZXM6IFJlc2l6ZU9ic2VydmVyRW50cnlbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVudHJpZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZXNpemVPYnNlcnZlciBleHBlY3RzIDEgZW50cnksIGdvdCAke2VudHJpZXMubGVuZ3RofWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGVudHJpZXNbMF0uY29udGVudFJlY3Q7XG4gICAgICAgICAgICBjb25zdCB2cCA9IHRoaXMudnA7XG4gICAgICAgICAgICB2cC5sZWZ0ID0gMDtcbiAgICAgICAgICAgIHZwLnRvcCA9IDA7XG4gICAgICAgICAgICB2cC53aWR0aCA9IGNvbnRlbnQud2lkdGg7XG4gICAgICAgICAgICB2cC5oZWlnaHQgPSBjb250ZW50LmhlaWdodFxuICAgICAgICAgICAgY2FudmFzLndpZHRoID0gdnAud2lkdGggKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSB2cC5oZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbztcbiAgICAgICAgICAgIGN0eC50cmFuc2Zvcm0od2luZG93LmRldmljZVBpeGVsUmF0aW8sIDAsIDAsIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCAwLCAwKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dC5jbGVhcigpO1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdnAud2lkdGgsIHZwLmhlaWdodCk7XG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICAgICAgY2xlYXJBbmREcmF3RWxlbWVudFRyZWUoY3R4LCB0aGlzLmNoaWxkLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB2cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlc2l6ZS5vYnNlcnZlKGNhbnZhcywge2JveDogXCJkZXZpY2UtcGl4ZWwtY29udGVudC1ib3hcIn0pO1xuICAgICAgICB0aGlzLnZwID0ge1xuICAgICAgICAgICAgbGVmdDogMCxcbiAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgIHdpZHRoOiBjYW52YXMud2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGNhbnZhcy5oZWlnaHQsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZUxheW91dCA9IG5ldyBEZWJvdW5jZXIoKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQoMCwgMCwgdGhpcy52cC53aWR0aCwgdGhpcy52cC5oZWlnaHQpO1xuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0ID0gdGhpcy5kZWJvdW5jZUxheW91dC5ib3VuY2U7XG5cbiAgICAgICAgdGhpcy5kZWJvdW5jZURyYXcgPSBuZXcgRGVib3VuY2VyKCgpID0+IHtcbiAgICAgICAgICAgIGNsZWFyQW5kRHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5jaGlsZCwgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdGhpcy52cCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnJlcXVlc3REcmF3ID0gdGhpcy5kZWJvdW5jZURyYXcuYm91bmNlO1xuXG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXRzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQgPSAoZTogRWxlbWVudDxhbnksIGFueSwgYW55PikgPT4ge1xuICAgICAgICAgICAgbGV0IGZvdW5kVGFyZ2V0ID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiB0aGlzLnRvdWNoVGFyZ2V0cykge1xuICAgICAgICAgICAgICAgIGlmICh2ID09PSBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGUucmVtb3ZlT25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGssIFRBUkdFVF9OT05FKTtcbiAgICAgICAgICAgICAgICAgICAgZm91bmRUYXJnZXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZm91bmRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3RpdmUgdG91Y2ggZm9yIGRldGFjaGVkIGVsZW1lbnRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudG91Y2hTdGFydCA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgbGV0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkZW50aWZpZXIpO1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwOiBQb2ludDJEID0gW3QuY2xpZW50WCwgdC5jbGllbnRZXTtcbiAgICAgICAgICAgICAgICB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5jaGlsZCwgcCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldCh0LmlkZW50aWZpZXIsIFRBUkdFVF9ST09UKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIHRvIGFjdGl2ZSB0YXJnZXRzIG1hcCBzbyB3ZSBrbm93IGFuYm91dCBpdC5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsb3cgZGVmYXVsdCBhY3Rpb24sIHNvIGUuZy4gcGFnZSBjYW4gYmUgc2Nyb2xsZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQodC5pZGVudGlmaWVyLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25EZXRhY2godGhpcy50b3VjaFRhcmdldERldGFjaGVkKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hCZWdpbkhhbmRsZXIodC5pZGVudGlmaWVyLCBwLCB0aGlzIC8qIEVsZW1lbnRDb250ZXh0ICovLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIC8vIFNvbWUgdGFyZ2V0IHdhcyBzb21lIGZvciBhdCBsZWFzdCBzb21lIG9mIHRoZSB0b3VjaGVzLiBEb24ndCBsZXQgYW55dGhpbmdcbiAgICAgICAgICAgICAgICAvLyBpbiBIVE1MIGdldCB0aGlzIHRvdWNoLlxuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoTW92ZSA9IChldnQ6IFRvdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGxldCBwcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9IG5ldyBNYXA8SGFzVG91Y2hIYW5kbGVyczxhbnk+LCBBcnJheTxUb3VjaE1vdmU+PigpO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0IG9mIGV2dC50b3VjaGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcy50b3VjaFRhcmdldHMuZ2V0KHQuaWRlbnRpZmllcik7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVG91Y2ggbW92ZSB3aXRob3V0IHN0YXJ0LCBpZCAke3QuaWRlbnRpZmllcn1gKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIGFzIHRoZSByb290IGVsZW1lbnQgY2FuJ3Qgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCBkbyBhbnl0aGluZywgdGFyZ2V0IHByb2JhYmx5IGRlbGV0ZWQuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHQuaWRlbnRpZmllcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IFt0LmNsaWVudFgsIHQuY2xpZW50WV0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0YXJnZXQsIHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0cywgdGhpcyAvKiBFbGVtZW50Q29udGV4dCAqLywgdGFyZ2V0LnN0YXRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwcmV2ZW50RGVmYXVsdCkge1xuICAgICAgICAgICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRvdWNoRW5kID0gKGV2dDogVG91Y2hFdmVudCkgPT4ge1xuICAgICAgICAgICAgbGV0IHByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCByZW1vdmVkID0gbmV3IE1hcCh0aGlzLnRvdWNoVGFyZ2V0cyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHQgb2YgZXZ0LnRvdWNoZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVtb3ZlZC5kZWxldGUodC5pZGVudGlmaWVyKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3VjaCBlbmQgd2l0aG91dCBzdGFydCwgaWQgJHt0LmlkZW50aWZpZXJ9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBbaWQsIHRhcmdldF0gb2YgcmVtb3ZlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldCAhPT0gVEFSR0VUX1JPT1QgJiYgdGFyZ2V0ICE9PSBUQVJHRVRfTk9ORSkge1xuICAgICAgICAgICAgICAgICAgICBwcmV2ZW50RGVmYXVsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQub25Ub3VjaEVuZEhhbmRsZXIoaWQsIHRoaXMgLyogRWxlbWVudENvbnRleHQgKi8sIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZlbnREZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaHN0YXJ0XCIsIHRoaXMudG91Y2hTdGFydCwgZmFsc2UpO1xuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwidG91Y2htb3ZlXCIsIHRoaXMudG91Y2hNb3ZlLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGVuZFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b3VjaGNhbmNlbFwiLCB0aGlzLnRvdWNoRW5kLCBmYWxzZSk7XG5cbiAgICAgICAgdGhpcy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfVxuXG4gICAgZGlzY29ubmVjdCgpIHtcbiAgICAgICAgdGhpcy5yZXNpemUuZGlzY29ubmVjdCgpO1xuICAgICAgICB0aGlzLmRlYm91bmNlRHJhdy5jbGVhcigpO1xuICAgICAgICB0aGlzLmRlYm91bmNlTGF5b3V0LmNsZWFyKCk7XG4gICAgICAgIGNhbGxEZXRhY2hMaXN0ZW5lcnModGhpcy5jaGlsZCk7XG5cbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoc3RhcnRcIiwgdGhpcy50b3VjaFN0YXJ0LCBmYWxzZSk7XG4gICAgICAgIHRoaXMuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b3VjaG1vdmVcIiwgdGhpcy50b3VjaE1vdmUsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoZW5kXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRvdWNoY2FuY2VsXCIsIHRoaXMudG91Y2hFbmQsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gRWxlbWVudENvbnRleHQgZnVuY3Rpb25zXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIHJlcXVlc3REcmF3OiAoKSA9PiB2b2lkO1xuICAgIHJlcXVlc3RMYXlvdXQ6ICgpID0+IHZvaWQ7XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8gVG91Y2hIYW5kbGVyIGZ1bmN0aW9uc1xuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLyBUT0RPOiBhZGQgVG91Y2hGb3J3YXJkZXIgaGVyZS4gaW5zdGFsbCB0b3VjaCBoYW5kbGVyc1xufTtcblxuLy8gVE9ETzogSGF2ZSBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gKHNvIGhpZGUgY2hpbGRyZW4sIGFuZCBmb3J3YXJkIHRhcC9wYW4vZHJhdyBtYW51YWxseSwgd2l0aCB0cmFuc2Zvcm0pXG4vLyBUT0RPOiBNYWtlIGl0IHpvb21cbi8vIFRPRE86IG1heWJlIGhhdmUgdHdvIGVsZW1lbnRzPyBhIHZpZXdwb3J0IGFuZCBhIEhTV1Mgd2l0aCBhYnNvbHV0ZWx5IHBvc2l0aW9uZWQgY2hpbGRyZW4gYW5kIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzXG5cbi8vIFRPRE86IGNvbnZlcnQgdG8gdXNlIEFmZmluZSB0cmFuc2Zvcm0uXG5cbmNsYXNzIFNjcm9sbExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+IHtcbiAgICAvLyBTY3JvbGxMYXlvdXQgaGFzIHRvIGludGVyY2VwdCBhbGwgZXZlbnRzIHRvIG1ha2Ugc3VyZSBhbnkgbG9jYXRpb25zIGFyZSB1cGRhdGVkIGJ5XG4gICAgLy8gdGhlIHNjcm9sbCBwb3NpdGlvbiwgc28gY2hpbGQgaXMgdW5kZWZpbmVkLCBhbmQgYWxsIGV2ZW50cyBhcmUgZm9yd2FyZGVkIHRvIHNjcm9sbGVyLlxuICAgIHNjcm9sbGVyOiBXU0hTTGF5b3V0PGFueSwgYW55PjtcbiAgICBzY3JvbGw6IFBvaW50MkQ7XG4gICAgem9vbTogbnVtYmVyO1xuICAgIHpvb21NYXg6IG51bWJlcjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0czogTWFwPG51bWJlciwgSGFzVG91Y2hIYW5kbGVyczx1bmtub3duPiB8IFRBUkdFVF9ST09UIHwgVEFSR0VUX05PTkU+O1xuICAgIHByaXZhdGUgdG91Y2hTY3JvbGw6IE1hcDxudW1iZXIsIHsgcHJldjogUG9pbnQyRCwgY3VycjogUG9pbnQyRCB9PjtcbiAgICBwcml2YXRlIHRvdWNoVGFyZ2V0RGV0YWNoZWQ6IE9uRGV0YWNoSGFuZGxlcjx1bmtub3duPjtcblxuICAgIHByaXZhdGUgdXBkYXRlU2Nyb2xsKCkge1xuICAgICAgICBjb25zdCB0cyA9IFsuLi50aGlzLnRvdWNoU2Nyb2xsLnZhbHVlcygpXTtcbiAgICAgICAgaWYgKHRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHRzWzBdO1xuICAgICAgICAgICAgY29uc3QgcCA9IHRoaXMucDJjKHQucHJldik7XG4gICAgICAgICAgICBjb25zdCBjID0gdGhpcy5wMmModC5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsWzBdICs9IHBbMF0gLSBjWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcFsxXSAtIGNbMV07XG4gICAgICAgIH0gZWxzZSBpZiAodHMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBjb25zdCBwbSA9IHRoaXMucDJjKFtcbiAgICAgICAgICAgICAgICAodHNbMF0ucHJldlswXSArIHRzWzFdLnByZXZbMF0pICogMC41LFxuICAgICAgICAgICAgICAgICh0c1swXS5wcmV2WzFdICsgdHNbMV0ucHJldlsxXSkgKiAwLjUsXG4gICAgICAgICAgICBdKTtcbiAgICAgICAgICAgIGNvbnN0IHBkID0gcG9pbnREaXN0YW5jZSh0c1swXS5wcmV2LCB0c1sxXS5wcmV2KTtcbiAgICAgICAgICAgIGNvbnN0IGNkID0gcG9pbnREaXN0YW5jZSh0c1swXS5jdXJyLCB0c1sxXS5jdXJyKTtcbiAgICAgICAgICAgIHRoaXMuem9vbSAqPSBjZCAvIHBkO1xuICAgICAgICAgICAgLy8gQ2xhbXAgem9vbSBzbyB3ZSBjYW4ndCB6b29tIG91dCB0b28gZmFyLlxuICAgICAgICAgICAgaWYgKHRoaXMuc2Nyb2xsZXIud2lkdGggPCB0aGlzLndpZHRoIC8gdGhpcy56b29tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy53aWR0aCAvIHRoaXMuc2Nyb2xsZXIud2lkdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5zY3JvbGxlci5oZWlnaHQgPCB0aGlzLmhlaWdodCAvIHRoaXMuem9vbSkge1xuICAgICAgICAgICAgICAgIHRoaXMuem9vbSA9IHRoaXMuaGVpZ2h0IC8gdGhpcy5zY3JvbGxlci5oZWlnaHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy56b29tID4gdGhpcy56b29tTWF4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy56b29tID0gdGhpcy56b29tTWF4O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY20gPSB0aGlzLnAyYyhbXG4gICAgICAgICAgICAgICAgKHRzWzBdLmN1cnJbMF0gKyB0c1sxXS5jdXJyWzBdKSAqIDAuNSxcbiAgICAgICAgICAgICAgICAodHNbMF0uY3VyclsxXSArIHRzWzFdLmN1cnJbMV0pICogMC41LFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFswXSArPSBwbVswXSAtIGNtWzBdO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxbMV0gKz0gcG1bMV0gLSBjbVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNjcm9sbFswXSA9IGNsYW1wKHRoaXMuc2Nyb2xsWzBdLCAwLCB0aGlzLnNjcm9sbGVyLndpZHRoIC0gdGhpcy53aWR0aCAvIHRoaXMuem9vbSk7XG4gICAgICAgIHRoaXMuc2Nyb2xsWzFdID0gY2xhbXAodGhpcy5zY3JvbGxbMV0sIDAsIHRoaXMuc2Nyb2xsZXIuaGVpZ2h0IC0gdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcDJjKHA6IFBvaW50MkQpOiBQb2ludDJEIHtcbiAgICAgICAgY29uc3QgcyA9IHRoaXMuc2Nyb2xsO1xuICAgICAgICBjb25zdCBzaHJpbmsgPSAxIC8gdGhpcy56b29tO1xuICAgICAgICAvLyBUT0RPOiB0YWtlIHBhcmVudCByZWN0IGludG8gYWNjb3VudFxuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgKHBbMF0gLSB0aGlzLmxlZnQpICogc2hyaW5rICsgc1swXSxcbiAgICAgICAgICAgIChwWzFdIC0gdGhpcy50b3ApICogc2hyaW5rICsgc1sxXSxcbiAgICAgICAgXTtcbiAgICB9XG5cbiAgICBjb25zdHJ1Y3RvcihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHNjcm9sbDogUG9pbnQyRCwgem9vbTogbnVtYmVyLCB6b29tTWF4OiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogbWluIHpvb207XG4gICAgICAgIHN1cGVyKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5zY3JvbGxlciA9IGNoaWxkO1xuICAgICAgICB0aGlzLnNjcm9sbCA9IHNjcm9sbDtcbiAgICAgICAgdGhpcy56b29tID0gem9vbTtcbiAgICAgICAgdGhpcy56b29tTWF4ID0gem9vbU1heDtcbiAgICAgICAgdGhpcy50b3VjaFRhcmdldHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hTY3JvbGwgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCA9IChlOiBFbGVtZW50PGFueSwgYW55LCBhbnk+KSA9PiB7XG4gICAgICAgICAgICBsZXQgZm91bmRUYXJnZXQgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIHRoaXMudG91Y2hUYXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHYgPT09IGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5yZW1vdmVPbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRvdWNoVGFyZ2V0cy5zZXQoaywgVEFSR0VUX05PTkUpO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZFRhcmdldCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmb3VuZFRhcmdldCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGl2ZSB0b3VjaCBmb3IgZGV0YWNoZWQgZWxlbWVudFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMub25EcmF3SGFuZGxlciA9IChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBlYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgICAgICBjdHguc2F2ZSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjdHgudHJhbnNsYXRlKHRoaXMubGVmdCwgdGhpcy50b3ApO1xuICAgICAgICAgICAgLy8gQ2xpcCB0byBTY3JvbGwgdmlld3BvcnQuXG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHgubW92ZVRvKDAsIDApO1xuICAgICAgICAgICAgY3R4LmxpbmVUbyh0aGlzLndpZHRoLCAwKTtcbiAgICAgICAgICAgIGN0eC5saW5lVG8odGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgY3R4LmxpbmVUbygwLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgICAgICAgICBjdHguY2xpcCgpO1xuICAgICAgICAgICAgY3R4LnNjYWxlKHRoaXMuem9vbSwgdGhpcy56b29tKTtcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUoLXRoaXMuc2Nyb2xsWzBdLCAtdGhpcy5zY3JvbGxbMV0pO1xuICAgICAgICAgICAgY29uc3QgdnBTY3JvbGxlciA9IHtcbiAgICAgICAgICAgICAgICBsZWZ0OiB0aGlzLnNjcm9sbFswXSxcbiAgICAgICAgICAgICAgICB0b3A6IHRoaXMuc2Nyb2xsWzFdLFxuICAgICAgICAgICAgICAgIHdpZHRoOiB0aGlzLndpZHRoIC8gdGhpcy56b29tLFxuICAgICAgICAgICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHQgLyB0aGlzLnpvb20sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZHJhd0VsZW1lbnRUcmVlKGN0eCwgdGhpcy5zY3JvbGxlciwgZWMsIHZwU2Nyb2xsZXIpO1xuICAgICAgICAgICAgLy8gVE9ETzogcmVzdG9yZSB0cmFuc2Zvcm0gaW4gYSBmaW5hbGx5P1xuICAgICAgICAgICAgY3R4LnJlc3RvcmUoKTtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9uVG91Y2hCZWdpbkhhbmRsZXIgPSAoaWQ6IG51bWJlciwgcHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3AgPSB0aGlzLnAyYyhwcCk7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kVG91Y2hUYXJnZXQodGhpcy5zY3JvbGxlciwgY3ApO1xuICAgICAgICAgICAgaWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gQWRkIHBsYWNlaG9sZGVyIG51bGwgdG8gYWN0aXZlIHRvdWNoZXMsIHNvIHdlIGtub3cgdGhleSBzaG91bGQgc2Nyb2xsLlxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLnNldChpZCwgVEFSR0VUX1JPT1QpO1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTY3JvbGwuc2V0KGlkLCB7IHByZXY6IHBwLCBjdXJyOiBwcCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy50b3VjaFRhcmdldHMuc2V0KGlkLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vbkRldGFjaCh0aGlzLnRvdWNoVGFyZ2V0RGV0YWNoZWQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoQmVnaW5IYW5kbGVyKGlkLCBjcCwgZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMub25Ub3VjaE1vdmVIYW5kbGVyID0gKHRzOiBBcnJheTxUb3VjaE1vdmU+LCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHMgPSBuZXcgTWFwPEhhc1RvdWNoSGFuZGxlcnM8YW55PiwgQXJyYXk8VG91Y2hNb3ZlPj4oKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiB0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvdWNoIG1vdmUgSUQgJHt0LmlkfWApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUQVJHRVRfUk9PVCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY3JvbGwgPSB0aGlzLnRvdWNoU2Nyb2xsLmdldCh0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjcm9sbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIG1vdmUgd2l0aCBJRCAke3QuaWR9IGhhcyB0YXJnZXQgPT09IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzY3JvbGwucHJldiA9IHNjcm9sbC5jdXJyO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGwuY3VyciA9IHQucDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX05PTkUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9uJ3QgZG8gYW55dGhpbmcsIHRhcmdldCBkZWxldGVkLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR0cyA9IHRhcmdldHMuZ2V0KHRhcmdldCkgfHwgW107XG4gICAgICAgICAgICAgICAgICAgIHR0cy5wdXNoKHQpO1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNldCh0YXJnZXQsIHR0cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgc2Nyb2xsIHBvc2l0aW9uLlxuICAgICAgICAgICAgdGhpcy51cGRhdGVTY3JvbGwoKTtcblxuICAgICAgICAgICAgLy8gRm9yd2FyZCB0b3VjaCBtb3Zlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RhcmdldCwgdHRzXSBvZiB0YXJnZXRzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdHRzW2ldID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWQ6IHR0c1tpXS5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHA6IHRoaXMucDJjKHR0c1tpXS5wKSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGFyZ2V0Lm9uVG91Y2hNb3ZlSGFuZGxlcih0dHMsIGVjLCB0YXJnZXQuc3RhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5vblRvdWNoRW5kSGFuZGxlciA9IChpZDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMudG91Y2hUYXJnZXRzLmdldChpZCk7XG4gICAgICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG91Y2ggZW5kIElEICR7aWR9YCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRhcmdldCA9PT0gVEFSR0VUX1JPT1QpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMudG91Y2hTY3JvbGwuZGVsZXRlKGlkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRvdWNoIGVuZCBJRCAke2lkfSBoYXMgdGFyZ2V0IFRBUkdFVF9ST09ULCBidXQgaXMgbm90IGluIHRvdWNoU2Nyb2xsYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0YXJnZXQgPT09IFRBUkdFVF9OT05FKSB7XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90aGluZywgdGFyZXQgd2FzIGRlbGV0ZWQuXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hUYXJnZXRzLmRlbGV0ZShpZCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZU9uRGV0YWNoKHRoaXMudG91Y2hUYXJnZXREZXRhY2hlZCk7XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5vblRvdWNoRW5kSGFuZGxlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5vblRvdWNoRW5kSGFuZGxlcihpZCwgZWMsIHRhcmdldC5zdGF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBUT0RPOiBvdGhlciBoYW5kbGVycyBuZWVkIGZvcndhcmRpbmcuXG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIHRoaXMuc2Nyb2xsZXIubGF5b3V0KDAsIDApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjcm9sbChjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHNjcm9sbD86IFBvaW50MkQsIHpvb20/OiBudW1iZXIsIHpvb21NYXg/OiBudW1iZXIpOiBTY3JvbGxMYXlvdXQge1xuICAgIC8vIE5COiBzY2FsZSBvZiAwIGlzIGludmFsaWQgYW55d2F5cywgc28gaXQncyBPSyB0byBiZSBmYWxzeS5cbiAgICByZXR1cm4gbmV3IFNjcm9sbExheW91dChjaGlsZCwgc2Nyb2xsIHx8IFswLCAwXSwgem9vbSB8fCAxLCB6b29tTWF4IHx8IDEwKTtcbn1cblxuLy8gVE9ETzogc2Nyb2xseCwgc2Nyb2xseVxuXG5jbGFzcyBCb3hMYXlvdXQ8U3RhdGUsIENoaWxkIGV4dGVuZHMgV1BIUExheW91dDxhbnksIGFueT4gfCB1bmRlZmluZWQ+IGV4dGVuZHMgV1NIU0xheW91dDxDaGlsZCwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3Rvcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB9XG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIGlmICh0aGlzLmNoaWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBXU0hTTGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBXU0hTTGF5b3V0PGFueSwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBzdGF0ZTogU3RhdGUpOiBXU0hTTGF5b3V0PGFueSwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEJveDxTdGF0ZT4od2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogV1NIU0xheW91dDxhbnksIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBCb3g8U3RhdGU+KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBmaXJzdD86IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIHNlY29uZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogV1NIU0xheW91dDxhbnksIFN0YXRlPiB8IFdTSFNMYXlvdXQ8YW55LCB1bmRlZmluZWQ+IHtcbiAgICBpZiAoc2Vjb25kID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGZpcnN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPih3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJveExheW91dDx1bmRlZmluZWQsIFdQSFBMYXlvdXQ8YW55LCBhbnk+Pih3aWR0aCwgaGVpZ2h0LCB1bmRlZmluZWQsIGZpcnN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm94TGF5b3V0PFN0YXRlLCB1bmRlZmluZWQ+KHdpZHRoLCBoZWlnaHQsIGZpcnN0LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCb3hMYXlvdXQ8U3RhdGUsIFdQSFBMYXlvdXQ8YW55LCBhbnk+Pih3aWR0aCwgaGVpZ2h0LCBmaXJzdCBhcyBTdGF0ZSwgc2Vjb25kKTtcbiAgICAgICAgLy8gVE9ETzogdGhlIHN0YXRlIHNob3VsZCB0eXBlLWNoZWNrLlxuICAgIH1cbn1cblxuY2xhc3MgV1BIUEJvcmRlckxheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBTdGF0ZT4ge1xuICAgIGJvcmRlcjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBib3JkZXI6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgc3RhdGU6IFN0YXRlKSB7XG4gICAgICAgIHN1cGVyKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgIHRoaXMuYm9yZGVyID0gYm9yZGVyO1xuICAgICAgICB0aGlzLnN0eWxlID0gc3R5bGU7XG5cbiAgICAgICAgdGhpcy5vbkRyYXdIYW5kbGVyID0gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYiA9IHRoaXMuYm9yZGVyO1xuICAgICAgICAgICAgY29uc3QgYjIgPSBiICogMC41O1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSB0aGlzLmJvcmRlcjtcbiAgICAgICAgICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgYjIsIGJveC50b3AgKyBiMiwgYm94LndpZHRoIC0gYiwgYm94LmhlaWdodCAtIGIpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY29uc3QgYiA9IHRoaXMuYm9yZGVyO1xuICAgICAgICB0aGlzLmNoaWxkLmxheW91dChsZWZ0ICsgYiwgdG9wICsgYiwgd2lkdGggLSBiICogMiwgaGVpZ2h0IC0gYiAqIDIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEJvcmRlcjxTdGF0ZT4od2lkdGg6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZT86IFN0YXRlKTogV1BIUExheW91dDxhbnksIGFueT4ge1xuICAgIGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBuZXcgV1BIUEJvcmRlckxheW91dDx1bmRlZmluZWQ+KGNoaWxkLCB3aWR0aCwgc3R5bGUsIHVuZGVmaW5lZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBXUEhQQm9yZGVyTGF5b3V0PFN0YXRlPihjaGlsZCwgd2lkdGgsIHN0eWxlLCBzdGF0ZSk7XG4gICAgfVxufVxuXG5jbGFzcyBGaWxsTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8dW5kZWZpbmVkLCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSkge1xuICAgICAgICBzdXBlcihzdGF0ZSwgdW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRmlsbCgpOiBGaWxsTGF5b3V0PHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gRmlsbDxTdGF0ZT4oc3RhdGU6IFN0YXRlKTogRmlsbExheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gRmlsbDxTdGF0ZT4oc3RhdGU/OiBTdGF0ZSk6IEZpbGxMYXlvdXQ8dW5kZWZpbmVkPiB8IEZpbGxMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoc3RhdGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbmV3IEZpbGxMYXlvdXQ8dW5kZWZpbmVkPih1bmRlZmluZWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgRmlsbExheW91dDxTdGF0ZT4oc3RhdGUpO1xuICAgIH1cbn1cblxuY2xhc3MgQ2VudGVyTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICB9XG5cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIGNoaWxkVG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IENlbnRlckxheW91dDxTdGF0ZT4ge1xuICAgIHJldHVybiBuZXcgQ2VudGVyTGF5b3V0PFN0YXRlPihzdGF0ZSwgY2hpbGQpO1xufVxuXG5jbGFzcyBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXU0hQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hQTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCwgaGVpZ2h0KTtcbiAgICB9XG59O1xuXG5jbGFzcyBIQ2VudGVySFNMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIU0xheW91dDxXU0hTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICB9XG4gICAgXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZExlZnQgPSBsZWZ0ICsgKHdpZHRoIC0gY2hpbGQud2lkdGgpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wKTtcbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gSENlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdTSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBIQ2VudGVySFNMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIEhDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hQTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogSENlbnRlckhQTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBIQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4gfCBXU0hQTGF5b3V0PGFueSwgYW55Piwgc3RhdGU6IFN0YXRlKTogSENlbnRlckhTTGF5b3V0PFN0YXRlPiB8IEhDZW50ZXJIUExheW91dDxTdGF0ZT4ge1xuICAgIGlmIChjaGlsZC5sYXlvdXRUeXBlID09PSAnd3NocCcpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIQ2VudGVySFBMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBIQ2VudGVySFNMYXlvdXQ8U3RhdGU+KHN0YXRlLCBjaGlsZCk7XG4gICAgfVxufVxuXG5jbGFzcyBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+IGV4dGVuZHMgV1BIUExheW91dDxXUEhTTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+IHtcbiAgICBjb25zdHJ1Y3RvcihzdGF0ZTogU3RhdGUsIGNoaWxkOiBXUEhTTGF5b3V0PGFueSwgYW55Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGQpO1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIGNvbnN0IGNoaWxkVG9wID0gdG9wICsgKGhlaWdodCAtIGNoaWxkLmhlaWdodCkgKiAwLjU7XG5cbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIGNoaWxkVG9wLCB3aWR0aCk7XG4gICAgfVxufTtcblxuY2xhc3MgVkNlbnRlcldTTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdTSFBMYXlvdXQ8V1NIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy53aWR0aCA9IGNoaWxkLndpZHRoO1xuICAgIH1cbiAgICBcbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICBjb25zdCBjaGlsZFRvcCA9IHRvcCArIChoZWlnaHQgLSBjaGlsZC5oZWlnaHQpICogMC41O1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQobGVmdCwgY2hpbGRUb3ApO1xuICAgIH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBWQ2VudGVyPFN0YXRlID0gdW5kZWZpbmVkPihjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4sIHN0YXRlOiBTdGF0ZSk6IFZDZW50ZXJXU0xheW91dDxTdGF0ZT47XG5leHBvcnQgZnVuY3Rpb24gVkNlbnRlcjxTdGF0ZSA9IHVuZGVmaW5lZD4oY2hpbGQ6IFdQSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBWQ2VudGVyV1BMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFZDZW50ZXI8U3RhdGUgPSB1bmRlZmluZWQ+KGNoaWxkOiBXU0hTTGF5b3V0PGFueSwgYW55PiB8IFdQSFNMYXlvdXQ8YW55LCBhbnk+LCBzdGF0ZTogU3RhdGUpOiBWQ2VudGVyV1NMYXlvdXQ8U3RhdGU+IHwgVkNlbnRlcldQTGF5b3V0PFN0YXRlPiB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3cGhzJykge1xuICAgICAgICByZXR1cm4gbmV3IFZDZW50ZXJXUExheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IFZDZW50ZXJXU0xheW91dDxTdGF0ZT4oc3RhdGUsIGNoaWxkKTtcbiAgICB9XG59XG4vKlxuY2xhc3MgTGVmdEhTTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnksIGFueT4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZDogV1NIU0xheW91dDxhbnksIGFueT4pIHtcbiAgICAgICAgc3VwZXIoc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGQgPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG5cbiAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuY2xhc3MgTGVmdFN0YWNrTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1NIUExheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFdTSFBMYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuXG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMudG9wID0gdG9wO1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG4gICAgICAgIGxldCBjaGlsZExlZnQgPSBsZWZ0O1xuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgICAgICAgICBjaGlsZExlZnQgKz0gY2hpbGQud2lkdGg7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5jbGFzcyBMZWZ0RmxleExheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PEZsZXhMYXlvdXQ8YW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8RmxleExheW91dDxhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLmNoaWxkO1xuICAgICAgICBsZXQgc2l6ZVN1bSA9IDA7XG4gICAgICAgIGxldCBncm93U3VtID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgc2l6ZVN1bSArPSBjaGlsZC5zaXplO1xuICAgICAgICAgICAgZ3Jvd1N1bSArPSBjaGlsZC5ncm93O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4dHJhID0gd2lkdGggLSBzaXplU3VtO1xuICAgICAgICBsZXQgY2hpbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICAgICAgY29uc3QgY2hpbGRXaWR0aCA9IGNoaWxkLnNpemUgKyBjaGlsZC5ncm93ICogZXh0cmEgLyBncm93U3VtO1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGNoaWxkTGVmdCwgdG9wLCBjaGlsZFdpZHRoLCBoZWlnaHQpO1xuICAgICAgICAgICAgY2hpbGRMZWZ0ICs9IGNoaWxkLnNpemU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBMZWZ0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBXUEhTTGF5b3V0PGFueT47XG5leHBvcnQgZnVuY3Rpb24gTGVmdChjaGlsZDA6IFdTSFBMYXlvdXQ8YW55PiwgLi4uY2hpbGRSZXN0OiBBcnJheTxXU0hQTGF5b3V0PGFueT4+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQwOiBGbGV4TGF5b3V0LCAuLi5jaGlsZFJlc3Q6IEFycmF5PEZsZXhMYXlvdXQ+KTogV1BIUExheW91dDxhbnk+O1xuZXhwb3J0IGZ1bmN0aW9uIExlZnQoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55PiB8IFdTSFBMYXlvdXQ8YW55PiB8IEZsZXhMYXlvdXQsIC4uLl86IEFycmF5PFdTSFBMYXlvdXQ8YW55Pj4gfCBBcnJheTxGbGV4TGF5b3V0Pik6IFdQSFNMYXlvdXQ8YW55PiB8IFdQSFBMYXlvdXQ8YW55PiB7XG4gICAgc3dpdGNoIChjaGlsZC5sYXlvdXRUeXBlKSB7XG4gICAgICAgIGNhc2UgJ2ZsZXgnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0RmxleExheW91dChhcmd1bWVudHMpO1xuICAgICAgICBjYXNlICd3c2hwJzpcbiAgICAgICAgICAgIHJldHVybiBuZXcgTGVmdFN0YWNrTGF5b3V0KGFyZ3VtZW50cyk7XG4gICAgICAgIGNhc2UgJ3dzaHMnOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBMZWZ0SFNMYXlvdXQoY2hpbGQpO1xuICAgIH1cbn1cblxuY2xhc3MgUmlnaHRIUExheW91dCBleHRlbmRzIFdQSFBMYXlvdXQ8V1NIUExheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFBMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgfVxuXG4gICAgbGF5b3V0KGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcblxuICAgICAgICBjaGlsZC5sYXlvdXQoY2hpbGRMZWZ0LCB0b3AsIGhlaWdodCk7XG4gICAgfVxufTtcblxuY2xhc3MgUmlnaHRIU0xheW91dCBleHRlbmRzIFdQSFNMYXlvdXQ8V1NIU0xheW91dDxhbnk+PiB7XG4gICAgY29uc3RydWN0b3IoY2hpbGQ6IFdTSFNMYXlvdXQ8YW55Pikge1xuICAgICAgICBzdXBlcihjaGlsZCk7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgIH1cblxuICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGNoaWxkID0gdGhpcy5jaGlsZDtcbiAgICAgICAgY29uc3QgY2hpbGRMZWZ0ID0gd2lkdGggLSBjaGlsZC53aWR0aDtcblxuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xuXG4gICAgICAgIGNoaWxkLmxheW91dChjaGlsZExlZnQsIHRvcCk7XG4gICAgfVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhQTGF5b3V0O1xuZXhwb3J0IGZ1bmN0aW9uIFJpZ2h0KGNoaWxkOiBXU0hTTGF5b3V0PGFueT4gfCBXU0hQTGF5b3V0PGFueT4pOiBSaWdodEhTTGF5b3V0IHwgUmlnaHRIUExheW91dCB7XG4gICAgaWYgKGNoaWxkLmxheW91dFR5cGUgPT09ICd3c2hwJykge1xuICAgICAgICByZXR1cm4gbmV3IFJpZ2h0SFBMYXlvdXQoY2hpbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgUmlnaHRIU0xheW91dChjaGlsZCk7XG4gICAgfVxufVxuKi9cblxudHlwZSBEZWJ1Z1RvdWNoU3RhdGUgPSB7XG4gICAgZmlsbDogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLFxuICAgIHN0cm9rZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLFxuICAgIHRhcHM6IEFycmF5PFBvaW50MkQ+LFxuICAgIHBhbnM6IEFycmF5PEFycmF5PFBhblBvaW50Pj4sXG59O1xuXG5mdW5jdGlvbiBkZWJ1Z1RvdWNoT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBEZWJ1Z1RvdWNoU3RhdGUpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gc3RhdGUuZmlsbDtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdGF0ZS5zdHJva2U7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBmb3IgKGNvbnN0IHRhcCBvZiBzdGF0ZS50YXBzKSB7XG4gICAgICAgIGN0eC5tb3ZlVG8odGFwWzBdICsgMTYsIHRhcFsxXSk7XG4gICAgICAgIGN0eC5lbGxpcHNlKHRhcFswXSwgdGFwWzFdLCAxNiwgMTYsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBwcyBvZiBzdGF0ZS5wYW5zKSB7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBwcykge1xuICAgICAgICAgICAgY3R4Lm1vdmVUbyhwLnByZXZbMF0sIHAucHJldlsxXSk7XG4gICAgICAgICAgICBjdHgubGluZVRvKHAuY3VyclswXSwgcC5jdXJyWzFdKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRlYnVnVG91Y2hPblRhcChwOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBEZWJ1Z1RvdWNoU3RhdGUpIHtcbiAgICBzdGF0ZS50YXBzLnB1c2gocCk7XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZnVuY3Rpb24gZGVidWdUb3VjaE9uUGFuKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IERlYnVnVG91Y2hTdGF0ZSkge1xuICAgIHN0YXRlLnBhbnMucHVzaChwcyk7XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIERlYnVnVG91Y2god2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpbGw6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgc3Ryb2tlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4pOiBCb3hMYXlvdXQ8RGVidWdUb3VjaFN0YXRlLCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCBzdGF0ZSA9IHtcbiAgICAgICAgZmlsbCxcbiAgICAgICAgc3Ryb2tlLFxuICAgICAgICB0YXBzOiBbXSxcbiAgICAgICAgcGFuczogW10sXG4gICAgfTtcbiAgICByZXR1cm4gQm94PERlYnVnVG91Y2hTdGF0ZT4od2lkdGgsIGhlaWdodCwgc3RhdGUpXG4gICAgICAgIC5vbkRyYXcoZGVidWdUb3VjaE9uRHJhdylcbiAgICAgICAgLm9uVGFwKGRlYnVnVG91Y2hPblRhcClcbiAgICAgICAgLm9uUGFuKGRlYnVnVG91Y2hPblBhbik7XG59XG5cbi8vIFRPRE86IFRvcCwgQm90dG9tXG5cbmNsYXNzIExheWVyTGF5b3V0PFN0YXRlPiBleHRlbmRzIFdQSFBMYXlvdXQ8U3RhdGljQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+LCBTdGF0ZT4ge1xuICAgIGNvbnN0cnVjdG9yKHN0YXRlOiBTdGF0ZSwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuICAgICAgICAgICAgY2hpbGQubGF5b3V0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gTGF5ZXI8U3RhdGU+KHN0YXRlOiBTdGF0ZSwgLi4uY2hpbGRyZW46IEFycmF5PFdQSFBMYXlvdXQ8YW55LCBhbnk+Pik6IExheWVyTGF5b3V0PFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBMYXllciguLi5jaGlsZHJlbjogQXJyYXk8V1BIUExheW91dDxhbnksIGFueT4+KTogTGF5ZXJMYXlvdXQ8dW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBMYXllcjxTdGF0ZT4oZmlyc3Q6IFN0YXRlIHwgV1BIUExheW91dDxhbnksIGFueT4sIC4uLmNoaWxkcmVuOiBBcnJheTxXUEhQTGF5b3V0PGFueSwgYW55Pj4pOiBMYXllckxheW91dDxTdGF0ZT4gfCBMYXllckxheW91dDx1bmRlZmluZWQ+IHtcbiAgICBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBuZXcgTGF5ZXJMYXlvdXQ8dW5kZWZpbmVkPih1bmRlZmluZWQsIFtmaXJzdCwgLi4uY2hpbGRyZW5dKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBMYXllckxheW91dDxTdGF0ZT4oZmlyc3QsIGNoaWxkcmVuKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgUG9zaXRpb25MYXlvdXQ8Q2hpbGQgZXh0ZW5kcyBXUEhQTGF5b3V0PGFueSwgYW55PiB8IHVuZGVmaW5lZCwgU3RhdGU+IGV4dGVuZHMgRWxlbWVudDxcInBvc1wiLCBDaGlsZCwgU3RhdGU+IHtcbiAgICByZXF1ZXN0TGVmdDogbnVtYmVyO1xuICAgIHJlcXVlc3RUb3A6IG51bWJlcjtcbiAgICByZXF1ZXN0V2lkdGg6IG51bWJlcjtcbiAgICByZXF1ZXN0SGVpZ2h0OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3RhdGU6IFN0YXRlLCBjaGlsZDogQ2hpbGQpIHtcbiAgICAgICAgc3VwZXIoXCJwb3NcIiwgc3RhdGUsIGNoaWxkKTtcbiAgICAgICAgdGhpcy5yZXF1ZXN0TGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMucmVxdWVzdFRvcCA9IHRvcDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0V2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5yZXF1ZXN0SGVpZ2h0ID0gaGVpZ2h0O1xuICAgIH1cbiAgICBsYXlvdXQocGFyZW50OiBMYXlvdXRCb3gpIHtcbiAgICAgICAgdGhpcy53aWR0aCA9IE1hdGgubWluKHRoaXMucmVxdWVzdFdpZHRoLCBwYXJlbnQud2lkdGgpO1xuICAgICAgICB0aGlzLmxlZnQgPSBjbGFtcCh0aGlzLnJlcXVlc3RMZWZ0LCBwYXJlbnQubGVmdCwgcGFyZW50LmxlZnQgKyBwYXJlbnQud2lkdGggLSB0aGlzLndpZHRoKTtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBNYXRoLm1pbih0aGlzLnJlcXVlc3RIZWlnaHQsIHBhcmVudC5oZWlnaHQpO1xuICAgICAgICB0aGlzLnRvcCA9IGNsYW1wKHRoaXMucmVxdWVzdFRvcCwgcGFyZW50LnRvcCwgcGFyZW50LnRvcCArIHBhcmVudC5oZWlnaHQgLSB0aGlzLmhlaWdodCk7XG5cbiAgICAgICAgaWYgKHRoaXMuY2hpbGQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5jaGlsZC5sYXlvdXQodGhpcy5sZWZ0LCB0aGlzLnRvcCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLy8gVE9ETzogc3VwcG9ydCBzdGF0aWNhbGx5IHNpemVkIGNoaWxkcmVuLCBcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbihsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbjxTdGF0ZT4obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSk6IFBvc2l0aW9uTGF5b3V0PHVuZGVmaW5lZCwgU3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFBvc2l0aW9uKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZDogV1BIUExheW91dDxhbnksIGFueT4pOiBQb3NpdGlvbkxheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgdW5kZWZpbmVkPjtcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbjxTdGF0ZT4obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHN0YXRlOiBTdGF0ZSwgY2hpbGQ6IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogUG9zaXRpb25MYXlvdXQ8V1BIUExheW91dDxhbnksIGFueT4sIFN0YXRlPjtcbmV4cG9ydCBmdW5jdGlvbiBQb3NpdGlvbjxTdGF0ZT4obGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGZpcnN0PzogU3RhdGUgfCBXUEhQTGF5b3V0PGFueSwgYW55Piwgc2Vjb25kPzogV1BIUExheW91dDxhbnksIGFueT4pIHtcbiAgICBpZiAoc2Vjb25kID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGZpcnN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgUG9zaXRpb25MYXlvdXQ8dW5kZWZpbmVkLCB1bmRlZmluZWQ+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuICAgICAgICB9IGVsc2UgaWYgKGZpcnN0IGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgdW5kZWZpbmVkPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgZmlyc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dDx1bmRlZmluZWQsIFN0YXRlPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIGZpcnN0LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQb3NpdGlvbkxheW91dDxXUEhQTGF5b3V0PGFueSwgYW55PiwgU3RhdGU+KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCwgZmlyc3QgYXMgU3RhdGUsIHNlY29uZCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gRHJhZ2dhYmxlKGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjaGlsZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KSB7XG4gICAgY29uc3QgbGF5b3V0ID0gbmV3IFBvc2l0aW9uTGF5b3V0PGFueSwgdW5kZWZpbmVkPihsZWZ0LCB0b3AsIHdpZHRoLCBoZWlnaHQsIHVuZGVmaW5lZCwgY2hpbGQpO1xuICAgIHJldHVybiBsYXlvdXQub25QYW4oKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBsZXQgZHggPSAwO1xuICAgICAgICBsZXQgZHkgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgcHMpIHtcbiAgICAgICAgICAgIGR4ICs9IHAuY3VyclswXSAtIHAucHJldlswXTtcbiAgICAgICAgICAgIGR5ICs9IHAuY3VyclsxXSAtIHAucHJldlsxXTtcbiAgICAgICAgfVxuICAgICAgICBkeCAvPSBwcy5sZW5ndGg7XG4gICAgICAgIGR5IC89IHBzLmxlbmd0aDtcbiAgICAgICAgbGF5b3V0LnJlcXVlc3RMZWZ0ICs9IGR4O1xuICAgICAgICBsYXlvdXQucmVxdWVzdFRvcCArPSBkeTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pLm9uUGFuRW5kKCgpID0+IHtcbiAgICAgICAgLy8gVGhlIHJlcXVlc3RlZCBsb2NhdGlvbiBjYW4gYmUgb3V0c2lkZSB0aGUgYWxsb3dlZCBib3VuZHMgaWYgZHJhZ2dlZCBvdXRzaWRlLFxuICAgICAgICAvLyBidXQgb25jZSB0aGUgZHJhZyBpcyBvdmVyLCB3ZSB3YW50IHRvIHJlc2V0IGl0IHNvIHRoYXQgaXQgZG9lc24ndCBzdGFydCB0aGVyZVxuICAgICAgICAvLyBvbmNlIGEgbmV3IGRyYWcgc3RhcnQuXG4gICAgICAgIGxheW91dC5yZXF1ZXN0TGVmdCA9IGxheW91dC5sZWZ0O1xuICAgICAgICBsYXlvdXQucmVxdWVzdFRvcCA9IGxheW91dC50b3A7XG4gICAgfSk7XG59XG5cblxuLy8gVE9ETzogZG9lcyBpdCBtYWtlIHNlbnNlIHRvIG1ha2Ugb3RoZXIgbGF5b3V0IHR5cGVzP1xuLy8gY2xhc3MgV1NIU1JlbGF0aXZlTGF5b3V0IGV4dGVuZHMgV1NIU0xheW91dDxTdGF0aWNBcnJheTxQb3NpdGlvbkxheW91dD4+IHtcbi8vICAgICBjb25zdHJ1Y3Rvcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgY2hpbGRyZW46IFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0Pikge1xuLy8gICAgICAgICBzdXBlcihjaGlsZHJlbik7XG4vLyAgICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbi8vICAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4vLyAgICAgfVxuLy8gICAgIGxheW91dChsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyKTogdm9pZCB7XG4vLyAgICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4vLyAgICAgICAgIHRoaXMudG9wID0gdG9wO1xuXG4vLyAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZCkge1xuLy8gICAgICAgICAgICAgY2hpbGQubGF5b3V0KHRoaXMgLyogTGF5b3V0Qm94ICovKTtcbi8vICAgICAgICAgfVxuLy8gICAgIH1cbi8vIH07XG5cbmNsYXNzIFdQSFBSZWxhdGl2ZUxheW91dDxTdGF0ZT4gZXh0ZW5kcyBXUEhQTGF5b3V0PFN0YXRpY0FycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4sIFN0YXRlPiB7XG4gICAgY29uc3RydWN0b3Ioc3RhdGU6IFN0YXRlLCBjaGlsZHJlbjogU3RhdGljQXJyYXk8UG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+Pikge1xuICAgICAgICBzdXBlcihzdGF0ZSwgY2hpbGRyZW4pO1xuICAgIH1cbiAgICBsYXlvdXQobGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy50b3AgPSB0b3A7XG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkKSB7XG4gICAgICAgICAgICBjaGlsZC5sYXlvdXQodGhpcyAvKiBMYXlvdXRCb3ggKi8pO1xuICAgICAgICB9XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIFJlbGF0aXZlKC4uLmNoaWxkcmVuOiBBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KTogV1BIUFJlbGF0aXZlTGF5b3V0PHVuZGVmaW5lZD47XG5leHBvcnQgZnVuY3Rpb24gUmVsYXRpdmU8U3RhdGU+KHN0YXRlOiBTdGF0ZSwgLi4uY2hpbGRyZW46IEFycmF5PFBvc2l0aW9uTGF5b3V0PGFueSwgYW55Pj4pOiBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+O1xuZXhwb3J0IGZ1bmN0aW9uIFJlbGF0aXZlPFN0YXRlPihmaXJzdDogU3RhdGUgfCBQb3NpdGlvbkxheW91dDxhbnksIGFueT4sIC4uLmNoaWxkcmVuOiBBcnJheTxQb3NpdGlvbkxheW91dDxhbnksIGFueT4+KTogV1BIUFJlbGF0aXZlTGF5b3V0PHVuZGVmaW5lZD4gfCBXUEhQUmVsYXRpdmVMYXlvdXQ8U3RhdGU+IHtcbiAgICBpZiAoZmlyc3QgaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBuZXcgV1BIUFJlbGF0aXZlTGF5b3V0PHVuZGVmaW5lZD4odW5kZWZpbmVkLCBbZmlyc3QsIC4uLmNoaWxkcmVuXSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgV1BIUFJlbGF0aXZlTGF5b3V0PFN0YXRlPihmaXJzdCwgY2hpbGRyZW4pO1xufVxuIl19