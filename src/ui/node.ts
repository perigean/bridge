// Copyright Charles Dick 2021

import { Gesture, GestureHandler, Pan, Tap } from "./gesture.js";
import { Point2D } from "../point.js"

export type LayoutBox = {
    left: number;
    top: number;
    width: number;
    height: number;
};

type OnDrawHandler = (ctx: CanvasRenderingContext2D, box: LayoutBox) => void;
type OnTapHandler = (t: Tap) => void;
type OnPanHandler = (p: Pan) => void;

// So that we can take IArguments as children
interface StaticArray<T> {
    [index: number]: T;
    length: number;
    [Symbol.iterator](): IterableIterator<T>;
};

type ChildConstraint<LayoutType extends string> = Element<LayoutType, any> | StaticArray<Element<LayoutType, any>> | undefined;

class Element<LayoutType extends string, Child extends ChildConstraint<string>> {
    layoutType: LayoutType;
    child: Child;
    left: number;
    top: number;
    width: number;
    height: number;

    constructor(layoutType: LayoutType, child: Child) {
        this.layoutType = layoutType;
        this.child = child;
        this.left = NaN;
        this.top = NaN;
        this.width = NaN;
        this.height = NaN;
    }

    onDrawHandler?: OnDrawHandler;
    onDraw(handler: OnDrawHandler): this {
        if (this.onDrawHandler !== undefined) {
            throw new Error('onDraw already set');
        }
        this.onDrawHandler = handler;
        return this;
    }

    // Events.
    onTapHandler?: OnTapHandler;
    onTap(handler: OnTapHandler): this {
        if (this.onTapHandler !== undefined) {
            throw new Error('onTap already set');
        }
        this.onTapHandler = handler;
        return this;
    };

    onPanHandler?: OnPanHandler;
    onPan(handler: OnPanHandler): this {
        if (this.onPanHandler !== undefined) {
            throw new Error(`onPan already set`);
        }
        this.onPanHandler = handler;
        return this;
    }
};

abstract class WPHPLayout<Child extends ChildConstraint<any>> extends Element<'wphp', Child> {
    constructor(child: Child) {
        super('wphp', child);
    }
    abstract layout(left: number, top: number, width: number, height: number): void;
};

abstract class WPHSLayout<Child extends ChildConstraint<any>> extends Element<'wphs', Child> {
    constructor(child: Child) {
        super('wphs', child);
    }
    abstract layout(left: number, top: number, width: number): void;
};

abstract class WSHPLayout<Child extends ChildConstraint<any>> extends Element<'wshp', Child> {
    constructor(child: Child) {
        super('wshp', child);
    }
    abstract layout(left: number, top: number, height: number): void;
};

abstract class WSHSLayout<Child extends ChildConstraint<any>> extends Element<'wshs', Child> {
    constructor(child: Child) {
        super('wshs', child);
    }
    abstract layout(left: number, top: number): void;
};

class FlexLayout extends Element<'flex', WPHPLayout<any>> {
    size: number;
    grow: number;
    constructor(size: number, grow: number, child: WPHPLayout<any>) {
        super('flex', child);
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

function drawElementTree(ctx: CanvasRenderingContext2D, root: Element<any, any>) {
    ctx.fillStyle = "white";
    ctx.fillRect(root.left, root.top, root.width, root.height);
    const stack = [root];
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (e.onDrawHandler) {
            e.onDrawHandler(ctx, e);
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            // Push last child on first, so we draw it last.
            for (let i = e.child.length - 1; i >= 0; i--) {
                stack.push(e.child[i]);
            }
        } else {
            stack.push(e.child);
        }
    }
}


type HasTapHandler = { onTapHandler: OnTapHandler };
type HasPanHandler = { onPanHandler: OnPanHandler };
type EventHandlers = "onTapHandler" | "onPanHandler";

function findEventTarget(root: Element<any, any>, p: Point2D, handler: "onTapHandler"): undefined | HasTapHandler;
function findEventTarget(root: Element<any, any>, p: Point2D, handler: "onPanHandler"): undefined | HasPanHandler;
function findEventTarget(root: Element<any, any>, p: Point2D, handler: EventHandlers): undefined | Partial<Element<any, any>> {
    const stack = [root];
    let target = undefined;
    while (stack.length > 0) {
        const e = stack.pop() as Element<any, any>;
        if (p[0] < e.left || p[0] >= e.left + e.width || p[1] < e.top || p[1] >= e.top + e.height) {
            // Outside e, skip.  
            continue;
        }
        if (e[handler] !== undefined) {
            target = e;
        }
        if (e.child === undefined) {
            // No children, so no more work to do.
        } else if (e.child[Symbol.iterator]) {
            // Push first child on first, so we visit last child last.
            // The last child (the one on top) should override previous children's target.
            stack.push(...e.child);
        } else {
            stack.push(e.child);
        }
    }
    return target;
}

// dummyPanTarget is an event sink we use to capture pans that start on a position without any event handlers.
// We don't want a future Element created over the Pan's start position to suddenly start receiving pan events.
const dummyPanTarget : HasPanHandler = {
    onPanHandler: function (_: Pan) {},
};

export class RootLayout implements GestureHandler {
    child: WPHPLayout<any>;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    resize: ResizeObserver;

    // TODO: have some way of clearing panTouches if the tree under child ever changes?
    // OR, don't care, just leak the thing until the touch ends.
    // We need to reuse references for rerendered components?
    // Figure this out once we do state.
    // Maybe store a handle instead of a reference, and the handles can be stable across rerenders?
    panTouches: Map<number, HasPanHandler>;
    gesture: Gesture;

    constructor(canvas: HTMLCanvasElement, child: WPHPLayout<any>) {
        this.child = child;
        this.canvas = canvas;
        const ctx = canvas.getContext("2d", {alpha: false, desynchronized: true});
        if (ctx === null) {
            throw new Error("failed to get 2d context");
        }
        this.ctx = ctx;
        this.resize = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length !== 1) {
                throw new Error("")
            }
            const content = entries[0].contentRect;
            const width = content.width;
            const height = content.height
            console.log(`Layout ${width} x ${height}`);
            this.child.layout(0, 0, width, height);

            canvas.width = width * window.devicePixelRatio;
            canvas.height = height * window.devicePixelRatio;
            ctx.transform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
            drawElementTree(ctx, this.child);
        });
        this.resize.observe(canvas, {box: "device-pixel-content-box"});
        this.panTouches = new Map();
        this.gesture = new Gesture(canvas, this);
        // observe triggers a call to resize, so no need to do layout/drawing here.
    }
    
    tap(tap: Tap) {
        const targets = new Map<HasTapHandler, Tap>();
        for (const p of tap) {
            const target = findEventTarget(this.child, p, "onTapHandler");
            if (target === undefined) {
                continue;
            }
            const targetP = targets.get(target) || [];
            targetP.push(p);
            targets.set(target, targetP);
        }
        for (const [target, p] of targets) {
            target.onTapHandler(p);
        }
        // TODO: have a better way of triggering redraws
        drawElementTree(this.ctx, this.child);
    }

    pan(pan: Pan) {
        const targets = new Map<HasPanHandler, Pan>();
        for (const p of pan) {
            let target = this.panTouches.get(p.id);
            if (target === undefined) {
                // New PanTouch, find the Element it started on.
                target = findEventTarget(this.child, p.start, "onPanHandler");
                if (target === undefined) {
                    // There is no handler for this pan, send all future onPanHandler events to dummyPanTarget.
                    target = dummyPanTarget;
                }
                this.panTouches.set(p.id, target);
            }
            const targetP = targets.get(target) || [];
            targetP.push(p);
            targets.set(target, targetP);
        }
        for (const [target, p] of targets) {
            target.onPanHandler(p);
        }
        // TODO: have a better way of triggering redraws
        drawElementTree(this.ctx, this.child);
    }

    panTouchEnd(id: number) {
        this.panTouches.delete(id);
    }

    disconnect() {
        this.resize.disconnect();
        this.gesture.disconnect();
    }
};

// TODO: make som WPHPLayout that positions all children with absolute coordinates.
// Probably needs a new child type that includes left, top.
// TODO: Make it pan (have a provided size)
// TODO: Have acceleration structures. (so hide children, and forward tap/pan/draw manually, with transform)
// TODO: Make it zoom
// TODO: maybe have two elements? a viewport and a HSWS with absolutely positioned children and acceleration structures

class BoxLayout extends WSHSLayout<undefined> {
    constructor(width: number, height: number) {
        super(undefined);
        this.width = width;
        this.height = height;
    }
    layout(left: number, top: number): void {
        this.left = left;
        this.top = top;
    }
};

export function Box(width: number, height: number) : BoxLayout {
    return new BoxLayout(width, height);
}

class CenterLayout extends WPHPLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, childTop);
    }
};

export function Center(child: WSHSLayout<any>): CenterLayout {
    return new CenterLayout(child);
}

class HCenterHPLayout extends WPHPLayout<WSHPLayout<any>> {
    constructor(child: WSHPLayout<any>) {
        super(child);
    }
    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, top, height);
    }
};

class HCenterHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
        this.height = child.height;
    }
    
    layout(left: number, top: number, width: number): void {
        const child = this.child;
        const childLeft = left + (width - child.width) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(childLeft, top);
    }
};

export function HCenter(child: WSHSLayout<any>): HCenterHSLayout;
export function HCenter(child: WSHPLayout<any>): HCenterHPLayout;
export function HCenter(child: WSHSLayout<any> | WSHPLayout<any>): HCenterHSLayout | HCenterHPLayout {
    if (child.layoutType === 'wshp') {
        return new HCenterHPLayout(child);
    } else {
        return new HCenterHSLayout(child);
    }
}

class VCenterWPLayout extends WPHPLayout<WPHSLayout<any>> {
    constructor(child: WPHSLayout<any>) {
        super(child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(left, childTop, width);
    }
};

class VCenterWSLayout extends WSHPLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
        this.width = child.width;
    }
    
    layout(left: number, top: number, height: number): void {
        const child = this.child;
        const childTop = top + (height - child.height) * 0.5;

        this.left = left;
        this.top = top;
        this.height = height;

        child.layout(left, childTop);
    }
};

export function VCenter(child: WSHSLayout<any>): VCenterWSLayout;
export function VCenter(child: WPHSLayout<any>): VCenterWPLayout;
export function VCenter(child: WSHSLayout<any> | WPHSLayout<any>): VCenterWSLayout | VCenterWPLayout {
    if (child.layoutType === 'wphs') {
        return new VCenterWPLayout(child);
    } else {
        return new VCenterWSLayout(child);
    }
}

class LeftHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
        this.height = child.height;
    }

    layout(left: number, top: number, width: number): void {
        const child = this.child;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(left, top);
    }
};

class LeftStackLayout extends WPHPLayout<StaticArray<WSHPLayout<any>>> {
    constructor(children: StaticArray<WSHPLayout<any>>) {
        super(children);
    }
    layout(left: number, top: number, width: number, height: number): void {
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
};

class LeftFlexLayout extends WPHPLayout<StaticArray<FlexLayout>> {
    constructor(children: StaticArray<FlexLayout>) {
        super(children);
    }
    layout(left: number, top: number, width: number, height: number): void {
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

export function Left(child: WSHSLayout<any>): WPHSLayout<any>;
export function Left(child0: WSHPLayout<any>, ...childRest: Array<WSHPLayout<any>>): WPHPLayout<any>;
export function Left(child0: FlexLayout, ...childRest: Array<FlexLayout>): WPHPLayout<any>;
export function Left(child: WSHSLayout<any> | WSHPLayout<any> | FlexLayout, ..._: Array<WSHPLayout<any>> | Array<FlexLayout>): WPHSLayout<any> | WPHPLayout<any> {
    switch (child.layoutType) {
        case 'flex':
            return new LeftFlexLayout(arguments);
        case 'wshp':
            return new LeftStackLayout(arguments);
        case 'wshs':
            return new LeftHSLayout(child);
    }
}

class RightHPLayout extends WPHPLayout<WSHPLayout<any>> {
    constructor(child: WSHPLayout<any>) {
        super(child);
    }

    layout(left: number, top: number, width: number, height: number): void {
        const child = this.child;
        const childLeft = width - child.width;

        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;

        child.layout(childLeft, top, height);
    }
};

class RightHSLayout extends WPHSLayout<WSHSLayout<any>> {
    constructor(child: WSHSLayout<any>) {
        super(child);
        this.height = child.height;
    }

    layout(left: number, top: number, width: number): void {
        const child = this.child;
        const childLeft = width - child.width;

        this.left = left;
        this.top = top;
        this.width = width;

        child.layout(childLeft, top);
    }
};

export function Right(child: WSHSLayout<any>): RightHSLayout;
export function Right(child: WSHPLayout<any>): RightHPLayout;
export function Right(child: WSHSLayout<any> | WSHPLayout<any>): RightHSLayout | RightHPLayout {
    if (child.layoutType === 'wshp') {
        return new RightHPLayout(child);
    } else {
        return new RightHSLayout(child);
    }
}


export function DebugTouch(width: number, height: number, fill: string | CanvasGradient | CanvasPattern, stroke: string | CanvasGradient | CanvasPattern): BoxLayout {
    const taps: Array<Point2D> = [];
    const pans: Map<number, Array<Point2D>> = new Map();
    return Box(
        width,
        height,
    ).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.fillRect(box.left, box.top, box.width, box.height);
        ctx.beginPath();
        for (const tap of taps) {
            ctx.moveTo(tap[0] + 16, tap[1]);
            ctx.ellipse(tap[0], tap[1], 16, 16, 0, 0, 2 * Math.PI);
        }
        for (const [, pan] of pans) {
            ctx.moveTo(pan[0][0], pan[0][1]);
            for (const p of pan) {
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.stroke();
    }).onTap((tap: Tap) => {
        taps.push(...tap);
    }).onPan((pan: Pan) => {
        for (const p of pan) {
            const ps = pans.get(p.id) || [p.start];
            ps.push(p.curr);
            pans.set(p.id, ps);
        }
    });
}

// TODO: Top, Bottom
