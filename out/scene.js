// Copyright Charles Dueck 2020
import { TrussSimPlayer } from "./trusssimplayer.js";
import { pointDistance } from "./point.js";
import { TrussSim } from "./trusssim.js";
import { addChild, Bottom, Box, Fill, Flex, Layer, Left, Mux, Position, Relative, removeChild, Scroll, Tabs } from "./ui/node.js";
import { linearGradient, viridis } from "./colormap.js";
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
function colorMapButton(edit) {
    return Flex(64, 0).onTap((_p, ec) => {
        const sim = edit.getPlayer().sim;
        if (sim.color === undefined) {
            sim.color = viridis;
        }
        else {
            sim.color = undefined;
        }
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        drawButtonBorder(ctx, box);
        const sim = edit.getPlayer().sim;
        if (sim.color === undefined) {
            ctx.strokeStyle = linearGradient(ctx, viridis, 10, box.left + box.width * 0.2, box.top + box.width * 0.2, box.left + box.width * 0.8, box.top + box.height * 0.8);
        }
        else {
            ctx.strokeStyle = "black";
        }
        ctx.lineWidth = box.width * 0.1;
        ctx.beginPath();
        ctx.moveTo(box.left + box.width * 0.2, box.top + box.width * 0.2);
        ctx.lineTo(box.left + box.width * 0.8, box.top + box.height * 0.8);
        ctx.stroke();
    });
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
function drawTab(ctx, box, active) {
    ctx.fillStyle = active ? "white" : "lightgray";
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? "black" : "darkgray";
    ctx.beginPath();
    ctx.moveTo(box.left + 1, box.top + box.height - 1);
    ctx.lineTo(box.left + 1, box.top + 1);
    ctx.lineTo(box.left + box.width - 1, box.top + 1);
    ctx.lineTo(box.left + box.width - 1, box.top + box.height - 1);
    ctx.stroke();
}
function drawUndoRedoTab(ctx, box, _ec, _vp, active) {
    drawTab(ctx, box, active);
    const innerBox = {
        left: box.left,
        width: box.width * 0.7,
        top: box.top,
        height: box.height,
    };
    drawCircleWithArrow(ctx, innerBox, true);
    innerBox.left = box.left + box.width * 0.3;
    drawCircleWithArrow(ctx, innerBox, false);
}
function drawEditTab(ctx, box, _ec, _vp, active) {
    drawTab(ctx, box, active);
}
function drawSimulateTab(ctx, box, _ec, _vp, active) {
    drawTab(ctx, box, active);
    drawPlay(ctx, box);
}
export function SceneElement(sceneJSON) {
    const edit = new SceneEditor(sceneJSON);
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)], ["truss", TrussLayer(sceneJSON.truss)], ["add_truss", AddTrussLayer(edit)], ["simulate", SimulateLayer(edit)]);
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 1), Bottom(Flex(128, 0, Tabs(64, [
        Flex(64, 0, false).onDraw(drawUndoRedoTab),
        Left(undoButton(edit), redoButton(edit), tabFiller()),
        (ec) => { sceneUI.set(ec, "terrain", "truss"); },
    ], [
        Flex(64, 0, true).onDraw(drawEditTab),
        Left(deckButton(edit), tabFiller()),
        (ec) => { sceneUI.set(ec, "terrain", "truss", "add_truss"); },
    ], [
        Flex(64, 0, false).onDraw(drawSimulateTab),
        Left(colorMapButton(edit), resetButton(edit), slowmotionButton(edit), playButton(edit), tabFiller()),
        (ec) => { sceneUI.set(ec, "terrain", "simulate"); },
        (ec) => { edit.getPlayer().pause(ec); },
    ]))));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRS9CLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNyRCxPQUFPLEVBQVcsYUFBYSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3BELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDekMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFrQixJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBd0MsSUFBSSxFQUFFLEdBQUcsRUFBWSxRQUFRLEVBQWtCLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUVsTixPQUFPLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxNQUFNLGVBQWUsQ0FBQztBQXFDeEQsU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDMUUsT0FBTyxJQUFJLENBQUM7U0FDZjtLQUNKO0lBQ0QsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1FBQ2pDLElBQUksQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUMxRSxPQUFPLElBQUksQ0FBQztTQUNmO0tBQ0o7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxLQUFZO0lBQ3BDLE9BQU8sS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFDbEMsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsS0FBWTtJQUNsQyxPQUFPLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO0FBQzFELENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUFDLEtBQVk7SUFDMUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO0FBQ25DLENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLE1BQWE7SUFDekMsT0FBTyxDQUFDLENBQUM7QUFDYixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxLQUFZLEVBQUUsQ0FBVSxFQUFFLElBQVksRUFBRSxRQUFnQixFQUFFLFNBQWlCO0lBQ25HLG1GQUFtRjtJQUNuRixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDaEMsSUFBSSxHQUFHLEdBQUcsU0FBUyxDQUFDO0lBQ3BCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztJQUNoQixJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUU7UUFDeEIsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1lBQzlCLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxRQUFRLEVBQUU7Z0JBQ25CLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ25CO2lCQUFNLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxRQUFRLEVBQUU7Z0JBQzFCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ25CO1NBQ0o7UUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7WUFDN0IsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRTtnQkFDbkIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDbkI7aUJBQU0sSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLFFBQVEsRUFBRTtnQkFDMUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDbkI7U0FDSjtLQUNKO0lBQ0QsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQzdDLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxhQUFhLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxTQUFTLEVBQUU7WUFDaEcsU0FBUztTQUNaO1FBQ0QsTUFBTSxDQUFDLEdBQUcsYUFBYSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxFQUFFO1lBQ1YsR0FBRyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNqQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1NBQ1o7S0FDSjtJQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUM3QyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxFQUFFO1lBQ3ZFLFNBQVM7U0FDWjtRQUNELE1BQU0sQ0FBQyxHQUFHLGFBQWEsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksRUFBRTtZQUNWLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDUixJQUFJLEdBQUcsQ0FBQyxDQUFDO1NBQ1o7S0FDSjtJQUNELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUM1QyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcs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R0FBRyxDQUFDLENBQUM7SUFDMUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQztJQUMvQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUMxQixNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5QixNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU3QixHQUFHLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO0lBQ2hDLEdBQUcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3RCLEdBQUcsQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO0lBQ3ZCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN0QyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVB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QUFFLFNBQVMsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkUsQ0FBQyxFQUFrQixFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUMxRCxDQUNKLENBQ0osQ0FDSixDQUNKLENBQUM7SUFFRixzQkFBc0I7SUFFdEIsK0dBQStHO0lBRS9HLHVJQUF1STtJQUV2SSx5SEFBeUg7SUFDekgsa0hBQWtIO0lBRWxILHVGQUF1RjtJQUV2RixrQkFBa0I7SUFDbEIsa0RBQWtEO0lBQ2xELDRDQUE0QztJQUM1QyxxRkFBcUY7SUFDckYsMkdBQTJHO0FBQy9HLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbmltcG9ydCB7IFRydXNzU2ltUGxheWVyIH0gZnJvbSBcIi4vdHJ1c3NzaW1wbGF5ZXIuanNcIjtcbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuaW1wb3J0IHsgVHJ1c3NTaW0gfSBmcm9tIFwiLi90cnVzc3NpbS5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgVGFicyB9IGZyb20gXCIuL3VpL25vZGUuanNcIjtcbmltcG9ydCB7IFNjZW5lSlNPTiB9IGZyb20gXCIuL3RydXNzSlNPTi5qc1wiO1xuaW1wb3J0IHsgbGluZWFyR3JhZGllbnQsIHZpcmlkaXMgfSBmcm9tIFwiLi9jb2xvcm1hcC5qc1wiO1xuXG5leHBvcnQgdHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBiZWdpbm5pbmcgb2YgYmVhbS5cbiAgICBwMjogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgZW5kIG9mIGJlYW0uXG4gICAgbTogbnVtYmVyOyAgLy8gSW5kZXggb2YgbWF0ZXJpYWwgb2YgYmVhbS5cbiAgICB3OiBudW1iZXI7ICAvLyBXaWR0aCBvZiBiZWFtLlxuICAgIGw/OiBudW1iZXI7IC8vIExlbmd0aCBvZiBiZWFtLCBvbmx5IHNwZWNpZmllZCB3aGVuIHByZS1zdHJhaW5pbmcuXG4gICAgZGVjaz86IGJvb2xlYW47IC8vIElzIHRoaXMgYmVhbSBhIGRlY2s/IChkbyBkaXNjcyBjb2xsaWRlKVxufTtcblxuZXhwb3J0IHR5cGUgRGlzYyA9IHtcbiAgICBwOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtb3ZlYWJsZSBwaW4gdGhpcyBkaXNjIHN1cnJvdW5kcy5cbiAgICBtOiBudW1iZXI7ICAvLyBNYXRlcmlhbCBvZiBkaXNjLlxuICAgIHI6IG51bWJlcjsgIC8vIFJhZGl1cyBvZiBkaXNjLlxuICAgIHY6IG51bWJlcjsgIC8vIFZlbG9jaXR5IG9mIHN1cmZhY2Ugb2YgZGlzYyAoaW4gQ0NXIGRpcmVjdGlvbikuXG59O1xuXG5leHBvcnQgdHlwZSBNYXRlcmlhbCA9IHtcbiAgICBFOiBudW1iZXI7ICAvLyBZb3VuZydzIG1vZHVsdXMgaW4gUGEuXG4gICAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBrZy9tXjNcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgbWF4TGVuZ3RoOiBudW1iZXI7XG4gICAgLy8gVE9ETzogd2hlbiBzdHVmZiBicmVha3MsIHdvcmsgaGFyZGVuaW5nLCBldGMuXG59O1xuXG5leHBvcnQgdHlwZSBUcnVzcyA9IHtcbiAgICBmaXhlZFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHRyYWluUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgZWRpdFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHRyYWluQmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGVkaXRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZGlzY3M6IEFycmF5PERpc2M+O1xuICAgIG1hdGVyaWFsczogQXJyYXk8TWF0ZXJpYWw+O1xufTtcblxuZnVuY3Rpb24gdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzczogVHJ1c3MsIG06IG51bWJlcikge1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBpZiAobSA8IDAgfHwgbSA+PSBtYXRlcmlhbHMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBtYXRlcmlhbCBpbmRleCAke219YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKSB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoIHx8IHBpbiA+PSB0cnVzcy50cmFpblBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0JlYW1FeGlzdHModHJ1c3M6IFRydXNzLCBwMTogbnVtYmVyLCBwMjogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MudHJhaW5CZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy50cmFpblBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0VkaXRQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnRyYWluUGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzVW5lZGl0YWJsZVBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZChfdHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NHZXRDbG9zZXN0UGluKHRydXNzOiBUcnVzcywgcDogUG9pbnQyRCwgbWF4ZDogbnVtYmVyLCBwaW5TdGFydDogbnVtYmVyLCBtYXhMZW5ndGg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgLy8gVE9ETzogYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIFByb2JhYmx5IG9ubHkgbWF0dGVycyBvbmNlIHdlIGhhdmUgMTAwMHMgb2YgcGlucz9cbiAgICBjb25zdCBwU3RhcnQgPSB0cnVzc0dldFBpbih0cnVzcywgcGluU3RhcnQpO1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgbGV0IHJlcyA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcmVzZCA9IG1heGQ7XG4gICAgaWYgKHBpblN0YXJ0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnRyYWluQmVhbXMpIHtcbiAgICAgICAgICAgIGlmIChiLnAxID09PSBwaW5TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gcGluU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IHBpblN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBwaW5TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYmxvY2suaGFzKGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB8fCBwb2ludERpc3RhbmNlKHBTdGFydCwgdHJ1c3MuZml4ZWRQaW5zW2ldKSA+IG1heExlbmd0aCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MuZml4ZWRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpIC0gdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MudHJhaW5QaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChibG9jay5oYXMoaSkgfHwgcG9pbnREaXN0YW5jZShwU3RhcnQsIHRydXNzLnRyYWluUGluc1tpXSkgPiBtYXhMZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLnRyYWluUGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaTtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGJsb2NrLmhhcyhpICsgdHJ1c3MudHJhaW5QaW5zLmxlbmd0aCkgfHwgcG9pbnREaXN0YW5jZShwU3RhcnQsIHRydXNzLmVkaXRQaW5zW2ldKSA+IG1heExlbmd0aCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MuZWRpdFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgKyB0cnVzcy50cmFpblBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gdHJ1c3NHZXRQaW4odHJ1c3M6IFRydXNzLCBwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgIGlmIChwaW4gPCAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua293biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfSBlbHNlIGlmIChwaW4gPCAwKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5maXhlZFBpbnNbdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCArIHBpbl07XG4gICAgfSBlbHNlIGlmIChwaW4gPCB0cnVzcy50cmFpblBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy50cmFpblBpbnNbcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiAtIHRydXNzLnRyYWluUGlucy5sZW5ndGggPCB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmVkaXRQaW5zW3BpbiAtIHRydXNzLnRyYWluUGlucy5sZW5ndGhdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmV4cG9ydCB0eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8bnVtYmVyPjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG59O1xuXG50eXBlIEFkZEJlYW1BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfYmVhbVwiO1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw/OiBudW1iZXI7XG4gICAgZGVjaz86IGJvb2xlYW47XG59O1xuXG50eXBlIEFkZFBpbkFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9waW5cIjtcbiAgICBwaW46IFBvaW50MkQ7XG59O1xuXG50eXBlIENvbXBvc2l0ZUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImNvbXBvc2l0ZVwiO1xuICAgIGFjdGlvbnM6IEFycmF5PFRydXNzQWN0aW9uPjtcbn07XG5cbnR5cGUgVHJ1c3NBY3Rpb24gPSBBZGRCZWFtQWN0aW9uIHwgQWRkUGluQWN0aW9uIHwgQ29tcG9zaXRlQWN0aW9uO1xuXG50eXBlIE9uQWRkUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25SZW1vdmVQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgY2xhc3MgU2NlbmVFZGl0b3Ige1xuICAgIHNjZW5lOiBTY2VuZUpTT047XG4gICAgcHJpdmF0ZSBwbGF5ZXI6IFRydXNzU2ltUGxheWVyIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgb25BZGRQaW5IYW5kbGVyczogQXJyYXk8T25BZGRQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIG9uUmVtb3ZlUGluSGFuZGxlcnM6IEFycmF5PE9uUmVtb3ZlUGluSGFuZGxlcj47XG4gICAgZWRpdE1hdGVyaWFsOiBudW1iZXI7XG4gICAgZWRpdFdpZHRoOiBudW1iZXI7XG4gICAgZWRpdERlY2s6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgLy8gVE9ETzogcHJvcGVyIGluaXRpYWxpemF0aW9uO1xuICAgICAgICB0aGlzLmVkaXRNYXRlcmlhbCA9IDA7XG4gICAgICAgIHRoaXMuZWRpdFdpZHRoID0gMTtcbiAgICAgICAgdGhpcy5lZGl0RGVjayA9IHRydWU7XG4gICAgfVxuXG4gICAgZ2V0UGxheWVyKCk6IFRydXNzU2ltUGxheWVyIHtcbiAgICAgICAgaWYgKHRoaXMucGxheWVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMucGxheWVyID0gbmV3IFRydXNzU2ltUGxheWVyKG5ldyBUcnVzc1NpbSh0aGlzLnNjZW5lKSwgMC4wMDEsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnBsYXllcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwMSA9IGEucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYS5wMjtcbiAgICAgICAgY29uc3QgbSA9IGEubTtcbiAgICAgICAgY29uc3QgdyA9IGEudztcbiAgICAgICAgY29uc3QgbCA9IGEubDtcbiAgICAgICAgY29uc3QgZGVjayA9IGEuZGVjaztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzcywgbSk7XG4gICAgICAgIGlmICh3IDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIHdpZHRoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke3d9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGwgIT09IHVuZGVmaW5lZCAmJiBsIDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGxlbmd0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHtsfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHAxLCBwMikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBiZXR3ZWVuIHBpbnMgJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ1c3MuZWRpdEJlYW1zLnB1c2goe3AxLCBwMiwgbSwgdywgbCwgZGVja30pO1xuICAgICAgICBcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSB1bmRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBiID0gdHJ1c3MuZWRpdEJlYW1zLnBvcCgpO1xuICAgICAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGJlYW1zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGIucDEgIT09IGEucDEgfHwgYi5wMiAhPT0gYS5wMiB8fCBiLm0gIT09IGEubSB8fCBiLncgIT0gYS53IHx8IGIubCAhPT0gYS5sIHx8IGIuZGVjayAhPT0gYS5kZWNrKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JlYW0gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIHRydXNzLmVkaXRQaW5zLnB1c2goYS5waW4pO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vbkFkZFBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwID0gdHJ1c3MuZWRpdFBpbnMucG9wKCk7XG4gICAgICAgIGlmIChwID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcGlucyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwWzBdICE9PSBhLnBpblswXSB8fCBwWzFdICE9PSBhLnBpblsxXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQaW4gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnRyYWluUGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IGEuYWN0aW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTY2VuZSBlbnVtZXJhdGlvbi9vYnNlcnZhdGlvbiBtZXRob2RzXG5cbiAgICBvbkFkZFBpbihoYW5kbGVyOiBPbkFkZFBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgb25SZW1vdmVQaW4oaGFuZGxlcjogT25SZW1vdmVQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IENsZWFyIGhhbmRsZXJzP1xuXG4gICAgdW5kb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnVuZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgcmVkb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnJlZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgbXV0YXRpb24gbWV0aG9kc1xuXG4gICAgdW5kbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUudW5kb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gdW5kb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICBpZiAodGhpcy5wbGF5ZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZWRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS5yZWRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byByZWRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnVuZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICBpZiAodGhpcy5wbGF5ZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5wbGF5ZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2NlbmUucmVkb1N0YWNrID0gW2FdO1xuICAgICAgICB0aGlzLnJlZG8oZWMpOyAgICAvLyBUT0RPOiBJcyB0aGlzIHRvbyBjbGV2ZXI/XG4gICAgfVxuXG4gICAgYWRkQmVhbShcbiAgICAgICAgcDE6IG51bWJlcixcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGlmICh0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHAxLCBwMikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBiZXR3ZWVuIHBpbnMgJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hY3Rpb24oe1xuICAgICAgICAgICAgdHlwZTogXCJhZGRfYmVhbVwiLFxuICAgICAgICAgICAgcDEsXG4gICAgICAgICAgICBwMixcbiAgICAgICAgICAgIG06IHRoaXMuZWRpdE1hdGVyaWFsLFxuICAgICAgICAgICAgdzogdGhpcy5lZGl0V2lkdGgsXG4gICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBkZWNrOiB0aGlzLmVkaXREZWNrXG4gICAgICAgIH0sIGVjKTtcbiAgICB9XG5cbiAgICBhZGRQaW4ocGluOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5hY3Rpb24oe3R5cGU6IFwiYWRkX3BpblwiLCBwaW59LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluQW5kQmVhbShcbiAgICAgICAgcGluOiBQb2ludDJELFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgY29uc3QgcDEgPSB0cnVzcy50cmFpblBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJjb21wb3NpdGVcIiwgYWN0aW9uczogW1xuICAgICAgICAgICAgeyB0eXBlOiBcImFkZF9waW5cIiwgcGlufSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICAgICAgcDEsXG4gICAgICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICAgICAgdzogdGhpcy5lZGl0V2lkdGgsXG4gICAgICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF19LCBlYyk7XG4gICAgfVxufTtcblxudHlwZSBDcmVhdGVCZWFtUGluU3RhdGUgPSB7XG4gICAgZWRpdDogU2NlbmVFZGl0b3IsXG4gICAgaTogbnVtYmVyLFxuICAgIGRyYWc/OiB7IHA6IFBvaW50MkQsIGk/OiBudW1iZXIgfSxcbn07XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBjdHgubGluZVdpZHRoID0gMC41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGNvbnN0IHAyID0gc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQgPyBzdGF0ZS5kcmFnLnAgOiB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICBjb25zdCB3ID0gc3RhdGUuZWRpdC5lZGl0V2lkdGg7XG4gICAgY29uc3Qgc3R5bGUgPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLnN0eWxlO1xuICAgIGNvbnN0IGRlY2sgPSBzdGF0ZS5lZGl0LmVkaXREZWNrO1xuICAgIGRyYXdCZWFtKGN0eCwgcDFbMF0sIHAxWzFdLCBwMlswXSwgcDJbMV0sIHcsIHN0eWxlLCBkZWNrKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBtYXhMZW5ndGggPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLm1heExlbmd0aDtcbiAgICBjb25zdCBwMCA9IHRydXNzR2V0UGluKHRydXNzLCBzdGF0ZS5pKTtcbiAgICBsZXQgcCA9IHBzWzBdLmN1cnI7XG4gICAgY29uc3QgbGVuZ3RoID0gcG9pbnREaXN0YW5jZShwMCwgcCk7XG4gICAgLy8gQ2FwIGJlYW0gbGVuZ3RoIGF0IG1heGltdW0gbGVuZ3RoO1xuICAgIGlmIChsZW5ndGggPiBtYXhMZW5ndGgpIHtcbiAgICAgICAgLy8gQmFyeWNlbnRyaWMgY29vcmRpbmF0ZSBvZiBtYXhpbXVtIGxlbmd0aCBmb3IgbWF0ZXJpYWwgb24gbGluZSBzZWdtZW50IHAgLT4gcDAuXG4gICAgICAgIGNvbnN0IHQgPSBtYXhMZW5ndGggLyBsZW5ndGg7XG4gICAgICAgIHBbMF0gPSBwWzBdICogdCArIHAwWzBdICogKDEgLSB0KTtcbiAgICAgICAgcFsxXSA9IHBbMV0gKiB0ICsgcDBbMV0gKiAoMSAtIHQpO1xuICAgIH1cbiAgICBjb25zdCBpID0gdHJ1c3NHZXRDbG9zZXN0UGluKHRydXNzLCBwLCAyLCBzdGF0ZS5pLCBtYXhMZW5ndGgpO1xuICAgIHN0YXRlLmRyYWcgPSB7IHAsIGkgfTtcbiAgICBlYy5yZXF1ZXN0RHJhdygpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25QYW5FbmQoZWM6IEVsZW1lbnRDb250ZXh0LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGlmIChzdGF0ZS5kcmFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gZHJhZyBzdGF0ZSBPblBhbkVuZFwiKTtcbiAgICB9XG4gICAgaWYgKHN0YXRlLmRyYWcuaSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHN0YXRlLmVkaXQuYWRkUGluQW5kQmVhbShzdGF0ZS5kcmFnLnAsIHN0YXRlLmksIGVjKTtcbiAgICB9IGVsc2UgaWYgKCF0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHN0YXRlLmRyYWcuaSwgc3RhdGUuaSkpIHtcbiAgICAgICAgLy8gVE9ETzogcmVwbGFjZSBleGlzdGluZyBiZWFtIGlmIG9uZSBleGlzdHMgKGFuZCBpcyBlZGl0YWJsZSkuXG4gICAgICAgIHN0YXRlLmVkaXQuYWRkQmVhbShzdGF0ZS5kcmFnLmksIHN0YXRlLmksIGVjKTtcbiAgICB9XG4gICAgc3RhdGUuZHJhZyA9IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gQ3JlYXRlQmVhbVBpbihlZGl0OiBTY2VuZUVkaXRvciwgaTogbnVtYmVyKTogUG9zaXRpb25MYXlvdXQ8YW55LCBhbnk+IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgcCA9IHRydXNzR2V0UGluKHRydXNzLCBpKTtcbiAgICAvLyBJZiB3ZSBoYWQgc3RhdGUgdGhhdCB3YXMgcGFzc2VkIHRvIGFsbCBoYW5kbGVycywgdGhlbiB3ZSBjb3VsZCBhdm9pZCBhbGxvY2F0aW5nIG5ldyBoYW5kbGVycyBwZXIgRWxlbWVudC5cbiAgICByZXR1cm4gUG9zaXRpb248Q3JlYXRlQmVhbVBpblN0YXRlPihwWzBdIC0gMiwgcFsxXSAtIDIsIDQsIDQsIHsgZWRpdCwgaSB9KVxuICAgICAgICAub25EcmF3KGNyZWF0ZUJlYW1QaW5PbkRyYXcpXG4gICAgICAgIC5vblBhbihjcmVhdGVCZWFtUGluT25QYW4pXG4gICAgICAgIC5vblBhbkVuZChjcmVhdGVCZWFtUGluT25QYW5FbmQpO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0VkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc0VkaXRQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc0VkaXRQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgfVxuICAgIGNvbnN0IGUgPSBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG5cbiAgICBlZGl0Lm9uQWRkUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgYWRkaW5nIEVsZW1lbnQgZm9yIHBpbiAke3Bpbn0gYXQgY2hpbGRbJHtlZGl0SW5kZXh9XWApO1xuICAgICAgICBhZGRDaGlsZChlLCBDcmVhdGVCZWFtUGluKGVkaXQsIHBpbiksIGVjLCBlZGl0SW5kZXgpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG4gICAgZWRpdC5vblJlbW92ZVBpbigoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYHJlbW92aW5nIEVsZW1lbnQgZm9yIHBpbiAke3Bpbn0gYXQgY2hpbGRbJHtlZGl0SW5kZXh9XWApO1xuICAgICAgICByZW1vdmVDaGlsZChlLCBlZGl0SW5kZXgsIGVjKTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pO1xuXG4gICAgLy8gVE9ETzogZS5vbkRldGFjaCBmb3IgcmVtb3ZlaW5nIHBpbiBvYnNlcnZlcnMuXG4gICAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzVW5lZGl0YWJsZVBpbnMoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3Qgd2lkdGggPSBlZGl0LnNjZW5lLndpZHRoO1xuICAgIGNvbnN0IGhlaWdodCA9IGVkaXQuc2NlbmUuaGVpZ2h0O1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChsZXQgaSA9IHRydXNzVW5lZGl0YWJsZVBpbnNCZWdpbih0cnVzcyk7IGkgIT09IHRydXNzVW5lZGl0YWJsZVBpbnNFbmQodHJ1c3MpOyBpKyspIHtcbiAgICAgICAgY29uc3QgcCA9IHRydXNzR2V0UGluKHRydXNzLCBpKTtcbiAgICAgICAgaWYgKHBbMF0gPiAwICYmIHBbMF0gPCB3aWR0aCAmJiBwWzFdID4gMCAmJiBwWzFdIDwgaGVpZ2h0KSB7XG4gICAgICAgICAgICAvLyBCZWFtcyBzaG91bGQgb25seSBiZSBjcmVhdGVkIGZyb20gcGlucyBzdHJpY3RseSBpbnNpZGUgdGhlIHNjZW5lLlxuICAgICAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKGVkaXQsIGkpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gUmVsYXRpdmUoLi4uY2hpbGRyZW4pO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc0xheWVyKHNjZW5lOiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhzY2VuZSksXG4gICAgICAgIEFkZFRydXNzRWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICApO1xufVxuXG5mdW5jdGlvbiBkcmF3QmVhbShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgeDE6IG51bWJlciwgeTE6IG51bWJlciwgeDI6IG51bWJlciwgeTI6IG51bWJlciwgdzogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBkZWNrPzogYm9vbGVhbikge1xuICAgIGN0eC5saW5lV2lkdGggPSB3O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHgxLCB5MSk7XG4gICAgY3R4LmxpbmVUbyh4MiwgeTIpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBpZiAoZGVjayAhPT0gdW5kZWZpbmVkICYmIGRlY2spIHtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICBjdHgubGluZVdpZHRoID0gdyAqIDAuNzU7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyh4MSwgeTEpO1xuICAgICAgICBjdHgubGluZVRvKHgyLCB5Mik7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFRydXNzTGF5ZXIodHJ1c3M6IFRydXNzKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwodHJ1c3MpLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHRydXNzOiBUcnVzcykgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MudHJhaW5CZWFtcykge1xuICAgICAgICAgICAgY29uc3QgcDEgPSB0cnVzc0dldFBpbih0cnVzcywgYi5wMSk7XG4gICAgICAgICAgICBjb25zdCBwMiA9IHRydXNzR2V0UGluKHRydXNzLCBiLnAyKVxuICAgICAgICAgICAgZHJhd0JlYW0oY3R4LCBwMVswXSwgcDFbMV0sIHAyWzBdLCBwMlsxXSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBwMSA9IHRydXNzR2V0UGluKHRydXNzLCBiLnAxKTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpXG4gICAgICAgICAgICBkcmF3QmVhbShjdHgsIHAxWzBdLCBwMVsxXSwgcDJbMF0sIHAyWzFdLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZCBvZiB0cnVzcy5kaXNjcykge1xuICAgICAgICAgICAgY29uc3QgbSA9IHRydXNzLm1hdGVyaWFsc1tkLm1dO1xuICAgICAgICAgICAgY29uc3QgcCA9IHRydXNzR2V0UGluKHRydXNzLCBkLnApO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IG0uc3R5bGU7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZShwWzBdLCBwWzFdLCBkLnIsIGQuciwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBTaW11bGF0ZUxheWVyKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwoZWRpdCkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgZWRpdC5nZXRQbGF5ZXIoKS5zaW0uZHJhdyhjdHgpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGNjdzogYm9vbGVhbikge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuXG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAwLjc1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAxIDogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC4zIDogTWF0aC5QSSAqIDAuMztcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhlKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihlKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGUgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGUgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgXG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUsIGNjdyk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0J1dHRvbkJvcmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQudW5kb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eCwgYm94LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCh1bmRvQnV0dG9uVGFwKS5vbkRyYXcodW5kb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgICAgIGVkaXQucmVkbyhlYyk7XG4gICAgICAgIH1cbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQucmVkb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIGZhbHNlKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZGVja0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgZWRpdC5lZGl0RGVjayA9ICFlZGl0LmVkaXREZWNrO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICAgICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgICAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgeCAtIHIsIHksIHggKyAgciwgeSwgMTYsIFwiYmxhY2tcIiwgZWRpdC5lZGl0RGVjayk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQbGF5KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuICAgIGNvbnN0IHB4ID0gTWF0aC5jb3MoTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY29uc3QgcHkgPSBNYXRoLnNpbihNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgciwgeSk7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1BhdXNlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuICAgIGNvbnN0IHB4ID0gTWF0aC5jb3MoTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY29uc3QgcHkgPSBNYXRoLnNpbihNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubW92ZVRvKHggLSBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSBweCwgeSAtIHB5KTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIHBsYXlCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3QgcGxheWVyID0gZWRpdC5nZXRQbGF5ZXIoKTtcbiAgICAgICAgaWYgKHBsYXllci5zcGVlZCgpID09PSAxKSB7XG4gICAgICAgICAgICBwbGF5ZXIucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheWVyLnBsYXkoZWMsIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGlmIChlZGl0LmdldFBsYXllcigpLnNwZWVkKCkgPT09IDEpIHtcbiAgICAgICAgICAgIGRyYXdQYXVzZShjdHgsIGJveCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkcmF3UGxheShjdHgsIGJveCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZHJhd1Nsb3dNb3Rpb24oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggLSBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHggKiAxLjgsIHkgLSBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHggKiAxLjgsIHkgKyBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBzbG93bW90aW9uQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHBsYXllciA9IGVkaXQuZ2V0UGxheWVyKCk7XG4gICAgICAgIGlmIChwbGF5ZXIuc3BlZWQoKSA9PT0gMC4xKSB7XG4gICAgICAgICAgICBwbGF5ZXIucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheWVyLnBsYXkoZWMsIDAuMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgaWYgKGVkaXQuZ2V0UGxheWVyKCkuc3BlZWQoKSA9PT0gMC4xKSB7XG4gICAgICAgICAgICBkcmF3UGF1c2UoY3R4LCBib3gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZHJhd1Nsb3dNb3Rpb24oY3R4LCBib3gpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdSZXNldChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggLSByLCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHIsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBjb2xvck1hcEJ1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCBzaW0gPSBlZGl0LmdldFBsYXllcigpLnNpbTtcbiAgICAgICAgaWYgKHNpbS5jb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBzaW0uY29sb3IgPSB2aXJpZGlzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltLmNvbG9yID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcblxuICAgICAgICBjb25zdCBzaW0gPSBlZGl0LmdldFBsYXllcigpLnNpbTtcbiAgICAgICAgaWYgKHNpbS5jb2xvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBsaW5lYXJHcmFkaWVudChjdHgsIHZpcmlkaXMsIDEwLFxuICAgICAgICAgICAgICAgIGJveC5sZWZ0ICsgYm94LndpZHRoICogMC4yLFxuICAgICAgICAgICAgICAgIGJveC50b3AgKyBib3gud2lkdGggKiAwLjIsXG4gICAgICAgICAgICAgICAgYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjgsXG4gICAgICAgICAgICAgICAgYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgICAgICB9XG4gICAgICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhib3gubGVmdCArIGJveC53aWR0aCAqIDAuMiwgYm94LnRvcCArIGJveC53aWR0aCAqIDAuMik7XG4gICAgICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjgsIGJveC50b3AgKyBib3guaGVpZ2h0ICogMC44KTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiByZXNldEJ1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCBwbGF5ZXIgPSBlZGl0LmdldFBsYXllcigpO1xuICAgICAgICBpZiAocGxheWVyLnNwZWVkKCkgIT09IDApIHtcbiAgICAgICAgICAgIHBsYXllci5wYXVzZShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgcGxheWVyLnNlZWsoMCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdSZXNldChjdHgsIGJveCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHRhYkZpbGxlcigpIHtcbiAgICByZXR1cm4gRmxleCgwLCAxKS50b3VjaFNpbmsoKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJncmF5XCI7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZHJhd1RhYihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGFjdGl2ZTogYm9vbGVhbikge1xuICAgIGN0eC5maWxsU3R5bGUgPSBhY3RpdmUgPyBcIndoaXRlXCIgOiBcImxpZ2h0Z3JheVwiO1xuICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gYWN0aXZlID8gXCJibGFja1wiIDogXCJkYXJrZ3JheVwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIGJveC5oZWlnaHQgLSAxKTtcbiAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEpO1xuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGggLSAxLCBib3gudG9wICsgMSk7XG4gICAgY3R4LmxpbmVUbyhib3gubGVmdCArIGJveC53aWR0aCAtIDEsIGJveC50b3AgKyBib3guaGVpZ2h0IC0gMSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3VW5kb1JlZG9UYWIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgYWN0aXZlOiBib29sZWFuKSB7XG4gICAgZHJhd1RhYihjdHgsIGJveCwgYWN0aXZlKTtcbiAgICBjb25zdCBpbm5lckJveDogTGF5b3V0Qm94ID0ge1xuICAgICAgICBsZWZ0OiBib3gubGVmdCxcbiAgICAgICAgd2lkdGg6IGJveC53aWR0aCAqIDAuNyxcbiAgICAgICAgdG9wOiBib3gudG9wLFxuICAgICAgICBoZWlnaHQ6IGJveC5oZWlnaHQsXG4gICAgfVxuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBpbm5lckJveCwgdHJ1ZSk7XG4gICAgaW5uZXJCb3gubGVmdCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC4zO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBpbm5lckJveCwgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBkcmF3RWRpdFRhYihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBhY3RpdmU6IGJvb2xlYW4pIHtcbiAgICBkcmF3VGFiKGN0eCwgYm94LCBhY3RpdmUpO1xufVxuXG5mdW5jdGlvbiBkcmF3U2ltdWxhdGVUYWIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgYWN0aXZlOiBib29sZWFuKSB7XG4gICAgZHJhd1RhYihjdHgsIGJveCwgYWN0aXZlKTtcbiAgICBkcmF3UGxheShjdHgsIGJveCk7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGVkaXQgPSBuZXcgU2NlbmVFZGl0b3Ioc2NlbmVKU09OKTtcblxuICAgIGNvbnN0IHNjZW5lVUkgPSBNdXgoXG4gICAgICAgIFtcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiXSxcbiAgICAgICAgW1widGVycmFpblwiLCBGaWxsKHNjZW5lSlNPTi50ZXJyYWluKS5vbkRyYXcoZHJhd1RlcnJhaW4pXSxcbiAgICAgICAgW1widHJ1c3NcIiwgVHJ1c3NMYXllcihzY2VuZUpTT04udHJ1c3MpXSxcbiAgICAgICAgW1wiYWRkX3RydXNzXCIsIEFkZFRydXNzTGF5ZXIoZWRpdCldLFxuICAgICAgICBbXCJzaW11bGF0ZVwiLCBTaW11bGF0ZUxheWVyKGVkaXQpXSxcbiAgICApO1xuXG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBTY3JvbGwoXG4gICAgICAgICAgICBCb3goXG4gICAgICAgICAgICAgICAgc2NlbmVKU09OLndpZHRoLCBzY2VuZUpTT04uaGVpZ2h0LFxuICAgICAgICAgICAgICAgIHNjZW5lVUksXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgMSxcbiAgICAgICAgKSxcbiAgICAgICAgQm90dG9tKFxuICAgICAgICAgICAgRmxleCgxMjgsIDAsXG4gICAgICAgICAgICAgICAgVGFicyg2NCxcbiAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCwgZmFsc2UpLm9uRHJhdyhkcmF3VW5kb1JlZG9UYWIpLFxuICAgICAgICAgICAgICAgICAgICAgICAgTGVmdCh1bmRvQnV0dG9uKGVkaXQpLCByZWRvQnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAoZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgfSxcbiAgICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCwgdHJ1ZSkub25EcmF3KGRyYXdFZGl0VGFiKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIExlZnQoZGVja0J1dHRvbihlZGl0KSwgdGFiRmlsbGVyKCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgKGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIik7IH0sXG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDAsIGZhbHNlKS5vbkRyYXcoZHJhd1NpbXVsYXRlVGFiKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIExlZnQoY29sb3JNYXBCdXR0b24oZWRpdCksIHJlc2V0QnV0dG9uKGVkaXQpLCBzbG93bW90aW9uQnV0dG9uKGVkaXQpLCBwbGF5QnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAoZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJzaW11bGF0ZVwiKTsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIChlYzogRWxlbWVudENvbnRleHQpID0+IHsgZWRpdC5nZXRQbGF5ZXIoKS5wYXVzZShlYyk7IH0sXG4gICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICksXG4gICAgICAgICksXG4gICAgKTtcblxuICAgIC8vIFRPRE86IGZpeCBtYXRlcmlhbHNcblxuICAgIC8vIFRPRE86IGdyaWQuIGp1c3QgbW9yZSBvYmplY3RzIGluIHNjZW5lPyAoc28gdW5kbyB3b3JrcykgUHJvYmFibHkgbmVlZCB0byBtYWtlIGEgZHluYW1pYyBjaGlsZCB1aSBub2RlIHRoaW5nLlxuXG4gICAgLy8gVE9ETzogdHJhaW4gZ2V0cyBoZWF2aWVyIGFuZCByZXNldHMgYWZ0ZXIgaXQgY3Jvc3NlcyB0aGUgYnJpZGdlLiBIYXZlIGEgc2NvcmUgKHBhcnRpYWwgcG9pbnRzIGZvciB0aGUgdHJhaW4gbWFraW5nIGl0IGFjcm9zcyBicm9rZW4pXG5cbiAgICAvLyBUT0RPOiBmaXggdHJhaW4gc2ltdWxhdGlvbiAobWFrZSBzdXJlIHRyYWluIGNhbiBicmVhayBhcGFydCwgbWFrZSBvbmx5IGZyb250IGRpc2sgdHVybiwgYmFjayBkaXNrcyBoYXZlIGxvdyBmcmljdGlvbj8pXG4gICAgLy8gVE9ETzogbW9kZSB3aGVyZSBpZiB0aGUgd2hvbGUgdHJhaW4gbWFrZXMgaXQgYWNyb3NzLCB0aGUgdHJhaW4gdGVsZXBvcnRzIGJhY2sgdG8gdGhlIGJlZ2lubmluZyBhbmQgZ2V0cyBoZWF2aWVyXG5cbiAgICAvLyBUT0RPOiBtYXRlcmlhbCBzZWxlY3Rpb24uIChtaWdodCBuZWVkIHRleHQgbGF5b3V0LCB3aGljaCBpcyBhIHdob2xlIGNhbiBvZiB3b3Jtcy4uLilcblxuICAgIC8vIFRPRE86IHNhdmUvbG9hZFxuICAgIC8vIEhhdmUgbGlzdCBvZiBsZXZlbHMgaW4gc29tZSBKU09OIHJlc291cmNlIGZpbGUuXG4gICAgLy8gSGF2ZSBvcHRpb24gdG8gbG9hZCBqc29uIGZpbGUgZnJvbSBsb2NhbC5cbiAgICAvLyBhdXRvLXNhdmUgZXZlcnkgbiBzZWNvbmRzIGFmdGVyIGNoYW5nZSwga2V5IGluIGxvY2FsIHN0b3JhZ2UgaXMgdXJpIG9mIGxldmVsIGpzb24uXG4gICAgLy8gd2hlbiBsb2FkaW5nLCBjaGVjayBsb2NhbCBzdG9yYWdlIGFuZCBsb2FkIHRoYXQgaW5zdGVhZCBpZiBpdCBleGlzdHMgKGFuZCB0aGUgbm9uIGVkaXRhYmxlIHBhcnRzIG1hdGNoPylcbn1cbiJdfQ==