// Copyright Charles Dueck 2020
import { pointDistance } from "./point.js";
//import { ODEMethod } from "./ode.js";
//import { Euler } from "./euler.js";
//import { RungeKutta4 } from "./rk4.js";
import { addChild, Bottom, Box, Fill, Flex, Layer, Left, Mux, Position, Relative, removeChild, Scroll, Switch } from "./ui/node.js";
export class Scene {
    constructor(scene) {
        this.scene = scene;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 4;
        this.editDeck = false;
    }
    assertPin(pin) {
        const truss = this.scene.truss;
        if (pin < -truss.fixedPins.length || pin >= truss.startPins.length + truss.editPins.length) {
            throw new Error(`Unknown pin index ${pin}`);
        }
    }
    assertMaterial(m) {
        const materials = this.scene.truss.materials;
        if (m < 0 || m >= materials.length) {
            throw new Error(`Unknown material index ${m}`);
        }
    }
    doAddBeam(a, ec) {
        const truss = this.scene.truss;
        const p1 = a.p1;
        const p2 = a.p2;
        const m = a.m;
        const w = a.w;
        const l = a.l;
        const deck = a.deck;
        this.assertPin(p1);
        this.assertPin(p2);
        this.assertMaterial(m);
        if (w <= 0.0) {
            throw new Error(`Beam width must be greater than 0, got ${w}`);
        }
        if (l !== undefined && l <= 0.0) {
            throw new Error(`Beam length must be greater than 0, got ${l}`);
        }
        if (this.beamExists(p1, p2)) {
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
            h(editIndex, pin, a.pin, ec);
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
    beamExists(p1, p2) {
        const truss = this.scene.truss;
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
    // Scene enumeration/observation methods
    onAddPin(handler) {
        this.onAddPinHandlers.push(handler);
    }
    onRemovePin(handler) {
        this.onRemovePinHandlers.push(handler);
    }
    // TODO: Clear handlers?
    getEditBeams() {
        return this.scene.truss.editBeams;
    }
    getStartBeams() {
        return this.scene.truss.startBeams;
    }
    getMaterial(m) {
        const materials = this.scene.truss.materials;
        if (m < 0 || m >= materials.length) {
            throw new Error(`invalid material ${m}`);
        }
        return materials[m];
    }
    *getUneditablePins() {
        const truss = this.scene.truss;
        let i = -truss.fixedPins.length;
        for (const p of truss.fixedPins) {
            yield { i, p };
            i++;
        }
        for (const p of truss.startPins) {
            yield { i, p };
            i++;
        }
    }
    *getEditPins() {
        const truss = this.scene.truss;
        let i = truss.startPins.length;
        for (const p of truss.editPins) {
            yield { i, p };
            i++;
        }
    }
    getPin(pin) {
        const truss = this.scene.truss;
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
    getClosestPin(p, maxd, beamStart) {
        const truss = this.scene.truss;
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
    ctx.lineWidth = 2;
    ctx.strokeStyle = "black";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
    if (state.drag === undefined) {
        return;
    }
    const pin = state.scene.getPin(state.i);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pin[0], pin[1]);
    if (state.drag.i !== undefined) {
        const p = state.scene.getPin(state.drag.i);
        ctx.lineTo(p[0], p[1]);
    }
    else {
        ctx.lineTo(state.drag.p[0], state.drag.p[1]);
    }
    ctx.stroke();
}
function createBeamPinOnPan(ps, ec, state) {
    const i = state.scene.getClosestPin(ps[0].curr, 16, state.i);
    state.drag = {
        p: ps[0].curr,
        i,
    };
    ec.requestDraw();
}
function createBeamPinOnPanEnd(ec, state) {
    if (state.drag === undefined) {
        throw new Error("No drag state OnPanEnd");
    }
    if (state.drag.i === undefined) {
        state.scene.addPinAndBeam(state.drag.p, state.i, ec);
    }
    else if (!state.scene.beamExists(state.drag.i, state.i)) {
        // TODO: replace existing beam if one exists (and is editable).
        state.scene.addBeam(state.drag.i, state.i, ec);
    }
    state.drag = undefined;
}
function CreateBeamPin(scene, i, p) {
    // If we had state that was passed to all handlers, then we could avoid allocating new handlers per Element.
    return Position(p[0] - 8, p[1] - 8, 16, 16, { scene, i })
        .onDraw(createBeamPinOnDraw)
        .onPan(createBeamPinOnPan)
        .onPanEnd(createBeamPinOnPanEnd);
}
function AddTrussEditablePins(scene) {
    const children = [];
    for (const p of scene.getEditPins()) {
        children.push(CreateBeamPin(scene, p.i, p.p));
    }
    const e = Relative(...children);
    scene.onAddPin((editIndex, pin, p, ec) => {
        console.log(`adding Element for pin ${pin} at child[${editIndex}], (${p[0]}, ${p[1]})`);
        addChild(e, CreateBeamPin(scene, pin, p), ec, editIndex);
        ec.requestLayout();
    });
    scene.onRemovePin((editIndex, pin, ec) => {
        console.log(`removing Element for pin ${pin} at child[${editIndex}]`);
        removeChild(e, editIndex, ec);
        ec.requestLayout();
    });
    // TODO: e.onDetach for removeing pin observers.
    return e;
}
function AddTrussUneditablePins(scene) {
    const children = [];
    for (const p of scene.getUneditablePins()) {
        children.push(CreateBeamPin(scene, p.i, p.p));
    }
    return Relative(...children);
}
function AddTrussLayer(scene) {
    return Layer(AddTrussUneditablePins(scene), AddTrussEditablePins(scene));
}
function trussLayerOnDraw(ctx, _box, _ec, _vp, scene) {
    for (const b of scene.getStartBeams()) {
        ctx.lineWidth = b.w;
        ctx.lineCap = "round";
        ctx.strokeStyle = scene.getMaterial(b.m).style;
        ctx.beginPath();
        const p1 = scene.getPin(b.p1);
        const p2 = scene.getPin(b.p2);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
    for (const b of scene.getEditBeams()) {
        ctx.lineWidth = b.w;
        ctx.lineCap = "round";
        ctx.strokeStyle = scene.getMaterial(b.m).style;
        ctx.beginPath();
        const p1 = scene.getPin(b.p1);
        const p2 = scene.getPin(b.p2);
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
}
function TrussLayer(scene) {
    return Fill(scene).onDraw(trussLayerOnDraw);
}
// TODO: Take Scene as state instead of SceneJSON?
function drawTerrain(ctx, box, _ec, vp, state) {
    const terrain = state.terrain;
    const hmap = terrain.hmap;
    const pitch = state.width / (hmap.length - 1);
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
function undoButtonTap(_p, ec, scene) {
    if (scene.undoCount() > 0) {
        scene.undo(ec);
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
function undoButtonDraw(ctx, box, _ec, _vp, scene) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);
    const iconStyle = scene.undoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(ctx, box.left + box.width * 0.5, box.top + box.height * 0.5, 22, true);
}
function undoButton(scene) {
    return Flex(64, 0, scene).onTap(undoButtonTap).onDraw(undoButtonDraw);
}
function redoButtonTap(_p, ec, scene) {
    if (scene.redoCount() > 0) {
        scene.redo(ec);
    }
}
function redoButtonDraw(ctx, box, _ec, _vp, scene) {
    ctx.fillStyle = "white";
    ctx.fillRect(box.left, box.top, box.width, box.height);
    const iconStyle = scene.redoCount() === 0 ? "gray" : "black";
    ctx.strokeStyle = iconStyle;
    ctx.fillStyle = iconStyle;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    drawCircleWithArrow(ctx, box.left + box.width * 0.5, box.top + box.height * 0.5, 22, false);
}
function redoButton(scene) {
    return Flex(64, 0, scene).onTap(redoButtonTap).onDraw(redoButtonDraw);
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
    const scene = new Scene(sceneJSON);
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON).onDraw(drawTerrain)], ["truss", TrussLayer(scene)], ["add_truss", AddTrussLayer(scene)]);
    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");
    const tools = Switch(1, Left(undoButton(scene), redoButton(scene)), Fill().onDraw(drawG), Fill().onDraw(drawB));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 2), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => { tools.set(2, ec); sceneUI.set(ec, "terrain", "truss"); })))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsdUNBQXVDO0FBQ3ZDLHFDQUFxQztBQUNyQyx5Q0FBeUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFrQixJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBd0MsSUFBSSxFQUFFLEdBQUcsRUFBWSxRQUFRLEVBQWtCLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLGNBQWMsQ0FBQztBQW1HcE4sTUFBTSxPQUFPLEtBQUs7SUE2SGQsWUFBWSxLQUFnQjtRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLENBQUM7UUFDOUIsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLElBQUksQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO0lBQzFCLENBQUM7SUE3SE8sU0FBUyxDQUFDLEdBQVc7UUFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7WUFDeEYsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxFQUFFLENBQUMsQ0FBQztTQUMvQztJQUNMLENBQUM7SUFFTyxjQUFjLENBQUMsQ0FBUztRQUM1QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7UUFDN0MsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxTQUFTLENBQUMsTUFBTSxFQUFFO1lBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDbEQ7SUFDTCxDQUFDO0lBRU8sU0FBUyxDQUFDLENBQWdCLEVBQUUsRUFBa0I7UUFDbEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNoQixNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNkLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDcEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuQixJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFO1lBQ1YsTUFBTSxJQUFJLEtBQUssQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNsRTtRQUNELElBQUksQ0FBQyxLQUFLLFNBQVMsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFO1lBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMsMkNBQTJDLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDbkU7UUFDRCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1lBQ3pCLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixDQUFDLENBQUM7U0FDdkU7UUFDRCxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQztRQUU5QyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBRywyRUFBMkU7SUFDbkcsQ0FBQztJQUVPLFdBQVcsQ0FBQyxDQUFnQixFQUFFLEVBQWtCO1FBQ3BELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssU0FBUyxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztTQUNyQztRQUNELElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDakcsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1NBQzFDO1FBQ0QsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUcsMkVBQTJFO0lBQ25HLENBQUM7SUFFTyxRQUFRLENBQUMsQ0FBZSxFQUFFLEVBQWtCO1FBQ2hELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQy9CLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ3hDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUMvQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDM0IsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7WUFDbkMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNoQztJQUNMLENBQUM7SUFFTyxVQUFVLENBQUMsQ0FBZSxFQUFFLEVBQWtCO1FBQ2xELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLEtBQUssU0FBUyxFQUFFO1lBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7U0FDcEM7UUFDRCxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3hDLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztTQUN6QztRQUNELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQ3hDLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUMvQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtZQUN0QyxDQUFDLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUN6QjtJQUNMLENBQUM7SUFFTyxXQUFXLENBQUMsQ0FBa0IsRUFBRSxFQUFrQjtRQUN0RCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDdkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ25DO0lBQ0wsQ0FBQztJQUVPLGFBQWEsQ0FBQyxDQUFrQixFQUFFLEVBQWtCO1FBQ3hELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDNUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1NBQ3JDO0lBQ0wsQ0FBQztJQUVPLFFBQVEsQ0FBQyxDQUFjLEVBQUUsRUFBa0I7UUFDL0MsUUFBUSxDQUFDLENBQUMsSUFBSSxFQUFFO1lBQ1osS0FBSyxVQUFVO2dCQUNYLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN0QixNQUFNO1lBQ1YsS0FBSyxTQUFTO2dCQUNWLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNyQixNQUFNO1lBQ1YsS0FBSyxXQUFXO2dCQUNaLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QixNQUFNO1NBQ2I7SUFDTCxDQUFDO0lBRU8sVUFBVSxDQUFDLENBQWMsRUFBRSxFQUFrQjtRQUNqRCxRQUFRLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDWixLQUFLLFVBQVU7Z0JBQ1gsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3hCLE1BQU07WUFDVixLQUFLLFNBQVM7Z0JBQ1YsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZCLE1BQU07WUFDVixLQUFLLFdBQVc7Z0JBQ1osSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQzFCLE1BQU07U0FDYjtJQUNMLENBQUM7SUFZRCxVQUFVLENBQUMsRUFBVSxFQUFFLEVBQVU7UUFDN0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFO1lBQ2hDLElBQUksQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDMUUsT0FBTyxJQUFJLENBQUM7YUFDZjtTQUNKO1FBQ0QsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1lBQ2pDLElBQUksQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDMUUsT0FBTyxJQUFJLENBQUM7YUFDZjtTQUNKO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUVELHdDQUF3QztJQUV4QyxRQUFRLENBQUMsT0FBd0I7UUFDN0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsV0FBVyxDQUFDLE9BQTJCO1FBQ25DLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVELHdCQUF3QjtJQUV4QixZQUFZO1FBQ1IsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDdEMsQ0FBQztJQUVELGFBQWE7UUFDVCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQztJQUN2QyxDQUFDO0lBRUQsV0FBVyxDQUFDLENBQVM7UUFDakIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDO1FBQzdDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtZQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQzVDO1FBQ0QsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUVELENBQUMsaUJBQWlCO1FBQ2QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUNoQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7WUFDN0IsTUFBTSxFQUFDLENBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQztZQUNiLENBQUMsRUFBRSxDQUFDO1NBQ1A7UUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7WUFDN0IsTUFBTSxFQUFDLENBQUMsRUFBRSxDQUFDLEVBQUMsQ0FBQztZQUNiLENBQUMsRUFBRSxDQUFDO1NBQ1A7SUFDTCxDQUFDO0lBRUQsQ0FBQyxXQUFXO1FBQ1IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7UUFDL0IsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFO1lBQzVCLE1BQU0sRUFBQyxDQUFDLEVBQUUsQ0FBQyxFQUFDLENBQUM7WUFDYixDQUFDLEVBQUUsQ0FBQztTQUNQO0lBQ0wsQ0FBQztJQUVELE1BQU0sQ0FBQyxHQUFXO1FBQ2QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRTtZQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1NBQzlDO2FBQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFO1lBQ2hCLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQztTQUN4RDthQUFNLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFO1lBQ3JDLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUMvQjthQUFNLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1lBQzdELE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUN2RDthQUFNO1lBQ0gsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsR0FBRyxFQUFFLENBQUMsQ0FBQztTQUM5QztJQUNMLENBQUM7SUFFRCxhQUFhLENBQUMsQ0FBVSxFQUFFLElBQVksRUFBRSxTQUFrQjtRQUN0RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztRQUMvQixtRkFBbUY7UUFDbkYsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUNoQyxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUM7UUFDcEIsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLElBQUksU0FBUyxLQUFLLFNBQVMsRUFBRTtZQUN6QixLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUU7Z0JBQzlCLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUU7b0JBQ3BCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2lCQUNuQjtxQkFBTSxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssU0FBUyxFQUFFO29CQUMzQixLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztpQkFDbkI7YUFDSjtZQUNELEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtnQkFDN0IsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRTtvQkFDcEIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ25CO3FCQUFNLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUU7b0JBQzNCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2lCQUNuQjthQUNKO1NBQ0o7UUFDRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDN0MsTUFBTSxDQUFDLEdBQUcsYUFBYSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFO2dCQUNWLEdBQUcsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7Z0JBQ2pDLElBQUksR0FBRyxDQUFDLENBQUM7YUFDWjtTQUNKO1FBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzdDLE1BQU0sQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRTtnQkFDVixHQUFHLEdBQUcsQ0FBQyxDQUFDO2dCQUNSLElBQUksR0FBRyxDQUFDLENBQUM7YUFDWjtTQUNKO1FBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzVDLE1BQU0sQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRTtnQkFDVixHQUFHLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO2dCQUNqQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO2FBQ1o7U0FDSjtRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ2YsQ0FBQztJQUVELFNBQVM7UUFDTCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztJQUN2QyxDQUFDO0lBRUQsU0FBUztRQUNMLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCx5QkFBeUI7SUFFekIsSUFBSSxDQUFDLEVBQWtCO1FBQ25CLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxLQUFLLFNBQVMsRUFBRTtZQUNqQixNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7U0FDeEM7UUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN2QixJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELElBQUksQ0FBQyxFQUFrQjtRQUNuQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNyQyxJQUFJLENBQUMsS0FBSyxTQUFTLEVBQUU7WUFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1NBQ3hDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFTyxNQUFNLENBQUMsQ0FBYyxFQUFFLEVBQWtCO1FBQzdDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFJLDRCQUE0QjtJQUNsRCxDQUFDO0lBRUQsT0FBTyxDQUNILEVBQVUsRUFDVixFQUFVLEVBQ1YsRUFBa0I7UUFFbEIsSUFBSSxDQUFDLE1BQU0sQ0FBQztZQUNSLElBQUksRUFBRSxVQUFVO1lBQ2hCLEVBQUU7WUFDRixFQUFFO1lBQ0YsQ0FBQyxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQ3BCLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUNqQixDQUFDLEVBQUUsU0FBUztZQUNaLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUTtTQUN0QixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ1gsQ0FBQztJQUVELE1BQU0sQ0FBQyxHQUFZLEVBQUUsRUFBa0I7UUFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELGFBQWEsQ0FDVCxHQUFZLEVBQ1osRUFBVSxFQUNWLEVBQWtCO1FBRWxCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDNUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFDLElBQUksRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFO2dCQUNyQyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFDO2dCQUN2QjtvQkFDSSxJQUFJLEVBQUUsVUFBVTtvQkFDaEIsRUFBRTtvQkFDRixFQUFFO29CQUNGLENBQUMsRUFBRSxJQUFJLENBQUMsWUFBWTtvQkFDcEIsQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTO29CQUNqQixDQUFDLEVBQUUsU0FBUztvQkFDWixJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVE7aUJBQ3RCO2FBQ0osRUFBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ1osQ0FBQztDQUNKO0FBQUEsQ0FBQztBQWliRixTQUFTLG1CQUFtQixDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEdBQW1CLEVBQUUsR0FBYyxFQUFFLEtBQXlCO0lBQ3RJLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLEdBQUcsQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDO0lBQzFCLEdBQUcsQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO0lBQ3ZCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3RCLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUV6RSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO1FBQzFCLE9BQU87S0FDVjtJQUNELE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4QyxHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDaEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0IsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxTQUFTLEVBQUU7UUFDNUIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUMxQjtTQUFNO1FBQ0gsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2hEO0lBQ0QsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBQ2pCLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLEVBQW1CLEVBQUUsRUFBa0IsRUFBRSxLQUF5QjtJQUMxRixNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0QsS0FBSyxDQUFDLElBQUksR0FBRztRQUNULENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNiLENBQUM7S0FDSixDQUFDO0lBQ0YsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEVBQWtCLEVBQUUsS0FBeUI7SUFDeEUsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRTtRQUMxQixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7S0FDN0M7SUFDRCxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLFNBQVMsRUFBRTtRQUM1QixLQUFLLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0tBQ3hEO1NBQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUN2RCwrREFBK0Q7UUFDL0QsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztLQUNsRDtJQUNELEtBQUssQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxLQUFZLEVBQUUsQ0FBUyxFQUFFLENBQVU7SUFDdEQsNEdBQTRHO0lBQzVHLE9BQU8sUUFBUSxDQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUN4RSxNQUFNLENBQUMsbUJBQW1CLENBQUM7U0FDM0IsS0FBSyxDQUFDLGtCQUFrQixDQUFDO1NBQ3pCLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLEtBQVk7SUFDdEMsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxFQUFFO1FBQ2pDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2pEO0lBQ0QsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7SUFFaEMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQWlCLEVBQUUsR0FBVyxFQUFFLENBQVUsRUFBRSxFQUFrQixFQUFFLEVBQUU7UUFDOUUsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsR0FBRyxhQUFhLFNBQVMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4RixRQUFRLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6RCxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsU0FBaUIsRUFBRSxHQUFXLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1FBQ3JFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEdBQUcsYUFBYSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ3RFLFdBQVcsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztJQUVILGdEQUFnRDtJQUNoRCxPQUFPLENBQUMsQ0FBQztBQUNiLENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLEtBQVk7SUFDeEMsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLGlCQUFpQixFQUFFLEVBQUU7UUFDdkMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDakQ7SUFDRCxPQUFPLFFBQVEsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxLQUFZO0lBQy9CLE9BQU8sS0FBSyxDQUNSLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxFQUM3QixvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FDOUIsQ0FBQztBQUNOLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEdBQTZCLEVBQUUsSUFBZSxFQUFFLEdBQW1CLEVBQUUsR0FBYyxFQUFFLEtBQVk7SUFDdkgsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsYUFBYSxFQUFFLEVBQUU7UUFDbkMsR0FBRyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3RCLEdBQUcsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQy9DLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5QixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDaEI7SUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUNsQyxHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEIsR0FBRyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdEIsR0FBRyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7UUFDL0MsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hCLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlCLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztLQUNoQjtBQUNMLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFZO0lBQzVCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2hELENBQUM7QUFFRCxrREFBa0Q7QUFDbEQsU0FBUyxXQUFXLENBQUMsR0FBNkIsRUFBRSxHQUFjLEVBQUUsR0FBbUIsRUFBRSxFQUFhLEVBQUUsS0FBZ0I7SUFDcEgsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztJQUM5QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztJQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQztJQUM5QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RSxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFDOUIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQyxLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQy9CLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDdkQ7SUFDRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN2RCxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEtBQThDO0lBQzVELE9BQU8sQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxFQUFFO1FBQ3JELEdBQUcsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNELENBQUMsQ0FBQTtBQUNMLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxFQUFXLEVBQUUsRUFBa0IsRUFBRSxLQUFZO0lBQ2hFLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRTtRQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xCO0FBQ0wsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBNkIsRUFBRSxDQUFTLEVBQUUsQ0FBUyxFQUFFLENBQVMsRUFBRSxHQUFZO0lBQ3JHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQy9DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBRWIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDM0Is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aWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG4vL2ltcG9ydCB7IE9ERU1ldGhvZCB9IGZyb20gXCIuL29kZS5qc1wiO1xuLy9pbXBvcnQgeyBFdWxlciB9IGZyb20gXCIuL2V1bGVyLmpzXCI7XG4vL2ltcG9ydCB7IFJ1bmdlS3V0dGE0IH0gZnJvbSBcIi4vcms0LmpzXCI7XG5pbXBvcnQgeyBhZGRDaGlsZCwgQm90dG9tLCBCb3gsIEVsZW1lbnRDb250ZXh0LCBGaWxsLCBGbGV4LCBMYXllciwgTGF5b3V0Qm94LCBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0LCBMZWZ0LCBNdXgsIFBhblBvaW50LCBQb3NpdGlvbiwgUG9zaXRpb25MYXlvdXQsIFJlbGF0aXZlLCByZW1vdmVDaGlsZCwgU2Nyb2xsLCBTd2l0Y2ggfSBmcm9tIFwiLi91aS9ub2RlLmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbiAgICBkZWNrPzogYm9vbGVhbjsgLy8gSXMgdGhpcyBiZWFtIGEgZGVjaz8gKGRvIGRpc2NzIGNvbGxpZGUpXG59O1xuXG4vKlxudHlwZSBTaW11bGF0aW9uQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsOiBudW1iZXI7XG4gICAgZGVjazogYm9vbGVhbjtcbn1cbiovXG5cbmV4cG9ydCB0eXBlIERpc2MgPSB7XG4gICAgcDogbnVtYmVyOyAgLy8gSW5kZXggb2YgbW92ZWFibGUgcGluIHRoaXMgZGlzYyBzdXJyb3VuZHMuXG4gICAgbTogbnVtYmVyOyAgLy8gTWF0ZXJpYWwgb2YgZGlzYy5cbiAgICByOiBudW1iZXI7ICAvLyBSYWRpdXMgb2YgZGlzYy5cbiAgICB2OiBudW1iZXI7ICAvLyBWZWxvY2l0eSBvZiBzdXJmYWNlIG9mIGRpc2MgKGluIENDVyBkaXJlY3Rpb24pLlxufTtcblxuZXhwb3J0IHR5cGUgTWF0ZXJpYWwgPSB7XG4gICAgRTogbnVtYmVyOyAgLy8gWW91bmcncyBtb2R1bHVzIGluIFBhLlxuICAgIGRlbnNpdHk6IG51bWJlcjsgICAgLy8ga2cvbV4zXG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIC8vIFRPRE86IHdoZW4gc3R1ZmYgYnJlYWtzLCB3b3JrIGhhcmRlbmluZywgZXRjLlxufTtcblxuZXhwb3J0IHR5cGUgVHJ1c3MgPSB7XG4gICAgZml4ZWRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBzdGFydFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIGVkaXRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBzdGFydEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBlZGl0QmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGRpc2NzOiBBcnJheTxEaXNjPjtcbiAgICBtYXRlcmlhbHM6IEFycmF5PE1hdGVyaWFsPjtcbn07XG5cbmV4cG9ydCB0eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8bnVtYmVyPjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG59O1xuLypcbnR5cGUgU2ltdWxhdGlvbkhNYXAgPSBBcnJheTx7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgbng6IG51bWJlcjsgLy8gTm9ybWFsIHVuaXQgdmVjdG9yLlxuICAgIG55OiBudW1iZXI7XG4gICAgZGVja3M6IEFycmF5PFNpbXVsYXRpb25CZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgIGRlY2tDb3VudDogbnVtYmVyOyAgLy8gTnVtYmVyIG9mIGluZGljZXMgaW4gZGVja3MgYmVpbmcgdXNlZC5cbn0+O1xuKi9cblxudHlwZSBBZGRCZWFtQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX2JlYW1cIjtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsPzogbnVtYmVyO1xuICAgIGRlY2s/OiBib29sZWFuO1xufTtcblxudHlwZSBBZGRQaW5BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfcGluXCI7XG4gICAgcGluOiBQb2ludDJEO1xufTtcblxudHlwZSBDb21wb3NpdGVBY3Rpb24gPSB7XG4gICAgdHlwZTogXCJjb21wb3NpdGVcIjtcbiAgICBhY3Rpb25zOiBBcnJheTxUcnVzc0FjdGlvbj47XG59O1xuXG50eXBlIFRydXNzQWN0aW9uID0gQWRkQmVhbUFjdGlvbiB8IEFkZFBpbkFjdGlvbiB8IENvbXBvc2l0ZUFjdGlvbjtcblxuXG5leHBvcnQgdHlwZSBTY2VuZUpTT04gPSB7XG4gICAgdHJ1c3M6IFRydXNzO1xuICAgIHRlcnJhaW46IFRlcnJhaW47XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBnOiBQb2ludDJEOyAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgIHJlZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xuICAgIHVuZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufVxuXG50eXBlIE9uQWRkUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25SZW1vdmVQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5cbmV4cG9ydCBjbGFzcyBTY2VuZSB7XG4gICAgcHJpdmF0ZSBzY2VuZTogU2NlbmVKU09OO1xuICAgIHByaXZhdGUgb25BZGRQaW5IYW5kbGVyczogQXJyYXk8T25BZGRQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIG9uUmVtb3ZlUGluSGFuZGxlcnM6IEFycmF5PE9uUmVtb3ZlUGluSGFuZGxlcj47XG4gICAgcHJpdmF0ZSBlZGl0TWF0ZXJpYWw6IG51bWJlcjtcbiAgICBwcml2YXRlIGVkaXRXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgZWRpdERlY2s6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIGFzc2VydFBpbihwaW46IG51bWJlcikge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGlmIChwaW4gPCAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCB8fCBwaW4gPj0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIGFzc2VydE1hdGVyaWFsKG06IG51bWJlcikge1xuICAgICAgICBjb25zdCBtYXRlcmlhbHMgPSB0aGlzLnNjZW5lLnRydXNzLm1hdGVyaWFscztcbiAgICAgICAgaWYgKG0gPCAwIHx8IG0gPj0gbWF0ZXJpYWxzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAxID0gYS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBhLnAyO1xuICAgICAgICBjb25zdCBtID0gYS5tO1xuICAgICAgICBjb25zdCB3ID0gYS53O1xuICAgICAgICBjb25zdCBsID0gYS5sO1xuICAgICAgICBjb25zdCBkZWNrID0gYS5kZWNrO1xuICAgICAgICB0aGlzLmFzc2VydFBpbihwMSk7XG4gICAgICAgIHRoaXMuYXNzZXJ0UGluKHAyKTtcbiAgICAgICAgdGhpcy5hc3NlcnRNYXRlcmlhbChtKTtcbiAgICAgICAgaWYgKHcgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gd2lkdGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7d31gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobCAhPT0gdW5kZWZpbmVkICYmIGwgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gbGVuZ3RoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke2x9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYmVhbUV4aXN0cyhwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRydXNzLmVkaXRCZWFtcy5wdXNoKHtwMSwgcDIsIG0sIHcsIGwsIGRlY2t9KTtcbiAgICAgICAgXG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgdW5kb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgYiA9IHRydXNzLmVkaXRCZWFtcy5wb3AoKTtcbiAgICAgICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBiZWFtcyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiLnAxICE9PSBhLnAxIHx8IGIucDIgIT09IGEucDIgfHwgYi5tICE9PSBhLm0gfHwgYi53ICE9IGEudyB8fCBiLmwgIT09IGEubCB8fCBiLmRlY2sgIT09IGEuZGVjaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCZWFtIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICB0cnVzcy5lZGl0UGlucy5wdXNoKGEucGluKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25BZGRQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgYS5waW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzcy5lZGl0UGlucy5wb3AoKTtcbiAgICAgICAgaWYgKHAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwaW5zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBbMF0gIT09IGEucGluWzBdIHx8IHBbMV0gIT09IGEucGluWzFdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbiBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEuYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gYS5hY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04pIHtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLm9uQWRkUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIC8vIFRPRE86IHByb3BlciBpbml0aWFsaXphdGlvbjtcbiAgICAgICAgdGhpcy5lZGl0TWF0ZXJpYWwgPSAwO1xuICAgICAgICB0aGlzLmVkaXRXaWR0aCA9IDQ7XG4gICAgICAgIHRoaXMuZWRpdERlY2sgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBiZWFtRXhpc3RzKHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgZW51bWVyYXRpb24vb2JzZXJ2YXRpb24gbWV0aG9kc1xuXG4gICAgb25BZGRQaW4oaGFuZGxlcjogT25BZGRQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlUGluKGhhbmRsZXI6IE9uUmVtb3ZlUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBDbGVhciBoYW5kbGVycz9cblxuICAgIGdldEVkaXRCZWFtcygpOiBBcnJheTxCZWFtPiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnRydXNzLmVkaXRCZWFtcztcbiAgICB9XG5cbiAgICBnZXRTdGFydEJlYW1zKCk6IEFycmF5PEJlYW0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmUudHJ1c3Muc3RhcnRCZWFtcztcbiAgICB9XG5cbiAgICBnZXRNYXRlcmlhbChtOiBudW1iZXIpOiBNYXRlcmlhbCB7XG4gICAgICAgIGNvbnN0IG1hdGVyaWFscyA9IHRoaXMuc2NlbmUudHJ1c3MubWF0ZXJpYWxzO1xuICAgICAgICBpZiAobSA8IDAgfHwgbSA+PSBtYXRlcmlhbHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGludmFsaWQgbWF0ZXJpYWwgJHttfWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRlcmlhbHNbbV07XG4gICAgfVxuXG4gICAgKmdldFVuZWRpdGFibGVQaW5zKCkge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGxldCBpID0gLXRydXNzLmZpeGVkUGlucy5sZW5ndGg7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiB0cnVzcy5maXhlZFBpbnMpIHtcbiAgICAgICAgICAgIHlpZWxkIHtpLCBwfTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgdHJ1c3Muc3RhcnRQaW5zKSB7XG4gICAgICAgICAgICB5aWVsZCB7aSwgcH07XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAqZ2V0RWRpdFBpbnMoKSB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgbGV0IGkgPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xuICAgICAgICBmb3IgKGNvbnN0IHAgb2YgdHJ1c3MuZWRpdFBpbnMpIHtcbiAgICAgICAgICAgIHlpZWxkIHtpLCBwfTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldFBpbihwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGlmIChwaW4gPCAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgICAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVzcy5maXhlZFBpbnNbdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCArIHBpbl07XG4gICAgICAgIH0gZWxzZSBpZiAocGluIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHRydXNzLnN0YXJ0UGluc1twaW5dO1xuICAgICAgICB9IGVsc2UgaWYgKHBpbiAtIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggPCB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVzcy5lZGl0UGluc1twaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldENsb3Nlc3RQaW4ocDogUG9pbnQyRCwgbWF4ZDogbnVtYmVyLCBiZWFtU3RhcnQ/OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIC8vIFRPRE86IGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiBQcm9iYWJseSBvbmx5IG1hdHRlcnMgb25jZSB3ZSBoYXZlIDEwMDBzIG9mIHBpbnM/XG4gICAgICAgIGNvbnN0IGJsb2NrID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgICAgIGxldCByZXMgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCByZXNkID0gbWF4ZDtcbiAgICAgICAgaWYgKGJlYW1TdGFydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICAgICAgICAgIGlmIChiLnAxID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MuZml4ZWRQaW5zW2ldKTtcbiAgICAgICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5zdGFydFBpbnNbaV0pO1xuICAgICAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gaTtcbiAgICAgICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgICAgICByZXMgPSBpICsgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIHVuZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS51bmRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIHJlZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS5yZWRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIC8vIFNjZW5lIG11dGF0aW9uIG1ldGhvZHNcblxuICAgIHVuZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnVuZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHVuZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sucHVzaChhKTtcbiAgICB9XG5cbiAgICByZWRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS5yZWRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byByZWRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnVuZG9TdGFjay5wdXNoKGEpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sgPSBbYV07XG4gICAgICAgIHRoaXMucmVkbyhlYyk7ICAgIC8vIFRPRE86IElzIHRoaXMgdG9vIGNsZXZlcj9cbiAgICB9XG5cbiAgICBhZGRCZWFtKFxuICAgICAgICBwMTogbnVtYmVyLFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHtcbiAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICB9LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluKHBpbjogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImFkZF9waW5cIiwgcGlufSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbkFuZEJlYW0oXG4gICAgICAgIHBpbjogUG9pbnQyRCxcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCBwMSA9IHRoaXMuc2NlbmUudHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJjb21wb3NpdGVcIiwgYWN0aW9uczogW1xuICAgICAgICAgICAgeyB0eXBlOiBcImFkZF9waW5cIiwgcGlufSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICAgICAgcDEsXG4gICAgICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICAgICAgdzogdGhpcy5lZGl0V2lkdGgsXG4gICAgICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF19LCBlYyk7XG4gICAgfVxufTtcblxuLypcbmV4cG9ydCBmdW5jdGlvbiBzY2VuZU1ldGhvZChzY2VuZTogU2NlbmUpOiBPREVNZXRob2Qge1xuICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgXG4gICAgY29uc3QgZml4ZWRQaW5zID0gdHJ1c3MuZml4ZWRQaW5zO1xuICAgIGNvbnN0IG1vYmlsZVBpbnMgPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgIC8vIFN0YXRlIGFjY2Vzc29yc1xuICAgIGZ1bmN0aW9uIGdldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVswXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbl1bMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV07IFxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVtwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBTcGxpdCBiZWFtIG1hc3MgZXZlbmx5IGJldHdlZW4gcGlucywgaW5pdGlhbGlzZSBiZWFtIGxlbmd0aC5cbiAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7XG4gICAgY29uc3QgbWFzcyA9IG5ldyBGbG9hdDMyQXJyYXkobW9iaWxlUGlucyk7XG4gICAgZnVuY3Rpb24gZ2V0bShwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFzc1twaW5dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDUuOTcyZTI0OyAgICAvLyBNYXNzIG9mIHRoZSBFYXJ0aC5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJlYW1zID0gWy4uLnRydXNzLnN0YXJ0QmVhbXMsIC4uLnRydXNzLmVkaXRCZWFtc10ubWFwKChiZWFtOiBCZWFtKTogU2ltdWxhdGlvbkJlYW0gPT4ge1xuICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgY29uc3QgbCA9IHBvaW50RGlzdGFuY2Uoc2NlbmUuZ2V0UGluKHAxKSwgc2NlbmUuZ2V0UGluKHAyKSk7XG4gICAgICAgIGNvbnN0IG0gPSBsICogYmVhbS53ICogbWF0ZXJpYWxzW2JlYW0ubV0uZGVuc2l0eTtcbiAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgbWFzc1twMV0gKz0gbSAqIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AyXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHAxLCBwMiwgbTogYmVhbS5tLCB3OiBiZWFtLncsIGw6IGJlYW0ubCB8fCBsLCBkZWNrOiBiZWFtLmRlY2sgfHwgZmFsc2UgfTtcbiAgICB9KTtcblxuICAgIC8vIERpc2MgbWFzcy5cbiAgICBjb25zdCBkaXNjcyA9IHNjZW5lLnRydXNzLmRpc2NzO1xuICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICBpZiAoZGlzYy5wID49IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpc2MgYXR0YWNoZWQgdG8gbm9uIG1vYmlsZSBwaW5cIik7XG4gICAgICAgIH1cbiAgICAgICAgbWFzc1tkaXNjLnBdICs9IGRpc2MuciAqIGRpc2MuciAqIE1hdGguUEkgKiBtYXRlcmlhbHNbZGlzYy5tXS5kZW5zaXR5O1xuICAgIH1cblxuICAgIC8vIENoZWNrIHRoYXQgZXZlcnl0aGluZyB0aGF0IGNhbiBtb3ZlIGhhcyBzb21lIG1hc3MuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgaWYgKG1hc3NbaV0gPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vYmlsZSBwaW4gJHtpfSBoYXMgbWFzcyAke21hc3NbaV19IDw9IDAuMGApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgaG1hcDogU2ltdWxhdGlvbkhNYXAgPSBzY2VuZS50ZXJyYWluLmhtYXAubWFwKChoLCBpKSA9PiB7XG4gICAgICAgIGlmIChpICsgMSA+PSBzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICBueDogMC4wLFxuICAgICAgICAgICAgICAgIG55OiAxLjAsXG4gICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gaDtcbiAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICBueDogLWR5IC8gbCxcbiAgICAgICAgICAgIG55OiBwaXRjaCAvIGwsXG4gICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgZnVuY3Rpb24gcmVzZXREZWNrcygpIHtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGhtYXApIHtcbiAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGREZWNrKGk6IG51bWJlciwgZDogU2ltdWxhdGlvbkJlYW0pIHtcbiAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgaC5kZWNrc1toLmRlY2tDb3VudF0gPSBkO1xuICAgICAgICBoLmRlY2tDb3VudCsrO1xuICAgIH1cbiAgICBjb25zdCB0RnJpY3Rpb24gPSBzY2VuZS50ZXJyYWluLmZyaWN0aW9uO1xuXG4gICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlIHZlY3Rvci5cbiAgICBjb25zdCB5MCA9IG5ldyBGbG9hdDMyQXJyYXkobW9iaWxlUGlucyAqIDQpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBnZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBzZXRkeCh5MCwgaSwgZFswXSk7XG4gICAgICAgIHNldGR5KHkwLCBpLCBkWzFdKTtcbiAgICB9XG4gICAgLy8gTkI6IEluaXRpYWwgdmVsb2NpdGllcyBhcmUgYWxsIDAsIG5vIG5lZWQgdG8gaW5pdGlhbGl6ZS5cblxuICAgIGNvbnN0IGcgPSAgc2NlbmUuZztcbiAgICByZXR1cm4gbmV3IFJ1bmdlS3V0dGE0KHkwLCBmdW5jdGlvbiAoX3Q6IG51bWJlciwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldGR4KGR5ZHQsIGksIGdldHZ4KHksIGkpKTtcbiAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdKTtcbiAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGVja3MgYXJlIHVwZGF0ZWQgaW4gaG1hcCBpbiB0aGUgYmVsb3cgbG9vcCB0aHJvdWdoIGJlYW1zLCBzbyBjbGVhciB0aGUgcHJldmlvdXMgdmFsdWVzLlxuICAgICAgICByZXNldERlY2tzKCk7XG5cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGNvbnN0IHcgPSBiZWFtLnc7XG4gICAgICAgICAgICBjb25zdCBsMCA9IGJlYW0ubDtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBwMikgLSBnZXRkeSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyYWluID0gKGwgLSBsMCkgLyBsMDtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyZXNzID0gc3RyYWluICogRSAqIHc7XG4gICAgICAgICAgICBjb25zdCBrID0gRSAqIHcgLyBsMDtcbiAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICBjb25zdCBtMSA9IGdldG0ocDEpOyAgICAvLyBQaW4gbWFzc1xuICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKHAyKTtcbiAgICAgICAgICAgIGNvbnN0IHV4ID0gZHggLyBsOyAgICAgIC8vIFVuaXQgdmVjdG9yIGluIGRpcmVjdGlubyBvZiBiZWFtO1xuICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogc3ByaW5nRiAvIG0yKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBzcHJpbmdGIC8gbTIpO1xuXG4gICAgICAgICAgICAvLyBEYW1waW5nIGZvcmNlLlxuICAgICAgICAgICAgY29uc3QgemV0YSA9IDAuNTtcbiAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgcDIpIC0gZ2V0dngoeSwgcDEpOyAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMS5cbiAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgcDIpIC0gZ2V0dnkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgdiA9IHZ4ICogdXggKyB2eSAqIHV5OyAgICAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMSBpbiBkaXJlY3Rpb24gb2YgYmVhbS5cbiAgICAgICAgICAgIC8vIFRPRE86IG5vdyB0aGF0IGdldG0gcmV0dXJucyBtYXNzIG9mIEVhcnRoIGZvciBmaXhlZCBwaW5zLCB3ZSBkb24ndCBuZWVkIHRoZXNlIGRpZmZlcmVudCBpZiBjbGF1c2VzLlxuICAgICAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucyAmJiBwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSAqIG0yIC8gKG0xICsgbTIpKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgZGVja3MgdG8gYWNjbGVyYXRpb24gc3RydWN0dXJlXG4gICAgICAgICAgICBpZiAoYmVhbS5kZWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldGR4KHksIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5taW4oaTEsIGkyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1heChpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhZGREZWNrKGksIGJlYW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIHRlcnJhaW4gY29sbGlzaW9uLCBzY2VuZSBib3JkZXIgY29sbGlzaW9uXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGkpOyAvLyBQaW4gcG9zaXRpb24uXG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGkpO1xuICAgICAgICAgICAgbGV0IGF0ID0gMTAwMC4wOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICBsZXQgbng7IC8vIFRlcnJhaW4gdW5pdCBub3JtYWwuXG4gICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICBpZiAoZHggPCAwLjApIHtcbiAgICAgICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgICAgICBueSA9IDEuMDtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gMC4wKSArIG55ICogKGR5IC0gaG1hcFswXS5oZWlnaHQpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgbnkgPSBobWFwW3RpXS5ueTtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gdGkgKiBwaXRjaCkgKyBueSAqIChkeSAtIGhtYXBbdGldLmhlaWdodCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGF0ID4gMC4wKSB7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgbnggKiBhdCk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgbnkgKiBhdCk7XG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAvLyBDYXAgYWNjZWxlcmF0aW9uIGJ5IHNvbWUgZnJhY3Rpb24gb2YgdmVsb2NpdHlcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0YWtlIGZyaWN0aW9uIGZyb20gYmVhbXMgdG9vIChqdXN0IGF2ZXJhZ2UgYmVhbXMgZ29pbmcgaW50byBwaW4/KVxuICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgY29uc3QgdHYgPSBnZXR2eCh5LCBpKSAqIHR4ICsgZ2V0dnkoeSwgaSkgKiB0eTtcbiAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKHRGcmljdGlvbiAqIGF0LCBNYXRoLmFicyh0diAqIDEwMCkpICogKHR2ID49IDAuMCA/IC0xLjAgOiAxLjApO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGksIHR4ICogYWYpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGksIHR5ICogYWYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZGlzYy1kZWNrIGNvbGxpc2lvbi5cbiAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBkaXNjLnApO1xuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBobWFwIGJ1Y2tldHMgdGhhdCBkaXNjIG92ZXJsYXBzLlxuICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKChkeCAtIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKChkeCArIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkxOyBpIDw9IGkyOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBkZWNrcyBpbiB0aG9zZSBidWNrZXRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tzID0gaG1hcFtpXS5kZWNrcztcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRlY2tDb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2sgPSBkZWNrc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MSA9IGdldGR4KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MSA9IGdldGR5KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldGR4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MiA9IGdldGR5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gSXMgY29sbGlzaW9uIGhhcHBlbmluZz9cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN5ID0geTIgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3ggPSBkeCAtIHgxOyAvLyBWZWN0b3IgdG8gY2VudHJlIG9mIGRpc2MgKGZyb20gc3RhcnQgb2YgZGVjaylcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhID0gc3ggKiBzeCArIHN5ICogc3k7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGIgPSAtMi4wICogKGN4ICogc3ggKyBjeSAqIHN5KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IEQgPSBiICogYiAtIDQuMCAqIGEgKiBjO1xuICAgICAgICAgICAgICAgICAgICBpZiAoRCA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290RCA9IE1hdGguc3FydChEKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IC1iIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MiA9ICgtYiArIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0MSA8PSAwLjAgJiYgdDIgPD0gMC4wKSB8fCAodDEgPj0gMS4wICYmIHQyID49IDAuMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdDEgPSBNYXRoLm1heCh0MSwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgdDIgPSBNYXRoLm1pbih0MiwgMS4wKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGNvbGxpc2lvbiBhY2NlbGVyYXRpb24uXG4gICAgICAgICAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBpcyBwcm9wb3J0aW9uYWwgdG8gYXJlYSAnc2hhZG93ZWQnIGluIHRoZSBkaXNjIGJ5IHRoZSBpbnRlcnNlY3RpbmcgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeCA9ICgxIC0gdDEpICogeDEgKyB0MSAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MSBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeSA9ICgxIC0gdDEpICogeTEgKyB0MSAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeSA9ICgxIC0gdDIpICogeTEgKyB0MiAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhID0gTWF0aC5hYnMoTWF0aC5hdGFuMih0MXksIHQxeCkgLSBNYXRoLmF0YW4yKHQyeSwgdDJ4KSkgJSBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuID0gMTAwMC4wICogYXJlYTsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IHdoYXQgYWNjZWxlcmF0aW9uIHRvIHVzZVxuICAgICAgICAgICAgICAgICAgICBsZXQgbnggPSBjeCAtIHN4ICogdDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG55ID0gY3kgLSBzeSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQobnggKiBueCArIG55ICogbnkpO1xuICAgICAgICAgICAgICAgICAgICBueCAvPSBsO1xuICAgICAgICAgICAgICAgICAgICBueSAvPSBsO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbnMgdG8gdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1kID0gZ2V0bShkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IGdldG0oZGVjay5wMSkgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShkZWNrLnAyKSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkID0gKG0xICsgbTIpIC8gKG1kICsgbTEgKyBtMik7ICAvLyBTaGFyZSBvZiBhY2NlbGVyYXRpb24gZm9yIGRpc2MsIGRlY2sgZW5kcG9pbnRzLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMSA9IChtZCArIG0yKSAvIChtZCArIG0xICsgbTIpICogKDEuMCAtIHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMiA9IChtZCArIG0xKSAvIChtZCArIG0xICsgbTIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCBueCAqIGFuICogYWQpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIG55ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMSwgLW54ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC1ueSAqIGFuICogYTEpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtbnggKiBhbiAqIGEyKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMiwgLW55ICogYW4gKiBhMik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBmcmljdGlvbiBhbmQgZGFtcGluZy5cbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHJlbGF0aXZlIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eCh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eCh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dnkoeSwgZGVjay5wMSkgLSB0ICogZ2V0dnkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZuID0gdnggKiBueCArIHZ5ICogbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2dCA9IHZ4ICogdHggKyB2eSAqIHR5IC0gZGlzYy52O1xuICAgICAgICAgICAgICAgICAgICAvLyBUb3RhbGx5IHVuc2NpZW50aWZpYyB3YXkgdG8gY29tcHV0ZSBmcmljdGlvbiBmcm9tIGFyYml0cmFyeSBjb25zdGFudHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uID0gTWF0aC5zcXJ0KG1hdGVyaWFsc1tkaXNjLm1dLmZyaWN0aW9uICogbWF0ZXJpYWxzW2RlY2subV0uZnJpY3Rpb24pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKGFuICogZnJpY3Rpb24sIE1hdGguYWJzKHZ0ICogMTAwKSkgKiAodnQgPD0gMC4wID8gMS4wIDogLTEuMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXAgPSAyOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIGRlcml2ZSBhIHJlYXNvbmFibGUgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRpc2MucCwgdHggKiBhZiAqIGFkIC0gdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIHR5ICogYWYgKiBhZCAtIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtdHggKiBhZiAqIGExICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAxLCAtdHkgKiBhZiAqIGExICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtdHggKiBhZiAqIGEyICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtdHkgKiBhZiAqIGEyICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NlbmVSZW5kZXJlcihzY2VuZTogU2NlbmUpOiBUcnVzc1JlbmRlciB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7XG4gICAgXG4gICAgLy8gUHJlLXJlbmRlciB0ZXJyYWluLlxuICAgIGNvbnN0IHRlcnJhaW4gPSBzY2VuZS50ZXJyYWluO1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgdGVycmFpblBhdGggPSBuZXcgUGF0aDJEKCk7XG4gICAgdGVycmFpblBhdGgubW92ZVRvKDAuMCwgMC4wKTtcbiAgICBsZXQgeCA9IDAuMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhtYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGVycmFpblBhdGgubGluZVRvKHgsIGhtYXBbaV0pO1xuICAgICAgICB4ICs9IHRlcnJhaW4ucGl0Y2g7XG4gICAgfVxuICAgIHRlcnJhaW5QYXRoLmxpbmVUbyh4IC0gdGVycmFpbi5waXRjaCwgMC4wKTtcbiAgICB0ZXJyYWluUGF0aC5jbG9zZVBhdGgoKTtcblxuICAgIHJldHVybiBmdW5jdGlvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgb2RlOiBPREVNZXRob2QpIHtcbiAgICAgICAgLy8gVGVycmFpbi5cbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHRlcnJhaW4uc3R5bGU7XG4gICAgICAgIGN0eC5maWxsKHRlcnJhaW5QYXRoKTtcblxuICAgICAgICBjb25zdCB5ID0gb2RlLnk7XG5cbiAgICAgICAgLy8gRGlzY3NcbiAgICAgICAgY29uc3QgZGlzY3MgPSB0cnVzcy5kaXNjcztcbiAgICAgICAgXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBkaXNjLnA7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguYXJjKHlbcCAqIDIgKyAwXSwgeVtwICogMiArIDFdLCBkaXNjLnIsIDAuMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICAgICAgY3R4LmZpbGwoXCJub256ZXJvXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmVhbXMuXG4gICAgICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IG1hdGVyaWFsc1tiZWFtLm1dLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IGJlYW0udztcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcblxuICAgICAgICAgICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gdXNlIG9kZSBhY2Nlc3NvcnMuXG4gICAgICAgICAgICAvLyBXYWl0LCBkb2VzIHRoYXQgbWVhbiB3ZSBuZWVkIGFuIE9ERSBmb3IgYSBzdGF0aWMgc2NlbmU/XG4gICAgICAgICAgICAvLyBXaWxsIG5lZWQgZGlmZmVyZW50IG1ldGhvZHMuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwMSA8IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwID0gZ2V0UGluKHRydXNzLCBwMSk7XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyh5W3AxICogMiArIDBdLCB5W3AxICogMiArIDFdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGluID0gcGluc1twMV07XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyhwaW5bMF0sIHBpblsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyh5W3AyICogMiArIDBdLCB5W3AyICogMiArIDFdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGluID0gcGluc1twMl07XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyhwaW5bMF0sIHBpblsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4qL1xuXG50eXBlIENyZWF0ZUJlYW1QaW5TdGF0ZSA9IHtcbiAgICBzY2VuZTogU2NlbmUsXG4gICAgaTogbnVtYmVyLFxuICAgIGRyYWc/OiB7IHA6IFBvaW50MkQsIGk/OiBudW1iZXIgfSxcbn07XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyAxLCBib3gudG9wICsgMSwgYm94LndpZHRoIC0gMiwgYm94LmhlaWdodCAtIDIpO1xuICAgIFxuICAgIGlmIChzdGF0ZS5kcmFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBwaW4gPSBzdGF0ZS5zY2VuZS5nZXRQaW4oc3RhdGUuaSk7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDQ7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8ocGluWzBdLCBwaW5bMV0pO1xuICAgIGlmIChzdGF0ZS5kcmFnLmkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCBwID0gc3RhdGUuc2NlbmUuZ2V0UGluKHN0YXRlLmRyYWcuaSk7XG4gICAgICAgIGN0eC5saW5lVG8ocFswXSwgcFsxXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY3R4LmxpbmVUbyhzdGF0ZS5kcmFnLnBbMF0sIHN0YXRlLmRyYWcucFsxXSk7XG4gICAgfVxuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IGkgPSBzdGF0ZS5zY2VuZS5nZXRDbG9zZXN0UGluKHBzWzBdLmN1cnIsIDE2LCBzdGF0ZS5pKTtcbiAgICBzdGF0ZS5kcmFnID0ge1xuICAgICAgICBwOiBwc1swXS5jdXJyLFxuICAgICAgICBpLFxuICAgIH07XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuRW5kKGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5kcmFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gZHJhZyBzdGF0ZSBPblBhbkVuZFwiKTtcbiAgICB9XG4gICAgaWYgKHN0YXRlLmRyYWcuaSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHN0YXRlLnNjZW5lLmFkZFBpbkFuZEJlYW0oc3RhdGUuZHJhZy5wLCBzdGF0ZS5pLCBlYyk7XG4gICAgfSBlbHNlIGlmICghc3RhdGUuc2NlbmUuYmVhbUV4aXN0cyhzdGF0ZS5kcmFnLmksIHN0YXRlLmkpKSB7XG4gICAgICAgIC8vIFRPRE86IHJlcGxhY2UgZXhpc3RpbmcgYmVhbSBpZiBvbmUgZXhpc3RzIChhbmQgaXMgZWRpdGFibGUpLlxuICAgICAgICBzdGF0ZS5zY2VuZS5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKHNjZW5lOiBTY2VuZSwgaTogbnVtYmVyLCBwOiBQb2ludDJEKTogUG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+IHtcbiAgICAvLyBJZiB3ZSBoYWQgc3RhdGUgdGhhdCB3YXMgcGFzc2VkIHRvIGFsbCBoYW5kbGVycywgdGhlbiB3ZSBjb3VsZCBhdm9pZCBhbGxvY2F0aW5nIG5ldyBoYW5kbGVycyBwZXIgRWxlbWVudC5cbiAgICByZXR1cm4gUG9zaXRpb248Q3JlYXRlQmVhbVBpblN0YXRlPihwWzBdIC0gOCwgcFsxXSAtIDgsIDE2LCAxNiwgeyBzY2VuZSwgaSB9KVxuICAgICAgICAub25EcmF3KGNyZWF0ZUJlYW1QaW5PbkRyYXcpXG4gICAgICAgIC5vblBhbihjcmVhdGVCZWFtUGluT25QYW4pXG4gICAgICAgIC5vblBhbkVuZChjcmVhdGVCZWFtUGluT25QYW5FbmQpO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0VkaXRhYmxlUGlucyhzY2VuZTogU2NlbmUpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAoY29uc3QgcCBvZiBzY2VuZS5nZXRFZGl0UGlucygpKSB7XG4gICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihzY2VuZSwgcC5pLCBwLnApKTtcbiAgICB9XG4gICAgY29uc3QgZSA9IFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcblxuICAgIHNjZW5lLm9uQWRkUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIHA6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgYWRkaW5nIEVsZW1lbnQgZm9yIHBpbiAke3Bpbn0gYXQgY2hpbGRbJHtlZGl0SW5kZXh9XSwgKCR7cFswXX0sICR7cFsxXX0pYCk7XG4gICAgICAgIGFkZENoaWxkKGUsIENyZWF0ZUJlYW1QaW4oc2NlbmUsIHBpbiwgcCksIGVjLCBlZGl0SW5kZXgpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG4gICAgc2NlbmUub25SZW1vdmVQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGByZW1vdmluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgcmVtb3ZlQ2hpbGQoZSwgZWRpdEluZGV4LCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcblxuICAgIC8vIFRPRE86IGUub25EZXRhY2ggZm9yIHJlbW92ZWluZyBwaW4gb2JzZXJ2ZXJzLlxuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lOiBTY2VuZSk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChjb25zdCBwIG9mIHNjZW5lLmdldFVuZWRpdGFibGVQaW5zKCkpIHtcbiAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKHNjZW5lLCBwLmksIHAucCkpO1xuICAgIH1cbiAgICByZXR1cm4gUmVsYXRpdmUoLi4uY2hpbGRyZW4pO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0xheWVyKHNjZW5lOiBTY2VuZSk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhzY2VuZSksXG4gICAgICAgIEFkZFRydXNzRWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICApO1xufVxuXG5mdW5jdGlvbiB0cnVzc0xheWVyT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBzY2VuZTogU2NlbmUpIHtcbiAgICBmb3IgKGNvbnN0IGIgb2Ygc2NlbmUuZ2V0U3RhcnRCZWFtcygpKSB7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSBiLnc7XG4gICAgICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzY2VuZS5nZXRNYXRlcmlhbChiLm0pLnN0eWxlO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGNvbnN0IHAxID0gc2NlbmUuZ2V0UGluKGIucDEpO1xuICAgICAgICBjb25zdCBwMiA9IHNjZW5lLmdldFBpbihiLnAyKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgICAgICBjdHgubGluZVRvKHAyWzBdLCBwMlsxXSk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHNjZW5lLmdldEVkaXRCZWFtcygpKSB7XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSBiLnc7XG4gICAgICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzY2VuZS5nZXRNYXRlcmlhbChiLm0pLnN0eWxlO1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGNvbnN0IHAxID0gc2NlbmUuZ2V0UGluKGIucDEpO1xuICAgICAgICBjb25zdCBwMiA9IHNjZW5lLmdldFBpbihiLnAyKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgICAgICBjdHgubGluZVRvKHAyWzBdLCBwMlsxXSk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwoc2NlbmUpLm9uRHJhdyh0cnVzc0xheWVyT25EcmF3KTtcbn1cblxuLy8gVE9ETzogVGFrZSBTY2VuZSBhcyBzdGF0ZSBpbnN0ZWFkIG9mIFNjZW5lSlNPTj9cbmZ1bmN0aW9uIGRyYXdUZXJyYWluKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgc3RhdGU6IFNjZW5lSlNPTikge1xuICAgIGNvbnN0IHRlcnJhaW4gPSBzdGF0ZS50ZXJyYWluO1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgcGl0Y2ggPSBzdGF0ZS53aWR0aCAvIChobWFwLmxlbmd0aCAtIDEpO1xuICAgIGNvbnN0IGxlZnQgPSB2cC5sZWZ0IC0gYm94LmxlZnQ7XG4gICAgY29uc3QgcmlnaHQgPSBsZWZ0ICsgdnAud2lkdGg7XG4gICAgY29uc3QgYmVnaW4gPSBNYXRoLm1heChNYXRoLm1pbihNYXRoLmZsb29yKGxlZnQgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSksIDApO1xuICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguY2VpbChyaWdodCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY3R4LmZpbGxTdHlsZSA9IHRlcnJhaW4uc3R5bGU7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oYm94LmxlZnQsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgY3R4LmxpbmVUbyhib3gubGVmdCArIGkgKiBwaXRjaCwgYm94LnRvcCArIGhtYXBbaV0pO1xuICAgIH1cbiAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgYm94LndpZHRoLCBib3gudG9wICsgYm94LmhlaWdodCk7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5maWxsKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdGaWxsKHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4pIHtcbiAgICByZXR1cm4gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gc3R5bGU7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVuZG9CdXR0b25UYXAoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgc2NlbmU6IFNjZW5lKSB7XG4gICAgaWYgKHNjZW5lLnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBzY2VuZS51bmRvKGVjKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHg6IG51bWJlciwgeTogbnVtYmVyLCByOiBudW1iZXIsIGNjdzogYm9vbGVhbikge1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjb25zdCBhID0gY2N3ID8gTWF0aC5QSSA6IDA7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC40IDogTWF0aC5QSSAqIDAuNDtcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhhKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihhKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGEgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGEgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAxLjI1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAyLjc1IDogTWF0aC5QSSAqIDEuNzU7XG4gICAgY3R4LmVsbGlwc2UoeCwgeSwgciwgciwgMCwgYiwgZSk7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIFxuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4ICsgbngsIHkgKyBweSArIHR5ICsgbnkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4ICsgdHggLSBueCwgeSArIHB5ICsgdHkgLSBueSk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc2NlbmU6IFNjZW5lKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG5cbiAgICBjb25zdCBpY29uU3R5bGUgPSBzY2VuZS51bmRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGljb25TdHlsZTtcbiAgICBjdHguZmlsbFN0eWxlID0gaWNvblN0eWxlO1xuICAgIGN0eC5saW5lV2lkdGggPSA4O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coXG4gICAgICAgIGN0eCxcbiAgICAgICAgYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjUsXG4gICAgICAgIGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41LFxuICAgICAgICAyMixcbiAgICAgICAgdHJ1ZSxcbiAgICApO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uKHNjZW5lOiBTY2VuZSkge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBzY2VuZSkub25UYXAodW5kb0J1dHRvblRhcCkub25EcmF3KHVuZG9CdXR0b25EcmF3KTtcbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzY2VuZTogU2NlbmUpIHtcbiAgICBpZiAoc2NlbmUucmVkb0NvdW50KCkgPiAwKSB7XG4gICAgICAgIHNjZW5lLnJlZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc2NlbmU6IFNjZW5lKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG5cbiAgICBjb25zdCBpY29uU3R5bGUgPSBzY2VuZS5yZWRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGljb25TdHlsZTtcbiAgICBjdHguZmlsbFN0eWxlID0gaWNvblN0eWxlO1xuICAgIGN0eC5saW5lV2lkdGggPSA4O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coXG4gICAgICAgIGN0eCxcbiAgICAgICAgYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjUsXG4gICAgICAgIGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41LFxuICAgICAgICAyMixcbiAgICAgICAgZmFsc2UsXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvbihzY2VuZTogU2NlbmUpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCwgc2NlbmUpLm9uVGFwKHJlZG9CdXR0b25UYXApLm9uRHJhdyhyZWRvQnV0dG9uRHJhdyk7XG59XG4vKlxuZXhwb3J0IGZ1bmN0aW9uIFRhYlNlbGVjdChzaXplOiBudW1iZXIsIGdyb3c6IG51bWJlciwgY2hpbGQ/OiBXUEhQTGF5b3V0PGFueSwgYW55Pik6IEZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4ge1xuICAgIHJldHVybiBGbGV4KHNpemUsIGdyb3csICk7XG59XG5cbnR5cGUgVGFiU3RhdGUgPSB7IGFjdGl2ZTogYm9vbGVhbiwgaTogbnVtYmVyLCBzZWxlY3RlZDogeyBpOiBudW1iZXIgfSB9O1xuXG5leHBvcnQgZnVuY3Rpb24gVGFiU3RyaXAoc2VsZWN0SGVpZ2h0OiBudW1iZXIsIGNvbnRlbnRIZWlnaHQ6IG51bWJlciwgLi4udGFiczogQXJyYXk8W0ZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4sIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4pOiBXUEhQTGF5b3V0PGFueSwgYW55PiB7XG4gICAgY29uc3Qgc2VsZWN0ID0gbmV3IEFycmF5PEZsZXhMYXlvdXQ8VGFiU3RhdGUsIGFueT4+KHRhYnMubGVuZ3RoKTtcbiAgICBjb25zdCBjb250ZW50ID0gbmV3IEFycmF5PFtudW1iZXIsIFdQSFBMYXlvdXQ8YW55LCBhbnk+XT4odGFicy5sZW5ndGgpO1xuICAgIGNvbnN0IHNlbGVjdGVkID0geyBpOiAwIH07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YWJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNlbGVjdFtpXSA9IHRhYnNbaV1bMF07XG4gICAgICAgIGNvbnRlbnRbaV0gPSBbaSwgdGFic1tpXVsxXV07XG4gICAgfVxuICAgIGNvbnN0IG11eCA9IFN3aXRjaCh0YWJzWzBdWzBdLCAuLi5jb250ZW50KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhYnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgc2VsZWN0W2ldLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogVGFiU3RhdGUpID0+IHtcblxuICAgICAgICAgICAgc3RhdGUuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIG11eC5zZXQoZWMsIHRhYnNbaV1bMF0pO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIEJvdHRvbShcbiAgICAgICAgRmxleChjb250ZW50SGVpZ2h0LCAwLCBMZWZ0KC4uLnNlbGVjdCkpLFxuICAgICAgICBGbGV4KHNlbGVjdEhlaWdodCwgMCwgbXV4KSxcbiAgICApO1xufVxuKi9cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHNjZW5lID0gbmV3IFNjZW5lKHNjZW5lSlNPTik7XG5cbiAgICBjb25zdCBzY2VuZVVJID0gTXV4KFxuICAgICAgICBbXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIl0sXG4gICAgICAgIFtcInRlcnJhaW5cIiwgRmlsbChzY2VuZUpTT04pLm9uRHJhdyhkcmF3VGVycmFpbildLFxuICAgICAgICBbXCJ0cnVzc1wiLCBUcnVzc0xheWVyKHNjZW5lKV0sXG4gICAgICAgIFtcImFkZF90cnVzc1wiLCBBZGRUcnVzc0xheWVyKHNjZW5lKV0sXG4gICAgKTtcblxuICAgIGNvbnN0IGRyYXdSID0gZHJhd0ZpbGwoXCJyZWRcIik7XG4gICAgY29uc3QgZHJhd0cgPSBkcmF3RmlsbChcImdyZWVuXCIpO1xuICAgIGNvbnN0IGRyYXdCID0gZHJhd0ZpbGwoXCJibHVlXCIpO1xuXG4gICAgY29uc3QgdG9vbHMgPSBTd2l0Y2goXG4gICAgICAgIDEsXG4gICAgICAgIExlZnQodW5kb0J1dHRvbihzY2VuZSksIHJlZG9CdXR0b24oc2NlbmUpKSxcbiAgICAgICAgRmlsbCgpLm9uRHJhdyhkcmF3RyksXG4gICAgICAgIEZpbGwoKS5vbkRyYXcoZHJhd0IpLFxuICAgICk7XG5cbiAgICByZXR1cm4gTGF5ZXIoXG4gICAgICAgIFNjcm9sbChcbiAgICAgICAgICAgIEJveChcbiAgICAgICAgICAgICAgICBzY2VuZUpTT04ud2lkdGgsIHNjZW5lSlNPTi5oZWlnaHQsXG4gICAgICAgICAgICAgICAgc2NlbmVVSSxcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAyLFxuICAgICAgICApLFxuICAgICAgICBCb3R0b20oXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIHRvb2xzLCAgXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICBMZWZ0KFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd1IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgwLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Rykub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDEsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCIpOyB9KSxcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdCKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyB0b29scy5zZXQoMiwgZWMpOyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIik7IH0pLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICk7XG59XG4iXX0=