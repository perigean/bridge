// Copyright Charles Dueck 2020
import { pointDistance } from "./point.js";
import { RungeKutta4 } from "./rk4.js";
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
function trussMovingPinsCount(truss) {
    return truss.startPins.length + truss.editPins.length;
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
class SceneSimulator {
    constructor(scene, h, keyInterval) {
        this.h = h;
        this.tLatest = 0;
        this.keyInterval = keyInterval;
        this.keyframes = new Map();
        const truss = scene.truss;
        // Cache fixed pin values.
        const fixedPins = new Float32Array(truss.fixedPins.length * 2);
        for (let i = 0; i < truss.fixedPins.length; i++) {
            fixedPins[i * 2] = truss.fixedPins[i][0];
            fixedPins[i * 2 + 1] = truss.fixedPins[i][1];
        }
        this.fixedPins = fixedPins;
        // Cache Beam values.
        const beams = [...truss.startBeams, ...truss.editBeams].map(b => ({
            p1: b.p1,
            p2: b.p2,
            m: b.m,
            w: b.w,
            l: b.l !== undefined ? b.l : pointDistance(trussGetPin(truss, b.p1), trussGetPin(truss, b.p2)),
            deck: b.deck !== undefined ? b.deck : false,
        }));
        // Cache discs.
        const discs = truss.discs; // TODO: do we ever wnat to mutate discs?
        // Cache materials.
        const materials = truss.materials; // TODO: do we ever want to mutate materials?
        // Compute the mass of all pins.
        const movingPins = trussMovingPinsCount(truss);
        const mass = new Float32Array(movingPins);
        function addMass(pin, m) {
            if (pin < 0) {
                // Fixed pins already have infinite mass.
                return;
            }
            mass[pin] += m;
        }
        for (const b of beams) {
            const m = b.l * b.w * materials[b.m].density;
            // Distribute the mass between the two end pins.
            // TODO: do proper mass moment of intertia calculation when rotating beams?
            addMass(b.p1, m * 0.5);
            addMass(b.p2, m * 0.5);
        }
        for (const d of discs) {
            const m = d.r * d.r * Math.PI * materials[d.m].density;
            addMass(d.p, m);
        }
        // Check that everything that can move has some mass.
        for (const m of mass) {
            if (m <= 0) {
                throw new Error("mass 0 pin detected");
            }
        }
        // Cache the terrain, set up acceleration structure for deck intersections.
        const tFriction = scene.terrain.friction;
        const height = scene.height;
        const pitch = scene.width / (scene.terrain.hmap.length - 1);
        const hmap = scene.terrain.hmap.map((h, i) => {
            if (i + 1 >= scene.terrain.hmap.length) {
                return {
                    height: h,
                    nx: 0.0,
                    ny: -1.0,
                    decks: [],
                    deckCount: 0,
                };
            }
            const dy = scene.terrain.hmap[i + 1] - h;
            const l = Math.sqrt(dy * dy + pitch * pitch);
            return {
                height: h,
                nx: dy / l,
                ny: -pitch / l,
                decks: [],
                deckCount: 0,
            };
        });
        function hmapAddDeck(i, d) {
            if (i < 0 || i >= hmap.length) {
                return;
            }
            const h = hmap[i];
            h.decks[h.deckCount] = d;
            h.deckCount++;
        }
        // State accessors
        const vIndex = movingPins * 2;
        function getdx(y, pin) {
            if (pin < 0) {
                return fixedPins[fixedPins.length + pin * 2];
            }
            else {
                return y[pin * 2 + 0];
            }
        }
        function getdy(y, pin) {
            if (pin < 0) {
                return fixedPins[fixedPins.length + pin * 2 + 1];
            }
            else {
                return y[pin * 2 + 1];
            }
        }
        function getvx(y, pin) {
            if (pin < 0) {
                return 0.0;
            }
            else {
                return y[vIndex + pin * 2];
            }
        }
        function getvy(y, pin) {
            if (pin < 0) {
                return 0.0;
            }
            else {
                return y[vIndex + pin * 2 + 1];
            }
        }
        function setdx(y, pin, val) {
            if (pin >= 0) {
                y[pin * 2 + 0] = val;
            }
        }
        function setdy(y, pin, val) {
            if (pin >= 0) {
                y[pin * 2 + 1] = val;
            }
        }
        function setvx(y, pin, val) {
            if (pin >= 0) {
                y[vIndex + pin * 2 + 0] = val;
            }
        }
        function setvy(y, pin, val) {
            if (pin >= 0) {
                y[vIndex + pin * 2 + 1] = val;
            }
        }
        function force(dydt, pin, fx, fy) {
            if (pin >= 0) {
                const m = mass[pin];
                dydt[vIndex + pin * 2 + 0] += fx / m;
                dydt[vIndex + pin * 2 + 1] += fy / m;
            }
        }
        // Set up initial ODE state. NB: velocities are all zero.
        const y0 = new Float32Array(movingPins * 4);
        for (let i = 0; i < movingPins; i++) {
            const d = trussGetPin(truss, i);
            setdx(y0, i, d[0]);
            setdy(y0, i, d[1]);
        }
        // Cache acceleration due to gravity.
        const g = scene.g;
        this.dydt = function dydy(_t, y, dydt) {
            // Derivative of position is velocity.
            for (let i = 0; i < movingPins; i++) {
                setdx(dydt, i, getvx(y, i));
                setdy(dydt, i, getvy(y, i));
            }
            // Acceleration due to gravity.
            for (let i = 0; i < movingPins; i++) {
                setvx(dydt, i, g[0]);
                setvy(dydt, i, g[1]);
            }
            // Decks are updated in hmap in the below loop through beams, so clear the previous values.
            for (const h of hmap) {
                h.deckCount = 0;
            }
            // Acceleration due to beam stress.
            for (const beam of beams) {
                const p1 = beam.p1;
                const p2 = beam.p2;
                if (p1 < 0 && p2 < 0) {
                    // Both ends are not moveable.
                    continue;
                }
                const E = materials[beam.m].E;
                const w = beam.w;
                const l0 = beam.l;
                const dx = getdx(y, p2) - getdx(y, p1);
                const dy = getdy(y, p2) - getdy(y, p1);
                const l = Math.sqrt(dx * dx + dy * dy);
                const k = E * w / l0;
                const springF = (l - l0) * k;
                const ux = dx / l; // Unit vector in directino of beam;
                const uy = dy / l;
                // Beam stress force.
                force(dydt, p1, ux * springF, uy * springF);
                force(dydt, p2, -ux * springF, -uy * springF);
                // Damping force.
                const zeta = 0.5;
                const vx = getvx(y, p2) - getvx(y, p1); // Velocity of p2 relative to p1.
                const vy = getvy(y, p2) - getvy(y, p1);
                const v = vx * ux + vy * uy; // Velocity of p2 relative to p1 in direction of beam.
                if (p1 >= 0 && p2 >= 0) {
                    const m1 = mass[p1];
                    const m2 = mass[p2];
                    const dampF = v * zeta * Math.sqrt(k * m1 * m2 / (m1 + m2));
                    force(dydt, p1, ux * dampF, uy * dampF);
                    force(dydt, p2, -ux * dampF, -uy * dampF);
                }
                else if (p1 >= 0) {
                    const m1 = mass[p1];
                    const dampF = v * zeta * Math.sqrt(k * m1);
                    force(dydt, p1, ux * dampF, uy * dampF);
                }
                else if (p2 >= 0) {
                    const m2 = mass[p2];
                    const dampF = v * zeta * Math.sqrt(k * m2);
                    force(dydt, p2, -ux * dampF, -uy * dampF);
                }
                // Add decks to accleration structure
                if (beam.deck) {
                    const i1 = Math.floor(getdx(y, p1) / pitch);
                    const i2 = Math.floor(getdx(y, p2) / pitch);
                    const begin = Math.min(i1, i2);
                    const end = Math.max(i1, i2);
                    for (let i = begin; i <= end; i++) {
                        hmapAddDeck(i, beam);
                    }
                }
            }
            // Acceleration due to terrain collision
            // TODO: scene border collision
            for (let i = 0; i < movingPins; i++) {
                const dx = getdx(y, i); // Pin position.
                const dy = getdy(y, i);
                const m = mass[i];
                let bounceF = 1000.0 * m; // Acceleration per metre of depth under terrain.
                let nx; // Terrain unit normal (direction of acceleration).
                let ny;
                if (dx < 0.0) {
                    nx = 0.0;
                    ny = -1.0;
                    bounceF *= dy - height + hmap[0].height;
                }
                else {
                    const ti = Math.min(hmap.length - 1, Math.floor(dx / pitch));
                    nx = hmap[ti].nx;
                    ny = hmap[ti].ny;
                    // Distance below terrain is normal dot vector from terrain to point.
                    bounceF *= -(nx * (dx - ti * pitch) + ny * (dy - hmap[ti].height));
                }
                if (bounceF <= 0.0) {
                    // We are not bouncing.
                    continue;
                }
                force(dydt, i, nx * bounceF, ny * bounceF);
                // Friction.
                // Apply acceleration in proportion to at, in direction opposite of tangent projected velocity.
                const tx = ny;
                const ty = -nx;
                const vx = getvx(y, i);
                const vy = getvy(y, i);
                const tv = vx * tx + vy * ty;
                let frictionF = tFriction * bounceF * (tv > 0 ? -1 : 1);
                force(dydt, i, tx * frictionF, ty * frictionF);
                // Old Code
                // TODO: why did this need to cap the acceleration? maybe bounce force is too high?
                //const af = Math.min(tFriction * at, Math.abs(tv * 100)) * (tv >= 0.0 ? -1.0 : 1.0);
            }
            // TODO: discs
        };
        this.method = new RungeKutta4(y0, this.dydt);
        this.keyframes.set(this.method.t, new Float32Array(this.method.y));
    }
    seekTimes() {
        return this.keyframes.keys();
    }
    seek(t) {
        const y = this.keyframes.get(t);
        if (y === undefined) {
            throw new Error(`${t} is not a keyframe time`);
        }
        this.method.y = y;
        this.method.t = t;
    }
    time() {
        return this.method.t;
    }
    next() {
        this.method.next(this.h);
        if (this.tLatest < this.method.t) {
            this.keyframes.set(this.method.t, new Float32Array(this.method.y));
            if (this.keyframes.size > 1 + Math.ceil(this.method.t / this.keyInterval)) {
                this.keyframes.delete(this.tLatest);
            }
            this.tLatest = this.method.t;
        }
    }
    simulate(until) {
        while (this.method.t < until) {
            this.next();
        }
    }
    getPin(pin) {
        if (pin < 0) {
            const i = this.fixedPins.length + pin * 2;
            return [this.fixedPins[i], this.fixedPins[i + 1]];
        }
        else {
            const i = pin * 2;
            const y = this.method.y;
            return [y[i], y[i + 1]];
        }
    }
}
;
export class SceneEditor {
    constructor(scene) {
        this.scene = scene;
        this.sim = undefined;
        this.onResetSimulatorHandlers = [];
        this.onAddPinHandlers = [];
        this.onRemovePinHandlers = [];
        // TODO: proper initialization;
        this.editMaterial = 0;
        this.editWidth = 4;
        this.editDeck = true;
    }
    simulator() {
        if (this.sim === undefined) {
            this.sim = new SceneSimulator(this.scene, 0.001, 1);
        }
        return this.sim;
    }
    resetSimulator(ec) {
        this.sim = undefined;
        for (const handler of this.onResetSimulatorHandlers) {
            handler(ec);
        }
    }
    onResetSimulator(handler) {
        this.onResetSimulatorHandlers.push(handler);
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
        this.resetSimulator(ec);
    }
    redo(ec) {
        const a = this.scene.redoStack.pop();
        if (a === undefined) {
            throw new Error("no action to redo");
        }
        this.doAction(a, ec);
        this.scene.undoStack.push(a);
        this.resetSimulator(ec);
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
    const p1 = trussGetPin(truss, state.i);
    const p2 = state.drag.i === undefined ? state.drag.p : trussGetPin(truss, state.drag.i);
    const w = state.edit.editWidth;
    const style = truss.materials[state.edit.editMaterial].style;
    const deck = state.edit.editDeck;
    drawBeam(ctx, p1, p2, w, style, deck);
}
function createBeamPinOnPan(ps, ec, state) {
    const truss = state.edit.scene.truss;
    const i = trussGetClosestPin(truss, ps[0].curr, 8, state.i);
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
function drawBeam(ctx, p1, p2, w, style, deck) {
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
    if (deck !== undefined && deck) {
        ctx.strokeStyle = "brown"; // TODO: deck style
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
    }
}
function trussLayerOnDraw(ctx, _box, _ec, _vp, truss) {
    for (const b of truss.startBeams) {
        drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style, b.deck);
    }
    for (const b of truss.editBeams) {
        drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style, b.deck);
    }
}
function TrussLayer(truss) {
    return Fill(truss).onDraw(trussLayerOnDraw);
}
function simulateLayerOnDraw(ctx, _box, _ec, _vp, edit) {
    const scene = edit.scene;
    const truss = scene.truss;
    const sim = edit.simulator();
    for (const b of truss.startBeams) {
        drawBeam(ctx, sim.getPin(b.p1), sim.getPin(b.p2), b.w, truss.materials[b.m].style, b.deck);
    }
    for (const b of truss.editBeams) {
        drawBeam(ctx, sim.getPin(b.p1), sim.getPin(b.p2), b.w, truss.materials[b.m].style, b.deck);
    }
}
function SimulateLayer(edit) {
    return Fill(edit).onDraw(simulateLayerOnDraw);
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
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)], ["truss", TrussLayer(sceneJSON.truss)], ["add_truss", AddTrussLayer(edit)], ["simulate", SimulateLayer(edit)]);
    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");
    const tools = Switch(1, Left(undoButton(edit), redoButton(edit)), Fill().onDraw(drawG), Fill().onDraw(drawB));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 2), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => {
        tools.set(2, ec);
        sceneUI.set(ec, "terrain", "simulate");
        ec.timer((t, ec) => {
            edit.simulator().simulate(t / 1000);
            ec.requestDraw();
        }, undefined);
    })))));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBNkNwTixTQUFTLG1CQUFtQixDQUFDLEtBQVksRUFBRSxDQUFTO0lBQ2hELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDbEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxTQUFTLENBQUMsTUFBTSxFQUFFO1FBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDbEQ7QUFDTCxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBWSxFQUFFLEdBQVc7SUFDN0MsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUU7UUFDeEYsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxFQUFFLENBQUMsQ0FBQztLQUMvQztBQUNMLENBQUM7QUFFRCxTQUFTLGVBQWUsQ0FBQyxLQUFZLEVBQUUsRUFBVSxFQUFFLEVBQVU7SUFDekQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFO1FBQ2hDLElBQUks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TUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9FLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdFLEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztJQUM5QixHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDaEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNDLEtBQUssSUFBSSxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDL0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLENBQUMsR0FBRyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN2RDtJQUNELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZELEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxRQUFRLENBQUMsS0FBOEM7SUFDNUQsT0FBTyxDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEVBQUU7UUFDckQsR0FBRyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdEIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFBO0FBQ0wsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEVBQVcsRUFBRSxFQUFrQixFQUFFLElBQWlCO0lBQ3JFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRTtRQUN0QixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2pCO0FBQ0wsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBNkIsRUFBRSxDQUFTLEVBQUUsQ0FBUyxFQUFFLENBQVMsRUFBRSxHQUFZO0lBQ3JHLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQy9DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBRWIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDM0IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDL0MsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDL0MsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEdBQW1CLEVBQUUsR0FBYyxFQUFFLElBQWlCO0lBQ3pILEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDO0lBQ3hCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRXZELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQzVELEdBQUcsQ0FBQyxXQUFXLEdBQUcsU0FBUyxDQUFDO0lBQzVCLEdBQUcsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO0lBQzFCLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3RCLG1CQUFtQixDQUNmLEdBQUcsRUFDSCxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxFQUMxQixHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxFQUMxQixFQUFFLEVBQ0YsSUFBSSxDQUNQLENBQUM7QUFDTixDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsSUFBaUI7SUFDakMsT0FBTyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ3pFLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxFQUFXLEVBQUUsRUFBa0IsRUFBRSxJQUFpQjtJQUNyRSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLEVBQUU7UUFDdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUNqQjtBQUNMLENBQUM7QUFFRCxTQUFTLGNBQWMsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxHQUFtQixFQUFFLEdBQWMsRUFBRSxJQUFpQjtJQUN6SCxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQztJQUN4QixHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUV2RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUM1RCxHQUFHLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztJQUM1QixHQUFHLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUMxQixHQUFHLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixHQUFHLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN0QixtQkFBbUIsQ0FDZixHQUFHLEVBQ0gsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsRUFDMUIsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFDMUIsRUFBRSxFQUNGLEtBQUssQ0FDUixDQUFDO0FBQ04sQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLElBQWlCO0lBQ2pDLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUN6RSxDQUFDO0FBQ0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUE0QkU7QUFFRixNQUFNLFVBQVUsWUFBWSxDQUFDLFNBQW9CO0lBQzdDLE1BQU0sSUFBSSxHQUFHLElBQUksV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRXhDLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FDZixDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLEVBQ2pDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQ3hELENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFDdEMsQ0FBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQ2xDLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUNwQyxDQUFDO0lBRUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzlCLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFL0IsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUNoQixDQUFDLEVBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDeEMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUNwQixJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQ3ZCLENBQUM7SUFFRixPQUFPLEtBQUssQ0FDUixNQUFNLENBQ0YsR0FBRyxDQUNDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLE1BQU0sRUFDakMsT0FBTyxDQUNWLEVBQ0QsU0FBUyxFQUNULENBQUMsQ0FDSixFQUNELE1BQU0sQ0FDRixJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDTixLQUFLLENBQ1IsRUFDRCxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUMsRUFDTixJQUFJLENBQ0EsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ2hJLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQVcsRUFBRSxFQUFrQixFQUFFLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDN0ksSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUNoRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdkMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQVMsRUFBRSxFQUFrQixFQUFFLEVBQUU7WUFDdkMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3JCLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FDTCxDQUNKLENBQ0osQ0FDSixDQUFDO0FBQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgRGVyaXZhdGl2ZSB9IGZyb20gXCIuL29kZS5qc1wiO1xuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG5pbXBvcnQgeyBSdW5nZUt1dHRhNCB9IGZyb20gXCIuL3JrNC5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiO1xuXG5leHBvcnQgdHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBiZWdpbm5pbmcgb2YgYmVhbS5cbiAgICBwMjogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgZW5kIG9mIGJlYW0uXG4gICAgbTogbnVtYmVyOyAgLy8gSW5kZXggb2YgbWF0ZXJpYWwgb2YgYmVhbS5cbiAgICB3OiBudW1iZXI7ICAvLyBXaWR0aCBvZiBiZWFtLlxuICAgIGw/OiBudW1iZXI7IC8vIExlbmd0aCBvZiBiZWFtLCBvbmx5IHNwZWNpZmllZCB3aGVuIHByZS1zdHJhaW5pbmcuXG4gICAgZGVjaz86IGJvb2xlYW47IC8vIElzIHRoaXMgYmVhbSBhIGRlY2s/IChkbyBkaXNjcyBjb2xsaWRlKVxufTtcblxudHlwZSBTaW11bGF0aW9uQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsOiBudW1iZXI7XG4gICAgZGVjazogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgRGlzYyA9IHtcbiAgICBwOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtb3ZlYWJsZSBwaW4gdGhpcyBkaXNjIHN1cnJvdW5kcy5cbiAgICBtOiBudW1iZXI7ICAvLyBNYXRlcmlhbCBvZiBkaXNjLlxuICAgIHI6IG51bWJlcjsgIC8vIFJhZGl1cyBvZiBkaXNjLlxuICAgIHY6IG51bWJlcjsgIC8vIFZlbG9jaXR5IG9mIHN1cmZhY2Ugb2YgZGlzYyAoaW4gQ0NXIGRpcmVjdGlvbikuXG59O1xuXG5leHBvcnQgdHlwZSBNYXRlcmlhbCA9IHtcbiAgICBFOiBudW1iZXI7ICAvLyBZb3VuZydzIG1vZHVsdXMgaW4gUGEuXG4gICAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBrZy9tXjNcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgLy8gVE9ETzogd2hlbiBzdHVmZiBicmVha3MsIHdvcmsgaGFyZGVuaW5nLCBldGMuXG59O1xuXG5leHBvcnQgdHlwZSBUcnVzcyA9IHtcbiAgICBmaXhlZFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgZWRpdFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0QmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGVkaXRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZGlzY3M6IEFycmF5PERpc2M+O1xuICAgIG1hdGVyaWFsczogQXJyYXk8TWF0ZXJpYWw+O1xufTtcblxuZnVuY3Rpb24gdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzczogVHJ1c3MsIG06IG51bWJlcikge1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBpZiAobSA8IDAgfHwgbSA+PSBtYXRlcmlhbHMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBtYXRlcmlhbCBpbmRleCAke219YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKSB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoIHx8IHBpbiA+PSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0JlYW1FeGlzdHModHJ1c3M6IFRydXNzLCBwMTogbnVtYmVyLCBwMjogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0VkaXRQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzVW5lZGl0YWJsZVBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc01vdmluZ1BpbnNDb3VudCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3M6IFRydXNzLCBwOiBQb2ludDJELCBtYXhkOiBudW1iZXIsIGJlYW1TdGFydD86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgLy8gVE9ETzogYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIFByb2JhYmx5IG9ubHkgbWF0dGVycyBvbmNlIHdlIGhhdmUgMTAwMHMgb2YgcGlucz9cbiAgICBjb25zdCBibG9jayA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGxldCByZXMgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHJlc2QgPSBtYXhkO1xuICAgIGlmIChiZWFtU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgICAgIGlmIChiLnAxID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5maXhlZFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5zdGFydFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3Muc3RhcnRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5lZGl0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSArIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmZpeGVkUGluc1t0cnVzcy5maXhlZFBpbnMubGVuZ3RoICsgcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLnN0YXJ0UGluc1twaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZWRpdFBpbnNbcGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgVGVycmFpbiA9IHtcbiAgICBobWFwOiBBcnJheTxudW1iZXI+O1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbn07XG5cbnR5cGUgU2ltdWxhdGlvbkhNYXAgPSBBcnJheTx7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgbng6IG51bWJlcjsgLy8gT3V0d2FyZCAoZGlyZWN0aW9uIG9mIGJvdW5jZSkgbm9ybWFsIHVuaXQgdmVjdG9yLlxuICAgIG55OiBudW1iZXI7XG4gICAgZGVja3M6IEFycmF5PFNpbXVsYXRpb25CZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgIGRlY2tDb3VudDogbnVtYmVyOyAgLy8gTnVtYmVyIG9mIGluZGljZXMgaW4gZGVja3MgYmVpbmcgdXNlZC5cbn0+O1xuXG50eXBlIEFkZEJlYW1BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfYmVhbVwiO1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw/OiBudW1iZXI7XG4gICAgZGVjaz86IGJvb2xlYW47XG59O1xuXG50eXBlIEFkZFBpbkFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9waW5cIjtcbiAgICBwaW46IFBvaW50MkQ7XG59O1xuXG50eXBlIENvbXBvc2l0ZUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImNvbXBvc2l0ZVwiO1xuICAgIGFjdGlvbnM6IEFycmF5PFRydXNzQWN0aW9uPjtcbn07XG5cbnR5cGUgVHJ1c3NBY3Rpb24gPSBBZGRCZWFtQWN0aW9uIHwgQWRkUGluQWN0aW9uIHwgQ29tcG9zaXRlQWN0aW9uO1xuXG5cbmV4cG9ydCB0eXBlIFNjZW5lSlNPTiA9IHtcbiAgICB0cnVzczogVHJ1c3M7XG4gICAgdGVycmFpbjogVGVycmFpbjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGc6IFBvaW50MkQ7ICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgcmVkb1N0YWNrOiBBcnJheTxUcnVzc0FjdGlvbj47XG4gICAgdW5kb1N0YWNrOiBBcnJheTxUcnVzc0FjdGlvbj47XG59XG5cbmNsYXNzIFNjZW5lU2ltdWxhdG9yIHtcbiAgICBwcml2YXRlIG1ldGhvZDogUnVuZ2VLdXR0YTQ7ICAgICAgICAgICAgICAgICAgICAvLyBPREUgc29sdmVyIG1ldGhvZCB1c2VkIHRvIHNpbXVsYXRlLlxuICAgIHByaXZhdGUgZHlkdDogRGVyaXZhdGl2ZTsgICAgICAgICAgICAgICAgICAgICAgIC8vIERlcml2YXRpdmUgb2YgT0RFIHN0YXRlLlxuICAgIHByaXZhdGUgaDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRpbWUgc3RlcC5cbiAgICBwcml2YXRlIGZpeGVkUGluczogRmxvYXQzMkFycmF5OyAgICAgICAgICAgICAgICAvLyBQb3NpdGlvbnMgb2YgZml4ZWQgcGlucyBbeDAsIHkwLCB4MSwgeTEsIC4uLl0uXG4gICAgcHJpdmF0ZSB0TGF0ZXN0OiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGhpZ2hlc3QgdGltZSB2YWx1ZSBzaW11bGF0ZWQuXG4gICAgcHJpdmF0ZSBrZXlJbnRlcnZhbDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAvLyBUaW1lIHBlciBrZXlmcmFtZS5cbiAgICBwcml2YXRlIGtleWZyYW1lczogTWFwPG51bWJlciwgRmxvYXQzMkFycmF5PjsgICAvLyBNYXAgb2YgdGltZSB0byBzYXZlZCBzdGF0ZS5cblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04sIGg6IG51bWJlciwga2V5SW50ZXJ2YWw6IG51bWJlcikge1xuICAgICAgICB0aGlzLmggPSBoO1xuICAgICAgICB0aGlzLnRMYXRlc3QgPSAwO1xuICAgICAgICB0aGlzLmtleUludGVydmFsID0ga2V5SW50ZXJ2YWw7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzID0gbmV3IE1hcCgpO1xuICAgICAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2FjaGUgZml4ZWQgcGluIHZhbHVlcy5cbiAgICAgICAgY29uc3QgZml4ZWRQaW5zID0gbmV3IEZsb2F0MzJBcnJheSh0cnVzcy5maXhlZFBpbnMubGVuZ3RoICogMik7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmaXhlZFBpbnNbaSAqIDJdID0gdHJ1c3MuZml4ZWRQaW5zW2ldWzBdO1xuICAgICAgICAgICAgZml4ZWRQaW5zW2kgKiAyICsgMV0gPSB0cnVzcy5maXhlZFBpbnNbaV1bMV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5maXhlZFBpbnMgPSBmaXhlZFBpbnM7XG5cbiAgICAgICAgLy8gQ2FjaGUgQmVhbSB2YWx1ZXMuXG4gICAgICAgIGNvbnN0IGJlYW1zOiBBcnJheTxTaW11bGF0aW9uQmVhbT4gPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoYiA9PiAoe1xuICAgICAgICAgICAgcDE6IGIucDEsXG4gICAgICAgICAgICBwMjogYi5wMixcbiAgICAgICAgICAgIG06IGIubSxcbiAgICAgICAgICAgIHc6IGIudyxcbiAgICAgICAgICAgIGw6IGIubCAhPT0gdW5kZWZpbmVkID8gYi5sIDogcG9pbnREaXN0YW5jZSh0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSksXG4gICAgICAgICAgICBkZWNrOiBiLmRlY2sgIT09IHVuZGVmaW5lZCA/IGIuZGVjayA6IGZhbHNlLFxuICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gQ2FjaGUgZGlzY3MuXG4gICAgICAgIGNvbnN0IGRpc2NzID0gdHJ1c3MuZGlzY3M7ICAvLyBUT0RPOiBkbyB3ZSBldmVyIHduYXQgdG8gbXV0YXRlIGRpc2NzP1xuXG4gICAgICAgIC8vIENhY2hlIG1hdGVyaWFscy5cbiAgICAgICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzOyAgLy8gVE9ETzogZG8gd2UgZXZlciB3YW50IHRvIG11dGF0ZSBtYXRlcmlhbHM/XG5cbiAgICAgICAgLy8gQ29tcHV0ZSB0aGUgbWFzcyBvZiBhbGwgcGlucy5cbiAgICAgICAgY29uc3QgbW92aW5nUGlucyA9IHRydXNzTW92aW5nUGluc0NvdW50KHRydXNzKTtcbiAgICAgICAgY29uc3QgbWFzcyA9IG5ldyBGbG9hdDMyQXJyYXkobW92aW5nUGlucyk7XG4gICAgICAgIGZ1bmN0aW9uIGFkZE1hc3MocGluOiBudW1iZXIsIG06IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICAvLyBGaXhlZCBwaW5zIGFscmVhZHkgaGF2ZSBpbmZpbml0ZSBtYXNzLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hc3NbcGluXSArPSBtO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiBiZWFtcykge1xuICAgICAgICAgICAgY29uc3QgbSA9IGIubCAqIGIudyAqIG1hdGVyaWFsc1tiLm1dLmRlbnNpdHk7XG4gICAgICAgICAgICAvLyBEaXN0cmlidXRlIHRoZSBtYXNzIGJldHdlZW4gdGhlIHR3byBlbmQgcGlucy5cbiAgICAgICAgICAgIC8vIFRPRE86IGRvIHByb3BlciBtYXNzIG1vbWVudCBvZiBpbnRlcnRpYSBjYWxjdWxhdGlvbiB3aGVuIHJvdGF0aW5nIGJlYW1zP1xuICAgICAgICAgICAgYWRkTWFzcyhiLnAxLCBtICogMC41KTtcbiAgICAgICAgICAgIGFkZE1hc3MoYi5wMiwgbSAqIDAuNSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBkIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gZC5yICogZC5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkLm1dLmRlbnNpdHk7XG4gICAgICAgICAgICBhZGRNYXNzKGQucCwgbSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICAgICAgZm9yIChjb25zdCBtIG9mIG1hc3MpIHtcbiAgICAgICAgICAgIGlmIChtIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJtYXNzIDAgcGluIGRldGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FjaGUgdGhlIHRlcnJhaW4sIHNldCB1cCBhY2NlbGVyYXRpb24gc3RydWN0dXJlIGZvciBkZWNrIGludGVyc2VjdGlvbnMuXG4gICAgICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG4gICAgICAgIGNvbnN0IGhlaWdodCA9IHNjZW5lLmhlaWdodDtcbiAgICAgICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgIGNvbnN0IGhtYXA6IFNpbXVsYXRpb25ITWFwID0gc2NlbmUudGVycmFpbi5obWFwLm1hcCgoaCwgaSkgPT4ge1xuICAgICAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgICAgIG55Oi0xLjAsXG4gICAgICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICBueDogZHkgLyBsLFxuICAgICAgICAgICAgICAgIG55OiAtcGl0Y2ggLyBsLFxuICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZnVuY3Rpb24gaG1hcEFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgICAgIGguZGVja3NbaC5kZWNrQ291bnRdID0gZDtcbiAgICAgICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXRlIGFjY2Vzc29yc1xuICAgICAgICBjb25zdCB2SW5kZXggPSBtb3ZpbmdQaW5zICogMjtcbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDJdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDIgKyAxXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVt2SW5kZXggKyBwaW4gKiAyXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbdkluZGV4ICsgcGluICogMiArIDFdOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVtwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3ZJbmRleCArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVt2SW5kZXggKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZm9yY2UoZHlkdDogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgZng6IG51bWJlciwgZnk6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IG1hc3NbcGluXTtcbiAgICAgICAgICAgICAgICBkeWR0W3ZJbmRleCArIHBpbiAqIDIgKyAwXSArPSBmeCAvIG07XG4gICAgICAgICAgICAgICAgZHlkdFt2SW5kZXggKyBwaW4gKiAyICsgMV0gKz0gZnkgLyBtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlLiBOQjogdmVsb2NpdGllcyBhcmUgYWxsIHplcm8uXG4gICAgICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb3ZpbmdQaW5zICogNCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICAgICAgc2V0ZHgoeTAsIGksIGRbMF0pO1xuICAgICAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FjaGUgYWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICBjb25zdCBnID0gc2NlbmUuZztcblxuICAgICAgICB0aGlzLmR5ZHQgPSBmdW5jdGlvbiBkeWR5KF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzZXRkeChkeWR0LCBpLCBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQm90aCBlbmRzIGFyZSBub3QgbW92ZWFibGUuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBzcHJpbmdGLCB1eSAqIHNwcmluZ0YpO1xuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGLCAtdXkgKiBzcHJpbmdGKTtcblxuICAgICAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICAgICAgY29uc3QgemV0YSA9IDAuNTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIHAyKSAtIGdldHZ4KHksIHAxKTsgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEuXG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHZ4ICogdXggKyB2eSAqIHV5OyAgICAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMSBpbiBkaXJlY3Rpb24gb2YgYmVhbS5cbiAgICAgICAgICAgICAgICBpZiAocDEgPj0gMCAmJiBwMiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gbWFzc1twMV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gbWFzc1twMl07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBkYW1wRiwgdXkgKiBkYW1wRik7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBkYW1wRiwgLXV5ICogZGFtcEYpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocDEgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IG1hc3NbcDFdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSk7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAxLCB1eCAqIGRhbXBGLCB1eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHAyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBtYXNzW3AyXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMiwgLXV4ICogZGFtcEYsIC11eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgZGVja3MgdG8gYWNjbGVyYXRpb24gc3RydWN0dXJlXG4gICAgICAgICAgICAgICAgaWYgKGJlYW0uZGVjaykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWdpbiA9IE1hdGgubWluKGkxLCBpMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaG1hcEFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb25cbiAgICAgICAgICAgIC8vIFRPRE86IHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBpKTsgLy8gUGluIHBvc2l0aW9uLlxuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IG1hc3NbaV07XG4gICAgICAgICAgICAgICAgbGV0IGJvdW5jZUYgPSAxMDAwLjAgKiBtOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICAgICAgbGV0IG54OyAvLyBUZXJyYWluIHVuaXQgbm9ybWFsIChkaXJlY3Rpb24gb2YgYWNjZWxlcmF0aW9uKS5cbiAgICAgICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgICAgICBueSA9IC0xLjA7XG4gICAgICAgICAgICAgICAgICAgIGJvdW5jZUYgKj0gZHkgLSBoZWlnaHQgKyBobWFwWzBdLmhlaWdodDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAgICAgICAgIC8vIERpc3RhbmNlIGJlbG93IHRlcnJhaW4gaXMgbm9ybWFsIGRvdCB2ZWN0b3IgZnJvbSB0ZXJyYWluIHRvIHBvaW50LlxuICAgICAgICAgICAgICAgICAgICBib3VuY2VGICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChib3VuY2VGIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSBhcmUgbm90IGJvdW5jaW5nLlxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgbnggKiBib3VuY2VGLCBueSAqIGJvdW5jZUYpO1xuXG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IHZ4ICogdHggKyB2eSAqIHR5O1xuICAgICAgICAgICAgICAgIGxldCBmcmljdGlvbkYgPSB0RnJpY3Rpb24gKiBib3VuY2VGICogKHR2ID4gMCA/IC0xIDogMSk7XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgdHggKiBmcmljdGlvbkYsIHR5ICogZnJpY3Rpb25GKTtcblxuICAgICAgICAgICAgICAgIC8vIE9sZCBDb2RlXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogd2h5IGRpZCB0aGlzIG5lZWQgdG8gY2FwIHRoZSBhY2NlbGVyYXRpb24/IG1heWJlIGJvdW5jZSBmb3JjZSBpcyB0b28gaGlnaD9cbiAgICAgICAgICAgICAgICAvL2NvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUT0RPOiBkaXNjc1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tZXRob2QgPSBuZXcgUnVuZ2VLdXR0YTQoeTAsIHRoaXMuZHlkdCk7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzLnNldCh0aGlzLm1ldGhvZC50LCBuZXcgRmxvYXQzMkFycmF5KHRoaXMubWV0aG9kLnkpKTtcbiAgICB9XG5cbiAgICBzZWVrVGltZXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5ZnJhbWVzLmtleXMoKTtcbiAgICB9XG5cbiAgICBzZWVrKHQ6IG51bWJlcikge1xuICAgICAgICBjb25zdCB5ID0gdGhpcy5rZXlmcmFtZXMuZ2V0KHQpO1xuICAgICAgICBpZiAoeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dH0gaXMgbm90IGEga2V5ZnJhbWUgdGltZWApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWV0aG9kLnkgPSB5O1xuICAgICAgICB0aGlzLm1ldGhvZC50ID0gdDtcbiAgICB9XG5cbiAgICB0aW1lKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1ldGhvZC50O1xuICAgIH1cblxuICAgIG5leHQoKSB7ICAgIC8vIFRPRE86IG1ha2UgdGhpcyBwcml2YXRlP1xuICAgICAgICB0aGlzLm1ldGhvZC5uZXh0KHRoaXMuaCk7XG4gICAgICAgIGlmICh0aGlzLnRMYXRlc3QgPCB0aGlzLm1ldGhvZC50KSB7XG4gICAgICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5tZXRob2QudCwgbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1ldGhvZC55KSk7XG4gICAgICAgICAgICBpZiAodGhpcy5rZXlmcmFtZXMuc2l6ZSA+IDEgKyBNYXRoLmNlaWwodGhpcy5tZXRob2QudCAvIHRoaXMua2V5SW50ZXJ2YWwpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5rZXlmcmFtZXMuZGVsZXRlKHRoaXMudExhdGVzdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRMYXRlc3QgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2ltdWxhdGUodW50aWw6IG51bWJlcikge1xuICAgICAgICB3aGlsZSAodGhpcy5tZXRob2QudCA8IHVudGlsKSB7XG4gICAgICAgICAgICB0aGlzLm5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldFBpbihwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgY29uc3QgaSA9IHRoaXMuZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDI7XG4gICAgICAgICAgICByZXR1cm4gW3RoaXMuZml4ZWRQaW5zW2ldLCB0aGlzLmZpeGVkUGluc1tpKzFdXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSBwaW4gKiAyO1xuICAgICAgICAgICAgY29uc3QgeSA9IHRoaXMubWV0aG9kLnk7XG4gICAgICAgICAgICByZXR1cm4gW3lbaV0sIHlbaSsxXV07XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG50eXBlIE9uUmVzZXRTaW11bGF0b3JIYW5kbGVyID0gKGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25BZGRQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPblJlbW92ZVBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cblxuZXhwb3J0IGNsYXNzIFNjZW5lRWRpdG9yIHtcbiAgICBzY2VuZTogU2NlbmVKU09OO1xuICAgIHByaXZhdGUgc2ltOiBTY2VuZVNpbXVsYXRvciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIG9uUmVzZXRTaW11bGF0b3JIYW5kbGVyczogQXJyYXk8T25SZXNldFNpbXVsYXRvckhhbmRsZXI+O1xuICAgIHByaXZhdGUgb25BZGRQaW5IYW5kbGVyczogQXJyYXk8T25BZGRQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIG9uUmVtb3ZlUGluSGFuZGxlcnM6IEFycmF5PE9uUmVtb3ZlUGluSGFuZGxlcj47XG4gICAgZWRpdE1hdGVyaWFsOiBudW1iZXI7XG4gICAgZWRpdFdpZHRoOiBudW1iZXI7XG4gICAgZWRpdERlY2s6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMub25SZXNldFNpbXVsYXRvckhhbmRsZXJzID0gW107XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgLy8gVE9ETzogcHJvcGVyIGluaXRpYWxpemF0aW9uO1xuICAgICAgICB0aGlzLmVkaXRNYXRlcmlhbCA9IDA7XG4gICAgICAgIHRoaXMuZWRpdFdpZHRoID0gNDtcbiAgICAgICAgdGhpcy5lZGl0RGVjayA9IHRydWU7XG4gICAgfVxuXG4gICAgc2ltdWxhdG9yKCk6IFNjZW5lU2ltdWxhdG9yIHtcbiAgICAgICAgaWYgKHRoaXMuc2ltID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gbmV3IFNjZW5lU2ltdWxhdG9yKHRoaXMuc2NlbmUsIDAuMDAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5zaW07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldFNpbXVsYXRvcihlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIGZvciAoY29uc3QgaGFuZGxlciBvZiB0aGlzLm9uUmVzZXRTaW11bGF0b3JIYW5kbGVycykge1xuICAgICAgICAgICAgaGFuZGxlcihlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvblJlc2V0U2ltdWxhdG9yKGhhbmRsZXI6IE9uUmVzZXRTaW11bGF0b3JIYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25SZXNldFNpbXVsYXRvckhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcDEgPSBhLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGEucDI7XG4gICAgICAgIGNvbnN0IG0gPSBhLm07XG4gICAgICAgIGNvbnN0IHcgPSBhLnc7XG4gICAgICAgIGNvbnN0IGwgPSBhLmw7XG4gICAgICAgIGNvbnN0IGRlY2sgPSBhLmRlY2s7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIHRydXNzQXNzZXJ0TWF0ZXJpYWwodHJ1c3MsIG0pO1xuICAgICAgICBpZiAodyA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSB3aWR0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHt3fWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsICE9PSB1bmRlZmluZWQgJiYgbCA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBsZW5ndGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7bH1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRydXNzLmVkaXRCZWFtcy5wdXNoKHtwMSwgcDIsIG0sIHcsIGwsIGRlY2t9KTtcbiAgICAgICAgXG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgdW5kb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgYiA9IHRydXNzLmVkaXRCZWFtcy5wb3AoKTtcbiAgICAgICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBiZWFtcyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiLnAxICE9PSBhLnAxIHx8IGIucDIgIT09IGEucDIgfHwgYi5tICE9PSBhLm0gfHwgYi53ICE9IGEudyB8fCBiLmwgIT09IGEubCB8fCBiLmRlY2sgIT09IGEuZGVjaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCZWFtIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICB0cnVzcy5lZGl0UGlucy5wdXNoKGEucGluKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25BZGRQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcCA9IHRydXNzLmVkaXRQaW5zLnBvcCgpO1xuICAgICAgICBpZiAocCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHBpbnMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocFswXSAhPT0gYS5waW5bMF0gfHwgcFsxXSAhPT0gYS5waW5bMV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUGluIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5hY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSBhLmFjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHRoaXMudW5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgZW51bWVyYXRpb24vb2JzZXJ2YXRpb24gbWV0aG9kc1xuXG4gICAgb25BZGRQaW4oaGFuZGxlcjogT25BZGRQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlUGluKGhhbmRsZXI6IE9uUmVtb3ZlUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBDbGVhciBoYW5kbGVycz9cblxuICAgIHVuZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS51bmRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIHJlZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS5yZWRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIC8vIFNjZW5lIG11dGF0aW9uIG1ldGhvZHNcblxuICAgIHVuZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnVuZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHVuZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sucHVzaChhKTtcbiAgICAgICAgdGhpcy5yZXNldFNpbXVsYXRvcihlYyk7XG4gICAgfVxuXG4gICAgcmVkbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUucmVkb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gcmVkb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS51bmRvU3RhY2sucHVzaChhKTtcbiAgICAgICAgdGhpcy5yZXNldFNpbXVsYXRvcihlYyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjayA9IFthXTtcbiAgICAgICAgdGhpcy5yZWRvKGVjKTsgICAgLy8gVE9ETzogSXMgdGhpcyB0b28gY2xldmVyP1xuICAgIH1cblxuICAgIGFkZEJlYW0oXG4gICAgICAgIHAxOiBudW1iZXIsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9uKHtcbiAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICB9LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluKHBpbjogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImFkZF9waW5cIiwgcGlufSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbkFuZEJlYW0oXG4gICAgICAgIHBpbjogUG9pbnQyRCxcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGNvbnN0IHAxID0gdGhpcy5zY2VuZS50cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImNvbXBvc2l0ZVwiLCBhY3Rpb25zOiBbXG4gICAgICAgICAgICB7IHR5cGU6IFwiYWRkX3BpblwiLCBwaW59LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgICAgICBwMSxcbiAgICAgICAgICAgICAgICBwMixcbiAgICAgICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICAgICAgfSxcbiAgICAgICAgXX0sIGVjKTtcbiAgICB9XG59O1xuXG4vKlxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lTWV0aG9kKHNjZW5lOiBTY2VuZSk6IE9ERU1ldGhvZCB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBcbiAgICBjb25zdCBmaXhlZFBpbnMgPSB0cnVzcy5maXhlZFBpbnM7XG4gICAgY29uc3QgbW9iaWxlUGlucyA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgLy8gU3RhdGUgYWNjZXNzb3JzXG4gICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVsxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFNwbGl0IGJlYW0gbWFzcyBldmVubHkgYmV0d2VlbiBwaW5zLCBpbml0aWFsaXNlIGJlYW0gbGVuZ3RoLlxuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zKTtcbiAgICBmdW5jdGlvbiBnZXRtKHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXNzW3Bpbl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gNS45NzJlMjQ7ICAgIC8vIE1hc3Mgb2YgdGhlIEVhcnRoLlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmVhbXMgPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoKGJlYW06IEJlYW0pOiBTaW11bGF0aW9uQmVhbSA9PiB7XG4gICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICBjb25zdCBsID0gcG9pbnREaXN0YW5jZShzY2VuZS5nZXRQaW4ocDEpLCBzY2VuZS5nZXRQaW4ocDIpKTtcbiAgICAgICAgY29uc3QgbSA9IGwgKiBiZWFtLncgKiBtYXRlcmlhbHNbYmVhbS5tXS5kZW5zaXR5O1xuICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AxXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDJdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcDEsIHAyLCBtOiBiZWFtLm0sIHc6IGJlYW0udywgbDogYmVhbS5sIHx8IGwsIGRlY2s6IGJlYW0uZGVjayB8fCBmYWxzZSB9O1xuICAgIH0pO1xuXG4gICAgLy8gRGlzYyBtYXNzLlxuICAgIGNvbnN0IGRpc2NzID0gc2NlbmUudHJ1c3MuZGlzY3M7XG4gICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgIGlmIChkaXNjLnAgPj0gbW9iaWxlUGlucykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlzYyBhdHRhY2hlZCB0byBub24gbW9iaWxlIHBpblwiKTtcbiAgICAgICAgfVxuICAgICAgICBtYXNzW2Rpc2MucF0gKz0gZGlzYy5yICogZGlzYy5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkaXNjLm1dLmRlbnNpdHk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBpZiAobWFzc1tpXSA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9iaWxlIHBpbiAke2l9IGhhcyBtYXNzICR7bWFzc1tpXX0gPD0gMC4wYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgbnk6IDEuMCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgIG54OiAtZHkgLyBsLFxuICAgICAgICAgICAgbnk6IHBpdGNoIC8gbCxcbiAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiByZXNldERlY2tzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgaC5kZWNrQ291bnQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICBoLmRlY2tzW2guZGVja0NvdW50XSA9IGQ7XG4gICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgfVxuICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG5cbiAgICAvLyBTZXQgdXAgaW5pdGlhbCBPREUgc3RhdGUgdmVjdG9yLlxuICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IGdldFBpbih0cnVzcywgaSk7XG4gICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgIH1cbiAgICAvLyBOQjogSW5pdGlhbCB2ZWxvY2l0aWVzIGFyZSBhbGwgMCwgbm8gbmVlZCB0byBpbml0aWFsaXplLlxuXG4gICAgY29uc3QgZyA9ICBzY2VuZS5nO1xuICAgIHJldHVybiBuZXcgUnVuZ2VLdXR0YTQoeTAsIGZ1bmN0aW9uIChfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgIHJlc2V0RGVja3MoKTtcblxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGJlYW0gc3RyZXNzLlxuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgY29uc3QgdyA9IGJlYW0udztcbiAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIHAyKSAtIGdldGR5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJhaW4gPSAobCAtIGwwKSAvIGwwO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJlc3MgPSBzdHJhaW4gKiBFICogdztcbiAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShwMSk7ICAgIC8vIFBpbiBtYXNzXG4gICAgICAgICAgICBjb25zdCBtMiA9IGdldG0ocDIpO1xuICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGIC8gbTIpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIHNwcmluZ0YgLyBtMik7XG5cbiAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICBjb25zdCB6ZXRhID0gMC41O1xuICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBwMikgLSBnZXR2eCh5LCBwMSk7IC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxLlxuICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCB2ID0gdnggKiB1eCArIHZ5ICogdXk7ICAgIC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxIGluIGRpcmVjdGlvbiBvZiBiZWFtLlxuICAgICAgICAgICAgLy8gVE9ETzogbm93IHRoYXQgZ2V0bSByZXR1cm5zIG1hc3Mgb2YgRWFydGggZm9yIGZpeGVkIHBpbnMsIHdlIGRvbid0IG5lZWQgdGhlc2UgZGlmZmVyZW50IGlmIGNsYXVzZXMuXG4gICAgICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zICYmIHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb24sIHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICBsZXQgYXQgPSAxMDAwLjA7IC8vIEFjY2VsZXJhdGlvbiBwZXIgbWV0cmUgb2YgZGVwdGggdW5kZXIgdGVycmFpbi5cbiAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbC5cbiAgICAgICAgICAgIGxldCBueTtcbiAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgIG55ID0gMS4wO1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSAwLjApICsgbnkgKiAoZHkgLSBobWFwWzBdLmhlaWdodCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXQgPiAwLjApIHtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCBueCAqIGF0KTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCBueSAqIGF0KTtcbiAgICAgICAgICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIC8vIENhcCBhY2NlbGVyYXRpb24gYnkgc29tZSBmcmFjdGlvbiBvZiB2ZWxvY2l0eVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRha2UgZnJpY3Rpb24gZnJvbSBiZWFtcyB0b28gKGp1c3QgYXZlcmFnZSBiZWFtcyBnb2luZyBpbnRvIHBpbj8pXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IGdldHZ4KHksIGkpICogdHggKyBnZXR2eSh5LCBpKSAqIHR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgdHggKiBhZik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgdHkgKiBhZik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBkaXNjLWRlY2sgY29sbGlzaW9uLlxuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBkaXNjLnI7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGRpc2MucCk7XG4gICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGhtYXAgYnVja2V0cyB0aGF0IGRpc2Mgb3ZlcmxhcHMuXG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGRlY2tzIGluIHRob3NlIGJ1Y2tldHMuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tDb3VudCA9IGhtYXBbaV0uZGVja0NvdW50O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgxID0gZ2V0ZHgoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0ZHkoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgyID0gZ2V0ZHgoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkyID0gZ2V0ZHkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeCA9IHgyIC0geDE7IC8vIFZlY3RvciB0byBlbmQgb2YgZGVjayAoZnJvbSBzdGFydClcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeSA9IGR5IC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gY3ggKiBjeCArIGN5ICogY3kgLSByICogcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gTm8gUmVhbCBzb2x1dGlvbnMgdG8gaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MSA9ICgtYiAtIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gSW50ZXJzZWN0aW9ucyBhcmUgYm90aCBiZWZvcmUgb3IgYWZ0ZXIgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0MSA9IE1hdGgubWF4KHQxLCAwLjApO1xuICAgICAgICAgICAgICAgICAgICB0MiA9IE1hdGgubWluKHQyLCAxLjApO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHNvIHRoYXQgYXMgYSBkaXNjIG1vdmVzIGJldHdlZW4gdHdvIGRlY2sgc2VnbWVudHMsIHRoZSBhY2NlbGVyYXRpb24gcmVtYWlucyBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ4ID0gKDEgLSB0MikgKiB4MSArIHQyICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQyIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZWEgPSAwLjUgKiByICogciAqIHRhIC0gMC41ICogTWF0aC5hYnModDF4ICogdDJ5IC0gdDF5ICogdDJ4KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW4gPSAxMDAwLjAgKiBhcmVhOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgd2hhdCBhY2NlbGVyYXRpb24gdG8gdXNlXG4gICAgICAgICAgICAgICAgICAgIGxldCBueCA9IGN4IC0gc3ggKiB0O1xuICAgICAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgICAgIG54IC89IGw7XG4gICAgICAgICAgICAgICAgICAgIG55IC89IGw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9ucyB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWQgPSBnZXRtKGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShkZWNrLnAxKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKGRlY2sucDIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWQgPSAobTEgKyBtMikgLyAobWQgKyBtMSArIG0yKTsgIC8vIFNoYXJlIG9mIGFjY2VsZXJhdGlvbiBmb3IgZGlzYywgZGVjayBlbmRwb2ludHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGExID0gKG1kICsgbTIpIC8gKG1kICsgbTEgKyBtMikgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEyID0gKG1kICsgbTEpIC8gKG1kICsgbTEgKyBtMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIG54ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgbnkgKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtbnggKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLW55ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC1ueCAqIGFuICogYTIpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtbnkgKiBhbiAqIGEyKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uIGFuZCBkYW1waW5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgcmVsYXRpdmUgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ4KHksIGRlY2sucDEpIC0gdCAqIGdldHZ4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eSh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRvdGFsbHkgdW5zY2llbnRpZmljIHdheSB0byBjb21wdXRlIGZyaWN0aW9uIGZyb20gYXJiaXRyYXJ5IGNvbnN0YW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQobWF0ZXJpYWxzW2Rpc2MubV0uZnJpY3Rpb24gKiBtYXRlcmlhbHNbZGVjay5tXS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4oYW4gKiBmcmljdGlvbiwgTWF0aC5hYnModnQgKiAxMDApKSAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcCA9IDI7ICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gZGVyaXZlIGEgcmVhc29uYWJsZSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCB0eCAqIGFmICogYWQgLSB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgdHkgKiBhZiAqIGFkIC0gdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC10eCAqIGFmICogYTEgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC10eSAqIGFmICogYTEgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC10eCAqIGFmICogYTIgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC10eSAqIGFmICogYTIgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzY2VuZVJlbmRlcmVyKHNjZW5lOiBTY2VuZSk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBcbiAgICAvLyBQcmUtcmVuZGVyIHRlcnJhaW4uXG4gICAgY29uc3QgdGVycmFpbiA9IHNjZW5lLnRlcnJhaW47XG4gICAgY29uc3QgaG1hcCA9IHRlcnJhaW4uaG1hcDtcbiAgICBjb25zdCB0ZXJyYWluUGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICB0ZXJyYWluUGF0aC5tb3ZlVG8oMC4wLCAwLjApO1xuICAgIGxldCB4ID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCwgaG1hcFtpXSk7XG4gICAgICAgIHggKz0gdGVycmFpbi5waXRjaDtcbiAgICB9XG4gICAgdGVycmFpblBhdGgubGluZVRvKHggLSB0ZXJyYWluLnBpdGNoLCAwLjApO1xuICAgIHRlcnJhaW5QYXRoLmNsb3NlUGF0aCgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCkge1xuICAgICAgICAvLyBUZXJyYWluLlxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICAgICAgY3R4LmZpbGwodGVycmFpblBhdGgpO1xuXG4gICAgICAgIGNvbnN0IHkgPSBvZGUueTtcblxuICAgICAgICAvLyBEaXNjc1xuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzO1xuICAgICAgICBcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5hcmMoeVtwICogMiArIDBdLCB5W3AgKiAyICsgMV0sIGRpc2MuciwgMC4wLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbChcIm5vbnplcm9cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZWFtcy5cbiAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gbWF0ZXJpYWxzW2JlYW0ubV0uc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYmVhbS53O1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byB1c2Ugb2RlIGFjY2Vzc29ycy5cbiAgICAgICAgICAgIC8vIFdhaXQsIGRvZXMgdGhhdCBtZWFuIHdlIG5lZWQgYW4gT0RFIGZvciBhIHN0YXRpYyBzY2VuZT9cbiAgICAgICAgICAgIC8vIFdpbGwgbmVlZCBkaWZmZXJlbnQgbWV0aG9kcy5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHAxIDwgMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiovXG5cbnR5cGUgQ3JlYXRlQmVhbVBpblN0YXRlID0ge1xuICAgIGVkaXQ6IFNjZW5lRWRpdG9yLFxuICAgIGk6IG51bWJlcixcbiAgICBkcmFnPzogeyBwOiBQb2ludDJELCBpPzogbnVtYmVyIH0sXG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIDEsIGJveC50b3AgKyAxLCBib3gud2lkdGggLSAyLCBib3guaGVpZ2h0IC0gMik7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGNvbnN0IHAyID0gc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQgPyBzdGF0ZS5kcmFnLnAgOiB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICBjb25zdCB3ID0gc3RhdGUuZWRpdC5lZGl0V2lkdGg7XG4gICAgY29uc3Qgc3R5bGUgPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLnN0eWxlO1xuICAgIGNvbnN0IGRlY2sgPSBzdGF0ZS5lZGl0LmVkaXREZWNrO1xuICAgIGRyYXdCZWFtKGN0eCwgcDEsIHAyLCB3LCBzdHlsZSwgZGVjayk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbihwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgaSA9IHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzcywgcHNbMF0uY3VyciwgOCwgc3RhdGUuaSk7XG4gICAgc3RhdGUuZHJhZyA9IHtcbiAgICAgICAgcDogcHNbMF0uY3VycixcbiAgICAgICAgaSxcbiAgICB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSA4LCBwWzFdIC0gOCwgMTYsIDE2LCB7IGVkaXQsIGkgfSlcbiAgICAgICAgLm9uRHJhdyhjcmVhdGVCZWFtUGluT25EcmF3KVxuICAgICAgICAub25QYW4oY3JlYXRlQmVhbVBpbk9uUGFuKVxuICAgICAgICAub25QYW5FbmQoY3JlYXRlQmVhbVBpbk9uUGFuRW5kKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NFZGl0YWJsZVBpbnMoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NFZGl0UGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgIH1cbiAgICBjb25zdCBlID0gUmVsYXRpdmUoLi4uY2hpbGRyZW4pO1xuXG4gICAgZWRpdC5vbkFkZFBpbigoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYGFkZGluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgYWRkQ2hpbGQoZSwgQ3JlYXRlQmVhbVBpbihlZGl0LCBwaW4pLCBlYywgZWRpdEluZGV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pO1xuICAgIGVkaXQub25SZW1vdmVQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGByZW1vdmluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgcmVtb3ZlQ2hpbGQoZSwgZWRpdEluZGV4LCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcblxuICAgIC8vIFRPRE86IGUub25EZXRhY2ggZm9yIHJlbW92ZWluZyBwaW4gb2JzZXJ2ZXJzLlxuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHdpZHRoID0gZWRpdC5zY2VuZS53aWR0aDtcbiAgICBjb25zdCBoZWlnaHQgPSBlZGl0LnNjZW5lLmhlaWdodDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc1VuZWRpdGFibGVQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgICAgIGlmIChwWzBdID4gMCAmJiBwWzBdIDwgd2lkdGggJiYgcFsxXSA+IDAgJiYgcFsxXSA8IGhlaWdodCkge1xuICAgICAgICAgICAgLy8gQmVhbXMgc2hvdWxkIG9ubHkgYmUgY3JlYXRlZCBmcm9tIHBpbnMgc3RyaWN0bHkgaW5zaWRlIHRoZSBzY2VuZS5cbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NMYXllcihzY2VuZTogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gTGF5ZXIoXG4gICAgICAgIEFkZFRydXNzVW5lZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICAgICBBZGRUcnVzc0VkaXRhYmxlUGlucyhzY2VuZSksXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gZHJhd0JlYW0oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHAxOiBQb2ludDJELCBwMjogUG9pbnQyRCwgdzogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBkZWNrPzogYm9vbGVhbikge1xuICAgIGN0eC5saW5lV2lkdGggPSB3O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBpZiAoZGVjayAhPT0gdW5kZWZpbmVkICYmIGRlY2spIHtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgICAgIGN0eC5saW5lVG8ocDJbMF0sIHAyWzFdKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJ1c3NMYXllck9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgdHJ1c3M6IFRydXNzKSB7XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBkcmF3QmVhbShjdHgsIHRydXNzR2V0UGluKHRydXNzLCBiLnAxKSwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gVHJ1c3NMYXllcih0cnVzczogVHJ1c3MpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbCh0cnVzcykub25EcmF3KHRydXNzTGF5ZXJPbkRyYXcpO1xufVxuXG5mdW5jdGlvbiBzaW11bGF0ZUxheWVyT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGNvbnN0IHNjZW5lID0gZWRpdC5zY2VuZTtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCBzaW0uZ2V0UGluKGIucDEpLCBzaW0uZ2V0UGluKGIucDIpLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFNpbXVsYXRlTGF5ZXIoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbChlZGl0KS5vbkRyYXcoc2ltdWxhdGVMYXllck9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIGRyYXdUZXJyYWluKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgdGVycmFpbjogVGVycmFpbikge1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgcGl0Y2ggPSBib3gud2lkdGggLyAoaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBsZWZ0ID0gdnAubGVmdCAtIGJveC5sZWZ0O1xuICAgIGNvbnN0IHJpZ2h0ID0gbGVmdCArIHZwLndpZHRoO1xuICAgIGNvbnN0IGJlZ2luID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5mbG9vcihsZWZ0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjb25zdCBlbmQgPSBNYXRoLm1heChNYXRoLm1pbihNYXRoLmNlaWwocmlnaHQgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSksIDApO1xuICAgIGN0eC5maWxsU3R5bGUgPSB0ZXJyYWluLnN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGJveC5sZWZ0LCBib3gudG9wICsgYm94LmhlaWdodCk7XG4gICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBpICogcGl0Y2gsIGJveC50b3AgKyBobWFwW2ldKTtcbiAgICB9XG4gICAgY3R4LmxpbmVUbyhib3gubGVmdCArIGJveC53aWR0aCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguZmlsbCgpO1xufVxuXG5mdW5jdGlvbiBkcmF3RmlsbChzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKSB7XG4gICAgcmV0dXJuIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHN0eWxlO1xuICAgICAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uVGFwKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgaWYgKGVkaXQudW5kb0NvdW50KCkgPiAwKSB7XG4gICAgICAgIGVkaXQudW5kbyhlYyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCB4OiBudW1iZXIsIHk6IG51bWJlciwgcjogbnVtYmVyLCBjY3c6IGJvb2xlYW4pIHtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY29uc3QgYSA9IGNjdyA/IE1hdGguUEkgOiAwO1xuICAgIGNvbnN0IGwgPSBjY3cgPyAtTWF0aC5QSSAqIDAuNCA6IE1hdGguUEkgKiAwLjQ7XG4gICAgY29uc3QgcHggPSByICogTWF0aC5jb3MoYSk7XG4gICAgY29uc3QgcHkgPSByICogTWF0aC5zaW4oYSlcbiAgICBjb25zdCB0eCA9IHIgKiBNYXRoLmNvcyhhIC0gbCkgLSBweDtcbiAgICBjb25zdCB0eSA9IHIgKiBNYXRoLnNpbihhIC0gbCkgLSBweTtcbiAgICBjb25zdCBueCA9IC10eSAvIE1hdGguc3FydCgzKTtcbiAgICBjb25zdCBueSA9IHR4IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IGIgPSBjY3cgPyBNYXRoLlBJICogMS4yNSA6IE1hdGguUEkgKiAwLjI1O1xuICAgIGNvbnN0IGUgPSBjY3cgPyBNYXRoLlBJICogMi43NSA6IE1hdGguUEkgKiAxLjc1O1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUpO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5maWxsKCk7XG59XG5cbmZ1bmN0aW9uIHVuZG9CdXR0b25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG5cbiAgICBjb25zdCBpY29uU3R5bGUgPSBlZGl0LnVuZG9Db3VudCgpID09PSAwID8gXCJncmF5XCIgOiBcImJsYWNrXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gaWNvblN0eWxlO1xuICAgIGN0eC5maWxsU3R5bGUgPSBpY29uU3R5bGU7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDg7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgZHJhd0NpcmNsZVdpdGhBcnJvdyhcbiAgICAgICAgY3R4LFxuICAgICAgICBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNSxcbiAgICAgICAgYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjUsXG4gICAgICAgIDIyLFxuICAgICAgICB0cnVlLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIHVuZG9CdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCwgZWRpdCkub25UYXAodW5kb0J1dHRvblRhcCkub25EcmF3KHVuZG9CdXR0b25EcmF3KTtcbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnJlZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnJlZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcblxuICAgIGNvbnN0IGljb25TdHlsZSA9IGVkaXQucmVkb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBpY29uU3R5bGU7XG4gICAgY3R4LmZpbGxTdHlsZSA9IGljb25TdHlsZTtcbiAgICBjdHgubGluZVdpZHRoID0gODtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KFxuICAgICAgICBjdHgsXG4gICAgICAgIGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41LFxuICAgICAgICBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNSxcbiAgICAgICAgMjIsXG4gICAgICAgIGZhbHNlLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCwgZWRpdCkub25UYXAocmVkb0J1dHRvblRhcCkub25EcmF3KHJlZG9CdXR0b25EcmF3KTtcbn1cbi8qXG5leHBvcnQgZnVuY3Rpb24gVGFiU2VsZWN0KHNpemU6IG51bWJlciwgZ3JvdzogbnVtYmVyLCBjaGlsZD86IFdQSFBMYXlvdXQ8YW55LCBhbnk+KTogRmxleExheW91dDxUYWJTdGF0ZSwgYW55PiB7XG4gICAgcmV0dXJuIEZsZXgoc2l6ZSwgZ3JvdywgKTtcbn1cblxudHlwZSBUYWJTdGF0ZSA9IHsgYWN0aXZlOiBib29sZWFuLCBpOiBudW1iZXIsIHNlbGVjdGVkOiB7IGk6IG51bWJlciB9IH07XG5cbmV4cG9ydCBmdW5jdGlvbiBUYWJTdHJpcChzZWxlY3RIZWlnaHQ6IG51bWJlciwgY29udGVudEhlaWdodDogbnVtYmVyLCAuLi50YWJzOiBBcnJheTxbRmxleExheW91dDxUYWJTdGF0ZSwgYW55PiwgV1BIUExheW91dDxhbnksIGFueT5dPik6IFdQSFBMYXlvdXQ8YW55LCBhbnk+IHtcbiAgICBjb25zdCBzZWxlY3QgPSBuZXcgQXJyYXk8RmxleExheW91dDxUYWJTdGF0ZSwgYW55Pj4odGFicy5sZW5ndGgpO1xuICAgIGNvbnN0IGNvbnRlbnQgPSBuZXcgQXJyYXk8W251bWJlciwgV1BIUExheW91dDxhbnksIGFueT5dPih0YWJzLmxlbmd0aCk7XG4gICAgY29uc3Qgc2VsZWN0ZWQgPSB7IGk6IDAgfTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhYnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgc2VsZWN0W2ldID0gdGFic1tpXVswXTtcbiAgICAgICAgY29udGVudFtpXSA9IFtpLCB0YWJzW2ldWzFdXTtcbiAgICB9XG4gICAgY29uc3QgbXV4ID0gU3dpdGNoKHRhYnNbMF1bMF0sIC4uLmNvbnRlbnQpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFicy5sZW5ndGg7IGkrKykge1xuICAgICAgICBzZWxlY3RbaV0ub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBUYWJTdGF0ZSkgPT4ge1xuXG4gICAgICAgICAgICBzdGF0ZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgbXV4LnNldChlYywgdGFic1tpXVswXSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gQm90dG9tKFxuICAgICAgICBGbGV4KGNvbnRlbnRIZWlnaHQsIDAsIExlZnQoLi4uc2VsZWN0KSksXG4gICAgICAgIEZsZXgoc2VsZWN0SGVpZ2h0LCAwLCBtdXgpLFxuICAgICk7XG59XG4qL1xuXG5leHBvcnQgZnVuY3Rpb24gU2NlbmVFbGVtZW50KHNjZW5lSlNPTjogU2NlbmVKU09OKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgZWRpdCA9IG5ldyBTY2VuZUVkaXRvcihzY2VuZUpTT04pO1xuXG4gICAgY29uc3Qgc2NlbmVVSSA9IE11eChcbiAgICAgICAgW1widGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCJdLFxuICAgICAgICBbXCJ0ZXJyYWluXCIsIEZpbGwoc2NlbmVKU09OLnRlcnJhaW4pLm9uRHJhdyhkcmF3VGVycmFpbildLFxuICAgICAgICBbXCJ0cnVzc1wiLCBUcnVzc0xheWVyKHNjZW5lSlNPTi50cnVzcyldLFxuICAgICAgICBbXCJhZGRfdHJ1c3NcIiwgQWRkVHJ1c3NMYXllcihlZGl0KV0sXG4gICAgICAgIFtcInNpbXVsYXRlXCIsIFNpbXVsYXRlTGF5ZXIoZWRpdCldLFxuICAgICk7XG5cbiAgICBjb25zdCBkcmF3UiA9IGRyYXdGaWxsKFwicmVkXCIpO1xuICAgIGNvbnN0IGRyYXdHID0gZHJhd0ZpbGwoXCJncmVlblwiKTtcbiAgICBjb25zdCBkcmF3QiA9IGRyYXdGaWxsKFwiYmx1ZVwiKTtcblxuICAgIGNvbnN0IHRvb2xzID0gU3dpdGNoKFxuICAgICAgICAxLFxuICAgICAgICBMZWZ0KHVuZG9CdXR0b24oZWRpdCksIHJlZG9CdXR0b24oZWRpdCkpLFxuICAgICAgICBGaWxsKCkub25EcmF3KGRyYXdHKSxcbiAgICAgICAgRmlsbCgpLm9uRHJhdyhkcmF3QiksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDIsXG4gICAgICAgICksXG4gICAgICAgIEJvdHRvbShcbiAgICAgICAgICAgIEZsZXgoNjQsIDAsXG4gICAgICAgICAgICAgICAgdG9vbHMsICBcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIExlZnQoXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Uikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDAsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIpOyB9KSxcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdHKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyB0b29scy5zZXQoMSwgZWMpOyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIik7IH0pLFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd0IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b29scy5zZXQoMiwgZWMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInNpbXVsYXRlXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWMudGltZXIoKHQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWRpdC5zaW11bGF0b3IoKS5zaW11bGF0ZSh0IC8gMTAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICk7XG59XG4iXX0=