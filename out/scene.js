// Copyright Charles Dueck 2020
import { TrussSimPlayer } from "./trusssimplayer.js";
import { pointDistance } from "./point.js";
import { TrussSim } from "./trusssim.js";
import { addChild, Bottom, Box, Fill, Flex, Layer, Left, Mux, Position, Relative, removeChild, Scroll, Switch } from "./ui/node.js";
function trussAssertMaterial(truss, m) {
    const materials = truss.materials;
    if (m < 0 || m >= materials.length) {
        throw new Error(`Unknown material index ${m}`);
    }
}
function trussAssertPin(truss, pin) {
    if (pin < -truss.fixedPins.length || pin >= truss.trainPins.length + truss.editPins.length) {
        throw new Error(`Unknown pin index ${pin}`);
    }
}
function trussBeamExists(truss, p1, p2) {
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
function trussEditPinsBegin(truss) {
    return truss.trainPins.length;
}
function trussEditPinsEnd(truss) {
    return truss.trainPins.length + truss.editPins.length;
}
function trussUneditablePinsBegin(truss) {
    return -truss.fixedPins.length;
}
function trussUneditablePinsEnd(_truss) {
    return 0;
}
function trussGetClosestPin(truss, p, maxd, pinStart, maxLength) {
    // TODO: acceleration structures. Probably only matters once we have 1000s of pins?
    const pStart = trussGetPin(truss, pinStart);
    const block = new Set();
    let res = undefined;
    let resd = maxd;
    if (pinStart !== undefined) {
        for (const b of truss.trainBeams) {
            if (b.p1 === pinStart) {
                block.add(b.p2);
            }
            else if (b.p2 === pinStart) {
                block.add(b.p1);
            }
        }
        for (const b of truss.editBeams) {
            if (b.p1 === pinStart) {
                block.add(b.p2);
            }
            else if (b.p2 === pinStart) {
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
function trussGetPin(truss, pin) {
    if (pin < -truss.fixedPins.length) {
        throw new Error(`Unkown pin index ${pin}`);
    }
    else if (pin < 0) {
        return truss.fixedPins[truss.fixedPins.length + pin];
    }
    else if (pin < truss.trainPins.length) {
        return truss.trainPins[pin];
    }
    else if (pin - truss.trainPins.length < truss.editPins.length) {
        return truss.editPins[pin - truss.trainPins.length];
    }
    else {
        throw new Error(`Unkown pin index ${pin}`);
    }
}
export class SceneEditor {
    constructor(scene) {
        this.scene = scene;
        this.player = undefined;
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 1;
        this.editDeck = true;
    }
    getPlayer() {
        if (this.player === undefined) {
            this.player = new TrussSimPlayer(new TrussSim(this.scene), 0.001, 1);
        }
        return this.player;
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
        const pin = truss.trainPins.length + editIndex;
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
        const pin = truss.trainPins.length + editIndex;
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
        if (this.player !== undefined) {
            this.player.pause(ec);
            this.player = undefined;
        }
    }
    redo(ec) {
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
        const p1 = truss.trainPins.length + truss.editPins.length;
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
function createBeamPinOnPan(ps, ec, state) {
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
    return Position(p[0] - 2, p[1] - 2, 4, 4, { edit, i })
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
function AddTrussLayer(scene) {
    return Layer(AddTrussUneditablePins(scene), AddTrussEditablePins(scene));
}
function drawBeam(ctx, x1, y1, x2, y2, w, style, deck) {
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (deck !== undefined && deck) {
        ctx.strokeStyle = "brown"; // TODO: deck style
        ctx.lineWidth = w * 0.75;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}
function TrussLayer(truss) {
    return Fill(truss).onDraw((ctx, _box, _ec, _vp, truss) => {
        for (const b of truss.trainBeams) {
            const p1 = trussGetPin(truss, b.p1);
            const p2 = trussGetPin(truss, b.p2);
            drawBeam(ctx, p1[0], p1[1], p2[0], p2[1], b.w, truss.materials[b.m].style, b.deck);
        }
        for (const b of truss.editBeams) {
            const p1 = trussGetPin(truss, b.p1);
            const p2 = trussGetPin(truss, b.p2);
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
function SimulateLayer(edit) {
    return Fill(edit).onDraw((ctx, _box, _ec, _vp, edit) => {
        edit.getPlayer().sim.draw(ctx);
    });
}
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
function drawCircleWithArrow(ctx, box, ccw) {
    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.5;
    const r = box.width * 0.333;
    const b = ccw ? Math.PI * 0.75 : Math.PI * 0.25;
    const e = ccw ? Math.PI * 1 : Math.PI * 2;
    const l = ccw ? -Math.PI * 0.3 : Math.PI * 0.3;
    const px = r * Math.cos(e);
    const py = r * Math.sin(e);
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
function drawButtonBorder(ctx, box) {
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.left + 1, box.top + 1, box.width - 2, box.height - 2);
}
function undoButtonDraw(ctx, box, _ec, _vp, edit) {
    ctx.fillStyle = "white";
    ctx.strokeStyle = edit.undoCount() === 0 ? "gray" : "black";
    drawButtonBorder(ctx, box);
    drawCircleWithArrow(ctx, box, true);
}
function undoButton(edit) {
    return Flex(64, 0, edit).onTap(undoButtonTap).onDraw(undoButtonDraw);
}
function redoButton(edit) {
    return Flex(64, 0, edit).onTap((_p, ec, edit) => {
        if (edit.redoCount() > 0) {
            edit.redo(ec);
        }
    }).onDraw((ctx, box, _ec, _vp, edit) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = edit.redoCount() === 0 ? "gray" : "black";
        drawButtonBorder(ctx, box);
        drawCircleWithArrow(ctx, box, false);
    });
}
function deckButton(edit) {
    return Flex(64, 0, edit).onTap((_p, ec, edit) => {
        edit.editDeck = !edit.editDeck;
        ec.requestDraw();
    }).onDraw((ctx, box, _ec, _vp, edit) => {
        ctx.fillStyle = "white";
        drawButtonBorder(ctx, box);
        const x = box.left + box.width * 0.5;
        const y = box.top + box.height * 0.5;
        const r = box.width * 0.333;
        drawBeam(ctx, x - r, y, x + r, y, 16, "black", edit.editDeck);
    });
}
function drawPlay(ctx, box) {
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
function drawPause(ctx, box) {
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
function playButton(edit) {
    return Flex(64, 0).onTap((_p, ec) => {
        const player = edit.getPlayer();
        if (player.speed() === 1) {
            player.pause(ec);
        }
        else {
            player.play(ec, 1);
        }
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        drawButtonBorder(ctx, box);
        if (edit.getPlayer().speed() === 1) {
            drawPause(ctx, box);
        }
        else {
            drawPlay(ctx, box);
        }
    });
}
function drawSlowMotion(ctx, box) {
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
function slowmotionButton(edit) {
    return Flex(64, 0).onTap((_p, ec) => {
        const player = edit.getPlayer();
        if (player.speed() === 0.1) {
            player.pause(ec);
        }
        else {
            player.play(ec, 0.1);
        }
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        drawButtonBorder(ctx, box);
        if (edit.getPlayer().speed() === 0.1) {
            drawPause(ctx, box);
        }
        else {
            drawSlowMotion(ctx, box);
        }
    });
}
function drawReset(ctx, box) {
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
function resetButton(edit) {
    return Flex(64, 0).onTap((_p, ec) => {
        const player = edit.getPlayer();
        if (player.speed() !== 0) {
            player.pause(ec);
        }
        player.seek(0, ec);
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        drawButtonBorder(ctx, box);
        drawReset(ctx, box);
    });
}
function tabFiller() {
    return Flex(0, 1).touchSink().onDraw((ctx, box) => {
        ctx.fillStyle = "gray";
        ctx.fillRect(box.left, box.top, box.width, box.height);
    });
}
export function SceneElement(sceneJSON) {
    const edit = new SceneEditor(sceneJSON);
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)], ["truss", TrussLayer(sceneJSON.truss)], ["add_truss", AddTrussLayer(edit)], ["simulate", SimulateLayer(edit)]);
    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");
    const tools = Switch(1, Left(undoButton(edit), redoButton(edit), tabFiller()), Left(deckButton(edit), tabFiller()), Left(resetButton(edit), slowmotionButton(edit), playButton(edit), tabFiller()));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 1), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.getPlayer().pause(ec); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.getPlayer().pause(ec); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => {
        tools.set(2, ec);
        sceneUI.set(ec, "terrain", "simulate");
    })))));
    // TODO: single global damping force based on speed. Forget damping beams?
    // TODO: scroll to zoom, mouse cursor counts as a tap. (use pointer events?)
    // TODO: max beam length (from material. make it depend on width? Maybe just have a buckling force done properly and it takes care of itself...)
    // TODO: fix materials
    // TODO: fix train simulation (make sure train can break apart, make only front disk turn, back disks have low friction?)
    // TODO: mode where if the whole train makes it across, the train teleports back to the beginning and gets heavier
    // TODO: draw train
    // TODO: material selection. (might need text layout, which is a whole can of worms...)
    // TODO: save/load
    // Have list of levels in some JSON resource file.
    // Have option to load json file from local.
    // auto-save every n seconds after change, key in local storage is uri of level json.
    // when loading, check local storage and load that instead if it exists (and the non editable parts match?)
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNyRCxPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3BELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFrQixJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBd0MsSUFBSSxFQUFFLEdBQUcsRUFBWSxRQUFRLEVBQWtCLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLGNBQWMsQ0FBQztBQXNDcE4sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFB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RyxTQUFTLEVBQUU7WUFDaEcsU0FBUztTQUNaO1FBQ0QsTUFBTSxDQUFDLEdBQUcsYUFBYSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFO1lBQ1YsR0FBRyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNqQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1NBQ1o7S0FDSjtJQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUM3QyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxFQUFFO1lBQ3ZFLFNBQVM7U0FDWjtRQUNELE1BQU0sQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRTtZQUNWLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDUixJQUFJLEdBQUcsQ0FBQyxDQUFDO1NBQ1o7S0FDSjtJQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUM1QyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxFQUFFO1lBQy9GLFNBQVM7U0FDWjtRQUNELE1BQU0sQ0FBQyxHQUFHLGFBQWEs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QUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7SUFDL0MsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sRUFBRSxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUIsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0IsR0FBRyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQztJQUNoQyxHQUFHLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN0QixHQUFHLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztJQUN2QixHQUFH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QUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUN6SyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFXLEVBQUUsRUFBa0IsRUFBRSxFQUFFO1FBQ2hFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FDTCxDQUNKLENBQ0osQ0FDSixDQUFDO0lBRUYsMEVBQTBFO0lBRTFFLDRFQUE0RTtJQUU1RSxnSkFBZ0o7SUFFaEosc0JBQXNCO0lBRXRCLHlIQUF5SDtJQUN6SCxrSEFBa0g7SUFDbEgsbUJBQW1CO0lBRW5CLHVGQUF1RjtJQUV2RixrQkFBa0I7SUFDbEIsa0RBQWtEO0lBQ2xELDRDQUE0QztJQUM1QyxxRkFBcUY7SUFDckYsMkdBQTJHO0FBQy9HLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbmltcG9ydCB7IFRydXNzU2ltUGxheWVyIH0gZnJvbSBcIi4vdHJ1c3NzaW1wbGF5ZXIuanNcIjtcbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuaW1wb3J0IHsgVHJ1c3NTaW0gfSBmcm9tIFwiLi90cnVzc3NpbS5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiO1xuaW1wb3J0IHsgU2NlbmVKU09OIH0gZnJvbSBcIi4vdHJ1c3NKU09OLmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbiAgICBkZWNrPzogYm9vbGVhbjsgLy8gSXMgdGhpcyBiZWFtIGEgZGVjaz8gKGRvIGRpc2NzIGNvbGxpZGUpXG59O1xuXG5leHBvcnQgdHlwZSBEaXNjID0ge1xuICAgIHA6IG51bWJlcjsgIC8vIEluZGV4IG9mIG1vdmVhYmxlIHBpbiB0aGlzIGRpc2Mgc3Vycm91bmRzLlxuICAgIG06IG51bWJlcjsgIC8vIE1hdGVyaWFsIG9mIGRpc2MuXG4gICAgcjogbnVtYmVyOyAgLy8gUmFkaXVzIG9mIGRpc2MuXG4gICAgdjogbnVtYmVyOyAgLy8gVmVsb2NpdHkgb2Ygc3VyZmFjZSBvZiBkaXNjIChpbiBDQ1cgZGlyZWN0aW9uKS5cbn07XG5cbmV4cG9ydCB0eXBlIE1hdGVyaWFsID0ge1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGtnL21eM1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICBtYXhMZW5ndGg6IG51bWJlcjtcbiAgICAvLyBUT0RPOiB3aGVuIHN0dWZmIGJyZWFrcywgd29yayBoYXJkZW5pbmcsIGV0Yy5cbn07XG5cbmV4cG9ydCB0eXBlIFRydXNzID0ge1xuICAgIGZpeGVkUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgdHJhaW5QaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBlZGl0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgdHJhaW5CZWFtczogQXJyYXk8QmVhbT47XG4gICAgZWRpdEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD47XG59O1xuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzOiBUcnVzcywgbTogbnVtYmVyKSB7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGlmIChtIDwgMCB8fCBtID49IG1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGggfHwgcGluID49IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQmVhbUV4aXN0cyh0cnVzczogVHJ1c3MsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy50cmFpbkJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnRyYWluUGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIC10cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKF90cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3M6IFRydXNzLCBwOiBQb2ludDJELCBtYXhkOiBudW1iZXIsIHBpblN0YXJ0OiBudW1iZXIsIG1heExlbmd0aDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICAvLyBUT0RPOiBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gUHJvYmFibHkgb25seSBtYXR0ZXJzIG9uY2Ugd2UgaGF2ZSAxMDAwcyBvZiBwaW5zP1xuICAgIGNvbnN0IHBTdGFydCA9IHRydXNzR2V0UGluKHRydXNzLCBwaW5TdGFydCk7XG4gICAgY29uc3QgYmxvY2sgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBsZXQgcmVzID0gdW5kZWZpbmVkO1xuICAgIGxldCByZXNkID0gbWF4ZDtcbiAgICBpZiAocGluU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MudHJhaW5CZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IHBpblN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBwaW5TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gcGluU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IHBpblN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChibG9jay5oYXMoaSAtIHRydXNzLmZpeGVkUGlucy5sZW5ndGgpIHx8IHBvaW50RGlzdGFuY2UocFN0YXJ0LCB0cnVzcy5maXhlZFBpbnNbaV0pID4gbWF4TGVuZ3RoKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5maXhlZFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy50cmFpblBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGJsb2NrLmhhcyhpKSB8fCBwb2ludERpc3RhbmNlKHBTdGFydCwgdHJ1c3MudHJhaW5QaW5zW2ldKSA+IG1heExlbmd0aCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MudHJhaW5QaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5lZGl0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYmxvY2suaGFzKGkgKyB0cnVzcy50cmFpblBpbnMubGVuZ3RoKSB8fCBwb2ludERpc3RhbmNlKHBTdGFydCwgdHJ1c3MuZWRpdFBpbnNbaV0pID4gbWF4TGVuZ3RoKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSArIHRydXNzLnRyYWluUGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmZpeGVkUGluc1t0cnVzcy5maXhlZFBpbnMubGVuZ3RoICsgcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IHRydXNzLnRyYWluUGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLnRyYWluUGluc1twaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIC0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZWRpdFBpbnNbcGluIC0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgVGVycmFpbiA9IHtcbiAgICBobWFwOiBBcnJheTxudW1iZXI+O1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbn07XG5cbnR5cGUgQWRkQmVhbUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9iZWFtXCI7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbD86IG51bWJlcjtcbiAgICBkZWNrPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgQWRkUGluQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX3BpblwiO1xuICAgIHBpbjogUG9pbnQyRDtcbn07XG5cbnR5cGUgQ29tcG9zaXRlQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiY29tcG9zaXRlXCI7XG4gICAgYWN0aW9uczogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufTtcblxudHlwZSBUcnVzc0FjdGlvbiA9IEFkZEJlYW1BY3Rpb24gfCBBZGRQaW5BY3Rpb24gfCBDb21wb3NpdGVBY3Rpb247XG5cbnR5cGUgT25BZGRQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPblJlbW92ZVBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZUVkaXRvciB7XG4gICAgc2NlbmU6IFNjZW5lSlNPTjtcbiAgICBwcml2YXRlIHBsYXllcjogVHJ1c3NTaW1QbGF5ZXIgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBvbkFkZFBpbkhhbmRsZXJzOiBBcnJheTxPbkFkZFBpbkhhbmRsZXI+O1xuICAgIHByaXZhdGUgb25SZW1vdmVQaW5IYW5kbGVyczogQXJyYXk8T25SZW1vdmVQaW5IYW5kbGVyPjtcbiAgICBlZGl0TWF0ZXJpYWw6IG51bWJlcjtcbiAgICBlZGl0V2lkdGg6IG51bWJlcjtcbiAgICBlZGl0RGVjazogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04pIHtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLnBsYXllciA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICAvLyBUT0RPOiBwcm9wZXIgaW5pdGlhbGl6YXRpb247XG4gICAgICAgIHRoaXMuZWRpdE1hdGVyaWFsID0gMDtcbiAgICAgICAgdGhpcy5lZGl0V2lkdGggPSAxO1xuICAgICAgICB0aGlzLmVkaXREZWNrID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBnZXRQbGF5ZXIoKTogVHJ1c3NTaW1QbGF5ZXIge1xuICAgICAgICBpZiAodGhpcy5wbGF5ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgVHJ1c3NTaW1QbGF5ZXIobmV3IFRydXNzU2ltKHRoaXMuc2NlbmUpLCAwLjAwMSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucGxheWVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAxID0gYS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBhLnAyO1xuICAgICAgICBjb25zdCBtID0gYS5tO1xuICAgICAgICBjb25zdCB3ID0gYS53O1xuICAgICAgICBjb25zdCBsID0gYS5sO1xuICAgICAgICBjb25zdCBkZWNrID0gYS5kZWNrO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzLCBtKTtcbiAgICAgICAgaWYgKHcgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gd2lkdGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7d31gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobCAhPT0gdW5kZWZpbmVkICYmIGwgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gbGVuZ3RoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke2x9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0cnVzcy5lZGl0QmVhbXMucHVzaCh7cDEsIHAyLCBtLCB3LCBsLCBkZWNrfSk7XG4gICAgICAgIFxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIHVuZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGIgPSB0cnVzcy5lZGl0QmVhbXMucG9wKCk7XG4gICAgICAgIGlmIChiID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gYmVhbXMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYi5wMSAhPT0gYS5wMSB8fCBiLnAyICE9PSBhLnAyIHx8IGIubSAhPT0gYS5tIHx8IGIudyAhPSBhLncgfHwgYi5sICE9PSBhLmwgfHwgYi5kZWNrICE9PSBhLmRlY2spIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQmVhbSBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgdHJ1c3MuZWRpdFBpbnMucHVzaChhLnBpbik7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uQWRkUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzcy5lZGl0UGlucy5wb3AoKTtcbiAgICAgICAgaWYgKHAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwaW5zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBbMF0gIT09IGEucGluWzBdIHx8IHBbMV0gIT09IGEucGluWzFdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbiBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEuYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gYS5hY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNjZW5lIGVudW1lcmF0aW9uL29ic2VydmF0aW9uIG1ldGhvZHNcblxuICAgIG9uQWRkUGluKGhhbmRsZXI6IE9uQWRkUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uQWRkUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICBvblJlbW92ZVBpbihoYW5kbGVyOiBPblJlbW92ZVBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogQ2xlYXIgaGFuZGxlcnM/XG5cbiAgICB1bmRvQ291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmUudW5kb1N0YWNrLmxlbmd0aDtcbiAgICB9XG5cbiAgICByZWRvQ291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmUucmVkb1N0YWNrLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBTY2VuZSBtdXRhdGlvbiBtZXRob2RzXG5cbiAgICB1bmRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS51bmRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byB1bmRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudW5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUucmVkb1N0YWNrLnB1c2goYSk7XG4gICAgICAgIGlmICh0aGlzLnBsYXllciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXllci5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnBsYXllciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnJlZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHJlZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUudW5kb1N0YWNrLnB1c2goYSk7XG4gICAgICAgIGlmICh0aGlzLnBsYXllciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnBsYXllci5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnBsYXllciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sgPSBbYV07XG4gICAgICAgIHRoaXMucmVkbyhlYyk7ICAgIC8vIFRPRE86IElzIHRoaXMgdG9vIGNsZXZlcj9cbiAgICB9XG5cbiAgICBhZGRCZWFtKFxuICAgICAgICBwMTogbnVtYmVyLFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFjdGlvbih7XG4gICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICBwMSxcbiAgICAgICAgICAgIHAyLFxuICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgIGw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgfSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbihwaW46IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJhZGRfcGluXCIsIHBpbn0sIGVjKTtcbiAgICB9XG5cbiAgICBhZGRQaW5BbmRCZWFtKFxuICAgICAgICBwaW46IFBvaW50MkQsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBjb25zdCBwMSA9IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImNvbXBvc2l0ZVwiLCBhY3Rpb25zOiBbXG4gICAgICAgICAgICB7IHR5cGU6IFwiYWRkX3BpblwiLCBwaW59LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgICAgICBwMSxcbiAgICAgICAgICAgICAgICBwMixcbiAgICAgICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICAgICAgfSxcbiAgICAgICAgXX0sIGVjKTtcbiAgICB9XG59O1xuXG50eXBlIENyZWF0ZUJlYW1QaW5TdGF0ZSA9IHtcbiAgICBlZGl0OiBTY2VuZUVkaXRvcixcbiAgICBpOiBudW1iZXIsXG4gICAgZHJhZz86IHsgcDogUG9pbnQyRCwgaT86IG51bWJlciB9LFxufTtcblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGN0eC5saW5lV2lkdGggPSAwLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBcbiAgICBpZiAoc3RhdGUuZHJhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcDEgPSB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuaSk7XG4gICAgY29uc3QgcDIgPSBzdGF0ZS5kcmFnLmkgPT09IHVuZGVmaW5lZCA/IHN0YXRlLmRyYWcucCA6IHRydXNzR2V0UGluKHRydXNzLCBzdGF0ZS5kcmFnLmkpO1xuICAgIGNvbnN0IHcgPSBzdGF0ZS5lZGl0LmVkaXRXaWR0aDtcbiAgICBjb25zdCBzdHlsZSA9IHRydXNzLm1hdGVyaWFsc1tzdGF0ZS5lZGl0LmVkaXRNYXRlcmlhbF0uc3R5bGU7XG4gICAgY29uc3QgZGVjayA9IHN0YXRlLmVkaXQuZWRpdERlY2s7XG4gICAgZHJhd0JlYW0oY3R4LCBwMVswXSwgcDFbMV0sIHAyWzBdLCBwMlsxXSwgdywgc3R5bGUsIGRlY2spO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25QYW4ocHM6IEFycmF5PFBhblBvaW50PiwgZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1heExlbmd0aCA9IHRydXNzLm1hdGVyaWFsc1tzdGF0ZS5lZGl0LmVkaXRNYXRlcmlhbF0ubWF4TGVuZ3RoO1xuICAgIGNvbnN0IHAwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGxldCBwID0gcHNbMF0uY3VycjtcbiAgICBjb25zdCBsZW5ndGggPSBwb2ludERpc3RhbmNlKHAwLCBwKTtcbiAgICAvLyBDYXAgYmVhbSBsZW5ndGggYXQgbWF4aW11bSBsZW5ndGg7XG4gICAgaWYgKGxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgICAgICAvLyBCYXJ5Y2VudHJpYyBjb29yZGluYXRlIG9mIG1heGltdW0gbGVuZ3RoIGZvciBtYXRlcmlhbCBvbiBsaW5lIHNlZ21lbnQgcCAtPiBwMC5cbiAgICAgICAgY29uc3QgdCA9IG1heExlbmd0aCAvIGxlbmd0aDtcbiAgICAgICAgcFswXSA9IHBbMF0gKiB0ICsgcDBbMF0gKiAoMSAtIHQpO1xuICAgICAgICBwWzFdID0gcFsxXSAqIHQgKyBwMFsxXSAqICgxIC0gdCk7XG4gICAgfVxuICAgIGNvbnN0IGkgPSB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3MsIHAsIDIsIHN0YXRlLmksIG1heExlbmd0aCk7XG4gICAgc3RhdGUuZHJhZyA9IHsgcCwgaSB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSAyLCBwWzFdIC0gMiwgNCwgNCwgeyBlZGl0LCBpIH0pXG4gICAgICAgIC5vbkRyYXcoY3JlYXRlQmVhbVBpbk9uRHJhdylcbiAgICAgICAgLm9uUGFuKGNyZWF0ZUJlYW1QaW5PblBhbilcbiAgICAgICAgLm9uUGFuRW5kKGNyZWF0ZUJlYW1QaW5PblBhbkVuZCk7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzRWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChsZXQgaSA9IHRydXNzRWRpdFBpbnNCZWdpbih0cnVzcyk7IGkgIT09IHRydXNzRWRpdFBpbnNFbmQodHJ1c3MpOyBpKyspIHtcbiAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKGVkaXQsIGkpKTtcbiAgICB9XG4gICAgY29uc3QgZSA9IFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcblxuICAgIGVkaXQub25BZGRQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIGFkZENoaWxkKGUsIENyZWF0ZUJlYW1QaW4oZWRpdCwgcGluKSwgZWMsIGVkaXRJbmRleCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcbiAgICBlZGl0Lm9uUmVtb3ZlUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVtb3ZpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIHJlbW92ZUNoaWxkKGUsIGVkaXRJbmRleCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBlLm9uRGV0YWNoIGZvciByZW1vdmVpbmcgcGluIG9ic2VydmVycy5cbiAgICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCB3aWR0aCA9IGVkaXQuc2NlbmUud2lkdGg7XG4gICAgY29uc3QgaGVpZ2h0ID0gZWRpdC5zY2VuZS5oZWlnaHQ7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBpZiAocFswXSA+IDAgJiYgcFswXSA8IHdpZHRoICYmIHBbMV0gPiAwICYmIHBbMV0gPCBoZWlnaHQpIHtcbiAgICAgICAgICAgIC8vIEJlYW1zIHNob3VsZCBvbmx5IGJlIGNyZWF0ZWQgZnJvbSBwaW5zIHN0cmljdGx5IGluc2lkZSB0aGUgc2NlbmUuXG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICAgICAgQWRkVHJ1c3NFZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGRyYXdCZWFtKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCB4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB4MjogbnVtYmVyLCB5MjogbnVtYmVyLCB3OiBudW1iZXIsIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm4sIGRlY2s/OiBib29sZWFuKSB7XG4gICAgY3R4LmxpbmVXaWR0aCA9IHc7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gc3R5bGU7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeDEsIHkxKTtcbiAgICBjdHgubGluZVRvKHgyLCB5Mik7XG4gICAgY3R4LnN0cm9rZSgpO1xuICAgIGlmIChkZWNrICE9PSB1bmRlZmluZWQgJiYgZGVjaykge1xuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcImJyb3duXCI7ICAvLyBUT0RPOiBkZWNrIHN0eWxlXG4gICAgICAgIGN0eC5saW5lV2lkdGggPSB3ICogMC43NTtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKHgxLCB5MSk7XG4gICAgICAgIGN0eC5saW5lVG8oeDIsIHkyKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gVHJ1c3NMYXllcih0cnVzczogVHJ1c3MpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbCh0cnVzcykub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgdHJ1c3M6IFRydXNzKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy50cmFpbkJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBwMSA9IHRydXNzR2V0UGluKHRydXNzLCBiLnAxKTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpXG4gICAgICAgICAgICBkcmF3QmVhbShjdHgsIHAxWzBdLCBwMVsxXSwgcDJbMF0sIHAyWzFdLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpO1xuICAgICAgICAgICAgY29uc3QgcDIgPSB0cnVzc0dldFBpbih0cnVzcywgYi5wMilcbiAgICAgICAgICAgIGRyYXdCZWFtKGN0eCwgcDFbMF0sIHAxWzFdLCBwMlswXSwgcDJbMV0sIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBkIG9mIHRydXNzLmRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gdHJ1c3MubWF0ZXJpYWxzW2QubV07XG4gICAgICAgICAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGQucCk7XG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gbS5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5lbGxpcHNlKHBbMF0sIHBbMV0sIGQuciwgZC5yLCAwLCAwLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbCgpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIFNpbXVsYXRlTGF5ZXIoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbChlZGl0KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBlZGl0LmdldFBsYXllcigpLnNpbS5kcmF3KGN0eCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdUZXJyYWluKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgdGVycmFpbjogVGVycmFpbikge1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgcGl0Y2ggPSBib3gud2lkdGggLyAoaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBsZWZ0ID0gdnAubGVmdCAtIGJveC5sZWZ0O1xuICAgIGNvbnN0IHJpZ2h0ID0gbGVmdCArIHZwLndpZHRoO1xuICAgIGNvbnN0IGJlZ2luID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5mbG9vcihsZWZ0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjb25zdCBlbmQgPSBNYXRoLm1heChNYXRoLm1pbihNYXRoLmNlaWwocmlnaHQgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSksIDApO1xuICAgIGN0eC5maWxsU3R5bGUgPSB0ZXJyYWluLnN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGJveC5sZWZ0LCBib3gudG9wICsgYm94LmhlaWdodCk7XG4gICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBpICogcGl0Y2gsIGJveC50b3AgKyBobWFwW2ldKTtcbiAgICB9XG4gICAgY3R4LmxpbmVUbyhib3gubGVmdCArIGJveC53aWR0aCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguZmlsbCgpO1xufVxuXG5mdW5jdGlvbiBkcmF3RmlsbChzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKSB7XG4gICAgcmV0dXJuIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHN0eWxlO1xuICAgICAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uVGFwKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgaWYgKGVkaXQudW5kb0NvdW50KCkgPiAwKSB7XG4gICAgICAgIGVkaXQudW5kbyhlYyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgY2N3OiBib29sZWFuKSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG5cbiAgICBjb25zdCBiID0gY2N3ID8gTWF0aC5QSSAqIDAuNzUgOiBNYXRoLlBJICogMC4yNTtcbiAgICBjb25zdCBlID0gY2N3ID8gTWF0aC5QSSAqIDEgOiBNYXRoLlBJICogMjtcbiAgICBjb25zdCBsID0gY2N3ID8gLU1hdGguUEkgKiAwLjMgOiBNYXRoLlBJICogMC4zO1xuICAgIGNvbnN0IHB4ID0gciAqIE1hdGguY29zKGUpO1xuICAgIGNvbnN0IHB5ID0gciAqIE1hdGguc2luKGUpXG4gICAgY29uc3QgdHggPSByICogTWF0aC5jb3MoZSAtIGwpIC0gcHg7XG4gICAgY29uc3QgdHkgPSByICogTWF0aC5zaW4oZSAtIGwpIC0gcHk7XG4gICAgY29uc3QgbnggPSAtdHkgLyBNYXRoLnNxcnQoMyk7XG4gICAgY29uc3QgbnkgPSB0eCAvIE1hdGguc3FydCgzKTtcbiAgICBcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmVsbGlwc2UoeCwgeSwgciwgciwgMCwgYiwgZSwgY2N3KTtcbiAgICBjdHgubW92ZVRvKHggKyBweCArIHR4ICsgbngsIHkgKyBweSArIHR5ICsgbnkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4ICsgdHggLSBueCwgeSArIHB5ICsgdHkgLSBueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3QnV0dG9uQm9yZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyAxLCBib3gudG9wICsgMSwgYm94LndpZHRoIC0gMiwgYm94LmhlaWdodCAtIDIpO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gZWRpdC51bmRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGRyYXdCdXR0b25Cb3JkZXIoY3R4LCBib3gpO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIHRydWUpO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKHVuZG9CdXR0b25UYXApLm9uRHJhdyh1bmRvQnV0dG9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCwgZWRpdCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGlmIChlZGl0LnJlZG9Db3VudCgpID4gMCkge1xuICAgICAgICAgICAgZWRpdC5yZWRvKGVjKTtcbiAgICAgICAgfVxuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gZWRpdC5yZWRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHgsIGJveCwgZmFsc2UpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkZWNrQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBlZGl0LmVkaXREZWNrID0gIWVkaXQuZWRpdERlY2s7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgICAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB4IC0gciwgeSwgeCArICByLCB5LCAxNiwgXCJibGFja1wiLCBlZGl0LmVkaXREZWNrKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZHJhd1BsYXkoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggLSBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3UGF1c2UoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gcGxheUJ1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCBwbGF5ZXIgPSBlZGl0LmdldFBsYXllcigpO1xuICAgICAgICBpZiAocGxheWVyLnNwZWVkKCkgPT09IDEpIHtcbiAgICAgICAgICAgIHBsYXllci5wYXVzZShlYyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwbGF5ZXIucGxheShlYywgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgaWYgKGVkaXQuZ2V0UGxheWVyKCkuc3BlZWQoKSA9PT0gMSkge1xuICAgICAgICAgICAgZHJhd1BhdXNlKGN0eCwgYm94KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyYXdQbGF5KGN0eCwgYm94KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3U2xvd01vdGlvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggLSBweCAqIDEuOCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSBweCAqIDEuOCwgeSArIHB5KTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIHNsb3dtb3Rpb25CdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3QgcGxheWVyID0gZWRpdC5nZXRQbGF5ZXIoKTtcbiAgICAgICAgaWYgKHBsYXllci5zcGVlZCgpID09PSAwLjEpIHtcbiAgICAgICAgICAgIHBsYXllci5wYXVzZShlYyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwbGF5ZXIucGxheShlYywgMC4xKTtcbiAgICAgICAgfVxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGRyYXdCdXR0b25Cb3JkZXIoY3R4LCBib3gpO1xuICAgICAgICBpZiAoZWRpdC5nZXRQbGF5ZXIoKS5zcGVlZCgpID09PSAwLjEpIHtcbiAgICAgICAgICAgIGRyYXdQYXVzZShjdHgsIGJveCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkcmF3U2xvd01vdGlvbihjdHgsIGJveCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZHJhd1Jlc2V0KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuICAgIGNvbnN0IHB4ID0gTWF0aC5jb3MoTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY29uc3QgcHkgPSBNYXRoLnNpbihNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHgsIHkgLSBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gciwgeSk7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHIsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gciwgeSAtIHB5KTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIHJlc2V0QnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHBsYXllciA9IGVkaXQuZ2V0UGxheWVyKCk7XG4gICAgICAgIGlmIChwbGF5ZXIuc3BlZWQoKSAhPT0gMCkge1xuICAgICAgICAgICAgcGxheWVyLnBhdXNlKGVjKTtcbiAgICAgICAgfVxuICAgICAgICBwbGF5ZXIuc2VlaygwLCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgZHJhd1Jlc2V0KGN0eCwgYm94KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gdGFiRmlsbGVyKCkge1xuICAgIHJldHVybiBGbGV4KDAsIDEpLnRvdWNoU2luaygpLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcImdyYXlcIjtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gU2NlbmVFbGVtZW50KHNjZW5lSlNPTjogU2NlbmVKU09OKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgZWRpdCA9IG5ldyBTY2VuZUVkaXRvcihzY2VuZUpTT04pO1xuXG4gICAgY29uc3Qgc2NlbmVVSSA9IE11eChcbiAgICAgICAgW1widGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCJdLFxuICAgICAgICBbXCJ0ZXJyYWluXCIsIEZpbGwoc2NlbmVKU09OLnRlcnJhaW4pLm9uRHJhdyhkcmF3VGVycmFpbildLFxuICAgICAgICBbXCJ0cnVzc1wiLCBUcnVzc0xheWVyKHNjZW5lSlNPTi50cnVzcyldLFxuICAgICAgICBbXCJhZGRfdHJ1c3NcIiwgQWRkVHJ1c3NMYXllcihlZGl0KV0sXG4gICAgICAgIFtcInNpbXVsYXRlXCIsIFNpbXVsYXRlTGF5ZXIoZWRpdCldLFxuICAgICk7XG5cbiAgICBjb25zdCBkcmF3UiA9IGRyYXdGaWxsKFwicmVkXCIpO1xuICAgIGNvbnN0IGRyYXdHID0gZHJhd0ZpbGwoXCJncmVlblwiKTtcbiAgICBjb25zdCBkcmF3QiA9IGRyYXdGaWxsKFwiYmx1ZVwiKTtcblxuICAgIGNvbnN0IHRvb2xzID0gU3dpdGNoKFxuICAgICAgICAxLFxuICAgICAgICBMZWZ0KHVuZG9CdXR0b24oZWRpdCksIHJlZG9CdXR0b24oZWRpdCksIHRhYkZpbGxlcigpKSxcbiAgICAgICAgTGVmdChkZWNrQnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgIExlZnQocmVzZXRCdXR0b24oZWRpdCksIHNsb3dtb3Rpb25CdXR0b24oZWRpdCksIHBsYXlCdXR0b24oZWRpdCksIHRhYkZpbGxlcigpKSxcbiAgICApO1xuXG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBTY3JvbGwoXG4gICAgICAgICAgICBCb3goXG4gICAgICAgICAgICAgICAgc2NlbmVKU09OLndpZHRoLCBzY2VuZUpTT04uaGVpZ2h0LFxuICAgICAgICAgICAgICAgIHNjZW5lVUksXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgMSxcbiAgICAgICAgKSxcbiAgICAgICAgQm90dG9tKFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICB0b29scywgIFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIEZsZXgoNjQsIDAsXG4gICAgICAgICAgICAgICAgTGVmdChcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdSKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyB0b29scy5zZXQoMCwgZWMpOyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIik7IGVkaXQuZ2V0UGxheWVyKCkucGF1c2UoZWMpIH0pLFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd0cpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgxLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiKTsgZWRpdC5nZXRQbGF5ZXIoKS5wYXVzZShlYyk7IH0pLFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd0IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b29scy5zZXQoMiwgZWMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInNpbXVsYXRlXCIpO1xuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgKSxcbiAgICApO1xuXG4gICAgLy8gVE9ETzogc2luZ2xlIGdsb2JhbCBkYW1waW5nIGZvcmNlIGJhc2VkIG9uIHNwZWVkLiBGb3JnZXQgZGFtcGluZyBiZWFtcz9cblxuICAgIC8vIFRPRE86IHNjcm9sbCB0byB6b29tLCBtb3VzZSBjdXJzb3IgY291bnRzIGFzIGEgdGFwLiAodXNlIHBvaW50ZXIgZXZlbnRzPylcblxuICAgIC8vIFRPRE86IG1heCBiZWFtIGxlbmd0aCAoZnJvbSBtYXRlcmlhbC4gbWFrZSBpdCBkZXBlbmQgb24gd2lkdGg/IE1heWJlIGp1c3QgaGF2ZSBhIGJ1Y2tsaW5nIGZvcmNlIGRvbmUgcHJvcGVybHkgYW5kIGl0IHRha2VzIGNhcmUgb2YgaXRzZWxmLi4uKVxuXG4gICAgLy8gVE9ETzogZml4IG1hdGVyaWFsc1xuXG4gICAgLy8gVE9ETzogZml4IHRyYWluIHNpbXVsYXRpb24gKG1ha2Ugc3VyZSB0cmFpbiBjYW4gYnJlYWsgYXBhcnQsIG1ha2Ugb25seSBmcm9udCBkaXNrIHR1cm4sIGJhY2sgZGlza3MgaGF2ZSBsb3cgZnJpY3Rpb24/KVxuICAgIC8vIFRPRE86IG1vZGUgd2hlcmUgaWYgdGhlIHdob2xlIHRyYWluIG1ha2VzIGl0IGFjcm9zcywgdGhlIHRyYWluIHRlbGVwb3J0cyBiYWNrIHRvIHRoZSBiZWdpbm5pbmcgYW5kIGdldHMgaGVhdmllclxuICAgIC8vIFRPRE86IGRyYXcgdHJhaW5cblxuICAgIC8vIFRPRE86IG1hdGVyaWFsIHNlbGVjdGlvbi4gKG1pZ2h0IG5lZWQgdGV4dCBsYXlvdXQsIHdoaWNoIGlzIGEgd2hvbGUgY2FuIG9mIHdvcm1zLi4uKVxuXG4gICAgLy8gVE9ETzogc2F2ZS9sb2FkXG4gICAgLy8gSGF2ZSBsaXN0IG9mIGxldmVscyBpbiBzb21lIEpTT04gcmVzb3VyY2UgZmlsZS5cbiAgICAvLyBIYXZlIG9wdGlvbiB0byBsb2FkIGpzb24gZmlsZSBmcm9tIGxvY2FsLlxuICAgIC8vIGF1dG8tc2F2ZSBldmVyeSBuIHNlY29uZHMgYWZ0ZXIgY2hhbmdlLCBrZXkgaW4gbG9jYWwgc3RvcmFnZSBpcyB1cmkgb2YgbGV2ZWwganNvbi5cbiAgICAvLyB3aGVuIGxvYWRpbmcsIGNoZWNrIGxvY2FsIHN0b3JhZ2UgYW5kIGxvYWQgdGhhdCBpbnN0ZWFkIGlmIGl0IGV4aXN0cyAoYW5kIHRoZSBub24gZWRpdGFibGUgcGFydHMgbWF0Y2g/KVxufVxuIl19