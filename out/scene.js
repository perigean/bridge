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
        this.editWidth = 1;
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
        ctx.lineWidth = w * 0.75;
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
        drawBeam(ctx, [x - r, y], [x + r, y], 16, "black", edit.editDeck);
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
    const tools = Switch(1, Left(undoButton(edit), redoButton(edit), tabFiller()), Left(deckButton(edit), tabFiller()), Left(resetButton(edit), playButton(edit), tabFiller()));
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 16), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => {
        tools.set(2, ec);
        sceneUI.set(ec, "terrain", "simulate");
    })))));
    // TODO: fix materials
    // TODO: simulation state stored in do/undo stacks.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFnQixNQUFNLGNBQWMsQ0FBQztBQTZDbE8sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJ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QUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEYsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDL0IsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQztJQUM3RCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUNqQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMxQyxDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxFQUFtQixFQUFFLEVBQWtCLEVBQUUsS0FBeUI7SUFDMUYsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3JDLE1BQU0sQ0FBQyxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUQsS0FBSyxDQUFDLElBQUksR0FBRztRQUNULENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUNiLENBQUM7S0FDSixDQUFDO0lBQ0YsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEVBQWtCLEVBQUUsS0FBeUI7SUFDeEUsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3JDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUU7UUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0tBQzdDO0lBQ0QsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxT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QjtJQUNsQixrREFBa0Q7SUFDbEQsNENBQTRDO0lBQzVDLHFGQUFxRjtJQUNyRiwyR0FBMkc7QUFDL0csQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgRGVyaXZhdGl2ZSB9IGZyb20gXCIuL29kZS5qc1wiO1xuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG5pbXBvcnQgeyBSdW5nZUt1dHRhNCB9IGZyb20gXCIuL3JrNC5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoLCBUaW1lckhhbmRsZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbiAgICBkZWNrPzogYm9vbGVhbjsgLy8gSXMgdGhpcyBiZWFtIGEgZGVjaz8gKGRvIGRpc2NzIGNvbGxpZGUpXG59O1xuXG50eXBlIFNpbXVsYXRpb25CZWFtID0ge1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBkZWNrOiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBEaXNjID0ge1xuICAgIHA6IG51bWJlcjsgIC8vIEluZGV4IG9mIG1vdmVhYmxlIHBpbiB0aGlzIGRpc2Mgc3Vycm91bmRzLlxuICAgIG06IG51bWJlcjsgIC8vIE1hdGVyaWFsIG9mIGRpc2MuXG4gICAgcjogbnVtYmVyOyAgLy8gUmFkaXVzIG9mIGRpc2MuXG4gICAgdjogbnVtYmVyOyAgLy8gVmVsb2NpdHkgb2Ygc3VyZmFjZSBvZiBkaXNjIChpbiBDQ1cgZGlyZWN0aW9uKS5cbn07XG5cbmV4cG9ydCB0eXBlIE1hdGVyaWFsID0ge1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGtnL21eM1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICAvLyBUT0RPOiB3aGVuIHN0dWZmIGJyZWFrcywgd29yayBoYXJkZW5pbmcsIGV0Yy5cbn07XG5cbmV4cG9ydCB0eXBlIFRydXNzID0ge1xuICAgIGZpeGVkUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBlZGl0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZWRpdEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD47XG59O1xuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzOiBUcnVzcywgbTogbnVtYmVyKSB7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGlmIChtIDwgMCB8fCBtID49IG1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGggfHwgcGluID49IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQmVhbUV4aXN0cyh0cnVzczogVHJ1c3MsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIC10cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzTW92aW5nUGluc0NvdW50KHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzczogVHJ1c3MsIHA6IFBvaW50MkQsIG1heGQ6IG51bWJlciwgYmVhbVN0YXJ0PzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICAvLyBUT0RPOiBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gUHJvYmFibHkgb25seSBtYXR0ZXJzIG9uY2Ugd2UgaGF2ZSAxMDAwcyBvZiBwaW5zP1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgbGV0IHJlcyA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcmVzZCA9IG1heGQ7XG4gICAgaWYgKGJlYW1TdGFydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmZpeGVkUGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSAtIHRydXNzLmZpeGVkUGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5zdGFydFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGk7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmVkaXRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpICsgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpOiBQb2ludDJEIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH0gZWxzZSBpZiAocGluIDwgMCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZml4ZWRQaW5zW3RydXNzLmZpeGVkUGlucy5sZW5ndGggKyBwaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zW3Bpbl07XG4gICAgfSBlbHNlIGlmIChwaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoIDwgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5lZGl0UGluc1twaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua293biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBUZXJyYWluID0ge1xuICAgIGhtYXA6IEFycmF5PG51bWJlcj47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xufTtcblxudHlwZSBTaW11bGF0aW9uSE1hcCA9IEFycmF5PHtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBueDogbnVtYmVyOyAvLyBPdXR3YXJkIChkaXJlY3Rpb24gb2YgYm91bmNlKSBub3JtYWwgdW5pdCB2ZWN0b3IuXG4gICAgbnk6IG51bWJlcjtcbiAgICBkZWNrczogQXJyYXk8U2ltdWxhdGlvbkJlYW0+OyAgIC8vIFVwZGF0ZWQgZXZlcnkgZnJhbWUsIGFsbCBkZWNrcyBhYm92ZSB0aGlzIHNlZ21lbnQuXG4gICAgZGVja0NvdW50OiBudW1iZXI7ICAvLyBOdW1iZXIgb2YgaW5kaWNlcyBpbiBkZWNrcyBiZWluZyB1c2VkLlxufT47XG5cbnR5cGUgQWRkQmVhbUFjdGlvbiA9IHtcbiAgICB0eXBlOiBcImFkZF9iZWFtXCI7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbD86IG51bWJlcjtcbiAgICBkZWNrPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgQWRkUGluQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX3BpblwiO1xuICAgIHBpbjogUG9pbnQyRDtcbn07XG5cbnR5cGUgQ29tcG9zaXRlQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiY29tcG9zaXRlXCI7XG4gICAgYWN0aW9uczogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufTtcblxudHlwZSBUcnVzc0FjdGlvbiA9IEFkZEJlYW1BY3Rpb24gfCBBZGRQaW5BY3Rpb24gfCBDb21wb3NpdGVBY3Rpb247XG5cblxuZXhwb3J0IHR5cGUgU2NlbmVKU09OID0ge1xuICAgIHRydXNzOiBUcnVzcztcbiAgICB0ZXJyYWluOiBUZXJyYWluO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgZzogUG9pbnQyRDsgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICByZWRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbiAgICB1bmRvU3RhY2s6IEFycmF5PFRydXNzQWN0aW9uPjtcbn1cblxuY2xhc3MgU2NlbmVTaW11bGF0b3Ige1xuICAgIHByaXZhdGUgbWV0aG9kOiBSdW5nZUt1dHRhNDsgICAgICAgICAgICAgICAgICAgIC8vIE9ERSBzb2x2ZXIgbWV0aG9kIHVzZWQgdG8gc2ltdWxhdGUuXG4gICAgcHJpdmF0ZSBkeWR0OiBEZXJpdmF0aXZlOyAgICAgICAgICAgICAgICAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBPREUgc3RhdGUuXG4gICAgcHJpdmF0ZSBoOiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGltZSBzdGVwLlxuICAgIHByaXZhdGUgZml4ZWRQaW5zOiBGbG9hdDMyQXJyYXk7ICAgICAgICAgICAgICAgIC8vIFBvc2l0aW9ucyBvZiBmaXhlZCBwaW5zIFt4MCwgeTAsIHgxLCB5MSwgLi4uXS5cbiAgICBwcml2YXRlIHRMYXRlc3Q6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgaGlnaGVzdCB0aW1lIHZhbHVlIHNpbXVsYXRlZC5cbiAgICBwcml2YXRlIGtleUludGVydmFsOiBudW1iZXI7ICAgICAgICAgICAgICAgICAgICAgIC8vIFRpbWUgcGVyIGtleWZyYW1lLlxuICAgIHByaXZhdGUga2V5ZnJhbWVzOiBNYXA8bnVtYmVyLCBGbG9hdDMyQXJyYXk+OyAgIC8vIE1hcCBvZiB0aW1lIHRvIHNhdmVkIHN0YXRlLlxuICAgIHByaXZhdGUgcGxheVRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBwbGF5VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgcGxheVRpY2s6IFRpbWVySGFuZGxlcjtcblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04sIGg6IG51bWJlciwga2V5SW50ZXJ2YWw6IG51bWJlcikge1xuICAgICAgICB0aGlzLmggPSBoO1xuICAgICAgICB0aGlzLnRMYXRlc3QgPSAwO1xuICAgICAgICB0aGlzLmtleUludGVydmFsID0ga2V5SW50ZXJ2YWw7XG4gICAgICAgIHRoaXMua2V5ZnJhbWVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5wbGF5VGltZSA9IDA7XG4gICAgICAgIHRoaXMucGxheVRpY2sgPSAobXM6IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgICAgICAvLyBPbmx5IGNvbXB1dGUgdXAgdG8gMTAwbXMgb2YgZnJhbWVzIHBlciB0aWNrLCB0byBhbGxvdyBvdGhlciB0aGluZ3MgdG8gaGFwcGVuIGlmIHdlIGFyZSBiZWhpbmQuXG4gICAgICAgICAgICBsZXQgdDEgPSBNYXRoLm1pbih0aGlzLnBsYXlUaW1lICsgbXMgKiAwLjAwMSwgdGhpcy5tZXRob2QudCArIDAuMSk7XG4gICAgICAgICAgICB3aGlsZSAodGhpcy5tZXRob2QudCA8IHQxKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgICAgIFxuICAgICAgICAvLyBDYWNoZSBmaXhlZCBwaW4gdmFsdWVzLlxuICAgICAgICBjb25zdCBmaXhlZFBpbnMgPSBuZXcgRmxvYXQzMkFycmF5KHRydXNzLmZpeGVkUGlucy5sZW5ndGggKiAyKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5maXhlZFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZpeGVkUGluc1tpICogMl0gPSB0cnVzcy5maXhlZFBpbnNbaV1bMF07XG4gICAgICAgICAgICBmaXhlZFBpbnNbaSAqIDIgKyAxXSA9IHRydXNzLmZpeGVkUGluc1tpXVsxXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmZpeGVkUGlucyA9IGZpeGVkUGlucztcblxuICAgICAgICAvLyBDYWNoZSBCZWFtIHZhbHVlcy5cbiAgICAgICAgY29uc3QgYmVhbXM6IEFycmF5PFNpbXVsYXRpb25CZWFtPiA9IFsuLi50cnVzcy5zdGFydEJlYW1zLCAuLi50cnVzcy5lZGl0QmVhbXNdLm1hcChiID0+ICh7XG4gICAgICAgICAgICBwMTogYi5wMSxcbiAgICAgICAgICAgIHAyOiBiLnAyLFxuICAgICAgICAgICAgbTogYi5tLFxuICAgICAgICAgICAgdzogYi53LFxuICAgICAgICAgICAgbDogYi5sICE9PSB1bmRlZmluZWQgPyBiLmwgOiBwb2ludERpc3RhbmNlKHRydXNzR2V0UGluKHRydXNzLCBiLnAxKSwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpKSxcbiAgICAgICAgICAgIGRlY2s6IGIuZGVjayAhPT0gdW5kZWZpbmVkID8gYi5kZWNrIDogZmFsc2UsXG4gICAgICAgIH0pKTtcblxuICAgICAgICAvLyBDYWNoZSBkaXNjcy5cbiAgICAgICAgY29uc3QgZGlzY3MgPSB0cnVzcy5kaXNjczsgIC8vIFRPRE86IGRvIHdlIGV2ZXIgd25hdCB0byBtdXRhdGUgZGlzY3M/XG5cbiAgICAgICAgLy8gQ2FjaGUgbWF0ZXJpYWxzLlxuICAgICAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7ICAvLyBUT0RPOiBkbyB3ZSBldmVyIHdhbnQgdG8gbXV0YXRlIG1hdGVyaWFscz9cblxuICAgICAgICAvLyBDb21wdXRlIHRoZSBtYXNzIG9mIGFsbCBwaW5zLlxuICAgICAgICBjb25zdCBtb3ZpbmdQaW5zID0gdHJ1c3NNb3ZpbmdQaW5zQ291bnQodHJ1c3MpO1xuICAgICAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb3ZpbmdQaW5zKTtcbiAgICAgICAgZnVuY3Rpb24gYWRkTWFzcyhwaW46IG51bWJlciwgbTogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIC8vIEZpeGVkIHBpbnMgYWxyZWFkeSBoYXZlIGluZmluaXRlIG1hc3MuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWFzc1twaW5dICs9IG07XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gYi5sICogYi53ICogbWF0ZXJpYWxzW2IubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIC8vIERpc3RyaWJ1dGUgdGhlIG1hc3MgYmV0d2VlbiB0aGUgdHdvIGVuZCBwaW5zLlxuICAgICAgICAgICAgLy8gVE9ETzogZG8gcHJvcGVyIG1hc3MgbW9tZW50IG9mIGludGVydGlhIGNhbGN1bGF0aW9uIHdoZW4gcm90YXRpbmcgYmVhbXM/XG4gICAgICAgICAgICBhZGRNYXNzKGIucDEsIG0gKiAwLjUpO1xuICAgICAgICAgICAgYWRkTWFzcyhiLnAyLCBtICogMC41KTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBkLnIgKiBkLnIgKiBNYXRoLlBJICogbWF0ZXJpYWxzW2QubV0uZGVuc2l0eTtcbiAgICAgICAgICAgIGFkZE1hc3MoZC5wLCBtKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDaGVjayB0aGF0IGV2ZXJ5dGhpbmcgdGhhdCBjYW4gbW92ZSBoYXMgc29tZSBtYXNzLlxuICAgICAgICBmb3IgKGNvbnN0IG0gb2YgbWFzcykge1xuICAgICAgICAgICAgaWYgKG0gPD0gMCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm1hc3MgMCBwaW4gZGV0ZWN0ZWRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYWNoZSB0aGUgdGVycmFpbiwgc2V0IHVwIGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmUgZm9yIGRlY2sgaW50ZXJzZWN0aW9ucy5cbiAgICAgICAgY29uc3QgdEZyaWN0aW9uID0gc2NlbmUudGVycmFpbi5mcmljdGlvbjtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gc2NlbmUuaGVpZ2h0O1xuICAgICAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICAgICAgY29uc3QgaG1hcDogU2ltdWxhdGlvbkhNYXAgPSBzY2VuZS50ZXJyYWluLmhtYXAubWFwKChoLCBpKSA9PiB7XG4gICAgICAgICAgICBpZiAoaSArIDEgPj0gc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICAgICAgbng6IDAuMCxcbiAgICAgICAgICAgICAgICAgICAgbnk6LTEuMCxcbiAgICAgICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gc2NlbmUudGVycmFpbi5obWFwW2kgKyAxXSAtIGg7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiBkeSAvIGwsXG4gICAgICAgICAgICAgICAgbnk6IC1waXRjaCAvIGwsXG4gICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgICBmdW5jdGlvbiBobWFwQWRkRGVjayhpOiBudW1iZXIsIGQ6IFNpbXVsYXRpb25CZWFtKSB7XG4gICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICAgICAgaC5kZWNrc1toLmRlY2tDb3VudF0gPSBkO1xuICAgICAgICAgICAgaC5kZWNrQ291bnQrKztcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gU3RhdGUgYWNjZXNzb3JzXG4gICAgICAgIGNvbnN0IHZJbmRleCA9IG1vdmluZ1BpbnMgKiAyO1xuICAgICAgICBmdW5jdGlvbiBnZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluICogMl07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAwXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluICogMiArIDFdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3ZJbmRleCArIHBpbiAqIDJdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVt2SW5kZXggKyBwaW4gKiAyICsgMV07IFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3BpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVtwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbdkluZGV4ICsgcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3ZJbmRleCArIHBpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBmb3JjZShkeWR0OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCBmeDogbnVtYmVyLCBmeTogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gbWFzc1twaW5dO1xuICAgICAgICAgICAgICAgIGR5ZHRbdkluZGV4ICsgcGluICogMiArIDBdICs9IGZ4IC8gbTtcbiAgICAgICAgICAgICAgICBkeWR0W3ZJbmRleCArIHBpbiAqIDIgKyAxXSArPSBmeSAvIG07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZXQgdXAgaW5pdGlhbCBPREUgc3RhdGUuIE5COiB2ZWxvY2l0aWVzIGFyZSBhbGwgemVyby5cbiAgICAgICAgY29uc3QgeTAgPSBuZXcgRmxvYXQzMkFycmF5KG1vdmluZ1BpbnMgKiA0KTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGQgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgICAgICAgICBzZXRkeCh5MCwgaSwgZFswXSk7XG4gICAgICAgICAgICBzZXRkeSh5MCwgaSwgZFsxXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYWNoZSBhY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgIGNvbnN0IGcgPSBzY2VuZS5nO1xuXG4gICAgICAgIHRoaXMuZHlkdCA9IGZ1bmN0aW9uIGR5ZHkoX3Q6IG51bWJlciwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgICAgIC8vIERlcml2YXRpdmUgb2YgcG9zaXRpb24gaXMgdmVsb2NpdHkuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIHNldGR4KGR5ZHQsIGksIGdldHZ4KHksIGkpKTtcbiAgICAgICAgICAgICAgICBzZXRkeShkeWR0LCBpLCBnZXR2eSh5LCBpKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgc2V0dngoZHlkdCwgaSwgZ1swXSk7XG4gICAgICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERlY2tzIGFyZSB1cGRhdGVkIGluIGhtYXAgaW4gdGhlIGJlbG93IGxvb3AgdGhyb3VnaCBiZWFtcywgc28gY2xlYXIgdGhlIHByZXZpb3VzIHZhbHVlcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgaCBvZiBobWFwKSB7XG4gICAgICAgICAgICAgICAgaC5kZWNrQ291bnQgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGJlYW0gc3RyZXNzLlxuICAgICAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgICAgICBpZiAocDEgPCAwICYmIHAyIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBCb3RoIGVuZHMgYXJlIG5vdCBtb3ZlYWJsZS5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgICAgIGNvbnN0IHcgPSBiZWFtLnc7XG4gICAgICAgICAgICAgICAgY29uc3QgbDAgPSBiZWFtLmw7XG4gICAgICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBwMikgLSBnZXRkeSh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICAgICAgY29uc3QgayA9IEUgKiB3IC8gbDA7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAxLCB1eCAqIHNwcmluZ0YsIHV5ICogc3ByaW5nRik7XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDIsIC11eCAqIHNwcmluZ0YsIC11eSAqIHNwcmluZ0YpO1xuXG4gICAgICAgICAgICAgICAgLy8gRGFtcGluZyBmb3JjZS5cbiAgICAgICAgICAgICAgICBjb25zdCB6ZXRhID0gMC41O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgcDIpIC0gZ2V0dngoeSwgcDEpOyAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMS5cbiAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIHAyKSAtIGdldHZ5KHksIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2ID0gdnggKiB1eCArIHZ5ICogdXk7ICAgIC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxIGluIGRpcmVjdGlvbiBvZiBiZWFtLlxuICAgICAgICAgICAgICAgIGlmIChwMSA+PSAwICYmIHAyID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTEgPSBtYXNzW3AxXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBtYXNzW3AyXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEgKiBtMiAvIChtMSArIG0yKSk7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAxLCB1eCAqIGRhbXBGLCB1eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDIsIC11eCAqIGRhbXBGLCAtdXkgKiBkYW1wRik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwMSA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gbWFzc1twMV07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDEsIHV4ICogZGFtcEYsIHV5ICogZGFtcEYpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMiA9IG1hc3NbcDJdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMik7XG4gICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAyLCAtdXggKiBkYW1wRiwgLXV5ICogZGFtcEYpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgICAgICBpZiAoYmVhbS5kZWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMSkgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5taW4oaTEsIGkyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5tYXgoaTEsIGkyKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBobWFwQWRkRGVjayhpLCBiZWFtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byB0ZXJyYWluIGNvbGxpc2lvblxuICAgICAgICAgICAgLy8gVE9ETzogc2NlbmUgYm9yZGVyIGNvbGxpc2lvblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGkpOyAvLyBQaW4gcG9zaXRpb24uXG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gbWFzc1tpXTtcbiAgICAgICAgICAgICAgICBsZXQgYm91bmNlRiA9IDEwMDAuMCAqIG07IC8vIEFjY2VsZXJhdGlvbiBwZXIgbWV0cmUgb2YgZGVwdGggdW5kZXIgdGVycmFpbi5cbiAgICAgICAgICAgICAgICBsZXQgbng7IC8vIFRlcnJhaW4gdW5pdCBub3JtYWwgKGRpcmVjdGlvbiBvZiBhY2NlbGVyYXRpb24pLlxuICAgICAgICAgICAgICAgIGxldCBueTtcbiAgICAgICAgICAgICAgICBpZiAoZHggPCAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgbnggPSAwLjA7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gLTEuMDtcbiAgICAgICAgICAgICAgICAgICAgYm91bmNlRiAqPSBkeSAtIGhlaWdodCArIGhtYXBbMF0uaGVpZ2h0O1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpID0gTWF0aC5taW4oaG1hcC5sZW5ndGggLSAxLCBNYXRoLmZsb29yKGR4IC8gcGl0Y2gpKTtcbiAgICAgICAgICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgICAgICAgICAgbnkgPSBobWFwW3RpXS5ueTtcbiAgICAgICAgICAgICAgICAgICAgLy8gRGlzdGFuY2UgYmVsb3cgdGVycmFpbiBpcyBub3JtYWwgZG90IHZlY3RvciBmcm9tIHRlcnJhaW4gdG8gcG9pbnQuXG4gICAgICAgICAgICAgICAgICAgIGJvdW5jZUYgKj0gLShueCAqIChkeCAtIHRpICogcGl0Y2gpICsgbnkgKiAoZHkgLSBobWFwW3RpXS5oZWlnaHQpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGJvdW5jZUYgPD0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGFyZSBub3QgYm91bmNpbmcuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBpLCBueCAqIGJvdW5jZUYsIG55ICogYm91bmNlRik7XG5cbiAgICAgICAgICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHR2ID0gdnggKiB0eCArIHZ5ICogdHk7XG4gICAgICAgICAgICAgICAgbGV0IGZyaWN0aW9uRiA9IHRGcmljdGlvbiAqIGJvdW5jZUYgKiAodHYgPiAwID8gLTEgOiAxKTtcbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBpLCB0eCAqIGZyaWN0aW9uRiwgdHkgKiBmcmljdGlvbkYpO1xuXG4gICAgICAgICAgICAgICAgLy8gT2xkIENvZGVcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB3aHkgZGlkIHRoaXMgbmVlZCB0byBjYXAgdGhlIGFjY2VsZXJhdGlvbj8gbWF5YmUgYm91bmNlIGZvcmNlIGlzIHRvbyBoaWdoP1xuICAgICAgICAgICAgICAgIC8vY29uc3QgYWYgPSBNYXRoLm1pbih0RnJpY3Rpb24gKiBhdCwgTWF0aC5hYnModHYgKiAxMDApKSAqICh0diA+PSAwLjAgPyAtMS4wIDogMS4wKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFRPRE86IGRpc2NzXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1ldGhvZCA9IG5ldyBSdW5nZUt1dHRhNCh5MCwgdGhpcy5keWR0KTtcbiAgICAgICAgdGhpcy5rZXlmcmFtZXMuc2V0KHRoaXMubWV0aG9kLnQsIG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tZXRob2QueSkpO1xuICAgIH1cblxuICAgIHNlZWtUaW1lcygpOiBJdGVyYWJsZUl0ZXJhdG9yPG51bWJlcj4ge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlmcmFtZXMua2V5cygpO1xuICAgIH1cblxuICAgIHNlZWsodDogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeSA9IHRoaXMua2V5ZnJhbWVzLmdldCh0KTtcbiAgICAgICAgaWYgKHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3R9IGlzIG5vdCBhIGtleWZyYW1lIHRpbWVgKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMubWV0aG9kLnlbaV0gPSB5W2ldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubWV0aG9kLnQgPSB0O1xuXG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnBhdXNlKGVjKTtcbiAgICAgICAgICAgIHRoaXMucGxheShlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aW1lKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1ldGhvZC50O1xuICAgIH1cblxuICAgIHByaXZhdGUgbmV4dCgpIHsgICAgLy8gVE9ETzogbWFrZSB0aGlzIHByaXZhdGU/XG4gICAgICAgIGNvbnN0IHByZXZUID0gdGhpcy5tZXRob2QudDtcbiAgICAgICAgdGhpcy5tZXRob2QubmV4dCh0aGlzLmgpO1xuICAgICAgICBjb25zdCBpc0tleWZyYW1lID0gTWF0aC5mbG9vcihwcmV2VCAvIHRoaXMua2V5SW50ZXJ2YWwpICE9PSBNYXRoLmZsb29yKHRoaXMubWV0aG9kLnQgLyB0aGlzLmtleUludGVydmFsKTtcbiAgICAgICAgaWYgKHRoaXMudExhdGVzdCA8IHRoaXMubWV0aG9kLnQpIHtcbiAgICAgICAgICAgIGlmIChpc0tleWZyYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5rZXlmcmFtZXMuc2V0KHRoaXMubWV0aG9kLnQsIG5ldyBGbG9hdDMyQXJyYXkodGhpcy5tZXRob2QueSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50TGF0ZXN0ID0gdGhpcy5tZXRob2QudDtcbiAgICAgICAgfSBlbHNlIGlmIChpc0tleWZyYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB5ID0gdGhpcy5rZXlmcmFtZXMuZ2V0KHRoaXMubWV0aG9kLnQpO1xuICAgICAgICAgICAgaWYgKHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHNob3VsZCBiZSBhIGtleWZyYW1lYCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IGRpZmYgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgeS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICh5W2ldICE9PSB0aGlzLm1ldGhvZC55W2ldKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpZmYgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkaWZmKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFJlcGxheWluZyBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHByb2R1Y2VkIGEgZGlmZmVyZW5jZSFgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFJlcGxheWluZyBmcmFtZSAke3RoaXMubWV0aG9kLnR9IHByb2R1Y2VkIHRoZSBzYW1lIHN0YXRlYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwbGF5aW5nKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5wbGF5VGltZXIgIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBwbGF5KGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5wbGF5VGltZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucGxheVRpbWUgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB0aGlzLnBsYXlUaW1lciA9IGVjLnRpbWVyKHRoaXMucGxheVRpY2ssIHVuZGVmaW5lZCk7XG4gICAgfVxuXG4gICAgcGF1c2UoZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWMuY2xlYXJUaW1lcih0aGlzLnBsYXlUaW1lcik7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGdldFBpbihwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgY29uc3QgaSA9IHRoaXMuZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDI7XG4gICAgICAgICAgICByZXR1cm4gW3RoaXMuZml4ZWRQaW5zW2ldLCB0aGlzLmZpeGVkUGluc1tpKzFdXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSBwaW4gKiAyO1xuICAgICAgICAgICAgY29uc3QgeSA9IHRoaXMubWV0aG9kLnk7XG4gICAgICAgICAgICByZXR1cm4gW3lbaV0sIHlbaSsxXV07XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG50eXBlIE9uQWRkUGluSGFuZGxlciA9IChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4gdm9pZDtcbnR5cGUgT25SZW1vdmVQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xuXG5leHBvcnQgY2xhc3MgU2NlbmVFZGl0b3Ige1xuICAgIHNjZW5lOiBTY2VuZUpTT047XG4gICAgcHJpdmF0ZSBzaW06IFNjZW5lU2ltdWxhdG9yIHwgdW5kZWZpbmVkO1xuICAgIHByaXZhdGUgb25BZGRQaW5IYW5kbGVyczogQXJyYXk8T25BZGRQaW5IYW5kbGVyPjtcbiAgICBwcml2YXRlIG9uUmVtb3ZlUGluSGFuZGxlcnM6IEFycmF5PE9uUmVtb3ZlUGluSGFuZGxlcj47XG4gICAgZWRpdE1hdGVyaWFsOiBudW1iZXI7XG4gICAgZWRpdFdpZHRoOiBudW1iZXI7XG4gICAgZWRpdERlY2s6IGJvb2xlYW47XG5cbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogU2NlbmVKU09OKSB7XG4gICAgICAgIHRoaXMuc2NlbmUgPSBzY2VuZTtcbiAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMgPSBbXTtcbiAgICAgICAgLy8gVE9ETzogcHJvcGVyIGluaXRpYWxpemF0aW9uO1xuICAgICAgICB0aGlzLmVkaXRNYXRlcmlhbCA9IDA7XG4gICAgICAgIHRoaXMuZWRpdFdpZHRoID0gMTtcbiAgICAgICAgdGhpcy5lZGl0RGVjayA9IHRydWU7XG4gICAgfVxuXG4gICAgc2ltdWxhdG9yKCk6IFNjZW5lU2ltdWxhdG9yIHtcbiAgICAgICAgaWYgKHRoaXMuc2ltID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gbmV3IFNjZW5lU2ltdWxhdG9yKHRoaXMuc2NlbmUsIDAuMDAxLCAxKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5zaW07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcDEgPSBhLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGEucDI7XG4gICAgICAgIGNvbnN0IG0gPSBhLm07XG4gICAgICAgIGNvbnN0IHcgPSBhLnc7XG4gICAgICAgIGNvbnN0IGwgPSBhLmw7XG4gICAgICAgIGNvbnN0IGRlY2sgPSBhLmRlY2s7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMSk7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIHRydXNzQXNzZXJ0TWF0ZXJpYWwodHJ1c3MsIG0pO1xuICAgICAgICBpZiAodyA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSB3aWR0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHt3fWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsICE9PSB1bmRlZmluZWQgJiYgbCA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBsZW5ndGggbXVzdCBiZSBncmVhdGVyIHRoYW4gMCwgZ290ICR7bH1gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRydXNzLmVkaXRCZWFtcy5wdXNoKHtwMSwgcDIsIG0sIHcsIGwsIGRlY2t9KTtcbiAgICAgICAgXG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7ICAgLy8gVE9ETzogaGF2ZSBsaXN0ZW5lcnMsIGFuZCB0aGVuIHRoZSBVSSBjb21wb25lbnQgY2FuIGRvIHRoZSByZXF1ZXN0RHJhdygpXG4gICAgfVxuICAgIFxuICAgIHByaXZhdGUgdW5kb0FkZEJlYW0oYTogQWRkQmVhbUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgYiA9IHRydXNzLmVkaXRCZWFtcy5wb3AoKTtcbiAgICAgICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBiZWFtcyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiLnAxICE9PSBhLnAxIHx8IGIucDIgIT09IGEucDIgfHwgYi5tICE9PSBhLm0gfHwgYi53ICE9IGEudyB8fCBiLmwgIT09IGEubCB8fCBiLmRlY2sgIT09IGEuZGVjaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCZWFtIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICB0cnVzcy5lZGl0UGlucy5wdXNoKGEucGluKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIHRoaXMub25BZGRQaW5IYW5kbGVycykge1xuICAgICAgICAgICAgaChlZGl0SW5kZXgsIHBpbiwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWRkUGluKGE6IEFkZFBpbkFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgY29uc3QgcCA9IHRydXNzLmVkaXRQaW5zLnBvcCgpO1xuICAgICAgICBpZiAocCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHBpbnMgZXhpc3QnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocFswXSAhPT0gYS5waW5bMF0gfHwgcFsxXSAhPT0gYS5waW5bMV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUGluIGRvZXMgbm90IG1hdGNoJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZWRpdEluZGV4ID0gdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICBjb25zdCBwaW4gPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgZWRpdEluZGV4O1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vblJlbW92ZVBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5hY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQ29tcG9zaXRlKGE6IENvbXBvc2l0ZUFjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGZvciAobGV0IGkgPSBhLmFjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHRoaXMudW5kb0FjdGlvbihhLmFjdGlvbnNbaV0sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBzd2l0Y2ggKGEudHlwZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZF9iZWFtXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQ29tcG9zaXRlKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgdW5kb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRCZWFtKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfcGluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy51bmRvQWRkUGluKGEsIGVjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJjb21wb3NpdGVcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgZW51bWVyYXRpb24vb2JzZXJ2YXRpb24gbWV0aG9kc1xuXG4gICAgb25BZGRQaW4oaGFuZGxlcjogT25BZGRQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25BZGRQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIG9uUmVtb3ZlUGluKGhhbmRsZXI6IE9uUmVtb3ZlUGluSGFuZGxlcikge1xuICAgICAgICB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMucHVzaChoYW5kbGVyKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBDbGVhciBoYW5kbGVycz9cblxuICAgIHVuZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS51bmRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIHJlZG9Db3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY2VuZS5yZWRvU3RhY2subGVuZ3RoO1xuICAgIH1cblxuICAgIC8vIFNjZW5lIG11dGF0aW9uIG1ldGhvZHNcblxuICAgIHVuZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnVuZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHVuZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEsIGVjKTtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sucHVzaChhKTtcbiAgICAgICAgLy8gVE9ETzogdXBkYXRlIHNpbXVsYXRvciB3aXRoIHNhdmVkIHN0YXRlLlxuICAgICAgICBpZiAodGhpcy5zaW0gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zaW0ucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5zaW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZWRvKGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICBjb25zdCBhID0gdGhpcy5zY2VuZS5yZWRvU3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIm5vIGFjdGlvbiB0byByZWRvXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnVuZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICAvLyBUT0RPOiB1cGRhdGUgc2ltdWxhdG9yIHdpdGggc2F2ZWQgc3RhdGUuXG4gICAgICAgIGlmICh0aGlzLnNpbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNpbS5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zY2VuZS5yZWRvU3RhY2sgPSBbYV07XG4gICAgICAgIHRoaXMucmVkbyhlYyk7ICAgIC8vIFRPRE86IElzIHRoaXMgdG9vIGNsZXZlcj9cbiAgICB9XG5cbiAgICBhZGRCZWFtKFxuICAgICAgICBwMTogbnVtYmVyLFxuICAgICAgICBwMjogbnVtYmVyLFxuICAgICAgICBlYzogRWxlbWVudENvbnRleHQsXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IHRydXNzID0gdGhpcy5zY2VuZS50cnVzcztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgaWYgKHRydXNzQmVhbUV4aXN0cyh0cnVzcywgcDEsIHAyKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGJldHdlZW4gcGlucyAke3AxfSBhbmQgJHtwMn0gYWxyZWFkeSBleGlzdHNgKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmFjdGlvbih7XG4gICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICBwMSxcbiAgICAgICAgICAgIHAyLFxuICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgIGw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgfSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbihwaW46IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJhZGRfcGluXCIsIHBpbn0sIGVjKTtcbiAgICB9XG5cbiAgICBhZGRQaW5BbmRCZWFtKFxuICAgICAgICBwaW46IFBvaW50MkQsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBjb25zdCBwMSA9IHRoaXMuc2NlbmUudHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgICAgICB0aGlzLmFjdGlvbih7dHlwZTogXCJjb21wb3NpdGVcIiwgYWN0aW9uczogW1xuICAgICAgICAgICAgeyB0eXBlOiBcImFkZF9waW5cIiwgcGlufSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBcImFkZF9iZWFtXCIsXG4gICAgICAgICAgICAgICAgcDEsXG4gICAgICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICAgICAgbTogdGhpcy5lZGl0TWF0ZXJpYWwsXG4gICAgICAgICAgICAgICAgdzogdGhpcy5lZGl0V2lkdGgsXG4gICAgICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIGRlY2s6IHRoaXMuZWRpdERlY2tcbiAgICAgICAgICAgIH0sXG4gICAgICAgIF19LCBlYyk7XG4gICAgfVxufTtcblxuLypcbmV4cG9ydCBmdW5jdGlvbiBzY2VuZU1ldGhvZChzY2VuZTogU2NlbmUpOiBPREVNZXRob2Qge1xuICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgXG4gICAgY29uc3QgZml4ZWRQaW5zID0gdHJ1c3MuZml4ZWRQaW5zO1xuICAgIGNvbnN0IG1vYmlsZVBpbnMgPSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xuICAgIC8vIFN0YXRlIGFjY2Vzc29yc1xuICAgIGZ1bmN0aW9uIGdldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVswXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbl1bMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV07IFxuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVtwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBTcGxpdCBiZWFtIG1hc3MgZXZlbmx5IGJldHdlZW4gcGlucywgaW5pdGlhbGlzZSBiZWFtIGxlbmd0aC5cbiAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7XG4gICAgY29uc3QgbWFzcyA9IG5ldyBGbG9hdDMyQXJyYXkobW9iaWxlUGlucyk7XG4gICAgZnVuY3Rpb24gZ2V0bShwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFzc1twaW5dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDUuOTcyZTI0OyAgICAvLyBNYXNzIG9mIHRoZSBFYXJ0aC5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGJlYW1zID0gWy4uLnRydXNzLnN0YXJ0QmVhbXMsIC4uLnRydXNzLmVkaXRCZWFtc10ubWFwKChiZWFtOiBCZWFtKTogU2ltdWxhdGlvbkJlYW0gPT4ge1xuICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgY29uc3QgbCA9IHBvaW50RGlzdGFuY2Uoc2NlbmUuZ2V0UGluKHAxKSwgc2NlbmUuZ2V0UGluKHAyKSk7XG4gICAgICAgIGNvbnN0IG0gPSBsICogYmVhbS53ICogbWF0ZXJpYWxzW2JlYW0ubV0uZGVuc2l0eTtcbiAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgbWFzc1twMV0gKz0gbSAqIDAuNTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AyXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHAxLCBwMiwgbTogYmVhbS5tLCB3OiBiZWFtLncsIGw6IGJlYW0ubCB8fCBsLCBkZWNrOiBiZWFtLmRlY2sgfHwgZmFsc2UgfTtcbiAgICB9KTtcblxuICAgIC8vIERpc2MgbWFzcy5cbiAgICBjb25zdCBkaXNjcyA9IHNjZW5lLnRydXNzLmRpc2NzO1xuICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICBpZiAoZGlzYy5wID49IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRpc2MgYXR0YWNoZWQgdG8gbm9uIG1vYmlsZSBwaW5cIik7XG4gICAgICAgIH1cbiAgICAgICAgbWFzc1tkaXNjLnBdICs9IGRpc2MuciAqIGRpc2MuciAqIE1hdGguUEkgKiBtYXRlcmlhbHNbZGlzYy5tXS5kZW5zaXR5O1xuICAgIH1cblxuICAgIC8vIENoZWNrIHRoYXQgZXZlcnl0aGluZyB0aGF0IGNhbiBtb3ZlIGhhcyBzb21lIG1hc3MuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgaWYgKG1hc3NbaV0gPD0gMC4wKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE1vYmlsZSBwaW4gJHtpfSBoYXMgbWFzcyAke21hc3NbaV19IDw9IDAuMGApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcGl0Y2ggPSBzY2VuZS53aWR0aCAvIChzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgaG1hcDogU2ltdWxhdGlvbkhNYXAgPSBzY2VuZS50ZXJyYWluLmhtYXAubWFwKChoLCBpKSA9PiB7XG4gICAgICAgIGlmIChpICsgMSA+PSBzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgICAgICBueDogMC4wLFxuICAgICAgICAgICAgICAgIG55OiAxLjAsXG4gICAgICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gaDtcbiAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeSAqIGR5ICsgcGl0Y2ggKiBwaXRjaCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICBueDogLWR5IC8gbCxcbiAgICAgICAgICAgIG55OiBwaXRjaCAvIGwsXG4gICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgIH07XG4gICAgfSk7XG4gICAgZnVuY3Rpb24gcmVzZXREZWNrcygpIHtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGhtYXApIHtcbiAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGREZWNrKGk6IG51bWJlciwgZDogU2ltdWxhdGlvbkJlYW0pIHtcbiAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBoID0gaG1hcFtpXTtcbiAgICAgICAgaC5kZWNrc1toLmRlY2tDb3VudF0gPSBkO1xuICAgICAgICBoLmRlY2tDb3VudCsrO1xuICAgIH1cbiAgICBjb25zdCB0RnJpY3Rpb24gPSBzY2VuZS50ZXJyYWluLmZyaWN0aW9uO1xuXG4gICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlIHZlY3Rvci5cbiAgICBjb25zdCB5MCA9IG5ldyBGbG9hdDMyQXJyYXkobW9iaWxlUGlucyAqIDQpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBnZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBzZXRkeCh5MCwgaSwgZFswXSk7XG4gICAgICAgIHNldGR5KHkwLCBpLCBkWzFdKTtcbiAgICB9XG4gICAgLy8gTkI6IEluaXRpYWwgdmVsb2NpdGllcyBhcmUgYWxsIDAsIG5vIG5lZWQgdG8gaW5pdGlhbGl6ZS5cblxuICAgIGNvbnN0IGcgPSAgc2NlbmUuZztcbiAgICByZXR1cm4gbmV3IFJ1bmdlS3V0dGE0KHkwLCBmdW5jdGlvbiAoX3Q6IG51bWJlciwgeTogRmxvYXQzMkFycmF5LCBkeWR0OiBGbG9hdDMyQXJyYXkpIHtcbiAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldGR4KGR5ZHQsIGksIGdldHZ4KHksIGkpKTtcbiAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGdyYXZpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdKTtcbiAgICAgICAgICAgIHNldHZ5KGR5ZHQsIGksIGdbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGVja3MgYXJlIHVwZGF0ZWQgaW4gaG1hcCBpbiB0aGUgYmVsb3cgbG9vcCB0aHJvdWdoIGJlYW1zLCBzbyBjbGVhciB0aGUgcHJldmlvdXMgdmFsdWVzLlxuICAgICAgICByZXNldERlY2tzKCk7XG5cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBFID0gbWF0ZXJpYWxzW2JlYW0ubV0uRTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGNvbnN0IHcgPSBiZWFtLnc7XG4gICAgICAgICAgICBjb25zdCBsMCA9IGJlYW0ubDtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgcDIpIC0gZ2V0ZHgoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBwMikgLSBnZXRkeSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyYWluID0gKGwgLSBsMCkgLyBsMDtcbiAgICAgICAgICAgIC8vY29uc3Qgc3RyZXNzID0gc3RyYWluICogRSAqIHc7XG4gICAgICAgICAgICBjb25zdCBrID0gRSAqIHcgLyBsMDtcbiAgICAgICAgICAgIGNvbnN0IHNwcmluZ0YgPSAobCAtIGwwKSAqIGs7XG4gICAgICAgICAgICBjb25zdCBtMSA9IGdldG0ocDEpOyAgICAvLyBQaW4gbWFzc1xuICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKHAyKTtcbiAgICAgICAgICAgIGNvbnN0IHV4ID0gZHggLyBsOyAgICAgIC8vIFVuaXQgdmVjdG9yIGluIGRpcmVjdGlubyBvZiBiZWFtO1xuICAgICAgICAgICAgY29uc3QgdXkgPSBkeSAvIGw7XG5cbiAgICAgICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogc3ByaW5nRiAvIG0yKTtcbiAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBzcHJpbmdGIC8gbTIpO1xuXG4gICAgICAgICAgICAvLyBEYW1waW5nIGZvcmNlLlxuICAgICAgICAgICAgY29uc3QgemV0YSA9IDAuNTtcbiAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgcDIpIC0gZ2V0dngoeSwgcDEpOyAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMS5cbiAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgcDIpIC0gZ2V0dnkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgdiA9IHZ4ICogdXggKyB2eSAqIHV5OyAgICAvLyBWZWxvY2l0eSBvZiBwMiByZWxhdGl2ZSB0byBwMSBpbiBkaXJlY3Rpb24gb2YgYmVhbS5cbiAgICAgICAgICAgIC8vIFRPRE86IG5vdyB0aGF0IGdldG0gcmV0dXJucyBtYXNzIG9mIEVhcnRoIGZvciBmaXhlZCBwaW5zLCB3ZSBkb24ndCBuZWVkIHRoZXNlIGRpZmZlcmVudCBpZiBjbGF1c2VzLlxuICAgICAgICAgICAgaWYgKHAxIDwgbW9iaWxlUGlucyAmJiBwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSAqIG0yIC8gKG0xICsgbTIpKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMiwgLXV4ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgZGVja3MgdG8gYWNjbGVyYXRpb24gc3RydWN0dXJlXG4gICAgICAgICAgICBpZiAoYmVhbS5kZWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldGR4KHksIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlZ2luID0gTWF0aC5taW4oaTEsIGkyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1heChpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBhZGREZWNrKGksIGJlYW0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIHRlcnJhaW4gY29sbGlzaW9uLCBzY2VuZSBib3JkZXIgY29sbGlzaW9uXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGkpOyAvLyBQaW4gcG9zaXRpb24uXG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGkpO1xuICAgICAgICAgICAgbGV0IGF0ID0gMTAwMC4wOyAvLyBBY2NlbGVyYXRpb24gcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICBsZXQgbng7IC8vIFRlcnJhaW4gdW5pdCBub3JtYWwuXG4gICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICBpZiAoZHggPCAwLjApIHtcbiAgICAgICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgICAgICBueSA9IDEuMDtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gMC4wKSArIG55ICogKGR5IC0gaG1hcFswXS5oZWlnaHQpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgbnkgPSBobWFwW3RpXS5ueTtcbiAgICAgICAgICAgICAgICBhdCAqPSAtKG54ICogKGR4IC0gdGkgKiBwaXRjaCkgKyBueSAqIChkeSAtIGhtYXBbdGldLmhlaWdodCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGF0ID4gMC4wKSB7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgbnggKiBhdCk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgbnkgKiBhdCk7XG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAvLyBDYXAgYWNjZWxlcmF0aW9uIGJ5IHNvbWUgZnJhY3Rpb24gb2YgdmVsb2NpdHlcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0YWtlIGZyaWN0aW9uIGZyb20gYmVhbXMgdG9vIChqdXN0IGF2ZXJhZ2UgYmVhbXMgZ29pbmcgaW50byBwaW4/KVxuICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgY29uc3QgdHYgPSBnZXR2eCh5LCBpKSAqIHR4ICsgZ2V0dnkoeSwgaSkgKiB0eTtcbiAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKHRGcmljdGlvbiAqIGF0LCBNYXRoLmFicyh0diAqIDEwMCkpICogKHR2ID49IDAuMCA/IC0xLjAgOiAxLjApO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGksIHR4ICogYWYpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGksIHR5ICogYWYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZGlzYy1kZWNrIGNvbGxpc2lvbi5cbiAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBkaXNjLnApO1xuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBobWFwIGJ1Y2tldHMgdGhhdCBkaXNjIG92ZXJsYXBzLlxuICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKChkeCAtIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKChkeCArIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGkxOyBpIDw9IGkyOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBkZWNrcyBpbiB0aG9zZSBidWNrZXRzLlxuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tzID0gaG1hcFtpXS5kZWNrcztcbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrQ291bnQgPSBobWFwW2ldLmRlY2tDb3VudDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRlY2tDb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2sgPSBkZWNrc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MSA9IGdldGR4KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MSA9IGdldGR5KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB4MiA9IGdldGR4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB5MiA9IGdldGR5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gSXMgY29sbGlzaW9uIGhhcHBlbmluZz9cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN5ID0geTIgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3ggPSBkeCAtIHgxOyAvLyBWZWN0b3IgdG8gY2VudHJlIG9mIGRpc2MgKGZyb20gc3RhcnQgb2YgZGVjaylcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhID0gc3ggKiBzeCArIHN5ICogc3k7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGIgPSAtMi4wICogKGN4ICogc3ggKyBjeSAqIHN5KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IEQgPSBiICogYiAtIDQuMCAqIGEgKiBjO1xuICAgICAgICAgICAgICAgICAgICBpZiAoRCA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCByb290RCA9IE1hdGguc3FydChEKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IC1iIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdDEgPSAoLWIgLSByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MiA9ICgtYiArIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCh0MSA8PSAwLjAgJiYgdDIgPD0gMC4wKSB8fCAodDEgPj0gMS4wICYmIHQyID49IDAuMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIEludGVyc2VjdGlvbnMgYXJlIGJvdGggYmVmb3JlIG9yIGFmdGVyIGRlY2suXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdDEgPSBNYXRoLm1heCh0MSwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgdDIgPSBNYXRoLm1pbih0MiwgMS4wKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGNvbGxpc2lvbiBhY2NlbGVyYXRpb24uXG4gICAgICAgICAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBpcyBwcm9wb3J0aW9uYWwgdG8gYXJlYSAnc2hhZG93ZWQnIGluIHRoZSBkaXNjIGJ5IHRoZSBpbnRlcnNlY3RpbmcgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBzbyB0aGF0IGFzIGEgZGlzYyBtb3ZlcyBiZXR3ZWVuIHR3byBkZWNrIHNlZ21lbnRzLCB0aGUgYWNjZWxlcmF0aW9uIHJlbWFpbnMgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeCA9ICgxIC0gdDEpICogeDEgKyB0MSAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MSBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeSA9ICgxIC0gdDEpICogeTEgKyB0MSAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeCA9ICgxIC0gdDIpICogeDEgKyB0MiAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MiBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeSA9ICgxIC0gdDIpICogeTEgKyB0MiAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhID0gTWF0aC5hYnMoTWF0aC5hdGFuMih0MXksIHQxeCkgLSBNYXRoLmF0YW4yKHQyeSwgdDJ4KSkgJSBNYXRoLlBJO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcmVhID0gMC41ICogciAqIHIgKiB0YSAtIDAuNSAqIE1hdGguYWJzKHQxeCAqIHQyeSAtIHQxeSAqIHQyeCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuID0gMTAwMC4wICogYXJlYTsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IHdoYXQgYWNjZWxlcmF0aW9uIHRvIHVzZVxuICAgICAgICAgICAgICAgICAgICBsZXQgbnggPSBjeCAtIHN4ICogdDtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG55ID0gY3kgLSBzeSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQobnggKiBueCArIG55ICogbnkpO1xuICAgICAgICAgICAgICAgICAgICBueCAvPSBsO1xuICAgICAgICAgICAgICAgICAgICBueSAvPSBsO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbnMgdG8gdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1kID0gZ2V0bShkaXNjLnApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IGdldG0oZGVjay5wMSkgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShkZWNrLnAyKSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkID0gKG0xICsgbTIpIC8gKG1kICsgbTEgKyBtMik7ICAvLyBTaGFyZSBvZiBhY2NlbGVyYXRpb24gZm9yIGRpc2MsIGRlY2sgZW5kcG9pbnRzLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMSA9IChtZCArIG0yKSAvIChtZCArIG0xICsgbTIpICogKDEuMCAtIHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhMiA9IChtZCArIG0xKSAvIChtZCArIG0xICsgbTIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCBueCAqIGFuICogYWQpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIG55ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMSwgLW54ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC1ueSAqIGFuICogYTEpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtbnggKiBhbiAqIGEyKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMiwgLW55ICogYW4gKiBhMik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBmcmljdGlvbiBhbmQgZGFtcGluZy5cbiAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHJlbGF0aXZlIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eCh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eCh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dnkoeSwgZGVjay5wMSkgLSB0ICogZ2V0dnkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZuID0gdnggKiBueCArIHZ5ICogbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2dCA9IHZ4ICogdHggKyB2eSAqIHR5IC0gZGlzYy52O1xuICAgICAgICAgICAgICAgICAgICAvLyBUb3RhbGx5IHVuc2NpZW50aWZpYyB3YXkgdG8gY29tcHV0ZSBmcmljdGlvbiBmcm9tIGFyYml0cmFyeSBjb25zdGFudHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uID0gTWF0aC5zcXJ0KG1hdGVyaWFsc1tkaXNjLm1dLmZyaWN0aW9uICogbWF0ZXJpYWxzW2RlY2subV0uZnJpY3Rpb24pO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZiA9IE1hdGgubWluKGFuICogZnJpY3Rpb24sIE1hdGguYWJzKHZ0ICogMTAwKSkgKiAodnQgPD0gMC4wID8gMS4wIDogLTEuMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXAgPSAyOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIGRlcml2ZSBhIHJlYXNvbmFibGUgY29uc3RhbnQuXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRpc2MucCwgdHggKiBhZiAqIGFkIC0gdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkaXNjLnAsIHR5ICogYWYgKiBhZCAtIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtdHggKiBhZiAqIGExICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAxLCAtdHkgKiBhZiAqIGExICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAyLCAtdHggKiBhZiAqIGEyICsgdm4gKiBueCAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtdHkgKiBhZiAqIGEyICsgdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NlbmVSZW5kZXJlcihzY2VuZTogU2NlbmUpOiBUcnVzc1JlbmRlciB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7XG4gICAgXG4gICAgLy8gUHJlLXJlbmRlciB0ZXJyYWluLlxuICAgIGNvbnN0IHRlcnJhaW4gPSBzY2VuZS50ZXJyYWluO1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgdGVycmFpblBhdGggPSBuZXcgUGF0aDJEKCk7XG4gICAgdGVycmFpblBhdGgubW92ZVRvKDAuMCwgMC4wKTtcbiAgICBsZXQgeCA9IDAuMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGhtYXAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGVycmFpblBhdGgubGluZVRvKHgsIGhtYXBbaV0pO1xuICAgICAgICB4ICs9IHRlcnJhaW4ucGl0Y2g7XG4gICAgfVxuICAgIHRlcnJhaW5QYXRoLmxpbmVUbyh4IC0gdGVycmFpbi5waXRjaCwgMC4wKTtcbiAgICB0ZXJyYWluUGF0aC5jbG9zZVBhdGgoKTtcblxuICAgIHJldHVybiBmdW5jdGlvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgb2RlOiBPREVNZXRob2QpIHtcbiAgICAgICAgLy8gVGVycmFpbi5cbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHRlcnJhaW4uc3R5bGU7XG4gICAgICAgIGN0eC5maWxsKHRlcnJhaW5QYXRoKTtcblxuICAgICAgICBjb25zdCB5ID0gb2RlLnk7XG5cbiAgICAgICAgLy8gRGlzY3NcbiAgICAgICAgY29uc3QgZGlzY3MgPSB0cnVzcy5kaXNjcztcbiAgICAgICAgXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBkaXNjLnA7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguYXJjKHlbcCAqIDIgKyAwXSwgeVtwICogMiArIDFdLCBkaXNjLnIsIDAuMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICAgICAgY3R4LmZpbGwoXCJub256ZXJvXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmVhbXMuXG4gICAgICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IG1hdGVyaWFsc1tiZWFtLm1dLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IGJlYW0udztcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcblxuICAgICAgICAgICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gdXNlIG9kZSBhY2Nlc3NvcnMuXG4gICAgICAgICAgICAvLyBXYWl0LCBkb2VzIHRoYXQgbWVhbiB3ZSBuZWVkIGFuIE9ERSBmb3IgYSBzdGF0aWMgc2NlbmU/XG4gICAgICAgICAgICAvLyBXaWxsIG5lZWQgZGlmZmVyZW50IG1ldGhvZHMuXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChwMSA8IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwID0gZ2V0UGluKHRydXNzLCBwMSk7XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyh5W3AxICogMiArIDBdLCB5W3AxICogMiArIDFdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGluID0gcGluc1twMV07XG4gICAgICAgICAgICAgICAgY3R4Lm1vdmVUbyhwaW5bMF0sIHBpblsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyh5W3AyICogMiArIDBdLCB5W3AyICogMiArIDFdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGluID0gcGluc1twMl07XG4gICAgICAgICAgICAgICAgY3R4LmxpbmVUbyhwaW5bMF0sIHBpblsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG4qL1xuXG50eXBlIENyZWF0ZUJlYW1QaW5TdGF0ZSA9IHtcbiAgICBlZGl0OiBTY2VuZUVkaXRvcixcbiAgICBpOiBudW1iZXIsXG4gICAgZHJhZz86IHsgcDogUG9pbnQyRCwgaT86IG51bWJlciB9LFxufTtcblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBzdGF0ZTogQ3JlYXRlQmVhbVBpblN0YXRlKSB7XG4gICAgY29uc3QgdHJ1c3MgPSBzdGF0ZS5lZGl0LnNjZW5lLnRydXNzO1xuICAgIGN0eC5saW5lV2lkdGggPSAwLjU7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBcbiAgICBpZiAoc3RhdGUuZHJhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcDEgPSB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuaSk7XG4gICAgY29uc3QgcDIgPSBzdGF0ZS5kcmFnLmkgPT09IHVuZGVmaW5lZCA/IHN0YXRlLmRyYWcucCA6IHRydXNzR2V0UGluKHRydXNzLCBzdGF0ZS5kcmFnLmkpO1xuICAgIGNvbnN0IHcgPSBzdGF0ZS5lZGl0LmVkaXRXaWR0aDtcbiAgICBjb25zdCBzdHlsZSA9IHRydXNzLm1hdGVyaWFsc1tzdGF0ZS5lZGl0LmVkaXRNYXRlcmlhbF0uc3R5bGU7XG4gICAgY29uc3QgZGVjayA9IHN0YXRlLmVkaXQuZWRpdERlY2s7XG4gICAgZHJhd0JlYW0oY3R4LCBwMSwgcDIsIHcsIHN0eWxlLCBkZWNrKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuKHBzOiBBcnJheTxQYW5Qb2ludD4sIGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBpID0gdHJ1c3NHZXRDbG9zZXN0UGluKHRydXNzLCBwc1swXS5jdXJyLCAyLCBzdGF0ZS5pKTtcbiAgICBzdGF0ZS5kcmFnID0ge1xuICAgICAgICBwOiBwc1swXS5jdXJyLFxuICAgICAgICBpLFxuICAgIH07XG4gICAgZWMucmVxdWVzdERyYXcoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVhbVBpbk9uUGFuRW5kKGVjOiBFbGVtZW50Q29udGV4dCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBpZiAoc3RhdGUuZHJhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGRyYWcgc3RhdGUgT25QYW5FbmRcIik7XG4gICAgfVxuICAgIGlmIChzdGF0ZS5kcmFnLmkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzdGF0ZS5lZGl0LmFkZFBpbkFuZEJlYW0oc3RhdGUuZHJhZy5wLCBzdGF0ZS5pLCBlYyk7XG4gICAgfSBlbHNlIGlmICghdHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBzdGF0ZS5kcmFnLmksIHN0YXRlLmkpKSB7XG4gICAgICAgIC8vIFRPRE86IHJlcGxhY2UgZXhpc3RpbmcgYmVhbSBpZiBvbmUgZXhpc3RzIChhbmQgaXMgZWRpdGFibGUpLlxuICAgICAgICBzdGF0ZS5lZGl0LmFkZEJlYW0oc3RhdGUuZHJhZy5pLCBzdGF0ZS5pLCBlYyk7XG4gICAgfVxuICAgIHN0YXRlLmRyYWcgPSB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIENyZWF0ZUJlYW1QaW4oZWRpdDogU2NlbmVFZGl0b3IsIGk6IG51bWJlcik6IFBvc2l0aW9uTGF5b3V0PGFueSwgYW55PiB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgLy8gSWYgd2UgaGFkIHN0YXRlIHRoYXQgd2FzIHBhc3NlZCB0byBhbGwgaGFuZGxlcnMsIHRoZW4gd2UgY291bGQgYXZvaWQgYWxsb2NhdGluZyBuZXcgaGFuZGxlcnMgcGVyIEVsZW1lbnQuXG4gICAgcmV0dXJuIFBvc2l0aW9uPENyZWF0ZUJlYW1QaW5TdGF0ZT4ocFswXSAtIDIsIHBbMV0gLSAyLCA0LCA0LCB7IGVkaXQsIGkgfSlcbiAgICAgICAgLm9uRHJhdyhjcmVhdGVCZWFtUGluT25EcmF3KVxuICAgICAgICAub25QYW4oY3JlYXRlQmVhbVBpbk9uUGFuKVxuICAgICAgICAub25QYW5FbmQoY3JlYXRlQmVhbVBpbk9uUGFuRW5kKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NFZGl0YWJsZVBpbnMoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NFZGl0UGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgIH1cbiAgICBjb25zdCBlID0gUmVsYXRpdmUoLi4uY2hpbGRyZW4pO1xuXG4gICAgZWRpdC5vbkFkZFBpbigoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYGFkZGluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgYWRkQ2hpbGQoZSwgQ3JlYXRlQmVhbVBpbihlZGl0LCBwaW4pLCBlYywgZWRpdEluZGV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pO1xuICAgIGVkaXQub25SZW1vdmVQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGByZW1vdmluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgcmVtb3ZlQ2hpbGQoZSwgZWRpdEluZGV4LCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcblxuICAgIC8vIFRPRE86IGUub25EZXRhY2ggZm9yIHJlbW92ZWluZyBwaW4gb2JzZXJ2ZXJzLlxuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHdpZHRoID0gZWRpdC5zY2VuZS53aWR0aDtcbiAgICBjb25zdCBoZWlnaHQgPSBlZGl0LnNjZW5lLmhlaWdodDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc1VuZWRpdGFibGVQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgICAgIGlmIChwWzBdID4gMCAmJiBwWzBdIDwgd2lkdGggJiYgcFsxXSA+IDAgJiYgcFsxXSA8IGhlaWdodCkge1xuICAgICAgICAgICAgLy8gQmVhbXMgc2hvdWxkIG9ubHkgYmUgY3JlYXRlZCBmcm9tIHBpbnMgc3RyaWN0bHkgaW5zaWRlIHRoZSBzY2VuZS5cbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NMYXllcihzY2VuZTogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gTGF5ZXIoXG4gICAgICAgIEFkZFRydXNzVW5lZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICAgICBBZGRUcnVzc0VkaXRhYmxlUGlucyhzY2VuZSksXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gZHJhd0JlYW0oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHAxOiBQb2ludDJELCBwMjogUG9pbnQyRCwgdzogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBkZWNrPzogYm9vbGVhbikge1xuICAgIGN0eC5saW5lV2lkdGggPSB3O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBpZiAoZGVjayAhPT0gdW5kZWZpbmVkICYmIGRlY2spIHtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICBjdHgubGluZVdpZHRoID0gdyAqIDAuNzU7XG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgICAgICBjdHgubGluZVRvKHAyWzBdLCBwMlsxXSk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzTGF5ZXJPbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHRydXNzOiBUcnVzcykge1xuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFRydXNzTGF5ZXIodHJ1c3M6IFRydXNzKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwodHJ1c3MpLm9uRHJhdyh0cnVzc0xheWVyT25EcmF3KTtcbn1cblxuZnVuY3Rpb24gc2ltdWxhdGVMYXllck9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjb25zdCBzY2VuZSA9IGVkaXQuc2NlbmU7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBjb25zdCBzaW0gPSBlZGl0LnNpbXVsYXRvcigpO1xuICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBkcmF3QmVhbShjdHgsIHNpbS5nZXRQaW4oYi5wMSksIHNpbS5nZXRQaW4oYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBTaW11bGF0ZUxheWVyKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIEZpbGwoZWRpdCkub25EcmF3KHNpbXVsYXRlTGF5ZXJPbkRyYXcpO1xufVxuXG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZpbGwoc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIHJldHVybiAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBzdHlsZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGNjdzogYm9vbGVhbikge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuXG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAwLjc1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAxIDogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC4zIDogTWF0aC5QSSAqIDAuMztcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhlKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihlKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGUgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGUgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgXG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUsIGNjdyk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0J1dHRvbkJvcmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQudW5kb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eCwgYm94LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCh1bmRvQnV0dG9uVGFwKS5vbkRyYXcodW5kb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgICAgIGVkaXQucmVkbyhlYyk7XG4gICAgICAgIH1cbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQucmVkb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIGZhbHNlKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZGVja0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgZWRpdC5lZGl0RGVjayA9ICFlZGl0LmVkaXREZWNrO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICAgICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgICAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgW3ggLSByLCB5XSwgW3ggKyAgciwgeV0sIDE2LCBcImJsYWNrXCIsIGVkaXQuZWRpdERlY2spO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UGxheShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQYXVzZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHgsIHkgLSBweSk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBwbGF5QnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgICAgIGlmIChzaW0ucGxheWluZygpKSB7XG4gICAgICAgICAgICBzaW0ucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltLnBsYXkoZWMpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGlmIChlZGl0LnNpbXVsYXRvcigpLnBsYXlpbmcoKSkge1xuICAgICAgICAgICAgZHJhd1BhdXNlKGN0eCwgYm94KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyYXdQbGF5KGN0eCwgYm94KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UmVzZXQoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gciwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5IC0gcHkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gcmVzZXRCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgaWYgKHNpbS5wbGF5aW5nKCkpIHtcbiAgICAgICAgICAgIHNpbS5wYXVzZShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgc2ltLnNlZWsoMCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdSZXNldChjdHgsIGJveCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHRhYkZpbGxlcigpIHtcbiAgICByZXR1cm4gRmxleCgwLCAxKS50b3VjaFNpbmsoKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJncmF5XCI7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGVkaXQgPSBuZXcgU2NlbmVFZGl0b3Ioc2NlbmVKU09OKTtcblxuICAgIGNvbnN0IHNjZW5lVUkgPSBNdXgoXG4gICAgICAgIFtcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiXSxcbiAgICAgICAgW1widGVycmFpblwiLCBGaWxsKHNjZW5lSlNPTi50ZXJyYWluKS5vbkRyYXcoZHJhd1RlcnJhaW4pXSxcbiAgICAgICAgW1widHJ1c3NcIiwgVHJ1c3NMYXllcihzY2VuZUpTT04udHJ1c3MpXSxcbiAgICAgICAgW1wiYWRkX3RydXNzXCIsIEFkZFRydXNzTGF5ZXIoZWRpdCldLFxuICAgICAgICBbXCJzaW11bGF0ZVwiLCBTaW11bGF0ZUxheWVyKGVkaXQpXSxcbiAgICApO1xuXG4gICAgY29uc3QgZHJhd1IgPSBkcmF3RmlsbChcInJlZFwiKTtcbiAgICBjb25zdCBkcmF3RyA9IGRyYXdGaWxsKFwiZ3JlZW5cIik7XG4gICAgY29uc3QgZHJhd0IgPSBkcmF3RmlsbChcImJsdWVcIik7XG5cbiAgICBjb25zdCB0b29scyA9IFN3aXRjaChcbiAgICAgICAgMSxcbiAgICAgICAgTGVmdCh1bmRvQnV0dG9uKGVkaXQpLCByZWRvQnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgIExlZnQoZGVja0J1dHRvbihlZGl0KSwgdGFiRmlsbGVyKCkpLFxuICAgICAgICBMZWZ0KHJlc2V0QnV0dG9uKGVkaXQpLCBwbGF5QnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDE2LFxuICAgICAgICApLFxuICAgICAgICBCb3R0b20oXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIHRvb2xzLCAgXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICBMZWZ0KFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd1IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgwLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgZWRpdC5zaW11bGF0b3IoKS5wYXVzZShlYykgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Rykub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDEsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCIpOyBlZGl0LnNpbXVsYXRvcigpLnBhdXNlKGVjKTsgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Qikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2xzLnNldCgyLCBlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwic2ltdWxhdGVcIik7XG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICk7XG4gICAgLy8gVE9ETzogZml4IG1hdGVyaWFsc1xuXG4gICAgLy8gVE9ETzogc2ltdWxhdGlvbiBzdGF0ZSBzdG9yZWQgaW4gZG8vdW5kbyBzdGFja3MuXG5cbiAgICAvLyBUT0RPOiBmaXggdHJhaW4gc2ltdWxhdGlvbiAobWFrZSBzdXJlIHRyYWluIGNhbiBicmVhayBhcGFydCwgbWFrZSBvbmx5IGZyb250IGRpc2sgdHVybiwgYmFjayBkaXNrcyBoYXZlIGxvdyBmcmljdGlvbj8pXG4gICAgLy8gVE9ETzogbW9kZSB3aGVyZSBpZiB0aGUgd2hvbGUgdHJhaW4gbWFrZXMgaXQgYWNyb3NzLCB0aGUgdHJhaW4gdGVsZXBvcnRzIGJhY2sgdG8gdGhlIGJlZ2lubmluZyBhbmQgZ2V0cyBoZWF2aWVyXG4gICAgLy8gVE9ETzogZHJhdyB0cmFpblxuXG4gICAgLy8gVE9ETzogbWF0ZXJpYWwgc2VsZWN0aW9uLiAobWlnaHQgbmVlZCB0ZXh0IGxheW91dCwgd2hpY2ggaXMgYSB3aG9sZSBjYW4gb2Ygd29ybXMuLi4pXG5cbiAgICAvLyBUT0RPOiBzYXZlL2xvYWRcbiAgICAvLyBIYXZlIGxpc3Qgb2YgbGV2ZWxzIGluIHNvbWUgSlNPTiByZXNvdXJjZSBmaWxlLlxuICAgIC8vIEhhdmUgb3B0aW9uIHRvIGxvYWQganNvbiBmaWxlIGZyb20gbG9jYWwuXG4gICAgLy8gYXV0by1zYXZlIGV2ZXJ5IG4gc2Vjb25kcyBhZnRlciBjaGFuZ2UsIGtleSBpbiBsb2NhbCBzdG9yYWdlIGlzIHVyaSBvZiBsZXZlbCBqc29uLlxuICAgIC8vIHdoZW4gbG9hZGluZywgY2hlY2sgbG9jYWwgc3RvcmFnZSBhbmQgbG9hZCB0aGF0IGluc3RlYWQgaWYgaXQgZXhpc3RzIChhbmQgdGhlIG5vbiBlZGl0YWJsZSBwYXJ0cyBtYXRjaD8pXG59XG4iXX0=