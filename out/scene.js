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
        this.playTimer = undefined;
        this.playTime = 0;
        this.playTick = (ms, ec) => {
            // Only compute up to 100ms of frames per tick, to allow other things to happen if we are behind.
            let t1 = Math.min(this.playTime + ms * 0.001, this.method.t + 0.1);
            while (this.method.t < t1) {
                this.next();
            }
            ec.requestDraw();
        };
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
    seek(t, ec) {
        const y = this.keyframes.get(t);
        if (y === undefined) {
            throw new Error(`${t} is not a keyframe time`);
        }
        for (let i = 0; i < y.length; i++) {
            this.method.y[i] = y[i];
        }
        this.method.t = t;
        if (this.playTimer !== undefined) {
            this.pause(ec);
            this.play(ec);
        }
    }
    time() {
        return this.method.t;
    }
    next() {
        const prevT = this.method.t;
        this.method.next(this.h);
        const isKeyframe = Math.floor(prevT / this.keyInterval) !== Math.floor(this.method.t / this.keyInterval);
        if (this.tLatest < this.method.t) {
            if (isKeyframe) {
                this.keyframes.set(this.method.t, new Float32Array(this.method.y));
            }
            this.tLatest = this.method.t;
        }
        else if (isKeyframe) {
            const y = this.keyframes.get(this.method.t);
            if (y === undefined) {
                console.log(`frame ${this.method.t} should be a keyframe`);
                return;
            }
            let diff = false;
            for (let i = 0; i < y.length; i++) {
                if (y[i] !== this.method.y[i]) {
                    diff = true;
                }
            }
            if (diff) {
                console.log(`Replaying frame ${this.method.t} produced a difference!`);
            }
            else {
                console.log(`Replaying frame ${this.method.t} produced the same state`);
            }
        }
    }
    playing() {
        return this.playTimer !== undefined;
    }
    play(ec) {
        if (this.playTimer !== undefined) {
            return;
        }
        this.playTime = this.method.t;
        this.playTimer = ec.timer(this.playTick, undefined);
    }
    pause(ec) {
        if (this.playTimer === undefined) {
            return;
        }
        ec.clearTimer(this.playTimer);
        this.playTimer = undefined;
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
        // TODO: update simulator with saved state.
        if (this.sim !== undefined) {
            this.sim.pause(ec);
            this.sim = undefined;
        }
    }
    redo(ec) {
        const a = this.scene.redoStack.pop();
        if (a === undefined) {
            throw new Error("no action to redo");
        }
        this.doAction(a, ec);
        this.scene.undoStack.push(a);
        // TODO: update simulator with saved state.
        if (this.sim !== undefined) {
            this.sim.pause(ec);
            this.sim = undefined;
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
    drawBeam(ctx, p1, p2, w, style, deck);
}
function createBeamPinOnPan(ps, ec, state) {
    const truss = state.edit.scene.truss;
    const i = trussGetClosestPin(truss, ps[0].curr, 2, state.i);
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
function redoButtonTap(_p, ec, edit) {
    if (edit.redoCount() > 0) {
        edit.redo(ec);
    }
}
function redoButtonDraw(ctx, box, _ec, _vp, edit) {
    ctx.fillStyle = "white";
    ctx.strokeStyle = edit.redoCount() === 0 ? "gray" : "black";
    drawButtonBorder(ctx, box);
    drawCircleWithArrow(ctx, box, false);
}
function redoButton(edit) {
    return Flex(64, 0, edit).onTap(redoButtonTap).onDraw(redoButtonDraw);
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
        const sim = edit.simulator();
        if (sim.playing()) {
            sim.pause(ec);
        }
        else {
            sim.play(ec);
        }
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        drawButtonBorder(ctx, box);
        if (edit.simulator().playing()) {
            drawPause(ctx, box);
        }
        else {
            drawPlay(ctx, box);
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
        const sim = edit.simulator();
        if (sim.playing()) {
            sim.pause(ec);
        }
        sim.seek(0, ec);
        ec.requestDraw();
    }).onDraw((ctx, box) => {
        drawButtonBorder(ctx, box);
        drawReset(ctx, box);
    });
}
export function SceneElement(sceneJSON) {
    const edit = new SceneEditor(sceneJSON);
    const sceneUI = Mux(["terrain", "truss", "add_truss"], ["terrain", Fill(sceneJSON.terrain).onDraw(drawTerrain)], ["truss", TrussLayer(sceneJSON.truss)], ["add_truss", AddTrussLayer(edit)], ["simulate", SimulateLayer(edit)]);
    const drawR = drawFill("red");
    const drawG = drawFill("green");
    const drawB = drawFill("blue");
    const tools = Switch(1, Left(undoButton(edit), redoButton(edit)), Fill().onDraw(drawG), Left(resetButton(edit), playButton(edit)));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 16), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => {
        tools.set(2, ec);
        sceneUI.set(ec, "terrain", "simulate");
        // TODO: simulation state stored in do/undo stacks.
    })))));
    // TODO: fix scale, fix materials
    // need to fix TouchGesture to change the threshold from a drag to be based on the zoom. which needs ScrollLayout to update the ElementContext is passed to children (and to include screen scaling stuff on ec)
    // TODO: material selection. (might need text layout, which is a whole can of worms...)
    // TODO: save/load
    // Have list of levels in some JSON resource file.
    // Have option to load json file from local.
    // auto-save every n seconds after change, key in local storage is uri of level json.
    // when loading, check local storage and load that instead if it exists (and the non editable parts match?)
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFnQixNQUFNLGNBQWMsQ0FBQztBQTZDbE8sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJ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QUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEYsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDL0IsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM3RCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUNqQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxFQUFtQixFQUFFLEVBQWtCLEVBQUUsS0FBeUI7SUFDMUYsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3JDLE1BQU0sQ0FBQyxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUQsS0FBSyxDQUFDLElBQUksR0FBRztRQUNULENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNiLENBQUM7S0FDSixDQUFDO0lBQ0YsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEVBQWtCLEVBQUUsS0FBeUI7SUFDeEUsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3JDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUU7UUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0tBQzdDO0lBQ0QsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxTQUFTLEVBQUU7UUFDNUIsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztLQUN2RDtTQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUN2RCwrREFBK0Q7UUFDL0QsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztLQUNqRDtJQUNELEtBQUssQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxJQUFpQixFQUFFLENBQVM7SUFDL0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDL0IsTUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNoQyw0R0FBNEc7SUFDNUcsT0FBTyxRQUFRLENBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ3JFLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQztTQUMzQixLQUFLLENBQUMsa0JBQWtCLENBQUM7U0FDekIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDekMsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsSUFBaUI7SUFDM0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDL0IsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLEtBQUssSUFBSSxDQUFDLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3hFLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ3pDO0lBQ0QsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUM7SUFFaEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFNBQWlCLEVBQUUsR0FBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixHQUFHLGFBQWEsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNwRSxRQUFRLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxTQUFpQixFQUFFLEdBQVcsRUFBRSxFQUFrQixFQUFFLEVBQUU7UUFDcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsR0FBRyxhQUFhLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDdEUsV0FBVyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUIsRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBRUgsZ0RBQWdEO0lBQ2hELE9BQU8sQ0FBQyxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsSUFBaUI7SUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDL0IsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDakMsTUFBTSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLEtBQUssSUFBSSxDQUFDLEdBQUcsd0JBQXdCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3BGLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxFQUFFO1lBQ3ZELG9FQUFvRTtZQUNwRSxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN6QztLQUNKO0lBQ0QsT0FBTyxRQUFRLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsS0FBa0I7SUFDckMsT0FBTyxLQUFLLENBQ1Isc0JBQXNCLENBQUMsS0FBSyxDQUFDLEVBQzdCLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUM5QixDQUFDO0FBQ04sQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEdBQTZCLEVBQUUsRUFBVyxFQUFFLEVBQVcsRUFBRSxDQUFTLEVBQUUsS0FBOEMsRUFBRSxJQUFjO0lBQ2hKLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBQ3RCLEdBQUcsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO0lBQ3hCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6QixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDYixJQUFJLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxFQUFFO1FBQzVCLEdBQUcsQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLENBQUUsbUJBQW1CO1FBQy9DLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDaEI7QUFDTCxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxHQUE2QixFQUFFLElBQWUsRUFBRSxHQUFtQixFQUFFLEdBQWMsRUFBRSxLQUFZO0lBQ3ZILEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRTtRQUM5QixRQUFRLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUM5RztJQUNELEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUM3QixRQUFRLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUM5RztBQUNMLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFZO0lBQzVCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ2hELENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLEdBQTZCLEVBQUUsSUFBZSxFQUFFLEdBQW1CLEVBQUUsR0FBYyxFQUFFLElBQWlCO0lBQy9ILE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUMxQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDN0IsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1FBQzlCLFFBQVEsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlGO0lBQ0QsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFO1FBQzdCLFFBQVEsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlGO0FBQ0wsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLElBQWlCO0lBQ3BDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxHQUFtQixFQUFFLEVBQWEsRUFBRSxPQUFnQjtJQUNwSCxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztJQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQztJQUM5QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvRSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RSxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUM7SUFDOUIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQyxLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQy9CLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDdkQ7SUFDRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN2RCxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDaEIsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQ2YsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEtBQThDO0lBQzVELE9BQU8sQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxFQUFFO1FBQ3JELEdBQUcsQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNELENBQUMsQ0FBQTtBQUNMLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxFQUFXLEVBQUUsRUFBa0IsRUFBRSxJQUFpQjtJQUNyRSxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLEVBQUU7UUFDdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztLQUNqQjtBQUNMLENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLEdBQTZCLEVBQUUsR0FBYyxFQUFFLEdBQVk7SUFDcEYsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQztJQUNyQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO0lBQ3JDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBRTVCLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7SUFDL0MsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDMUIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3BD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SSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDekssSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUNoRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDdkMsbURBQW1EO0lBQ3ZELENBQUMsQ0FBQyxDQUNMLENBQ0osQ0FDSixDQUNKLENBQUM7SUFDRixpQ0FBaUM7SUFDakMsZ05BQWdOO0lBRWhOLHVGQUF1RjtJQUV2RixrQkFBa0I7SUFDbEIsa0RBQWtEO0lBQ2xELDRDQUE0QztJQUM1QyxxRkFBcUY7SUFDckYsMkdBQTJHO0FBQy9HLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQ2hhcmxlcyBEdWVjayAyMDIwXG5cbmltcG9ydCB7IERlcml2YXRpdmUgfSBmcm9tIFwiLi9vZGUuanNcIjtcbmltcG9ydCB7IFBvaW50MkQsIHBvaW50RGlzdGFuY2UgfSBmcm9tIFwiLi9wb2ludC5qc1wiO1xuaW1wb3J0IHsgUnVuZ2VLdXR0YTQgfSBmcm9tIFwiLi9yazQuanNcIjtcbmltcG9ydCB7IGFkZENoaWxkLCBCb3R0b20sIEJveCwgRWxlbWVudENvbnRleHQsIEZpbGwsIEZsZXgsIExheWVyLCBMYXlvdXRCb3gsIExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQsIExlZnQsIE11eCwgUGFuUG9pbnQsIFBvc2l0aW9uLCBQb3NpdGlvbkxheW91dCwgUmVsYXRpdmUsIHJlbW92ZUNoaWxkLCBTY3JvbGwsIFN3aXRjaCwgVGltZXJIYW5kbGVyIH0gZnJvbSBcIi4vdWkvbm9kZS5qc1wiO1xuXG5leHBvcnQgdHlwZSBCZWFtID0ge1xuICAgIHAxOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBiZWdpbm5pbmcgb2YgYmVhbS5cbiAgICBwMjogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgZW5kIG9mIGJlYW0uXG4gICAgbTogbnVtYmVyOyAgLy8gSW5kZXggb2YgbWF0ZXJpYWwgb2YgYmVhbS5cbiAgICB3OiBudW1iZXI7ICAvLyBXaWR0aCBvZiBiZWFtLlxuICAgIGw/OiBudW1iZXI7IC8vIExlbmd0aCBvZiBiZWFtLCBvbmx5IHNwZWNpZmllZCB3aGVuIHByZS1zdHJhaW5pbmcuXG4gICAgZGVjaz86IGJvb2xlYW47IC8vIElzIHRoaXMgYmVhbSBhIGRlY2s/IChkbyBkaXNjcyBjb2xsaWRlKVxufTtcblxudHlwZSBTaW11bGF0aW9uQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsOiBudW1iZXI7XG4gICAgZGVjazogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgRGlzYyA9IHtcbiAgICBwOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtb3ZlYWJsZSBwaW4gdGhpcyBkaXNjIHN1cnJvdW5kcy5cbiAgICBtOiBudW1iZXI7ICAvLyBNYXRlcmlhbCBvZiBkaXNjLlxuICAgIHI6IG51bWJlcjsgIC8vIFJhZGl1cyBvZiBkaXNjLlxuICAgIHY6IG51bWJlcjsgIC8vIFZlbG9jaXR5IG9mIHN1cmZhY2Ugb2YgZGlzYyAoaW4gQ0NXIGRpcmVjdGlvbikuXG59O1xuXG5leHBvcnQgdHlwZSBNYXRlcmlhbCA9IHtcbiAgICBFOiBudW1iZXI7ICAvLyBZb3VuZydzIG1vZHVsdXMgaW4gUGEuXG4gICAgZGVuc2l0eTogbnVtYmVyOyAgICAvLyBrZy9tXjNcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgLy8gVE9ETzogd2hlbiBzdHVmZiBicmVha3MsIHdvcmsgaGFyZGVuaW5nLCBldGMuXG59O1xuXG5leHBvcnQgdHlwZSBUcnVzcyA9IHtcbiAgICBmaXhlZFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgZWRpdFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIHN0YXJ0QmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGVkaXRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZGlzY3M6IEFycmF5PERpc2M+O1xuICAgIG1hdGVyaWFsczogQXJyYXk8TWF0ZXJpYWw+O1xufTtcblxuZnVuY3Rpb24gdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzczogVHJ1c3MsIG06IG51bWJlcikge1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBpZiAobSA8IDAgfHwgbSA+PSBtYXRlcmlhbHMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBtYXRlcmlhbCBpbmRleCAke219YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKSB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoIHx8IHBpbiA+PSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0cnVzc0JlYW1FeGlzdHModHJ1c3M6IFRydXNzLCBwMTogbnVtYmVyLCBwMjogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICBpZiAoKHAxID09PSBiZWFtLnAxICYmIHAyID09PSBiZWFtLnAyKSB8fCAocDEgPT09IGJlYW0ucDIgJiYgcDIgPT09IGJlYW0ucDEpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0VkaXRQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzVW5lZGl0YWJsZVBpbnNCZWdpbih0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc01vdmluZ1BpbnNDb3VudCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldENsb3Nlc3RQaW4odHJ1c3M6IFRydXNzLCBwOiBQb2ludDJELCBtYXhkOiBudW1iZXIsIGJlYW1TdGFydD86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gICAgLy8gVE9ETzogYWNjZWxlcmF0aW9uIHN0cnVjdHVyZXMuIFByb2JhYmx5IG9ubHkgbWF0dGVycyBvbmNlIHdlIGhhdmUgMTAwMHMgb2YgcGlucz9cbiAgICBjb25zdCBibG9jayA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGxldCByZXMgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHJlc2QgPSBtYXhkO1xuICAgIGlmIChiZWFtU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3Muc3RhcnRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgICAgIGlmIChiLnAxID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5maXhlZFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgLSB0cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5zdGFydFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3Muc3RhcnRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5lZGl0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5lZGl0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSArIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiB0cnVzc0dldFBpbih0cnVzczogVHJ1c3MsIHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgaWYgKHBpbiA8IC10cnVzcy5maXhlZFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmZpeGVkUGluc1t0cnVzcy5maXhlZFBpbnMubGVuZ3RoICsgcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLnN0YXJ0UGluc1twaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZWRpdFBpbnNbcGluIC0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuZXhwb3J0IHR5cGUgVGVycmFpbiA9IHtcbiAgICBobWFwOiBBcnJheTxudW1iZXI+O1xuICAgIGZyaWN0aW9uOiBudW1iZXI7XG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbn07XG5cbnR5cGUgU2ltdWxhdGlvbkhNYXAgPSBBcnJheTx7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgbng6IG51bWJlcjsgLy8gT3V0d2FyZCAoZGlyZWN0aW9uIG9mIGJvdW5jZSkgbm9ybWFsIHVuaXQgdmVjdG9yLlxuICAgIG55OiBudW1iZXI7XG4gICAgZGVja3M6IEFycmF5PFNpbXVsYXRpb25CZWFtPjsgICAvLyBVcGRhdGVkIGV2ZXJ5IGZyYW1lLCBhbGwgZGVja3MgYWJvdmUgdGhpcyBzZWdtZW50LlxuICAgIGRlY2tDb3VudDogbnVtYmVyOyAgLy8gTnVtYmVyIG9mIGluZGljZXMgaW4gZGVja3MgYmVpbmcgdXNlZC5cbn0+O1xuXG50eXBlIEFkZEJlYW1BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfYmVhbVwiO1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw/OiBudW1iZXI7XG4gICAgZGVjaz86IGJvb2xlYW47XG59O1xuXG50eXBlIEFkZFBpbkFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9waW5cIjtcbiAgICBwaW46IFBvaW50MkQ7XG59O1xuXG50eXBlIENvbXBvc2l0ZUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImNvbXBvc2l0ZVwiO1xuICAgIGFjdGlvbnM6IEFycmF5PFRydXNzQWN0aW9uPjtcbn07XG5cbnR5cGUgVHJ1c3NBY3Rpb24gPSBBZGRCZWFtQWN0aW9uIHwgQWRkUGluQWN0aW9uIHwgQ29tcG9zaXRlQWN0aW9uO1xuXG5cbmV4cG9ydCB0eXBlIFNjZW5lSlNPTiA9IHtcbiAgICB0cnVzczogVHJ1c3M7XG4gICAgdGVycmFpbjogVGVycmFpbjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGc6IFBvaW50MkQ7ICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgcmVkb1N0YWNrOiBBcnJheTxUcnVzc0FjdGlvbj47XG4gICAgdW5kb1N0YWNrOiBBcnJheTxUcnVzc0FjdGlvbj47XG59XG5cbmNsYXNzIFNjZW5lU2ltdWxhdG9yIHtcbiAgICBwcml2YXRlIG1ldGhvZDogUnVuZ2VLdXR0YTQ7ICAgICAgICAgICAgICAgICAgICAvLyBPREUgc29sdmVyIG1ldGhvZCB1c2VkIHRvIHNpbXVsYXRlLlxuICAgIHByaXZhdGUgZHlkdDogRGVyaXZhdGl2ZTsgICAgICAgICAgICAgICAgICAgICAgIC8vIERlcml2YXRpdmUgb2YgT0RFIHN0YXRlLlxuICAgIHByaXZhdGUgaDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRpbWUgc3RlcC5cbiAgICBwcml2YXRlIGZpeGVkUGluczogRmxvYXQzMkFycmF5OyAgICAgICAgICAgICAgICAvLyBQb3NpdGlvbnMgb2YgZml4ZWQgcGlucyBbeDAsIHkwLCB4MSwgeTEsIC4uLl0uXG4gICAgcHJpdmF0ZSB0TGF0ZXN0OiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGhpZ2hlc3QgdGltZSB2YWx1ZSBzaW11bGF0ZWQuXG4gICAgcHJpdmF0ZSBrZXlJbnRlcnZhbDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAvLyBUaW1lIHBlciBrZXlmcmFtZS5cbiAgICBwcml2YXRlIGtleWZyYW1lczogTWFwPG51bWJlciwgRmxvYXQzMkFycmF5PjsgICAvLyBNYXAgb2YgdGltZSB0byBzYXZlZCBzdGF0ZS5cbiAgICBwcml2YXRlIHBsYXlUaW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgcGxheVRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlIHBsYXlUaWNrOiBUaW1lckhhbmRsZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OLCBoOiBudW1iZXIsIGtleUludGVydmFsOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5oID0gaDtcbiAgICAgICAgdGhpcy50TGF0ZXN0ID0gMDtcbiAgICAgICAgdGhpcy5rZXlJbnRlcnZhbCA9IGtleUludGVydmFsO1xuICAgICAgICB0aGlzLmtleWZyYW1lcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5wbGF5VGltZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMucGxheVRpbWUgPSAwO1xuICAgICAgICB0aGlzLnBsYXlUaWNrID0gKG1zOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgLy8gT25seSBjb21wdXRlIHVwIHRvIDEwMG1zIG9mIGZyYW1lcyBwZXIgdGljaywgdG8gYWxsb3cgb3RoZXIgdGhpbmdzIHRvIGhhcHBlbiBpZiB3ZSBhcmUgYmVoaW5kLlxuICAgICAgICAgICAgbGV0IHQxID0gTWF0aC5taW4odGhpcy5wbGF5VGltZSArIG1zICogMC4wMDEsIHRoaXMubWV0aG9kLnQgKyAwLjEpO1xuICAgICAgICAgICAgd2hpbGUgKHRoaXMubWV0aG9kLnQgPCB0MSkge1xuICAgICAgICAgICAgICAgIHRoaXMubmV4dCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2FjaGUgZml4ZWQgcGluIHZhbHVlcy5cbiAgICAgICAgY29uc3QgZml4ZWRQaW5zID0gbmV3IEZsb2F0MzJBcnJheSh0cnVzcy5maXhlZFBpbnMubGVuZ3RoICogMik7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmaXhlZFBpbnNbaSAqIDJdID0gdHJ1c3MuZml4ZWRQaW5zW2ldWzBdO1xuICAgICAgICAgICAgZml4ZWRQaW5zW2kgKiAyICsgMV0gPSB0cnVzcy5maXhlZFBpbnNbaV1bMV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5maXhlZFBpbnMgPSBmaXhlZFBpbnM7XG5cbiAgICAgICAgLy8gQ2FjaGUgQmVhbSB2YWx1ZXMuXG4gICAgICAgIGNvbnN0IGJlYW1zOiBBcnJheTxTaW11bGF0aW9uQmVhbT4gPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoYiA9PiAoe1xuICAgICAgICAgICAgcDE6IGIucDEsXG4gICAgICAgICAgICBwMjogYi5wMixcbiAgICAgICAgICAgIG06IGIubSxcbiAgICAgICAgICAgIHc6IGIudyxcbiAgICAgICAgICAgIGw6IGIubCAhPT0gdW5kZWZpbmVkID8gYi5sIDogcG9pbnREaXN0YW5jZSh0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSksXG4gICAgICAgICAgICBkZWNrOiBiLmRlY2sgIT09IHVuZGVmaW5lZCA/IGIuZGVjayA6IGZhbHNlLFxuICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gQ2FjaGUgZGlzY3MuXG4gICAgICAgIGNvbnN0IGRpc2NzID0gdHJ1c3MuZGlzY3M7ICAvLyBUT0RPOiBkbyB3ZSBldmVyIHduYXQgdG8gbXV0YXRlIGRpc2NzP1xuXG4gICAgICAgIC8vIENhY2hlIG1hdGVyaWFscy5cbiAgICAgICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzOyAgLy8gVE9ETzogZG8gd2UgZXZlciB3YW50IHRvIG11dGF0ZSBtYXRlcmlhbHM/XG5cbiAgICAgICAgLy8gQ29tcHV0ZSB0aGUgbWFzcyBvZiBhbGwgcGlucy5cbiAgICAgICAgY29uc3QgbW92aW5nUGlucyA9IHRydXNzTW92aW5nUGluc0NvdW50KHRydXNzKTtcbiAgICAgICAgY29uc3QgbWFzcyA9IG5ldyBGbG9hdDMyQXJyYXkobW92aW5nUGlucyk7XG4gICAgICAgIGZ1bmN0aW9uIGFkZE1hc3MocGluOiBudW1iZXIsIG06IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICAvLyBGaXhlZCBwaW5zIGFscmVhZHkgaGF2ZSBpbmZpbml0ZSBtYXNzLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hc3NbcGluXSArPSBtO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiBiZWFtcykge1xuICAgICAgICAgICAgY29uc3QgbSA9IGIubCAqIGIudyAqIG1hdGVyaWFsc1tiLm1dLmRlbnNpdHk7XG4gICAgICAgICAgICAvLyBEaXN0cmlidXRlIHRoZSBtYXNzIGJldHdlZW4gdGhlIHR3byBlbmQgcGlucy5cbiAgICAgICAgICAgIC8vIFRPRE86IGRvIHByb3BlciBtYXNzIG1vbWVudCBvZiBpbnRlcnRpYSBjYWxjdWxhdGlvbiB3aGVuIHJvdGF0aW5nIGJlYW1zP1xuICAgICAgICAgICAgYWRkTWFzcyhiLnAxLCBtICogMC41KTtcbiAgICAgICAgICAgIGFkZE1hc3MoYi5wMiwgbSAqIDAuNSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBkIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gZC5yICogZC5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkLm1dLmRlbnNpdHk7XG4gICAgICAgICAgICBhZGRNYXNzKGQucCwgbSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICAgICAgZm9yIChjb25zdCBtIG9mIG1hc3MpIHtcbiAgICAgICAgICAgIGlmIChtIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJtYXNzIDAgcGluIGRldGVjdGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FjaGUgdGhlIHRlcnJhaW4sIHNldCB1cCBhY2NlbGVyYXRpb24gc3RydWN0dXJlIGZvciBkZWNrIGludGVyc2VjdGlvbnMuXG4gICAgICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG4gICAgICAgIGNvbnN0IGhlaWdodCA9IHNjZW5lLmhlaWdodDtcbiAgICAgICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSk7XG4gICAgICAgIGNvbnN0IGhtYXA6IFNpbXVsYXRpb25ITWFwID0gc2NlbmUudGVycmFpbi5obWFwLm1hcCgoaCwgaSkgPT4ge1xuICAgICAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgICAgIG55Oi0xLjAsXG4gICAgICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICBueDogZHkgLyBsLFxuICAgICAgICAgICAgICAgIG55OiAtcGl0Y2ggLyBsLFxuICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZnVuY3Rpb24gaG1hcEFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgICAgIGguZGVja3NbaC5kZWNrQ291bnRdID0gZDtcbiAgICAgICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXRlIGFjY2Vzc29yc1xuICAgICAgICBjb25zdCB2SW5kZXggPSBtb3ZpbmdQaW5zICogMjtcbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDJdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDIgKyAxXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVt2SW5kZXggKyBwaW4gKiAyXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbdkluZGV4ICsgcGluICogMiArIDFdOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVtwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3ZJbmRleCArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVt2SW5kZXggKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZm9yY2UoZHlkdDogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgZng6IG51bWJlciwgZnk6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IG1hc3NbcGluXTtcbiAgICAgICAgICAgICAgICBkeWR0W3ZJbmRleCArIHBpbiAqIDIgKyAwXSArPSBmeCAvIG07XG4gICAgICAgICAgICAgICAgZHlkdFt2SW5kZXggKyBwaW4gKiAyICsgMV0gKz0gZnkgLyBtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlLiBOQjogdmVsb2NpdGllcyBhcmUgYWxsIHplcm8uXG4gICAgICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb3ZpbmdQaW5zICogNCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICAgICAgc2V0ZHgoeTAsIGksIGRbMF0pO1xuICAgICAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FjaGUgYWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICBjb25zdCBnID0gc2NlbmUuZztcblxuICAgICAgICB0aGlzLmR5ZHQgPSBmdW5jdGlvbiBkeWR5KF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzZXRkeChkeWR0LCBpLCBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICAgICAgaWYgKHAxIDwgMCAmJiBwMiA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQm90aCBlbmRzIGFyZSBub3QgbW92ZWFibGUuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBzcHJpbmdGLCB1eSAqIHNwcmluZ0YpO1xuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGLCAtdXkgKiBzcHJpbmdGKTtcblxuICAgICAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICAgICAgY29uc3QgemV0YSA9IDAuNTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIHAyKSAtIGdldHZ4KHksIHAxKTsgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEuXG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdiA9IHZ4ICogdXggKyB2eSAqIHV5OyAgICAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMSBpbiBkaXJlY3Rpb24gb2YgYmVhbS5cbiAgICAgICAgICAgICAgICBpZiAocDEgPj0gMCAmJiBwMiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gbWFzc1twMV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gbWFzc1twMl07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBkYW1wRiwgdXkgKiBkYW1wRik7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBkYW1wRiwgLXV5ICogZGFtcEYpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocDEgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IG1hc3NbcDFdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSk7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAxLCB1eCAqIGRhbXBGLCB1eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHAyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBtYXNzW3AyXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMiwgLXV4ICogZGFtcEYsIC11eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgZGVja3MgdG8gYWNjbGVyYXRpb24gc3RydWN0dXJlXG4gICAgICAgICAgICAgICAgaWYgKGJlYW0uZGVjaykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWdpbiA9IE1hdGgubWluKGkxLCBpMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaG1hcEFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb25cbiAgICAgICAgICAgIC8vIFRPRE86IHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBpKTsgLy8gUGluIHBvc2l0aW9uLlxuICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IG1hc3NbaV07XG4gICAgICAgICAgICAgICAgbGV0IGJvdW5jZUYgPSAxMDAwLjAgKiBtOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICAgICAgbGV0IG54OyAvLyBUZXJyYWluIHVuaXQgbm9ybWFsIChkaXJlY3Rpb24gb2YgYWNjZWxlcmF0aW9uKS5cbiAgICAgICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgICAgICBueSA9IC0xLjA7XG4gICAgICAgICAgICAgICAgICAgIGJvdW5jZUYgKj0gZHkgLSBoZWlnaHQgKyBobWFwWzBdLmhlaWdodDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAgICAgICAgIC8vIERpc3RhbmNlIGJlbG93IHRlcnJhaW4gaXMgbm9ybWFsIGRvdCB2ZWN0b3IgZnJvbSB0ZXJyYWluIHRvIHBvaW50LlxuICAgICAgICAgICAgICAgICAgICBib3VuY2VGICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChib3VuY2VGIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSBhcmUgbm90IGJvdW5jaW5nLlxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgbnggKiBib3VuY2VGLCBueSAqIGJvdW5jZUYpO1xuXG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IHZ4ICogdHggKyB2eSAqIHR5O1xuICAgICAgICAgICAgICAgIGxldCBmcmljdGlvbkYgPSB0RnJpY3Rpb24gKiBib3VuY2VGICogKHR2ID4gMCA/IC0xIDogMSk7XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgdHggKiBmcmljdGlvbkYsIHR5ICogZnJpY3Rpb25GKTtcblxuICAgICAgICAgICAgICAgIC8vIE9sZCBDb2RlXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogd2h5IGRpZCB0aGlzIG5lZWQgdG8gY2FwIHRoZSBhY2NlbGVyYXRpb24/IG1heWJlIGJvdW5jZSBmb3JjZSBpcyB0b28gaGlnaD9cbiAgICAgICAgICAgICAgICAvL2NvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUT0RPOiBkaXNjc1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5tZXRob2QgPSBuZXcgUnVuZ2VLdXR0YTQoeTAsIHRoaXMuZHlkdCk7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzLnNldCh0aGlzLm1ldGhvZC50LCBuZXcgRmxvYXQzMkFycmF5KHRoaXMubWV0aG9kLnkpKTtcbiAgICB9XG5cbiAgICBzZWVrVGltZXMoKTogSXRlcmFibGVJdGVyYXRvcjxudW1iZXI+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5ZnJhbWVzLmtleXMoKTtcbiAgICB9XG5cbiAgICBzZWVrKHQ6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHkgPSB0aGlzLmtleWZyYW1lcy5nZXQodCk7XG4gICAgICAgIGlmICh5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHt0fSBpcyBub3QgYSBrZXlmcmFtZSB0aW1lYCk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLm1ldGhvZC55W2ldID0geVtpXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1ldGhvZC50ID0gdDtcblxuICAgICAgICBpZiAodGhpcy5wbGF5VGltZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnBsYXkoZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGltZSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5tZXRob2QudDtcbiAgICB9XG5cbiAgICBwcml2YXRlIG5leHQoKSB7ICAgIC8vIFRPRE86IG1ha2UgdGhpcyBwcml2YXRlP1xuICAgICAgICBjb25zdCBwcmV2VCA9IHRoaXMubWV0aG9kLnQ7XG4gICAgICAgIHRoaXMubWV0aG9kLm5leHQodGhpcy5oKTtcbiAgICAgICAgY29uc3QgaXNLZXlmcmFtZSA9IE1hdGguZmxvb3IocHJldlQgLyB0aGlzLmtleUludGVydmFsKSAhPT0gTWF0aC5mbG9vcih0aGlzLm1ldGhvZC50IC8gdGhpcy5rZXlJbnRlcnZhbCk7XG4gICAgICAgIGlmICh0aGlzLnRMYXRlc3QgPCB0aGlzLm1ldGhvZC50KSB7XG4gICAgICAgICAgICBpZiAoaXNLZXlmcmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMua2V5ZnJhbWVzLnNldCh0aGlzLm1ldGhvZC50LCBuZXcgRmxvYXQzMkFycmF5KHRoaXMubWV0aG9kLnkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMudExhdGVzdCA9IHRoaXMubWV0aG9kLnQ7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNLZXlmcmFtZSkge1xuICAgICAgICAgICAgY29uc3QgeSA9IHRoaXMua2V5ZnJhbWVzLmdldCh0aGlzLm1ldGhvZC50KTtcbiAgICAgICAgICAgIGlmICh5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZnJhbWUgJHt0aGlzLm1ldGhvZC50fSBzaG91bGQgYmUgYSBrZXlmcmFtZWApO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBkaWZmID0gZmFsc2U7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoeVtpXSAhPT0gdGhpcy5tZXRob2QueVtpXSkge1xuICAgICAgICAgICAgICAgICAgICBkaWZmID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGlmZikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBSZXBsYXlpbmcgZnJhbWUgJHt0aGlzLm1ldGhvZC50fSBwcm9kdWNlZCBhIGRpZmZlcmVuY2UhYCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBSZXBsYXlpbmcgZnJhbWUgJHt0aGlzLm1ldGhvZC50fSBwcm9kdWNlZCB0aGUgc2FtZSBzdGF0ZWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcGxheWluZygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcGxheShlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBsYXlUaW1lID0gdGhpcy5tZXRob2QudDtcbiAgICAgICAgdGhpcy5wbGF5VGltZXIgPSBlYy50aW1lcih0aGlzLnBsYXlUaWNrLCB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIHBhdXNlKGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5wbGF5VGltZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVjLmNsZWFyVGltZXIodGhpcy5wbGF5VGltZXIpO1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBnZXRQaW4ocGluOiBudW1iZXIpOiBQb2ludDJEIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSB0aGlzLmZpeGVkUGlucy5sZW5ndGggKyBwaW4gKiAyO1xuICAgICAgICAgICAgcmV0dXJuIFt0aGlzLmZpeGVkUGluc1tpXSwgdGhpcy5maXhlZFBpbnNbaSsxXV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpID0gcGluICogMjtcbiAgICAgICAgICAgIGNvbnN0IHkgPSB0aGlzLm1ldGhvZC55O1xuICAgICAgICAgICAgcmV0dXJuIFt5W2ldLCB5W2krMV1dO1xuICAgICAgICB9XG4gICAgfVxufTtcblxudHlwZSBPbkFkZFBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG50eXBlIE9uUmVtb3ZlUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcblxuZXhwb3J0IGNsYXNzIFNjZW5lRWRpdG9yIHtcbiAgICBzY2VuZTogU2NlbmVKU09OO1xuICAgIHByaXZhdGUgc2ltOiBTY2VuZVNpbXVsYXRvciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIG9uQWRkUGluSGFuZGxlcnM6IEFycmF5PE9uQWRkUGluSGFuZGxlcj47XG4gICAgcHJpdmF0ZSBvblJlbW92ZVBpbkhhbmRsZXJzOiBBcnJheTxPblJlbW92ZVBpbkhhbmRsZXI+O1xuICAgIGVkaXRNYXRlcmlhbDogbnVtYmVyO1xuICAgIGVkaXRXaWR0aDogbnVtYmVyO1xuICAgIGVkaXREZWNrOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFNjZW5lSlNPTikge1xuICAgICAgICB0aGlzLnNjZW5lID0gc2NlbmU7XG4gICAgICAgIHRoaXMuc2ltID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLm9uQWRkUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIC8vIFRPRE86IHByb3BlciBpbml0aWFsaXphdGlvbjtcbiAgICAgICAgdGhpcy5lZGl0TWF0ZXJpYWwgPSAwO1xuICAgICAgICB0aGlzLmVkaXRXaWR0aCA9IDQ7XG4gICAgICAgIHRoaXMuZWRpdERlY2sgPSB0cnVlO1xuICAgIH1cblxuICAgIHNpbXVsYXRvcigpOiBTY2VuZVNpbXVsYXRvciB7XG4gICAgICAgIGlmICh0aGlzLnNpbSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNpbSA9IG5ldyBTY2VuZVNpbXVsYXRvcih0aGlzLnNjZW5lLCAwLjAwMSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2ltO1xuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAxID0gYS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBhLnAyO1xuICAgICAgICBjb25zdCBtID0gYS5tO1xuICAgICAgICBjb25zdCB3ID0gYS53O1xuICAgICAgICBjb25zdCBsID0gYS5sO1xuICAgICAgICBjb25zdCBkZWNrID0gYS5kZWNrO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzLCBtKTtcbiAgICAgICAgaWYgKHcgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gd2lkdGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7d31gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobCAhPT0gdW5kZWZpbmVkICYmIGwgPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gbGVuZ3RoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke2x9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0cnVzcy5lZGl0QmVhbXMucHVzaCh7cDEsIHAyLCBtLCB3LCBsLCBkZWNrfSk7XG4gICAgICAgIFxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cbiAgICBcbiAgICBwcml2YXRlIHVuZG9BZGRCZWFtKGE6IEFkZEJlYW1BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGIgPSB0cnVzcy5lZGl0QmVhbXMucG9wKCk7XG4gICAgICAgIGlmIChiID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gYmVhbXMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYi5wMSAhPT0gYS5wMSB8fCBiLnAyICE9PSBhLnAyIHx8IGIubSAhPT0gYS5tIHx8IGIudyAhPSBhLncgfHwgYi5sICE9PSBhLmwgfHwgYi5kZWNrICE9PSBhLmRlY2spIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQmVhbSBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgdHJ1c3MuZWRpdFBpbnMucHVzaChhLnBpbik7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uQWRkUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FkZFBpbihhOiBBZGRQaW5BY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzcy5lZGl0UGlucy5wb3AoKTtcbiAgICAgICAgaWYgKHAgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwaW5zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBbMF0gIT09IGEucGluWzBdIHx8IHBbMV0gIT09IGEucGluWzFdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BpbiBkb2VzIG5vdCBtYXRjaCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVkaXRJbmRleCA9IHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgY29uc3QgcGluID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIGVkaXRJbmRleDtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEuYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0NvbXBvc2l0ZShhOiBDb21wb3NpdGVBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBmb3IgKGxldCBpID0gYS5hY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZFBpbihhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiY29tcG9zaXRlXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNjZW5lIGVudW1lcmF0aW9uL29ic2VydmF0aW9uIG1ldGhvZHNcblxuICAgIG9uQWRkUGluKGhhbmRsZXI6IE9uQWRkUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uQWRkUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICBvblJlbW92ZVBpbihoYW5kbGVyOiBPblJlbW92ZVBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogQ2xlYXIgaGFuZGxlcnM/XG5cbiAgICB1bmRvQ291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmUudW5kb1N0YWNrLmxlbmd0aDtcbiAgICB9XG5cbiAgICByZWRvQ291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NlbmUucmVkb1N0YWNrLmxlbmd0aDtcbiAgICB9XG5cbiAgICAvLyBTY2VuZSBtdXRhdGlvbiBtZXRob2RzXG5cbiAgICB1bmRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS51bmRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byB1bmRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudW5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUucmVkb1N0YWNrLnB1c2goYSk7XG4gICAgICAgIC8vIFRPRE86IHVwZGF0ZSBzaW11bGF0b3Igd2l0aCBzYXZlZCBzdGF0ZS5cbiAgICAgICAgaWYgKHRoaXMuc2ltICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltLnBhdXNlKGVjKTtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVkbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUucmVkb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gcmVkb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS51bmRvU3RhY2sucHVzaChhKTtcbiAgICAgICAgLy8gVE9ETzogdXBkYXRlIHNpbXVsYXRvciB3aXRoIHNhdmVkIHN0YXRlLlxuICAgICAgICBpZiAodGhpcy5zaW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zaW0ucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2NlbmUucmVkb1N0YWNrID0gW2FdO1xuICAgICAgICB0aGlzLnJlZG8oZWMpOyAgICAvLyBUT0RPOiBJcyB0aGlzIHRvbyBjbGV2ZXI/XG4gICAgfVxuXG4gICAgYWRkQmVhbShcbiAgICAgICAgcDE6IG51bWJlcixcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGlmICh0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHAxLCBwMikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBiZXR3ZWVuIHBpbnMgJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hY3Rpb24oe1xuICAgICAgICAgICAgdHlwZTogXCJhZGRfYmVhbVwiLFxuICAgICAgICAgICAgcDEsXG4gICAgICAgICAgICBwMixcbiAgICAgICAgICAgIG06IHRoaXMuZWRpdE1hdGVyaWFsLFxuICAgICAgICAgICAgdzogdGhpcy5lZGl0V2lkdGgsXG4gICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBkZWNrOiB0aGlzLmVkaXREZWNrXG4gICAgICAgIH0sIGVjKTtcbiAgICB9XG5cbiAgICBhZGRQaW4ocGluOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5hY3Rpb24oe3R5cGU6IFwiYWRkX3BpblwiLCBwaW59LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluQW5kQmVhbShcbiAgICAgICAgcGluOiBQb2ludDJELFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgY29uc3QgcDEgPSB0aGlzLnNjZW5lLnRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgdGhpcy5hY3Rpb24oe3R5cGU6IFwiY29tcG9zaXRlXCIsIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIHsgdHlwZTogXCJhZGRfcGluXCIsIHBpbn0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJhZGRfYmVhbVwiLFxuICAgICAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgICAgIHAyLFxuICAgICAgICAgICAgICAgIG06IHRoaXMuZWRpdE1hdGVyaWFsLFxuICAgICAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgICAgIGw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICBkZWNrOiB0aGlzLmVkaXREZWNrXG4gICAgICAgICAgICB9LFxuICAgICAgICBdfSwgZWMpO1xuICAgIH1cbn07XG5cbi8qXG5leHBvcnQgZnVuY3Rpb24gc2NlbmVNZXRob2Qoc2NlbmU6IFNjZW5lKTogT0RFTWV0aG9kIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIFxuICAgIGNvbnN0IGZpeGVkUGlucyA9IHRydXNzLmZpeGVkUGlucztcbiAgICBjb25zdCBtb2JpbGVQaW5zID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICBmdW5jdGlvbiBnZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbl1bMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdOyBcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVtwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3BsaXQgYmVhbSBtYXNzIGV2ZW5seSBiZXR3ZWVuIHBpbnMsIGluaXRpYWxpc2UgYmVhbSBsZW5ndGguXG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGNvbnN0IG1hc3MgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMpO1xuICAgIGZ1bmN0aW9uIGdldG0ocGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgcmV0dXJuIG1hc3NbcGluXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiA1Ljk3MmUyNDsgICAgLy8gTWFzcyBvZiB0aGUgRWFydGguXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBiZWFtcyA9IFsuLi50cnVzcy5zdGFydEJlYW1zLCAuLi50cnVzcy5lZGl0QmVhbXNdLm1hcCgoYmVhbTogQmVhbSk6IFNpbXVsYXRpb25CZWFtID0+IHtcbiAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgIGNvbnN0IGwgPSBwb2ludERpc3RhbmNlKHNjZW5lLmdldFBpbihwMSksIHNjZW5lLmdldFBpbihwMikpO1xuICAgICAgICBjb25zdCBtID0gbCAqIGJlYW0udyAqIG1hdGVyaWFsc1tiZWFtLm1dLmRlbnNpdHk7XG4gICAgICAgIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDFdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgbWFzc1twMl0gKz0gbSAqIDAuNTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwMSwgcDIsIG06IGJlYW0ubSwgdzogYmVhbS53LCBsOiBiZWFtLmwgfHwgbCwgZGVjazogYmVhbS5kZWNrIHx8IGZhbHNlIH07XG4gICAgfSk7XG5cbiAgICAvLyBEaXNjIG1hc3MuXG4gICAgY29uc3QgZGlzY3MgPSBzY2VuZS50cnVzcy5kaXNjcztcbiAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgaWYgKGRpc2MucCA+PSBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaXNjIGF0dGFjaGVkIHRvIG5vbiBtb2JpbGUgcGluXCIpO1xuICAgICAgICB9XG4gICAgICAgIG1hc3NbZGlzYy5wXSArPSBkaXNjLnIgKiBkaXNjLnIgKiBNYXRoLlBJICogbWF0ZXJpYWxzW2Rpc2MubV0uZGVuc2l0eTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayB0aGF0IGV2ZXJ5dGhpbmcgdGhhdCBjYW4gbW92ZSBoYXMgc29tZSBtYXNzLlxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgIGlmIChtYXNzW2ldIDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNb2JpbGUgcGluICR7aX0gaGFzIG1hc3MgJHttYXNzW2ldfSA8PSAwLjBgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgIGNvbnN0IGhtYXA6IFNpbXVsYXRpb25ITWFwID0gc2NlbmUudGVycmFpbi5obWFwLm1hcCgoaCwgaSkgPT4ge1xuICAgICAgICBpZiAoaSArIDEgPj0gc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgbng6IDAuMCxcbiAgICAgICAgICAgICAgICBueTogMS4wLFxuICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGR5ID0gc2NlbmUudGVycmFpbi5obWFwW2kgKyAxXSAtIGg7XG4gICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHkgKiBkeSArIHBpdGNoICogcGl0Y2gpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgbng6IC1keSAvIGwsXG4gICAgICAgICAgICBueTogcGl0Y2ggLyBsLFxuICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICB9O1xuICAgIH0pO1xuICAgIGZ1bmN0aW9uIHJlc2V0RGVja3MoKSB7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBobWFwKSB7XG4gICAgICAgICAgICBoLmRlY2tDb3VudCA9IDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkRGVjayhpOiBudW1iZXIsIGQ6IFNpbXVsYXRpb25CZWFtKSB7XG4gICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaCA9IGhtYXBbaV07XG4gICAgICAgIGguZGVja3NbaC5kZWNrQ291bnRdID0gZDtcbiAgICAgICAgaC5kZWNrQ291bnQrKztcbiAgICB9XG4gICAgY29uc3QgdEZyaWN0aW9uID0gc2NlbmUudGVycmFpbi5mcmljdGlvbjtcblxuICAgIC8vIFNldCB1cCBpbml0aWFsIE9ERSBzdGF0ZSB2ZWN0b3IuXG4gICAgY29uc3QgeTAgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMgKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gZ2V0UGluKHRydXNzLCBpKTtcbiAgICAgICAgc2V0ZHgoeTAsIGksIGRbMF0pO1xuICAgICAgICBzZXRkeSh5MCwgaSwgZFsxXSk7XG4gICAgfVxuICAgIC8vIE5COiBJbml0aWFsIHZlbG9jaXRpZXMgYXJlIGFsbCAwLCBubyBuZWVkIHRvIGluaXRpYWxpemUuXG5cbiAgICBjb25zdCBnID0gIHNjZW5lLmc7XG4gICAgcmV0dXJuIG5ldyBSdW5nZUt1dHRhNCh5MCwgZnVuY3Rpb24gKF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgICAgIC8vIERlcml2YXRpdmUgb2YgcG9zaXRpb24gaXMgdmVsb2NpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXRkeChkeWR0LCBpLCBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICBzZXRkeShkeWR0LCBpLCBnZXR2eSh5LCBpKSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0dngoZHlkdCwgaSwgZ1swXSk7XG4gICAgICAgICAgICBzZXR2eShkeWR0LCBpLCBnWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERlY2tzIGFyZSB1cGRhdGVkIGluIGhtYXAgaW4gdGhlIGJlbG93IGxvb3AgdGhyb3VnaCBiZWFtcywgc28gY2xlYXIgdGhlIHByZXZpb3VzIHZhbHVlcy5cbiAgICAgICAgcmVzZXREZWNrcygpO1xuXG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gYmVhbSBzdHJlc3MuXG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY29uc3QgRSA9IG1hdGVyaWFsc1tiZWFtLm1dLkU7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgY29uc3QgbDAgPSBiZWFtLmw7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIHAyKSAtIGdldGR4KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmFpbiA9IChsIC0gbDApIC8gbDA7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmVzcyA9IHN0cmFpbiAqIEUgKiB3O1xuICAgICAgICAgICAgY29uc3QgayA9IEUgKiB3IC8gbDA7XG4gICAgICAgICAgICBjb25zdCBzcHJpbmdGID0gKGwgLSBsMCkgKiBrO1xuICAgICAgICAgICAgY29uc3QgbTEgPSBnZXRtKHAxKTsgICAgLy8gUGluIG1hc3NcbiAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShwMik7XG4gICAgICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgICAgIGNvbnN0IHV5ID0gZHkgLyBsO1xuXG4gICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIHNwcmluZ0YgLyBtMik7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogc3ByaW5nRiAvIG0yKTtcblxuICAgICAgICAgICAgLy8gRGFtcGluZyBmb3JjZS5cbiAgICAgICAgICAgIGNvbnN0IHpldGEgPSAwLjU7XG4gICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIHAyKSAtIGdldHZ4KHksIHAxKTsgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEuXG4gICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIHAyKSAtIGdldHZ5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSB2eCAqIHV4ICsgdnkgKiB1eTsgICAgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEgaW4gZGlyZWN0aW9uIG9mIGJlYW0uXG4gICAgICAgICAgICAvLyBUT0RPOiBub3cgdGhhdCBnZXRtIHJldHVybnMgbWFzcyBvZiBFYXJ0aCBmb3IgZml4ZWQgcGlucywgd2UgZG9uJ3QgbmVlZCB0aGVzZSBkaWZmZXJlbnQgaWYgY2xhdXNlcy5cbiAgICAgICAgICAgIGlmIChwMSA8IG1vYmlsZVBpbnMgJiYgcDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEgKiBtMiAvIChtMSArIG0yKSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMik7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGRlY2tzIHRvIGFjY2xlcmF0aW9uIHN0cnVjdHVyZVxuICAgICAgICAgICAgaWYgKGJlYW0uZGVjaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMSkgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKGdldGR4KHksIHAyKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBiZWdpbiA9IE1hdGgubWluKGkxLCBpMik7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5tYXgoaTEsIGkyKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkRGVjayhpLCBiZWFtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byB0ZXJyYWluIGNvbGxpc2lvbiwgc2NlbmUgYm9yZGVyIGNvbGxpc2lvblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBpKTsgLy8gUGluIHBvc2l0aW9uLlxuICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBpKTtcbiAgICAgICAgICAgIGxldCBhdCA9IDEwMDAuMDsgLy8gQWNjZWxlcmF0aW9uIHBlciBtZXRyZSBvZiBkZXB0aCB1bmRlciB0ZXJyYWluLlxuICAgICAgICAgICAgbGV0IG54OyAvLyBUZXJyYWluIHVuaXQgbm9ybWFsLlxuICAgICAgICAgICAgbGV0IG55O1xuICAgICAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICAgICAgbnggPSAwLjA7XG4gICAgICAgICAgICAgICAgbnkgPSAxLjA7XG4gICAgICAgICAgICAgICAgYXQgKj0gLShueCAqIChkeCAtIDAuMCkgKyBueSAqIChkeSAtIGhtYXBbMF0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRpID0gTWF0aC5taW4oaG1hcC5sZW5ndGggLSAxLCBNYXRoLmZsb29yKGR4IC8gcGl0Y2gpKTtcbiAgICAgICAgICAgICAgICBueCA9IGhtYXBbdGldLm54O1xuICAgICAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAgICAgYXQgKj0gLShueCAqIChkeCAtIHRpICogcGl0Y2gpICsgbnkgKiAoZHkgLSBobWFwW3RpXS5oZWlnaHQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhdCA+IDAuMCkge1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGksIG54ICogYXQpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGksIG55ICogYXQpO1xuICAgICAgICAgICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbiBpbiBwcm9wb3J0aW9uIHRvIGF0LCBpbiBkaXJlY3Rpb24gb3Bwb3NpdGUgb2YgdGFuZ2VudCBwcm9qZWN0ZWQgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgLy8gQ2FwIGFjY2VsZXJhdGlvbiBieSBzb21lIGZyYWN0aW9uIG9mIHZlbG9jaXR5XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGFrZSBmcmljdGlvbiBmcm9tIGJlYW1zIHRvbyAoanVzdCBhdmVyYWdlIGJlYW1zIGdvaW5nIGludG8gcGluPylcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR2ID0gZ2V0dngoeSwgaSkgKiB0eCArIGdldHZ5KHksIGkpICogdHk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWYgPSBNYXRoLm1pbih0RnJpY3Rpb24gKiBhdCwgTWF0aC5hYnModHYgKiAxMDApKSAqICh0diA+PSAwLjAgPyAtMS4wIDogMS4wKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCB0eCAqIGFmKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCB0eSAqIGFmKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGRpc2MtZGVjayBjb2xsaXNpb24uXG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgciA9IGRpc2MucjtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgZGlzYy5wKTtcbiAgICAgICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgaG1hcCBidWNrZXRzIHRoYXQgZGlzYyBvdmVybGFwcy5cbiAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcigoZHggLSByKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcigoZHggKyByKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpMTsgaSA8PSBpMjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgZGVja3MgaW4gdGhvc2UgYnVja2V0cy5cbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrcyA9IGhtYXBbaV0uZGVja3M7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVja0NvdW50ID0gaG1hcFtpXS5kZWNrQ291bnQ7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkZWNrQ291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNrID0gZGVja3Nbal07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgZGlzYy5wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeDEgPSBnZXRkeCh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeTEgPSBnZXRkeSh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeDIgPSBnZXRkeCh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeTIgPSBnZXRkeSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIElzIGNvbGxpc2lvbiBoYXBwZW5pbmc/XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN4ID0geDIgLSB4MTsgLy8gVmVjdG9yIHRvIGVuZCBvZiBkZWNrIChmcm9tIHN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeSA9IHkyIC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN4ID0gZHggLSB4MTsgLy8gVmVjdG9yIHRvIGNlbnRyZSBvZiBkaXNjIChmcm9tIHN0YXJ0IG9mIGRlY2spXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN5ID0gZHkgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYSA9IHN4ICogc3ggKyBzeSAqIHN5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiID0gLTIuMCAqIChjeCAqIHN4ICsgY3kgKiBzeSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBjeCAqIGN4ICsgY3kgKiBjeSAtIHIgKiByO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBEID0gYiAqIGIgLSA0LjAgKiBhICogYztcbiAgICAgICAgICAgICAgICAgICAgaWYgKEQgPD0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBObyBSZWFsIHNvbHV0aW9ucyB0byBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9vdEQgPSBNYXRoLnNxcnQoRCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSAtYiAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQxID0gKC1iIC0gcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdDIgPSAoLWIgKyByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodDEgPD0gMC4wICYmIHQyIDw9IDAuMCkgfHwgKHQxID49IDEuMCAmJiB0MiA+PSAwLjApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBJbnRlcnNlY3Rpb25zIGFyZSBib3RoIGJlZm9yZSBvciBhZnRlciBkZWNrLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQxID0gTWF0aC5tYXgodDEsIDAuMCk7XG4gICAgICAgICAgICAgICAgICAgIHQyID0gTWF0aC5taW4odDIsIDEuMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBjb2xsaXNpb24gYWNjZWxlcmF0aW9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gaXMgcHJvcG9ydGlvbmFsIHRvIGFyZWEgJ3NoYWRvd2VkJyBpbiB0aGUgZGlzYyBieSB0aGUgaW50ZXJzZWN0aW5nIGRlY2suXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgc28gdGhhdCBhcyBhIGRpc2MgbW92ZXMgYmV0d2VlbiB0d28gZGVjayBzZWdtZW50cywgdGhlIGFjY2VsZXJhdGlvbiByZW1haW5zIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXggPSAoMSAtIHQxKSAqIHgxICsgdDEgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDEgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXkgPSAoMSAtIHQxKSAqIHkxICsgdDEgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MnggPSAoMSAtIHQyKSAqIHgxICsgdDIgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDIgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MnkgPSAoMSAtIHQyKSAqIHkxICsgdDIgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YSA9IE1hdGguYWJzKE1hdGguYXRhbjIodDF5LCB0MXgpIC0gTWF0aC5hdGFuMih0MnksIHQyeCkpICUgTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJlYSA9IDAuNSAqIHIgKiByICogdGEgLSAwLjUgKiBNYXRoLmFicyh0MXggKiB0MnkgLSB0MXkgKiB0MngpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbiA9IDEwMDAuMCAqIGFyZWE7ICAgLy8gVE9ETzogZmlndXJlIG91dCB3aGF0IGFjY2VsZXJhdGlvbiB0byB1c2VcbiAgICAgICAgICAgICAgICAgICAgbGV0IG54ID0gY3ggLSBzeCAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGxldCBueSA9IGN5IC0gc3kgKiB0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KG54ICogbnggKyBueSAqIG55KTtcbiAgICAgICAgICAgICAgICAgICAgbnggLz0gbDtcbiAgICAgICAgICAgICAgICAgICAgbnkgLz0gbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb25zIHRvIHRoZSBkaXNjLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtZCA9IGdldG0oZGlzYy5wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTEgPSBnZXRtKGRlY2sucDEpICogKDEuMCAtIHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMiA9IGdldG0oZGVjay5wMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZCA9IChtMSArIG0yKSAvIChtZCArIG0xICsgbTIpOyAgLy8gU2hhcmUgb2YgYWNjZWxlcmF0aW9uIGZvciBkaXNjLCBkZWNrIGVuZHBvaW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYTEgPSAobWQgKyBtMikgLyAobWQgKyBtMSArIG0yKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYTIgPSAobWQgKyBtMSkgLyAobWQgKyBtMSArIG0yKSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRpc2MucCwgbnggKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGlzYy5wLCBueSAqIGFuICogYWQpO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC1ueCAqIGFuICogYTEpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAxLCAtbnkgKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMiwgLW54ICogYW4gKiBhMik7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC1ueSAqIGFuICogYTIpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgZnJpY3Rpb24gYW5kIGRhbXBpbmcuXG4gICAgICAgICAgICAgICAgICAgIC8vIEdldCByZWxhdGl2ZSB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dngoeSwgZGVjay5wMSkgLSB0ICogZ2V0dngoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ5KHksIGRlY2sucDEpIC0gdCAqIGdldHZ5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2biA9IHZ4ICogbnggKyB2eSAqIG55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnQgPSB2eCAqIHR4ICsgdnkgKiB0eSAtIGRpc2MudjtcbiAgICAgICAgICAgICAgICAgICAgLy8gVG90YWxseSB1bnNjaWVudGlmaWMgd2F5IHRvIGNvbXB1dGUgZnJpY3Rpb24gZnJvbSBhcmJpdHJhcnkgY29uc3RhbnRzLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmcmljdGlvbiA9IE1hdGguc3FydChtYXRlcmlhbHNbZGlzYy5tXS5mcmljdGlvbiAqIG1hdGVyaWFsc1tkZWNrLm1dLmZyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWYgPSBNYXRoLm1pbihhbiAqIGZyaWN0aW9uLCBNYXRoLmFicyh2dCAqIDEwMCkpICogKHZ0IDw9IDAuMCA/IDEuMCA6IC0xLjApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wID0gMjsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byBkZXJpdmUgYSByZWFzb25hYmxlIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIHR4ICogYWYgKiBhZCAtIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGlzYy5wLCB0eSAqIGFmICogYWQgLSB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMSwgLXR4ICogYWYgKiBhMSArIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLXR5ICogYWYgKiBhMSArIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMiwgLXR4ICogYWYgKiBhMiArIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMiwgLXR5ICogYWYgKiBhMiArIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lUmVuZGVyZXIoc2NlbmU6IFNjZW5lKTogVHJ1c3NSZW5kZXIge1xuICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIFxuICAgIC8vIFByZS1yZW5kZXIgdGVycmFpbi5cbiAgICBjb25zdCB0ZXJyYWluID0gc2NlbmUudGVycmFpbjtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHRlcnJhaW5QYXRoID0gbmV3IFBhdGgyRCgpO1xuICAgIHRlcnJhaW5QYXRoLm1vdmVUbygwLjAsIDAuMCk7XG4gICAgbGV0IHggPSAwLjA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBobWFwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRlcnJhaW5QYXRoLmxpbmVUbyh4LCBobWFwW2ldKTtcbiAgICAgICAgeCArPSB0ZXJyYWluLnBpdGNoO1xuICAgIH1cbiAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCAtIHRlcnJhaW4ucGl0Y2gsIDAuMCk7XG4gICAgdGVycmFpblBhdGguY2xvc2VQYXRoKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIG9kZTogT0RFTWV0aG9kKSB7XG4gICAgICAgIC8vIFRlcnJhaW4uXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSB0ZXJyYWluLnN0eWxlO1xuICAgICAgICBjdHguZmlsbCh0ZXJyYWluUGF0aCk7XG5cbiAgICAgICAgY29uc3QgeSA9IG9kZS55O1xuXG4gICAgICAgIC8vIERpc2NzXG4gICAgICAgIGNvbnN0IGRpc2NzID0gdHJ1c3MuZGlzY3M7XG4gICAgICAgIFxuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJyZWRcIjtcbiAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gZGlzYy5wO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmFyYyh5W3AgKiAyICsgMF0sIHlbcCAqIDIgKyAxXSwgZGlzYy5yLCAwLjAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKFwibm9uemVyb1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJlYW1zLlxuICAgICAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBtYXRlcmlhbHNbYmVhbS5tXS5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSBiZWFtLnc7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG5cbiAgICAgICAgICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIHVzZSBvZGUgYWNjZXNzb3JzLlxuICAgICAgICAgICAgLy8gV2FpdCwgZG9lcyB0aGF0IG1lYW4gd2UgbmVlZCBhbiBPREUgZm9yIGEgc3RhdGljIHNjZW5lP1xuICAgICAgICAgICAgLy8gV2lsbCBuZWVkIGRpZmZlcmVudCBtZXRob2RzLlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocDEgPCAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IGdldFBpbih0cnVzcywgcDEpO1xuICAgICAgICAgICAgICAgIGN0eC5tb3ZlVG8oeVtwMSAqIDIgKyAwXSwgeVtwMSAqIDIgKyAxXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpbiA9IHBpbnNbcDFdO1xuICAgICAgICAgICAgICAgIGN0eC5tb3ZlVG8ocGluWzBdLCBwaW5bMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8oeVtwMiAqIDIgKyAwXSwgeVtwMiAqIDIgKyAxXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpbiA9IHBpbnNbcDJdO1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8ocGluWzBdLCBwaW5bMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICB9XG4gICAgfVxufVxuKi9cblxudHlwZSBDcmVhdGVCZWFtUGluU3RhdGUgPSB7XG4gICAgZWRpdDogU2NlbmVFZGl0b3IsXG4gICAgaTogbnVtYmVyLFxuICAgIGRyYWc/OiB7IHA6IFBvaW50MkQsIGk/OiBudW1iZXIgfSxcbn07XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBjdHgubGluZVdpZHRoID0gMC41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGNvbnN0IHAyID0gc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQgPyBzdGF0ZS5kcmFnLnAgOiB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICBjb25zdCB3ID0gc3RhdGUuZWRpdC5lZGl0V2lkdGg7XG4gICAgY29uc3Qgc3R5bGUgPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLnN0eWxlO1xuICAgIGNvbnN0IGRlY2sgPSBzdGF0ZS5lZGl0LmVkaXREZWNrO1xuICAgIGRyYXdCZWFtKGN0eCwgcDEsIHAyLCB3LCBzdHlsZSwgZGVjayk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbihwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgaSA9IHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzcywgcHNbMF0uY3VyciwgMiwgc3RhdGUuaSk7XG4gICAgc3RhdGUuZHJhZyA9IHtcbiAgICAgICAgcDogcHNbMF0uY3VycixcbiAgICAgICAgaSxcbiAgICB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSAyLCBwWzFdIC0gMiwgNCwgNCwgeyBlZGl0LCBpIH0pXG4gICAgICAgIC5vbkRyYXcoY3JlYXRlQmVhbVBpbk9uRHJhdylcbiAgICAgICAgLm9uUGFuKGNyZWF0ZUJlYW1QaW5PblBhbilcbiAgICAgICAgLm9uUGFuRW5kKGNyZWF0ZUJlYW1QaW5PblBhbkVuZCk7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzRWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChsZXQgaSA9IHRydXNzRWRpdFBpbnNCZWdpbih0cnVzcyk7IGkgIT09IHRydXNzRWRpdFBpbnNFbmQodHJ1c3MpOyBpKyspIHtcbiAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKGVkaXQsIGkpKTtcbiAgICB9XG4gICAgY29uc3QgZSA9IFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcblxuICAgIGVkaXQub25BZGRQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIGFkZENoaWxkKGUsIENyZWF0ZUJlYW1QaW4oZWRpdCwgcGluKSwgZWMsIGVkaXRJbmRleCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcbiAgICBlZGl0Lm9uUmVtb3ZlUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVtb3ZpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIHJlbW92ZUNoaWxkKGUsIGVkaXRJbmRleCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBlLm9uRGV0YWNoIGZvciByZW1vdmVpbmcgcGluIG9ic2VydmVycy5cbiAgICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCB3aWR0aCA9IGVkaXQuc2NlbmUud2lkdGg7XG4gICAgY29uc3QgaGVpZ2h0ID0gZWRpdC5zY2VuZS5oZWlnaHQ7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBpZiAocFswXSA+IDAgJiYgcFswXSA8IHdpZHRoICYmIHBbMV0gPiAwICYmIHBbMV0gPCBoZWlnaHQpIHtcbiAgICAgICAgICAgIC8vIEJlYW1zIHNob3VsZCBvbmx5IGJlIGNyZWF0ZWQgZnJvbSBwaW5zIHN0cmljdGx5IGluc2lkZSB0aGUgc2NlbmUuXG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICAgICAgQWRkVHJ1c3NFZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGRyYXdCZWFtKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBwMTogUG9pbnQyRCwgcDI6IFBvaW50MkQsIHc6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgZGVjaz86IGJvb2xlYW4pIHtcbiAgICBjdHgubGluZVdpZHRoID0gdztcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgIGN0eC5saW5lVG8ocDJbMF0sIHAyWzFdKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgaWYgKGRlY2sgIT09IHVuZGVmaW5lZCAmJiBkZWNrKSB7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYnJvd25cIjsgIC8vIFRPRE86IGRlY2sgc3R5bGVcbiAgICAgICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgICAgICBjdHgubGluZVRvKHAyWzBdLCBwMlsxXSk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzTGF5ZXJPbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHRydXNzOiBUcnVzcykge1xuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFRydXNzTGF5ZXIodHJ1c3M6IFRydXNzKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwodHJ1c3MpLm9uRHJhdyh0cnVzc0xheWVyT25EcmF3KTtcbn1cblxuZnVuY3Rpb24gc2ltdWxhdGVMYXllck9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjb25zdCBzY2VuZSA9IGVkaXQuc2NlbmU7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBjb25zdCBzaW0gPSBlZGl0LnNpbXVsYXRvcigpO1xuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBkcmF3QmVhbShjdHgsIHNpbS5nZXRQaW4oYi5wMSksIHNpbS5nZXRQaW4oYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBTaW11bGF0ZUxheWVyKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwoZWRpdCkub25EcmF3KHNpbXVsYXRlTGF5ZXJPbkRyYXcpO1xufVxuXG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZpbGwoc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIHJldHVybiAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBzdHlsZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGNjdzogYm9vbGVhbikge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuXG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAwLjc1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAxIDogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC4zIDogTWF0aC5QSSAqIDAuMztcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhlKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihlKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGUgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGUgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgXG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUsIGNjdyk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0J1dHRvbkJvcmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQudW5kb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eCwgYm94LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCh1bmRvQnV0dG9uVGFwKS5vbkRyYXcodW5kb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uVGFwKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgaWYgKGVkaXQucmVkb0NvdW50KCkgPiAwKSB7XG4gICAgICAgIGVkaXQucmVkbyhlYyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gZWRpdC5yZWRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGRyYXdCdXR0b25Cb3JkZXIoY3R4LCBib3gpO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gcmVkb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcChyZWRvQnV0dG9uVGFwKS5vbkRyYXcocmVkb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiBkcmF3UGxheShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQYXVzZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHgsIHkgLSBweSk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBwbGF5QnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgICAgIGlmIChzaW0ucGxheWluZygpKSB7XG4gICAgICAgICAgICBzaW0ucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltLnBsYXkoZWMpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGlmIChlZGl0LnNpbXVsYXRvcigpLnBsYXlpbmcoKSkge1xuICAgICAgICAgICAgZHJhd1BhdXNlKGN0eCwgYm94KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyYXdQbGF5KGN0eCwgYm94KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UmVzZXQoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gciwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5IC0gcHkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gcmVzZXRCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgaWYgKHNpbS5wbGF5aW5nKCkpIHtcbiAgICAgICAgICAgIHNpbS5wYXVzZShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgc2ltLnNlZWsoMCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGRyYXdCdXR0b25Cb3JkZXIoY3R4LCBib3gpO1xuICAgICAgICBkcmF3UmVzZXQoY3R4LCBib3gpO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gU2NlbmVFbGVtZW50KHNjZW5lSlNPTjogU2NlbmVKU09OKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgZWRpdCA9IG5ldyBTY2VuZUVkaXRvcihzY2VuZUpTT04pO1xuXG4gICAgY29uc3Qgc2NlbmVVSSA9IE11eChcbiAgICAgICAgW1widGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCJdLFxuICAgICAgICBbXCJ0ZXJyYWluXCIsIEZpbGwoc2NlbmVKU09OLnRlcnJhaW4pLm9uRHJhdyhkcmF3VGVycmFpbildLFxuICAgICAgICBbXCJ0cnVzc1wiLCBUcnVzc0xheWVyKHNjZW5lSlNPTi50cnVzcyldLFxuICAgICAgICBbXCJhZGRfdHJ1c3NcIiwgQWRkVHJ1c3NMYXllcihlZGl0KV0sXG4gICAgICAgIFtcInNpbXVsYXRlXCIsIFNpbXVsYXRlTGF5ZXIoZWRpdCldLFxuICAgICk7XG5cbiAgICBjb25zdCBkcmF3UiA9IGRyYXdGaWxsKFwicmVkXCIpO1xuICAgIGNvbnN0IGRyYXdHID0gZHJhd0ZpbGwoXCJncmVlblwiKTtcbiAgICBjb25zdCBkcmF3QiA9IGRyYXdGaWxsKFwiYmx1ZVwiKTtcblxuICAgIGNvbnN0IHRvb2xzID0gU3dpdGNoKFxuICAgICAgICAxLFxuICAgICAgICBMZWZ0KHVuZG9CdXR0b24oZWRpdCksIHJlZG9CdXR0b24oZWRpdCkpLFxuICAgICAgICBGaWxsKCkub25EcmF3KGRyYXdHKSxcbiAgICAgICAgTGVmdChyZXNldEJ1dHRvbihlZGl0KSwgcGxheUJ1dHRvbihlZGl0KSksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDE2LFxuICAgICAgICApLFxuICAgICAgICBCb3R0b20oXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIHRvb2xzLCAgXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICBMZWZ0KFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd1IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgwLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgZWRpdC5zaW11bGF0b3IoKS5wYXVzZShlYykgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Rykub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDEsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCIpOyBlZGl0LnNpbXVsYXRvcigpLnBhdXNlKGVjKTsgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Qikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2xzLnNldCgyLCBlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwic2ltdWxhdGVcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBzaW11bGF0aW9uIHN0YXRlIHN0b3JlZCBpbiBkby91bmRvIHN0YWNrcy5cbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICksXG4gICAgICAgICksXG4gICAgKTtcbiAgICAvLyBUT0RPOiBmaXggc2NhbGUsIGZpeCBtYXRlcmlhbHNcbiAgICAvLyBuZWVkIHRvIGZpeCBUb3VjaEdlc3R1cmUgdG8gY2hhbmdlIHRoZSB0aHJlc2hvbGQgZnJvbSBhIGRyYWcgdG8gYmUgYmFzZWQgb24gdGhlIHpvb20uIHdoaWNoIG5lZWRzIFNjcm9sbExheW91dCB0byB1cGRhdGUgdGhlIEVsZW1lbnRDb250ZXh0IGlzIHBhc3NlZCB0byBjaGlsZHJlbiAoYW5kIHRvIGluY2x1ZGUgc2NyZWVuIHNjYWxpbmcgc3R1ZmYgb24gZWMpXG5cbiAgICAvLyBUT0RPOiBtYXRlcmlhbCBzZWxlY3Rpb24uIChtaWdodCBuZWVkIHRleHQgbGF5b3V0LCB3aGljaCBpcyBhIHdob2xlIGNhbiBvZiB3b3Jtcy4uLilcblxuICAgIC8vIFRPRE86IHNhdmUvbG9hZFxuICAgIC8vIEhhdmUgbGlzdCBvZiBsZXZlbHMgaW4gc29tZSBKU09OIHJlc291cmNlIGZpbGUuXG4gICAgLy8gSGF2ZSBvcHRpb24gdG8gbG9hZCBqc29uIGZpbGUgZnJvbSBsb2NhbC5cbiAgICAvLyBhdXRvLXNhdmUgZXZlcnkgbiBzZWNvbmRzIGFmdGVyIGNoYW5nZSwga2V5IGluIGxvY2FsIHN0b3JhZ2UgaXMgdXJpIG9mIGxldmVsIGpzb24uXG4gICAgLy8gd2hlbiBsb2FkaW5nLCBjaGVjayBsb2NhbCBzdG9yYWdlIGFuZCBsb2FkIHRoYXQgaW5zdGVhZCBpZiBpdCBleGlzdHMgKGFuZCB0aGUgbm9uIGVkaXRhYmxlIHBhcnRzIG1hdGNoPylcbn1cbiJdfQ==