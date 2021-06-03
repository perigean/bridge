// Copyright Charles Dueck 2020
import { pointDistance } from "./point.js";
//import { ODEMethod } from "./ode.js";
//import { Euler } from "./euler.js";
//import { RungeKutta4 } from "./rk4.js";
import { addChild, Bottom, Box, Fill, Flex, Layer, Left, Mux, Position, Relative, removeChild, Scroll, Switch } from "./ui/node.js";
function trussAssertMaterial(truss, m) {
    const materials = truss.materials;
    if (m < 0 || m >= materials.length) {
        throw new Error(`Unknown material index ${m}`);
    }
}
function trussAssertPin(truss, pin) {
    if (pin < -truss.fixedPins.length || pin >= truss.startPins.length + truss.editPins.length) {
        throw new Error(`Unknown pin index ${pin}`);
    }
}
function trussBeamExists(truss, p1, p2) {
    for (const beam of truss.editBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            return true;
        }
    }
    for (const beam of truss.startBeams) {
        if ((p1 === beam.p1 && p2 === beam.p2) || (p1 === beam.p2 && p2 === beam.p1)) {
            return true;
        }
    }
    return false;
}
function trussEditPinsBegin(truss) {
    return truss.startPins.length;
}
function trussEditPinsEnd(truss) {
    return truss.startPins.length + truss.editPins.length;
}
function trussUneditablePinsBegin(truss) {
    return -truss.fixedPins.length;
}
function trussUneditablePinsEnd(truss) {
    return truss.startPins.length;
}
function trussGetClosestPin(truss, p, maxd, beamStart) {
    // TODO: acceleration structures. Probably only matters once we have 1000s of pins?
    const block = new Set();
    let res = undefined;
    let resd = maxd;
    if (beamStart !== undefined) {
        for (const b of truss.startBeams) {
            if (b.p1 === beamStart) {
                block.add(b.p2);
            }
            else if (b.p2 === beamStart) {
                block.add(b.p1);
            }
        }
        for (const b of truss.editBeams) {
            if (b.p1 === beamStart) {
                block.add(b.p2);
            }
            else if (b.p2 === beamStart) {
                block.add(b.p1);
            }
        }
    }
    for (let i = 0; i < truss.fixedPins.length; i++) {
        const d = pointDistance(p, truss.fixedPins[i]);
        if (d < resd) {
            res = i - truss.fixedPins.length;
            resd = d;
        }
    }
    for (let i = 0; i < truss.startPins.length; i++) {
        const d = pointDistance(p, truss.startPins[i]);
        if (d < resd) {
            res = i;
            resd = d;
        }
    }
    for (let i = 0; i < truss.editPins.length; i++) {
        const d = pointDistance(p, truss.editPins[i]);
        if (d < resd) {
            res = i + truss.startPins.length;
            resd = d;
        }
    }
    return res;
}
function trussGetPin(truss, pin) {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    }
    else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    }
    else if (pin < truss.startPins.length) {
        return truss.startPins[pin];
    }
    else if (pin - truss.startPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.startPins.length];
    }
    else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}
export class SceneEditor {
    constructor(scene) {
        this.scene = scene;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 4;
        this.editDeck = false;
    }
    doAddBeam(a, ec) {
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
        truss.editBeams.push({ p1, p2, m, w, l, deck });
        ec.requestDraw(); // TODO: have listeners, and then the UI component can do the requestDraw()
    }
    undoAddBeam(a, ec) {
        const truss = this.scene.truss;
        const b = truss.editBeams.pop();
        if (b === undefined) {
            throw new Error('No beams exist');
        }
        if (b.p1 !== a.p1 || b.p2 !== a.p2 || b.m !== a.m || b.w != a.w || b.l !== a.l || b.deck !== a.deck) {
            throw new Error('Beam does not match');
        }
        ec.requestDraw(); // TODO: have listeners, and then the UI component can do the requestDraw()
    }
    doAddPin(a, ec) {
        const truss = this.scene.truss;
        const editIndex = truss.editPins.length;
        const pin = truss.startPins.length + editIndex;
        truss.editPins.push(a.pin);
        for (const h of this.onAddPinHandlers) {
            h(editIndex, pin, ec);
        }
    }
    undoAddPin(a, ec) {
        const truss = this.scene.truss;
        const p = truss.editPins.pop();
        if (p === undefined) {
            throw new Error('No pins exist');
        }
        if (p[0] !== a.pin[0] || p[1] !== a.pin[1]) {
            throw new Error('Pin does not match');
        }
        const editIndex = truss.editPins.length;
        const pin = truss.startPins.length + editIndex;
        for (const h of this.onRemovePinHandlers) {
            h(editIndex, pin, ec);
        }
    }
    doComposite(a, ec) {
        for (let i = 0; i < a.actions.length; i++) {
            this.doAction(a.actions[i], ec);
        }
    }
    undoComposite(a, ec) {
        for (let i = a.actions.length - 1; i >= 0; i--) {
            this.undoAction(a.actions[i], ec);
        }
    }
    doAction(a, ec) {
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
    undoAction(a, ec) {
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
    onAddPin(handler) {
        this.onAddPinHandlers.push(handler);
    }
    onRemovePin(handler) {
        this.onRemovePinHandlers.push(handler);
    }
    // TODO: Clear handlers?
    undoCount() {
        return this.scene.undoStack.length;
    }
    redoCount() {
        return this.scene.redoStack.length;
    }
    // Scene mutation methods
    undo(ec) {
        const a = this.scene.undoStack.pop();
        if (a === undefined) {
            throw new Error("no action to undo");
        }
        this.undoAction(a, ec);
        this.scene.redoStack.push(a);
    }
    redo(ec) {
        const a = this.scene.redoStack.pop();
        if (a === undefined) {
            throw new Error("no action to redo");
        }
        this.doAction(a, ec);
        this.scene.undoStack.push(a);
    }
    action(a, ec) {
        this.scene.redoStack = [a];
        this.redo(ec); // TODO: Is this too clever?
    }
    addBeam(p1, p2, ec) {
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
    addPin(pin, ec) {
        this.action({ type: "add_pin", pin }, ec);
    }
    addPinAndBeam(pin, p2, ec) {
        const truss = this.scene.truss;
        trussAssertPin(truss, p2);
        const p1 = this.scene.truss.editPins.length;
        this.action({ type: "composite", actions: [
                { type: "add_pin", pin },
                {
                    type: "add_beam",
                    p1,
                    p2,
                    m: this.editMaterial,
                    w: this.editWidth,
                    l: undefined,
                    deck: this.editDeck
                },
            ] }, ec);
    }
}
;
function createBeamPinOnDraw(ctx, box, _ec, _vp, state) {
    const truss = state.edit.scene.truss;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
    if (state.drag === undefined) {
        return;
    }
    const pin = trussGetPin(truss, state.i);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pin[0], pin[1]);
    if (state.drag.i !== undefined) {
        const p = trussGetPin(truss, state.drag.i);
        ctx.lineTo(p[0], p[1]);
    }
    else {
        ctx.lineTo(state.drag.p[0], state.drag.p[1]);
    }
    ctx.stroke();
}
function createBeamPinOnPan(ps, ec, state) {
    const truss = state.edit.scene.truss;
    const i = trussGetClosestPin(truss, ps[0].curr, 16, state.i);
    state.drag = {
        p: ps[0].curr,
        i,
    };
    ec.requestDraw();
}
function createBeamPinOnPanEnd(ec, state) {
    const truss = state.edit.scene.truss;
    if (state.drag === undefined) {
        throw new Error("No drag state OnPanEnd");
    }
    if (state.drag.i === undefined) {
        state.edit.addPinAndBeam(state.drag.p, state.i, ec);
    }
    else if (!trussBeamExists(truss, state.drag.i, state.i)) {
        // TODO: replace existing beam if one exists (and is editable).
        state.edit.addBeam(state.drag.i, state.i, ec);
    }
    state.drag = undefined;
}
function CreateBeamPin(edit, i) {
    const truss = edit.scene.truss;
    const p = trussGetPin(truss, i);
    // If we had state that was passed to all handlers, then we could avoid allocating new handlers per Element.
    return Position(p[0] - 8, p[1] - 8, 16, 16, { edit, i })
        .onDraw(createBeamPinOnDraw)
        .onPan(createBeamPinOnPan)
        .onPanEnd(createBeamPinOnPanEnd);
}
function AddTrussEditablePins(edit) {
    const truss = edit.scene.truss;
    const children = [];
    for (let i = trussEditPinsBegin(truss); i !== trussEditPinsEnd(truss); i++) {
        children.push(CreateBeamPin(edit, i));
    }
    const e = Relative(...children);
    edit.onAddPin((editIndex, pin, ec) => {
        console.log(`adding Element for pin ${pin} at child[${editIndex}]`);
        addChild(e, CreateBeamPin(edit, pin), ec, editIndex);
        ec.requestLayout();
    });
    edit.onRemovePin((editIndex, pin, ec) => {
        console.log(`removing Element for pin ${pin} at child[${editIndex}]`);
        removeChild(e, editIndex, ec);
        ec.requestLayout();
    });
    // TODO: e.onDetach for removeing pin observers.
    return e;
}
function AddTrussUneditablePins(edit) {
    const truss = edit.scene.truss;
    const children = [];
    for (let i = trussUneditablePinsBegin(truss); i !== trussUneditablePinsEnd(truss); i++) {
        children.push(CreateBeamPin(edit, i));
    }
    return Relative(...children);
}
function AddTrussLayer(scene) {
    return Layer(AddTrussUneditablePins(scene), AddTrussEditablePins(scene));
}
function drawBeam(ctx, p1, p2, w, style) {
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
}
function trussLayerOnDraw(ctx, _box, _ec, _vp, truss) {
    for (const b of truss.startBeams) {
        drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style);
    }
    for (const b of truss.editBeams) {
        drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style);
    }
}
function TrussLayer(truss) {
    return Fill(truss).onDraw(trussLayerOnDraw);
}
// TODO: Take Scene as state instead of SceneJSON?
function drawTerrain(ctx, box, _ec, vp, terrain) {
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
function drawFill(style) {
    return (ctx, box) => {
        ctx.fillStyle = style;
        ctx.fillRect(box.left, box.top, box.width, box.height);
    };
}
function undoButtonTap(_p, ec, edit) {
    if (edit.undoCount() > 0) {
        edit.undo(ec);
    }
}
function drawCircleWithArrow(ctx, x, y, r, ccw) {
    ctx.beginPath();
    const a = ccw ? Math.PI : 0;
    const l = ccw ? -Math.PI * 0.4 : Math.PI * 0.4;
    const px = r * Math.cos(a);
    const py = r * Math.sin(a);
    const tx = r * Math.cos(a - l) - px;
    const ty = r * Math.sin(a - l) - py;
    const nx = -ty / Math.sqrt(3);
    const ny = tx / Math.sqrt(3);
    const b = ccw ? Math.PI * 1.25 : Math.PI * 0.25;
    const e = ccw ? Math.PI * 2.75 : Math.PI * 1.75;
    ctx.ellipse(x, y, r, r, 0, b, e);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + px, y + py);
    ctx.lineTo(x + px + tx + nx, y + py + ty + ny);
    ctx.lineTo(x + px + tx - nx, y + py + ty - ny);
    ctx.fill();
}
function undoButtonDraw(ctx, box, _ec, _vp, edit) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);
    const iconStyle = edit.undoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(ctx, box.left + box.width * 0.5, box.top + box.height * 0.5, 22, true);
}
function undoButton(edit) {
    return Flex(64, 0, edit).onTap(undoButtonTap).onDraw(undoButtonDraw);
}
function redoButtonTap(_p, ec, edit) {
    if (edit.redoCount() > 0) {
        edit.redo(ec);
    }
}
function redoButtonDraw(ctx, box, _ec, _vp, edit) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);
    const iconStyle = edit.redoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(ctx, box.left + box.width * 0.5, box.top + box.height * 0.5, 22, false);
}
function redoButton(edit) {
    return Flex(64, 0, edit).onTap(redoButtonTap).onDraw(redoButtonDraw);
}
/*
export function TabSelect(size: number, grow: number, child?: WPHPLayout<any, any>): FlexLayout<TabState, any> {
    return Flex(size, grow, );
}

type TabState = { active: boolean, i: number, selected: { i: number } };

export function TabStrip(selectHeight: number, contentHeight: number, ...tabs: Array<[FlexLayout<TabState, any>, WPHPLayout<any, any>]>): WPHPLayout<any, any> {
    const select = new Array<FlexLayout<TabState, any>>(tabs.length);
    const content = new Array<[number, WPHPLayout<any, any>]>(tabs.length);
    const selected = { i: 0 };
    for (let i = 0; i < tabs.length; i++) {
        select[i] = tabs[i][0];
        content[i] = [i, tabs[i][1]];
    }
    const mux = Switch(tabs[0][0], ...content);
    for (let i = 0; i < tabs.length; i++) {
        select[i].onTap((_p: Point2D, ec: ElementContext, state: TabState) => {

            state.active = true;
            mux.set(ec, tabs[i][0]);
        });
    }
    return Bottom(
        Flex(contentHeight, 0, Left(...select)),
        Flex(selectHeight, 0, mux),
    );
}
*/
export function SceneElement(sceneJSON) {
    const edit = new SceneEditor(sceneJSON);
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)], ["truss", TrussLayer(sceneJSON.truss)], ["add_truss", AddTrussLayer(edit)]);
    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");
    const tools = Switch(1, Left(undoButton(edit), redoButton(edit)), Fill().onDraw(drawG), Fill().onDraw(drawB));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 2), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => { tools.set(2, ec); sceneUI.set(ec, "terrain", "truss"); })))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsdUNBQXVDO0FBQ3ZDLHFDQUFxQztBQUNyQyx5Q0FBeUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFrQixJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBd0MsSUFBSSxFQUFFLEdBQUcsRUFBWSxRQUFRLEVBQWtCLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLGNBQWMsQ0FBQztBQStDcE4sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJLENB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LE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdFLEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUM5QixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDaEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNDLEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDL0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN2RDtJQUNELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZELEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxRQUFRLENBQUMsS0FBOEM7SUFDNUQsT0FBTyxDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEVBQUU7UUFDckQsR0FBRyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdEIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFBO0FBQ0wsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEVBQVcsRUFBRSxFQUFrQixFQUFFLElBQWlCO0lBQ3JFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRTtRQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2pCO0FBQ0wsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBNkIsRUFBRSxDQUFTLEVBQUUsQ0FBUyxFQUFFLENBQVMsRUFBRSxHQUFZO0lBQ3JHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQy9DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBRWIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDM0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDL0MsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDL0MsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEdBQW1CLEVBQUUsR0FBYyxFQUFFLElBQWlCO0lBQ3pILEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDO0lBQ3hCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMs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LENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUM3SSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFXLEVBQUUsRUFBa0IsRUFBRSxFQUFFLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDbkksQ0FDSixDQUNKLENBQ0osQ0FBQztBQUNOLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuLy9pbXBvcnQgeyBPREVNZXRob2QgfSBmcm9tIFwiLi9vZGUuanNcIjtcbi8vaW1wb3J0IHsgRXVsZXIgfSBmcm9tIFwiLi9ldWxlci5qc1wiO1xuLy9pbXBvcnQgeyBSdW5nZUt1dHRhNCB9IGZyb20gXCIuL3JrNC5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiO1xuXG5leHBvcnQgdHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBiZWdpbm5pbmcgb2YgYmVhbS5cbiAgICBwMjogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgZW5kIG9mIGJlYW0uXG4gICAgbTogbnVtYmVyOyAgLy8gSW5kZXggb2YgbWF0ZXJpYWwgb2YgYmVhbS5cbiAgICB3OiBudW1iZXI7ICAvLyBXaWR0aCBvZiBiZWFtLlxuICAgIGw/OiBudW1iZXI7IC8vIExlbmd0aCBvZiBiZWFtLCBvbmx5IHNwZWNpZmllZCB3aGVuIHByZS1zdHJhaW5pbmcuXG4gICAgZGVjaz86IGJvb2xlYW47IC8vIElzIHRoaXMgYmVhbSBhIGRlY2s/IChkbyBkaXNjcyBjb2xsaWRlKVxufTtcblxuLypcbnR5cGUgU2ltdWxhdGlvbkJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbDogbnVtYmVyO1xuICAgIGRlY2s6IGJvb2xlYW47XG59XG4qL1xuXG5leHBvcnQgdHlwZSBEaXNjID0ge1xuICAgIHA6IG51bWJlcjsgIC8vIEluZGV4IG9mIG1vdmVhYmxlIHBpbiB0aGlzIGRpc2Mgc3Vycm91bmRzLlxuICAgIG06IG51bWJlcjsgIC8vIE1hdGVyaWFsIG9mIGRpc2MuXG4gICAgcjogbnVtYmVyOyAgLy8gUmFkaXVzIG9mIGRpc2MuXG4gICAgdjogbnVtYmVyOyAgLy8gVmVsb2NpdHkgb2Ygc3VyZmFjZSBvZiBkaXNjIChpbiBDQ1cgZGlyZWN0aW9uKS5cbn07XG5cbmV4cG9ydCB0eXBlIE1hdGVyaWFsID0ge1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGtnL21eM1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICAvLyBUT0RPOiB3aGVuIHN0dWZmIGJyZWFrcywgd29yayBoYXJkZW5pbmcsIGV0Yy5cbn07XG5cbmV4cG9ydCB0eXBlIFRydXNzID0ge1xuICAgIGZpeGVkUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBlZGl0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZWRpdEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD47XG59O1xuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzOiBUcnVzcywgbTogbnVtYmVyKSB7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGlmIChtIDwgMCB8fCBtID49IG1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGggfHwgcGluID49IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQmVhbUV4aXN0cyh0cnVzczogVHJ1c3MsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIC10cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzczogVHJ1c3MsIHA6IFBvaW50MkQsIG1heGQ6IG51bWJlciwgYmVhbVN0YXJ0PzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICAvLyBUT0RPOiBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gUHJvYmFibHkgb25seSBtYXR0ZXJzIG9uY2Ugd2UgaGF2ZSAxMDAwcyBvZiBwaW5zP1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgbGV0IHJlcyA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcmVzZCA9IG1heGQ7XG4gICAgaWYgKGJlYW1TdGFydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmZpeGVkUGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSAtIHRydXNzLmZpeGVkUGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5zdGFydFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGk7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmVkaXRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpICsgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpOiBQb2ludDJEIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH0gZWxzZSBpZiAocGluIDwgMCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZml4ZWRQaW5zW3RydXNzLmZpeGVkUGlucy5sZW5ndGggKyBwaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zW3Bpbl07XG4gICAgfSBlbHNlIGlmIChwaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoIDwgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5lZGl0UGluc1twaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua293biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBUZXJyYWluID0ge1xuICAgIGhtYXA6IEFycmF5PG51bWJlcj47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xufTtcbi8qXG50eXBlIFNpbXVsYXRpb25ITWFwID0gQXJyYXk8e1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIG54OiBudW1iZXI7IC8vIE5vcm1hbCB1bml0IHZlY3Rvci5cbiAgICBueTogbnVtYmVyO1xuICAgIGRlY2tzOiBBcnJheTxTaW11bGF0aW9uQmVhbT47ICAgLy8gVXBkYXRlZCBldmVyeSBmcmFtZSwgYWxsIGRlY2tzIGFib3ZlIHRoaXMgc2VnbWVudC5cbiAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG59PjtcbiovXG5cbnR5cGUgQWRkQmVhbUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9iZWFtXCI7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbD86IG51bWJlcjtcbiAgICBkZWNrPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgQWRkUGluQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX3BpblwiO1xuICAgIHBpbjogUG9pbnQyRDtcbn07XG5cbnR5cGUgQ29tcG9zaXRlQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiY29tcG9zaXRlXCI7XG4gICAgYWN0aW9uczogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufTtcblxudHlwZSBUcnVzc0FjdGlvbiA9IEFkZEJlYW1BY3Rpb24gfCBBZGRQaW5BY3Rpb24gfCBDb21wb3NpdGVBY3Rpb247XG5cblxuZXhwb3J0IHR5cGUgU2NlbmVKU09OID0ge1xuICAgIHRydXNzOiBUcnVzcztcbiAgICB0ZXJyYWluOiBUZXJyYWluO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgZzogUG9pbnQyRDsgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICByZWRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbiAgICB1bmRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbn1cblxudHlwZSBPbkFkZFBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIE9uUmVtb3ZlUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcblxuXG5leHBvcnQgY2xhc3MgU2NlbmVFZGl0b3Ige1xuICAgIHNjZW5lOiBTY2VuZUpTT047XG4gICAgcHJpdmF0ZSBvbkFkZFBpbkhhbmRsZXJzOiBBcnJheTxPbkFkZFBpbkhhbmRsZXI+O1xuICAgIHByaXZhdGUgb25SZW1vdmVQaW5IYW5kbGVyczogQXJyYXk8T25SZW1vdmVQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIGVkaXRNYXRlcmlhbDogbnVtYmVyO1xuICAgIHByaXZhdGUgZWRpdFdpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBlZGl0RGVjazogYm9vbGVhbjtcblxuICAgIHByaXZhdGUgZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAxID0gYS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBhLnAyO1xuICAgICAgICBjb25zdCBtID0gYS5tO1xuICAgICAgICBjb25zdCB3ID0gYS53O1xuICAgICAgICBjb25zdCBsID0gYS5sO1xuICAgICAgICBjb25zdCBkZWNrID0gYS5kZWNrO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzLCBtKTtcbiAgICAgICAgaWYgKHcgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gd2lkdGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7d31gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobCAhPT0gdW5kZWZpbmVkICYmIGwgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gbGVuZ3RoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke2x9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0cnVzcy5lZGl0QmVhbXMucHVzaCh7cDEsIHAyLCBtLCB3LCBsLCBkZWNrfSk7XG4gICAgICAgIFxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIHVuZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGIgPSB0cnVzcy5lZGl0QmVhbXMucG9wKCk7XG4gICAgICAgIGlmIChiID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gYmVhbXMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYi5wMSAhPT0gYS5wMSB8fCBiLnAyICE9PSBhLnAyIHx8IGIubSAhPT0gYS5tIHx8IGIudyAhPSBhLncgfHwgYi5sICE9PSBhLmwgfHwgYi5kZWNrICE9PSBhLmRlY2spIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQmVhbSBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgdHJ1c3MuZWRpdFBpbnMucHVzaChhLnBpbik7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uQWRkUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzcy5lZGl0UGlucy5wb3AoKTtcbiAgICAgICAgaWYgKHAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwaW5zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBbMF0gIT09IGEucGluWzBdIHx8IHBbMV0gIT09IGEucGluWzFdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbiBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEuYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gYS5hY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04pIHtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLm9uQWRkUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIC8vIFRPRE86IHByb3BlciBpbml0aWFsaXphdGlvbjtcbiAgICAgICAgdGhpcy5lZGl0TWF0ZXJpYWwgPSAwO1xuICAgICAgICB0aGlzLmVkaXRXaWR0aCA9IDQ7XG4gICAgICAgIHRoaXMuZWRpdERlY2sgPSBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBTY2VuZSBlbnVtZXJhdGlvbi9vYnNlcnZhdGlvbiBtZXRob2RzXG5cbiAgICBvbkFkZFBpbihoYW5kbGVyOiBPbkFkZFBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgb25SZW1vdmVQaW4oaGFuZGxlcjogT25SZW1vdmVQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IENsZWFyIGhhbmRsZXJzP1xuXG4gICAgdW5kb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnVuZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgcmVkb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnJlZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgbXV0YXRpb24gbWV0aG9kc1xuXG4gICAgdW5kbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUudW5kb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gdW5kb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjay5wdXNoKGEpO1xuICAgIH1cblxuICAgIHJlZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnJlZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHJlZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUudW5kb1N0YWNrLnB1c2goYSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjayA9IFthXTtcbiAgICAgICAgdGhpcy5yZWRvKGVjKTsgICAgLy8gVE9ETzogSXMgdGhpcyB0b28gY2xldmVyP1xuICAgIH1cblxuICAgIGFkZEJlYW0oXG4gICAgICAgIHAxOiBudW1iZXIsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9uKHtcbiAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICB9LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluKHBpbjogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImFkZF9waW5cIiwgcGlufSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbkFuZEJlYW0oXG4gICAgICAgIHBpbjogUG9pbnQyRCxcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGNvbnN0IHAxID0gdGhpcy5zY2VuZS50cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImNvbXBvc2l0ZVwiLCBhY3Rpb25zOiBbXG4gICAgICAgICAgICB7IHR5cGU6IFwiYWRkX3BpblwiLCBwaW59LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgICAgICBwMSxcbiAgICAgICAgICAgICAgICBwMixcbiAgICAgICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICAgICAgfSxcbiAgICAgICAgXX0sIGVjKTtcbiAgICB9XG59O1xuXG4vKlxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lTWV0aG9kKHNjZW5lOiBTY2VuZSk6IE9ERU1ldGhvZCB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBcbiAgICBjb25zdCBmaXhlZFBpbnMgPSB0cnVzcy5maXhlZFBpbnM7XG4gICAgY29uc3QgbW9iaWxlUGlucyA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgLy8gU3RhdGUgYWNjZXNzb3JzXG4gICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVsxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFNwbGl0IGJlYW0gbWFzcyBldmVubHkgYmV0d2VlbiBwaW5zLCBpbml0aWFsaXNlIGJlYW0gbGVuZ3RoLlxuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zKTtcbiAgICBmdW5jdGlvbiBnZXRtKHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXNzW3Bpbl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gNS45NzJlMjQ7ICAgIC8vIE1hc3Mgb2YgdGhlIEVhcnRoLlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmVhbXMgPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoKGJlYW06IEJlYW0pOiBTaW11bGF0aW9uQmVhbSA9PiB7XG4gICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICBjb25zdCBsID0gcG9pbnREaXN0YW5jZShzY2VuZS5nZXRQaW4ocDEpLCBzY2VuZS5nZXRQaW4ocDIpKTtcbiAgICAgICAgY29uc3QgbSA9IGwgKiBiZWFtLncgKiBtYXRlcmlhbHNbYmVhbS5tXS5kZW5zaXR5O1xuICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AxXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDJdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcDEsIHAyLCBtOiBiZWFtLm0sIHc6IGJlYW0udywgbDogYmVhbS5sIHx8IGwsIGRlY2s6IGJlYW0uZGVjayB8fCBmYWxzZSB9O1xuICAgIH0pO1xuXG4gICAgLy8gRGlzYyBtYXNzLlxuICAgIGNvbnN0IGRpc2NzID0gc2NlbmUudHJ1c3MuZGlzY3M7XG4gICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgIGlmIChkaXNjLnAgPj0gbW9iaWxlUGlucykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlzYyBhdHRhY2hlZCB0byBub24gbW9iaWxlIHBpblwiKTtcbiAgICAgICAgfVxuICAgICAgICBtYXNzW2Rpc2MucF0gKz0gZGlzYy5yICogZGlzYy5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkaXNjLm1dLmRlbnNpdHk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBpZiAobWFzc1tpXSA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9iaWxlIHBpbiAke2l9IGhhcyBtYXNzICR7bWFzc1tpXX0gPD0gMC4wYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgbnk6IDEuMCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgIG54OiAtZHkgLyBsLFxuICAgICAgICAgICAgbnk6IHBpdGNoIC8gbCxcbiAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiByZXNldERlY2tzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgaC5kZWNrQ291bnQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICBoLmRlY2tzW2guZGVja0NvdW50XSA9IGQ7XG4gICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgfVxuICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG5cbiAgICAvLyBTZXQgdXAgaW5pdGlhbCBPREUgc3RhdGUgdmVjdG9yLlxuICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IGdldFBpbih0cnVzcywgaSk7XG4gICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgIH1cbiAgICAvLyBOQjogSW5pdGlhbCB2ZWxvY2l0aWVzIGFyZSBhbGwgMCwgbm8gbmVlZCB0byBpbml0aWFsaXplLlxuXG4gICAgY29uc3QgZyA9ICBzY2VuZS5nO1xuICAgIHJldHVybiBuZXcgUnVuZ2VLdXR0YTQoeTAsIGZ1bmN0aW9uIChfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgIHJlc2V0RGVja3MoKTtcblxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGJlYW0gc3RyZXNzLlxuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgY29uc3QgdyA9IGJlYW0udztcbiAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIHAyKSAtIGdldGR5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJhaW4gPSAobCAtIGwwKSAvIGwwO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJlc3MgPSBzdHJhaW4gKiBFICogdztcbiAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShwMSk7ICAgIC8vIFBpbiBtYXNzXG4gICAgICAgICAgICBjb25zdCBtMiA9IGdldG0ocDIpO1xuICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGIC8gbTIpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIHNwcmluZ0YgLyBtMik7XG5cbiAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICBjb25zdCB6ZXRhID0gMC41O1xuICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBwMikgLSBnZXR2eCh5LCBwMSk7IC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxLlxuICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCB2ID0gdnggKiB1eCArIHZ5ICogdXk7ICAgIC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxIGluIGRpcmVjdGlvbiBvZiBiZWFtLlxuICAgICAgICAgICAgLy8gVE9ETzogbm93IHRoYXQgZ2V0bSByZXR1cm5zIG1hc3Mgb2YgRWFydGggZm9yIGZpeGVkIHBpbnMsIHdlIGRvbid0IG5lZWQgdGhlc2UgZGlmZmVyZW50IGlmIGNsYXVzZXMuXG4gICAgICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zICYmIHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb24sIHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICBsZXQgYXQgPSAxMDAwLjA7IC8vIEFjY2VsZXJhdGlvbiBwZXIgbWV0cmUgb2YgZGVwdGggdW5kZXIgdGVycmFpbi5cbiAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbC5cbiAgICAgICAgICAgIGxldCBueTtcbiAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgIG55ID0gMS4wO1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSAwLjApICsgbnkgKiAoZHkgLSBobWFwWzBdLmhlaWdodCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXQgPiAwLjApIHtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCBueCAqIGF0KTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCBueSAqIGF0KTtcbiAgICAgICAgICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIC8vIENhcCBhY2NlbGVyYXRpb24gYnkgc29tZSBmcmFjdGlvbiBvZiB2ZWxvY2l0eVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRha2UgZnJpY3Rpb24gZnJvbSBiZWFtcyB0b28gKGp1c3QgYXZlcmFnZSBiZWFtcyBnb2luZyBpbnRvIHBpbj8pXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IGdldHZ4KHksIGkpICogdHggKyBnZXR2eSh5LCBpKSAqIHR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgdHggKiBhZik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgdHkgKiBhZik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBkaXNjLWRlY2sgY29sbGlzaW9uLlxuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBkaXNjLnI7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGRpc2MucCk7XG4gICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGhtYXAgYnVja2V0cyB0aGF0IGRpc2Mgb3ZlcmxhcHMuXG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGRlY2tzIGluIHRob3NlIGJ1Y2tldHMuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tDb3VudCA9IGhtYXBbaV0uZGVja0NvdW50O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgxID0gZ2V0ZHgoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0ZHkoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgyID0gZ2V0ZHgoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkyID0gZ2V0ZHkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeCA9IHgyIC0geDE7IC8vIFZlY3RvciB0byBlbmQgb2YgZGVjayAoZnJvbSBzdGFydClcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeSA9IGR5IC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gY3ggKiBjeCArIGN5ICogY3kgLSByICogcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gTm8gUmVhbCBzb2x1dGlvbnMgdG8gaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MSA9ICgtYiAtIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gSW50ZXJzZWN0aW9ucyBhcmUgYm90aCBiZWZvcmUgb3IgYWZ0ZXIgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0MSA9IE1hdGgubWF4KHQxLCAwLjApO1xuICAgICAgICAgICAgICAgICAgICB0MiA9IE1hdGgubWluKHQyLCAxLjApO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHNvIHRoYXQgYXMgYSBkaXNjIG1vdmVzIGJldHdlZW4gdHdvIGRlY2sgc2VnbWVudHMsIHRoZSBhY2NlbGVyYXRpb24gcmVtYWlucyBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ4ID0gKDEgLSB0MikgKiB4MSArIHQyICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQyIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZWEgPSAwLjUgKiByICogciAqIHRhIC0gMC41ICogTWF0aC5hYnModDF4ICogdDJ5IC0gdDF5ICogdDJ4KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW4gPSAxMDAwLjAgKiBhcmVhOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgd2hhdCBhY2NlbGVyYXRpb24gdG8gdXNlXG4gICAgICAgICAgICAgICAgICAgIGxldCBueCA9IGN4IC0gc3ggKiB0O1xuICAgICAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgICAgIG54IC89IGw7XG4gICAgICAgICAgICAgICAgICAgIG55IC89IGw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9ucyB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWQgPSBnZXRtKGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShkZWNrLnAxKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKGRlY2sucDIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWQgPSAobTEgKyBtMikgLyAobWQgKyBtMSArIG0yKTsgIC8vIFNoYXJlIG9mIGFjY2VsZXJhdGlvbiBmb3IgZGlzYywgZGVjayBlbmRwb2ludHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGExID0gKG1kICsgbTIpIC8gKG1kICsgbTEgKyBtMikgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEyID0gKG1kICsgbTEpIC8gKG1kICsgbTEgKyBtMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIG54ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgbnkgKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtbnggKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLW55ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC1ueCAqIGFuICogYTIpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtbnkgKiBhbiAqIGEyKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uIGFuZCBkYW1waW5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgcmVsYXRpdmUgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ4KHksIGRlY2sucDEpIC0gdCAqIGdldHZ4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eSh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRvdGFsbHkgdW5zY2llbnRpZmljIHdheSB0byBjb21wdXRlIGZyaWN0aW9uIGZyb20gYXJiaXRyYXJ5IGNvbnN0YW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQobWF0ZXJpYWxzW2Rpc2MubV0uZnJpY3Rpb24gKiBtYXRlcmlhbHNbZGVjay5tXS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4oYW4gKiBmcmljdGlvbiwgTWF0aC5hYnModnQgKiAxMDApKSAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcCA9IDI7ICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gZGVyaXZlIGEgcmVhc29uYWJsZSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCB0eCAqIGFmICogYWQgLSB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgdHkgKiBhZiAqIGFkIC0gdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC10eCAqIGFmICogYTEgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC10eSAqIGFmICogYTEgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC10eCAqIGFmICogYTIgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC10eSAqIGFmICogYTIgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzY2VuZVJlbmRlcmVyKHNjZW5lOiBTY2VuZSk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBcbiAgICAvLyBQcmUtcmVuZGVyIHRlcnJhaW4uXG4gICAgY29uc3QgdGVycmFpbiA9IHNjZW5lLnRlcnJhaW47XG4gICAgY29uc3QgaG1hcCA9IHRlcnJhaW4uaG1hcDtcbiAgICBjb25zdCB0ZXJyYWluUGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICB0ZXJyYWluUGF0aC5tb3ZlVG8oMC4wLCAwLjApO1xuICAgIGxldCB4ID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCwgaG1hcFtpXSk7XG4gICAgICAgIHggKz0gdGVycmFpbi5waXRjaDtcbiAgICB9XG4gICAgdGVycmFpblBhdGgubGluZVRvKHggLSB0ZXJyYWluLnBpdGNoLCAwLjApO1xuICAgIHRlcnJhaW5QYXRoLmNsb3NlUGF0aCgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCkge1xuICAgICAgICAvLyBUZXJyYWluLlxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICAgICAgY3R4LmZpbGwodGVycmFpblBhdGgpO1xuXG4gICAgICAgIGNvbnN0IHkgPSBvZGUueTtcblxuICAgICAgICAvLyBEaXNjc1xuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzO1xuICAgICAgICBcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5hcmMoeVtwICogMiArIDBdLCB5W3AgKiAyICsgMV0sIGRpc2MuciwgMC4wLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbChcIm5vbnplcm9cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZWFtcy5cbiAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gbWF0ZXJpYWxzW2JlYW0ubV0uc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYmVhbS53O1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byB1c2Ugb2RlIGFjY2Vzc29ycy5cbiAgICAgICAgICAgIC8vIFdhaXQsIGRvZXMgdGhhdCBtZWFuIHdlIG5lZWQgYW4gT0RFIGZvciBhIHN0YXRpYyBzY2VuZT9cbiAgICAgICAgICAgIC8vIFdpbGwgbmVlZCBkaWZmZXJlbnQgbWV0aG9kcy5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHAxIDwgMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiovXG5cbnR5cGUgQ3JlYXRlQmVhbVBpblN0YXRlID0ge1xuICAgIGVkaXQ6IFNjZW5lRWRpdG9yLFxuICAgIGk6IG51bWJlcixcbiAgICBkcmFnPzogeyBwOiBQb2ludDJELCBpPzogbnVtYmVyIH0sXG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIDEsIGJveC50b3AgKyAxLCBib3gud2lkdGggLSAyLCBib3guaGVpZ2h0IC0gMik7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHBpbiA9IHRydXNzR2V0UGluKHRydXNzLCBzdGF0ZS5pKTtcbiAgICBjdHgubGluZVdpZHRoID0gNDtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhwaW5bMF0sIHBpblsxXSk7XG4gICAgaWYgKHN0YXRlLmRyYWcuaSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICAgICAgY3R4LmxpbmVUbyhwWzBdLCBwWzFdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjdHgubGluZVRvKHN0YXRlLmRyYWcucFswXSwgc3RhdGUuZHJhZy5wWzFdKTtcbiAgICB9XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25QYW4ocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IGkgPSB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3MsIHBzWzBdLmN1cnIsIDE2LCBzdGF0ZS5pKTtcbiAgICBzdGF0ZS5kcmFnID0ge1xuICAgICAgICBwOiBwc1swXS5jdXJyLFxuICAgICAgICBpLFxuICAgIH07XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuRW5kKGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBpZiAoc3RhdGUuZHJhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGRyYWcgc3RhdGUgT25QYW5FbmRcIik7XG4gICAgfVxuICAgIGlmIChzdGF0ZS5kcmFnLmkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzdGF0ZS5lZGl0LmFkZFBpbkFuZEJlYW0oc3RhdGUuZHJhZy5wLCBzdGF0ZS5pLCBlYyk7XG4gICAgfSBlbHNlIGlmICghdHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBzdGF0ZS5kcmFnLmksIHN0YXRlLmkpKSB7XG4gICAgICAgIC8vIFRPRE86IHJlcGxhY2UgZXhpc3RpbmcgYmVhbSBpZiBvbmUgZXhpc3RzIChhbmQgaXMgZWRpdGFibGUpLlxuICAgICAgICBzdGF0ZS5lZGl0LmFkZEJlYW0oc3RhdGUuZHJhZy5pLCBzdGF0ZS5pLCBlYyk7XG4gICAgfVxuICAgIHN0YXRlLmRyYWcgPSB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIENyZWF0ZUJlYW1QaW4oZWRpdDogU2NlbmVFZGl0b3IsIGk6IG51bWJlcik6IFBvc2l0aW9uTGF5b3V0PGFueSwgYW55PiB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgLy8gSWYgd2UgaGFkIHN0YXRlIHRoYXQgd2FzIHBhc3NlZCB0byBhbGwgaGFuZGxlcnMsIHRoZW4gd2UgY291bGQgYXZvaWQgYWxsb2NhdGluZyBuZXcgaGFuZGxlcnMgcGVyIEVsZW1lbnQuXG4gICAgcmV0dXJuIFBvc2l0aW9uPENyZWF0ZUJlYW1QaW5TdGF0ZT4ocFswXSAtIDgsIHBbMV0gLSA4LCAxNiwgMTYsIHsgZWRpdCwgaSB9KVxuICAgICAgICAub25EcmF3KGNyZWF0ZUJlYW1QaW5PbkRyYXcpXG4gICAgICAgIC5vblBhbihjcmVhdGVCZWFtUGluT25QYW4pXG4gICAgICAgIC5vblBhbkVuZChjcmVhdGVCZWFtUGluT25QYW5FbmQpO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0VkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc0VkaXRQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc0VkaXRQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgfVxuICAgIGNvbnN0IGUgPSBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG5cbiAgICBlZGl0Lm9uQWRkUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgYWRkaW5nIEVsZW1lbnQgZm9yIHBpbiAke3Bpbn0gYXQgY2hpbGRbJHtlZGl0SW5kZXh9XWApO1xuICAgICAgICBhZGRDaGlsZChlLCBDcmVhdGVCZWFtUGluKGVkaXQsIHBpbiksIGVjLCBlZGl0SW5kZXgpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG4gICAgZWRpdC5vblJlbW92ZVBpbigoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYHJlbW92aW5nIEVsZW1lbnQgZm9yIHBpbiAke3Bpbn0gYXQgY2hpbGRbJHtlZGl0SW5kZXh9XWApO1xuICAgICAgICByZW1vdmVDaGlsZChlLCBlZGl0SW5kZXgsIGVjKTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pO1xuXG4gICAgLy8gVE9ETzogZS5vbkRldGFjaCBmb3IgcmVtb3ZlaW5nIHBpbiBvYnNlcnZlcnMuXG4gICAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzVW5lZGl0YWJsZVBpbnMoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3NcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc1VuZWRpdGFibGVQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgfVxuICAgIHJldHVybiBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICAgICAgQWRkVHJ1c3NFZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGRyYXdCZWFtKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBwMTogUG9pbnQyRCwgcDI6IFBvaW50MkQsIHc6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIGN0eC5saW5lV2lkdGggPSB3O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NMYXllck9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgdHJ1c3M6IFRydXNzKSB7XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBUcnVzc0xheWVyKHRydXNzOiBUcnVzcyk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBGaWxsKHRydXNzKS5vbkRyYXcodHJ1c3NMYXllck9uRHJhdyk7XG59XG5cbi8vIFRPRE86IFRha2UgU2NlbmUgYXMgc3RhdGUgaW5zdGVhZCBvZiBTY2VuZUpTT04/XG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZpbGwoc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIHJldHVybiAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBzdHlsZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHI6IG51bWJlciwgY2N3OiBib29sZWFuKSB7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGNvbnN0IGEgPSBjY3cgPyBNYXRoLlBJIDogMDtcbiAgICBjb25zdCBsID0gY2N3ID8gLU1hdGguUEkgKiAwLjQgOiBNYXRoLlBJICogMC40O1xuICAgIGNvbnN0IHB4ID0gciAqIE1hdGguY29zKGEpO1xuICAgIGNvbnN0IHB5ID0gciAqIE1hdGguc2luKGEpXG4gICAgY29uc3QgdHggPSByICogTWF0aC5jb3MoYSAtIGwpIC0gcHg7XG4gICAgY29uc3QgdHkgPSByICogTWF0aC5zaW4oYSAtIGwpIC0gcHk7XG4gICAgY29uc3QgbnggPSAtdHkgLyBNYXRoLnNxcnQoMyk7XG4gICAgY29uc3QgbnkgPSB0eCAvIE1hdGguc3FydCgzKTtcbiAgICBjb25zdCBiID0gY2N3ID8gTWF0aC5QSSAqIDEuMjUgOiBNYXRoLlBJICogMC4yNTtcbiAgICBjb25zdCBlID0gY2N3ID8gTWF0aC5QSSAqIDIuNzUgOiBNYXRoLlBJICogMS43NTtcbiAgICBjdHguZWxsaXBzZSh4LCB5LCByLCByLCAwLCBiLCBlKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgXG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4ICsgdHggKyBueCwgeSArIHB5ICsgdHkgKyBueSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHggKyB0eCAtIG54LCB5ICsgcHkgKyB0eSAtIG55KTtcbiAgICBjdHguZmlsbCgpO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuXG4gICAgY29uc3QgaWNvblN0eWxlID0gZWRpdC51bmRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGljb25TdHlsZTtcbiAgICBjdHguZmlsbFN0eWxlID0gaWNvblN0eWxlO1xuICAgIGN0eC5saW5lV2lkdGggPSA4O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coXG4gICAgICAgIGN0eCxcbiAgICAgICAgYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjUsXG4gICAgICAgIGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41LFxuICAgICAgICAyMixcbiAgICAgICAgdHJ1ZSxcbiAgICApO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKHVuZG9CdXR0b25UYXApLm9uRHJhdyh1bmRvQnV0dG9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b25UYXAoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgZWRpdC5yZWRvKGVjKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG5cbiAgICBjb25zdCBpY29uU3R5bGUgPSBlZGl0LnJlZG9Db3VudCgpID09PSAwID8gXCJncmF5XCIgOiBcImJsYWNrXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gaWNvblN0eWxlO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpY29uU3R5bGU7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDg7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgZHJhd0NpcmNsZVdpdGhBcnJvdyhcbiAgICAgICAgY3R4LFxuICAgICAgICBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNSxcbiAgICAgICAgYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjUsXG4gICAgICAgIDIyLFxuICAgICAgICBmYWxzZSxcbiAgICApO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKHJlZG9CdXR0b25UYXApLm9uRHJhdyhyZWRvQnV0dG9uRHJhdyk7XG59XG4vKlxuZXhwb3J0IGZ1bmN0aW9uIFRhYlNlbGVjdChzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4ge1xuICAgIHJldHVybiBGbGV4KHNpemUsIGdyb3csICk7XG59XG5cbnR5cGUgVGFiU3RhdGUgPSB7IGFjdGl2ZTogYm9vbGVhbiwgaTogbnVtYmVyLCBzZWxlY3RlZDogeyBpOiBudW1iZXIgfSB9O1xuXG5leHBvcnQgZnVuY3Rpb24gVGFiU3RyaXAoc2VsZWN0SGVpZ2h0OiBudW1iZXIsIGNvbnRlbnRIZWlnaHQ6IG51bWJlciwgLi4udGFiczogQXJyYXk8W0ZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4sIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBXUEhQTGF5b3V0PGFueSwgYW55PiB7XG4gICAgY29uc3Qgc2VsZWN0ID0gbmV3IEFycmF5PEZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4+KHRhYnMubGVuZ3RoKTtcbiAgICBjb25zdCBjb250ZW50ID0gbmV3IEFycmF5PFtudW1iZXIsIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4odGFicy5sZW5ndGgpO1xuICAgIGNvbnN0IHNlbGVjdGVkID0geyBpOiAwIH07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YWJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNlbGVjdFtpXSA9IHRhYnNbaV1bMF07XG4gICAgICAgIGNvbnRlbnRbaV0gPSBbaSwgdGFic1tpXVsxXV07XG4gICAgfVxuICAgIGNvbnN0IG11eCA9IFN3aXRjaCh0YWJzWzBdWzBdLCAuLi5jb250ZW50KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhYnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgc2VsZWN0W2ldLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogVGFiU3RhdGUpID0+IHtcblxuICAgICAgICAgICAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIG11eC5zZXQoZWMsIHRhYnNbaV1bMF0pO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIEJvdHRvbShcbiAgICAgICAgRmxleChjb250ZW50SGVpZ2h0LCAwLCBMZWZ0KC4uLnNlbGVjdCkpLFxuICAgICAgICBGbGV4KHNlbGVjdEhlaWdodCwgMCwgbXV4KSxcbiAgICApO1xufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGVkaXQgPSBuZXcgU2NlbmVFZGl0b3Ioc2NlbmVKU09OKTtcblxuICAgIGNvbnN0IHNjZW5lVUkgPSBNdXgoXG4gICAgICAgIFtcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiXSxcbiAgICAgICAgW1widGVycmFpblwiLCBGaWxsKHNjZW5lSlNPTi50ZXJyYWluKS5vbkRyYXcoZHJhd1RlcnJhaW4pXSxcbiAgICAgICAgW1widHJ1c3NcIiwgVHJ1c3NMYXllcihzY2VuZUpTT04udHJ1c3MpXSxcbiAgICAgICAgW1wiYWRkX3RydXNzXCIsIEFkZFRydXNzTGF5ZXIoZWRpdCldLFxuICAgICk7XG5cbiAgICBjb25zdCBkcmF3UiA9IGRyYXdGaWxsKFwicmVkXCIpO1xuICAgIGNvbnN0IGRyYXdHID0gZHJhd0ZpbGwoXCJncmVlblwiKTtcbiAgICBjb25zdCBkcmF3QiA9IGRyYXdGaWxsKFwiYmx1ZVwiKTtcblxuICAgIGNvbnN0IHRvb2xzID0gU3dpdGNoKFxuICAgICAgICAxLFxuICAgICAgICBMZWZ0KHVuZG9CdXR0b24oZWRpdCksIHJlZG9CdXR0b24oZWRpdCkpLFxuICAgICAgICBGaWxsKCkub25EcmF3KGRyYXdHKSxcbiAgICAgICAgRmlsbCgpLm9uRHJhdyhkcmF3QiksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDIsXG4gICAgICAgICksXG4gICAgICAgIEJvdHRvbShcbiAgICAgICAgICAgIEZsZXgoNjQsIDAsXG4gICAgICAgICAgICAgICAgdG9vbHMsICBcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIExlZnQoXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Uikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDAsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIpOyB9KSxcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdHKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyB0b29scy5zZXQoMSwgZWMpOyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIik7IH0pLFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd0IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgyLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgfSksXG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICksXG4gICAgICAgICksXG4gICAgKTtcbn1cbiJdfQ==