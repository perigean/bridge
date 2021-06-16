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
    return Layer(Scroll(Box(sceneJSON.width, sceneJSON.height, sceneUI), undefined, 2), Bottom(Flex(64, 0, tools), Flex(64, 0, Left(Flex(64, 0).onDraw(drawR).onTap((_p, ec) => { tools.set(0, ec); sceneUI.set(ec, "terrain", "truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawG).onTap((_p, ec) => { tools.set(1, ec); sceneUI.set(ec, "terrain", "truss", "add_truss"); edit.simulator().pause(ec); }), Flex(64, 0).onDraw(drawB).onTap((_p, ec) => {
        tools.set(2, ec);
        sceneUI.set(ec, "terrain", "simulate");
        // TODO: simulation state stored in do/undo stacks.
    })))));
    // TODO: save/load
    // Have list of levels in some JSON resource file.
    // Have option to load json file from local.
    // auto-save every n seconds after change, key in local storage is uri of level json.
    // when loading, check local storage and load that instead if it exists (and the non editable parts match?)
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFnQixNQUFNLGNBQWMsQ0FBQztBQTZDbE8sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJ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LEVBQUUsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDLEVBQzNKLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQVcsRUFBRSxFQUFrQixFQUFFLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3pLLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQVcsRUFBRSxFQUFrQixFQUFFLEVBQUU7UUFDaEUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZDLG1EQUFtRDtJQUN2RCxDQUFDLENBQUMsQ0FDTCxDQUNKLENBQ0osQ0FDSixDQUFDO0lBQ0Ysa0JBQWtCO0lBQ2xCLGtEQUFrRDtJQUNsRCw0Q0FBNEM7SUFDNUMscUZBQXFGO0lBQ3JGLDJHQUEyRztBQUMvRyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IENoYXJsZXMgRHVlY2sgMjAyMFxuXG5pbXBvcnQgeyBEZXJpdmF0aXZlIH0gZnJvbSBcIi4vb2RlLmpzXCI7XG5pbXBvcnQgeyBQb2ludDJELCBwb2ludERpc3RhbmNlIH0gZnJvbSBcIi4vcG9pbnQuanNcIjtcbmltcG9ydCB7IFJ1bmdlS3V0dGE0IH0gZnJvbSBcIi4vcms0LmpzXCI7XG5pbXBvcnQgeyBhZGRDaGlsZCwgQm90dG9tLCBCb3gsIEVsZW1lbnRDb250ZXh0LCBGaWxsLCBGbGV4LCBMYXllciwgTGF5b3V0Qm94LCBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0LCBMZWZ0LCBNdXgsIFBhblBvaW50LCBQb3NpdGlvbiwgUG9zaXRpb25MYXlvdXQsIFJlbGF0aXZlLCByZW1vdmVDaGlsZCwgU2Nyb2xsLCBTd2l0Y2gsIFRpbWVySGFuZGxlciB9IGZyb20gXCIuL3VpL25vZGUuanNcIjtcblxuZXhwb3J0IHR5cGUgQmVhbSA9IHtcbiAgICBwMTogbnVtYmVyOyAvLyBJbmRleCBvZiBwaW4gYXQgYmVnaW5uaW5nIG9mIGJlYW0uXG4gICAgcDI6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGVuZCBvZiBiZWFtLlxuICAgIG06IG51bWJlcjsgIC8vIEluZGV4IG9mIG1hdGVyaWFsIG9mIGJlYW0uXG4gICAgdzogbnVtYmVyOyAgLy8gV2lkdGggb2YgYmVhbS5cbiAgICBsPzogbnVtYmVyOyAvLyBMZW5ndGggb2YgYmVhbSwgb25seSBzcGVjaWZpZWQgd2hlbiBwcmUtc3RyYWluaW5nLlxuICAgIGRlY2s/OiBib29sZWFuOyAvLyBJcyB0aGlzIGJlYW0gYSBkZWNrPyAoZG8gZGlzY3MgY29sbGlkZSlcbn07XG5cbnR5cGUgU2ltdWxhdGlvbkJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjtcbiAgICBwMjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbDogbnVtYmVyO1xuICAgIGRlY2s6IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIERpc2MgPSB7XG4gICAgcDogbnVtYmVyOyAgLy8gSW5kZXggb2YgbW92ZWFibGUgcGluIHRoaXMgZGlzYyBzdXJyb3VuZHMuXG4gICAgbTogbnVtYmVyOyAgLy8gTWF0ZXJpYWwgb2YgZGlzYy5cbiAgICByOiBudW1iZXI7ICAvLyBSYWRpdXMgb2YgZGlzYy5cbiAgICB2OiBudW1iZXI7ICAvLyBWZWxvY2l0eSBvZiBzdXJmYWNlIG9mIGRpc2MgKGluIENDVyBkaXJlY3Rpb24pLlxufTtcblxuZXhwb3J0IHR5cGUgTWF0ZXJpYWwgPSB7XG4gICAgRTogbnVtYmVyOyAgLy8gWW91bmcncyBtb2R1bHVzIGluIFBhLlxuICAgIGRlbnNpdHk6IG51bWJlcjsgICAgLy8ga2cvbV4zXG4gICAgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIC8vIFRPRE86IHdoZW4gc3R1ZmYgYnJlYWtzLCB3b3JrIGhhcmRlbmluZywgZXRjLlxufTtcblxuZXhwb3J0IHR5cGUgVHJ1c3MgPSB7XG4gICAgZml4ZWRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBzdGFydFBpbnM6IEFycmF5PFBvaW50MkQ+O1xuICAgIGVkaXRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBzdGFydEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBlZGl0QmVhbXM6IEFycmF5PEJlYW0+O1xuICAgIGRpc2NzOiBBcnJheTxEaXNjPjtcbiAgICBtYXRlcmlhbHM6IEFycmF5PE1hdGVyaWFsPjtcbn07XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0TWF0ZXJpYWwodHJ1c3M6IFRydXNzLCBtOiBudW1iZXIpIHtcbiAgICBjb25zdCBtYXRlcmlhbHMgPSB0cnVzcy5tYXRlcmlhbHM7XG4gICAgaWYgKG0gPCAwIHx8IG0gPj0gbWF0ZXJpYWxzLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbWF0ZXJpYWwgaW5kZXggJHttfWApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJ1c3NBc3NlcnRQaW4odHJ1c3M6IFRydXNzLCBwaW46IG51bWJlcikge1xuICAgIGlmIChwaW4gPCAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCB8fCBwaW4gPj0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJ1c3NCZWFtRXhpc3RzKHRydXNzOiBUcnVzcywgcDE6IG51bWJlciwgcDI6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy5lZGl0QmVhbXMpIHtcbiAgICAgICAgaWYgKChwMSA9PT0gYmVhbS5wMSAmJiBwMiA9PT0gYmVhbS5wMikgfHwgKHAxID09PSBiZWFtLnAyICYmIHAyID09PSBiZWFtLnAxKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBiZWFtIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgaWYgKChwMSA9PT0gYmVhbS5wMSAmJiBwMiA9PT0gYmVhbS5wMikgfHwgKHAxID09PSBiZWFtLnAyICYmIHAyID09PSBiZWFtLnAxKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiB0cnVzc0VkaXRQaW5zQmVnaW4odHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0VuZCh0cnVzczogVHJ1c3MpOiBudW1iZXIge1xuICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnMubGVuZ3RoICsgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zQmVnaW4odHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gLXRydXNzLmZpeGVkUGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzVW5lZGl0YWJsZVBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NNb3ZpbmdQaW5zQ291bnQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NHZXRDbG9zZXN0UGluKHRydXNzOiBUcnVzcywgcDogUG9pbnQyRCwgbWF4ZDogbnVtYmVyLCBiZWFtU3RhcnQ/OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuICAgIC8vIFRPRE86IGFjY2VsZXJhdGlvbiBzdHJ1Y3R1cmVzLiBQcm9iYWJseSBvbmx5IG1hdHRlcnMgb25jZSB3ZSBoYXZlIDEwMDBzIG9mIHBpbnM/XG4gICAgY29uc3QgYmxvY2sgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBsZXQgcmVzID0gdW5kZWZpbmVkO1xuICAgIGxldCByZXNkID0gbWF4ZDtcbiAgICBpZiAoYmVhbVN0YXJ0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgICAgIGlmIChiLnAxID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGIucDIgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cnVzcy5maXhlZFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MuZml4ZWRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpIC0gdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLnN0YXJ0UGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaTtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IHBvaW50RGlzdGFuY2UocCwgdHJ1c3MuZWRpdFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGkgKyB0cnVzcy5zdGFydFBpbnMubGVuZ3RoO1xuICAgICAgICAgICAgcmVzZCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gdHJ1c3NHZXRQaW4odHJ1c3M6IFRydXNzLCBwaW46IG51bWJlcik6IFBvaW50MkQge1xuICAgIGlmIChwaW4gPCAtdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua293biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfSBlbHNlIGlmIChwaW4gPCAwKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5maXhlZFBpbnNbdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCArIHBpbl07XG4gICAgfSBlbHNlIGlmIChwaW4gPCB0cnVzcy5zdGFydFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5zdGFydFBpbnNbcGluXTtcbiAgICB9IGVsc2UgaWYgKHBpbiAtIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggPCB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHRydXNzLmVkaXRQaW5zW3BpbiAtIHRydXNzLnN0YXJ0UGlucy5sZW5ndGhdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rb3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmV4cG9ydCB0eXBlIFRlcnJhaW4gPSB7XG4gICAgaG1hcDogQXJyYXk8bnVtYmVyPjtcbiAgICBmcmljdGlvbjogbnVtYmVyO1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG59O1xuXG50eXBlIFNpbXVsYXRpb25ITWFwID0gQXJyYXk8e1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIG54OiBudW1iZXI7IC8vIE91dHdhcmQgKGRpcmVjdGlvbiBvZiBib3VuY2UpIG5vcm1hbCB1bml0IHZlY3Rvci5cbiAgICBueTogbnVtYmVyO1xuICAgIGRlY2tzOiBBcnJheTxTaW11bGF0aW9uQmVhbT47ICAgLy8gVXBkYXRlZCBldmVyeSBmcmFtZSwgYWxsIGRlY2tzIGFib3ZlIHRoaXMgc2VnbWVudC5cbiAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG59PjtcblxudHlwZSBBZGRCZWFtQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX2JlYW1cIjtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsPzogbnVtYmVyO1xuICAgIGRlY2s/OiBib29sZWFuO1xufTtcblxudHlwZSBBZGRQaW5BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfcGluXCI7XG4gICAgcGluOiBQb2ludDJEO1xufTtcblxudHlwZSBDb21wb3NpdGVBY3Rpb24gPSB7XG4gICAgdHlwZTogXCJjb21wb3NpdGVcIjtcbiAgICBhY3Rpb25zOiBBcnJheTxUcnVzc0FjdGlvbj47XG59O1xuXG50eXBlIFRydXNzQWN0aW9uID0gQWRkQmVhbUFjdGlvbiB8IEFkZFBpbkFjdGlvbiB8IENvbXBvc2l0ZUFjdGlvbjtcblxuXG5leHBvcnQgdHlwZSBTY2VuZUpTT04gPSB7XG4gICAgdHJ1c3M6IFRydXNzO1xuICAgIHRlcnJhaW46IFRlcnJhaW47XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBnOiBQb2ludDJEOyAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgIHJlZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xuICAgIHVuZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufVxuXG5jbGFzcyBTY2VuZVNpbXVsYXRvciB7XG4gICAgcHJpdmF0ZSBtZXRob2Q6IFJ1bmdlS3V0dGE0OyAgICAgICAgICAgICAgICAgICAgLy8gT0RFIHNvbHZlciBtZXRob2QgdXNlZCB0byBzaW11bGF0ZS5cbiAgICBwcml2YXRlIGR5ZHQ6IERlcml2YXRpdmU7ICAgICAgICAgICAgICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIE9ERSBzdGF0ZS5cbiAgICBwcml2YXRlIGg6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaW1lIHN0ZXAuXG4gICAgcHJpdmF0ZSBmaXhlZFBpbnM6IEZsb2F0MzJBcnJheTsgICAgICAgICAgICAgICAgLy8gUG9zaXRpb25zIG9mIGZpeGVkIHBpbnMgW3gwLCB5MCwgeDEsIHkxLCAuLi5dLlxuICAgIHByaXZhdGUgdExhdGVzdDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBoaWdoZXN0IHRpbWUgdmFsdWUgc2ltdWxhdGVkLlxuICAgIHByaXZhdGUga2V5SW50ZXJ2YWw6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgLy8gVGltZSBwZXIga2V5ZnJhbWUuXG4gICAgcHJpdmF0ZSBrZXlmcmFtZXM6IE1hcDxudW1iZXIsIEZsb2F0MzJBcnJheT47ICAgLy8gTWFwIG9mIHRpbWUgdG8gc2F2ZWQgc3RhdGUuXG4gICAgcHJpdmF0ZSBwbGF5VGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIHBsYXlUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBwbGF5VGljazogVGltZXJIYW5kbGVyO1xuXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFNjZW5lSlNPTiwgaDogbnVtYmVyLCBrZXlJbnRlcnZhbDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuaCA9IGg7XG4gICAgICAgIHRoaXMudExhdGVzdCA9IDA7XG4gICAgICAgIHRoaXMua2V5SW50ZXJ2YWwgPSBrZXlJbnRlcnZhbDtcbiAgICAgICAgdGhpcy5rZXlmcmFtZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLnBsYXlUaW1lID0gMDtcbiAgICAgICAgdGhpcy5wbGF5VGljayA9IChtczogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIC8vIE9ubHkgY29tcHV0ZSB1cCB0byAxMDBtcyBvZiBmcmFtZXMgcGVyIHRpY2ssIHRvIGFsbG93IG90aGVyIHRoaW5ncyB0byBoYXBwZW4gaWYgd2UgYXJlIGJlaGluZC5cbiAgICAgICAgICAgIGxldCB0MSA9IE1hdGgubWluKHRoaXMucGxheVRpbWUgKyBtcyAqIDAuMDAxLCB0aGlzLm1ldGhvZC50ICsgMC4xKTtcbiAgICAgICAgICAgIHdoaWxlICh0aGlzLm1ldGhvZC50IDwgdDEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICAgICAgXG4gICAgICAgIC8vIENhY2hlIGZpeGVkIHBpbiB2YWx1ZXMuXG4gICAgICAgIGNvbnN0IGZpeGVkUGlucyA9IG5ldyBGbG9hdDMyQXJyYXkodHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCAqIDIpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZml4ZWRQaW5zW2kgKiAyXSA9IHRydXNzLmZpeGVkUGluc1tpXVswXTtcbiAgICAgICAgICAgIGZpeGVkUGluc1tpICogMiArIDFdID0gdHJ1c3MuZml4ZWRQaW5zW2ldWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZml4ZWRQaW5zID0gZml4ZWRQaW5zO1xuXG4gICAgICAgIC8vIENhY2hlIEJlYW0gdmFsdWVzLlxuICAgICAgICBjb25zdCBiZWFtczogQXJyYXk8U2ltdWxhdGlvbkJlYW0+ID0gWy4uLnRydXNzLnN0YXJ0QmVhbXMsIC4uLnRydXNzLmVkaXRCZWFtc10ubWFwKGIgPT4gKHtcbiAgICAgICAgICAgIHAxOiBiLnAxLFxuICAgICAgICAgICAgcDI6IGIucDIsXG4gICAgICAgICAgICBtOiBiLm0sXG4gICAgICAgICAgICB3OiBiLncsXG4gICAgICAgICAgICBsOiBiLmwgIT09IHVuZGVmaW5lZCA/IGIubCA6IHBvaW50RGlzdGFuY2UodHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMikpLFxuICAgICAgICAgICAgZGVjazogYi5kZWNrICE9PSB1bmRlZmluZWQgPyBiLmRlY2sgOiBmYWxzZSxcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIC8vIENhY2hlIGRpc2NzLlxuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzOyAgLy8gVE9ETzogZG8gd2UgZXZlciB3bmF0IHRvIG11dGF0ZSBkaXNjcz9cblxuICAgICAgICAvLyBDYWNoZSBtYXRlcmlhbHMuXG4gICAgICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFsczsgIC8vIFRPRE86IGRvIHdlIGV2ZXIgd2FudCB0byBtdXRhdGUgbWF0ZXJpYWxzP1xuXG4gICAgICAgIC8vIENvbXB1dGUgdGhlIG1hc3Mgb2YgYWxsIHBpbnMuXG4gICAgICAgIGNvbnN0IG1vdmluZ1BpbnMgPSB0cnVzc01vdmluZ1BpbnNDb3VudCh0cnVzcyk7XG4gICAgICAgIGNvbnN0IG1hc3MgPSBuZXcgRmxvYXQzMkFycmF5KG1vdmluZ1BpbnMpO1xuICAgICAgICBmdW5jdGlvbiBhZGRNYXNzKHBpbjogbnVtYmVyLCBtOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgLy8gRml4ZWQgcGlucyBhbHJlYWR5IGhhdmUgaW5maW5pdGUgbWFzcy5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXNzW3Bpbl0gKz0gbTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBiLmwgKiBiLncgKiBtYXRlcmlhbHNbYi5tXS5kZW5zaXR5O1xuICAgICAgICAgICAgLy8gRGlzdHJpYnV0ZSB0aGUgbWFzcyBiZXR3ZWVuIHRoZSB0d28gZW5kIHBpbnMuXG4gICAgICAgICAgICAvLyBUT0RPOiBkbyBwcm9wZXIgbWFzcyBtb21lbnQgb2YgaW50ZXJ0aWEgY2FsY3VsYXRpb24gd2hlbiByb3RhdGluZyBiZWFtcz9cbiAgICAgICAgICAgIGFkZE1hc3MoYi5wMSwgbSAqIDAuNSk7XG4gICAgICAgICAgICBhZGRNYXNzKGIucDIsIG0gKiAwLjUpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZCBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgbSA9IGQuciAqIGQuciAqIE1hdGguUEkgKiBtYXRlcmlhbHNbZC5tXS5kZW5zaXR5O1xuICAgICAgICAgICAgYWRkTWFzcyhkLnAsIG0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENoZWNrIHRoYXQgZXZlcnl0aGluZyB0aGF0IGNhbiBtb3ZlIGhhcyBzb21lIG1hc3MuXG4gICAgICAgIGZvciAoY29uc3QgbSBvZiBtYXNzKSB7XG4gICAgICAgICAgICBpZiAobSA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibWFzcyAwIHBpbiBkZXRlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhY2hlIHRoZSB0ZXJyYWluLCBzZXQgdXAgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZSBmb3IgZGVjayBpbnRlcnNlY3Rpb25zLlxuICAgICAgICBjb25zdCB0RnJpY3Rpb24gPSBzY2VuZS50ZXJyYWluLmZyaWN0aW9uO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBzY2VuZS5oZWlnaHQ7XG4gICAgICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgICAgIGlmIChpICsgMSA+PSBzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgICAgICBueDogMC4wLFxuICAgICAgICAgICAgICAgICAgICBueTotMS4wLFxuICAgICAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gaDtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHkgKiBkeSArIHBpdGNoICogcGl0Y2gpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgbng6IGR5IC8gbCxcbiAgICAgICAgICAgICAgICBueTogLXBpdGNoIC8gbCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZ1bmN0aW9uIGhtYXBBZGREZWNrKGk6IG51bWJlciwgZDogU2ltdWxhdGlvbkJlYW0pIHtcbiAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaCA9IGhtYXBbaV07XG4gICAgICAgICAgICBoLmRlY2tzW2guZGVja0NvdW50XSA9IGQ7XG4gICAgICAgICAgICBoLmRlY2tDb3VudCsrO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICAgICAgY29uc3QgdkluZGV4ID0gbW92aW5nUGlucyAqIDI7XG4gICAgICAgIGZ1bmN0aW9uIGdldGR4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW4gKiAyXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW4gKiAyICsgMV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbdkluZGV4ICsgcGluICogMl07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB5W3ZJbmRleCArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3BpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVt2SW5kZXggKyBwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0dnkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbdkluZGV4ICsgcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGZvcmNlKGR5ZHQ6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIGZ4OiBudW1iZXIsIGZ5OiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBtYXNzW3Bpbl07XG4gICAgICAgICAgICAgICAgZHlkdFt2SW5kZXggKyBwaW4gKiAyICsgMF0gKz0gZnggLyBtO1xuICAgICAgICAgICAgICAgIGR5ZHRbdkluZGV4ICsgcGluICogMiArIDFdICs9IGZ5IC8gbTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCB1cCBpbml0aWFsIE9ERSBzdGF0ZS4gTkI6IHZlbG9jaXRpZXMgYXJlIGFsbCB6ZXJvLlxuICAgICAgICBjb25zdCB5MCA9IG5ldyBGbG9hdDMyQXJyYXkobW92aW5nUGlucyAqIDQpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZCA9IHRydXNzR2V0UGluKHRydXNzLCBpKTtcbiAgICAgICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgICAgIHNldGR5KHkwLCBpLCBkWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhY2hlIGFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgY29uc3QgZyA9IHNjZW5lLmc7XG5cbiAgICAgICAgdGhpcy5keWR0ID0gZnVuY3Rpb24gZHlkeShfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAgICAgLy8gRGVyaXZhdGl2ZSBvZiBwb3NpdGlvbiBpcyB2ZWxvY2l0eS5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgICAgIHNldGR5KGR5ZHQsIGksIGdldHZ5KHksIGkpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdKTtcbiAgICAgICAgICAgICAgICBzZXR2eShkeWR0LCBpLCBnWzFdKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRGVja3MgYXJlIHVwZGF0ZWQgaW4gaG1hcCBpbiB0aGUgYmVsb3cgbG9vcCB0aHJvdWdoIGJlYW1zLCBzbyBjbGVhciB0aGUgcHJldmlvdXMgdmFsdWVzLlxuICAgICAgICAgICAgZm9yIChjb25zdCBoIG9mIGhtYXApIHtcbiAgICAgICAgICAgICAgICBoLmRlY2tDb3VudCA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gYmVhbSBzdHJlc3MuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgICAgIGlmIChwMSA8IDAgJiYgcDIgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEJvdGggZW5kcyBhcmUgbm90IG1vdmVhYmxlLlxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgRSA9IG1hdGVyaWFsc1tiZWFtLm1dLkU7XG4gICAgICAgICAgICAgICAgY29uc3QgdyA9IGJlYW0udztcbiAgICAgICAgICAgICAgICBjb25zdCBsMCA9IGJlYW0ubDtcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIHAyKSAtIGdldGR4KHksIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIHAyKSAtIGdldGR5KHksIHAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbiAgICAgICAgICAgICAgICBjb25zdCBrID0gRSAqIHcgLyBsMDtcbiAgICAgICAgICAgICAgICBjb25zdCBzcHJpbmdGID0gKGwgLSBsMCkgKiBrO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV4ID0gZHggLyBsOyAgICAgIC8vIFVuaXQgdmVjdG9yIGluIGRpcmVjdGlubyBvZiBiZWFtO1xuICAgICAgICAgICAgICAgIGNvbnN0IHV5ID0gZHkgLyBsO1xuXG4gICAgICAgICAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDEsIHV4ICogc3ByaW5nRiwgdXkgKiBzcHJpbmdGKTtcbiAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMiwgLXV4ICogc3ByaW5nRiwgLXV5ICogc3ByaW5nRik7XG5cbiAgICAgICAgICAgICAgICAvLyBEYW1waW5nIGZvcmNlLlxuICAgICAgICAgICAgICAgIGNvbnN0IHpldGEgPSAwLjU7XG4gICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBwMikgLSBnZXR2eCh5LCBwMSk7IC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxLlxuICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgcDIpIC0gZ2V0dnkoeSwgcDEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHYgPSB2eCAqIHV4ICsgdnkgKiB1eTsgICAgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEgaW4gZGlyZWN0aW9uIG9mIGJlYW0uXG4gICAgICAgICAgICAgICAgaWYgKHAxID49IDAgJiYgcDIgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMSA9IG1hc3NbcDFdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMiA9IG1hc3NbcDJdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMSAqIG0yIC8gKG0xICsgbTIpKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDEsIHV4ICogZGFtcEYsIHV5ICogZGFtcEYpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMiwgLXV4ICogZGFtcEYsIC11eSAqIGRhbXBGKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHAxID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTEgPSBtYXNzW3AxXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEpO1xuICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBwMSwgdXggKiBkYW1wRiwgdXkgKiBkYW1wRik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwMiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0yID0gbWFzc1twMl07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0yKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDIsIC11eCAqIGRhbXBGLCAtdXkgKiBkYW1wRik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQWRkIGRlY2tzIHRvIGFjY2xlcmF0aW9uIHN0cnVjdHVyZVxuICAgICAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldGR4KHksIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKGdldGR4KHksIHAyKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1heChpMSwgaTIpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhtYXBBZGREZWNrKGksIGJlYW0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIHRlcnJhaW4gY29sbGlzaW9uXG4gICAgICAgICAgICAvLyBUT0RPOiBzY2VuZSBib3JkZXIgY29sbGlzaW9uXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBtYXNzW2ldO1xuICAgICAgICAgICAgICAgIGxldCBib3VuY2VGID0gMTAwMC4wICogbTsgLy8gQWNjZWxlcmF0aW9uIHBlciBtZXRyZSBvZiBkZXB0aCB1bmRlciB0ZXJyYWluLlxuICAgICAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbCAoZGlyZWN0aW9uIG9mIGFjY2VsZXJhdGlvbikuXG4gICAgICAgICAgICAgICAgbGV0IG55O1xuICAgICAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICBueCA9IDAuMDtcbiAgICAgICAgICAgICAgICAgICAgbnkgPSAtMS4wO1xuICAgICAgICAgICAgICAgICAgICBib3VuY2VGICo9IGR5IC0gaGVpZ2h0ICsgaG1hcFswXS5oZWlnaHQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGkgPSBNYXRoLm1pbihobWFwLmxlbmd0aCAtIDEsIE1hdGguZmxvb3IoZHggLyBwaXRjaCkpO1xuICAgICAgICAgICAgICAgICAgICBueCA9IGhtYXBbdGldLm54O1xuICAgICAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgICAgICAvLyBEaXN0YW5jZSBiZWxvdyB0ZXJyYWluIGlzIG5vcm1hbCBkb3QgdmVjdG9yIGZyb20gdGVycmFpbiB0byBwb2ludC5cbiAgICAgICAgICAgICAgICAgICAgYm91bmNlRiAqPSAtKG54ICogKGR4IC0gdGkgKiBwaXRjaCkgKyBueSAqIChkeSAtIGhtYXBbdGldLmhlaWdodCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoYm91bmNlRiA8PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBib3VuY2luZy5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGksIG54ICogYm91bmNlRiwgbnkgKiBib3VuY2VGKTtcblxuICAgICAgICAgICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbiBpbiBwcm9wb3J0aW9uIHRvIGF0LCBpbiBkaXJlY3Rpb24gb3Bwb3NpdGUgb2YgdGFuZ2VudCBwcm9qZWN0ZWQgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdHYgPSB2eCAqIHR4ICsgdnkgKiB0eTtcbiAgICAgICAgICAgICAgICBsZXQgZnJpY3Rpb25GID0gdEZyaWN0aW9uICogYm91bmNlRiAqICh0diA+IDAgPyAtMSA6IDEpO1xuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGksIHR4ICogZnJpY3Rpb25GLCB0eSAqIGZyaWN0aW9uRik7XG5cbiAgICAgICAgICAgICAgICAvLyBPbGQgQ29kZVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHdoeSBkaWQgdGhpcyBuZWVkIHRvIGNhcCB0aGUgYWNjZWxlcmF0aW9uPyBtYXliZSBib3VuY2UgZm9yY2UgaXMgdG9vIGhpZ2g/XG4gICAgICAgICAgICAgICAgLy9jb25zdCBhZiA9IE1hdGgubWluKHRGcmljdGlvbiAqIGF0LCBNYXRoLmFicyh0diAqIDEwMCkpICogKHR2ID49IDAuMCA/IC0xLjAgOiAxLjApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gVE9ETzogZGlzY3NcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWV0aG9kID0gbmV3IFJ1bmdlS3V0dGE0KHkwLCB0aGlzLmR5ZHQpO1xuICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5tZXRob2QudCwgbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1ldGhvZC55KSk7XG4gICAgfVxuXG4gICAgc2Vla1RpbWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8bnVtYmVyPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmtleWZyYW1lcy5rZXlzKCk7XG4gICAgfVxuXG4gICAgc2Vlayh0OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB5ID0gdGhpcy5rZXlmcmFtZXMuZ2V0KHQpO1xuICAgICAgICBpZiAoeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dH0gaXMgbm90IGEga2V5ZnJhbWUgdGltZWApO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgeS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5tZXRob2QueVtpXSA9IHlbaV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tZXRob2QudCA9IHQ7XG5cbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5wbGF5KGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRpbWUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWV0aG9kLnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBuZXh0KCkgeyAgICAvLyBUT0RPOiBtYWtlIHRoaXMgcHJpdmF0ZT9cbiAgICAgICAgY29uc3QgcHJldlQgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB0aGlzLm1ldGhvZC5uZXh0KHRoaXMuaCk7XG4gICAgICAgIGNvbnN0IGlzS2V5ZnJhbWUgPSBNYXRoLmZsb29yKHByZXZUIC8gdGhpcy5rZXlJbnRlcnZhbCkgIT09IE1hdGguZmxvb3IodGhpcy5tZXRob2QudCAvIHRoaXMua2V5SW50ZXJ2YWwpO1xuICAgICAgICBpZiAodGhpcy50TGF0ZXN0IDwgdGhpcy5tZXRob2QudCkge1xuICAgICAgICAgICAgaWYgKGlzS2V5ZnJhbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5tZXRob2QudCwgbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1ldGhvZC55KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRMYXRlc3QgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB9IGVsc2UgaWYgKGlzS2V5ZnJhbWUpIHtcbiAgICAgICAgICAgIGNvbnN0IHkgPSB0aGlzLmtleWZyYW1lcy5nZXQodGhpcy5tZXRob2QudCk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGZyYW1lICR7dGhpcy5tZXRob2QudH0gc2hvdWxkIGJlIGEga2V5ZnJhbWVgKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgZGlmZiA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHlbaV0gIT09IHRoaXMubWV0aG9kLnlbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGlmZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRpZmYpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUmVwbGF5aW5nIGZyYW1lICR7dGhpcy5tZXRob2QudH0gcHJvZHVjZWQgYSBkaWZmZXJlbmNlIWApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUmVwbGF5aW5nIGZyYW1lICR7dGhpcy5tZXRob2QudH0gcHJvZHVjZWQgdGhlIHNhbWUgc3RhdGVgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBsYXlpbmcoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHBsYXkoZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wbGF5VGltZSA9IHRoaXMubWV0aG9kLnQ7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gZWMudGltZXIodGhpcy5wbGF5VGljaywgdW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBwYXVzZShlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBlYy5jbGVhclRpbWVyKHRoaXMucGxheVRpbWVyKTtcbiAgICAgICAgdGhpcy5wbGF5VGltZXIgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZ2V0UGluKHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICBjb25zdCBpID0gdGhpcy5maXhlZFBpbnMubGVuZ3RoICsgcGluICogMjtcbiAgICAgICAgICAgIHJldHVybiBbdGhpcy5maXhlZFBpbnNbaV0sIHRoaXMuZml4ZWRQaW5zW2krMV1dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaSA9IHBpbiAqIDI7XG4gICAgICAgICAgICBjb25zdCB5ID0gdGhpcy5tZXRob2QueTtcbiAgICAgICAgICAgIHJldHVybiBbeVtpXSwgeVtpKzFdXTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbnR5cGUgT25BZGRQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPblJlbW92ZVBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZUVkaXRvciB7XG4gICAgc2NlbmU6IFNjZW5lSlNPTjtcbiAgICBwcml2YXRlIHNpbTogU2NlbmVTaW11bGF0b3IgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBvbkFkZFBpbkhhbmRsZXJzOiBBcnJheTxPbkFkZFBpbkhhbmRsZXI+O1xuICAgIHByaXZhdGUgb25SZW1vdmVQaW5IYW5kbGVyczogQXJyYXk8T25SZW1vdmVQaW5IYW5kbGVyPjtcbiAgICBlZGl0TWF0ZXJpYWw6IG51bWJlcjtcbiAgICBlZGl0V2lkdGg6IG51bWJlcjtcbiAgICBlZGl0RGVjazogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04pIHtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICAvLyBUT0RPOiBwcm9wZXIgaW5pdGlhbGl6YXRpb247XG4gICAgICAgIHRoaXMuZWRpdE1hdGVyaWFsID0gMDtcbiAgICAgICAgdGhpcy5lZGl0V2lkdGggPSA0O1xuICAgICAgICB0aGlzLmVkaXREZWNrID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzaW11bGF0b3IoKTogU2NlbmVTaW11bGF0b3Ige1xuICAgICAgICBpZiAodGhpcy5zaW0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zaW0gPSBuZXcgU2NlbmVTaW11bGF0b3IodGhpcy5zY2VuZSwgMC4wMDEsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNpbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwMSA9IGEucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYS5wMjtcbiAgICAgICAgY29uc3QgbSA9IGEubTtcbiAgICAgICAgY29uc3QgdyA9IGEudztcbiAgICAgICAgY29uc3QgbCA9IGEubDtcbiAgICAgICAgY29uc3QgZGVjayA9IGEuZGVjaztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzcywgbSk7XG4gICAgICAgIGlmICh3IDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIHdpZHRoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke3d9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGwgIT09IHVuZGVmaW5lZCAmJiBsIDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGxlbmd0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHtsfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHAxLCBwMikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBiZXR3ZWVuIHBpbnMgJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ1c3MuZWRpdEJlYW1zLnB1c2goe3AxLCBwMiwgbSwgdywgbCwgZGVja30pO1xuICAgICAgICBcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSB1bmRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBiID0gdHJ1c3MuZWRpdEJlYW1zLnBvcCgpO1xuICAgICAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGJlYW1zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGIucDEgIT09IGEucDEgfHwgYi5wMiAhPT0gYS5wMiB8fCBiLm0gIT09IGEubSB8fCBiLncgIT0gYS53IHx8IGIubCAhPT0gYS5sIHx8IGIuZGVjayAhPT0gYS5kZWNrKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JlYW0gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIHRydXNzLmVkaXRQaW5zLnB1c2goYS5waW4pO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vbkFkZFBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwID0gdHJ1c3MuZWRpdFBpbnMucG9wKCk7XG4gICAgICAgIGlmIChwID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcGlucyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwWzBdICE9PSBhLnBpblswXSB8fCBwWzFdICE9PSBhLnBpblsxXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQaW4gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IGEuYWN0aW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTY2VuZSBlbnVtZXJhdGlvbi9vYnNlcnZhdGlvbiBtZXRob2RzXG5cbiAgICBvbkFkZFBpbihoYW5kbGVyOiBPbkFkZFBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgb25SZW1vdmVQaW4oaGFuZGxlcjogT25SZW1vdmVQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IENsZWFyIGhhbmRsZXJzP1xuXG4gICAgdW5kb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnVuZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgcmVkb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnJlZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgbXV0YXRpb24gbWV0aG9kc1xuXG4gICAgdW5kbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUudW5kb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gdW5kb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICAvLyBUT0RPOiB1cGRhdGUgc2ltdWxhdG9yIHdpdGggc2F2ZWQgc3RhdGUuXG4gICAgICAgIGlmICh0aGlzLnNpbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNpbS5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnJlZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHJlZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUudW5kb1N0YWNrLnB1c2goYSk7XG4gICAgICAgIC8vIFRPRE86IHVwZGF0ZSBzaW11bGF0b3Igd2l0aCBzYXZlZCBzdGF0ZS5cbiAgICAgICAgaWYgKHRoaXMuc2ltICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltLnBhdXNlKGVjKTtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjayA9IFthXTtcbiAgICAgICAgdGhpcy5yZWRvKGVjKTsgICAgLy8gVE9ETzogSXMgdGhpcyB0b28gY2xldmVyP1xuICAgIH1cblxuICAgIGFkZEJlYW0oXG4gICAgICAgIHAxOiBudW1iZXIsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9uKHtcbiAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICB9LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluKHBpbjogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImFkZF9waW5cIiwgcGlufSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbkFuZEJlYW0oXG4gICAgICAgIHBpbjogUG9pbnQyRCxcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGNvbnN0IHAxID0gdGhpcy5zY2VuZS50cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImNvbXBvc2l0ZVwiLCBhY3Rpb25zOiBbXG4gICAgICAgICAgICB7IHR5cGU6IFwiYWRkX3BpblwiLCBwaW59LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgICAgICBwMSxcbiAgICAgICAgICAgICAgICBwMixcbiAgICAgICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgICAgICB3OiB0aGlzLmVkaXRXaWR0aCxcbiAgICAgICAgICAgICAgICBsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICAgICAgfSxcbiAgICAgICAgXX0sIGVjKTtcbiAgICB9XG59O1xuXG4vKlxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lTWV0aG9kKHNjZW5lOiBTY2VuZSk6IE9ERU1ldGhvZCB7XG4gICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICBcbiAgICBjb25zdCBmaXhlZFBpbnMgPSB0cnVzcy5maXhlZFBpbnM7XG4gICAgY29uc3QgbW9iaWxlUGlucyA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgLy8gU3RhdGUgYWNjZXNzb3JzXG4gICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzBdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIGZpeGVkUGluc1tmaXhlZFBpbnMubGVuZ3RoICsgcGluXVsxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W3BpbiAqIDIgKyAxXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiAwLjA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXTsgXG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W3BpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkdngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdICs9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMV0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFNwbGl0IGJlYW0gbWFzcyBldmVubHkgYmV0d2VlbiBwaW5zLCBpbml0aWFsaXNlIGJlYW0gbGVuZ3RoLlxuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBjb25zdCBtYXNzID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zKTtcbiAgICBmdW5jdGlvbiBnZXRtKHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXNzW3Bpbl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gNS45NzJlMjQ7ICAgIC8vIE1hc3Mgb2YgdGhlIEVhcnRoLlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYmVhbXMgPSBbLi4udHJ1c3Muc3RhcnRCZWFtcywgLi4udHJ1c3MuZWRpdEJlYW1zXS5tYXAoKGJlYW06IEJlYW0pOiBTaW11bGF0aW9uQmVhbSA9PiB7XG4gICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICBjb25zdCBsID0gcG9pbnREaXN0YW5jZShzY2VuZS5nZXRQaW4ocDEpLCBzY2VuZS5nZXRQaW4ocDIpKTtcbiAgICAgICAgY29uc3QgbSA9IGwgKiBiZWFtLncgKiBtYXRlcmlhbHNbYmVhbS5tXS5kZW5zaXR5O1xuICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICBtYXNzW3AxXSArPSBtICogMC41O1xuICAgICAgICB9XG4gICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDJdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgcDEsIHAyLCBtOiBiZWFtLm0sIHc6IGJlYW0udywgbDogYmVhbS5sIHx8IGwsIGRlY2s6IGJlYW0uZGVjayB8fCBmYWxzZSB9O1xuICAgIH0pO1xuXG4gICAgLy8gRGlzYyBtYXNzLlxuICAgIGNvbnN0IGRpc2NzID0gc2NlbmUudHJ1c3MuZGlzY3M7XG4gICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgIGlmIChkaXNjLnAgPj0gbW9iaWxlUGlucykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGlzYyBhdHRhY2hlZCB0byBub24gbW9iaWxlIHBpblwiKTtcbiAgICAgICAgfVxuICAgICAgICBtYXNzW2Rpc2MucF0gKz0gZGlzYy5yICogZGlzYy5yICogTWF0aC5QSSAqIG1hdGVyaWFsc1tkaXNjLm1dLmRlbnNpdHk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdGhhdCBldmVyeXRoaW5nIHRoYXQgY2FuIG1vdmUgaGFzIHNvbWUgbWFzcy5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBpZiAobWFzc1tpXSA8PSAwLjApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTW9iaWxlIHBpbiAke2l9IGhhcyBtYXNzICR7bWFzc1tpXX0gPD0gMC4wYCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBwaXRjaCA9IHNjZW5lLndpZHRoIC8gKHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgaWYgKGkgKyAxID49IHNjZW5lLnRlcnJhaW4uaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgIG54OiAwLjAsXG4gICAgICAgICAgICAgICAgbnk6IDEuMCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkeSA9IHNjZW5lLnRlcnJhaW4uaG1hcFtpICsgMV0gLSBoO1xuICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KGR5ICogZHkgKyBwaXRjaCAqIHBpdGNoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhlaWdodDogaCxcbiAgICAgICAgICAgIG54OiAtZHkgLyBsLFxuICAgICAgICAgICAgbnk6IHBpdGNoIC8gbCxcbiAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBmdW5jdGlvbiByZXNldERlY2tzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgaC5kZWNrQ291bnQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZERlY2soaTogbnVtYmVyLCBkOiBTaW11bGF0aW9uQmVhbSkge1xuICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICBoLmRlY2tzW2guZGVja0NvdW50XSA9IGQ7XG4gICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgfVxuICAgIGNvbnN0IHRGcmljdGlvbiA9IHNjZW5lLnRlcnJhaW4uZnJpY3Rpb247XG5cbiAgICAvLyBTZXQgdXAgaW5pdGlhbCBPREUgc3RhdGUgdmVjdG9yLlxuICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb2JpbGVQaW5zICogNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgY29uc3QgZCA9IGdldFBpbih0cnVzcywgaSk7XG4gICAgICAgIHNldGR4KHkwLCBpLCBkWzBdKTtcbiAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgIH1cbiAgICAvLyBOQjogSW5pdGlhbCB2ZWxvY2l0aWVzIGFyZSBhbGwgMCwgbm8gbmVlZCB0byBpbml0aWFsaXplLlxuXG4gICAgY29uc3QgZyA9ICBzY2VuZS5nO1xuICAgIHJldHVybiBuZXcgUnVuZ2VLdXR0YTQoeTAsIGZ1bmN0aW9uIChfdDogbnVtYmVyLCB5OiBGbG9hdDMyQXJyYXksIGR5ZHQ6IEZsb2F0MzJBcnJheSkge1xuICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0ZHgoZHlkdCwgaSwgZ2V0dngoeSwgaSkpO1xuICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gZ3Jhdml0eS5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIHNldHZ4KGR5ZHQsIGksIGdbMF0pO1xuICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgIHJlc2V0RGVja3MoKTtcblxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGJlYW0gc3RyZXNzLlxuICAgICAgICBmb3IgKGNvbnN0IGJlYW0gb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgY29uc3QgdyA9IGJlYW0udztcbiAgICAgICAgICAgIGNvbnN0IGwwID0gYmVhbS5sO1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIHAyKSAtIGdldGR5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJhaW4gPSAobCAtIGwwKSAvIGwwO1xuICAgICAgICAgICAgLy9jb25zdCBzdHJlc3MgPSBzdHJhaW4gKiBFICogdztcbiAgICAgICAgICAgIGNvbnN0IGsgPSBFICogdyAvIGwwO1xuICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShwMSk7ICAgIC8vIFBpbiBtYXNzXG4gICAgICAgICAgICBjb25zdCBtMiA9IGdldG0ocDIpO1xuICAgICAgICAgICAgY29uc3QgdXggPSBkeCAvIGw7ICAgICAgLy8gVW5pdCB2ZWN0b3IgaW4gZGlyZWN0aW5vIG9mIGJlYW07XG4gICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgLy8gQmVhbSBzdHJlc3MgZm9yY2UuXG4gICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogc3ByaW5nRiAvIG0xKTtcbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBzcHJpbmdGIC8gbTIpO1xuICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDIsIC11eSAqIHNwcmluZ0YgLyBtMik7XG5cbiAgICAgICAgICAgIC8vIERhbXBpbmcgZm9yY2UuXG4gICAgICAgICAgICBjb25zdCB6ZXRhID0gMC41O1xuICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBwMikgLSBnZXR2eCh5LCBwMSk7IC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxLlxuICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBwMikgLSBnZXR2eSh5LCBwMSk7XG4gICAgICAgICAgICBjb25zdCB2ID0gdnggKiB1eCArIHZ5ICogdXk7ICAgIC8vIFZlbG9jaXR5IG9mIHAyIHJlbGF0aXZlIHRvIHAxIGluIGRpcmVjdGlvbiBvZiBiZWFtLlxuICAgICAgICAgICAgLy8gVE9ETzogbm93IHRoYXQgZ2V0bSByZXR1cm5zIG1hc3Mgb2YgRWFydGggZm9yIGZpeGVkIHBpbnMsIHdlIGRvbid0IG5lZWQgdGhlc2UgZGlmZmVyZW50IGlmIGNsYXVzZXMuXG4gICAgICAgICAgICBpZiAocDEgPCBtb2JpbGVQaW5zICYmIHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xICogbTIgLyAobTEgKyBtMikpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAxIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhbXBGID0gdiAqIHpldGEgKiBNYXRoLnNxcnQoayAqIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBwMSwgdXggKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBkYW1wRiAvIG0xKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAyLCAtdXggKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogZGFtcEYgLyBtMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBkZWNrcyB0byBhY2NsZXJhdGlvbiBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoZ2V0ZHgoeSwgcDEpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZCA9IE1hdGgubWF4KGkxLCBpMik7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZERlY2soaSwgYmVhbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gdGVycmFpbiBjb2xsaXNpb24sIHNjZW5lIGJvcmRlciBjb2xsaXNpb25cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb2JpbGVQaW5zOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgaSk7XG4gICAgICAgICAgICBsZXQgYXQgPSAxMDAwLjA7IC8vIEFjY2VsZXJhdGlvbiBwZXIgbWV0cmUgb2YgZGVwdGggdW5kZXIgdGVycmFpbi5cbiAgICAgICAgICAgIGxldCBueDsgLy8gVGVycmFpbiB1bml0IG5vcm1hbC5cbiAgICAgICAgICAgIGxldCBueTtcbiAgICAgICAgICAgIGlmIChkeCA8IDAuMCkge1xuICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgIG55ID0gMS4wO1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSAwLjApICsgbnkgKiAoZHkgLSBobWFwWzBdLmhlaWdodCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgbnggPSBobWFwW3RpXS5ueDtcbiAgICAgICAgICAgICAgICBueSA9IGhtYXBbdGldLm55O1xuICAgICAgICAgICAgICAgIGF0ICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYXQgPiAwLjApIHtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCBueCAqIGF0KTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCBueSAqIGF0KTtcbiAgICAgICAgICAgICAgICAvLyBGcmljdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb24gaW4gcHJvcG9ydGlvbiB0byBhdCwgaW4gZGlyZWN0aW9uIG9wcG9zaXRlIG9mIHRhbmdlbnQgcHJvamVjdGVkIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgIC8vIENhcCBhY2NlbGVyYXRpb24gYnkgc29tZSBmcmFjdGlvbiBvZiB2ZWxvY2l0eVxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHRha2UgZnJpY3Rpb24gZnJvbSBiZWFtcyB0b28gKGp1c3QgYXZlcmFnZSBiZWFtcyBnb2luZyBpbnRvIHBpbj8pXG4gICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IGdldHZ4KHksIGkpICogdHggKyBnZXR2eSh5LCBpKSAqIHR5O1xuICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgaSwgdHggKiBhZik7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgaSwgdHkgKiBhZik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBkaXNjLWRlY2sgY29sbGlzaW9uLlxuICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBkaXNjLnI7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIGRpc2MucCk7XG4gICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGhtYXAgYnVja2V0cyB0aGF0IGRpc2Mgb3ZlcmxhcHMuXG4gICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBjb25zdCBpMiA9IE1hdGguZmxvb3IoKGR4ICsgcikgLyBwaXRjaCk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaTE7IGkgPD0gaTI7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBMb29wIHRocm91Z2ggYWxsIGRlY2tzIGluIHRob3NlIGJ1Y2tldHMuXG4gICAgICAgICAgICAgICAgY29uc3QgZGVja3MgPSBobWFwW2ldLmRlY2tzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tDb3VudCA9IGhtYXBbaV0uZGVja0NvdW50O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGVja0NvdW50OyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVjayA9IGRlY2tzW2pdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgxID0gZ2V0ZHgoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkxID0gZ2V0ZHkoeSwgZGVjay5wMSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHgyID0gZ2V0ZHgoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHkyID0gZ2V0ZHkoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeCA9IHgyIC0geDE7IC8vIFZlY3RvciB0byBlbmQgb2YgZGVjayAoZnJvbSBzdGFydClcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3kgPSB5MiAtIHkxO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeSA9IGR5IC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBzeCAqIHN4ICsgc3kgKiBzeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gY3ggKiBjeCArIGN5ICogY3kgLSByICogcjtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgRCA9IGIgKiBiIC0gNC4wICogYSAqIGM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gTm8gUmVhbCBzb2x1dGlvbnMgdG8gaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gLWIgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0MSA9ICgtYiAtIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQyID0gKC1iICsgcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKHQxIDw9IDAuMCAmJiB0MiA8PSAwLjApIHx8ICh0MSA+PSAxLjAgJiYgdDIgPj0gMC4wKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gSW50ZXJzZWN0aW9ucyBhcmUgYm90aCBiZWZvcmUgb3IgYWZ0ZXIgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0MSA9IE1hdGgubWF4KHQxLCAwLjApO1xuICAgICAgICAgICAgICAgICAgICB0MiA9IE1hdGgubWluKHQyLCAxLjApO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgY29sbGlzaW9uIGFjY2VsZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGlzIHByb3BvcnRpb25hbCB0byBhcmVhICdzaGFkb3dlZCcgaW4gdGhlIGRpc2MgYnkgdGhlIGludGVyc2VjdGluZyBkZWNrLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHNvIHRoYXQgYXMgYSBkaXNjIG1vdmVzIGJldHdlZW4gdHdvIGRlY2sgc2VnbWVudHMsIHRoZSBhY2NlbGVyYXRpb24gcmVtYWlucyBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF4ID0gKDEgLSB0MSkgKiB4MSArIHQxICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQxIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDF5ID0gKDEgLSB0MSkgKiB5MSArIHQxICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ4ID0gKDEgLSB0MikgKiB4MSArIHQyICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQyIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ5ID0gKDEgLSB0MikgKiB5MSArIHQyICogeTIgLSBkeTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGEgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHQxeSwgdDF4KSAtIE1hdGguYXRhbjIodDJ5LCB0MngpKSAlIE1hdGguUEk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZWEgPSAwLjUgKiByICogciAqIHRhIC0gMC41ICogTWF0aC5hYnModDF4ICogdDJ5IC0gdDF5ICogdDJ4KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW4gPSAxMDAwLjAgKiBhcmVhOyAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgd2hhdCBhY2NlbGVyYXRpb24gdG8gdXNlXG4gICAgICAgICAgICAgICAgICAgIGxldCBueCA9IGN4IC0gc3ggKiB0O1xuICAgICAgICAgICAgICAgICAgICBsZXQgbnkgPSBjeSAtIHN5ICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgICAgIG54IC89IGw7XG4gICAgICAgICAgICAgICAgICAgIG55IC89IGw7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9ucyB0byB0aGUgZGlzYy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWQgPSBnZXRtKGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0xID0gZ2V0bShkZWNrLnAxKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTIgPSBnZXRtKGRlY2sucDIpICogdDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWQgPSAobTEgKyBtMikgLyAobWQgKyBtMSArIG0yKTsgIC8vIFNoYXJlIG9mIGFjY2VsZXJhdGlvbiBmb3IgZGlzYywgZGVjayBlbmRwb2ludHMuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGExID0gKG1kICsgbTIpIC8gKG1kICsgbTEgKyBtMikgKiAoMS4wIC0gdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGEyID0gKG1kICsgbTEpIC8gKG1kICsgbTEgKyBtMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIG54ICogYW4gKiBhZCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgbnkgKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gYXBwbHkgYWNjbGVyYXRpb24gZGlzdHJpYnV0ZWQgdG8gcGluc1xuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkZWNrLnAxLCAtbnggKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLW55ICogYW4gKiBhMSk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC1ueCAqIGFuICogYTIpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAyLCAtbnkgKiBhbiAqIGEyKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uIGFuZCBkYW1waW5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBHZXQgcmVsYXRpdmUgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ4KHksIGRlY2sucDEpIC0gdCAqIGdldHZ4KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eSh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHggPSBueTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHkgPSAtbng7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRvdGFsbHkgdW5zY2llbnRpZmljIHdheSB0byBjb21wdXRlIGZyaWN0aW9uIGZyb20gYXJiaXRyYXJ5IGNvbnN0YW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnJpY3Rpb24gPSBNYXRoLnNxcnQobWF0ZXJpYWxzW2Rpc2MubV0uZnJpY3Rpb24gKiBtYXRlcmlhbHNbZGVjay5tXS5mcmljdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmID0gTWF0aC5taW4oYW4gKiBmcmljdGlvbiwgTWF0aC5hYnModnQgKiAxMDApKSAqICh2dCA8PSAwLjAgPyAxLjAgOiAtMS4wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGFtcCA9IDI7ICAgLy8gVE9ETzogZmlndXJlIG91dCBob3cgdG8gZGVyaXZlIGEgcmVhc29uYWJsZSBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGlzYy5wLCB0eCAqIGFmICogYWQgLSB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRpc2MucCwgdHkgKiBhZiAqIGFkIC0gdm4gKiBueSAqIGRhbXApO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC10eCAqIGFmICogYTEgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDEsIC10eSAqIGFmICogYTEgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDIsIC10eCAqIGFmICogYTIgKyB2biAqIG54ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC10eSAqIGFmICogYTIgKyB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzY2VuZVJlbmRlcmVyKHNjZW5lOiBTY2VuZSk6IFRydXNzUmVuZGVyIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFscztcbiAgICBcbiAgICAvLyBQcmUtcmVuZGVyIHRlcnJhaW4uXG4gICAgY29uc3QgdGVycmFpbiA9IHNjZW5lLnRlcnJhaW47XG4gICAgY29uc3QgaG1hcCA9IHRlcnJhaW4uaG1hcDtcbiAgICBjb25zdCB0ZXJyYWluUGF0aCA9IG5ldyBQYXRoMkQoKTtcbiAgICB0ZXJyYWluUGF0aC5tb3ZlVG8oMC4wLCAwLjApO1xuICAgIGxldCB4ID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG1hcC5sZW5ndGg7IGkrKykge1xuICAgICAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCwgaG1hcFtpXSk7XG4gICAgICAgIHggKz0gdGVycmFpbi5waXRjaDtcbiAgICB9XG4gICAgdGVycmFpblBhdGgubGluZVRvKHggLSB0ZXJyYWluLnBpdGNoLCAwLjApO1xuICAgIHRlcnJhaW5QYXRoLmNsb3NlUGF0aCgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBvZGU6IE9ERU1ldGhvZCkge1xuICAgICAgICAvLyBUZXJyYWluLlxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICAgICAgY3R4LmZpbGwodGVycmFpblBhdGgpO1xuXG4gICAgICAgIGNvbnN0IHkgPSBvZGUueTtcblxuICAgICAgICAvLyBEaXNjc1xuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzO1xuICAgICAgICBcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRpc2MucDtcbiAgICAgICAgICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICAgICAgICAgIGN0eC5hcmMoeVtwICogMiArIDBdLCB5W3AgKiAyICsgMV0sIGRpc2MuciwgMC4wLCAyICogTWF0aC5QSSk7XG4gICAgICAgICAgICBjdHguZmlsbChcIm5vbnplcm9cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZWFtcy5cbiAgICAgICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gbWF0ZXJpYWxzW2JlYW0ubV0uc3R5bGU7XG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gYmVhbS53O1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuXG4gICAgICAgICAgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byB1c2Ugb2RlIGFjY2Vzc29ycy5cbiAgICAgICAgICAgIC8vIFdhaXQsIGRvZXMgdGhhdCBtZWFuIHdlIG5lZWQgYW4gT0RFIGZvciBhIHN0YXRpYyBzY2VuZT9cbiAgICAgICAgICAgIC8vIFdpbGwgbmVlZCBkaWZmZXJlbnQgbWV0aG9kcy5cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKHAxIDwgMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSBnZXRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHlbcDEgKiAyICsgMF0sIHlbcDEgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AxXTtcbiAgICAgICAgICAgICAgICBjdHgubW92ZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHAyID0gYmVhbS5wMjtcbiAgICAgICAgICAgIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHlbcDIgKiAyICsgMF0sIHlbcDIgKiAyICsgMV0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaW4gPSBwaW5zW3AyXTtcbiAgICAgICAgICAgICAgICBjdHgubGluZVRvKHBpblswXSwgcGluWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiovXG5cbnR5cGUgQ3JlYXRlQmVhbVBpblN0YXRlID0ge1xuICAgIGVkaXQ6IFNjZW5lRWRpdG9yLFxuICAgIGk6IG51bWJlcixcbiAgICBkcmFnPzogeyBwOiBQb2ludDJELCBpPzogbnVtYmVyIH0sXG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCZWFtUGluT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJibGFja1wiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlUmVjdChib3gubGVmdCArIDEsIGJveC50b3AgKyAxLCBib3gud2lkdGggLSAyLCBib3guaGVpZ2h0IC0gMik7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGNvbnN0IHAyID0gc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQgPyBzdGF0ZS5kcmFnLnAgOiB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICBjb25zdCB3ID0gc3RhdGUuZWRpdC5lZGl0V2lkdGg7XG4gICAgY29uc3Qgc3R5bGUgPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLnN0eWxlO1xuICAgIGNvbnN0IGRlY2sgPSBzdGF0ZS5lZGl0LmVkaXREZWNrO1xuICAgIGRyYXdCZWFtKGN0eCwgcDEsIHAyLCB3LCBzdHlsZSwgZGVjayk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbihwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgaSA9IHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzcywgcHNbMF0uY3VyciwgOCwgc3RhdGUuaSk7XG4gICAgc3RhdGUuZHJhZyA9IHtcbiAgICAgICAgcDogcHNbMF0uY3VycixcbiAgICAgICAgaSxcbiAgICB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSA4LCBwWzFdIC0gOCwgMTYsIDE2LCB7IGVkaXQsIGkgfSlcbiAgICAgICAgLm9uRHJhdyhjcmVhdGVCZWFtUGluT25EcmF3KVxuICAgICAgICAub25QYW4oY3JlYXRlQmVhbVBpbk9uUGFuKVxuICAgICAgICAub25QYW5FbmQoY3JlYXRlQmVhbVBpbk9uUGFuRW5kKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NFZGl0YWJsZVBpbnMoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCB0cnVzcyA9IGVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NFZGl0UGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgIH1cbiAgICBjb25zdCBlID0gUmVsYXRpdmUoLi4uY2hpbGRyZW4pO1xuXG4gICAgZWRpdC5vbkFkZFBpbigoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYGFkZGluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgYWRkQ2hpbGQoZSwgQ3JlYXRlQmVhbVBpbihlZGl0LCBwaW4pLCBlYywgZWRpdEluZGV4KTtcbiAgICAgICAgZWMucmVxdWVzdExheW91dCgpO1xuICAgIH0pO1xuICAgIGVkaXQub25SZW1vdmVQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGByZW1vdmluZyBFbGVtZW50IGZvciBwaW4gJHtwaW59IGF0IGNoaWxkWyR7ZWRpdEluZGV4fV1gKTtcbiAgICAgICAgcmVtb3ZlQ2hpbGQoZSwgZWRpdEluZGV4LCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcblxuICAgIC8vIFRPRE86IGUub25EZXRhY2ggZm9yIHJlbW92ZWluZyBwaW4gb2JzZXJ2ZXJzLlxuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHdpZHRoID0gZWRpdC5zY2VuZS53aWR0aDtcbiAgICBjb25zdCBoZWlnaHQgPSBlZGl0LnNjZW5lLmhlaWdodDtcbiAgICBjb25zdCBjaGlsZHJlbiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSB0cnVzc1VuZWRpdGFibGVQaW5zQmVnaW4odHJ1c3MpOyBpICE9PSB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzKTsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgaSk7XG4gICAgICAgIGlmIChwWzBdID4gMCAmJiBwWzBdIDwgd2lkdGggJiYgcFsxXSA+IDAgJiYgcFsxXSA8IGhlaWdodCkge1xuICAgICAgICAgICAgLy8gQmVhbXMgc2hvdWxkIG9ubHkgYmUgY3JlYXRlZCBmcm9tIHBpbnMgc3RyaWN0bHkgaW5zaWRlIHRoZSBzY2VuZS5cbiAgICAgICAgICAgIGNoaWxkcmVuLnB1c2goQ3JlYXRlQmVhbVBpbihlZGl0LCBpKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NMYXllcihzY2VuZTogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gTGF5ZXIoXG4gICAgICAgIEFkZFRydXNzVW5lZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICAgICBBZGRUcnVzc0VkaXRhYmxlUGlucyhzY2VuZSksXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gZHJhd0JlYW0oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIHAxOiBQb2ludDJELCBwMjogUG9pbnQyRCwgdzogbnVtYmVyLCBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuLCBkZWNrPzogYm9vbGVhbikge1xuICAgIGN0eC5saW5lV2lkdGggPSB3O1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgIGN0eC5zdHJva2UoKTtcbiAgICBpZiAoZGVjayAhPT0gdW5kZWZpbmVkICYmIGRlY2spIHtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gXCJicm93blwiOyAgLy8gVE9ETzogZGVjayBzdHlsZVxuICAgICAgICBjdHgubGluZVdpZHRoID0gMjtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKHAxWzBdLCBwMVsxXSk7XG4gICAgICAgIGN0eC5saW5lVG8ocDJbMF0sIHAyWzFdKTtcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJ1c3NMYXllck9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgX2JveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgdHJ1c3M6IFRydXNzKSB7XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICBkcmF3QmVhbShjdHgsIHRydXNzR2V0UGluKHRydXNzLCBiLnAxKSwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDIpLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gVHJ1c3NMYXllcih0cnVzczogVHJ1c3MpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbCh0cnVzcykub25EcmF3KHRydXNzTGF5ZXJPbkRyYXcpO1xufVxuXG5mdW5jdGlvbiBzaW11bGF0ZUxheWVyT25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGNvbnN0IHNjZW5lID0gZWRpdC5zY2VuZTtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgZHJhd0JlYW0oY3R4LCBzaW0uZ2V0UGluKGIucDEpLCBzaW0uZ2V0UGluKGIucDIpLCBiLncsIHRydXNzLm1hdGVyaWFsc1tiLm1dLnN0eWxlLCBiLmRlY2spO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIFNpbXVsYXRlTGF5ZXIoZWRpdDogU2NlbmVFZGl0b3IpOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICByZXR1cm4gRmlsbChlZGl0KS5vbkRyYXcoc2ltdWxhdGVMYXllck9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIGRyYXdUZXJyYWluKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgdnA6IExheW91dEJveCwgdGVycmFpbjogVGVycmFpbikge1xuICAgIGNvbnN0IGhtYXAgPSB0ZXJyYWluLmhtYXA7XG4gICAgY29uc3QgcGl0Y2ggPSBib3gud2lkdGggLyAoaG1hcC5sZW5ndGggLSAxKTtcbiAgICBjb25zdCBsZWZ0ID0gdnAubGVmdCAtIGJveC5sZWZ0O1xuICAgIGNvbnN0IHJpZ2h0ID0gbGVmdCArIHZwLndpZHRoO1xuICAgIGNvbnN0IGJlZ2luID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5mbG9vcihsZWZ0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjb25zdCBlbmQgPSBNYXRoLm1heChNYXRoLm1pbihNYXRoLmNlaWwocmlnaHQgLyBwaXRjaCksIGhtYXAubGVuZ3RoIC0gMSksIDApO1xuICAgIGN0eC5maWxsU3R5bGUgPSB0ZXJyYWluLnN0eWxlO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKGJveC5sZWZ0LCBib3gudG9wICsgYm94LmhlaWdodCk7XG4gICAgZm9yIChsZXQgaSA9IGJlZ2luOyBpIDw9IGVuZDsgaSsrKSB7XG4gICAgICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBpICogcGl0Y2gsIGJveC50b3AgKyBobWFwW2ldKTtcbiAgICB9XG4gICAgY3R4LmxpbmVUbyhib3gubGVmdCArIGJveC53aWR0aCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguZmlsbCgpO1xufVxuXG5mdW5jdGlvbiBkcmF3RmlsbChzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuKSB7XG4gICAgcmV0dXJuIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHN0eWxlO1xuICAgICAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uVGFwKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgaWYgKGVkaXQudW5kb0NvdW50KCkgPiAwKSB7XG4gICAgICAgIGVkaXQudW5kbyhlYyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgY2N3OiBib29sZWFuKSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG5cbiAgICBjb25zdCBiID0gY2N3ID8gTWF0aC5QSSAqIDAuNzUgOiBNYXRoLlBJICogMC4yNTtcbiAgICBjb25zdCBlID0gY2N3ID8gTWF0aC5QSSAqIDEgOiBNYXRoLlBJICogMjtcbiAgICBjb25zdCBsID0gY2N3ID8gLU1hdGguUEkgKiAwLjMgOiBNYXRoLlBJICogMC4zO1xuICAgIGNvbnN0IHB4ID0gciAqIE1hdGguY29zKGUpO1xuICAgIGNvbnN0IHB5ID0gciAqIE1hdGguc2luKGUpXG4gICAgY29uc3QgdHggPSByICogTWF0aC5jb3MoZSAtIGwpIC0gcHg7XG4gICAgY29uc3QgdHkgPSByICogTWF0aC5zaW4oZSAtIGwpIC0gcHk7XG4gICAgY29uc3QgbnggPSAtdHkgLyBNYXRoLnNxcnQoMyk7XG4gICAgY29uc3QgbnkgPSB0eCAvIE1hdGguc3FydCgzKTtcbiAgICBcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4LmVsbGlwc2UoeCwgeSwgciwgciwgMCwgYiwgZSwgY2N3KTtcbiAgICBjdHgubW92ZVRvKHggKyBweCArIHR4ICsgbngsIHkgKyBweSArIHR5ICsgbnkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4ICsgdHggLSBueCwgeSArIHB5ICsgdHkgLSBueSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBkcmF3QnV0dG9uQm9yZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IDI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQgKyAxLCBib3gudG9wICsgMSwgYm94LndpZHRoIC0gMiwgYm94LmhlaWdodCAtIDIpO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uRHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgY3R4LnN0cm9rZVN0eWxlID0gZWRpdC51bmRvQ291bnQoKSA9PT0gMCA/IFwiZ3JheVwiIDogXCJibGFja1wiO1xuICAgIGRyYXdCdXR0b25Cb3JkZXIoY3R4LCBib3gpO1xuICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIHRydWUpO1xufVxuXG5mdW5jdGlvbiB1bmRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKHVuZG9CdXR0b25UYXApLm9uRHJhdyh1bmRvQnV0dG9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b25UYXAoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgZWRpdC5yZWRvKGVjKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlZG9CdXR0b25EcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBlZGl0LnJlZG9Db3VudCgpID09PSAwID8gXCJncmF5XCIgOiBcImJsYWNrXCI7XG4gICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHgsIGJveCwgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKHJlZG9CdXR0b25UYXApLm9uRHJhdyhyZWRvQnV0dG9uRHJhdyk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQbGF5KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuICAgIGNvbnN0IHB4ID0gTWF0aC5jb3MoTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY29uc3QgcHkgPSBNYXRoLnNpbihNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lSm9pbiA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgciwgeSk7XG4gICAgY3R4LmNsb3NlUGF0aCgpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd1BhdXNlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuICAgIGNvbnN0IHB4ID0gTWF0aC5jb3MoTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY29uc3QgcHkgPSBNYXRoLnNpbihNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjdHgubGluZVdpZHRoID0gYm94LndpZHRoICogMC4xO1xuICAgIGN0eC5saW5lQ2FwID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubW92ZVRvKHggLSBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSBweCwgeSAtIHB5KTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIHBsYXlCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgaWYgKHNpbS5wbGF5aW5nKCkpIHtcbiAgICAgICAgICAgIHNpbS5wYXVzZShlYyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaW0ucGxheShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTtcbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICAgICAgaWYgKGVkaXQuc2ltdWxhdG9yKCkucGxheWluZygpKSB7XG4gICAgICAgICAgICBkcmF3UGF1c2UoY3R4LCBib3gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZHJhd1BsYXkoY3R4LCBib3gpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdSZXNldChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCArIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggLSByLCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHIsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiByZXNldEJ1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCBzaW0gPSBlZGl0LnNpbXVsYXRvcigpO1xuICAgICAgICBpZiAoc2ltLnBsYXlpbmcoKSkge1xuICAgICAgICAgICAgc2ltLnBhdXNlKGVjKTtcbiAgICAgICAgfVxuICAgICAgICBzaW0uc2VlaygwLCBlYyk7XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdSZXNldChjdHgsIGJveCk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBTY2VuZUVsZW1lbnQoc2NlbmVKU09OOiBTY2VuZUpTT04pOiBMYXlvdXRUYWtlc1dpZHRoQW5kSGVpZ2h0IHtcbiAgICBjb25zdCBlZGl0ID0gbmV3IFNjZW5lRWRpdG9yKHNjZW5lSlNPTik7XG5cbiAgICBjb25zdCBzY2VuZVVJID0gTXV4KFxuICAgICAgICBbXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIl0sXG4gICAgICAgIFtcInRlcnJhaW5cIiwgRmlsbChzY2VuZUpTT04udGVycmFpbikub25EcmF3KGRyYXdUZXJyYWluKV0sXG4gICAgICAgIFtcInRydXNzXCIsIFRydXNzTGF5ZXIoc2NlbmVKU09OLnRydXNzKV0sXG4gICAgICAgIFtcImFkZF90cnVzc1wiLCBBZGRUcnVzc0xheWVyKGVkaXQpXSxcbiAgICAgICAgW1wic2ltdWxhdGVcIiwgU2ltdWxhdGVMYXllcihlZGl0KV0sXG4gICAgKTtcblxuICAgIGNvbnN0IGRyYXdSID0gZHJhd0ZpbGwoXCJyZWRcIik7XG4gICAgY29uc3QgZHJhd0cgPSBkcmF3RmlsbChcImdyZWVuXCIpO1xuICAgIGNvbnN0IGRyYXdCID0gZHJhd0ZpbGwoXCJibHVlXCIpO1xuXG4gICAgY29uc3QgdG9vbHMgPSBTd2l0Y2goXG4gICAgICAgIDEsXG4gICAgICAgIExlZnQodW5kb0J1dHRvbihlZGl0KSwgcmVkb0J1dHRvbihlZGl0KSksXG4gICAgICAgIEZpbGwoKS5vbkRyYXcoZHJhd0cpLFxuICAgICAgICBMZWZ0KHJlc2V0QnV0dG9uKGVkaXQpLCBwbGF5QnV0dG9uKGVkaXQpKSxcbiAgICAgICAgLy9GaWxsKCkub25EcmF3KGRyYXdCKSwgICAvLyBUT0RPOiByZXNldCBidXR0b24sIHBsYXkvcGF1c2UgYnV0dG9uXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDIsXG4gICAgICAgICksXG4gICAgICAgIEJvdHRvbShcbiAgICAgICAgICAgIEZsZXgoNjQsIDAsXG4gICAgICAgICAgICAgICAgdG9vbHMsICBcbiAgICAgICAgICAgICksXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIExlZnQoXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Uikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDAsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIpOyBlZGl0LnNpbXVsYXRvcigpLnBhdXNlKGVjKSB9KSxcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdHKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4geyB0b29scy5zZXQoMSwgZWMpOyBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwidHJ1c3NcIiwgXCJhZGRfdHJ1c3NcIik7IGVkaXQuc2ltdWxhdG9yKCkucGF1c2UoZWMpOyB9KSxcbiAgICAgICAgICAgICAgICAgICAgRmxleCg2NCwgMCkub25EcmF3KGRyYXdCKS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9vbHMuc2V0KDIsIGVjKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJzaW11bGF0ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHNpbXVsYXRpb24gc3RhdGUgc3RvcmVkIGluIGRvL3VuZG8gc3RhY2tzLlxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgKSxcbiAgICApO1xuICAgIC8vIFRPRE86IHNhdmUvbG9hZFxuICAgIC8vIEhhdmUgbGlzdCBvZiBsZXZlbHMgaW4gc29tZSBKU09OIHJlc291cmNlIGZpbGUuXG4gICAgLy8gSGF2ZSBvcHRpb24gdG8gbG9hZCBqc29uIGZpbGUgZnJvbSBsb2NhbC5cbiAgICAvLyBhdXRvLXNhdmUgZXZlcnkgbiBzZWNvbmRzIGFmdGVyIGNoYW5nZSwga2V5IGluIGxvY2FsIHN0b3JhZ2UgaXMgdXJpIG9mIGxldmVsIGpzb24uXG4gICAgLy8gd2hlbiBsb2FkaW5nLCBjaGVjayBsb2NhbCBzdG9yYWdlIGFuZCBsb2FkIHRoYXQgaW5zdGVhZCBpZiBpdCBleGlzdHMgKGFuZCB0aGUgbm9uIGVkaXRhYmxlIHBhcnRzIG1hdGNoPylcbn1cbiJdfQ==