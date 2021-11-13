// Copyright Charles Dueck 2020

import { TrussSimPlayer } from "./trusssimplayer.js";
import { Point2D, pointDistance } from "./point.js";
import { TrussSim } from "./trusssim.js";
import { addChild, Bottom, Box, ElementContext, Fill, Flex, Layer, LayoutBox, LayoutTakesWidthAndHeight, Left, Mux, PanPoint, Position, PositionLayout, Relative, removeChild, Scroll, Switch } from "./ui/node.js";
import { SceneJSON } from "./trussJSON.js";
import { linearGradient, viridis } from "./colormap.js";

export type Beam = {
    p1: number; // Index of pin at beginning of beam.
    p2: number; // Index of pin at end of beam.
    m: number;  // Index of material of beam.
    w: number;  // Width of beam.
    l?: number; // Length of beam, only specified when pre-straining.
    deck?: boolean; // Is this beam a deck? (do discs collide)
};

export type Disc = {
    p: number;  // Index of moveable pin this disc surrounds.
    m: number;  // Material of disc.
    r: number;  // Radius of disc.
    v: number;  // Velocity of surface of disc (in CCW direction).
};

export type Material = {
    E: number;  // Young's modulus in Pa.
    density: number;    // kg/m^3
    style: string | CanvasGradient | CanvasPattern;
    friction: number;
    maxLength: number;
    // TODO: when stuff breaks, work hardening, etc.
};

export type Truss = {
    fixedPins: Array<Point2D>;
    trainPins: Array<Point2D>;
    editPins: Array<Point2D>;
    trainBeams: Array<Beam>;
    editBeams: Array<Beam>;
    discs: Array<Disc>;
    materials: Array<Material>;
};

function trussAssertMaterial(truss: Truss, m: number) {
    const materials = truss.materials;
    if (m < 0 || m >= materials.length) {
        throw new Error(`Unknown material index ${m}`);
    }
}

function trussAssertPin(truss: Truss, pin: number) {
    if (pin < -truss.fixedPins.length || pin >= truss.trainPins.length + truss.editPins.length) {
        throw new Error(`Unknown pin index ${pin}`);
    }
}

function trussBeamExists(truss: Truss, p1: number, p2: number): boolean {
    for (const beam of truss.editBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            return true;
        }
    }
    for (const beam of truss.trainBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            return true;
        }
    }
    return false;
}

function trussEditPinsBegin(truss: Truss): number {
    return truss.trainPins.length;
}

function trussEditPinsEnd(truss: Truss): number {
    return truss.trainPins.length + truss.editPins.length;
}

function trussUneditablePinsBegin(truss: Truss): number {
    return -truss.fixedPins.length;
}

function trussUneditablePinsEnd(_truss: Truss): number {
    return 0;
}

function trussGetClosestPin(truss: Truss, p: Point2D, maxd: number, pinStart: number, maxLength: number): number | undefined {
    // TODO: acceleration structures. Probably only matters once we have 1000s of pins?
    const pStart = trussGetPin(truss, pinStart);
    const block = new Set<number>();
    let res = undefined;
    let resd = maxd;
    if (pinStart !== undefined) {
        for (const b of truss.trainBeams) {
            if (b.p1 === pinStart) {
                block.add(b.p2);
            } else if (b.p2 === pinStart) {
                block.add(b.p1);
            }
        }
        for (const b of truss.editBeams) {
            if (b.p1 === pinStart) {
                block.add(b.p2);
            } else if (b.p2 === pinStart) {
                block.add(b.p1);
            }
        }
    }
    for (let i = 0; i < truss.fixedPins.length; i++) {
        if (block.has(i - truss.fixedPins.length) || pointDistance(pStart, truss.fixedPins[i]) > maxLength) {
            continue;
        }
        const d = pointDistance(p, truss.fixedPins[i]);
        if (d < resd) {
            res = i - truss.fixedPins.length;
            resd = d;
        }
    }
    for (let i = 0; i < truss.trainPins.length; i++) {
        if (block.has(i) || pointDistance(pStart, truss.trainPins[i]) > maxLength) {
            continue;
        }
        const d = pointDistance(p, truss.trainPins[i]);
        if (d < resd) {
            res = i;
            resd = d;
        }
    }
    for (let i = 0; i < truss.editPins.length; i++) {
        if (block.has(i + truss.trainPins.length) || pointDistance(pStart, truss.editPins[i]) > maxLength) {
            continue;
        }
        const d = pointDistance(p, truss.editPins[i]);
        if (d < resd) {
            res = i + truss.trainPins.length;
            resd = d;
        }
    }
    return res;
}

function trussGetPin(truss: Truss, pin: number): Point2D {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    } else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    } else if (pin < truss.trainPins.length) {
        return truss.trainPins[pin];
    } else if (pin - truss.trainPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.trainPins.length];
    } else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}

export type Terrain = {
    hmap: Array<number>;
    friction: number;
    style: string | CanvasGradient | CanvasPattern;
};

type AddBeamAction = {
    type: "add_beam";
    p1: number;
    p2: number;
    m: number;
    w: number;
    l?: number;
    deck?: boolean;
};

type AddPinAction = {
    type: "add_pin";
    pin: Point2D;
};

type CompositeAction = {
    type: "composite";
    actions: Array<TrussAction>;
};

type TrussAction = AddBeamAction | AddPinAction | CompositeAction;

type OnAddPinHandler = (editIndex: number, pin: number, ec: ElementContext) => void;
type OnRemovePinHandler = (editIndex: number, pin: number, ec: ElementContext) => void;

export class SceneEditor {
    scene: SceneJSON;
    private player: TrussSimPlayer | undefined;
    private onAddPinHandlers: Array<OnAddPinHandler>;
    private onRemovePinHandlers: Array<OnRemovePinHandler>;
    editMaterial: number;
    editWidth: number;
    editDeck: boolean;

    constructor(scene: SceneJSON) {
        this.scene = scene;
        this.player = undefined;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 1;
        this.editDeck = true;
    }

    getPlayer(): TrussSimPlayer {
        if (this.player === undefined) {
            this.player = new TrussSimPlayer(new TrussSim(this.scene), 0.001, 1);
        }
        return this.player;
    }

    private doAddBeam(a: AddBeamAction, ec: ElementContext) {
        const truss = this.scene.truss;
        const p1 = a.p1;
        const p2 = a.p2;
        const m = a.m;
        const w = a.w;
        const l = a.l;
        const deck = a.deck;
        trussAssertPin(truss, p1);
        trussAssertPin(truss, p2);
        trussAssertMaterial(truss, m);
        if (w <= 0.0) {
            throw new Error(`Beam width must be greater than 0, got ${w}`);
        }
        if (l !== undefined && l <= 0.0) {
            throw new Error(`Beam length must be greater than 0, got ${l}`);
        }
        if (trussBeamExists(truss, p1, p2)) {
            throw new Error(`Beam between pins ${p1} and ${p2} already exists`);
        }
        truss.editBeams.push({p1, p2, m, w, l, deck});
        
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }
    
    private undoAddBeam(a: AddBeamAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const b = truss.editBeams.pop();
        if (b === undefined) {
            throw new Error('No beams exist');
        }
        if (b.p1 !== a.p1 || b.p2 !== a.p2 || b.m !== a.m || b.w != a.w || b.l !== a.l || b.deck !== a.deck) {
            throw new Error('Beam does not match');
        }
        ec.requestDraw();   // TODO: have listeners, and then the UI component can do the requestDraw()
    }

    private doAddPin(a: AddPinAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const editIndex = truss.editPins.length;
        const pin = truss.trainPins.length + editIndex;
        truss.editPins.push(a.pin);
        for (const h of this.onAddPinHandlers) {
            h(editIndex, pin, ec);
        }
    }

    private undoAddPin(a: AddPinAction, ec: ElementContext): void {
        const truss = this.scene.truss;
        const p = truss.editPins.pop();
        if (p === undefined) {
            throw new Error('No pins exist');
        }
        if (p[0] !== a.pin[0] || p[1] !== a.pin[1]) {
            throw new Error('Pin does not match');
        }
        const editIndex = truss.editPins.length;
        const pin = truss.trainPins.length + editIndex;
        for (const h of this.onRemovePinHandlers) {
            h(editIndex, pin, ec);
        }
    }

    private doComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = 0; i < a.actions.length; i++) {
            this.doAction(a.actions[i], ec);
        }
    }

    private undoComposite(a: CompositeAction, ec: ElementContext): void {
        for (let i = a.actions.length - 1; i >= 0; i--) {
            this.undoAction(a.actions[i], ec);
        }
    }

    private doAction(a: TrussAction, ec: ElementContext): void {
        switch (a.type) {
            case "add_beam":
                this.doAddBeam(a, ec);
                break;
            case "add_pin":
                this.doAddPin(a, ec);
                break;
            case "composite":
                this.doComposite(a, ec);
                break;
        }
    }

    private undoAction(a: TrussAction, ec: ElementContext): void {
        switch (a.type) {
            case "add_beam":
                this.undoAddBeam(a, ec);
                break;
            case "add_pin":
                this.undoAddPin(a, ec);
                break;
            case "composite":
                this.undoComposite(a, ec);
                break;
        }
    }

    // Scene enumeration/observation methods

    onAddPin(handler: OnAddPinHandler) {
        this.onAddPinHandlers.push(handler);
    }

    onRemovePin(handler: OnRemovePinHandler) {
        this.onRemovePinHandlers.push(handler);
    }

    // TODO: Clear handlers?

    undoCount(): number {
        return this.scene.undoStack.length;
    }

    redoCount(): number {
        return this.scene.redoStack.length;
    }

    // Scene mutation methods

    undo(ec: ElementContext): void {
        const a = this.scene.undoStack.pop();
        if (a === undefined) {
            throw new Error("no action to undo");
        }
        this.undoAction(a, ec);
        this.scene.redoStack.push(a);
        if (this.player !== undefined) {
            this.player.pause(ec);
            this.player = undefined;
        }
    }

    redo(ec: ElementContext): void {
        const a = this.scene.redoStack.pop();
        if (a === undefined) {
            throw new Error("no action to redo");
        }
        this.doAction(a, ec);
        this.scene.undoStack.push(a);
        if (this.player !== undefined) {
            this.player.pause(ec);
            this.player = undefined;
        }
    }

    private action(a: TrussAction, ec: ElementContext): void {
        this.scene.redoStack = [a];
        this.redo(ec);    // TODO: Is this too clever?
    }

    addBeam(
        p1: number,
        p2: number,
        ec: ElementContext,
    ): void {
        const truss = this.scene.truss;
        trussAssertPin(truss, p1);
        trussAssertPin(truss, p2);
        if (trussBeamExists(truss, p1, p2)) {
            throw new Error(`Beam between pins ${p1} and ${p2} already exists`);
        }
        this.action({
            type: "add_beam",
            p1,
            p2,
            m: this.editMaterial,
            w: this.editWidth,
            l: undefined,
            deck: this.editDeck
        }, ec);
    }

    addPin(pin: Point2D, ec: ElementContext): void {
        this.action({type: "add_pin", pin}, ec);
    }

    addPinAndBeam(
        pin: Point2D,
        p2: number,
        ec: ElementContext,
    ): void {
        const truss = this.scene.truss;
        trussAssertPin(truss, p2);
        const p1 = truss.trainPins.length + truss.editPins.length;
        this.action({type: "composite", actions: [
            { type: "add_pin", pin},
            {
                type: "add_beam",
                p1,
                p2,
                m: this.editMaterial,
                w: this.editWidth,
                l: undefined,
                deck: this.editDeck
            },
        ]}, ec);
    }
};

type CreateBeamPinState = {
    edit: SceneEditor,
    i: number,
    drag?: { p: Point2D, i?: number },
};

function createBeamPinOnDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, state: CreateBeamPinState) {
    const truss = state.edit.scene.truss;
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    
    if (state.drag === undefined) {
        return;
    }
    const p1 = trussGetPin(truss, state.i);
    const p2 = state.drag.i === undefined ? state.drag.p : trussGetPin(truss, state.drag.i);
    const w = state.edit.editWidth;
    const style = truss.materials[state.edit.editMaterial].style;
    const deck = state.edit.editDeck;
    drawBeam(ctx, p1[0], p1[1], p2[0], p2[1], w, style, deck);
}

function createBeamPinOnPan(ps: Array<PanPoint>, ec: ElementContext, state: CreateBeamPinState) {
    const truss = state.edit.scene.truss;
    const maxLength = truss.materials[state.edit.editMaterial].maxLength;
    const p0 = trussGetPin(truss, state.i);
    let p = ps[0].curr;
    const length = pointDistance(p0, p);
    // Cap beam length at maximum length;
    if (length > maxLength) {
        // Barycentric coordinate of maximum length for material on line segment p -> p0.
        const t = maxLength / length;
        p[0] = p[0] * t + p0[0] * (1 - t);
        p[1] = p[1] * t + p0[1] * (1 - t);
    }
    const i = trussGetClosestPin(truss, p, 2, state.i, maxLength);
    state.drag = { p, i };
    ec.requestDraw();
}

function createBeamPinOnPanEnd(ec: ElementContext, state: CreateBeamPinState) {
    const truss = state.edit.scene.truss;
    if (state.drag === undefined) {
        throw new Error("No drag state OnPanEnd");
    }
    if (state.drag.i === undefined) {
        state.edit.addPinAndBeam(state.drag.p, state.i, ec);
    } else if (!trussBeamExists(truss, state.drag.i, state.i)) {
        // TODO: replace existing beam if one exists (and is editable).
        state.edit.addBeam(state.drag.i, state.i, ec);
    }
    state.drag = undefined;
}

function CreateBeamPin(edit: SceneEditor, i: number): PositionLayout<any, any> {
    const truss = edit.scene.truss;
    const p = trussGetPin(truss, i);
    // If we had state that was passed to all handlers, then we could avoid allocating new handlers per Element.
    return Position<CreateBeamPinState>(p[0] - 2, p[1] - 2, 4, 4, { edit, i })
        .onDraw(createBeamPinOnDraw)
        .onPan(createBeamPinOnPan)
        .onPanEnd(createBeamPinOnPanEnd);
}

function AddTrussEditablePins(edit: SceneEditor): LayoutTakesWidthAndHeight {
    const truss = edit.scene.truss;
    const children = [];
    for (let i = trussEditPinsBegin(truss); i !== trussEditPinsEnd(truss); i++) {
        children.push(CreateBeamPin(edit, i));
    }
    const e = Relative(...children);

    edit.onAddPin((editIndex: number, pin: number, ec: ElementContext) => {
        console.log(`adding Element for pin ${pin} at child[${editIndex}]`);
        addChild(e, CreateBeamPin(edit, pin), ec, editIndex);
        ec.requestLayout();
    });
    edit.onRemovePin((editIndex: number, pin: number, ec: ElementContext) => {
        console.log(`removing Element for pin ${pin} at child[${editIndex}]`);
        removeChild(e, editIndex, ec);
        ec.requestLayout();
    });

    // TODO: e.onDetach for removeing pin observers.
    return e;
}

function AddTrussUneditablePins(edit: SceneEditor): LayoutTakesWidthAndHeight {
    const truss = edit.scene.truss;
    const width = edit.scene.width;
    const height = edit.scene.height;
    const children = [];
    for (let i = trussUneditablePinsBegin(truss); i !== trussUneditablePinsEnd(truss); i++) {
        const p = trussGetPin(truss, i);
        if (p[0] > 0 && p[0] < width && p[1] > 0 && p[1] < height) {
            // Beams should only be created from pins strictly inside the scene.
            children.push(CreateBeamPin(edit, i));
        }
    }
    return Relative(...children);
}

function AddTrussLayer(scene: SceneEditor): LayoutTakesWidthAndHeight {
    return Layer(
        AddTrussUneditablePins(scene),
        AddTrussEditablePins(scene),
    );
}

function drawBeam(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, style: string | CanvasGradient | CanvasPattern, deck?: boolean) {
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (deck !== undefined && deck) {
        ctx.strokeStyle = "brown";  // TODO: deck style
        ctx.lineWidth = w * 0.75;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}

function TrussLayer(truss: Truss): LayoutTakesWidthAndHeight {
    return Fill(truss).onDraw((ctx: CanvasRenderingContext2D, _box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, truss: Truss) => {
        for (const b of truss.trainBeams) {
            const p1 = trussGetPin(truss, b.p1);
            const p2 = trussGetPin(truss, b.p2)
            drawBeam(ctx, p1[0], p1[1], p2[0], p2[1], b.w, truss.materials[b.m].style, b.deck);
        }
        for (const b of truss.editBeams) {
            const p1 = trussGetPin(truss, b.p1);
            const p2 = trussGetPin(truss, b.p2)
            drawBeam(ctx, p1[0], p1[1], p2[0], p2[1], b.w, truss.materials[b.m].style, b.deck);
        }
        for (const d of truss.discs) {
            const m = truss.materials[d.m];
            const p = trussGetPin(truss, d.p);
            ctx.fillStyle = m.style;
            ctx.beginPath();
            ctx.ellipse(p[0], p[1], d.r, d.r, 0, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
}

function SimulateLayer(edit: SceneEditor): LayoutTakesWidthAndHeight {
    return Fill(edit).onDraw((ctx: CanvasRenderingContext2D, _box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
        edit.getPlayer().sim.draw(ctx);
    });
}

function drawTerrain(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, vp: LayoutBox, terrain: Terrain) {
    const hmap = terrain.hmap;
    const pitch = box.width / (hmap.length - 1);
    const left = vp.left - box.left;
    const right = left + vp.width;
    const begin = Math.max(Math.min(Math.floor(left / pitch), hmap.length - 1), 0);
    const end = Math.max(Math.min(Math.ceil(right / pitch), hmap.length - 1), 0);
    ctx.fillStyle = terrain.style;
    ctx.beginPath();
    ctx.moveTo(box.left, box.top + box.height);
    for (let i = begin; i <= end; i++) {
        ctx.lineTo(box.left + i * pitch, box.top + hmap[i]);
    }
    ctx.lineTo(box.left + box.width, box.top + box.height);
    ctx.closePath();
    ctx.fill();
}

function drawFill(style: string | CanvasGradient | CanvasPattern) {
    return (ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = style;
        ctx.fillRect(box.left, box.top, box.width, box.height);
    }
}

function undoButtonTap(_p: Point2D, ec: ElementContext, edit: SceneEditor) {
    if (edit.undoCount() > 0) {
        edit.undo(ec);
    }
}

function drawCircleWithArrow(ctx: CanvasRenderingContext2D, box: LayoutBox, ccw: boolean) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;

    const b = ccw ? Math.PI * 0.75 : Math.PI * 0.25;
    const e = ccw ? Math.PI * 1 : Math.PI * 2;
    const l = ccw ? -Math.PI * 0.3 : Math.PI * 0.3;
    const px = r * Math.cos(e);
    const py = r * Math.sin(e)
    const tx = r * Math.cos(e - l) - px;
    const ty = r * Math.sin(e - l) - py;
    const nx = -ty / Math.sqrt(3);
    const ny = tx / Math.sqrt(3);
    
    ctx.lineWidth = box.width * 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, b, e, ccw);
    ctx.moveTo(x + px + tx + nx, y + py + ty + ny);
    ctx.lineTo(x + px, y + py);
    ctx.lineTo(x + px + tx - nx, y + py + ty - ny);
    ctx.stroke();
}

function drawButtonBorder(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
}

function undoButtonDraw(ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) {
    ctx.fillStyle = "white";
    ctx.strokeStyle = edit.undoCount() === 0 ? "gray" : "black";
    drawButtonBorder(ctx, box);
    drawCircleWithArrow(ctx, box, true);
}

function undoButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap(undoButtonTap).onDraw(undoButtonDraw);
}

function redoButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap((_p: Point2D, ec: ElementContext, edit: SceneEditor) => {
        if (edit.redoCount() > 0) {
            edit.redo(ec);
        }
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = edit.redoCount() === 0 ? "gray" : "black";
        drawButtonBorder(ctx, box);
        drawCircleWithArrow(ctx, box, false);
    });
}

function deckButton(edit: SceneEditor) {
    return Flex(64, 0, edit).onTap((_p: Point2D, ec: ElementContext, edit: SceneEditor) => {
        edit.editDeck = !edit.editDeck;
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox, _ec: ElementContext, _vp: LayoutBox, edit: SceneEditor) => {
        ctx.fillStyle = "white";
        drawButtonBorder(ctx, box);
        const x = box.left + box.width * 0.5;
        const y = box.top + box.height * 0.5;
        const r = box.width * 0.333;
        drawBeam(ctx, x - r, y, x +  r, y, 16, "black", edit.editDeck);
    });
}

function drawPlay(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;
    const px = Math.cos(Math.PI * 0.333) * r;
    const py = Math.sin(Math.PI * 0.333) * r;
    ctx.lineWidth = box.width * 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.lineTo(x + r, y);
    ctx.closePath();
    ctx.stroke();
}

function drawPause(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;
    const px = Math.cos(Math.PI * 0.333) * r;
    const py = Math.sin(Math.PI * 0.333) * r;
    ctx.lineWidth = box.width * 0.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x + px, y - py);
    ctx.moveTo(x - px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.stroke();
}

function playButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const player = edit.getPlayer();
        if (player.speed() === 1) {
            player.pause(ec);
        } else {
            player.play(ec, 1);
        }
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        drawButtonBorder(ctx, box);
        if (edit.getPlayer().speed() === 1) {
            drawPause(ctx, box);
        } else {
            drawPlay(ctx, box);
        }
    });
}

function drawSlowMotion(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;
    const px = Math.cos(Math.PI * 0.333) * r;
    const py = Math.sin(Math.PI * 0.333) * r;
    ctx.lineWidth = box.width * 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x - px, y + py);
    ctx.lineTo(x - px, y - py);
    ctx.lineTo(x + r, y);
    ctx.closePath();
    ctx.moveTo(x - px * 1.8, y - py);
    ctx.lineTo(x - px * 1.8, y + py);
    ctx.stroke();
}

function slowmotionButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const player = edit.getPlayer();
        if (player.speed() === 0.1) {
            player.pause(ec);
        } else {
            player.play(ec, 0.1);
        }
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        drawButtonBorder(ctx, box);
        if (edit.getPlayer().speed() === 0.1) {
            drawPause(ctx, box);
        } else {
            drawSlowMotion(ctx, box);
        }
    });
}

function drawReset(ctx: CanvasRenderingContext2D, box: LayoutBox) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;
    const px = Math.cos(Math.PI * 0.333) * r;
    const py = Math.sin(Math.PI * 0.333) * r;
    ctx.lineWidth = box.width * 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x + px, y - py);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.moveTo(x - r, y + py);
    ctx.lineTo(x - r, y - py);
    ctx.stroke();
}

function colorMapButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const sim = edit.getPlayer().sim;
        if (sim.color === undefined) {
            sim.color = viridis;
        } else {
            sim.color = undefined;
        }
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        drawButtonBorder(ctx, box);

        const sim = edit.getPlayer().sim;
        if (sim.color === undefined) {
            ctx.strokeStyle = linearGradient(ctx, viridis, 10,
                box.left + box.width * 0.2,
                box.top + box.width * 0.2,
                box.left + box.width * 0.8,
                box.top + box.height * 0.8);
        } else {
            ctx.strokeStyle = "black";
        }
        ctx.lineWidth = box.width * 0.1;
        ctx.beginPath();
        ctx.moveTo(box.left + box.width * 0.2, box.top + box.width * 0.2);
        ctx.lineTo(box.left + box.width * 0.8, box.top + box.height * 0.8);
        ctx.stroke();
    });
}

function resetButton(edit: SceneEditor) {
    return Flex(64, 0).onTap((_p: Point2D, ec: ElementContext) => {
        const player = edit.getPlayer();
        if (player.speed() !== 0) {
            player.pause(ec);
        }
        player.seek(0, ec);
        ec.requestDraw();
    }).onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        drawButtonBorder(ctx, box);
        drawReset(ctx, box);
    });
}

function tabFiller() {
    return Flex(0, 1).touchSink().onDraw((ctx: CanvasRenderingContext2D, box: LayoutBox) => {
        ctx.fillStyle = "gray";
        ctx.fillRect(box.left, box.top, box.width, box.height);
    });
}

export function SceneElement(sceneJSON: SceneJSON): LayoutTakesWidthAndHeight {
    const edit = new SceneEditor(sceneJSON);

    const sceneUI = Mux(
        ["terrain", "truss", "add_truss"],
        ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)],
        ["truss", TrussLayer(sceneJSON.truss)],
        ["add_truss", AddTrussLayer(edit)],
        ["simulate", SimulateLayer(edit)],
    );

    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");

    const tools = Switch(
        1,
        Left(undoButton(edit), redoButton(edit), tabFiller()),
        Left(deckButton(edit), tabFiller()),
        Left(colorMapButton(edit), resetButton(edit), slowmotionButton(edit), playButton(edit), tabFiller()),
    );

    return Layer(
        Scroll(
            Box(
                sceneJSON.width, sceneJSON.height,
                sceneUI,
            ),
            undefined,
            1,
        ),
        Bottom(
            Flex(64, 0,
                tools,  
            ),
            Flex(64, 0,
                Left(
                    Flex(64, 0).onDraw(drawR).onTap((_p: Point2D, ec: ElementContext) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.getPlayer().pause(ec) }),
                    Flex(64, 0).onDraw(drawG).onTap((_p: Point2D, ec: ElementContext) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.getPlayer().pause(ec); }),
                    Flex(64, 0).onDraw(drawB).onTap((_p: Point2D, ec: ElementContext) => {
                        tools.set(2, ec);
                        sceneUI.set(ec, "terrain", "simulate");
                    }),
                ),
            ),
        ),
    );

    // TODO: fix materials

    // TODO: grid. just more objects in scene? (so undo works) Probably need to make a dynamic child ui node thing.

    // TODO: train gets heavier and resets after it crosses the bridge. Have a score (partial points for the train making it across broken)

    // TODO: fix train simulation (make sure train can break apart, make only front disk turn, back disks have low friction?)
    // TODO: mode where if the whole train makes it across, the train teleports back to the beginning and gets heavier

    // TODO: material selection. (might need text layout, which is a whole can of worms...)

    // TODO: save/load
    // Have list of levels in some JSON resource file.
    // Have option to load json file from local.
    // auto-save every n seconds after change, key in local storage is uri of level json.
    // when loading, check local storage and load that instead if it exists (and the non editable parts match?)
}
