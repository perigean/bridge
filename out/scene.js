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
                    decksLeft: [],
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
                decksLeft: [],
                deckCount: 0,
            };
        });
        function hmapAddDeck(i, left, d) {
            if (i < 0 || i >= hmap.length) {
                return;
            }
            const h = hmap[i];
            h.decks[h.deckCount] = d;
            h.decksLeft[h.deckCount] = left;
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
            const dampK = 1;
            // Acceleration due to gravity.
            for (let i = 0; i < movingPins; i++) {
                setvx(dydt, i, g[0] - dampK * getvx(y, i));
                setvy(dydt, i, g[1] - dampK * getvy(y, i));
            }
            // Decks are updated in hmap in the below loop through beams, so clear the previous values.
            for (const h of hmap) {
                h.deckCount = 0;
            }
            // Acceleration due to beam stress.
            for (const beam of beams) {
                const p1 = beam.p1;
                const p2 = beam.p2;
                // Add decks to accleration structure
                if (beam.deck) {
                    const i1 = Math.floor(getdx(y, p1) / pitch);
                    const i2 = Math.floor(getdx(y, p2) / pitch);
                    const begin = Math.min(i1, i2);
                    const end = Math.max(i1, i2);
                    for (let i = begin; i <= end; i++) {
                        hmapAddDeck(i, begin, beam);
                    }
                }
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
            }
            // Acceleration due to terrain collision
            // TODO: scene border collision
            for (let i = 0; i < movingPins; i++) {
                const dx = getdx(y, i); // Pin position.
                const dy = getdy(y, i);
                const m = mass[i];
                let bounceF = 1000.0 * m; // Force per metre of depth under terrain.
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
            for (const disc of discs) {
                const r = disc.r;
                const m = mass[disc.p];
                const dx = getdx(y, disc.p);
                // Loop through all hmap buckets that disc overlaps.
                const i1 = Math.floor((dx - r) / pitch);
                const i2 = Math.floor((dx + r) / pitch);
                for (let i = i1; i <= i2; i++) {
                    if (i < 0 || i >= hmap.length) {
                        continue;
                    }
                    const decks = hmap[i].decks;
                    const deckCount = hmap[i].deckCount;
                    for (let j = 0; j < deckCount; j++) {
                        if (i !== Math.max(i1, hmap[i].decksLeft[j])) {
                            // Only compute collision if the bucket we are in is the leftmost
                            // one that contains both the deck and the disc.
                            continue;
                        }
                        const deck = decks[j];
                        const dy = getdy(y, disc.p);
                        const x1 = getdx(y, deck.p1);
                        const y1 = getdy(y, deck.p1);
                        const x2 = getdx(y, deck.p2);
                        const y2 = getdy(y, deck.p2);
                        // Is collision happening?
                        const sx = x2 - x1; // Vector to end of deck (from start)
                        const sy = y2 - y1;
                        const cx = dx - x1; // Vector to centre of disc (from start of deck)
                        const cy = dy - y1;
                        const a = sx * sx + sy * sy;
                        const b = -2.0 * (cx * sx + cy * sy);
                        const c = cx * cx + cy * cy - r * r;
                        const D = b * b - 4.0 * a * c;
                        if (D <= 0.0) {
                            continue; // No Real solutions to intersection.
                        }
                        const rootD = Math.sqrt(D);
                        let t = -b / (2.0 * a);
                        let t1 = (-b - rootD) / (2.0 * a);
                        let t2 = (-b + rootD) / (2.0 * a);
                        if ((t1 <= 0.0 && t2 <= 0.0) || (t1 >= 1.0 && t2 >= 0.0)) {
                            continue; // Intersections are both before or after deck.
                        }
                        t = Math.max(Math.min(t, 1.0), 0.0);
                        t1 = Math.max(t1, 0.0);
                        t2 = Math.min(t2, 1.0);
                        // Compute collision acceleration.
                        // Acceleration is proportional to area 'shadowed' in the disc by the intersecting deck.
                        // This is so that as a disc moves between two deck segments, the acceleration remains constant.
                        const t1x = (1 - t1) * x1 + t1 * x2 - dx; // Circle centre -> t1 intersection.
                        const t1y = (1 - t1) * y1 + t1 * y2 - dy;
                        const t2x = (1 - t2) * x1 + t2 * x2 - dx; // Circle centre -> t2 intersection.
                        const t2y = (1 - t2) * y1 + t2 * y2 - dy;
                        const ta = Math.abs(Math.atan2(t1y, t1x) - Math.atan2(t2y, t2x)) % Math.PI;
                        const area = 0.5 * r * r * ta - 0.5 * Math.abs(t1x * t2y - t1y * t2x);
                        const f = 1000.0 * m * area / r; // TODO: figure out the force.
                        let nx = cx - sx * t;
                        let ny = cy - sy * t;
                        const l = Math.sqrt(nx * nx + ny * ny);
                        nx /= l;
                        ny /= l;
                        // Apply force to the disc.
                        force(dydt, disc.p, nx * f, ny * f);
                        // apply accleration distributed to pins
                        force(dydt, deck.p1, -nx * f * (1 - t), -ny * f * (1 - t));
                        force(dydt, deck.p2, -nx * f * t, -ny * f * t);
                        // Compute friction.
                        // Get relative velocity.
                        const vx = getvx(y, disc.p) - (1.0 - t) * getvx(y, deck.p1) - t * getvx(y, deck.p2);
                        const vy = getvy(y, disc.p) - (1.0 - t) * getvy(y, deck.p1) - t * getvy(y, deck.p2);
                        //const vn = vx * nx + vy * ny;
                        const tx = ny;
                        const ty = -nx;
                        const vt = vx * tx + vy * ty - disc.v;
                        // Totally unscientific way to compute friction from arbitrary constants.
                        const friction = Math.sqrt(materials[disc.m].friction * materials[deck.m].friction);
                        const ff = f * friction * (vt <= 0.0 ? 1.0 : -1.0);
                        //const damp = 2;   // TODO: figure out how to derive a reasonable constant.
                        force(dydt, disc.p, tx * ff, ty * ff);
                        force(dydt, deck.p1, -tx * ff * (1 - t), -ty * ff * (1 - t));
                        force(dydt, deck.p2, -tx * ff * t, -ty * ff * t);
                    }
                }
            }
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
        const p1 = truss.startPins.length + truss.editPins.length;
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
function TrussLayer(truss) {
    return Fill(truss).onDraw((ctx, _box, _ec, _vp, truss) => {
        for (const b of truss.startBeams) {
            drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style, b.deck);
        }
        for (const b of truss.editBeams) {
            drawBeam(ctx, trussGetPin(truss, b.p1), trussGetPin(truss, b.p2), b.w, truss.materials[b.m].style, b.deck);
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
        const scene = edit.scene;
        const truss = scene.truss;
        const sim = edit.simulator();
        for (const b of truss.startBeams) {
            drawBeam(ctx, sim.getPin(b.p1), sim.getPin(b.p2), b.w, truss.materials[b.m].style, b.deck);
        }
        for (const b of truss.editBeams) {
            drawBeam(ctx, sim.getPin(b.p1), sim.getPin(b.p2), b.w, truss.materials[b.m].style, b.deck);
        }
        for (const d of truss.discs) {
            const m = truss.materials[d.m];
            const p = sim.getPin(d.p);
            ctx.fillStyle = m.style;
            ctx.beginPath();
            ctx.ellipse(p[0], p[1], d.r, d.r, 0, 0, 2 * Math.PI);
            ctx.fill();
        }
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
    // TODO: single global damping force based on speed. Forget damping beams?
    // TODO: scroll to zoom, mouse cursor counts as a tap. (use pointer events?)
    // TODO: max beam length (from material. make it depend on width? Maybe just have a buckling force done properly and it takes care of itself...)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsK0JBQStCO0FBRy9CLE9BQU8sRUFBVyxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDcEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQWtCLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUF3QyxJQUFJLEVBQUUsR0FBRyxFQUFZLFFBQVEsRUFBa0IsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFnQixNQUFNLGNBQWMsQ0FBQztBQTZDbE8sU0FBUyxtQkFBbUIsQ0FBQyxLQUFZLEVBQUUsQ0FBUztJQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO0lBQ2xDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksU0FBUyxDQUFDLE1BQU0sRUFBRTtRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2xEO0FBQ0wsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEtBQVksRUFBRSxHQUFXO0lBQzdDLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFO1FBQ3hGLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDLENBQUM7S0FDL0M7QUFDTCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsS0FBWSxFQUFFLEVBQVUsRUFBRSxFQUFVO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRTtRQUNoQyxJQUFJ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QyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDaEI7QUFDTCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsS0FBWTtJQUM1QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUE2QixFQUFFLElBQWUsRUFBRSxHQUFtQixFQUFFLEdBQWMsRUFBRSxLQUFZLEVBQUUsRUFBRTtRQUM1SCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUU7WUFDOUIsUUFBUSxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDOUc7UUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7WUFDN0IsUUFBUSxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDOUc7UUFDRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUU7WUFDekIsTUFBTSxD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TSxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztJQUMxQixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM1QyxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7SUFDaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFDOUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDL0UsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0UsR0FBRyxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQzlCLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNoQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0MsS0FBSyxJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUUsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUMvQixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ3ZEO0lBQ0QsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdkQsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLFFBQVEsQ0FBQyxLQUE4QztJQUM1RCxPQUFPLENBQUMsR0FBNkIsRUFBRSxHQUFjLEVBQUUsRUFBRTtRQUNyRCxHQUFHLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN0QixHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzRCxDQUFDLENBQUE7QUFDTCxDQUFDO0FBRUQsU0FBUyxhQUFhLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsSUFBaUI7SUFDckUsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1FBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDakI7QUFDTCxDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxHQUE2QixFQUFFLEdBQWMsRUFBRSxHQUFZO0lBQ3BGLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7SUFDckMsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztJQUNyQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUU1QixNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQztJQUNoRCxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMxQyxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQy9DLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQzFCLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDcEMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdCLEdBQUcsQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7SUFDaEMsR0FBRyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDdEIsR0FBRyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDdkIsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ2hCLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFD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LEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDekssSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBVyxFQUFFLEVBQWtCLEVBQUUsRUFBRTtRQUNoRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDM0MsQ0FBQyxDQUFDLENBQ0wsQ0FDSixDQUNKLENBQ0osQ0FBQztJQUVGLDBFQUEwRTtJQUUxRSw0RUFBNEU7SUFFNUUsZ0pBQWdKO0lBRWhKLHNCQUFzQjtJQUV0QixtREFBbUQ7SUFFbkQseUhBQXlIO0lBQ3pILGtIQUFrSDtJQUNsSCxtQkFBbUI7SUFFbkIsdUZBQXVGO0lBRXZGLGtCQUFrQjtJQUNsQixrREFBa0Q7SUFDbEQsNENBQTRDO0lBQzVDLHFGQUFxRjtJQUNyRiwyR0FBMkc7QUFDL0csQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBDaGFybGVzIER1ZWNrIDIwMjBcblxuaW1wb3J0IHsgRGVyaXZhdGl2ZSB9IGZyb20gXCIuL29kZS5qc1wiO1xuaW1wb3J0IHsgUG9pbnQyRCwgcG9pbnREaXN0YW5jZSB9IGZyb20gXCIuL3BvaW50LmpzXCI7XG5pbXBvcnQgeyBSdW5nZUt1dHRhNCB9IGZyb20gXCIuL3JrNC5qc1wiO1xuaW1wb3J0IHsgYWRkQ2hpbGQsIEJvdHRvbSwgQm94LCBFbGVtZW50Q29udGV4dCwgRmlsbCwgRmxleCwgTGF5ZXIsIExheW91dEJveCwgTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCwgTGVmdCwgTXV4LCBQYW5Qb2ludCwgUG9zaXRpb24sIFBvc2l0aW9uTGF5b3V0LCBSZWxhdGl2ZSwgcmVtb3ZlQ2hpbGQsIFNjcm9sbCwgU3dpdGNoLCBUaW1lckhhbmRsZXIgfSBmcm9tIFwiLi91aS9ub2RlLmpzXCI7XG5cbmV4cG9ydCB0eXBlIEJlYW0gPSB7XG4gICAgcDE6IG51bWJlcjsgLy8gSW5kZXggb2YgcGluIGF0IGJlZ2lubmluZyBvZiBiZWFtLlxuICAgIHAyOiBudW1iZXI7IC8vIEluZGV4IG9mIHBpbiBhdCBlbmQgb2YgYmVhbS5cbiAgICBtOiBudW1iZXI7ICAvLyBJbmRleCBvZiBtYXRlcmlhbCBvZiBiZWFtLlxuICAgIHc6IG51bWJlcjsgIC8vIFdpZHRoIG9mIGJlYW0uXG4gICAgbD86IG51bWJlcjsgLy8gTGVuZ3RoIG9mIGJlYW0sIG9ubHkgc3BlY2lmaWVkIHdoZW4gcHJlLXN0cmFpbmluZy5cbiAgICBkZWNrPzogYm9vbGVhbjsgLy8gSXMgdGhpcyBiZWFtIGEgZGVjaz8gKGRvIGRpc2NzIGNvbGxpZGUpXG59O1xuXG50eXBlIFNpbXVsYXRpb25CZWFtID0ge1xuICAgIHAxOiBudW1iZXI7XG4gICAgcDI6IG51bWJlcjtcbiAgICBtOiBudW1iZXI7XG4gICAgdzogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBkZWNrOiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBEaXNjID0ge1xuICAgIHA6IG51bWJlcjsgIC8vIEluZGV4IG9mIG1vdmVhYmxlIHBpbiB0aGlzIGRpc2Mgc3Vycm91bmRzLlxuICAgIG06IG51bWJlcjsgIC8vIE1hdGVyaWFsIG9mIGRpc2MuXG4gICAgcjogbnVtYmVyOyAgLy8gUmFkaXVzIG9mIGRpc2MuXG4gICAgdjogbnVtYmVyOyAgLy8gVmVsb2NpdHkgb2Ygc3VyZmFjZSBvZiBkaXNjIChpbiBDQ1cgZGlyZWN0aW9uKS5cbn07XG5cbmV4cG9ydCB0eXBlIE1hdGVyaWFsID0ge1xuICAgIEU6IG51bWJlcjsgIC8vIFlvdW5nJ3MgbW9kdWx1cyBpbiBQYS5cbiAgICBkZW5zaXR5OiBudW1iZXI7ICAgIC8vIGtnL21eM1xuICAgIHN0eWxlOiBzdHJpbmcgfCBDYW52YXNHcmFkaWVudCB8IENhbnZhc1BhdHRlcm47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICAvLyBUT0RPOiB3aGVuIHN0dWZmIGJyZWFrcywgd29yayBoYXJkZW5pbmcsIGV0Yy5cbn07XG5cbmV4cG9ydCB0eXBlIFRydXNzID0ge1xuICAgIGZpeGVkUGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRQaW5zOiBBcnJheTxQb2ludDJEPjtcbiAgICBlZGl0UGluczogQXJyYXk8UG9pbnQyRD47XG4gICAgc3RhcnRCZWFtczogQXJyYXk8QmVhbT47XG4gICAgZWRpdEJlYW1zOiBBcnJheTxCZWFtPjtcbiAgICBkaXNjczogQXJyYXk8RGlzYz47XG4gICAgbWF0ZXJpYWxzOiBBcnJheTxNYXRlcmlhbD47XG59O1xuXG5mdW5jdGlvbiB0cnVzc0Fzc2VydE1hdGVyaWFsKHRydXNzOiBUcnVzcywgbTogbnVtYmVyKSB7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGlmIChtIDwgMCB8fCBtID49IG1hdGVyaWFscy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1hdGVyaWFsIGluZGV4ICR7bX1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQXNzZXJ0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGggfHwgcGluID49IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHBpbiBpbmRleCAke3Bpbn1gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRydXNzQmVhbUV4aXN0cyh0cnVzczogVHJ1c3MsIHAxOiBudW1iZXIsIHAyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBmb3IgKGNvbnN0IGJlYW0gb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgYmVhbSBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgIGlmICgocDEgPT09IGJlYW0ucDEgJiYgcDIgPT09IGJlYW0ucDIpIHx8IChwMSA9PT0gYmVhbS5wMiAmJiBwMiA9PT0gYmVhbS5wMSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdHJ1c3NFZGl0UGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzRWRpdFBpbnNFbmQodHJ1c3M6IFRydXNzKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbn1cblxuZnVuY3Rpb24gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIC10cnVzcy5maXhlZFBpbnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiB0cnVzc1VuZWRpdGFibGVQaW5zRW5kKHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzTW92aW5nUGluc0NvdW50KHRydXNzOiBUcnVzcyk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzczogVHJ1c3MsIHA6IFBvaW50MkQsIG1heGQ6IG51bWJlciwgYmVhbVN0YXJ0PzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgICAvLyBUT0RPOiBhY2NlbGVyYXRpb24gc3RydWN0dXJlcy4gUHJvYmFibHkgb25seSBtYXR0ZXJzIG9uY2Ugd2UgaGF2ZSAxMDAwcyBvZiBwaW5zP1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgbGV0IHJlcyA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcmVzZCA9IG1heGQ7XG4gICAgaWYgKGJlYW1TdGFydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvciAoY29uc3QgYiBvZiB0cnVzcy5zdGFydEJlYW1zKSB7XG4gICAgICAgICAgICBpZiAoYi5wMSA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChiLnAyID09PSBiZWFtU3RhcnQpIHtcbiAgICAgICAgICAgICAgICBibG9jay5hZGQoYi5wMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgaWYgKGIucDEgPT09IGJlYW1TdGFydCkge1xuICAgICAgICAgICAgICAgIGJsb2NrLmFkZChiLnAyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYi5wMiA9PT0gYmVhbVN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgYmxvY2suYWRkKGIucDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHJ1c3MuZml4ZWRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmZpeGVkUGluc1tpXSk7XG4gICAgICAgIGlmIChkIDwgcmVzZCkge1xuICAgICAgICAgICAgcmVzID0gaSAtIHRydXNzLmZpeGVkUGlucy5sZW5ndGg7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLnN0YXJ0UGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gcG9pbnREaXN0YW5jZShwLCB0cnVzcy5zdGFydFBpbnNbaV0pO1xuICAgICAgICBpZiAoZCA8IHJlc2QpIHtcbiAgICAgICAgICAgIHJlcyA9IGk7XG4gICAgICAgICAgICByZXNkID0gZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmVkaXRQaW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGQgPSBwb2ludERpc3RhbmNlKHAsIHRydXNzLmVkaXRQaW5zW2ldKTtcbiAgICAgICAgaWYgKGQgPCByZXNkKSB7XG4gICAgICAgICAgICByZXMgPSBpICsgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aDtcbiAgICAgICAgICAgIHJlc2QgPSBkO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG59XG5cbmZ1bmN0aW9uIHRydXNzR2V0UGluKHRydXNzOiBUcnVzcywgcGluOiBudW1iZXIpOiBQb2ludDJEIHtcbiAgICBpZiAocGluIDwgLXRydXNzLmZpeGVkUGlucy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtvd24gcGluIGluZGV4ICR7cGlufWApO1xuICAgIH0gZWxzZSBpZiAocGluIDwgMCkge1xuICAgICAgICByZXR1cm4gdHJ1c3MuZml4ZWRQaW5zW3RydXNzLmZpeGVkUGlucy5sZW5ndGggKyBwaW5dO1xuICAgIH0gZWxzZSBpZiAocGluIDwgdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gdHJ1c3Muc3RhcnRQaW5zW3Bpbl07XG4gICAgfSBlbHNlIGlmIChwaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoIDwgdHJ1c3MuZWRpdFBpbnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiB0cnVzcy5lZGl0UGluc1twaW4gLSB0cnVzcy5zdGFydFBpbnMubGVuZ3RoXTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua293biBwaW4gaW5kZXggJHtwaW59YCk7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBUZXJyYWluID0ge1xuICAgIGhtYXA6IEFycmF5PG51bWJlcj47XG4gICAgZnJpY3Rpb246IG51bWJlcjtcbiAgICBzdHlsZTogc3RyaW5nIHwgQ2FudmFzR3JhZGllbnQgfCBDYW52YXNQYXR0ZXJuO1xufTtcblxudHlwZSBTaW11bGF0aW9uSE1hcCA9IEFycmF5PHtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBueDogbnVtYmVyOyAvLyBPdXR3YXJkIChkaXJlY3Rpb24gb2YgYm91bmNlKSBub3JtYWwgdW5pdCB2ZWN0b3IuXG4gICAgbnk6IG51bWJlcjtcbiAgICBkZWNrczogQXJyYXk8U2ltdWxhdGlvbkJlYW0+OyAgIC8vIFVwZGF0ZWQgZXZlcnkgZnJhbWUsIGFsbCBkZWNrcyBhYm92ZSB0aGlzIHNlZ21lbnQuXG4gICAgZGVja3NMZWZ0OiBBcnJheTxudW1iZXI+OyAgICAgICAvLyBMZWZ0bW9zdCBpbmRleCBpbiBobWFwIG9mIGRlY2sgYXQgc2FtZSBpbmRleCBpbiBkZWNrcy5cbiAgICBkZWNrQ291bnQ6IG51bWJlcjsgIC8vIE51bWJlciBvZiBpbmRpY2VzIGluIGRlY2tzIGJlaW5nIHVzZWQuXG59PjtcblxudHlwZSBBZGRCZWFtQWN0aW9uID0ge1xuICAgIHR5cGU6IFwiYWRkX2JlYW1cIjtcbiAgICBwMTogbnVtYmVyO1xuICAgIHAyOiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBsPzogbnVtYmVyO1xuICAgIGRlY2s/OiBib29sZWFuO1xufTtcblxudHlwZSBBZGRQaW5BY3Rpb24gPSB7XG4gICAgdHlwZTogXCJhZGRfcGluXCI7XG4gICAgcGluOiBQb2ludDJEO1xufTtcblxudHlwZSBDb21wb3NpdGVBY3Rpb24gPSB7XG4gICAgdHlwZTogXCJjb21wb3NpdGVcIjtcbiAgICBhY3Rpb25zOiBBcnJheTxUcnVzc0FjdGlvbj47XG59O1xuXG50eXBlIFRydXNzQWN0aW9uID0gQWRkQmVhbUFjdGlvbiB8IEFkZFBpbkFjdGlvbiB8IENvbXBvc2l0ZUFjdGlvbjtcblxuXG5leHBvcnQgdHlwZSBTY2VuZUpTT04gPSB7XG4gICAgdHJ1c3M6IFRydXNzO1xuICAgIHRlcnJhaW46IFRlcnJhaW47XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBnOiBQb2ludDJEOyAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgIHJlZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xuICAgIHVuZG9TdGFjazogQXJyYXk8VHJ1c3NBY3Rpb24+O1xufVxuXG5jbGFzcyBTY2VuZVNpbXVsYXRvciB7XG4gICAgcHJpdmF0ZSBtZXRob2Q6IFJ1bmdlS3V0dGE0OyAgICAgICAgICAgICAgICAgICAgLy8gT0RFIHNvbHZlciBtZXRob2QgdXNlZCB0byBzaW11bGF0ZS5cbiAgICBwcml2YXRlIGR5ZHQ6IERlcml2YXRpdmU7ICAgICAgICAgICAgICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIE9ERSBzdGF0ZS5cbiAgICBwcml2YXRlIGg6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaW1lIHN0ZXAuXG4gICAgcHJpdmF0ZSBmaXhlZFBpbnM6IEZsb2F0MzJBcnJheTsgICAgICAgICAgICAgICAgLy8gUG9zaXRpb25zIG9mIGZpeGVkIHBpbnMgW3gwLCB5MCwgeDEsIHkxLCAuLi5dLlxuICAgIHByaXZhdGUgdExhdGVzdDogbnVtYmVyOyAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBoaWdoZXN0IHRpbWUgdmFsdWUgc2ltdWxhdGVkLlxuICAgIHByaXZhdGUga2V5SW50ZXJ2YWw6IG51bWJlcjsgICAgICAgICAgICAgICAgICAgICAgLy8gVGltZSBwZXIga2V5ZnJhbWUuXG4gICAgcHJpdmF0ZSBrZXlmcmFtZXM6IE1hcDxudW1iZXIsIEZsb2F0MzJBcnJheT47ICAgLy8gTWFwIG9mIHRpbWUgdG8gc2F2ZWQgc3RhdGUuXG4gICAgcHJpdmF0ZSBwbGF5VGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICBwcml2YXRlIHBsYXlUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBwbGF5VGljazogVGltZXJIYW5kbGVyO1xuXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFNjZW5lSlNPTiwgaDogbnVtYmVyLCBrZXlJbnRlcnZhbDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuaCA9IGg7XG4gICAgICAgIHRoaXMudExhdGVzdCA9IDA7XG4gICAgICAgIHRoaXMua2V5SW50ZXJ2YWwgPSBrZXlJbnRlcnZhbDtcbiAgICAgICAgdGhpcy5rZXlmcmFtZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gdW5kZWZpbmVkO1xuICAgICAgICB0aGlzLnBsYXlUaW1lID0gMDtcbiAgICAgICAgdGhpcy5wbGF5VGljayA9IChtczogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgIC8vIE9ubHkgY29tcHV0ZSB1cCB0byAxMDBtcyBvZiBmcmFtZXMgcGVyIHRpY2ssIHRvIGFsbG93IG90aGVyIHRoaW5ncyB0byBoYXBwZW4gaWYgd2UgYXJlIGJlaGluZC5cbiAgICAgICAgICAgIGxldCB0MSA9IE1hdGgubWluKHRoaXMucGxheVRpbWUgKyBtcyAqIDAuMDAxLCB0aGlzLm1ldGhvZC50ICsgMC4xKTtcbiAgICAgICAgICAgIHdoaWxlICh0aGlzLm1ldGhvZC50IDwgdDEpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICAgICAgXG4gICAgICAgIC8vIENhY2hlIGZpeGVkIHBpbiB2YWx1ZXMuXG4gICAgICAgIGNvbnN0IGZpeGVkUGlucyA9IG5ldyBGbG9hdDMyQXJyYXkodHJ1c3MuZml4ZWRQaW5zLmxlbmd0aCAqIDIpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRydXNzLmZpeGVkUGlucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZml4ZWRQaW5zW2kgKiAyXSA9IHRydXNzLmZpeGVkUGluc1tpXVswXTtcbiAgICAgICAgICAgIGZpeGVkUGluc1tpICogMiArIDFdID0gdHJ1c3MuZml4ZWRQaW5zW2ldWzFdO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZml4ZWRQaW5zID0gZml4ZWRQaW5zO1xuXG4gICAgICAgIC8vIENhY2hlIEJlYW0gdmFsdWVzLlxuICAgICAgICBjb25zdCBiZWFtczogQXJyYXk8U2ltdWxhdGlvbkJlYW0+ID0gWy4uLnRydXNzLnN0YXJ0QmVhbXMsIC4uLnRydXNzLmVkaXRCZWFtc10ubWFwKGIgPT4gKHtcbiAgICAgICAgICAgIHAxOiBiLnAxLFxuICAgICAgICAgICAgcDI6IGIucDIsXG4gICAgICAgICAgICBtOiBiLm0sXG4gICAgICAgICAgICB3OiBiLncsXG4gICAgICAgICAgICBsOiBiLmwgIT09IHVuZGVmaW5lZCA/IGIubCA6IHBvaW50RGlzdGFuY2UodHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMikpLFxuICAgICAgICAgICAgZGVjazogYi5kZWNrICE9PSB1bmRlZmluZWQgPyBiLmRlY2sgOiBmYWxzZSxcbiAgICAgICAgfSkpO1xuXG4gICAgICAgIC8vIENhY2hlIGRpc2NzLlxuICAgICAgICBjb25zdCBkaXNjcyA9IHRydXNzLmRpc2NzOyAgLy8gVE9ETzogZG8gd2UgZXZlciB3bmF0IHRvIG11dGF0ZSBkaXNjcz9cblxuICAgICAgICAvLyBDYWNoZSBtYXRlcmlhbHMuXG4gICAgICAgIGNvbnN0IG1hdGVyaWFscyA9IHRydXNzLm1hdGVyaWFsczsgIC8vIFRPRE86IGRvIHdlIGV2ZXIgd2FudCB0byBtdXRhdGUgbWF0ZXJpYWxzP1xuXG4gICAgICAgIC8vIENvbXB1dGUgdGhlIG1hc3Mgb2YgYWxsIHBpbnMuXG4gICAgICAgIGNvbnN0IG1vdmluZ1BpbnMgPSB0cnVzc01vdmluZ1BpbnNDb3VudCh0cnVzcyk7XG4gICAgICAgIGNvbnN0IG1hc3MgPSBuZXcgRmxvYXQzMkFycmF5KG1vdmluZ1BpbnMpO1xuICAgICAgICBmdW5jdGlvbiBhZGRNYXNzKHBpbjogbnVtYmVyLCBtOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgLy8gRml4ZWQgcGlucyBhbHJlYWR5IGhhdmUgaW5maW5pdGUgbWFzcy5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXNzW3Bpbl0gKz0gbTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgYmVhbXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSBiLmwgKiBiLncgKiBtYXRlcmlhbHNbYi5tXS5kZW5zaXR5O1xuICAgICAgICAgICAgLy8gRGlzdHJpYnV0ZSB0aGUgbWFzcyBiZXR3ZWVuIHRoZSB0d28gZW5kIHBpbnMuXG4gICAgICAgICAgICAvLyBUT0RPOiBkbyBwcm9wZXIgbWFzcyBtb21lbnQgb2YgaW50ZXJ0aWEgY2FsY3VsYXRpb24gd2hlbiByb3RhdGluZyBiZWFtcz9cbiAgICAgICAgICAgIGFkZE1hc3MoYi5wMSwgbSAqIDAuNSk7XG4gICAgICAgICAgICBhZGRNYXNzKGIucDIsIG0gKiAwLjUpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgZCBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgbSA9IGQuciAqIGQuciAqIE1hdGguUEkgKiBtYXRlcmlhbHNbZC5tXS5kZW5zaXR5O1xuICAgICAgICAgICAgYWRkTWFzcyhkLnAsIG0pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENoZWNrIHRoYXQgZXZlcnl0aGluZyB0aGF0IGNhbiBtb3ZlIGhhcyBzb21lIG1hc3MuXG4gICAgICAgIGZvciAoY29uc3QgbSBvZiBtYXNzKSB7XG4gICAgICAgICAgICBpZiAobSA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibWFzcyAwIHBpbiBkZXRlY3RlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhY2hlIHRoZSB0ZXJyYWluLCBzZXQgdXAgYWNjZWxlcmF0aW9uIHN0cnVjdHVyZSBmb3IgZGVjayBpbnRlcnNlY3Rpb25zLlxuICAgICAgICBjb25zdCB0RnJpY3Rpb24gPSBzY2VuZS50ZXJyYWluLmZyaWN0aW9uO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBzY2VuZS5oZWlnaHQ7XG4gICAgICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgICAgICBjb25zdCBobWFwOiBTaW11bGF0aW9uSE1hcCA9IHNjZW5lLnRlcnJhaW4uaG1hcC5tYXAoKGgsIGkpID0+IHtcbiAgICAgICAgICAgIGlmIChpICsgMSA+PSBzY2VuZS50ZXJyYWluLmhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgICAgICBueDogMC4wLFxuICAgICAgICAgICAgICAgICAgICBueTotMS4wLFxuICAgICAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgICAgIGRlY2tzTGVmdDogW10sXG4gICAgICAgICAgICAgICAgICAgIGRlY2tDb3VudDogMCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZHkgPSBzY2VuZS50ZXJyYWluLmhtYXBbaSArIDFdIC0gaDtcbiAgICAgICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHkgKiBkeSArIHBpdGNoICogcGl0Y2gpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgbng6IGR5IC8gbCxcbiAgICAgICAgICAgICAgICBueTogLXBpdGNoIC8gbCxcbiAgICAgICAgICAgICAgICBkZWNrczogW10sXG4gICAgICAgICAgICAgICAgZGVja3NMZWZ0OiBbXSxcbiAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZnVuY3Rpb24gaG1hcEFkZERlY2soaTogbnVtYmVyLCBsZWZ0OiBudW1iZXIsIGQ6IFNpbXVsYXRpb25CZWFtKSB7XG4gICAgICAgICAgICBpZiAoaSA8IDAgfHwgaSA+PSBobWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGggPSBobWFwW2ldO1xuICAgICAgICAgICAgaC5kZWNrc1toLmRlY2tDb3VudF0gPSBkO1xuICAgICAgICAgICAgaC5kZWNrc0xlZnRbaC5kZWNrQ291bnRdID0gbGVmdDtcbiAgICAgICAgICAgIGguZGVja0NvdW50Kys7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXRlIGFjY2Vzc29yc1xuICAgICAgICBjb25zdCB2SW5kZXggPSBtb3ZpbmdQaW5zICogMjtcbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHgoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDJdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbiAqIDIgKyAxXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geVt2SW5kZXggKyBwaW4gKiAyXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHlbdkluZGV4ICsgcGluICogMiArIDFdOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVtwaW4gKiAyICsgMF0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgICAgIHlbcGluICogMiArIDFdID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIHNldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgICAgICB5W3ZJbmRleCArIHBpbiAqIDIgKyAwXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBzZXR2eSh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgeVt2SW5kZXggKyBwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZm9yY2UoZHlkdDogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgZng6IG51bWJlciwgZnk6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbSA9IG1hc3NbcGluXTtcbiAgICAgICAgICAgICAgICBkeWR0W3ZJbmRleCArIHBpbiAqIDIgKyAwXSArPSBmeCAvIG07XG4gICAgICAgICAgICAgICAgZHlkdFt2SW5kZXggKyBwaW4gKiAyICsgMV0gKz0gZnkgLyBtO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHVwIGluaXRpYWwgT0RFIHN0YXRlLiBOQjogdmVsb2NpdGllcyBhcmUgYWxsIHplcm8uXG4gICAgICAgIGNvbnN0IHkwID0gbmV3IEZsb2F0MzJBcnJheShtb3ZpbmdQaW5zICogNCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW92aW5nUGluczsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICAgICAgc2V0ZHgoeTAsIGksIGRbMF0pO1xuICAgICAgICAgICAgc2V0ZHkoeTAsIGksIGRbMV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FjaGUgYWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICBjb25zdCBnID0gc2NlbmUuZztcblxuICAgICAgICB0aGlzLmR5ZHQgPSBmdW5jdGlvbiBkeWR5KF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgICAgICAgICAvLyBEZXJpdmF0aXZlIG9mIHBvc2l0aW9uIGlzIHZlbG9jaXR5LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzZXRkeChkeWR0LCBpLCBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICAgICAgc2V0ZHkoZHlkdCwgaSwgZ2V0dnkoeSwgaSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZGFtcEsgPSAxO1xuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtb3ZpbmdQaW5zOyBpKyspIHtcbiAgICAgICAgICAgICAgICBzZXR2eChkeWR0LCBpLCBnWzBdIC0gZGFtcEsgKiBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICAgICAgc2V0dnkoZHlkdCwgaSwgZ1sxXSAtIGRhbXBLICogZ2V0dnkoeSwgaSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEZWNrcyBhcmUgdXBkYXRlZCBpbiBobWFwIGluIHRoZSBiZWxvdyBsb29wIHRocm91Z2ggYmVhbXMsIHNvIGNsZWFyIHRoZSBwcmV2aW91cyB2YWx1ZXMuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGggb2YgaG1hcCkge1xuICAgICAgICAgICAgICAgIGguZGVja0NvdW50ID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBiZWFtIHN0cmVzcy5cbiAgICAgICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHAxID0gYmVhbS5wMTtcbiAgICAgICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICAgICAgLy8gQWRkIGRlY2tzIHRvIGFjY2xlcmF0aW9uIHN0cnVjdHVyZVxuICAgICAgICAgICAgICAgIGlmIChiZWFtLmRlY2spIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaTEgPSBNYXRoLmZsb29yKGdldGR4KHksIHAxKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKGdldGR4KHksIHAyKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVnaW4gPSBNYXRoLm1pbihpMSwgaTIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBNYXRoLm1heChpMSwgaTIpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhtYXBBZGREZWNrKGksIGJlZ2luLCBiZWFtKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocDEgPCAwICYmIHAyIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBCb3RoIGVuZHMgYXJlIG5vdCBtb3ZlYWJsZS5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IEUgPSBtYXRlcmlhbHNbYmVhbS5tXS5FO1xuICAgICAgICAgICAgICAgIGNvbnN0IHcgPSBiZWFtLnc7XG4gICAgICAgICAgICAgICAgY29uc3QgbDAgPSBiZWFtLmw7XG4gICAgICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBwMikgLSBnZXRkeCh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBwMikgLSBnZXRkeSh5LCBwMSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICAgICAgY29uc3QgayA9IEUgKiB3IC8gbDA7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ByaW5nRiA9IChsIC0gbDApICogaztcbiAgICAgICAgICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgICAgICAgICBjb25zdCB1eSA9IGR5IC8gbDtcblxuICAgICAgICAgICAgICAgIC8vIEJlYW0gc3RyZXNzIGZvcmNlLlxuICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIHAxLCB1eCAqIHNwcmluZ0YsIHV5ICogc3ByaW5nRik7XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgcDIsIC11eCAqIHNwcmluZ0YsIC11eSAqIHNwcmluZ0YpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIHRlcnJhaW4gY29sbGlzaW9uXG4gICAgICAgICAgICAvLyBUT0RPOiBzY2VuZSBib3JkZXIgY29sbGlzaW9uXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vdmluZ1BpbnM7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgaSk7IC8vIFBpbiBwb3NpdGlvbi5cbiAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBtYXNzW2ldO1xuICAgICAgICAgICAgICAgIGxldCBib3VuY2VGID0gMTAwMC4wICogbTsgLy8gRm9yY2UgcGVyIG1ldHJlIG9mIGRlcHRoIHVuZGVyIHRlcnJhaW4uXG4gICAgICAgICAgICAgICAgbGV0IG54OyAvLyBUZXJyYWluIHVuaXQgbm9ybWFsIChkaXJlY3Rpb24gb2YgYWNjZWxlcmF0aW9uKS5cbiAgICAgICAgICAgICAgICBsZXQgbnk7XG4gICAgICAgICAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gMC4wO1xuICAgICAgICAgICAgICAgICAgICBueSA9IC0xLjA7XG4gICAgICAgICAgICAgICAgICAgIGJvdW5jZUYgKj0gZHkgLSBoZWlnaHQgKyBobWFwWzBdLmhlaWdodDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aSA9IE1hdGgubWluKGhtYXAubGVuZ3RoIC0gMSwgTWF0aC5mbG9vcihkeCAvIHBpdGNoKSk7XG4gICAgICAgICAgICAgICAgICAgIG54ID0gaG1hcFt0aV0ubng7XG4gICAgICAgICAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAgICAgICAgIC8vIERpc3RhbmNlIGJlbG93IHRlcnJhaW4gaXMgbm9ybWFsIGRvdCB2ZWN0b3IgZnJvbSB0ZXJyYWluIHRvIHBvaW50LlxuICAgICAgICAgICAgICAgICAgICBib3VuY2VGICo9IC0obnggKiAoZHggLSB0aSAqIHBpdGNoKSArIG55ICogKGR5IC0gaG1hcFt0aV0uaGVpZ2h0KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChib3VuY2VGIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSBhcmUgbm90IGJvdW5jaW5nLlxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgbnggKiBib3VuY2VGLCBueSAqIGJvdW5jZUYpO1xuXG4gICAgICAgICAgICAgICAgLy8gRnJpY3Rpb24uXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgYWNjZWxlcmF0aW9uIGluIHByb3BvcnRpb24gdG8gYXQsIGluIGRpcmVjdGlvbiBvcHBvc2l0ZSBvZiB0YW5nZW50IHByb2plY3RlZCB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZ4ID0gZ2V0dngoeSwgaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdnkgPSBnZXR2eSh5LCBpKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0diA9IHZ4ICogdHggKyB2eSAqIHR5O1xuICAgICAgICAgICAgICAgIGxldCBmcmljdGlvbkYgPSB0RnJpY3Rpb24gKiBib3VuY2VGICogKHR2ID4gMCA/IC0xIDogMSk7XG4gICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgaSwgdHggKiBmcmljdGlvbkYsIHR5ICogZnJpY3Rpb25GKTtcblxuICAgICAgICAgICAgICAgIC8vIE9sZCBDb2RlXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogd2h5IGRpZCB0aGlzIG5lZWQgdG8gY2FwIHRoZSBhY2NlbGVyYXRpb24/IG1heWJlIGJvdW5jZSBmb3JjZSBpcyB0b28gaGlnaD9cbiAgICAgICAgICAgICAgICAvL2NvbnN0IGFmID0gTWF0aC5taW4odEZyaWN0aW9uICogYXQsIE1hdGguYWJzKHR2ICogMTAwKSkgKiAodHYgPj0gMC4wID8gLTEuMCA6IDEuMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gZGlzYy5yO1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBtYXNzW2Rpc2MucF07XG4gICAgICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBkaXNjLnApO1xuICAgICAgICAgICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgaG1hcCBidWNrZXRzIHRoYXQgZGlzYyBvdmVybGFwcy5cbiAgICAgICAgICAgICAgICBjb25zdCBpMSA9IE1hdGguZmxvb3IoKGR4IC0gcikgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKChkeCArIHIpIC8gcGl0Y2gpO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpMTsgaSA8PSBpMjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNrcyA9IGhtYXBbaV0uZGVja3M7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlY2tDb3VudCA9IGhtYXBbaV0uZGVja0NvdW50O1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRlY2tDb3VudDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaSAhPT0gTWF0aC5tYXgoaTEsIGhtYXBbaV0uZGVja3NMZWZ0W2pdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgY29tcHV0ZSBjb2xsaXNpb24gaWYgdGhlIGJ1Y2tldCB3ZSBhcmUgaW4gaXMgdGhlIGxlZnRtb3N0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb25lIHRoYXQgY29udGFpbnMgYm90aCB0aGUgZGVjayBhbmQgdGhlIGRpc2MuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNrID0gZGVja3Nbal07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkeSA9IGdldGR5KHksIGRpc2MucCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB4MSA9IGdldGR4KHksIGRlY2sucDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeTEgPSBnZXRkeSh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHgyID0gZ2V0ZHgoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB5MiA9IGdldGR5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJcyBjb2xsaXNpb24gaGFwcGVuaW5nP1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ggPSB4MiAtIHgxOyAvLyBWZWN0b3IgdG8gZW5kIG9mIGRlY2sgKGZyb20gc3RhcnQpXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzeSA9IHkyIC0geTE7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IGR4IC0geDE7IC8vIFZlY3RvciB0byBjZW50cmUgb2YgZGlzYyAoZnJvbSBzdGFydCBvZiBkZWNrKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3kgPSBkeSAtIHkxO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYSA9IHN4ICogc3ggKyBzeSAqIHN5O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYiA9IC0yLjAgKiAoY3ggKiBzeCArIGN5ICogc3kpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYyA9IGN4ICogY3ggKyBjeSAqIGN5IC0gciAqIHI7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBEID0gYiAqIGIgLSA0LjAgKiBhICogYztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChEIDw9IDAuMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAgIC8vIE5vIFJlYWwgc29sdXRpb25zIHRvIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3REID0gTWF0aC5zcXJ0KEQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHQgPSAtYiAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0MSA9ICgtYiAtIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0MiA9ICgtYiArIHJvb3REKSAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgodDEgPD0gMC4wICYmIHQyIDw9IDAuMCkgfHwgKHQxID49IDEuMCAmJiB0MiA+PSAwLjApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7ICAgLy8gSW50ZXJzZWN0aW9ucyBhcmUgYm90aCBiZWZvcmUgb3IgYWZ0ZXIgZGVjay5cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHQgPSBNYXRoLm1heChNYXRoLm1pbih0LCAxLjApLCAwLjApO1xuICAgICAgICAgICAgICAgICAgICAgICAgdDEgPSBNYXRoLm1heCh0MSwgMC4wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHQyID0gTWF0aC5taW4odDIsIDEuMCk7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGNvbGxpc2lvbiBhY2NlbGVyYXRpb24uXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gaXMgcHJvcG9ydGlvbmFsIHRvIGFyZWEgJ3NoYWRvd2VkJyBpbiB0aGUgZGlzYyBieSB0aGUgaW50ZXJzZWN0aW5nIGRlY2suXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIHNvIHRoYXQgYXMgYSBkaXNjIG1vdmVzIGJldHdlZW4gdHdvIGRlY2sgc2VnbWVudHMsIHRoZSBhY2NlbGVyYXRpb24gcmVtYWlucyBjb25zdGFudC5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQxeCA9ICgxIC0gdDEpICogeDEgKyB0MSAqIHgyIC0gZHg7ICAgLy8gQ2lyY2xlIGNlbnRyZSAtPiB0MSBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXkgPSAoMSAtIHQxKSAqIHkxICsgdDEgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdDJ4ID0gKDEgLSB0MikgKiB4MSArIHQyICogeDIgLSBkeDsgICAvLyBDaXJjbGUgY2VudHJlIC0+IHQyIGludGVyc2VjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQyeSA9ICgxIC0gdDIpICogeTEgKyB0MiAqIHkyIC0gZHk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YSA9IE1hdGguYWJzKE1hdGguYXRhbjIodDF5LCB0MXgpIC0gTWF0aC5hdGFuMih0MnksIHQyeCkpICUgTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyZWEgPSAwLjUgKiByICogciAqIHRhIC0gMC41ICogTWF0aC5hYnModDF4ICogdDJ5IC0gdDF5ICogdDJ4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGYgPSAxMDAwLjAgKiBtICogYXJlYSAvIHI7ICAgLy8gVE9ETzogZmlndXJlIG91dCB0aGUgZm9yY2UuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbnggPSBjeCAtIHN4ICogdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBueSA9IGN5IC0gc3kgKiB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChueCAqIG54ICsgbnkgKiBueSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBueCAvPSBsO1xuICAgICAgICAgICAgICAgICAgICAgICAgbnkgLz0gbDtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFwcGx5IGZvcmNlIHRvIHRoZSBkaXNjLlxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgZGlzYy5wLCBueCAqIGYsIG55ICogZik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGRlY2sucDEsIC1ueCAqIGYgKiAoMSAtIHQpLCAtbnkgKiBmICogKDEgLSB0KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JjZShkeWR0LCBkZWNrLnAyLCAtbnggKiBmICogdCwgLW55ICogZiAqIHQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wdXRlIGZyaWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHJlbGF0aXZlIHZlbG9jaXR5LlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dngoeSwgZGVjay5wMSkgLSB0ICogZ2V0dngoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIGRpc2MucCkgLSAoMS4wIC0gdCkgKiBnZXR2eSh5LCBkZWNrLnAxKSAtIHQgKiBnZXR2eSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vY29uc3Qgdm4gPSB2eCAqIG54ICsgdnkgKiBueTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4ID0gbnk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ0ID0gdnggKiB0eCArIHZ5ICogdHkgLSBkaXNjLnY7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUb3RhbGx5IHVuc2NpZW50aWZpYyB3YXkgdG8gY29tcHV0ZSBmcmljdGlvbiBmcm9tIGFyYml0cmFyeSBjb25zdGFudHMuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmcmljdGlvbiA9IE1hdGguc3FydChtYXRlcmlhbHNbZGlzYy5tXS5mcmljdGlvbiAqIG1hdGVyaWFsc1tkZWNrLm1dLmZyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZmID0gZiAqIGZyaWN0aW9uICogKHZ0IDw9IDAuMCA/IDEuMCA6IC0xLjApO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9jb25zdCBkYW1wID0gMjsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byBkZXJpdmUgYSByZWFzb25hYmxlIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2UoZHlkdCwgZGlzYy5wLCB0eCAqIGZmLCB0eSAqIGZmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGRlY2sucDEsIC10eCAqIGZmICogKDEgLSB0KSwgLXR5ICogZmYgKiAoMSAtIHQpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcmNlKGR5ZHQsIGRlY2sucDIsIC10eCAqIGZmICogdCwgLXR5ICogZmYgKiB0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubWV0aG9kID0gbmV3IFJ1bmdlS3V0dGE0KHkwLCB0aGlzLmR5ZHQpO1xuICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5tZXRob2QudCwgbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1ldGhvZC55KSk7XG4gICAgfVxuXG4gICAgc2Vla1RpbWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8bnVtYmVyPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmtleWZyYW1lcy5rZXlzKCk7XG4gICAgfVxuXG4gICAgc2Vlayh0OiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkge1xuICAgICAgICBjb25zdCB5ID0gdGhpcy5rZXlmcmFtZXMuZ2V0KHQpO1xuICAgICAgICBpZiAoeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dH0gaXMgbm90IGEga2V5ZnJhbWUgdGltZWApO1xuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgeS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5tZXRob2QueVtpXSA9IHlbaV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tZXRob2QudCA9IHQ7XG5cbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMucGF1c2UoZWMpO1xuICAgICAgICAgICAgdGhpcy5wbGF5KGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRpbWUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWV0aG9kLnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBuZXh0KCkgeyAgICAvLyBUT0RPOiBtYWtlIHRoaXMgcHJpdmF0ZT9cbiAgICAgICAgY29uc3QgcHJldlQgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB0aGlzLm1ldGhvZC5uZXh0KHRoaXMuaCk7XG4gICAgICAgIGNvbnN0IGlzS2V5ZnJhbWUgPSBNYXRoLmZsb29yKHByZXZUIC8gdGhpcy5rZXlJbnRlcnZhbCkgIT09IE1hdGguZmxvb3IodGhpcy5tZXRob2QudCAvIHRoaXMua2V5SW50ZXJ2YWwpO1xuICAgICAgICBpZiAodGhpcy50TGF0ZXN0IDwgdGhpcy5tZXRob2QudCkge1xuICAgICAgICAgICAgaWYgKGlzS2V5ZnJhbWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmtleWZyYW1lcy5zZXQodGhpcy5tZXRob2QudCwgbmV3IEZsb2F0MzJBcnJheSh0aGlzLm1ldGhvZC55KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRMYXRlc3QgPSB0aGlzLm1ldGhvZC50O1xuICAgICAgICB9IGVsc2UgaWYgKGlzS2V5ZnJhbWUpIHtcbiAgICAgICAgICAgIGNvbnN0IHkgPSB0aGlzLmtleWZyYW1lcy5nZXQodGhpcy5tZXRob2QudCk7XG4gICAgICAgICAgICBpZiAoeSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGZyYW1lICR7dGhpcy5tZXRob2QudH0gc2hvdWxkIGJlIGEga2V5ZnJhbWVgKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgZGlmZiA9IGZhbHNlO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKHlbaV0gIT09IHRoaXMubWV0aG9kLnlbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGlmZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRpZmYpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUmVwbGF5aW5nIGZyYW1lICR7dGhpcy5tZXRob2QudH0gcHJvZHVjZWQgYSBkaWZmZXJlbmNlIWApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUmVwbGF5aW5nIGZyYW1lICR7dGhpcy5tZXRob2QudH0gcHJvZHVjZWQgdGhlIHNhbWUgc3RhdGVgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBsYXlpbmcoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHBsYXkoZWM6IEVsZW1lbnRDb250ZXh0KSB7XG4gICAgICAgIGlmICh0aGlzLnBsYXlUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wbGF5VGltZSA9IHRoaXMubWV0aG9kLnQ7XG4gICAgICAgIHRoaXMucGxheVRpbWVyID0gZWMudGltZXIodGhpcy5wbGF5VGljaywgdW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBwYXVzZShlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMucGxheVRpbWVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBlYy5jbGVhclRpbWVyKHRoaXMucGxheVRpbWVyKTtcbiAgICAgICAgdGhpcy5wbGF5VGltZXIgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgZ2V0UGluKHBpbjogbnVtYmVyKTogUG9pbnQyRCB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICBjb25zdCBpID0gdGhpcy5maXhlZFBpbnMubGVuZ3RoICsgcGluICogMjtcbiAgICAgICAgICAgIHJldHVybiBbdGhpcy5maXhlZFBpbnNbaV0sIHRoaXMuZml4ZWRQaW5zW2krMV1dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaSA9IHBpbiAqIDI7XG4gICAgICAgICAgICBjb25zdCB5ID0gdGhpcy5tZXRob2QueTtcbiAgICAgICAgICAgIHJldHVybiBbeVtpXSwgeVtpKzFdXTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbnR5cGUgT25BZGRQaW5IYW5kbGVyID0gKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB2b2lkO1xudHlwZSBPblJlbW92ZVBpbkhhbmRsZXIgPSAoZWRpdEluZGV4OiBudW1iZXIsIHBpbjogbnVtYmVyLCBlYzogRWxlbWVudENvbnRleHQpID0+IHZvaWQ7XG5cbmV4cG9ydCBjbGFzcyBTY2VuZUVkaXRvciB7XG4gICAgc2NlbmU6IFNjZW5lSlNPTjtcbiAgICBwcml2YXRlIHNpbTogU2NlbmVTaW11bGF0b3IgfCB1bmRlZmluZWQ7XG4gICAgcHJpdmF0ZSBvbkFkZFBpbkhhbmRsZXJzOiBBcnJheTxPbkFkZFBpbkhhbmRsZXI+O1xuICAgIHByaXZhdGUgb25SZW1vdmVQaW5IYW5kbGVyczogQXJyYXk8T25SZW1vdmVQaW5IYW5kbGVyPjtcbiAgICBlZGl0TWF0ZXJpYWw6IG51bWJlcjtcbiAgICBlZGl0V2lkdGg6IG51bWJlcjtcbiAgICBlZGl0RGVjazogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBTY2VuZUpTT04pIHtcbiAgICAgICAgdGhpcy5zY2VuZSA9IHNjZW5lO1xuICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzID0gW107XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycyA9IFtdO1xuICAgICAgICAvLyBUT0RPOiBwcm9wZXIgaW5pdGlhbGl6YXRpb247XG4gICAgICAgIHRoaXMuZWRpdE1hdGVyaWFsID0gMDtcbiAgICAgICAgdGhpcy5lZGl0V2lkdGggPSAxO1xuICAgICAgICB0aGlzLmVkaXREZWNrID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzaW11bGF0b3IoKTogU2NlbmVTaW11bGF0b3Ige1xuICAgICAgICBpZiAodGhpcy5zaW0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zaW0gPSBuZXcgU2NlbmVTaW11bGF0b3IodGhpcy5zY2VuZSwgMC4wMDEsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNpbTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwMSA9IGEucDE7XG4gICAgICAgIGNvbnN0IHAyID0gYS5wMjtcbiAgICAgICAgY29uc3QgbSA9IGEubTtcbiAgICAgICAgY29uc3QgdyA9IGEudztcbiAgICAgICAgY29uc3QgbCA9IGEubDtcbiAgICAgICAgY29uc3QgZGVjayA9IGEuZGVjaztcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAxKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRQaW4odHJ1c3MsIHAyKTtcbiAgICAgICAgdHJ1c3NBc3NlcnRNYXRlcmlhbCh0cnVzcywgbSk7XG4gICAgICAgIGlmICh3IDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIHdpZHRoIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAsIGdvdCAke3d9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGwgIT09IHVuZGVmaW5lZCAmJiBsIDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBCZWFtIGxlbmd0aCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLCBnb3QgJHtsfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0cnVzc0JlYW1FeGlzdHModHJ1c3MsIHAxLCBwMikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQmVhbSBiZXR3ZWVuIHBpbnMgJHtwMX0gYW5kICR7cDJ9IGFscmVhZHkgZXhpc3RzYCk7XG4gICAgICAgIH1cbiAgICAgICAgdHJ1c3MuZWRpdEJlYW1zLnB1c2goe3AxLCBwMiwgbSwgdywgbCwgZGVja30pO1xuICAgICAgICBcbiAgICAgICAgZWMucmVxdWVzdERyYXcoKTsgICAvLyBUT0RPOiBoYXZlIGxpc3RlbmVycywgYW5kIHRoZW4gdGhlIFVJIGNvbXBvbmVudCBjYW4gZG8gdGhlIHJlcXVlc3REcmF3KClcbiAgICB9XG4gICAgXG4gICAgcHJpdmF0ZSB1bmRvQWRkQmVhbShhOiBBZGRCZWFtQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBiID0gdHJ1c3MuZWRpdEJlYW1zLnBvcCgpO1xuICAgICAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGJlYW1zIGV4aXN0Jyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGIucDEgIT09IGEucDEgfHwgYi5wMiAhPT0gYS5wMiB8fCBiLm0gIT09IGEubSB8fCBiLncgIT0gYS53IHx8IGIubCAhPT0gYS5sIHx8IGIuZGVjayAhPT0gYS5kZWNrKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JlYW0gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpOyAgIC8vIFRPRE86IGhhdmUgbGlzdGVuZXJzLCBhbmQgdGhlbiB0aGUgVUkgY29tcG9uZW50IGNhbiBkbyB0aGUgcmVxdWVzdERyYXcoKVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIHRydXNzLmVkaXRQaW5zLnB1c2goYS5waW4pO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgdGhpcy5vbkFkZFBpbkhhbmRsZXJzKSB7XG4gICAgICAgICAgICBoKGVkaXRJbmRleCwgcGluLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9BZGRQaW4oYTogQWRkUGluQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICBjb25zdCBwID0gdHJ1c3MuZWRpdFBpbnMucG9wKCk7XG4gICAgICAgIGlmIChwID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcGlucyBleGlzdCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwWzBdICE9PSBhLnBpblswXSB8fCBwWzFdICE9PSBhLnBpblsxXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQaW4gZG9lcyBub3QgbWF0Y2gnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlZGl0SW5kZXggPSB0cnVzcy5lZGl0UGlucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBpbiA9IHRydXNzLnN0YXJ0UGlucy5sZW5ndGggKyBlZGl0SW5kZXg7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiB0aGlzLm9uUmVtb3ZlUGluSGFuZGxlcnMpIHtcbiAgICAgICAgICAgIGgoZWRpdEluZGV4LCBwaW4sIGVjKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuZG9BY3Rpb24oYS5hY3Rpb25zW2ldLCBlYyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIHVuZG9Db21wb3NpdGUoYTogQ29tcG9zaXRlQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IGEuYWN0aW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdGhpcy51bmRvQWN0aW9uKGEuYWN0aW9uc1tpXSwgZWMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkb0FjdGlvbihhOiBUcnVzc0FjdGlvbiwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHN3aXRjaCAoYS50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX2JlYW1cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmRvQWRkQmVhbShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYWRkX3BpblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMuZG9Db21wb3NpdGUoYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bmRvQWN0aW9uKGE6IFRydXNzQWN0aW9uLCBlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgc3dpdGNoIChhLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJhZGRfYmVhbVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0FkZEJlYW0oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFkZF9waW5cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnVuZG9BZGRQaW4oYSwgZWMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImNvbXBvc2l0ZVwiOlxuICAgICAgICAgICAgICAgIHRoaXMudW5kb0NvbXBvc2l0ZShhLCBlYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTY2VuZSBlbnVtZXJhdGlvbi9vYnNlcnZhdGlvbiBtZXRob2RzXG5cbiAgICBvbkFkZFBpbihoYW5kbGVyOiBPbkFkZFBpbkhhbmRsZXIpIHtcbiAgICAgICAgdGhpcy5vbkFkZFBpbkhhbmRsZXJzLnB1c2goaGFuZGxlcik7XG4gICAgfVxuXG4gICAgb25SZW1vdmVQaW4oaGFuZGxlcjogT25SZW1vdmVQaW5IYW5kbGVyKSB7XG4gICAgICAgIHRoaXMub25SZW1vdmVQaW5IYW5kbGVycy5wdXNoKGhhbmRsZXIpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IENsZWFyIGhhbmRsZXJzP1xuXG4gICAgdW5kb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnVuZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgcmVkb0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjZW5lLnJlZG9TdGFjay5sZW5ndGg7XG4gICAgfVxuXG4gICAgLy8gU2NlbmUgbXV0YXRpb24gbWV0aG9kc1xuXG4gICAgdW5kbyhlYzogRWxlbWVudENvbnRleHQpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgYSA9IHRoaXMuc2NlbmUudW5kb1N0YWNrLnBvcCgpO1xuICAgICAgICBpZiAoYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJubyBhY3Rpb24gdG8gdW5kb1wiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVuZG9BY3Rpb24oYSwgZWMpO1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjay5wdXNoKGEpO1xuICAgICAgICAvLyBUT0RPOiB1cGRhdGUgc2ltdWxhdG9yIHdpdGggc2F2ZWQgc3RhdGUuXG4gICAgICAgIGlmICh0aGlzLnNpbSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNpbS5wYXVzZShlYyk7XG4gICAgICAgICAgICB0aGlzLnNpbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlZG8oZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLnNjZW5lLnJlZG9TdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwibm8gYWN0aW9uIHRvIHJlZG9cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kb0FjdGlvbihhLCBlYyk7XG4gICAgICAgIHRoaXMuc2NlbmUudW5kb1N0YWNrLnB1c2goYSk7XG4gICAgICAgIC8vIFRPRE86IHVwZGF0ZSBzaW11bGF0b3Igd2l0aCBzYXZlZCBzdGF0ZS5cbiAgICAgICAgaWYgKHRoaXMuc2ltICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc2ltLnBhdXNlKGVjKTtcbiAgICAgICAgICAgIHRoaXMuc2ltID0gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhY3Rpb24oYTogVHJ1c3NBY3Rpb24sIGVjOiBFbGVtZW50Q29udGV4dCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNjZW5lLnJlZG9TdGFjayA9IFthXTtcbiAgICAgICAgdGhpcy5yZWRvKGVjKTsgICAgLy8gVE9ETzogSXMgdGhpcyB0b28gY2xldmVyP1xuICAgIH1cblxuICAgIGFkZEJlYW0oXG4gICAgICAgIHAxOiBudW1iZXIsXG4gICAgICAgIHAyOiBudW1iZXIsXG4gICAgICAgIGVjOiBFbGVtZW50Q29udGV4dCxcbiAgICApOiB2b2lkIHtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSB0aGlzLnNjZW5lLnRydXNzO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDEpO1xuICAgICAgICB0cnVzc0Fzc2VydFBpbih0cnVzcywgcDIpO1xuICAgICAgICBpZiAodHJ1c3NCZWFtRXhpc3RzKHRydXNzLCBwMSwgcDIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEJlYW0gYmV0d2VlbiBwaW5zICR7cDF9IGFuZCAke3AyfSBhbHJlYWR5IGV4aXN0c2ApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9uKHtcbiAgICAgICAgICAgIHR5cGU6IFwiYWRkX2JlYW1cIixcbiAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgcDIsXG4gICAgICAgICAgICBtOiB0aGlzLmVkaXRNYXRlcmlhbCxcbiAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgbDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgZGVjazogdGhpcy5lZGl0RGVja1xuICAgICAgICB9LCBlYyk7XG4gICAgfVxuXG4gICAgYWRkUGluKHBpbjogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KTogdm9pZCB7XG4gICAgICAgIHRoaXMuYWN0aW9uKHt0eXBlOiBcImFkZF9waW5cIiwgcGlufSwgZWMpO1xuICAgIH1cblxuICAgIGFkZFBpbkFuZEJlYW0oXG4gICAgICAgIHBpbjogUG9pbnQyRCxcbiAgICAgICAgcDI6IG51bWJlcixcbiAgICAgICAgZWM6IEVsZW1lbnRDb250ZXh0LFxuICAgICk6IHZvaWQge1xuICAgICAgICBjb25zdCB0cnVzcyA9IHRoaXMuc2NlbmUudHJ1c3M7XG4gICAgICAgIHRydXNzQXNzZXJ0UGluKHRydXNzLCBwMik7XG4gICAgICAgIGNvbnN0IHAxID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAgICAgdGhpcy5hY3Rpb24oe3R5cGU6IFwiY29tcG9zaXRlXCIsIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIHsgdHlwZTogXCJhZGRfcGluXCIsIHBpbn0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJhZGRfYmVhbVwiLFxuICAgICAgICAgICAgICAgIHAxLFxuICAgICAgICAgICAgICAgIHAyLFxuICAgICAgICAgICAgICAgIG06IHRoaXMuZWRpdE1hdGVyaWFsLFxuICAgICAgICAgICAgICAgIHc6IHRoaXMuZWRpdFdpZHRoLFxuICAgICAgICAgICAgICAgIGw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICBkZWNrOiB0aGlzLmVkaXREZWNrXG4gICAgICAgICAgICB9LFxuICAgICAgICBdfSwgZWMpO1xuICAgIH1cbn07XG5cbi8qXG5leHBvcnQgZnVuY3Rpb24gc2NlbmVNZXRob2Qoc2NlbmU6IFNjZW5lKTogT0RFTWV0aG9kIHtcbiAgICBjb25zdCB0cnVzcyA9IHNjZW5lLnRydXNzO1xuICAgIFxuICAgIGNvbnN0IGZpeGVkUGlucyA9IHRydXNzLmZpeGVkUGlucztcbiAgICBjb25zdCBtb2JpbGVQaW5zID0gdHJ1c3Muc3RhcnRQaW5zLmxlbmd0aCArIHRydXNzLmVkaXRQaW5zLmxlbmd0aDtcbiAgICAvLyBTdGF0ZSBhY2Nlc3NvcnNcbiAgICBmdW5jdGlvbiBnZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHBpbiA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiBmaXhlZFBpbnNbZml4ZWRQaW5zLmxlbmd0aCArIHBpbl1bMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geVtwaW4gKiAyICsgMF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0ZHkoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChwaW4gPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gZml4ZWRQaW5zW2ZpeGVkUGlucy5sZW5ndGggKyBwaW5dWzFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHlbcGluICogMiArIDFdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ4KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIDAuMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDFdOyBcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRkeCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldGR5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVtwaW4gKiAyICsgMV0gPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2V0dngoeTogRmxvYXQzMkFycmF5LCBwaW46IG51bWJlciwgdmFsOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHBpbiA+PSAwKSB7XG4gICAgICAgICAgICB5W21vYmlsZVBpbnMgKiAyICsgcGluICogMiArIDBdID0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIHNldHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSA9IHZhbDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGR2eCh5OiBGbG9hdDMyQXJyYXksIHBpbjogbnVtYmVyLCB2YWw6IG51bWJlcikge1xuICAgICAgICBpZiAocGluID49IDApIHtcbiAgICAgICAgICAgIHlbbW9iaWxlUGlucyAqIDIgKyBwaW4gKiAyICsgMF0gKz0gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkZHZ5KHk6IEZsb2F0MzJBcnJheSwgcGluOiBudW1iZXIsIHZhbDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChwaW4gPj0gMCkge1xuICAgICAgICAgICAgeVttb2JpbGVQaW5zICogMiArIHBpbiAqIDIgKyAxXSArPSB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU3BsaXQgYmVhbSBtYXNzIGV2ZW5seSBiZXR3ZWVuIHBpbnMsIGluaXRpYWxpc2UgYmVhbSBsZW5ndGguXG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIGNvbnN0IG1hc3MgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMpO1xuICAgIGZ1bmN0aW9uIGdldG0ocGluOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAocGluIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgcmV0dXJuIG1hc3NbcGluXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiA1Ljk3MmUyNDsgICAgLy8gTWFzcyBvZiB0aGUgRWFydGguXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBiZWFtcyA9IFsuLi50cnVzcy5zdGFydEJlYW1zLCAuLi50cnVzcy5lZGl0QmVhbXNdLm1hcCgoYmVhbTogQmVhbSk6IFNpbXVsYXRpb25CZWFtID0+IHtcbiAgICAgICAgY29uc3QgcDEgPSBiZWFtLnAxO1xuICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgIGNvbnN0IGwgPSBwb2ludERpc3RhbmNlKHNjZW5lLmdldFBpbihwMSksIHNjZW5lLmdldFBpbihwMikpO1xuICAgICAgICBjb25zdCBtID0gbCAqIGJlYW0udyAqIG1hdGVyaWFsc1tiZWFtLm1dLmRlbnNpdHk7XG4gICAgICAgIGlmIChwMSA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgIG1hc3NbcDFdICs9IG0gKiAwLjU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgbWFzc1twMl0gKz0gbSAqIDAuNTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBwMSwgcDIsIG06IGJlYW0ubSwgdzogYmVhbS53LCBsOiBiZWFtLmwgfHwgbCwgZGVjazogYmVhbS5kZWNrIHx8IGZhbHNlIH07XG4gICAgfSk7XG5cbiAgICAvLyBEaXNjIG1hc3MuXG4gICAgY29uc3QgZGlzY3MgPSBzY2VuZS50cnVzcy5kaXNjcztcbiAgICBmb3IgKGNvbnN0IGRpc2Mgb2YgZGlzY3MpIHtcbiAgICAgICAgaWYgKGRpc2MucCA+PSBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEaXNjIGF0dGFjaGVkIHRvIG5vbiBtb2JpbGUgcGluXCIpO1xuICAgICAgICB9XG4gICAgICAgIG1hc3NbZGlzYy5wXSArPSBkaXNjLnIgKiBkaXNjLnIgKiBNYXRoLlBJICogbWF0ZXJpYWxzW2Rpc2MubV0uZGVuc2l0eTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayB0aGF0IGV2ZXJ5dGhpbmcgdGhhdCBjYW4gbW92ZSBoYXMgc29tZSBtYXNzLlxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgIGlmIChtYXNzW2ldIDw9IDAuMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNb2JpbGUgcGluICR7aX0gaGFzIG1hc3MgJHttYXNzW2ldfSA8PSAwLjBgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHBpdGNoID0gc2NlbmUud2lkdGggLyAoc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCAtIDEpO1xuICAgIGNvbnN0IGhtYXA6IFNpbXVsYXRpb25ITWFwID0gc2NlbmUudGVycmFpbi5obWFwLm1hcCgoaCwgaSkgPT4ge1xuICAgICAgICBpZiAoaSArIDEgPj0gc2NlbmUudGVycmFpbi5obWFwLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgbng6IDAuMCxcbiAgICAgICAgICAgICAgICBueTogMS4wLFxuICAgICAgICAgICAgICAgIGRlY2tzOiBbXSxcbiAgICAgICAgICAgICAgICBkZWNrQ291bnQ6IDAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGR5ID0gc2NlbmUudGVycmFpbi5obWFwW2kgKyAxXSAtIGg7XG4gICAgICAgIGNvbnN0IGwgPSBNYXRoLnNxcnQoZHkgKiBkeSArIHBpdGNoICogcGl0Y2gpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgbng6IC1keSAvIGwsXG4gICAgICAgICAgICBueTogcGl0Y2ggLyBsLFxuICAgICAgICAgICAgZGVja3M6IFtdLFxuICAgICAgICAgICAgZGVja0NvdW50OiAwLFxuICAgICAgICB9O1xuICAgIH0pO1xuICAgIGZ1bmN0aW9uIHJlc2V0RGVja3MoKSB7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBobWFwKSB7XG4gICAgICAgICAgICBoLmRlY2tDb3VudCA9IDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkRGVjayhpOiBudW1iZXIsIGQ6IFNpbXVsYXRpb25CZWFtKSB7XG4gICAgICAgIGlmIChpIDwgMCB8fCBpID49IGhtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaCA9IGhtYXBbaV07XG4gICAgICAgIGguZGVja3NbaC5kZWNrQ291bnRdID0gZDtcbiAgICAgICAgaC5kZWNrQ291bnQrKztcbiAgICB9XG4gICAgY29uc3QgdEZyaWN0aW9uID0gc2NlbmUudGVycmFpbi5mcmljdGlvbjtcblxuICAgIC8vIFNldCB1cCBpbml0aWFsIE9ERSBzdGF0ZSB2ZWN0b3IuXG4gICAgY29uc3QgeTAgPSBuZXcgRmxvYXQzMkFycmF5KG1vYmlsZVBpbnMgKiA0KTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICBjb25zdCBkID0gZ2V0UGluKHRydXNzLCBpKTtcbiAgICAgICAgc2V0ZHgoeTAsIGksIGRbMF0pO1xuICAgICAgICBzZXRkeSh5MCwgaSwgZFsxXSk7XG4gICAgfVxuICAgIC8vIE5COiBJbml0aWFsIHZlbG9jaXRpZXMgYXJlIGFsbCAwLCBubyBuZWVkIHRvIGluaXRpYWxpemUuXG5cbiAgICBjb25zdCBnID0gIHNjZW5lLmc7XG4gICAgcmV0dXJuIG5ldyBSdW5nZUt1dHRhNCh5MCwgZnVuY3Rpb24gKF90OiBudW1iZXIsIHk6IEZsb2F0MzJBcnJheSwgZHlkdDogRmxvYXQzMkFycmF5KSB7XG4gICAgICAgIC8vIERlcml2YXRpdmUgb2YgcG9zaXRpb24gaXMgdmVsb2NpdHkuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbW9iaWxlUGluczsgaSsrKSB7XG4gICAgICAgICAgICBzZXRkeChkeWR0LCBpLCBnZXR2eCh5LCBpKSk7XG4gICAgICAgICAgICBzZXRkeShkeWR0LCBpLCBnZXR2eSh5LCBpKSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byBncmF2aXR5LlxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgc2V0dngoZHlkdCwgaSwgZ1swXSk7XG4gICAgICAgICAgICBzZXR2eShkeWR0LCBpLCBnWzFdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERlY2tzIGFyZSB1cGRhdGVkIGluIGhtYXAgaW4gdGhlIGJlbG93IGxvb3AgdGhyb3VnaCBiZWFtcywgc28gY2xlYXIgdGhlIHByZXZpb3VzIHZhbHVlcy5cbiAgICAgICAgcmVzZXREZWNrcygpO1xuXG4gICAgICAgIC8vIEFjY2VsZXJhdGlvbiBkdWUgdG8gYmVhbSBzdHJlc3MuXG4gICAgICAgIGZvciAoY29uc3QgYmVhbSBvZiBiZWFtcykge1xuICAgICAgICAgICAgY29uc3QgRSA9IG1hdGVyaWFsc1tiZWFtLm1dLkU7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG4gICAgICAgICAgICBjb25zdCBwMiA9IGJlYW0ucDI7XG4gICAgICAgICAgICBjb25zdCB3ID0gYmVhbS53O1xuICAgICAgICAgICAgY29uc3QgbDAgPSBiZWFtLmw7XG4gICAgICAgICAgICBjb25zdCBkeCA9IGdldGR4KHksIHAyKSAtIGdldGR4KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgcDIpIC0gZ2V0ZHkoeSwgcDEpO1xuICAgICAgICAgICAgY29uc3QgbCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmFpbiA9IChsIC0gbDApIC8gbDA7XG4gICAgICAgICAgICAvL2NvbnN0IHN0cmVzcyA9IHN0cmFpbiAqIEUgKiB3O1xuICAgICAgICAgICAgY29uc3QgayA9IEUgKiB3IC8gbDA7XG4gICAgICAgICAgICBjb25zdCBzcHJpbmdGID0gKGwgLSBsMCkgKiBrO1xuICAgICAgICAgICAgY29uc3QgbTEgPSBnZXRtKHAxKTsgICAgLy8gUGluIG1hc3NcbiAgICAgICAgICAgIGNvbnN0IG0yID0gZ2V0bShwMik7XG4gICAgICAgICAgICBjb25zdCB1eCA9IGR4IC8gbDsgICAgICAvLyBVbml0IHZlY3RvciBpbiBkaXJlY3Rpbm8gb2YgYmVhbTtcbiAgICAgICAgICAgIGNvbnN0IHV5ID0gZHkgLyBsO1xuXG4gICAgICAgICAgICAvLyBCZWFtIHN0cmVzcyBmb3JjZS5cbiAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIHNwcmluZ0YgLyBtMSk7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMSwgdXkgKiBzcHJpbmdGIC8gbTEpO1xuICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIHNwcmluZ0YgLyBtMik7XG4gICAgICAgICAgICBhZGR2eShkeWR0LCBwMiwgLXV5ICogc3ByaW5nRiAvIG0yKTtcblxuICAgICAgICAgICAgLy8gRGFtcGluZyBmb3JjZS5cbiAgICAgICAgICAgIGNvbnN0IHpldGEgPSAwLjU7XG4gICAgICAgICAgICBjb25zdCB2eCA9IGdldHZ4KHksIHAyKSAtIGdldHZ4KHksIHAxKTsgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEuXG4gICAgICAgICAgICBjb25zdCB2eSA9IGdldHZ5KHksIHAyKSAtIGdldHZ5KHksIHAxKTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSB2eCAqIHV4ICsgdnkgKiB1eTsgICAgLy8gVmVsb2NpdHkgb2YgcDIgcmVsYXRpdmUgdG8gcDEgaW4gZGlyZWN0aW9uIG9mIGJlYW0uXG4gICAgICAgICAgICAvLyBUT0RPOiBub3cgdGhhdCBnZXRtIHJldHVybnMgbWFzcyBvZiBFYXJ0aCBmb3IgZml4ZWQgcGlucywgd2UgZG9uJ3QgbmVlZCB0aGVzZSBkaWZmZXJlbnQgaWYgY2xhdXNlcy5cbiAgICAgICAgICAgIGlmIChwMSA8IG1vYmlsZVBpbnMgJiYgcDIgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEgKiBtMiAvIChtMSArIG0yKSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDEsIHV4ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgcDEsIHV5ICogZGFtcEYgLyBtMSk7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocDEgPCBtb2JpbGVQaW5zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGFtcEYgPSB2ICogemV0YSAqIE1hdGguc3FydChrICogbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIHAxLCB1eCAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAxLCB1eSAqIGRhbXBGIC8gbTEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwMiA8IG1vYmlsZVBpbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkYW1wRiA9IHYgKiB6ZXRhICogTWF0aC5zcXJ0KGsgKiBtMik7XG4gICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgcDIsIC11eCAqIGRhbXBGIC8gbTIpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIHAyLCAtdXkgKiBkYW1wRiAvIG0yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGRlY2tzIHRvIGFjY2xlcmF0aW9uIHN0cnVjdHVyZVxuICAgICAgICAgICAgaWYgKGJlYW0uZGVjaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcihnZXRkeCh5LCBwMSkgLyBwaXRjaCk7XG4gICAgICAgICAgICAgICAgY29uc3QgaTIgPSBNYXRoLmZsb29yKGdldGR4KHksIHAyKSAvIHBpdGNoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBiZWdpbiA9IE1hdGgubWluKGkxLCBpMik7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kID0gTWF0aC5tYXgoaTEsIGkyKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gYmVnaW47IGkgPD0gZW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkRGVjayhpLCBiZWFtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQWNjZWxlcmF0aW9uIGR1ZSB0byB0ZXJyYWluIGNvbGxpc2lvbiwgc2NlbmUgYm9yZGVyIGNvbGxpc2lvblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1vYmlsZVBpbnM7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgZHggPSBnZXRkeCh5LCBpKTsgLy8gUGluIHBvc2l0aW9uLlxuICAgICAgICAgICAgY29uc3QgZHkgPSBnZXRkeSh5LCBpKTtcbiAgICAgICAgICAgIGxldCBhdCA9IDEwMDAuMDsgLy8gQWNjZWxlcmF0aW9uIHBlciBtZXRyZSBvZiBkZXB0aCB1bmRlciB0ZXJyYWluLlxuICAgICAgICAgICAgbGV0IG54OyAvLyBUZXJyYWluIHVuaXQgbm9ybWFsLlxuICAgICAgICAgICAgbGV0IG55O1xuICAgICAgICAgICAgaWYgKGR4IDwgMC4wKSB7XG4gICAgICAgICAgICAgICAgbnggPSAwLjA7XG4gICAgICAgICAgICAgICAgbnkgPSAxLjA7XG4gICAgICAgICAgICAgICAgYXQgKj0gLShueCAqIChkeCAtIDAuMCkgKyBueSAqIChkeSAtIGhtYXBbMF0uaGVpZ2h0KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRpID0gTWF0aC5taW4oaG1hcC5sZW5ndGggLSAxLCBNYXRoLmZsb29yKGR4IC8gcGl0Y2gpKTtcbiAgICAgICAgICAgICAgICBueCA9IGhtYXBbdGldLm54O1xuICAgICAgICAgICAgICAgIG55ID0gaG1hcFt0aV0ubnk7XG4gICAgICAgICAgICAgICAgYXQgKj0gLShueCAqIChkeCAtIHRpICogcGl0Y2gpICsgbnkgKiAoZHkgLSBobWFwW3RpXS5oZWlnaHQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhdCA+IDAuMCkge1xuICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGksIG54ICogYXQpO1xuICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGksIG55ICogYXQpO1xuICAgICAgICAgICAgICAgIC8vIEZyaWN0aW9uLlxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IGFjY2VsZXJhdGlvbiBpbiBwcm9wb3J0aW9uIHRvIGF0LCBpbiBkaXJlY3Rpb24gb3Bwb3NpdGUgb2YgdGFuZ2VudCBwcm9qZWN0ZWQgdmVsb2NpdHkuXG4gICAgICAgICAgICAgICAgLy8gQ2FwIGFjY2VsZXJhdGlvbiBieSBzb21lIGZyYWN0aW9uIG9mIHZlbG9jaXR5XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGFrZSBmcmljdGlvbiBmcm9tIGJlYW1zIHRvbyAoanVzdCBhdmVyYWdlIGJlYW1zIGdvaW5nIGludG8gcGluPylcbiAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5ID0gLW54O1xuICAgICAgICAgICAgICAgIGNvbnN0IHR2ID0gZ2V0dngoeSwgaSkgKiB0eCArIGdldHZ5KHksIGkpICogdHk7XG4gICAgICAgICAgICAgICAgY29uc3QgYWYgPSBNYXRoLm1pbih0RnJpY3Rpb24gKiBhdCwgTWF0aC5hYnModHYgKiAxMDApKSAqICh0diA+PSAwLjAgPyAtMS4wIDogMS4wKTtcbiAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBpLCB0eCAqIGFmKTtcbiAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBpLCB0eSAqIGFmKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBBY2NlbGVyYXRpb24gZHVlIHRvIGRpc2MtZGVjayBjb2xsaXNpb24uXG4gICAgICAgIGZvciAoY29uc3QgZGlzYyBvZiBkaXNjcykge1xuICAgICAgICAgICAgY29uc3QgciA9IGRpc2MucjtcbiAgICAgICAgICAgIGNvbnN0IGR4ID0gZ2V0ZHgoeSwgZGlzYy5wKTtcbiAgICAgICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgaG1hcCBidWNrZXRzIHRoYXQgZGlzYyBvdmVybGFwcy5cbiAgICAgICAgICAgIGNvbnN0IGkxID0gTWF0aC5mbG9vcigoZHggLSByKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGNvbnN0IGkyID0gTWF0aC5mbG9vcigoZHggKyByKSAvIHBpdGNoKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpMTsgaSA8PSBpMjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPCAwIHx8IGkgPj0gaG1hcC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgZGVja3MgaW4gdGhvc2UgYnVja2V0cy5cbiAgICAgICAgICAgICAgICBjb25zdCBkZWNrcyA9IGhtYXBbaV0uZGVja3M7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVja0NvdW50ID0gaG1hcFtpXS5kZWNrQ291bnQ7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBkZWNrQ291bnQ7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWNrID0gZGVja3Nbal07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZ2V0ZHkoeSwgZGlzYy5wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeDEgPSBnZXRkeCh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeTEgPSBnZXRkeSh5LCBkZWNrLnAxKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeDIgPSBnZXRkeCh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeTIgPSBnZXRkeSh5LCBkZWNrLnAyKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIElzIGNvbGxpc2lvbiBoYXBwZW5pbmc/XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN4ID0geDIgLSB4MTsgLy8gVmVjdG9yIHRvIGVuZCBvZiBkZWNrIChmcm9tIHN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzeSA9IHkyIC0geTE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN4ID0gZHggLSB4MTsgLy8gVmVjdG9yIHRvIGNlbnRyZSBvZiBkaXNjIChmcm9tIHN0YXJ0IG9mIGRlY2spXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN5ID0gZHkgLSB5MTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYSA9IHN4ICogc3ggKyBzeSAqIHN5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiID0gLTIuMCAqIChjeCAqIHN4ICsgY3kgKiBzeSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBjeCAqIGN4ICsgY3kgKiBjeSAtIHIgKiByO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBEID0gYiAqIGIgLSA0LjAgKiBhICogYztcbiAgICAgICAgICAgICAgICAgICAgaWYgKEQgPD0gMC4wKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBObyBSZWFsIHNvbHV0aW9ucyB0byBpbnRlcnNlY3Rpb24uXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm9vdEQgPSBNYXRoLnNxcnQoRCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSAtYiAvICgyLjAgKiBhKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHQxID0gKC1iIC0gcm9vdEQpIC8gKDIuMCAqIGEpO1xuICAgICAgICAgICAgICAgICAgICBsZXQgdDIgPSAoLWIgKyByb290RCkgLyAoMi4wICogYSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgodDEgPD0gMC4wICYmIHQyIDw9IDAuMCkgfHwgKHQxID49IDEuMCAmJiB0MiA+PSAwLjApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgICAvLyBJbnRlcnNlY3Rpb25zIGFyZSBib3RoIGJlZm9yZSBvciBhZnRlciBkZWNrLlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHQxID0gTWF0aC5tYXgodDEsIDAuMCk7XG4gICAgICAgICAgICAgICAgICAgIHQyID0gTWF0aC5taW4odDIsIDEuMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29tcHV0ZSBjb2xsaXNpb24gYWNjZWxlcmF0aW9uLlxuICAgICAgICAgICAgICAgICAgICAvLyBBY2NlbGVyYXRpb24gaXMgcHJvcG9ydGlvbmFsIHRvIGFyZWEgJ3NoYWRvd2VkJyBpbiB0aGUgZGlzYyBieSB0aGUgaW50ZXJzZWN0aW5nIGRlY2suXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgc28gdGhhdCBhcyBhIGRpc2MgbW92ZXMgYmV0d2VlbiB0d28gZGVjayBzZWdtZW50cywgdGhlIGFjY2VsZXJhdGlvbiByZW1haW5zIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXggPSAoMSAtIHQxKSAqIHgxICsgdDEgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDEgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MXkgPSAoMSAtIHQxKSAqIHkxICsgdDEgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MnggPSAoMSAtIHQyKSAqIHgxICsgdDIgKiB4MiAtIGR4OyAgIC8vIENpcmNsZSBjZW50cmUgLT4gdDIgaW50ZXJzZWN0aW9uLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0MnkgPSAoMSAtIHQyKSAqIHkxICsgdDIgKiB5MiAtIGR5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YSA9IE1hdGguYWJzKE1hdGguYXRhbjIodDF5LCB0MXgpIC0gTWF0aC5hdGFuMih0MnksIHQyeCkpICUgTWF0aC5QSTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXJlYSA9IDAuNSAqIHIgKiByICogdGEgLSAwLjUgKiBNYXRoLmFicyh0MXggKiB0MnkgLSB0MXkgKiB0MngpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbiA9IDEwMDAuMCAqIGFyZWE7ICAgLy8gVE9ETzogZmlndXJlIG91dCB3aGF0IGFjY2VsZXJhdGlvbiB0byB1c2VcbiAgICAgICAgICAgICAgICAgICAgbGV0IG54ID0gY3ggLSBzeCAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGxldCBueSA9IGN5IC0gc3kgKiB0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsID0gTWF0aC5zcXJ0KG54ICogbnggKyBueSAqIG55KTtcbiAgICAgICAgICAgICAgICAgICAgbnggLz0gbDtcbiAgICAgICAgICAgICAgICAgICAgbnkgLz0gbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBBcHBseSBhY2NlbGVyYXRpb25zIHRvIHRoZSBkaXNjLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtZCA9IGdldG0oZGlzYy5wKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbTEgPSBnZXRtKGRlY2sucDEpICogKDEuMCAtIHQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtMiA9IGdldG0oZGVjay5wMikgKiB0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZCA9IChtMSArIG0yKSAvIChtZCArIG0xICsgbTIpOyAgLy8gU2hhcmUgb2YgYWNjZWxlcmF0aW9uIGZvciBkaXNjLCBkZWNrIGVuZHBvaW50cy5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYTEgPSAobWQgKyBtMikgLyAobWQgKyBtMSArIG0yKSAqICgxLjAgLSB0KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYTIgPSAobWQgKyBtMSkgLyAobWQgKyBtMSArIG0yKSAqIHQ7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRpc2MucCwgbnggKiBhbiAqIGFkKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGlzYy5wLCBueSAqIGFuICogYWQpO1xuICAgICAgICAgICAgICAgICAgICAvLyBhcHBseSBhY2NsZXJhdGlvbiBkaXN0cmlidXRlZCB0byBwaW5zXG4gICAgICAgICAgICAgICAgICAgIGFkZHZ4KGR5ZHQsIGRlY2sucDEsIC1ueCAqIGFuICogYTEpO1xuICAgICAgICAgICAgICAgICAgICBhZGR2eShkeWR0LCBkZWNrLnAxLCAtbnkgKiBhbiAqIGExKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMiwgLW54ICogYW4gKiBhMik7XG4gICAgICAgICAgICAgICAgICAgIGFkZHZ5KGR5ZHQsIGRlY2sucDIsIC1ueSAqIGFuICogYTIpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbXB1dGUgZnJpY3Rpb24gYW5kIGRhbXBpbmcuXG4gICAgICAgICAgICAgICAgICAgIC8vIEdldCByZWxhdGl2ZSB2ZWxvY2l0eS5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnggPSBnZXR2eCh5LCBkaXNjLnApIC0gKDEuMCAtIHQpICogZ2V0dngoeSwgZGVjay5wMSkgLSB0ICogZ2V0dngoeSwgZGVjay5wMik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZ5ID0gZ2V0dnkoeSwgZGlzYy5wKSAtICgxLjAgLSB0KSAqIGdldHZ5KHksIGRlY2sucDEpIC0gdCAqIGdldHZ5KHksIGRlY2sucDIpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2biA9IHZ4ICogbnggKyB2eSAqIG55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eCA9IG55O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0eSA9IC1ueDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdnQgPSB2eCAqIHR4ICsgdnkgKiB0eSAtIGRpc2MudjtcbiAgICAgICAgICAgICAgICAgICAgLy8gVG90YWxseSB1bnNjaWVudGlmaWMgd2F5IHRvIGNvbXB1dGUgZnJpY3Rpb24gZnJvbSBhcmJpdHJhcnkgY29uc3RhbnRzLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBmcmljdGlvbiA9IE1hdGguc3FydChtYXRlcmlhbHNbZGlzYy5tXS5mcmljdGlvbiAqIG1hdGVyaWFsc1tkZWNrLm1dLmZyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWYgPSBNYXRoLm1pbihhbiAqIGZyaWN0aW9uLCBNYXRoLmFicyh2dCAqIDEwMCkpICogKHZ0IDw9IDAuMCA/IDEuMCA6IC0xLjApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYW1wID0gMjsgICAvLyBUT0RPOiBmaWd1cmUgb3V0IGhvdyB0byBkZXJpdmUgYSByZWFzb25hYmxlIGNvbnN0YW50LlxuICAgICAgICAgICAgICAgICAgICBhZGR2eChkeWR0LCBkaXNjLnAsIHR4ICogYWYgKiBhZCAtIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGlzYy5wLCB0eSAqIGFmICogYWQgLSB2biAqIG55ICogZGFtcCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFwcGx5IGFjY2xlcmF0aW9uIGRpc3RyaWJ1dGVkIHRvIHBpbnNcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMSwgLXR4ICogYWYgKiBhMSArIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMSwgLXR5ICogYWYgKiBhMSArIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdngoZHlkdCwgZGVjay5wMiwgLXR4ICogYWYgKiBhMiArIHZuICogbnggKiBkYW1wKTtcbiAgICAgICAgICAgICAgICAgICAgYWRkdnkoZHlkdCwgZGVjay5wMiwgLXR5ICogYWYgKiBhMiArIHZuICogbnkgKiBkYW1wKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjZW5lUmVuZGVyZXIoc2NlbmU6IFNjZW5lKTogVHJ1c3NSZW5kZXIge1xuICAgIGNvbnN0IHRydXNzID0gc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgbWF0ZXJpYWxzID0gdHJ1c3MubWF0ZXJpYWxzO1xuICAgIFxuICAgIC8vIFByZS1yZW5kZXIgdGVycmFpbi5cbiAgICBjb25zdCB0ZXJyYWluID0gc2NlbmUudGVycmFpbjtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHRlcnJhaW5QYXRoID0gbmV3IFBhdGgyRCgpO1xuICAgIHRlcnJhaW5QYXRoLm1vdmVUbygwLjAsIDAuMCk7XG4gICAgbGV0IHggPSAwLjA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBobWFwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRlcnJhaW5QYXRoLmxpbmVUbyh4LCBobWFwW2ldKTtcbiAgICAgICAgeCArPSB0ZXJyYWluLnBpdGNoO1xuICAgIH1cbiAgICB0ZXJyYWluUGF0aC5saW5lVG8oeCAtIHRlcnJhaW4ucGl0Y2gsIDAuMCk7XG4gICAgdGVycmFpblBhdGguY2xvc2VQYXRoKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIG9kZTogT0RFTWV0aG9kKSB7XG4gICAgICAgIC8vIFRlcnJhaW4uXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSB0ZXJyYWluLnN0eWxlO1xuICAgICAgICBjdHguZmlsbCh0ZXJyYWluUGF0aCk7XG5cbiAgICAgICAgY29uc3QgeSA9IG9kZS55O1xuXG4gICAgICAgIC8vIERpc2NzXG4gICAgICAgIGNvbnN0IGRpc2NzID0gdHJ1c3MuZGlzY3M7XG4gICAgICAgIFxuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJyZWRcIjtcbiAgICAgICAgZm9yIChjb25zdCBkaXNjIG9mIGRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBwID0gZGlzYy5wO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmFyYyh5W3AgKiAyICsgMF0sIHlbcCAqIDIgKyAxXSwgZGlzYy5yLCAwLjAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKFwibm9uemVyb1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJlYW1zLlxuICAgICAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICAgICAgZm9yIChjb25zdCBiZWFtIG9mIGJlYW1zKSB7XG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBtYXRlcmlhbHNbYmVhbS5tXS5zdHlsZTtcbiAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSBiZWFtLnc7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjb25zdCBwMSA9IGJlYW0ucDE7XG5cbiAgICAgICAgICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaG93IHRvIHVzZSBvZGUgYWNjZXNzb3JzLlxuICAgICAgICAgICAgLy8gV2FpdCwgZG9lcyB0aGF0IG1lYW4gd2UgbmVlZCBhbiBPREUgZm9yIGEgc3RhdGljIHNjZW5lP1xuICAgICAgICAgICAgLy8gV2lsbCBuZWVkIGRpZmZlcmVudCBtZXRob2RzLlxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocDEgPCAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcCA9IGdldFBpbih0cnVzcywgcDEpO1xuICAgICAgICAgICAgICAgIGN0eC5tb3ZlVG8oeVtwMSAqIDIgKyAwXSwgeVtwMSAqIDIgKyAxXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpbiA9IHBpbnNbcDFdO1xuICAgICAgICAgICAgICAgIGN0eC5tb3ZlVG8ocGluWzBdLCBwaW5bMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcDIgPSBiZWFtLnAyO1xuICAgICAgICAgICAgaWYgKHAyIDwgbW9iaWxlUGlucykge1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8oeVtwMiAqIDIgKyAwXSwgeVtwMiAqIDIgKyAxXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpbiA9IHBpbnNbcDJdO1xuICAgICAgICAgICAgICAgIGN0eC5saW5lVG8ocGluWzBdLCBwaW5bMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY3R4LnN0cm9rZSgpO1xuICAgICAgICB9XG4gICAgfVxufVxuKi9cblxudHlwZSBDcmVhdGVCZWFtUGluU3RhdGUgPSB7XG4gICAgZWRpdDogU2NlbmVFZGl0b3IsXG4gICAgaTogbnVtYmVyLFxuICAgIGRyYWc/OiB7IHA6IFBvaW50MkQsIGk/OiBudW1iZXIgfSxcbn07XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgc3RhdGU6IENyZWF0ZUJlYW1QaW5TdGF0ZSkge1xuICAgIGNvbnN0IHRydXNzID0gc3RhdGUuZWRpdC5zY2VuZS50cnVzcztcbiAgICBjdHgubGluZVdpZHRoID0gMC41O1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LnN0cm9rZVJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgXG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHAxID0gdHJ1c3NHZXRQaW4odHJ1c3MsIHN0YXRlLmkpO1xuICAgIGNvbnN0IHAyID0gc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQgPyBzdGF0ZS5kcmFnLnAgOiB0cnVzc0dldFBpbih0cnVzcywgc3RhdGUuZHJhZy5pKTtcbiAgICBjb25zdCB3ID0gc3RhdGUuZWRpdC5lZGl0V2lkdGg7XG4gICAgY29uc3Qgc3R5bGUgPSB0cnVzcy5tYXRlcmlhbHNbc3RhdGUuZWRpdC5lZGl0TWF0ZXJpYWxdLnN0eWxlO1xuICAgIGNvbnN0IGRlY2sgPSBzdGF0ZS5lZGl0LmVkaXREZWNrO1xuICAgIGRyYXdCZWFtKGN0eCwgcDEsIHAyLCB3LCBzdHlsZSwgZGVjayk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbihwczogQXJyYXk8UGFuUG9pbnQ+LCBlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgY29uc3QgaSA9IHRydXNzR2V0Q2xvc2VzdFBpbih0cnVzcywgcHNbMF0uY3VyciwgMiwgc3RhdGUuaSk7XG4gICAgc3RhdGUuZHJhZyA9IHtcbiAgICAgICAgcDogcHNbMF0uY3VycixcbiAgICAgICAgaSxcbiAgICB9O1xuICAgIGVjLnJlcXVlc3REcmF3KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJlYW1QaW5PblBhbkVuZChlYzogRWxlbWVudENvbnRleHQsIHN0YXRlOiBDcmVhdGVCZWFtUGluU3RhdGUpIHtcbiAgICBjb25zdCB0cnVzcyA9IHN0YXRlLmVkaXQuc2NlbmUudHJ1c3M7XG4gICAgaWYgKHN0YXRlLmRyYWcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBkcmFnIHN0YXRlIE9uUGFuRW5kXCIpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUuZHJhZy5pID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3RhdGUuZWRpdC5hZGRQaW5BbmRCZWFtKHN0YXRlLmRyYWcucCwgc3RhdGUuaSwgZWMpO1xuICAgIH0gZWxzZSBpZiAoIXRydXNzQmVhbUV4aXN0cyh0cnVzcywgc3RhdGUuZHJhZy5pLCBzdGF0ZS5pKSkge1xuICAgICAgICAvLyBUT0RPOiByZXBsYWNlIGV4aXN0aW5nIGJlYW0gaWYgb25lIGV4aXN0cyAoYW5kIGlzIGVkaXRhYmxlKS5cbiAgICAgICAgc3RhdGUuZWRpdC5hZGRCZWFtKHN0YXRlLmRyYWcuaSwgc3RhdGUuaSwgZWMpO1xuICAgIH1cbiAgICBzdGF0ZS5kcmFnID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBDcmVhdGVCZWFtUGluKGVkaXQ6IFNjZW5lRWRpdG9yLCBpOiBudW1iZXIpOiBQb3NpdGlvbkxheW91dDxhbnksIGFueT4ge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgIC8vIElmIHdlIGhhZCBzdGF0ZSB0aGF0IHdhcyBwYXNzZWQgdG8gYWxsIGhhbmRsZXJzLCB0aGVuIHdlIGNvdWxkIGF2b2lkIGFsbG9jYXRpbmcgbmV3IGhhbmRsZXJzIHBlciBFbGVtZW50LlxuICAgIHJldHVybiBQb3NpdGlvbjxDcmVhdGVCZWFtUGluU3RhdGU+KHBbMF0gLSAyLCBwWzFdIC0gMiwgNCwgNCwgeyBlZGl0LCBpIH0pXG4gICAgICAgIC5vbkRyYXcoY3JlYXRlQmVhbVBpbk9uRHJhdylcbiAgICAgICAgLm9uUGFuKGNyZWF0ZUJlYW1QaW5PblBhbilcbiAgICAgICAgLm9uUGFuRW5kKGNyZWF0ZUJlYW1QaW5PblBhbkVuZCk7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzRWRpdGFibGVQaW5zKGVkaXQ6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgY29uc3QgdHJ1c3MgPSBlZGl0LnNjZW5lLnRydXNzO1xuICAgIGNvbnN0IGNoaWxkcmVuID0gW107XG4gICAgZm9yIChsZXQgaSA9IHRydXNzRWRpdFBpbnNCZWdpbih0cnVzcyk7IGkgIT09IHRydXNzRWRpdFBpbnNFbmQodHJ1c3MpOyBpKyspIHtcbiAgICAgICAgY2hpbGRyZW4ucHVzaChDcmVhdGVCZWFtUGluKGVkaXQsIGkpKTtcbiAgICB9XG4gICAgY29uc3QgZSA9IFJlbGF0aXZlKC4uLmNoaWxkcmVuKTtcblxuICAgIGVkaXQub25BZGRQaW4oKGVkaXRJbmRleDogbnVtYmVyLCBwaW46IG51bWJlciwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBhZGRpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIGFkZENoaWxkKGUsIENyZWF0ZUJlYW1QaW4oZWRpdCwgcGluKSwgZWMsIGVkaXRJbmRleCk7XG4gICAgICAgIGVjLnJlcXVlc3RMYXlvdXQoKTtcbiAgICB9KTtcbiAgICBlZGl0Lm9uUmVtb3ZlUGluKChlZGl0SW5kZXg6IG51bWJlciwgcGluOiBudW1iZXIsIGVjOiBFbGVtZW50Q29udGV4dCkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgcmVtb3ZpbmcgRWxlbWVudCBmb3IgcGluICR7cGlufSBhdCBjaGlsZFske2VkaXRJbmRleH1dYCk7XG4gICAgICAgIHJlbW92ZUNoaWxkKGUsIGVkaXRJbmRleCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0TGF5b3V0KCk7XG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBlLm9uRGV0YWNoIGZvciByZW1vdmVpbmcgcGluIG9ic2VydmVycy5cbiAgICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gQWRkVHJ1c3NVbmVkaXRhYmxlUGlucyhlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IHRydXNzID0gZWRpdC5zY2VuZS50cnVzcztcbiAgICBjb25zdCB3aWR0aCA9IGVkaXQuc2NlbmUud2lkdGg7XG4gICAgY29uc3QgaGVpZ2h0ID0gZWRpdC5zY2VuZS5oZWlnaHQ7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gdHJ1c3NVbmVkaXRhYmxlUGluc0JlZ2luKHRydXNzKTsgaSAhPT0gdHJ1c3NVbmVkaXRhYmxlUGluc0VuZCh0cnVzcyk7IGkrKykge1xuICAgICAgICBjb25zdCBwID0gdHJ1c3NHZXRQaW4odHJ1c3MsIGkpO1xuICAgICAgICBpZiAocFswXSA+IDAgJiYgcFswXSA8IHdpZHRoICYmIHBbMV0gPiAwICYmIHBbMV0gPCBoZWlnaHQpIHtcbiAgICAgICAgICAgIC8vIEJlYW1zIHNob3VsZCBvbmx5IGJlIGNyZWF0ZWQgZnJvbSBwaW5zIHN0cmljdGx5IGluc2lkZSB0aGUgc2NlbmUuXG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKENyZWF0ZUJlYW1QaW4oZWRpdCwgaSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBSZWxhdGl2ZSguLi5jaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIEFkZFRydXNzTGF5ZXIoc2NlbmU6IFNjZW5lRWRpdG9yKTogTGF5b3V0VGFrZXNXaWR0aEFuZEhlaWdodCB7XG4gICAgcmV0dXJuIExheWVyKFxuICAgICAgICBBZGRUcnVzc1VuZWRpdGFibGVQaW5zKHNjZW5lKSxcbiAgICAgICAgQWRkVHJ1c3NFZGl0YWJsZVBpbnMoc2NlbmUpLFxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGRyYXdCZWFtKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBwMTogUG9pbnQyRCwgcDI6IFBvaW50MkQsIHc6IG51bWJlciwgc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybiwgZGVjaz86IGJvb2xlYW4pIHtcbiAgICBjdHgubGluZVdpZHRoID0gdztcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhwMVswXSwgcDFbMV0pO1xuICAgIGN0eC5saW5lVG8ocDJbMF0sIHAyWzFdKTtcbiAgICBjdHguc3Ryb2tlKCk7XG4gICAgaWYgKGRlY2sgIT09IHVuZGVmaW5lZCAmJiBkZWNrKSB7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYnJvd25cIjsgIC8vIFRPRE86IGRlY2sgc3R5bGVcbiAgICAgICAgY3R4LmxpbmVXaWR0aCA9IHcgKiAwLjc1O1xuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgIGN0eC5tb3ZlVG8ocDFbMF0sIHAxWzFdKTtcbiAgICAgICAgY3R4LmxpbmVUbyhwMlswXSwgcDJbMV0pO1xuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBUcnVzc0xheWVyKHRydXNzOiBUcnVzcyk6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBGaWxsKHRydXNzKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBfYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIF92cDogTGF5b3V0Qm94LCB0cnVzczogVHJ1c3MpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgICAgIGRyYXdCZWFtKGN0eCwgdHJ1c3NHZXRQaW4odHJ1c3MsIGIucDEpLCB0cnVzc0dldFBpbih0cnVzcywgYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLmVkaXRCZWFtcykge1xuICAgICAgICAgICAgZHJhd0JlYW0oY3R4LCB0cnVzc0dldFBpbih0cnVzcywgYi5wMSksIHRydXNzR2V0UGluKHRydXNzLCBiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgdHJ1c3MuZGlzY3MpIHtcbiAgICAgICAgICAgIGNvbnN0IG0gPSB0cnVzcy5tYXRlcmlhbHNbZC5tXTtcbiAgICAgICAgICAgIGNvbnN0IHAgPSB0cnVzc0dldFBpbih0cnVzcywgZC5wKTtcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBtLnN0eWxlO1xuICAgICAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICAgICAgY3R4LmVsbGlwc2UocFswXSwgcFsxXSwgZC5yLCBkLnIsIDAsIDAsIDIgKiBNYXRoLlBJKTtcbiAgICAgICAgICAgIGN0eC5maWxsKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gU2ltdWxhdGVMYXllcihlZGl0OiBTY2VuZUVkaXRvcik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIHJldHVybiBGaWxsKGVkaXQpLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIF9ib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGNvbnN0IHNjZW5lID0gZWRpdC5zY2VuZTtcbiAgICAgICAgY29uc3QgdHJ1c3MgPSBzY2VuZS50cnVzcztcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgZm9yIChjb25zdCBiIG9mIHRydXNzLnN0YXJ0QmVhbXMpIHtcbiAgICAgICAgICAgIGRyYXdCZWFtKGN0eCwgc2ltLmdldFBpbihiLnAxKSwgc2ltLmdldFBpbihiLnAyKSwgYi53LCB0cnVzcy5tYXRlcmlhbHNbYi5tXS5zdHlsZSwgYi5kZWNrKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGIgb2YgdHJ1c3MuZWRpdEJlYW1zKSB7XG4gICAgICAgICAgICBkcmF3QmVhbShjdHgsIHNpbS5nZXRQaW4oYi5wMSksIHNpbS5nZXRQaW4oYi5wMiksIGIudywgdHJ1c3MubWF0ZXJpYWxzW2IubV0uc3R5bGUsIGIuZGVjayk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBkIG9mIHRydXNzLmRpc2NzKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gdHJ1c3MubWF0ZXJpYWxzW2QubV07XG4gICAgICAgICAgICBjb25zdCBwID0gc2ltLmdldFBpbihkLnApO1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IG0uc3R5bGU7XG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgICAgICAgICBjdHguZWxsaXBzZShwWzBdLCBwWzFdLCBkLnIsIGQuciwgMCwgMCwgMiAqIE1hdGguUEkpO1xuICAgICAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3VGVycmFpbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIF9lYzogRWxlbWVudENvbnRleHQsIHZwOiBMYXlvdXRCb3gsIHRlcnJhaW46IFRlcnJhaW4pIHtcbiAgICBjb25zdCBobWFwID0gdGVycmFpbi5obWFwO1xuICAgIGNvbnN0IHBpdGNoID0gYm94LndpZHRoIC8gKGhtYXAubGVuZ3RoIC0gMSk7XG4gICAgY29uc3QgbGVmdCA9IHZwLmxlZnQgLSBib3gubGVmdDtcbiAgICBjb25zdCByaWdodCA9IGxlZnQgKyB2cC53aWR0aDtcbiAgICBjb25zdCBiZWdpbiA9IE1hdGgubWF4KE1hdGgubWluKE1hdGguZmxvb3IobGVmdCAvIHBpdGNoKSwgaG1hcC5sZW5ndGggLSAxKSwgMCk7XG4gICAgY29uc3QgZW5kID0gTWF0aC5tYXgoTWF0aC5taW4oTWF0aC5jZWlsKHJpZ2h0IC8gcGl0Y2gpLCBobWFwLmxlbmd0aCAtIDEpLCAwKTtcbiAgICBjdHguZmlsbFN0eWxlID0gdGVycmFpbi5zdHlsZTtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyhib3gubGVmdCwgYm94LnRvcCArIGJveC5oZWlnaHQpO1xuICAgIGZvciAobGV0IGkgPSBiZWdpbjsgaSA8PSBlbmQ7IGkrKykge1xuICAgICAgICBjdHgubGluZVRvKGJveC5sZWZ0ICsgaSAqIHBpdGNoLCBib3gudG9wICsgaG1hcFtpXSk7XG4gICAgfVxuICAgIGN0eC5saW5lVG8oYm94LmxlZnQgKyBib3gud2lkdGgsIGJveC50b3AgKyBib3guaGVpZ2h0KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4LmZpbGwoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0ZpbGwoc3R5bGU6IHN0cmluZyB8IENhbnZhc0dyYWRpZW50IHwgQ2FudmFzUGF0dGVybikge1xuICAgIHJldHVybiAoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBzdHlsZTtcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJveC5sZWZ0LCBib3gudG9wLCBib3gud2lkdGgsIGJveC5oZWlnaHQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvblRhcChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIGlmIChlZGl0LnVuZG9Db3VudCgpID4gMCkge1xuICAgICAgICBlZGl0LnVuZG8oZWMpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0NpcmNsZVdpdGhBcnJvdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gsIGNjdzogYm9vbGVhbikge1xuICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICBjb25zdCB5ID0gYm94LnRvcCArIGJveC5oZWlnaHQgKiAwLjU7XG4gICAgY29uc3QgciA9IGJveC53aWR0aCAqIDAuMzMzO1xuXG4gICAgY29uc3QgYiA9IGNjdyA/IE1hdGguUEkgKiAwLjc1IDogTWF0aC5QSSAqIDAuMjU7XG4gICAgY29uc3QgZSA9IGNjdyA/IE1hdGguUEkgKiAxIDogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgbCA9IGNjdyA/IC1NYXRoLlBJICogMC4zIDogTWF0aC5QSSAqIDAuMztcbiAgICBjb25zdCBweCA9IHIgKiBNYXRoLmNvcyhlKTtcbiAgICBjb25zdCBweSA9IHIgKiBNYXRoLnNpbihlKVxuICAgIGNvbnN0IHR4ID0gciAqIE1hdGguY29zKGUgLSBsKSAtIHB4O1xuICAgIGNvbnN0IHR5ID0gciAqIE1hdGguc2luKGUgLSBsKSAtIHB5O1xuICAgIGNvbnN0IG54ID0gLXR5IC8gTWF0aC5zcXJ0KDMpO1xuICAgIGNvbnN0IG55ID0gdHggLyBNYXRoLnNxcnQoMyk7XG4gICAgXG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5lbGxpcHNlKHgsIHksIHIsIHIsIDAsIGIsIGUsIGNjdyk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHggKyB0eCArIG54LCB5ICsgcHkgKyB0eSArIG55KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCArIHR4IC0gbngsIHkgKyBweSArIHR5IC0gbnkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gZHJhd0J1dHRvbkJvcmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjdHguZmlsbFJlY3QoYm94LmxlZnQsIGJveC50b3AsIGJveC53aWR0aCwgYm94LmhlaWdodCk7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5saW5lV2lkdGggPSAyO1xuICAgIGN0eC5zdHJva2VSZWN0KGJveC5sZWZ0ICsgMSwgYm94LnRvcCArIDEsIGJveC53aWR0aCAtIDIsIGJveC5oZWlnaHQgLSAyKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbkRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQudW5kb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICBkcmF3QnV0dG9uQm9yZGVyKGN0eCwgYm94KTtcbiAgICBkcmF3Q2lyY2xlV2l0aEFycm93KGN0eCwgYm94LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gdW5kb0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCh1bmRvQnV0dG9uVGFwKS5vbkRyYXcodW5kb0J1dHRvbkRyYXcpO1xufVxuXG5mdW5jdGlvbiByZWRvQnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDAsIGVkaXQpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0LCBlZGl0OiBTY2VuZUVkaXRvcikgPT4ge1xuICAgICAgICBpZiAoZWRpdC5yZWRvQ291bnQoKSA+IDApIHtcbiAgICAgICAgICAgIGVkaXQucmVkbyhlYyk7XG4gICAgICAgIH1cbiAgICB9KS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCwgX2VjOiBFbGVtZW50Q29udGV4dCwgX3ZwOiBMYXlvdXRCb3gsIGVkaXQ6IFNjZW5lRWRpdG9yKSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGVkaXQucmVkb0NvdW50KCkgPT09IDAgPyBcImdyYXlcIiA6IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdDaXJjbGVXaXRoQXJyb3coY3R4LCBib3gsIGZhbHNlKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gZGVja0J1dHRvbihlZGl0OiBTY2VuZUVkaXRvcikge1xuICAgIHJldHVybiBGbGV4KDY0LCAwLCBlZGl0KS5vblRhcCgoX3A6IFBvaW50MkQsIGVjOiBFbGVtZW50Q29udGV4dCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgZWRpdC5lZGl0RGVjayA9ICFlZGl0LmVkaXREZWNrO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94LCBfZWM6IEVsZW1lbnRDb250ZXh0LCBfdnA6IExheW91dEJveCwgZWRpdDogU2NlbmVFZGl0b3IpID0+IHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGNvbnN0IHggPSBib3gubGVmdCArIGJveC53aWR0aCAqIDAuNTtcbiAgICAgICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgICAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgICAgIGRyYXdCZWFtKGN0eCwgW3ggLSByLCB5XSwgW3ggKyAgciwgeV0sIDE2LCBcImJsYWNrXCIsIGVkaXQuZWRpdERlY2spO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UGxheShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHgubGluZUpvaW4gPSBcInJvdW5kXCI7XG4gICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgIGN0eC5tb3ZlVG8oeCAtIHB4LCB5ICsgcHkpO1xuICAgIGN0eC5saW5lVG8oeCAtIHB4LCB5IC0gcHkpO1xuICAgIGN0eC5saW5lVG8oeCArIHIsIHkpO1xuICAgIGN0eC5jbG9zZVBhdGgoKTtcbiAgICBjdHguc3Ryb2tlKCk7XG59XG5cbmZ1bmN0aW9uIGRyYXdQYXVzZShjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpIHtcbiAgICBjb25zdCB4ID0gYm94LmxlZnQgKyBib3gud2lkdGggKiAwLjU7XG4gICAgY29uc3QgeSA9IGJveC50b3AgKyBib3guaGVpZ2h0ICogMC41O1xuICAgIGNvbnN0IHIgPSBib3gud2lkdGggKiAwLjMzMztcbiAgICBjb25zdCBweCA9IE1hdGguY29zKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGNvbnN0IHB5ID0gTWF0aC5zaW4oTWF0aC5QSSAqIDAuMzMzKSAqIHI7XG4gICAgY3R4LmxpbmVXaWR0aCA9IGJveC53aWR0aCAqIDAuMTtcbiAgICBjdHgubGluZUNhcCA9IFwicm91bmRcIjtcbiAgICBjdHguYmVnaW5QYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4ICsgcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4ICsgcHgsIHkgLSBweSk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gcHgsIHkgKyBweSk7XG4gICAgY3R4LmxpbmVUbyh4IC0gcHgsIHkgLSBweSk7XG4gICAgY3R4LnN0cm9rZSgpO1xufVxuXG5mdW5jdGlvbiBwbGF5QnV0dG9uKGVkaXQ6IFNjZW5lRWRpdG9yKSB7XG4gICAgcmV0dXJuIEZsZXgoNjQsIDApLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpbSA9IGVkaXQuc2ltdWxhdG9yKCk7XG4gICAgICAgIGlmIChzaW0ucGxheWluZygpKSB7XG4gICAgICAgICAgICBzaW0ucGF1c2UoZWMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2ltLnBsYXkoZWMpO1xuICAgICAgICB9XG4gICAgICAgIGVjLnJlcXVlc3REcmF3KCk7XG4gICAgfSkub25EcmF3KChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYm94OiBMYXlvdXRCb3gpID0+IHtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGlmIChlZGl0LnNpbXVsYXRvcigpLnBsYXlpbmcoKSkge1xuICAgICAgICAgICAgZHJhd1BhdXNlKGN0eCwgYm94KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRyYXdQbGF5KGN0eCwgYm94KTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkcmF3UmVzZXQoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSB7XG4gICAgY29uc3QgeCA9IGJveC5sZWZ0ICsgYm94LndpZHRoICogMC41O1xuICAgIGNvbnN0IHkgPSBib3gudG9wICsgYm94LmhlaWdodCAqIDAuNTtcbiAgICBjb25zdCByID0gYm94LndpZHRoICogMC4zMzM7XG4gICAgY29uc3QgcHggPSBNYXRoLmNvcyhNYXRoLlBJICogMC4zMzMpICogcjtcbiAgICBjb25zdCBweSA9IE1hdGguc2luKE1hdGguUEkgKiAwLjMzMykgKiByO1xuICAgIGN0eC5saW5lV2lkdGggPSBib3gud2lkdGggKiAwLjE7XG4gICAgY3R4LmxpbmVDYXAgPSBcInJvdW5kXCI7XG4gICAgY3R4LmxpbmVKb2luID0gXCJyb3VuZFwiO1xuICAgIGN0eC5iZWdpblBhdGgoKTtcbiAgICBjdHgubW92ZVRvKHggKyBweCwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggKyBweCwgeSAtIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5KTtcbiAgICBjdHguY2xvc2VQYXRoKCk7XG4gICAgY3R4Lm1vdmVUbyh4IC0gciwgeSArIHB5KTtcbiAgICBjdHgubGluZVRvKHggLSByLCB5IC0gcHkpO1xuICAgIGN0eC5zdHJva2UoKTtcbn1cblxuZnVuY3Rpb24gcmVzZXRCdXR0b24oZWRpdDogU2NlbmVFZGl0b3IpIHtcbiAgICByZXR1cm4gRmxleCg2NCwgMCkub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3Qgc2ltID0gZWRpdC5zaW11bGF0b3IoKTtcbiAgICAgICAgaWYgKHNpbS5wbGF5aW5nKCkpIHtcbiAgICAgICAgICAgIHNpbS5wYXVzZShlYyk7XG4gICAgICAgIH1cbiAgICAgICAgc2ltLnNlZWsoMCwgZWMpO1xuICAgICAgICBlYy5yZXF1ZXN0RHJhdygpO1xuICAgIH0pLm9uRHJhdygoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGJveDogTGF5b3V0Qm94KSA9PiB7XG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IFwiYmxhY2tcIjtcbiAgICAgICAgZHJhd0J1dHRvbkJvcmRlcihjdHgsIGJveCk7XG4gICAgICAgIGRyYXdSZXNldChjdHgsIGJveCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHRhYkZpbGxlcigpIHtcbiAgICByZXR1cm4gRmxleCgwLCAxKS50b3VjaFNpbmsoKS5vbkRyYXcoKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBib3g6IExheW91dEJveCkgPT4ge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJncmF5XCI7XG4gICAgICAgIGN0eC5maWxsUmVjdChib3gubGVmdCwgYm94LnRvcCwgYm94LndpZHRoLCBib3guaGVpZ2h0KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNjZW5lRWxlbWVudChzY2VuZUpTT046IFNjZW5lSlNPTik6IExheW91dFRha2VzV2lkdGhBbmRIZWlnaHQge1xuICAgIGNvbnN0IGVkaXQgPSBuZXcgU2NlbmVFZGl0b3Ioc2NlbmVKU09OKTtcblxuICAgIGNvbnN0IHNjZW5lVUkgPSBNdXgoXG4gICAgICAgIFtcInRlcnJhaW5cIiwgXCJ0cnVzc1wiLCBcImFkZF90cnVzc1wiXSxcbiAgICAgICAgW1widGVycmFpblwiLCBGaWxsKHNjZW5lSlNPTi50ZXJyYWluKS5vbkRyYXcoZHJhd1RlcnJhaW4pXSxcbiAgICAgICAgW1widHJ1c3NcIiwgVHJ1c3NMYXllcihzY2VuZUpTT04udHJ1c3MpXSxcbiAgICAgICAgW1wiYWRkX3RydXNzXCIsIEFkZFRydXNzTGF5ZXIoZWRpdCldLFxuICAgICAgICBbXCJzaW11bGF0ZVwiLCBTaW11bGF0ZUxheWVyKGVkaXQpXSxcbiAgICApO1xuXG4gICAgY29uc3QgZHJhd1IgPSBkcmF3RmlsbChcInJlZFwiKTtcbiAgICBjb25zdCBkcmF3RyA9IGRyYXdGaWxsKFwiZ3JlZW5cIik7XG4gICAgY29uc3QgZHJhd0IgPSBkcmF3RmlsbChcImJsdWVcIik7XG5cbiAgICBjb25zdCB0b29scyA9IFN3aXRjaChcbiAgICAgICAgMSxcbiAgICAgICAgTGVmdCh1bmRvQnV0dG9uKGVkaXQpLCByZWRvQnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgICAgIExlZnQoZGVja0J1dHRvbihlZGl0KSwgdGFiRmlsbGVyKCkpLFxuICAgICAgICBMZWZ0KHJlc2V0QnV0dG9uKGVkaXQpLCBwbGF5QnV0dG9uKGVkaXQpLCB0YWJGaWxsZXIoKSksXG4gICAgKTtcblxuICAgIHJldHVybiBMYXllcihcbiAgICAgICAgU2Nyb2xsKFxuICAgICAgICAgICAgQm94KFxuICAgICAgICAgICAgICAgIHNjZW5lSlNPTi53aWR0aCwgc2NlbmVKU09OLmhlaWdodCxcbiAgICAgICAgICAgICAgICBzY2VuZVVJLFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICAgIDE2LFxuICAgICAgICApLFxuICAgICAgICBCb3R0b20oXG4gICAgICAgICAgICBGbGV4KDY0LCAwLFxuICAgICAgICAgICAgICAgIHRvb2xzLCAgXG4gICAgICAgICAgICApLFxuICAgICAgICAgICAgRmxleCg2NCwgMCxcbiAgICAgICAgICAgICAgICBMZWZ0KFxuICAgICAgICAgICAgICAgICAgICBGbGV4KDY0LCAwKS5vbkRyYXcoZHJhd1IpLm9uVGFwKChfcDogUG9pbnQyRCwgZWM6IEVsZW1lbnRDb250ZXh0KSA9PiB7IHRvb2xzLnNldCgwLCBlYyk7IHNjZW5lVUkuc2V0KGVjLCBcInRlcnJhaW5cIiwgXCJ0cnVzc1wiKTsgZWRpdC5zaW11bGF0b3IoKS5wYXVzZShlYykgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Rykub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHsgdG9vbHMuc2V0KDEsIGVjKTsgc2NlbmVVSS5zZXQoZWMsIFwidGVycmFpblwiLCBcInRydXNzXCIsIFwiYWRkX3RydXNzXCIpOyBlZGl0LnNpbXVsYXRvcigpLnBhdXNlKGVjKTsgfSksXG4gICAgICAgICAgICAgICAgICAgIEZsZXgoNjQsIDApLm9uRHJhdyhkcmF3Qikub25UYXAoKF9wOiBQb2ludDJELCBlYzogRWxlbWVudENvbnRleHQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvb2xzLnNldCgyLCBlYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVVJLnNldChlYywgXCJ0ZXJyYWluXCIsIFwic2ltdWxhdGVcIik7XG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICApLFxuICAgICAgICApLFxuICAgICk7XG5cbiAgICAvLyBUT0RPOiBzaW5nbGUgZ2xvYmFsIGRhbXBpbmcgZm9yY2UgYmFzZWQgb24gc3BlZWQuIEZvcmdldCBkYW1waW5nIGJlYW1zP1xuXG4gICAgLy8gVE9ETzogc2Nyb2xsIHRvIHpvb20sIG1vdXNlIGN1cnNvciBjb3VudHMgYXMgYSB0YXAuICh1c2UgcG9pbnRlciBldmVudHM/KVxuXG4gICAgLy8gVE9ETzogbWF4IGJlYW0gbGVuZ3RoIChmcm9tIG1hdGVyaWFsLiBtYWtlIGl0IGRlcGVuZCBvbiB3aWR0aD8gTWF5YmUganVzdCBoYXZlIGEgYnVja2xpbmcgZm9yY2UgZG9uZSBwcm9wZXJseSBhbmQgaXQgdGFrZXMgY2FyZSBvZiBpdHNlbGYuLi4pXG5cbiAgICAvLyBUT0RPOiBmaXggbWF0ZXJpYWxzXG5cbiAgICAvLyBUT0RPOiBzaW11bGF0aW9uIHN0YXRlIHN0b3JlZCBpbiBkby91bmRvIHN0YWNrcy5cblxuICAgIC8vIFRPRE86IGZpeCB0cmFpbiBzaW11bGF0aW9uIChtYWtlIHN1cmUgdHJhaW4gY2FuIGJyZWFrIGFwYXJ0LCBtYWtlIG9ubHkgZnJvbnQgZGlzayB0dXJuLCBiYWNrIGRpc2tzIGhhdmUgbG93IGZyaWN0aW9uPylcbiAgICAvLyBUT0RPOiBtb2RlIHdoZXJlIGlmIHRoZSB3aG9sZSB0cmFpbiBtYWtlcyBpdCBhY3Jvc3MsIHRoZSB0cmFpbiB0ZWxlcG9ydHMgYmFjayB0byB0aGUgYmVnaW5uaW5nIGFuZCBnZXRzIGhlYXZpZXJcbiAgICAvLyBUT0RPOiBkcmF3IHRyYWluXG5cbiAgICAvLyBUT0RPOiBtYXRlcmlhbCBzZWxlY3Rpb24uIChtaWdodCBuZWVkIHRleHQgbGF5b3V0LCB3aGljaCBpcyBhIHdob2xlIGNhbiBvZiB3b3Jtcy4uLilcblxuICAgIC8vIFRPRE86IHNhdmUvbG9hZFxuICAgIC8vIEhhdmUgbGlzdCBvZiBsZXZlbHMgaW4gc29tZSBKU09OIHJlc291cmNlIGZpbGUuXG4gICAgLy8gSGF2ZSBvcHRpb24gdG8gbG9hZCBqc29uIGZpbGUgZnJvbSBsb2NhbC5cbiAgICAvLyBhdXRvLXNhdmUgZXZlcnkgbiBzZWNvbmRzIGFmdGVyIGNoYW5nZSwga2V5IGluIGxvY2FsIHN0b3JhZ2UgaXMgdXJpIG9mIGxldmVsIGpzb24uXG4gICAgLy8gd2hlbiBsb2FkaW5nLCBjaGVjayBsb2NhbCBzdG9yYWdlIGFuZCBsb2FkIHRoYXQgaW5zdGVhZCBpZiBpdCBleGlzdHMgKGFuZCB0aGUgbm9uIGVkaXRhYmxlIHBhcnRzIG1hdGNoPylcbn1cbiJdfQ==